import { mkdirSync } from 'node:fs'

import type { BrowserContext, Page, Route } from 'playwright'

import { check, finish, go, open, section, seed, serveBuild } from './ayharness'
import type { Opened } from './ayharness'
import { FakeDb } from './fake-supabase'
import type { LatLng } from '../src/core/index'

/**
 * BK — MESURE (pas une porte) : l'écriture NON TRANSACTIONNELLE d'une forme.
 *
 *   bun run scripts/bkecriture.ts
 *
 * `src/data/write.ts` réécrit une forme en trois requêtes : effacer ses
 * sommets, upsert de la forme, insérer les sommets. Ici, sur la base FACTICE
 * seulement, l'insert des sommets rend 500 (une route posée APRÈS la base
 * factice, donc prioritaire ; tout le reste passe par elle), et l'on relève :
 * la base, la boîte d'envoi (IndexedDB), le nombre d'essais, l'anneau à
 * l'écran, sur l'appareil qui écrit et sur un second profil.
 * Récit : docs/bk/ecriture-non-transactionnelle.md.
 */

const APP = await serveBuild(process.env.DIST ?? 'dist-bkedit', Number(process.env.PORT ?? 5508), process.env.SKIP_BUILD !== '1')
const SHOTS = 'docs/screenshots/bk/ecriture'
mkdirSync(SHOTS, { recursive: true })

const FARM = 'farm-ak1-11'
const B = 'zone-bk-boundary'
const G = 'zone-bk-grazing'

function ringOf(c: LatLng, n: number, rLat: number, rLng: number): LatLng[] {
  return Array.from({ length: n }, (_, i) => ({ lat: c.lat + rLat * Math.sin((i / n) * 2 * Math.PI), lng: c.lng + rLng * Math.cos((i / n) * 2 * Math.PI) }))
}
function db0(): { db: FakeDb; bCenter: LatLng } {
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
  return { db: d, bCenter }
}

/** La panne : les `n` prochains POST sur `zone_vertices` rendent 500. Chaque essai est compté. */
interface Fault {
  fail: number
  attempts: Array<{ at: number; ok: boolean }>
}
async function inject(ctx: BrowserContext, fault: Fault): Promise<void> {
  await ctx.route('**/*.supabase.co/rest/v1/zone_vertices*', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    if (fault.fail > 0) {
      fault.fail--
      fault.attempts.push({ at: Date.now(), ok: false })
      await route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ code: 'XX000', message: 'panne injectée (mesure BK)', details: null, hint: null }) })
      return
    }
    fault.attempts.push({ at: Date.now(), ok: true })
    return route.fallback()
  })
}

const dbCount = (db: FakeDb, id: string) => db.rows('zone_vertices').filter((v) => v.zone_id === id).length
const dbHasZone = (db: FakeDb, id: string) => db.rows('zones').some((z) => z.id === id)
const dbFirst = (db: FakeDb, id: string) => {
  const v = db.rows('zone_vertices').filter((x) => x.zone_id === id).sort((a, b) => Number(a.position) - Number(b.position))[0]
  return v ? Number(v.lat) : null
}

/** L'anneau que la carte dessine (source `zones`), par forme : nombre de sommets et premier sommet. */
const screenRing = (page: Page, id: string) =>
  page.evaluate((zid) => {
    const m = (window as unknown as { __loYanumMap?: { getSource(id: string): { _data?: { features: Array<{ id?: string; properties?: Record<string, unknown>; geometry: { coordinates: number[][][] } }> } } | undefined } }).__loYanumMap
    const f = (m?.getSource('zones')?._data?.features ?? []).find((x) => String(x.properties?.id ?? x.id ?? '') === zid)
    if (!f) return { n: -1, lat: null as number | null }
    const ring = f.geometry.coordinates[0].slice(0, -1)
    return { n: ring.length, lat: ring[0]?.[1] ?? null }
  }, id)

/** La boîte d'envoi et le cache, lus dans IndexedDB (`lo-yanum`). */
const idb = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ outbox: string[]; zoneB: number | null }>((resolve) => {
        const req = indexedDB.open('lo-yanum')
        req.onerror = () => resolve({ outbox: ['(idb illisible)'], zoneB: null })
        req.onsuccess = () => {
          const d = req.result
          if (!d.objectStoreNames.contains('outbox')) return resolve({ outbox: ['(pas de magasin)'], zoneB: null })
          const tx = d.transaction(['outbox', 'aggregates'], 'readonly')
          const keys = tx.objectStore('outbox').getAllKeys()
          const agg = tx.objectStore('aggregates').get('farmZones/zone-bk-boundary')
          tx.oncomplete = () => {
            const rec = agg.result as { json?: string | null } | undefined
            let n: number | null = null
            try {
              n = rec?.json ? ((JSON.parse(rec.json) as { ring?: unknown[] }).ring?.length ?? null) : null
            } catch {
              n = null
            }
            resolve({ outbox: (keys.result as IDBValidKey[]).map(String), zoneB: n })
            d.close()
          }
        }
      }),
  )

async function project(page: Page, p: LatLng) {
  return page.evaluate((q) => {
    const m = (window as unknown as { __loYanumMap: { project(a: [number, number]): { x: number; y: number }; getContainer(): HTMLElement } }).__loYanumMap
    const r = m.getContainer().getBoundingClientRect()
    const s = m.project([q.lng, q.lat])
    return { x: r.left + s.x, y: r.top + s.y }
  }, p)
}
async function openFarm(o: Opened): Promise<void> {
  await go(o.page, APP, `/coordinator/farms/${FARM}`, 7000)
}
/** Ouvrir la limite et la déplacer d'un geste (✥) : UNE écriture. */
async function moveBoundary(page: Page, bCenter: LatLng, dx: number): Promise<void> {
  await page.evaluate((c) => (window as unknown as { __loYanumMap: { jumpTo(o: unknown): void } }).__loYanumMap.jumpTo({ center: [c.lng, c.lat], zoom: 15.5 }), bCenter)
  await page.waitForTimeout(900)
  if ((await page.locator('[data-testid="shape-editor"]').count()) === 0) {
    const p = await project(page, { lat: bCenter.lat, lng: bCenter.lng + 0.0012 })
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(500)
    if ((await page.locator('[data-testid="shape-picker"]').count()) > 0) {
      await page.locator(`[data-testid="shape-pick-${B}"]`).click()
      await page.waitForTimeout(700)
    }
  }
  const b = (await page.locator('[data-testid="editor-move"]').boundingBox())!
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + 20, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(2500)
}
async function state(label: string, page: Page | null, db: FakeDb, fault: Fault) {
  const s = page ? await screenRing(page, B) : { n: NaN, lat: null }
  const i = page ? await idb(page) : { outbox: [], zoneB: null }
  const line = `base : forme ${dbHasZone(db, B) ? 'présente' : 'ABSENTE'}, ${dbCount(db, B)} sommet(s) · écran : ${s.n} sommet(s) · boîte d'envoi : [${i.outbox.join(', ')}] · cache : ${i.zoneB ?? '—'} sommet(s) · essais d'insert : ${fault.attempts.length} (${fault.attempts.filter((a) => !a.ok).length} en échec)`
  console.log(`  ·  ${label} — ${line}`)
  return { screen: s, idb: i, db: dbCount(db, B) }
}

// ===========================================================================
section('Q1 / Q2 — l’appareil qui écrit : la boîte d’envoi, les essais, les relectures')
{
  const { db, bCenter } = db0()
  const fault: Fault = { fail: 0, attempts: [] }
  const a = await open(1440, { db, height: 900, init: { 'lo-yanum:map-mode:farm-detail': 'full', [`lo-yanum:farm-tab:${FARM}`]: 'terrain' } })
  await inject(a.ctx, fault)
  await openFarm(a)
  const s0 = await state('ouverture', a.page, db, fault)
  check('Q1 départ : 12 sommets en base et à l’écran', s0.db === 12 && s0.screen.n === 12)

  fault.fail = 1
  await moveBoundary(a.page, bCenter, -60)
  const s1 = await state('UN geste (✥), l’insert rend 500', a.page, db, fault)
  const movedLat = s1.screen.lat
  check('Q1 la fenêtre est réelle : la forme est en base SANS sommet', dbHasZone(db, B) && s1.db === 0)
  check('Q1 l’écriture est GARDÉE dans la boîte d’envoi', s1.idb.outbox.includes(`farmZones/${B}`), s1.idb.outbox.join(', '))
  check('Q1 l’écran garde la forme déplacée, 12 sommets', s1.screen.n === 12)
  await a.page.screenshot({ path: `${SHOTS}/q1-apres-echec.png` })

  /* Pas de minuterie : rien ne repart tout seul. */
  await a.page.waitForTimeout(30_000)
  const s1b = await state('30 s plus tard, sans rien faire', a.page, db, fault)
  check('Q1 sans déclencheur, AUCUN nouvel essai en 30 s', fault.attempts.length === 1 && s1b.db === 0, `${fault.attempts.length} essai(s)`)

  /* Un second geste pendant l'attente : il attend derrière (l'ordre), il ne part pas. */
  await moveBoundary(a.page, bCenter, -40)
  const s1c = await state('un SECOND geste pendant l’attente', a.page, db, fault)
  check('Q1 un second geste ne part pas : il rejoint la boîte d’envoi (une entrée par forme)', fault.attempts.length === 1 && s1c.idb.outbox.filter((k) => k === `farmZones/${B}`).length === 1)
  const latestLat = s1c.screen.lat

  /* La page des réglages dit-elle qu'une écriture attend ? */
  await a.page.evaluate(() => {
    window.location.hash = '#/coordinator/settings'
  })
  await a.page.waitForTimeout(1500)
  const badge = await a.page.locator('[data-testid="sync-state"]').innerText().catch(() => '(absent)')
  console.log(`  ·  הגדרות dit : « ${badge} »`)
  check('Q1 הגדרות dit qu’une écriture attend', /1/.test(badge) && badge !== '(absent)', badge)
  await a.page.screenshot({ path: `${SHOTS}/q1-reglages-en-attente.png` })

  /* Q2 — une relecture (rechargement : démarrage à froid → vider la boîte → relire) dont le vidage
     ÉCHOUE encore : la relecture lit la forme SANS sommet en base. Écrase-t-elle l'anneau local ? */
  fault.fail = 1
  await openFarm(a)
  const s2 = await state('rechargement, le rejeu échoue encore, relecture d’une forme vide', a.page, db, fault)
  check('Q2 la relecture n’écrase PAS l’anneau local : 12 sommets à l’écran, la dernière position', s2.screen.n === 12 && s2.screen.lat === latestLat, `écran ${s2.screen.n}, Δlat ${s2.screen.lat !== null && latestLat !== null ? (s2.screen.lat - latestLat).toExponential(1) : '—'}`)
  check('Q2 … et le cache garde 12 sommets ; la boîte d’envoi garde l’écriture', s2.idb.zoneB === 12 && s2.idb.outbox.includes(`farmZones/${B}`))
  check('Q2 la base, elle, est toujours vide', s2.db === 0)
  await a.page.screenshot({ path: `${SHOTS}/q2-relecture-forme-vide.png` })

  /* Le retour du réseau (`online`) : le seul autre déclencheur. */
  await a.ctx.setOffline(true)
  await a.page.waitForTimeout(500)
  await a.ctx.setOffline(false)
  await a.page.waitForTimeout(3000)
  const s3 = await state('événement « online »', a.page, db, fault)
  check('Q1 le retour du réseau rejoue l’écriture : la base a 12 sommets, la dernière position', s3.db === 12 && dbFirst(db, B) === latestLat && s3.idb.outbox.length === 0, `${fault.attempts.length} essai(s) au total`)
  console.log(`  ·  essais : ${fault.attempts.map((x) => (x.ok ? 'OK' : '500')).join(' → ')} (latitude d’écran avant/après : ${movedLat} / ${latestLat})`)
  await a.ctx.close()
}

// ===========================================================================
section('Q1 — l’onglet fermé, puis rouvert')
{
  const { db, bCenter } = db0()
  const fault: Fault = { fail: 0, attempts: [] }
  const a = await open(1440, { db, height: 900, init: { 'lo-yanum:map-mode:farm-detail': 'full', [`lo-yanum:farm-tab:${FARM}`]: 'terrain' } })
  await inject(a.ctx, fault)
  await openFarm(a)
  fault.fail = 1
  await moveBoundary(a.page, bCenter, -60)
  const s1 = await state('geste, insert en 500', a.page, db, fault)
  const lat = s1.screen.lat
  await a.page.close()
  console.log(`  ·  onglet FERMÉ — base : ${dbCount(db, B)} sommet(s)`)
  const page2 = await a.ctx.newPage()
  page2.setDefaultTimeout(8000)
  const b: Opened = { ...a, page: page2 }
  await openFarm(b)
  const s2 = await state('onglet rouvert (même profil)', page2, db, fault)
  check('Q1 la boîte d’envoi survit à l’onglet fermé : à la réouverture, l’écriture part, 12 sommets en base', s2.db === 12 && dbFirst(db, B) === lat && s2.idb.outbox.length === 0, `${fault.attempts.length} essai(s)`)
  await a.ctx.close()
}

// ===========================================================================
section('Q3 / Q4 — un SECOND profil qui relit pendant la fenêtre ; l’appareil qui ne revient pas')
{
  const { db, bCenter } = db0()
  const fault: Fault = { fail: 0, attempts: [] }
  const a = await open(1440, { db, height: 900, init: { 'lo-yanum:map-mode:farm-detail': 'full', [`lo-yanum:farm-tab:${FARM}`]: 'terrain' } })
  await inject(a.ctx, fault)
  const b = await open(1440, { db, height: 900, init: { 'lo-yanum:map-mode:farm-detail': 'full', [`lo-yanum:farm-tab:${FARM}`]: 'terrain' } })
  await openFarm(a)
  await openFarm(b)
  const b0 = await state('profil B, avant', b.page, db, fault)
  check('Q3 B voit la forme entière avant la fenêtre (12 sommets, en cache)', b0.screen.n === 12 && b0.idb.zoneB === 12)

  fault.fail = 1
  await moveBoundary(a.page, bCenter, -60)
  const aLat = (await screenRing(a.page, B)).lat
  await openFarm(b)
  const b1 = await state('profil B relit PENDANT la fenêtre', b.page, db, fault)
  const zonesText = await b.page.locator('[data-block="entity-zones"]').innerText().catch(() => '(bloc absent)')
  console.log(`  ·  B, liste des formes : « ${zonesText.replace(/\s+/g, ' ').slice(0, 160)} »`)
  check('Q3 B ne plante pas', b.errors.length === 0, b.errors.slice(0, 2).join(' | '))
  console.log(`  ·  B voit : ${b1.screen.n === -1 ? 'forme ABSENTE de la carte' : `${b1.screen.n} sommet(s) sur la carte`} ; son cache : ${b1.idb.zoneB ?? '—'} sommet(s)`)
  await b.page.screenshot({ path: `${SHOTS}/q3-profil-b-pendant.png` })

  /* A rejoue (retour du réseau) ; B relit. */
  await a.ctx.setOffline(true)
  await a.page.waitForTimeout(300)
  await a.ctx.setOffline(false)
  await a.page.waitForTimeout(3000)
  await openFarm(b)
  const b2 = await state('A a rejoué ; B relit', b.page, db, fault)
  check('Q3 une fois l’écriture rejouée, B retrouve la forme ENTIÈRE, à la position de A', b2.screen.n === 12 && b2.screen.lat === aLat)
  await b.page.screenshot({ path: `${SHOTS}/q3-profil-b-apres.png` })

  /* Q4 — A ne revient JAMAIS : sa boîte d'envoi disparaît avec lui. */
  fault.fail = 1
  await moveBoundary(a.page, bCenter, 50)
  const a4 = await state('A : un geste en échec, puis A disparaît', a.page, db, fault)
  await a.ctx.close()
  console.log(`  ·  A FERMÉ pour de bon (profil détruit, boîte d’envoi perdue) — boîte qu’il avait : [${a4.idb.outbox.join(', ')}]`)
  await Bun.sleep(5000)
  await openFarm(b)
  const b4s = await screenRing(b.page, B)
  const b4i = await idb(b.page)
  console.log(`  ·  B voit : ${b4s.n === -1 ? 'forme ABSENTE de la carte' : `${b4s.n} sommet(s)`} ; cache de B : ${b4i.zoneB ?? '—'} ; base : forme ${dbHasZone(db, B) ? 'présente' : 'absente'}, ${dbCount(db, B)} sommet(s)`)
  check('Q4 (constat) : sans A, la forme reste en base SANS sommet', dbHasZone(db, B) && dbCount(db, B) === 0)
  await b.page.screenshot({ path: `${SHOTS}/q4-profil-b-sans-a.png` })
  await b.ctx.close()
}

await finish()
