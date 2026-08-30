import { chromium } from 'playwright'
import type { CDPSession, Page } from 'playwright'

/**
 * A65 — THE MAP/CONTENT SEAM IS DRAGGABLE, WITH A FINGER AND WITH A MOUSE.
 *
 * P0bis.2 turned the frontier between the map and the content into a splitter.
 * A splitter is one of those controls that demos perfectly with a trackpad and
 * is unusable on the device the app exists for, so this drives it BOTH ways at
 * iPad Pro 13" landscape — the width where the two panels coexist — and checks
 * the four things that make it a control rather than a decoration:
 *
 *   1  IT IS FINDABLE AND GRABBABLE. A visible grip at least 44 px tall, a hit
 *      area at least 44 px ACROSS (P0.3: the strip is 16 px wide, the overlay
 *      widens it), and `cursor: col-resize` so a mouse user knows before
 *      pressing.
 *   2  IT MOVES BOTH PANELS, LIVE. Dragging right grows the map and shrinks
 *      the content by the same amount, and the map CANVAS follows in the same
 *      gesture — a splitter that only resizes its container leaves a stretched
 *      or letterboxed map until the next resize event.
 *   3  IT IS REMEMBERED, PER SCREEN. The ratio survives a reload, under
 *      `lo-yanum:map-ratio:<screenKey>` — the same key space as the mode.
 *   4  IT CANNOT BE DRAGGED INTO A DEAD END, AND IT CAN BE UNDONE. The bounds
 *      hold at 25 % and 75 % however far the gesture goes, and a DOUBLE TAP on
 *      the handle restores the screen's own default.
 *
 * The wizard's step 1 is included on purpose: it is map-first (F2) but is NOT
 * a `MapSplit` — it lives inside the stepper's height budget — and it is
 * exactly the kind of screen a shared rule quietly skips.
 *
 * Run against a live dev server:
 *   BASE_URL=http://localhost:5173 bun run splitter
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const WIDTH = 1376
const HEIGHT = 1032

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

const near = (a: number, b: number, tol = 6) => Math.abs(a - b) <= tol

interface Geom {
  shell: { left: number; right: number; width: number }
  content: { left: number; width: number }
  handle: { x: number; y: number; width: number }
  grip: { height: number }
  hit: { width: number }
  canvas: { width: number }
  cursor: string
  ratio: number
}

/** Everything the assertions need, read in one round trip. */
const geometry = (): Geom | null => {
  const handleEl = document.querySelector('[data-panel-splitter]') as HTMLElement | null
  const shellEl = document.querySelector('[data-map-shell]') as HTMLElement | null
  const contentEl = document.querySelector('[data-map-content]') as HTMLElement | null
  if (!handleEl || !shellEl || !contentEl) return null

  const h = handleEl.getBoundingClientRect()
  const s = shellEl.getBoundingClientRect()
  const c = contentEl.getBoundingClientRect()
  const gripEl = handleEl.firstElementChild as HTMLElement | null
  const hitEl = handleEl.lastElementChild as HTMLElement | null
  const canvasEl = document.querySelector('.maplibregl-canvas') as HTMLElement | null

  return {
    shell: { left: s.left, right: s.right, width: s.width },
    content: { left: c.left, width: c.width },
    handle: { x: h.left + h.width / 2, y: h.top + h.height / 2, width: h.width },
    grip: { height: gripEl ? gripEl.getBoundingClientRect().height : 0 },
    hit: { width: hitEl ? hitEl.getBoundingClientRect().width : 0 },
    canvas: { width: canvasEl ? canvasEl.getBoundingClientRect().width : 0 },
    cursor: getComputedStyle(handleEl).cursor,
    ratio: Number(
      (Number(getComputedStyle(shellEl).getPropertyValue('--content-w').replace('%', '')) || 0).toFixed(1),
    ),
  }
}

async function mouseDrag(page: Page, from: { x: number; y: number }, dx: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(from.x + (dx * i) / 10, from.y)
  }
  await page.mouse.up()
  await page.waitForTimeout(250)
}

async function touchDrag(
  cdp: CDPSession,
  from: { x: number; y: number },
  dx: number,
  steps = 12,
) {
  const at = (i: number) => [
    { x: Math.round(from.x + (dx * i) / steps), y: Math.round(from.y) },
  ]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

async function tap(cdp: CDPSession, x: number, y: number) {
  const touchPoints = [{ x: Math.round(x), y: Math.round(y) }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

interface Screen {
  name: string
  key: string
  hash: string
  /** The default content share, for the double-tap reset assertion. */
  defaultRatio: number
  setup?: (page: Page) => Promise<void>
}

const SCREENS: Screen[] = [
  { name: 'dashboard', key: 'dashboard', hash: '#/coordinator', defaultRatio: 50 },
  { name: 'farms', key: 'farms', hash: '#/coordinator/farms', defaultRatio: 33.3 },
  {
    // `scroll="page"`: the WINDOW scrolls and the map column is sticky. The
    // splitter has to work in that mode too, and it is the mode where a
    // mis-declared height leaves the handle with no rectangle to grab.
    name: 'volunteers',
    key: 'volunteers',
    hash: '#/coordinator/volunteers',
    defaultRatio: 62,
  },
  {
    name: 'farm-detail',
    key: 'farm-detail',
    hash: '#/coordinator/farms/farm-01',
    defaultRatio: 42,
  },
  {
    name: 'mission-wizard',
    key: 'mission-wizard',
    hash: '#/coordinator/missions/new',
    defaultRatio: 42,
    setup: async (page) => {
      const farm = page.locator('button:has-text("חוות רתם")').first()
      if (await farm.count()) await farm.click()
      await page.waitForTimeout(1500)
    },
  },
]

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  locale: 'he-IL',
  hasTouch: true,
  permissions: ['geolocation'],
  geolocation: { latitude: 31.0611, longitude: 34.6552 },
})
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
page.setDefaultNavigationTimeout(120_000)
page.setDefaultTimeout(60_000)

console.log('')
console.log(`A65 — the map/content splitter at ${WIDTH}×${HEIGHT} (iPad landscape, he-IL)`)

async function open(screen: Screen) {
  await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForSelector('select', { state: 'attached' })
  await page.selectOption('select', 'coordinator')
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('lo-yanum:map-')) localStorage.removeItem(k)
    }
  })
  await page.evaluate((h) => {
    window.location.hash = h
  }, screen.hash)
  await page.waitForTimeout(1500)
  if (screen.setup) await screen.setup(page)
  await page.waitForTimeout(2000)
}

for (const screen of SCREENS) {
  section(screen.name)
  await open(screen)

  const g0 = (await page.evaluate(geometry)) as Geom | null
  check('the seam is on screen', g0 !== null)
  if (!g0) continue

  check('cursor is col-resize', g0.cursor === 'col-resize', g0.cursor)
  check('the grip is at least 44 px tall', g0.grip.height >= 44, `${Math.round(g0.grip.height)}px`)
  check(
    'the hit area is at least 44 px across',
    g0.hit.width >= 44,
    `${Math.round(g0.hit.width)}px (strip ${Math.round(g0.handle.width)}px)`,
  )
  check(
    'it starts at the screen default',
    near(g0.ratio, screen.defaultRatio, 0.6),
    `${g0.ratio}% vs ${screen.defaultRatio}%`,
  )

  /**
   * 2 — MOUSE. The ratio is computed from the pointer's ABSOLUTE position, not
   * from a delta, so the expected value is exact: whatever share of the shell
   * is left to the right of where the handle was dropped. Asserting "the
   * content shrank by the pixels dragged" instead would be wrong on any screen
   * whose row has a `gap` between the panels — the wizard has one, and the
   * off-by-16 it produces is the layout working, not the splitter failing.
   */
  const targetOf = (g: Geom) => Math.min(70, Math.max(30, g.ratio - 8))
  const dxFor = (g: Geom, target: number) =>
    g.shell.right - (target / 100) * g.shell.width - g.handle.x

  const target1 = targetOf(g0)
  await mouseDrag(page, g0.handle, dxFor(g0, target1))
  const g1 = (await page.evaluate(geometry)) as Geom
  check(
    'a mouse drag towards the content shrinks it to where it was dropped',
    near(g1.ratio, target1, 0.6),
    `${g0.ratio}% → ${g1.ratio}% (aimed at ${target1.toFixed(1)}%)`,
  )
  check(
    'the map canvas grows live by exactly what the content lost',
    near(g1.canvas.width - g0.canvas.width, g0.content.width - g1.content.width, 8),
    `content −${Math.round(g0.content.width - g1.content.width)}px, canvas +${Math.round(
      g1.canvas.width - g0.canvas.width,
    )}px`,
  )

  // 3 — persisted, per screen, under the mode's own key space.
  const stored = await page.evaluate(
    (k) => localStorage.getItem(`lo-yanum:map-ratio:${k}`),
    screen.key,
  )
  check('the ratio is written to localStorage', stored !== null, String(stored))

  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)
  if (screen.setup) await screen.setup(page)
  await page.waitForTimeout(2000)
  const g2 = (await page.evaluate(geometry)) as Geom | null
  check(
    'it survives a reload',
    g2 !== null && near(g2.ratio, g1.ratio, 0.4),
    g2 ? `${g1.ratio}% → ${g2.ratio}%` : 'no seam',
  )
  if (!g2) continue

  // 4 — FINGER: the same gesture, the other way.
  const target2 = Math.min(70, g2.ratio + 8)
  await touchDrag(cdp, g2.handle, dxFor(g2, target2))
  await page.waitForTimeout(250)
  const g3 = (await page.evaluate(geometry)) as Geom
  check(
    'a one-finger drag the other way grows the content to where it was dropped',
    near(g3.ratio, target2, 0.8),
    `${g2.ratio}% → ${g3.ratio}% (aimed at ${target2.toFixed(1)}%)`,
  )

  // 5 — the bounds hold however hard the gesture pushes.
  await mouseDrag(page, g3.handle, 900)
  const g4 = (await page.evaluate(geometry)) as Geom
  check(
    'dragging past the end clamps the content at 25 %',
    near(g4.ratio, 25, 0.6),
    `${g4.ratio}%`,
  )
  await mouseDrag(page, g4.handle, -1200)
  const g5 = (await page.evaluate(geometry)) as Geom
  check(
    'dragging the other way clamps it at 75 %',
    near(g5.ratio, 75, 0.6),
    `${g5.ratio}%`,
  )

  // 6 — double tap is the way back.
  await tap(cdp, g5.handle.x, g5.handle.y)
  await tap(cdp, g5.handle.x, g5.handle.y)
  await page.waitForTimeout(250)
  const g6 = (await page.evaluate(geometry)) as Geom
  check(
    'a double tap on the handle restores the default',
    near(g6.ratio, screen.defaultRatio, 0.6),
    `${g6.ratio}% vs ${screen.defaultRatio}%`,
  )
  const cleared = await page.evaluate(
    (k) => localStorage.getItem(`lo-yanum:map-ratio:${k}`),
    screen.key,
  )
  check('the reset forgets the stored ratio too', cleared === null, String(cleared))
}

// The seam belongs to the SPLIT state only: hidden and full have one panel.
section('the seam exists only where there are two panels')
await open(SCREENS[1])
for (const mode of ['hidden', 'full'] as const) {
  await page.evaluate((m) => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('title') === m,
    )
    btn?.click()
  }, mode === 'hidden' ? 'מוסתר' : 'מלא')
  await page.waitForTimeout(600)
  const present = await page.evaluate(
    () => document.querySelector('[data-panel-splitter]') !== null,
  )
  check(`no seam in ${mode}`, !present)
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
