import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  formatDate,
  formatTime,
  formatWeekday,
  getPastMissionViews,
  getUpcomingMissionViews,
  resolveConfirmation,
} from '@core/index'
import type { MissionStatus } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { CreateGuardButton } from '../../components/CreateGuardFab'
import { ChevronForward, Icon } from '../../components/Icon'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { MissionStatusChip, readToken } from '../../components/badges'
import { EmptyState, FilterPill, FilterRow } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

const STATUS_TOKEN: Record<MissionStatus, string> = {
  planned: '--status-info',
  in_progress: '--status-success',
  completed: '--text-muted',
  // Amber, not red: the group is probably fine and nobody confirmed — that is
  // an alert to chase, not an emergency.
  return_not_confirmed: '--status-warn',
}

const STATUSES: MissionStatus[] = [
  'in_progress',
  'planned',
  'return_not_confirmed',
  'completed',
]

/**
 * C1.4 — missions, map-first.
 *
 * Guards are plotted on their ANCHOR POINTS, not on the farm centroid, because
 * that is where the group physically is.
 */
export function MissionsScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()

  const upcoming = useCoreValue(getUpcomingMissionViews)
  const past = useCoreValue(getPastMissionViews)

  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [status, setStatus] = useState<MissionStatus | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const list = useMemo(() => {
    const base = tab === 'upcoming' ? upcoming : past
    return status === null ? base : base.filter((v) => v.mission.status === status)
  }, [tab, upcoming, past, status])

  const markers: MapMarker[] = useMemo(
    () =>
      list.map((view) =>
        withInteraction(
          {
            id: view.mission.id,
            position: view.anchorPoint.position,
            color: readToken(STATUS_TOKEN[view.mission.status]),
            title: view.farm.name,
            subtitle: view.anchorPoint.name,
            kind: 'mission',
            pulse: view.mission.status === 'return_not_confirmed',
          },
          { hoveredId, selectedId: null },
          {
            onHover: setHoveredId,
            onSelect: () => navigate(`/coordinator/missions/${view.mission.id}`),
          },
        ),
      ),
    [list, hoveredId, navigate],
  )

  return (
    <MapPanel
      ariaLabel={t('map.missionsMap')}
      markers={markers}
      legend={
        <ul className="flex flex-col gap-1.5">
          {STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-pill"
                style={{ backgroundColor: readToken(STATUS_TOKEN[s]) }}
              />
              <span className="text-caption text-content-secondary">
                {t(`missionStatus.${s}`)}
              </span>
            </li>
          ))}
        </ul>
      }
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title text-content-primary">
            {t('missions.title')}
          </h1>
          <p className="muted mt-1">
            {t('missions.count', { count: list.length })}
          </p>
        </div>
        <CreateGuardButton className="btn-primary hidden lg:inline-flex" />
      </header>

      {/* D7.3 — the upcoming/past switch and the status filter share one row.
          Status counts are computed against the ACTIVE tab, so a pill's number
          is what pressing it would actually show. */}
      <FilterRow active={status !== null} onClear={() => setStatus(null)}>
        <FilterPill
          active={tab === 'upcoming'}
          onClick={() => setTab('upcoming')}
          count={upcoming.length}
        >
          {t('missions.upcoming')}
        </FilterPill>
        <FilterPill
          active={tab === 'past'}
          onClick={() => setTab('past')}
          count={past.length}
        >
          {t('missions.past')}
        </FilterPill>
        <span className="mx-0.5 h-4 w-px shrink-0 bg-edge-subtle" />
        {STATUSES.map((s) => {
          const count = (tab === 'upcoming' ? upcoming : past).filter(
            (v) => v.mission.status === s,
          ).length
          if (count === 0) return null
          return (
            <FilterPill
              key={s}
              active={status === s}
              onClick={() => setStatus(status === s ? null : s)}
              count={count}
            >
              {t(`missionStatus.${s}`)}
            </FilterPill>
          )
        })}
      </FilterRow>

      {list.length === 0 ? (
        <EmptyState icon="shield" title={t('missions.empty')} />
      ) : (
        <ul className="stagger flex flex-col gap-2">
          {list.map((view) => {
            const { mission, farm, anchorPoint, driver, volunteers } = view
            const active = mission.id === hoveredId
            const mismatch = mission.assignments.some(
              (a) =>
                resolveConfirmation(a.outbound) === 'mismatch' ||
                resolveConfirmation(a.inbound) === 'mismatch',
            )

            return (
              <li key={mission.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHoveredId(mission.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(mission.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => navigate(`/coordinator/missions/${mission.id}`)}
                  className={`w-full rounded-md border px-3 py-2.5 text-start transition-all duration-fast ease-out ${
                    active
                      ? 'border-accent/60 bg-accent/10'
                      : 'border-edge-subtle hover:bg-surface-high'
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-caption font-medium text-content-primary">
                      {farm.name}
                    </span>
                    <MissionStatusChip status={mission.status} />
                    {mismatch && (
                      <span className="chip bg-status-warn/15 text-status-warn-ink">
                        <Icon name="alert" size={11} />
                        {t('alerts.presence_mismatch')}
                      </span>
                    )}
                  </span>

                  <span className="muted mt-1 block">
                    <span className="ltr-nums">
                      {formatDate(mission.startAt, locale)}
                    </span>{' '}
                    · {formatWeekday(mission.startAt, locale)} ·{' '}
                    <span className="ltr-nums">
                      {formatTime(mission.startAt, locale)}–
                      {formatTime(mission.endAt, locale)}
                    </span>
                  </span>

                  <span className="muted mt-0.5 block truncate">
                    {anchorPoint.name}
                    {driver ? ` · ${driver.name}` : ` · ${t('missions.noDriver')}`}
                  </span>

                  {/* Faces, not just names: the coordinator recognises the team
                      at a glance (C5.3). */}
                  <span className="mt-2 flex items-center gap-1.5">
                    {volunteers.slice(0, 5).map(({ volunteer }) => (
                      <Avatar
                        key={volunteer.id}
                        photo={volunteer.photo}
                        name={volunteer.name}
                        size="xs"
                      />
                    ))}
                    {volunteers.length > 5 && (
                      <span className="numeric text-micro text-content-muted">
                        +{volunteers.length - 5}
                      </span>
                    )}
                    <ChevronForward size={13} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </MapPanel>
  )
}
