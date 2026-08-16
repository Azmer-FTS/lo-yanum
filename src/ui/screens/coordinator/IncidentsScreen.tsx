import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DAY, formatDateTime, getVisibleFarms, getVisibleIncidentViews } from '@core/index'
import type { IncidentSeverity } from '@core/index'

import { SEVERITY_ACCENT, SeverityChip } from '../../components/badges'
import {
  EmptyState,
  FilterBar,
  FilterPill,
  PageHeader,
  RowLink,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

const ALL = 'all'
const SEVERITIES: IncidentSeverity[] = ['urgent', 'suspicious', 'observation']

export function IncidentsScreen() {
  const { t } = useTranslation()
  const locale = useLocale()

  const views = useCoreValue(getVisibleIncidentViews)
  const farms = useCoreValue(getVisibleFarms)

  const [farmId, setFarmId] = useState(ALL)
  const [severity, setSeverity] = useState(ALL)
  const [since, setSince] = useState(ALL)
  const [openOnly, setOpenOnly] = useState(false)

  const filtered = useMemo(() => {
    const cutoff =
      since === 'week'
        ? Date.now() - 7 * DAY
        : since === 'month'
          ? Date.now() - 30 * DAY
          : null

    return views.filter(({ incident }) => {
      if (farmId !== ALL && incident.farmId !== farmId) return false
      if (severity !== ALL && incident.severity !== severity) return false
      if (openOnly && incident.resolved) return false
      if (cutoff && new Date(incident.reportedAt).getTime() < cutoff) return false
      return true
    })
  }, [views, farmId, severity, since, openOnly])

  return (
    <>
      <PageHeader
        title={t('incidents.title')}
        subtitle={t('incidents.count', { count: filtered.length })}
      />

      <FilterBar>
        {SEVERITIES.map((sev) => (
          <FilterPill
            key={sev}
            active={severity === sev}
            onClick={() => setSeverity(severity === sev ? ALL : sev)}
            count={views.filter((v) => v.incident.severity === sev).length}
          >
            {t(`severity.${sev}`)}
          </FilterPill>
        ))}
        <span className="h-5 w-px shrink-0 bg-edge-strong" />
        <FilterPill active={openOnly} onClick={() => setOpenOnly(!openOnly)}>
          {t('incidents.openOnly')}
        </FilterPill>
        <span className="h-5 w-px shrink-0 bg-edge-strong" />
        {(['week', 'month'] as const).map((w) => (
          <FilterPill
            key={w}
            active={since === w}
            onClick={() => setSince(since === w ? ALL : w)}
          >
            {t(w === 'week' ? 'incidents.dateWeek' : 'incidents.dateMonth')}
          </FilterPill>
        ))}
        <span className="h-5 w-px shrink-0 bg-edge-strong" />
        {farms.map((f) => (
          <FilterPill
            key={f.id}
            active={farmId === f.id}
            onClick={() => setFarmId(farmId === f.id ? ALL : f.id)}
          >
            {f.name}
          </FilterPill>
        ))}
      </FilterBar>

      {filtered.length === 0 ? (
        <EmptyState icon="alert" title={t('incidents.empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map(({ incident, farm }) => (
            <li
              key={incident.id}
              className={`card border-s-4 p-1.5 ${SEVERITY_ACCENT[incident.severity]}`}
            >
              <RowLink to={`/coordinator/incidents/${incident.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityChip severity={incident.severity} />
                  <span className="text-caption font-medium">{farm.name}</span>
                  <span
                    className={`chip ${
                      incident.resolved
                        ? 'bg-content-muted/15 text-content-muted'
                        : 'bg-status-warn/15 text-status-warn'
                    }`}
                  >
                    {t(incident.resolved ? 'incidents.resolved' : 'incidents.open')}
                  </span>
                  <span className="ltr-nums ms-auto text-micro text-content-muted">
                    {formatDateTime(incident.reportedAt, locale)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-caption text-content-secondary">
                  {incident.description}
                </p>
                <p className="muted mt-1">
                  {t('incidents.reportedBy')}: {incident.reporterName} ·{' '}
                  {t(`incidentSource.${incident.source}`)}
                  {incident.entries.length > 0 &&
                    ` · ${t('incidents.thread')}: ${incident.entries.length}`}
                </p>
              </RowLink>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
