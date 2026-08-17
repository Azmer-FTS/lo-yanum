import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { DAY, formatDateTime, getVisibleIncidentViews } from '@core/index'
import type { IncidentSeverity } from '@core/index'

import { ChevronForward } from '../../components/Icon'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { MarkerSwatch, SeverityChip, readToken } from '../../components/badges'
import {
  EmptyState,
  FilterPill,
  FilterRow,
  LoadMore,
} from '../../components/primitives'
import { useProgressive } from '../../hooks/useProgressive'
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
      <header className="mb-4">
        <h1 className="text-title text-content-primary">
          {t('incidents.title')}
        </h1>
        <p className="muted mt-1">
          {t('incidents.count', { count: filtered.length })}
        </p>
      </header>

      {/* D7.3 — one row, every pill counted.
          The twelve per-farm pills are gone: they were longer than the list
          they filtered, and clicking a marker on the map is a faster way to
          narrow to one farm than reading twelve names. */}
      <FilterRow
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

      {filtered.length === 0 ? (
        <EmptyState icon="alert" title={t('incidents.empty')} />
      ) : (
        <ul className="stagger flex flex-col gap-2">
          {page.visible.map(({ incident, farm }) => {
            const active = incident.id === hoveredId
            return (
              <li key={incident.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHoveredId(incident.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(incident.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => navigate(`/coordinator/incidents/${incident.id}`)}
                  /* F5.3 — the row floats: card surface, soft drop, and the
                     severity bar on top of it rather than instead of it. */
                  className={`tile-interactive w-full border-s-4 px-3 py-2.5 text-start ${
                    SEVERITY_EDGE[incident.severity]
                  } ${active ? 'border-accent/60 bg-accent/10' : ''}`}
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
                  <span className="mt-1 line-clamp-2 block text-caption text-content-secondary">
                    {incident.description}
                  </span>
                  <span className="muted mt-1 flex items-center gap-1">
                    {incident.reporterName} ·{' '}
                    {t(`incidentSource.${incident.source}`)}
                    <ChevronForward size={13} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <LoadMore shown={page.shown} total={page.total} onMore={page.more} />
    </MapPanel>
  )
}
