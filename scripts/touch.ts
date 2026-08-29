import { chromium } from 'playwright'
import type { CDPSession, Locator, Page } from 'playwright'

/**
 * A63 — EVERY MAP INTERACTION WORKS WITH A FINGER, AT iPad PORTRAIT.
 *
 * The product owner's instrument is a 13" iPad Pro (1032 × 1376 in CSS px) and
 * a thumb. Every map gesture in the app had only ever been driven by a mouse —
 * by hand, by `bun run wizard`, and by the two years of habit that come with a
 * trackpad. A mouse and a finger are not the same input:
 *
 *   · A mouse hits a 22 px target; a finger needs 44 (P0.3 — `wrapForTouch`
 *     in MapCanvas expands the HIT area and leaves the drawing alone).
 *   · A mouse emits mousedown/mousemove/mouseup; a touch device emits
 *     touchstart/touchmove/touchend and no hover at all. MapLibre's drag
 *     handlers and our own armed modes have to be reachable from both.
 *   · A one-finger drag on a map is ambiguous — it can pan the map or move a
 *     handle — and getting that wrong means either the map cannot be panned or
 *     the handles cannot be moved.
 *
 * So this drives the whole editing vocabulary with SYNTHETIC TOUCH, through
 * CDP's `Input.dispatchTouchEvent`, in a context created with `hasTouch` and
 * no mouse involved anywhere:
 *
 *   1  every marker on the working screens presents a ≥44 px target;
 *   2  a tap on an unarmed map creates nothing, and an armed one places a post;
 *   3  a post's pin drags to a new position under one finger;
 *   4  a polygon is drawn tap by tap and closed;
 *   5  a vertex of an existing zone drags;
 *   6  a midpoint grip on an edge inserts a vertex;
 *   7  the centre handle translates the whole ring, area preserved;
 *   8  a roster bubble taps through to a filter;
 *   9  a drag that STARTS on a marker still pans the map — the 44 px boxes
 *      must not turn the map into a minefield of dead zones.
 *
 * `isMobile` is deliberately NOT set: an iPad Pro at 1032 is a touch device at
 * desktop width, and turning on mobile emulation would also swap the user
 * agent and the viewport meta handling, which is a different device from the
 * one being tested.
 *
 * Run against a live dev server:
 *   BASE_URL=http://localhost:5173 bun run touch
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const WIDTH = 1032
const HEIGHT = 1376

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

// --- synthetic touch ---------------------------------------------------------

/** One finger down, up, in place. */
async function tap(cdp: CDPSession, x: number, y: number): Promise<void> {
  const touchPoints = [{ x: Math.round(x), y: Math.round(y) }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/**
 * One finger down, dragged in `steps` increments, up.
 *
 * The intermediate moves are not decoration: MapLibre's drag handlers arm on
 * the first move past a threshold, and a two-event start→end jump is discarded
 * as a tap. A real thumb produces dozens of moves; a dozen is enough to be
 * indistinguishable and fast.
 */
async function touchDrag(
  cdp: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 14,
): Promise<void> {
  const at = (i: number) => [
    {
      x: Math.round(from.x + ((to.x - from.x) * i) / steps),
      y: Math.round(from.y + ((to.y - from.y) * i) / steps),
    },
  ]
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: at(0),
  })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(i),
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const centreOf = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element has no box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Tap the first enabled button/link whose visible text contains `text`.
 *
 * Scrolls it into view FIRST. At iPad portrait the farm detail is one long
 * column — the zones list sits well below the fold — and a synthetic touch is
 * dispatched in VIEWPORT coordinates, so tapping an off-screen rect lands on
 * whatever happens to be at that y instead. A finger cannot reach what a
 * finger cannot see either.
 */
async function tapText(page: Page, cdp: CDPSession, text: string): Promise<boolean> {
  const rect = await page.evaluate((label) => {
    const el = [...document.querySelectorAll('button, a')].find(
      (b) =>
        !(b as HTMLButtonElement).disabled &&
        (b as HTMLElement).offsetParent !== null &&
        b.textContent?.includes(label),
    )
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, text)
  if (!rect) return false
  await tap(cdp, rect.x, rect.y)
  return true
}

/** Bring the map back under the finger after a tap that scrolled the page. */
async function scrollToMap(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo({ top: 0 }))
  await page.waitForTimeout(400)
}

const bodyText = (page: Page) => page.evaluate(() => document.body.innerText)

const mapBox = async (page: Page) => {
  const box = await page.locator('[role="application"]').first().boundingBox()
  if (!box) throw new Error('no map on the page')
  return box
}

/** Guard-post pins: the teardrop viewBox, minus the car's meeting points. */
const anchorPins = (page: Page): Locator =>
  page.locator(
    '.maplibregl-marker:has(svg[viewBox="0 0 24 32"]):not(:has(path[d^="M5 11"]))',
  )

/** Every marker's hit box, so a target under 44 px is a named failure. */
async function undersizedTargets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.maplibregl-marker')]
      .filter((m) => {
        // The area chip is a READ-OUT (pointer-events:none), not a control.
        if (getComputedStyle(m as HTMLElement).pointerEvents === 'none') return false
        const r = m.getBoundingClientRect()
        // Half a pixel of slack: a rect is fractional and a 44 px box measures
        // 43.99 as often as 44.00. The criterion is the design intent, not
        // sub-pixel layout arithmetic.
        return r.width < 43.5 || r.height < 43.5
      })
      .map((m) => {
        const r = m.getBoundingClientRect()
        return `${m.getAttribute('aria-label') ?? '?'} ${Math.round(r.width)}×${Math.round(r.height)}`
      }),
  )
}

// --- run ---------------------------------------------------------------------

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  hasTouch: true,
  locale: 'he-IL',
})
const page = await context.newPage()
page.setDefaultTimeout(60_000)
const cdp = await context.newCDPSession(page)

console.log(`A63 — every map gesture, by finger, at ${WIDTH}×${HEIGHT}`)

await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
await page.waitForSelector('select', { state: 'attached' })
await page.selectOption('select', 'coordinator')
await page.waitForTimeout(400)

check(
  'the context really is a touch device',
  await page.evaluate(() => 'ontouchstart' in window && navigator.maxTouchPoints > 0),
)

// --- 1. targets --------------------------------------------------------------

section('1 — every marker is a 44 px target')

await page.evaluate(() => {
  window.location.hash = '#/coordinator/farms'
})
await page.waitForTimeout(4500)
const smallOnFarms = await undersizedTargets(page)
check(
  'farms map — no target under 44 px',
  smallOnFarms.length === 0,
  smallOnFarms.join(' · '),
)

await page.evaluate(() => {
  window.location.hash = '#/coordinator/farms/farm-01'
})
await page.waitForTimeout(4500)
const smallOnDetail = await undersizedTargets(page)
check(
  'farm detail — no target under 44 px',
  smallOnDetail.length === 0,
  smallOnDetail.join(' · '),
)

// The pin's TIP is the coordinate, so growing the box must not move it.
const pinAnchors = await page.evaluate(() =>
  [...document.querySelectorAll('.maplibregl-marker')]
    .filter((m) => m.querySelector('svg[viewBox="0 0 24 32"]'))
    .map((m) => (m as HTMLElement).style.transform.includes('-50%, -100%')),
)
check(
  'the teardrops still anchor on their tip',
  pinAnchors.length > 0 && pinAnchors.every(Boolean),
  `${pinAnchors.length} pins`,
)

// --- 2. placing a guard post by finger ---------------------------------------

section('2 — placing a guard post, armed mode included')

await scrollToMap(page)
const detailMap = await mapBox(page)
const postsBefore = await anchorPins(page).count()

await tap(cdp, detailMap.x + detailMap.width * 0.25, detailMap.y + detailMap.height * 0.75)
await page.waitForTimeout(900)
check(
  'a tap on an UNARMED map creates nothing',
  (await anchorPins(page).count()) === postsBefore,
  `${postsBefore}`,
)

check('"הוסף נקודה" is reachable by finger', await tapText(page, cdp, 'הוסף נקודה'))
await page.waitForTimeout(500)
await scrollToMap(page)
check(
  'the tap armed the map',
  (await bodyText(page)).includes('לחצו על המפה למיקום הנקודה'),
)

await tap(cdp, detailMap.x + detailMap.width * 0.28, detailMap.y + detailMap.height * 0.72)
await page.waitForTimeout(1500)
check(
  'the next tap places the post',
  (await anchorPins(page).count()) === postsBefore + 1,
  `${postsBefore} → ${await anchorPins(page).count()}`,
)
check(
  'and one press still buys exactly one point',
  !(await bodyText(page)).includes('לחצו על המפה למיקום הנקודה'),
)

// --- 3. dragging a pin -------------------------------------------------------

section('3 — dragging a pin')

const pin = anchorPins(page).last()
const pinFrom = await centreOf(pin)
// A pin is bottom-anchored: aim at the head, not at the middle of the box.
await touchDrag(
  cdp,
  { x: pinFrom.x, y: pinFrom.y + 8 },
  { x: pinFrom.x + 90, y: pinFrom.y - 60 },
)
await page.waitForTimeout(1200)
const pinTo = await centreOf(anchorPins(page).last())
check(
  'one finger moves the pin',
  Math.abs(pinTo.x - pinFrom.x) > 30 || Math.abs(pinTo.y - pinFrom.y) > 30,
  `Δ ${Math.round(pinTo.x - pinFrom.x)}, ${Math.round(pinTo.y - pinFrom.y)}`,
)

// --- 4. drawing a polygon ----------------------------------------------------

section('4 — drawing a zone, tap by tap')

check('"צייר שטח מרעה" is reachable', await tapText(page, cdp, 'צייר שטח מרעה'))
await page.waitForTimeout(600)
await scrollToMap(page)
check('the drawing mode is armed', (await bodyText(page)).includes('מציירים שטח מרעה'))

await scrollToMap(page)
const drawMap = await mapBox(page)
const corners: Array<[number, number]> = [
  [0.36, 0.3],
  [0.6, 0.3],
  [0.62, 0.52],
  [0.34, 0.5],
]
for (const [fx, fy] of corners) {
  await tap(cdp, drawMap.x + drawMap.width * fx, drawMap.y + drawMap.height * fy)
  await page.waitForTimeout(600)
}
check(
  'four taps are four corners',
  (await bodyText(page)).includes('4 פינות'),
  (await bodyText(page)).match(/\d+ פינות/)?.[0] ?? '—',
)
check(
  'the live area reads while drawing',
  /[\d,]+ דונם/.test(await bodyText(page)),
)

check('"סגור פוליגון" closes it by finger', await tapText(page, cdp, 'סגור פוליגון'))
await scrollToMap(page)
await page.waitForTimeout(1500)
check(
  'the zone joined the farm',
  !(await bodyText(page)).includes('מציירים שטח מרעה'),
)

// --- 5-7. editing an existing zone -------------------------------------------

section('5 — reshaping a zone by finger')

check('"ערוך" opens the zone for editing', await tapText(page, cdp, 'ערוך'))
await page.waitForTimeout(1200)
await scrollToMap(page)

const grips = page.locator('.maplibregl-marker[aria-label*="פינת אזור"]')
const gripsBefore = await grips.count()
check('the ring shows its vertex grips', gripsBefore > 0, `${gripsBefore}`)

const inserts = page.locator('.maplibregl-marker[aria-label*="הוספת פינה"]')
const insertsBefore = await inserts.count()
check('and a midpoint grip on every edge', insertsBefore > 0, `${insertsBefore}`)

const gripFrom = await centreOf(grips.first())
await touchDrag(cdp, gripFrom, { x: gripFrom.x - 70, y: gripFrom.y + 55 })
await page.waitForTimeout(1200)
const gripTo = await centreOf(grips.first())
check(
  'a vertex follows the finger',
  Math.abs(gripTo.x - gripFrom.x) > 25 || Math.abs(gripTo.y - gripFrom.y) > 25,
  `Δ ${Math.round(gripTo.x - gripFrom.x)}, ${Math.round(gripTo.y - gripFrom.y)}`,
)

section('6 — inserting a vertex on an edge')

const midpoint = await centreOf(inserts.first())
await tap(cdp, midpoint.x, midpoint.y)
await page.waitForTimeout(1200)
check(
  'tapping a midpoint grip adds a corner',
  (await grips.count()) === gripsBefore + 1,
  `${gripsBefore} → ${await grips.count()}`,
)

section('7 — moving the whole polygon')

const areaOf = async () => {
  const m = (await bodyText(page)).match(/([\d,]+) דונם/)
  return m ? Number(m[1].replace(/,/g, '')) : NaN
}
const areaBefore = await areaOf()
const handle = page.locator('.maplibregl-marker[aria-label*="הזזת האזור"]').first()
const handleFrom = await centreOf(handle)
await touchDrag(cdp, handleFrom, { x: handleFrom.x + 80, y: handleFrom.y + 70 })
await page.waitForTimeout(1400)
const handleTo = await centreOf(
  page.locator('.maplibregl-marker[aria-label*="הזזת האזור"]').first(),
)
const areaAfter = await areaOf()
check(
  'the centre handle translates the ring',
  Math.abs(handleTo.x - handleFrom.x) > 25 || Math.abs(handleTo.y - handleFrom.y) > 25,
  `Δ ${Math.round(handleTo.x - handleFrom.x)}, ${Math.round(handleTo.y - handleFrom.y)}`,
)
check(
  'a translation preserves the area',
  Number.isFinite(areaBefore) &&
    Number.isFinite(areaAfter) &&
    Math.abs(areaAfter - areaBefore) / Math.max(1, areaBefore) < 0.06,
  `${areaBefore} → ${areaAfter} דונם`,
)

// --- 8. the roster bubbles ---------------------------------------------------

section('8 — a roster bubble filters by finger (P0.2)')

await page.evaluate(() => {
  window.location.hash = '#/coordinator/volunteers'
})
await page.waitForTimeout(5000)

const smallOnRoster = await undersizedTargets(page)
check(
  'volunteers map — no bubble under 44 px',
  smallOnRoster.length === 0,
  smallOnRoster.join(' · '),
)

const shown = async () => {
  const m = (await bodyText(page)).match(/מוצגים (\d+) מתוך (\d+)/)
  return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN]
}
const [beforeShown, total] = await shown()
check('the roster starts unfiltered', beforeShown === total, `${beforeShown}/${total}`)

const bubbles = page.locator('.maplibregl-marker')
const bubbleCount = await bubbles.count()
check('the map carries one bubble per locality', bubbleCount > 5, `${bubbleCount}`)

// The biggest bubble is drawn LAST, so it is the one on top and the one a
// finger reliably hits.
const biggest = bubbles.nth(bubbleCount - 1)
const bubbleAt = await centreOf(biggest)
await tap(cdp, bubbleAt.x, bubbleAt.y)
await page.waitForTimeout(1200)
const [afterShown] = await shown()
check(
  'tapping a bubble filters the roster',
  afterShown > 0 && afterShown < beforeShown,
  `${beforeShown} → ${afterShown}`,
)
check(
  'and the tapped town names itself back',
  (await bodyText(page)).includes('ניקוי הסינון'),
)

check('"ניקוי" clears it again', await tapText(page, cdp, 'ניקוי הסינון'))
await page.waitForTimeout(900)
check('the roster is whole again', (await shown())[0] === total, `${(await shown())[0]}`)

// --- 9. the map still pans ---------------------------------------------------

section('9 — the 44 px boxes did not break panning')

await page.evaluate(() => {
  window.location.hash = '#/coordinator/farms'
})
await page.waitForTimeout(4500)

const farmsMap = await mapBox(page)
const marker = page.locator('.maplibregl-marker').first()
const markerAt = await centreOf(marker)
const before = await centreOf(marker)
// A drag that STARTS on a marker: MapLibre's pan handler lives on the
// container, so the gesture must still move the map under it.
await touchDrag(cdp, markerAt, { x: markerAt.x - 140, y: markerAt.y + 40 })
await page.waitForTimeout(1200)
const after = await centreOf(page.locator('.maplibregl-marker').first())
check(
  'a drag starting on a marker pans the map',
  Math.abs(after.x - before.x) > 60,
  `Δ ${Math.round(after.x - before.x)}`,
)

// And a drag on bare map does the same, which is the control for the above.
// Not the bottom-start corner: the floating legend lives there, and in RTL
// "start" is the right-hand side.
const bareFrom = { x: farmsMap.x + farmsMap.width * 0.5, y: farmsMap.y + farmsMap.height * 0.25 }
const controlBefore = await centreOf(page.locator('.maplibregl-marker').first())
await touchDrag(cdp, bareFrom, { x: bareFrom.x + 120, y: bareFrom.y - 40 })
await page.waitForTimeout(1200)
const controlAfter = await centreOf(page.locator('.maplibregl-marker').first())
check(
  'a drag on bare map pans it too',
  Math.abs(controlAfter.x - controlBefore.x) > 60,
  `Δ ${Math.round(controlAfter.x - controlBefore.x)}`,
)

await browser.close()

console.log('')
if (failed > 0) {
  console.log(`  ${failed} of ${passed + failed} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${passed} checks passed.`)
