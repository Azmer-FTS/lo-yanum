import {
  FARM_STATUS_OPTIONS,
  FARM_TYPE_OPTIONS,
  LAND_AGREEMENT_OPTIONS,
  LEGAL_ENTITY_OPTIONS,
  guardedDunamsOf,
  normaliseValue,
  optionLabel,
  readOption,
  weightedDunams,
} from './fields'
import { googleMapsPointUrl, wazeUrl } from './geo'
import { regionById, regionOf, regions } from './regions'
import type { Farm, FarmStatus, FarmType, LatLng, RegionId } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AA4 (2026-09-07) — LE CLASSEUR DE PROSPECTION, DANS LES DEUX SENS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The association keeps its southern prospection in one workbook, sheet
 * « רשימה », twenty-six columns. The product owner will re-import THE SAME
 * FILE, enriched, several times a week — which is stated in the brief as the
 * most important requirement of the block, and which is what every decision
 * in this file answers to:
 *
 *   ★ THE IDENTITY IS THE STATE'S LOCALITY CODE, AND THE NAME ONLY WHEN THERE
 *     IS NONE. `1177` is טללים in every file anybody will ever send; « טללים »
 *     is spelt three ways and lives in a council that can be redrawn. When the
 *     code is absent the fallback is name + council, normalised, because a name
 *     alone is not unique in this country — there are two חוות בודדים rows in
 *     the fixture, in two different councils.
 *
 *   ★ AN EMPTY CELL NEVER OVERWRITES ANYTHING (AA4.3). This is the rule that
 *     makes a weekly re-import safe. The coordinator types a farmer's mobile
 *     into the APP on Tuesday; the sheet he re-imports on Thursday has that
 *     cell blank because he did not type it there too. A blank that wins would
 *     delete Tuesday's work, quietly, on 198 rows at once. So a patch carries
 *     only the fields whose cells actually said something.
 *
 *   ★ TWO COLUMNS ARE READ AND DELIBERATELY DISCARDED. « אומדן סדר גודל » is
 *     an order-of-magnitude guess the workbook itself labels « הערכה בלבד » —
 *     writing it into an area would put an invented number into the funding
 *     total (AA4.6). « דונם משוקלל » is recomputed here from coefficients this
 *     codebase owns (AA4.7): a weighted figure that arrived from a spreadsheet
 *     is a figure whose ratio nobody in this repository chose.
 *
 * PURE: no SheetJS, no DOM, no React. The wizard hands over a string matrix
 * and renders what comes back, so the same rules can run server-side in Lot 1.
 */

// ---------------------------------------------------------------------------
// The columns
// ---------------------------------------------------------------------------

export type ProspectionField =
  | 'ignore'
  | 'index'
  | 'name'
  /** ★★ AC1 — שם החווה. The first half of the new identity. */
  | 'farmName'
  | 'farmerName'
  | 'farmerPhone'
  /** ★ AC2 — מייל חקלאי, which the new workbook carries per row. */
  | 'farmerEmail'
  | 'legalEntity'
  /** ★ AC2.4 — ארגון מאגד: the agudah / גד״ש / שח״ם above the holding. */
  | 'umbrella'
  /** ★ AC2 — יישוב, at last a column of its own rather than the place name. */
  | 'locality'
  | 'localityCode'
  | 'localityKind'
  | 'council'
  | 'region'
  | 'councilPhone'
  | 'liaisonName'
  | 'liaisonPhone'
  | 'activity'
  | 'estimate'
  | 'cultivated'
  | 'grazing'
  /** ★★ AC3 — שטחים שמירה, and the product owner has ruled it a declaration. */
  | 'guarded'
  | 'weighted'
  /** ★ AC4.6 — כמות מתנדבים קבועים: written out, recomputed on the way in. */
  | 'regulars'
  | 'landAgreement'
  | 'landAgreementUntil'
  | 'status'
  | 'priority'
  | 'lat'
  | 'lng'
  | 'gmaps'
  | 'waze'
  | 'notes'

export interface ProspectionColumn {
  field: ProspectionField
  /** The header exactly as the association's workbook writes it. */
  header: string
  /** Other spellings, matched whole after `normaliseValue`. */
  aliases?: readonly string[]
  /** Approximate character width, so the export opens readable. */
  width?: number
}

/**
 * ⚠️ THE ORDER IS THE FILE'S ORDER, and the export writes it back in exactly
 *    this order. That is what makes « aller-retour sans perte » (AA4.10) a
 *    property of one list rather than of two that agree today.
 *
 * ★★ AC2 (2026-09-08) — THIRTY-TWO COLUMNS, AND THE FILE IS NOW ONE ROW PER
 *    HOLDING. The product owner's new workbook says so on its own מקרא sheet:
 *    « שורה אחת לכל חווה, לא לכל יישוב ». Six columns are new — שם החווה,
 *    מייל חקלאי, ארגון מאגד, יישוב, שטחים שמירה, כמות מתנדבים קבועים — and
 *    four were re-worded. The old spellings are kept as aliases rather than
 *    replaced: a coordinator with last month's file on his laptop must still
 *    be able to drop it in.
 */
export const PROSPECTION_COLUMNS: readonly ProspectionColumn[] = [
  { field: 'index', header: "מס'", aliases: ['מס', 'מספר', '#'], width: 6 },
  /**
   * ★★ AC2.2 — THIS CELL IS A FORMULA IN HIS WORKBOOK, AND IT IS READ AS A
   *    VALUE. `IF(C="",IF(D="",I,"החווה של "&D),IF(D="",C,C&" - החווה של "&D))`
   *    — the farm's name, or the farmer's, or both, or the locality when
   *    neither is filled. SheetJS hands over the CALCULATED value, which is
   *    what the importer reads; the app never writes a formula back, and
   *    `composePlaceName` below is that same rule in TypeScript so the export
   *    recomposes the cell rather than echoing it.
   */
  {
    field: 'name',
    header: 'שם המקום (כפי שיישלח אליהם)',
    aliases: ['שם המקום', 'שם היישוב', 'שם'],
    width: 26,
  },
  { field: 'farmName', header: 'שם החווה', aliases: ['החווה', 'שם חווה'], width: 20 },
  { field: 'farmerName', header: 'שם החקלאי', aliases: ['החקלאי', 'שם חקלאי'], width: 20 },
  { field: 'farmerPhone', header: 'נייד החקלאי', aliases: ['טלפון החקלאי'], width: 16 },
  {
    field: 'farmerEmail',
    header: 'מייל חקלאי',
    aliases: ['אימייל חקלאי', 'דוא״ל חקלאי', 'מייל'],
    width: 24,
  },
  {
    field: 'legalEntity',
    header: 'סוג הישות המשפטית',
    aliases: ['הישות המשפטית', 'סוג ישות משפטית'],
    width: 20,
  },
  {
    field: 'umbrella',
    header: 'ארגון מאגד (אגודה/גד״ש/שח״ם)',
    aliases: ['ארגון מאגד', 'ארגון', 'אגודה מאגדת'],
    width: 24,
  },
  { field: 'locality', header: 'יישוב', aliases: ['ישוב'], width: 18 },
  {
    field: 'localityCode',
    header: 'סמל יישוב (למ״ס)',
    aliases: ['סמל יישוב', 'סמל היישוב', 'סמל', 'קוד יישוב'],
    width: 14,
  },
  { field: 'localityKind', header: 'סוג יישוב', aliases: ['סוג היישוב'], width: 14 },
  { field: 'council', header: 'מועצה אזורית', aliases: ['מועצה'], width: 16 },
  {
    field: 'region',
    header: 'אזור (באפליקציה)',
    aliases: ['אזור', 'אזור באפליקציה'],
    width: 14,
  },
  {
    field: 'councilPhone',
    header: 'טלפון מרכזיית המועצה',
    aliases: ['טלפון המועצה', 'מרכזיית המועצה'],
    width: 18,
  },
  {
    field: 'liaisonName',
    header: 'איש קשר (מועצה/אגודה)',
    aliases: ['איש קשר', 'איש קשר מועצה'],
    width: 20,
  },
  {
    field: 'liaisonPhone',
    header: 'נייד — איש קשר',
    aliases: ['נייד איש קשר', 'טלפון איש קשר'],
    width: 16,
  },
  { field: 'activity', header: 'סוג פעילות', aliases: ['פעילות', 'סוג חווה'], width: 14 },
  /**
   * ★ AC2.3 — « אומדן ליישוב כולו » IS ABOUT THE LOCALITY, NOT THE HOLDING.
   *   Read and thrown away, as its predecessor « אומדן סדר גודל » was: writing
   *   it into an area would put a whole moshav's guess into one farmer's row,
   *   and adding it up across the four rows of one locality would multiply a
   *   guess by four.
   */
  {
    field: 'estimate',
    header: 'אומדן ליישוב כולו (דונם) — הערכה',
    aliases: [
      'אומדן ליישוב כולו',
      'אומדן סדר גודל (דונם) — הערכה בלבד',
      'אומדן סדר גודל',
      'אומדן',
      'אומדן (דונם)',
    ],
    width: 24,
  },
  {
    field: 'cultivated',
    header: 'שטח מעובד (דונם)',
    aliases: ['שטח מעובד', 'מעובד', 'שטחים מעובדים'],
    width: 14,
  },
  { field: 'grazing', header: 'שטח מרעה (דונם)', aliases: ['שטח מרעה', 'מרעה', 'שטחי מרעה'], width: 14 },
  {
    field: 'guarded',
    header: 'שטחים שמירה (דונם)',
    aliases: ['שטחים שמירה', 'שטח שמירה', 'שטח נשמר'],
    width: 16,
  },
  { field: 'weighted', header: 'דונם משוקלל', aliases: ['משוקלל'], width: 14 },
  {
    field: 'landAgreement',
    header: 'הסכם רעיה/חכירה',
    aliases: ['סוג הסכם קרקע', 'הסכם קרקע', 'סוג ההסכם', 'הסכם רעיה', 'הסכם חכירה'],
    width: 26,
  },
  {
    field: 'landAgreementUntil',
    header: 'תאריך תפוגה הסכם קרקע',
    aliases: ['תוקף ההסכם', 'תוקף', 'תוקף הסכם', 'תאריך תפוגה'],
    width: 20,
  },
  {
    field: 'regulars',
    header: 'כמות מתנדבים קבועים',
    aliases: ['מתנדבים קבועים'],
    width: 18,
  },
  { field: 'status', header: 'סטטוס', aliases: ['מצב'], width: 16 },
  { field: 'priority', header: 'עדיפות (1-3)', aliases: ['עדיפות'], width: 10 },
  { field: 'lat', header: 'קו רוחב', aliases: ['רוחב', 'lat', 'latitude'], width: 12 },
  { field: 'lng', header: 'קו אורך', aliases: ['אורך', 'lng', 'lon', 'longitude'], width: 12 },
  { field: 'gmaps', header: 'Google Maps', aliases: ['גוגל מפות', 'מפה'], width: 12 },
  { field: 'waze', header: 'Waze', aliases: ['וייז'], width: 10 },
  { field: 'notes', header: 'הערות', aliases: ['הערה', 'notes'], width: 30 },
]

/**
 * ★★ AC2.2 — THE WORKBOOK'S OWN FORMULA, IN TYPESCRIPT AND IN ONE PLACE.
 *
 * The importer composes the name it stores and the exporter composes the cell
 * it writes, from the same three fields and through this one function — which
 * is what makes the round trip an identity rather than two spellings that
 * agree today. `fallback` is what a record with NEITHER name answers with: on
 * the way in, the empty string, so the locality wins; on the way out, the
 * record's own `name`, so a place named by hand in the app is not silently
 * renamed to its locality.
 */
export function composePlaceName(
  record: { farmName?: string | null; farmerName?: string | null; locality?: string | null },
  fallback = '',
): string {
  const farm = (record.farmName ?? '').trim()
  const farmer = (record.farmerName ?? '').trim()
  /* שם החווה is the holding's own name and it always wins — with the farmer's
     appended when there is one, which is the workbook's own formula. */
  if (farm !== '') return farmer === '' ? farm : `${farm} - החווה של ${farmer}`
  /**
   * ⚠️ THE FARMER BRANCH RUNS ON THE WAY OUT TOO, AND THAT IS DELIBERATE. His
   *    workbook RECOMPUTES this cell the moment he opens the file: an export
   *    that wrote « טללים » beside a שם החקלאי of « יוסי כהן » would be a file
   *    Excel corrects to « החווה של יוסי כהן » before he has typed anything,
   *    and a round trip that agrees with a stale cell agrees with nothing.
   *    Consequence, measured and written into A107: a record whose farmer was
   *    typed into the APP without a farm name is renamed ONCE, by the
   *    association's own rule, and every pass after that is an identity.
   *
   * ★ THE FALLBACK IS THE LAST WORD, NOT THE FIRST. It answers only for a
   *   record that carries NEITHER name — a farm created by hand in the app —
   *   whose own `name` is then the only name anybody ever gave it, and must
   *   not be replaced by its locality.
   */
  if (farmer !== '') return `החווה של ${farmer}`
  return fallback || (record.locality ?? '').trim()
}

/**
 * Which field a header names, or `ignore`.
 *
 * ⚠️ WHOLE-STRING, AFTER NORMALISATION, AND NOT A SUBSTRING SCAN. « סוג יישוב »
 *    is a substring of nothing here but « אזור » is a substring of « אזור
 *    (באפליקציה) », and a substring reader would have to be ordered by length
 *    for ever after. `normaliseValue` is what absorbs the differences that
 *    actually occur — the gershayim in « למ״ס », the em dash in « נייד — איש
 *    קשר », a double space, a trailing blank, capital letters in `Google Maps`.
 */
export function guessProspectionField(header: string): ProspectionField {
  const h = normaliseValue(header)
  if (h === '') return 'ignore'
  for (const column of PROSPECTION_COLUMNS) {
    if (normaliseValue(column.header) === h) return column.field
    if ((column.aliases ?? []).some((a) => normaliseValue(a) === h)) return column.field
  }
  return 'ignore'
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AC1 (2026-09-08) — UNE LOCALITÉ PORTE PLUSIEURS EXPLOITATIONS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Dans בארי il peut y avoir quatre agriculteurs, chacun avec ses dounams
 *     et son contrat. La clé actuelle, סמל יישוב, les écrase les uns sur les
 *     autres. »
 *
 * ★ SO A KEY HAS TWO HALVES, AND ONLY ONE OF THEM IS THE PLACE.
 *
 *     · THE LOCALITY — `code:1177` when the State's own code is there,
 *       `place:<יישוב>|<מועצה>` when it is not. Unchanged from AA4.2 except
 *       that it now reads the יישוב COLUMN the new workbook has, falling back
 *       to the place name for the files that have no such column.
 *     · THE HOLDING — `<שם החווה>|<שם החקלאי>`, normalised. Empty on both
 *       sides is a real and expected value: it is a LOCALITY SEED, a row that
 *       says « there is farming at טללים and we have not yet been told by
 *       whom ». 198 of the product owner's 198 rows are exactly that today.
 *
 * ★★ AND THE SEED IS WHY THE KEY ALONE IS NOT THE WHOLE RULE (AC1.1, third
 *    sentence). « un remplissage ultérieur des deux champs la met à jour au
 *    lieu d'en créer une nouvelle » — the row whose two names have just been
 *    filled in has a key that has never existed, so a plain map lookup would
 *    create a second record beside the seed and leave the seed for ever.
 *    `planProspection` therefore matches in TWO passes: every exact key first,
 *    then the leftovers against the locality's own seed. See the note there.
 *
 * ⚠️ THE HALVES ARE JOINED BY `#`, WHICH APPEARS IN NEITHER. Without a
 *    separator a farm called « א » in locality « code:1 » and one called «  »
 *    in « code:1א » would key alike — absurd until it is not.
 */

/** The holding half: the farm's own name, and its farmer's. */
export function holdingKey(record: {
  farmName?: string | null
  farmerName?: string | null
}): string {
  return `${normaliseValue(record.farmName ?? '')}|${normaliseValue(record.farmerName ?? '')}`
}

/**
 * ★ AC1.1 — NEITHER NAME FILLED: the row is an AMORCE, a locality seed.
 *   Read of a row and of a record with the same function, because the whole
 *   promotion rule turns on the two being asked the same question.
 */
export function isLocalitySeed(record: {
  farmName?: string | null
  farmerName?: string | null
}): boolean {
  return holdingKey(record) === '|'
}

/**
 * ★★ AB6.7 — THE LOCALITY HALF BY NAME, WHICH IS THE ONLY ONE A FILE WITH NO
 *    סמל יישוב CAN EVER PRODUCE — the association's format, for one.
 *
 * ⚠️ IT READS `locality` FIRST AND THE PLACE NAME ONLY AS A FALLBACK. Before
 *    AC2 the workbook had no יישוב column and « שם המקום » WAS the locality,
 *    which is why AA4.2 keyed on the name. It is not any more: « חוות הבשור -
 *    החווה של יוסי » and « חוות הבשור - החווה של דוד » are two rows of ONE
 *    locality, and keying their locality half on their own names would put
 *    them in two.
 */
export function placeLocalityKey(record: {
  name: string
  locality?: string
  council?: string
}): string {
  const where = normaliseValue(record.locality ?? '') || normaliseValue(record.name)
  return `place:${where}|${normaliseValue(record.council ?? '')}`
}

/** The locality half, preferring the State's code when the record carries one. */
export function localityKey(record: {
  localityCode?: number | null
  name: string
  locality?: string
  council?: string
}): string {
  if (record.localityCode != null && Number.isFinite(record.localityCode)) {
    return `code:${record.localityCode}`
  }
  return placeLocalityKey(record)
}

export type FarmIdentityInput = {
  localityCode?: number | null
  name: string
  locality?: string
  council?: string
  farmName?: string | null
  farmerName?: string | null
}

export function identityKey(record: FarmIdentityInput): string {
  return `${localityKey(record)}#${holdingKey(record)}`
}

/** The same, forced onto the name-and-council locality. See `placeLocalityKey`. */
export function placeKey(record: FarmIdentityInput): string {
  return `${placeLocalityKey(record)}#${holdingKey(record)}`
}

/**
 * ★★ HOW A SET OF RECORDS IS INDEXED, AS ONE VALUE.
 *
 * `planProspection` needs three answers about a record — its full key, which
 * locality it belongs to, and whether it is a bare seed — and every format
 * answers them differently because every format carries different columns.
 * Passing three functions separately is how two of them end up disagreeing;
 * passing one object is how the prospection path and the association path stay
 * two rows in this file rather than two implementations of the same rule.
 */
export interface FarmIndex {
  key: (record: FarmIdentityInput) => string
  locality: (record: FarmIdentityInput) => string
  seed: (record: FarmIdentityInput) => boolean
}

/** The prospection workbook: it carries סמל יישוב, so the code is the locality. */
export const CODE_INDEX: FarmIndex = {
  key: identityKey,
  locality: localityKey,
  seed: isLocalitySeed,
}

/** A file with no locality code at all — name + council, and the holding. */
export const PLACE_INDEX: FarmIndex = {
  key: placeKey,
  locality: placeLocalityKey,
  seed: isLocalitySeed,
}

/**
 * ★★ AC1 · AB6.7 — THE ASSOCIATION'S FORMAT HAS NO שם החווה COLUMN, so the
 *    holding half it can produce is the FARMER alone. Keying existing records
 *    on the full pair would give every farm whose שם החווה is filled a key no
 *    row of theirs can ever spell — which is exactly the 193-creations defect
 *    of AB6.7, arriving by a third door.
 *
 * ⚠️ ITS KNOWN LIMIT, WRITTEN DOWN: two holdings in ONE locality with the SAME
 *    farmer and different farm names collapse to one key here. The first
 *    record wins, as everywhere else in this planner, and updating the first
 *    is strictly better than creating a third.
 */
export const ASSOCIATION_INDEX: FarmIndex = {
  key: (r) => `${placeLocalityKey(r)}#|${normaliseValue(r.farmerName ?? '')}`,
  locality: placeLocalityKey,
  seed: (r) => normaliseValue(r.farmerName ?? '') === '',
}

// ---------------------------------------------------------------------------
// Reading a row
// ---------------------------------------------------------------------------

/** A cell that named a value no list knows. Reported, never guessed at. */
export interface UnknownValue {
  rowNumber: number
  /** The workbook's own header, so the report points at a column he can see. */
  header: string
  value: string
}

export type ProspectionProblem =
  | 'errMissingName'
  | 'errDuplicateInFile'
  | 'errBadCoordinates'

export type ProspectionWarning = 'warnNoPosition' | 'warnUnknownRegion'

/**
 * The patch a row produces: ONLY the fields whose cells said something.
 *
 * ⚠️ THIS IS AA4.3, AS A TYPE. Every key is optional and a key is present only
 *    when its cell was non-empty, so `{ ...existing, ...patch }` cannot erase
 *    anything the sheet was silent about. The alternative — a full record with
 *    empty strings — is the shape that deletes a Tuesday's telephone calls on
 *    Thursday.
 */
export interface ProspectionPatch {
  name?: string
  /**
   * ★★ AB6.7 — THE LOCALITY, AND IT ARRIVED WITH THE ASSOCIATION FORMAT.
   *
   * The prospection sheet has no such column — its « שם המקום » IS the
   * locality, which is why `applyProspection` has always seeded `locality`
   * from the name. The association's file has TWO columns called מיקום and
   * one of them is the locality's name, so a row from it can say something
   * the prospection row never could. Optional, sparse, and ignored by every
   * reader that does not set it.
   */
  locality?: string
  localityCode?: number | null
  localityKind?: string
  council?: string
  councilPhone?: string
  region?: string
  regionId?: RegionId | null
  legalEntity?: string
  liaisonName?: string
  liaisonPhone?: string
  /** ★ AC1 — שם החווה. Half of the identity; see `holdingKey`. */
  farmName?: string
  farmerName?: string
  farmerPhone?: string
  /** ★ AC2 — מייל חקלאי, a column of the new workbook. */
  farmerEmail?: string
  /** ★ AC2.4 — ארגון מאגד, free text: אגודה · גד״ש · שח״ם. */
  umbrella?: string
  type?: FarmType
  farmDunams?: number
  grazingDunams?: number
  farmDunamsManual?: boolean
  grazingDunamsManual?: boolean
  /** ★ AC3 — שטחים שמירה, the declared guarded area, and its override flag. */
  guardedDunams?: number
  guardedDunamsManual?: boolean
  landAgreement?: string
  landAgreementUntil?: string | null
  status?: FarmStatus
  priority?: number | null
  position?: LatLng
  positionMissing?: boolean
  notes?: string
}

export interface ProspectionRow {
  /** 1-based row number in the file, header row included — what Excel shows. */
  rowNumber: number
  /** For the preview and the report: the name, whatever else happened. */
  name: string
  council: string
  localityCode: number | null
  key: string
  /**
   * ★ AC1 — the locality half on its own, so the second matching pass can ask
   *   « which seed does this row belong to » without re-splitting the key.
   */
  localityKey: string
  /** ★ AC1 — neither שם החווה nor שם החקלאי was filled: a locality amorce. */
  seed: boolean
  patch: ProspectionPatch
  problems: ProspectionProblem[]
  warnings: ProspectionWarning[]
  unknown: UnknownValue[]
}

const cellNumber = (raw: string): number | null => {
  const cleaned = raw.replace(/[,\s‏‎]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Israel's bounding box, generously. A cell outside it is a typo, not a place. */
const IN_COUNTRY = (p: LatLng): boolean =>
  p.lat > 29 && p.lat < 34 && p.lng > 33.5 && p.lng < 36.5

/**
 * ★ AA4.5 — THE REGION COLUMN IS A NAME, AND THE POLYGON IS THE FALLBACK.
 *
 * « אזור doit correspondre aux régions existantes, sinon déduit des
 *   coordonnées par les polygones. »
 *
 * A recognised name PINS the region (`regionId`), because somebody wrote it
 * down deliberately and the hand-written outlines of `regions.ts` are explicit
 * about being approximate. An unrecognised name leaves `regionId` null, which
 * is what makes `farmRegion` fall through to `regionOf(position)` — the
 * polygon — with no special case anywhere. The unrecognised word is still kept
 * in the free-text `region` label and reported, so nothing is silently lost.
 */
function readRegion(raw: string): { id: RegionId | null; known: boolean } {
  const v = normaliseValue(raw)
  if (v === '') return { id: null, known: true }
  const hit = regions().find((r) => normaliseValue(r.name) === v)
  return hit ? { id: hit.id, known: true } : { id: null, known: false }
}

/** G16 — the app's own three-way kind, derived from what the sheet called it. */
function entityKindOfLocality(localityKind: string): 'farm' | 'moshav' | 'other' {
  const v = normaliseValue(localityKind)
  if (v.includes('מושב')) return 'moshav'
  if (v.includes('חוו')) return 'farm'
  return 'other'
}

export function parseProspectionRow(
  raw: string[],
  mapping: ProspectionField[],
  rowNumber: number,
): ProspectionRow {
  const at = (field: ProspectionField): string => {
    const i = mapping.indexOf(field)
    return i === -1 ? '' : (raw[i] ?? '').toString().trim()
  }
  const headerOf = (field: ProspectionField): string =>
    PROSPECTION_COLUMNS.find((c) => c.field === field)?.header ?? field

  const problems: ProspectionProblem[] = []
  const warnings: ProspectionWarning[] = []
  const unknown: UnknownValue[] = []
  const patch: ProspectionPatch = {}

  /**
   * ★★ AC1 · AC2.2 — THE THREE CELLS THAT MAKE A NAME, AND THE ONE THAT IS A
   *    FORMULA.
   *
   * « שם המקום » is computed in his workbook from the other three; SheetJS
   * hands over the calculated value, and `composePlaceName` is the same rule
   * here so the export can write the cell rather than echo it (AC2.2, A101).
   *
   * ⚠️ THE COMPOSITION ONLY TAKES OVER WHEN THE FILE HAS ONE OF THE TWO NEW
   *    COLUMNS. A file in the old 26-column shape has a שם החקלאי and NO
   *    שם החווה and NO יישוב; composing from it would rename « טללים » into
   *    « החווה של יוסי » on import, which is a file this app can still be
   *    handed and must still read as it always did.
   */
  const farmName = at('farmName')
  const farmerName = at('farmerName')
  const localityCell = at('locality')
  const nameCell = at('name')
  const composed = composePlaceName({
    farmName,
    farmerName,
    locality: localityCell,
  })
  const name =
    farmName !== '' || localityCell !== '' ? composed : nameCell || composed

  if (name === '') problems.push('errMissingName')
  else patch.name = name
  if (farmName !== '') patch.farmName = farmName
  if (localityCell !== '') patch.locality = localityCell

  const council = at('council')
  if (council !== '') patch.council = council

  const codeCell = at('localityCode')
  const localityCode = cellNumber(codeCell)
  if (codeCell !== '' && localityCode === null) {
    unknown.push({ rowNumber, header: headerOf('localityCode'), value: codeCell })
  } else if (localityCode !== null) {
    patch.localityCode = localityCode
  }

  const localityKind = at('localityKind')
  if (localityKind !== '') patch.localityKind = localityKind

  const councilPhone = at('councilPhone')
  if (councilPhone !== '') patch.councilPhone = councilPhone

  const regionCell = at('region')
  if (regionCell !== '') {
    patch.region = regionCell
    const region = readRegion(regionCell)
    if (region.known) patch.regionId = region.id
    else {
      warnings.push('warnUnknownRegion')
      unknown.push({ rowNumber, header: headerOf('region'), value: regionCell })
    }
  }

  /** The three closed lists. An unknown value is REPORTED and never written. */
  const enumCell = (
    field: ProspectionField,
    options: readonly { id: string; label: string; aliases?: readonly string[] }[],
  ): string | null => {
    const cell = at(field)
    if (cell === '') return null
    const hit = readOption(cell, options)
    if (hit) return hit.id
    unknown.push({ rowNumber, header: headerOf(field), value: cell })
    return null
  }

  const legalEntity = enumCell('legalEntity', LEGAL_ENTITY_OPTIONS)
  if (legalEntity) patch.legalEntity = legalEntity

  const landAgreement = enumCell('landAgreement', LAND_AGREEMENT_OPTIONS)
  if (landAgreement) patch.landAgreement = landAgreement

  const status = enumCell('status', FARM_STATUS_OPTIONS)
  if (status) patch.status = status as FarmStatus

  const type = enumCell('activity', FARM_TYPE_OPTIONS)
  if (type) patch.type = type as FarmType

  const liaisonName = at('liaisonName')
  if (liaisonName !== '') patch.liaisonName = liaisonName
  const liaisonPhone = at('liaisonPhone')
  if (liaisonPhone !== '') patch.liaisonPhone = liaisonPhone
  if (farmerName !== '') patch.farmerName = farmerName
  const farmerPhone = at('farmerPhone')
  if (farmerPhone !== '') patch.farmerPhone = farmerPhone
  const farmerEmail = at('farmerEmail')
  if (farmerEmail !== '') patch.farmerEmail = farmerEmail
  /* AC2.4 — free text, no list: « אגודה », « גד״ש חבל שלום », a name. */
  const umbrella = at('umbrella')
  if (umbrella !== '') patch.umbrella = umbrella

  const until = at('landAgreementUntil')
  if (until !== '') patch.landAgreementUntil = until

  const priority = cellNumber(at('priority'))
  if (priority !== null) patch.priority = priority

  /**
   * ★ AA4.6 — « אומדן סדר גודל » IS READ AND THROWN AWAY. It is deliberately
   *   NOT written to either area: the workbook's own legend calls it an
   *   order-of-magnitude guess for prioritising phone calls, and a guess in a
   *   dunam column becomes a guess in the association's funding report.
   *   AA4.7 — and « דונם משוקלל » likewise: recomputed, never imported.
   */
  const cultivated = cellNumber(at('cultivated'))
  if (cultivated !== null) {
    patch.farmDunams = cultivated
    /**
     * ★ G15 — A TYPED NUMBER IS AN OVERRIDE; A ZERO IS NOT.
     *
     * The figure in the sheet is the farmer's own claim and must survive the
     * first time somebody draws a polygon, which is what the manual flag
     * protects. But a `0` is « nobody has measured this » — 198 of the
     * product owner's rows are exactly that — and flagging it manual would
     * freeze every one of them at zero for ever, so the drawn zones could
     * never fill them in. Zero leaves the flag ABSENT rather than setting it
     * false, which is also what keeps the export round trip an identity
     * (A78): absent and false mean the same thing to G15's writer, and only
     * one of them is what a fresh record holds.
     */
    if (cultivated > 0) patch.farmDunamsManual = true
  }
  const grazing = cellNumber(at('grazing'))
  if (grazing !== null) {
    patch.grazingDunams = grazing
    if (grazing > 0) patch.grazingDunamsManual = true
  }
  /**
   * ★★ AC3 — « שטחים שמירה » IS A DECLARATION, AND THE PRODUCT OWNER HAS
   *    RULED. AB6 read it as an erroneous copy of the cultivated area and
   *    refused to write it; he has said in so many words that it is
   *    deliberate — « nous surveillons la totalité de cette surface » — and
   *    their system fills it on purpose. So it is imported like any other
   *    area, with G15's flag on exactly the same terms: a figure above zero is
   *    an override that the default must never overwrite again, and a ZERO
   *    leaves the flag absent, because a zero that froze itself would freeze
   *    the record at zero for ever (AC3.2, A102).
   */
  const guarded = cellNumber(at('guarded'))
  if (guarded !== null && guarded > 0) {
    /**
     * ⚠️ AND IT IS ONLY A DECLARATION WHEN IT DIFFERS FROM THE DEFAULT. The
     *    export writes this column on EVERY row (AC3.3), and for most rows the
     *    figure it writes is precisely מעובד + מרעה — the default. Reading
     *    that back as a hand-entered override would turn every round trip into
     *    a mass freeze: 198 records pinned to whatever their areas were the
     *    day the file was produced, deaf to every polygon drawn afterwards.
     *    A cell that restates the default is the default; a cell that says
     *    something else is the farmer's declaration, and that one sticks.
     */
    const fallback = (cultivated ?? 0) + (grazing ?? 0)
    if (guarded !== fallback) {
      patch.guardedDunams = guarded
      patch.guardedDunamsManual = true
    }
  }

  // --- AA4.4: the position -------------------------------------------------
  const latCell = at('lat')
  const lngCell = at('lng')
  const lat = cellNumber(latCell)
  const lng = cellNumber(lngCell)
  if (lat !== null && lng !== null) {
    const point = { lat, lng }
    if (IN_COUNTRY(point)) {
      patch.position = point
      patch.positionMissing = false
      // AA4.5 — with no usable region name, the polygons answer.
      if (patch.regionId === undefined && regionCell === '') {
        patch.regionId = null
      }
    } else {
      problems.push('errBadCoordinates')
    }
  } else if (latCell !== '' || lngCell !== '') {
    // Half a pair is a typo, and importing half of it would place the record
    // on the equator. Rejected with its row number, which is the whole point
    // of AA4.8.
    problems.push('errBadCoordinates')
  } else {
    warnings.push('warnNoPosition')
    patch.positionMissing = true
  }

  const notes = at('notes')
  if (notes !== '') patch.notes = notes

  const identity = {
    localityCode,
    name,
    locality: localityCell,
    council,
    farmName,
    farmerName,
  }
  return {
    rowNumber,
    name,
    council,
    localityCode,
    key: identityKey(identity),
    localityKey: localityKey(identity),
    seed: isLocalitySeed(identity),
    patch,
    problems,
    warnings,
    unknown,
  }
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export interface ProspectionPlanRow {
  row: ProspectionRow
  /** Set when the row matched a record already held. */
  farmId?: string
  /**
   * The patch as it will actually be applied — see `patchForUpdate`. Held on
   * the plan rather than recomputed by the writer, so what the coordinator
   * previewed and what the store writes are one object.
   */
  patch: ProspectionPatch
  /** For the preview: which fields this row would actually change. */
  changes: string[]
}

/**
 * ⚠️ AA4.3, THE CASE THAT IS NOT A CELL. `positionMissing: true` is not read
 *    from a column — it is DERIVED from two empty ones — so on an update it
 *    behaves exactly like the blank cell the rule is about: a sheet that has
 *    not been given coordinates must not un-place a farm whose pin the
 *    coordinator dragged in the app last week. It is kept on a CREATION, where
 *    it is the honest description of a record nobody has placed yet, and
 *    `positionMissing: false` always applies, because that one arrives WITH a
 *    real point.
 */
function patchForUpdate(patch: ProspectionPatch): ProspectionPatch {
  if (patch.positionMissing !== true) return patch
  const { positionMissing: _dropped, ...rest } = patch
  return rest
}

export interface ProspectionPlan {
  created: ProspectionPlanRow[]
  updated: ProspectionPlanRow[]
  rejected: ProspectionRow[]
  unknown: UnknownValue[]
  /** How many of the rows carry a usable point — the A75 figure. */
  positioned: number
  total: number
}

/**
 * ★★ AA4.8 · AA4.9 — WHAT WOULD HAPPEN, BEFORE IT HAPPENS.
 *
 * « Prévisualisation avant validation : le PO voit ce qui sera créé et
 *   modifié. » — and « rien ne passe silencieusement » for the rest. The plan
 *   is therefore a value, computed with no side effects, that the wizard
 *   renders and then hands back to the store. Nothing decides anything twice.
 *
 * ⚠️ AND SINCE AC1 IT MATCHES IN TWO PASSES. See the block comment inside.
 */
export function planProspection(
  rows: ProspectionRow[],
  existing: readonly Farm[],
  /**
   * ★★ AB6.7 · AC1 — HOW AN EXISTING RECORD IS KEYED, AND WHY IT IS A
   *    PARAMETER.
   *
   * For a prospection sheet it is `CODE_INDEX`: the State's locality code when
   * the record has one, the יישוב + מועצה pair otherwise, and in both cases
   * the שם החווה + שם החקלאי half beside it. That is right for a file that
   * CARRIES the code.
   *
   * The association's file does not, and it has no שם החווה column either, so
   * it passes `ASSOCIATION_INDEX` — a store whose records all carry
   * `code:1177#חוות הבשור|יוסי` would match NOTHING otherwise: measured in
   * AB6.7 as 193 creations on a re-import of our OWN export, which is the
   * duplicate this rule exists to prevent, arriving by the other door.
   */
  index: FarmIndex = CODE_INDEX,
): ProspectionPlan {
  const byKey = new Map<string, Farm>()
  /** ★ AC1 — the locality's seed, and its first record whatever that is. */
  const seedOfLocality = new Map<string, Farm>()
  const firstOfLocality = new Map<string, Farm>()

  /**
   * ★★ AC2 — A RECORD IS FINDABLE UNDER ITS LOCALITY *AND* UNDER ITS NAME.
   *
   * Until AC2 the workbook had no יישוב column and « שם המקום » WAS the
   * locality, so both readings were one string. They are two now, and a file
   * in the older shape — the roster import, the association's format, last
   * month's spreadsheet — can only ever produce the NAME one. Indexing a
   * record under both is what lets those files keep matching records whose
   * locality is a different word from their name; measured on `bun run
   * persist`, whose fixture farm is called « ייבוא א73 » and lives in a town
   * with another name entirely.
   *
   * ⚠️ PRIMARIES FIRST, ALIASES ONLY INTO THE GAPS. An alias must never
   *    displace a record that answers to that key for real, so the two passes
   *    are ordered and both are `if (!has)`.
   */
  const aliasOf = (farm: Farm) => ({ ...farm, locality: '' })
  for (const farm of existing) {
    const key = index.key(farm)
    if (!byKey.has(key)) byKey.set(key, farm)
    const where = index.locality(farm)
    if (!firstOfLocality.has(where)) firstOfLocality.set(where, farm)
    if (index.seed(farm) && !seedOfLocality.has(where)) seedOfLocality.set(where, farm)
  }
  for (const farm of existing) {
    const alias = aliasOf(farm)
    const key = index.key(alias)
    if (!byKey.has(key)) byKey.set(key, farm)
    const where = index.locality(alias)
    if (!firstOfLocality.has(where)) firstOfLocality.set(where, farm)
    if (index.seed(farm) && !seedOfLocality.has(where)) seedOfLocality.set(where, farm)
  }

  const created: ProspectionPlanRow[] = []
  const updated: ProspectionPlanRow[] = []
  const rejected: ProspectionRow[] = []
  const unknown: UnknownValue[] = []
  const seen = new Set<string>()
  let positioned = 0

  const accepted: ProspectionRow[] = []
  for (const row of rows) {
    unknown.push(...row.unknown)
    if (row.problems.length > 0) {
      rejected.push(row)
      continue
    }
    /**
     * ⚠️ THE FILE IS DE-DUPLICATED AGAINST ITSELF. Two rows with the same key
     *    in one sheet are a mistake in the sheet; importing both would create
     *    the duplicate this whole unit exists to prevent, and merging them
     *    silently would pick a winner nobody chose. The second is rejected, by
     *    row number, and the coordinator can see which.
     *
     * ★ AC1.3 — AND THIS IS WHERE « deux lignes qui partagent le même סמל
     *   יישוב » STOPPED BEING A DUPLICATE. Under AA4.2 the key WAS the code,
     *   so four farmers in בארי were four rows with one key and three of them
     *   were thrown away. The key now carries the holding, so the four are
     *   four keys and all four are kept.
     */
    if (seen.has(row.key)) {
      rejected.push({ ...row, problems: ['errDuplicateInFile'] })
      continue
    }
    seen.add(row.key)
    if (row.patch.position) positioned++
    accepted.push(row)
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ★★ AC1.1 — TWO PASSES, AND THE ORDER OF THE ROWS MUST NOT DECIDE.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * PASS 1 — every exact key. A record already claimed by an exact match is
   * off the table for everybody else.
   *
   * PASS 2 — the leftovers, against the LOCALITY:
   *
   *   · a row whose two names are filled and whose key is new takes the
   *     locality's SEED, if it still has one. That is « une amorce de
   *     localité … un remplissage ultérieur des deux champs la met à jour au
   *     lieu d'en créer une nouvelle », and it is the whole of A99.
   *   · an AMORCE row takes the locality's seed, or failing that its first
   *     record of any kind. It carries no farm and no farmer name, so the
   *     sparse patch cannot overwrite either (AA4.3); all it does is refresh
   *     the facts that belong to the LOCALITY — the council, the switchboard,
   *     the coordinates. Without this a store built from the old workbook,
   *     where the coordinator has since typed a farmer's name into the app,
   *     would answer a re-import of the very same file with 198 duplicates.
   *
   * ⚠️ WHY TWO PASSES AND NOT ONE LOOP. In one loop an amorce row appearing
   *    first would claim by locality a record that a later row matches
   *    EXACTLY, and that later row would then create a duplicate — the defect
   *    would depend on the order of the lines in a spreadsheet, which is the
   *    hardest kind to reproduce.
   */
  const claimed = new Set<string>()
  const matched = new Map<ProspectionRow, Farm>()
  for (const row of accepted) {
    const exact = byKey.get(row.key)
    if (exact && !claimed.has(exact.id)) {
      claimed.add(exact.id)
      matched.set(row, exact)
    }
  }
  for (const row of accepted) {
    if (matched.has(row)) continue
    const seed = seedOfLocality.get(row.localityKey)
    const fallback = row.seed ? (seed ?? firstOfLocality.get(row.localityKey)) : seed
    if (fallback && !claimed.has(fallback.id)) {
      claimed.add(fallback.id)
      matched.set(row, fallback)
    }
  }

  for (const row of accepted) {
    const match = matched.get(row)
    if (match) {
      const patch = patchForUpdate(row.patch)
      updated.push({ row, farmId: match.id, patch, changes: changedFields(match, patch) })
    } else {
      created.push({ row, patch: row.patch, changes: Object.keys(row.patch) })
    }
  }

  return { created, updated, rejected, unknown, positioned, total: rows.length }
}

/** Which keys of the patch differ from what the record already holds. */
function changedFields(farm: Farm, patch: ProspectionPatch): string[] {
  const before = farm as unknown as Record<string, unknown>
  return Object.entries(patch)
    .filter(([key, value]) => {
      if (key === 'position') {
        const p = value as LatLng
        return farm.position.lat !== p.lat || farm.position.lng !== p.lng
      }
      return JSON.stringify(before[key]) !== JSON.stringify(value)
    })
    .map(([key]) => key)
}

/**
 * The whole read: headers in, plan out.
 *
 * `HOME_BASE` is where a row with no coordinates is parked — see AA4.4 and the
 * `positionMissing` note on `Farm`. It is passed in rather than imported so
 * this file stays free of the config module and can be exercised with any
 * base at all.
 */
export function analyseProspection(
  headers: string[],
  matrix: string[][],
  existing: readonly Farm[],
  mapping?: ProspectionField[],
): { rows: ProspectionRow[]; plan: ProspectionPlan; mapping: ProspectionField[] } {
  const used = mapping ?? headers.map((h) => guessProspectionField(h))
  // +2: the header row, plus 1-based numbering, so the number is the one the
  // coordinator sees in the left margin of Excel.
  const rows = matrix.map((raw, i) => parseProspectionRow(raw, used, i + 2))
  return { rows, plan: planProspection(rows, existing), mapping: used }
}

// ---------------------------------------------------------------------------
// AA4.10 — the export, in the same columns
// ---------------------------------------------------------------------------

/**
 * ★★ AA4.10 — « EXPORT symétrique aux mêmes colonnes, réimportable tel quel.
 *    Aller-retour sans perte, test à l'appui. »
 *
 * ★ THE TEST IS WHAT MAKES THIS TRUE AND NOT INTENDED. `bun run prospection`
 *   exports the store, re-reads the export through the importer, and asserts
 *   that the plan contains 0 creations — every row found its own record — and
 *   that no field changed. A column dropped here shows up there as a change.
 *
 * ★ « אומדן סדר גודל » IS WRITTEN BACK EMPTY, on purpose. The app never stores
 *   it (AA4.6) and inventing a value to fill the column would be worse than a
 *   blank: the coordinator would re-import his own app's guess as if it were
 *   the association's estimate. « דונם משוקלל » is written with the app's own
 *   computation, which is the number the association wants; the importer
 *   ignores it on the way back in.
 */
export function prospectionExportMatrix(
  farms: readonly Farm[],
  /**
   * ★ AC4.6 — « כמות מתנדבים קבועים » IS COUNTED FROM THE GUARDS, and this
   *   module is pure: it holds no store and walks no missions. The caller —
   *   the export screen, the wizard, the gate — passes the counter in. Left
   *   out, the column is written blank rather than as a zero, because a zero
   *   in that cell reads as « nobody comes back » and absent reads as « this
   *   file was produced without asking », which is the truth.
   */
  regularsOf?: (farm: Farm) => number | null,
): string[][] {
  const header = PROSPECTION_COLUMNS.map((c) => c.header)
  const rows = farms.map((farm, i) =>
    PROSPECTION_COLUMNS.map((column) =>
      prospectionCell(farm, column.field, i + 1, regularsOf),
    ),
  )
  return [header, ...rows]
}

function prospectionCell(
  farm: Farm,
  field: ProspectionField,
  index: number,
  regularsOf?: (farm: Farm) => number | null,
): string {
  switch (field) {
    case 'index':
      return String(index)
    /* AC2.2 — recomposed, never echoed. See `composePlaceName`. */
    case 'name':
      return composePlaceName(farm, farm.name)
    case 'farmName':
      return farm.farmName ?? ''
    case 'farmerEmail':
      return farm.farmerEmail ?? ''
    case 'umbrella':
      return farm.umbrella ?? ''
    case 'locality':
      return farm.locality
    /* AC3.3 — the declared guarded area, defaulted from the two others. */
    case 'guarded':
      return String(guardedDunamsOf(farm))
    case 'regulars': {
      const n = regularsOf?.(farm)
      return n == null ? '' : String(n)
    }
    case 'localityCode':
      return farm.localityCode == null ? '' : String(farm.localityCode)
    case 'localityKind':
      return farm.localityKind ?? ''
    case 'council':
      return farm.council ?? ''
    case 'region':
      return regionById(farm.regionId ?? regionOf(farm.position))?.name ?? ''
    case 'councilPhone':
      return farm.councilPhone ?? ''
    case 'legalEntity':
      return optionLabel(farm.legalEntity, LEGAL_ENTITY_OPTIONS)
    case 'liaisonName':
      return farm.liaisonName ?? ''
    case 'liaisonPhone':
      return farm.liaisonPhone ?? ''
    case 'farmerName':
      return farm.farmerName ?? ''
    case 'farmerPhone':
      return farm.farmerPhone ?? ''
    case 'activity':
      return optionLabel(farm.type, FARM_TYPE_OPTIONS)
    case 'estimate':
      // AA4.6 · AC2.3 — never stored, never invented. See the note above.
      return ''
    case 'cultivated':
      return String(farm.farmDunams)
    case 'grazing':
      return String(farm.grazingDunams)
    case 'weighted':
      return String(weightedDunams(farm))
    case 'landAgreement':
      return optionLabel(farm.landAgreement, LAND_AGREEMENT_OPTIONS)
    case 'landAgreementUntil':
      return farm.landAgreementUntil ?? ''
    case 'status':
      return optionLabel(farm.status, FARM_STATUS_OPTIONS)
    case 'priority':
      return farm.priority == null ? '' : String(farm.priority)
    case 'lat':
      // ⚠️ NOT ROUNDED. The workbook carries five decimals and a round trip
      //    that dropped one would move every pin by a metre a week.
      return farm.positionMissing ? '' : String(farm.position.lat)
    case 'lng':
      return farm.positionMissing ? '' : String(farm.position.lng)
    case 'gmaps':
      return farm.positionMissing ? '' : googleMapsPointUrl(farm.position)
    case 'waze':
      return farm.positionMissing ? '' : wazeUrl(farm.position)
    case 'notes':
      return farm.notes
    default:
      return ''
  }
}

/** G16 — the entity kind a created record starts with, from סוג יישוב. */
export function entityKindForRow(patch: ProspectionPatch): 'farm' | 'moshav' | 'other' {
  return entityKindOfLocality(patch.localityKind ?? '')
}
