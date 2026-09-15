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
/**
 * ★ AK8 — LA CELLULE DE LA SIGNATURE : sa VALEUR est l'image elle-même
 *   (`data:image/png;base64,…`, ce que l'import d'AA5 relit), et le format
 *   `;;;` fait qu'aucun caractère ne s'affiche par-dessus le PNG posé au même
 *   endroit. La donnée est là pour la machine, l'image pour l'œil, et il n'y a
 *   toujours qu'UNE chose dans la cellule : la signature.
 */
export const STYLE_SIGNATURE = 5

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
  /** AK8 — les images ancrées, une par cellule (voir `SheetImage`). */
  images?: readonly SheetImage[]
  /** Hauteur de certaines lignes, en points — celles qui portent une image. */
  rowHeights?: Readonly<Record<number, number>>
}

/**
 * ★★ AK8 (2026-09-16) — UNE IMAGE POSÉE DANS UNE CELLULE.
 *
 *   « La signature sort en PNG, dans SA PROPRE CELLULE, dans l'export xlsx et
 *     dans l'export CSV. Aucune autre donnée dans cette cellule. »
 *
 * Un tableur ne met pas une image DANS une cellule : il l'ancre à une plage.
 * `twoCellAnchor editAs="oneCell"`, du coin de la cellule au coin de la
 * suivante, est ce qui s'en approche exactement — l'image suit sa colonne et sa
 * ligne, elle est rognée avec elles, et aucune autre cellule n'en porte un
 * morceau.
 */
export interface SheetImage {
  /** Ligne et colonne, 0-indexées, comme `rows`. */
  row: number
  col: number
  /** `data:image/png;base64,…` — le PNG tel qu'il est stocké sur la fiche. */
  dataUri: string
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
      /* AK8 — une ligne qui porte une signature est haute assez pour la voir. */
      const height = sheet.rowHeights?.[r]
      const attrs = height ? ` ht="${height}" customHeight="1"` : ''
      return `<row r="${r + 1}"${attrs}>${inner}</row>`
    })
    .join('')

  return (
    XML_DECL +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    // THE LINE THE WHOLE UNIT IS ABOUT.
    `<sheetViews><sheetView rightToLeft="1" workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData>` +
    /* ⚠️ APRÈS `sheetData`, ET C'EST L'ORDRE DU SCHÉMA : un `<drawing>` placé
       avant fait rejeter la feuille entière par un lecteur strict. */
    ((sheet.images ?? []).length > 0 ? '<drawing r:id="rIdDr1"/>' : '') +
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
  '<numFmts count="1"><numFmt numFmtId="164" formatCode=";;;"/></numFmts>' +
  '<cellXfs count="6">' +
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
  // 5 — AK8: la cellule de signature. `;;;` cache le texte sous l'image.
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">' +
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

/**
 * ★ AK8 — LE DESSIN D'UNE FEUILLE : une ancre par image, de sa cellule à la
 *   suivante, `editAs="oneCell"` pour qu'elle suive sa cellule quand on trie ou
 *   qu'on élargit une colonne.
 */
function drawingXml(images: readonly SheetImage[]): string {
  const XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const anchors = images
    .map((image, i) => {
      const id = i + 1
      return (
        '<xdr:twoCellAnchor editAs="oneCell">' +
        `<xdr:from><xdr:col>${image.col}</xdr:col><xdr:colOff>19050</xdr:colOff>` +
        `<xdr:row>${image.row}</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${image.col + 1}</xdr:col><xdr:colOff>0</xdr:colOff>` +
        `<xdr:row>${image.row + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        '<xdr:pic>' +
        '<xdr:nvPicPr>' +
        `<xdr:cNvPr id="${id}" name="signature-${id}" descr="signature"/>` +
        '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>' +
        '</xdr:nvPicPr>' +
        `<xdr:blipFill><a:blip xmlns:r="${REL}" r:embed="rIdImg${id}"/>` +
        '<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
        '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm>' +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
        '</xdr:pic><xdr:clientData/></xdr:twoCellAnchor>'
      )
    })
    .join('')
  return XML_DECL + `<xdr:wsDr xmlns:xdr="${XDR}" xmlns:a="${A}">${anchors}</xdr:wsDr>`
}

function drawingRelsXml(images: readonly SheetImage[]): string {
  const rels = images
    .map(
      (_, i) =>
        `<Relationship Id="rIdImg${i + 1}" Type="${REL}/image" Target="../media/image${i + 1}.png"/>`,
    )
    .join('')
  return (
    XML_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    rels +
    '</Relationships>'
  )
}

/**
 * `data:image/png;base64,…` → les octets. Écrit à la main plutôt qu'avec
 * `atob` : ce fichier est du domaine PUR, et `atob` est une API de navigateur.
 * `null` quand ce n'est pas un PNG en base64 — l'appelant écrit alors la
 * cellule sans image plutôt qu'un classeur illisible.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function pngBytesOf(dataUri: string): Uint8Array | null {
  const comma = dataUri.indexOf(',')
  if (comma === -1) return null
  if (!/^data:image\/png;base64$/i.test(dataUri.slice(0, comma))) return null
  const clean = dataUri.slice(comma + 1).replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8))
  let bits = 0
  let value = 0
  let at = 0
  for (const ch of clean) {
    const index = B64.indexOf(ch)
    if (index === -1) return null
    value = (value << 6) | index
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[at++] = (value >> bits) & 0xff
    }
  }
  return at === out.length ? out : out.slice(0, at)
}

function contentTypesXml(count: number, withImages: boolean): string {
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
    (withImages ? '<Default Extension="png" ContentType="image/png"/>' : '') +
    (withImages
      ? '<Override PartName="/xl/drawings/drawing1.xml"' +
        ' ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
      : '') +
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

export function zipStore(
  files: ReadonlyArray<[string, string | Uint8Array]>,
): Uint8Array {
  const encoder = new TextEncoder()
  const entries: Entry[] = []
  const chunks: Uint8Array[] = []
  let offset = 0

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes)
    offset += bytes.length
  }

  for (const [path, content] of files) {
    const name = encoder.encode(path)
    /* AK8 — une entrée peut être binaire : le PNG d'une signature. */
    const data = typeof content === 'string' ? encoder.encode(content) : content
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
  /**
   * ⚠️ UNE SEULE FEUILLE PORTE DES IMAGES, ET C'EST ASSEZ : les deux exports de
   *    cette application ont une feuille de données. Le jour où il en faudrait
   *    deux, `drawing1` devient `drawing{n}` — et cette ligne est ce qui le
   *    dira, plutôt qu'un classeur silencieusement amputé.
   *
   * ⚠️ ET SI UNE SEULE IMAGE EST ILLISIBLE, AUCUNE N'EST ÉCRITE : un classeur
   *    dont une relation pointe vers un média absent ne s'ouvre pas du tout.
   *    Les cellules, elles, gardent la signature en texte.
   */
  const sheetWithImages = sheets.findIndex((s) => (s.images ?? []).length > 0)
  const images = sheetWithImages === -1 ? [] : (sheets[sheetWithImages].images ?? [])
  const media: Array<[string, Uint8Array]> = []
  images.forEach((image, i) => {
    const bytes = pngBytesOf(image.dataUri)
    if (bytes) media.push([`xl/media/image${i + 1}.png`, bytes])
  })
  const withImages = media.length > 0 && media.length === images.length

  const files: Array<[string, string | Uint8Array]> = [
    ['[Content_Types].xml', contentTypesXml(sheets.length, withImages)],
    ['_rels/.rels', ROOT_RELS],
    ['xl/workbook.xml', workbookXml(sheets)],
    ['xl/_rels/workbook.xml.rels', workbookRelsXml(sheets.length)],
    ['xl/styles.xml', STYLES_XML],
    ...sheets.map(
      (s, i) =>
        [
          `xl/worksheets/sheet${i + 1}.xml`,
          sheetXml(withImages ? s : { ...s, images: [] }),
        ] as [string, string],
    ),
  ]
  if (withImages) {
    files.push([
      `xl/worksheets/_rels/sheet${sheetWithImages + 1}.xml.rels`,
      XML_DECL +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rIdDr1" Type="${REL}/drawing" Target="../drawings/drawing1.xml"/>` +
        '</Relationships>',
    ])
    files.push(['xl/drawings/drawing1.xml', drawingXml(images)])
    files.push(['xl/drawings/_rels/drawing1.xml.rels', drawingRelsXml(images)])
    for (const entry of media) files.push(entry)
  }
  return zipStore(files)
}

// ---------------------------------------------------------------------------
// ★★ AB6.1 (2026-09-08) — CSV, BECAUSE THE ASSOCIATION'S PORTAL TAKES ONE.
// ---------------------------------------------------------------------------

/**
 * A matrix as CSV, ready to be handed to a `Blob`.
 *
 * ⚠️ THE BOM IS NOT OPTIONAL AND THIS FILE ALREADY KNEW IT. `core/import.ts`
 *    retired the old CSV export and wrote down the two rules it had, so that
 *    whoever restored one would restore them too: the column order is the
 *    template's own, and the file must open with a UTF-8 BOM or Excel on a
 *    Hebrew Windows machine renders every header as mojibake. This is that
 *    restoration, and both rules are kept — the order is
 *    `ASSOCIATION_COLUMNS`', and `﻿` is the first character.
 *
 * ⚠️ CRLF, FOR THE SAME REASON AND THE SAME MACHINE. A lone `\n` inside a
 *    quoted cell is fine; between records, Excel on Windows wants both.
 *
 * ★ AND EVERY CELL IS QUOTED. A signature data URI contains commas, a note
 *   contains newlines, and a Hebrew name contains neither — quoting only what
 *   needs it makes a file whose shape depends on its contents, which is
 *   exactly what is hard to debug at the other end. Doubling an embedded quote
 *   is the whole escape rule.
 */
export function matrixToCsv(matrix: readonly (readonly string[])[]): string {
  const cell = (v: string): string => `"${String(v ?? '').replace(/"/g, '""')}"`
  return '﻿' + matrix.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
