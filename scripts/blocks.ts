import { chromium } from 'playwright'
import type { Page } from 'playwright'

/**
 * A91 — THE FOLDS ARE REMEMBERED, PER KIND, GLOBALLY (U1.2), THE MAP'S
 * LEGEND AND LAYERS TOO (U4.2 / U4.3), AND THE MODE PILL NEVER MOVES (U4.4).
 *
 *   BASE_URL=http://localhost:5173 bun run blocks
 *
 * The product owner's rule for U1, verbatim: fold "שכבת איומים" on one farm
 * and it is folded on EVERY farm, and it stays folded tomorrow. So this
 * drives the real app: fold a block on farm-01, open farm-02 and read it
 * folded; reload and read it still folded; unfold it on farm-02 and read it
 * open on farm-01. The same three claims for the legend's fold and for a
 * layer checkbox — and for the layer, that the polygon actually LEAVES the
 * map (the GeoJSON source's feature count drops) and comes back. Finally
 * the mode pill: present, fixed, at the physical bottom-left, in all three
 * modes, at the same coordinates.
 *
 * Needs a dev server (demo mode). 24 checks.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:5173'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

async function open(page: Page, hash: string, settle = 2500): Promise<void> {
  await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForSelector('select', { state: 'attached' })
  await page.selectOption('select', 'coordinator')
  await page.waitForTimeout(300)
  await page.evaluate((h) => {
    window.location.hash = h
  }, hash)
  await page.waitForTimeout(settle)
}

const blockOpen = (page: Page, key: string) =>
  page.evaluate(
    (k) => document.querySelector(`[data-block="${k}"]`)?.getAttribute('data-open'),
    key,
  )

const zoneFeatures = (page: Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getSource: (id: string) => { _data?: { features: unknown[] } } | undefined } }).__loYanumMap
    return m?.getSource('zones')?._data?.features.length ?? -1
  })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1376, height: 1032 }, hasTouch: true })
const page = await context.newPage()

console.log('\nA91 — folds, legend, layers and the mode pill\n')

// --- 1. A block folded on one farm is folded on every farm, and tomorrow ---
await open(page, '#/coordinator/farms/farm-01')
check('farm-01: the threats block starts folded (smart default)', (await blockOpen(page, 'entity-threats')) === '0')
check('farm-01: the posts block starts open (essential)', (await blockOpen(page, 'entity-posts')) === '1')

await page.locator('[data-testid="block-entity-posts"]').click()
await page.waitForTimeout(200)
check('farm-01: a tap folds the posts block', (await blockOpen(page, 'entity-posts')) === '0')
const summary = await page.locator('[data-block="entity-posts"] [data-block-summary]').textContent()
check('farm-01: the folded block shows a one-line summary', /עמד/.test(summary ?? ''), summary ?? '')

await open(page, '#/coordinator/farms/farm-02')
check('farm-02: the posts block is folded too — memory is per KIND, not per record', (await blockOpen(page, 'entity-posts')) === '0')

await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(2500)
check('farm-02 after reload: still folded — localStorage, not the session', (await blockOpen(page, 'entity-posts')) === '0')

await page.locator('[data-testid="block-entity-posts"]').click()
await page.waitForTimeout(200)
await open(page, '#/coordinator/farms/farm-01')
check('farm-01: unfolded on farm-02, open again here', (await blockOpen(page, 'entity-posts')) === '1')

// --- 2. The legend folds and remembers -------------------------------------
const legend = page.locator('[data-testid="map-legend"]')
check('farm-01: the map legend exists', (await legend.count()) === 1)
const legendOpen0 = await legend.getAttribute('data-open')
await page.locator('[data-testid="map-legend-toggle"]').click()
await page.waitForTimeout(200)
const legendOpen1 = await legend.getAttribute('data-open')
check('the legend toggles', legendOpen0 !== legendOpen1, `${legendOpen0} → ${legendOpen1}`)
await open(page, '#/coordinator/farms')
check('farms map: the legend state followed (global memory)', (await page.locator('[data-testid="map-legend"]').getAttribute('data-open')) === legendOpen1)
if (legendOpen1 === '0') {
  await page.locator('[data-testid="map-legend-toggle"]').click()
  await page.waitForTimeout(200)
}

// --- 3. A layer switch removes the polygons from the map, and is remembered -
await open(page, '#/coordinator/farms/farm-01', 3500)
if ((await page.locator('[data-testid="map-legend"]').getAttribute('data-open')) === '0') {
  await page.locator('[data-testid="map-legend-toggle"]').click()
  await page.waitForTimeout(200)
}
const before = await zoneFeatures(page)
check('farm-01: the zones source holds the farm\'s polygons', before >= 2, `${before}`)
const grazing = page.locator('[data-testid="layer-grazing"]')
check('the legend offers the grazing switch', (await grazing.count()) === 1)
await grazing.uncheck()
await page.waitForTimeout(400)
const after = await zoneFeatures(page)
check('unchecking שטחי מרעה removes the grazing polygon from the map', after === before - 1, `${before} → ${after}`)

await open(page, '#/coordinator/farms', 3500)
const farmsGrazing = page.locator('[data-testid="layer-grazing"]')
check('farms map: the grazing switch is off there too (one set for every map)', (await farmsGrazing.isChecked()) === false)
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(3500)
check('farms map after reload: still off', (await page.locator('[data-testid="layer-grazing"]').isChecked()) === false)
await page.locator('[data-testid="layer-grazing"]').check()
await page.waitForTimeout(300)
await open(page, '#/coordinator/farms/farm-01', 3500)
check('farm-01: the grazing polygon is back', (await zoneFeatures(page)) === before, `${await zoneFeatures(page)}`)

// --- 4. The mode pill: same place in every mode ----------------------------
const pill = page.locator('[data-testid="map-mode-pill"]')
check('the mode pill exists', (await pill.count()) === 1)
const rects: Record<string, { x: number; y: number; w: number; h: number }> = {}
for (const mode of ['full', 'hidden', 'split'] as const) {
  await page.locator(`[data-testid="map-mode-${mode}"]`).click()
  await page.waitForTimeout(500)
  const r = await pill.boundingBox()
  rects[mode] = r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : { x: -1, y: -1, w: 0, h: 0 }
  /**
   * ★★ Y3.3 (2026-09-04) — "AT THE PHYSICAL BOTTOM-LEFT" WAS `x < 40`, and the
   *    product owner has since asked for the three buttons to lie DOWN beside
   *    the "+" rather than stand above it. So the pill starts one rail past
   *    the "+"'s far edge and the old assertion is describing the layout he
   *    rejected. What U4.4 was actually protecting — "he never has to look for
   *    it after a switch" — is the check below this loop, that the box is
   *    identical in all three modes; what this line keeps is that it is still
   *    in the BOTTOM BAND rather than anywhere else. Its exact geometry beside
   *    the "+" is `bun run overlap`'s business, measured to the pixel there.
   */
  check(`mode ${mode}: the pill is in the bottom band`, rects[mode].x < 260 && rects[mode].y + rects[mode].h > 1032 - 140, JSON.stringify(rects[mode]))
}
check('the pill is at the SAME coordinates in all three modes', JSON.stringify(rects.full) === JSON.stringify(rects.hidden) && JSON.stringify(rects.hidden) === JSON.stringify(rects.split))
const fixed = await pill.evaluate((el) => getComputedStyle(el).position)
check('the pill is fixed to the viewport', fixed === 'fixed', fixed)
const buttons = await pill.locator('button').evaluateAll((els) => els.map((b) => b.getBoundingClientRect()).every((r) => r.width >= 43.5 && r.height >= 43.5))
check('every pill button is at least 44 px', buttons)

// --- 5. The drawing tools fold away ----------------------------------------
const toggle = page.locator('[data-testid="draw-tools-toggle"]')
check('farm-01: the drawing tools are one button', (await toggle.count()) === 1 && (await page.locator('[data-testid="draw-tools-panel"]').count()) === 0)
await toggle.click()
await page.waitForTimeout(300)
check('a tap unfolds the tools', (await page.locator('[data-testid="draw-tools-panel"] button').count()) >= 5)
await page.mouse.click(300, 300)
await page.waitForTimeout(300)
check('a tap elsewhere folds them', (await page.locator('[data-testid="draw-tools-panel"]').count()) === 0)

// --- 4. ★★ Y11 — EVERY TITLED CONTENT BLOCK HAS A CHEVRON AND A MEMORY -----
//
// The product owner: "Le PO constate que tous les blocs ne sont pas repliables.
// Audit complet : chaque bloc de contenu de chaque écran doit avoir son chevron
// et sa mémoire globale par type (règle X1 déjà spécifiée)."
//
// U1 built the mechanism and eleven of the app's seventy-four blocks used it.
// The audit below is what stops that drifting again: it visits every screen
// that shows content blocks — including the three ROLE screens, which had none
// at all — and asks each `<Section>` whether it is foldable.
//
// ⚠️ A WIZARD STEP IS NOT A CONTENT BLOCK, and this is the one exclusion.
//    "מתי", "נקודת מוצא", "רשימה קצרה" are the STEPS of a form the coordinator
//    is filling in, sequenced by the wizard's own stepper; a chevron on a step
//    he is being walked through is a second navigation for the same thing, and
//    folding the step he is typing into would hide his own input. The import
//    wizard is the same shape.
const BLOCK_SCREENS: Array<{ name: string; hash: string; session?: string }> = [
  { name: 'לוח בקרה', hash: '#/coordinator' },
  { name: 'כרטיס חווה', hash: '#/coordinator/farms/farm-01' },
  { name: 'כרטיס שמירה', hash: '#/coordinator/missions/mission-01' },
  { name: 'כרטיס אירוע', hash: '#/coordinator/incidents/inc-01' },
  { name: 'עמדה', hash: '#/coordinator/farms/farm-01/anchors/anchor-01' },
  { name: 'הגדרות', hash: '#/coordinator/settings' },
  { name: 'חקלאי — הלילה', hash: '#/farmer', session: 'farmer:contact-01a' },
  { name: 'חקלאי — שמירות', hash: '#/farmer/guards', session: 'farmer:contact-01a' },
  { name: 'מתנדב — שמירה', hash: '#/volunteer', session: 'volunteer:vol-001' },
  { name: 'נהג — נסיעה', hash: '#/driver', session: 'driver:drv-03' },
]

console.log('')
console.log('  Y11 — every titled content block folds, and remembers')
console.log('  -----------------------------------------------------')

const treated: string[] = []
for (const screen of BLOCK_SCREENS) {
  /**
   * ⚠️ THE IDENTITY IS PICKED THE WAY THE DEMO PICKS IT — the toolbar's
   *    `<select>` — rather than by writing a storage key this file guesses the
   *    name of. Same door `bun run layout` uses for the role screens.
   */
  await open(page, '#/coordinator', 300)
  if (screen.session) {
    await page.selectOption('select', screen.session)
    await page.waitForTimeout(400)
  }
  await page.evaluate((h) => {
    window.location.hash = h
  }, screen.hash)
  await page.waitForTimeout(2800)

  const blocks = await page.evaluate(() =>
    [...document.querySelectorAll('section')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return false
        // A block is one that HAS a heading; a bare `<Section>` used as a
        // spacing wrapper has nothing to hang a chevron on.
        return el.querySelector(':scope > div > button[aria-expanded], :scope > div > h2, :scope > div > p, :scope > div > span') !== null
      })
      .map((el) => ({
        key: el.getAttribute('data-block'),
        foldable: el.hasAttribute('data-open'),
        title: (el.querySelector('button[aria-expanded] span, h2, :scope > div span') ?? el)
          .textContent?.replace(/\s+/g, ' ')
          .trim()
          .slice(0, 28),
      })),
  )
  const bare = blocks.filter((b) => !b.foldable)
  check(
    `${screen.name}: all ${blocks.length} content blocks fold`,
    blocks.length > 0 && bare.length === 0,
    bare.length ? `not foldable: ${bare.map((b) => b.title).join(' · ')}` : blocks.map((b) => b.key).join(' · '),
  )
  for (const b of blocks) if (b.key) treated.push(`${screen.name}/${b.key}`)
}

console.log('')
console.log(`  ${treated.length} blocks treated:`)
for (const t of treated) console.log(`    ${t}`)

await browser.close()
console.log(`\n  ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
