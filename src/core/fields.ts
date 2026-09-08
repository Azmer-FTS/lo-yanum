import type { FarmType } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AA2 · AA3 (2026-09-07) — THE FIELD LISTS AND THE WEIGHTING, IN ONE FILE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The product owner's instruction is the whole design brief for this file:
 *
 *   « Ces listes sont définies dans UN SEUL fichier de configuration, réutilisé
 *     par le formulaire, l'import et l'export. Le PO ajoutera des valeurs. »
 *
 * ★ SO AN OPTION IS A ROW, AND ADDING ONE IS ADDING A ROW. The form's picker,
 *   the importer's dictionary and the exporter's label all read the same
 *   array; there is no second place where a value has to be repeated, and no
 *   `switch` anywhere that would have to grow a case. G10 learned this on the
 *   import templates — a column declared in three places is a column that will
 *   be forgotten in one of them — and this is the same lesson applied to the
 *   VALUES rather than to the columns.
 *
 * ★ AND THE MEANING TRAVELS WITH THE VALUE, NOT BESIDE IT. `establishesRight`
 *   is a property of the agreement kind (AA2bis), so the day the product owner
 *   adds « הסכם הרשאה עונתי » he answers the question that matters — does this
 *   paper prove the signatory holds the land — in the same line where he names
 *   it. A separate list of "the weak ones" kept somewhere else is a list that
 *   goes stale the first time somebody adds a row here and not there.
 *
 * ⚠️ WHAT IS STORED IS THE `id`, NOT THE LABEL. The Hebrew is what the
 *    coordinator reads and what the association's workbook contains; the id is
 *    what survives a re-wording. Both directions are in `readOption` /
 *    `optionLabel` below, and nothing else should map between them.
 *
 * PURE: no React, no DOM, no i18next — like everything under /src/core.
 */

export interface FieldOption {
  /** Stored on the record. Stable; never re-spelt. */
  id: string
  /** What the coordinator reads, and what the workbook carries. */
  label: string
  /**
   * Other spellings seen in the wild. Matched case- and space-insensitively as
   * a whole string after normalisation — NOT as a substring, because
   * « לא ידוע » is a value in three different lists here and a substring match
   * would let one of them answer for another.
   */
  aliases?: readonly string[]
}

/**
 * Normalise a cell or a header before comparing it.
 *
 * ⚠️ THE HEBREW PUNCTUATION IS THE POINT. `למ״ס` is written with a GERSHAYIM
 *    (U+05F4) in the association's workbook and with a plain double quote by
 *    everybody who types it on a laptop; `גד״ש` and `שח״ם` are the same story.
 *    A dash may be an ASCII hyphen, an en dash, an em dash or a Hebrew MAQAF
 *    (U+05BE). None of that is a different value, and a comparison that thinks
 *    it is will tell the coordinator his own file is wrong.
 */
export function normaliseValue(raw: string): string {
  return raw
    .replace(/[״“”″"]/g, '"')
    .replace(/[׳‘’′']/g, "'")
    .replace(/[־‐‑‒–—―]/g, '-')
    .replace(/[ ‎‏‪-‮]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The option whose label or alias this cell names, or `null`. */
export function readOption(
  raw: string,
  options: readonly FieldOption[],
): FieldOption | null {
  const v = normaliseValue(raw)
  if (v === '') return null
  return (
    options.find(
      (o) =>
        normaliseValue(o.id) === v ||
        normaliseValue(o.label) === v ||
        (o.aliases ?? []).some((a) => normaliseValue(a) === v),
    ) ?? null
  )
}

/** The Hebrew for a stored id — for the sheet, the form and the detail page. */
export function optionLabel(id: string | null | undefined, options: readonly FieldOption[]): string {
  if (!id) return ''
  return options.find((o) => o.id === id)?.label ?? id
}

// ---------------------------------------------------------------------------
// AA2 — סוג הישות המשפטית
// ---------------------------------------------------------------------------

/**
 * WHO the counterpart is, legally. It decides who may sign at all: a קיבוץ
 * signs through its אגודה, a גד״ש through its partners, a רועה for himself.
 */
export const LEGAL_ENTITY_OPTIONS: readonly FieldOption[] = [
  { id: 'private_farmer', label: 'חקלאי פרטי', aliases: ['פרטי', 'private'] },
  { id: 'cooperative', label: 'אגודה שיתופית', aliases: ['אגודה', 'cooperative'] },
  { id: 'gadash', label: 'גד״ש', aliases: ['גדש', 'גד"ש'] },
  { id: 'shaham', label: 'שח״ם', aliases: ['שחם', 'שח"ם'] },
  { id: 'kibbutz', label: 'קיבוץ', aliases: ['kibbutz'] },
  { id: 'moshav', label: 'מושב', aliases: ['moshav'] },
  { id: 'herder', label: 'רועה/בעל עדר', aliases: ['רועה', 'בעל עדר', 'רועה / בעל עדר'] },
  { id: 'unknown_entity', label: 'לא ידוע', aliases: ['unknown'] },
]

// ---------------------------------------------------------------------------
// AA2 · AA2bis — סוג הסכם קרקע, and what each one proves
// ---------------------------------------------------------------------------

export interface LandAgreementOption extends FieldOption {
  /**
   * ★★ AA2bis — DOES THIS PAPER SHOW THE SIGNATORY HOLDS THE LAND?
   *
   * « Raison métier : ne pas organiser de gardes sur un terrain qui
   *   n'appartient pas au signataire. »
   *
   * A declaration by the farmers is not a document of rights; "no document"
   * and "not known" say so themselves. Everything else is an instrument the
   * State issued to somebody, so it answers the question. The flag WARNS and
   * never blocks — a farm whose paperwork is thin is exactly a farm the
   * programme wants on its list, with the gap visible.
   */
  establishesRight: boolean
  /** One line of what it actually is — from the workbook's own מקרא sheet. */
  note?: string
}

export const LAND_AGREEMENT_OPTIONS: readonly LandAgreementOption[] = [
  {
    id: 'perpetual_lease',
    label: 'חוזה חכירה לדורות',
    establishesRight: true,
    note: 'הזכות החזקה ביותר. ארבע תקופות מתחדשות של 49 שנה. רמ״י.',
  },
  {
    id: 'mishbetzet_lease',
    label: 'חוזה שכירות משבצת (תלת-צדדי)',
    aliases: ['חוזה שכירות משבצת', 'משבצת', 'חוזה שכירות משבצת (תלת צדדי)'],
    establishesRight: true,
    note: 'רמ״י + הסוכנות היהודית + האגודה. מתחדש כל שלוש שנים.',
  },
  {
    id: 'grazing_permit',
    label: 'הסכם הרשאה לרעייה',
    aliases: ['הרשאה לרעייה', 'הרשאה לרעיה'],
    establishesRight: true,
    note: 'בר-רשות בלבד. זכות חלשה, לתקופה קצובה, לא עבירה ולא ניתנת להורשה.',
  },
  {
    id: 'temporary_permit',
    label: 'הסכם הרשאה זמני',
    aliases: ['הרשאה זמנית', 'הרשאה זמני'],
    establishesRight: true,
  },
  {
    id: 'farmer_declaration',
    label: 'הצהרת חקלאים בלבד',
    aliases: ['הצהרת חקלאים'],
    establishesRight: false,
    note: 'אינו מסמך זכויות. לא מספיק כדי לאמת חזקה על הקרקע.',
  },
  { id: 'no_document', label: 'אין מסמך', establishesRight: false },
  { id: 'unknown_agreement', label: 'לא ידוע', establishesRight: false },
]

// ---------------------------------------------------------------------------
// AA3 — דונם משוקלל
// ---------------------------------------------------------------------------

/**
 * ★★ AA3.1 — THE TWO COEFFICIENTS AND THE TARGET, NAMED, WITH THEIR ORIGIN.
 *
 *   « דונם משוקלל = שטח מעובד × 1 + שטח מרעה × 0,02. Les deux coefficients et
 *     l'objectif sont des CONSTANTES NOMMÉES dans un seul fichier de
 *     configuration, commentées avec leur origine. »
 *
 * ★ WHERE 0.02 COMES FROM, because a bare 0.02 in a reduce is a number nobody
 *   can ever check. It is the State's own subsidy ratio for grazing land:
 *   ONE TO FIFTY — fifty dunams of open grazing are funded as one dunam of
 *   cultivated ground, on the reasoning that a herd's range is not a crop.
 *   1 / 50 = 0.02. The association's workbook states the same ratio on its
 *   מקרא sheet, in the same words.
 *
 * ⚠️ THE APP RECOMPUTES THIS, ALWAYS, and never imports the column (AA4.7).
 *    A weighted figure that arrived from a spreadsheet is a figure whose
 *    coefficients nobody in this codebase chose.
 */
export const WEIGHTED_DUNAM = {
  /** שטח מעובד — counted as itself. */
  cultivated: 1,
  /** שטח מרעה — the 1:50 grazing ratio. */
  grazing: 0.02,
} as const

/**
 * The month's target, in weighted dunams. From the workbook's מקרא sheet
 * (« יעד דונם משוקלל לסוף החודש »), which is where the association sets it.
 *
 * ⚠️ ★★ AB5a.4 (2026-09-08) — THIS IS NOW THE **INITIAL** VALUE, AND IT STAYS
 *    A NAMED CONSTANT FOR THAT REASON.
 *
 *      « L'objectif reste une constante nommée comme valeur INITIALE ; les
 *        réglages la surchargent. »
 *
 *    `ui/settings/target.ts` holds the coordinator's own campaign — figure,
 *    deadline, label, what happens when it is passed, and the campaigns
 *    already achieved — and the dashboard reads THAT. A device that has never
 *    opened הגדרות → יעד reads this line, and « חזרה לערך ההתחלתי » comes back
 *    to it. Editing this number therefore changes what a NEW device starts
 *    with, not what the product owner is currently working towards.
 */
export const WEIGHTED_DUNAM_TARGET = 100_000

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AD1 (2026-09-08) — DEUX SURFACES QUI COEXISTENT ET NE S'ÉCRASENT JAMAIS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Une exploitation a désormais DEUX surfaces : la surface DÉCLARÉE — celle
 *     du contrat, du fichier, ou saisie à la main — et la surface MESURÉE,
 *     calculée par le polygone tracé sur la carte. Aucune des deux n'écrase
 *     l'autre, jamais, dans aucun sens. »
 *
 * ★★ LA DÉCLARÉE EST STOCKÉE, LA MESURÉE EST DÉRIVÉE, ET C'EST TOUT LE
 *    CORRECTIF G15.
 *
 *    Jusqu'ici il n'y avait qu'UN couple de champs et un drapeau `*Manual`
 *    pour arbitrer qui avait le droit d'y écrire. Le défaut nommé en AC — et
 *    laissé ouvert pour le PO — en découlait mécaniquement : l'export écrit la
 *    surface de CHAQUE ligne, l'import relit un nombre non nul comme un
 *    remplacement, donc une fiche dont les chiffres venaient de ses polygones
 *    ramassait le drapeau au retour et cessait pour toujours de suivre son
 *    contour. Ce n'était pas un bug d'implémentation : c'était une seule case
 *    pour deux faits différents.
 *
 *    ⚠️ IL N'Y A PLUS DE CASE À RAMASSER. `farmDunams` / `grazingDunams` sont
 *       la DÉCLARÉE, et rien qui vienne de la carte ne les touche. La MESURÉE
 *       n'est pas un champ qu'un import pourrait atteindre : elle est
 *       RECALCULÉE depuis `farmZones` à chaque mutation de polygone et à
 *       chaque hydratation (`remeasureFarms`, core/store.ts). Un aller-retour
 *       export/import complet ne peut donc pas la figer — il n'y a rien à
 *       figer — et A109 le mesure exactement dans cet ordre.
 *
 * ★ QUAND UNE SEULE DES DEUX EXISTE, ELLE SERT SEULE (AD1.4). Pas de note, pas
 *   d'alerte : une fiche sans polygone n'est pas en défaut, et une fiche dont
 *   personne n'a déclaré la surface non plus. `effectiveAreas` est la lecture
 *   « donne-moi LA surface » — la déclarée d'abord, la mesurée à défaut — et
 *   c'est elle que la pondération, la surface gardée et les totaux lisent.
 *
 * ★ LA PONDÉRATION S'APPUIE SUR LA DÉCLARÉE (AD1.3), parce que c'est elle qui
 *   figure au contrat remis à l'État. Le coefficient et le total ne bougent
 *   pas d'un dounam : 800 / 100 / 220 (A110).
 */

/** AD1 — la surface déclarée : deux champs, toujours présents. */
export interface HasDeclaredAreas {
  /** שטח מעובד (דונם) — DÉCLARÉ. Zéro = personne n'a déclaré. */
  farmDunams: number
  /** שטח מרעה (דונם) — DÉCLARÉ. */
  grazingDunams: number
}

/**
 * AD1 — la surface mesurée : dérivée des polygones, jamais persistée, jamais
 * importée. Absente quand la ferme ne porte aucun contour de ce genre.
 */
export interface HasMeasuredAreas {
  measuredFarmDunams?: number
  measuredGrazingDunams?: number
}

export interface HasAreas extends HasDeclaredAreas, HasMeasuredAreas {}

/** Un couple de surfaces et son total, en dounams entiers. */
export interface AreaPair {
  /** מעובד. */
  cultivated: number
  /** מרעה. */
  grazing: number
  /** La somme des deux — ce qu'on appelle « la surface » en une phrase. */
  total: number
}

function pair(cultivated: number, grazing: number): AreaPair {
  const c = Math.round(cultivated)
  const g = Math.round(grazing)
  return { cultivated: c, grazing: g, total: c + g }
}

const NO_AREAS: AreaPair = { cultivated: 0, grazing: 0, total: 0 }

/**
 * AD1 — la surface DÉCLARÉE, ou `null` quand personne n'a rien déclaré.
 *
 * ⚠️ ZÉRO N'EST PAS UNE DÉCLARATION, et c'est la même règle qu'AA4 et AC3 :
 *    les 198 lignes du classeur du PO sont à 0/0 parce que personne n'est
 *    encore allé mesurer, et lire cela comme « cette exploitation déclare
 *    zéro dounam » ferait apparaître un écart de 100 % sur chacune d'elles le
 *    jour où un contour est tracé.
 */
export function declaredAreas(farm: HasDeclaredAreas): AreaPair | null {
  const c = Number.isFinite(farm.farmDunams) ? farm.farmDunams : 0
  const g = Number.isFinite(farm.grazingDunams) ? farm.grazingDunams : 0
  if (c <= 0 && g <= 0) return null
  return pair(Math.max(c, 0), Math.max(g, 0))
}

/**
 * AD1 — la surface MESURÉE, ou `null` quand aucun polygone n'est tracé.
 *
 * Un seul des deux genres suffit : une exploitation dont on a tracé le
 * périmètre mais pas la zone de pâture EST mesurée, pour la moitié qui a un
 * contour. Ce qui n'existe pas vaut zéro dans le couple, jamais « inconnu »,
 * parce que le total est ce qu'on compare à la déclaration.
 */
export function measuredAreas(farm: HasMeasuredAreas): AreaPair | null {
  const c = farm.measuredFarmDunams
  const g = farm.measuredGrazingDunams
  const hasC = Number.isFinite(c)
  const hasG = Number.isFinite(g)
  if (!hasC && !hasG) return null
  return pair(hasC ? (c as number) : 0, hasG ? (g as number) : 0)
}

/**
 * AD1.4 — LA surface, quand on n'en veut qu'une : la déclarée, ou la mesurée
 * quand rien n'est déclaré, ou zéro quand il n'y a ni l'une ni l'autre.
 */
export function effectiveAreas(farm: HasAreas): AreaPair {
  return declaredAreas(farm) ?? measuredAreas(farm) ?? NO_AREAS
}

/**
 * AD3.1 — une exploitation qui porte une surface déclarée mais AUCUN polygone.
 * C'est une file de travail (« à contourner »), pas une alerte.
 */
export function needsOutline(farm: HasAreas): boolean {
  return declaredAreas(farm) !== null && measuredAreas(farm) === null
}

/**
 * AA3.1 — la pondération. Rounded, because a dunam is not divisible.
 *
 * AD1.3 — sur la DÉCLARÉE, avec la mesurée pour seule doublure quand rien
 * n'est déclaré (AD1.4). Les coefficients sont inchangés.
 */
export function weightedDunams(farm: HasAreas): number {
  const areas = effectiveAreas(farm)
  const raw =
    areas.cultivated * WEIGHTED_DUNAM.cultivated +
    areas.grazing * WEIGHTED_DUNAM.grazing
  return Math.round(raw)
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AD2 (2026-09-08) — LA NOTE D'ÉCART, ET POURQUOI C'EST UN GARDE-FOU.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Un agriculteur qui déclare 1 200 dounams dont le contour en fait 800, il
 *     faut le savoir AVANT de remettre le dossier à l'État. »
 *
 * ★ DIX POUR CENT, ET C'EST UNE CONSTANTE NOMMÉE (AD2.3), réglable dans les
 *   réglages — même forme qu'AB5a pour le יעד et qu'AC4.5 pour le seuil
 *   d'oubli : la constante est la valeur INITIALE, `ui/settings/areaGap.ts`
 *   porte la surcharge du coordinateur, et « חזרה לערך ההתחלתי » revient ici.
 *
 * ★ POURQUOI DIX. En dessous, on mesure la main qui a tracé : un contour suivi
 *   au doigt sur une tablette dans un pick-up est à quelques pour cent du
 *   cadastre, et une note qui s'allume à 3 % est une note que le coordinateur
 *   apprend à ne plus lire. Au-delà de dix, la différence ne s'explique plus
 *   par le tracé : il manque une parcelle, ou le chiffre déclaré est celui de
 *   la localité entière. C'est exactement la question qu'il faut poser avant
 *   de signer.
 *
 * ⚠️ L'ÉCART EST RAPPORTÉ À LA DÉCLARÉE, PAS À LA PLUS GRANDE DES DEUX. C'est
 *    le chiffre que le PO signe ; « votre déclaration dépasse le contour d'un
 *    tiers » est la phrase qui a un sens devant l'État, et rapporter à la
 *    mesurée ferait dire à la même paire 1200/800 tantôt 33 % tantôt 50 %
 *    selon le sens de lecture.
 */
export const AREA_GAP_THRESHOLD_INITIAL = 0.1

/** AD2.1 — ce que la note affiche : les deux valeurs, l'écart, le sens. */
export interface AreaGap {
  declared: AreaPair
  measured: AreaPair
  /** measured − declared, signé : négatif = le contour est plus petit. */
  deltaDunams: number
  /** |delta| / declared.total, en fraction (0,33 = 33 %). */
  ratio: number
  /** `'short'` = le tracé est plus petit que la déclaration. */
  direction: 'short' | 'over'
}

/**
 * AD2 — l'écart entre les deux surfaces, ou `null` quand il n'y a rien à dire :
 * une seule des deux existe (AD1.4), ou l'écart est sous le seuil (AD2/A113),
 * ou le coordinateur a déjà tranché pour ces deux valeurs-là (AD2.2).
 */
export function areaGap(
  farm: HasAreas & HasGapDecision,
  threshold: number = AREA_GAP_THRESHOLD_INITIAL,
): AreaGap | null {
  const declared = declaredAreas(farm)
  const measured = measuredAreas(farm)
  if (declared === null || measured === null) return null
  if (declared.total <= 0) return null
  const deltaDunams = measured.total - declared.total
  const ratio = Math.abs(deltaDunams) / declared.total
  const limit = Number.isFinite(threshold) && threshold > 0
    ? threshold
    : AREA_GAP_THRESHOLD_INITIAL
  if (ratio <= limit) return null
  if (gapAccepted(farm, declared.total, measured.total)) return null
  return {
    declared,
    measured,
    deltaDunams,
    ratio,
    direction: deltaDunams < 0 ? 'short' : 'over',
  }
}

/**
 * AD2.2 — « garder le chiffre déclaré » : la note se tait POUR CETTE FICHE
 * jusqu'à ce que l'un des deux change à nouveau.
 *
 * ★ CE QUI EST ENREGISTRÉ EST LA PAIRE DE VALEURS, PAS UNE DATE NI UN BOOLÉEN.
 *   Un booléen « ignoré » serait une décision prise une fois pour toutes sur
 *   une fiche dont le contour peut être redessiné demain, et c'est précisément
 *   le cas où la note doit revenir. Comparer la paire répond à « est-ce la
 *   même divergence que celle qu'il a tranchée » sans horloge et sans ordre
 *   d'événements.
 */
export interface HasGapDecision {
  /** Le total DÉCLARÉ au moment où le coordinateur a gardé son chiffre. */
  areaGapAcceptedDeclared?: number | null
  /** Le total MESURÉ au même moment. */
  areaGapAcceptedMeasured?: number | null
}

function gapAccepted(
  farm: HasGapDecision,
  declaredTotal: number,
  measuredTotal: number,
): boolean {
  const d = farm.areaGapAcceptedDeclared
  const m = farm.areaGapAcceptedMeasured
  if (!Number.isFinite(d as number) || !Number.isFinite(m as number)) return false
  return Math.round(d as number) === declaredTotal && Math.round(m as number) === measuredTotal
}

/**
 * AD2.5 — y a-t-il quelque chose à signaler sur cette fiche ? Le signal
 * discret de la liste et du tableau, et le filtre de l'écran חוות, posent
 * cette question-là et pas une autre.
 */
export function hasAreaGap(
  farm: HasAreas & HasGapDecision,
  threshold?: number,
): boolean {
  return areaGap(farm, threshold) !== null
}

/**
 * AD2.6 — de quoi trier « par écart ». Zéro quand il n'y a pas de note, pour
 * que l'ordre place les fiches concernées en tête et laisse les autres
 * derrière sans les mélanger.
 */
export function areaGapRatio(
  farm: HasAreas & HasGapDecision,
  threshold?: number,
): number {
  return areaGap(farm, threshold)?.ratio ?? 0
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AC3 (2026-09-08) — « שטחים שמירה » : LE PO A TRANCHÉ, C'EST DÉCLARATIF.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « שטחים שמירה n'est pas une recopie erronée. C'est une déclaration —
 *     "nous surveillons la totalité de cette surface". Leur système la
 *     remplit, et c'est volontaire. »
 *
 * ★ SO THE DEFAULT IS THE WHOLE HOLDING — מעובד + מרעה — AND IT IS A DEFAULT
 *   AND NOT A STORED COPY. A record that has never been touched answers with
 *   the sum of its two areas and follows them when a polygon is drawn; the day
 *   the coordinator types a different figure, `guardedDunamsManual` is set and
 *   the default never speaks again for that farm (AC3.2).
 *
 * ⚠️ AND A TYPED ZERO DOES NOT FREEZE ANYTHING — the trap AA4 fell into on a
 *    sheet of 198 zeroes. The flag is set by the importer only above zero and
 *    by the form only on a real entry; `guardedDunams` at 0 with no flag is a
 *    record nobody has answered for, and it keeps answering with the default.
 *
 * ⚠️ IT IS NOT THE WEIGHTING, AND THE TWO NEVER MEET (AC3.4). `weightedDunams`
 *    above is the SUBSIDY rule — מעובד × 1 + מרעה × 0,02 — and it reads
 *    neither this function nor this field. The guarded area is what the
 *    programme SAYS it watches; the weighted figure is what the State counts.
 */
export interface HasGuardedArea extends HasAreas {
  guardedDunams?: number
  guardedDunamsManual?: boolean
}

export function guardedDunamsOf(farm: HasGuardedArea): number {
  if (farm.guardedDunamsManual && Number.isFinite(farm.guardedDunams)) {
    return Math.round(farm.guardedDunams as number)
  }
  /* AD1.4 — le défaut est LA surface, c'est-à-dire la déclarée, ou la mesurée
     quand rien n'est déclaré. Une fiche dont le seul chiffre vient d'un
     polygone déclare donc garder ce que le polygone dit, et le suit. */
  return effectiveAreas(farm).total
}

/** Is this farm's guarded area the default, or a figure somebody typed? */
export function guardedIsManual(farm: HasGuardedArea): boolean {
  return farm.guardedDunamsManual === true
}

/** The same sum over a list, for the dashboard card and the list totals. */
export function totalWeightedDunams(farms: readonly HasAreas[]): number {
  return farms.reduce((sum, f) => sum + weightedDunams(f), 0)
}

/**
 * Where a total stands against the target, as a whole percentage.
 *
 * ⚠️ AB5a — THE DASHBOARD NO LONGER CALLS THIS; it calls `progressAgainst` in
 *    `ui/settings/target.ts`, which takes the coordinator's own campaign
 *    rather than the constant. This is kept because it is the PURE form of the
 *    same arithmetic against the initial value, it is what `bun run
 *    prospection` pins (« 118 % is a sentence the association wants to be able
 *    to say »), and a server-side report in Lot 1 will want it with no React
 *    anywhere near it.
 */
export function targetProgress(total: number, target = WEIGHTED_DUNAM_TARGET): number {
  if (target <= 0) return 0
  return Math.round((total / target) * 100)
}

// ---------------------------------------------------------------------------
// AA2 — the migration of the single area figure
// ---------------------------------------------------------------------------

/**
 * ★ AA2 — « Migration sans perte de la surface unique actuelle : vers מעובד si
 *   le type est חקלאות, vers מרעה si בעלי חיים, zéro/zéro si inconnu. »
 *
 * Records written before the two areas were separate carry one number and no
 * statement of what kind of ground it is. The farm's own TYPE is the only
 * honest place to ask: an arable holding's dunams are cultivated, a herd's are
 * range. A mixed holding is the case where the number genuinely does not say
 * — and inventing a split for it would put a figure into a funding total that
 * nobody measured, so it goes to zero and zero and the coordinator is asked.
 */
export function splitLegacyDunams(
  dunams: number,
  type: FarmType | undefined,
): { farmDunams: number; grazingDunams: number } {
  if (!Number.isFinite(dunams) || dunams <= 0) return { farmDunams: 0, grazingDunams: 0 }
  if (type === 'agriculture') return { farmDunams: dunams, grazingDunams: 0 }
  if (type === 'livestock') return { farmDunams: 0, grazingDunams: dunams }
  return { farmDunams: 0, grazingDunams: 0 }
}

// ---------------------------------------------------------------------------
// AA2bis — is the signatory's right over this land established?
// ---------------------------------------------------------------------------

/**
 * ★★ AA2bis (2026-09-07) — « NE PAS ORGANISER DE GARDES SUR UN TERRAIN QUI
 *    N'APPARTIENT PAS AU SIGNATAIRE. »
 *
 * That sentence is the whole of this function, and it is an operational rule
 * rather than a clerical one: a guard rota placed on ground the signatory does
 * not hold is volunteers standing, at night, somewhere nobody agreed they
 * could be. So the app SAYS SO, visibly, and does not act on it — « avertit,
 * ne bloque » is the product owner's own second sentence, and it matters as
 * much as the first: a farm whose paperwork is thin is exactly the farm the
 * programme wants on its list, with the gap findable.
 *
 * Four answers rather than a boolean, because they call for different work:
 *
 *   · `none`        the paper establishes a right and it has not lapsed;
 *   · `unset`       nobody has recorded what paper there is — a question to
 *                   ask, not a fault found. It is separated from `no_document`
 *                   because « we have not asked » and « there is none » are
 *                   different facts and the second one is the serious one;
 *   · `no_document` the kind recorded does not prove a right (see
 *                   `establishesRight` on each option);
 *   · `expired`     it did, and the date has passed.
 *
 * ⚠️ THE DATE IS COMPARED AS A DAY, NOT AS AN INSTANT. `landAgreementUntil` is
 *    a `YYYY-MM-DD` with no time and no zone; turning it into a Date and
 *    comparing to `now()` would make a contract expire at midnight UTC, which
 *    in Israel is two or three in the morning of the following day. Comparing
 *    the two day-strings is exact and has no zone in it at all.
 */
export type LandRightIssue = 'none' | 'unset' | 'no_document' | 'expired'

export function landRightIssue(
  farm: { landAgreement?: string; landAgreementUntil?: string | null },
  todayKey: string,
): LandRightIssue {
  const kind = (farm.landAgreement ?? '').trim()
  if (kind === '') return 'unset'
  const option = LAND_AGREEMENT_OPTIONS.find((o) => o.id === kind)
  if (!option || !option.establishesRight) return 'no_document'
  const until = (farm.landAgreementUntil ?? '').trim()
  if (until !== '' && until < todayKey) return 'expired'
  return 'none'
}

// ---------------------------------------------------------------------------
// AA4 — the two enum columns the association's own workbook carries
// ---------------------------------------------------------------------------

/**
 * ★★ AA4 (2026-09-07) — סטטוס AND סוג פעילות AS EXACT VALUES, NOT SUBSTRINGS.
 *
 * `templates.ts` reads these two columns with a longest-substring-first table,
 * which is the right tool for somebody's own spreadsheet where the cell might
 * say « כבר דיברנו איתם » — and the WRONG one for the association's workbook,
 * where the values come from a validated drop-down and are exact. The trap is
 * live and it is not hypothetical:
 *
 *   ⚠️ « לא נוצר קשר » (NOT contacted) CONTAINS « נוצר קשר » (contacted).
 *
 * A substring reader turns "we have not called them" into "we have called
 * them" on every unworked row of a 198-row sheet, and the coordinator's whole
 * call list silently disappears. `readOption` compares WHOLE normalised
 * strings, so the two cannot be confused whichever order they are declared in.
 *
 * These lists are also what the EXPORT writes, which is what makes the round
 * trip (AA4.10, A78) exact rather than approximately right.
 */
export const FARM_STATUS_OPTIONS: readonly FieldOption[] = [
  { id: 'to_contact', label: 'ליצירת קשר', aliases: ['לא נוצר קשר', 'to_contact'] },
  { id: 'contacted', label: 'נוצר קשר', aliases: ['contacted'] },
  { id: 'visited', label: 'בוקרה', aliases: ['ביקור', 'visited'] },
  { id: 'verbal_ok', label: 'הסכמה בעל פה', aliases: ['הסכמה בעל־פה', 'verbal_ok', 'verbal'] },
  { id: 'signed', label: 'הסכמה נחתמה', aliases: ['נחתם', 'חתמה', 'signed'] },
  { id: 'active', label: 'פעילה', aliases: ['פעיל', 'active'] },
  { id: 'declined', label: 'לא רלוונטי', aliases: ['סירבה', 'סירב', 'declined'] },
]

/**
 * סוג פעילות — the workbook says מעובד / מרעה / מעורב, the app says
 * חקלאות / בעלי חיים / מעורבת. Same three things; both spellings are here so
 * that a file from either side reads, and the EXPORT writes the workbook's.
 */
export const FARM_TYPE_OPTIONS: readonly FieldOption[] = [
  { id: 'agriculture', label: 'מעובד', aliases: ['חקלאות', 'חקלאי', 'agriculture'] },
  { id: 'livestock', label: 'מרעה', aliases: ['בעלי חיים', 'רעייה', 'livestock'] },
  { id: 'mixed', label: 'מעורב', aliases: ['מעורבת', 'משולב', 'mixed'] },
]
