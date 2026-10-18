import { mkdirSync } from 'node:fs'

import type { CDPSession, Page } from 'playwright'

import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import type { Opened } from './ayharness'
import { FakeDb } from './fake-supabase'
import { defaultRing, parsePath, ringAreaDunams } from '../src/core/index'
import type { LatLng } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BL — CHANTIER 1 AU RENDU : LA BARRE D'OUTILS EN HAUT, AU NIVEAU
 *      D'ILLUSTRATOR, À LA SOURIS ET AU DOIGT.               A570 … A580
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run blui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run blui    # le DÉPLOYÉ
 *
 *   « Ma map est superposée de plein d'outils, c'est vraiment embêtant pour
 *     retracer ma map. J'aimerais que mes outils se trouvent dans le header. »
 *
 * Deux appareils, comme `bkeditui` : « souris » (1 440 × 900) et « doigt »
 * (iPad 1 032 × 1 376, touchers CDP réels) ; plus l'iPad en ÉCRAN PARTAGÉ
 * (678 et 507 px de large) pour la barre qui ne doit pas déborder.
 *
 *   A570  ★ plus rien ne flotte sur la carte pendant l'édition : la barre est
 *         AU-DESSUS de la carte (régions ET carte d'une ferme), la légende se
 *         retire, aucun élément de l'éditeur ne chevauche la carte
 *   A571  ★ des ICÔNES, pas du texte : sept outils dans l'ordre d'Illustrator,
 *         chacun un SVG sans texte, 44 px, nommé en hébreu
 *   A572  ★ l'infobulle hébraïque : au survol (souris) ; à l'appui long
 *         (doigt), qui NE choisit PAS l'outil ; bornée à l'écran
 *   A573  ★ l'outil actif se voit : UN seul bouton plein, son nom dans la
 *         barre ; les raccourcis d'Illustrator (V P + − ⇧C N M)
 *   A574  ★ les surfaces, UNE fois, en haut : sur les pastilles des régions,
 *         plus de rangée de surfaces dans le panneau
 *   A575  ★ le recentrage : une icône dans la pile en haut à gauche, un clic
 *         recentre ; plus de pastille au milieu de la carte
 *   A576  ★ la forme d'origine : en pointillés, NOMMÉE dans la barre, un
 *         bouton la masque / l'affiche ; la couche « אזורים » (l'ancienne
 *         version enregistrée) n'est plus dessinée sous l'éditeur
 *   A577  ★ « שחזור המקור » : hors de la barre, dans « ⋯ », derrière une
 *         confirmation qui nomme la région et compte les formes effacées
 *   A578  ★ les nouveaux outils, geste par geste (souris ET doigt), écran ET
 *         base : plume +, plume −, conversion (toucher, tirer), déplacement
 *   A579  ★ l'iPad en écran partagé (678, 507) : la barre passe à la ligne,
 *         ne déborde pas, chaque outil reste entier à l'écran
 *   A580  « שרטוט מחדש » : la forme remplacée n'est plus un aplat, mais les
 *         pointillés nommés
 */

const OUT = process.env.DIST ?? 'dist-bl'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5541), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bl/c1-${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

const FARM = 'farm-ak1-11'
const B = 'zone-bl-boundary'
const G = 'zone-bl-grazing'

type Device = { name: 'souris' | 'doigt'; w: number; h: number; touch: boolean }
const DEVICES: Device[] = [
  { name: 'souris', w: 1440, h: 900, touch: false },
  { name: 'doigt', w: 1032, h: 1376, touch: true },
]
const only = process.env.ONLY_DEVICE
const devices = only ? DEVICES.filter((d) => d.name === only) : DEVICES

function ringOf(c: LatLng, n: number, rLat: number, rLng: number): LatLng[] {
  return Array.from({ length: n }, (_, i) => ({ lat: c.lat + rLat * Math.sin((i / n) * 2 * Math.PI), lng: c.lng + rLng * Math.cos((i / n) * 2 * Math.PI) }))
}

/** La configuration de `farm-ak1-11` (une limite DANS un pâturage), sans ses coordonnées : celle de `bkeditui`. */
function blDb(): { db: FakeDb; center: LatLng; bCenter: LatLng } {
  const d = new FakeDb()
  seed(d)
  d.rows('entities').forEach((r, n) => {
    const k = String(n + 1).padStart(2, '0')
    Object.assign(r, { name: `חוות בדיקה ${k}`, farm_name: '', farmer_name: `חקלאי ${k}`, farmer_phone: `050-000-15${k}`, farmer_email: '', liaison_name: '', liaison_phone: '', standby_phone: '', notes: '', farmer_id_no: '' })
  })
  const f = d.rows('entities').find((r) => r.id === FARM)!
  const center = { lat: Number(f.lat), lng: Number(f.lng) }
  const bCenter = { lat: center.lat + 0.0006, lng: center.lng + 0.0008 }
  const put = (id: string, kind: string, ring: LatLng[]) => {
    const at = new Date().toISOString()
    d.rows('zones').push({ id, entity_id: FARM, kind, created_at: at, updated_at: at })
    ring.forEach((v, position) => d.rows('zone_vertices').push({ zone_id: id, position, lat: v.lat, lng: v.lng }))
  }
  put(B, 'farm_boundary', ringOf(bCenter, 12, 0.0016, 0.0023))
  put(G, 'grazing_area', ringOf(center, 10, 0.016, 0.018))
  d.cascades.set('zones', [{ table: 'zone_vertices', fk: 'zone_id' }])
  return { db: d, center, bCenter }
}

const dbRing = (db: FakeDb, id: string): LatLng[] =>
  db
    .rows('zone_vertices')
    .filter((v) => v.zone_id === id)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((v) => ({ lat: Number(v.lat), lng: Number(v.lng) }))
const dbPath = (db: FakeDb, id: string) => parsePath(db.rows('zones').find((z) => z.id === id)?.path ?? null)
async function until(f: () => boolean, ms = 4000): Promise<boolean> {
  for (let t = 0; t < ms; t += 100) {
    if (f()) return true
    await Bun.sleep(100)
  }
  return f()
}

// ---------------------------------------------------------------------------
// Les gestes, à la souris et au doigt (ceux de `bkeditui`)
// ---------------------------------------------------------------------------
interface Hand {
  dev: Device
  page: Page
  cdp: CDPSession | null
  tap(x: number, y: number): Promise<void>
  press(x: number, y: number, ms: number): Promise<void>
  drag(x0: number, y0: number, x1: number, y1: number, steps?: number): Promise<void>
}

async function hand(o: Opened, dev: Device): Promise<Hand> {
  const page = o.page
  const cdp = dev.touch ? await o.ctx.newCDPSession(page) : null
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Array<{ x: number; y: number }>) => {
    await cdp!.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts.map((p, id) => ({ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 })) })
  }
  return {
    dev,
    page,
    cdp,
    async tap(x, y) {
      if (dev.touch) {
        await touch('touchStart', [{ x, y }])
        await page.waitForTimeout(40)
        await touch('touchEnd', [])
      } else await page.mouse.click(x, y)
      await page.waitForTimeout(350)
    },
    async press(x, y, ms) {
      if (dev.touch) {
        await touch('touchStart', [{ x, y }])
        await page.waitForTimeout(ms)
        await touch('touchEnd', [])
      } else {
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.waitForTimeout(ms)
        await page.mouse.up()
      }
      await page.waitForTimeout(250)
    },
    async drag(x0, y0, x1, y1, steps = 12) {
      if (dev.touch) {
        await touch('touchStart', [{ x: x0, y: y0 }])
        for (let i = 1; i <= steps; i++) {
          await touch('touchMove', [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }])
          await page.waitForTimeout(16)
        }
        await touch('touchEnd', [])
      } else {
        await page.mouse.move(x0, y0)
        await page.mouse.down()
        await page.mouse.move(x1, y1, { steps })
        await page.mouse.up()
      }
      await page.waitForTimeout(450)
    },
  }
}

const box = async (page: Page, sel: string) => page.locator(sel).first().boundingBox()
const centreOf = async (page: Page, sel: string) => {
  const b = await box(page, sel)
  if (!b) throw new Error(`absent : ${sel}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
const nodeAt = (page: Page, i: number) => centreOf(page, `[data-testid="editor-node-${i}"]`)
const project = (page: Page, p: LatLng) =>
  page.evaluate((q) => {
    const m = (window as unknown as { __loYanumMap: { project(a: [number, number]): { x: number; y: number }; getContainer(): HTMLElement } }).__loYanumMap
    const r = m.getContainer().getBoundingClientRect()
    const s = m.project([q.lng, q.lat])
    return { x: r.left + s.x, y: r.top + s.y }
  }, p)
const camera = (page: Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap: { getCenter(): { lat: number; lng: number }; getZoom(): number } }).__loYanumMap
    const c = m.getCenter()
    return { lat: c.lat, lng: c.lng, zoom: m.getZoom() }
  })
const mapBox = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as { __loYanumMap: { getContainer(): HTMLElement } }).__loYanumMap.getContainer().getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  })
const ed = (page: Page) => page.locator('[data-testid="shape-editor"]').first()
const attr = async (page: Page, a: string) => (await ed(page).getAttribute(a, { timeout: 2000 }).catch(() => null)) ?? ''
const nodes = async (page: Page) => Number(await attr(page, 'data-nodes'))
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5

async function openFarm(db: FakeDb, dev: Device, w = dev.w, hgt = dev.h): Promise<{ o: Opened; h: Hand }> {
  const o = await open(w, { db, height: hgt, touch: dev.touch, init: { 'lo-yanum:map-mode:farm-detail': 'full', [`lo-yanum:farm-tab:${FARM}`]: 'terrain' } })
  await go(o.page, APP, `/coordinator/farms/${FARM}`, 7000)
  return { o, h: await hand(o, dev) }
}
async function frame(page: Page, c: LatLng, zoom = 15.5): Promise<void> {
  await page.evaluate(({ c: q, z }) => (window as unknown as { __loYanumMap: { jumpTo(o: unknown): void } }).__loYanumMap.jumpTo({ center: [q.lng, q.lat], zoom: z }), { c, z: zoom })
  await page.waitForTimeout(900)
}
async function openBoundary(h: Hand, bCenter: LatLng): Promise<void> {
  await frame(h.page, bCenter)
  const p = await project(h.page, { lat: bCenter.lat, lng: bCenter.lng + 0.0012 })
  await h.tap(p.x, p.y)
  if ((await h.page.locator('[data-testid="shape-picker"]').count()) > 0) {
    await h.page.locator(`[data-testid="shape-pick-${B}"]`).click()
    await h.page.waitForTimeout(800)
  }
  /* La barre est au-dessus de la carte : la carte a rétréci, on recadre sur la limite. */
  await frame(h.page, bCenter)
}
async function openRegions(dev: Device, w = dev.w, hgt = dev.h, init: Record<string, string> = {}): Promise<{ o: Opened; h: Hand }> {
  const db = new FakeDb()
  seed(db)
  const o = await open(w, { db, height: hgt, touch: dev.touch, init })
  await go(o.page, APP, '/coordinator/settings/regions', 6000)
  return { o, h: await hand(o, dev) }
}
async function pickRegion(h: Hand, id: string): Promise<void> {
  await h.page.locator(`[data-testid="region-pick-${id}"]`).scrollIntoViewIfNeeded()
  await h.page.waitForTimeout(300)
  const pill = await centreOf(h.page, `[data-testid="region-pick-${id}"]`)
  await h.tap(pill.x, pill.y)
  await h.page.waitForTimeout(1200)
}
async function chooseTool(h: Hand, id: string): Promise<void> {
  const c = await centreOf(h.page, `[data-testid="editor-tool-${id}"]`)
  await h.tap(c.x, c.y)
}

const TOOL_ORDER = ['select', 'pen', 'penAdd', 'penRemove', 'convert', 'pencil', 'move']
const HEBREW = /[֐-׿]/

// ===========================================================================
for (const dev of devices) {
  const D = dev.name
  // -------------------------------------------------------------------------
  await guard(`A570-${D}`, async () => {
    section(`A570 (${D}) — ★ plus rien ne flotte sur la carte pendant l’édition`)
    /* L'écran des régions. */
    const { o, h } = await openRegions(dev)
    const idleBar = await box(o.page, '[data-testid="shape-editor-idle"]')
    const m0 = await mapBox(o.page)
    check(`A570 (${D}) régions : sans région ouverte, la barre est DÉJÀ en haut, outils éteints`, !!idleBar && idleBar.y + idleBar.height <= m0.y + 0.5 && (await o.page.locator('[data-testid="editor-tool-pen"]').isDisabled()))
    await pickRegion(h, 'negev')
    const bar = await box(o.page, '[data-testid="shape-editor"]')
    const m1 = await mapBox(o.page)
    check(`A570 (${D}) régions : la barre d’édition est AU-DESSUS de la carte (bas ${Math.round((bar?.y ?? 0) + (bar?.height ?? 0))} ≤ haut de la carte ${Math.round(m1.y)})`, !!bar && bar.y + bar.height <= m1.y + 0.5)
    check(`A570 (${D}) régions : la carte n’a pas sauté à l’ouverture (même haut, même hauteur)`, Math.abs(m1.y - m0.y) < 1 && Math.abs(m1.height - m0.height) < 1, `${Math.round(m0.y)}/${Math.round(m0.height)} → ${Math.round(m1.y)}/${Math.round(m1.height)}`)
    const floating = await o.page.evaluate(() => {
      const mapEl = (window as unknown as { __loYanumMap: { getContainer(): HTMLElement } }).__loYanumMap.getContainer()
      const r = mapEl.getBoundingClientRect()
      const out: string[] = []
      for (const el of document.querySelectorAll<HTMLElement>('[data-testid]')) {
        const id = el.dataset.testid ?? ''
        if (!/^(shape-editor|editor-|region-|map-recenter|map-legend|zone-)/.test(id)) continue
        if (el.closest('[data-testid="path-editor-overlay"]')) continue /* les points, poignées et « + » : ce qu'on édite */
        if (el.closest('[data-testid="map-tools"]')) continue /* la pile de la carte, en haut à gauche */
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) continue
        if (b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom) out.push(id)
      }
      return out
    })
    check(`A570 (${D}) ★ régions : aucun élément d’outil ni d’information sur la carte`, floating.length === 0, floating.join(', '))
    await o.page.screenshot({ path: `${SHOTS}/a570-${D}-regions.png` })
    await o.ctx.close()

    /* La carte d'une ferme. */
    const { db, bCenter } = blDb()
    const f = await openFarm(db, dev)
    await frame(f.o.page, bCenter)
    const before = await project(f.o.page, bCenter)
    const tapAt = await project(f.o.page, { lat: bCenter.lat, lng: bCenter.lng + 0.0012 })
    await f.h.tap(tapAt.x, tapAt.y)
    await f.o.page.locator(`[data-testid="shape-pick-${B}"]`).click()
    await f.o.page.waitForTimeout(900)
    check(`A570 (${D}) ferme : la limite est ouverte`, (await attr(f.o.page, 'data-shape')) === B)
    const after = await project(f.o.page, bCenter)
    check(`A570 (${D}) ★ ferme : la barre paraît au-dessus, et la forme n’a PAS bougé sous le doigt (${Math.round(Math.hypot(after.x - before.x, after.y - before.y))} px)`, Math.hypot(after.x - before.x, after.y - before.y) < 1.5)
    const n3 = await nodeAt(f.o.page, 3)
    await f.h.tap(n3.x, n3.y)
    const n3b = await nodeAt(f.o.page, 3)
    check(`A570 (${D}) ★ toucher un point (sa ligne d’actions s’allume) : rien ne bouge (${Math.round(Math.hypot(n3b.x - n3.x, n3b.y - n3.y))} px)`, (await attr(f.o.page, 'data-selected-node')) === '3' && Math.hypot(n3b.x - n3.x, n3b.y - n3.y) < 1.5)
    const fb = await box(f.o.page, '[data-testid="shape-editor"]')
    const fm = await mapBox(f.o.page)
    check(`A570 (${D}) ★ ferme : la barre est AU-DESSUS de la carte, hors d’elle`, !!fb && fb.y + fb.height <= fm.y + 0.5, `${Math.round((fb?.y ?? 0) + (fb?.height ?? 0))} / ${Math.round(fm.y)}`)
    check(`A570 (${D}) ferme : la légende s’est retirée pendant l’édition`, (await f.o.page.locator('[data-testid="map-legend"], [data-testid="map-legend-toggle"]').count()) === 0)
    const fl = await f.o.page.evaluate(() => {
      const mapEl = (window as unknown as { __loYanumMap: { getContainer(): HTMLElement } }).__loYanumMap.getContainer()
      const r = mapEl.getBoundingClientRect()
      const out: string[] = []
      for (const el of document.querySelectorAll<HTMLElement>('[data-testid="shape-editor"], [data-testid^="editor-"], [data-testid="map-recenter"]')) {
        if (el.closest('[data-testid="path-editor-overlay"]') || el.closest('[data-testid="map-tools"]')) continue
        const b = el.getBoundingClientRect()
        if (b.width && b.height && b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom) out.push(el.dataset.testid ?? '')
      }
      return out
    })
    check(`A570 (${D}) ★ ferme : aucun élément de la barre sur la carte`, fl.length === 0, fl.join(', '))
    await f.o.page.screenshot({ path: `${SHOTS}/a570-${D}-ferme.png` })
    await f.o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A571-${D}`, async () => {
    section(`A571 (${D}) — ★ des icônes, pas du texte`)
    const { o, h } = await openRegions(dev)
    await pickRegion(h, 'negev')
    const tools = await o.page.locator('[data-testid="editor-tools"] [data-testid^="editor-tool-"]').evaluateAll((els) =>
      els.map((e) => {
        const b = e.getBoundingClientRect()
        return { id: (e as HTMLElement).dataset.testid ?? '', text: (e as HTMLElement).innerText.trim(), svg: e.querySelectorAll('svg path, svg rect, svg circle').length, w: b.width, h: b.height, label: e.getAttribute('aria-label') ?? '' }
      }),
    )
    check(`A571 (${D}) ★ sept outils, dans l’ordre d’Illustrator (${tools.map((x) => x.id.replace('editor-tool-', '')).join(' · ')})`, tools.map((x) => x.id.replace('editor-tool-', '')).join() === TOOL_ORDER.join())
    check(`A571 (${D}) ★ chacun est une ICÔNE SVG, sans un mot de texte`, tools.every((x) => x.svg >= 1 && x.text === ''), tools.filter((x) => x.text).map((x) => `${x.id}:${x.text}`).join(', '))
    check(`A571 (${D}) ★ chacun fait 44 px au moins (le doigt)`, tools.every((x) => x.w >= 44 && x.h >= 44), tools.map((x) => `${Math.round(x.w)}×${Math.round(x.h)}`).join(' '))
    check(`A571 (${D}) chacun est NOMMÉ en hébreu (aria-label)`, tools.every((x) => HEBREW.test(x.label)), tools.map((x) => x.label).join(' | '))
    check(`A571 (${D}) les noms : la plume, la plume +, la plume −, la conversion, le crayon, le déplacement`, /עט/.test(tools[1].label) && /הוספת נקודה/.test(tools[2].label) && /מחיקת נקודה/.test(tools[3].label) && /המרת נקודה/.test(tools[4].label) && /עיפרון/.test(tools[5].label) && /הזזת הצורה/.test(tools[6].label))
    const others = await o.page.locator('[data-testid="editor-undo"], [data-testid="editor-redo"], [data-testid="editor-snap"], [data-testid="editor-ghost-toggle"], [data-testid="editor-menu"]').evaluateAll((els) => els.map((e) => ({ text: (e as HTMLElement).innerText.trim(), svg: e.querySelectorAll('svg').length })))
    check(`A571 (${D}) annuler, refaire, l’aimant, la forme d’origine, « ⋯ » : des icônes aussi`, others.length === 5 && others.every((x) => x.svg === 1 && x.text === ''))
    const emoji = await ed(o.page).evaluate((e) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test((e as HTMLElement).innerText))
    check(`A571 (${D}) pas d’émoji dans la barre`, !emoji)
    await o.page.locator('[data-testid="editor-tools"]').screenshot({ path: `${SHOTS}/a571-${D}-outils.png` })
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A572-${D}`, async () => {
    section(`A572 (${D}) — ★ l’infobulle en hébreu`)
    const { o, h } = await openRegions(dev)
    await pickRegion(h, 'negev')
    const c = await centreOf(o.page, '[data-testid="editor-tool-convert"]')
    const before = await attr(o.page, 'data-tool')
    if (dev.touch) {
      await h.press(c.x, c.y, 700)
      const tip = o.page.locator('[data-testid="editor-tip"]')
      check(`A572 (${D}) ★ appui long : l’infobulle paraît, en hébreu (« ${(await tip.innerText().catch(() => '')).trim()} »)`, (await tip.count()) === 1 && /המרת נקודה/.test(await tip.innerText()))
      check(`A572 (${D}) ★ … et l’outil n’est PAS choisi (on demande son nom, on ne le prend pas)`, (await attr(o.page, 'data-tool')) === before)
      const tb = await tip.boundingBox()
      check(`A572 (${D}) la bulle est entière à l’écran`, !!tb && tb.x >= 0 && tb.x + tb.width <= dev.w)
      await o.page.screenshot({ path: `${SHOTS}/a572-${D}-infobulle.png` })
      await o.page.waitForTimeout(1800)
      check(`A572 (${D}) elle s’en va d’elle-même`, (await tip.count()) === 0)
      await h.tap(c.x, c.y)
      check(`A572 (${D}) un toucher bref, lui, choisit l’outil`, (await attr(o.page, 'data-tool')) === 'convert')
    } else {
      await o.page.mouse.move(c.x, c.y)
      await o.page.waitForTimeout(700)
      const tip = o.page.locator('[data-testid="editor-tip"]')
      check(`A572 (${D}) ★ survol : l’infobulle paraît, en hébreu, avec son raccourci`, (await tip.count()) === 1 && /המרת נקודה/.test(await tip.innerText()) && /⇧C/.test(await tip.innerText()), await tip.innerText().catch(() => ''))
      check(`A572 (${D}) … et le survol ne choisit rien`, (await attr(o.page, 'data-tool')) === before)
      await o.page.screenshot({ path: `${SHOTS}/a572-${D}-infobulle.png` })
      await o.page.mouse.move(c.x, c.y + 300)
      await o.page.waitForTimeout(300)
      check(`A572 (${D}) elle s’en va quand la souris s’en va`, (await tip.count()) === 0)
      /* Le dernier outil de la barre (au bord) : la bulle reste entière. */
      const last = await centreOf(o.page, '[data-testid="editor-menu"]')
      await o.page.mouse.move(last.x, last.y)
      await o.page.waitForTimeout(700)
      const tb = await tip.boundingBox()
      check(`A572 (${D}) au bord de la barre, la bulle reste entière à l’écran`, !!tb && tb.x >= 0 && tb.x + tb.width <= dev.w, tb ? `${Math.round(tb.x)}…${Math.round(tb.x + tb.width)}` : 'absente')
    }
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A573-${D}`, async () => {
    section(`A573 (${D}) — ★ l’outil actif se voit`)
    const { o, h } = await openRegions(dev)
    await pickRegion(h, 'negev')
    for (const id of TOOL_ORDER) {
      await chooseTool(h, id)
      const state = await o.page.locator('[data-testid="editor-tools"] [data-testid^="editor-tool-"]').evaluateAll((els) =>
        els.map((e) => ({ id: (e as HTMLElement).dataset.testid, on: e.getAttribute('aria-checked') === 'true', bg: getComputedStyle(e).backgroundColor })),
      )
      const on = state.filter((x) => x.on)
      const bgOn = on[0]?.bg
      const distinct = state.filter((x) => !x.on).every((x) => x.bg !== bgOn)
      check(`A573 (${D}) « ${id} » : un SEUL outil coché, le sien, et son fond se distingue de tous les autres`, on.length === 1 && on[0].id === `editor-tool-${id}` && distinct && (await attr(o.page, 'data-tool')) === id)
    }
    const filled = await ed(o.page).evaluate((root) => {
      const accent = getComputedStyle(root.querySelector('[data-testid="editor-tools"] [aria-checked="true"]') as Element).backgroundColor
      return [...root.querySelectorAll('button')].filter((b) => getComputedStyle(b).backgroundColor === accent).map((b) => (b as HTMLElement).dataset.testid ?? b.textContent)
    })
    check(`A573 (${D}) ★ dans toute la barre, UN seul bouton a le fond plein de l’outil actif`, filled.length === 1, filled.join(', '))
    const chip = o.page.locator('[data-testid="editor-active-tool"]')
    check(`A573 (${D}) le nom de l’outil en main est écrit dans la barre (« ${(await chip.innerText().catch(() => '')).trim()} »)`, (await chip.isVisible()) && /הזזת הצורה/.test(await chip.innerText()))
    if (!dev.touch) {
      const keys: Array<[string, string]> = [['p', 'pen'], ['+', 'penAdd'], ['-', 'penRemove'], ['Shift+C', 'convert'], ['n', 'pencil'], ['m', 'move'], ['v', 'select']]
      const got: string[] = []
      for (const [k, want] of keys) {
        await o.page.keyboard.press(k)
        await o.page.waitForTimeout(120)
        got.push(`${k}→${await attr(o.page, 'data-tool')}`)
        if ((await attr(o.page, 'data-tool')) !== want) break
      }
      check(`A573 (${D}) les raccourcis d’Illustrator (${got.join(' ')})`, got.length === keys.length && got.every((g, i) => g.endsWith(keys[i][1])))
    }
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A574-${D}`, async () => {
    section(`A574 (${D}) — ★ les surfaces, une fois, en haut`)
    const { o, h } = await openRegions(dev)
    const pills = await o.page.locator('[data-testid^="region-area-"]').evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset.testid!.replace('region-area-', ''), n: Number((e as HTMLElement).innerText.replace(/[^\d]/g, '')) })))
    const exact = pills.every((p) => Math.abs(p.n - Math.round(ringAreaDunams((defaultRing(p.id as never) ?? []).map(([lng, lat]) => ({ lat, lng }))))) <= 1)
    check(`A574 (${D}) ★ chaque pastille de région porte SA surface (13), égale au calcul`, pills.length === 13 && exact, pills.slice(0, 3).map((p) => `${p.id} ${p.n}`).join(' · '))
    await pickRegion(h, 'negev')
    check(`A574 (${D}) ★ plus de rangée de surfaces dans le panneau (le doublon d’en bas)`, (await o.page.locator('[data-testid="editor-shapes"]').count()) === 0)
    const neg = pills.find((p) => p.id === 'negev')!.n
    check(`A574 (${D}) la surface de la barre = celle de la pastille`, Number(await attr(o.page, 'data-area')) === neg, `${await attr(o.page, 'data-area')} / ${neg}`)
    const p = await nodeAt(o.page, 1)
    await h.drag(p.x, p.y, p.x - 60, p.y - 40)
    const now = Number((await o.page.locator('[data-testid="region-area-negev"]').innerText()).replace(/[^\d]/g, ''))
    check(`A574 (${D}) un point tiré : la pastille suit la nouvelle surface`, now === Number(await attr(o.page, 'data-area')) && now !== neg, `${neg} → ${now}`)
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A575-${D}`, async () => {
    section(`A575 (${D}) — ★ le recentrage : une icône en haut à gauche`)
    const { o, h } = await openRegions(dev)
    await pickRegion(h, 'negev')
    const c0 = await camera(o.page)
    check(`A575 (${D}) pas de recentrage tant que le PO n’a pas bougé la carte`, (await o.page.locator('[data-testid="map-recenter"]').count()) === 0)
    const m = await mapBox(o.page)
    await h.drag(m.x + m.width * 0.6, m.y + m.height * 0.75, m.x + m.width * 0.3, m.y + m.height * 0.45)
    await o.page.waitForTimeout(500)
    const rc = o.page.locator('[data-testid="map-recenter"]')
    const inStack = await rc.evaluate((e) => !!e.closest('[data-testid="map-tools"]')).catch(() => false)
    const rb = await rc.boundingBox()
    check(`A575 (${D}) ★ après un geste du PO : UNE icône de recentrage, DANS la pile de la carte`, (await rc.count()) === 1 && inStack)
    const nav = await o.page.locator('[data-testid="map-tools-nav"], [data-testid="map-tools-view"]').last().boundingBox()
    check(`A575 (${D}) ★ à gauche, DANS la pile, juste sous les autres boutons (pas au milieu de la carte), 44 px`, !!rb && !!nav && rb.x + rb.width / 2 < m.x + 80 && rb.y >= nav.y + nav.height && rb.y - (nav.y + nav.height) <= 16 && rb.height >= 44, rb ? `${Math.round(rb.x)},${Math.round(rb.y)}` : '')
    check(`A575 (${D}) c’est une icône (aucun texte)`, (await rc.innerText()).trim() === '' && HEBREW.test((await rc.getAttribute('aria-label')) ?? ''))
    const tools = await o.page.locator('[data-testid="map-tools"]').boundingBox()
    check(`A575 (${D}) elle est AU BOUT de la pile : rien au-dessus d’elle n’a bougé`, !!tools && !!rb && rb.y >= tools.y + tools.height - rb.height - 12)
    await o.page.screenshot({ path: `${SHOTS}/a575-${D}-recentrage.png` })
    const t = await centreOf(o.page, '[data-testid="map-recenter"]')
    await h.tap(t.x, t.y)
    await o.page.waitForTimeout(1200)
    const c1 = await camera(o.page)
    check(`A575 (${D}) ★ un clic : la carte revient (centre ${c1.lat.toFixed(3)},${c1.lng.toFixed(3)}), l’icône s’en va`, Math.abs(c1.lat - c0.lat) < 0.05 && Math.abs(c1.lng - c0.lng) < 0.05 && (await rc.count()) === 0)
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A576-${D}`, async () => {
    section(`A576 (${D}) — ★ la forme d’origine, dite, et son bouton`)
    /* Le compte du PO a la couche « אזורים » ALLUMÉE (mesuré en base) : c'est elle qui montrait l'ancienne version. */
    const { o, h } = await openRegions(dev, dev.w, dev.h, { 'lo-yanum:map-layers': JSON.stringify({ __v: 2, regions: true, regionColors: true, boundaries: true, grazing: true }) })
    const layerOn = await o.page.evaluate(() => {
      const m = (window as unknown as { __loYanumMap: { getLayer(id: string): unknown; getLayoutProperty(id: string, p: string): string } }).__loYanumMap
      return m.getLayer('regions-fill') ? m.getLayoutProperty('regions-fill', 'visibility') : 'absente'
    })
    check(`A576 (${D}) ★ la couche « אזורים » (l’ancienne version ENREGISTRÉE) n’est pas dessinée sous l’éditeur, même allumée`, layerOn === 'none', layerOn)
    await pickRegion(h, 'negev')
    const n0 = await nodes(o.page)
    check(`A576 (${D}) à l’ouverture, rien à comparer : pas de mention`, (await o.page.locator('[data-testid="editor-ghost-note"]').count()) === 0)
    const p = await nodeAt(o.page, 2)
    await h.drag(p.x, p.y, p.x + 70, p.y + 50)
    const ghost = o.page.locator('[data-testid="editor-ghost"]')
    check(`A576 (${D}) ★ un point tiré : la forme d’ORIGINE reste dessous, en pointillés (${await ghost.getAttribute('data-ring').catch(() => '?')} sommets)`, (await ghost.count()) === 1 && Number(await ghost.getAttribute('data-ring')) === n0)
    const note = o.page.locator('[data-testid="editor-ghost-note"]')
    check(`A576 (${D}) ★ et c’est DIT dans la barre (« ${(await note.innerText().catch(() => '')).trim()} »)`, (await note.count()) === 1 && /מקווקו/.test(await note.innerText()) && /להשוואה/.test(await note.innerText()))
    await o.page.screenshot({ path: `${SHOTS}/a576-${D}-origine.png` })
    const tg = await centreOf(o.page, '[data-testid="editor-ghost-toggle"]')
    await h.tap(tg.x, tg.y)
    check(`A576 (${D}) ★ le bouton la MASQUE`, (await ghost.count()) === 0 && (await attr(o.page, 'data-ghost')) === '0' && (await o.page.locator('[data-testid="editor-ghost-toggle"]').getAttribute('aria-pressed')) === 'false')
    await h.tap(tg.x, tg.y)
    check(`A576 (${D}) … et la remontre`, (await ghost.count()) === 1 && (await attr(o.page, 'data-ghost')) === '1')
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A577-${D}`, async () => {
    section(`A577 (${D}) — ★ « שחזור המקור » : dans « ⋯ », derrière une confirmation`)
    const { o, h } = await openRegions(dev)
    await pickRegion(h, 'negev')
    check(`A577 (${D}) ★ il n’est plus dans la barre (menu fermé : absent)`, (await o.page.locator('[data-testid="region-restore"]').count()) === 0)
    /* Une région jamais redessinée : rien à restaurer, et c'est dit. */
    let mb = await centreOf(o.page, '[data-testid="editor-menu"]')
    await h.tap(mb.x, mb.y)
    check(`A577 (${D}) dans « ⋯ » : présent, ÉTEINT tant que la région n’a pas été redessinée`, (await o.page.locator('[data-testid="region-restore"]').isDisabled()) && /לא צויר/.test(await o.page.locator('[data-testid="region-restore"]').innerText()))
    /* Refermer le menu par son bouton (Échap, lui, fermerait l'édition). */
    await h.tap(mb.x, mb.y)
    /* Redessiner : un point déplacé, enregistré. */
    const p = await nodeAt(o.page, 3)
    await h.drag(p.x, p.y, p.x + 50, p.y - 40)
    const sv = await centreOf(o.page, '[data-testid="region-save"]')
    await h.tap(sv.x, sv.y)
    await o.page.waitForTimeout(800)
    const saved = JSON.parse(String(await o.page.evaluate(() => localStorage.getItem('lo-yanum:region-rings')))) as Record<string, unknown[]>
    check(`A577 (${D}) la région redessinée est enregistrée`, Array.isArray(saved?.negev))
    mb = await centreOf(o.page, '[data-testid="editor-menu"]')
    await h.tap(mb.x, mb.y)
    const rs = await centreOf(o.page, '[data-testid="region-restore"]')
    await h.tap(rs.x, rs.y)
    const cf = o.page.locator('[data-testid="region-restore-confirm"]')
    const text = (await cf.innerText().catch(() => '')).replace(/\s+/g, ' ')
    check(`A577 (${D}) ★ la confirmation NOMME ce qui sera effacé (« הנגב », ses points, sa surface) et COMPTE les formes (une)`, (await cf.count()) === 1 && /הנגב/.test(text) && /\d+ נקודות/.test(text) && /דונם/.test(text) && /צורה אחת/.test(text), text)
    check(`A577 (${D}) la confirmation est dans la barre, pas sur la carte`, !overlaps((await cf.boundingBox())!, await mapBox(o.page)))
    await o.page.screenshot({ path: `${SHOTS}/a577-${D}-confirmation.png` })
    await o.page.locator('[data-testid="region-restore-confirm"] button', { hasText: 'ביטול' }).click()
    await o.page.waitForTimeout(300)
    const still = JSON.parse(String(await o.page.evaluate(() => localStorage.getItem('lo-yanum:region-rings')))) as Record<string, unknown[]> | null
    check(`A577 (${D}) « ביטול » : rien n’est effacé`, Array.isArray(still?.negev))
    mb = await centreOf(o.page, '[data-testid="editor-menu"]')
    await h.tap(mb.x, mb.y)
    const rs2 = await centreOf(o.page, '[data-testid="region-restore"]')
    await h.tap(rs2.x, rs2.y)
    const yes = await centreOf(o.page, '[data-testid="region-restore-yes"]')
    await h.tap(yes.x, yes.y)
    await o.page.waitForTimeout(800)
    const after = await o.page.evaluate(() => localStorage.getItem('lo-yanum:region-rings'))
    check(`A577 (${D}) ★ confirmé : la limite d’origine revient (la région redessinée est effacée)`, after === null || !('negev' in (JSON.parse(after) as object)))
    check(`A577 (${D}) l’annulation reste DANS la barre`, await o.page.locator('[data-testid="editor-undo"]').isVisible())
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A578-${D}`, async () => {
    section(`A578 (${D}) — ★ les nouveaux outils, geste par geste`)
    const { db, bCenter } = blDb()
    const { o, h } = await openFarm(db, dev)
    await openBoundary(h, bCenter)
    const n0 = await nodes(o.page)

    /* La plume « + » : toucher le contour (pas le « + » du milieu) au quart d'un segment. */
    /* Plus près (zoom 17,3) : des segments de plus de 100 px, comme quand on retouche un bord. */
    await frame(o.page, bCenter, 17.3)
    await chooseTool(h, 'penAdd')
    /* Le plus long segment, touché à 26 px de son premier point : loin du « + » du milieu. */
    let seg = 0
    let best = 0
    const mz = await mapBox(o.page)
    const inside = (p: { x: number; y: number }) => p.x > mz.x + 40 && p.x < mz.x + mz.width - 40 && p.y > mz.y + 40 && p.y < mz.y + mz.height - 40
    for (let i = 0; i < n0; i++) {
      const a = await nodeAt(o.page, i)
      const b = await nodeAt(o.page, (i + 1) % n0)
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L > best && inside(a) && inside(b)) {
        best = L
        seg = i
      }
    }
    const a = await nodeAt(o.page, seg)
    const b = await nodeAt(o.page, (seg + 1) % n0)
    const q = { x: a.x + ((b.x - a.x) * 26) / best, y: a.y + ((b.y - a.y) * 26) / best }
    await h.tap(q.x, q.y)
    if (process.env.BL_DEBUG) {
      await o.page.screenshot({ path: `private/bl/debug-a578-${D}.png` })
      console.log('q', q, 'seg', seg, 'best', best, 'nodes', await nodes(o.page), 'notice', await o.page.locator('[data-testid="editor-notice"]').innerText().catch(() => ''))
    }
    check(`A578 (${D}) ★ plume + : toucher le contour ajoute UN point (${n0} → ${await nodes(o.page)}), écrit en base`, (await nodes(o.page)) === n0 + 1 && (await until(() => dbRing(db, B).length === n0 + 1)))
    const np = await nodeAt(o.page, seg + 1)
    check(`A578 (${D}) … LÀ où on a touché (${Math.round(Math.hypot(np.x - q.x, np.y - q.y))} px)`, Math.hypot(np.x - q.x, np.y - q.y) < 6)
    /* Au milieu de la forme, à 200 px du contour. */
    const far = await project(o.page, bCenter)
    await h.tap(far.x, far.y)
    check(`A578 (${D}) plume + loin du contour : rien n’est ajouté, et c’est dit`, (await nodes(o.page)) === n0 + 1 && (await o.page.locator('[data-testid="editor-notice"]').count()) === 1)
    await frame(o.page, bCenter)

    /* La plume « − » : toucher un point le supprime. */
    await chooseTool(h, 'penRemove')
    const d2 = await nodeAt(o.page, 2)
    await h.tap(d2.x, d2.y)
    check(`A578 (${D}) ★ plume − : toucher un point le SUPPRIME (${n0 + 1} → ${await nodes(o.page)}), écrit en base`, (await nodes(o.page)) === n0 && (await until(() => dbRing(db, B).length === n0)))

    /* La conversion : toucher = coin ↔ arrondi ; tirer = poignées symétriques. */
    await chooseTool(h, 'convert')
    const c3 = await nodeAt(o.page, 3)
    await h.tap(c3.x, c3.y)
    check(`A578 (${D}) ★ conversion, toucher : le coin devient ARRONDI`, (await o.page.locator('[data-testid="editor-node-3"]').getAttribute('data-kind')) === 'smooth' && (await until(() => dbPath(db, B)?.nodes[3].kind === 'smooth')))
    await h.tap(c3.x, c3.y)
    check(`A578 (${D}) conversion, toucher encore : il redevient COIN`, (await o.page.locator('[data-testid="editor-node-3"]').getAttribute('data-kind')) === 'corner')
    const c6 = await nodeAt(o.page, 6)
    await h.drag(c6.x, c6.y, c6.x + 40, c6.y - 30)
    const m6 = dbPath(db, B)?.nodes[6]
    const sym = !!m6?.hIn && !!m6?.hOut && Math.abs(m6.hIn.lat + m6.hOut.lat) < 1e-12 && Math.abs(m6.hIn.lng + m6.hOut.lng) < 1e-12
    check(`A578 (${D}) ★ conversion, TIRER depuis un point : ses deux poignées sortent, SYMÉTRIQUES (écrit en base)`, (await until(() => dbPath(db, B)?.nodes[6].kind === 'smooth')) && sym)
    const n6 = await nodeAt(o.page, 6)
    check(`A578 (${D}) … et le point lui-même n’a pas bougé`, Math.hypot(n6.x - c6.x, n6.y - c6.y) < 2)

    /* Le déplacement : glisser n'importe où (même sur un point) déplace la forme entière. */
    await chooseTool(h, 'move')
    const r0 = dbRing(db, B)
    const s0 = await nodeAt(o.page, 0)
    await h.drag(s0.x, s0.y, s0.x - 45, s0.y + 35)
    await until(() => dbRing(db, B).length === r0.length && dbRing(db, B)[0].lat !== r0[0].lat)
    const r1 = dbRing(db, B)
    const dLat = r1[0].lat - r0[0].lat
    const dLng = r1[0].lng - r0[0].lng
    check(`A578 (${D}) ★ déplacement : saisie SUR un point, c’est la forme ENTIÈRE qui bouge, du même décalage`, Math.abs(dLat) > 1e-6 && r1.length === r0.length && r1.every((p, i) => Math.abs(p.lat - r0[i].lat - dLat) < 1e-9 && Math.abs(p.lng - r0[i].lng - dLng) < 1e-9))
    const cam0 = await camera(o.page)
    const mb = await mapBox(o.page)
    await h.drag(mb.x + mb.width * 0.15, mb.y + mb.height * 0.85, mb.x + mb.width * 0.2, mb.y + mb.height * 0.8)
    const cam1 = await camera(o.page)
    check(`A578 (${D}) avec la croix, la carte ne glisse pas sous le doigt`, Math.abs(cam1.lat - cam0.lat) < 1e-9 && Math.abs(cam1.lng - cam0.lng) < 1e-9)

    /* Un geste, une annulation. */
    const undo = await centreOf(o.page, '[data-testid="editor-undo"]')
    await h.tap(undo.x, undo.y)
    await h.tap(undo.x, undo.y)
    check(`A578 (${D}) annuler défait le déplacement (la base revient)`, await until(() => dbRing(db, B).length === r0.length && Math.abs(dbRing(db, B)[0].lat - r0[0].lat) < 1e-12))
    await o.page.screenshot({ path: `${SHOTS}/a578-${D}-outils.png` })
    await o.ctx.close()
  })
}

// ===========================================================================
await guard('A579', async () => {
  section('A579 — ★ l’iPad en écran partagé : la barre ne déborde pas')
  for (const w of [678, 507]) {
    const dev = DEVICES[1]
    const { o, h } = await openRegions(dev, w, 1366)
    await pickRegion(h, 'negev')
    const r = await ed(o.page).evaluate((e) => {
      const b = e.getBoundingClientRect()
      const kids = [...e.querySelectorAll('button')].map((x) => x.getBoundingClientRect()).filter((x) => x.width > 0)
      return { left: b.left, right: b.right, sw: e.scrollWidth, cw: e.clientWidth, minX: Math.min(...kids.map((k) => k.left)), maxX: Math.max(...kids.map((k) => k.right)), doc: document.documentElement.scrollWidth, win: window.innerWidth }
    })
    check(`A579 (${w} px) ★ la barre ne déborde pas (contenu ${r.sw} ≤ ${r.cw})`, r.sw <= r.cw + 1)
    check(`A579 (${w} px) ★ chaque bouton est entier à l’écran (${Math.round(r.minX)} … ${Math.round(r.maxX)})`, r.minX >= 0 && r.maxX <= w)
    check(`A579 (${w} px) la page ne défile pas de côté`, r.doc <= r.win)
    const tools = await o.page.locator('[data-testid="editor-tools"] [data-testid^="editor-tool-"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ w: b.width, h: b.height })))
    check(`A579 (${w} px) les sept outils gardent 44 px`, tools.length === 7 && tools.every((t) => t.w >= 44 && t.h >= 44))
    const bar = await box(o.page, '[data-testid="shape-editor"]')
    const m = await mapBox(o.page)
    check(`A579 (${w} px) la barre reste au-dessus de la carte, et la carte garde de la place (${Math.round(m.height)} px)`, !!bar && bar.y + bar.height <= m.y + 0.5 && m.height >= 500)
    await o.page.screenshot({ path: `${SHOTS}/a579-partage-${w}.png` })
    await o.ctx.close()
  }
  /* La carte d'une ferme, en écran partagé. */
  const { db, bCenter } = blDb()
  const { o, h } = await openFarm(db, DEVICES[1], 507, 1366)
  await openBoundary(h, bCenter)
  const r = await ed(o.page).evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, maxX: Math.max(...[...e.querySelectorAll('button')].map((x) => x.getBoundingClientRect().right)) }))
  check(`A579 (ferme, 507 px) la barre ne déborde pas`, r.sw <= r.cw + 1 && r.maxX <= 507)
  await o.page.screenshot({ path: `${SHOTS}/a579-partage-ferme-507.png` })
  await o.ctx.close()
})

// ===========================================================================
await guard('A580', async () => {
  section('A580 — « שרטוט מחדש » : la forme remplacée en pointillés, nommée')
  const { db, bCenter } = blDb()
  const dev = DEVICES[0]
  const { o, h } = await openFarm(db, dev)
  await openBoundary(h, bCenter)
  const mb = await centreOf(o.page, '[data-testid="editor-menu"]')
  await h.tap(mb.x, mb.y)
  await o.page.locator('[data-testid="editor-replace"]').click()
  await o.page.locator('[data-testid="zone-replace-yes"]').click()
  await o.page.waitForTimeout(800)
  check('A580 un tracé neuf commence', (await attr(o.page, 'data-mode')) === 'new')
  const washes = await o.page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap: { getSource(id: string): { _data?: { features?: Array<{ properties?: { id?: string } }> } } | undefined } }).__loYanumMap
    const src = m.getSource('zones') as { _data?: { features?: Array<{ properties?: { id?: string } }> } } | undefined
    return (src?._data?.features ?? []).map((f) => f.properties?.id ?? '')
  })
  check(`A580 ★ la forme remplacée n’est plus un aplat sur la carte (${washes.join(', ')})`, !washes.includes(B))
  const ghost = o.page.locator('[data-testid="editor-ghost"]')
  check('A580 ★ elle est en POINTILLÉS', (await ghost.count()) === 1)
  const note = o.page.locator('[data-testid="editor-ghost-note"]')
  check(`A580 ★ et la barre dit ce que c’est (« ${(await note.innerText().catch(() => '')).trim()} »)`, /תוחלף/.test(await note.innerText().catch(() => '')))
  await o.page.screenshot({ path: `${SHOTS}/a580-remplacer.png` })
  const tg = await centreOf(o.page, '[data-testid="editor-ghost-toggle"]')
  await h.tap(tg.x, tg.y)
  check('A580 le bouton la masque aussi ici', (await ghost.count()) === 0)
  await o.ctx.close()
})

// ===========================================================================
/* Les captures du rapport : l'écran des régions sur iPad, la région ouverte. */
await guard('capture-ipad', async () => {
  const { o, h } = await openRegions(DEVICES[1])
  await pickRegion(h, 'negev')
  await o.page.screenshot({ path: `${SHOTS}/ipad-barre-apres.png` })
  await o.ctx.close()
})

await finish()
