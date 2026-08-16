import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import {
  COORDINATOR,
  addIncidentEntry,
  formatCoords,
  formatDateTime,
  getIncidentView,
  googleMapsPointUrl,
  setIncidentResolved,
} from '@core/index'

import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { SeverityChip, readToken } from '../../components/badges'
import {
  KeyValue,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

export function IncidentDetailScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { incidentId = '' } = useParams()
  const view = useCoreValue(() => getIncidentView(incidentId))
  const [entry, setEntry] = useState('')

  if (!view) return <Navigate to="/coordinator/incidents" replace />

  const { incident, farm } = view

  const submitEntry = () => {
    const text = entry.trim()
    if (!text) return
    addIncidentEntry(incident.id, COORDINATOR.name, text)
    setEntry('')
  }

  return (
    <>
      <Link
        to="/coordinator/incidents"
        className="mb-3 inline-flex items-center gap-1.5 text-caption text-content-muted hover:text-content-primary"
      >
        <Icon name="chevron" size={15} className="ltr:-scale-x-100" />
        {t('incidents.title')}
      </Link>

      <PageHeader
        title={farm.name}
        subtitle={formatDateTime(incident.reportedAt, locale)}
        actions={
          <div className="flex items-center gap-2">
            <SeverityChip severity={incident.severity} />
            <button
              type="button"
              className="btn-secondary py-2 text-micro"
              onClick={() => setIncidentResolved(incident.id, !incident.resolved)}
            >
              {t(incident.resolved ? 'incidents.reopen' : 'incidents.resolve')}
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Section title={t('report.description')}>
            <p className="whitespace-pre-line text-caption leading-relaxed text-content-secondary">
              {incident.description}
            </p>
            <dl className="mt-3 border-t border-edge-subtle pt-2">
              <KeyValue
                label={t('incidents.reportedBy')}
                value={`${incident.reporterName} · ${t(
                  `incidentSource.${incident.source}`,
                )}`}
              />
              <KeyValue
                label={t('incidents.reportedAt')}
                value={formatDateTime(incident.reportedAt, locale)}
                ltr
              />
              {incident.missionId && (
                <KeyValue
                  label={t('incidents.linkedMission')}
                  value={
                    <Link
                      to={`/coordinator/missions/${incident.missionId}`}
                      className="hover:underline"
                    >
                      {t('missions.openMission')}
                    </Link>
                  }
                />
              )}
            </dl>
          </Section>

          <Section title={t('incidents.thread')}>
            {incident.entries.length === 0 ? (
              <p className="muted">{t('incidents.noEntries')}</p>
            ) : (
              <ol className="flex flex-col">
                {incident.entries.map((e) => (
                  <li key={e.id} className="flex gap-3 pb-4 last:pb-0">
                    <span className="mt-1 flex h-2.5 w-2.5 shrink-0 rounded-pill bg-accent" />
                    <div>
                      <p className="text-caption text-content-secondary">{e.text}</p>
                      <p className="ltr-nums muted mt-0.5">
                        {e.author} · {formatDateTime(e.at, locale)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-3 flex flex-col gap-2 border-t border-edge-subtle pt-3 sm:flex-row">
              <input
                type="text"
                className="input"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitEntry()
                }}
                placeholder={t('incidents.entryPlaceholder')}
              />
              <button
                type="button"
                className="btn-primary shrink-0"
                onClick={submitEntry}
                disabled={entry.trim().length === 0}
              >
                {t('incidents.addEntry')}
              </button>
            </div>
          </Section>
        </div>

        <Section title={t('incidents.position')}>
          {incident.position ? (
            <>
              <MapView
                ariaLabel={t('a11y.map')}
                className="h-52 w-full"
                interactive={false}
                center={incident.position}
                zoom={13}
                markers={[
                  {
                    id: incident.id,
                    position: incident.position,
                    color: readToken(
                      incident.severity === 'urgent'
                        ? '--status-danger'
                        : '--status-warn',
                    ),
                    title: farm.name,
                    emphasis: true,
                  },
                ]}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="ltr-nums muted">
                  {formatCoords(incident.position)}
                </span>
                <a
                  href={googleMapsPointUrl(incident.position)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-micro font-medium text-accent hover:underline"
                >
                  <Icon name="external" size={13} />
                  {t('common.openInMaps')}
                </a>
              </div>
            </>
          ) : (
            <p className="muted">{t('incidents.noPosition')}</p>
          )}
        </Section>
      </div>
    </>
  )
}
