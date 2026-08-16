import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import {
  FARM_PIPELINE,
  formatDate,
  formatDateTime,
  getAnchorPointsForFarm,
  getFarm,
  getFarmVisitsForFarm,
  getVisibleIncidentViews,
  getVisibleMissionViews,
  googleMapsPointUrl,
  now,
} from '@core/index'
import type { CommitmentKind, Farm, FarmStatus } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { ContactActions } from '../../components/ContactActions'
import { FarmVisitModal } from '../../components/FarmVisitModal'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { Timeline } from '../../components/Timeline'
import type { TimelineEntry } from '../../components/Timeline'
import {
  FarmStatusChip,
  MissionStatusChip,
  SeverityChip,
  readStatusColor,
  readToken,
} from '../../components/badges'
import {
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
      <div className="rounded-md border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-caption font-semibold text-status-danger-ink">
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
    <dl className="grid gap-x-5 sm:grid-cols-2">
      <KeyValue label={t('farms.filterType')} value={t(`farmType.${farm.type}`)} />
      <KeyValue label={t('volunteers.locality')} value={farm.locality} />
      <KeyValue
        label={t('farms.farmArea')}
        value={`${farm.farmHectares} ${t('farms.hectares')}`}
        ltr
      />
      <KeyValue
        label={t('farms.grazingArea')}
        value={`${farm.grazingHectares} ${t('farms.hectares')}`}
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

export function FarmDetailScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { farmId = '' } = useParams()

  const farm = useCoreValue(() => getFarm(farmId))
  const anchors = useCoreValue(() => getAnchorPointsForFarm(farmId))
  const visits = useCoreValue(() => getFarmVisitsForFarm(farmId))
  const incidents = useCoreValue(() =>
    getVisibleIncidentViews().filter((v) => v.incident.farmId === farmId),
  )
  const missions = useCoreValue(() =>
    getVisibleMissionViews().filter((v) => v.mission.farmId === farmId),
  )

  const [newVisit, setNewVisit] = useState(false)
  const [editVisitId, setEditVisitId] = useState<string | null>(null)

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

      <Section title={t('farms.pipeline')} className="mb-4">
        <StatusStepper status={farm.status} />
      </Section>

      {/* D7.4 — the map is the dominant block (3/5), the facts and the activity
          timeline share the remaining 2/5 as compact panels. Previously the
          map was 2/5 and the facts sprawled across 3/5 of a wide screen as a
          two-item-per-row list, which wasted the widest column on the page. */}
      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <Section
          className="lg:col-span-3"
          title={t('farms.location')}
          padded={false}
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
          <MapView
            ariaLabel={t('a11y.map')}
            className="h-80 w-full lg:h-[32rem]"
            center={farm.position}
            zoom={12}
            markers={[
              {
                id: farm.id,
                position: farm.position,
                color: readStatusColor(farm.status),
                title: farm.name,
                subtitle: farm.locality,
                emphasis: true,
              },
              ...anchors.map((a) => ({
                id: a.id,
                position: a.position,
                color: readToken('--accent'),
                title: a.name,
                subtitle: t('anchor.title'),
              })),
            ]}
          />
        </Section>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Section title={t('common.details')}>
            <FarmFacts farm={farm} />
          </Section>

          <Section
            title={t('timeline.farmActivity')}
            action={
              <button
                type="button"
                onClick={() => setNewVisit(true)}
                className="text-micro font-semibold text-accent-ink hover:underline"
              >
                {t('agenda.planVisit')}
              </button>
            }
          >
            {activity.length === 0 ? (
              <EmptyState icon="history" title={t('timeline.noActivity')} />
            ) : (
              <Timeline withDate entries={activity} />
            )}
          </Section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Section title={t('farms.contacts')}>
            <ul className="grid gap-x-5 sm:grid-cols-2">
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

          <Section
            title={t('farms.anchorPoints')}
            action={
              <Link
                to={`/coordinator/farms/${farm.id}/anchors/new`}
                className="btn-ghost py-1.5"
              >
                <Icon name="plus" size={14} />
                {t('anchor.new')}
              </Link>
            }
          >
            {anchors.length === 0 ? (
              <EmptyState icon="pin" title={t('farms.noAnchorPoints')} />
            ) : (
              <ul className="divide-y divide-edge-subtle">
                {anchors.map((anchor) => (
                  <li key={anchor.id} className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <RowLink
                        to={`/coordinator/farms/${farm.id}/anchors/${anchor.id}`}
                      >
                        <p className="text-caption font-medium text-content-primary">
                          {anchor.name}
                        </p>
                        <p className="muted mt-0.5 line-clamp-1">
                          {anchor.accessDescription}
                        </p>
                      </RowLink>
                    </div>
                    <Link
                      to={`/coordinator/farms/${farm.id}/anchors/${anchor.id}/edit`}
                      aria-label={t('anchor.edit')}
                      title={t('anchor.edit')}
                      className="shrink-0 rounded-sm p-2 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
                    >
                      <Icon name="edit" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('commitment.title')}>
            {farm.commitments.length === 0 ? (
              <EmptyState title={t('common.none')} />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {farm.commitments.map((c, i) => (
                  <li
                    key={`${c.kind}-${i}`}
                    className="flex items-start gap-3 rounded-md border border-edge-subtle px-3 py-2.5"
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
        </div>

        <div className="flex flex-col gap-4">
          <Section
            title={t('agenda.visits')}
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
                      className="flex w-full items-start gap-2.5 rounded-md border border-edge-subtle px-3 py-2 text-start
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
          </Section>

          <Section title={t('farms.agreements')}>
            {farm.agreements.length === 0 ? (
              <EmptyState icon="document" title={t('farms.noAgreements')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {farm.agreements.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-md border border-edge-subtle px-3.5 py-3"
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
          </Section>

          <Section title={t('common.notes')}>
            <p className="whitespace-pre-line text-caption leading-relaxed text-content-secondary">
              {farm.notes || t('common.none')}
            </p>
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
