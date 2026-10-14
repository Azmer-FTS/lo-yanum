import { mkdirSync } from 'node:fs'

import type { CDPSession, Page } from 'playwright'

import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import { FakeDb } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BH — AU RENDU, EN TABLETTE (1032 × 1376, au doigt).   A489 … A497
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bhui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bhui    # le DÉPLOYÉ
 *
 * Build réel (ou bundle déployé) + base FACTICE. La ferme du banc est
 * REBAPTISÉE (aucun nom réel en capture) ; sa forme est inventée.
 *
 *   A489  un appui sur une forme existante la SÉLECTIONNE et ne crée aucune
 *         forme ; le lien « לתיחום » (`?draw=`) sur une ferme qui a déjà sa
 *         forme la sélectionne aussi ; entrer en édition ne recadre pas
 *   A490  les poignées : une par sommet, 44 px de zone tactile au moins, un
 *         point visible de 16 px au moins
 *   A491  un glissement déplace le sommet, la forme suit EN DIRECT
 *   A492  tirer la demi-poignée crée un sommet
 *   A493  l'appui long retire un sommet ; refusé à trois, et dit pourquoi
 *   A494  supprimer demande confirmation et NOMME la forme ; confirmé, la base
 *         ne l'a plus
 *   A495  annuler fonctionne dix fois de suite, jusqu'à la forme d'ouverture
 *   A496  « סיום עריכה » enregistre : la base porte la forme modifiée
 *   A497  ★ LA PERSISTANCE — tracer une forme neuve (« צורה חדשה »), la voir
 *         écrite côté serveur, vider le cache local (un navigateur neuf),
 *         relire : la MÊME forme ; la modifier : la modification est écrite,
 *         et relue à son tour
 */

const OUT = process.env.DIST ?? 'dist-bhui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5495), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bh/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })
const W = 1032
const H = 1376

const FARM = 'farm-ak1-11'
const ZONE = 'zone-bh-1'

/** La base : le banc, ses fermes rebaptisées, et UNE forme (un hexagone) sur la ferme. */
function bhDb(withZone = true): { db: FakeDb; name: string } {
  const d = new FakeDb()
  seed(d)
  d.rows('entities').forEach((r, n) => {
    const k = String(n + 1).padStart(2, '0')
    Object.assign(r, { name: `חוות בדיקה ${k}`, farm_name: '', farmer_name: `חקלאי ${k}`, farmer_phone: `050-000-12${k}`, farmer_email: '', liaison_name: '', liaison_phone: '', standby_phone: '', notes: '', farmer_id_no: '' })
  })
  const f = d.rows('entities').find((r) => r.id === FARM)!
  if (withZone) {
    const c = { lat: (f.lat as number) + 0.004, lng: (f.lng as number) + 0.005 }
    const at = new Date().toISOString()
    d.rows('zones').push({ id: ZONE, entity_id: FARM, kind: 'farm_boundary', created_at: at, updated_at: at })
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      d.rows('zone_vertices').push({ zone_id: ZONE, position: i, lat: c.lat + 0.0035 * Math.sin(a), lng: c.lng + 0.0042 * Math.cos(a) })
    }
  }
  /* `on delete cascade`, comme le schéma. */
  d.cascades.set('zones', [{ table: 'zone_vertices', fk: 'zone_id' }])
  return { db: d, name: String(f.name) }
}

const dbRing = (db: FakeDb, zoneId: string): Array<[number, number]> =>
  db
    .rows('zone_vertices')
    .filter((v) => v.zone_id === zoneId)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((v) => [Number(v.lng), Number(v.lat)])

type Ring = Array<[number, number]>
/** Les anneaux dessinés par la carte (source `zones`), par id de forme. */
const mapRings = (page: Page): Promise<Record<string, Ring>> =>
  page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getSource(id: string): { _data?: { features: Array<{ id?: string; properties?: Record<string, unknown>; geometry: { coordinates: number[][][] } }> } } | undefined } }).__loYanumMap
    const out: Record<string, Array<[number, number]>> = {}
    for (const f of m?.getSource('zones')?._data?.features ?? []) {
      const id = String(f.properties?.id ?? f.id ?? '')
      const ring = f.geometry.coordinates[0].slice(0, -1) as Array<[number, number]>
      out[id] = ring
    }
    return out
  })
const sameRing = (a: Ring | undefined, b: Ring | undefined) => !!a && !!b && a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-9 && Math.abs(p[1] - b[i][1]) < 1e-9)

type Camera = { lat: number; lng: number; zoom: number }
const camera = (page: Page): Promise<Camera> =>
  page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getCenter(): { lat: number; lng: number }; getZoom(): number } }).__loYanumMap
    const c = m?.getCenter()
    return { lat: c?.lat ?? NaN, lng: c?.lng ?? NaN, zoom: m?.getZoom() ?? NaN }
  })
const sameCamera = (a: Camera, b: Camera) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7 && Math.abs(a.zoom - b.zoom) < 1e-6

/** Un point de l'écran pour une coordonnée. */
const project = (page: Page, p: { lng: number; lat: number }) =>
  page.evaluate((q) => {
    const m = (window as unknown as { __loYanumMap: { project(ll: [number, number]): { x: number; y: number }; getContainer(): HTMLElement } }).__loYanumMap
    const r = m.getContainer().getBoundingClientRect()
    const pt = m.project([q.lng, q.lat])
    return { x: r.left + pt.x, y: r.top + pt.y }
  }, p)

/* --- Le doigt (CDP : de vrais évènements tactiles) ------------------------- */
async function tap(cdp: CDPSession, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
async function longPress(cdp: CDPSession, page: Page, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await page.waitForTimeout(900)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
/** Un glissement au doigt ; `mid` est appelé au milieu, doigt posé (pour lire le direct). */
async function drag(cdp: CDPSession, page: Page, from: { x: number; y: number }, to: { x: number; y: number }, mid?: () => Promise<void>): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let i = 1; i <= 14; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 14, y: from.y + ((to.y - from.y) * i) / 14 }] })
    if (i === 8 && mid) {
      await page.waitForTimeout(150)
      await mid()
    }
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(500)
}

const selected = (page: Page) => page.locator('[data-testid="zone-selected"]')
const vertexCount = async (page: Page) => Number((await selected(page).getAttribute('data-vertices')) ?? -1)
/** Les poignées de la forme sélectionnée : sommets (emphase) et demi-poignées. */
const grips = (page: Page, kind: 'vertex' | 'midpoint') =>
  page.evaluate((k) => {
    const label = k === 'vertex' ? 'פינת אזור' : 'הוספת פינה על הצלע'
    return [...document.querySelectorAll<HTMLElement>(`.maplibregl-marker[data-marker-kind="vertex"][aria-label="${label}"]`)].map((e) => {
      const r = e.getBoundingClientRect()
      const dot = (e.firstElementChild as HTMLElement | null)?.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, dot: dot ? Math.min(dot.width, dot.height) : 0 }
    })
  }, kind)
/** La poignée la plus près du centre de la carte (loin des boutons des bords). */
async function centralGrip(page: Page, kind: 'vertex' | 'midpoint') {
  const box = await page.locator('[role="application"]').first().boundingBox()
  /* Seulement les poignées qu'un doigt touche VRAIMENT (rien par-dessus :
     ni l'épingle de la ferme, ni une autre poignée, ni une barre). */
  const free = await page.evaluate((k) => {
    const label = k === 'vertex' ? 'פינת אזור' : 'הוספת פינה על הצלע'
    return [...document.querySelectorAll<HTMLElement>(`.maplibregl-marker[data-marker-kind="vertex"][aria-label="${label}"]`)].map((e) => {
      const r = e.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!hit && (hit === e || e.contains(hit))
    })
  }, kind)
  const list = (await grips(page, kind)).filter((_, i) => free[i])
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2
  return list.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0]
}

async function openFarm(width: number, db: FakeDb, hash = `/coordinator/farms/${FARM}`) {
  const o = await open(width, { db, height: H, touch: true, init: { 'lo-yanum:map-mode:farm-detail': 'split' } })
  await go(o.page, APP, hash, 6000)
  const cdp = await o.ctx.newCDPSession(o.page)
  return { ...o, cdp }
}

/** Un point À L'INTÉRIEUR de la forme existante, loin de l'épingle de la ferme et des poignées. */
async function insideZone(page: Page, db: FakeDb) {
  const ring = dbRing(db, ZONE)
  const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0])
  return project(page, { lng: c[0] + (ring[0][0] - c[0]) * 0.45, lat: c[1] + 0.0008 })
}

// ===========================================================================
await guard('A489', async () => {
  section('A489 — toucher une forme la sélectionne ; jamais une nouvelle')
  const { db } = bhDb()
  const o = await openFarm(W, db)
  const zones0 = db.rows('zones').length
  const cam0 = await camera(o.page)
  const p = await insideZone(o.page, db)
  await tap(o.cdp, p.x, p.y)
  await o.page.waitForTimeout(800)
  check('A489 un appui sur la forme existante la SÉLECTIONNE', (await selected(o.page).count()) === 1 && (await selected(o.page).getAttribute('data-zone')) === ZONE)
  check('A489 … aucun mode de dessin, aucune forme neuve', (await o.page.locator('[data-testid="draw-undo"]').count()) === 0 && db.rows('zones').length === zones0)
  check('A489 entrer en édition ne recadre pas', sameCamera(cam0, await camera(o.page)))
  await o.page.screenshot({ path: `${SHOTS}/a489-forme-selectionnee-1032.png` })
  /* Re-toucher la forme (sélectionnée) n'en commence pas une non plus. */
  await tap(o.cdp, p.x, p.y)
  await o.page.waitForTimeout(600)
  check('A489 re-toucher : toujours aucune forme neuve', db.rows('zones').length === zones0 && (await o.page.locator('[data-testid="draw-undo"]').count()) === 0)
  check('A489 « צורה חדשה » est un bouton explicite', (await o.page.locator('[data-testid="zone-new"]').count()) + (await o.page.locator('[data-testid="zone-selected"]').count()) >= 1)
  check('A489 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()

  /* Le lien de la file « לתיחום » sur une ferme qui a DÉJÀ sa forme. */
  const { db: d2 } = bhDb()
  const q = await openFarm(W, d2, `/coordinator/farms/${FARM}?draw=farm_boundary`)
  check('A489 `?draw=` sur une forme existante : elle est SÉLECTIONNÉE, rien n’est armé', (await selected(q.page).getAttribute('data-zone').catch(() => null)) === ZONE && (await q.page.locator('[data-testid="draw-undo"]').count()) === 0)
  const p2 = await insideZone(q.page, d2)
  await tap(q.cdp, p2.x, p2.y)
  await q.page.waitForTimeout(800)
  check('A489 … et la toucher ne crée rien', d2.rows('zones').length === 1)
  await q.ctx.close()

  /* … et sur une ferme SANS forme, le même lien arme toujours le dessin (AD3.3). */
  const { db: d3 } = bhDb(false)
  const n = await openFarm(W, d3, `/coordinator/farms/${FARM}?draw=farm_boundary`)
  check('A489 `?draw=` sur une ferme sans forme : le dessin est ARMÉ (AD3.3 gardé)', (await n.page.locator('[data-testid="draw-undo"]').count()) === 1 && (await selected(n.page).count()) === 0)
  await n.ctx.close()
})

// ===========================================================================
await guard('A490', async () => {
  section('A490 · A491 · A492 · A493 · A495 · A496 — retoucher la forme, au doigt')
  const { db } = bhDb()
  const o = await openFarm(W, db)
  const p = await insideZone(o.page, db)
  await tap(o.cdp, p.x, p.y)
  await o.page.waitForTimeout(800)
  const v = await grips(o.page, 'vertex')
  check('A490 une poignée par sommet', v.length === 6, `${v.length}`)
  check('A490 zone tactile ≥ 44 px', v.every((g) => g.w >= 44 && g.h >= 44), v.map((g) => `${Math.round(g.w)}×${Math.round(g.h)}`).join(' '))
  check('A490 point visible ≥ 16 px (lisible sur une photo claire)', v.every((g) => g.dot >= 16), v.map((g) => Math.round(g.dot)).join(','))

  // A491 — glisser un sommet ; la forme suit EN DIRECT.
  const before = (await mapRings(o.page))[ZONE]
  const g = await centralGrip(o.page, 'vertex')
  let during: Ring | undefined
  await drag(o.cdp, o.page, { x: g.x, y: g.y }, { x: g.x - 60, y: g.y + 45 }, async () => {
    during = (await mapRings(o.page))[ZONE]
  })
  const after = (await mapRings(o.page))[ZONE]
  check('A491 PENDANT le glissement, la forme a déjà changé (en direct)', !!during && !sameRing(during, before))
  check('A491 lâché : un sommet a bougé, et un seul', !!after && !!before && after.length === before.length && after.filter((q, i) => q[0] !== before[i][0] || q[1] !== before[i][1]).length === 1)
  /* ★★ BI — la règle a changé (point 6 de BI) : le geste est ÉCRIT dès qu'il
     est fait, pour que la tuile « מדוד » et la base ne retardent plus sur la
     carte (403 / 441 en BH). Cette ligne disait « rien n'est encore écrit ». */
  await o.page.waitForTimeout(1500)
  check('A491 ★ BI : le geste est ÉCRIT dès le lâcher (plus d’écart carte / base)', sameRing(dbRing(db, ZONE), after))

  // A492 — tirer une demi-poignée crée un sommet.
  const n0 = await vertexCount(o.page)
  const m = await centralGrip(o.page, 'midpoint')
  await drag(o.cdp, o.page, { x: m.x, y: m.y }, { x: m.x + 30, y: m.y + 30 })
  check('A492 tirer la demi-poignée : un sommet de plus', (await vertexCount(o.page)) === n0 + 1, `${n0} → ${await vertexCount(o.page)}`)

  // A493 — l'appui long retire un sommet.
  const n1 = await vertexCount(o.page)
  const g2 = await centralGrip(o.page, 'vertex')
  await longPress(o.cdp, o.page, g2.x, g2.y)
  await o.page.waitForTimeout(500)
  check('A493 appui long : un sommet de moins', (await vertexCount(o.page)) === n1 - 1, `${n1} → ${await vertexCount(o.page)}`)
  await o.page.screenshot({ path: `${SHOTS}/a493-edition-1032.png` })

  // A495 — dix gestes, puis dix annulations.
  const open0 = (await mapRings(o.page))[ZONE]
  const undo0 = Number(await selected(o.page).getAttribute('data-undo'))
  for (let k = 0; k < 10; k++) {
    const mm = await centralGrip(o.page, 'midpoint')
    await tap(o.cdp, mm.x, mm.y)
    await o.page.waitForTimeout(250)
  }
  const n10 = await vertexCount(o.page)
  check('A495 dix gestes posés', Number(await selected(o.page).getAttribute('data-undo')) === undo0 + 10, `${n10} sommets`)
  for (let k = 0; k < 10; k++) {
    await o.page.locator('[data-testid="zone-undo"]').click()
    await o.page.waitForTimeout(120)
  }
  check('A495 dix annulations de suite : la forme d’avant les dix gestes, exactement', sameRing((await mapRings(o.page))[ZONE], open0))
  for (let k = 0; k < undo0; k++) await o.page.locator('[data-testid="zone-undo"]').click()
  await o.page.waitForTimeout(200)
  check('A495 … et jusqu’à la forme d’ouverture ; le bouton s’éteint', sameRing((await mapRings(o.page))[ZONE], before) && (await o.page.locator('[data-testid="zone-undo"]').isDisabled()))

  // A493 (bis) — à trois sommets, le retrait est refusé et l'écran le dit.
  let guardN = 0
  while ((await vertexCount(o.page)) > 3 && guardN++ < 10) {
    const gg = await centralGrip(o.page, 'vertex')
    await longPress(o.cdp, o.page, gg.x, gg.y)
    await o.page.waitForTimeout(350)
  }
  const g3 = await centralGrip(o.page, 'vertex')
  await longPress(o.cdp, o.page, g3.x, g3.y)
  await o.page.waitForTimeout(400)
  const notice = await o.page.locator('[data-testid="zone-notice"]').innerText().catch(() => '')
  check('A493 à trois sommets : REFUSÉ, et l’écran dit pourquoi', (await vertexCount(o.page)) === 3 && notice.includes('3'), notice)

  // A496 — « סיום עריכה » enregistre.
  const shown = (await mapRings(o.page))[ZONE]
  await o.page.locator('[data-testid="zone-done"]').click()
  await o.page.waitForTimeout(2000)
  check('A496 « סיום עריכה » : la base porte la forme modifiée, sommet pour sommet', sameRing(dbRing(db, ZONE), shown), `${dbRing(db, ZONE).length} sommets en base`)
  check('A496 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
await guard('A494', async () => {
  section('A494 — supprimer : une confirmation qui nomme la forme')
  const { db, name } = bhDb()
  const o = await openFarm(W, db)
  const p = await insideZone(o.page, db)
  await tap(o.cdp, p.x, p.y)
  await o.page.waitForTimeout(700)
  await o.page.locator('[data-testid="zone-delete"]').click()
  await o.page.waitForTimeout(400)
  const dialog = await o.page.locator('[role="dialog"]').last().innerText().catch(() => '')
  check('A494 une confirmation s’ouvre, et NOMME la forme', dialog.includes('גבול החווה') && dialog.includes(name), dialog.replace(/\s+/g, ' ').slice(0, 90))
  check('A494 … rien n’est supprimé avant', db.rows('zones').length === 1)
  await o.page.screenshot({ path: `${SHOTS}/a494-confirmation-1032.png` })
  await o.page.locator('[data-testid="delete-confirm"]').click()
  await o.page.waitForTimeout(2000)
  check('A494 confirmé : la base n’a plus la forme ni ses sommets', db.rows('zones').length === 0 && db.rows('zone_vertices').length === 0)
  await o.ctx.close()
})

// ===========================================================================
await guard('A497', async () => {
  section('A497 — ★ la persistance : tracer, écrire, vider le cache, relire, modifier')
  const { db } = bhDb(false)
  const o = await openFarm(W, db)
  /* « צורה חדשה », puis le genre, puis quatre appuis. */
  await o.page.locator('[data-testid="draw-tools-toggle"]').click()
  await o.page.waitForTimeout(250)
  await o.page.locator('[data-testid="draw-grazing"]').click()
  /* Choisir le genre a pu faire défiler la page : la carte revient en vue. */
  await o.page.evaluate(() => {
    window.scrollTo(0, 0)
    for (const el of document.querySelectorAll<HTMLElement>('*')) if (el.scrollTop > 0) el.scrollTop = 0
  })
  await o.page.waitForTimeout(400)
  const box = (await o.page.locator('[role="application"]').first().boundingBox())!
  const cx = box.x + box.width / 2
  /* Quatre coins là où le CANEVAS est sous le doigt (le bandeau du dessin et
     les boutons de la carte en couvrent une part, en tablette). */
  for (const [dx, fy] of [[-70, 0.2], [70, 0.18], [80, 0.36], [-60, 0.38]]) {
    const x = cx + dx
    const y = box.y + box.height * fy
    const onCanvas = await o.page.evaluate(([px, py]) => (document.elementFromPoint(px, py) as HTMLElement | null)?.classList.contains('maplibregl-canvas') ?? false, [x, y])
    if (!onCanvas) console.log(`    (appui hors canevas en ${Math.round(x)},${Math.round(y)})`)
    await tap(o.cdp, x, y)
    await o.page.waitForTimeout(250)
  }
  check('A497 « צורה חדשה » : quatre appuis, quatre sommets posés', (await o.page.getByText('4 פינות').count()) > 0)
  await o.page.getByRole('button', { name: 'סגור פוליגון', exact: true }).first().click()
  await o.page.waitForTimeout(2500)
  const zones = db.rows('zones').filter((z) => z.entity_id === FARM)
  check('A497 la forme est écrite CÔTÉ SERVEUR (une ligne `zones`, quatre sommets)', zones.length === 1 && dbRing(db, String(zones[0]?.id)).length === 4)
  const id = String(zones[0]?.id)
  const drawn = (await mapRings(o.page))[id]
  check('A497 … exactement la forme tracée', sameRing(dbRing(db, id), drawn))
  await o.ctx.close()

  /* Un navigateur NEUF : aucun cache, aucune file — tout vient du serveur. */
  const r = await openFarm(W, db)
  const reread = (await mapRings(r.page))[id]
  check('A497 cache vidé, relu : la MÊME forme, sommet pour sommet', sameRing(reread, dbRing(db, id)))
  /* La modifier, et l'enregistrer. */
  const ring = dbRing(db, id)
  const c = ring.reduce((a, q) => [a[0] + q[0] / ring.length, a[1] + q[1] / ring.length], [0, 0])
  const inside = await project(r.page, { lng: c[0] + (ring[0][0] - c[0]) * 0.3, lat: c[1] + (ring[0][1] - c[1]) * 0.3 })
  await tap(r.cdp, inside.x, inside.y)
  await r.page.waitForTimeout(700)
  check('A497 relue, elle se SÉLECTIONNE (c’est une forme existante)', (await selected(r.page).getAttribute('data-zone').catch(() => null)) === id)
  const g = await centralGrip(r.page, 'vertex')
  await drag(r.cdp, r.page, { x: g.x, y: g.y }, { x: g.x + 50, y: g.y - 40 })
  const edited = (await mapRings(r.page))[id]
  await r.page.locator('[data-testid="zone-done"]').click()
  await r.page.waitForTimeout(2500)
  check('A497 la MODIFICATION est écrite côté serveur', !sameRing(dbRing(db, id), ring) && sameRing(dbRing(db, id), edited))
  await r.ctx.close()
  const z = await openFarm(W, db)
  check('A497 … et relue à son tour par un navigateur neuf', sameRing((await mapRings(z.page))[id], edited))
  check('A497 aucune erreur de page', o.errors.length === 0 && r.errors.length === 0 && z.errors.length === 0, [...o.errors, ...r.errors, ...z.errors].slice(0, 2).join(' | '))
  await z.page.screenshot({ path: `${SHOTS}/a497-relue-1032.png` })
  await z.ctx.close()
})

await finish()
