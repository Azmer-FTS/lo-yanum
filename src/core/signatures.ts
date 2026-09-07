import { normaliseValue } from './fields'
import { identityKey } from './prospection'
import type { Farm, LatLng, SignatureOrigin } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AA5 (2026-09-07) — REPRISE DES SIGNATURES DÉJÀ OBTENUES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The association is signing farmers TODAY, through an external web form, and
 * every signature reaches them as ONE ROW of a spreadsheet with the drawing
 * itself in a cell. Those rows are what they feed to the State. The product
 * owner asked, explicitly, for two things: to get those rows into this app,
 * and to be able to hand the association back the same shape so they can move
 * onto his system without changing what they do downstream.
 *
 * ★ SO A ROW IS A SIGNED FARM, AND A ROW WITH NO FARM CREATES ONE (AA5.2).
 *   « Le PO doit pouvoir faire signer d'abord et créer la fiche ensuite » —
 *   which is how it actually happens in a field: somebody signs at a gate on
 *   Tuesday and the record is typed on Thursday. Refusing the row until a
 *   record exists would invert that and lose the signature.
 *
 * ★ THE SIGNATURE CELL IS READ IN THREE SHAPES, AND AN UNREADABLE ONE NEVER
 *   COSTS THE ROW (AA5.3). « Jamais rejeter la ligne entière pour ça » — a
 *   farmer who signed has signed whether or not this app can draw it. The
 *   record is imported, flagged « חתימה חסרה », and the report says so.
 *
 * ★ AND EVERY SIGNATURE CARRIES WHERE IT CAME FROM (AA5.4). These rows become
 *   documents handed to a ministry; « signed in the app » and « imported from
 *   consents-2026-09.csv on the 7th » are different provenances and a document
 *   that cannot tell them apart is a document nobody can audit.
 *
 * PURE: no SheetJS, no DOM. The wizard parses the file; this decides.
 */

// ---------------------------------------------------------------------------
// AA5.3 — the cell
// ---------------------------------------------------------------------------

export type SignatureShape = 'dataUri' | 'url' | 'points' | 'unknown' | 'empty'

export interface SignatureCell {
  shape: SignatureShape
  /** Ready for an `<img src>`, or null when the shape was not recognised. */
  image: string | null
}

/**
 * Points, as the common form builders emit them:
 *
 *   [[12,4],[13,9],[20,11]]            · pairs
 *   [{"x":12,"y":4},{"x":13,"y":9}]    · objects
 *   12,4 13,9 20,11                    · the SVG polyline shorthand
 *   12,4;13,9;20,11                    · the same, semicolon separated
 *
 * ⚠️ THE STROKES ARE NOT SEPARATED. A signature drawn with three pen-downs
 *    arrives here as one list in every one of these formats, so the rendering
 *    joins them: a polyline through all of them draws a line the pen never
 *    made, between the end of one stroke and the start of the next. It is
 *    visibly a signature and it is not the exact signature — which is why
 *    `shape` is reported and the detail screen says « חתימה מיובאת » rather
 *    than presenting it as an original. A form that gives us strokes properly
 *    (an array of arrays of points) is read as such: see `readStrokes`.
 */
function readStrokes(raw: string): number[][][] | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      const strokes = asStrokes(parsed)
      return strokes && strokes.some((s) => s.length >= 2) ? strokes : null
    } catch {
      return null
    }
  }

  // The text forms: "x,y x,y" or "x,y;x,y".
  const points = trimmed
    .split(/[;\s]+/)
    .map((pair) => pair.split(','))
    .filter((parts) => parts.length === 2)
    .map((parts) => [Number(parts[0]), Number(parts[1])])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  return points.length >= 2 ? [points] : null
}

/** Coerce whatever JSON shape arrived into a list of strokes. */
function asStrokes(value: unknown): number[][][] | null {
  const point = (v: unknown): number[] | null => {
    if (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number') {
      return [v[0], v[1]]
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const x = typeof o.x === 'number' ? o.x : undefined
      const y = typeof o.y === 'number' ? o.y : undefined
      if (x !== undefined && y !== undefined) return [x, y]
    }
    return null
  }

  if (!Array.isArray(value)) {
    // `{ strokes: [...] }` and `{ points: [...] }` are both in the wild.
    if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>
      return asStrokes(o.strokes ?? o.points ?? o.lines ?? null)
    }
    return null
  }
  if (value.length === 0) return null

  const flat = value.map(point)
  if (flat.every((p) => p !== null)) return [flat as number[][]]

  const nested = value.map((v) => asStrokes(v))
  const strokes = nested.filter((s): s is number[][][] => s !== null).flat()
  return strokes.length > 0 ? strokes : null
}

/**
 * Draw the strokes as an SVG data URI.
 *
 * ⚠️ PERCENT-ENCODED, NOT BASE64. `btoa` is a browser API and this file is
 *    core; `encodeURIComponent` is the standard library and produces a URI an
 *    `<img>` accepts everywhere. The `#` in a colour would end the URI, so the
 *    stroke is named rather than written as a hex triple.
 */
function strokesToSvg(strokes: number[][][]): string {
  const all = strokes.flat()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of all) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const pad = 4
  const w = Math.max(1, maxX - minX) + pad * 2
  const h = Math.max(1, maxY - minY) + pad * 2
  const paths = strokes
    .filter((s) => s.length >= 2)
    .map(
      (s) =>
        `<polyline points="${s
          .map(([x, y]) => `${(x - minX + pad).toFixed(2)},${(y - minY + pad).toFixed(2)}`)
          .join(' ')}"/>`,
    )
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" ` +
    `fill="none" stroke="black" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round">${paths}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const IMAGE_DATA_URI = /^data:image\/[a-z0-9+.-]+[;,]/i
const HTTP_URL = /^https?:\/\/\S+$/i

/** AA5.3 — what shape is this cell, and can it be drawn? */
export function readSignatureCell(raw: string): SignatureCell {
  const value = (raw ?? '').trim()
  if (value === '') return { shape: 'empty', image: null }
  if (IMAGE_DATA_URI.test(value)) return { shape: 'dataUri', image: value }
  if (HTTP_URL.test(value)) return { shape: 'url', image: value }
  const strokes = readStrokes(value)
  if (strokes) return { shape: 'points', image: strokesToSvg(strokes) }
  return { shape: 'unknown', image: null }
}

// ---------------------------------------------------------------------------
// AA5.1 · AA5.6 — the columns, and the mapping the coordinator may correct
// ---------------------------------------------------------------------------

export type SignatureField =
  | 'ignore'
  | 'name'
  | 'localityCode'
  | 'council'
  | 'locality'
  | 'farmerName'
  | 'farmerPhone'
  | 'signedAt'
  | 'signature'
  | 'notes'

export interface SignatureColumn {
  field: Exclude<SignatureField, 'ignore'>
  /** The header this app writes on export, and the first thing it looks for. */
  header: string
  aliases?: readonly string[]
  required?: boolean
  width?: number
}

/**
 * ★ THE HEADERS ARE A GUESS, NOT A CONTRACT (AA5.6). This list is what the
 *   app WRITES and what it recognises without being asked; the file arriving
 *   from the association's form builder will have its own words, and the
 *   product owner « ne doit jamais être bloqué par un en-tête différent ». So
 *   an unrecognised header maps to `ignore` and the wizard shows the mapping
 *   screen — never an error.
 */
export const SIGNATURE_COLUMNS: readonly SignatureColumn[] = [
  {
    field: 'name',
    header: 'שם המקום',
    aliases: ['שם החווה', 'שם היישוב', 'שם המשק', 'שם', 'name', 'farm'],
    required: true,
    width: 22,
  },
  {
    field: 'localityCode',
    header: 'סמל יישוב (למ״ס)',
    aliases: ['סמל יישוב', 'סמל', 'קוד יישוב'],
    width: 14,
  },
  { field: 'council', header: 'מועצה אזורית', aliases: ['מועצה', 'council'], width: 16 },
  { field: 'locality', header: 'יישוב', aliases: ['ישוב', 'locality', 'city'], width: 16 },
  {
    field: 'farmerName',
    header: 'שם החותם',
    aliases: ['שם החקלאי', 'חותם', 'signed by', 'signer'],
    width: 20,
  },
  {
    field: 'farmerPhone',
    header: 'נייד החותם',
    aliases: ['נייד החקלאי', 'טלפון', 'phone', 'mobile'],
    width: 16,
  },
  {
    field: 'signedAt',
    header: 'תאריך חתימה',
    aliases: ['תאריך', 'date', 'signed at', 'timestamp', 'חותמת זמן'],
    width: 16,
  },
  {
    field: 'signature',
    header: 'חתימה',
    aliases: ['signature', 'חתימת החקלאי', 'sign', 'signature image'],
    required: true,
    width: 30,
  },
  { field: 'notes', header: 'הערות', aliases: ['הערה', 'notes'], width: 26 },
]

export function guessSignatureField(header: string): SignatureField {
  const h = normaliseValue(header)
  if (h === '') return 'ignore'
  for (const column of SIGNATURE_COLUMNS) {
    if (normaliseValue(column.header) === h) return column.field
    if ((column.aliases ?? []).some((a) => normaliseValue(a) === h)) return column.field
  }
  return 'ignore'
}

/** The fields a mapping cannot go without — see `SIGNATURE_COLUMNS`. */
export function requiredSignatureFields(): SignatureField[] {
  return SIGNATURE_COLUMNS.filter((c) => c.required).map((c) => c.field)
}

// ---------------------------------------------------------------------------
// Reading the rows
// ---------------------------------------------------------------------------

export type SignatureProblem = 'errMissingName'
export type SignatureWarning = 'warnSignatureMissing' | 'warnNoDate'

export interface SignatureRow {
  rowNumber: number
  name: string
  council: string
  localityCode: number | null
  locality: string
  farmerName: string
  farmerPhone: string
  /** ISO datetime, or null when the row carried no readable date. */
  signedAt: string | null
  signature: string | null
  signatureShape: SignatureShape
  notes: string
  key: string
  problems: SignatureProblem[]
  warnings: SignatureWarning[]
}

/**
 * A date out of somebody else's form.
 *
 * ⚠️ `new Date(x)` ON A `DD/MM/YYYY` IS THE AMERICAN READING, and 03/09/2026
 *    is the third of September in this country and the ninth of March in that
 *    parser. The two unambiguous forms are handled explicitly; anything else
 *    is handed to the platform, and an unreadable cell is `null` rather than a
 *    date somebody invented — the import then falls back to the day it ran,
 *    and SAYS it did.
 */
export function readSignedAt(raw: string): string | null {
  const v = (raw ?? '').trim()
  if (v === '') return null
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(v)
  if (dmy) {
    const [, d, m, y, hh = '12', mm = '00'] = dmy
    const date = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
    )
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const parsed = new Date(v)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function parseSignatureRow(
  raw: string[],
  mapping: SignatureField[],
  rowNumber: number,
): SignatureRow {
  const at = (field: SignatureField): string => {
    const i = mapping.indexOf(field)
    return i === -1 ? '' : (raw[i] ?? '').toString().trim()
  }

  const problems: SignatureProblem[] = []
  const warnings: SignatureWarning[] = []

  const name = at('name')
  if (name === '') problems.push('errMissingName')

  const codeRaw = at('localityCode')
  const code = codeRaw === '' ? null : Number(codeRaw.replace(/[,\s]/g, ''))
  const localityCode = code !== null && Number.isFinite(code) ? code : null

  const cell = readSignatureCell(at('signature'))
  if (cell.image === null) warnings.push('warnSignatureMissing')

  const signedAt = readSignedAt(at('signedAt'))
  if (signedAt === null) warnings.push('warnNoDate')

  const council = at('council')

  return {
    rowNumber,
    name,
    council,
    localityCode,
    locality: at('locality'),
    farmerName: at('farmerName'),
    farmerPhone: at('farmerPhone'),
    signedAt,
    signature: cell.image,
    signatureShape: cell.shape,
    notes: at('notes'),
    key: identityKey({ localityCode, name, council }),
    problems,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export interface SignaturePlanRow {
  row: SignatureRow
  /** Present when the row matched a record already held (AA5.2). */
  farmId?: string
}

export interface SignaturePlan {
  attached: SignaturePlanRow[]
  created: SignaturePlanRow[]
  rejected: SignatureRow[]
  /** Rows imported WITHOUT their signature — the « חתימה חסרה » list. */
  unreadable: SignatureRow[]
  total: number
}

export function planSignatures(
  rows: SignatureRow[],
  existing: readonly Farm[],
): SignaturePlan {
  const byKey = new Map<string, Farm>()
  for (const farm of existing) byKey.set(identityKey(farm), farm)

  const attached: SignaturePlanRow[] = []
  const rejected: SignatureRow[] = []
  const unreadable: SignatureRow[] = []
  /**
   * ⚠️ ONE NEW RECORD PER KEY, AND THE LAST ROW WINS.
   *
   * Two rows for the same place in one file is a farmer who signed twice — a
   * corrected consent, a second copy of the same export. Creating two records
   * would be exactly the duplicate AA4.2 spends a whole unit preventing, and
   * picking the first would keep the superseded signature. A Map keyed on the
   * identity does both: it collapses to one record and the later row overwrites
   * the earlier, which is the reading a re-signature has.
   */
  const newByKey = new Map<string, SignaturePlanRow>()

  for (const row of rows) {
    if (row.problems.length > 0) {
      rejected.push(row)
      continue
    }
    // AA5.3 — imported, flagged, and named in the report. Never rejected.
    if (row.signature === null) unreadable.push(row)

    const match = byKey.get(row.key)
    if (match) attached.push({ row, farmId: match.id })
    else newByKey.set(row.key, { row })
  }

  return {
    attached,
    created: [...newByKey.values()],
    rejected,
    unreadable,
    total: rows.length,
  }
}

export function analyseSignatures(
  headers: string[],
  matrix: string[][],
  existing: readonly Farm[],
  mapping?: SignatureField[],
): { rows: SignatureRow[]; plan: SignaturePlan; mapping: SignatureField[] } {
  const used = mapping ?? headers.map((h) => guessSignatureField(h))
  const rows = matrix.map((raw, i) => parseSignatureRow(raw, used, i + 2))
  return { rows, plan: planSignatures(rows, existing), mapping: used }
}

// ---------------------------------------------------------------------------
// AA5.4 — what a signed row does to a record
// ---------------------------------------------------------------------------

/** The patch a signed row applies. Sparse, on the same rule as AA4.3. */
export interface SignaturePatch {
  status: 'signed'
  signature: string | null
  signatureMissing?: boolean
  signatureOrigin: SignatureOrigin
  farmerName?: string
  farmerPhone?: string
  notes?: string
  localityCode?: number | null
  council?: string
}

export function signaturePatch(
  row: SignatureRow,
  fileName: string,
  importedAt: string,
): SignaturePatch {
  const patch: SignaturePatch = {
    // AA5.4 — « Ces imports posent bien le statut הסכמה נחתמה ».
    status: 'signed',
    signature: row.signature,
    signatureOrigin: {
      kind: 'imported',
      signedAt: row.signedAt,
      fileName,
      importedAt,
    },
  }
  if (row.signature === null) patch.signatureMissing = true
  if (row.farmerName !== '') patch.farmerName = row.farmerName
  if (row.farmerPhone !== '') patch.farmerPhone = row.farmerPhone
  if (row.notes !== '') patch.notes = row.notes
  if (row.localityCode !== null) patch.localityCode = row.localityCode
  if (row.council !== '') patch.council = row.council
  return patch
}

// ---------------------------------------------------------------------------
// AA5.5 — the export the association receives back
// ---------------------------------------------------------------------------

/**
 * ★★ AA5.5 — « C'est ce fichier que le PO remettra à l'association. »
 *
 * One row per signed farm, the signature in a cell, in the columns this
 * importer reads — so the file the association gets back is a file this app
 * can swallow again unchanged (A84). That symmetry is the whole point: it is
 * how they migrate onto his system without changing anything downstream.
 *
 * ⚠️ THE SIGNATURE CELL IS THE DATA URI ITSELF, WHICH MAKES THESE FILES BIG,
 *    and that is the right trade. A URL would point at something the
 *    association cannot resolve and the State certainly cannot; a cell that
 *    carries the image is a cell that still means something in five years on a
 *    laptop with no network.
 */
export function signedFarms(farms: readonly Farm[]): Farm[] {
  return farms.filter((f) => f.status === 'signed' || f.status === 'active')
}

export function signatureExportMatrix(
  farms: readonly Farm[],
  signatureOf: (farm: Farm) => string | null,
): string[][] {
  const header = SIGNATURE_COLUMNS.map((c) => c.header)
  const rows = signedFarms(farms).map((farm) =>
    SIGNATURE_COLUMNS.map((column) => {
      switch (column.field) {
        case 'name':
          return farm.name
        case 'localityCode':
          return farm.localityCode == null ? '' : String(farm.localityCode)
        case 'council':
          return farm.council ?? ''
        case 'locality':
          return farm.locality
        case 'farmerName':
          return farm.farmerName ?? signerOf(farm)
        case 'farmerPhone':
          return farm.farmerPhone ?? ''
        case 'signedAt':
          return signedAtOf(farm) ?? ''
        case 'signature':
          return signatureOf(farm) ?? ''
        case 'notes':
          return farm.notes
        default:
          return ''
      }
    }),
  )
  return [header, ...rows]
}

/** Who signed: the farmer field, or the agreement that carries a name. */
export function signerOf(farm: Farm): string {
  if (farm.farmerName) return farm.farmerName
  const signed = [...farm.agreements].sort((a, b) => a.signedAt.localeCompare(b.signedAt))
  return signed[signed.length - 1]?.signedBy ?? ''
}

/** When: the origin's date, else the latest agreement's. */
export function signedAtOf(farm: Farm): string | null {
  if (farm.signatureOrigin?.signedAt) return farm.signatureOrigin.signedAt
  const signed = [...farm.agreements].sort((a, b) => a.signedAt.localeCompare(b.signedAt))
  return signed[signed.length - 1]?.signedAt ?? null
}

/**
 * The image to put in the cell: the imported one, or the one drawn in the app
 * on the most recent agreement. A farm signed on paper has neither and exports
 * an empty cell — which is the truth, not a gap.
 */
export function signatureImageOf(farm: Farm): string | null {
  if (farm.signature) return farm.signature
  const withImage = [...farm.agreements]
    .sort((a, b) => a.signedAt.localeCompare(b.signedAt))
    .filter((a) => a.signature)
  return withImage[withImage.length - 1]?.signature ?? null
}

/** AA5.2 — a row with no record of its own becomes one, at the given base. */
export function farmFromSignatureRow(
  row: SignatureRow,
  fallbackPosition: LatLng,
): {
  name: string
  locality: string
  council?: string
  localityCode?: number | null
  position: LatLng
  positionMissing: true
} {
  return {
    name: row.name,
    locality: row.locality || row.name,
    council: row.council || undefined,
    localityCode: row.localityCode,
    position: fallbackPosition,
    // It signed at a gate nobody has recorded; the pin is a to-do.
    positionMissing: true,
  }
}
