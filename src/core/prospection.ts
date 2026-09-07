import {
  FARM_STATUS_OPTIONS,
  FARM_TYPE_OPTIONS,
  LAND_AGREEMENT_OPTIONS,
  LEGAL_ENTITY_OPTIONS,
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
  | 'localityCode'
  | 'localityKind'
  | 'council'
  | 'region'
  | 'councilPhone'
  | 'legalEntity'
  | 'liaisonName'
  | 'liaisonPhone'
  | 'farmerName'
  | 'farmerPhone'
  | 'activity'
  | 'estimate'
  | 'cultivated'
  | 'grazing'
  | 'weighted'
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
 */
export const PROSPECTION_COLUMNS: readonly ProspectionColumn[] = [
  { field: 'index', header: "מס'", aliases: ['מס', 'מספר', '#'], width: 6 },
  { field: 'name', header: 'שם המקום', aliases: ['שם', 'שם היישוב', 'שם החווה'], width: 22 },
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
    field: 'legalEntity',
    header: 'סוג הישות המשפטית',
    aliases: ['הישות המשפטית', 'סוג ישות משפטית'],
    width: 20,
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
  { field: 'farmerName', header: 'שם החקלאי', aliases: ['החקלאי', 'שם חקלאי'], width: 20 },
  { field: 'farmerPhone', header: 'נייד החקלאי', aliases: ['טלפון החקלאי'], width: 16 },
  { field: 'activity', header: 'סוג פעילות', aliases: ['פעילות', 'סוג חווה'], width: 14 },
  {
    field: 'estimate',
    header: 'אומדן סדר גודל (דונם) — הערכה בלבד',
    aliases: ['אומדן סדר גודל', 'אומדן', 'אומדן (דונם)'],
    width: 22,
  },
  {
    field: 'cultivated',
    header: 'שטח מעובד (דונם)',
    aliases: ['שטח מעובד', 'מעובד'],
    width: 14,
  },
  { field: 'grazing', header: 'שטח מרעה (דונם)', aliases: ['שטח מרעה', 'מרעה'], width: 14 },
  { field: 'weighted', header: 'דונם משוקלל', aliases: ['משוקלל'], width: 14 },
  {
    field: 'landAgreement',
    header: 'סוג הסכם קרקע',
    aliases: ['הסכם קרקע', 'סוג ההסכם'],
    width: 24,
  },
  {
    field: 'landAgreementUntil',
    header: 'תוקף ההסכם',
    aliases: ['תוקף', 'תוקף הסכם'],
    width: 14,
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
 * ★★ AA4.2 — THE KEY A RE-IMPORT MATCHES ON.
 *
 * « CLÉ D'IDENTITÉ : סמל יישוב s'il est présent, sinon שם המקום + מועצה
 *   אזורית. Un réimport MET À JOUR, il ne crée jamais de doublon. »
 *
 * ⚠️ THE TWO KEYS LIVE IN ONE NAMESPACE AND ARE PREFIXED. Without the prefix a
 *    farm whose code is 1177 and one whose name normalises to "1177" would
 *    collide — absurd until somebody names a plot after its block number.
 */
export function identityKey(record: {
  localityCode?: number | null
  name: string
  council?: string
}): string {
  if (record.localityCode != null && Number.isFinite(record.localityCode)) {
    return `code:${record.localityCode}`
  }
  return `place:${normaliseValue(record.name)}|${normaliseValue(record.council ?? '')}`
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
  localityCode?: number | null
  localityKind?: string
  council?: string
  councilPhone?: string
  region?: string
  regionId?: RegionId | null
  legalEntity?: string
  liaisonName?: string
  liaisonPhone?: string
  farmerName?: string
  farmerPhone?: string
  type?: FarmType
  farmDunams?: number
  grazingDunams?: number
  farmDunamsManual?: boolean
  grazingDunamsManual?: boolean
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

  const name = at('name')
  if (name === '') problems.push('errMissingName')
  else patch.name = name

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
  const farmerName = at('farmerName')
  if (farmerName !== '') patch.farmerName = farmerName
  const farmerPhone = at('farmerPhone')
  if (farmerPhone !== '') patch.farmerPhone = farmerPhone

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

  return {
    rowNumber,
    name,
    council,
    localityCode,
    key: identityKey({ localityCode, name, council }),
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
 * ⚠️ AND THE FILE IS DE-DUPLICATED AGAINST ITSELF. Two rows with the same key
 *    in one sheet are a mistake in the sheet; importing both would create the
 *    duplicate this whole unit exists to prevent, and merging them silently
 *    would pick a winner nobody chose. The second one is rejected, by row
 *    number, and the coordinator can see which.
 */
export function planProspection(
  rows: ProspectionRow[],
  existing: readonly Farm[],
): ProspectionPlan {
  const byKey = new Map<string, Farm>()
  for (const farm of existing) byKey.set(identityKey(farm), farm)

  const created: ProspectionPlanRow[] = []
  const updated: ProspectionPlanRow[] = []
  const rejected: ProspectionRow[] = []
  const unknown: UnknownValue[] = []
  const seen = new Set<string>()
  let positioned = 0

  for (const row of rows) {
    unknown.push(...row.unknown)
    if (row.problems.length > 0) {
      rejected.push(row)
      continue
    }
    if (seen.has(row.key)) {
      rejected.push({ ...row, problems: ['errDuplicateInFile'] })
      continue
    }
    seen.add(row.key)
    if (row.patch.position) positioned++

    const match = byKey.get(row.key)
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
export function prospectionExportMatrix(farms: readonly Farm[]): string[][] {
  const header = PROSPECTION_COLUMNS.map((c) => c.header)
  const rows = farms.map((farm, i) =>
    PROSPECTION_COLUMNS.map((column) => prospectionCell(farm, column.field, i + 1)),
  )
  return [header, ...rows]
}

function prospectionCell(farm: Farm, field: ProspectionField, index: number): string {
  switch (field) {
    case 'index':
      return String(index)
    case 'name':
      return farm.name
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
      // AA4.6 — never stored, never invented. See the note above.
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
