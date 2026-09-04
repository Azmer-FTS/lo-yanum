import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  farmRegion,
  formatDate,
  formatTime,
  formatWeekday,
  getCancelledMissionViews,
  getPastMissionViews,
  getUpcomingMissionViews,
  resolveConfirmation,
} from '@core/index'
import type { MissionStatus, MissionView, RegionId } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { ListTile } from '../../components/ListTile'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { MissionStatusChip, readToken } from '../../components/badges'
import { RegionFilter } from '../../components/RegionFilter'
import { RosterHead } from '../../components/roster'
import {
  EmptyState,
  FilterPill,
  FilterRow,
  ListTop,
  LoadMore,
} from '../../components/primitives'
import { useProgressive } from '../../hooks/useProgressive'
import { useWindowTable } from '../../hooks/useWindowTable'
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
  cancelled: '--text-muted',
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
  const navigate = useNavigate()

  const upcoming = useCoreValue(getUpcomingMissionViews)
  const past = useCoreValue(getPastMissionViews)
  // G9bis — cancelled guards live in their OWN tab (A45's distinct stats):
  // the operational lists exclude them at the accessor level, and this tab is
  // where a called-off night is found again, read, and reactivated.
  const cancelled = useCoreValue(getCancelledMissionViews)

  const [tab, setTab] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming')
  const [status, setStatus] = useState<MissionStatus | null>(null)
  // X12.4 — a guard's region is its farm's.
  const [region, setRegion] = useState<RegionId | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const byTab = { upcoming, past, cancelled }
  const list = useMemo(() => {
    return byTab[tab].filter(
      (v) =>
        (status === null || v.mission.status === status) &&
        (region === null || farmRegion(v.farm) === region),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, upcoming, past, cancelled, status, region])

  /** X12.4 — per-region counts for the picker's labels, over the live tab. */
  const regionCounts = useMemo(() => {
    const out: Partial<Record<RegionId, number>> = {}
    for (const v of byTab[tab]) {
      const id = farmRegion(v.farm)
      if (id) out[id] = (out[id] ?? 0) + 1
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, upcoming, past, cancelled])

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
      screenKey="missions"
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
      {({ mode }) => (
      <>
      <ListTop
        testId="missions-top"
        title={t('missions.title')}
        count={t('missions.count', { count: list.length })}
        filters={
          /* D7.3 — the upcoming/past switch and the status filter share one
             row. Status counts are computed against the ACTIVE tab, so a
             pill's number is what pressing it would actually show. */
          <FilterRow
            nowrap
            active={status !== null || region !== null}
            onClear={() => {
              setStatus(null)
              setRegion(null)
            }}
          >
            <RegionFilter
              value={region}
              onChange={setRegion}
              counts={regionCounts}
              testId="missions-region"
            />
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
        {/* Rendered only when at least one guard was ever called off — an
            empty "cancelled" tab is a question nobody asked. */}
        {cancelled.length > 0 && (
          <FilterPill
            active={tab === 'cancelled'}
            onClick={() => {
              setTab('cancelled')
              setStatus(null)
            }}
            count={cancelled.length}
          >
            {t('missions.cancelledTab')}
          </FilterPill>
        )}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-edge-subtle" />
        {STATUSES.map((s) => {
          const count = byTab[tab].filter(
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
        }
      >
        {/* ★★ Y4 — the column headers ride the sticky top with the filters, so
            a scrolled table still names its columns. Same construction as the
            farms and volunteers rosters. */}
        {mode === 'hidden' && list.length > 0 && <MissionsTableHead />}
      </ListTop>

      {list.length === 0 ? (
        <EmptyState icon="shield" title={t('missions.empty')} />
      ) : mode === 'hidden' ? (
        /**
         * ★★ Y4 — CONTENU PLEIN IS THE TABLE, on this screen exactly as on the
         *    four others. A guard tile is four rows tall because a card has to
         *    say everything at once; given the whole width, columns say the
         *    same things in a third of the height and line up down the page.
         */
        <MissionsTable
          views={list}
          onOpen={(id) => navigate(`/coordinator/missions/${id}`)}
        />
      ) : (
        // P0bis.3b — the cards go TWO PER ROW as soon as the panel can hold
        // two. Stretched to the full width of a widened panel each row becomes
        // a mostly-empty band, which is the "unjustified emptiness" the
        // density pass exists to remove; `panel-scope` makes that a question
        // about the panel rather than about the window.
        <div className="panel-scope">
          <ul className="stagger pair-grid gap-2">
            {page.visible.map((view) => (
              <li key={view.mission.id}>
                <MissionTile
                  view={view}
                  active={view.mission.id === hoveredId}
                  onHover={setHoveredId}
                  onOpen={() => navigate(`/coordinator/missions/${view.mission.id}`)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* F5.5 — a season of guards is hundreds of rows. */}
      <LoadMore shown={page.shown} total={page.total} onMore={page.more} />
      </>
      )}
    </MapPanel>
  )
}

const TABLE_ROW_HEIGHT = 56

/**
 * ★★ Y4 (2026-09-04) — THE GUARD TILE, ON THE APP'S ONE TILE.
 *
 * It was a bare `<button>` with four stacked rows and no picture at all, while
 * the farms list beside it had a full-bleed photo — two lists, two shapes, for
 * the same gesture. It is `ListTile` now, so the farm's photo is on the
 * physical right here too and the tap targets are the same two zones.
 */
function MissionTile({
  view,
  active,
  onHover,
  onOpen,
}: {
  view: MissionView
  active: boolean
  onHover: (id: string | null) => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { mission, farm, anchorPoint, driver, volunteers } = view
  const mismatch = mission.assignments.some(
    (a) =>
      resolveConfirmation(a.outbound) === 'mismatch' ||
      resolveConfirmation(a.inbound) === 'mismatch',
  )

  return (
    <ListTile
      testId="mission-tile"
      photo={farm.photo}
      name={farm.name}
      active={active}
      onOpen={onOpen}
      openLabel={t('missions.openMission')}
      hoverProps={{
        onMouseEnter: () => onHover(mission.id),
        onMouseLeave: () => onHover(null),
      }}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span
          className={`text-caption font-medium text-content-primary ${
            mission.status === 'cancelled' ? 'line-through opacity-70' : ''
          }`}
        >
          {farm.name}
        </span>
        <MissionStatusChip status={mission.status} />
        {mission.status === 'recruiting' && (
          <span className="chip bg-status-warn/15 text-status-warn-ink">
            <span className="numeric ltr-nums">
              {mission.assignments.length}/{mission.requiredVolunteers}
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
        <span className="ltr-nums">{formatDate(mission.startAt, locale)}</span>{' '}
        · {formatWeekday(mission.startAt, locale)} ·{' '}
        <span className="ltr-nums">
          {formatTime(mission.startAt, locale)}–{formatTime(mission.endAt, locale)}
        </span>
      </span>

      <span className="muted mt-0.5 block truncate">
        {anchorPoint.name}
        {driver ? ` · ${driver.name}` : ` · ${t('missions.noDriver')}`}
      </span>

      {/* Faces, not just names: the coordinator recognises the team at a
          glance (C5.3). */}
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
      </span>
    </ListTile>
  )
}

/** ★★ Y4 — the guards, as columns. Same grid system as the three rosters. */
export function MissionsTableHead() {
  const { t } = useTranslation()
  return (
    <div className="roster roster-missions">
      <div
        className="roster-row rounded-t-card border-b border-edge-subtle
                   bg-surface-overlay/95 px-4 py-1.5 backdrop-blur"
      >
        <RosterHead label={t('missions.farm')} />
        <RosterHead label={t('missions.date')} tier="md" />
        <RosterHead label={t('missions.anchorPoint')} tier="lg" />
        <RosterHead label={t('missions.driver')} tier="xl" />
        <RosterHead label={t('missions.team')} tier="lg" />
        <RosterHead label={t('farms.colStatus')} tier="md" />
      </div>
    </div>
  )
}

function MissionsTable({
  views,
  onOpen,
}: {
  views: MissionView[]
  onOpen: (missionId: string) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { listRef, virtualizer, margin } = useWindowTable(
    views.length,
    () => TABLE_ROW_HEIGHT,
  )

  return (
    <div className="roster roster-missions card lg:rounded-t-none">
      <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const { mission, farm, anchorPoint, driver, volunteers } = views[item.index]
          return (
            <button
              key={mission.id}
              type="button"
              onClick={() => onOpen(mission.id)}
              style={{
                position: 'absolute',
                insetInlineStart: 0,
                insetInlineEnd: 0,
                top: 0,
                height: item.size,
                transform: `translateY(${item.start - margin}px)`,
              }}
              className="roster-row border-b border-edge-subtle/50 px-4 text-start
                         transition-colors duration-fast hover:bg-surface-high/60"
            >
              {/* 1 — the farm, with whatever has lost its column merged under it. */}
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar photo={farm.photo} name={farm.name} size="xs" shape="square" />
                <span className="min-w-0">
                  <span
                    className={`block truncate text-caption font-medium text-content-primary ${
                      mission.status === 'cancelled' ? 'line-through opacity-70' : ''
                    }`}
                  >
                    {farm.name}
                  </span>
                  <span className="muted block truncate">
                    <span data-merge="md" style={{ ['--col-display' as string]: 'inline' }}>
                      <span className="ltr-nums">{formatDate(mission.startAt, locale)}</span>
                    </span>
                    <span data-merge="lg" style={{ ['--col-display' as string]: 'inline' }}>
                      {' '}· {anchorPoint.name}
                    </span>
                    <span data-merge="xl" style={{ ['--col-display' as string]: 'inline' }}>
                      {' '}· {driver ? driver.name : t('missions.noDriver')}
                    </span>
                  </span>
                </span>
              </span>

              {/* 2 — when */}
              <span data-col="md" className="truncate text-caption text-content-secondary">
                <span className="ltr-nums">{formatDate(mission.startAt, locale)}</span>
                <span className="muted block ltr-nums">
                  {formatTime(mission.startAt, locale)}–{formatTime(mission.endAt, locale)}
                </span>
              </span>

              {/* 3 — the rendezvous */}
              <span data-col="lg" className="truncate text-caption text-content-secondary">
                {anchorPoint.name}
              </span>

              {/* 4 — the driver */}
              <span data-col="xl" className="truncate text-caption text-content-secondary">
                {driver ? driver.name : <span className="muted">{t('missions.noDriver')}</span>}
              </span>

              {/* 5 — the team, as faces.
                  ⚠️ `--col-display: flex` — a cell's `display` is OWNED by the
                     roster's tier rules (`.roster [data-col]`, index.css),
                     whose selector outweighs Tailwind's `.flex`. Without this
                     the cell falls back to `block` and the faces stack
                     VERTICALLY out of the row, which is exactly what the
                     first capture of this table showed. */}
              <span
                data-col="lg"
                style={{ ['--col-display' as string]: 'flex' }}
                className="flex items-center gap-1"
              >
                {volunteers.slice(0, 3).map(({ volunteer }) => (
                  <Avatar key={volunteer.id} photo={volunteer.photo} name={volunteer.name} size="xs" />
                ))}
                {volunteers.length > 3 && (
                  <span className="numeric text-micro text-content-muted">
                    +{volunteers.length - 3}
                  </span>
                )}
              </span>

              {/* 6 — status */}
              <span
                data-col="md"
                style={{ ['--col-display' as string]: 'flex' }}
                className="flex min-w-0 items-center"
              >
                <MissionStatusChip status={mission.status} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

