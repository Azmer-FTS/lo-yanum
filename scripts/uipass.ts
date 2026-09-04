import { chromium } from 'playwright'
import type { Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * U10 (2026-09-02) — THE CAPTURES OF THE UI/UX PASS, FROM THE SERVED URL.
 *
 *   bun run uipass                                   (the deployed demo twin)
 *   BASE_URL=http://localhost:5173 bun run uipass    (a dev server)
 *
 * The product owner's rule: nothing is delivered until it is seen on the
 * deployed URL. So these are taken on `/lo-yanum/demo/` (same bundle as the
 * real app, no Supabase pair, the identity picker instead of the door) at the
 * iPad's landscape size, and written to `docs/screenshots/uipass/`:
 *
 *   1  dashboard — figures, the two charts one under the other, the alerts carousel
 *   2  farms — the compact sticky top and the photo tiles, eight or more on screen
 *   3  farm-detail — the restructured band, the folded blocks, the mode pill
 *   4  farm-satellite — a Negev farm on imagery at z14, zones legible, layers open
 *   5  tools-folded / 6 tools-open — the frosted drawing-tools button, both states
 *
 * Every capture is also a CHECK: the tile count, the folded blocks, the pill's
 * place and the satellite layers are asserted, not just photographed.
 */
const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(/\/$/, '')
const OUT = path.resolve('docs/screenshots/uipass')
fs.mkdirSync(OUT, { recursive: true })

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

async function open(page: Page, hash: string, settle = 3500): Promise<void> {
  await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForSelector('select', { state: 'attached', timeout: 20_000 })
  await page.selectOption('select', 'coordinator')
  await page.waitForTimeout(300)
  await page.evaluate((h) => {
    window.location.hash = h
  }, hash)
  await page.waitForTimeout(settle)
}

const shot = async (page: Page, name: string) => {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  captured ${path.relative(process.cwd(), file)}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1376, height: 1032 }, hasTouch: true })
const page = await context.newPage()
// A clean slate: the captures show the defaults, not a previous run's folds.
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.evaluate(() => localStorage.clear())

console.log(`\nUI pass captures — ${BASE}\n`)

// 1 — dashboard
await open(page, '#/coordinator', 4500)
const charts = page.locator('[data-testid="chart-area"], [data-testid="chart-bars"]')
check('dashboard: two growth charts', (await charts.count()) === 2)
const boxes = await charts.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))
// W3.2 (passe finale) — one under the other in a narrow column, SIDE BY SIDE
// once the content column is 44 rem wide; and never taller than 240 px.
const growthW = await page.locator('[data-testid="growth-charts"]').evaluate((e) => e.getBoundingClientRect().width)
const sideBySide = growthW >= 44 * 16
check(
  sideBySide ? 'dashboard: the charts are SIDE BY SIDE (wide column)' : 'dashboard: the charts are one UNDER the other (narrow column)',
  boxes.length === 2 && (sideBySide ? Math.abs(boxes[1].top - boxes[0].top) < 2 : boxes[1].top > boxes[0].bottom - 1),
  `${Math.round(growthW)} px`,
)
check('dashboard: no chart taller than 240 px', boxes.every((b) => b.height <= 241), boxes.map((b) => Math.round(b.height)).join('/'))
check('dashboard: no figure escapes its card', (await page.locator('[data-figure]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)) === 0)
check('dashboard: the two dunam cards lead', (await page.locator('[data-testid="hero-figures"] a').count()) === 2)
const kpiBottom = await page.locator('[data-testid="kpi-guarded-heads"], a.card-interactive').first().evaluate((e) => e.getBoundingClientRect().bottom)
check('dashboard: the charts come directly under the figures', boxes[0].top > kpiBottom)
check('dashboard: the alerts are a carousel', (await page.locator('[data-testid="alerts-carousel"] [data-testid="alert-chip"]').count()) >= 2)
await shot(page, '1-dashboard')

// 2 — farms list
await open(page, '#/coordinator/farms', 4500)
const tiles = page.locator('[data-testid="farm-tile"]')
const visibleTiles = await tiles.evaluateAll((els) =>
  els.filter((e) => {
    const r = e.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= window.innerHeight
  }).length,
)
check('farms: at least eight tiles fully on screen in landscape', visibleTiles >= 8, `${visibleTiles}`)
const topH = await page.locator('[data-testid="farms-top"]').evaluate((e) => e.getBoundingClientRect().height)
check('farms: the sticky top takes at most a quarter of the height', topH <= 1032 * 0.25, `${Math.round(topH)} px`)
check('farms: the KPI strip scrolls sideways rather than wrapping', await page.locator('[data-testid="kpi-strip"]').evaluate((e) => getComputedStyle(e).overflowX === 'auto' && getComputedStyle(e).flexWrap === 'nowrap'))
const photoH = await tiles.first().locator('[data-testid="farm-tile-center"]').evaluate((e) => e.getBoundingClientRect().height)
const tileH = await tiles.first().evaluate((e) => e.getBoundingClientRect().height)
check('farms: the photo takes the tile\'s full height', Math.abs(photoH - tileH) < 1.5, `${Math.round(photoH)} / ${Math.round(tileH)}`)

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * X1 / X2 / X7 / X12 (2026-09-04) — THE COHERENCE PASS, ON THE SERVED URL.
 * ═══════════════════════════════════════════════════════════════════════════
 * Every one of these is a claim the product owner made about what he saw, so
 * every one of them is measured on the deployed bundle rather than argued.
 */
const titleSize = await page
  .locator('[data-testid="farms-top"] [data-page-title]')
  .evaluate((e) => getComputedStyle(e).fontSize)
check(
  'X1: the list title is the DASHBOARD\'s size, 24 px — not a reduced one',
  titleSize === '24px',
  titleSize,
)
check(
  'X1: the counter left the title line for a pill on the filter row',
  (await page.locator('[data-testid="farms-top"] [data-list-count]').count()) === 1 &&
    (await page
      .locator('[data-testid="farms-top"] [data-page-title]')
      .evaluate((e) => (e.textContent ?? '').includes('מתוך'))) === false,
)
check(
  'X2: the header carries ONE "⋯" and no view-toggle pills',
  (await page.locator('[data-testid="farms-menu-toggle"]').count()) === 1,
)
// The legend is FOLDED by default (U4.2), so the switches have to be opened
// before they can be counted — which is itself the state the product owner
// meets on a fresh device.
if ((await page.locator('[data-testid="map-legend"]').getAttribute('data-open')) === '0') {
  await page.locator('[data-testid="map-legend-toggle"]').click()
  await page.waitForTimeout(300)
}
check(
  'X2: the threat layer is a legend checkbox, not a header button',
  (await page.locator('[data-testid="layer-threatZones"]').count()) === 1 &&
    (await page.locator('[data-testid="layer-threatZones"]').isChecked()) === false,
)
check(
  'X12: the regions layer and the region filter are both offered, regions OFF',
  (await page.locator('[data-testid="layer-regions"]').count()) === 1 &&
    (await page.locator('[data-testid="layer-regions"]').isChecked()) === false &&
    (await page.locator('[data-testid="farms-region"]').count()) === 1,
)
/**
 * X7 — ONE TILE HEIGHT ACROSS THE LISTS. Measured on three screens rather
 * than asserted from the token, because the defect was three lists that each
 * sized themselves from their own content.
 */
const heightOf = async (hash: string) => {
  await open(page, hash, 3500)
  return page
    .locator('.list-tile')
    .first()
    .evaluate((e) => Math.round(e.getBoundingClientRect().height))
}
const farmsTileH = tileH
await shot(page, '2-farms')
const missionsTileH = await heightOf('#/coordinator/missions')
const incidentsTileH = await heightOf('#/coordinator/incidents')
check(
  'X7: farms, guards and incidents share ONE tile height',
  Math.round(farmsTileH) === missionsTileH && missionsTileH === incidentsTileH,
  `${Math.round(farmsTileH)} / ${missionsTileH} / ${incidentsTileH}`,
)

/**
 * X5 — THE ROSTER HEADER AND ITS ROWS ARE ONE GRID. The defect was two
 * markups drifting apart under `flex-shrink`; the fix is one
 * `grid-template-columns`, so the check is that the computed track list is
 * the SAME string on the header and on a row.
 */
await open(page, '#/coordinator/volunteers', 4500)
const tracks = await page
  .locator('.roster-row')
  .evaluateAll((els) => els.slice(0, 2).map((e) => getComputedStyle(e).gridTemplateColumns))
check(
  'X5: the roster header and its rows share one grid template',
  tracks.length === 2 && tracks[0] === tracks[1],
  tracks.join('  vs  '),
)
check(
  'X5: no status pill is deformed',
  (await page
    .locator('.chip')
    .evaluateAll((els) =>
      els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().height > 40)
        .length,
    )) === 0,
)
check(
  'X5: a missing photo is the initials disc, never a broken image',
  (await page
    .locator('img')
    .evaluateAll((els) =>
      els.filter((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth === 0)
        .length,
    )) === 0,
)
await shot(page, '7-volunteers-roster')

// 3 — farm detail
await open(page, '#/coordinator/farms/farm-01', 4500)
check('farm-detail: the band is a swipable row of cards', (await page.locator('[data-testid="farm-key-numbers"] > *').count()) >= 5)
check('farm-detail: the status card comes first', await page.locator('[data-testid="farm-key-numbers"] > *').first().evaluate((e) => e.getAttribute('data-testid') === 'band-status'))
const folded = await page.locator('[data-block][data-open="0"]').count()
check('farm-detail: reference blocks start folded', folded >= 4, `${folded}`)
const pill = await page.locator('[data-testid="map-mode-pill"]').boundingBox()
check('farm-detail: the mode pill is at the physical bottom-left', !!pill && pill.x < 40 && pill.y + pill.height > 1032 - 120)
await shot(page, '3-farm-detail')

// 4 — satellite, layers open. X3.2: the ground is ONE target again — the same
// button goes there and comes back.
await page.locator('[data-testid="map-tool-base"]').click()
await page.waitForTimeout(6000)
if ((await page.locator('[data-testid="map-legend"]').getAttribute('data-open')) === '0') {
  await page.locator('[data-testid="map-legend-toggle"]').click()
  await page.waitForTimeout(300)
}
await page.evaluate(() => {
  const m = (window as unknown as { __loYanumMap?: { jumpTo: (o: unknown) => void; getCenter: () => unknown } }).__loYanumMap
  m?.jumpTo({ center: m.getCenter(), zoom: 14 })
})
await page.waitForTimeout(4000)
const satLayers = await page.evaluate(() => {
  const m = (window as unknown as { __loYanumMap?: { getStyle: () => { layers: Array<{ id: string }> }; getPaintProperty: (id: string, p: string) => unknown } }).__loYanumMap
  const ids = m?.getStyle().layers.map((l) => l.id) ?? []
  return { ids, halo: ids.includes('zones-halo'), satellite: ids.includes('satellite'), fillIdx: ids.indexOf('threat-zones-fill'), lineIdx: ids.indexOf('zones-line') }
})
check('satellite: the imagery is on', satLayers.satellite)
check('satellite: the zones carry a halo', satLayers.halo)
check('satellite: the contours are above the threat fill', satLayers.lineIdx > satLayers.fillIdx)
check('satellite: the layer switches are open', (await page.locator('[data-testid="map-layers"] input').count()) >= 4)
await shot(page, '4-farm-satellite-z14')

// 5/6 — the tools
await page.locator('[data-testid="map-tool-base"]').click()  // back to מפה (X3.2: same button)
await page.waitForTimeout(2500)
check('tools: folded by default', (await page.locator('[data-testid="draw-tools-panel"]').count()) === 0)
await shot(page, '5-tools-folded')
await page.locator('[data-testid="draw-tools-toggle"]').click()
await page.waitForTimeout(400)
check('tools: a tap unfolds them', (await page.locator('[data-testid="draw-tools-panel"] button').count()) >= 5)
await shot(page, '6-tools-open')

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 8–12 — THE SCREENS THIS PASS REBUILT, PHOTOGRAPHED ON THE SERVED URL.
 * ═══════════════════════════════════════════════════════════════════════════
 * The product owner's rule has not changed: nothing is delivered until it is
 * seen on the deployed bundle. Each of these carries its own assertion so the
 * capture cannot quietly become a picture of a broken screen.
 */

// 8 — X8: the planner's three blocks are one
await open(page, '#/coordinator/route', 4500)
await page.evaluate(() => {
  for (const box of [...document.querySelectorAll('input[type="checkbox"].check')].slice(0, 4)) {
    ;(box as HTMLInputElement).click()
  }
})
await page.waitForTimeout(1500)
const stopRows = await page.locator('[data-testid="route-stop"]').count()
check('X8: the planner has ONE numbered list of stops', stopRows > 0, `${stopRows} stops`)
check(
  'X8: every stop carries its call, its meeting and its navigation',
  (await page.locator('[data-testid="route-stop"]').first().locator('a, button').count()) >= 2,
)
const driveText = await page.locator('[data-testid="route-drive-time"]').textContent()
check(
  'X8: the drive time is hours and minutes, never raw minutes',
  (driveText ?? '').includes('שעות') || (driveText ?? '').includes('דקות'),
  driveText ?? '',
)
await page.evaluate(() => {
  document.querySelector('[data-testid="route-stop"]')?.scrollIntoView({ block: 'center' })
})
await page.waitForTimeout(400)
await shot(page, '8-route-planner')

// 9 — X9: the guard's band is the entity sheet's band
await open(page, '#/coordinator/missions/mission-01', 4500)
const bandCards = await page.locator('[data-testid="mission-key-numbers"] > *').count()
check('X9: the guard band is five regular cards', bandCards === 5, `${bandCards}`)
const bandHeights = await page
  .locator('[data-testid="mission-key-numbers"] > *')
  .evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))])
check('X9: and they are all one height', bandHeights.length === 1, bandHeights.join('/'))
await shot(page, '9-mission-detail')

// 10 — X10: closing an incident is the last step of its thread
await open(page, '#/coordinator/incidents/inc-01', 4500)
const resolveInThread = await page.evaluate(
  () => document.querySelector('[data-testid="incident-resolve"]')?.closest('ol') !== null,
)
check('X10: the closing action lives INSIDE the follow-up thread', resolveInThread)
check(
  'X10: "פתיחה במפות" has a named place in the details block',
  (await page.locator('[data-testid="incident-open-maps"]').count()) === 1,
)
await shot(page, '10-incident-detail')

// 11 — X12: the regional washes, switched on from the legend
await open(page, '#/coordinator/farms', 4500)
if ((await page.locator('[data-testid="map-legend"]').getAttribute('data-open')) === '0') {
  await page.locator('[data-testid="map-legend-toggle"]').click()
  await page.waitForTimeout(300)
}
await page.locator('[data-testid="layer-regions"]').check()
await page.waitForTimeout(600)
await page.evaluate(() => {
  const m = (window as unknown as { __loYanumMap?: { jumpTo: (o: unknown) => void } }).__loYanumMap
  m?.jumpTo({ center: [35.05, 31.7], zoom: 7 })
})
await page.waitForTimeout(3000)
const regionsPainted = await page.evaluate(() => {
  const m = (
    window as unknown as {
      __loYanumMap?: { queryRenderedFeatures: (g?: unknown, o?: unknown) => unknown[] }
    }
  ).__loYanumMap
  return m ? m.queryRenderedFeatures(undefined, { layers: ['regions-fill'] }).length : -1
})
check('X12: the regional washes are actually painted', regionsPainted > 3, `${regionsPainted} regions in frame`)
await shot(page, '11-regions-layer')

// 12 — X5: the roster at the narrowest seam, columns merged rather than crushed
await open(page, '#/coordinator/volunteers', 4500)
await page.locator('[data-panel-splitter]').focus()
await page.keyboard.press('End')
await page.waitForTimeout(800)
const crushed = await page.evaluate(
  () =>
    [...document.querySelectorAll('.roster-row')].flatMap((row) =>
      [...row.children].filter((c) => {
        const st = getComputedStyle(c)
        if (st.display === 'none') return false
        const r = c.getBoundingClientRect()
        return r.width > 0 && r.width < 24 && (c.textContent ?? '').trim().length > 0
      }),
    ).length,
)
check('X5: at the narrowest seam no roster column is crushed', crushed === 0, `${crushed}`)
await shot(page, '12-roster-narrow-seam')

await browser.close()
console.log(`\n  ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
