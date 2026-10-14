import { mkdirSync } from 'node:fs'

import type { CDPSession, Page } from 'playwright'

import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import { FakeDb } from './fake-supabase'
import { ringAreaDunams } from '../src/core/geo'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BI — AU RENDU, DANS LES CONDITIONS DE L'ORDINATEUR DU PO.   A504 … A510
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run biui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run biui    # le DÉPLOYÉ
 *
 * ★ PAS UN BANC FAVORABLE. Le bundle est CONSTRUIT (ou celui que sert GitHub
 *   Pages), le service worker est installé et CONTRÔLE la page (on recharge
 *   pour ça, comme le PO), le navigateur est un Chrome de bureau à la souris en
 *   1 440 × 900, et l'appareil porte le `localStorage` d'un ordinateur qui a
 *   servi AVANT BI : thème sombre sans instant, carte en `split`, onglet
 *   retenu, et — l'état qui faisait tout — les couches « גבולות » et « מרעה »
 *   éteintes dans `lo-yanum:map-layers`. La base (factice) porte la ferme du
 *   banc avec DEUX formes, 31 et 29 sommets, comme farm-ak1-11.
 *
 *   A504  ★ chargement initial, profil d'avant BI : la fiche dessine DEUX
 *         anneaux, 31 et 29 sommets — dans la source ET au rendu ; idem après
 *         un rechargement complet (service worker aux commandes) ; idem sur la
 *         carte de l'écran des fermes
 *   A505  ★ relecture à chaud : formes absentes à l'ouverture, écrites par
 *         « l'iPad » pendant que la page est ouverte → les deux anneaux
 *         apparaissent, bons sommets ; une forme retouchée ailleurs suit
 *   A506  réglage absent, illisible, inconnu : les formes sont montrées
 *   A507  un choix fait depuis BI qui cache les formes SE VOIT : la pastille
 *         « N צורות מוסתרות » et son geste les rendent
 *   A508  le panneau de diagnostic : versions, relecture, mémoire, ferme,
 *         carte, couches ; « העתקה » copie le texte
 *   A509  ★ le brouillon : douze sommets au doigt (tablette), l'écran fermé
 *         brutalement, la ferme rouverte → la bande nomme la forme, « המשך »
 *         rend les douze, « סגור פוליגון » l'écrit ; « מחיקת הטיוטה » le jette
 *   A510  ★ la surface : après un sommet tiré, la barre, l'étiquette de la
 *         carte, la tuile « מדוד » et la base disent le même nombre
 */

const OUT = process.env.DIST ?? 'dist-biui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5497), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bi/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })
const DESK = { w: 1440, h: 900 }
const TAB = { w: 1032, h: 1376 }

const FARM = 'farm-ak1-11'
const B = 'zone-bi-boundary'
const G = 'zone-bi-grazing'

/** Le `localStorage` d'un ordinateur qui a servi avant BI. */
const PRE_BI_COMPUTER: Record<string, string> = {
  'lo-yanum:theme:coordinator': 'dark',
  'lo-yanum:map-layers': JSON.stringify({ entities: true, institutions: true, leads: true, boundaries: false, grazing: false, posts: true, pickups: true, threatZones: false, threatVectors: false, regions: false, regionColors: false }),
  'lo-yanum:map-mode:farm-detail': 'split',
  [`lo-yanum:farm-tab:${FARM}`]: 'terrain',
}

function ringOf(c: { lat: number; lng: number }, n: number, rLat: number, rLng: number) {
  return Array.from({ length: n }, (_, i) => ({ lat: c.lat + rLat * Math.sin((i / n) * 2 * Math.PI), lng: c.lng + rLng * Math.cos((i / n) * 2 * Math.PI) }))
}

function putZone(d: FakeDb, id: string, kind: string, ring: Array<{ lat: number; lng: number }>): void {
  const at = new Date().toISOString()
  d.rows('zones').push({ id, entity_id: FARM, kind, created_at: at, updated_at: at })
  ring.forEach((v, position) => d.rows('zone_vertices').push({ zone_id: id, position, lat: v.lat, lng: v.lng }))
}

/** La base : le banc rebaptisé, et (ou non) les deux formes de farm-ak1-11 — 31 et 29 sommets. */
function biDb(withZones = true): { db: FakeDb; name: string; center: { lat: number; lng: number } } {
  const d = new FakeDb()
  seed(d)
  d.rows('entities').forEach((r, n) => {
    const k = String(n + 1).padStart(2, '0')
    Object.assign(r, { name: `חוות בדיקה ${k}`, farm_name: '', farmer_name: `חקלאי ${k}`, farmer_phone: `050-000-12${k}`, farmer_email: '', liaison_name: '', liaison_phone: '', standby_phone: '', notes: '', farmer_id_no: '' })
  })
  const f = d.rows('entities').find((r) => r.id === FARM)!
  const center = { lat: Number(f.lat), lng: Number(f.lng) }
  if (withZones) {
    putZone(d, B, 'farm_boundary', ringOf(center, 31, 0.0016, 0.0023))
    putZone(d, G, 'grazing_area', ringOf(center, 29, 0.016, 0.018))
  }
  d.cascades.set('zones', [{ table: 'zone_vertices', fk: 'zone_id' }])
  return { db: d, name: String(f.name), center }
}

const dbRing = (db: FakeDb, zoneId: string) =>
  db
    .rows('zone_vertices')
    .filter((v) => v.zone_id === zoneId)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((v) => ({ lat: Number(v.lat), lng: Number(v.lng) }))

type Seen = { source: Record<string, number>; rendered: string[]; ready: boolean }
/** Ce que la carte A : les anneaux de sa source (sommets), et les formes que le moteur a RENDUES. */
async function seen(page: Page): Promise<Seen> {
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => {
      const m = (window as unknown as { __loYanumMap?: any }).__loYanumMap
      if (!m || !m.getSource('zones') || !m.isStyleLoaded()) return null
      const source: Record<string, number> = {}
      for (const f of m.getSource('zones')._data?.features ?? []) source[String(f.properties?.id)] = f.geometry.coordinates[0].length - 1
      const rendered = m.getLayer('zones-line') ? [...new Set(m.queryRenderedFeatures({ layers: ['zones-line'] }).map((f: any) => String(f.properties?.id)))] : []
      return { source, rendered: rendered as string[], ready: true }
    })
    if (s && (Object.keys(s.source).length > 0 || i > 12)) {
      await page.waitForTimeout(300)
      return s
    }
    await page.waitForTimeout(500)
  }
  return { source: {}, rendered: [], ready: false }
}
const twoRings = (s: Seen) => s.source[B] === 31 && s.source[G] === 29 && s.rendered.includes(B) && s.rendered.includes(G)
const fmt = (s: Seen) => `source ${JSON.stringify(s.source)} · rendu [${s.rendered.join(', ')}]`

async function openDesk(db: FakeDb, init: Record<string, string> = PRE_BI_COMPUTER, dark = true, hash = `/coordinator/farms/${FARM}`) {
  const o = await open(DESK.w, { db, height: DESK.h, dark, init })
  await o.ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
  await go(o.page, APP, hash, 5000)
  return o
}

// ===========================================================================
await guard('A504', async () => {
  section('A504 — ★ l’ordinateur d’avant BI : chargement, rechargement, écran des fermes')
  const { db } = biDb()
  const o = await openDesk(db)
  const s0 = await seen(o.page)
  check('A504 ★ chargement initial : DEUX anneaux, 31 et 29 sommets, dans la source et au rendu', twoRings(s0), fmt(s0))
  check('A504 … le profil est bien celui d’avant BI (thème sombre appliqué)', (await o.page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark')
  await o.page.screenshot({ path: `${SHOTS}/a504-fiche-ordinateur-1440.png` })
  /* Le rechargement complet du PO : le service worker, installé au premier chargement, sert la page. */
  await o.page.reload({ waitUntil: 'load' })
  await o.page.waitForTimeout(5000)
  const sw = await o.page.evaluate(() => !!navigator.serviceWorker?.controller)
  const s1 = await seen(o.page)
  check('A504 rechargement complet : la page est servie SOUS le service worker', sw || REMOTE === null, sw ? 'contrôlée' : 'non contrôlée')
  check('A504 ★ après rechargement : toujours deux anneaux, 31 et 29', twoRings(s1), fmt(s1))
  await go(o.page, APP, '/coordinator/farms', 5000)
  const s2 = await seen(o.page)
  check('A504 la carte de l’écran des fermes dessine aussi les deux formes', s2.source[B] === 31 && s2.source[G] === 29, fmt(s2))
  check('A504 aucune pastille « formes cachées » (rien n’est caché)', (await o.page.locator('[data-testid="map-hidden-zones"]').count()) === 0)
  check('A504 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
await guard('A505', async () => {
  section('A505 — ★ relecture à chaud : les formes arrivent pendant que la page est ouverte')
  const { db, center } = biDb(false)
  const o = await openDesk(db)
  const s0 = await seen(o.page)
  check('A505 à l’ouverture, la ferme n’a aucune forme', Object.keys(s0.source).length === 0, fmt(s0))
  /* « L'iPad » écrit les deux formes ; l'ordinateur relit à son retour en avant-plan. */
  putZone(db, B, 'farm_boundary', ringOf(center, 31, 0.0016, 0.0023))
  putZone(db, G, 'grazing_area', ringOf(center, 29, 0.016, 0.018))
  await o.page.waitForTimeout(11_000)
  await o.page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await o.page.waitForTimeout(3500)
  const s1 = await seen(o.page)
  check('A505 ★ après la relecture : DEUX anneaux, 31 et 29 sommets, rendus', twoRings(s1), fmt(s1))
  /* Une retouche faite ailleurs : 31 → 33 sommets. */
  for (const v of db.rows('zone_vertices').filter((x) => x.zone_id === B)) db.rows('zone_vertices').splice(db.rows('zone_vertices').indexOf(v), 1)
  ringOf(center, 33, 0.0017, 0.0024).forEach((v, position) => db.rows('zone_vertices').push({ zone_id: B, position, lat: v.lat, lng: v.lng }))
  await o.page.waitForTimeout(11_000)
  await o.page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await o.page.waitForTimeout(3500)
  const s2 = await seen(o.page)
  check('A505 une forme retouchée ailleurs : la carte suit (33 sommets)', s2.source[B] === 33 && s2.source[G] === 29, fmt(s2))
  await o.page.screenshot({ path: `${SHOTS}/a505-apres-relecture-1440.png` })
  check('A505 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
await guard('A506', async () => {
  section('A506 — réglage absent, illisible, inconnu : on montre')
  for (const [label, raw] of [
    ['absent', null],
    ['illisible', '{boundaries:false'],
    ['inconnu', '{"layersV9":{"zones":"off"},"boundaries":"no"}'],
  ] as const) {
    const { db } = biDb()
    const init: Record<string, string> = { 'lo-yanum:map-mode:farm-detail': 'split' }
    if (raw !== null) init['lo-yanum:map-layers'] = raw
    const o = await openDesk(db, init, false)
    const s = await seen(o.page)
    check(`A506 réglage ${label} : les deux anneaux sont dessinés`, twoRings(s), fmt(s))
    await o.ctx.close()
  }
})

// ===========================================================================
await guard('A507', async () => {
  section('A507 — un choix qui cache les formes se voit, et se défait')
  const { db } = biDb()
  const o = await openDesk(db, { 'lo-yanum:map-mode:farm-detail': 'split', 'lo-yanum:map-layers': JSON.stringify({ __v: 2, boundaries: false, grazing: true }) }, false)
  const s0 = await seen(o.page)
  const chip = o.page.locator('[data-testid="map-hidden-zones"]')
  check('A507 contour éteint par un choix : seul le pâturage est dessiné', s0.source[G] === 29 && s0.source[B] === undefined, fmt(s0))
  check('A507 ★ la carte le DIT : « 1 צורה מוסתרת », visible', (await chip.count()) === 1 && (await chip.isVisible()) && (await chip.getAttribute('data-count')) === '1')
  await o.page.screenshot({ path: `${SHOTS}/a507-pastille-1440.png` })
  await chip.click()
  await o.page.waitForTimeout(1000)
  const s1 = await seen(o.page)
  check('A507 un geste : les deux anneaux reviennent, la pastille part', twoRings(s1) && (await chip.count()) === 0, fmt(s1))
  await o.ctx.close()
})

// ===========================================================================
await guard('A508', async () => {
  section('A508 — le panneau de diagnostic')
  const { db } = biDb()
  const o = await openDesk(db)
  await seen(o.page)
  await o.page.locator('[data-testid="map-legend-toggle"]').first().click()
  await o.page.waitForTimeout(300)
  await o.page.locator('[data-testid="diagnostic-open"]').first().click()
  const dlg = o.page.locator('[data-testid="device-diagnostic"]')
  await dlg.waitFor()
  await o.page.waitForTimeout(2500)
  const row = (k: string) => o.page.locator(`[data-row="${k}"]`).getAttribute('data-value')
  const verdict = await o.page.locator('[data-testid="diagnostic-verdict"]').getAttribute('data-code')
  check('A508 la phrase : « toutes les formes sont dessinées »', verdict === 'ok', String(verdict))
  const running = String(await row('running'))
  const served = String(await row('served'))
  check('A508 la version qui TOURNE et celle qui est SERVIE, toutes deux lues', running.length > 6 && served.length > 6 && running.split(' · ')[0] === served.split(' · ')[0], `${running} | ${served}`)
  check('A508 la dernière relecture réussie est datée', /\d/.test(String(await row('lastRead'))), String(await row('lastRead')))
  check('A508 en mémoire : 2 formes, 60 sommets', String(await row('memory')).includes('2') && String(await row('memory')).includes('60'), String(await row('memory')))
  const farmRow = String(await row('farm'))
  check('A508 la ferme ouverte : ses deux formes, 31 et 29 sommets', farmRow.includes(FARM) && farmRow.includes('31') && farmRow.includes('29'), farmRow)
  check('A508 ce que la carte a reçu : 2 sur 2', String(await row('drawn')).startsWith('2 מתוך 2'), String(await row('drawn')))
  check('A508 ★ et ce qui s’est passé sur CET appareil : les couches de formes rallumées par BI', /גבולות|מרעה/.test(String(await row('migration'))), String(await row('migration')))
  await o.page.screenshot({ path: `${SHOTS}/a508-diagnostic-1440.png` })
  await o.page.locator('[data-testid="device-diagnostic"] [data-testid="copy-button"]').click()
  await o.page.waitForTimeout(500)
  const copied = await o.page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  check('A508 « העתקה » copie le relevé entier', copied.includes(running.split(' · ')[0]) && copied.includes(FARM) && copied.split('\n').length >= 15, `${copied.split('\n').length} lignes`)
  check('A508 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
/* --- Le doigt, en tablette (CDP : de vrais évènements tactiles) ------------ */
async function tap(cdp: CDPSession, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
async function drag(cdp: CDPSession, page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let i = 1; i <= 14; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 14, y: from.y + ((to.y - from.y) * i) / 14 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(600)
}
async function openTablet(db: FakeDb, ctx?: Awaited<ReturnType<typeof open>>['ctx']) {
  if (ctx) {
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await go(page, APP, `/coordinator/farms/${FARM}`, 6000)
    return { ctx, page, errors, cdp: await ctx.newCDPSession(page) }
  }
  const o = await open(TAB.w, { db, height: TAB.h, touch: true, init: { 'lo-yanum:map-mode:farm-detail': 'split' } })
  await go(o.page, APP, `/coordinator/farms/${FARM}`, 6000)
  return { ...o, cdp: await o.ctx.newCDPSession(o.page) }
}
/** `n` points où le CANEVAS est sous le doigt (ni bouton, ni bandeau, ni épingle), en anneau. */
async function canvasPoints(page: Page, n: number, dy = 0) {
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    for (const el of document.querySelectorAll<HTMLElement>('*')) if (el.scrollTop > 0) el.scrollTop = 0
  })
  await page.waitForTimeout(300)
  return page.evaluate(
    ([count, shift]) => {
      const box = document.querySelector('[role="application"]')!.getBoundingClientRect()
      const cx = box.left + box.width / 2
      const cy = box.top + box.height * 0.42 + shift
      const onCanvas = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.classList.contains('maplibregl-canvas') ?? false
      const out: Array<{ x: number; y: number }> = []
      for (let k = 0; k < count * 8 && out.length < count * 2; k++) {
        const a = (k / count) * Math.PI * 2 + Math.floor(k / count) * 0.17
        const r = 1 - Math.floor(k / count) * 0.12
        const x = cx + 170 * r * Math.cos(a)
        const y = cy + 115 * r * Math.sin(a)
        if (onCanvas(x, y) && out.every((p) => Math.hypot(p.x - x, p.y - y) > 56)) out.push({ x, y })
      }
      return out
    },
    [n, dy] as const,
  )
}

/** Pose `n` sommets : un appui seulement là où le canevas est ENCORE sous le doigt. */
async function placeVertices(page: Page, cdp: CDPSession, n: number, dy = 0): Promise<number> {
  let placed = 0
  for (const p of await canvasPoints(page, n, dy)) {
    if (placed === n) break
    const free = await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.classList.contains('maplibregl-canvas') ?? false, [p.x, p.y] as const)
    if (!free) continue
    await tap(cdp, p.x, p.y)
    await page.waitForTimeout(220)
    placed++
  }
  return placed
}

await guard('A509', async () => {
  section('A509 — ★ le brouillon survit à un écran fermé brutalement')
  const { db, name } = biDb(false)
  const o = await openTablet(db)
  await o.page.locator('[data-testid="draw-tools-toggle"]').click()
  await o.page.waitForTimeout(250)
  await o.page.locator('[data-testid="draw-boundary"]').click()
  const placed = await placeVertices(o.page, o.cdp, 12)
  check('A509 douze appuis sur le canevas', placed === 12, String(placed))
  check('A509 douze sommets posés au doigt', (await o.page.getByText('12 פינות').count()) > 0)
  check('A509 rien n’est écrit en base tant que le polygone n’est pas fermé', db.rows('zones').length === 0)
  /* L'appel qui entre, l'écran qui se verrouille : la page part sans rien demander. */
  await o.page.close({ runBeforeUnload: false })
  const r = await openTablet(db, o.ctx)
  const banner = r.page.locator('[data-testid="zone-draft-banner"]')
  const text = await banner.innerText().catch(() => '')
  check('A509 ★ la ferme rouverte : une bande propose le brouillon', (await banner.count()) === 1 && (await banner.getAttribute('data-vertices')) === '12')
  check('A509 … en NOMMANT la forme (« גבול החווה · <ferme> »)', text.includes('גבול החווה') && text.includes(name), text.replace(/\s+/g, ' ').slice(0, 120))
  await r.page.screenshot({ path: `${SHOTS}/a509-bande-brouillon-1032.png` })
  /* Un second tracé (un trait raté, on recommence) : le premier brouillon reste. */
  await r.page.locator('[data-testid="draw-tools-toggle"]').click()
  await r.page.waitForTimeout(250)
  await r.page.locator('[data-testid="draw-grazing"]').click()
  check('A509 aucun bouton de tracé n’est bloqué par le brouillon : un tracé neuf commence', (await r.page.locator('[data-testid="draw-context-bar"]').count()) === 1)
  await placeVertices(r.page, r.cdp, 3, 60)
  await r.page.keyboard.press('Escape')
  await r.page.waitForTimeout(600)
  check('A509 ★ un second tracé ne remplace pas le premier : deux brouillons, le plus récent proposé', (await banner.getAttribute('data-drafts')) === '2' && (await banner.getAttribute('data-zone')) === 'grazing_area' && (await r.page.locator('[data-testid="zone-draft-more"]').count()) === 1)
  await r.page.locator('[data-testid="zone-draft-discard"]').click()
  await r.page.locator('[data-testid="zone-draft-discard-yes"]').click()
  await r.page.waitForTimeout(400)
  check('A509 le second jeté : le brouillon de douze revient en tête', (await banner.getAttribute('data-vertices')) === '12' && (await banner.getAttribute('data-drafts')) === '1')
  await r.page.locator('[data-testid="zone-draft-resume"]').click()
  await r.page.waitForTimeout(600)
  check('A509 « המשך ציור » : les douze sommets sont là', (await r.page.getByText('12 פינות').count()) > 0)
  await r.page.getByRole('button', { name: 'סגור פוליגון', exact: true }).first().click()
  await r.page.waitForTimeout(2500)
  const zones = db.rows('zones').filter((z) => z.entity_id === FARM)
  check('A509 fermé : la forme est écrite, douze sommets', zones.length === 1 && dbRing(db, String(zones[0]?.id)).length === 12)
  await r.page.reload({ waitUntil: 'load' })
  await r.page.waitForTimeout(5000)
  check('A509 … et le brouillon n’est plus proposé', (await r.page.locator('[data-testid="zone-draft-banner"]').count()) === 0)
  check('A509 aucune erreur de page', r.errors.length === 0, r.errors.slice(0, 2).join(' | '))

  /* Jeter : un geste nommé, confirmé. Échap ou « ביטול » ne jettent rien. */
  await r.page.locator('[data-testid="draw-tools-toggle"]').click()
  await r.page.waitForTimeout(250)
  await r.page.locator('[data-testid="draw-grazing"]').click()
  await placeVertices(r.page, r.cdp, 5, 30)
  await r.page.keyboard.press('Escape')
  await r.page.waitForTimeout(500)
  check('A509 Échap ne jette pas le tracé : la bande le propose aussitôt', (await r.page.locator('[data-testid="zone-draft-banner"]').getAttribute('data-vertices').catch(() => null)) === '5')
  await r.page.locator('[data-testid="zone-draft-discard"]').click()
  check('A509 « מחיקת הטיוטה » demande confirmation', (await r.page.locator('[data-testid="zone-draft-discard-yes"]').count()) === 1)
  await r.page.locator('[data-testid="zone-draft-discard-yes"]').click()
  await r.page.reload({ waitUntil: 'load' })
  await r.page.waitForTimeout(5000)
  check('A509 jeté et confirmé : plus de bande, même après rechargement', (await r.page.locator('[data-testid="zone-draft-banner"]').count()) === 0)
  await r.ctx.close()
})

// ===========================================================================
await guard('A510', async () => {
  section('A510 — ★ la surface : un seul nombre partout')
  const { db, center } = biDb(false)
  const hexa = ringOf({ lat: center.lat + 0.004, lng: center.lng + 0.005 }, 6, 0.0035, 0.0042)
  putZone(db, B, 'farm_boundary', hexa)
  const o = await openTablet(db)
  /* La fiche ouvre sur l'onglet « החווה », où est la tuile « מדוד ». */
  const tile = async () => {
    const title = await o.page.locator('[title^="שטח מדוד ·"]').first().getAttribute('title').catch(() => '')
    return Number(String(title).replace(/[^\d]/g, ''))
  }
  check('A510 à l’ouverture, la tuile « מדוד » dit 403', (await tile()) === 403, String(await tile()))
  /* Sélectionner la forme, puis tirer un sommet. */
  const centerPt = await o.page.evaluate((q) => {
    const m = (window as unknown as { __loYanumMap: any }).__loYanumMap
    const r = m.getContainer().getBoundingClientRect()
    const p = m.project([q.lng, q.lat + 0.0008])
    return { x: r.left + p.x, y: r.top + p.y }
  }, { lat: center.lat + 0.004, lng: center.lng + 0.005 - 0.0015 })
  await tap(o.cdp, centerPt.x, centerPt.y)
  await o.page.waitForTimeout(800)
  check('A510 la forme est sélectionnée', (await o.page.locator('[data-testid="zone-selected"]').count()) === 1)
  const grip = await o.page.evaluate(() => {
    const box = document.querySelector('[role="application"]')!.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const all = [...document.querySelectorAll<HTMLElement>('.maplibregl-marker[data-marker-kind="vertex"][aria-label="פינת אזור"]')].map((e) => {
      const r = e.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      const hit = document.elementFromPoint(x, y)
      return { x, y, free: !!hit && (hit === e || e.contains(hit)) }
    })
    return all.filter((g) => g.free).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0]
  })
  await drag(o.cdp, o.page, grip, { x: grip.x - 70, y: grip.y + 50 })
  await o.page.waitForTimeout(1800)
  const bar = await o.page.locator('[data-testid="zone-selected"]').innerText()
  const barN = Number((/([\d,]+)\s*דונם/.exec(bar)?.[1] ?? '').replace(/,/g, ''))
  const labelN = await o.page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('.maplibregl-marker')].find((e) => /דונם/.test(e.textContent ?? '') && !e.closest('[data-testid="zone-selected"]'))
    return Number(((el?.textContent ?? '').match(/([\d,]+)\s*דונם/)?.[1] ?? '').replace(/,/g, ''))
  })
  const baseN = Math.round(ringAreaDunams(dbRing(db, B)))
  const tileN = await tile()
  check(`A510 ★ barre ${barN} = étiquette ${labelN} = tuile ${tileN} = base ${baseN}`, barN > 0 && barN === labelN && labelN === tileN && tileN === baseN && barN !== 403)
  await o.page.screenshot({ path: `${SHOTS}/a510-surface-1032.png` })
  check('A510 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

await finish()
