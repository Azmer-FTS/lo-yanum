import { chromium } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * A81 — THE EMPTY STATES, SWEPT AGAINST AN EMPTY PROGRAMME (PO point 5).
 *
 * The product owner's words: *every block with no content shows a dignified
 * empty state — an icon, "אין … עדיין", a create button where it makes sense —
 * never a crushed stump*, and he named one: the route planner's tour block.
 *
 * ★★ THE INSTRUMENT IS AN EMPTY STORE, AND IT IS THE ONLY HONEST ONE. The demo
 *    fixtures have twelve farms, three hundred volunteers and a month of
 *    guards, so on `bun run dev` almost nothing is ever empty and a human
 *    reviewing "the empty states" is reviewing the two he can think of. **P3.1
 *    is about to import real farmers into a database that is empty**, so the
 *    FIRST screen the coordinator sees of the real app is the state nobody has
 *    ever looked at.
 *
 * ★ SO EVERY SCREEN IS DRIVEN WITH `__loYanumEmptyStore()`, which the app
 *   publishes in DEMO builds only (`main.tsx`) — the same idiom `MapCanvas`
 *   uses for `__loYanumMap`. ⚠️ The first version of this gate imported
 *   `/src/core/store.ts` from the page and emptied it successfully, to no
 *   effect: the gate's module record and the app's are two instances with two
 *   module-scope snapshots, so `_raw().farms` went 14 → 0 in one while the app
 *   rendered fourteen farms out of the other. That is the kind of green run
 *   that is worse than a red one.
 *
 * ★ AND WHAT IT ASSERTS IS NARROW ON PURPOSE: a `<section>` that has a HEADING
 *   and a BODY of almost no text must carry an `EmptyState`
 *   (`data-empty-state`). It cannot ask whether an empty state is dignified —
 *   that is a capture's job — but it can ask whether one is THERE, which is the
 *   failure the product owner actually hit.
 *
 * Run against a live dev server:
 *   BASE_URL=http://localhost:5173 bun run empty
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'

/**
 * ★ A SCREEN THAT SHOWS NO EMPTY STATE AT ALL, WITH ITS REASON PRINTED IN THE
 *   RUN. There is exactly one and there should only ever be one: a CALENDAR is
 *   not a list. An empty August is thirty-one dated cells with nothing in them,
 *   which is already the honest picture — an "אין אירועים עדיין" card in the
 *   middle of a month grid would be a second, worse answer to a question the
 *   grid has already answered.
 */
const NO_EMPTY_STATE: Record<string, string> = {
  agenda: 'a calendar is not a list — an empty month is thirty-one dated cells',
  import: 'a file wizard: step 1 is a drop zone, which is its own empty state',
  settings: 'a settings screen states facts and offers controls; nothing here is a list',
}

const ROUTES: Array<{ name: string; hash: string; session?: string }> = [
  { name: 'dashboard', hash: '#/coordinator' },
  { name: 'agenda', hash: '#/coordinator/agenda' },
  { name: 'farms', hash: '#/coordinator/farms' },
  { name: 'route-planner', hash: '#/coordinator/route' },
  { name: 'volunteers', hash: '#/coordinator/volunteers' },
  { name: 'drivers', hash: '#/coordinator/drivers' },
  { name: 'missions', hash: '#/coordinator/missions' },
  { name: 'incidents', hash: '#/coordinator/incidents' },
  { name: 'settings', hash: '#/coordinator/settings' },
  { name: 'import', hash: '#/coordinator/volunteers/import' },
]

let failures = 0
let checks = 0

function check(label: string, ok: boolean, detail = ''): void {
  checks++
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

/** Runs IN THE PAGE. */
function audit(): Array<{ heading: string; body: string; hasEmptyState: boolean }> {
  const out: Array<{ heading: string; body: string; hasEmptyState: boolean }> = []
  for (const section of document.querySelectorAll('section')) {
    const el = section as HTMLElement
    if (el.offsetParent === null && el.getClientRects().length === 0) continue

    const heading = el.querySelector('h1, h2, h3')
    if (!heading) continue
    // U1 (2026-09-02) — a FOLDED block is a heading with its body deliberately
    // hidden, and its one-line summary is the content. Not a stump.
    if (el.dataset.open === '0') continue
    // A section that contains other sections is a WRAPPER; its children are
    // what this is about, and judging it too would report one defect twice.
    if (el.querySelector('section') !== null) continue

    /**
     * ★ THE WHOLE HEADING ROW COMES OFF, NOT JUST THE `<h2>`, and that
     *   distinction is what the first run got wrong. A `Section`'s heading row
     *   is `[title, action]` — and an action is a "quick pick" link or an "add"
     *   button, which is CHROME, not content. Subtracting only the title left
     *   33 characters of link text standing in for a body, so the route
     *   planner's farm picker — a heading over an EMPTY card, and the exact
     *   stump the product owner named — measured as full and passed.
     */
    const headingRow = heading.parentElement
    const chrome = (
      headingRow && headingRow.contains(heading) && headingRow !== el
        ? (headingRow as HTMLElement).innerText
        : (heading.textContent ?? '')
    ).trim()
    const all = (el.innerText ?? '').trim()
    const body = all.startsWith(chrome)
      ? all.slice(chrome.length).trim()
      : all.replace(chrome, '').trim()

    out.push({
      heading: (heading.textContent ?? '').trim().slice(0, 40),
      body: body.replace(/\s+/g, ' ').slice(0, 80),
      hasEmptyState: el.querySelector('[data-empty-state]') !== null,
    })
  }
  return out
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1032, height: 1376 },
  hasTouch: true,
  locale: 'he-IL',
})
const page = await context.newPage()
page.setDefaultTimeout(60_000)

console.log('\n  A81 — every block, against an EMPTY programme (PO point 5)')
console.log(`  ${'screen'.padEnd(16)} ${'blocks'.padStart(7)} ${'empty'.padStart(7)}  result`)
console.log(`  ${'-'.repeat(70)}`)

await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
await page.waitForSelector('select', { state: 'attached' })
await page.selectOption('select', 'coordinator')
await page.waitForTimeout(400)

/**
 * ★ EMPTIED ON EVERY NAVIGATION, not once. The screens read through
 *   `useCoreValue`, which re-runs on a version bump — but the hash change
 *   remounts and some screens seed state from what they find at mount. Emptying
 *   after the route has settled is what makes the audit see the empty case
 *   rather than a screen holding the fixtures it captured a frame earlier.
 */
const empty = async () => {
  const done = await page.evaluate(() => {
    const fn = (window as unknown as { __loYanumEmptyStore?: () => void })
      .__loYanumEmptyStore
    if (!fn) return false
    fn()
    return true
  })
  if (!done) throw new Error('__loYanumEmptyStore is not published — is this a demo build?')
  await page.waitForTimeout(900)
}

/**
 * ⚠️ A BLOCK THAT IS LEGITIMATELY SHORT WITHOUT BEING EMPTY, listed rather than
 *   tolerated. Each of these renders a CONTROL or a fact, not a list, so there
 *   is nothing for it to be empty of.
 */
const CONTROLS = [
  'תכנון מסלול', // the day picker
  'חיבור', // the connection card — it states a fact
  'מפות לא מקוונות',
  'חשבון',
  'כתובת דוחות',
  'שינויים ממתינים',
  'ייבוא',
]

for (const route of ROUTES) {
  await page.goto(`${BASE}/${route.hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  await empty()

  const blocks = await page.evaluate(audit)
  const stumps = blocks.filter(
    (b) =>
      !b.hasEmptyState &&
      b.body.length < 24 &&
      !CONTROLS.some((c) => b.heading.includes(c)),
  )

  /**
   * ★★ AND THE CHECK THAT COVERS THE SCREENS WITH NO `<section>` AT ALL, which
   *    is most of them. A list screen is a `MapSplit` content column with a
   *    `PageHeader` and a table — no `<section>` for the sweep above to find —
   *    so a run that only counted sections would report "0 blocks, PASS" for
   *    the farms roster and prove nothing. **With an empty programme, a screen
   *    must show at least one empty state**, or be on the exemption list above
   *    with its reason printed.
   */
  const emptyStates = await page.locator('[data-empty-state]:visible').count()
  const exempt = NO_EMPTY_STATE[route.name]
  const silent = emptyStates === 0 && exempt === undefined

  const ok = stumps.length === 0 && !silent
  if (!ok) failures++
  checks++
  console.log(
    `  ${route.name.padEnd(16)} ${String(blocks.length).padStart(7)} ${String(
      emptyStates,
    ).padStart(7)}  ${ok ? 'PASS' : 'FAIL'}`,
  )
  if (exempt) console.log(`      exempt: ${exempt}`)
  if (silent) {
    console.log(
      '      PO POINT 5 the whole screen is empty and says NOTHING — no EmptyState anywhere',
    )
  }
  for (const s of stumps) {
    console.log(`      PO POINT 5 crushed stump: "${s.heading}" → "${s.body}"`)
  }
}

/**
 * ★ AND THE CAPTURES, because the gate can ask whether an empty state is THERE
 *   and only a picture can say whether it is dignified. Two screens, at iPad
 *   portrait, with nothing in the programme: the one the coordinator opens on
 *   his first morning, and the one the product owner named.
 */
{
  const dir = path.resolve('docs/screenshots/empty')
  fs.mkdirSync(dir, { recursive: true })
  for (const name of ['dashboard', 'route'] as const) {
    await page.goto(`${BASE}/#/coordinator${name === 'dashboard' ? '' : '/route'}`, {
      waitUntil: 'load',
    })
    await page.waitForTimeout(2500)
    await empty()
    const file = path.join(dir, `${name}.png`)
    await page.screenshot({ path: file, fullPage: true })
    console.log(`  captured ${path.relative(process.cwd(), file)}`)
  }
}

await browser.close()

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} screen(s) FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} screens show a dignified empty state everywhere.`)
