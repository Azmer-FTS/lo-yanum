import type { PhoneType, Volunteer, VolunteerStatus } from './types'

/**
 * Import validation for the volunteer CSV/XLSX wizard (R5.4).
 *
 * PURE: this file knows nothing about SheetJS, files or React. The UI parses
 * the workbook into a plain string matrix and hands it here; everything that
 * decides whether a row is importable lives in core, so the same rules can be
 * re-run server-side in Lot 1 without touching a line of it.
 */

/** Fields an imported column can be mapped onto. */
export type ImportField =
  | 'ignore'
  | 'name'
  | 'phone'
  | 'yeshiva'
  | 'locality'
  | 'age'
  | 'phoneType'

export const IMPORT_FIELDS: ImportField[] = [
  'ignore',
  'name',
  'phone',
  'yeshiva',
  'locality',
  'age',
  'phoneType',
]

/** Errors are i18n keys under `import.*`, never user-facing copy. */
export type ImportProblem =
  | 'errMissingName'
  | 'errMissingPhone'
  | 'errBadPhone'
  | 'errDuplicate'
  | 'errDuplicateInFile'

export interface ParsedRow {
  /** 1-based row number in the source file, including the header row. */
  rowNumber: number
  name: string
  phone: string
  yeshiva: string
  locality: string
  age: number | null
  phoneType: PhoneType
  problems: ImportProblem[]
}

export interface ImportAnalysis {
  rows: ParsedRow[]
  importable: ParsedRow[]
  rejected: ParsedRow[]
}

/** Digits only, so "054-123 4567" and "0541234567" compare equal. */
export function normalisePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function isValidIsraeliPhone(raw: string): boolean {
  const d = normalisePhone(raw)
  return /^0\d{8,9}$/.test(d)
}

/**
 * Guess a mapping from header text, so the common case needs no manual work.
 * Deliberately conservative — an unrecognised header maps to `ignore` rather
 * than to a wrong guess that silently imports phone numbers into the name
 * column.
 */
export function guessField(header: string): ImportField {
  const h = header.trim().toLowerCase()
  const has = (...needles: string[]) => needles.some((n) => h.includes(n))

  // Order matters: "סוג טלפון" (phone TYPE) contains "טלפון" (phone), so the
  // more specific rule has to be tested first or the type column silently
  // steals the phone mapping.
  if (has('סוג', 'type', 'כשר', 'kosher')) return 'phoneType'
  if (has('שם', 'name')) return 'name'
  if (has('טלפון', 'נייד', 'phone', 'mobile', 'tel')) return 'phone'
  if (has('ישיבה', 'yeshiva')) return 'yeshiva'
  if (has('יישוב', 'ישוב', 'עיר', 'locality', 'city', 'town')) return 'locality'
  if (has('גיל', 'age')) return 'age'
  return 'ignore'
}

const KOSHER_HINTS = ['כשר', 'kosher', 'basic']

function readPhoneType(raw: string): PhoneType {
  const v = raw.trim().toLowerCase()
  return KOSHER_HINTS.some((k) => v.includes(k)) ? 'kosher' : 'smartphone'
}

/**
 * Validate a parsed sheet against the existing roster.
 *
 * Duplicate detection is by normalised phone number and runs twice: against
 * the roster already in the system, and against earlier rows of the same file
 * — a spreadsheet that lists someone twice is at least as common as one that
 * re-adds an existing volunteer.
 */
export function analyseImport(
  matrix: string[][],
  mapping: ImportField[],
  existing: Volunteer[],
): ImportAnalysis {
  const existingPhones = new Set(existing.map((v) => normalisePhone(v.phone)))
  const seenInFile = new Set<string>()

  const columnFor = (field: ImportField) => mapping.indexOf(field)
  const cell = (row: string[], field: ImportField): string => {
    const i = columnFor(field)
    return i === -1 ? '' : (row[i] ?? '').toString().trim()
  }

  const rows: ParsedRow[] = matrix.map((raw, index) => {
    const name = cell(raw, 'name')
    const phone = cell(raw, 'phone')
    const ageRaw = cell(raw, 'age')
    const ageNum = Number(ageRaw)

    const problems: ImportProblem[] = []
    if (!name) problems.push('errMissingName')

    if (!phone) {
      problems.push('errMissingPhone')
    } else if (!isValidIsraeliPhone(phone)) {
      problems.push('errBadPhone')
    } else {
      const key = normalisePhone(phone)
      if (existingPhones.has(key)) problems.push('errDuplicate')
      else if (seenInFile.has(key)) problems.push('errDuplicateInFile')
      else seenInFile.add(key)
    }

    return {
      // +2: the header row, plus 1-based numbering, so the number matches what
      // the coordinator sees in Excel.
      rowNumber: index + 2,
      name,
      phone,
      yeshiva: cell(raw, 'yeshiva'),
      locality: cell(raw, 'locality'),
      age: ageRaw && Number.isFinite(ageNum) ? ageNum : null,
      phoneType: readPhoneType(cell(raw, 'phoneType')),
      problems,
    }
  })

  return {
    rows,
    importable: rows.filter((r) => r.problems.length === 0),
    rejected: rows.filter((r) => r.problems.length > 0),
  }
}

export interface ImportDefaults {
  yeshiva: string
  locality: string
}

/** Turn validated rows into store drafts. */
export function toVolunteerDrafts(
  rows: ParsedRow[],
  defaults: ImportDefaults,
): Array<{
  photo: string | null
  name: string
  age: number
  phone: string
  phoneType: PhoneType
  yeshiva: string
  locality: string
  status: VolunteerStatus
  inactiveReason: string | null
  notes: string
}> {
  return rows.map((r) => ({
    photo: null,
    name: r.name,
    age: r.age ?? 20,
    phone: r.phone,
    phoneType: r.phoneType,
    yeshiva: r.yeshiva || defaults.yeshiva,
    locality: r.locality || defaults.locality,
    status: 'active' as VolunteerStatus,
    inactiveReason: null,
    notes: '',
  }))
}

/**
 * The downloadable template.
 *
 * Ships with a BOM so Excel opens the Hebrew headers correctly instead of
 * rendering mojibake — the single most common failure when a coordinator
 * double-clicks a UTF-8 CSV on Windows.
 */
export function sampleCsv(headers: string[]): string {
  const rows = [
    headers,
    ['אריאל כהן', '050-0001111', 'ישיבת שדרות', 'שדרות', '21', 'סמארטפון'],
    ['נתנאל בר־און', '053-0001112', 'ישיבת שדרות', 'שדרות', '20', 'כשר'],
    ['שמואל וייס', '054-0001113', 'ישיבת הר עציון', 'אפרת', '22', 'כשר'],
  ]
  return '﻿' + rows.map((r) => r.join(',')).join('\r\n') + '\r\n'
}
