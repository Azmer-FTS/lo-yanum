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
import { Timeline } from '../../components/Timeline'
import type { TimelineEntry } from '../../components/Timeline'
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

  /**
   * The whole life of the incident as one ordered thread. The closing step is
   * always rendered — pending when the incident is still open — because "not
   * yet resolved" is the single most important fact on this screen and an
   * absent row states it far less clearly than an empty one.
   */
  const timeline: TimelineEntry[] = [
    {
      id: 'reported',
      label: t('timeline.reported'),
      at: incident.reportedAt,
      author: `${incident.reporterName} · ${t(`incidentSource.${incident.source}`)}`,
      detail: incident.description,
      icon: 'alert',
      state: 'done',
      tone: incident.severity === 'urgent' ? 'danger' : 'warn',
    },
    ...incident.entries.map((e) => ({
      id: e.id,
      label: e.text,
      at: e.at,
      author: e.author,
      icon: 'message' as const,
      state: 'done' as const,
      tone: 'default' as const,
    })),
    {
      id: 'resolution',
      label: t(incident.resolved ? 'timeline.resolved' : 'timeline.open'),
      // No `resolvedAt` in the model — the last follow-up entry is the closest
      // honest stand-in, and an unresolved incident correctly shows "—".
      at: incident.resolved
        ? (incident.entries.at(-1)?.at ?? incident.reportedAt)
        : null,
      icon: incident.resolved ? 'check' : 'clock',
      state: incident.resolved ? 'done' : 'current',
      tone: incident.resolved ? 'success' : 'warn',
    },
  ]

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

          {/* D6.1 — report → actions → resolution, as one continuous thread.
              The follow-up entries are not a separate list from the report and
              the closure: they are the middle of the same story, and rendering
              them as three blocks was what made the screen hard to read. */}
          <Section title={t('incidents.thread')}>
            <Timeline withDate entries={timeline} />

            <div className="mt-4 flex flex-col gap-2 border-t border-edge-subtle pt-3 sm:flex-row">
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
                className="h-72 w-full lg:h-[24rem]"
                cooperative
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
                  className="inline-flex items-center gap-1 text-micro font-medium text-accent-ink hover:underline"
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
