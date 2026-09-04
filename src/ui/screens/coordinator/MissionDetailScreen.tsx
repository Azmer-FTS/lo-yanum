import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import {
  formatDate,
  formatTime,
  formatWeekday,
  getIncidentsForMission,
  getMissionView,
} from '@core/index'
import { getPresenceRows } from '@core/index'
import type {
  Incident,
  MissionLeg,
  MissionView,
  OutreachEvent,
} from '@core/index'

import { useState } from 'react'

import { Avatar } from '../../components/Avatar'
import { BandCard } from '../../components/band'
import {
  CancelMissionModal,
  CancellationPanel,
} from '../../components/cancellation'
import { OutreachPanel } from '../../components/outreach'
import { ContactActions, ContactButtons } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapSplit } from '../../components/MapSplit'
import { MapView } from '../../components/MapView'
import { PointLegend, meetColor } from '../../components/meet'
import {
  fullscreenShell,
  useMapFullscreen,
} from '../../components/fullscreen'
import { Timeline } from '../../components/Timeline'
import type { TimelineEntry } from '../../components/Timeline'
import {
  ConfirmationChip,
  MissionStatusChip,
  PhoneTypeChip,
  postColor,
} from '../../components/badges'
import {
  Callout,
  KeyValue,
  LoadingState,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useHydrated } from '../../hooks/useDataState'
import { useLocale } from '../../hooks/useLocale'

/**
 * D6.2 — THE NIGHT, AS A SEQUENCE.
 *
 * Eight steps from "created" to "everybody home", each with the instant it
 * actually happened or an em dash if it has not. The FIRST step without a
 * timestamp is marked `current`: that is the thing everyone is waiting on, and
 * at 03:00 it should be answerable at a glance.
 *
 * Incidents reported during the guard are spliced in at their real time rather
 * than listed separately — "the police were called at 02:14, between the
 * arrival and the end of the guard" is the shape of the information.
 *
 * `pickedUpAt` and `completedAt` look redundant and are not: the first is the
 * driver saying he has everyone, the second is that claim reconciling with the
 * group holder's. The gap between them is the failure this programme exists to
 * catch, so the timeline shows both.
 */
function buildMissionTimeline(
  view: MissionView,
  incidents: Incident[],
  t: TFunction,
): TimelineEntry[] {
  const { mission } = view
  const marked = mission.assignments.filter(
    (a) => a.outbound.driver !== null || a.outbound.group !== null,
  ).length
  const total = mission.assignments.length

  const steps: TimelineEntry[] = [
    {
      id: 'created',
      label: t('timeline.created'),
      at: mission.createdAt,
      icon: 'plus',
      state: 'done',
      tone: 'accent',
    },
    {
      id: 'confirmations',
      label: t('timeline.confirmations'),
      // A count, not an instant: there is no single moment at which a group
      // "became confirmed", and inventing one would be a lie on the record.
      at: null,
      detail: t('timeline.confirmationsDetail', { confirmed: marked, total }),
      icon: 'users',
      state: marked === total && total > 0 ? 'done' : 'pending',
      tone: 'default',
    },
    {
      id: 'dropped',
      label: t('timeline.droppedOff'),
      at: mission.droppedOffAt,
      icon: 'car',
      state: mission.droppedOffAt ? 'done' : 'pending',
      tone: 'default',
    },
    {
      id: 'arrived',
      label: t('timeline.arrived'),
      at: mission.arrivalConfirmedAt,
      icon: 'check',
      state: mission.arrivalConfirmedAt ? 'done' : 'pending',
      tone: 'success',
    },
    ...incidents.map((incident) => ({
      id: `incident-${incident.id}`,
      label: t('timeline.incident'),
      at: incident.reportedAt,
      detail: incident.description,
      author: incident.reporterName,
      icon: 'alert' as const,
      state: 'done' as const,
      tone: (incident.severity === 'urgent' ? 'danger' : 'warn') as
        | 'danger'
        | 'warn',
    })),
    {
      id: 'guard-end',
      label: t('timeline.guardEnd'),
      at: mission.endConfirmedAt,
      icon: 'moon',
      state: mission.endConfirmedAt ? 'done' : 'pending',
      tone: 'default',
    },
    {
      id: 'picked-up',
      label: t('timeline.pickedUp'),
      at: mission.pickedUpAt,
      icon: 'car',
      state: mission.pickedUpAt ? 'done' : 'pending',
      tone: 'default',
    },
    {
      id: 'all-home',
      label: t('timeline.allHome'),
      at: mission.completedAt,
      icon: 'home',
      state: mission.completedAt ? 'done' : 'pending',
      tone: 'success',
    },
  ]

  // G9bis — the cancellation chapter, spliced in at its real instants. Both
  // survive a reactivation on purpose: "called off Tuesday, back on
  // Wednesday" is history the retrospective needs.
  if (mission.cancelledAt) {
    steps.push({
      id: 'cancelled',
      label: t('timeline.cancelled'),
      at: mission.cancelledAt,
      detail: t(`cancel.reason_${mission.cancelReason}`),
      icon: 'close',
      state: 'done',
      tone: 'danger',
    })
  }
  if (mission.reactivatedAt) {
    steps.push({
      id: 'reactivated',
      label: t('timeline.reactivated'),
      at: mission.reactivatedAt,
      icon: 'history',
      state: 'done',
      tone: 'warn',
    })
  }

  // Promote the first unreached step. Done in one pass afterwards so splicing
  // incidents in cannot shift which step counts as "now" — and not at all on
  // a cancelled guard: nothing is "next" on a night that is not happening.
  if (mission.status !== 'cancelled') {
    const next = steps.find((s) => s.state === 'pending')
    if (next) next.state = 'current'
  }

  return steps
}

function TeamList({ view }: { view: MissionView }) {
  const { t } = useTranslation()

  return (
    <ul className="divide-y divide-edge-subtle">
      {view.volunteers.map(({ volunteer, isGroupPhone }) => (
        <li key={volunteer.id}>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Avatar
              photo={volunteer.photo}
              name={volunteer.name}
              size="sm"
              ring={isGroupPhone}
            />
            <span className="text-caption font-medium">{volunteer.name}</span>
            <PhoneTypeChip type={volunteer.phoneType} />
            {isGroupPhone && (
              <span className="chip bg-accent text-content-on-accent">
                <Icon name="phone" size={11} />
                {t('volunteers.groupPhoneHolder')}
              </span>
            )}
          </div>
          {/* X6 — the ROW wraps around the action group, rather than the
              group being squeezed into a column. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-2">
            <ContactButtons name={volunteer.name} phone={volunteer.phone} />
            <p className="muted min-w-0 truncate">
              {volunteer.yeshiva} · {volunteer.locality} ·{' '}
              <span className="ltr-nums">{volunteer.phone}</span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * R6 — the coordinator's reconciliation view: what the driver said and what the
 * group holder said, per person, side by side, for both legs. A disagreement
 * shows as an amber `mismatch` chip rather than being resolved silently.
 */
function PresenceMatrix({ view }: { view: MissionView }) {
  const { t } = useTranslation()
  const legs: MissionLeg[] = ['outbound', 'inbound']

  return (
    // P0bis.3b — the two legs SIDE BY SIDE once the panel can hold them. They
    // are the same three columns twice and the coordinator's question is a
    // comparison ("who is confirmed out but not back"), which a stacked pair
    // makes him scroll to answer. The container query measures the PANEL, not
    // the viewport, because P0bis.2 made the panel a width he drags.
    <div className="pair-grid">
      {legs.map((leg) => {
        const rows = getPresenceRows(view.mission, leg)
        return (
          <div key={leg}>
            <p className="section-title mb-2">{t(`presence.${leg}`)}</p>
            <div className="table-scroll">
              {/* P0bis.3b — 17 rem, not 22: the two legs have to fit BESIDE
                  each other in the panel, and the three columns are a name and
                  two chips. `.table-scroll` still catches a long name. */}
              <table className="w-full min-w-[17rem] border-collapse text-caption">
                <thead>
                  <tr className="text-micro uppercase tracking-wide text-content-muted">
                    <th className="p-2 text-start font-semibold">
                      {t('volunteers.colName')}
                    </th>
                    <th className="p-2 text-start font-semibold">
                      {t('presence.driverSays')}
                    </th>
                    <th className="p-2 text-start font-semibold">
                      {t('presence.groupSays')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.volunteer.id}
                      className={`border-t border-edge-subtle ${
                        row.state === 'mismatch' ? 'bg-status-warn/10' : ''
                      }`}
                    >
                      <td className="p-2">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-content-primary">
                            {row.volunteer.name}
                          </span>
                          {row.isGroupPhone && (
                            <Icon name="phone" size={11} className="text-accent-ink" />
                          )}
                          {row.state === 'mismatch' && (
                            <ConfirmationChip state="mismatch" />
                          )}
                        </span>
                      </td>
                      <td className="p-2">
                        <ConfirmationChip state={row.leg.driver ?? 'pending'} />
                      </td>
                      <td className="p-2">
                        <ConfirmationChip state={row.leg.group ?? 'pending'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function MissionDetailScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { missionId = '' } = useParams()
  const view = useCoreValue(() => getMissionView(missionId))
  const missionIncidents = useCoreValue(() => getIncidentsForMission(missionId))
  const mapFullscreen = useMapFullscreen()
  const [cancelling, setCancelling] = useState(false)
  // P0bis.5b — which announcement the sending centre is composing. A guard is
  // created once and changed many times, so "created" is the default only
  // until somebody switches; the choice is not persisted because it is a
  // property of the moment, not of the guard.
  const [outreachEvent, setOutreachEvent] = useState<OutreachEvent>('created')

  // N1 (2026-09-02) — a missing record before the snapshot has arrived is
  // "not loaded yet", never "gone": redirecting here on a reload was how a
  // coordinator's own farm closed itself. See `useHydrated`.
  const hydrated = useHydrated()
  if (!view) return hydrated ? <Navigate to="/coordinator/missions" replace /> : <LoadingState />

  const { mission, farm, anchorPoint, additionalAnchorPoints, volunteers } =
    view
  const assigned = volunteers.length
  const timeline = buildMissionTimeline(view, missionIncidents, t)

  /* P0bis.1 — the mission's own geography, on the physical LEFT like every
     other map in the app. F6.2: a guard that covers more than one position
     shows ALL of them, numbered, with 1 on the rendezvous the driver was sent
     to, and the transport's pickup/dropoff in the meet colour. */
  const mapBody = (
    <div className={fullscreenShell(mapFullscreen.active, 'relative h-full w-full')}>
      {/* ⚠️ `pl-[4.5rem]` clears the map's control stack, which MapLibre puts
          on the PHYSICAL left whatever the document direction. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 pl-[4.5rem]">
        {additionalAnchorPoints.length > 0 ? (
          <span className="chip pointer-events-auto bg-surface-overlay/95 text-accent-ink shadow-card backdrop-blur">
            <Icon name="pin" size={11} />
            {t('anchor.coversPositions', {
              count: 1 + additionalAnchorPoints.length,
            })}
          </span>
        ) : (
          <span />
        )}
        {/* ⚠️ THE FLOATING "מסך מלא" BUTTON WAS HERE AND IS GONE (PO return
            2026-09-02) — it is a row of `MapTools` now. */}
      </div>
              <MapView
                ariaLabel={t('a11y.map')}
                className="h-full w-full rounded-none"
                fullscreen={{
                  active: mapFullscreen.active,
                  onToggle: mapFullscreen.toggle,
                }}
                cooperative
                fit
                markers={[
                  {
                    id: anchorPoint.id,
                    position: anchorPoint.position,
                    color: postColor(),
                    kind: 'anchor',
                    emphasis: true,
                    badge: additionalAnchorPoints.length > 0 ? '1' : undefined,
                    title: anchorPoint.name,
                    subtitle: t('anchor.rendezvous'),
                  },
                  ...additionalAnchorPoints.map((extra, i) => ({
                    id: extra.id,
                    position: extra.position,
                    color: postColor(),
                    kind: 'anchor' as const,
                    badge: String(i + 2),
                    title: extra.name,
                    subtitle: t('anchor.additionalPositions'),
                  })),
                  // G8 — the transport's own geography, in the meet colour.
                  ...(mission.pickupPoint
                    ? [
                        {
                          id: 'pickup',
                          position: mission.pickupPoint,
                          color: meetColor(),
                          kind: 'car' as const,
                          title: t('meet.pickup'),
                        },
                      ]
                    : []),
                  {
                    id: 'dropoff',
                    position: mission.dropoffPoint ?? farm.position,
                    color: meetColor(),
                    kind: 'car' as const,
                    title: t('meet.dropoff'),
                    subtitle: mission.dropoffPoint
                      ? undefined
                      : t('meet.dropoffDefault'),
                  },
                ]}
              />
      <PointLegend showFarm={false} className="absolute bottom-2 start-2 z-10" />
    </div>
  )


  return (
    <>
      <MapSplit
        screenKey="mission-detail"
        ariaLabel={t('map.title')}
        breakpoint="xl"
        contentPercent={55}
        splitHeight="h-[40dvh]"
        map={() => mapBody}
      >
        {() => (
          <>
      <Link
        to="/coordinator/missions"
        className="mb-3 inline-flex items-center gap-1.5 text-caption text-content-muted hover:text-content-primary"
      >
        <Icon name="chevron" size={15} className="ltr:-scale-x-100" />
        {t('missions.title')}
      </Link>

      <PageHeader
        title={farm.name}
        subtitle={`${formatWeekday(mission.startAt, locale)} · ${formatDate(
          mission.startAt,
          locale,
        )}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <MissionStatusChip status={mission.status} />
            {/* G9bis — a night can be called off while it is still a plan.
                An in-progress guard is aborted by phone, not by button, and a
                finished one is history. */}
            {(mission.status === 'planned' ||
              mission.status === 'recruiting') && (
              <button
                type="button"
                className="btn-ghost text-status-danger-ink hover:bg-status-danger/10"
                onClick={() => setCancelling(true)}
              >
                <Icon name="close" size={14} />
                {t('cancel.action')}
              </button>
            )}
          </span>
        }
      />

      {/* G9bis — the cancellation front and centre: banner, per-recipient
          notices with sent tracking, and the way back to recruitment. */}
      {mission.status === 'cancelled' && (
        <div className="mb-4">
          <CancellationPanel view={view} />
        </div>
      )}

      {/* A46 — freshly reactivated: the roster survived, the confirmations
          did not, and the screen says so before anyone trusts a green chip. */}
      {mission.status !== 'cancelled' && mission.reactivatedAt && (
        <div className="mb-4">
          <Callout tone="warn" title={t('timeline.reactivated')}>
            {t('cancel.reactivatedBanner')}
          </Callout>
        </div>
      )}

      {/* G4.2 — a recruiting guard says so loudly, shows its gauge, and
          offers the way back into the wizard, pre-filled. */}
      {mission.status === 'recruiting' && (
        <div className="mb-4">
          <Callout tone="warn" title={t('alerts.recruiting')}>
            <span className="flex flex-wrap items-center gap-3">
              {t('wizard.recruitingGauge', {
                confirmed: mission.assignments.length,
                required: mission.requiredVolunteers,
              })}
              <Link
                to={`/coordinator/missions/new?resume=${mission.id}`}
                className="btn-primary py-1.5 text-micro"
              >
                {t('wizard.resumeRecruitment')}
              </Link>
            </span>
          </Callout>
        </div>
      )}

      {mission.status === 'return_not_confirmed' && (
        <div className="mb-4">
          <Callout tone="danger" title={t('alerts.return_not_confirmed')}>
            {t('alerts.returnDetail')}
          </Callout>
        </div>
      )}

      {/* `min-w-0` on both columns: a grid item defaults to `min-width:auto`,
          so the 22rem minimum on the presence table propagated all the way up
          and pushed the page 40 px wider than a 390 px phone. Without it the
          `.scroll-x` wrapper never gets to be the scroll container. */}
      {/* P0bis.3a — THE NIGHT'S OWN NUMBERS, FIRST AND BIG. The header carries
          the farm and the date; what the coordinator needs before anything
          else is the two times, how many people and how many cars. Reading
          them off a key/value list four blocks down is the thing this band
          exists to stop. */}
      {/* ★ X9.2 (2026-09-04) — THE SAME BAND AS AN ENTITY'S SHEET.
          The product owner's word for this strip was "c'est le bordel", and
          the reason was structural: five bare `<div>`s in an auto-fit grid,
          no icons, no wash, and a fifth cell whose two-line label made it
          taller than its neighbours, so nothing lined up. It is `BandCard`
          now — the same component, the same 5.25 rem, the same tinted disc
          and reserved third line as the band he signed off on for a farm.
          The rendezvous' NAME goes on the reserved note line, where the
          override chip goes on a farm; "how many posts" is the figure, and
          "which one the driver was sent to" is the note under it. */}
      <div className="scroll-row mb-4" data-testid="mission-key-numbers">
        <BandCard
          testId="band-start"
          icon="clock"
          tint="bg-accent/[0.12]"
          ink="text-accent-ink"
          figure={<span className="ltr-nums">{formatTime(mission.startAt, locale)}</span>}
          label={t('missions.startAt')}
        />
        <BandCard
          testId="band-end"
          icon="moon"
          tint="bg-status-violet/[0.12]"
          ink="text-status-violet-ink"
          figure={<span className="ltr-nums">{formatTime(mission.endAt, locale)}</span>}
          label={t('missions.endAt')}
        />
        <BandCard
          testId="band-team"
          icon="users"
          tint="bg-status-success/[0.12]"
          ink="text-status-success-ink"
          figure={assigned}
          label={t('missions.team')}
        />
        <BandCard
          testId="band-drivers"
          icon="steering"
          tint="bg-status-info/[0.12]"
          ink="text-status-info-ink"
          figure={view.drivers.length}
          label={t('driver.volunteerDrivers')}
        />
        <BandCard
          testId="band-posts"
          icon="shield"
          tint="bg-status-warn/[0.14]"
          ink="text-status-warn-ink"
          figure={1 + additionalAnchorPoints.length}
          label={t('map.anchorPoint')}
          /* X9.4 — THE NOTE IS THE LINK, and the details block below has
             dropped its own copy of this name. The rendezvous was printed
             twice on one screen: once here and once as a key/value four
             blocks down. Only one of the two could be opened, so that is the
             one that survived — moved up to where the fact already was. */
          note={
            <Link
              to={`/coordinator/farms/${farm.id}/anchors/${anchorPoint.id}`}
              className="hover:underline"
            >
              {anchorPoint.name}
            </Link>
          }
        />
      </div>

      {/* P0bis.3b — `panel-scope` is the measuring box for every `pair-grid`
          below it. It is a deliberate wrapper rather than the whole content
          column: `container-type` makes an element a containing block for
          `fixed` descendants, and the screen's modal must stay the viewport's. */}
      <div className="panel-scope flex flex-col gap-4">
        <Section
          title={t('missions.team')}
          collapseKey="mission-team"
          summary={t('blocks.people', { count: view.volunteers.length })}
        >
          <TeamList view={view} />
        </Section>

        <Section
          title={t('presence.rosterTitle')}
          collapseKey="mission-presence"
          summary={t('blocks.people', { count: view.volunteers.length })}
        >
          <PresenceMatrix view={view} />
        </Section>

        <div className="pair-grid">
<Section
            title={t('common.details')}
            collapseKey="mission-details"
            summary={`${farm.name} · ${anchorPoint.name}`}
          >
            <dl>
              <KeyValue
                label={t('missions.farm')}
                value={
                  <Link
                    to={`/coordinator/farms/${farm.id}`}
                    className="hover:underline"
                  >
                    {farm.name}
                  </Link>
                }
              />
              {/* P0bis.3c — the two times and the head count moved UP into the
                  band; repeating them here would be the same three numbers
                  twice on one screen. What is left is the two links, which is
                  what this block is actually for. */}
              {additionalAnchorPoints.length > 0 && (
                <KeyValue
                  label={t('anchor.additionalPositions')}
                  value={additionalAnchorPoints.map((a) => a.name).join(' · ')}
                />
              )}
            </dl>
          </Section>

<Section
            title={t('driver.volunteerDrivers')}
            collapseKey="mission-drivers"
            summary={t('blocks.drivers', { count: view.drivers.length })}
          >
            {/* G5.3 — one block per car. Confirmation is per driver: with two
                cars on the road, "the transport is confirmed" is two facts. */}
            {view.drivers.length === 0 ? (
              <p className="muted">{t('missions.noDriver')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {view.drivers.map(({ driver: d, passengers, confirmed }) => (
                  <li
                    key={d.id}
                    className="rounded-field border border-edge-subtle p-3"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`chip ${
                          confirmed
                            ? 'bg-status-success/15 text-status-success-ink'
                            : 'bg-status-warn/15 text-status-warn-ink'
                        }`}
                      >
                        <Icon name={confirmed ? 'check' : 'clock'} size={10} />
                        {t(
                          confirmed
                            ? 'wizard.state_confirmed'
                            : 'wizard.state_pending',
                        )}
                      </span>
                      <span className="chip bg-surface-high text-content-secondary">
                        <Icon name="car" size={10} />
                        <span className="numeric">{d.seats}</span>
                        {t('driver.seats')}
                      </span>
                    </div>
                    <p className="muted mb-1">
                      {d.vehicle || t('driver.privateCar')} · {d.locality}
                    </p>
                    <ContactActions name={d.name} phone={d.phone} />
                    {passengers.length > 0 && (
                      <p className="muted mt-1.5">
                        {t('driver.hisPassengers')}:{' '}
                        {passengers.map((v) => v.name).join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* P0bis.5b — THE SENDING CENTRE. Not offered on a cancelled guard:
            its own panel above carries the same list with the event pinned to
            the cancellation, and two copies of "who has been told" on one
            screen is how the two stop agreeing. */}
        {mission.status !== 'cancelled' && (
          <Section
            title={t('outreach.title')}
            collapseKey="mission-outreach"
          >
            <OutreachPanel
              view={view}
              event={outreachEvent}
              onEventChange={setOutreachEvent}
              events={['created', 'updated']}
            />
          </Section>
        )}

        <Section
          title={t('missions.timeline')}
          collapseKey="mission-timeline"
          defaultOpen={false}
          summary={t('blocks.entries', { count: timeline.length })}
        >
            {/* Dated, not clock-only: a guard is created days before it starts
                and runs 21:00 → 05:00 across midnight, so bare times put
                "created 11:46" below "dropped off 11:40" and read as a
                sequence error. */}
            <Timeline withDate entries={timeline} />
          </Section>
      </div>
          </>
        )}
      </MapSplit>

      {cancelling && (
        <CancelMissionModal
          missionId={mission.id}
          onClose={() => setCancelling(false)}
        />
      )}
    </>
  )
}
