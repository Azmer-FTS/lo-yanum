import { chromium } from 'playwright'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'

import { IMPORT_KINDS, IMPORT_TEMPLATES, templateMatrix } from '../src/core/templates'
import he from '../src/locales/he.json'

/**
 * A67 — THE DOWNLOADED WORKBOOK IS REALLY RIGHT-TO-LEFT.
 *
 * G10 set `sheet['!views'] = [{ RTL: true }]` and called the template RTL. It
 * was not: unzipping the file SheetJS produced shows `<sheetView
 * workbookViewId="0"/>` with no `rightToLeft`, and no cell styles at all —
 * the community build does not write them. The coordinator's template opened
 * left-to-right with left-aligned Hebrew.
 *
 * A claim about a generated file can only be checked by opening the generated
 * file, so this does exactly that: it drives the real wizard, presses the real
 * button, saves what the browser actually downloads, and then looks INSIDE the
 * bytes. Nothing here reads the source.
 *
 *   1  the download is a valid workbook — SheetJS reads it back, which is the
 *      same code path the upload step uses, so the app can read its own
 *      template;
 *   2  BOTH sheets are `rightToLeft="1"` — and the workbook view is NOT, which
 *      is the tempting mistake: `CT_BookView` has no such attribute and a
 *      strict reader (openpyxl, and Excel's own repair dialog) refuses the
 *      file for it;
 *   3  EVERY cell carries a style, and every style in the file is
 *      `horizontal="right"` with `readingOrder="2"` — the sheet view flips the
 *      columns, but a cell whose text starts with a Latin character (a Waze
 *      link, an English yeshiva name) still lays out left-to-right inside
 *      itself without the reading order;
 *   4  the header row is frozen, and the widths declared;
 *   5  the second sheet is the instructions, and it lists every column of the
 *      first with its required flag.
 *
 * Run against a live dev server:
 *   BASE_URL=http://localhost:5173 bun run rtl
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

/** The app's own Hebrew, so the assertions read the labels the PO reads. */
const label = (key: string): string => {
  const parts = key.split('.')
  let node: unknown = he
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return key
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : key
}

/**
 * A minimal STORED-entry ZIP reader.
 *
 * `@core/xlsx` writes every part uncompressed (method 0) on purpose, so this
 * is a central-directory walk and a slice — no inflate. It refuses a deflated
 * entry loudly rather than returning something plausible: if the writer ever
 * starts compressing, this check must fail, not quietly pass on garbage.
 */
function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The end-of-central-directory record is the last 22+ bytes; scan back for
  // its signature (there is no comment, but a scan is cheap and correct).
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record')

  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  const out = new Map<string, string>()

  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) {
      throw new Error('corrupt central directory')
    }
    const method = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen))
    if (method !== 0) throw new Error(`${name} is compressed (method ${method})`)

    const localNameLen = view.getUint16(offset + 26, true)
    const localExtraLen = view.getUint16(offset + 28, true)
    const start = offset + 30 + localNameLen + localExtraLen
    out.set(name, decoder.decode(bytes.subarray(start, start + size)))

    at += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const scratch = mkdtempSync(join(tmpdir(), 'lo-yanum-rtl-'))

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'he-IL',
  acceptDownloads: true,
})
const page = await context.newPage()
page.setDefaultTimeout(60_000)

console.log('')
console.log('A67 — the generated .xlsx, opened and read back')

await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
await page.waitForSelector('select', { state: 'attached' })
await page.selectOption('select', 'coordinator')
await page.waitForTimeout(400)

for (const kind of IMPORT_KINDS) {
  section(kind)

  await page.evaluate((k) => {
    window.location.hash = `#/coordinator/import/${k}`
  }, kind)
  await page.waitForTimeout(1000)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('הורדת קובץ לדוגמה'),
      )
      ;(el as HTMLElement | undefined)?.click()
    }),
  ])
  const path = join(scratch, `${kind}.xlsx`)
  await download.saveAs(path)
  const bytes = new Uint8Array(readFileSync(path))

  // 1 — it is a workbook the app's own reader accepts.
  const book = XLSX.read(bytes, { type: 'array' })
  check('SheetJS reads the download back', book.SheetNames.length === 2, book.SheetNames.join(' · '))

  const expected = templateMatrix(kind, label)[0]
  const grid = XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]], {
    header: 1,
    defval: '',
    raw: false,
  })
  check(
    'the header row is the template, in order',
    JSON.stringify(grid[0]) === JSON.stringify(expected),
    (grid[0] ?? []).join(' | '),
  )
  check(
    'the three example rows are there',
    grid.length === 4,
    `${grid.length - 1} data rows`,
  )

  const files = readZip(bytes)
  const sheet1 = files.get('xl/worksheets/sheet1.xml') ?? ''
  const sheet2 = files.get('xl/worksheets/sheet2.xml') ?? ''
  const styles = files.get('xl/styles.xml') ?? ''
  const workbook = files.get('xl/workbook.xml') ?? ''

  // 2 — RTL where it has to be.
  check('the data sheet view is rightToLeft', /<sheetView[^>]*rightToLeft="1"/.test(sheet1))
  check('the instructions sheet view is rightToLeft', /<sheetView[^>]*rightToLeft="1"/.test(sheet2))
  // NOT on the workbook view: `CT_BookView` has no `rightToLeft` attribute and
  // a strict reader refuses the file for it. This asserts its ABSENCE, because
  // adding it back is the tempting mistake.
  check(
    'the workbook view does NOT carry an invalid rightToLeft',
    /<workbookView[^>]*\/>/.test(workbook) &&
      !/<workbookView[^>]*rightToLeft/.test(workbook),
  )

  // 3 — every cell styled, every style right-aligned with RTL reading order.
  const cells = sheet1.match(/<c [^>]*>/g) ?? []
  const unstyled = cells.filter((c) => !/\ss="\d+"/.test(c))
  check(
    'every cell of the data sheet carries a style',
    cells.length > 0 && unstyled.length === 0,
    `${cells.length} cells, ${unstyled.length} unstyled`,
  )
  const guideCells = sheet2.match(/<c [^>]*>/g) ?? []
  check(
    'every cell of the instructions sheet carries a style',
    guideCells.length > 0 && guideCells.every((c) => /\ss="\d+"/.test(c)),
    `${guideCells.length} cells`,
  )

  const cellXfs = styles.slice(styles.indexOf('<cellXfs'), styles.indexOf('</cellXfs>'))
  const alignments = cellXfs.match(/<alignment [^>]*\/>/g) ?? []
  check(
    'every style is horizontal="right"',
    alignments.length >= 5 && alignments.every((a) => a.includes('horizontal="right"')),
    `${alignments.length} styles`,
  )
  check(
    'every style is readingOrder="2" (RTL inside the cell)',
    alignments.length >= 5 && alignments.every((a) => a.includes('readingOrder="2"')),
  )

  // 4 — the header row is frozen and the widths are declared.
  check('the header row is frozen', /<pane [^>]*state="frozen"/.test(sheet1))
  check(
    'a width is declared per column',
    (sheet1.match(/<col /g) ?? []).length === IMPORT_TEMPLATES[kind].columns.length,
  )

  // 5 — the instructions sheet is real, and complete.
  const guide = XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[1]], {
    header: 1,
    defval: '',
    raw: false,
  })
  const flat = guide.flat().join('\n')
  check(
    'the instructions sheet carries the five rules',
    ['rule1', 'rule2', 'rule3', 'rule4', 'rule5'].every((k) =>
      flat.includes(label(`import.${k}`)),
    ),
  )
  check(
    'it lists every column of the data sheet',
    IMPORT_TEMPLATES[kind].columns.every((c) => flat.includes(label(c.labelKey))),
  )
  check(
    'and says which are required',
    flat.includes(label('common.required')) && flat.includes(label('common.optional')),
  )
}

await context.close()
await browser.close()

console.log('')
if (failed === 0) {
  console.log(`  All ${passed} checks passed.`)
} else {
  console.log(`  ${failed} of ${passed + failed} checks FAILED.`)
  process.exit(1)
}
