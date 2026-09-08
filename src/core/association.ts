import { LAND_AGREEMENT_OPTIONS, LEGAL_ENTITY_OPTIONS, effectiveAreas, normaliseValue, optionLabel, readOption } from './fields'
import { ASSOCIATION_INDEX, planProspection } from './prospection'
import type { ProspectionPatch, ProspectionPlan, ProspectionRow } from './prospection'
import type { Farm, LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AB6 (2026-09-08) — L'EXPORT AU FORMAT DE L'ASSOCIATION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The point of the whole pass, in the product owner's own words:
 *
 *   « Le PO importe son Excel dans l'app, l'enrichit sur le terrain, et doit
 *     pouvoir en ressortir un fichier que l'association charge TEL QUEL dans
 *     son système, sans ressaisie. »
 *
 * ★ THIS FILE IS THE CORRESPONDENCE TABLE, AND IT IS THE ONLY ONE. « Table de
 *   correspondance dans UN SEUL fichier de configuration, éditable sans
 *   toucher au code. » `ASSOCIATION_COLUMNS` below is that table: one ROW per
 *   column of their file, carrying the header exactly as their portal spells
 *   it, which of OUR values fills it, and how it is written. Re-pointing a
 *   column at a different value of ours is editing one word on one line;
 *   adding a column is adding a line. There is no `switch` on a header
 *   anywhere, here or downstream.
 *
 * ⚠️ FOUR TRAPS IN THEIR FORMAT, EVERY ONE OF THEM MEASURED ON THEIR OWN DATA
 *    AND EVERY ONE OF THEM SILENT IF GOT WRONG:
 *
 *    1. THEIR מיקום IS LONGITUDE, LATITUDE. « 35.501401, 32.371810 » — the
 *       reverse of every other system. In this country latitude is about 32
 *       and longitude about 35, so the two are never equal and the WRONG order
 *       still parses: a file with the pair swapped loads perfectly and puts
 *       every farm in Syria. `coordinateOrder` below refuses in BOTH
 *       directions, and the export runs it on every row it writes.
 *
 *    2. THEY HAVE TWO COLUMNS CALLED מיקום. One carries the coordinates, the
 *       other the name of the locality. Both are produced, distinct, adjacent
 *       — a header is not an identity here, the POSITION in the row is, which
 *       is why the reader below matches on position when a header repeats.
 *
 *    3. TELEPHONES ARE `(0XX) XXX-XXXX`. Ours are stored `0XX-XXXXXXX`; the
 *       importer canonicalises back, or a round trip would rewrite every
 *       number in the database into their punctuation.
 *
 *    4. DATES ARE `JJ/MM/AAAA`. Ours are `YYYY-MM-DD` day-strings with no
 *       time and no zone (AA2bis), and they stay that way in the database.
 *
 * ⚠️ AND ONE TRAP THAT WAS READ AS OURS AND WAS NOT — CLOSED BY AC3. « שטחים
 *    שמירה » looked like a careless copy of « שטחים מעובדים » on their sheets,
 *    so AB6.4 refused to write it. The product owner has ruled: it is a
 *    DECLARATION, filled on purpose, and it means « we watch the whole of
 *    this ». The column is now filled from `guardedDunamsOf` — מעובד + מרעה by
 *    default, overridable farm by farm — and it no longer comes out blank.
 *
 * PURE: no SheetJS, no DOM, no React — like everything under /src/core.
 */

// ---------------------------------------------------------------------------
// 1 — The correspondence table
// ---------------------------------------------------------------------------

/**
 * Which of OUR values fills a column. One name per value, and the readers are
 * gathered in `SOURCE` at the foot of this file — so a column is re-pointed by
 * changing this word on its row, and nothing else.
 */
export type AssociationSource =
  | 'placeName'
  | 'contactName'
  | 'contactPhone'
  | 'landAgreementKind'
  | 'grazingDunams'
  | 'cultivatedDunams'
  | 'guardedDunams'
  | 'volunteeringCount'
  | 'landAgreementUntil'
  | 'regularVolunteers'
  | 'coordinates'
  | 'localityName'
  | 'signature'
  | 'farmerDeclaration'
  | 'institutionKind'
  | 'institution'
  | 'businessName'
  | 'farmerEmail'

export type AssociationFormat = 'text' | 'number' | 'date' | 'phone' | 'coords'

export interface AssociationColumn {
  /** Exactly as their portal spells it. This is what is written and matched. */
  header: string
  source: AssociationSource
  format: AssociationFormat
  /** Other spellings, matched whole after `normaliseValue`, on import. */
  aliases?: readonly string[]
  /** Approximate character width, so the workbook opens readable. */
  width?: number
  /**
   * ★ AB6.3 — WHAT IT IS CALLED ON OUR SIDE, in Hebrew, printed in the export
   *   report. « הסכם רעיה/חכירה ← סוג הסכם קרקע » is a sentence the product
   *   owner can check against his own screen; a source id is not.
   */
  ours: string
}

/**
 * ★★ AB6.1 — THEIR COLUMNS, IN THEIR ORDER, WITH ONE INSERTION.
 *
 * The seventeen headers were transcribed from their portal in the order they
 * appear on it, and that order is preserved exactly. The eighteenth row —
 * the second « מיקום », the one carrying the locality NAME — is inserted
 * immediately after the coordinates it is a duplicate of, because the brief
 * requires both (trap 2 above) and lists only one. Adjacent is the only place
 * that keeps the transcribed seventeen in an unbroken sequence.
 */
export const ASSOCIATION_COLUMNS: readonly AssociationColumn[] = [
  {
    header: 'שם המקום',
    source: 'placeName',
    format: 'text',
    aliases: ['שם החווה', 'שם היישוב', 'שם'],
    width: 24,
    ours: 'שם המקום',
  },
  {
    header: 'איש קשר',
    source: 'contactName',
    format: 'text',
    aliases: ['שם החקלאי', 'שם איש קשר'],
    width: 20,
    ours: 'שם החקלאי (חותם)',
  },
  {
    header: 'נייד איש קשר',
    source: 'contactPhone',
    format: 'phone',
    aliases: ['נייד החקלאי', 'טלפון איש קשר', 'נייד'],
    width: 18,
    ours: 'נייד החקלאי',
  },
  {
    header: 'הסכם רעיה/חכירה',
    source: 'landAgreementKind',
    format: 'text',
    aliases: ['הסכם רעיה', 'הסכם חכירה', 'סוג הסכם קרקע', 'הסכם רעיה / חכירה'],
    width: 26,
    ours: 'סוג הסכם קרקע',
  },
  {
    header: 'שטחי מרעה',
    source: 'grazingDunams',
    format: 'number',
    aliases: ['שטח מרעה', 'שטחי מרעה (דונם)'],
    width: 14,
    ours: 'שטח מרעה (דונם)',
  },
  {
    header: 'שטחים מעובדים',
    source: 'cultivatedDunams',
    format: 'number',
    aliases: ['שטח מעובד', 'שטחים מעובדים (דונם)'],
    width: 16,
    ours: 'שטח מעובד (דונם)',
  },
  {
    header: 'שטחים שמירה',
    source: 'guardedDunams',
    format: 'number',
    aliases: ['שטח שמירה'],
    width: 14,
    ours: 'שטח נשמר בפועל',
  },
  {
    header: 'כמות התנדבויות',
    source: 'volunteeringCount',
    format: 'number',
    aliases: ['כמות התנדבות', 'מספר התנדבויות'],
    width: 16,
    ours: 'שיבוצי מתנדבים בשמירות החווה',
  },
  {
    header: 'תאריך תפוגה הסכם קרקע',
    source: 'landAgreementUntil',
    format: 'date',
    aliases: ['תוקף ההסכם', 'תאריך תפוגה', 'תפוגת הסכם'],
    width: 20,
    ours: 'תוקף ההסכם',
  },
  {
    header: 'כמות מתנדבים קבועים',
    source: 'regularVolunteers',
    format: 'number',
    aliases: ['מתנדבים קבועים'],
    width: 18,
    ours: 'מתנדבים עם שתי שמירות ומעלה בחווה',
  },
  {
    header: 'מיקום',
    source: 'coordinates',
    format: 'coords',
    aliases: ['קואורדינטות', 'נ״צ'],
    width: 24,
    ours: 'קו אורך, קו רוחב',
  },
  /* Trap 2 — the second column of the same name, the locality. */
  {
    header: 'מיקום',
    source: 'localityName',
    format: 'text',
    aliases: ['יישוב', 'ישוב'],
    width: 18,
    ours: 'יישוב',
  },
  {
    header: 'חתימה',
    source: 'signature',
    format: 'text',
    aliases: ['signature', 'חתימת החקלאי'],
    width: 30,
    ours: 'חתימה (תמונה)',
  },
  {
    header: 'הצהרת חקלאי',
    source: 'farmerDeclaration',
    format: 'text',
    aliases: ['הצהרת חקלאים'],
    width: 14,
    ours: 'סוג ההסכם הוא הצהרת חקלאים',
  },
  {
    header: 'סיווג מוסד',
    source: 'institutionKind',
    format: 'text',
    aliases: ['סוג מוסד', 'סוג הישות המשפטית'],
    width: 20,
    ours: 'סוג הישות המשפטית',
  },
  {
    header: 'מוסד',
    source: 'institution',
    format: 'text',
    aliases: ['מועצה אזורית', 'מועצה'],
    width: 18,
    ours: 'מועצה אזורית',
  },
  {
    header: 'שם העסק',
    source: 'businessName',
    format: 'text',
    aliases: ['שם עסק'],
    width: 20,
    ours: '—',
  },
  {
    header: 'מייל חקלאי',
    source: 'farmerEmail',
    format: 'text',
    aliases: ['אימייל חקלאי', 'דוא״ל', 'מייל'],
    width: 24,
    ours: 'דוא״ל של איש הקשר הראשי',
  },
]

// ---------------------------------------------------------------------------
// 2 — The formats their system expects
// ---------------------------------------------------------------------------

const digitsOf = (raw: string): string => raw.replace(/\D/g, '')

/**
 * `(0XX) XXX-XXXX` — trap 3.
 *
 * ⚠️ A NUMBER THAT IS NOT TEN DIGITS IS WRITTEN BACK VERBATIM. A landline
 *    typed as an eight-digit local number, a note in the cell, an
 *    international `+972` — reshaping any of those into a mobile's punctuation
 *    would produce a number that dials nowhere while looking correct.
 */
export function associationPhone(raw: string): string {
  const d = digitsOf(raw)
  if (d.length !== 10 || !d.startsWith('0')) return raw.trim()
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Back to the shape this app stores, `0XX-XXXXXXX`. Same escape hatch. */
export function canonicalPhone(raw: string): string {
  const d = digitsOf(raw)
  if (d.length !== 10 || !d.startsWith('0')) return raw.trim()
  return `${d.slice(0, 3)}-${d.slice(3)}`
}

/** `JJ/MM/AAAA` — trap 4. An empty or unparseable value stays empty. */
export function associationDate(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayKey.trim())
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** And back to `YYYY-MM-DD`. Accepts their form and ours. */
export function canonicalDate(raw: string): string {
  const v = raw.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(v)
  if (!dmy) return ''
  return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
}

/**
 * ★★ TRAP 1 — WHICH WAY ROUND IS THIS PAIR?
 *
 * Israel's box, generously: latitude 29 → 34, longitude 33.5 → 36.5. The two
 * ranges OVERLAP between 33.5 and 34, so a range test alone cannot answer —
 * and that overlap is exactly where a swapped pair hides.
 *
 * ★ WHAT SETTLES IT IS THAT IN THIS COUNTRY THE LONGITUDE IS ALWAYS THE
 *   LARGER OF THE TWO. The northernmost point (מטולה) is 33.28 N at 35.58 E;
 *   the southernmost (אילת) is 29.55 N at 34.95 E; the westernmost coast is
 *   34.27 E. There is no point in Israel whose latitude reaches its own
 *   longitude, so `first > second` is a decision and not a heuristic.
 *
 * Returns what the pair IS, so a caller can refuse in either direction:
 * writing `lat, lng` is as much a defect as reading it.
 */
export type CoordinateOrder = 'lng-lat' | 'lat-lng' | 'outside'

const LAT_RANGE = [29, 34] as const
const LNG_RANGE = [33.5, 36.5] as const
const inRange = (v: number, r: readonly [number, number]): boolean =>
  v >= r[0] && v <= r[1]

export function coordinateOrder(first: number, second: number): CoordinateOrder {
  if (!Number.isFinite(first) || !Number.isFinite(second)) return 'outside'
  const asLngLat = inRange(first, LNG_RANGE) && inRange(second, LAT_RANGE)
  const asLatLng = inRange(first, LAT_RANGE) && inRange(second, LNG_RANGE)
  if (asLngLat && first > second) return 'lng-lat'
  if (asLatLng && second > first) return 'lat-lng'
  return 'outside'
}

/**
 * Their cell: « 35.501401, 32.371810 ». Not rounded — the workbook carries six
 * decimals and a round trip that dropped one would move every pin by a metre.
 */
export function associationCoords(position: LatLng): string {
  return `${position.lng}, ${position.lat}`
}

/** Read one of their cells. `null` when it is empty, unparseable, or SWAPPED. */
export function readAssociationCoords(
  raw: string,
): { position: LatLng | null; order: CoordinateOrder | 'empty' } {
  const v = raw.trim()
  if (v === '') return { position: null, order: 'empty' }
  const parts = v.split(/[,;\s]+/).filter((p) => p !== '')
  if (parts.length < 2) return { position: null, order: 'outside' }
  const a = Number(parts[0])
  const b = Number(parts[1])
  const order = coordinateOrder(a, b)
  if (order !== 'lng-lat') return { position: null, order }
  return { position: { lat: b, lng: a }, order }
}

// ---------------------------------------------------------------------------
// 3 — What a row is made of
// ---------------------------------------------------------------------------

/**
 * Everything a row needs that is NOT on the farm record.
 *
 * ⚠️ THE COUNTS ARE PASSED IN RATHER THAN COMPUTED HERE, and that keeps this
 *    module free of the store: `associationInputs` in `access.ts` is what
 *    walks the guards. It also means the gate can build a row from nothing but
 *    a literal.
 */
export interface AssociationInput {
  farm: Farm
  /** Volunteer-nights served at this farm, over every guard it has had. */
  volunteering: number
  /** Volunteers with TWO OR MORE guards here — this app's reading of « קבוע ». */
  regulars: number
  /** The signature image, in the shape AA5's import reads and writes. */
  signature: string | null
  /**
   * AB6.4 → AC3.3 — the area this programme DECLARES it watches.
   *
   * `null` still leaves the cell empty and names the column in the export
   * report; since AC3 the caller has a real figure to pass, and does.
   */
  guardedDunams: number | null
}

const primaryContact = (farm: Farm) =>
  farm.contacts.find((c) => c.isPrimary) ?? farm.contacts[0] ?? null

/**
 * The readers, one per source. This is the other half of the correspondence
 * table and it lives beside it deliberately: a column and what fills it are
 * one decision, and splitting them across two files is how G10 learnt that a
 * column declared in three places is forgotten in one of them.
 */
const SOURCE: Record<AssociationSource, (input: AssociationInput) => string> = {
  placeName: ({ farm }) => farm.name,
  /* AB6 — « איש קשר » is the SIGNER. Their own form asks for מייל חקלאי and
     הצהרת חקלאי beside it, so the person these three columns describe is the
     farmer, not the council's switchboard. */
  contactName: ({ farm }) => farm.farmerName ?? primaryContact(farm)?.name ?? '',
  contactPhone: ({ farm }) => farm.farmerPhone ?? primaryContact(farm)?.phone ?? '',
  landAgreementKind: ({ farm }) =>
    optionLabel(farm.landAgreement, LAND_AGREEMENT_OPTIONS),
  /* AD1.4 — la déclarée, ou la mesurée à défaut. Même règle que le format de
     prospection, et pour la même raison : un fichier moins renseigné que
     l'écran qui l'a produit est un fichier qu'il faut recompléter à la main. */
  grazingDunams: ({ farm }) => String(effectiveAreas(farm).grazing),
  cultivatedDunams: ({ farm }) => String(effectiveAreas(farm).cultivated),
  /* AC3.3 — the declared guarded area; see `guardedDunamsOf` in fields.ts. */
  guardedDunams: ({ guardedDunams }) =>
    guardedDunams === null ? '' : String(guardedDunams),
  volunteeringCount: ({ volunteering }) => String(volunteering),
  landAgreementUntil: ({ farm }) => farm.landAgreementUntil ?? '',
  regularVolunteers: ({ regulars }) => String(regulars),
  coordinates: ({ farm }) =>
    farm.positionMissing ? '' : associationCoords(farm.position),
  localityName: ({ farm }) => farm.locality,
  signature: ({ signature }) => signature ?? '',
  /* Their column is a yes/no about the declaration; ours is the kind of paper
     on file, and « הצהרת חקלאים בלבד » is one of its values. */
  farmerDeclaration: ({ farm }) =>
    farm.landAgreement === 'farmer_declaration' ? 'כן' : '',
  institutionKind: ({ farm }) => optionLabel(farm.legalEntity, LEGAL_ENTITY_OPTIONS),
  institution: ({ farm }) => farm.council ?? '',
  /* ⚠️ NOT STORED, AND NOT INVENTED — the same rule as שטחים שמירה and as
     « אומדן סדר גודל » in the prospection export (AA4.6). Writing the place's
     name here would hand the association back its own שם המקום under a
     heading that means something else. */
  businessName: () => '',
  farmerEmail: ({ farm }) => primaryContact(farm)?.email ?? '',
}

function cell(input: AssociationInput, column: AssociationColumn): string {
  const raw = SOURCE[column.source](input)
  if (raw === '') return ''
  if (column.format === 'phone') return associationPhone(raw)
  if (column.format === 'date') return associationDate(raw)
  return raw
}

// ---------------------------------------------------------------------------
// 4 — The export, and what it has to say about itself
// ---------------------------------------------------------------------------

export interface AssociationBlank {
  header: string
  ours: string
  /** `notStored` — this app has no such value. `noData` — it has, and it is empty. */
  reason: 'notStored' | 'noData'
}

export interface AssociationReport {
  rows: number
  /** AB6.4 — the columns that came out empty on EVERY row, and why. */
  blanks: AssociationBlank[]
  /** Rows whose coordinates would have gone out in the wrong order. */
  badCoordinates: { name: string; text: string }[]
}

/**
 * Sources this app simply does not hold. Reported as such, never filled.
 *
 * ★★ AC3.3 — « שטחים שמירה » LEFT THIS SET. AB6.4 put it here because this
 *    programme recorded no guarded area and copying the cultivated one would
 *    have handed the State a figure nobody measured. The product owner has
 *    since ruled the column a DECLARATION rather than a measurement, and the
 *    app now holds one: `guardedDunamsOf`, defaulted to מעובד + מרעה and
 *    overridable farm by farm. « Elle ne sort plus vide. »
 */
const NOT_STORED: ReadonlySet<AssociationSource> = new Set(['businessName'])

export function associationExportMatrix(inputs: readonly AssociationInput[]): {
  matrix: string[][]
  report: AssociationReport
} {
  const header = ASSOCIATION_COLUMNS.map((c) => c.header)
  const matrix = inputs.map((input) =>
    ASSOCIATION_COLUMNS.map((column) => cell(input, column)),
  )

  const blanks: AssociationBlank[] = []
  ASSOCIATION_COLUMNS.forEach((column, i) => {
    const anything = matrix.some((row) => row[i] !== '')
    if (anything) return
    blanks.push({
      header: column.header,
      ours: column.ours,
      reason: NOT_STORED.has(column.source) ? 'notStored' : 'noData',
    })
  })

  /**
   * ⚠️ TRAP 1, ENFORCED ON THE WAY OUT AND NOT ONLY ON THE WAY IN. Every
   *    coordinate cell this function wrote is read back with the same reader
   *    the importer uses; anything that does not come back as `lng-lat` is a
   *    row the association would place in the wrong country, and it is named.
   */
  const coordIndex = ASSOCIATION_COLUMNS.findIndex((c) => c.format === 'coords')
  const badCoordinates: { name: string; text: string }[] = []
  if (coordIndex !== -1) {
    matrix.forEach((row, i) => {
      const text = row[coordIndex]
      if (text === '') return
      if (readAssociationCoords(text).order !== 'lng-lat') {
        badCoordinates.push({ name: inputs[i].farm.name, text })
      }
    })
  }

  return {
    matrix: [header, ...matrix],
    report: { rows: matrix.length, blanks, badCoordinates },
  }
}

// ---------------------------------------------------------------------------
// 5 — Reading their file back (AB6.7, the round trip)
// ---------------------------------------------------------------------------

export type AssociationField = AssociationSource | 'ignore'

/**
 * ⚠️ THE HEADER IS NOT AN IDENTITY HERE — trap 2. Two columns are called
 *    מיקום, so a name-to-field map would answer with whichever of the two it
 *    happened to hold. The reader therefore matches POSITIONALLY first: the
 *    n-th occurrence of a repeated header takes the n-th declared column of
 *    that name. Everything else falls back to the whole-string alias match
 *    that `prospection.ts` and `signatures.ts` already use.
 */
export function guessAssociationMapping(headers: readonly string[]): AssociationField[] {
  const used = new Set<number>()
  return headers.map((raw) => {
    const h = normaliseValue(raw)
    if (h === '') return 'ignore'
    const exact = ASSOCIATION_COLUMNS.findIndex(
      (c, i) => !used.has(i) && normaliseValue(c.header) === h,
    )
    if (exact !== -1) {
      used.add(exact)
      return ASSOCIATION_COLUMNS[exact].source
    }
    const alias = ASSOCIATION_COLUMNS.findIndex(
      (c, i) => !used.has(i) && (c.aliases ?? []).some((a) => normaliseValue(a) === h),
    )
    if (alias !== -1) {
      used.add(alias)
      return ASSOCIATION_COLUMNS[alias].source
    }
    return 'ignore'
  })
}

export interface AssociationRow {
  rowNumber: number
  name: string
  council: string
  patch: ProspectionPatch
  /** The signature cell, when the row carried one. */
  signature: string | null
  problems: ('errMissingName' | 'errBadCoordinates')[]
}

const num = (raw: string): number | null => {
  const cleaned = raw.replace(/[,\s‏‎]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * One of their rows → a SPARSE patch, exactly like `parseProspectionRow`.
 *
 * ⚠️ AA4.3 APPLIES UNCHANGED AND IT IS WHY THE ROUND TRIP IS SAFE: a key is
 *    present only when its cell said something, so `{...farm, ...patch}`
 *    cannot erase what their file has no column for — and their file has no
 *    column for סמל יישוב, for the region, for the notes, or for either of the
 *    two liaison fields. Re-importing an association export must not delete
 *    any of them, and it does not.
 *
 * ⚠️ THE FOUR DERIVED COLUMNS ARE READ AND DISCARDED. כמות התנדבויות and
 *    כמות מתנדבים קבועים are counted from this app's own guards; שטחים שמירה
 *    is not stored at all; הצהרת חקלאי restates הסכם רעיה/חכירה. Writing any
 *    of them back would be importing this app's own arithmetic as if it were
 *    the association's data — the same mistake AA4.7 refused for דונם משוקלל.
 */
export function parseAssociationRow(
  raw: readonly string[],
  mapping: readonly AssociationField[],
  rowNumber: number,
): AssociationRow {
  const at = (field: AssociationField): string => {
    const i = mapping.indexOf(field)
    return i === -1 ? '' : (raw[i] ?? '').toString().trim()
  }
  const set = <K extends keyof ProspectionPatch>(
    patch: ProspectionPatch,
    key: K,
    value: ProspectionPatch[K] | undefined,
  ): void => {
    if (value !== undefined) patch[key] = value
  }

  const patch: ProspectionPatch = {}
  const problems: AssociationRow['problems'] = []

  const name = at('placeName')
  if (name === '') problems.push('errMissingName')
  else patch.name = name

  const council = at('institution')
  if (council !== '') patch.council = council

  const locality = at('localityName')
  if (locality !== '') patch.locality = locality

  const contactName = at('contactName')
  if (contactName !== '') patch.farmerName = contactName
  const contactPhone = at('contactPhone')
  if (contactPhone !== '') patch.farmerPhone = canonicalPhone(contactPhone)

  const agreement = at('landAgreementKind')
  if (agreement !== '') {
    const option = readOption(agreement, LAND_AGREEMENT_OPTIONS)
    if (option) patch.landAgreement = option.id
  }

  const until = at('landAgreementUntil')
  if (until !== '') {
    const day = canonicalDate(until)
    if (day !== '') patch.landAgreementUntil = day
  }

  const kind = at('institutionKind')
  if (kind !== '') {
    const option = readOption(kind, LEGAL_ENTITY_OPTIONS)
    if (option) patch.legalEntity = option.id
  }

  const grazing = num(at('grazingDunams'))
  if (grazing !== null) {
    patch.grazingDunams = grazing
    /* G15 — and the flag only when the figure is a real one. AA4 learnt this
       on a sheet of 198 zeroes: marking a zero as hand-entered freezes it at
       zero for ever, because a drawn zone then refuses to fill it. */
    set(patch, 'grazingDunamsManual', grazing > 0 ? true : undefined)
  }
  const cultivated = num(at('cultivatedDunams'))
  if (cultivated !== null) {
    patch.farmDunams = cultivated
    set(patch, 'farmDunamsManual', cultivated > 0 ? true : undefined)
  }

  const coords = at('coordinates')
  if (coords !== '') {
    const read = readAssociationCoords(coords)
    if (read.position) patch.position = read.position
    else problems.push('errBadCoordinates')
  }

  const signature = at('signature')

  return {
    rowNumber,
    name,
    council,
    patch,
    signature: signature === '' ? null : signature,
    problems,
  }
}

// ---------------------------------------------------------------------------
// 6 — The whole read: their file in, a plan out
// ---------------------------------------------------------------------------

/**
 * ★★ AB6.7 — AND IT REUSES THE PROSPECTION PLANNER RATHER THAN COPYING IT.
 *
 * « Test d'aller-retour : export au format association, réimport dans l'app,
 *   aucune perte ni doublon. »
 *
 * The three things that make a re-import safe were solved once, in AA4, and
 * every one of them is about the PATCH rather than about the columns: an empty
 * cell never overwrites, a file is de-duplicated against itself, and a key
 * that already exists updates instead of creating. Reimplementing them for a
 * second format is how the two drift apart, and the one that drifts is
 * whichever the gate happens not to drive that week. So an association row
 * becomes a `ProspectionRow` and `planProspection` answers.
 *
 * ⚠️ THE IDENTITY KEY IS THE NAME + THE COUNCIL, AND IT HAS TO BE: their
 *    format carries no סמל יישוב at all. `identityKey` already falls back to
 *    exactly that pair (AA4.2), which is what makes the round trip land on the
 *    same records — and it inherits that rule's known limit, written out in
 *    ETAT: a record entered by hand with no מועצה will not meet a row that
 *    carries one.
 */
export function analyseAssociation(
  headers: readonly string[],
  matrix: readonly (readonly string[])[],
  existing: readonly Farm[],
  mapping?: readonly AssociationField[],
): {
  rows: AssociationRow[]
  plan: ProspectionPlan
  mapping: AssociationField[]
} {
  const used = [...(mapping ?? guessAssociationMapping(headers))]
  // +2: the header row, plus 1-based numbering, so the number is the one the
  // coordinator sees in the left margin of Excel.
  const rows = matrix.map((raw, i) => parseAssociationRow([...raw], used, i + 2))
  const asProspection: ProspectionRow[] = rows.map((row) => {
    /* ★ AC1 — their format has no שם החווה column, so the holding half of the
       key is the farmer alone, on BOTH sides. See `ASSOCIATION_INDEX`. */
    const identity = {
      localityCode: null,
      name: row.name,
      locality: row.patch.locality ?? '',
      council: row.council,
      farmerName: row.patch.farmerName ?? '',
    }
    return {
      rowNumber: row.rowNumber,
      name: row.name,
      council: row.council,
      localityCode: null,
      key: ASSOCIATION_INDEX.key(identity),
      localityKey: ASSOCIATION_INDEX.locality(identity),
      seed: ASSOCIATION_INDEX.seed(identity),
      patch: row.patch,
      problems: row.problems,
      warnings: [],
      unknown: [],
    }
  })
  /* ⚠️ AND THE EXISTING RECORDS ARE KEYED THE SAME WAY. See the note on
     `planProspection`'s third parameter: keying them by `identityKey` would
     give every farm imported from the prospection workbook a `code:` key that
     no association row can ever produce. */
  return {
    rows,
    plan: planProspection(asProspection, existing, ASSOCIATION_INDEX),
    mapping: used,
  }
}

/** The signature cells of the rows that carried one, by identity key. */
export function associationSignatures(
  rows: readonly AssociationRow[],
): Map<string, string> {
  const out = new Map<string, string>()
  for (const row of rows) {
    if (!row.signature) continue
    out.set(
      ASSOCIATION_INDEX.key({
        name: row.name,
        locality: row.patch.locality ?? '',
        council: row.council,
        farmerName: row.patch.farmerName ?? '',
      }),
      row.signature,
    )
  }
  return out
}
