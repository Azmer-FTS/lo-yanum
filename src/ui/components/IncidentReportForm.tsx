import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EMERGENCY_NUMBERS, addIncident, formatCoords, telHref } from '@core/index'
import type { IncidentSeverity, IncidentSource, LatLng } from '@core/index'

import { Icon } from './Icon'
import type { IconName } from './Icon'
import { Section } from './primitives'

/**
 * R7 — EVENT REPORTING, REBUILT AS AN ALERT FLOW.
 *
 * Designed for one hand, in the dark, at 2 AM, by someone whose pulse is up:
 *
 *   Step 1  three full-width severity buttons — one tap, no scrolling, no
 *           reading. Colour and icon carry the meaning.
 *   Step 2  a large description box and the auto-captured GPS chip.
 *   After   for an urgent report, a full-screen confirmation whose primary
 *           actions are giant CALL buttons. The report documents the event;
 *           the phone call is what actually helps.
 */

type Step = 'severity' | 'details' | 'sent'

const SEVERITIES: IncidentSeverity[] = ['observation', 'suspicious', 'urgent']

const SEVERITY_ICON: Record<IncidentSeverity, IconName> = {
  observation: 'eye',
  suspicious: 'alert',
  urgent: 'alert',
}

/**
 * Full-bleed tints: unmistakable at a glance, no colour-matching needed.
 *
 * F4 — only `urgent` reaches for `critical`, the charter orange. The other two
 * keep the ordinary semantic hues, and that gap IS the design: three buttons in
 * three shades of alarm would give the thumb nothing to aim at in the dark.
 */
const SEVERITY_BUTTON: Record<IncidentSeverity, string> = {
  observation:
    'bg-status-success/15 text-status-success-ink border-status-success/50 hover:bg-status-success/25',
  suspicious:
    'bg-status-warn/15 text-status-warn-ink border-status-warn/50 hover:bg-status-warn/25',
  urgent:
    'bg-critical/20 text-status-danger-ink border-critical/60 hover:bg-critical/30',
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
  showPhoto?: boolean
  /** Farmer's number, offered on the urgent confirmation screen. */
  farmerName?: string
  farmerPhone?: string
  coordinatorName: string
  coordinatorPhone: string
}

export function IncidentReportForm({ context }: { context: ReportContext }) {
  const { t } = useTranslation()

  const [step, setStep] = useState<Step>('severity')
  const [severity, setSeverity] = useState<IncidentSeverity>('suspicious')
  const [description, setDescription] = useState('')
  const [position, setPosition] = useState<LatLng | null>(
    context.capturePosition ? null : context.fallbackPosition,
  )
  const [locating, setLocating] = useState(context.capturePosition)

  // Start locating as soon as the form opens, not on submit — by the time the
  // volunteer has finished typing, the fix is usually already in.
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
        // Denied, or no fix — common in the Negev. Fall back to the anchor
        // point, which is where the group physically is.
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
    addIncident({
      farmId: context.farmId,
      missionId: context.missionId,
      source: context.source,
      reporterId: context.reporterId,
      reporterName: context.reporterName,
      severity,
      description: text,
      position,
    })
    setStep('sent')
  }

  const restart = () => {
    setStep('severity')
    setDescription('')
    setSeverity('suspicious')
  }

  // --- Sent -----------------------------------------------------------------

  if (step === 'sent') {
    if (severity !== 'urgent') {
      return (
        <div className="flex animate-fade-in flex-col items-center gap-3 rounded-card bg-status-success/10 px-6 py-12 text-center">
          <span className="text-status-success-ink">
            <Icon name="check" size={38} />
          </span>
          <p className="text-heading text-content-primary">
            {t('report.success')}
          </p>
          <button type="button" className="btn-secondary mt-2" onClick={restart}>
            {t('report.another')}
          </button>
        </div>
      )
    }

    // Urgent: calling is the point. Nothing competes with these buttons.
    const police = EMERGENCY_NUMBERS.find((n) => n.key === 'police')
    return (
      <div className="animate-fade-in">
        <div className="rounded-card bg-critical/10 p-5 text-center">
          <span className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-pill bg-critical/20 text-status-danger-ink">
            <Icon name="check" size={30} />
          </span>
          <p className="text-title text-content-primary">
            {t('report.urgentDoneTitle')}
          </p>
          <p className="muted mx-auto mt-2 max-w-sm">
            {t('report.urgentDoneBody')}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {police && (
            <a
              href={telHref(police.number)}
              // F4 — the emergency call. The one solid orange on this screen,
              // and the reason the confirmation panel around it stays a tint.
              className="flex items-center justify-center gap-3 rounded-field bg-critical px-5 py-5
                         text-heading font-bold text-content-on-accent shadow-critical
                         transition-transform duration-fast active:scale-[0.98]"
            >
              <Icon name="phone" size={24} />
              {t('report.callPolice')}
              <span className="ltr-nums">{police.number}</span>
            </a>
          )}

          {context.farmerPhone && (
            <a
              href={telHref(context.farmerPhone)}
              className="flex items-center justify-center gap-3 rounded-field bg-accent px-5 py-5
                         text-heading font-bold text-content-on-accent shadow-accent
                         transition-transform duration-fast active:scale-[0.98]"
            >
              <Icon name="phone" size={24} />
              {t('report.callFarmer')}
            </a>
          )}

          <a
            href={telHref(context.coordinatorPhone)}
            className="flex items-center justify-center gap-3 rounded-field border border-edge-strong
                       bg-surface-high px-5 py-5 text-heading font-bold text-content-primary
                       transition-transform duration-fast active:scale-[0.98]"
          >
            <Icon name="phone" size={24} />
            {t('report.callCoordinator')}
          </a>

          <button type="button" className="btn-ghost mt-1" onClick={restart}>
            {t('report.another')}
          </button>
        </div>
      </div>
    )
  }

  // --- Step 1: severity -----------------------------------------------------

  if (step === 'severity') {
    return (
      <div className="animate-fade-in">
        <h2 className="mb-4 text-heading text-content-primary">
          {t('report.stepSeverity')}
        </h2>
        <div className="flex flex-col gap-3">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSeverity(s)
                setStep('details')
              }}
              className={`flex w-full items-center gap-4 rounded-card border-2 px-5 py-6 text-start
                          transition-all duration-fast ease-out active:scale-[0.99] ${SEVERITY_BUTTON[s]}`}
            >
              <Icon name={SEVERITY_ICON[s]} size={30} />
              <span className="min-w-0">
                <span className="block text-title">{t(`severity.${s}`)}</span>
                <span className="mt-0.5 block text-caption opacity-80">
                  {t(
                    `report.severityHelp${s.charAt(0).toUpperCase()}${s.slice(1)}`,
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // --- Step 2: details ------------------------------------------------------

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span
          className={`chip border px-3 py-1.5 text-caption ${SEVERITY_BUTTON[severity]}`}
        >
          <Icon name={SEVERITY_ICON[severity]} size={14} />
          {t(`severity.${severity}`)}
        </span>
        <button
          type="button"
          onClick={() => setStep('severity')}
          className="btn-ghost py-1.5"
        >
          {t('report.changeSeverity')}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <Section title={t('report.description')}
          collapseKey="report-description">
          <textarea
            className="input min-h-40 text-body"
            rows={6}
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('report.descriptionPlaceholder')}
          />
          <p className="muted mt-1.5">{t('report.dictateHint')}</p>
        </Section>

        {context.showPhoto && (
          <Section title={t('report.photo')}
          collapseKey="report-photo">
            <div className="flex items-center gap-3 rounded-field border border-dashed border-edge-strong px-4 py-5 text-content-muted">
              <Icon name="camera" size={22} />
              <span className="text-caption">{t('report.photoPlaceholder')}</span>
            </div>
          </Section>
        )}

        <div className="flex items-center gap-2 rounded-field bg-surface-raised px-3.5 py-3 shadow-card">
          <span className="text-accent-ink">
            <Icon name="pin" size={17} />
          </span>
          <span className="text-caption text-content-secondary">
            {locating ? (
              `${t('report.positionAuto')}…`
            ) : position ? (
              <span className="ltr-nums">{formatCoords(position)}</span>
            ) : (
              t('report.positionUnavailable')
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={description.trim().length === 0}
          className={`btn-big ${
            severity === 'urgent' ? 'btn-critical' : 'btn-primary'
          }`}
        >
          <Icon name="upload" size={19} />
          {t('report.submit')}
        </button>
      </div>
    </div>
  )
}
