import { chromium } from 'playwright'
import type { Locator, Page } from 'playwright'

/**
 * A27 — THE WIZARD IS PLAYABLE FROM A FARM THAT HAS NO ANCHOR POINT.
 *
 * This is the scripted half of the criterion that Lot 0.9 exists for. The bug
 * it pins down was a hard stop, not a rough edge: choosing a farm with no anchor
 * point rendered a required, EMPTY select, so step 1 could not be completed and
 * nothing on screen offered a way out. A20 already covered the happy path — and
 * passed the whole time, because the fixtures happen to list a farm WITH an
 * anchor point first.
 *
 * So this walks the unhappy path end to end, and every assertion is a thing that
 * was impossible before:
 *
 *   1  pick a farm with no anchor point → no dead select, a callout instead,
 *      and "next" refuses;
 *   2  a click on an UNARMED map does nothing; "add a point" then a click →
 *      the point is created, selected and named, and the mode disarms itself;
 *   3  rename it in the panel → the map label follows;
 *   4  drag the pin → the stored position moves;
 *   5  "next" now allows, the scored proposal appears, auto-fill takes it;
 *   6  a refusal drops the candidate AND promotes the next best;
 *   7  confirmations reach the requirement, the driver is confirmed;
 *   8  the guard is created and its recap names the point drawn in step 2.
 *
 * Run against a live dev server:
 *   BASE_URL=http://localhost:5173 bun run wizard
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'

/** A farm with no anchor point in the fixtures — the whole point of the test. */
const EMPTY_FARM = 'farm-05'

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

/** Click the first button or link whose visible text contains `text`. */
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

const bodyText = (page: Page) => page.evaluate(() => document.body.innerText)

const mapBox = async (page: Page) => {
  const box = await page.locator('[role="application"]').first().boundingBox()
  if (!box) throw new Error('no map on the page')
  return box
}

/** Anchor pins are the square markers; the farm centroid is a disc. */
const anchorPins = (page: Page): Locator =>
  page.locator('.maplibregl-marker[style*="border-radius: var(--radius-field)"]')

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'he-IL',
})
const page = await context.newPage()
page.setDefaultTimeout(60_000)

console.log('A27 — guard wizard, starting from a farm with NO anchor point')
console.log('')

await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
await page.waitForSelector('select', { state: 'attached' })
await page.selectOption('select', 'coordinator')
await page.waitForTimeout(400)

await page.evaluate(() => {
  window.location.hash = '#/coordinator/missions/new'
})
await page.waitForTimeout(4000)

// --- 1. the dead end ------------------------------------------------------

console.log('  Step 1 — a farm with no anchor point')
console.log('  ' + '-'.repeat(68))

// The FIRST select inside `main` is the wizard's farm picker — the dev
// toolbar's session picker lives outside `main`, which is what keeps this
// from silently switching identity instead of farm.
await page.selectOption('main select', EMPTY_FARM)
await page.waitForTimeout(1200)

const emptyState = await bodyText(page)
check(
  'no empty select — a callout takes its place',
  emptyState.includes('לחווה זו אין עדיין עמדת שמירה'),
)
check(
  'the callout points at the map',
  emptyState.includes('הוסיפו נקודה על המפה'),
)

const nextDisabled = async () =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      x.textContent?.trim().startsWith('הבא'),
    ) as HTMLButtonElement | undefined
    return b?.disabled ?? null
  })

check('"next" refuses while there is no point', (await nextDisabled()) === true)
check('no anchor pin on the map yet', (await anchorPins(page).count()) === 0)

// --- 2. create the point by clicking the map ------------------------------

console.log('')
console.log('  Step 1 — the map creates the point')
console.log('  ' + '-'.repeat(68))

const box = await mapBox(page)

// Placement is an ARMED MODE. This half of the check is the product owner's
// actual request: a coordinator panning the map must not leave points behind.
await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.55)
await page.waitForTimeout(700)
check(
  'a click on an UNARMED map creates nothing',
  (await anchorPins(page).count()) === 0,
)

await clickText(page, 'הוסף נקודה')
await page.waitForTimeout(400)
check(
  'pressing "add a point" arms the map',
  await page.evaluate(() => document.body.innerText.includes('לחצו על המפה למיקום הנקודה')),
)

await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.4)
await page.waitForTimeout(1200)

check('the next click creates a pin', (await anchorPins(page).count()) === 1)
check(
  'and the mode disarms itself — one press buys one point',
  await page.evaluate(
    () => !document.body.innerText.includes('לחצו על המפה למיקום הנקודה'),
  ),
)

// A second click while disarmed must not add a second point.
await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.62)
await page.waitForTimeout(700)
check(
  'a further click adds nothing until re-armed',
  (await anchorPins(page).count()) === 1,
)

const afterCreate = await bodyText(page)
check(
  'the point is named and listed',
  afterCreate.includes('עמדת שמירה 1'),
)
check(
  'it is marked as the rendezvous',
  afterCreate.includes('נקודת מפגש עם הנהג'),
)
check(
  'its record opened beside the map',
  afterCreate.includes('פרטי הנקודה'),
)
check('"next" now allows', (await nextDisabled()) === false)

// --- 3. rename, and the map follows ---------------------------------------

const nameField = page.locator('input[type="text"]').first()
await nameField.fill('שער מזרחי — מבחן')
await page.waitForTimeout(600)

check(
  'renaming in the panel updates the point',
  (await bodyText(page)).includes('שער מזרחי — מבחן'),
)
check(
  'and the pin on the map carries the new label',
  (await anchorPins(page).first().getAttribute('aria-label')) ===
    'שער מזרחי — מבחן',
)

// --- 4. drag the pin -------------------------------------------------------

const pin = anchorPins(page).first()
const before = await pin.boundingBox()
if (!before) throw new Error('pin has no box')

await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
await page.mouse.down()
await page.mouse.move(before.x + 90, before.y + 60, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(800)

const after = await pin.boundingBox()
check(
  'the pin is draggable and stays where it was dropped',
  after !== null && Math.abs(after.x - before.x) > 40,
  after ? `moved ${Math.round(after.x - before.x)} px` : 'no box',
)

// --- 5. the scored proposal ------------------------------------------------

console.log('')
console.log('  Steps 2–4 — proposal, refusal, promotion, driver')
console.log('  ' + '-'.repeat(68))

await clickText(page, 'הבא')
await page.waitForTimeout(1200)

/**
 * The candidate names on screen.
 *
 * Scoped to `li[class*="tile"]` — the rows themselves. Reading every `<li>`
 * swept up the sticky stepper, whose items are also list items with a
 * semibold label, so "a refusal removed מה ומתי" was a green-looking test
 * asserting nothing about candidates at all.
 */
const names = async (): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('li[class*="tile"]')]
      .map((li) => li.querySelector('span.font-semibold')?.textContent?.trim() ?? '')
      .filter(Boolean),
  )

const proposed = await names()
check('a scored proposal is offered', proposed.length > 0, `${proposed.length} candidates`)

await clickText(page, 'מילוי אוטומטי')
await page.waitForTimeout(800)

const shortlistCount = await page.evaluate(() =>
  document.body.innerText.match(/(\d+) מתוך (\d+) מועמדים/)?.[0] ?? '',
)
check('auto-fill filled the shortlist', shortlistCount.startsWith('4'), shortlistCount)

await clickText(page, 'הבא')
await page.waitForTimeout(1000)

// --- 6. a refusal promotes -------------------------------------------------

const beforeRefusal = await names()
const refused = beforeRefusal[0]
await clickText(page, 'סירב')
await page.waitForTimeout(900)
const afterRefusal = await names()

check(
  'a refusal drops the candidate',
  !afterRefusal.includes(refused),
  `${refused} removed`,
)
check(
  'and the next-best name takes the freed slot',
  afterRefusal.length === beforeRefusal.length,
  `${beforeRefusal.length} → ${afterRefusal.length}`,
)

// --- 7. confirm to the requirement ----------------------------------------

const confirmNth = async (n: number) => {
  await page.evaluate((index) => {
    const buttons = [...document.querySelectorAll('button')].filter((b) =>
      b.textContent?.trim().startsWith('אישר'),
    )
    ;(buttons[index] as HTMLElement | undefined)?.click()
  }, n)
  await page.waitForTimeout(500)
}

await confirmNth(0)
await confirmNth(1)

const gauge = await page.evaluate(
  () => document.body.innerText.match(/(\d+)\s*\/\s*(\d+)/)?.[0] ?? '',
)
check('the gauge counts confirmations only', gauge.replace(/\s/g, '') === '2/2', gauge)
check('"next" allows once the requirement is met', (await nextDisabled()) === false)

await clickText(page, 'הבא')
await page.waitForTimeout(1000)

await clickText(page, 'אישר')
await page.waitForTimeout(700)
check(
  'a driver is confirmed',
  (await bodyText(page)).includes('אישר'),
)

// --- 8. commit -------------------------------------------------------------

console.log('')
console.log('  Step 5 — the guard exists')
console.log('  ' + '-'.repeat(68))

const criticalButton = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.textContent?.includes('יצירת השמירה'),
  )
  return b ? b.className.includes('btn-critical') : false
})
check('F4 — the irreversible commit wears the charter orange', criticalButton)

await clickText(page, 'יצירת השמירה')
await page.waitForTimeout(1500)

const recap = await bodyText(page)
check('the guard was created', recap.includes('השמירה נוצרה'))
check(
  'the recap names the point drawn in step 1',
  recap.includes('שער מזרחי — מבחן'),
)
check(
  'and warns that its access description is still empty',
  recap.includes('אפשר להשלים לפני שליחת ההודעות'),
)

const inStore = await page.evaluate(
  () => document.body.innerText.includes('פתיחת השמירה'),
)
check('the created guard is reachable', inStore)

await browser.close()

console.log('')
if (failed > 0) {
  console.log(`  ${failed} of ${passed + failed} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${passed} checks passed.`)
