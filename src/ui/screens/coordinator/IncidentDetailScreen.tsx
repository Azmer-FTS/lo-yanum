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
import { MapSplit } from '../../components/MapSplit'
import { MapView } from '../../components/MapView'
import { Timeline } from '../../components/Timeline'
import type { TimelineEntry } from '../../components/Timeline'
import { SeverityChip, readToken } from '../../components/badges'
import {
  KeyValue,
  LoadingState,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useHydrated } from '../../hooks/useDataState'
import { useLocale } from '../../hooks/useLocale'

export function IncidentDetailScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { incidentId = '' } = useParams()
  const view = useCoreValue(() => getIncidentView(incidentId))
  const [entry, setEntry] = useState('')

  // N1 (2026-09-02) — a missing record before the snapshot has arrived is
  // "not loaded yet", never "gone": redirecting here on a reload was how a
  // coordinator's own farm closed itself. See `useHydrated`.
  const hydrated = useHydrated()
  if (!view) return hydrated ? <Navigate to="/coordinator/incidents" replace /> : <LoadingState />

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

  /* P0bis.1 — an incident that HAS a position is a map-first screen like every
     other: the ground on the physical left, the thread on the right. One that
     does not keeps the plain reading — there is no map to put anywhere. */
  const mapBody = incident.position && (
    <>
      <MapView
        ariaLabel={t('a11y.map')}
        className="h-full w-full rounded-none"
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
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-between gap-2">
        <span className="ltr-nums pointer-events-auto rounded-card bg-surface-overlay/95 px-3 py-1.5 text-micro text-content-secondary shadow-card backdrop-blur">
          {formatCoords(incident.position)}
        </span>
        <a
          href={googleMapsPointUrl(incident.position)}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary pointer-events-auto min-h-11 shadow-card"
        >
          <Icon name="external" size={13} />
          {t('common.openInMaps')}
        </a>
      </div>
    </>
  )

  const content = (
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

      <div className="panel-scope flex flex-col gap-4">
        {/* P0bis.3a/b — WHAT HAPPENED IS THE HEADLINE, and the four facts
            about the report go BESIDE it rather than crammed under it in a
            key/value list the eye reads last. The report itself is set one
            size up: on this screen it is the content, not an attribute. */}
        <div className="pair-grid">
          <Section
            title={t('report.description')}
            collapseKey="incident-description"
            summary={incident.description}
          >
            <p className="whitespace-pre-line text-body leading-relaxed text-content-primary">
              {incident.description}
            </p>
          </Section>

          <Section
            title={t('common.details')}
            collapseKey="incident-details"
            summary={`${incident.reporterName} · ${formatDateTime(incident.reportedAt, locale)}`}
          >
            <dl>
              <KeyValue
                label={t('report.severity')}
                value={<SeverityChip severity={incident.severity} />}
              />
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
        </div>

          {/* D6.1 — report → actions → resolution, as one continuous thread.
              The follow-up entries are not a separate list from the report and
              the closure: they are the middle of the same story, and rendering
              them as three blocks was what made the screen hard to read. */}
          <Section
            title={t('incidents.thread')}
            collapseKey="incident-thread"
            summary={t('blocks.entries', { count: timeline.length })}
          >
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
        {!incident.position && (
          <Section title={t('incidents.position')}>
            <p className="muted">{t('incidents.noPosition')}</p>
          </Section>
        )}
      </div>
    </>
  )

  // The route is full-bleed (it usually carries a map), so the mapless
  // reading has to supply the padding the shell no longer does.
  if (!mapBody) {
    return (
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:pb-6">
        {content}
      </div>
    )
  }

  return (
    <MapSplit
      screenKey="incident-detail"
      ariaLabel={t('incidents.position')}
      breakpoint="xl"
      contentPercent={55}
      splitHeight="h-[40dvh]"
      map={() => mapBody}
    >
      {() => content}
    </MapSplit>
  )
}
