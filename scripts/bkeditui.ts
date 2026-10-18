import { mkdirSync } from 'node:fs'

import type { CDPSession, Page } from 'playwright'

import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import type { Opened } from './ayharness'
import { FakeDb, USER_ID } from './fake-supabase'
import { densify, parsePath, ringAreaDunams } from '../src/core/index'
import type { LatLng } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BK — CHANTIER 2 AU RENDU : L'ÉDITEUR DE TRACÉS, GESTE PAR GESTE,
 *      AU DOIGT ET À LA SOURIS.                         A550 … A568
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bkeditui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bkeditui    # le DÉPLOYÉ
 *
 * La ferme du PO (`farm-ak1-11`) reproduite SANS ses coordonnées : une limite
 * de 12 sommets entièrement contenue dans une zone de pâturage de 10 sommets —
 * la superposition réelle (docs/bk/diagnostic.md § 1). Chaque geste est fait
 * deux fois, dans deux appareils :
 *   · « souris » : 1 440 × 900, la souris et le clavier ;
 *   · « doigt »  : iPad 1 032 × 1 376, des TOUCHERS réels (CDP
 *                  `Input.dispatchTouchEvent`), y compris les glissés et le
 *                  pincement à deux doigts.
 * Chaque geste est vérifié À L'ÉCRAN (le panneau, les nœuds) ET EN BASE (la
 * base factice qui joue le serveur : `zones.path`, `zone_vertices`).
 *
 *   A550  le panneau : l'entité, la forme, les points, la surface — et rien de
 *         technique ; la surface du panneau = celle de la base
 *   A551  ★ deux formes superposées : un toucher dans la petite propose LES
 *         DEUX, la plus petite d'abord ; on choisit, on passe de l'une à
 *         l'autre par le panneau
 *   A552  ★ toucher un point le SÉLECTIONNE (ne le supprime pas) ; le
 *         supprimer : bouton (doigt), touche Suppr (souris) ; écrit en base
 *   A553  ★ ajouter un point sur un segment : toucher le « + », ou le tirer
 *   A554  ★ déplacer un point ; la carte ne glisse PAS sous le doigt
 *   A555  ★ arrondir un point (toucher deux fois), tirer sa poignée ; la forme
 *         rouverte après rechargement a GARDÉ ses poignées
 *   A556  ★ annuler / refaire : quatre gestes, quatre annulations → la base
 *         revient EXACTEMENT à l'anneau d'origine ; quatre « refaire »
 *   A557  déplacer la forme entière (✥)
 *   A558  ★ supprimer une forme entière, avec confirmation qui la nomme
 *   A559  ★ une forme neuve à la plume : des touchers, un toucher tiré (point
 *         arrondi), le premier point la ferme
 *   A560  ★ passer de la plume à la main levée EN COURS de tracé
 *   A561  la main levée sur une forme existante remplace la portion longée
 *   A562  « שרטוט מחדש » : la nouvelle forme remplace l'ancienne, confirmé
 *   A563  une forme ANCIENNE (sans tracé) s'ouvre en coins, et l'ouvrir sans
 *         rien toucher n'écrit rien
 *   A564  l'écran des régions : le même éditeur ; un toucher ne supprime plus
 *   A565  le panneau de diagnostic n'est plus sur les cartes
 *   A566  les brouillons abandonnés : nommés, nettoyés sur confirmation,
 *         jamais une forme enregistrée
 *   A567  l'accroche aux routes (les tuiles déjà chargées)
 *   A568  deux doigts en mode plume : un pincement, jamais un point
 */

const OUT = process.env.DIST ?? 'dist-bkedit'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5506), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bk/editor-${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

const FARM = 'farm-ak1-11'
const B = 'zone-bk-boundary'
const G = 'zone-bk-grazing'

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

function bkDb(): { db: FakeDb; center: LatLng; bCenter: LatLng; name: string } {
  const d = new FakeDb()
  seed(d)
  d.rows('entities').forEach((r, n) => {
    const k = String(n + 1).padStart(2, '0')
    Object.assign(r, { name: `חוות בדיקה ${k}`, farm_name: '', farmer_name: `חקלאי ${k}`, farmer_phone: `050-000-14${k}`, farmer_email: '', liaison_name: '', liaison_phone: '', standby_phone: '', notes: '', farmer_id_no: '' })
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
  return { db: d, center, bCenter, name: String(f.name) }
}

const dbRing = (db: FakeDb, id: string): LatLng[] =>
  db
    .rows('zone_vertices')
    .filter((v) => v.zone_id === id)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((v) => ({ lat: Number(v.lat), lng: Number(v.lng) }))
const dbPath = (db: FakeDb, id: string) => parsePath(db.rows('zones').find((z) => z.id === id)?.path ?? null)
const zoneIds = (db: FakeDb) => db.rows('zones').filter((z) => z.entity_id === FARM).map((z) => String(z.id))
/** Attendre la BASE (l'écriture passe par la file d'envoi) : vrai dès que la condition l'est, faux après 4 s. */
async function until(f: () => boolean, ms = 4000): Promise<boolean> {
  for (let t = 0; t < ms; t += 100) {
    if (f()) return true
    await Bun.sleep(100)
  }
  return f()
}
const sameRing = (a: LatLng[], b: LatLng[]) => a.length === b.length && a.every((p, i) => Math.abs(p.lat - b[i].lat) < 1e-12 && Math.abs(p.lng - b[i].lng) < 1e-12)

// ---------------------------------------------------------------------------
// Les gestes, à la souris et au doigt
// ---------------------------------------------------------------------------

interface Hand {
  dev: Device
  page: Page
  cdp: CDPSession | null
  tap(x: number, y: number): Promise<void>
  drag(x0: number, y0: number, x1: number, y1: number, steps?: number): Promise<void>
  stroke(points: Array<{ x: number; y: number }>): Promise<void>
  doubleTap(x: number, y: number): Promise<void>
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
    async doubleTap(x, y) {
      for (let k = 0; k < 2; k++) {
        if (dev.touch) {
          await touch('touchStart', [{ x, y }])
          await page.waitForTimeout(30)
          await touch('touchEnd', [])
        } else {
          await page.mouse.move(x, y)
          await page.mouse.down()
          await page.mouse.up()
        }
        await page.waitForTimeout(90)
      }
      await page.waitForTimeout(350)
    },
    async stroke(points) {
      if (dev.touch) {
        await touch('touchStart', [points[0]])
        for (const p of points.slice(1)) {
          await touch('touchMove', [p])
          await page.waitForTimeout(8)
        }
        await touch('touchEnd', [])
      } else {
        await page.mouse.move(points[0].x, points[0].y)
        await page.mouse.down()
        for (const p of points.slice(1)) await page.mouse.move(p.x, p.y)
        await page.mouse.up()
      }
      await page.waitForTimeout(600)
    },
  }
}

const centreOf = async (page: Page, sel: string) => {
  const b = await page.locator(sel).first().boundingBox()
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
const ed = (page: Page) => page.locator('[data-testid="shape-editor"]').first()
const attr = async (page: Page, a: string) => (await ed(page).getAttribute(a, { timeout: 2000 }).catch(() => null)) ?? ''
const nodes = async (page: Page) => Number(await attr(page, 'data-nodes'))

async function openFarm(db: FakeDb, dev: Device, init: Record<string, string> = {}): Promise<{ o: Opened; h: Hand }> {
  const o = await open(dev.w, { db, height: dev.h, touch: dev.touch, init: { 'lo-yanum:map-mode:farm-detail': 'full', [`lo-yanum:farm-tab:${FARM}`]: 'terrain', ...init } })
  await go(o.page, APP, `/coordinator/farms/${FARM}`, 7000)
  return { o, h: await hand(o, dev) }
}
/** Cadrer la carte sur la petite forme, au zoom 15,5. */
async function frame(page: Page, c: LatLng, zoom = 15.5): Promise<void> {
  await page.evaluate(
    ({ c: q, z }) => (window as unknown as { __loYanumMap: { jumpTo(o: unknown): void } }).__loYanumMap.jumpTo({ center: [q.lng, q.lat], zoom: z }),
    { c, z: zoom },
  )
  await page.waitForTimeout(900)
}
/** Ouvrir la limite : un toucher dedans, puis le choix. */
async function openBoundary(h: Hand, bCenter: LatLng): Promise<void> {
  await frame(h.page, bCenter)
  const p = await project(h.page, { lat: bCenter.lat, lng: bCenter.lng + 0.0012 })
  await h.tap(p.x, p.y)
  if ((await h.page.locator('[data-testid="shape-picker"]').count()) > 0) {
    await h.page.locator(`[data-testid="shape-pick-${B}"]`).click()
    await h.page.waitForTimeout(800)
  }
}
async function done(page: Page): Promise<void> {
  await page.locator('[data-testid="editor-done"]').first().click({ timeout: 2000 }).catch(() => undefined)
  await page.waitForTimeout(400)
}

// ===========================================================================
for (const dev of devices) {
  const D = dev.name
  // -------------------------------------------------------------------------
  await guard(`A550-${D}`, async () => {
    section(`A550 (${D}) — le panneau : l’entité, la forme, les points, la surface`)
    const { db, center, name } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await frame(o.page, center, 13.2)
    const p = await project(o.page, { lat: center.lat - 0.008, lng: center.lng - 0.009 })
    await h.tap(p.x, p.y)
    check(`A550 (${D}) un toucher dans le pâturage (seul sous le doigt) l’ouvre directement`, (await attr(o.page, 'data-shape')) === G, await attr(o.page, 'data-shape'))
    const text = (await ed(o.page).innerText()).replace(/\s+/g, ' ')
    check(`A550 (${D}) l’ENTITÉ est nommée (la ferme)`, text.includes(name), text.slice(0, 80))
    check(`A550 (${D}) la FORME est nommée (« שטח מרעה »)`, text.includes('שטח מרעה'))
    check(`A550 (${D}) le NOMBRE DE POINTS (10)`, text.includes('10 נקודות') && (await nodes(o.page)) === 10)
    const area = Math.round(ringAreaDunams(dbRing(db, G)))
    check(`A550 (${D}) ★ la SURFACE du panneau = celle de la base (${area} ד׳)`, Number(await attr(o.page, 'data-area')) === area && text.replace(/[^\d]/g, ' ').includes(String(area).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').split(' ')[0]))
    check(`A550 (${D}) ★ rien de technique : pas de clé, pas d’identifiant, pas de version`, !/lo-yanum|zone-|farm-ak|\(BI\)|\(BJ\)|version|Service worker|#h:/i.test(text), text)
    check(`A550 (${D}) écrit de droite à gauche`, (await ed(o.page).getAttribute('dir')) === 'rtl')
    await o.page.screenshot({ path: `${SHOTS}/a550-${D}-panneau.png` })
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A551-${D}`, async () => {
    section(`A551 (${D}) — ★ deux formes superposées : laquelle ?`)
    const { db, bCenter } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await frame(o.page, bCenter)
    const p = await project(o.page, { lat: bCenter.lat, lng: bCenter.lng + 0.0012 })
    await h.tap(p.x, p.y)
    const picker = o.page.locator('[data-testid="shape-picker"]')
    check(`A551 (${D}) ★ un toucher DANS la limite (dans le pâturage) : un choix s’ouvre`, (await picker.count()) === 1)
    const ids = await picker.locator('[data-testid^="shape-pick-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    check(`A551 (${D}) ★ il propose les DEUX, la plus petite (la limite) d’abord`, ids.join() === `shape-pick-${B},shape-pick-${G}`, ids.join())
    check(`A551 (${D}) chacune est NOMMÉE avec sa surface`, /גבול החווה[\s\S]*דונם[\s\S]*שטח מרעה[\s\S]*דונם/.test(await picker.innerText()))
    await o.page.screenshot({ path: `${SHOTS}/a551-${D}-choix.png` })
    await o.page.locator(`[data-testid="shape-pick-${B}"]`).click()
    await o.page.waitForTimeout(800)
    check(`A551 (${D}) ★ la limite — inatteignable avant BK — est ouverte`, (await attr(o.page, 'data-shape')) === B)
    check(`A551 (${D}) le panneau liste les 2 formes de la ferme`, (await o.page.locator('[data-testid="editor-shapes"]').getAttribute('data-count')) === '2')
    const chip = await centreOf(o.page, `[data-testid="shape-chip-${G}"]`)
    await h.tap(chip.x, chip.y)
    check(`A551 (${D}) on passe au pâturage par le panneau`, (await attr(o.page, 'data-shape')) === G)
    const chipB = await centreOf(o.page, `[data-testid="shape-chip-${B}"]`)
    await h.tap(chipB.x, chipB.y)
    check(`A551 (${D}) … et on revient à la limite`, (await attr(o.page, 'data-shape')) === B)
    check(`A551 (${D}) la forme éditée est dessinée PAR-DESSUS (surcouche)`, (await o.page.locator('[data-testid="editor-shape"]').count()) === 1)
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A552-${D}`, async () => {
    section(`A552 (${D}) — ★ toucher un point le sélectionne ; le supprimer`)
    const { db, bCenter } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await openBoundary(h, bCenter)
    const n0 = await nodes(o.page)
    const p3 = await nodeAt(o.page, 3)
    await h.tap(p3.x, p3.y)
    check(`A552 (${D}) ★ toucher le point 4 le SÉLECTIONNE`, (await attr(o.page, 'data-selected-node')) === '3' && (await o.page.locator('[data-testid="editor-node-3"]').getAttribute('data-selected')) === '1')
    check(`A552 (${D}) ★ … et ne le supprime PAS (${n0} points, base intacte)`, (await nodes(o.page)) === n0 && dbRing(db, B).length === 12)
    await o.page.screenshot({ path: `${SHOTS}/a552-${D}-selection.png` })
    if (dev.touch) {
      const del = await centreOf(o.page, '[data-testid="editor-node-delete"]')
      await h.tap(del.x, del.y)
    } else await o.page.locator('[data-testid="editor-node-delete"]').click()
    await o.page.waitForTimeout(400)
    check(`A552 (${D}) ★ « מחיקת הנקודה » : ${n0 - 1} points à l’écran, ${n0 - 1} en base`, (await nodes(o.page)) === n0 - 1 && (await until(() => dbRing(db, B).length === n0 - 1)), `${await nodes(o.page)} · ${dbRing(db, B).length}`)
    const p5 = await nodeAt(o.page, 5)
    await h.tap(p5.x, p5.y)
    if (dev.touch) {
      const del = await centreOf(o.page, '[data-testid="editor-node-delete"]')
      await h.tap(del.x, del.y)
    } else await o.page.keyboard.press('Delete')
    await o.page.waitForTimeout(400)
    check(`A552 (${D}) ★ ${dev.touch ? 'encore au doigt (le bouton)' : 'la touche Suppr'} : ${n0 - 2} points, en base aussi`, (await nodes(o.page)) === n0 - 2 && (await until(() => dbRing(db, B).length === n0 - 2)))
    if (!dev.touch) {
      const p1 = await nodeAt(o.page, 1)
      await h.tap(p1.x, p1.y)
      await o.page.keyboard.press('Backspace')
      await o.page.waitForTimeout(400)
      check(`A552 (${D}) ★ la touche ⌫ aussi`, (await nodes(o.page)) === n0 - 3 && (await until(() => dbRing(db, B).length === n0 - 3)))
    }
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A553-${D}`, async () => {
    section(`A553 (${D}) — ★ ajouter un point sur un segment`)
    const { db, bCenter } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await openBoundary(h, bCenter)
    const mids = await o.page.locator('[data-testid^="editor-mid-"]').count()
    check(`A553 (${D}) un « + » au milieu de chaque segment (${mids}), CREUX — pas un point`, mids >= 6)
    const m = await centreOf(o.page, '[data-testid="editor-mid-0"]')
    await h.tap(m.x, m.y)
    check(`A553 (${D}) ★ toucher le « + » ajoute un point (13), en base aussi, et le sélectionne`, (await nodes(o.page)) === 13 && (await until(() => dbRing(db, B).length === 13)) && (await attr(o.page, 'data-selected-node')) === '1')
    const m2 = await centreOf(o.page, '[data-testid="editor-mid-4"]')
    await h.drag(m2.x, m2.y, m2.x + 40, m2.y - 30)
    await until(() => dbRing(db, B).length === 14)
    const target = await o.page.evaluate(({ x, y }) => {
      const mm = (window as unknown as { __loYanumMap: { unproject(p: [number, number]): { lat: number; lng: number }; getContainer(): HTMLElement } }).__loYanumMap
      const r = mm.getContainer().getBoundingClientRect()
      return mm.unproject([x - r.left, y - r.top])
    }, { x: m2.x + 40, y: m2.y - 30 })
    const ring = dbRing(db, B)
    const nearest = Math.min(...ring.map((p) => Math.hypot((p.lat - target.lat) * 110_574, (p.lng - target.lng) * 95_000)))
    check(`A553 (${D}) ★ tirer un « + » pose le point LÀ où on le lâche (14 points ; écart ${nearest.toFixed(1)} m)`, (await nodes(o.page)) === 14 && ring.length === 14 && nearest < 3)
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A554-${D}`, async () => {
    section(`A554 (${D}) — ★ déplacer un point ; la carte ne glisse pas`)
    const { db, bCenter } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await openBoundary(h, bCenter)
    const before = dbRing(db, B)
    const cam0 = await camera(o.page)
    const p = await nodeAt(o.page, 2)
    await h.drag(p.x, p.y, p.x + 60, p.y + 45)
    const cam1 = await camera(o.page)
    await until(() => dbRing(db, B)[2]?.lat !== before[2].lat)
    const after = dbRing(db, B)
    const moved = after.filter((q, i) => q.lat !== before[i].lat || q.lng !== before[i].lng).length
    check(`A554 (${D}) ★ le point 3 a bougé, lui seul (${moved} sommet changé)`, moved === 1 && after[2].lat !== before[2].lat)
    check(`A554 (${D}) ★ la carte n’a PAS glissé sous le geste`, Math.abs(cam1.lat - cam0.lat) < 1e-9 && Math.abs(cam1.lng - cam0.lng) < 1e-9, `${cam0.lat},${cam0.lng} → ${cam1.lat},${cam1.lng}`)
    const q = await nodeAt(o.page, 2)
    check(`A554 (${D}) le point est sous le doigt, là où il a été lâché`, Math.hypot(q.x - (p.x + 60), q.y - (p.y + 45)) < 3)
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A555-${D}`, async () => {
    section(`A555 (${D}) — ★ arrondir un point, tirer sa poignée ; rouvrir garde les poignées`)
    const { db, bCenter } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await openBoundary(h, bCenter)
    const p = await nodeAt(o.page, 3)
    await h.doubleTap(p.x, p.y)
    check(`A555 (${D}) ★ toucher deux fois : le point devient ARRONDI`, (await o.page.locator('[data-testid="editor-node-3"]').getAttribute('data-kind')) === 'smooth')
    check(`A555 (${D}) ses deux poignées paraissent`, (await o.page.locator('[data-testid^="editor-handle-3-"]').count()) === 2)
    check(`A555 (${D}) ★ la forme réelle est densifiée en base (sommets > 12 points)`, await until(() => dbRing(db, B).length > 12 && dbPath(db, B)?.nodes[3].kind === 'smooth'), `${dbRing(db, B).length}`)
    const hd = await centreOf(o.page, '[data-testid="editor-handle-3-out"] g')
    const ringBefore = dbRing(db, B)
    await h.drag(hd.x, hd.y, hd.x + 35, hd.y - 35)
    await until(() => !sameRing(ringBefore, dbRing(db, B)))
    const pathAfter = dbPath(db, B)
    check(`A555 (${D}) ★ tirer la poignée change la courbe (base) et l’autre poignée reste alignée`, !sameRing(ringBefore, dbRing(db, B)) && !!pathAfter?.nodes[3].hIn && !!pathAfter?.nodes[3].hOut)
    check(`A555 (${D}) ★ les deux calculs de surface restent égaux sur la forme densifiée`, Number(await attr(o.page, 'data-area')) === Math.round(ringAreaDunams(dbRing(db, B))))
    await o.page.screenshot({ path: `${SHOTS}/a555-${D}-arrondi.png` })
    /* Le bouton aussi (une autre forme d'arrondir), puis on revient au coin. */
    const p6 = await nodeAt(o.page, 6)
    await h.tap(p6.x, p6.y)
    const kindBtn = await centreOf(o.page, '[data-testid="editor-node-kind"]')
    await h.tap(kindBtn.x, kindBtn.y)
    check(`A555 (${D}) « פינה מעוגלת » (le bouton) arrondit aussi`, (await o.page.locator('[data-testid="editor-node-6"]').getAttribute('data-kind')) === 'smooth')
    const kindBtn2 = await centreOf(o.page, '[data-testid="editor-node-kind"]')
    await h.tap(kindBtn2.x, kindBtn2.y)
    check(`A555 (${D}) « פינה חדה » le remet en coin`, (await o.page.locator('[data-testid="editor-node-6"]').getAttribute('data-kind')) === 'corner')
    await done(o.page)
    /* Recharger : la base est relue, la forme rouverte garde son point arrondi et ses poignées. */
    await o.page.reload({ waitUntil: 'load' })
    await o.page.waitForTimeout(6000)
    await openBoundary(h, bCenter)
    check(`A555 (${D}) ★ rechargé, rouvert : le point 4 est TOUJOURS arrondi`, (await o.page.locator('[data-testid="editor-node-3"]').getAttribute('data-kind')) === 'smooth')
    const p3 = await nodeAt(o.page, 3)
    await h.tap(p3.x, p3.y)
    check(`A555 (${D}) ★ … et ses DEUX poignées sont là pour le réajuster`, (await o.page.locator('[data-testid^="editor-handle-3-"]').count()) === 2)
    check(`A555 (${D}) 12 points (le modèle), pas les sommets densifiés`, (await nodes(o.page)) === 12)
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A556-${D}`, async () => {
    section(`A556 (${D}) — ★ annuler, refaire`)
    const { db, bCenter } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await openBoundary(h, bCenter)
    const r0 = dbRing(db, B)
    let p = await nodeAt(o.page, 1)
    await h.drag(p.x, p.y, p.x + 30, p.y + 20)
    p = await nodeAt(o.page, 5)
    await h.doubleTap(p.x, p.y)
    const m = await centreOf(o.page, '[data-testid="editor-mid-8"]')
    await h.tap(m.x, m.y)
    const del = await centreOf(o.page, '[data-testid="editor-node-delete"]')
    await h.tap(del.x, del.y)
    await until(() => dbRing(db, B).length !== 12 || !sameRing(dbRing(db, B), r0))
    await Bun.sleep(800)
    const r4 = dbRing(db, B)
    check(`A556 (${D}) quatre gestes faits (déplacer, arrondir, ajouter, supprimer)`, Number(await attr(o.page, 'data-undo')) === 4 && !sameRing(r0, r4), await attr(o.page, 'data-undo'))
    for (let i = 0; i < 4; i++) {
      if (dev.touch) {
        const u = await centreOf(o.page, '[data-testid="editor-undo"]')
        await h.tap(u.x, u.y)
      } else await o.page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
      await o.page.waitForTimeout(250)
    }
    check(`A556 (${D}) ★ quatre annulations : la BASE est revenue EXACTEMENT à l’anneau d’origine`, await until(() => sameRing(dbRing(db, B), r0)), `${dbRing(db, B).length} sommets`)
    check(`A556 (${D}) … et l’écran aussi (12 points, rien à annuler, 4 à refaire)`, (await nodes(o.page)) === 12 && (await attr(o.page, 'data-undo')) === '0' && (await attr(o.page, 'data-redo')) === '4')
    for (let i = 0; i < 4; i++) {
      if (dev.touch) {
        const r = await centreOf(o.page, '[data-testid="editor-redo"]')
        await h.tap(r.x, r.y)
      } else await o.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y')
      await o.page.waitForTimeout(250)
    }
    check(`A556 (${D}) ★ quatre « refaire » : la base est au dernier état, exactement`, await until(() => sameRing(dbRing(db, B), r4)))
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A557-${D}`, async () => {
    section(`A557 (${D}) — déplacer la forme entière`)
    const { db, bCenter } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await openBoundary(h, bCenter)
    const r0 = dbRing(db, B)
    const mv = await centreOf(o.page, '[data-testid="editor-move"]')
    await h.drag(mv.x, mv.y, mv.x - 50, mv.y + 30)
    await until(() => dbRing(db, B)[0].lat !== r0[0].lat)
    const r1 = dbRing(db, B)
    const dLat = r1[0].lat - r0[0].lat
    const dLng = r1[0].lng - r0[0].lng
    check(`A557 (${D}) ★ tous les sommets ont bougé du MÊME décalage`, Math.abs(dLat) > 1e-6 && r1.every((p, i) => Math.abs(p.lat - r0[i].lat - dLat) < 1e-9 && Math.abs(p.lng - r0[i].lng - dLng) < 1e-9))
    check(`A557 (${D}) la surface ne change pas`, Math.abs(ringAreaDunams(r1) - ringAreaDunams(r0)) < 0.5)
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A558-${D}`, async () => {
    section(`A558 (${D}) — ★ supprimer une forme entière, avec confirmation`)
    const { db, bCenter } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await openBoundary(h, bCenter)
    const menu = await centreOf(o.page, '[data-testid="editor-menu"]')
    await h.tap(menu.x, menu.y)
    const del = await centreOf(o.page, '[data-testid="editor-delete-shape"]')
    await h.tap(del.x, del.y)
    const dlg = o.page.locator('[data-testid="delete-confirm"]')
    check(`A558 (${D}) ★ une confirmation s’ouvre, qui NOMME la forme`, (await dlg.count()) === 1 && /גבול החווה/.test(await o.page.locator('[role="dialog"]').last().innerText()))
    check(`A558 (${D}) rien n’est supprimé avant la confirmation`, zoneIds(db).includes(B))
    await o.page.screenshot({ path: `${SHOTS}/a558-${D}-confirmation.png` })
    const c = await centreOf(o.page, '[data-testid="delete-confirm"]')
    await h.tap(c.x, c.y)
    await o.page.waitForTimeout(800)
    check(`A558 (${D}) ★ confirmée : la forme n’est plus en base ; l’autre est intacte`, (await until(() => !zoneIds(db).includes(B))) && zoneIds(db).includes(G) && dbRing(db, G).length === 10)
    check(`A558 (${D}) l’éditeur s’est refermé`, (await o.page.locator('[data-testid="shape-editor"]').count()) === 0)
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A559-${D}`, async () => {
    section(`A559 (${D}) — ★ une forme neuve à la plume`)
    const { db, center } = bkDb()
    /* Une ferme sans forme : on retire les deux. */
    for (const id of [B, G]) {
      db.rows('zones').splice(db.rows('zones').findIndex((z) => z.id === id), 1)
      for (const v of db.rows('zone_vertices').filter((x) => x.zone_id === id)) db.rows('zone_vertices').splice(db.rows('zone_vertices').indexOf(v), 1)
    }
    const { o, h } = await openFarm(db, dev)
    await frame(o.page, center, 15)
    const tog = await centreOf(o.page, '[data-testid="draw-tools-toggle"]')
    await h.tap(tog.x, tog.y)
    const bd = await centreOf(o.page, '[data-testid="draw-boundary"]')
    await h.tap(bd.x, bd.y)
    check(`A559 (${D}) l’éditeur s’ouvre sur une forme neuve, outil « עט »`, (await attr(o.page, 'data-mode')) === 'new' && (await attr(o.page, 'data-tool')) === 'pen')
    const c = await project(o.page, center)
    const pts = [
      { x: c.x - 120, y: c.y - 90 },
      { x: c.x + 110, y: c.y - 100 },
      { x: c.x + 130, y: c.y + 80 },
    ]
    for (const p of pts) await h.tap(p.x, p.y)
    check(`A559 (${D}) trois touchers : trois points, pas encore fermée, rien en base`, (await nodes(o.page)) === 3 && (await attr(o.page, 'data-closed')) === '0' && zoneIds(db).length === 0)
    /* Un toucher TIRÉ : un point arrondi. */
    await h.drag(c.x - 100, c.y + 100, c.x - 160, c.y + 60)
    check(`A559 (${D}) ★ un toucher tiré pose un point ARRONDI`, (await nodes(o.page)) === 4 && (await o.page.locator('[data-testid="editor-node-3"]').getAttribute('data-kind')) === 'smooth')
    await o.page.screenshot({ path: `${SHOTS}/a559-${D}-plume.png` })
    const first = await nodeAt(o.page, 0)
    await h.tap(first.x, first.y)
    await until(() => zoneIds(db).length === 1)
    const made = zoneIds(db)
    check(`A559 (${D}) ★ toucher le premier point FERME la forme, et elle est écrite`, made.length === 1 && dbPath(db, made[0])?.closed === true)
    check(`A559 (${D}) ★ son tracé est gardé (un point arrondi, ses poignées)`, dbPath(db, made[0])?.nodes[3].kind === 'smooth' && !!dbPath(db, made[0])?.nodes[3].hOut)
    check(`A559 (${D}) la forme réelle est le tracé densifié`, sameRing(dbRing(db, made[0]), densify(dbPath(db, made[0])!)))
    check(`A559 (${D}) l’éditeur reste ouvert dessus (outil « בחירה »)`, (await attr(o.page, 'data-mode')) === 'edit' && (await attr(o.page, 'data-tool')) === 'select')
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A560-${D}`, async () => {
    section(`A560 (${D}) — ★ de la plume à la main levée, EN COURS de tracé`)
    const { db, center } = bkDb()
    for (const id of [B, G]) {
      db.rows('zones').splice(db.rows('zones').findIndex((z) => z.id === id), 1)
      for (const v of db.rows('zone_vertices').filter((x) => x.zone_id === id)) db.rows('zone_vertices').splice(db.rows('zone_vertices').indexOf(v), 1)
    }
    const { o, h } = await openFarm(db, dev)
    await frame(o.page, center, 15)
    const tog = await centreOf(o.page, '[data-testid="draw-tools-toggle"]')
    await h.tap(tog.x, tog.y)
    const gz = await centreOf(o.page, '[data-testid="draw-grazing"]')
    await h.tap(gz.x, gz.y)
    const c = await project(o.page, center)
    await h.tap(c.x - 150, c.y)
    await h.tap(c.x, c.y - 140)
    check(`A560 (${D}) deux points à la plume`, (await nodes(o.page)) === 2)
    const pencil = await centreOf(o.page, '[data-testid="editor-tool-pencil"]')
    await h.tap(pencil.x, pencil.y)
    check(`A560 (${D}) ★ on passe à « יד חופשית » sans rien perdre`, (await attr(o.page, 'data-tool')) === 'pencil' && (await nodes(o.page)) === 2)
    /* Le trait part du dernier point, fait le tour et revient au premier. */
    const arc: Array<{ x: number; y: number }> = []
    for (let i = 0; i <= 40; i++) {
      const a = -Math.PI / 2 + (i / 40) * (Math.PI * 1.0)
      arc.push({ x: c.x + 150 * Math.cos(a), y: c.y + 140 * Math.sin(a) })
    }
    for (let i = 0; i <= 20; i++) arc.push({ x: c.x - 150 * (i / 20), y: c.y + 140 - 140 * (i / 20) })
    await h.stroke(arc)
    await until(() => zoneIds(db).length === 1)
    const made = zoneIds(db)
    check(`A560 (${D}) ★ le trait a prolongé le tracé ET l’a fermé (revenu au premier point) : écrite`, made.length === 1 && (dbPath(db, made[0])?.nodes.length ?? 0) >= 5, `${made.length} forme · ${dbPath(db, made[0])?.nodes.length} points`)
    check(`A560 (${D}) les deux points posés à la plume sont restés`, made.length === 1 && dbPath(db, made[0])!.nodes.slice(0, 2).every((n) => n.kind === 'corner'))
    await o.page.screenshot({ path: `${SHOTS}/a560-${D}-plume-puis-main.png` })
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A561-${D}`, async () => {
    section(`A561 (${D}) — la main levée sur une forme existante`)
    const { db, bCenter } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await openBoundary(h, bCenter)
    const a0 = ringAreaDunams(dbRing(db, B))
    const pencil = await centreOf(o.page, '[data-testid="editor-tool-pencil"]')
    await h.tap(pencil.x, pencil.y)
    const s = await nodeAt(o.page, 0)
    const e = await nodeAt(o.page, 3)
    /* Bombé vers l'extérieur de la forme (le côté droit/haut). */
    const mid = { x: (s.x + e.x) / 2 + 90, y: (s.y + e.y) / 2 - 60 }
    const pts: Array<{ x: number; y: number }> = []
    for (let i = 0; i <= 30; i++) {
      const t = i / 30
      pts.push({ x: (1 - t) * (1 - t) * s.x + 2 * (1 - t) * t * mid.x + t * t * e.x, y: (1 - t) * (1 - t) * s.y + 2 * (1 - t) * t * mid.y + t * t * e.y })
    }
    const before = dbRing(db, B)
    await h.stroke(pts)
    await until(() => !sameRing(before, dbRing(db, B)))
    const a1 = ringAreaDunams(dbRing(db, B))
    check(`A561 (${D}) ★ le trait d’un point à un autre a REMPLACÉ la portion (la forme a changé)`, !sameRing(before, dbRing(db, B)), (await o.page.locator('[data-testid="editor-notice"]').textContent().catch(() => '')) ?? '')
    check(`A561 (${D}) la surface a grandi (le trait passait dehors) : ${a0.toFixed(0)} → ${a1.toFixed(0)} ד׳`, a1 > a0)
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A562-${D}`, async () => {
    section(`A562 (${D}) — « שרטוט מחדש »`)
    const { db, bCenter } = bkDb()
    const { o, h } = await openFarm(db, dev)
    await openBoundary(h, bCenter)
    const menu = await centreOf(o.page, '[data-testid="editor-menu"]')
    await h.tap(menu.x, menu.y)
    const rp = await centreOf(o.page, '[data-testid="editor-replace"]')
    await h.tap(rp.x, rp.y)
    check(`A562 (${D}) une confirmation, qui dit que l’ancienne reste jusqu’à la fermeture`, /תישאר עד שתסגרו/.test(await o.page.locator('[data-testid="zone-replace-confirm"]').innerText()))
    const yes = await centreOf(o.page, '[data-testid="zone-replace-yes"]')
    await h.tap(yes.x, yes.y)
    const c = await project(o.page, bCenter)
    for (const p of [{ x: c.x - 90, y: c.y - 60 }, { x: c.x + 90, y: c.y - 60 }, { x: c.x, y: c.y + 80 }]) await h.tap(p.x, p.y)
    check(`A562 (${D}) en cours : l’ancienne forme est toujours en base`, zoneIds(db).includes(B))
    const first = await nodeAt(o.page, 0)
    await h.tap(first.x, first.y)
    await until(() => !zoneIds(db).includes(B))
    const ids = zoneIds(db)
    check(`A562 (${D}) ★ fermée : la nouvelle a REMPLACÉ l’ancienne (2 formes, plus de ${B})`, !ids.includes(B) && ids.length === 2 && ids.includes(G))
    await o.ctx.close()
  })

  // -------------------------------------------------------------------------
  await guard(`A563-${D}`, async () => {
    section(`A563 (${D}) — une forme ancienne (sans tracé) s’ouvre en coins`)
    const { db, bCenter } = bkDb()
    const writes: string[] = []
    const { o, h } = await openFarm(db, dev)
    o.page.on('request', (r) => {
      /* ★ BK (transaction) — une forme s'écrit désormais par `rpc/write_aggregate` : sans elle ici, « rien n'est écrit » serait vrai par vide. */
      if (r.method() !== 'GET' && /\/rest\/v1\/(zones|zone_vertices|rpc\/write_aggregate)/.test(r.url())) writes.push(`${r.method()} ${r.url().split('/rest/v1/')[1].slice(0, 30)}`)
    })
    const r0 = dbRing(db, B)
    await openBoundary(h, bCenter)
    const kinds = await o.page.locator('[data-testid^="editor-node-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))
    check(`A563 (${D}) ★ 12 points, tous des COINS (aucune courbe inventée)`, kinds.length === 12 && kinds.every((k) => k === 'corner'))
    await done(o.page)
    await o.page.waitForTimeout(800)
    check(`A563 (${D}) ★ ouverte puis refermée sans geste : RIEN n’est écrit`, writes.length === 0 && sameRing(dbRing(db, B), r0) && dbPath(db, B) === null, writes.join(' | '))
    await o.ctx.close()
  })
}

// ===========================================================================
await guard('A564', async () => {
  section('A564 — l’écran des régions : le même éditeur')
  for (const dev of devices) {
    const D = dev.name
    const { db } = bkDb()
    const o = await open(dev.w, { db, height: dev.h, touch: dev.touch })
    const h = await hand(o, dev)
    await go(o.page, APP, '/coordinator/settings/regions', 6000)
    /* La pastille est au bout d'une rangée qui défile : on l'amène en vue, puis on la touche. */
    await o.page.locator('[data-testid="region-pick-negev"]').scrollIntoViewIfNeeded()
    await o.page.waitForTimeout(300)
    const pill = await centreOf(o.page, '[data-testid="region-pick-negev"]')
    await h.tap(pill.x, pill.y)
    await o.page.waitForTimeout(1200)
    check(`A564 (${D}) la région s’ouvre dans l’éditeur de tracés`, (await attr(o.page, 'data-shape')) === 'negev')
    const n0 = await nodes(o.page)
    const p = await nodeAt(o.page, 1)
    await h.tap(p.x, p.y)
    check(`A564 (${D}) ★ toucher un point le SÉLECTIONNE — avant BK il le supprimait`, (await nodes(o.page)) === n0 && (await attr(o.page, 'data-selected-node')) === '1')
    const del = await centreOf(o.page, '[data-testid="editor-node-delete"]')
    await h.tap(del.x, del.y)
    check(`A564 (${D}) « מחיקת הנקודה » le supprime`, (await nodes(o.page)) === n0 - 1)
    const save = await centreOf(o.page, '[data-testid="region-save"]')
    await h.tap(save.x, save.y)
    await o.page.waitForTimeout(1500)
    const rings = JSON.parse(String(await o.page.evaluate(() => localStorage.getItem('lo-yanum:region-rings')))) as Record<string, unknown[]>
    const paths = JSON.parse(String(await o.page.evaluate(() => localStorage.getItem('lo-yanum:region-paths')))) as Record<string, { nodes: unknown[] }>
    check(`A564 (${D}) « שמור גבול » : l’anneau ET le tracé de la région sont enregistrés`, rings?.negev?.length === n0 - 1 && paths?.negev?.nodes.length === n0 - 1)
    await until(() => db.rows('user_setting_values').filter((r) => r.key === 'lo-yanum:region-paths').length === 1)
    const acct = db.rows('user_setting_values').filter((r) => r.user_id === USER_ID && (r.key === 'lo-yanum:region-paths' || r.key === 'lo-yanum:region-rings')).length
    check(`A564 (${D}) … et ils partent sur le COMPTE`, acct === 2, String(acct))
    /* Les régions se recouvrent : un toucher là où deux s'empilent demande laquelle. */
    await done(o.page)
    /* (31,37 ; 35,10) : dans יהודה ET dans נגב (mesuré sur les anneaux livrés). */
    await o.page.evaluate(() => (window as unknown as { __loYanumMap: { jumpTo(o: unknown): void } }).__loYanumMap.jumpTo({ center: [35.1, 31.37], zoom: 8.5 }))
    await o.page.waitForTimeout(900)
    const q = await project(o.page, { lat: 31.37, lng: 35.1 })
    await h.tap(q.x, q.y)
    const picks = await o.page.locator('[data-testid^="shape-pick-"]').count()
    check(`A564 (${D}) ★ là où deux régions se recouvrent, un choix les propose (${picks})`, picks >= 2)
    await o.page.screenshot({ path: `${SHOTS}/a564-${D}-regions.png` })
    await o.ctx.close()
  }
})

// ===========================================================================
await guard('A565', async () => {
  section('A565 — le panneau de diagnostic n’est plus sur les cartes')
  const { db } = bkDb()
  const o = await open(1440, { db, height: 900, init: { 'lo-yanum:map-mode:farm-detail': 'full' } })
  await go(o.page, APP, `/coordinator/farms/${FARM}`, 6000)
  await o.page.locator('[data-testid="map-legend-toggle"]').first().click()
  await o.page.waitForTimeout(400)
  check('A565 ★ la légende ouverte n’a plus de lien « אבחון »', (await o.page.locator('[data-testid="diagnostic-open"]').count()) === 0)
  await go(o.page, APP, '/coordinator/settings', 3000)
  for (let i = 0; i < 40; i++) {
    const closed = o.page.locator('main [data-testid^="block-"][aria-expanded="false"]')
    if ((await closed.count()) === 0) break
    await closed.first().click().catch(() => undefined)
    await o.page.waitForTimeout(60)
  }
  const btn = o.page.locator('[data-testid="diagnostic-open"]')
  check('A565 il reste dans הגדרות, et dit à quoi il sert (« לתמיכה טכנית »)', (await btn.count()) === 1 && /לתמיכה טכנית/.test(await btn.innerText()))
  await o.ctx.close()
})

// ===========================================================================
await guard('A566', async () => {
  section('A566 — les brouillons abandonnés')
  const { db, center } = bkDb()
  const draft = (id: string, at: number) => ({ id, zone: 'grazing_area', draft: ringOf(center, 4, 0.002, 0.002).slice(0, 3), at })
  const o = await open(1440, { db, height: 900, init: { 'lo-yanum:map-mode:farm-detail': 'full', [`lo-yanum:zone-draft:${FARM}`]: JSON.stringify([draft('d1', 2), draft('d2', 1)]) } })
  await go(o.page, APP, `/coordinator/farms/${FARM}`, 6000)
  const banner = o.page.locator('[data-testid="zone-draft-banner"]')
  check('A566 ★ la bande nomme le brouillon et le nombre de brouillons (2)', (await banner.count()) === 1 && (await banner.getAttribute('data-drafts')) === '2')
  await o.page.locator('[data-testid="zone-draft-discard-all"]').click()
  check('A566 ★ « ניקוי כל הטיוטות » demande CONFIRMATION, et dit que les formes enregistrées restent', /צורות שמורות לא יימחקו/.test(await banner.innerText()))
  check('A566 rien n’est effacé avant', (await o.page.evaluate((k) => localStorage.getItem(k), `lo-yanum:zone-draft:${FARM}`)) !== null)
  await o.page.locator('[data-testid="zone-draft-discard-yes"]').click()
  await o.page.waitForTimeout(500)
  check('A566 ★ confirmé : les deux brouillons sont effacés de l’appareil', (await o.page.evaluate((k) => localStorage.getItem(k), `lo-yanum:zone-draft:${FARM}`)) === null)
  check('A566 ★ et AUCUNE forme enregistrée n’a été touchée', zoneIds(db).length === 2 && dbRing(db, B).length === 12 && dbRing(db, G).length === 10)
  await o.ctx.close()
})

// ===========================================================================
await guard('A567', async () => {
  section('A567 — l’accroche aux routes')
  const { db, bCenter } = bkDb()
  const dev = DEVICES[0]
  const { o, h } = await openFarm(db, dev)
  await openBoundary(h, bCenter)
  /* Une route chargée à l'écran, près du point 2. */
  const road = await o.page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap: { querySourceFeatures(s: string, o: unknown): Array<{ geometry: GeoJSON.Geometry }>; project(p: [number, number]): { x: number; y: number }; getContainer(): HTMLElement } }).__loYanumMap
    const r = m.getContainer().getBoundingClientRect()
    let best: { ax: number; ay: number; bx: number; by: number } | null = null
    for (const f of m.querySourceFeatures('protomaps', { sourceLayer: 'roads' })) {
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : []
      for (const l of lines)
        for (let i = 1; i < l.length; i++) {
          const a = m.project(l[i - 1] as [number, number])
          const b = m.project(l[i] as [number, number])
          if (Math.hypot(a.x - b.x, a.y - b.y) > 60 && a.x > 120 && a.x < r.width - 120 && b.x > 120 && b.x < r.width - 120 && a.y > 80 && a.y < r.height - 300 && b.y > 80 && b.y < r.height - 300) best = { ax: a.x + r.left, ay: a.y + r.top, bx: b.x + r.left, by: b.y + r.top }
        }
    }
    return best
  })
  check('A567 ★ la géométrie des routes est DÉJÀ dans les tuiles chargées (couche `roads`)', road !== null)
  if (road) {
    const menu = await centreOf(o.page, '[data-testid="editor-menu"]')
    await h.tap(menu.x, menu.y)
    await o.page.locator('[data-testid="editor-snap"]').click()
    const mx = (road.ax + road.bx) / 2
    const my = (road.ay + road.by) / 2
    /* 9 px à côté de la route, perpendiculairement. */
    const len = Math.hypot(road.bx - road.ax, road.by - road.ay)
    const nx = -(road.by - road.ay) / len
    const ny = (road.bx - road.ax) / len
    const p = await nodeAt(o.page, 2)
    await h.drag(p.x, p.y, mx + nx * 9, my + ny * 9)
    const q = await nodeAt(o.page, 2)
    const dist = Math.abs((road.bx - road.ax) * (road.ay - q.y) - (road.ax - q.x) * (road.by - road.ay)) / len
    check(`A567 ★ lâché à 9 px d’une route, le point est ACCROCHÉ dessus (${dist.toFixed(1)} px)`, dist < 1.5)
    await o.page.screenshot({ path: `${SHOTS}/a567-accroche.png` })
  }
  await o.ctx.close()
})

// ===========================================================================
await guard('A568', async () => {
  section('A568 — deux doigts en mode plume : un pincement, jamais un point')
  const { db, bCenter } = bkDb()
  const dev = DEVICES[1]
  const { o, h } = await openFarm(db, dev)
  await openBoundary(h, bCenter)
  const pen = await centreOf(o.page, '[data-testid="editor-tool-pen"]')
  await h.tap(pen.x, pen.y)
  const n0 = await nodes(o.page)
  const z0 = (await camera(o.page)).zoom
  const c = await project(o.page, bCenter)
  const send = (type: string, pts: Array<{ x: number; y: number }>) => h.cdp!.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })) })
  await send('touchStart', [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }])
  for (let i = 1; i <= 10; i++) {
    await send('touchMove', [{ x: c.x - 40 - i * 12, y: c.y }, { x: c.x + 40 + i * 12, y: c.y }])
    await o.page.waitForTimeout(16)
  }
  await send('touchEnd', [])
  await o.page.waitForTimeout(800)
  check('A568 ★ aucun point posé par un pincement', (await nodes(o.page)) === n0 && dbRing(db, B).length === 12)
  check(`A568 … et la carte a zoomé (${z0.toFixed(2)} → ${(await camera(o.page)).zoom.toFixed(2)})`, (await camera(o.page)).zoom > z0 + 0.3)
  await o.ctx.close()
})

// ===========================================================================
await guard('A569', async () => {
  section('A569 — ★ une forme tracée PENDANT les relectures du démarrage ne quitte jamais la carte')
  /**
   * ★★★ BK — `zones` (CI) a vu une forme tracée pendant l'hydratation
   *   disparaître de l'écran : deux relectures partent à chaque démarrage (cache
   *   mémoire, puis IndexedDB), et la seconde écrasait l'enregistrement de la
   *   première ; celle qui répondait en dernier décidait. Un tirage à pile ou
   *   face : on recharge SIX fois, on trace à chaque fois pendant la relecture
   *   lente, et on regarde la carte toutes les 200 ms jusqu'à la fin.
   */
  const { db, center } = bkDb()
  const dev = DEVICES[0]
  const { o, h } = await openFarm(db, dev)
  const drawn = () =>
    o.page.evaluate(() => {
      const m = (window as unknown as { __loYanumMap?: { getSource(id: string): { _data?: { features?: unknown[] } } | undefined } }).__loYanumMap
      return (m?.getSource('zones')?._data?.features ?? []).length
    })
  let lost = 0
  let created = 0
  for (let k = 0; k < Number(process.env.A569_TRIALS ?? 6); k++) {
    const before = zoneIds(db).length
    db.slowReads = 4000
    await o.page.reload({ waitUntil: 'load' })
    await o.page.waitForFunction(() => Boolean((window as unknown as { __loYanumMap?: unknown }).__loYanumMap), undefined, { timeout: 15_000 })
    await o.page.waitForTimeout(600)
    await frame(o.page, center, 14)
    const tog = await centreOf(o.page, '[data-testid="draw-tools-toggle"]')
    await h.tap(tog.x, tog.y)
    const gz = await centreOf(o.page, '[data-testid="draw-grazing"]')
    await h.tap(gz.x, gz.y)
    const c = await project(o.page, { lat: center.lat + 0.004 + (k % 3) * 0.003, lng: center.lng - 0.006 + Math.floor(k / 3) * 0.006 })
    for (const p of [{ x: c.x - 40, y: c.y - 30 }, { x: c.x + 40, y: c.y - 30 }, { x: c.x, y: c.y + 30 }]) await h.tap(p.x, p.y)
    const first = await nodeAt(o.page, 0)
    await h.tap(first.x, first.y)
    if (zoneIds(db).length === before + 1 || (await until(() => zoneIds(db).length === before + 1, 3000))) created++
    await done(o.page)
    let min = Infinity
    for (let t = 0; t < 12_000; t += 200) {
      min = Math.min(min, await drawn())
      await o.page.waitForTimeout(200)
    }
    db.slowReads = 0
    if (min < before + 1) lost++
    console.log(`    essai ${k + 1} : ${before + 1} formes attendues, minimum vu sur la carte ${min}`)
  }
  check(`A569 chaque essai a bien créé sa forme (${created})`, created === Number(process.env.A569_TRIALS ?? 6))
  check(`A569 ★ la forme n’a JAMAIS quitté la carte pendant les relectures (${lost} essai(s) perdu(s))`, lost === 0)
  await o.ctx.close()
})

await finish()
