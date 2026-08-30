import { isUnresolvableLocationLink, parsePositionInput, positionOfLocality } from './geo'
import {
  readEntityKind,
  readFarmStatus,
  readFarmType,
  readPhoneType,
  requiredFields,
} from './templates'
import type { ImportField, ImportKind } from './templates'
import type {
  Driver,
  EntityKind,
  Farm,
  FarmStatus,
  FarmType,
  LatLng,
  PhoneType,
  Volunteer,
  VolunteerStatus,
} from './types'

/**
 * Import validation for the CSV/XLSX wizard (R5.4, extended by G10).
 *
 * PURE: this file knows nothing about SheetJS, files or React. The UI parses
 * the workbook into a plain string matrix and hands it here; everything that
 * decides whether a row is importable lives in core, so the same rules can be
 * re-run server-side in Lot 1 without touching a line of it. That is not
 * hypothetical any more — P3.1 points the wizard at Supabase and this file is
 * what makes that a change of destination rather than a rewrite.
 *
 * G10 turned one import into three (volunteers, farms, drivers) sharing one
 * pipeline. The COLUMNS live in `templates.ts`; what follows is only the
 * validation, which is genuinely per-kind.
 */

export type { ImportField, ImportKind } from './templates'
export {
  IMPORT_KINDS,
  IMPORT_TEMPLATES,
  fieldsFor,
  guessField,
  requiredFields,
  templateMatrix,
} from './templates'

/** Errors are i18n keys under `import.*`, never user-facing copy. */
export type ImportProblem =
  | 'errMissingName'
  | 'errMissingPhone'
  | 'errBadPhone'
  | 'errDuplicate'
  | 'errDuplicateInFile'
  | 'errMissingLocality'
  | 'errBadSeats'

/**
 * G10 — NOT AN ERROR. A row with a warning still imports.
 *
 * "מיקום חסר" is the case this distinction exists for: a farm whose location
 * link could not be read is still a farm the programme wants on its list, and
 * refusing it would mean the coordinator hand-edits the spreadsheet instead of
 * dropping a pin on the map later — which is the easier of the two by a mile.
 * The badge is a to-do, not a rejection.
 */
export type ImportWarning = 'warnNoPosition' | 'warnUnreadableLink'

export interface ParsedRow {
  /** 1-based row number in the source file, including the header row. */
  rowNumber: number
  name: string
  phone: string
  /** Volunteers + drivers; empty for a farm's own record (see contactPhone). */
  yeshiva: string
  locality: string
  age: number | null
  phoneType: PhoneType
  // --- farms ---------------------------------------------------------------
  entityKind: EntityKind
  region: string
  farmType: FarmType
  farmStatus: FarmStatus
  /** Resolved from the link column, or from the locality gazetteer, or null. */
  position: LatLng | null
  /** How `position` was obtained — the badge in the preview reads this. */
  positionSource: 'link' | 'locality' | 'none'
  farmDunams: number
  grazingDunams: number
  contactName: string
  contactPhone: string
  notes: string
  // --- drivers -------------------------------------------------------------
  vehicle: string
  seats: number
  availabilityNote: string

  problems: ImportProblem[]
  warnings: ImportWarning[]
}

export interface ImportAnalysis {
  kind: ImportKind
  rows: ParsedRow[]
  importable: ParsedRow[]
  rejected: ParsedRow[]
  /** G10 — importable rows that still need a hand afterwards. */
  warned: ParsedRow[]
}

/** Digits only, so "054-123 4567" and "0541234567" compare equal. */
export function normalisePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function isValidIsraeliPhone(raw: string): boolean {
  const d = normalisePhone(raw)
  return /^0\d{8,9}$/.test(d)
}

/** A number from a cell that may carry commas, units or nothing at all. */
function readNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** The roster a kind de-duplicates against, reduced to normalised phones. */
export interface ExistingRecords {
  volunteers?: readonly Volunteer[]
  drivers?: readonly Driver[]
  farms?: readonly Farm[]
}

function existingKeys(kind: ImportKind, existing: ExistingRecords): Set<string> {
  switch (kind) {
    case 'volunteers':
      return new Set((existing.volunteers ?? []).map((v) => normalisePhone(v.phone)))
    case 'drivers':
      return new Set((existing.drivers ?? []).map((d) => normalisePhone(d.phone)))
    case 'farms':
      // A farm has no phone of its own, so the identity is its NAME. Compared
      // case- and space-insensitively: "חוות רתם" and "חוות  רתם " are one
      // farm, and re-importing the same sheet twice must not double the list.
      return new Set(
        (existing.farms ?? []).map((f) => f.name.trim().replace(/\s+/g, ' ').toLowerCase()),
      )
  }
}

const rowKey = (kind: ImportKind, row: { name: string; phone: string }): string =>
  kind === 'farms'
    ? row.name.trim().replace(/\s+/g, ' ').toLowerCase()
    : normalisePhone(row.phone)

/**
 * Validate a parsed sheet against what the system already holds.
 *
 * Duplicate detection runs TWICE: against the existing roster, and against
 * earlier rows of the same file — a spreadsheet that lists someone twice is at
 * least as common as one that re-adds a record already in the system.
 */
export function analyseImport(
  matrix: string[][],
  mapping: ImportField[],
  existing: ExistingRecords,
  kind: ImportKind = 'volunteers',
): ImportAnalysis {
  const existingIds = existingKeys(kind, existing)
  const seenInFile = new Set<string>()
  const required = requiredFields(kind)

  const columnFor = (field: ImportField) => mapping.indexOf(field)
  const cell = (row: string[], field: ImportField): string => {
    const i = columnFor(field)
    return i === -1 ? '' : (row[i] ?? '').toString().trim()
  }

  const rows: ParsedRow[] = matrix.map((raw, index) => {
    const name = cell(raw, 'name')
    const phone = cell(raw, 'phone')
    const locality = cell(raw, 'locality')
    const ageNum = readNumber(cell(raw, 'age'))
    const seatsNum = readNumber(cell(raw, 'seats'))

    const problems: ImportProblem[] = []
    const warnings: ImportWarning[] = []

    if (!name) problems.push('errMissingName')

    // A farm carries its CONTACT's phone, and that contact is optional at
    // import time — a farm the programme has not spoken to yet is exactly the
    // record `to_contact` exists for.
    const phoneIsRequired = required.includes('phone')
    if (phoneIsRequired && !phone) {
      problems.push('errMissingPhone')
    } else if (phone && !isValidIsraeliPhone(phone)) {
      problems.push('errBadPhone')
    }

    if (required.includes('locality') && !locality) {
      problems.push('errMissingLocality')
    }

    if (kind === 'drivers' && cell(raw, 'seats') !== '') {
      if (seatsNum === null || seatsNum < 1 || seatsNum > 60) {
        problems.push('errBadSeats')
      }
    }

    // --- G10: the position, and how honest we can be about it ---------------
    const linkCell = cell(raw, 'positionLink')
    const fromLink = parsePositionInput(linkCell)
    const fromLocality = fromLink === null ? positionOfLocality(locality) : null
    const position = fromLink ?? fromLocality
    const positionSource: ParsedRow['positionSource'] =
      fromLink !== null ? 'link' : fromLocality !== null ? 'locality' : 'none'

    if (kind === 'farms') {
      if (isUnresolvableLocationLink(linkCell)) warnings.push('warnUnreadableLink')
      if (position === null) warnings.push('warnNoPosition')
    }

    const row: ParsedRow = {
      // +2: the header row, plus 1-based numbering, so the number matches what
      // the coordinator sees in Excel.
      rowNumber: index + 2,
      name,
      phone,
      yeshiva: cell(raw, 'yeshiva'),
      locality,
      age: ageNum,
      phoneType: readPhoneType(cell(raw, 'phoneType')),
      entityKind: readEntityKind(cell(raw, 'entityKind')),
      region: cell(raw, 'region'),
      farmType: readFarmType(cell(raw, 'farmType')),
      farmStatus: readFarmStatus(cell(raw, 'farmStatus')),
      position,
      positionSource,
      farmDunams: readNumber(cell(raw, 'farmDunams')) ?? 0,
      grazingDunams: readNumber(cell(raw, 'grazingDunams')) ?? 0,
      contactName: cell(raw, 'contactName'),
      contactPhone: cell(raw, 'contactPhone'),
      notes: cell(raw, 'notes'),
      vehicle: cell(raw, 'vehicle'),
      seats: seatsNum ?? 0,
      availabilityNote: cell(raw, 'availabilityNote'),
      problems,
      warnings,
    }

    // Identity last, so a row already rejected for a bad phone is not ALSO
    // reported as a duplicate of a record it could never have matched.
    const key = rowKey(kind, row)
    if (key !== '' && problems.length === 0) {
      if (existingIds.has(key)) problems.push('errDuplicate')
      else if (seenInFile.has(key)) problems.push('errDuplicateInFile')
      else seenInFile.add(key)
    }

    return row
  })

  return {
    kind,
    rows,
    importable: rows.filter((r) => r.problems.length === 0),
    rejected: rows.filter((r) => r.problems.length > 0),
    warned: rows.filter((r) => r.problems.length === 0 && r.warnings.length > 0),
  }
}

export interface ImportDefaults {
  yeshiva: string
  locality: string
  /** Where a farm with no readable position is parked — see `toFarmDrafts`. */
  fallbackPosition: LatLng
}

/** Turn validated rows into volunteer drafts. */
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
 * Turn validated rows into farm drafts.
 *
 * A row with no readable position still imports, parked on `fallbackPosition`
 * and flagged `warnNoPosition` in the analysis. The alternative — refusing it —
 * pushes the work back onto a spreadsheet, when dragging a pin on the farm's
 * own map takes four seconds. The badge is what makes the debt findable.
 *
 * Dunams come in as MANUAL: the number in the sheet is the farmer's own claim
 * and must not be silently overwritten the first time somebody draws a zone
 * (G15's `syncZoneDunams` respects the flag). Zero means "not stated", so it
 * is left automatic and the map will fill it in.
 */
export function toFarmDrafts(
  rows: ParsedRow[],
  defaults: ImportDefaults,
): Array<{
  photo: string | null
  name: string
  locality: string
  region: string
  type: FarmType
  entityKind: EntityKind
  status: FarmStatus
  position: LatLng
  farmDunams: number
  grazingDunams: number
  farmDunamsManual?: boolean
  grazingDunamsManual?: boolean
  contacts: Farm['contacts']
  commitments: Farm['commitments']
  agreements: Farm['agreements']
  notes: string
}> {
  return rows.map((r, i) => ({
    photo: null,
    name: r.name,
    locality: r.locality || defaults.locality,
    region: r.region,
    type: r.farmType,
    entityKind: r.entityKind,
    status: r.farmStatus,
    position: r.position ?? defaults.fallbackPosition,
    farmDunams: r.farmDunams,
    grazingDunams: r.grazingDunams,
    farmDunamsManual: r.farmDunams > 0 || undefined,
    grazingDunamsManual: r.grazingDunams > 0 || undefined,
    contacts:
      r.contactName || r.contactPhone
        ? [
            {
              id: `imported-contact-${r.rowNumber}-${i}`,
              name: r.contactName || r.name,
              role: '',
              phone: r.contactPhone,
              isPrimary: true,
              photo: null,
            },
          ]
        : [],
    commitments: [],
    agreements: [],
    notes: r.notes,
  }))
}

/** Turn validated rows into driver drafts. */
export function toDriverDrafts(
  rows: ParsedRow[],
  defaults: ImportDefaults,
): Array<{
  photo: string | null
  name: string
  phone: string
  vehicle: string
  seats: number
  locality: string
  availabilityNote: string
  notes: string
}> {
  return rows.map((r) => ({
    photo: null,
    name: r.name,
    phone: r.phone,
    vehicle: r.vehicle,
    // A driver with no stated capacity is not a driver anyone can staff a
    // guard with, but 4 is the honest floor for "a car" and the roster's own
    // form is where it gets corrected.
    seats: r.seats > 0 ? r.seats : 4,
    locality: r.locality || defaults.locality,
    availabilityNote: r.availabilityNote,
    notes: '',
  }))
}

/**
 * The downloadable template, as CSV.
 *
 * Retained for the fallback path only — G10 generates an .xlsx through
 * SheetJS, which is what the product owner actually opens. Ships with a BOM so
 * Excel reads the Hebrew headers instead of mojibake, the single most common
 * failure when a coordinator double-clicks a UTF-8 CSV on Windows.
 */
export function sampleCsv(matrix: string[][]): string {
  const escape = (cell: string) =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
  return (
    '﻿' + matrix.map((r) => r.map(escape).join(',')).join('\r\n') + '\r\n'
  )
}
