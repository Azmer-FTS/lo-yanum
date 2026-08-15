import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  EMERGENCY_NUMBERS,
  addIncident,
  formatCoords,
  telHref,
} from '@core/index'
import type { IncidentSeverity, IncidentSource, LatLng } from '@core/index'

import { Icon } from './Icon'
import { Callout, EmptyState, Section } from './primitives'

const SEVERITIES: IncidentSeverity[] = ['observation', 'suspicious', 'urgent']

const SEVERITY_BUTTON: Record<IncidentSeverity, string> = {
  observation: 'border-slate-300 bg-white text-night-950',
  suspicious: 'border-amber-300 bg-amber-50 text-amber-900',
  urgent: 'border-rose-300 bg-rose-50 text-rose-900',
}

const SEVERITY_ACTIVE: Record<IncidentSeverity, string> = {
  observation: 'border-slate-500 bg-slate-100 ring-1 ring-slate-400',
  suspicious: 'border-amber-500 bg-amber-100 ring-1 ring-amber-500',
  urgent: 'border-rose-500 bg-rose-100 ring-1 ring-rose-500',
}

/** Emergency numbers — shown the moment "urgent" is selected. */
function EmergencyPanel() {
  const { t } = useTranslation()

  return (
    <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-rose-900">
        <Icon name="phone" size={17} />
        {t('report.emergencyTitle')}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {EMERGENCY_NUMBERS.map((n) => (
          <a
            key={n.key}
            href={telHref(n.number)}
            className="flex flex-col items-center gap-0.5 rounded-xl bg-white px-3 py-3 text-center shadow-card"
          >
            <span className="ltr-nums text-lg font-bold text-rose-700">
              {n.number}
            </span>
            <span className="text-xs text-night-950/60">
              {t(`emergency.${n.key}`)}
            </span>
          </a>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-rose-900/70">{t('report.emergencyNote')}</p>
    </div>
  )
}

export interface ReportContext {
  farmId: string
  missionId: string | null
  source: IncidentSource
  reporterId: string | null
  reporterName: string
  /** Capture the device position automatically (volunteers in the field). */
  capturePosition: boolean
  /** Fallback when geolocation is denied or unavailable. */
  fallbackPosition: LatLng | null
  /** Show the optional photo placeholder (Lot 1 will make it real). */
  showPhoto?: boolean
}

export function IncidentReportForm({ context }: { context: ReportContext }) {
  const { t } = useTranslation()
  const [severity, setSeverity] = useState<IncidentSeverity>('suspicious')
  const [description, setDescription] = useState('')
  const [position, setPosition] = useState<LatLng | null>(
    context.capturePosition ? null : context.fallbackPosition,
  )
  const [locating, setLocating] = useState(context.capturePosition)
  const [sentId, setSentId] = useState<string | null>(null)

  useEffect(() => {
    if (!context.capturePosition) return
    if (!('geolocation' in navigator)) {
      setPosition(context.fallbackPosition)
      setLocating(false)
      return
    }

    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (cancelled) return
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude })
        setLocating(false)
      },
      () => {
        if (cancelled) return
        // Permission denied or no fix (common in the Negev) — fall back to the
        // anchor point, which is where the group physically is.
        setPosition(context.fallbackPosition)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
    return () => {
      cancelled = true
    }
  }, [context.capturePosition, context.fallbackPosition])

  const submit = () => {
    const text = description.trim()
    if (!text) return
    const incident = addIncident({
      farmId: context.farmId,
      missionId: context.missionId,
      source: context.source,
      reporterId: context.reporterId,
      reporterName: context.reporterName,
      severity,
      description: text,
      position,
    })
    setSentId(incident.id)
  }

  if (sentId) {
    return (
      <EmptyState
        icon="check"
        title={t('report.success')}
        action={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSentId(null)
              setDescription('')
              setSeverity('suspicious')
            }}
          >
            {t('report.another')}
          </button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {severity === 'urgent' && <EmergencyPanel />}

      <Section title={t('report.severity')}>
        <div className="flex flex-col gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              aria-pressed={severity === s}
              className={`rounded-xl border px-4 py-3 text-start transition-all ${
                severity === s ? SEVERITY_ACTIVE[s] : SEVERITY_BUTTON[s]
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                {s === 'urgent' && <Icon name="alert" size={16} />}
                {t(`severity.${s}`)}
              </span>
              <span className="mt-0.5 block text-xs opacity-70">
                {t(
                  `report.severityHelp${s.charAt(0).toUpperCase()}${s.slice(1)}`,
                )}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('report.description')}>
        <textarea
          className="input"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('report.descriptionPlaceholder')}
        />
      </Section>

      {context.showPhoto && (
        <Section title={t('report.photo')}>
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-sand-300 px-4 py-5 text-night-950/40">
            <Icon name="camera" size={22} />
            <span className="text-sm">{t('report.photoPlaceholder')}</span>
          </div>
        </Section>
      )}

      <Section title={t('report.position')}>
        {locating ? (
          <p className="muted">{t('report.positionAuto')}…</p>
        ) : position ? (
          <p className="flex items-center gap-2 text-sm">
            <Icon name="pin" size={16} />
            <span className="ltr-nums">{formatCoords(position)}</span>
          </p>
        ) : (
          <p className="muted">{t('report.positionUnavailable')}</p>
        )}
      </Section>

      {severity === 'urgent' && (
        <Callout tone="danger" title={t('report.emergencyTitle')}>
          {t('report.emergencyNote')}
        </Callout>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={description.trim().length === 0}
        className="btn-primary btn-big"
      >
        {t('report.submit')}
      </button>
    </div>
  )
}
