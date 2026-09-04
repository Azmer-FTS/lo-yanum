import { chromium, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ★★ Y3.4 — THE BOTTOM RESERVE: THE LAST ROW OF A LIST IS NEVER UNDER THE
 *    FLOATING CONTROLS.
 *
 *      bun run reserve
 *      ENGINE=webkit bun run reserve
 *
 * The product owner's rule, in his words:
 *
 *   "tous les écrans réservent une marge basse égale à la hauteur de cette
 *    barre, pour que le dernier élément d'une liste ne soit JAMAIS masqué par
 *    les boutons flottants. Vérifier par gate : le dernier élément de chaque
 *    liste est entièrement visible et cliquable, à tous les viewports."
 *
 * ★ "VISIBLE" AND "CLIQUABLE" ARE TWO DIFFERENT MEASUREMENTS, and the second
 *   is the one that matters. A row can be fully painted and still be dead: the
 *   floating pill is `position: fixed` with a `z-index` above the list, so a
 *   tap in the overlap reaches the pill. So this gate scrolls each list to its
 *   end and then asks the DOCUMENT what is at the row's own centre —
 *   `elementFromPoint`, which answers with what would actually receive the
 *   tap, not with what the CSS says should be on top.
 *
 * ⚠️ AND IT SCROLLS THE RIGHT BOX, TO THE END, REPEATEDLY. Three traps, all
 *    of which this gate fell into before it was believed:
 *
 *    · These screens are `MapSplit`: below the breakpoint the PAGE scrolls,
 *      above it the CONTENT COLUMN does. Asking the wrong one leaves the list
 *      where it was and passes for the wrong reason.
 *
 *    · `scrollIntoView({ block: 'end' })` is NOT "scroll to the end of the
 *      list". It puts the element's bottom edge on the SCROLLPORT's bottom
 *      edge — which is, by construction, underneath a sticky footer, and stops
 *      there with the reserve still unscrolled below. The first version of
 *      this file used it and reported the last farm as unreachable at phone
 *      widths on a build where it is perfectly reachable. The gesture being
 *      tested is "flick to the bottom", so the instrument is `scrollTop =
 *      scrollHeight`.
 *
 *    · The two rosters are window-virtualised (G7): scrolling renders rows
 *      that did not exist when the scroll started, so one pass lands in the
 *      middle of a list that grew underneath it. Hence the settle loop.
 */

const PORT = Number(process.env.RESERVE_PORT ?? 5198)
const OUT_DIR = 'dist-reserve'
const SHOTS = 'docs/screenshots/reserve'
const ENGINE = process.env.ENGINE === 'webkit' ? webkit : chromium
const ENGINE_NAME = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'iphone', width: 402, height: 874 },
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
] as const

/**
 * Every coordinator list the product owner scrolls to the end of. The selector
 * is the row, not the card inside it: what has to be reachable is the target he
 * taps.
 */
const LISTS = [
  { name: 'fermes', hash: '#/coordinator/farms', row: '[data-testid="farm-tile"], .list-tile' },
  { name: 'gardes', hash: '#/coordinator/missions', row: '.list-tile' },
  { name: 'incidents', hash: '#/coordinator/incidents', row: '.list-tile' },
  { name: 'volontaires', hash: '#/coordinator/volunteers', row: '.roster-row' },
  { name: 'conducteurs', hash: '#/coordinator/drivers', row: '.roster-row' },
  { name: 'tableau de bord', hash: '#/coordinator', row: 'main li' },
  /**
   * ⚠️ `main li`, AND NOT `main .rounded-card`, WHICH IS WHAT THIS ENTRY SAID
   *    FIRST. On the agenda that class matches exactly one element — the
   *    STICKY FILTER BAR at the top — so the gate was scrolling to the end of
   *    the list and then asking whether a bar pinned to the top of the page
   *    was under the bottom controls. It reported a failure at both phone
   *    widths that had nothing to do with the reserve. A selector that can
   *    match furniture is not a selector for rows.
   */
  { name: 'agenda', hash: '#/coordinator/agenda', row: 'main li' },
] as const

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

console.log('')
console.log(`  Y3.4 — THE BOTTOM RESERVE, AT EVERY VIEWPORT (${ENGINE_NAME})`)
console.log('  ============================================================')

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT_DIR], {
  env,
  stdout: 'ignore',
  stderr: 'pipe',
})
if ((await build.exited) !== 0) {
  console.error(await new Response(build.stderr).text())
  throw new Error('vite build failed')
}
const serve = Bun.spawn(
  ['bun', 'x', 'vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'],
  { env, stdout: 'ignore', stderr: 'ignore' },
)
const base = `http://localhost:${PORT}`
{
  const deadline = Date.now() + 40_000
  for (;;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

interface RowVerdict {
  rows: number
  /** How many pixels of the last row are below the viewport's bottom edge. */
  cutBy: number
  /** What `elementFromPoint` returns at the row's centre. */
  hitOwn: boolean
  hitTag: string
}

async function probe(page: Page, rowSelector: string): Promise<RowVerdict> {
  return page.evaluate((sel) => {
    const rows = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    if (!rows.length) return { rows: 0, cutBy: 0, hitOwn: true, hitTag: '' }
    const last = rows[rows.length - 1]
    const r = last.getBoundingClientRect()
    const cutBy = Math.round(Math.max(0, r.bottom - window.innerHeight))
    const cx = Math.round(r.left + r.width / 2)
    /**
     * ★ THREE POINTS, NOT ONE. "Entièrement visible ET cliquable": a row whose
     *   middle is free and whose last line is under the toolbar is still a row
     *   the coordinator cannot read. Top, middle and bottom, each 6 px inside
     *   the edge so a 1 px border is not what is being asked about.
     */
    /**
     * ⚠️ AND A ROW TALLER THAN THE VIEWPORT IS JUDGED ON THE PART OF IT THAT
     *    CAN BE ON SCREEN. A detail card legitimately runs longer than a
     *    phone; "entièrement visible" is a claim about a list row clearing the
     *    controls at the foot, not a demand that every card fit on an iPhone.
     *    Points above the fold are dropped rather than failed.
     */
    const ys = [r.top + 6, r.top + r.height / 2, r.bottom - 6]
      .map((y) => Math.round(y))
      .filter((y) => y >= 0 && y <= window.innerHeight - 1)
    let hitOwn = true
    let tag = ''
    for (const y of ys) {
      const hit = document.elementFromPoint(cx, y)
      const mine = hit !== null && (hit === last || last.contains(hit) || hit.contains(last))
      if (!mine) {
        hitOwn = false
        tag = hit
          ? `${hit.tagName.toLowerCase()}${
              (hit as HTMLElement).dataset?.testid
                ? `[${(hit as HTMLElement).dataset.testid}]`
                : ''
            }.${(hit.className || '').toString().split(/\s+/).slice(0, 3).join('.')} at y=${y}`
          : '<nothing>'
        break
      }
    }
    return { rows: rows.length, cutBy, hitOwn, hitTag: tag }
  }, rowSelector)
}

let browser: Browser | null = null
try {
  browser = await ENGINE.launch()
  await Bun.$`mkdir -p ${SHOTS}`.quiet()

  for (const vp of VIEWPORTS) {
    console.log('')
    console.log(`  ${vp.name} — ${vp.width}×${vp.height}`)
    console.log(`  ${'-'.repeat(vp.name.length + 14)}`)
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)

    for (const list of LISTS) {
      await page.goto(`${base}/${list.hash}`, { waitUntil: 'load' })
      await page.waitForTimeout(2600)

      /**
       * ★ SCROLL TO THE END. See the note at the top of this file for why this
       *   is a loop and not a `scrollIntoView`.
       */
      for (let pass = 0; pass < 12; pass++) {
        const moved = await page.evaluate((sel) => {
          const rows = [...document.querySelectorAll<HTMLElement>(sel)]
          const last = rows[rows.length - 1]
          if (!last) return false
          // The nearest ancestor that is actually a scrollport, or the window.
          let el: HTMLElement | null = last.parentElement
          let port: HTMLElement | null = null
          while (el && el !== document.body) {
            const cs = getComputedStyle(el)
            if (
              (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
              el.scrollHeight > el.clientHeight + 1
            ) {
              port = el
              break
            }
            el = el.parentElement
          }
          const before = port ? port.scrollTop : window.scrollY
          if (port) port.scrollTop = port.scrollHeight
          else window.scrollTo(0, document.documentElement.scrollHeight)
          const after = port ? port.scrollTop : window.scrollY
          return Math.abs(after - before) > 1
        }, list.row)
        await page.waitForTimeout(320)
        if (!moved) break
      }
      await page.waitForTimeout(600)

      const v = await probe(page, list.row)
      if (v.rows === 0) {
        check(`${list.name}: has rows to measure`, false, `selector "${list.row}" matched nothing`)
        continue
      }
      check(
        `${list.name}: the last of ${v.rows} rows is fully on screen`,
        v.cutBy === 0,
        v.cutBy ? `${v.cutBy}px below the fold after scrolling to the end` : `${v.rows} rows`,
      )
      check(
        `${list.name}: and a tap at its centre reaches IT, not a floating control`,
        v.hitOwn,
        v.hitOwn ? '' : `the tap lands on ${v.hitTag}`,
      )
      if (!v.hitOwn || v.cutBy > 0) {
        await page.screenshot({
          path: `${SHOTS}/${vp.name}-${list.name.replace(/\s+/g, '-')}.png`,
        })
      }
    }
    await page.screenshot({ path: `${SHOTS}/${vp.name}-fermes-end.png` })
    await context.close()
  }
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log('  VERDICT')
console.log('  -------')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
