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
import type { Incident, MissionLeg, MissionView } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { ContactActions, ContactButtons } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { PointLegend, meetColor } from '../../components/meet'
import { Timeline } from '../../components/Timeline'
import type { TimelineEntry } from '../../components/Timeline'
import {
  ConfirmationChip,
  MissionStatusChip,
  PhoneTypeChip,
  readToken,
} from '../../components/badges'
import {
  Callout,
  KeyValue,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
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

  // Promote the first unreached step. Done in one pass afterwards so splicing
  // incidents in cannot shift which step counts as "now".
  const next = steps.find((s) => s.state === 'pending')
  if (next) next.state = 'current'

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
          <div className="mt-1 flex items-center gap-3 pb-2">
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
    <div className="flex flex-col gap-4">
      {legs.map((leg) => {
        const rows = getPresenceRows(view.mission, leg)
        return (
          <div key={leg}>
            <p className="section-title mb-2">{t(`presence.${leg}`)}</p>
            <div className="table-scroll">
              <table className="w-full min-w-[22rem] border-collapse text-caption">
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

  if (!view) return <Navigate to="/coordinator/missions" replace />

  const {
    mission,
    farm,
    anchorPoint,
    additionalAnchorPoints,
    driver,
    volunteers,
  } = view
  const assigned = volunteers.length
  const timeline = buildMissionTimeline(view, missionIncidents, t)

  return (
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
        actions={<MissionStatusChip status={mission.status} />}
      />

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
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* F5.2 — THE WIDE COLUMN GETS THE DENSE BLOCKS.
            It was the other way round: five key/value rows had two thirds of a
            1280 px screen while the presence matrix — a table with a 22 rem
            minimum, four columns and one row per volunteer — was squeezed into
            the remaining third and scrolled sideways inside itself. Width now
            goes where the content is: the roster, the presence grid and the
            map. The facts, the driver and the timeline read fine in a column
            and stay in the narrow track. */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
<Section title={t('missions.team')}>
            <TeamList view={view} />
          </Section>

<Section title={t('presence.rosterTitle')}>
            <PresenceMatrix view={view} />
          </Section>

          {/* F6.2 — 12 rem of map is a picture of a map. This one is big
              enough to pan and read, and it carries the F2 case: a guard that
              covers more than one position shows ALL of them, numbered, with 1
              on the rendezvous the driver was sent to. */}
          <Section
            title={t('map.title')}
            padded={false}
            action={
              view.mission.additionalAnchorPointIds.length > 0 ? (
                <span className="chip bg-accent/15 text-accent-ink">
                  <Icon name="pin" size={11} />
                  {t('anchor.coversPositions', {
                    count: 1 + additionalAnchorPoints.length,
                  })}
                </span>
              ) : undefined
            }
          >
            <div className="relative">
              <MapView
                ariaLabel={t('a11y.map')}
                className="h-72 w-full lg:h-[24rem]"
                cooperative
                fit
                markers={[
                  {
                    id: anchorPoint.id,
                    position: anchorPoint.position,
                    color: readToken('--accent'),
                    kind: 'anchor',
                    emphasis: true,
                    badge: additionalAnchorPoints.length > 0 ? '1' : undefined,
                    title: anchorPoint.name,
                    subtitle: t('anchor.rendezvous'),
                  },
                  ...additionalAnchorPoints.map((extra, i) => ({
                    id: extra.id,
                    position: extra.position,
                    color: readToken('--accent'),
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
              <PointLegend
                showFarm={false}
                className="absolute bottom-2 start-2 z-10"
              />
            </div>
            {additionalAnchorPoints.length > 0 && (
              <p className="muted border-t border-edge-subtle px-4 py-3">
                {t('anchor.additionalPositions')}:{' '}
                {additionalAnchorPoints.map((a) => a.name).join(' · ')}
              </p>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
<Section title={t('common.details')}>
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
              <KeyValue
                label={t('missions.anchorPoint')}
                value={
                  <Link
                    to={`/coordinator/farms/${farm.id}/anchors/${anchorPoint.id}`}
                    className="hover:underline"
                  >
                    {anchorPoint.name}
                  </Link>
                }
              />
              <KeyValue
                label={t('missions.startAt')}
                value={formatTime(mission.startAt, locale)}
                ltr
              />
              <KeyValue
                label={t('missions.endAt')}
                value={formatTime(mission.endAt, locale)}
                ltr
              />
              <KeyValue label={t('missions.team')} value={assigned} ltr />
            </dl>
          </Section>

<Section title={t('missions.driver')}>
            {driver ? (
              <>
                <p className="muted mb-1">
                  {driver.vehicle} · {driver.seats} {t('driver.seats')} ·{' '}
                  {driver.locality}
                </p>
                <ContactActions name={driver.name} phone={driver.phone} />
              </>
            ) : (
              <p className="muted">{t('missions.noDriver')}</p>
            )}
          </Section>

<Section title={t('missions.timeline')}>
            {/* Dated, not clock-only: a guard is created days before it starts
                and runs 21:00 → 05:00 across midnight, so bare times put
                "created 11:46" below "dropped off 11:40" and read as a
                sequence error. */}
            <Timeline withDate entries={timeline} />
          </Section>
        </div>
      </div>
    </>
  )
}
