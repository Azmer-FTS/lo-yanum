import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  EMPTY_SIGN_DRAFT,
  applyRemoteSignature,
  canSign,
  getMyFarm,
  isReadOnly,
  proposedFarmName,
  signFormState,
} from '@core/index'
import type { SignDraft, SignFieldId } from '@core/index'

import { drawAgreementPage } from '../../agreement/artzenu'
import { agreementFileName, agreementPageInput } from '../../agreement/input'
import { Icon } from '../../components/Icon'
import { SignaturePad } from '../../components/SignaturePad'
import { Callout, PageHeader, Section } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'
import { requiresIdPhoto } from '../../settings/renewal'
import { readOnlyProps, useReadOnly } from '../../settings/viewAs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG4 (2026-09-09) — LE FORMULAIRE DE SIGNATURE À DISTANCE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le PO envoie le lien MÊME S'IL N'A RIEN SAISI. Le formulaire réclame ce
 *     qui manque et refuse la signature tant que l'obligatoire n'y est pas. »
 *
 * ★★ CET ÉCRAN EST DÉLIBÉRÉMENT COURT, ET C'EST SA PREMIÈRE QUALITÉ. La règle
 *    de la passe — « chaque champ ajouté est un abandon possible » — se lit
 *    dans `core/remoteSign.ts`, qui ferme la liste à sept choses. Ce qui est
 *    ici n'ajoute rien : il AFFICHE ce que la fiche porte déjà et ne demande
 *    que le reste.
 *
 * ★★ ET LE DOCUMENT EST AU-DESSUS DU PAD, COMME EN AF1.2, PARCE QUE C'EST LA
 *    MÊME EXIGENCE VUE DEPUIS L'AUTRE BOUT DU LIEN. « On ne fait pas signer un
 *    document invisible » ne cesse pas d'être vrai quand le signataire est
 *    seul chez lui — ça devient plus vrai, puisqu'il n'y a personne à côté de
 *    lui pour lui dire ce qu'il signe. Et l'aperçu EST le document :
 *    `drawAgreementPage` est la fonction que le PDF appelle, avec les mêmes
 *    valeurs — celles du formulaire, pas celles de la fiche, sinon il lirait
 *    une page qui ne porte pas ce qu'il vient de taper.
 */
export function FarmerSignScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const farm = useCoreValue(getMyFarm)
  const readOnly = useReadOnly()

  const [draft, setDraft] = useState<SignDraft>(EMPTY_SIGN_DRAFT)
  const [tried, setTried] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const seq = useRef(0)

  const requirePhoto = requiresIdPhoto()

  const state = useMemo(
    () => (farm ? signFormState(farm, draft, { requireIdPhoto: requirePhoto }) : null),
    [farm, draft, requirePhoto],
  )

  /**
   * ★★ AG4.1 · A146 — LE NOM DE FERME SE PROPOSE DÈS QUE LE NOM EST CONNU, ET
   *    IL RESTE MODIFIABLE.
   *
   * ⚠️ IL N'ÉCRASE JAMAIS UNE SAISIE. La condition est « le champ est encore
   *    exactement la proposition précédente, ou vide » : quelqu'un qui a tapé
   *    « משק כהן » et corrige ensuite son prénom garde son nom de ferme.
   */
  const pattern = t('sign.farmNamePattern')
  useEffect(() => {
    if (!state) return
    if (!state.asked.includes('farmName')) return
    const proposal = proposedFarmName(state.values.farmerName, pattern)
    setDraft((d) => {
      if (proposal === '') return d
      const previous = proposedFarmName(d.farmerName, pattern)
      if (d.farmName !== '' && d.farmName !== previous) return d
      if (d.farmName === proposal) return d
      return { ...d, farmName: proposal }
    })
    // `state.values.farmerName` est la seule entrée réelle de ce calcul.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.values.farmerName, pattern])

  /**
   * ★ L'APERÇU SE REDESSINE QUAND LES VALEURS OU L'ENCRE CHANGENT, ET PAS À
   *   CHAQUE FRAPPE : un rendu A4 par caractère ferait ramer un téléphone
   *   d'entrée de gamme, qui est exactement l'appareil visé. Le déclencheur
   *   est donc la PERTE DE FOCUS d'un champ et le relevé du doigt sur le pad.
   */
  const [previewSeed, setPreviewSeed] = useState(0)
  useEffect(() => {
    if (!farm || !state) return
    let alive = true
    const mine = ++seq.current
    void (async () => {
      const canvas = await drawAgreementPage(
        agreementPageInput(
          {
            ...farm,
            farmerName: state.values.farmerName,
            farmerId: state.values.farmerId,
            farmerPhone: state.values.farmerPhone,
            farmName: state.values.farmName,
          },
          {
            id: 'preview',
            signedAt: new Date().toISOString(),
            signedBy: state.values.farmerName,
            fileName: '',
            signature: draft.signature,
          },
          t as never,
          locale,
        ),
      )
      if (!alive || mine !== seq.current) return
      setPreview(canvas.toDataURL('image/png'))
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm, draft.signature, previewSeed])

  if (!farm || !state) return null

  const set = (id: SignFieldId, value: string): void =>
    setDraft((d) => ({ ...d, [id]: value }))

  const submit = (): void => {
    setTried(true)
    if (!canSign(state) || draft.signature === null) return
    /* ⚠️ LE VERROU D'AG1 EST INTERROGÉ ICI AUSSI, ET CE N'EST PAS REDONDANT :
       le bouton est déjà désactivé, mais cet écran est le seul du programme
       qui produise un CONTRAT. Une double garde sur la seule écriture
       irréversible de l'application est le bon endroit pour en mettre une. */
    if (isReadOnly()) return
    applyRemoteSignature(farm.id, {
      farmerName: state.values.farmerName,
      farmerId: state.values.farmerId,
      farmerPhone: state.values.farmerPhone,
      farmName: state.values.farmName,
      signature: draft.signature,
      idPhoto: draft.idPhoto,
      fileName: agreementFileName(farm, t as never),
    })
    setDone(true)
  }

  if (done) {
    return (
      <>
        <PageHeader title={t('sign.doneTitle')} subtitle={farm.name} />
        <Callout tone="success" title={t('sign.doneTitle')}>
          <span data-testid="sign-done">{t('sign.doneBody')}</span>
        </Callout>
        <button
          type="button"
          className="btn-primary btn-big mt-4 w-full"
          onClick={() => navigate('/farmer')}
        >
          <Icon name="check" size={19} />
          {t('common.back')}
        </button>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('sign.title')} subtitle={farm.name} />

      {/* ------------------------------------------------------------------ */}
      {/* 1 — CE QUI EST DÉJÀ SU, ET QU'ON NE REDEMANDE PAS (AG4.4)           */}
      {/* ------------------------------------------------------------------ */}
      {state.asked.length < 4 && (
        <Section title={t('sign.known')} collapseKey="sign-known">
          <dl className="flex flex-col gap-2" data-testid="sign-known">
            {(['farmerName', 'farmerId', 'farmerPhone', 'farmName'] as SignFieldId[])
              .filter((id) => state.given[id] !== '')
              .map((id) => (
                <div
                  key={id}
                  className="flex items-baseline justify-between gap-3 border-b border-edge-subtle pb-1.5 last:border-0"
                >
                  <dt className="muted shrink-0">{t(`sign.field.${id}`)}</dt>
                  <dd
                    data-testid={`sign-given-${id}`}
                    className="min-w-0 truncate text-caption font-medium"
                  >
                    {state.given[id]}
                  </dd>
                </div>
              ))}
          </dl>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2 — CE QUI MANQUE, ET RIEN D'AUTRE                                  */}
      {/* ------------------------------------------------------------------ */}
      {state.asked.length > 0 && (
        <Section title={t('sign.askedTitle')} collapseKey="sign-asked">
          <div className="flex flex-col gap-3" data-testid="sign-asked">
            {state.asked.map((id) => (
              <div key={id}>
                <label className="label" htmlFor={`sign-${id}`}>
                  {t(`sign.field.${id}`)}
                  {!(id === 'farmName') && (
                    <span className="text-status-danger-ink"> *</span>
                  )}
                </label>
                <input
                  id={`sign-${id}`}
                  data-testid={`sign-input-${id}`}
                  className="input"
                  /* ⚠️ `type="tel"` POUR LE PORTABLE ET `type="text"` POUR LA
                     ת״ז. Celle-ci commence souvent par un zéro et n'est PAS un
                     nombre — voir `Farm.farmerId` : un particulier, une
                     société et un קיבוץ écrivent trois choses différentes dans
                     cette case, et aucune validation ne doit refuser celle que
                     l'association accepte. */
                  type={id === 'farmerPhone' ? 'tel' : 'text'}
                  inputMode={id === 'farmerPhone' ? 'tel' : undefined}
                  autoComplete={id === 'farmerName' ? 'name' : 'off'}
                  value={draft[id]}
                  onChange={(e) => set(id, e.target.value)}
                  onBlur={() => setPreviewSeed((n) => n + 1)}
                />
                {id === 'farmName' && (
                  <p className="muted mt-1">{t('sign.farmNameHint')}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3 — LA PHOTO DE LA CARTE (AG4.1) — FACULTATIVE PAR DÉFAUT           */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title={t(requirePhoto ? 'sign.idPhotoRequired' : 'sign.idPhotoOptional')}
        collapseKey="sign-id-photo"
      >
        <p className="muted mb-2">{t('sign.idPhotoHint')}</p>
        <input
          data-testid="sign-id-photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            /* ⛔ AUCUN TRAITEMENT DE L'IMAGE (AG4.3). Elle est lue et rangée.
               Pas d'OCR, pas de MRZ, pas de recadrage automatique : le numéro
               est dans le champ ת״ז, tapé par quelqu'un. */
            const reader = new FileReader()
            reader.onload = () =>
              setDraft((d) => ({ ...d, idPhoto: String(reader.result ?? '') }))
            reader.readAsDataURL(file)
          }}
        />
        {draft.idPhoto && (
          <img
            src={draft.idPhoto}
            alt={t('sign.idPhotoOptional')}
            data-testid="sign-id-photo-preview"
            className="mt-2 max-h-40 rounded-card border border-edge-subtle"
          />
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 4 — LE DOCUMENT, LU AVANT D'ÊTRE SIGNÉ (AG4.6)                      */}
      {/* ------------------------------------------------------------------ */}
      <Section title={t('agreement.readTitle')} collapseKey="sign-document">
        <div
          data-testid="sign-preview"
          className="max-h-[46dvh] overflow-auto overscroll-contain rounded-card border border-edge-subtle bg-white p-2"
        >
          {preview ? (
            <img
              src={preview}
              alt={t('agreement.preview')}
              data-testid="sign-preview-page"
              className="mx-auto block w-full max-w-[46rem]"
            />
          ) : (
            <p className="muted p-6 text-center">{t('agreement.previewLoading')}</p>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 5 — LA CASE, PUIS LE DOIGT                                          */}
      {/* ------------------------------------------------------------------ */}
      <Section title={t('agreement.signatureHeading')} collapseKey="sign-ink">
        <label className="flex items-start gap-2.5 rounded-field bg-surface-high px-3.5 py-3">
          <input
            type="checkbox"
            data-testid="sign-accept"
            checked={draft.accepted}
            onChange={(e) => setDraft((d) => ({ ...d, accepted: e.target.checked }))}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span className="text-caption leading-relaxed">{t('sign.accept')}</span>
        </label>

        <p className="label mt-4">{t('agreement.signStep')}</p>
        <SignaturePad
          value={draft.signature}
          onChange={(ink) => setDraft((d) => ({ ...d, signature: ink }))}
          height={160}
        />

        {/* ★★ AG4.5 — LE REFUS NOMME CE QUI MANQUE. « Formulaire incomplet »
            envoie chercher ; « il manque : ת״ז » dit où aller. */}
        {tried && state.blocked && (
          <p
            role="alert"
            data-testid="sign-blocked"
            className="chip mt-3 bg-status-danger/15 text-status-danger-ink"
          >
            {state.blocked.kind === 'fields'
              ? t('sign.missingFields', {
                  fields: state.blocked.fields
                    .map((id) => t(`sign.field.${id}`))
                    .join(', '),
                })
              : state.blocked.kind === 'photo'
                ? t('sign.missingPhoto')
                : t('sign.missingAccept')}
          </p>
        )}
        {tried && !state.blocked && draft.signature === null && (
          <p
            role="alert"
            data-testid="sign-blocked"
            className="chip mt-3 bg-status-danger/15 text-status-danger-ink"
          >
            {t('agreement.signMissing')}
          </p>
        )}

        <button
          type="button"
          data-testid="sign-submit"
          onClick={submit}
          disabled={readOnly}
          {...readOnlyProps(readOnly, t('viewAs.blocked'))}
          className="btn-primary btn-big mt-4 w-full"
        >
          <Icon name="check" size={19} />
          {t('sign.submit')}
        </button>
        <p className="muted mt-2">{t('sign.submitHint')}</p>
      </Section>
    </>
  )
}
