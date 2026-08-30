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
/**
 * Build a row in the DOWNLOADED template's own column order from a
 * label → value map, filling every unnamed column with ''.
 *
 * P0bis.5a added an email column to all three templates, and the fixtures here
 * were positional arrays: every one of them silently shifted by one and three
 * checks failed for a reason that had nothing to do with what they test. A
 * fixture keyed by the header is a fixture that survives the next column.
 */
function row(headers: string[], values: Record<string, string>): string[] {
  // LONGEST KEY FIRST — the same rule `guessField` needs, for the same reason:
  // "איש קשר" is a substring of "טלפון איש קשר" and of "מייל איש קשר", so a
  // first-match-wins scan puts the contact's NAME in the phone column. This
  // fixture got that wrong on its first run.
  const keys = Object.keys(values).sort((a, b) => b.length - a.length)
  return headers.map((h) => {
    const key = keys.find((k) => h.includes(k))
    return key ? values[key] : ''
  })
}

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
check(
  'and one column per template field',
  volTemplate[0].length === 7,
  volTemplate[0].join(' · '),
)

const volHeaders = volTemplate[0]
const volPath = writeSheet('volunteers-filled', volHeaders, [
  row(volHeaders, {
    שם: 'בדיקה ראשון',
    טלפון: '050-0007001',
    'סוג טלפון': 'סמארטפון',
    מייל: 'bdika1@example.co.il',
    ישיבה: 'ישיבת שדרות',
    יישוב: 'שדרות',
    גיל: '21',
  }),
  row(volHeaders, {
    שם: 'בדיקה שני',
    טלפון: '050-0007002',
    'סוג טלפון': 'כשר',
    // P0bis.5a — NOT an address. The row must still import, with a warning:
    // an optional field cannot cost somebody his place on the roster.
    מייל: 'not-an-email',
    ישיבה: 'ישיבת שדרות',
    יישוב: 'נתיבות',
    גיל: '22',
  }),
  // Same phone as the row above: the in-file duplicate must be caught.
  row(volHeaders, {
    שם: 'בדיקה כפול',
    טלפון: '050-0007002',
    'סוג טלפון': 'כשר',
    ישיבה: 'ישיבת שדרות',
    יישוב: 'נתיבות',
    גיל: '23',
  }),
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
check(
  'a malformed email warns and does not reject the row',
  volFlat.includes('כתובת מייל לא תקינה'),
)

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
  row(farmHeaders, {
    'שם החווה': 'חוות בדיקת ייבוא',
    'סוג יישות': 'חווה',
    יישוב: 'רתמים',
    אזור: 'רמת נגב',
    'קישור מיקום': 'https://waze.com/ul?ll=30.9800,34.6700',
    'סוג חווה': 'מעורבת',
    סטטוס: 'פעילה',
    'שטח החווה': '120',
    'שטח מרעה': '900',
    'איש קשר': 'איש קשר בדיקה',
    'טלפון איש קשר': '052-0007101',
    'מייל איש קשר': 'kesher@example.co.il',
  }),
  row(farmHeaders, {
    'שם החווה': 'מושב בדיקת ייבוא',
    'סוג יישות': 'מושב',
    יישוב: 'אופקים',
    אזור: 'מרחבים',
    'סוג חווה': 'חקלאות',
    סטטוס: 'ליצירת קשר',
  }),
  row(farmHeaders, {
    'שם החווה': 'חוות ללא מיקום',
    'סוג יישות': 'חווה',
    יישוב: 'יישוב שאינו בגזטיר',
    אזור: 'רמת נגב',
    'קישור מיקום': 'https://maps.app.goo.gl/AbCdEf',
    'סוג חווה': 'בעלי חיים',
    סטטוס: 'נוצר קשר',
  }),
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
  row(driverHeaders, {
    שם: 'נהג בדיקה',
    טלפון: '052-0007201',
    מייל: 'nahag@example.co.il',
    רכב: 'מרצדס ספרינטר',
    מקומות: '9',
    יישוב: 'באר שבע',
    זמינות: 'כל ערב',
  }),
  // A capacity nobody has: rejected, not silently clamped.
  row(driverHeaders, {
    שם: 'נהג עם ספסלים',
    טלפון: '052-0007202',
    רכב: 'אוטובוס',
    מקומות: '900',
    יישוב: 'אופקים',
  }),
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
check('one row will import', counts(driverPreview, 'ייובאו', 1), '')
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
