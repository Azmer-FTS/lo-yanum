import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'
import type { Page } from 'playwright'
import * as XLSX from 'xlsx'

/**
 * A44 — THE TEMPLATE ROUND TRIP.
 *
 * The one thing the pure checks in `bun run accept` cannot prove: that the
 * .xlsx the coordinator DOWNLOADS is a file this app can read back. Everything
 * between the two — the generator, the workbook encoding, SheetJS's own
 * round-trip, the header guess — is exactly where an import breaks, and it
 * breaks silently: the coordinator sees "0 rows importable" and concludes his
 * data is wrong.
 *
 * So this plays the real sequence, per roster:
 *
 *   1  open the wizard for the kind and press "הורדת קובץ לדוגמה";
 *   2  read the downloaded workbook with SheetJS, OUTSIDE the browser;
 *   3  replace the example rows with test rows of our own;
 *   4  upload that file back through the wizard's own file input;
 *   5  assert the mapping step guessed EVERY column with no help;
 *   6  walk to the preview and assert the counts;
 *   7  import, and find the records in the roster they belong to.
 *
 * The farms pass additionally proves G10's reason for existing: a Waze link in
 * a cell becomes a pin, and a row with no readable location still imports and
 * wears "מיקום חסר".
 *
 * Run against a live dev server:
 *   BASE_URL=http://localhost:5173 bun run import
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
  console.log('  ' + '-'.repeat(68))
}

const bodyText = (page: Page) => page.evaluate(() => document.body.innerText)

/** Click the first enabled button/link whose visible text contains `text`. */
async function clickText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((label) => {
    const el = [...document.querySelectorAll('button, a')].find(
      (b) => !(b as HTMLButtonElement).disabled && b.textContent?.includes(label),
    )
    if (!el) return false
    ;(el as HTMLElement).click()
    return true
  }, text)
}

const scratch = mkdtempSync(join(tmpdir(), 'lo-yanum-import-'))

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'he-IL',
  acceptDownloads: true,
})
const page = await context.newPage()
page.setDefaultTimeout(60_000)

console.log('A44 — download the template, fill it, upload it, find the records')

await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
await page.waitForSelector('select', { state: 'attached' })
await page.selectOption('select', 'coordinator')
await page.waitForTimeout(400)

/**
 * Download the template for `kind` and return its rows as a matrix.
 * The header row is row 0; the three example rows follow.
 */
async function downloadTemplate(kind: string): Promise<string[][]> {
  await page.evaluate((k) => {
    window.location.hash = `#/coordinator/import/${k}`
  }, kind)
  await page.waitForTimeout(1200)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    clickText(page, 'הורדת קובץ לדוגמה'),
  ])
  const path = join(scratch, `${kind}-template.xlsx`)
  await download.saveAs(path)

  // SheetJS's own `readFile`/`writeFile` need `set_fs` wiring in Node; reading
  // the bytes here and handing it a buffer avoids the whole question and is
  // closer to what the browser does anyway.
  const book = XLSX.read(readFileSync(path), { type: 'buffer' })
  const sheet = book.Sheets[book.SheetNames[0]]
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown as string[][]
}

/** Write `rows` under `headers` to a new workbook and return its path. */
function writeSheet(name: string, headers: string[], rows: string[][]): string {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')
  const path = join(scratch, `${name}.xlsx`)
  writeFileSync(path, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
  return path
}

async function upload(path: string): Promise<void> {
  await page.setInputFiles('input[type="file"]', path)
  await page.waitForTimeout(1500)
}

/** How many columns the mapping step left on "התעלם". */
async function unmappedColumns(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('main select')]
      .map((s, i) => ({ value: (s as HTMLSelectElement).value, i }))
      .filter((s) => s.value === 'ignore')
      .map((s) => `#${s.i + 1}`),
  )
}

// --- 1. volunteers -----------------------------------------------------------

section('1 — volunteers: the template reads itself back')

const volTemplate = await downloadTemplate('volunteers')
check(
  'the workbook has a header row and three examples',
  volTemplate.length === 4,
  `${volTemplate.length} rows`,
)
check('and six columns', volTemplate[0].length === 6, volTemplate[0].join(' · '))

const volHeaders = volTemplate[0]
const volPath = writeSheet('volunteers-filled', volHeaders, [
  ['בדיקה ראשון', '050-0007001', 'סמארטפון', 'ישיבת שדרות', 'שדרות', '21'],
  ['בדיקה שני', '050-0007002', 'כשר', 'ישיבת שדרות', 'נתיבות', '22'],
  // Same phone as the row above: the in-file duplicate must be caught.
  ['בדיקה כפול', '050-0007002', 'כשר', 'ישיבת שדרות', 'נתיבות', '23'],
])

await upload(volPath)
check(
  'the upload reached the mapping step',
  (await bodyText(page)).includes('מיפוי עמודות'),
)
/**
 * The preview's counts are a LABEL and a NUMBER, and P0bis.3a swapped their
 * order — the figure is now read first, at metric size, because it is the
 * decision this screen asks for. The assertion is about the pair, not about
 * which of the two the DOM happens to emit first, so it accepts either.
 */
const counts = (text: string, label: string, n: number) =>
  new RegExp(`(${label}\\s*${n}|${n}\\s*${label})`).test(text)

check(
  'every column of our own template was guessed',
  (await unmappedColumns(page)).length === 0,
  (await unmappedColumns(page)).join(' '),
)

check('"next" is allowed', await clickText(page, 'הבא'))
await page.waitForTimeout(1200)
const volPreview = await bodyText(page)
const volFlat = volPreview.replace(/\s+/g, ' ')
check('two rows will import', counts(volFlat, 'ייובאו', 2), '')
check('one row will be skipped', counts(volFlat, 'יידלגו', 1), '')

check('the import runs', await clickText(page, 'ייבוא'))
await page.waitForTimeout(1500)
check('the wizard reports success', (await bodyText(page)).includes('הייבוא הושלם'))

await page.evaluate(() => {
  window.location.hash = '#/coordinator/volunteers'
})
await page.waitForTimeout(2500)
await page.fill('main input[type="search"], main input[type="text"]', 'בדיקה ראשון')
await page.waitForTimeout(900)
check(
  'the imported volunteer is in the roster',
  (await bodyText(page)).includes('בדיקה ראשון'),
)

// --- 2. farms ----------------------------------------------------------------

section('2 — farms: a shared pin becomes a position')

const farmTemplate = await downloadTemplate('farms')
const farmHeaders = farmTemplate[0]
check(
  'the farms template carries סוג יישות and a location-link column',
  farmHeaders.some((h) => h.includes('סוג יישות')) &&
    farmHeaders.some((h) => h.includes('קישור מיקום')),
  farmHeaders.join(' · '),
)

// Columns, in the template's own order:
// name · entityKind · locality · region · positionLink · farmType · farmStatus
// · farmDunams · grazingDunams · contactName · contactPhone · notes
const farmPath = writeSheet('farms-filled', farmHeaders, [
  [
    'חוות בדיקת ייבוא',
    'חווה',
    'רתמים',
    'רמת נגב',
    'https://waze.com/ul?ll=30.9800,34.6700',
    'מעורבת',
    'פעילה',
    '120',
    '900',
    'איש קשר בדיקה',
    '052-0007101',
    '',
  ],
  [
    'מושב בדיקת ייבוא',
    'מושב',
    'אופקים',
    'מרחבים',
    '',
    'חקלאות',
    'ליצירת קשר',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'חוות ללא מיקום',
    'חווה',
    'יישוב שאינו בגזטיר',
    'רמת נגב',
    'https://maps.app.goo.gl/AbCdEf',
    'בעלי חיים',
    'נוצר קשר',
    '',
    '',
    '',
    '',
    '',
  ],
])

await upload(farmPath)
check(
  'the farms upload reached the mapping step',
  (await bodyText(page)).includes('מיפוי עמודות'),
)
check(
  'every farm column was guessed',
  (await unmappedColumns(page)).length === 0,
  (await unmappedColumns(page)).join(' '),
)

check('"next" is allowed for farms', await clickText(page, 'הבא'))
await page.waitForTimeout(1200)
const farmPreview = (await bodyText(page)).replace(/\s+/g, ' ')
check('three rows will import', counts(farmPreview, 'ייובאו', 3), '')
check(
  'the Waze row is positioned from its link',
  farmPreview.includes('מיקום מהקישור'),
)
check(
  'the locality-only row is flagged as APPROXIMATE',
  farmPreview.includes('מיקום לפי היישוב'),
)
check(
  'the shortened-link row wears מיקום חסר and still imports',
  farmPreview.includes('מיקום חסר') && counts(farmPreview, 'דורשות השלמה', 1),
  '',
)

check('the farms import runs', await clickText(page, 'ייבוא'))
await page.waitForTimeout(1500)
check('the farms wizard reports success', (await bodyText(page)).includes('הייבוא הושלם'))

await page.evaluate(() => {
  window.location.hash = '#/coordinator/farms'
})
await page.waitForTimeout(3500)
const farmsList = await bodyText(page)
check('the imported farm is on the list', farmsList.includes('חוות בדיקת ייבוא'))
check('so is the imported moshav', farmsList.includes('מושב בדיקת ייבוא'))

// --- 3. drivers --------------------------------------------------------------

section('3 — drivers: the third template')

const driverTemplate = await downloadTemplate('drivers')
const driverHeaders = driverTemplate[0]
const driverPath = writeSheet('drivers-filled', driverHeaders, [
  ['נהג בדיקה', '052-0007201', 'מרצדס ספרינטר', '9', 'באר שבע', 'כל ערב'],
  // A capacity nobody has: rejected, not silently clamped.
  ['נהג עם ספסלים', '052-0007202', 'אוטובוס', '900', 'אופקים', ''],
])

await upload(driverPath)
check(
  'every driver column was guessed',
  (await unmappedColumns(page)).length === 0,
  (await unmappedColumns(page)).join(' '),
)
check('"next" is allowed for drivers', await clickText(page, 'הבא'))
await page.waitForTimeout(1200)
const driverPreview = (await bodyText(page)).replace(/\s+/g, ' ')
check('one row will import', /ייובאו 1/.test(driverPreview), '')
check(
  'an impossible seat count is rejected, not clamped',
  driverPreview.includes('מספר מקומות שגוי'),
)

check('the drivers import runs', await clickText(page, 'ייבוא'))
await page.waitForTimeout(1500)
await page.evaluate(() => {
  window.location.hash = '#/coordinator/drivers'
})
await page.waitForTimeout(2500)
check(
  'the imported driver is in the roster',
  (await bodyText(page)).includes('נהג בדיקה'),
)

await browser.close()

console.log('')
if (failed > 0) {
  console.log(`  ${failed} of ${passed + failed} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${passed} checks passed.`)
