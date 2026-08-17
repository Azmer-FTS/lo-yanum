import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import {
  FARM_PIPELINE,
  createAnchorPoint,
  createFarmZone,
  deleteFarmZone,
  formatDate,
  formatDateTime,
  getAnchorPointsForFarm,
  getFarm,
  getFarmZonesForFarm,
  updateFarmZoneRing,
  getFarmVisitsForFarm,
  getVisibleIncidentViews,
  getVisibleMissionViews,
  googleMapsPointUrl,
  now,
  patchAnchorPoint,
} from '@core/index'
import type { CommitmentKind, Farm, FarmStatus, LatLng } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { ContactActions } from '../../components/ContactActions'
import { FarmVisitModal } from '../../components/FarmVisitModal'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { AnchorMap } from '../../components/AnchorMap'
import { Timeline } from '../../components/Timeline'
import type { TimelineEntry } from '../../components/Timeline'
import {
  FarmStatusChip,
  MissionStatusChip,
  SeverityChip,
  readStatusColor,
} from '../../components/badges'
import {
  CollapsibleSection,
  EmptyState,
  KeyValue,
  PageHeader,
  RowLink,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

const COMMITMENT_ICON: Record<CommitmentKind, IconName> = {
  shelter: 'home',
  water: 'water',
  food: 'food',
  other: 'plus',
}

/**
 * The pipeline as a row of pills.
 *
 * The current step is a TINT plus a dot, not a solid fill with near-black text.
 * Three of the seven pipeline hues cannot legibly carry 11px text on a solid
 * fill (see the `text-on-accent on solid <hue>` checks in `bun run contrast`),
 * and a stepper where two of the steps are readable and five are not is worse
 * than one that is uniformly quiet.
 */
function StatusStepper({ status }: { status: FarmStatus }) {
  const { t } = useTranslation()

  if (status === 'declined') {
    return (
      <div className="rounded-field border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-caption font-semibold text-status-danger-ink">
        {t('farmStatus.declined')}
      </div>
    )
  }

  const currentIndex = FARM_PIPELINE.indexOf(status)

  return (
    <ol className="scroll-x flex items-center gap-1">
      {FARM_PIPELINE.map((step, i) => {
        const done = i < currentIndex
        const current = i === currentIndex
        return (
          <li key={step} className="flex shrink-0 items-center gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-micro font-semibold
                          transition-all duration-base ${
                            current
                              ? 'text-content-primary ring-1'
                              : done
                                ? 'bg-surface-high text-content-secondary'
                                : 'bg-surface-sunken text-content-muted'
                          }`}
              style={
                current
                  ? {
                      backgroundColor: `color-mix(in srgb, ${readStatusColor(step)} 18%, transparent)`,
                      // Ring colour is inline because it is data-driven; the
                      // token itself still comes from tokens.css.
                      boxShadow: `0 0 0 1px ${readStatusColor(step)}`,
                    }
                  : undefined
              }
            >
              {done && <Icon name="check" size={12} />}
              {current && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-pill"
                  style={{ backgroundColor: readStatusColor(step) }}
                />
              )}
              {t(`farmStatus.${step}`)}
            </div>
            {i < FARM_PIPELINE.length - 1 && (
              <span
                className={`block h-px w-4 ${
                  done ? 'bg-edge-strong' : 'bg-edge-subtle'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** D7.4 — the facts, two dense columns, no 40-character label column. */
function FarmFacts({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const locale = useLocale()

  return (
    /* F5.2 — `sm:` is a VIEWPORT query, not a container one: two columns are
       right when these facts have the page (below `xl` they do), and cramped
       in the 40 % side column they live in from `xl` up (G7bis.3). Two again
       only at `2xl`, once that column is genuinely wide. */
    <dl className="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
      <KeyValue label={t('farms.filterType')} value={t(`farmType.${farm.type}`)} />
      <KeyValue label={t('volunteers.locality')} value={farm.locality} />
      <KeyValue
        label={t('farms.farmArea')}
        value={`${farm.farmDunams} ${t('farms.dunams')}`}
        ltr
      />
      <KeyValue
        label={t('farms.grazingArea')}
        value={`${farm.grazingDunams} ${t('farms.dunams')}`}
        ltr
      />
      <KeyValue
        label={t('farms.lastVisit')}
        value={
          farm.lastVisitAt
            ? formatDate(farm.lastVisitAt, locale)
            : t('farms.noVisitYet')
        }
        ltr={farm.lastVisitAt !== null}
      />
      <KeyValue
        label={t('farms.nextVisit')}
        value={
          farm.nextVisitAt ? formatDate(farm.nextVisitAt, locale) : t('common.none')
        }
        ltr={farm.nextVisitAt !== null}
      />
    </dl>
  )
}

/**
 * G7bis.3 — the compact identity card: where the farm stands in the pipeline,
 * then the facts. Rendered twice (main column below `xl`, side column from
 * `xl`) because the mobile order is "map, identity, everything else" and no
 * grid can interleave two wrapper columns.
 */
function FarmIdentity({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  return (
    <Section title={t('common.details')} flush>
      <div className="mb-3 border-b border-edge-subtle pb-3">
        <StatusStepper status={farm.status} />
      </div>
      <FarmFacts farm={farm} />
    </Section>
  )
}

export function FarmDetailScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { farmId = '' } = useParams()

  const farm = useCoreValue(() => getFarm(farmId))
  const anchors = useCoreValue(() => getAnchorPointsForFarm(farmId))
  const zones = useCoreValue(() => getFarmZonesForFarm(farmId))
  const visits = useCoreValue(() => getFarmVisitsForFarm(farmId))
  const incidents = useCoreValue(() =>
    getVisibleIncidentViews().filter((v) => v.incident.farmId === farmId),
  )
  const missions = useCoreValue(() =>
    getVisibleMissionViews().filter((v) => v.mission.farmId === farmId),
  )

  const [newVisit, setNewVisit] = useState(false)
  const [editVisitId, setEditVisitId] = useState<string | null>(null)
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null)

  // G7bis.3 — the secondary blocks open by default only where two columns
  // exist to absorb them; on one narrow column they start folded. Read once:
  // resizing mid-visit should not re-fold what the user arranged.
  const [wideDefault] = useState(() =>
    window.matchMedia('(min-width: 1280px)').matches,
  )
  // The map is collapsible on the one-column layouts (open by default), and
  // simply always there from `xl` up.
  const [mapOpen, setMapOpen] = useState(
    () => sessionStorage.getItem('farm-detail:map') !== '0',
  )
  const toggleMap = () =>
    setMapOpen((v) => {
      sessionStorage.setItem('farm-detail:map', v ? '0' : '1')
      return !v
    })

  if (!farm) return <Navigate to="/coordinator/farms" replace />

  /**
   * D6.3 — the farm's recent life in one strip: last guard, last incident, last
   * visit, next visit. Four heterogeneous records merged and sorted by time,
   * because "what has been going on at this farm" is a chronological question
   * and answering it from three separate cards means reading three dates and
   * doing the sort in your head.
   */
  const nowMs = now().getTime()
  const activity: TimelineEntry[] = [
    ...missions.slice(0, 2).map((v) => ({
      id: `m-${v.mission.id}`,
      label: t('timeline.lastGuard'),
      at: v.mission.startAt,
      detail: `${v.anchorPoint.name} · ${v.volunteers.length}`,
      icon: 'shield' as const,
      state: 'done' as const,
      tone: 'default' as const,
    })),
    ...incidents.slice(0, 2).map(({ incident }) => ({
      id: `i-${incident.id}`,
      label: t('timeline.lastIncident'),
      at: incident.reportedAt,
      detail: incident.description,
      icon: 'alert' as const,
      state: 'done' as const,
      tone: (incident.severity === 'urgent' ? 'danger' : 'warn') as
        | 'danger'
        | 'warn',
    })),
    ...visits.map((visit) => {
      const future = new Date(visit.at).getTime() > nowMs
      return {
        id: `v-${visit.id}`,
        label: t(future ? 'timeline.nextVisit' : 'timeline.lastVisit'),
        at: visit.at,
        detail: visit.note,
        icon: 'pin' as const,
        state: (future ? 'current' : 'done') as 'current' | 'done',
        tone: 'accent' as const,
      }
    }),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6)

  return (
    <>
      <PageHeader
        title={farm.name}
        subtitle={`${farm.locality} · ${farm.region}`}
        back={{ to: '/coordinator/farms', label: t('farms.title') }}
        actions={
          <>
            <FarmStatusChip status={farm.status} />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setNewVisit(true)}
            >
              <Icon name="calendar" size={15} />
              {t('agenda.planVisit')}
            </button>
            <Link to={`/coordinator/farms/${farm.id}/edit`} className="btn-secondary">
              <Icon name="edit" size={15} />
              {t('common.edit')}
            </Link>
          </>
        }
      />

      {/* G7bis.3 — A WORKING PAGE, NOT A MOSAIC.
          Two columns from `xl` (1280 — an iPad PORTRAIT is 1032 and must stay
          one column): the 60 % main track is what the coordinator works WITH —
          the big editable map, the guard posts it draws, the guards, the
          incidents. The 40 % track is what they look things up IN — identity,
          contacts, and the reference blocks, which fold. `min-w-0` on both
          tracks is load-bearing (see bun run layout's history with this page). */}
      <div className="grid items-start gap-x-5 gap-y-4 xl:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* F6.1 / G7bis.3 — THE MAP IS THE INSTRUMENT, AND NOW IT IS BIG.
              Same editable surface the wizard uses (click to drop a guard
              post, drag to move one, draw zones), at a working height and one
              button away from the whole viewport (G7bis.2). Collapsible on the
              one-column layouts so the page can become a list when the errand
              is not geographic — open by default, because it usually is. */}
          <Section
            title={t('map.title')}
            flush
            bare
            action={
              <button
                type="button"
                onClick={toggleMap}
                aria-expanded={mapOpen}
                className="btn-ghost py-1.5 xl:hidden"
              >
                <Icon name={mapOpen ? 'collapse' : 'expand'} size={14} />
                {t(mapOpen ? 'map.collapse' : 'map.expand')}
              </button>
            }
          >
            <div className={`${mapOpen ? '' : 'hidden xl:block'} h-[56dvh]`}>
              <AnchorMap
                farm={farm}
                anchors={anchors}
                selectedId={selectedAnchorId}
                onSelect={setSelectedAnchorId}
                onCreate={(position: LatLng) => {
                  const created = createAnchorPoint({
                    farmId: farm.id,
                    name: t('anchor.defaultName', { n: anchors.length + 1 }),
                    position,
                    instructions: [],
                    accessDescription: '',
                  })
                  setSelectedAnchorId(created.id)
                }}
                onMove={(id, position) => patchAnchorPoint(id, { position })}
                zones={zones}
                onZoneCreate={(kind, ring) =>
                  createFarmZone({ farmId: farm.id, kind, ring })
                }
                onZoneRingChange={updateFarmZoneRing}
                onZoneDelete={deleteFarmZone}
              />
            </div>
          </Section>

          {/* One-column order is "map, identity, the rest" — the identity
              card renders here below `xl` and in the side column above it. */}
          <div className="xl:hidden">
            <FarmIdentity farm={farm} />
          </div>

          <Section
            title={t('farms.anchorPoints')}
            action={
              <a
                href={googleMapsPointUrl(farm.position)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-micro font-semibold text-accent-ink hover:underline"
              >
                <Icon name="external" size={13} />
                {t('common.openInMaps')}
              </a>
            }
          >
            {anchors.length === 0 ? (
              /* F1 — no anchor point is not an empty list, it is a missing
                 thing with a way to make it. The map above this is that way. */
              <EmptyState
                icon="pin"
                title={t('farms.noAnchorPoints')}
                hint={t('anchor.mapHintCreate')}
              />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {anchors.map((anchor) => (
                  <li
                    key={anchor.id}
                    className={`flex items-center gap-1 rounded-field border px-1 transition-colors duration-fast ${
                      anchor.id === selectedAnchorId
                        ? 'border-accent bg-accent/10'
                        : 'border-transparent'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedAnchorId(anchor.id)}
                      className="min-w-0 flex-1 px-2 py-2 text-start"
                    >
                      <span className="block truncate text-caption font-medium text-content-primary">
                        {anchor.name}
                      </span>
                      {/* `line-clamp-1` supplies its own `display:-webkit-box`;
                          adding `block` next to it silently un-clamps the line
                          and a four-line access description shoves the list. */}
                      <span className="muted mt-0.5 line-clamp-1">
                        {anchor.accessDescription || t('anchor.accessLater')}
                      </span>
                    </button>
                    <Link
                      to={`/coordinator/farms/${farm.id}/anchors/${anchor.id}`}
                      aria-label={t('common.details')}
                      title={t('common.details')}
                      className="shrink-0 rounded-field p-2 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
                    >
                      <Icon name="document" size={16} />
                    </Link>
                    <Link
                      to={`/coordinator/farms/${farm.id}/anchors/${anchor.id}/edit`}
                      aria-label={t('anchor.edit')}
                      title={t('anchor.edit')}
                      className="shrink-0 rounded-field p-2 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
                    >
                      <Icon name="edit" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('farms.guardHistory')}>
            {missions.length === 0 ? (
              <EmptyState icon="shield" title={t('missions.empty')} />
            ) : (
              <ul className="divide-y divide-edge-subtle">
                {missions.map((view) => (
                  <li key={view.mission.id}>
                    <RowLink to={`/coordinator/missions/${view.mission.id}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="ltr-nums text-caption font-medium text-content-primary">
                          {formatDate(view.mission.startAt, locale)}
                        </span>
                        <MissionStatusChip status={view.mission.status} />
                      </div>
                      <p className="muted mt-0.5">
                        {view.anchorPoint.name} ·{' '}
                        {view.volunteers.map((v) => v.volunteer.name).join(', ')}
                      </p>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('farms.recentIncidents')}>
            {incidents.length === 0 ? (
              <EmptyState icon="alert" title={t('incidents.empty')} />
            ) : (
              <ul className="divide-y divide-edge-subtle">
                {incidents.slice(0, 4).map(({ incident }) => (
                  <li key={incident.id}>
                    <RowLink to={`/coordinator/incidents/${incident.id}`}>
                      <div className="flex items-center gap-2">
                        <SeverityChip severity={incident.severity} />
                        <span className="ltr-nums text-micro text-content-muted">
                          {formatDateTime(incident.reportedAt, locale)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-caption text-content-secondary">
                        {incident.description}
                      </p>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="hidden xl:block">
            <FarmIdentity farm={farm} />
          </div>

          <Section title={t('farms.contacts')}>
            <ul className="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-1">
              {farm.contacts.map((contact) => (
                <li key={contact.id} className="flex items-center gap-3 py-1.5">
                  <Avatar photo={contact.photo} name={contact.name} size="md" />
                  <ContactActions
                    className="flex-1"
                    name={contact.name}
                    phone={contact.phone}
                    role={
                      contact.isPrimary
                        ? `${contact.role} · ${t('farms.primaryContact')}`
                        : contact.role
                    }
                  />
                </li>
              ))}
            </ul>
          </Section>

          <CollapsibleSection
            storageKey="farm-detail:commitments"
            title={t('commitment.title')}
            defaultOpen={wideDefault}
          >
            {farm.commitments.length === 0 ? (
              <EmptyState title={t('common.none')} />
            ) : (
              <ul className="grid gap-2">
                {farm.commitments.map((c, i) => (
                  <li
                    key={`${c.kind}-${i}`}
                    className="flex items-start gap-3 rounded-field border border-edge-subtle px-3 py-2.5"
                  >
                    <span
                      className={`mt-0.5 ${
                        c.fulfilled
                          ? 'text-status-success-ink'
                          : 'text-status-warn-ink'
                      }`}
                    >
                      <Icon name={COMMITMENT_ICON[c.kind]} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-caption font-medium text-content-primary">
                        {t(`commitment.${c.kind}`)}
                      </p>
                      <p className="muted mt-0.5">{c.detail}</p>
                    </div>
                    <span
                      className={`chip shrink-0 ${
                        c.fulfilled
                          ? 'bg-status-success/15 text-status-success-ink'
                          : 'bg-status-warn/15 text-status-warn-ink'
                      }`}
                    >
                      {t(
                        c.fulfilled ? 'commitment.fulfilled' : 'commitment.pending',
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="farm-detail:agreements"
            title={t('farms.agreements')}
            defaultOpen={wideDefault}
          >
            {farm.agreements.length === 0 ? (
              <EmptyState icon="document" title={t('farms.noAgreements')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {farm.agreements.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-field border border-edge-subtle px-3.5 py-3"
                  >
                    <span className="text-accent-ink">
                      <Icon name="document" size={19} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-caption font-medium text-content-primary">
                        {a.fileName}
                      </p>
                      <p className="muted">
                        {t('farms.signedBy')} {a.signedBy} ·{' '}
                        <span className="ltr-nums">
                          {formatDate(a.signedAt, locale)}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="farm-detail:notes"
            title={t('common.notes')}
            defaultOpen={wideDefault}
          >
            <p className="whitespace-pre-line text-caption leading-relaxed text-content-secondary">
              {farm.notes || t('common.none')}
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="farm-detail:visits"
            title={t('agenda.visits')}
            defaultOpen={wideDefault}
            action={
              <button
                type="button"
                onClick={() => setNewVisit(true)}
                className="btn-ghost py-1.5"
              >
                <Icon name="plus" size={14} />
                {t('agenda.planVisit')}
              </button>
            }
          >
            {visits.length === 0 ? (
              <EmptyState icon="calendar" title={t('agenda.noVisits')} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {visits.map((visit) => (
                  <li key={visit.id}>
                    <button
                      type="button"
                      onClick={() => setEditVisitId(visit.id)}
                      className="flex w-full items-start gap-2.5 rounded-field border border-edge-subtle px-3 py-2 text-start
                                 transition-all duration-fast hover:border-accent/50 hover:bg-surface-high"
                    >
                      <span
                        className={`mt-0.5 ${
                          visit.done
                            ? 'text-status-success-ink'
                            : 'text-status-violet-ink'
                        }`}
                      >
                        <Icon name={visit.done ? 'check' : 'calendar'} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="ltr-nums block text-caption font-medium text-content-primary">
                          {formatDateTime(visit.at, locale)}
                        </span>
                        {visit.note && (
                          <span className="muted mt-0.5 block line-clamp-2">
                            {visit.note}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="farm-detail:activity"
            title={t('timeline.farmActivity')}
            defaultOpen={wideDefault}
          >
            {activity.length === 0 ? (
              <EmptyState icon="history" title={t('timeline.noActivity')} />
            ) : (
              <Timeline withDate entries={activity} />
            )}
          </CollapsibleSection>
        </div>
      </div>

      {newVisit && (
        <FarmVisitModal
          defaultFarmId={farm.id}
          onClose={() => setNewVisit(false)}
        />
      )}
      {editVisitId && (
        <FarmVisitModal
          visitId={editVisitId}
          onClose={() => setEditVisitId(null)}
        />
      )}
    </>
  )
}
