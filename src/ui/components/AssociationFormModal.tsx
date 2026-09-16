import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  agreementValues,
  applyRemoteSignature,
  canonicalPhone,
  formatDate,
  formatMobileTyping,
  fromDayKey,
  iso,
  localDayKey,
  newAgreementId,
  saveFarmAgreement,
  givenFields,
  idDigits,
  isReadOnly,
  isValidIdNumber,
  isValidMobile,
  now,
  renderAgreementTemplate,
  richRuns,
  templateSection,
} from '@core/index'
import type { Agreement, Farm } from '@core/index'

import { agreementFileName } from '../agreement/input'
import { useLocale } from '../hooks/useLocale'
import { agreementTemplate } from '../settings/agreementDoc'
import { readOnlyProps, useReadOnly } from '../settings/viewAs'
import { AgreementActions } from './AgreementViewer'
import { Icon } from './Icon'
import { Modal } from './primitives'
import { SignaturePad } from './SignaturePad'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AK3 · AK4 (2026-09-16) — « הסכם התנדבות- ארצנו », CALQUÉ, OUVERT DEPUIS LA
 *    FICHE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le PO fait signer sur DEUX supports en parallèle — le formulaire de
 *     l'association et le sien. Son formulaire doit donc être AUSSI SIMPLE que
 *     le leur. »
 *
 * ★ MÊMES LIBELLÉS, MÊME ORDRE : titre et logo · שם החקלאי · תז/חפ · נייד ·
 *   l'encadré הצהרה ואישור · חתימה · le bouton. Rien d'autre. L'aperçu A4 de
 *   `AgreementSignModal` n'y est PAS : leur formulaire n'en a pas, et c'est un
 *   écran que l'agriculteur lit debout, pas un document qu'il feuillette.
 *
 * ⛔ AUCUNE LISTE « מקום התנדבות ». Refus explicite du PO : chez eux elle
 *    montre à l'agriculteur la liste de toutes les autres fermes. Ici la
 *    fenêtre s'ouvre DEPUIS une fiche : le lieu est connu, il n'est pas choisi.
 *
 * ★ L'ENCADRÉ VIENT DU GABARIT DU DOCUMENT (`templateSection`), gras compris :
 *   ce que l'agriculteur lit à l'écran est ce que le PDF imprime.
 *
 * ★ DÉJÀ SU = AFFICHÉ, PAS REDEMANDÉ (AK4.2, la règle d'AG4) : un champ connu
 *   de la fiche est visible et figé ; seuls les manquants se saisissent.
 *
 * ⚠️ ת״ז/ח״פ EST DU TEXTE DE BOUT EN BOUT (AK3) : `idDigits` ne garde que des
 *    chiffres et ne convertit jamais en nombre, `applyRemoteSignature` range
 *    la chaîne telle quelle, et `rows.ts` l'écrit dans une colonne `text`.
 *
 * ★★ AN5 (2026-09-17) — LA SEULE FENÊTRE DE SIGNATURE, ET LE TEXTE À L'ÉCRAN
 *    DÈS L'OUVERTURE. « Aujourd'hui l'agriculteur voit d'abord le logo et doit
 *    faire défiler pour lire. » Elle occupe toute la hauteur ; en tête, en une
 *    bande serrée : le logo réduit (32 px), le titre, et les champs sur UNE
 *    ligne à l'iPad — le signataire et la DATE DU JOUR déjà inscrits,
 *    modifiables sur place (le nom connu se corrige d'un toucher ; ת״ז et נייד
 *    connus restent figés, AK4.2) ; puis l'encadré הצהרה, qui prend la place
 *    restante ; la zone de signature et « שמירה » sont fixées en bas. C'est
 *    aussi la fenêtre que le bouton « החתמה » de l'édition ouvre (mode
 *    `onSign`) : une fenêtre, partout.
 *
 * ★ ENREGISTRER ÉCRIT PAR LE MÊME CHEMIN QUE LA SIGNATURE À DISTANCE
 *   (`applyRemoteSignature`) : un accord signé est ajouté à la fiche, les
 *   champs manquants sont complétés sans rien écraser, le statut passe à
 *   « נחתם » sans jamais reculer une fiche « פעילה ». Pas de second chemin.
 */
export function AssociationFormModal({
  farm,
  onClose,
  onSaved,
  onSign,
}: {
  farm: Farm
  onClose: () => void
  onSaved?: (agreement: Agreement) => void
  /**
   * ★ AN5 — depuis l'ÉDITION : la fiche n'est pas encore enregistrée, rien
   * n'est écrit ici ; l'accord signé et les champs saisis remontent au
   * formulaire, que « שמירה » enregistrera.
   */
  onSign?: (agreement: Agreement, fields: { farmerName: string; farmerId: string; farmerPhone: string }) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const readOnly = useReadOnly()

  const given = givenFields(farm)
  /* ★ AN5.2 — « repris de la fiche » : quand les colonnes de l'agriculteur sont
     vides, le contact principal de la fiche (la même personne, AM2) pré-remplit
     le nom et le portable. Rien n'est figé : ce sont des saisies. */
  const primary = farm.contacts.find((c) => c.isPrimary) ?? null
  const [farmerName, setFarmerName] = useState(() => (given.farmerName ? '' : (primary?.name ?? '')))
  const [farmerId, setFarmerId] = useState('')
  const [farmerPhone, setFarmerPhone] = useState(() =>
    given.farmerPhone ? '' : formatMobileTyping(primary?.phone ?? ''),
  )
  const [signature, setSignature] = useState<string | null>(null)
  /* ★ AN5.2 — le nom connu se corrige sur place ; la date est celle du jour. */
  const [nameEdit, setNameEdit] = useState<string | null>(null)
  const [day, setDay] = useState(() => localDayKey(now()))
  /* La zone d'encre prend la hauteur que le texte laisse : sur un iPad tenu
     debout, pas de vide entre la déclaration et la signature. Mesurée, bornée. */
  const padBox = useRef<HTMLDivElement | null>(null)
  const [padHeight, setPadHeight] = useState(130)
  useLayoutEffect(() => {
    const el = padBox.current
    if (!el) return
    const measure = () => setPadHeight(Math.max(120, Math.min(640, Math.floor(el.clientHeight) - 56)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [tried, setTried] = useState(false)

  const values = {
    farmerName: nameEdit !== null ? nameEdit.trim() : given.farmerName || farmerName.trim(),
    farmerId: given.farmerId || farmerId,
    farmerPhone: given.farmerPhone || farmerPhone,
  }

  const year = String(now().getFullYear())
  const declaration = useMemo(() => {
    const rendered = renderAgreementTemplate(
      agreementTemplate(t('settings.agreementDoc.defaultTemplate')),
      agreementValues(
        {
          ...farm,
          farmerName: values.farmerName,
          farmerId: values.farmerId,
          farmerPhone: values.farmerPhone,
        },
        { year, signedAtText: '' },
      ),
    )
    return (
      templateSection(rendered, t('assocForm.declarationHeading')) ??
      templateSection(
        renderAgreementTemplate(t('settings.agreementDoc.defaultTemplate'), { 'שנה': year }),
        t('assocForm.declarationHeading'),
      )
    )
    // Les trois champs ne figurent pas dans l'encadré ; seule l'année compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm.id, year, t])

  const errors = {
    farmerName: values.farmerName === '' ? t('assocForm.required') : null,
    farmerId:
      values.farmerId === ''
        ? t('assocForm.required')
        : !given.farmerId && !isValidIdNumber(values.farmerId)
          ? t('assocForm.idNineDigits')
          : null,
    farmerPhone:
      values.farmerPhone === ''
        ? t('assocForm.required')
        : !given.farmerPhone && !isValidMobile(values.farmerPhone)
          ? t('assocForm.phoneTenDigits')
          : null,
    signature: signature === null ? t('agreement.signMissing') : null,
  }
  const blocked = Object.values(errors).some((e) => e !== null)

  const signedBefore = farm.agreements
    .filter((a) => (a.signature ?? null) !== null)
    .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())[0]

  const save = (): void => {
    setTried(true)
    if (blocked || signature === null) return
    if (isReadOnly()) return
    const signedAt = iso(fromDayKey(day))
    if (onSign) {
      onSign(
        {
          id: newAgreementId(),
          signedAt,
          signedBy: values.farmerName,
          fileName: agreementFileName(farm, t as never),
          signature,
        },
        {
          farmerName: values.farmerName,
          farmerId: values.farmerId,
          farmerPhone: given.farmerPhone ? given.farmerPhone : canonicalPhone(values.farmerPhone),
        },
      )
      onClose()
      return
    }
    const applied = applyRemoteSignature(farm.id, {
      farmerName: values.farmerName,
      farmerId: values.farmerId,
      farmerPhone: given.farmerPhone ? given.farmerPhone : canonicalPhone(values.farmerPhone),
      farmName: '',
      signature,
      idPhoto: null,
      fileName: agreementFileName(farm, t as never),
    })
    /* ★ AN5.2 — le nom et la date tels qu'à l'écran portent sur l'ACCORD ; la
       fiche garde ses champs (applyRemoteSignature ne les écrase jamais). */
    const agreement =
      applied && (applied.signedBy !== values.farmerName || localDayKey(new Date(applied.signedAt)) !== day)
        ? { ...applied, signedBy: values.farmerName, signedAt }
        : applied
    if (agreement && agreement !== applied) saveFarmAgreement(farm.id, agreement)
    if (agreement) onSaved?.(agreement)
    onClose()
  }

  const fieldError = (key: keyof typeof errors) =>
    tried && errors[key] ? (
      <p className="mt-1 text-micro font-semibold text-status-danger-ink" role="alert">
        {errors[key]}
      </p>
    ) : null

  const inputClass = (frozen: boolean, bad: boolean) =>
    `input text-body ${bad ? 'border-status-danger' : ''} ${
      frozen ? 'cursor-default bg-surface-high text-content-secondary' : ''
    }`

  return (
    <Modal
      title={t('assocForm.title')}
      onClose={onClose}
      fill
      testId="assoc-form"
      header={
        <div className="flex min-w-0 items-center gap-3">
          {/* Le logo d'ארצנו est blanc sur transparent : il est posé en MASQUE,
              teinté à l'encre de l'app, comme sur le PDF. */}
          <span
            aria-hidden="true"
            data-testid="assoc-form-logo"
            className="block h-8 w-8 shrink-0 bg-content-primary"
            style={{
              WebkitMaskImage: `url(${import.meta.env.BASE_URL}artzenu-mark.png)`,
              maskImage: `url(${import.meta.env.BASE_URL}artzenu-mark.png)`,
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
          <div className="min-w-0">
            <h2 data-testid="assoc-form-title" className="text-body font-bold text-content-primary">
              {t('assocForm.title')}
              {/* Le lieu est CONNU (AK3 ⛔) : dit sur la même ligne, jamais choisi. */}
              <span className="muted ms-2 font-normal" data-testid="assoc-form-place">
                {farm.farmName || farm.name}
              </span>
            </h2>
          </div>
        </div>
      }
    >
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3">
        {signedBefore && (
          <div
            data-testid="assoc-signed-before"
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-card border-s-4 border-s-status-success bg-status-success/10 px-3 py-1.5"
          >
            <span className="flex items-center gap-2 text-caption font-semibold text-status-success-ink">
              <Icon name="check" size={16} />
              {t('assocForm.signedBefore', {
                date: formatDate(signedBefore.signedAt, locale),
                name: signedBefore.signedBy,
              })}
            </span>
            <AgreementActions agreement={signedBefore} farm={farm} />
          </div>
        )}

        <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        {/* 2 — שם החקלאי : inscrit, et corrigible sur place (AN5.2). */}
        <div>
          <label className="label" htmlFor="assoc-farmerName">
            {t('assocForm.farmerName')}
          </label>
          <input
            id="assoc-farmerName"
            data-testid="assoc-field-farmerName"
            type="text"
            inputMode="text"
            autoComplete="name"
            data-prefilled={given.farmerName !== '' ? '1' : undefined}
            className={inputClass(false, tried && !!errors.farmerName)}
            value={nameEdit !== null ? nameEdit : given.farmerName || farmerName}
            onChange={(e) => (given.farmerName !== '' ? setNameEdit(e.target.value) : setFarmerName(e.target.value))}
          />
          {fieldError('farmerName')}
        </div>

        {/* 3 — תז/חפ : le pavé numérique seul, du texte en mémoire. */}
        <div>
          <label className="label" htmlFor="assoc-farmerId">
            {t('assocForm.farmerId')}
          </label>
          <input
            id="assoc-farmerId"
            data-testid="assoc-field-farmerId"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            dir="ltr"
            maxLength={9}
            readOnly={given.farmerId !== ''}
            data-prefilled={given.farmerId !== '' ? '1' : undefined}
            className={`${inputClass(given.farmerId !== '', tried && !!errors.farmerId)} ltr-nums text-end`}
            value={given.farmerId || farmerId}
            onChange={(e) => setFarmerId(idDigits(e.target.value))}
          />
          {fieldError('farmerId')}
        </div>

        {/* 4 — נייד : (0XX) XXX-XXXX, posé pendant la frappe. */}
        <div>
          <label className="label" htmlFor="assoc-farmerPhone">
            {t('assocForm.farmerPhone')}
          </label>
          <input
            id="assoc-farmerPhone"
            data-testid="assoc-field-farmerPhone"
            data-kind="phone"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="tel"
            dir="ltr"
            placeholder="(0XX) XXX-XXXX"
            readOnly={given.farmerPhone !== ''}
            data-prefilled={given.farmerPhone !== '' ? '1' : undefined}
            className={`${inputClass(given.farmerPhone !== '', tried && !!errors.farmerPhone)} ltr-nums text-end`}
            value={given.farmerPhone ? formatMobileTyping(given.farmerPhone) : farmerPhone}
            onChange={(e) => setFarmerPhone(formatMobileTyping(e.target.value))}
          />
          {fieldError('farmerPhone')}
        </div>

        {/* ★ AN5.2 — la date du jour, inscrite, modifiable sur place. */}
        <div>
          <label className="label" htmlFor="assoc-date">
            {t('form.signedAt')}
          </label>
          <input
            id="assoc-date"
            data-testid="assoc-field-date"
            data-kind="date"
            type="date"
            dir="ltr"
            className={`${inputClass(false, false)} ltr-nums`}
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
        </div>
        </div>

        {/* 5 — l'encadré הצהרה ואישור, gras et retours à la ligne du gabarit. */}
        {declaration && (
          <section
            data-testid="assoc-declaration"
            className="min-h-0 shrink overflow-auto overscroll-contain rounded-card border-2 border-edge-strong bg-surface-base px-4 py-3"
          >
            <h3 className="mb-1.5 text-body font-bold text-content-primary">
              {declaration.heading}
            </h3>
            {declaration.lines.map((line, i) =>
              line.trim() === '' ? (
                <div key={i} className="h-2" />
              ) : (
                <p key={i} data-testid="assoc-declaration-line" className="text-body leading-relaxed text-content-primary">
                  {richRuns(line).map((run, j) =>
                    run.bold ? <strong key={j}>{run.text}</strong> : <span key={j}>{run.text}</span>,
                  )}
                </p>
              ),
            )}
          </section>
        )}

        {/* 6 — חתימה, avec son bouton d'effacement (dans le pad). */}
        {/* En bas, et plus grande quand l'écran le permet (un iPad tenu debout). */}
        <div data-testid="assoc-signature" ref={padBox} className="flex min-h-[11rem] flex-1 flex-col justify-end">
          <p className="label">{t('assocForm.signature')}</p>
          <SignaturePad value={signature} onChange={setSignature} height={padHeight} />
          {fieldError('signature')}
        </div>

        {/* 7 — l'enregistrement */}
        <button
          type="button"
          data-testid="assoc-save"
          onClick={save}
          disabled={readOnly}
          {...readOnlyProps(readOnly, t('viewAs.blocked'))}
          className="btn-primary btn-big w-full shrink-0"
        >
          <Icon name="check" size={19} />
          {t('assocForm.save')}
        </button>
      </div>
    </Modal>
  )
}
