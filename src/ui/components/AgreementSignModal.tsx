import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Agreement, Farm } from '@core/index'

import { drawAgreementPage } from '../agreement/artzenu'
import { agreementPageInput } from '../agreement/input'
import { useLocale } from '../hooks/useLocale'
import { Icon } from './Icon'
import { Modal } from './primitives'
import { SignaturePad } from './SignaturePad'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF1.2 (2026-09-09) — ON NE FAIT PAS SIGNER UN DOCUMENT INVISIBLE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO, mot pour mot : « Le document se lit AVANT de signer, pas après.
 * Aujourd'hui c'est l'inverse et c'est un défaut de fond. » Il l'était : le
 * bouton « חתימה » dépliait un rectangle blanc sous la ligne d'un accord, et
 * le seul moyen de voir CE QUI était signé était d'ouvrir le PDF après coup.
 *
 * ★★ L'APERÇU EST LE DOCUMENT, PAS UNE IMITATION. Le canevas rendu ici est
 *    exactement celui que `agreementPdf` met dans le fichier — même fonction,
 *    mêmes valeurs, même gabarit de הצהרה. Un aperçu construit à part serait
 *    un aperçu capable de mentir, et il mentirait précisément le jour où
 *    quelqu'un changerait le gabarit.
 *
 * ★ IL SE REDESSINE QUAND L'ENCRE ARRIVE, ce qui n'est pas de la décoration :
 *   l'agriculteur voit sa propre signature atterrir dans le cadre du bas
 *   AVANT que le coordinateur appuie sur « אישור וחתימה ». Ce qu'il approuve
 *   est donc littéralement ce qu'il a sous les yeux.
 *
 * ⚠️ ET RIEN N'EST ÉCRIT ICI. Le modal rend l'encre à l'appelant ; c'est le
 *    bouton שמור de la fiche qui décide, comme partout ailleurs sur cet écran
 *    (même règle que « יישור לפי התיחום » en AD1). Un modal qui enregistrerait
 *    tout seul créerait un second chemin d'écriture sur la fiche ferme.
 */
export function AgreementSignModal({
  farm,
  agreement,
  onCommit,
  onClose,
}: {
  farm: Farm
  agreement: Agreement
  /** L'encre retenue. `null` efface la signature. */
  onCommit: (signature: string | null) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [ink, setInk] = useState<string | null>(agreement.signature ?? null)
  const [preview, setPreview] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  /* Un rendu par frappe serait un rendu A4 par frappe ; seule l'encre change
     réellement le document, et elle n'arrive qu'au relevé du stylet. */
  const seq = useRef(0)

  useEffect(() => {
    let alive = true
    const mine = ++seq.current
    void (async () => {
      const canvas = await drawAgreementPage(
        agreementPageInput(farm, { ...agreement, signature: ink }, t as never, locale),
      )
      if (!alive || mine !== seq.current) return
      setPreview(canvas.toDataURL('image/png'))
    })()
    return () => {
      alive = false
    }
    // `t` et `locale` sont stables pour la durée du modal ; l'encre ne l'est pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink, farm, agreement.signedBy, agreement.signedAt])

  return (
    <Modal title={t('agreement.readTitle')} onClose={onClose} wide>
      <p className="muted mb-3">{t('agreement.readHint')}</p>

      {/* ★ LE DOCUMENT, EN PREMIER ET EN GRAND. L'ordre de cet écran EST la
          demande : lire, puis signer. */}
      <div
        data-testid="agreement-preview"
        /* ⚠️ 34dvh ET NON 52 : à 52 les deux boutons d'action tombaient sous
           le pli sur un iPad en paysage (1032 de haut), c'est-à-dire que le
           geste qu'on demande — lire PUIS confirmer — se terminait par un
           défilement que rien n'annonce. Le document reste défilable dans son
           propre cadre ; ce qui ne défile pas, c'est la décision. */
        className="max-h-[34dvh] overflow-auto overscroll-contain rounded-card border border-edge-subtle bg-white p-2"
      >
        {preview ? (
          <img
            src={preview}
            alt={t('agreement.preview')}
            data-testid="agreement-preview-page"
            className="mx-auto block w-full max-w-[46rem]"
          />
        ) : (
          <p className="muted p-6 text-center">{t('agreement.previewLoading')}</p>
        )}
      </div>

      <p className="label mt-4">{t('agreement.signStep')}</p>
      <SignaturePad value={ink} onChange={setInk} height={150} />

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
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
            onCommit(ink)
          }}
        >
          <Icon name="check" size={16} />
          {t('agreement.signConfirm')}
        </button>
      </div>
    </Modal>
  )
}
