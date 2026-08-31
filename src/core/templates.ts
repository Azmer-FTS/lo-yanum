import type { EntityKind, FarmStatus, FarmType, LivestockKind, PhoneType } from './types'
import {
  STYLE_BODY,
  STYLE_EXAMPLE,
  STYLE_HEADER,
  STYLE_TITLE,
  STYLE_WRAP,
  buildWorkbook,
  sheetName,
} from './xlsx'
import type { SheetSpec } from './xlsx'

/**
 * G10 — THE TEMPLATES ARE ONE SOURCE OF TRUTH.
 *
 * Before this file the volunteer import had its columns declared in three
 * places that had to agree by hand: the CSV exporter's example rows in
 * `import.ts` (since deleted, P0bis.4), the header list the wizard passed it,
 * and `guessField`'s keyword table. Adding a column meant editing all three,
 * and forgetting one meant a template whose headers the wizard could not
 * recognise — the worst possible bug in an import, because it looks like the
 * coordinator's file is wrong.
 *
 * A template is now a list of COLUMNS, and everything else is derived:
 *
 *   · the downloadable .xlsx (headers, example rows, column widths);
 *   · the header-to-field guess (each column carries its own aliases, so the
 *     coordinator's own spreadsheet is recognised as readily as ours);
 *   · the mapping step's option list;
 *   · the required-columns check.
 *
 * The i18n keys are held here as STRINGS, not resolved: @core stays free of
 * React and of i18next, so the UI resolves them. The Hebrew examples are
 * data, not copy — they are cell CONTENT in a generated file, which is the
 * one place @core legitimately carries Hebrew (the same way the mock
 * fixtures do).
 */

export type ImportKind = 'volunteers' | 'farms' | 'drivers'

export const IMPORT_KINDS: readonly ImportKind[] = [
  'volunteers',
  'farms',
  'drivers',
] as const

/**
 * Every field any template can map onto. One flat union rather than three,
 * because the mapping UI, the analysis and the drafts all key off it and
 * three parallel unions would need three of everything.
 *
 * `ignore` is the escape for a column we do not want — and the default guess,
 * because an unrecognised header must never be guessed into `phone`.
 */
export type ImportField =
  | 'ignore'
  // volunteers
  | 'name'
  | 'phone'
  | 'yeshiva'
  | 'locality'
  | 'age'
  | 'phoneType'
  | 'email'
  // farms
  | 'entityKind'
  | 'region'
  | 'farmType'
  | 'farmStatus'
  | 'positionLink'
  | 'farmDunams'
  | 'grazingDunams'
  | 'contactName'
  | 'contactPhone'
  | 'contactEmail'
  // PO POINT 6 — three type/count pairs; see FARM_COLUMNS for why three.
  | 'livestockKind1'
  | 'livestockHeads1'
  | 'livestockKind2'
  | 'livestockHeads2'
  | 'livestockKind3'
  | 'livestockHeads3'
  | 'notes'
  // drivers
  | 'vehicle'
  | 'seats'
  | 'availabilityNote'

export interface TemplateColumn {
  field: Exclude<ImportField, 'ignore'>
  /** i18n key under `import.field*`, resolved by the UI. */
  labelKey: string
  /**
   * Lower-case fragments that identify this column in somebody else's
   * spreadsheet. Matched as substrings, LONGEST FIRST across the whole
   * template — see `guessField`.
   */
  aliases: readonly string[]
  required?: boolean
  /** Three example cells, one per sample row of the generated template. */
  examples: readonly [string, string, string]
  /** Approximate character width, so the .xlsx opens readable. */
  width?: number
}

export interface ImportTemplate {
  kind: ImportKind
  /** i18n key under `import.template*`, resolved by the UI. */
  titleKey: string
  /** File name of the generated workbook, without the extension. */
  fileBase: string
  columns: readonly TemplateColumn[]
}

const VOLUNTEER_COLUMNS: readonly TemplateColumn[] = [
  {
    field: 'name',
    labelKey: 'import.fieldName',
    aliases: ['שם מלא', 'שם', 'name', 'full name'],
    required: true,
    examples: ['אריאל כהן', 'נתנאל בר־און', 'שמואל וייס'],
    width: 20,
  },
  {
    field: 'phone',
    labelKey: 'import.fieldPhone',
    aliases: ['טלפון', 'נייד', 'phone', 'mobile', 'tel'],
    required: true,
    examples: ['050-0001111', '053-0001112', '054-0001113'],
    width: 16,
  },
  {
    field: 'phoneType',
    labelKey: 'import.fieldPhoneType',
    aliases: ['סוג טלפון', 'סוג מכשיר', 'כשר', 'phone type', 'kosher'],
    examples: ['סמארטפון', 'כשר', 'כשר'],
    width: 14,
  },
  {
    field: 'email',
    labelKey: 'import.fieldEmail',
    // P0bis.5a — "מייל" is a substring of nothing else here, and "email" has
    // to beat "mail" in somebody's English header. Longest-alias-first
    // (`guessField`) sorts that out on its own.
    aliases: ['כתובת מייל', 'דואר אלקטרוני', 'אימייל', 'מייל', 'email', 'mail'],
    examples: ['david@example.co.il', '', 'moshe@example.co.il'],
    width: 26,
  },
  {
    field: 'yeshiva',
    labelKey: 'import.fieldYeshiva',
    aliases: ['ישיבה', 'yeshiva'],
    examples: ['ישיבת שדרות', 'ישיבת שדרות', 'ישיבת הר עציון'],
    width: 22,
  },
  {
    field: 'locality',
    labelKey: 'import.fieldLocality',
    aliases: ['יישוב', 'ישוב', 'עיר', 'locality', 'city', 'town'],
    examples: ['שדרות', 'שדרות', 'אפרת'],
    width: 16,
  },
  {
    field: 'age',
    labelKey: 'import.fieldAge',
    aliases: ['גיל', 'age'],
    examples: ['21', '20', '22'],
    width: 8,
  },
]

const FARM_COLUMNS: readonly TemplateColumn[] = [
  {
    field: 'name',
    labelKey: 'import.fieldFarmName',
    aliases: ['שם החווה', 'שם היישוב', 'שם', 'name'],
    required: true,
    examples: ['חוות רתם', 'מושב רתמים', 'חוות עצוז'],
    width: 22,
  },
  {
    // G16 — the column the entity kind exists for. First after the name on
    // purpose: everything downstream (marker, zone tints, the labels on the
    // detail screen) branches on it, and a coordinator who fills it in last
    // fills it in never.
    field: 'entityKind',
    labelKey: 'import.fieldEntityKind',
    aliases: ['סוג יישות', 'סוג ישות', 'יישות', 'entity', 'kind'],
    examples: ['חווה', 'מושב', 'חווה'],
    width: 12,
  },
  {
    field: 'locality',
    labelKey: 'import.fieldLocality',
    aliases: ['יישוב', 'ישוב', 'עיר', 'locality', 'city', 'town'],
    required: true,
    examples: ['רתמים', 'רתמים', 'עזוז'],
    width: 16,
  },
  {
    field: 'region',
    labelKey: 'import.fieldRegion',
    aliases: ['אזור', 'מרחב', 'region', 'area'],
    examples: ['רמת נגב', 'רמת נגב', 'רמת נגב'],
    width: 14,
  },
  {
    // The whole point of G10's link parsing: nobody types coordinates. A
    // coordinator standing at a gate shares the pin from Waze or Google Maps
    // into the sheet, and this column swallows whatever that produces —
    // including a plain "31.25, 34.79" pasted from somewhere else.
    field: 'positionLink',
    labelKey: 'import.fieldPositionLink',
    aliases: [
      'קישור מיקום',
      'מיקום',
      'waze',
      'google maps',
      'maps',
      'link',
      'קואורדינטות',
      'נ.צ',
    ],
    examples: [
      'https://waze.com/ul?ll=30.9800,34.6700',
      'https://www.google.com/maps/@30.9861,34.6720,15z',
      '30.7900, 34.4500',
    ],
    width: 44,
  },
  {
    field: 'farmType',
    labelKey: 'import.fieldFarmType',
    aliases: ['סוג חווה', 'ענף', 'סוג', 'type'],
    examples: ['מעורבת', 'חקלאות', 'בעלי חיים'],
    width: 14,
  },
  {
    field: 'farmStatus',
    labelKey: 'import.fieldFarmStatus',
    aliases: ['סטטוס', 'מצב', 'status'],
    examples: ['פעילה', 'ליצירת קשר', 'נוצר קשר'],
    width: 16,
  },
  {
    field: 'farmDunams',
    labelKey: 'import.fieldFarmDunams',
    aliases: ['שטח החווה', 'דונם חווה', 'farm dunams'],
    examples: ['415', '600', '250'],
    width: 12,
  },
  {
    field: 'grazingDunams',
    labelKey: 'import.fieldGrazingDunams',
    aliases: ['שטח מרעה', 'דונם מרעה', 'grazing'],
    examples: ['2356', '1800', '900'],
    width: 12,
  },
  {
    field: 'contactName',
    labelKey: 'import.fieldContactName',
    aliases: ['איש קשר', 'שם איש קשר', 'contact'],
    examples: ['יואב רתם', 'ועד המושב', 'דוד עצוז'],
    width: 20,
  },
  {
    field: 'contactPhone',
    labelKey: 'import.fieldContactPhone',
    aliases: ['טלפון איש קשר', 'טלפון', 'phone'],
    examples: ['052-0000101', '052-0000102', '052-0000103'],
    width: 16,
  },
  {
    field: 'contactEmail',
    labelKey: 'import.fieldContactEmail',
    aliases: [
      'מייל איש קשר',
      'כתובת מייל',
      'דואר אלקטרוני',
      'אימייל',
      'מייל',
      'contact email',
      'email',
    ],
    examples: ['eli@example.co.il', '', 'yossi@example.co.il'],
    width: 26,
  },
  /**
   * ★ PO POINT 6 (2026-08-31) — THE HEAD COUNT COMES IN AS PAIRS, AND THREE
   *   OF THEM IS THE RIGHT NUMBER.
   *
   *   A spreadsheet cannot hold a list in a cell, so the pairs are flattened:
   *   type / count, three times. Three because that is what a real holding
   *   has — a mixed farm is cattle and sheep, occasionally with a poultry
   *   house — and because a fourth pair would add two empty columns to every
   *   row of every import for a case the coordinator can finish by hand on
   *   the form. `parseLivestock` (import.ts) reads the type column loosely:
   *   the Hebrew label, the English key, or anything close enough.
   */
  {
    field: 'livestockKind1',
    labelKey: 'import.fieldLivestockKind',
    aliases: ['סוג בעלי חיים', 'בעלי חיים', 'סוג בעלי חיים 1', 'livestock', 'livestock kind'],
    examples: ['בקר', 'צאן־כבשים', ''],
    width: 16,
  },
  {
    field: 'livestockHeads1',
    labelKey: 'import.fieldLivestockHeads',
    aliases: ['מספר ראשים', 'ראשים', 'מספר ראשים 1', 'heads'],
    examples: ['120', '800', ''],
    width: 12,
  },
  {
    field: 'livestockKind2',
    labelKey: 'import.fieldLivestockKind2',
    aliases: ['סוג בעלי חיים 2', 'livestock kind 2'],
    examples: ['צאן־כבשים', '', ''],
    width: 16,
  },
  {
    field: 'livestockHeads2',
    labelKey: 'import.fieldLivestockHeads2',
    aliases: ['מספר ראשים 2', 'heads 2'],
    examples: ['450', '', ''],
    width: 12,
  },
  {
    field: 'livestockKind3',
    labelKey: 'import.fieldLivestockKind3',
    aliases: ['סוג בעלי חיים 3', 'livestock kind 3'],
    examples: ['לול־עופות', '', ''],
    width: 16,
  },
  {
    field: 'livestockHeads3',
    labelKey: 'import.fieldLivestockHeads3',
    aliases: ['מספר ראשים 3', 'heads 3'],
    examples: ['9000', '', ''],
    width: 12,
  },
  {
    field: 'notes',
    labelKey: 'import.fieldNotes',
    aliases: ['הערות', 'notes', 'remarks'],
    examples: ['', '', ''],
    width: 30,
  },
]

const DRIVER_COLUMNS: readonly TemplateColumn[] = [
  {
    field: 'name',
    labelKey: 'import.fieldName',
    aliases: ['שם מלא', 'שם', 'name'],
    required: true,
    examples: ['חיים סויסה', 'ניסים אמסלם', 'ברוך זילברמן'],
    width: 20,
  },
  {
    field: 'phone',
    labelKey: 'import.fieldPhone',
    aliases: ['טלפון', 'נייד', 'phone', 'mobile'],
    required: true,
    examples: ['052-0000043', '050-0000044', '054-0000045'],
    width: 16,
  },
  {
    field: 'email',
    labelKey: 'import.fieldEmail',
    aliases: ['כתובת מייל', 'דואר אלקטרוני', 'אימייל', 'מייל', 'email', 'mail'],
    examples: ['haim@example.co.il', '', 'baruch@example.co.il'],
    width: 26,
  },
  {
    field: 'vehicle',
    labelKey: 'import.fieldVehicle',
    aliases: ['רכב', 'סוג רכב', 'vehicle', 'car'],
    examples: ['מרצדס ספרינטר', 'פורד טרנזיט', 'טויוטה הייאס'],
    width: 22,
  },
  {
    field: 'seats',
    labelKey: 'import.fieldSeats',
    aliases: ['מקומות', 'מושבים', 'seats', 'capacity'],
    examples: ['8', '6', '12'],
    width: 10,
  },
  {
    field: 'locality',
    labelKey: 'import.fieldLocality',
    aliases: ['יישוב', 'ישוב', 'עיר', 'locality', 'city'],
    examples: ['באר שבע', 'אופקים', 'ירושלים'],
    width: 16,
  },
  {
    field: 'availabilityNote',
    labelKey: 'import.fieldAvailability',
    aliases: ['זמינות', 'availability'],
    examples: ['א׳–ה׳ בערב', 'כל ערב', 'סופי שבוע בלבד'],
    width: 26,
  },
]

export const IMPORT_TEMPLATES: Readonly<Record<ImportKind, ImportTemplate>> = {
  volunteers: {
    kind: 'volunteers',
    titleKey: 'import.templateVolunteers',
    fileBase: 'lo-yanum-volunteers',
    columns: VOLUNTEER_COLUMNS,
  },
  farms: {
    kind: 'farms',
    titleKey: 'import.templateFarms',
    fileBase: 'lo-yanum-farms',
    columns: FARM_COLUMNS,
  },
  drivers: {
    kind: 'drivers',
    titleKey: 'import.templateDrivers',
    fileBase: 'lo-yanum-drivers',
    columns: DRIVER_COLUMNS,
  },
}

/** The fields a template's mapping step may choose from. */
export function fieldsFor(kind: ImportKind): ImportField[] {
  return ['ignore', ...IMPORT_TEMPLATES[kind].columns.map((c) => c.field)]
}

/** The fields a template cannot import without. */
export function requiredFields(kind: ImportKind): ImportField[] {
  return IMPORT_TEMPLATES[kind].columns
    .filter((c) => c.required)
    .map((c) => c.field)
}

/**
 * Guess which field a header names, from the template's own aliases.
 *
 * LONGEST ALIAS FIRST, across the whole template. "סוג טלפון" contains
 * "טלפון", and "טלפון איש קשר" contains it too — a first-match-wins scan in
 * column order would map the phone-type column onto `phone` and quietly
 * import "כשר" as somebody's number. Sorting by length makes the most
 * specific alias win regardless of the order the columns happen to be
 * declared in, which is the property that survives someone adding a column.
 *
 * Conservative by design: an unrecognised header maps to `ignore`, never to
 * a plausible guess.
 */
export function guessField(header: string, kind: ImportKind): ImportField {
  const h = header.trim().toLowerCase()
  if (h === '') return 'ignore'

  const candidates = IMPORT_TEMPLATES[kind].columns
    .flatMap((c) => c.aliases.map((alias) => ({ alias, field: c.field })))
    .sort((a, b) => b.alias.length - a.alias.length)

  return candidates.find(({ alias }) => h.includes(alias))?.field ?? 'ignore'
}

/**
 * The template as a plain matrix — header row, then the three example rows.
 * The UI turns it into an .xlsx; a test can read it without a workbook.
 */
export function templateMatrix(
  kind: ImportKind,
  label: (labelKey: string) => string,
): string[][] {
  const { columns } = IMPORT_TEMPLATES[kind]
  return [
    columns.map((c) => label(c.labelKey)),
    ...[0, 1, 2].map((row) => columns.map((c) => c.examples[row])),
  ]
}

/** How many of the template's own example rows the generated file carries. */
export const TEMPLATE_EXAMPLE_ROWS = 3

/**
 * P0bis.4 — THE TEMPLATE AS A REAL WORKBOOK: a data sheet and an instructions
 * sheet, both right-to-left down to the reading order of each cell.
 *
 * The instructions sheet is not decoration. Everything on it answers a
 * question the coordinator would otherwise answer by guessing and then
 * discovering at the preview step: may I rename a header (no — that is how
 * the columns are recognised), are the grey rows data (no), what happens to a
 * column I add (nothing), and why a shortened map link does not become a pin.
 * The last one is the single most common surprise in this import.
 *
 * The column table repeats each header with its "required" flag and its
 * example, so the sheet is also the reference for what the first sheet wants.
 */
export function templateSheets(
  kind: ImportKind,
  label: (key: string) => string,
): SheetSpec[] {
  const template = IMPORT_TEMPLATES[kind]
  const { columns } = template

  const dataRows = [
    columns.map((c) => ({ value: label(c.labelKey), style: STYLE_HEADER })),
    ...Array.from({ length: TEMPLATE_EXAMPLE_ROWS }, (_, row) =>
      columns.map((c) => ({ value: c.examples[row] ?? '', style: STYLE_EXAMPLE })),
    ),
  ]

  const rules = ['rule1', 'rule2', 'rule3', 'rule4', 'rule5'].map((k) => [
    { value: label(`import.${k}`), style: STYLE_WRAP },
  ])

  const guide = [
    [{ value: label('import.instructionsTitle'), style: STYLE_TITLE }],
    [{ value: '', style: STYLE_BODY }],
    ...rules,
    [{ value: '', style: STYLE_BODY }],
    [
      { value: label('import.colHeader'), style: STYLE_HEADER },
      { value: label('import.colRequired'), style: STYLE_HEADER },
      { value: label('import.colExample'), style: STYLE_HEADER },
    ],
    ...columns.map((c) => [
      { value: label(c.labelKey), style: STYLE_BODY },
      {
        value: label(c.required ? 'common.required' : 'common.optional'),
        style: STYLE_BODY,
      },
      { value: c.examples[0] ?? '', style: STYLE_EXAMPLE },
    ]),
  ]

  return [
    {
      name: sheetName(label(template.titleKey), 'Data'),
      widths: columns.map((c) => c.width ?? 16),
      rows: dataRows,
      freezeHeader: true,
    },
    {
      name: sheetName(label('import.sheetInstructions'), 'Info'),
      widths: [64, 12, 32],
      rows: guide,
    },
  ]
}

/** The finished .xlsx bytes. Pure — the UI only turns them into a download. */
export function templateWorkbook(
  kind: ImportKind,
  label: (key: string) => string,
): Uint8Array {
  return buildWorkbook(templateSheets(kind, label))
}

// ---------------------------------------------------------------------------
// Value dictionaries — the Hebrew a coordinator will actually type
// ---------------------------------------------------------------------------

/**
 * Enum columns are read LENIENTLY: the template offers one spelling, and a
 * real sheet will carry three. Everything is matched as a lower-cased
 * substring, and an unrecognised value falls back rather than rejecting the
 * row — a farm whose "type" cell says something unexpected is still a farm,
 * and the coordinator can fix one field faster than re-cutting the file.
 */
const ENTITY_KIND_HINTS: ReadonlyArray<[string, EntityKind]> = [
  ['מושב', 'moshav'],
  ['moshav', 'moshav'],
  ['village', 'moshav'],
  ['אחר', 'other'],
  ['other', 'other'],
  ['חווה', 'farm'],
  ['חוה', 'farm'],
  ['farm', 'farm'],
]

export function readEntityKind(raw: string): EntityKind {
  const v = raw.trim().toLowerCase()
  return ENTITY_KIND_HINTS.find(([hint]) => v.includes(hint))?.[1] ?? 'farm'
}

const FARM_TYPE_HINTS: ReadonlyArray<[string, FarmType]> = [
  ['מעורב', 'mixed'],
  ['mixed', 'mixed'],
  ['בעלי חיים', 'livestock'],
  ['צאן', 'livestock'],
  ['בקר', 'livestock'],
  ['livestock', 'livestock'],
  ['חקלא', 'agriculture'],
  ['גידול', 'agriculture'],
  ['agriculture', 'agriculture'],
]

export function readFarmType(raw: string): FarmType {
  const v = raw.trim().toLowerCase()
  return FARM_TYPE_HINTS.find(([hint]) => v.includes(hint))?.[1] ?? 'mixed'
}

/**
 * PO POINT 6 — reading a species out of somebody else's spreadsheet.
 *
 * ★ ORDER MATTERS AND IT IS NOT ALPHABETICAL. `צאן` is a substring of nothing
 *   here, but `עוף`/`לול` and `בקר` are both written a dozen ways, and the
 *   Hebrew hyphen in `צאן־כבשים` is a MAQAF (U+05BE), not an ASCII dash — a
 *   coordinator typing the label by hand will use whichever his keyboard
 *   gives him, so both are listed rather than normalised away.
 *
 * ★ AND AN UNRECOGNISED WORD BECOMES `other` WITH THE WORD KEPT, never a
 *   silent drop. "יענים" is a real answer; turning it into `sheep` because
 *   nothing matched would put ostriches in the sheep column of a funding
 *   report.
 */
const LIVESTOCK_HINTS: ReadonlyArray<[string, LivestockKind]> = [
  ['צאן־כבשים', 'sheep'],
  ['צאן-כבשים', 'sheep'],
  ['כבשים', 'sheep'],
  ['כבש', 'sheep'],
  ['צאן', 'sheep'],
  ['sheep', 'sheep'],
  ['בקר', 'cattle'],
  ['פרות', 'cattle'],
  ['פרה', 'cattle'],
  ['cattle', 'cattle'],
  ['cow', 'cattle'],
  ['עיזים', 'goats'],
  ['עז', 'goats'],
  ['goat', 'goats'],
  ['גמלים', 'camels'],
  ['גמל', 'camels'],
  ['camel', 'camels'],
  ['סוסים', 'horses'],
  ['סוס', 'horses'],
  ['horse', 'horses'],
  ['לול־עופות', 'poultry'],
  ['לול-עופות', 'poultry'],
  ['עופות', 'poultry'],
  ['לול', 'poultry'],
  ['תרנגול', 'poultry'],
  ['poultry', 'poultry'],
  ['chicken', 'poultry'],
]

/** `null` when the cell is empty; `other` (with the word kept) when unknown. */
export function readLivestockKind(raw: string): {
  kind: LivestockKind
  label: string
} | null {
  const v = raw.trim()
  if (v === '') return null
  const lower = v.toLowerCase()
  const hit = LIVESTOCK_HINTS.find(([hint]) => lower.includes(hint))
  return hit ? { kind: hit[1], label: '' } : { kind: 'other', label: v }
}

/**
 * Longest-first again, and for the same reason: "נוצר קשר" (contacted) and
 * "ליצירת קשר" (to contact) share "קשר", and getting them the wrong way round
 * would tell the coordinator he has already called a farmer he has not.
 */
const FARM_STATUS_HINTS: ReadonlyArray<[string, FarmStatus]> = [
  ['ליצירת קשר', 'to_contact'],
  ['נוצר קשר', 'contacted'],
  ['הסכמה בעל־פה', 'verbal_ok'],
  ['הסכמה בעל פה', 'verbal_ok'],
  ['בעל־פה', 'verbal_ok'],
  ['בעל פה', 'verbal_ok'],
  ['בוקרה', 'visited'],
  ['ביקור', 'visited'],
  ['חתמה', 'signed'],
  ['נחתם', 'signed'],
  ['פעילה', 'active'],
  ['פעיל', 'active'],
  ['סירבה', 'declined'],
  ['סירב', 'declined'],
  ['to_contact', 'to_contact'],
  ['contacted', 'contacted'],
  ['visited', 'visited'],
  ['verbal', 'verbal_ok'],
  ['signed', 'signed'],
  ['active', 'active'],
  ['declined', 'declined'],
]

export function readFarmStatus(raw: string): FarmStatus {
  const v = raw.trim().toLowerCase()
  const hit = [...FARM_STATUS_HINTS]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([hint]) => v.includes(hint))
  return hit?.[1] ?? 'to_contact'
}

const KOSHER_HINTS = ['כשר', 'kosher', 'basic']

export function readPhoneType(raw: string): PhoneType {
  const v = raw.trim().toLowerCase()
  return KOSHER_HINTS.some((k) => v.includes(k)) ? 'kosher' : 'smartphone'
}
