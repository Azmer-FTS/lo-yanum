import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDate, fromDayKey, iso, localDayKey } from '@core/index'
import type { Agreement, Farm } from '@core/index'

import { drawAgreementPages } from '../agreement/artzenu'
import { agreementPageInput } from '../agreement/input'
import { useLocale } from '../hooks/useLocale'
import { Icon } from './Icon'
import { Modal } from './primitives'
import { SignaturePad } from './SignaturePad'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF1.2 (2026-09-09) — ON NE FAIT PAS SIGNER UN DOCUMENT INVISIBLE.
 * ★★ AN5 (2026-09-16) — ET ON NE LE FAIT PAS SIGNER EN TROIS GESTES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AF1.2 : le document se lit AVANT de signer, et l'aperçu EST le document
 * (même fonction de dessin que le PDF).
 *
 * AN5, le PO : « ouvrir un bloc, choisir une date, saisir qui a signé, puis
 * seulement signer. Je veux l'inverse. » Désormais :
 *
 * 1. UN bouton de la fiche ouvre cette fenêtre, rien avant.
 * 2. La date du jour et le nom du signataire (l'agriculteur de la fiche) sont
 *    DÉJÀ inscrits en tête ; un toucher sur la valeur la rend modifiable sur
 *    place. Pas de champ à ouvrir avant de signer.
 * 3. La fenêtre prend toute la hauteur ; le document occupe ce qui reste
 *    entre l'en-tête et la zone d'encre, et la zone d'encre et les boutons ne
 *    quittent jamais l'écran.
 * 4. ⚠️ LE DOCUMENT EST LISIBLE À L'OUVERTURE. Mesuré avant : l'agriculteur
 *    voyait le logo dans un cadre de 34 % de la hauteur et devait faire défiler
 *    pour lire la première clause. L'aperçu est désormais la page SANS son
 *    papier vide (`drawAgreementPages(…, { preview: true })`), logo plafonné,
 *    marges resserrées, ajustée à la hauteur disponible.
 *
 * ⚠️ ET RIEN N'EST ÉCRIT ICI. La fenêtre rend l'encre, le nom et la date à
 *    l'appelant ; c'est lui qui enregistre.
 */
export interface SignMeta {
  signedBy: string
  signedAt: string
}

/** Une valeur affichée, qui devient un champ au toucher, à la même place. */
function InlineValue({
  label,
  value,
  display,
  type,
  onChange,
  testId,
}: {
  label: string
  value: string
  display: string
  type: 'text' | 'date'
  onChange: (next: string) => void
  testId: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const done = () => {
    setEditing(false)
    if (draft.trim() !== '' && draft !== value) onChange(draft)
    else setDraft(value)
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-micro font-semibold text-content-muted">{label}</span>
      {editing ? (
        <input
          autoFocus
          type={type}
          data-kind={type === 'date' ? 'date' : 'name'}
          dir={type === 'date' ? 'ltr' : undefined}
          className="input h-10 min-h-0 w-auto min-w-[9rem] py-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={done}
          onKeyDown={(e) => {
            if (e.key === 'Enter') done()
          }}
          data-testid={`${testId}-input`}
        />
      ) : (
        <button
          type="button"
          data-testid={testId}
          onClick={() => {
            setDraft(value)
            setEditing(true)
          }}
          className="flex min-h-[2.75rem] min-w-0 items-center gap-1.5 rounded-field px-2 text-caption font-semibold text-content-primary hover:bg-surface-high"
        >
          <span className={`truncate ${type === 'date' ? 'ltr-nums' : ''}`}>{display || '—'}</span>
          <Icon name="edit" size={13} />
        </button>
      )}
    </span>
  )
}

export function AgreementSignModal({
  farm,
  agreement,
  onCommit,
  onClose,
}: {
  farm: Farm
  agreement: Agreement
  /** L'encre retenue, et le nom et la date tels qu'ils sont à l'écran. */
  onCommit: (signature: string | null, meta: SignMeta) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [ink, setInk] = useState<string | null>(agreement.signature ?? null)
  const [meta, setMeta] = useState<SignMeta>(() => ({
    signedBy: (agreement.signedBy || farm.farmerName || farm.contacts.find((c) => c.isPrimary)?.name || '').trim(),
    signedAt: agreement.signedAt,
  }))
  const [preview, setPreview] = useState<string[] | null>(null)
  const [touched, setTouched] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    let alive = true
    const mine = ++seq.current
    void (async () => {
      /* ★ AH5 — TOUTES LES PAGES. ★ AN5.5 — sans leur papier vide. */
      const pages = await drawAgreementPages(
        agreementPageInput(farm, { ...agreement, ...meta, signature: ink }, t as never, locale),
        { preview: true },
      )
      if (!alive || mine !== seq.current) return
      setPreview(pages.map((c) => c.toDataURL('image/png')))
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink, farm, meta.signedBy, meta.signedAt])

  return (
    <Modal title={t('agreement.readTitle')} onClose={onClose} fill testId="agreement-sign-modal">
      {/* ★ AN5.2 — déjà inscrits, modifiables sur place. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 pb-2" data-testid="agreement-meta">
        <InlineValue
          label={t('farms.signedBy')}
          value={meta.signedBy}
          display={meta.signedBy}
          type="text"
          testId="agreement-signer"
          onChange={(signedBy) => setMeta((m) => ({ ...m, signedBy }))}
        />
        <InlineValue
          label={t('form.signedAt')}
          value={localDayKey(new Date(meta.signedAt))}
          display={formatDate(meta.signedAt, locale)}
          type="date"
          testId="agreement-date"
          onChange={(day) => setMeta((m) => ({ ...m, signedAt: iso(fromDayKey(day)) }))}
        />
      </div>

      {/* ★ LE DOCUMENT, lisible dès l'ouverture : ajusté à la hauteur restante. */}
      <div
        data-testid="agreement-preview"
        className={`min-h-0 flex-1 overscroll-contain rounded-card border border-edge-subtle bg-white p-1 ${
          preview && preview.length > 1 ? 'overflow-auto' : 'overflow-hidden'
        }`}
      >
        {preview ? (
          preview.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={t('agreement.preview')}
              data-testid="agreement-preview-page"
              className={
                preview.length === 1
                  ? 'mx-auto block h-full w-full object-contain object-top'
                  : 'mx-auto mb-2 block w-full max-w-[46rem] last:mb-0'
              }
            />
          ))
        ) : (
          <p className="muted p-6 text-center">{t('agreement.previewLoading')}</p>
        )}
      </div>

      {/* ★ AN5.6 — l'encre et la décision ne quittent jamais l'écran. */}
      <div className="shrink-0 pt-2" data-testid="agreement-sign-foot">
        <SignaturePad value={ink} onChange={setInk} height={120} />
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {touched && !ink && (
            <span
              role="alert"
              data-testid="agreement-sign-missing"
              className="chip me-auto bg-status-danger/15 text-status-danger-ink"
            >
              {t('agreement.signMissing')}
            </span>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="agreement-sign-confirm"
            onClick={() => {
              setTouched(true)
              if (!ink) return
              onCommit(ink, meta)
            }}
          >
            <Icon name="check" size={16} />
            {t('agreement.signConfirm')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
