import { chromium, webkit } from 'playwright'
import type { Browser, BrowserType, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * X13 (2026-09-04) — THE SEAM STILL MOVES AFTER TWO HUNDRED DRAGS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ WHAT THE PRODUCT OWNER REPORTED. After a long session on his iPad the
 *   splitter stops answering: it cannot be dragged, and only closing and
 *   reopening the installed app brings it back.
 *
 * ★ WHAT IT ACTUALLY WAS (see the long note in `ui/components/splitter.tsx`).
 *   Not a listener that is never removed — a COST paid on every pointermove.
 *   `setRatio` wrote React state AND `localStorage` synchronously at the
 *   pointer's own rate: measured here, a forty-move drag was FORTY blocking
 *   storage writes, each one followed by a React commit of the whole
 *   map-first shell. Early in a session that is jank; on a device that has
 *   been running all day it saturates the main thread and the pointer stream
 *   backs up behind it, which is what "it stops answering" looks like.
 *
 *   ⚠️ The first version of this note blamed marker churn as well, and that
 *      was wrong: a screen's `markers` array is memoised on its own data, so
 *      a ratio change does NOT rebuild the pins. Measured, not assumed — the
 *      check that assumed it passed on the broken build too, which is how the
 *      wrong explanation was caught.
 *
 * ★ WHAT THIS GATE ASSERTS, and why each one is here rather than "it feels
 *   fine now":
 *
 *     1. AFTER 200 CYCLES THE SEAM STILL MOVES. The plain regression: drag it
 *        two hundred times and then drag it once more, and the ratio changes.
 *        That is the product owner's symptom, restated as a measurement.
 *     2. THE LAST TEN CYCLES ARE NOT SLOWER THAN THE FIRST TEN. A control
 *        that still works but takes a second to answer is the same defect one
 *        step earlier; a hard ratio (3×) catches degradation without failing
 *        on ordinary variance.
 *     3. THE DOM DOES NOT GROW. Node count before and after: a leak that
 *        accumulates DOM — marker elements that outlive their map, a menu that
 *        is never unmounted — shows up here whatever its cause.
 *     4. NO DRAG STATE SURVIVES ITS GESTURE. After the last pointerup the
 *        document must have no captured pointer left; a stuck capture is the
 *        other way this control dies, and it is invisible until the next
 *        gesture is swallowed.
 *     5. AND A DRAG WRITES TO STORAGE ONCE. This is the defect itself,
 *        measured: `Storage.prototype.setItem` is shadowed and the ratio key's
 *        writes are counted across one forty-move drag. Forty before, one
 *        now. It is the check that actually fails on the old build.
 *
 * Run against a live server:
 *   BASE_URL=http://localhost:5173 bun run seam
 *   ENGINE=webkit BASE_URL=http://localhost:5173 bun run seam
 */

const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const ENGINE = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'
const CYCLES = Number(process.env.CYCLES ?? 200)

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

/** The seam's live position, read from the DOM rather than from storage. */
async function contentWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-map-content]')
    return el ? Math.round(el.getBoundingClientRect().width) : -1
  })
}

/** One drag of the handle by `dx` pixels, in `steps` pointer moves. */
async function drag(page: Page, dx: number, steps = 6): Promise<void> {
  const handle = page.locator('[data-panel-splitter]')
  const box = await handle.boundingBox()
  if (!box) throw new Error('no splitter on screen')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y)
  }
  await page.mouse.up()
}

const engine: BrowserType = ENGINE === 'webkit' ? webkit : chromium

console.log('')
console.log('  X13 — THE SEAM AFTER A LONG SESSION')
console.log('  ===================================')
console.log(`  base:   ${BASE}`)
console.log(`  engine: ${ENGINE}`)
console.log(`  cycles: ${CYCLES}`)
console.log('')

let browser: Browser | null = null
try {
  browser = await engine.launch()
  const context = await browser.newContext({
    viewport: { width: 1376, height: 1032 },
    locale: 'he-IL',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)

  await page.goto(`${BASE}/#/coordinator/farms`, { waitUntil: 'load' })
  await page.waitForSelector('[data-panel-splitter]', { timeout: 20_000 })
  // The map's pins are what a re-render would rebuild, so they have to exist
  // before anything is counted.
  await page.waitForTimeout(4000)

  const before = {
    width: await contentWidth(page),
    nodes: await page.evaluate(() => document.getElementsByTagName('*').length),
  }
  check('the seam is on screen and has a width', before.width > 0, `${before.width}px`)

  /**
   * ★★ 5 — A DRAG WRITES TO STORAGE ONCE, NOT ONCE PER FRAME.
   *
   * This is the defect itself, measured. `localStorage.setItem` is
   * SYNCHRONOUS: it blocks the main thread, and `useMapRatio` called it from
   * inside the pointermove handler, so a drag was one blocking write per
   * pointer sample — a hundred and twenty a second on the product owner's
   * iPad, each one dragging a React commit of the whole map-first shell
   * behind it. Forty moves used to mean forty writes; it means one now, on
   * pointerup.
   *
   * The counter is installed by shadowing `setItem` on the prototype, so it
   * sees the app's own calls without the app knowing.
   */
  await page.evaluate(() => {
    const w = window as unknown as { __seamWrites?: number }
    w.__seamWrites = 0
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = function patched(key: string, value: string) {
      if (key.startsWith('lo-yanum:map-ratio')) w.__seamWrites = (w.__seamWrites ?? 0) + 1
      return real.call(this, key, value)
    }
  })
  await drag(page, -120, 40)
  await page.waitForTimeout(300)
  const writes = await page.evaluate(
    () => (window as unknown as { __seamWrites?: number }).__seamWrites ?? -1,
  )
  check(
    '★★ a 40-move drag writes the ratio to storage ONCE, not once per move',
    writes >= 0 && writes <= 2,
    `${writes} synchronous storage writes during one drag`,
  )

  // --- the 200 cycles -------------------------------------------------------
  const timings: number[] = []
  for (let i = 0; i < CYCLES; i++) {
    const t0 = Date.now()
    await drag(page, i % 2 === 0 ? -60 : 60, 6)
    timings.push(Date.now() - t0)
  }

  const first10 = timings.slice(0, 10).reduce((a, b) => a + b, 0) / 10
  const last10 = timings.slice(-10).reduce((a, b) => a + b, 0) / 10
  check(
    `★ ${CYCLES} cycles do not slow the handle down`,
    last10 <= Math.max(first10 * 3, first10 + 120),
    `first 10 avg ${first10.toFixed(0)}ms, last 10 avg ${last10.toFixed(0)}ms`,
  )

  // 1 — and it still moves.
  const settled = await contentWidth(page)
  await drag(page, -140, 8)
  await page.waitForTimeout(300)
  const moved = await contentWidth(page)
  check(
    `★★ after ${CYCLES} cycles the seam STILL MOVES`,
    Math.abs(moved - settled) > 20,
    `${settled}px → ${moved}px`,
  )

  // 3 — nothing accumulated.
  const nodesAfter = await page.evaluate(
    () => document.getElementsByTagName('*').length,
  )
  check(
    '★ the DOM did not grow across the session',
    nodesAfter <= before.nodes * 1.15 + 50,
    `${before.nodes} → ${nodesAfter} nodes`,
  )

  // 4 — no gesture left half-finished.
  const stuck = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-panel-splitter]')
    if (!el) return 'no splitter'
    // `hasPointerCapture` needs an id; ids are small integers in practice, so
    // sweeping the first few is enough to catch a capture nobody released.
    for (let id = 0; id < 32; id++) {
      if (el.hasPointerCapture(id)) return `pointer ${id} still captured`
    }
    return ''
  })
  check('★ no pointer capture outlived its gesture', stuck === '', stuck)

  // And the keyboard path, which is the other half of the control.
  await page.locator('[data-panel-splitter]').focus()
  const beforeKeys = await contentWidth(page)
  await page.keyboard.press('End')
  await page.waitForTimeout(250)
  const afterKeys = await contentWidth(page)
  check(
    'the keyboard still drives it too',
    Math.abs(afterKeys - beforeKeys) > 10,
    `${beforeKeys}px → ${afterKeys}px`,
  )

  await page.screenshot({ path: 'docs/screenshots/seam-after-200.png' })
} finally {
  await browser?.close()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
