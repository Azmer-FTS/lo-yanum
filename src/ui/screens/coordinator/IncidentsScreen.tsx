import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DAY, formatDateTime, getVisibleFarms, getVisibleIncidentViews } from '@core/index'
import type { IncidentSeverity } from '@core/index'

import { SEVERITY_ACCENT, SeverityChip } from '../../components/badges'
import {
  EmptyState,
  FilterSelect,
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

      <div className="card card-pad mb-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          label={t('incidents.filterFarm')}
          value={farmId}
          onChange={setFarmId}
          options={[
            { value: ALL, label: t('common.all') },
            ...farms.map((f) => ({ value: f.id, label: f.name })),
          ]}
        />
        <FilterSelect
          label={t('incidents.filterSeverity')}
          value={severity}
          onChange={setSeverity}
          options={[
            { value: ALL, label: t('common.all') },
            ...SEVERITIES.map((s) => ({
              value: s,
              label: t(`severity.${s}`),
            })),
          ]}
        />
        <FilterSelect
          label={t('incidents.filterDate')}
          value={since}
          onChange={setSince}
          options={[
            { value: ALL, label: t('incidents.dateAll') },
            { value: 'week', label: t('incidents.dateWeek') },
            { value: 'month', label: t('incidents.dateMonth') },
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="h-4 w-4 rounded border-sand-400 text-night-800 focus:ring-night-500"
          />
          {t('incidents.openOnly')}
        </label>
      </div>

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
                  <span className="text-sm font-medium">{farm.name}</span>
                  <span
                    className={`chip ${
                      incident.resolved
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {t(incident.resolved ? 'incidents.resolved' : 'incidents.open')}
                  </span>
                  <span className="ltr-nums ms-auto text-xs text-night-950/40">
                    {formatDateTime(incident.reportedAt, locale)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-night-950/75">
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
