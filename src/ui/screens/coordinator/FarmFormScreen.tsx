import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import {
  FARM_PIPELINE,
  LAND_AGREEMENT_OPTIONS,
  LEGAL_ENTITY_OPTIONS,
  parsePositionInput,
  LIVESTOCK_KINDS,
  NEGEV_CENTER,
  regions,
  createFarm,
  farmFormSuggestions,
  getFarm,
  getFarmZonesForFarm,
  getVisibleFarms,
  guardedDunamsOf,
  suggestedGuardedDunams,
  closureBlocked,
  ACTIVITIES,
  activitiesOf,
  typeOfActivities,
  ringAreaDunams,
  formatDate,
  haversineKm,
  isEmail,
  inherited,
  iso,
  keepsLivestock,
  liaisonIsFarmer,
  mergePeople,
  nearestLocalities,
  newAgreementId,
  newContactId,
  now,
  positionOfLocality,
  splitPeople,
  updateFarm,
} from '@core/index'
import type {
  Agreement,
  Farm,
  CommitmentKind,
  EntityKind,
  FarmCommitment,
  FarmContact,
  FarmDraft,
  FarmStatus,
  FarmType,
  LatLng,
  LivestockKind,
  LivestockLine,
  PersonCard,
  RegionId,
} from '@core/index'

import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { PhotoField } from '../../components/PhotoField'
import { AgreementSignModal } from '../../components/AgreementSignModal'
import { LocalityField } from '../../components/LocalityField'
import { MapSplit } from '../../components/MapSplit'
import { PinMap } from '../../components/PinMap'
import { PositionLinkField } from '../../components/PositionLinkField'
import {
  FormActions,
  FormSection,
  SelectField,
  TextArea,
  TextField,
  isValidPhone,
} from '../../components/fields'
import { PageHeader } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

/** Compact camera/import pair for an inline contact row. */
function PhotoCompact({
  value,
  onChange,
}: {
  value: string | null
  onChange: (v: string | null) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0 flex-1">
      <PhotoField
        label={t('photo.personLabel')}
        value={value}
        onChange={onChange}
        name="?"
        hint={t('photo.hint')}
      />
    </div>
  )
}

const STATUSES: FarmStatus[] = [...FARM_PIPELINE, 'declined']

/**
 * R5.1 — farm create/edit.
 *
 * Two-column responsive layout grouped by meaning: identity → contacts →
 * areas → status → notes. Saving writes to the mock store, so the change is
 * visible everywhere for the rest of the session.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AD1 (2026-09-08) — LA LIGNE SOUS UN CHAMP DE SURFACE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * G15 écrivait ici « מוזן ידנית » avec un chemin de retour vers la somme des
 * zones, parce que le champ et le polygone se disputaient UNE case. Ils ne se
 * la disputent plus : ce champ est la surface DÉCLARÉE, le polygone a la
 * sienne, et aucun des deux n'écrase l'autre.
 *
 * ★ CE QUI RESTE À DIRE EST DONC L'AUTRE CHIFFRE, et un geste pour l'adopter
 *   si le coordinateur le veut — « יישור לפי התיחום », le même mot que sur la
 *   note d'écart, parce que c'est le même geste. Il REMPLIT le champ ; il ne
 *   l'enregistre pas : c'est le bouton שמור qui décide, comme partout ailleurs
 *   sur cet écran.
 *
 * ★ ET QUAND IL N'Y A PAS DE TRACÉ, ON LE DIT. « אין תיחום » est ce qui met
 *   cette exploitation dans la file AD3, et c'est la seule chose que le
 *   coordinateur ait besoin de savoir en regardant ce champ.
 */
function DunamSourceRow({
  typed,
  measured,
  onAdopt,
}: {
  typed: string
  measured: number | null
  onAdopt: (sum: number) => void
}) {
  const { t } = useTranslation()
  if (measured === null) return <p className="muted mt-1">{t('farms.noOutline')}</p>
  const same = Math.round(Number(typed)) === measured
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="muted">
        {t('farms.measuredArea')} ·{' '}
        <span className="numeric ltr-nums">{measured}</span>
      </span>
      {!same && (
        <button
          type="button"
          onClick={() => onAdopt(measured)}
          className="text-micro font-semibold text-accent-ink hover:underline"
        >
          {t('farms.gapAlign')}
        </button>
      )}
    </div>
  )
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AL1 (2026-09-16) — LA SUGGESTION DE « שטחים שמירה », ET SON GESTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deux passes se sont contredites sur cette colonne. AC3 l'a remplie toute
 * seule avec מעובד + מרעה ; AK1.6 l'a vidée parce qu'un chiffre transmis au
 * ministère doit avoir été déclaré par quelqu'un. Le PO tranche : l'app
 * PROPOSE la somme, elle ne l'écrit pas.
 *
 * ★ C'est la forme de `DunamSourceRow` juste au-dessus — une valeur grisée,
 *   un bouton — parce que la question est la même (« voici un chiffre que
 *   l'app connaît, le voulez-vous ? ») et qu'une deuxième façon de poser la
 *   même question est une façon de la rater.
 *
 * ⚠️ TROIS RÈGLES, ET CHACUNE EST UNE PORTE (A207) :
 *    1. rien n'est écrit tant que le bouton n'est pas touché ;
 *    2. la ligne s'efface dès que le champ porte quelque chose — la valeur du
 *       PO n'est jamais écrasée, ni par ce bouton ni par un recalcul ;
 *    3. pas de suggestion à zéro : ce serait un drapeau posé sur un zéro,
 *       le piège d'AA4 sous un autre nom.
 */
function GuardedSuggestionRow({
  typed,
  suggestion,
  onAdopt,
}: {
  typed: string
  suggestion: number | null
  onAdopt: (sum: number) => void
}) {
  const { t } = useTranslation()
  if (suggestion === null || typed.trim() !== '') return null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2" data-testid="farm-guarded-suggestion">
      <span className="muted">
        {t('form.guardedSuggestHint')} ·{' '}
        <span className="numeric ltr-nums" data-testid="farm-guarded-suggestion-value">
          {suggestion}
        </span>
      </span>
      <button
        type="button"
        data-testid="farm-guarded-adopt"
        onClick={() => onAdopt(suggestion)}
        /* ⚠️ 2,75 rem = 44 px : c'est un bouton qu'on touche du pouce sur un
           iPad tenu d'une main, pas un lien de bas de page. */
        className="inline-flex min-h-[2.75rem] items-center px-1 text-micro font-semibold text-accent-ink hover:underline"
      >
        {t('form.guardedSuggest')}
      </button>
    </div>
  )
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AM2 (2026-09-16) — UNE PERSONNE, UNE CARTE, SES CHAMPS AU MÊME ENDROIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nom, portable, ת״ז/ח״פ, courriel, rôle : ce que le PO sait d'une personne se
 * saisit sur SA carte, pré-rempli, modifiable sur place. Il n'y a plus de bloc
 * « ajouter un contact » au-dessus d'une personne déjà connue — le bouton
 * d'ajout est SOUS les cartes et dit « נוסף ». Voir `core/people.ts` pour
 * pourquoi l'agriculteur et le contact principal ne font plus qu'une carte.
 */
function PersonEditor({
  title,
  testId,
  card,
  onChange,
  withId,
  errors,
  onRemove,
  showPrimary,
}: {
  title: string
  testId: string
  card: Pick<PersonCard, 'name' | 'phone' | 'email' | 'role' | 'photo' | 'isPrimary'> & {
    idNumber?: string
  }
  onChange: (patch: Partial<PersonCard>) => void
  withId: boolean
  errors: { phone?: string; email?: string }
  onRemove?: () => void
  showPrimary: boolean
}) {
  const { t } = useTranslation()
  const isFarmer = testId === 'person-farmer'
  return (
    <div
      data-testid={testId}
      className="col-span-full rounded-field border border-edge-subtle bg-surface-high p-3"
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Avatar photo={card.photo} name={card.name || '?'} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-caption font-semibold text-content-primary">{title}</p>
          {card.name.trim() !== '' && (
            <p className="muted truncate" data-testid={`${testId}-name-echo`}>
              {card.name}
            </p>
          )}
        </div>
        {showPrimary && (
          <label className="flex min-h-[2.75rem] items-center gap-2 text-caption text-content-secondary">
            <input
              type="radio"
              name="primary-contact"
              checked={card.isPrimary}
              onChange={() => onChange({ isPrimary: true })}
              className="h-5 w-5 accent-accent"
            />
            {t('people.primary')}
          </label>
        )}
      </div>
      <div className="auto-cols gap-3 [--col-min:9rem] md:[--col-min:13rem]">
        <TextField
          label={t('people.name')}
          value={card.name}
          onChange={(name) => onChange({ name })}
          kind="name"
          testId={isFarmer ? 'farm-form-farmerName' : `${testId}-name`}
        />
        <TextField
          label={t('people.mobile')}
          value={card.phone}
          onChange={(phone) => onChange({ phone })}
          kind="phone"
          error={errors.phone}
          testId={isFarmer ? 'farm-form-farmerPhone' : `${testId}-phone`}
        />
        {withId && (
          <TextField
            label={t('people.idNumber')}
            hint={t('form.farmerIdHint')}
            value={card.idNumber ?? ''}
            onChange={(idNumber) => onChange({ idNumber })}
            kind="id"
            testId="farm-farmer-id"
          />
        )}
        <TextField
          label={t('people.email')}
          value={card.email}
          onChange={(email) => onChange({ email })}
          kind="email"
          error={errors.email}
          placeholder="name@example.co.il"
          testId={`${testId}-email`}
        />
        <TextField
          label={t('people.role')}
          value={card.role}
          onChange={(role) => onChange({ role })}
          testId={`${testId}-role`}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <PhotoCompact value={card.photo} onChange={(photo) => onChange({ photo })} />
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="btn-ghost min-h-[2.75rem] text-status-danger-ink hover:bg-status-danger/10"
          >
            <Icon name="trash" size={15} />
            {t('people.remove')}
          </button>
        )}
      </div>
    </div>
  )
}

export function FarmFormScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const { farmId } = useParams()
  const [params] = useSearchParams()
  const asked = params.get('kind')
  const initialKind: EntityKind =
    asked === 'moshav' || asked === 'other' || asked === 'farm' ? asked : 'farm'

  /**
   * ★★ AF3.3 — « UN LIEU POSÉ PEUT ÊTRE CONVERTI EN FICHE FERME EN UN GESTE ».
   * ⚠️ LE POINT EST RELU PAR `parsePositionInput`, PAS PAR `Number()`.
   */
  const seeded = parsePositionInput(params.get('at') ?? '')

  const existing = useCoreValue(() => (farmId ? getFarm(farmId) : null))
  const isEdit = Boolean(farmId)

  const [name, setName] = useState(existing?.name ?? params.get('name') ?? '')
  const [locality, setLocality] = useState(
    existing?.locality ?? params.get('locality') ?? '',
  )
  /* ★ AM1.4 — « dans » ou « rattachée à » ; vide = non précisé. */
  const [localityRelation, setLocalityRelation] = useState<'in' | 'attached' | ''>(
    existing?.localityRelation ?? '',
  )
  const [region, setRegion] = useState(existing?.region ?? '')
  /** X12.2 — the STANDARD region. `''` = derived from the position. */
  const [regionId, setRegionId] = useState<RegionId | ''>(existing?.regionId ?? '')
  const [type, setType] = useState<FarmType>(existing?.type ?? 'unknown')
  const activities = activitiesOf(type)
  /** G16 / AB1.1 — `?kind=moshav` opens the form already on a moshav. */
  const [entityKind, setEntityKind] = useState<EntityKind>(
    existing?.entityKind ?? initialKind,
  )
  const [status, setStatus] = useState<FarmStatus>(
    existing?.status ?? 'to_contact',
  )
  /**
   * ★★ AM1.5 — UNE FICHE SANS ÉPINGLE S'ENREGISTRE.
   *
   * ⚠️ ET SA POSITION DE REPLI NE S'AFFICHE PAS COMME UNE ÉPINGLE. Une fiche
   *    `positionMissing` (neuf des quinze d'AK1) porte le point de la base du
   *    programme ; l'ouvrir ici montrait une épingle à Beer-Sheva que personne
   *    n'a posée, et l'enregistrer la gardait « manquante » même après l'avoir
   *    déplacée. L'état part donc de `null`, et c'est l'enregistrement qui
   *    décide du drapeau.
   */
  const [position, setPosition] = useState<LatLng | null>(
    existing ? (existing.positionMissing ? null : existing.position) : seeded,
  )
  const [commitments, setCommitments] = useState<FarmCommitment[]>(
    existing?.commitments ?? [],
  )
  /** PO POINT 6 — `?? []`: an empty list is "nobody has been asked". */
  const [livestock, setLivestock] = useState<LivestockLine[]>(
    existing?.livestock ?? [],
  )
  const [livestockOpen, setLivestockOpen] = useState(false)
  /** P3.3 — which agreement's pad is open. */
  /**
   * ★★ AN5 — l'accord en cours de signature : un accord existant non signé, ou
   * un accord neuf qui n'entre dans la liste qu'avec l'encre. La date est
   * celle du JOUR et le signataire l'agriculteur de la fiche, déjà inscrits.
   */
  const [signing, setSigning] = useState<Agreement | null>(null)
  const [agreements, setAgreements] = useState<Agreement[]>(
    existing?.agreements ?? [],
  )
  const [farmDunams, setFarmHectares] = useState(
    existing?.farmDunams ? String(existing.farmDunams) : '',
  )
  const [grazingDunams, setGrazingHectares] = useState(
    existing?.grazingDunams ? String(existing.grazingDunams) : '',
  )
  const [farmManual, setFarmManual] = useState(
    Boolean(existing?.farmDunamsManual),
  )
  const [grazingManual, setGrazingManual] = useState(
    Boolean(existing?.grazingDunamsManual),
  )
  /* ★ AK1.6 — vide tant que rien n'a été déclaré. */
  const [guardedDunams, setGuardedDunams] = useState(() => {
    const g = existing ? guardedDunamsOf(existing) : null
    return g === null ? '' : String(g)
  })
  const [guardedManual, setGuardedManual] = useState(
    Boolean(existing?.guardedDunamsManual),
  )
  const [farmName, setFarmName] = useState(existing?.farmName ?? '')
  const [umbrella, setUmbrella] = useState(existing?.umbrella ?? '')
  /** AA2 — the roster, for the סמל יישוב uniqueness check below. */
  const allFarms = useCoreValue(getVisibleFarms)
  const zones = useCoreValue(() => (farmId ? getFarmZonesForFarm(farmId) : []))
  const zoneSum = (kind: 'farm_boundary' | 'grazing_area'): number | null => {
    const of = zones.filter((z) => z.kind === kind)
    if (of.length === 0) return null
    return Math.round(of.reduce((s, z) => s + ringAreaDunams(z.ring), 0))
  }

  /* ★★ AM2 — les personnes, lues UNE fois en une carte d'agriculteur et les
     autres contacts. `mergePeople` les réécrit aux deux endroits à
     l'enregistrement. */
  const [people] = useState(() =>
    splitPeople({
      farmerName: existing?.farmerName,
      farmerPhone: existing?.farmerPhone,
      farmerEmail: existing?.farmerEmail,
      farmerId: existing?.farmerId,
      contacts: existing?.contacts ?? [],
    }),
  )
  const [farmer, setFarmer] = useState<PersonCard>(people.farmer)
  const [contacts, setContacts] = useState<FarmContact[]>(people.others)
  const patchFarmer = (patch: Partial<PersonCard>) => {
    setFarmer((f) => ({ ...f, ...patch }))
    if (patch.isPrimary) setContacts((prev) => prev.map((c) => ({ ...c, isPrimary: false })))
  }

  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [photo, setPhoto] = useState<string | null>(existing?.photo ?? null)
  const [touched, setTouched] = useState(false)

  /** ★★ AA2 — THE PROSPECTION FIELDS. Every one a string in this form. */
  const [localityCode, setLocalityCode] = useState(
    existing?.localityCode == null ? '' : String(existing.localityCode),
  )
  const [council, setCouncil] = useState(existing?.council ?? '')
  const [legalEntity, setLegalEntity] = useState(existing?.legalEntity ?? '')
  const [landAgreement, setLandAgreement] = useState(existing?.landAgreement ?? '')
  const [landAgreementUntil, setLandAgreementUntil] = useState(
    existing?.landAgreementUntil ?? '',
  )
  const [liaisonName, setLiaisonName] = useState(existing?.liaisonName ?? '')
  const [liaisonPhone, setLiaisonPhone] = useState(existing?.liaisonPhone ?? '')
  /** ★★ AH1.3 — « le contact de terrain est la même personne », déduit. */
  const [liaisonSame, setLiaisonSame] = useState(() =>
    liaisonIsFarmer({
      farmerName: people.farmer.name,
      farmerPhone: people.farmer.phone,
      liaisonName: existing?.liaisonName ?? '',
      liaisonPhone: existing?.liaisonPhone ?? '',
    }),
  )
  /* ★★ AE2 — les deux numéros de nuit et les quatre champs du תיק אתר. */
  const [councilHotline, setCouncilHotline] = useState(existing?.councilHotline ?? '')
  const [standbyPhone, setStandbyPhone] = useState(existing?.standbyPhone ?? '')
  const [siteAccess, setSiteAccess] = useState(existing?.siteAccess ?? '')
  const [gateCode, setGateCode] = useState(existing?.gateCode ?? '')
  const [parking, setParking] = useState(existing?.parking ?? '')
  const [terrainNotes, setTerrainNotes] = useState(existing?.terrainNotes ?? '')

  /** ★★ AF1.1 — la fiche signée est ce qui est À L'ÉCRAN. */
  const signingFarm = useMemo(
    () =>
      ({
        ...(existing ?? {}),
        id: existing?.id ?? 'new',
        name: name.trim(),
        locality: locality.trim(),
        farmName: farmName.trim(),
        farmerName: farmer.name.trim(),
        farmerPhone: farmer.phone.trim(),
        farmerId: farmer.idNumber.trim(),
        contacts: mergePeople(farmer, contacts, () => 'new-contact').contacts,
      }) as Farm,
    [existing, name, locality, farmName, farmer, contacts],
  )

  /** ★★ AH1.2 — les propositions, calculées en un seul endroit. */
  const farmNamePattern = t('sign.farmNamePattern')
  const suggest = farmFormSuggestions(
    {
      name,
      locality,
      farmName,
      farmerName: farmer.name,
      farmerPhone: farmer.phone,
      farmerEmail: farmer.email,
      contacts: [],
    },
    farmNamePattern,
  )

  const liaisonNameShown = liaisonSame ? farmer.name : liaisonName
  const liaisonPhoneShown = liaisonSame ? farmer.phone : liaisonPhone

  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))

  /** ★★ AL1 — ce que l'app propose pour « שטחים שמירה », sur l'écran. */
  const guardedSuggestion = suggestedGuardedDunams({
    farmDunams:
      type !== 'unknown' && !activities.crops ? 0
      : Number.isFinite(num(farmDunams)) ? num(farmDunams)
      : 0,
    grazingDunams:
      type !== 'unknown' && !activities.grazing ? 0
      : Number.isFinite(num(grazingDunams)) ? num(grazingDunams)
      : 0,
  })

  /**
   * ★★ AM1.3 — LA LOCALITÉ LA PLUS PROCHE DE L'ÉPINGLE, PROPOSÉE, JAMAIS
   *    ÉCRITE.
   *
   * La forme est celle d'AL1 : une ligne grisée et un bouton. Rien n'est
   * enregistré sans le geste ; la ligne ne s'affiche que tant que le champ est
   * vide, pour qu'un yishuv tapé par le PO ne soit jamais écrasé.
   */
  const nearest = position ? nearestLocalities(position, 1)[0] ?? null : null
  const typedPosition = locality.trim() === '' ? null : positionOfLocality(locality)
  const pinDistanceKm =
    position && typedPosition ? haversineKm(position, typedPosition) : null
  /* Au-delà de 2 km du centre, la ferme est très probablement HORS du יישוב :
     c'est ce que le bouton propose, et le PO peut changer d'avis d'un doigt. */
  const relationFor = (km: number): 'in' | 'attached' => (km <= 2 ? 'in' : 'attached')

  /** ★ AA2 — « סמל יישוב — entier, unique quand présent ». */
  const codeClash =
    localityCode.trim() !== '' &&
    allFarms.some(
      (f) => f.id !== farmId && String(f.localityCode ?? '') === localityCode.trim(),
    )

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ★★ AM1.5 — CE QUI EMPÊCHE ENCORE D'ENREGISTRER, ET POURQUOI.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * « Une fiche incomplète vaut mieux qu'une fiche perdue. » Il ne reste que
   * ce qui rendrait la fiche FAUSSE ou INTROUVABLE — jamais ce qui la laisse
   * seulement incomplète :
   *   · un nom, n'importe lequel (le sien, celui de l'exploitation, celui de
   *     l'agriculteur ou le יישוב) — sans lui la fiche n'existe dans aucune
   *     liste ;
   *   · un numéro de téléphone ou un courriel SAISI mais impossible : c'est un
   *     numéro qu'on composera la nuit ;
   *   · un סמל יישוב déjà porté par une autre fiche (l'import s'y accroche) ;
   *   · « פעילה » sans documents (AK5, une règle métier, pas un champ).
   * ⛔ Le יישוב et l'épingle NE SONT PLUS exigés (AM1.2).
   */
  const effectiveName = inherited(name, suggest.name) || inherited(farmer.name, '')
  const phoneError = (v: string) =>
    v.trim() !== '' && !isValidPhone(v) ? t('form.invalidPhone') : undefined
  const emailError = (v: string) =>
    v.trim() !== '' && !isEmail(v.trim()) ? t('form.invalidEmail') : undefined
  const errors = {
    name: !effectiveName ? t('form.nameMissing') : undefined,
    localityCode: codeClash ? t('form.localityCodeTaken') : undefined,
    farmerPhone: phoneError(farmer.phone),
    farmerEmail: emailError(farmer.email),
    liaisonPhone: liaisonSame ? undefined : phoneError(liaisonPhone),
    standbyPhone: phoneError(standbyPhone),
    /* ★★ AK5.2 — « פעילה » refusée tant que les documents manquent. */
    status:
      status === 'active' &&
      existing?.status !== 'active' &&
      closureBlocked({ type, status, providedDocuments: existing?.providedDocuments })
        ? t('docs.closureBlocked')
        : undefined,
  }
  const contactErrors = contacts.map((c) => ({
    phone: phoneError(c.phone),
    email: emailError(c.email),
  }))
  const errorCount =
    Object.values(errors).filter((e) => e !== undefined).length +
    contactErrors.reduce((n, e) => n + (e.phone ? 1 : 0) + (e.email ? 1 : 0), 0)
  const valid = errorCount === 0

  const show = (key: keyof typeof errors) => (touched ? errors[key] : undefined)

  /* ★ AM1 — un enregistrement refusé MONTRE où, au lieu de ne rien faire : le
     premier champ en faute vient sous les yeux et prend le focus. */
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (attempt === 0) return
    const first = document.querySelector<HTMLElement>('[data-farm-form] [aria-invalid="true"]')
    if (first) {
      first.scrollIntoView({ block: 'center', behavior: 'smooth' })
      first.focus({ preventScroll: true })
    }
  }, [attempt])

  const addContact = () => {
    setContacts((prev) => [
      ...prev,
      {
        id: newContactId(),
        name: '',
        phone: '',
        email: '',
        role: '',
        photo: null,
        isPrimary: false,
      },
    ])
  }

  const patchContact = (index: number, patch: Partial<FarmContact>) => {
    if (patch.isPrimary) setFarmer((f) => ({ ...f, isPrimary: false }))
    setContacts((prev) =>
      prev.map((c, i) =>
        i === index ? { ...c, ...patch } : patch.isPrimary ? { ...c, isPrimary: false } : c,
      ),
    )
  }

  const removeContact = (index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = () => {
    setTouched(true)
    if (!valid) {
      setAttempt((n) => n + 1)
      return
    }

    /* ★★ AM2 — la carte de l'agriculteur écrit ses colonnes ET sa ligne de
       contact ; `mergePeople` garde un seul principal. */
    const merged = mergePeople(farmer, contacts, newContactId)

    /**
     * ★★ AH1.2 — CE QUI EST ENREGISTRÉ EST « TAPÉ, SINON PROPOSÉ ».
     * ⚠️ C'est le seul endroit où une proposition devient une valeur.
     */
    const draft: FarmDraft = {
      photo,
      name: effectiveName,
      locality: locality.trim(),
      localityRelation: locality.trim() === '' || localityRelation === '' ? undefined : localityRelation,
      region: region.trim(),
      regionId: regionId === '' ? null : regionId,
      type,
      entityKind,
      status,
      /* ★ AM1.5 — sans épingle, la fiche garde son point de repli et le
         drapeau qui le dit ; avec, le drapeau tombe. */
      position: position ?? existing?.position ?? positionOfLocality(locality) ?? NEGEV_CENTER,
      positionMissing: position ? undefined : true,
      commitments: commitments.map((c) => ({ ...c, detail: c.detail.trim() })),
      livestock: livestock
        .filter((l) => Number.isFinite(l.heads) && l.heads > 0)
        .map((l) => ({ ...l, label: l.label.trim() })),
      agreements: agreements.map((a) => ({ ...a, signedBy: a.signedBy.trim() })),
      /* ★ AK2.3 — la surface suit la nature. */
      farmDunams:
        type !== 'unknown' && !activities.crops
          ? 0
          : Number.isFinite(num(farmDunams)) ? num(farmDunams) : 0,
      grazingDunams:
        type !== 'unknown' && !activities.grazing
          ? 0
          : Number.isFinite(num(grazingDunams)) ? num(grazingDunams) : 0,
      /* ★ AD1.5 — le drapeau ne se pose jamais sur un zéro. */
      farmDunamsManual:
        farmManual && num(farmDunams) > 0 && (type === 'unknown' || activities.crops),
      grazingDunamsManual:
        grazingManual && num(grazingDunams) > 0 && (type === 'unknown' || activities.grazing),
      guardedDunams: Number.isFinite(num(guardedDunams)) ? num(guardedDunams) : 0,
      guardedDunamsManual: guardedManual && num(guardedDunams) > 0,
      contacts: merged.contacts,
      notes: notes.trim(),
      localityCode: localityCode.trim() === '' ? null : Number(localityCode.trim()),
      council: council.trim(),
      legalEntity,
      landAgreement,
      landAgreementUntil: landAgreementUntil.trim() === '' ? null : landAgreementUntil,
      farmerName: merged.farmerName,
      farmerPhone: merged.farmerPhone,
      farmerEmail: merged.farmerEmail,
      farmerId: merged.farmerId,
      /* AH1.3 — la case cochée écrit l'agriculteur dans les deux champs. */
      liaisonName: liaisonNameShown.trim(),
      liaisonPhone: liaisonPhoneShown.trim(),
      councilHotline: councilHotline.trim(),
      standbyPhone: standbyPhone.trim(),
      siteAccess: siteAccess.trim(),
      gateCode: gateCode.trim(),
      parking: parking.trim(),
      terrainNotes: terrainNotes.trim(),
      farmName: inherited(farmName, suggest.farmName),
      umbrella: umbrella.trim(),
    }

    if (isEdit && farmId) {
      updateFarm(farmId, draft)
      navigate(`/coordinator/farms/${farmId}`)
    } else {
      const farm = createFarm(draft)
      navigate(`/coordinator/farms/${farm.id}`)
    }
  }

  const cancel = () =>
    navigate(isEdit && farmId ? `/coordinator/farms/${farmId}` : '/coordinator/farms')

  /* G2.1/P0bis.1 — the pin map is the LEFT panel. */
  const mapBody = (
    <PinMap
      flush
      value={position}
      onChange={setPosition}
      fallbackCenter={positionOfLocality(locality) ?? NEGEV_CENTER}
    />
  )

  const startSigning = (existingAgreement?: Agreement) => {
    const unsigned = existingAgreement ?? agreements.find((a) => !a.signature)
    setSigning(
      unsigned
        ? {
            ...unsigned,
            signedAt: unsigned.signature ? unsigned.signedAt : iso(now()),
            signedBy: unsigned.signedBy || farmer.name.trim(),
          }
        : {
            id: newAgreementId(),
            signedAt: iso(now()),
            signedBy: farmer.name.trim(),
            fileName: t('form.agreementFileName', { name: name.trim() || '—' }),
          },
    )
  }

  const peopleCount =
    (farmer.name.trim() !== '' || farmer.phone.trim() !== '' ? 1 : 0) +
    contacts.filter((c) => c.name.trim() !== '' || c.phone.trim() !== '').length

  return (
    <MapSplit
      screenKey="farm-form"
      ariaLabel={t('form.sectionFarmLocation')}
      breakpoint="xl"
      contentPercent={50}
      splitHeight="h-[42dvh] min-h-[18rem]"
      map={() => mapBody}
    >
      {() => (
        <>
      <PageHeader
        title={t(isEdit ? 'farms.edit' : 'farms.new')}
        subtitle={isEdit ? existing?.name : undefined}
        back={{
          to:
            isEdit && farmId
              ? `/coordinator/farms/${farmId}`
              : '/coordinator/farms',
          label: t('farms.title'),
        }}
      />

      {/**
        * ★★ AN6 (2026-09-16) — L'EN-TÊTE ÉPINGLÉ. « Quand je fais défiler le
        *    formulaire, je ne sais plus quelle ferme j'édite. » Photo, nom de
        *    la ferme, nom de l'agriculteur — tels qu'ils sont À L'ÉCRAN, donc
        *    à jour pendant la frappe — sur une ligne de 60 px collée en haut
        *    de ce qui défile. ★ AN5 : il porte le bouton de signature, parce
        *    que le bloc « הסכמים » est replié et qu'un bouton dans un bloc
        *    replié ne se voit pas.
        */}
      <div
        data-testid="farm-edit-sticky"
        /* Un élément collant s'arrête au REMBOURRAGE du panneau qui défile (20 px en
           tête) : le `::before` remplit cet interstice, sinon le formulaire y
           passait, visible au-dessus de l'en-tête (vu sur capture à 1 376 px). */
        className="sticky top-[var(--shell-top,0px)] z-20 -mx-[var(--content-pad,1rem)] mb-4 flex items-center gap-3 border-b border-edge-subtle bg-surface-base px-[var(--content-pad,1rem)] py-2 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-surface-base before:content-['']"
      >
        <Avatar photo={photo} name={name || '—'} size="md" shape="square" />
        <div className="min-w-0 flex-1">
          <p data-testid="farm-edit-sticky-name" className="truncate text-caption font-semibold text-content-primary">
            {name.trim() || farmName.trim() || t('farms.new')}
          </p>
          <p data-testid="farm-edit-sticky-farmer" className="muted truncate">
            {farmer.name.trim() || t('people.noFarmer')}
          </p>
        </div>
        <button
          type="button"
          data-testid="farm-sign"
          className="btn-secondary shrink-0"
          onClick={() => startSigning()}
        >
          <Icon name="edit" size={15} />
          {t('agreement.signNow')}
        </button>
      </div>

      {/**
        * ═══════════════════════════════════════════════════════════════════
        * ★★ AM3 (2026-09-16) — L'ÉDITION SUIT L'ORDRE DU DÉTAIL.
        * ═══════════════════════════════════════════════════════════════════
        *
        * « Je ne comprends pas pourquoi l'édition n'est pas pareille. » Les
        * blocs de cet écran sont ceux de la fiche, dans son ordre et sous ses
        * intitulés : l'en-tête (photo, nom) · סטטוס ושטחים · פרטים · אנשים ·
        * טלפוני חירום ותיק אתר · התחייבויות · הסכמים · הערות. Ce que le PO lit
        * au rang N de la fiche, il le modifie au rang N ici. Les blocs de la
        * fiche qui ne se SAISISSENT pas (activité, points, zones, gardes,
        * incidents, visites) n'ont pas de rang ici. `bun run amui` (A217)
        * compare les deux listes d'intitulés.
        */}
      <div className="flex flex-col gap-4" data-farm-form="">
        {/* L'en-tête de la fiche : la photo et le nom. */}
        <FormSection title={t('form.sectionIdentity')} testId="farm-block-identity">
          <div className="col-span-full">
            <PhotoField
              label={t('photo.farmLabel')}
              value={photo}
              onChange={setPhoto}
              name={name}
              shape="square"
            />
          </div>
          {/* ★ AH1.5 — le nom se propose en gris depuis שם החווה. */}
          <TextField
            label={t('form.name')}
            value={name}
            onChange={setName}
            suggestion={suggest.name}
            testId="farm-form-name"
            error={show('name')}
          />
        </FormSection>

        {/* ═══ 1 — סטטוס ושטחים : la bande de chiffres de la fiche. ═══ */}
        <FormSection title={t('form.sectionStatusAreas')} testId="farm-block-statusAreas">
          <SelectField<FarmStatus>
            label={t('form.status')}
            value={status}
            onChange={setStatus}
            error={errors.status}
            options={STATUSES.map((v) => ({
              value: v,
              label: t(`farmStatus.${v}`),
            }))}
          />
          {/**
            * ★★ AK2.1 — « NATURE DE L'ACTIVITÉ », À CHOIX MULTIPLE, EN TÊTE DES
            *    SURFACES QU'ELLE GOUVERNE. Rien de coché = לא ידוע.
            */}
          <fieldset className="col-span-full" data-testid="farm-activities">
            <legend className="label">{t('form.activity')}</legend>
            <div className="flex flex-wrap items-center gap-2">
              {ACTIVITIES.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="checkbox"
                  aria-checked={activities[id]}
                  data-testid={`activity-${id}`}
                  onClick={() =>
                    setType(typeOfActivities({ ...activities, [id]: !activities[id] }))
                  }
                  className={`filter-pill min-h-[2.75rem] px-4 ${
                    activities[id] ? 'filter-pill-active' : ''
                  }`}
                >
                  <Icon name={activities[id] ? 'check' : 'plus'} size={15} />
                  {t(`activity.${id}`)}
                </button>
              ))}
              {type === 'unknown' && (
                <span className="muted text-micro">{t('form.activityUnknown')}</span>
              )}
            </div>
            {type !== 'unknown' &&
              ((!activities.crops && num(farmDunams) > 0) ||
                (!activities.grazing && num(grazingDunams) > 0)) && (
                <p className="mt-1 text-micro font-semibold text-status-warn-ink" role="status">
                  {t('form.activityDropsArea')}
                </p>
              )}
          </fieldset>
          {/* ★★ AD1 — la surface DÉCLARÉE ; la ligne dessous donne la mesurée. */}
          {(type === 'unknown' || activities.crops) && (
          <div>
            <TextField
              label={t('form.farmArea')}
              value={farmDunams}
              testId="farm-area-cultivated"
              onChange={(v) => {
                setFarmHectares(v)
                setFarmManual(true)
                if (type === 'unknown' && Number(v) > 0) setType('agriculture')
              }}
              kind="decimal"
            />
            <DunamSourceRow
              typed={farmDunams}
              measured={zoneSum('farm_boundary')}
              onAdopt={(sum) => {
                setFarmManual(sum > 0)
                setFarmHectares(String(sum))
              }}
            />
          </div>
          )}
          {(type === 'unknown' || activities.grazing) && (
          <div>
            <TextField
              label={t('form.grazingArea')}
              value={grazingDunams}
              testId="farm-area-grazing"
              onChange={(v) => {
                setGrazingHectares(v)
                setGrazingManual(true)
                if (type === 'unknown' && Number(v) > 0) setType('livestock')
              }}
              kind="decimal"
            />
            <DunamSourceRow
              typed={grazingDunams}
              measured={zoneSum('grazing_area')}
              onAdopt={(sum) => {
                setGrazingManual(sum > 0)
                setGrazingHectares(String(sum))
              }}
            />
          </div>
          )}
          {/* ★★ AC3 → AK1.6 → AL1 — « שטחים שמירה » : PROPOSÉE, JAMAIS ÉCRITE. */}
          <div>
            <TextField
              label={t('form.guardedArea')}
              hint={t('form.guardedAreaHint')}
              value={guardedDunams}
              testId="farm-area-guarded"
              onChange={(v) => {
                setGuardedDunams(v)
                setGuardedManual(v.trim() !== '')
              }}
              kind="decimal"
            />
            <GuardedSuggestionRow
              typed={guardedDunams}
              suggestion={guardedSuggestion}
              onAdopt={(sum) => {
                setGuardedDunams(String(sum))
                setGuardedManual(true)
              }}
            />
          </div>

          {/* ★ PO POINT 6 — les têtes, dans le même bloc que la carte « סה״כ
              ראשים » de la bande, et seulement pour une entité qui en a. */}
          {keepsLivestock({ type }) && (
            <div className="col-span-full" data-testid="farm-livestock">
              <div className="mb-2 flex items-center justify-between gap-3">
                {/* ★ PO POINT 6 · A30 — replié par défaut, comme avant AM : fermé,
                    il DIT le total, qui est le fait ; seule la saisie se replie. */}
                <button
                  type="button"
                  aria-expanded={livestockOpen}
                  data-testid="livestock-toggle"
                  onClick={() => setLivestockOpen((v) => !v)}
                  className="flex min-h-[2.75rem] min-w-0 flex-1 items-center gap-1.5 text-start"
                >
                  <span className={`text-content-muted transition-transform duration-fast ${livestockOpen ? '' : 'ltr:-rotate-90 rtl:rotate-90'}`}>
                    <Icon name="chevronDown" size={16} />
                  </span>
                  <span className="label !mb-0">{t('livestock.section')}</span>
                  {!livestockOpen && livestock.length > 0 && (
                    <span className="chip ms-1 bg-surface-high text-content-secondary">
                      {livestock.reduce((n, l) => n + (l.heads || 0), 0).toLocaleString()} {t('livestock.total')}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  data-testid="livestock-add"
                  onClick={() => {
                    setLivestockOpen(true)
                    setLivestock((prev) => [...prev, { kind: 'sheep', label: '', heads: 0 }])
                  }}
                  className="btn-ghost min-h-[2.75rem]"
                >
                  <Icon name="plus" size={15} />
                  {t('livestock.add')}
                </button>
              </div>
              {!livestockOpen ? null : livestock.length === 0 ? (
                <p className="muted">{t('livestock.empty')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {livestock.map((l, i) => (
                    <div
                      key={i}
                      className="rounded-field border border-edge-subtle bg-surface-high p-3"
                    >
                      <div className="auto-cols gap-3 [--col-min:9rem]">
                        <SelectField<LivestockKind>
                          label={t('livestock.kind')}
                          value={l.kind}
                          onChange={(kind) =>
                            setLivestock((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, kind } : x)),
                            )
                          }
                          options={LIVESTOCK_KINDS.map((k) => ({
                            value: k,
                            label: t(`livestock.kinds.${k}`),
                          }))}
                        />
                        <TextField
                          label={t('livestock.heads')}
                          value={l.heads === 0 ? '' : String(l.heads)}
                          onChange={(v) =>
                            setLivestock((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, heads: Number(v) || 0 } : x,
                              ),
                            )
                          }
                          kind="integer"
                        />
                        {/* The free label belongs to `other` and to nothing else. */}
                        {l.kind === 'other' && (
                          <TextField
                            label={t('livestock.label')}
                            value={l.label}
                            onChange={(label) =>
                              setLivestock((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, label } : x)),
                              )
                            }
                            placeholder={t('livestock.labelPlaceholder')}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setLivestock((prev) => prev.filter((_, j) => j !== i))
                          }
                          className="btn-ghost min-h-[2.75rem] self-end text-status-danger-ink hover:bg-status-danger/10"
                        >
                          <Icon name="trash" size={15} />
                          {t('livestock.remove')}
                        </button>
                      </div>
                    </div>
                  ))}
                  <p className="text-caption font-medium text-content-primary">
                    {t('livestock.total')}:{' '}
                    <span className="numeric">
                      {livestock.reduce((n, l) => n + (l.heads || 0), 0).toLocaleString()}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </FormSection>

        {/* ═══ 2 — פרטים : le bloc « פרטים » de la fiche, dans son ordre. ═══ */}
        <FormSection title={t('common.details')} testId="farm-block-details">
          <TextField
            label={t('form.farmName')}
            hint={t('form.farmNameHint')}
            value={farmName}
            onChange={setFarmName}
            suggestion={suggest.farmName}
            testId="farm-form-farmName"
          />
          <TextField
            label={t('form.umbrella')}
            value={umbrella}
            onChange={setUmbrella}
          />
          {/* G16 — what KIND of entity this record is. */}
          <SelectField<EntityKind>
            label={t('form.entityKind')}
            value={entityKind}
            onChange={setEntityKind}
            options={(['farm', 'moshav', 'other'] as EntityKind[]).map((v) => ({
              value: v,
              label: t(`entityKind.${v}`),
            }))}
          />

          {/* ★★ AM1 — LE יישוב : facultatif, la liste entière, et la relation. */}
          <div className="col-span-full" data-testid="farm-locality-block">
            <LocalityField
              label={t('form.locality')}
              hint={t('locality.optionalHint')}
              value={locality}
              onChange={setLocality}
              near={position}
              testId="farm-form-locality"
              onPick={(l) => {
                if (position) setLocalityRelation(relationFor(haversineKm(position, l.position)))
              }}
            />
            {locality.trim() === '' && nearest && (
              <div
                className="mt-1 flex flex-wrap items-center gap-2"
                data-testid="farm-locality-suggestion"
              >
                <span className="muted">
                  {t('locality.nearestHint')} ·{' '}
                  <span className="font-medium text-content-primary" data-testid="farm-locality-suggestion-name">
                    {nearest.locality.name}
                  </span>{' '}
                  <span className="ltr-nums">({t('locality.km', { km: nearest.km.toFixed(1) })})</span>
                </span>
                <button
                  type="button"
                  data-testid="farm-locality-adopt"
                  onClick={() => {
                    setLocality(nearest.locality.name)
                    setLocalityRelation(relationFor(nearest.km))
                  }}
                  className="inline-flex min-h-[2.75rem] items-center px-1 text-micro font-semibold text-accent-ink hover:underline"
                >
                  {t('locality.nearestUse')}
                </button>
              </div>
            )}
            {locality.trim() !== '' && (
              <div className="mt-2" role="radiogroup" aria-label={t('locality.relation')}>
                <div className="flex flex-wrap items-center gap-2">
                  {(['in', 'attached'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={localityRelation === r}
                      data-testid={`farm-locality-relation-${r}`}
                      onClick={() => setLocalityRelation(localityRelation === r ? '' : r)}
                      className={`filter-pill min-h-[2.75rem] px-4 ${
                        localityRelation === r ? 'filter-pill-active' : ''
                      }`}
                    >
                      {localityRelation === r && <Icon name="check" size={15} />}
                      {t(r === 'in' ? 'locality.relationIn' : 'locality.relationAttached')}
                    </button>
                  ))}
                </div>
                {pinDistanceKm !== null && (
                  <p className="muted mt-1 ltr-nums" data-testid="farm-locality-distance">
                    {t('locality.distance', { km: pinDistanceKm.toFixed(1) })}
                  </p>
                )}
              </div>
            )}
          </div>
          {/* ★★ AF3.1 — le lien reçu par WhatsApp, à côté de « c'est où ». */}
          <PositionLinkField className="col-span-full" onResolve={setPosition} />
          {!position && (
            <p className="muted col-span-full" data-testid="farm-no-pin" role="note">
              {t('form.noPin')}
            </p>
          )}
          <TextField label={t('form.region')} value={region} onChange={setRegion} />
          {/* X12.2 — blank = derived from the position. See `farmRegion`. */}
          <SelectField<RegionId | ''>
            label={t('form.regionStd')}
            value={regionId}
            onChange={setRegionId}
            options={[
              { value: '', label: t('form.regionStdHint') },
              ...regions().map((r) => ({ value: r.id, label: r.name })),
            ]}
          />
          <TextField
            label={t('form.localityCode')}
            hint={t('form.localityCodeHint')}
            value={localityCode}
            onChange={setLocalityCode}
            error={show('localityCode')}
            kind="code"
          />
          <TextField
            label={t('form.council')}
            value={council}
            onChange={setCouncil}
          />
          <SelectField<string>
            label={t('form.legalEntity')}
            value={legalEntity}
            onChange={setLegalEntity}
            options={[
              { value: '', label: t('form.notChosen') },
              ...LEGAL_ENTITY_OPTIONS.map((o) => ({ value: o.id, label: o.label })),
            ]}
          />
          <SelectField<string>
            label={t('form.landAgreement')}
            value={landAgreement}
            onChange={setLandAgreement}
            options={[
              { value: '', label: t('form.notChosen') },
              ...LAND_AGREEMENT_OPTIONS.map((o) => ({ value: o.id, label: o.label })),
            ]}
          />
          <TextField
            label={t('form.landAgreementUntil')}
            hint={t('form.landAgreementUntilHint')}
            value={landAgreementUntil}
            onChange={setLandAgreementUntil}
            kind="date"
          />
        </FormSection>

        {/* ═══ 3 — אנשים : un seul endroit pour les personnes de la fiche. ═══ */}
        <FormSection
          title={t('people.section')}
          testId="farm-block-people"
          summary={
            <span className="chip ms-2 bg-surface-high text-content-secondary">
              {t('people.summary', { count: peopleCount })}
            </span>
          }
        >
          <PersonEditor
            title={t('people.farmer')}
            testId="person-farmer"
            card={farmer}
            onChange={patchFarmer}
            withId
            errors={{ phone: show('farmerPhone'), email: show('farmerEmail') }}
            showPrimary={contacts.length > 0}
          />

          {/* ★★ AH1.3 — le contact de terrain : la case qui recopie, au-dessus. */}
          <div
            className="col-span-full rounded-field border border-edge-subtle bg-surface-high p-3"
            data-testid="person-liaison"
          >
            <p className="mb-2 text-caption font-semibold text-content-primary">
              {t('people.liaison')}
            </p>
            <label
              className="flex min-h-[2.75rem] items-center gap-2.5"
              data-testid="liaison-same-row"
            >
              <input
                type="checkbox"
                data-testid="liaison-same"
                className="check"
                checked={liaisonSame}
                onChange={(e) => {
                  const on = e.target.checked
                  setLiaisonSame(on)
                  /* ⚠️ DÉCOCHER NE VIDE PAS : le PO retrouve les valeurs. */
                  if (on) {
                    setLiaisonName(farmer.name)
                    setLiaisonPhone(farmer.phone)
                  }
                }}
              />
              <span className="text-caption text-content-secondary">
                {t('form.liaisonSame')}
              </span>
            </label>
            {liaisonSame ? (
              <p className="text-caption text-content-secondary" data-testid="liaison-echo">
                {liaisonNameShown || '—'}
                {liaisonPhoneShown && (
                  <>
                    {' · '}
                    <span className="ltr-nums font-medium text-content-primary">
                      {liaisonPhoneShown}
                    </span>
                  </>
                )}
              </p>
            ) : (
              <div className="auto-cols mt-2 gap-3 [--col-min:9rem] md:[--col-min:13rem]">
                <TextField
                  label={t('people.name')}
                  hint={t('form.liaisonNameHint')}
                  value={liaisonName}
                  onChange={setLiaisonName}
                  testId="liaison-name"
                  kind="name"
                />
                <TextField
                  label={t('people.mobile')}
                  value={liaisonPhone}
                  onChange={setLiaisonPhone}
                  testId="liaison-phone"
                  error={show('liaisonPhone')}
                  kind="phone"
                />
              </div>
            )}
          </div>

          {contacts.map((contact, i) => (
            <PersonEditor
              key={contact.id}
              title={contact.role.trim() || t('people.other')}
              testId={`person-contact-${i}`}
              card={contact}
              onChange={(patch) => patchContact(i, patch)}
              withId={false}
              errors={{
                phone: touched ? contactErrors[i]?.phone : undefined,
                email: touched ? contactErrors[i]?.email : undefined,
              }}
              onRemove={() => removeContact(i)}
              showPrimary
            />
          ))}

          <button
            type="button"
            onClick={addContact}
            data-testid="person-add"
            className="btn-ghost col-span-full min-h-[2.75rem] justify-center border border-dashed border-edge-strong"
          >
            <Icon name="plus" size={15} />
            {t('people.addOther')}
          </button>
        </FormSection>

        {/* ═══ 4 — טלפוני חירום ותיק אתר (AE2), replié, comme sur la fiche. ═══ */}
        <FormSection
          title={t('settings.emergencyFields.title')}
          testId="farm-block-emergency"
          storageKey={`farm-form-emergency:${farmId ?? 'new'}`}
          defaultOpen={false}
          summary={
            <span className="chip ms-2 bg-surface-high text-content-secondary">
              {[standbyPhone.trim(), councilHotline.trim()].filter(Boolean).length === 2
                ? t('settings.emergencyFields.bothSet')
                : t('settings.emergencyFields.someMissing')}
            </span>
          }
        >
          <TextField
            label={t('settings.emergencyFields.standbyPhone')}
            hint={t('settings.emergencyFields.standbyPhoneHint')}
            value={standbyPhone}
            onChange={setStandbyPhone}
            error={show('standbyPhone')}
            kind="phone"
          />
          <TextField
            label={t('settings.emergencyFields.councilHotline')}
            hint={t('settings.emergencyFields.councilHotlineHint')}
            value={councilHotline}
            onChange={setCouncilHotline}
            kind="phone"
          />
          <TextField
            label={t('emergency.siteAccess')}
            value={siteAccess}
            onChange={setSiteAccess}
          />
          <TextField
            label={t('emergency.gateCode')}
            value={gateCode}
            onChange={setGateCode}
          />
          <TextField
            label={t('emergency.parking')}
            value={parking}
            onChange={setParking}
          />
          <TextArea
            label={t('emergency.terrain')}
            value={terrainNotes}
            onChange={setTerrainNotes}
            rows={3}
            className="col-span-full"
          />
        </FormSection>

        {/* ═══ 5 — התחייבויות בעל החווה (G2.4). ═══ */}
        <FormSection
          title={t('commitment.title')}
          testId="farm-block-commitments"
          /* ★ AM3 — replié par défaut, COMME AU DÉTAIL (et A30 : 390 px). */
          storageKey={`farm-form-commitments:${farmId ?? 'new'}`}
          defaultOpen={false}
          summary={
            <span className="chip ms-2 bg-surface-high text-content-secondary">
              {t('blocks.commitments', {
                count: commitments.length,
                done: commitments.filter((c) => c.fulfilled).length,
              })}
            </span>
          }
          action={
            <button
              type="button"
              onClick={() =>
                setCommitments((prev) => [
                  ...prev,
                  { kind: 'shelter', detail: '', fulfilled: false },
                ])
              }
              className="btn-ghost min-h-[2.75rem]"
            >
              <Icon name="plus" size={15} />
              {t('form.addCommitment')}
            </button>
          }
        >
          {commitments.length === 0 ? (
            <p className="muted col-span-full">{t('common.none')}</p>
          ) : (
            commitments.map((c, i) => (
              <div
                key={i}
                className="rounded-field border border-edge-subtle bg-surface-high p-3 col-span-full"
              >
                <div className="auto-cols gap-3 [--col-min:13rem]">
                  <SelectField<CommitmentKind>
                    label={t('form.commitmentKind')}
                    value={c.kind}
                    onChange={(kind) =>
                      setCommitments((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, kind } : x)),
                      )
                    }
                    options={(
                      ['shelter', 'water', 'food', 'other'] as CommitmentKind[]
                    ).map((k) => ({ value: k, label: t(`commitment.${k}`) }))}
                  />
                  <TextField
                    label={t('form.commitmentDetail')}
                    value={c.detail}
                    onChange={(detail) =>
                      setCommitments((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, detail } : x)),
                      )
                    }
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <label className="flex min-h-[2.75rem] items-center gap-2 text-caption text-content-secondary">
                    <input
                      type="checkbox"
                      checked={c.fulfilled}
                      onChange={(e) =>
                        setCommitments((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, fulfilled: e.target.checked } : x,
                          ),
                        )
                      }
                      className="check"
                    />
                    {t('commitment.fulfilled')}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setCommitments((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="btn-ghost min-h-[2.75rem] text-status-danger-ink hover:bg-status-danger/10"
                  >
                    <Icon name="trash" size={15} />
                    {t('common.remove')}
                  </button>
                </div>
              </div>
            ))
          )}
        </FormSection>

        {/* ═══ 6 — הסכמים. ═══ */}
        <FormSection
          title={t('farms.agreements')}
          testId="farm-block-agreements"
          storageKey={`farm-form-agreements:${farmId ?? 'new'}`}
          defaultOpen={false}
          summary={
            <span className="chip ms-2 bg-surface-high text-content-secondary">
              {t('blocks.agreements', { count: agreements.length })}
            </span>
          }
          action={
            <button
              type="button"
              onClick={() => startSigning()}
              className="btn-ghost min-h-[2.75rem]"
            >
              <Icon name="edit" size={15} />
              {t('agreement.signNow')}
            </button>
          }
        >
          {agreements.length === 0 ? (
            <p className="muted col-span-full">{t('farms.noAgreements')}</p>
          ) : (
            agreements.map((a, i) => (
              <div
                key={a.id}
                className="rounded-field border border-edge-subtle bg-surface-high p-3 col-span-full"
              >
                {/* ★ AN5.3 — plus de champs « signataire » et « date » ici : ils
                    sont inscrits, et modifiables, DANS la fenêtre de signature. */}
                <p className="text-caption text-content-primary" data-testid="agreement-summary">
                  {a.signedBy || farmer.name.trim() || '—'}
                  <span className="muted ltr-nums"> · {formatDate(a.signedAt, locale)}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={`chip ${
                        a.signature
                          ? 'bg-status-success/15 text-status-success-ink'
                          : 'bg-surface-high text-content-muted'
                      }`}
                    >
                      {a.signature ? t('signature.signed') : t('signature.missing')}
                    </span>
                    <button
                      type="button"
                      data-testid="signature-open"
                      className="btn-ghost min-h-[2.75rem]"
                      onClick={() => startSigning(a)}
                    >
                      <Icon name="edit" size={15} />
                      {a.signature ? t('agreement.view') : t('agreement.openReader')}
                    </button>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAgreements((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="btn-ghost min-h-[2.75rem] text-status-danger-ink hover:bg-status-danger/10"
                  >
                    <Icon name="trash" size={15} />
                    {t('common.remove')}
                  </button>
                </div>
              </div>
            ))
          )}
        </FormSection>

        {/* ═══ 7 — הערות. ═══ */}
        <FormSection
          title={t('common.notes')}
          testId="farm-block-notes"
          storageKey={`farm-form-notes:${farmId ?? 'new'}`}
          defaultOpen={false}
          summary={
            <span className="ms-2 min-w-0 truncate text-caption text-content-muted">
              {notes.trim() ? notes.trim().split('\n')[0] : t('common.none')}
            </span>
          }
        >
          <TextArea
            label={t('form.notes')}
            value={notes}
            onChange={setNotes}
            rows={4}
            className="col-span-full"
          />
        </FormSection>

        {signing && (
          <AgreementSignModal
            farm={signingFarm}
            agreement={signing}
            onClose={() => setSigning(null)}
            onCommit={(signature, meta) => {
              /* ★★ AF1.3 — l'encre NEUVE date le document ; ★ AN5 — le nom et
                 la date viennent de la fenêtre, où ils ont pu être corrigés. */
              setAgreements((prev) => {
                const next = { ...signing, ...meta, signature }
                return prev.some((x) => x.id === signing.id)
                  ? prev.map((x) => (x.id === signing.id ? next : x))
                  : [...prev, next]
              })
              setSigning(null)
            }}
          />
        )}

        <FormActions
          onCancel={cancel}
          cancelLabel={t('common.cancel')}
          submitLabel={t('common.save')}
          onSubmit={submit}
          message={
            touched && !valid ? t('form.notSaved', { count: errorCount }) : undefined
          }
        />
      </div>
        </>
      )}
    </MapSplit>
  )
}
