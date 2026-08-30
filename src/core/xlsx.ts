/**
 * P0bis.4 — THE GENERATED WORKBOOK IS REALLY RIGHT-TO-LEFT.
 *
 * G10 shipped the import template as an .xlsx built by SheetJS, with
 * `sheet['!views'] = [{ RTL: true }]`. Opening the produced file and reading
 * its XML shows that line does NOTHING: the community build writes
 * `<sheetView workbookViewId="0"/>` with no `rightToLeft`, and it writes no
 * cell styles at all (styling is a SheetJS Pro feature). So the file the
 * coordinator downloaded opened left-to-right with left-aligned Hebrew — the
 * product owner was right, and the fix is not a flag.
 *
 * An .xlsx is a ZIP of XML, and the template is a small file whose every part
 * we already own. Writing it directly is ~200 lines, removes a lie, and gives
 * us the three things the flag could not:
 *
 *   · `rightToLeft="1"` on the sheet view — column A on the right, and the
 *     frozen header pane on the correct side;
 *   · `readingOrder="2"` and `horizontal="right"` on EVERY cell, so a cell
 *     that begins with a Latin word (a Waze link, an English yeshiva name)
 *     still lays out as Hebrew text rather than flipping;
 *   · a second, formatted INSTRUCTIONS sheet, which is where the "do not
 *     rename the headers" sentence belongs.
 *
 * SheetJS stays where it earns its keep: READING the file the coordinator
 * uploads back, which is the hard half.
 *
 * WHY STORE AND NOT DEFLATE
 * -------------------------
 * ZIP entries may be stored uncompressed (method 0), and every spreadsheet
 * application reads that. The template is ~10 kB of XML; a deflate
 * implementation to save 6 kB would be the largest and least testable part of
 * this file. `CompressionStream` exists in modern browsers but not in every
 * runtime the verification scripts use, and a generator whose output depends
 * on the runtime is not a generator we can test outside the browser.
 *
 * The timestamp is a FIXED DOS date, not the clock: the same template must
 * produce the same bytes every time, or a byte-comparison test becomes a test
 * of what time it is.
 */

/** Cell style slots, in the order `styles.xml` declares them below. */
export const STYLE_BODY = 0
export const STYLE_HEADER = 1
export const STYLE_EXAMPLE = 2
export const STYLE_WRAP = 3
export const STYLE_TITLE = 4

export interface SheetCell {
  value: string
  style?: number
}

export interface SheetSpec {
  /** Tab name. Excel forbids `[]:*?/\` and caps it at 31 characters. */
  name: string
  /** Column widths in characters; a missing entry takes the default. */
  widths?: readonly number[]
  rows: ReadonlyArray<ReadonlyArray<SheetCell>>
  /** Freeze the first row so the headers stay put while filling 300 rows. */
  freezeHeader?: boolean
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/**
 * The five predefined entities, plus the C0 control characters XML 1.0 cannot
 * represent AT ALL — not even as a reference. A coordinator's name will never
 * contain one; a cell pasted out of a legacy system might, and an invalid
 * workbook fails to open with no explanation.
 */
function xmlText(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === '&') out += '&amp;'
    else if (ch === '<') out += '&lt;'
    else if (ch === '>') out += '&gt;'
    else if (ch === '"') out += '&quot;'
    else if (ch === "'") out += '&apos;'
    else if (code < 0x20 && ch !== '\t' && ch !== '\n' && ch !== '\r') continue
    else out += ch
  }
  return out
}

/** 0 → A, 25 → Z, 26 → AA. Spreadsheet columns are bijective base-26. */
export function columnName(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - rem) / 26)
  }
  return out
}

/**
 * A tab name Excel will accept: the forbidden characters removed, the leading
 * and trailing apostrophes it also rejects trimmed, and 31 characters max.
 * An empty result would make the file unopenable, so it falls back.
 */
export function sheetName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim()
  return (cleaned || fallback).slice(0, 31)
}

/**
 * Cells are written as INLINE STRINGS. The alternative is a shared-strings
 * part, which saves bytes on repeated values — and a template's values are all
 * distinct, so it would only add a part to keep in sync.
 */
function cellXml(ref: string, cell: SheetCell): string {
  const style = cell.style ?? STYLE_BODY
  if (cell.value === '') return `<c r="${ref}" s="${style}"/>`
  return (
    `<c r="${ref}" s="${style}" t="inlineStr">` +
    `<is><t xml:space="preserve">${xmlText(cell.value)}</t></is></c>`
  )
}

function sheetXml(sheet: SheetSpec): string {
  const cols = (sheet.widths ?? [])
    .map((w, i) =>
      w > 0
        ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`
        : '',
    )
    .join('')

  const pane = sheet.freezeHeader
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
    : ''

  const rows = sheet.rows
    .map((cells, r) => {
      const inner = cells
        .map((cell, c) => cellXml(`${columnName(c)}${r + 1}`, cell))
        .join('')
      return `<row r="${r + 1}">${inner}</row>`
    })
    .join('')

  return (
    XML_DECL +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    // THE LINE THE WHOLE UNIT IS ABOUT.
    `<sheetViews><sheetView rightToLeft="1" workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData>` +
    '</worksheet>'
  )
}

/**
 * Every `xf` carries `horizontal="right"` and `readingOrder="2"`. The sheet
 * view alone is not enough: it flips the COLUMNS, while a cell whose text
 * starts with a Latin character still lays out left-to-right inside itself.
 * A template full of Waze links is exactly that case.
 */
const STYLES_XML =
  XML_DECL +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  // Colours are literal RGB, never `theme="1"`: a theme reference needs an
  // `xl/theme/theme1.xml` part, and this workbook deliberately ships none.
  '<fonts count="4">' +
  '<font><sz val="11"/><color rgb="FF1F1F1F"/><name val="Arial"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF1F1F1F"/><name val="Arial"/><family val="2"/></font>' +
  '<font><i/><sz val="11"/><color rgb="FF7A7A7A"/><name val="Arial"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><color rgb="FF1F1F1F"/><name val="Arial"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE7EDF6"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  // 0 — body
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
  '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
  // 1 — header: bold on a pale fill, wrapped
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">' +
  '<alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf>' +
  // 2 — the example rows: italic grey, so they do not read as data
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">' +
  '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
  // 3 — wrapped prose, for the instructions sheet
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
  '<alignment horizontal="right" vertical="top" wrapText="1" readingOrder="2"/></xf>' +
  // 4 — the instructions title
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">' +
  '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '<dxfs count="0"/>' +
  '</styleSheet>'

function workbookXml(sheets: readonly SheetSpec[]): string {
  const list = sheets
    .map(
      (s, i) =>
        `<sheet name="${xmlText(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('')
  return (
    XML_DECL +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    // NO `rightToLeft` HERE. It is tempting — the sheet tabs would start on
    // the right — and it is INVALID: `CT_BookView` has no such attribute in
    // the OOXML schema, and a strict reader rejects the whole workbook for it
    // (openpyxl does, with `unexpected keyword argument 'rightToLeft'`).
    // Right-to-left is a per-SHEET view attribute, and every sheet here has
    // it; the tab direction follows the reader's own locale.
    '<workbookPr/><bookViews><workbookView activeTab="0"/></bookViews>' +
    `<sheets>${list}</sheets></workbook>`
  )
}

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml'

function contentTypesXml(count: number): string {
  const overrides = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`,
  ).join('')
  return (
    XML_DECL +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    `<Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>` +
    overrides +
    `<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/>` +
    '</Types>'
  )
}

function workbookRelsXml(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('')
  return (
    XML_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets +
    `<Relationship Id="rId${count + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
    '</Relationships>'
  )
}

const ROOT_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>'

// ---------------------------------------------------------------------------
// ZIP (stored, no compression)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/** 1980-01-01 00:00 in DOS format — see the note about determinism above. */
const DOS_TIME = 0
const DOS_DATE = 33

interface Entry {
  name: Uint8Array
  data: Uint8Array
  crc: number
  offset: number
}

export function zipStore(files: ReadonlyArray<[string, string]>): Uint8Array {
  const encoder = new TextEncoder()
  const entries: Entry[] = []
  const chunks: Uint8Array[] = []
  let offset = 0

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes)
    offset += bytes.length
  }

  for (const [path, text] of files) {
    const name = encoder.encode(path)
    const data = encoder.encode(text)
    const crc = crc32(data)
    const header = new Uint8Array(30)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true) // version needed
    view.setUint16(6, 0x0800, true) // UTF-8 file names
    view.setUint16(8, 0, true) // method: stored
    view.setUint16(10, DOS_TIME, true)
    view.setUint16(12, DOS_DATE, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, data.length, true)
    view.setUint32(22, data.length, true)
    view.setUint16(26, name.length, true)
    view.setUint16(28, 0, true)

    entries.push({ name, data, crc, offset })
    push(header)
    push(name)
    push(data)
  }

  const centralStart = offset
  for (const entry of entries) {
    const header = new Uint8Array(46)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(4, 20, true) // version made by
    view.setUint16(6, 20, true) // version needed
    view.setUint16(8, 0x0800, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, DOS_TIME, true)
    view.setUint16(14, DOS_DATE, true)
    view.setUint32(16, entry.crc, true)
    view.setUint32(20, entry.data.length, true)
    view.setUint32(24, entry.data.length, true)
    view.setUint16(28, entry.name.length, true)
    view.setUint32(42, entry.offset, true)
    push(header)
    push(entry.name)
  }

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, offset - centralStart, true)
  endView.setUint32(16, centralStart, true)
  push(end)

  const out = new Uint8Array(offset)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/** Build a complete .xlsx from the sheets given. Pure; returns the bytes. */
export function buildWorkbook(sheets: readonly SheetSpec[]): Uint8Array {
  const files: Array<[string, string]> = [
    ['[Content_Types].xml', contentTypesXml(sheets.length)],
    ['_rels/.rels', ROOT_RELS],
    ['xl/workbook.xml', workbookXml(sheets)],
    ['xl/_rels/workbook.xml.rels', workbookRelsXml(sheets.length)],
    ['xl/styles.xml', STYLES_XML],
    ...sheets.map(
      (s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)] as [string, string],
    ),
  ]
  return zipStore(files)
}
