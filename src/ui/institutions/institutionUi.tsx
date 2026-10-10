import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { INSTITUTION_ENGAGEMENTS, isInstitutionToConfirm, updateInstitution } from '@core/index'
import type { Institution, InstitutionEngagement } from '@core/index'

import { Icon } from '../components/Icon'

/**
 * ★★ AX1 — L'INSTITUTION, UNE SEULE FOIS : son statut d'engagement et sa
 * fiche éditable vivaient dans `CoverageScreen` (AU/AV). Elles servent
 * désormais deux écrans — מוסדות (l'étape 1 du métier) et מפת כיסוי
 * (l'appariement) — et ne doivent pas diverger.
 */
export const ENGAGEMENT_ON: Record<InstitutionEngagement, string> = {
  not_contacted: 'border-status-info bg-status-info/15 text-status-info-ink',
  contacted: 'border-status-warn bg-status-warn/15 text-status-warn-ink',
  interested: 'border-accent bg-accent/15 text-accent-ink',
  signed: 'border-status-violet bg-status-violet/15 text-status-violet-ink',
  not_relevant: 'border-edge-strong bg-surface-high text-content-primary',
}

export function EngagementSegments({ value, onChange, testId }: { value: InstitutionEngagement; onChange: (e: InstitutionEngagement) => void; testId: string }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('institutions.engagementLabel')} data-testid={testId} className="flex flex-nowrap gap-1">
      {INSTITUTION_ENGAGEMENTS.map((s) => {
        const on = s === value
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={t(`institutions.engagement.${s}`)}
            title={t(`institutions.engagement.${s}`)}
            data-testid={`${testId}-${s}`}
            onClick={() => onChange(s)}
            className={`flex min-h-[2.75rem] flex-auto items-center justify-center whitespace-nowrap rounded-field border px-1.5 text-caption font-semibold transition-colors duration-fast ${
              on ? ENGAGEMENT_ON[s] : 'border-edge-subtle text-content-secondary hover:bg-surface-high'
            }`}
          >
            {t(`institutions.engagementShort.${s}`)}
          </button>
        )
      })}
    </div>
  )
}

/** Statut d'engagement, contact, téléphone, note : éditables sur place. */
export function InstitutionEditor({ inst }: { inst: Institution }) {
  const { t } = useTranslation()
  const [contact, setContact] = useState(inst.contactName)
  const [phone, setPhone] = useState(inst.contactPhone)
  const [notes, setNotes] = useState(inst.notes)
  useEffect(() => {
    setContact(inst.contactName)
    setPhone(inst.contactPhone)
    setNotes(inst.notes)
  }, [inst.id, inst.contactName, inst.contactPhone, inst.notes])
  return (
    <div className="flex flex-col gap-3" data-testid="institution-editor">
      <p className="muted text-caption">
        {[inst.locality, t(`institutions.kind.${inst.kind}`), t(`institutions.audience.${inst.audience}`), inst.network].filter(Boolean).join(' · ')}
      </p>
      {inst.positionUncertain && (
        <p className="rounded-field bg-status-warn/15 px-3 py-2 text-caption font-semibold text-status-warn-ink" data-testid="institution-uncertain">
          {t('institutions.uncertainLong')}
        </p>
      )}
      {isInstitutionToConfirm(inst) && (
        <div className="flex flex-wrap items-center gap-2 rounded-field bg-status-warn/15 px-3 py-2" data-testid="institution-to-confirm">
          <p className="min-w-0 flex-1 text-caption font-semibold text-status-warn-ink">
            {t('institutions.toConfirmLong', { status: t(`institutions.engagement.${inst.engagement}`) })}
          </p>
          <button type="button" className="btn-primary min-h-11" onClick={() => updateInstitution(inst.id, { engagementConfirmed: true })} data-testid="institution-confirm">
            <Icon name="check" size={16} />
            {t('institutions.confirm')}
          </button>
        </div>
      )}
      {/* ★★ AV1 — CORRIGER = CONFIRMER : choisir un statut, c'est le dire. */}
      <EngagementSegments value={inst.engagement} onChange={(e) => updateInstitution(inst.id, { engagement: e, engagementConfirmed: true })} testId="institution-engagement" />
      {(inst.metOn || inst.students !== null || inst.positionSource) && (
        <dl className="grid gap-1 text-caption" data-testid="institution-facts">
          {inst.metOn && (
            <div className="flex gap-2"><dt className="text-content-muted">{t('institutions.metOn')}</dt><dd className="ltr-nums font-semibold text-content-primary">{inst.metOn.split('-').reverse().join('.')}</dd></div>
          )}
          {inst.students !== null && (
            <div className="flex gap-2"><dt className="text-content-muted">{t('institutions.students')}</dt><dd className="ltr-nums font-semibold text-content-primary">{inst.students}</dd></div>
          )}
          {inst.positionSource && (
            <div className="flex gap-2"><dt className="shrink-0 text-content-muted">{t('institutions.positionSource')}</dt><dd className="text-content-secondary">{inst.positionSource}</dd></div>
          )}
        </dl>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-content-secondary">{t('institutions.contactName')}</span>
          <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} onBlur={() => contact !== inst.contactName && updateInstitution(inst.id, { contactName: contact.trim() })} data-testid="institution-contact" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-content-secondary">{t('institutions.contactPhone')}</span>
          <input className="input ltr-nums" inputMode="tel" dir="ltr" placeholder="05X-XXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => phone !== inst.contactPhone && updateInstitution(inst.id, { contactPhone: phone.trim() })} data-testid="institution-phone" />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-caption font-semibold text-content-secondary">{t('institutions.notes')}</span>
        <textarea className="input min-h-[3.5rem]" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== inst.notes && updateInstitution(inst.id, { notes })} />
      </label>
      {inst.contactPhone && (
        <a href={`tel:${inst.contactPhone.replace(/[^\d+]/g, '')}`} className="btn-secondary self-start">
          <Icon name="phone" size={16} />
          {t('institutions.call')}
        </a>
      )}
    </div>
  )
}

