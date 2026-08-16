import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  DAY,
  formatDateTime,
  getVisibleFarms,
  getVisibleIncidentViews,
} from '@core/index'
import type { IncidentSeverity } from '@core/index'

import { ChevronForward } from '../../components/Icon'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { SeverityChip, readToken } from '../../components/badges'
import { EmptyState, FilterPill } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

const ALL = 'all'
const SEVERITIES: IncidentSeverity[] = ['urgent', 'suspicious', 'observation']

const SEVERITY_TOKEN: Record<IncidentSeverity, string> = {
  observation: '--status-success',
  suspicious: '--status-warn',
  urgent: '--status-danger',
}

const SEVERITY_EDGE: Record<IncidentSeverity, string> = {
  observation: 'border-s-status-success',
  suspicious: 'border-s-status-warn',
  urgent: 'border-s-status-danger',
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
  const farms = useCoreValue(getVisibleFarms)

  const [farmId, setFarmId] = useState(ALL)
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
      if (farmId !== ALL && incident.farmId !== farmId) return false
      if (severity !== null && incident.severity !== severity) return false
      if (openOnly && incident.resolved) return false
      if (cutoff && new Date(incident.reportedAt).getTime() < cutoff) return false
      return true
    })
  }, [views, farmId, severity, since, openOnly])

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
              <span
                className="inline-block h-2.5 w-2.5 rounded-pill"
                style={{ backgroundColor: readToken(SEVERITY_TOKEN[s]) }}
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

      <div className="mb-4 flex flex-wrap gap-1.5">
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
        <FilterPill active={openOnly} onClick={() => setOpenOnly(!openOnly)}>
          {t('incidents.openOnly')}
        </FilterPill>
        {(['week', 'month'] as const).map((w) => (
          <FilterPill
            key={w}
            active={since === w}
            onClick={() => setSince(since === w ? ALL : w)}
          >
            {t(w === 'week' ? 'incidents.dateWeek' : 'incidents.dateMonth')}
          </FilterPill>
        ))}
        {farms.map((f) => (
          <FilterPill
            key={f.id}
            active={farmId === f.id}
            onClick={() => setFarmId(farmId === f.id ? ALL : f.id)}
          >
            {f.name}
          </FilterPill>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="alert" title={t('incidents.empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map(({ incident, farm }) => {
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
                  className={`w-full border-s-4 px-3 py-2.5 text-start ${SEVERITY_EDGE[incident.severity]}
                              rounded-md border border-y border-e transition-all duration-fast ease-out ${
                                active
                                  ? 'border-accent/60 bg-accent/10'
                                  : 'border-edge-subtle hover:bg-surface-high'
                              }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <SeverityChip severity={incident.severity} />
                    <span className="text-caption font-medium text-content-primary">
                      {farm.name}
                    </span>
                    {!incident.resolved && (
                      <span className="chip bg-status-warn/15 text-status-warn">
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
    </MapPanel>
  )
}
