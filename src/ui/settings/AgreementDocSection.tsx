import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AGREEMENT_SAMPLE,
  AGREEMENT_VARS,
  parseAgreementBlocks,
  renderAgreementTemplate,
} from '@core/index'

import { drawAgreementPage } from '../agreement/artzenu'
import { Icon } from '../components/Icon'
import { Callout, Section } from '../components/primitives'
import {
  LOGO_MAX,
  LOGO_MIN,
  agreementTemplate,
  resetAgreementLogo,
  resetAgreementTemplate,
  useAgreementLogo,
  useAgreementTemplateOverride,
  writeAgreementLogo,
  writeAgreementTemplate,
} from './agreementDoc'
import type { LogoAlign } from './agreementDoc'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH5 (2026-09-09) — LE GABARIT DU DOCUMENT DE SIGNATURE, DANS LES RÉGLAGES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★ L'APERÇU EST LE DOCUMENT, PAS UNE MAQUETTE DU DOCUMENT. Il appelle
 *    `drawAgreementPage` — la fonction qui dessine le PDF — avec des valeurs
 *    d'exemple. C'est la seule façon honnête de tenir AH5.6 : un aperçu écrit
 *    séparément est un aperçu qui finit par mentir, et il ment le jour où
 *    quelqu'un change la mise en page d'un seul des deux.
 *
 * ★ ET IL SE REDESSINE SUR PERTE DE FOCUS, PAS À CHAQUE FRAPPE. Un rendu A4
 *   par caractère fait ramer un iPad, et le PO écrit des paragraphes.
 */
export function AgreementDocSection() {
  const { t } = useTranslation()
  const shipped = t('settings.agreementDoc.defaultTemplate')
  const override = useAgreementTemplateOverride()
  const logo = useAgreementLogo()
  const [text, setText] = useState(() => agreementTemplate(shipped))
  const [state, setState] = useState<'idle' | 'saved' | 'unknown'>('idle')
  const [unknown, setUnknown] = useState<string[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [seed, setSeed] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  /* Le gabarit remis à zéro ailleurs (bouton « retour au texte livré ») doit
     revenir dans la zone de saisie, sinon le PO relit son ancien texte. */
  useEffect(() => {
    setText(agreementTemplate(shipped))
  }, [override, shipped])

  const blocks = useMemo(
    () => parseAgreementBlocks(renderAgreementTemplate(text, AGREEMENT_SAMPLE)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed],
  )

  useEffect(() => {
    let alive = true
    const mine = ++seq.current
    void (async () => {
      const canvas = await drawAgreementPage({
        blocks,
        logo,
        signatureHeading: t('agreement.signatureHeading'),
        signerLabel: t('agreement.signerLabel'),
        dateLabel: t('agreement.dateLabel'),
        signature: null,
        signedBy: AGREEMENT_SAMPLE['שם_החקלאי'],
        signedAtText: AGREEMENT_SAMPLE['תאריך_חתימה'],
        footer: t('agreement.footer'),
        title: t('agreement.docTitle'),
      })
      if (!alive || mine !== seq.current) return
      setPreview(canvas.toDataURL('image/png'))
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, logo.src, logo.align, logo.width])

  const save = () => {
    const result = writeAgreementTemplate(text)
    if (result.ok) {
      setState('saved')
      setUnknown([])
      setSeed((n) => n + 1)
    } else {
      setState('unknown')
      setUnknown(result.unknown)
    }
  }

  const onLogoFile = (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      writeAgreementLogo({ src: String(reader.result ?? '') })
      if (file.current) file.current.value = ''
    }
    reader.readAsDataURL(f)
  }

  return (
    <Section
      title={t('settings.agreementDoc.title')}
      className="mt-6"
      collapseKey="settings-agreement-doc"
      defaultOpen={false}
      summary={
        override === null
          ? t('settings.agreementDoc.summaryShipped')
          : t('settings.agreementDoc.summaryChanged')
      }
    >
      <p className="muted mb-3">{t('settings.agreementDoc.intro')}</p>

      <textarea
        dir="rtl"
        rows={12}
        className="input w-full text-caption leading-relaxed"
        data-testid="agreement-doc-template"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setState('idle')
        }}
        onBlur={() => setSeed((n) => n + 1)}
      />

      {/* ★ LES SEPT, ÉCRITES À L'ÉCRAN. Un gabarit à variables dont la liste
          n'est pas sous les yeux est un gabarit qu'on remplit de fautes. */}
      <p className="muted mt-2">
        {t('settings.agreementDoc.vars')}:{' '}
        <span dir="rtl" data-testid="agreement-doc-vars">
          {AGREEMENT_VARS.map((v) => `{{${v}}}`).join(' · ')}
        </span>
      </p>
      <p className="muted mt-1">{t('settings.agreementDoc.headingHint')}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary py-1.5"
          data-testid="agreement-doc-save"
          onClick={save}
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5"
          data-testid="agreement-doc-reset"
          onClick={() => {
            resetAgreementTemplate()
            setText(shipped)
            setState('idle')
            setSeed((n) => n + 1)
          }}
        >
          {t('settings.agreementDoc.reset')}
        </button>
        {state === 'saved' && (
          <span className="chip bg-status-success/15 text-status-success-ink">
            {t('common.saved')}
          </span>
        )}
      </div>

      {/* ★★ AH5.7 — LE REFUS NOMME LA FAUTIVE. */}
      {state === 'unknown' && (
        <div className="mt-3">
          <Callout
            tone="danger"
            title={t('settings.agreementDoc.unknownVar', { names: unknown.join(', ') })}
          >
            <span data-testid="agreement-doc-unknown">{unknown.join(', ')}</span>
          </Callout>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* LE LOGO (AH5.5)                                                     */}
      {/* ------------------------------------------------------------------ */}
      <h3 className="section-title mt-6">{t('settings.agreementDoc.logoTitle')}</h3>
      <p className="muted mt-1">{t('settings.agreementDoc.logoHint')}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="agreement-doc-logo-file"
          onChange={(e) => onLogoFile(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn-secondary py-1.5"
          data-testid="agreement-doc-logo-upload"
          onClick={() => file.current?.click()}
        >
          <Icon name="upload" size={15} />
          {t('settings.agreementDoc.logoUpload')}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5"
          data-testid="agreement-doc-logo-none"
          onClick={() => writeAgreementLogo({ src: '' })}
        >
          {t('settings.agreementDoc.logoNone')}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5"
          data-testid="agreement-doc-logo-reset"
          onClick={() => resetAgreementLogo()}
        >
          {t('settings.agreementDoc.logoReset')}
        </button>
        <span className="chip bg-surface-high text-content-secondary" data-testid="agreement-doc-logo-state">
          {logo.src === null
            ? t('settings.agreementDoc.logoAssociation')
            : logo.src === ''
              ? t('settings.agreementDoc.logoNoneState')
              : t('settings.agreementDoc.logoOwn')}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="label">{t('settings.agreementDoc.logoAlign')}</span>
          <select
            className="input"
            data-testid="agreement-doc-logo-align"
            value={logo.align}
            onChange={(e) => writeAgreementLogo({ align: e.target.value as LogoAlign })}
          >
            <option value="start">{t('settings.agreementDoc.alignStart')}</option>
            <option value="center">{t('settings.agreementDoc.alignCenter')}</option>
            <option value="end">{t('settings.agreementDoc.alignEnd')}</option>
          </select>
        </label>
        <label className="block min-w-[12rem] flex-1">
          <span className="label">
            {t('settings.agreementDoc.logoWidth')} ·{' '}
            <span className="ltr-nums numeric">{logo.width}</span>
          </span>
          <input
            type="range"
            className="w-full"
            data-testid="agreement-doc-logo-width"
            min={LOGO_MIN}
            max={LOGO_MAX}
            step={10}
            value={logo.width}
            onChange={(e) => writeAgreementLogo({ width: Number(e.target.value) })}
          />
        </label>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* L'APERÇU (AH5.6)                                                    */}
      {/* ------------------------------------------------------------------ */}
      <h3 className="section-title mt-6">{t('settings.agreementDoc.previewTitle')}</h3>
      <p className="muted mt-1">{t('settings.agreementDoc.previewHint')}</p>
      <div
        data-testid="agreement-doc-preview"
        className="mt-2 max-h-[60dvh] overflow-auto overscroll-contain rounded-card border border-edge-subtle bg-white p-2"
      >
        {preview ? (
          <img
            src={preview}
            alt={t('agreement.preview')}
            data-testid="agreement-doc-preview-page"
            className="mx-auto block w-full max-w-[46rem]"
          />
        ) : (
          <p className="muted p-6 text-center">{t('agreement.previewLoading')}</p>
        )}
      </div>
    </Section>
  )
}
