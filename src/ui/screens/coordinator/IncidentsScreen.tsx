import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { DAY, formatDateTime, getVisibleIncidentViews } from '@core/index'
import type { IncidentSeverity, IncidentView } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { ListTile } from '../../components/ListTile'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { MarkerSwatch, SeverityChip, readToken } from '../../components/badges'
import {
  EmptyState,
  FilterPill,
  FilterRow,
  ListTop,
  LoadMore,
} from '../../components/primitives'
import { RosterHead } from '../../components/roster'
import { useProgressive } from '../../hooks/useProgressive'
import { useWindowTable } from '../../hooks/useWindowTable'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

const ALL = 'all'
const SEVERITIES: IncidentSeverity[] = ['urgent', 'suspicious', 'observation']

const SEVERITY_TOKEN: Record<IncidentSeverity, string> = {
  observation: '--status-success',
  suspicious: '--status-warn',
  // F4 — an unresolved urgent incident is the charter orange, on the map and
  // in the list, so the marker and the row are recognisably the same object.
  urgent: '--critical',
}

const SEVERITY_EDGE: Record<IncidentSeverity, string> = {
  observation: 'border-s-status-success',
  suspicious: 'border-s-status-warn',
  urgent: 'border-s-critical',
}

/**
 * C1.3 — incidents, map-first.
 *
 * Marker colour encodes severity and an unresolved urgent incident gets a
 * pulsing halo: the coordinator should see "something is happening right now,
 * there" before reading a single word.
 */
export function IncidentsScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()

  const views = useCoreValue(getVisibleIncidentViews)

  const [severity, setSeverity] = useState<IncidentSeverity | null>(null)
  const [since, setSince] = useState(ALL)
  const [openOnly, setOpenOnly] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const cutoff =
      since === 'week'
        ? Date.now() - 7 * DAY
        : since === 'month'
          ? Date.now() - 30 * DAY
          : null

    return views.filter(({ incident }) => {
      if (severity !== null && incident.severity !== severity) return false
      if (openOnly && incident.resolved) return false
      if (cutoff && new Date(incident.reportedAt).getTime() < cutoff) return false
      return true
    })
  }, [views, severity, since, openOnly])

  const page = useProgressive(filtered)

  const markers: MapMarker[] = useMemo(
    () =>
      filtered
        .filter((v) => v.incident.position !== null)
        .map((v) =>
          withInteraction(
            {
              id: v.incident.id,
              position: v.incident.position as { lat: number; lng: number },
              color: readToken(SEVERITY_TOKEN[v.incident.severity]),
              title: v.farm.name,
              subtitle: t(`severity.${v.incident.severity}`),
              kind: 'incident',
              // Only an OPEN urgent incident pulses; a resolved one is history.
              pulse: v.incident.severity === 'urgent' && !v.incident.resolved,
            },
            { hoveredId, selectedId: null },
            {
              onHover: setHoveredId,
              onSelect: () => navigate(`/coordinator/incidents/${v.incident.id}`),
            },
          ),
        ),
    [filtered, hoveredId, navigate, t],
  )

  return (
    <MapPanel
      screenKey="incidents"
      ariaLabel={t('map.incidentsMap')}
      markers={markers}
      legend={
        <ul className="flex flex-col gap-1.5">
          {SEVERITIES.map((s) => (
            <li key={s} className="flex items-center gap-2">
              {/* G7bis.1 — the legend repeats the marker's warning-triangle
                  shape, not a dot the map no longer shows. */}
              <MarkerSwatch
                shape="triangle"
                color={readToken(SEVERITY_TOKEN[s])}
              />
              <span className="text-caption text-content-secondary">
                {t(`severity.${s}`)}
              </span>
              <span className="numeric ms-auto ps-3 text-caption text-content-muted">
                {views.filter((v) => v.incident.severity === s).length}
              </span>
            </li>
          ))}
        </ul>
      }
    >
      {({ mode }) => (
      <>
      <ListTop
        testId="incidents-top"
        title={t('incidents.title')}
        count={t('incidents.count', { count: filtered.length })}
        filters={
          /* D7.3 — one row, every pill counted. The twelve per-farm pills are
             gone: they were longer than the list they filtered, and clicking
             a marker on the map is a faster way to narrow to one farm than
             reading twelve names. */
          <FilterRow
        nowrap
        active={severity !== null || openOnly || since !== ALL}
        onClear={() => {
          setSeverity(null)
          setOpenOnly(false)
          setSince(ALL)
        }}
      >
        {SEVERITIES.map((s) => (
          <FilterPill
            key={s}
            active={severity === s}
            onClick={() => setSeverity(severity === s ? null : s)}
            count={views.filter((v) => v.incident.severity === s).length}
          >
            {t(`severity.${s}`)}
          </FilterPill>
        ))}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-edge-subtle" />
        <FilterPill
          active={openOnly}
          onClick={() => setOpenOnly(!openOnly)}
          count={views.filter((v) => !v.incident.resolved).length}
        >
          {t('incidents.openOnly')}
        </FilterPill>
        {(['week', 'month'] as const).map((w) => (
          <FilterPill
            key={w}
            active={since === w}
            onClick={() => setSince(since === w ? ALL : w)}
            count={
              views.filter(
                (v) =>
                  new Date(v.incident.reportedAt).getTime() >=
                  Date.now() - (w === 'week' ? 7 : 30) * DAY,
              ).length
            }
          >
            {t(w === 'week' ? 'incidents.dateWeek' : 'incidents.dateMonth')}
          </FilterPill>
        ))}
      </FilterRow>
        }
      >
        {/* ★★ Y4 — the column headers ride the sticky top with the filters. */}
        {mode === 'hidden' && filtered.length > 0 && <IncidentsTableHead />}
      </ListTop>

      {filtered.length === 0 ? (
        <EmptyState icon="alert" title={t('incidents.empty')} />
      ) : mode === 'hidden' ? (
        /** ★★ Y4 — CONTENU PLEIN IS THE TABLE, on all five lists alike. */
        <IncidentsTable
          views={filtered}
          onOpen={(id) => navigate(`/coordinator/incidents/${id}`)}
        />
      ) : (
        // P0bis.3b — the cards go TWO PER ROW as soon as the panel can hold
        // two. Stretched to the full width of a widened panel each row becomes
        // a mostly-empty band, which is the "unjustified emptiness" the
        // density pass exists to remove; `panel-scope` makes that a question
        // about the panel rather than about the window.
        <div className="panel-scope">
          <ul className="stagger pair-grid gap-2">
            {page.visible.map(({ incident, farm }) => (
              <li key={incident.id}>
                <ListTile
                  testId="incident-tile"
                  photo={farm.photo}
                  name={farm.name}
                  active={incident.id === hoveredId}
                  onOpen={() => navigate(`/coordinator/incidents/${incident.id}`)}
                  /* F5.3 — the row floats: card surface, soft drop, and the
                     severity bar on top of it rather than instead of it. */
                  className={`border-s-4 ${SEVERITY_EDGE[incident.severity]}`}
                  hoverProps={{
                    onMouseEnter: () => setHoveredId(incident.id),
                    onMouseLeave: () => setHoveredId(null),
                  }}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <SeverityChip severity={incident.severity} />
                    <span className="text-caption font-medium text-content-primary">
                      {farm.name}
                    </span>
                    {!incident.resolved && (
                      <span className="chip bg-status-warn/15 text-status-warn-ink">
                        {t('incidents.open')}
                      </span>
                    )}
                    <span className="ltr-nums ms-auto text-micro text-content-muted">
                      {formatDateTime(incident.reportedAt, locale)}
                    </span>
                  </span>
                  {/* `title` is the recourse the U7 gate requires of anything
                      that clips. */}
                  <span
                    title={incident.description}
                    className="mt-1 block truncate text-caption text-content-secondary"
                  >
                    {incident.description}
                  </span>
                  <span className="muted mt-1 flex items-center gap-1">
                    {incident.reporterName} · {t(`incidentSource.${incident.source}`)}
                  </span>
                </ListTile>
              </li>
            ))}
          </ul>
        </div>
      )}
      <LoadMore shown={page.shown} total={page.total} onMore={page.more} />
      </>
      )}
    </MapPanel>
  )
}

const TABLE_ROW_HEIGHT = 56

/** ★★ Y4 — the incidents, as columns. Same grid system as the other rosters. */
function IncidentsTableHead() {
  const { t } = useTranslation()
  return (
    <div className="roster roster-incidents">
      <div
        className="roster-row rounded-t-card border-b border-edge-subtle
                   bg-surface-overlay/95 px-4 py-1.5 backdrop-blur"
      >
        <RosterHead label={t('missions.farm')} />
        <RosterHead label={t('incidents.reportedAt')} tier="md" />
        <RosterHead label={t('incidents.filterSeverity')} tier="lg" />
        <RosterHead label={t('incidents.reportedBy')} tier="xl" />
        <RosterHead label={t('farms.colStatus')} tier="md" />
      </div>
    </div>
  )
}

function IncidentsTable({
  views,
  onOpen,
}: {
  views: IncidentView[]
  onOpen: (incidentId: string) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { listRef, virtualizer, margin } = useWindowTable(
    views.length,
    () => TABLE_ROW_HEIGHT,
  )

  return (
    <div className="roster roster-incidents card lg:rounded-t-none">
      <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const { incident, farm } = views[item.index]
          return (
            <button
              key={incident.id}
              type="button"
              onClick={() => onOpen(incident.id)}
              style={{
                position: 'absolute',
                insetInlineStart: 0,
                insetInlineEnd: 0,
                top: 0,
                height: item.size,
                transform: `translateY(${item.start - margin}px)`,
              }}
              className={`roster-row border-b border-s-4 border-edge-subtle/50 px-4 text-start
                         transition-colors duration-fast hover:bg-surface-high/60 ${
                           SEVERITY_EDGE[incident.severity]
                         }`}
            >
              {/* 1 — the farm and what happened, with the dropped columns merged
                  under it. */}
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar photo={farm.photo} name={farm.name} size="xs" shape="square" />
                <span className="min-w-0">
                  <span className="block truncate text-caption font-medium text-content-primary">
                    {farm.name}
                  </span>
                  <span className="muted block truncate" title={incident.description}>
                    {incident.description}
                    <span data-merge="xl" style={{ ['--col-display' as string]: 'inline' }}>
                      {' '}· {incident.reporterName}
                    </span>
                  </span>
                </span>
              </span>

              {/* 2 — when */}
              <span data-col="md" className="truncate text-caption text-content-secondary">
                <span className="ltr-nums">{formatDateTime(incident.reportedAt, locale)}</span>
              </span>

              {/* 3 — severity */}
              <span
                data-col="lg"
                style={{ ['--col-display' as string]: 'flex' }}
                className="flex min-w-0 items-center"
              >
                <SeverityChip severity={incident.severity} />
              </span>

              {/* 4 — who reported it */}
              <span data-col="xl" className="truncate text-caption text-content-secondary">
                {incident.reporterName}
              </span>

              {/* 5 — open or closed */}
              <span
                data-col="md"
                style={{ ['--col-display' as string]: 'flex' }}
                className="flex min-w-0 items-center"
              >
                {incident.resolved ? (
                  <span className="chip bg-status-success/15 text-status-success-ink">
                    {t('incidents.resolved')}
                  </span>
                ) : (
                  <span className="chip bg-status-warn/15 text-status-warn-ink">
                    {t('incidents.open')}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
