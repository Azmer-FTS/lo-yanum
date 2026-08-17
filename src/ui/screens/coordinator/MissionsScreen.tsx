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
import {
  EmptyState,
  FilterPill,
  FilterRow,
  LoadMore,
} from '../../components/primitives'
import { useProgressive } from '../../hooks/useProgressive'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

const STATUS_TOKEN: Record<MissionStatus, string> = {
  recruiting: '--status-warn',
  planned: '--status-info',
  in_progress: '--status-success',
  completed: '--text-muted',
  // F4 — the charter orange. This was amber, on the reading that "the group is
  // probably fine and nobody confirmed" is a chase rather than an emergency;
  // the product owner overruled it, and rightly: a guard that ends without
  // anyone saying the group got home is the exact failure this programme
  // exists to catch, and it should be the loudest marker on the map.
  return_not_confirmed: '--critical',
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

  const page = useProgressive(list)

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
          {page.visible.map((view) => {
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
                  /* F5.3 — a guard is a CARD, not a bordered region of the
                     page. These rows carried a subtle border and no fill, which
                     in dark is a 1 px line on near-black: the whole list read
                     as one grey slab and the product owner could not tell where
                     one guard ended and the next began. */
                  className={`tile-interactive w-full px-3 py-2.5 text-start ${
                    active ? 'border-accent/60 bg-accent/10' : ''
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-caption font-medium text-content-primary">
                      {farm.name}
                    </span>
                    <MissionStatusChip status={mission.status} />
                    {mission.status === 'recruiting' && (
                      <span className="chip bg-status-warn/15 text-status-warn-ink">
                        <span className="numeric ltr-nums">
                          {mission.assignments.length}/
                          {mission.requiredVolunteers}
                        </span>
                      </span>
                    )}
                    {mismatch && (
                      /* F4 — a driver/group disagreement is a critical state. */
                      <span className="chip-critical">
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
      {/* F5.5 — a season of guards is hundreds of rows. */}
      <LoadMore shown={page.shown} total={page.total} onMore={page.more} />
    </MapPanel>
  )
}
