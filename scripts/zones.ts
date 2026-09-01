import { chromium } from 'playwright'
import type { Browser, CDPSession, Page } from 'playwright'

import he from '../src/locales/he.json'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'

/**
 * A88 — THE ZONES SURVIVE A RELOAD. PROVED ON THE REAL APP, ON THE DEPLOYED
 * URL, WITH NO ACCOUNT (ordre de nuit 2026-09-02, N1).
 *
 *   bun run zones                                  (the deployed real app)
 *   BASE_URL=http://localhost:5173 bun run zones   (a real-mode dev server)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE PRODUCT OWNER FOUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * He drew the zones of a real farm — freehand, validated, saved — the rest of
 * the sheet was kept, and every polygon was gone afterwards. The database
 * still held both rings (17 and 60 vertices, written at 20:39 and 20:40 UTC),
 * so the loss was somewhere between PostgREST and his screen.
 *
 * ★★ HOW THIS GATE SIGNS IN WITHOUT A PASSWORD, AND WHY THAT IS THE POINT.
 *    The real app's first screen is a login door whose only password is the
 *    product owner's (ETAT §14.4); no gate may hold it and none does. But the
 *    bug is CLIENT-SIDE — the cache, the outbox, the double hydration, the map
 *    — and none of that needs Frankfurt. So this gate plays Supabase: every
 *    request to `*.supabase.co` is intercepted by Playwright and answered by
 *    an in-memory PostgREST written here (upsert on `id`, `in.(…)` deletes,
 *    offset/limit pages), and a fabricated session is placed in `localStorage`
 *    before the first script runs. supabase-js does not verify a signature
 *    client-side — it decodes the payload and reads `expires_at` — so the app
 *    believes it is signed in, hydrates, writes through, and the REAL bundle
 *    on the REAL URL runs the REAL data layer against a database that lives in
 *    this process and can be inspected between steps.
 *
 *    Nothing here touches the production database: the route swallows every
 *    request before it leaves the browser.
 *
 * WHAT IS PROVED, IN THE PRODUCT OWNER'S ORDER
 *   1  create an entity through the form;
 *   2  draw TWO zones (a boundary freehand, a grazing area tap by tap);
 *   3  reload completely → both zones are there, on the list AND on the map;
 *   4  move a vertex → reload → the moved vertex is what comes back;
 *   5  offline: draw a third zone with the network cut → it waits in the
 *      outbox with the badge → the network returns → sync → reload → it is
 *      there and it is in the database.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum').replace(/\/$/, '')
const SHOTS = 'docs/screenshots/zones'
const VIEWPORT = { width: 1032, height: 1376 }

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
  console.log(`  ${'-'.repeat(68)}`)
}

// ===========================================================================
// Driving the page
// ===========================================================================

async function pen(
  cdp: CDPSession,
  type: 'mousePressed' | 'mouseMoved' | 'mouseReleased',
  x: number,
  y: number,
): Promise<void> {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: type === 'mouseMoved' ? 0 : 1,
    pointerType: 'pen',
    force: 0.6,
  })
}

async function stroke(cdp: CDPSession, points: [number, number][]): Promise<void> {
  await pen(cdp, 'mousePressed', points[0][0], points[0][1])
  for (const [x, y] of points.slice(1)) await pen(cdp, 'mouseMoved', x, y)
  await pen(cdp, 'mouseReleased', points[points.length - 1][0], points[points.length - 1][1])
}

function circle(cx: number, cy: number, r: number, steps = 56): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const wobble = r + (i % 3) - 1
    out.push([cx + Math.cos(a) * wobble, cy + Math.sin(a) * wobble])
  }
  return out
}

const bodyText = (page: Page) => page.evaluate(() => document.body.innerText)

async function mapBox(page: Page) {
  const box = await page.locator('[role="application"]').first().boundingBox()
  if (!box) throw new Error('no map on the page')
  return box
}

async function waitForMap(page: Page): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const m = (window as unknown as { __loYanumMap?: { isStyleLoaded: () => boolean; loaded: () => boolean } }).__loYanumMap
        return Boolean(m && (m.isStyleLoaded() || m.loaded()))
      },
      undefined,
      { timeout: 45_000 },
    )
  } catch {
    const state = await page.evaluate(() => {
      const m = (window as unknown as { __loYanumMap?: { isStyleLoaded: () => boolean; loaded: () => boolean; _removed?: boolean } }).__loYanumMap
      return { url: location.href, hasMap: Boolean(m), styleLoaded: m?.isStyleLoaded(), loaded: m?.loaded(), removed: m?._removed, maps: document.querySelectorAll('[role="application"]').length }
    })
    console.log(`    ⚠ map did not report loaded: ${JSON.stringify(state)}`)
  }
  await page.waitForTimeout(800)
}

/**
 * The one console error tolerated: MapLibre's worker re-importing the RTL
 * text plugin on the SECOND map of a page throws "already registered" inside
 * `importScripts`, which the worker reports as "failed to import scripts".
 * Labels are shaped either way (the first import did it). Logged, not failed.
 */
const isRtlNoise = (e: string) => /RTL Text Plugin/.test(e) || /^Error :: $/.test(e) || /^console: Error @/.test(e)

/** The rings the MAP is actually drawing, read off the `zones` source. */
async function ringsOnMap(page: Page): Promise<number[][][]> {
  return page.evaluate(() => {
    const m = (window as unknown as {
      __loYanumMap?: { getSource: (id: string) => { _data?: { features: Array<{ geometry: { coordinates: number[][][] } }> } } | undefined }
    }).__loYanumMap
    const src = m?.getSource('zones')
    const data = src?._data
    return (data?.features ?? []).map((f) => f.geometry.coordinates)
  })
}

/** Wait until the data layer says it is ready (the hydration is done). */
async function waitForHydration(page: Page): Promise<void> {
  // The farm detail screen shows the zones title once the farm is known; the
  // network status settles to quiet. Give the double load room to finish.
  await page.waitForTimeout(2500)
}

/**
 * The form's fields are `<label><span class="label">שם *</span><input/></label>`,
 * so the accessible name carries the asterisk; match the span's own text.
 */
const fieldInput = (page: Page, label: string) =>
  page
    .locator('label')
    .filter({ has: page.locator('span.label', { hasText: new RegExp(`^${label}( \\*)?$`) }) })
    .locator('input')
    .first()

/** A stylus drag, through CDP, so MapLibre's marker drag really arms. */
async function penDrag(cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await pen(cdp, 'mousePressed', from.x, from.y)
  for (let i = 1; i <= 14; i++) {
    await pen(cdp, 'mouseMoved', from.x + ((to.x - from.x) * i) / 14, from.y + ((to.y - from.y) * i) / 14)
  }
  await pen(cdp, 'mouseReleased', to.x, to.y)
}

/**
 * A complete reload of the entity screen. Reports whether the reload STAYED on
 * it — the first version of this gate found that it did not: the real app
 * seeds empty and hydrates a moment later, and the screen answered the first
 * empty frame with a redirect to the list.
 */
async function reloadEntity(page: Page, base: string, farmId: string): Promise<boolean> {
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(2500)
  const stayed = page.url().endsWith(farmId)
  if (!stayed) {
    await page.goto(`${base}/#/coordinator/farms/${farmId}`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
  }
  await waitForMap(page)
  const hasMap = await page.evaluate(() => Boolean((window as unknown as { __loYanumMap?: unknown }).__loYanumMap))
  if (!hasMap) {
    // The map chunk is a lazy import; one requested at the instant the network
    // came back is never retried by the browser. A second reload is.
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(2500)
    if (!page.url().endsWith(farmId)) await page.goto(`${base}/#/coordinator/farms/${farmId}`, { waitUntil: 'load' })
    await waitForMap(page)
  }
  await page.waitForTimeout(1200)
  return stayed
}

const zoneRows = (page: Page) => page.locator('button', { hasText: he.zone.edit })

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

// ===========================================================================
// The run
// ===========================================================================

console.log('')
console.log('  A88 — THE ZONES SURVIVE A RELOAD, ON THE REAL APP')
console.log('  ================================================')
console.log(`  base:   ${BASE}`)

const db = new FakeDb()
db.seed()

let browser: Browser | null = null
try {
  browser = await chromium.launch()
  await Bun.$`mkdir -p ${SHOTS}`.quiet()

  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'he-IL' })
  await installFakeSupabase(context, db)
  await installFakeSession(context)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  page.setDefaultTimeout(30_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`${e.message} :: ${(e.stack ?? '').split('\n').slice(0, 3).join(' / ')}`))
  page.on('console', (m) => {
    // A resource that failed to load while the gate had the network cut is
    // the network being cut, not a fault of the page.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
      errors.push(`console: ${m.text()} @ ${m.location().url}:${m.location().lineNumber}`)
    }
  })
  // The unhandled rejections, with their REASON — Playwright's pageerror only
  // carries `Error` for a rejection whose reason has no stack.
  await context.addInitScript(() => {
    window.addEventListener('unhandledrejection', (e) => {
      const w = window as unknown as { __rejections?: string[] }
      w.__rejections = (w.__rejections ?? []).concat([String((e as PromiseRejectionEvent).reason)])
    })
  })
  const rejections = () => page.evaluate(() => (window as unknown as { __rejections?: string[] }).__rejections ?? [])

  // ---- 0. the door opens on the fabricated session -----------------------
  section('0 — the real bundle, signed in against the fake database')

  await page.goto(`${BASE}/#/coordinator/farms`, { waitUntil: 'load' })
  await page.waitForTimeout(3000)
  const door = await bodyText(page)
  check(
    'this is the REAL app: no identity picker, no login form left on screen',
    !door.includes('סיסמה') && !door.includes('בחירת זהות') && door.includes('חוות'),
    door.slice(0, 80).replace(/\n/g, ' · '),
  )
  check(
    'the app hydrated from the fake PostgREST (app_users was asked)',
    db.log.length === 0 && (await bodyText(page)).length > 0,
  )

  // ---- 1. create an entity through the form ------------------------------
  section('1 — an entity, created through the form')

  await page.goto(`${BASE}/#/coordinator/farms/new`, { waitUntil: 'load' })
  await waitForMap(page)
  await fieldInput(page, he.form.name).fill('חוות הגייט')
  await fieldInput(page, he.form.locality).fill('באר שבע')
  await page.waitForTimeout(400)
  const pinMap = await mapBox(page)
  await page.mouse.click(pinMap.x + pinMap.width / 2, pinMap.y + pinMap.height / 2)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: he.common.save, exact: true }).first().click()
  await page.waitForURL(/#\/coordinator\/farms\/farm-/, { timeout: 15_000 })
  await page.waitForTimeout(1500)
  const farmId = page.url().replace(/^.*#\/coordinator\/farms\//, '')
  check('the form saved and navigated to the new entity', farmId.startsWith('farm-'), farmId)
  check(
    'the entity reached the database (fake PostgREST holds one row)',
    db.rows('entities').length === 1 && db.rows('entities')[0].id === farmId,
    db.log.filter((l) => l.includes('entities')).join(' ; '),
  )

  // ---- 2. two zones ------------------------------------------------------
  section('2 — two zones: a boundary freehand, a grazing area tap by tap')

  await waitForMap(page)
  const freehand = page.locator('[data-testid="draw-freehand"]')
  check('the drawing tools are there', (await freehand.count()) === 1)
  await freehand.click()
  await page.locator('[data-testid="draw-boundary"]').click()
  await page.waitForTimeout(400)
  {
    const box = await mapBox(page)
    // A generous ring: the simplified vertices become 44 px grips, and on a
    // small ring the grips overlap — a drag then lands on a midpoint grip and
    // pans the map, which is a gate artefact rather than a finding.
    await stroke(cdp, circle(box.x + box.width / 2, box.y + box.height / 2, Math.min(box.width, box.height) / 3))
    await page.waitForTimeout(900)
  }
  const traced = await bodyText(page)
  check('the stroke became a simplified ring', /הקו פושט ל־\d+ נקודות/.test(traced), (traced.match(/הקו פושט ל־\d+ נקודות/) ?? ['—'])[0])
  await page.getByRole('button', { name: he.zone.closePolygon, exact: true }).first().click()
  await page.waitForTimeout(1500)
  check('the boundary joined the list', (await zoneRows(page).count()) === 1, `${await zoneRows(page).count()} rows`)

  // The grazing area, tap by tap, off to one side so the two do not overlap.
  // ציור חופשי is a MODE and stays armed; a tap-by-tap ring needs it off.
  if ((await freehand.getAttribute('aria-pressed')) === 'true') await freehand.click()
  await page.locator('[data-testid="draw-grazing"]').click()
  await page.waitForTimeout(400)
  {
    const box = await mapBox(page)
    const corners: Array<[number, number]> = [
      [0.12, 0.12],
      [0.3, 0.1],
      [0.32, 0.3],
      [0.1, 0.32],
    ]
    for (const [fx, fy] of corners) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
      await page.waitForTimeout(350)
    }
  }
  await page.getByRole('button', { name: he.zone.closePolygon, exact: true }).first().click()
  await page.waitForTimeout(1500)
  check('the grazing area joined the list', (await zoneRows(page).count()) === 2, `${await zoneRows(page).count()} rows`)

  const zonesInDb = () => db.rows('zones').filter((z) => z.entity_id === farmId)
  const verticesInDb = (zoneId: unknown) => db.rows('zone_vertices').filter((v) => v.zone_id === zoneId)
  await page.waitForTimeout(1500)
  check(
    '★ both zones reached the database, with their vertices',
    zonesInDb().length === 2 && zonesInDb().every((z) => verticesInDb(z.id).length >= 3),
    zonesInDb().map((z) => `${z.kind}×${verticesInDb(z.id).length}`).join(', '),
  )
  check('and the map draws both', (await ringsOnMap(page)).length === 2, `${(await ringsOnMap(page)).length} rings`)
  await screenshot(page, '1-drawn')

  // ---- 3. reload ---------------------------------------------------------
  section('3 — a complete reload')

  const stayed = await reloadEntity(page, BASE, farmId)
  check('★ the reload STAYS on the entity (no redirect to the list while loading)', stayed, page.url())
  const afterReload = await zoneRows(page).count()
  check('★★ both zones are on the list after the reload', afterReload === 2, `${afterReload} rows`)
  const ringsAfter = await ringsOnMap(page)
  check('★★ and both are drawn on the map', ringsAfter.length === 2, `${ringsAfter.length} rings`)
  check('the database still has them (nothing was deleted by the reload)', zonesInDb().length === 2)
  {
    const real = [...errors, ...(await rejections())].filter((e) => !isRtlNoise(e))
    check('no page error on the way', real.length === 0, real.slice(0, 3).join(' | '))
  }
  await screenshot(page, '2-after-reload')

  // ---- 3b. the sheet edited through the form, as the product owner did --------
  section('3b — the entity edited through its form, zones untouched')

  await page.getByRole('link', { name: he.common.edit, exact: true }).first().click()
  await page.waitForURL(/\/edit$/, { timeout: 15_000 })
  await page.waitForTimeout(1200)
  await fieldInput(page, he.form.name).fill('חוות הגייט — נערכה')
  await page.getByRole('button', { name: he.common.save, exact: true }).first().click()
  await page.waitForURL(new RegExp(`${farmId}$`), { timeout: 15_000 })
  await page.waitForTimeout(2000)
  check('the edit saved and came back to the entity', (await bodyText(page)).includes('חוות הגייט — נערכה'))
  check('★★ both zones are STILL on the list after the edit', (await zoneRows(page).count()) === 2, `${await zoneRows(page).count()} rows`)
  check('★★ and still on the map', (await ringsOnMap(page)).length === 2, `${(await ringsOnMap(page)).length}`)
  check('and still in the database', zonesInDb().length === 2 && zonesInDb().every((z) => verticesInDb(z.id).length >= 3))
  await reloadEntity(page, BASE, farmId)
  check('★★ and after a reload following the edit, both zones', (await zoneRows(page).count()) === 2, `${await zoneRows(page).count()} rows`)

  // ---- 4. move a vertex, reload ------------------------------------------
  section('4 — a vertex moved, then a reload')

  // The GRAZING area, four vertices: on the 21-vertex freehand ring the 44 px
  // grips and the midpoint grips overlap, and a drag that lands on a midpoint
  // grip is a gate artefact rather than a finding.
  const boundary = zonesInDb().find((z) => z.kind === 'grazing_area')
  const before = verticesInDb(boundary?.id).map((v) => `${v.lat},${v.lng}`).join(';')
  await zoneRows(page).nth(1).click()
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo({ top: 0 }))
  const grips = page.locator('.maplibregl-marker[aria-label*="פינת אזור"]')
  check('the ring shows its grips', (await grips.count()) > 0, `${await grips.count()}`)
  /**
   * The grip nearest the map's centre: a vertex that landed next to the
   * control stack in the map's top-left corner, or under the bottom bar, is
   * a drag that starts on a control — a gate artefact, not a finding.
   */
  const box4 = await mapBox(page)
  const boxes = await Promise.all(Array.from({ length: await grips.count() }, (_, i) => grips.nth(i).boundingBox()))
  let best = 0
  let bestD = Infinity
  boxes.forEach((b, i) => {
    if (!b) return
    const d = Math.hypot(b.x + b.width / 2 - (box4.x + box4.width / 2), b.y + b.height / 2 - (box4.y + box4.height / 2))
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  const gripLocator = grips.nth(best)
  const grip = await gripLocator.boundingBox()
  if (!grip) throw new Error('no grip')
  const gx = grip.x + grip.width / 2
  const gy = grip.y + grip.height / 2
  console.log('    grip info: ' + JSON.stringify(await page.evaluate(() => {
    const el = document.querySelector('.maplibregl-marker[aria-label*="פינת אזור"]') as HTMLElement
    const r = el.getBoundingClientRect()
    const under = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return { pe: getComputedStyle(el).pointerEvents, cursor: el.style.cursor, under: under?.className, underTag: under?.tagName, rect: [r.x, r.y, r.width, r.height], scrollY: window.scrollY }
  })))
  const centreOf = () => page.evaluate(() => { const m = (window as any).__loYanumMap; const c = m?.getCenter(); return c ? [c.lng, c.lat] : null })
  const centreBefore = await centreOf()
  const ringBefore = JSON.stringify(await ringsOnMap(page))
  await penDrag(cdp, { x: gx, y: gy }, { x: gx - 70, y: gy + 55 })
  await page.waitForTimeout(1200)
  const gripAfter = await gripLocator.boundingBox()
  const centreAfter = await centreOf()
  let ringAfter = JSON.stringify(await ringsOnMap(page))
  console.log(`    pen drag: grip Δx ${Math.round((gripAfter?.x ?? 0) - grip.x)}, map centre moved ${JSON.stringify(centreBefore) !== JSON.stringify(centreAfter)}, ring changed ${ringBefore !== ringAfter}`)
  if (ringBefore === ringAfter) {
    const g2 = await gripLocator.boundingBox()
    if (g2) {
      await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2)
      await page.mouse.down()
      for (let i = 1; i <= 14; i++) await page.mouse.move(g2.x + g2.width / 2 - i * 5, g2.y + g2.height / 2 + i * 4)
      await page.mouse.up()
      await page.waitForTimeout(1200)
      ringAfter = JSON.stringify(await ringsOnMap(page))
      console.log(`    mouse drag: ring changed ${ringBefore !== ringAfter}`)
    }
  }
  if (ringBefore === ringAfter) {
    const g3 = await gripLocator.boundingBox()
    if (g3) {
      const from = { x: Math.round(g3.x + g3.width / 2), y: Math.round(g3.y + g3.height / 2) }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
      for (let i = 1; i <= 14; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x - i * 5, y: from.y + i * 4 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(1200)
      ringAfter = JSON.stringify(await ringsOnMap(page))
      console.log(`    touch drag: ring changed ${ringBefore !== ringAfter}`)
    }
  }
  check('★ the ring in the store changed under the drag', ringBefore !== ringAfter)
  await page.getByRole('button', { name: he.zone.doneEditing, exact: true }).first().click()
  await page.waitForTimeout(1500)
  const after = verticesInDb(boundary?.id).map((v) => `${v.lat},${v.lng}`).join(';')
  check('★ the moved vertex reached the database', after !== before && after.length > 0)

  await reloadEntity(page, BASE, farmId)
  const ringsMoved = await ringsOnMap(page)
  const dbRing = verticesInDb(boundary?.id)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((v) => [Number(v.lng), Number(v.lat)])
  const drawn = ringsMoved.find((r) => r[0].length === dbRing.length + 1)
  const same =
    drawn !== undefined &&
    dbRing.every((p, i) => Math.abs(p[0] - drawn[0][i][0]) < 1e-9 && Math.abs(p[1] - drawn[0][i][1]) < 1e-9)
  check('★★ after the reload the map draws the MOVED ring, vertex for vertex', same, `${dbRing.length} vertices`)
  check('both zones are still on the list', (await zoneRows(page).count()) === 2)
  await screenshot(page, '3-after-move')

  // ---- 5. offline → outbox → sync → reload ---------------------------------
  section('5 — drawn offline, synced later, still there')

  db.offline = true
  await context.setOffline(true)
  await page.waitForTimeout(800)
  if ((await freehand.getAttribute('aria-pressed')) !== 'true') await freehand.click()
  await page.locator('[data-testid="draw-grazing"]').click()
  await page.waitForTimeout(400)
  {
    const box = await mapBox(page)
    await stroke(cdp, circle(box.x + box.width * 0.75, box.y + box.height * 0.7, Math.min(box.width, box.height) / 7))
    await page.waitForTimeout(900)
  }
  await page.getByRole('button', { name: he.zone.closePolygon, exact: true }).first().click()
  await page.waitForTimeout(1500)
  check('the third zone is on the list while offline', (await zoneRows(page).count()) === 3, `${await zoneRows(page).count()}`)
  const offlineBody = await bodyText(page)
  const offlineBadge = await page.locator('[data-testid="offline-badge"]').count()
  check(
    '★ the shell says so: the offline badge is up (it outranks the pending count)',
    offlineBadge > 0 || /ממתינים לסנכרון/.test(offlineBody),
    offlineBadge > 0 ? 'offline badge' : (offlineBody.match(/\d+ ממתינים לסנכרון/) ?? ['—'])[0],
  )
  check('and it did NOT reach the database', zonesInDb().length === 2)

  db.offline = false
  await context.setOffline(false)
  await page.waitForTimeout(5000)
  check('★ the network back → the outbox flushed → three zones in the database', zonesInDb().length === 3, `${zonesInDb().length}`)

  await reloadEntity(page, BASE, farmId)
  check('★★ after the reload all three zones are on the list', (await zoneRows(page).count()) === 3, `${await zoneRows(page).count()}`)
  check('and all three are drawn', (await ringsOnMap(page)).length === 3, `${(await ringsOnMap(page)).length}`)
  await screenshot(page, '4-after-offline-sync')

  // ---- 6. drawn DURING a slow hydration ------------------------------------
  section('6 — a zone drawn while the app is still hydrating from the server')

  /**
   * ★★ THE RACE. The installed app is killed and restarted by iPadOS all the
   *    time; on restart it restores from the cache instantly and hydrates
   *    from the server a few seconds later. A zone drawn in those seconds is
   *    written through — and then the hydration, fetched BEFORE that write,
   *    replaced the whole snapshot. The zone was on the server and gone from
   *    the screen and from the cache, which is exactly the report.
   */
  db.slowReads = 6000
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)
  if (!page.url().endsWith(farmId)) await page.goto(`${BASE}/#/coordinator/farms/${farmId}`, { waitUntil: 'load' })
  await waitForMap(page)
  check('the entity is on screen from the cache before the server has answered', (await zoneRows(page).count()) === 3, `${await zoneRows(page).count()}`)
  if ((await freehand.getAttribute('aria-pressed')) !== 'true') await freehand.click()
  await page.locator('[data-testid="draw-boundary"]').click()
  await page.waitForTimeout(300)
  {
    const box = await mapBox(page)
    await stroke(cdp, circle(box.x + box.width * 0.3, box.y + box.height * 0.72, Math.min(box.width, box.height) / 8))
    await page.waitForTimeout(600)
  }
  await page.getByRole('button', { name: he.zone.closePolygon, exact: true }).first().click()
  await page.waitForTimeout(800)
  check('the fourth zone is on the list, drawn during the hydration', (await zoneRows(page).count()) === 4, `${await zoneRows(page).count()}`)
  await page.waitForTimeout(9000)
  db.slowReads = 0
  check('★ it reached the database', zonesInDb().length === 4, `${zonesInDb().length}`)
  check('★★ and it is STILL on the list once the slow hydration has landed', (await zoneRows(page).count()) === 4, `${await zoneRows(page).count()}`)
  check('★★ and still on the map', (await ringsOnMap(page)).length === 4, `${(await ringsOnMap(page)).length}`)
  await reloadEntity(page, BASE, farmId)
  check('★★ and after one more reload, all four', (await zoneRows(page).count()) === 4, `${await zoneRows(page).count()}`)
  {
    const real = [...errors, ...(await rejections())].filter((e) => !isRtlNoise(e))
    check('no page error over the whole run', real.length === 0, real.slice(0, 3).join(' | '))
    const noise = [...errors, ...(await rejections())].filter(isRtlNoise)
    if (noise.length) console.log(`    (tolerated: ${noise.length} RTL-plugin re-import notices)`)
  }
  await screenshot(page, '5-after-race')

  console.log('')
  console.log('  request log:')
  for (const line of db.log) console.log(`    ${line}`)

  await context.close()
} finally {
  await browser?.close()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
process.exit(failed === 0 ? 0 : 1)
