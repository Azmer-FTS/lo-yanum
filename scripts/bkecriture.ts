import { mkdirSync, readFileSync } from 'node:fs'

import type { BrowserContext, Page } from 'playwright'

import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import type { Opened } from './ayharness'
import { FakeDb } from './fake-supabase'
import { MAPPINGS } from '../src/data/rows'
import type { LatLng } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BK — UN AGRÉGAT S'ÉCRIT EN UNE TRANSACTION, ET LA BOÎTE D'ENVOI SE RELANCE.
 *      A620 … A626
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bkecriture
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bkecriture   (déployé)
 *   DIST=<dossier d'un build> SKIP_BUILD=1 bun run bkecriture         (un autre build)
 *
 * D'abord une MESURE (docs/bk/ecriture-non-transactionnelle.md) : `write.ts`
 * réécrivait un agrégat en trois requêtes (effacer les sous-lignes, upsert,
 * insérer) ; une panne entre deux laissait la forme en base SANS sommet, un
 * second appareil la voyait disparaître, et rien ne relançait l'écriture sans
 * rechargement ni retour du réseau. Décision du PO : une transaction côté base
 * (`public.write_aggregate`, migration 20261018000200) pour toutes les tables à
 * sous-lignes, et une relance automatique.
 *
 * LA PANNE est la même pour l'ancien et le nouveau code : la base factice fait
 * échouer la prochaine INSERTION dans une table de sous-lignes
 * (`FakeDb.failInsert`) — par PostgREST, les sous-lignes sont alors DÉJÀ
 * effacées ; dans `write_aggregate`, la transaction est annulée. Cette porte
 * est ROUGE sur le code d'avant le correctif, VERTE après : les deux sorties
 * sont dans docs/bk/ecriture-transaction.md.
 *
 *   A620  (pur) la liste blanche de la fonction SQL est EXACTEMENT celle de
 *         `MAPPINGS` (parents, sous-tables, ordre, clés) et celle de la base
 *         factice ; la fonction est SECURITY INVOKER, search_path vide,
 *         identifiants par %I, execute à `authenticated` seulement
 *   A621  une panne AU MILIEU de l'écriture d'une forme la laisse ENTIÈRE en
 *         base, à l'ANCIENNE position
 *   A622  un second profil qui relit pendant l'attente ne voit JAMAIS 0 point :
 *         l'ancienne forme entière ; puis la nouvelle, une fois rejouée
 *   A623  la boîte d'envoi rejoue SEULE — sans rechargement, sans `online` —
 *         après trois échecs, en moins de 20 s ; la base porte alors la nouvelle position
 *   A624  la relance : délais CROISSANTS et bornés, un seul essai à la fois,
 *         un second geste remplace l'entrée, plus rien après le succès
 *   A625  une FICHE DE FERME (contacts, engagements) : une panne au milieu ne
 *         lui enlève ni ses contacts ni rien ; rejouée, la modification passe
 *         et les contacts sont toujours là
 *   A626  une ZONE DE MENACE : une panne au milieu la laisse entière ; rejouée,
 *         la nouvelle intensité passe, ses sommets intacts
 */

const APP = REMOTE ?? (await serveBuild(process.env.DIST ?? 'dist-bkecriture', Number(process.env.PORT ?? 5508), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bk/ecriture-${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

/** La relance doit avoir rejoué en moins de N secondes (premier délai : 2 s). */
const N_SECONDS = 10

const FARM = 'farm-ak1-11'
const B = 'zone-bk-boundary'
const G = 'zone-bk-grazing'
const T = 'threat-bk-ecriture'

function ringOf(c: LatLng, n: number, rLat: number, rLng: number): LatLng[] {
  return Array.from({ length: n }, (_, i) => ({ lat: c.lat + rLat * Math.sin((i / n) * 2 * Math.PI), lng: c.lng + rLng * Math.cos((i / n) * 2 * Math.PI) }))
}

/** Une ferme d'essai : une limite (12 sommets), un pâturage, deux contacts, deux engagements, une zone de menace (6 sommets). Rien de réel. */
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
  const at = new Date().toISOString()
  const put = (id: string, kind: string, ring: LatLng[]) => {
    d.rows('zones').push({ id, entity_id: FARM, kind, created_at: at, updated_at: at })
    ring.forEach((v, position) => d.rows('zone_vertices').push({ zone_id: id, position, lat: v.lat, lng: v.lng }))
  }
  put(B, 'farm_boundary', ringOf(bCenter, 12, 0.0016, 0.0023))
  put(G, 'grazing_area', ringOf(center, 10, 0.016, 0.018))
  for (const [position, name] of ['איש קשר ראשון', 'איש קשר שני'].entries()) {
    d.rows('entity_contacts').push({ id: `contact-bk-${position}`, entity_id: FARM, name, phone: `050-000-99${position}0`, email: '', role: 'בעלים', photo: null, is_primary: position === 0, note: '', restricts_calls: false, position })
  }
  for (const position of [0, 1]) d.rows('entity_commitments').push({ id: `${FARM}:c${position}`, entity_id: FARM, kind: 'other', detail: `התחייבות ${position + 1}`, fulfilled: false, position })
  d.rows('threat_zones').push({ id: T, entity_id: FARM, intensity: 'medium', note: '', updated_at: at })
  ringOf({ lat: center.lat - 0.004, lng: center.lng - 0.004 }, 6, 0.002, 0.0025).forEach((v, position) => d.rows('threat_zone_vertices').push({ threat_zone_id: T, position, lat: v.lat, lng: v.lng }))
  d.cascades.set('zones', [{ table: 'zone_vertices', fk: 'zone_id' }])
  return { db: d, bCenter }
}

const verts = (db: FakeDb, table: string, fk: string, id: string) =>
  db
    .rows(table)
    .filter((v) => v[fk] === id)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((v) => ({ lat: Number(v.lat), lng: Number(v.lng) }))
const ringB = (db: FakeDb) => verts(db, 'zone_vertices', 'zone_id', B)
const sameRing = (a: LatLng[], b: LatLng[]) => a.length === b.length && a.every((p, i) => Math.abs(p.lat - b[i].lat) < 1e-12 && Math.abs(p.lng - b[i].lng) < 1e-12)

/** Les écritures qui partent (l'ancien insert PostgREST OU la RPC), datées. */
const WRITE = /\/rest\/v1\/(rpc\/write_aggregate|zone_vertices|entity_contacts|threat_zone_vertices)/
function watchWrites(ctx: BrowserContext): number[] {
  const at: number[] = []
  ctx.on('request', (r) => {
    if (r.method() === 'POST' && WRITE.test(r.url())) at.push(Date.now())
  })
  return at
}
/** L'heure de chaque RÉPONSE en échec : c'est elle qui arme la relance (2 s plus tard). */
function watchFailures(ctx: BrowserContext): number[] {
  const at: number[] = []
  ctx.on('response', (r) => {
    if (r.request().method() === 'POST' && WRITE.test(r.url()) && r.status() >= 400) at.push(Date.now())
  })
  return at
}

/** L'anneau que la carte dessine (source `zones`) pour une forme : son nombre de sommets et son premier sommet. */
const screenRing = (page: Page, id: string) =>
  page.evaluate((zid) => {
    const m = (window as unknown as { __loYanumMap?: { getSource(id: string): { _data?: { features: Array<{ id?: string; properties?: Record<string, unknown>; geometry: { coordinates: number[][][] } }> } } | undefined } }).__loYanumMap
    const f = (m?.getSource('zones')?._data?.features ?? []).find((x) => String(x.properties?.id ?? x.id ?? '') === zid)
    if (!f) return { n: 0, lat: null as number | null }
    const ring = f.geometry.coordinates[0].slice(0, -1)
    return { n: ring.length, lat: ring[0]?.[1] ?? null }
  }, id)

/**
 * La carte de cette page montre-t-elle les formes de la ferme ? (le pâturage `G` est TOUJOURS là.)
 * ★ Sans cette attente, une relecture sur le déployé était lue avant que la carte ne soit publiée :
 *   « 0 point » alors que la forme était entière en base (A622, 1 fois sur 3 au rejeu de 5781fba).
 */
async function mapShows(page: Page, ms = 15_000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const ok = await page
      .evaluate((g) => {
        const m = (window as unknown as { __loYanumMap?: { getSource(id: string): { _data?: { features: Array<{ id?: string; properties?: Record<string, unknown> }> } } | undefined } }).__loYanumMap
        return (m?.getSource('zones')?._data?.features ?? []).some((f) => String(f.properties?.id ?? f.id ?? '') === g)
      }, G)
      .catch(() => false)
    if (ok) return true
    await page.waitForTimeout(200)
  }
  return false
}

async function project(page: Page, p: LatLng) {
  return page.evaluate((q) => {
    const m = (window as unknown as { __loYanumMap: { project(a: [number, number]): { x: number; y: number }; getContainer(): HTMLElement } }).__loYanumMap
    const r = m.getContainer().getBoundingClientRect()
    const s = m.project([q.lng, q.lat])
    return { x: r.left + s.x, y: r.top + s.y }
  }, p)
}
const INIT = { 'lo-yanum:map-mode:farm-detail': 'full', [`lo-yanum:farm-tab:${FARM}`]: 'terrain' }
async function openFarm(o: Opened): Promise<void> {
  await go(o.page, APP, `/coordinator/farms/${FARM}`, 7000)
}
/** Ouvrir la limite et la déplacer d'un geste (outil de déplacement, ✥ avant BL) : UNE écriture. */
async function moveBoundary(page: Page, bCenter: LatLng, dx: number, reframe = true): Promise<void> {
  if (reframe) {
    await page.evaluate((c) => (window as unknown as { __loYanumMap: { jumpTo(o: unknown): void } }).__loYanumMap.jumpTo({ center: [c.lng, c.lat], zoom: 15.5 }), bCenter)
    await page.waitForTimeout(900)
  }
  if ((await page.locator('[data-testid="shape-editor"]').count()) === 0) {
    const p = await project(page, { lat: bCenter.lat, lng: bCenter.lng + 0.0012 })
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(500)
    if ((await page.locator('[data-testid="shape-picker"]').count()) > 0) {
      await page.locator(`[data-testid="shape-pick-${B}"]`).click()
      await page.waitForTimeout(700)
    }
  }
  /* ★★ BL — la poignée ✥ est devenue l'outil « הזזת הצורה כולה » de la barre : on le prend, puis on
     saisit la forme en son centre (n'importe où dans la forme fait l'affaire). */
  const tool = page.locator('[data-testid="editor-tool-move"]')
  if ((await tool.getAttribute('aria-checked')) !== 'true') await tool.click()
  const { x, y } = await project(page, bCenter)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + 20, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}
async function until(f: () => boolean, ms: number): Promise<number | null> {
  const t0 = Date.now()
  for (;;) {
    if (f()) return Date.now() - t0
    if (Date.now() - t0 > ms) return null
    await Bun.sleep(100)
  }
}
const toggleNetwork = async (ctx: BrowserContext) => {
  await ctx.setOffline(true)
  await Bun.sleep(300)
  await ctx.setOffline(false)
}

// ===========================================================================
await guard('A620', async () => {
  section('A620 — la liste blanche : SQL = MAPPINGS = base factice')
  const sql = (() => {
    try {
      return readFileSync('supabase/migrations/20261018000200_bk_write_aggregate.sql', 'utf8')
    } catch {
      return ''
    }
  })()
  check('A620 la migration de `write_aggregate` existe', sql.length > 0)
  const fromSql = new Map<string, string>()
  for (const m of sql.matchAll(/when '([a-z_]+)' then '(\[[^']*\])'::jsonb/g)) {
    const kids = JSON.parse(m[2]) as Array<{ t: string; fk: string }>
    fromSql.set(m[1], kids.map((k) => `${k.t}.${k.fk}`).join(' '))
  }
  const fromMappings = new Map<string, string>()
  for (const mapping of Object.values(MAPPINGS) as Array<{ table: string; children: ReadonlyArray<{ table: string; fk: string }> }>) {
    if (mapping.children.length > 0) fromMappings.set(mapping.table, mapping.children.map((c) => `${c.table}.${c.fk}`).join(' '))
  }
  const fake = (FakeDb as unknown as { AGGREGATES?: Record<string, Array<{ t: string; fk: string }>> }).AGGREGATES ?? {}
  const fromFake = new Map(Object.entries(fake).map(([t, kids]) => [t, kids.map((k) => `${k.t}.${k.fk}`).join(' ')]))
  const show = (m: Map<string, string>) => [...m.entries()].sort().map(([k, v]) => `${k}: ${v}`).join(' | ')
  check(`A620 ★ toute table à sous-lignes de MAPPINGS (${fromMappings.size}) est dans la liste blanche SQL, sous-tables et ORDRE compris`, fromMappings.size > 0 && show(fromSql) === show(fromMappings), `SQL ${show(fromSql).slice(0, 120) || '(rien)'}`)
  check('A620 … et la base factice porte la même liste', show(fromFake) === show(fromMappings))
  check('A620 SECURITY INVOKER, search_path vide', /security invoker/.test(sql) && /set search_path = ''/.test(sql) && !/security definer/.test(sql))
  check('A620 identifiants dynamiques par %I seulement ; lignes par jsonb_populate_recordset', /format\(/.test(sql) && !/public\.%s/.test(sql) && /jsonb_populate_recordset\(null::public\.%I, \$1\)/.test(sql))
  check(
    'A620 execute : révoqué à public et à anon, accordé à authenticated seulement',
    /revoke all on function public\.write_aggregate\(text, jsonb, jsonb\) from public;/.test(sql) &&
      /revoke all on function public\.write_aggregate\(text, jsonb, jsonb\) from anon;/.test(sql) &&
      [...sql.matchAll(/grant execute on function public\.write_aggregate[^;]* to ([a-z_]+);/g)].map((m) => m[1]).join(',') === 'authenticated',
  )
  const write = readFileSync('src/data/write.ts', 'utf8')
  check('A620 `write.ts` passe par la RPC pour un agrégat à sous-lignes', /client\.rpc\('write_aggregate'/.test(write) && !/\.from\(child\.table\)\.insert/.test(write))
})

// ===========================================================================
await guard('A621', async () => {
  section('A621 · A622 · A623 — une forme : la panne au milieu, le second profil, la relance seule')
  const { db, bCenter } = db0()
  const a = await open(1440, { db, height: 900, init: INIT })
  const sent = watchWrites(a.ctx)
  const b = await open(1440, { db, height: 900, init: INIT })
  await openFarm(a)
  await openFarm(b)
  const before = ringB(db)
  const seen = async (p: Page) => p.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getSource(id: string): { _data?: { features: unknown[] } } | undefined; loaded(): boolean } }).__loYanumMap
    return `carte ${m ? (m.loaded() ? 'chargée' : 'en cours') : 'ABSENTE'}, ${m?.getSource('zones')?._data?.features.length ?? '—'} forme(s), ${location.hash}`
  })
  const a0 = await screenRing(a.page, B)
  const b0 = await screenRing(b.page, B)
  check('A621 départ : la limite a 12 sommets en base, à l’écran de A et de B', before.length === 12 && a0.n === 12 && b0.n === 12, `base ${before.length} · A ${a0.n} (${await seen(a.page)}) · B ${b0.n} (${await seen(b.page)}) · erreurs B ${b.errors.slice(0, 1).join('')}`)

  /* TROIS échecs : A reste en attente ≈ 14 s (relances à 2, 4, 8 s) — B relit DANS cette fenêtre. */
  db.failInsert.set('zone_vertices', 3)
  await moveBoundary(a.page, bCenter, -60)
  const newLat = (await screenRing(a.page, B)).lat
  await until(() => sent.length >= 1, 3000)
  await a.page.waitForTimeout(400)
  const during = ringB(db)
  check('A621 ★ la panne au milieu laisse la forme ENTIÈRE en base, à l’ANCIENNE position', during.length === 12 && sameRing(during, before), `${during.length} sommet(s) en base`)
  check('A621 … et A garde à l’écran la nouvelle position (12 sommets)', (await screenRing(a.page, B)).n === 12 && newLat !== before[0].lat)

  /* B relit PENDANT que A attend sa relance. */
  await go(b.page, APP, `/coordinator/farms/${FARM}`, 500)
  const bReady = await mapShows(b.page)
  const bDuring = await screenRing(b.page, B)
  const stillWaiting = ringB(db).length === 12 && sameRing(ringB(db), before)
  check('A622 ★ le second profil, relisant pendant l’attente, ne voit PAS 0 point : la forme entière, ancienne position', bReady && bDuring.n === 12 && bDuring.lat !== null && Math.abs(bDuring.lat - before[0].lat) < 1e-9, `${bDuring.n} sommet(s) · carte de B ${bReady ? 'prête' : 'JAMAIS prête'} · ${stillWaiting ? 'A attendait encore sa relance' : 'A avait déjà rejoué'}`)
  await b.page.screenshot({ path: `${SHOTS}/a622-profil-b-pendant.png` })

  /* A623 — sans rechargement, sans `online` : la boîte d'envoi rejoue seule. */
  const t0 = Date.now()
  const took = await until(() => ringB(db).length === 12 && Math.abs(ringB(db)[0].lat - (newLat ?? NaN)) < 1e-9, 20_000)
  check('A623 ★ la boîte d’envoi a rejoué SEULE après trois échecs, en moins de 20 s (ni rechargement, ni « online »)', took !== null && sent.length === 4, took === null ? `rien après 20 s · ${sent.length} essai(s)` : `${((Date.now() - t0) / 1000).toFixed(1)} s de plus · ${sent.length} essai(s)`)
  check('A623 … la base porte la NOUVELLE position, 12 sommets', ringB(db).length === 12 && ringB(db)[0].lat === newLat)

  await go(b.page, APP, `/coordinator/farms/${FARM}`, 500)
  await mapShows(b.page)
  const bAfter = await screenRing(b.page, B)
  check('A622 … puis B relit la nouvelle forme, entière', bAfter.n === 12 && bAfter.lat !== null && Math.abs(bAfter.lat - (newLat ?? NaN)) < 1e-9)
  check('A621 aucune erreur de page', a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors].slice(0, 2).join(' | '))
  await a.ctx.close()
  await b.ctx.close()
})

// ===========================================================================
await guard('A624', async () => {
  section('A624 — la relance : croissante, bornée, une à la fois, éteinte au succès')
  const { db, bCenter } = db0()
  const a = await open(1440, { db, height: 900, init: INIT })
  const sent = watchWrites(a.ctx)
  const failed = watchFailures(a.ctx)
  await openFarm(a)
  db.failInsert.set('zone_vertices', 3)
  await moveBoundary(a.page, bCenter, -60)
  await until(() => failed.length >= 1, 4000)
  /* Un second geste pendant l'attente (sans recadrer : il doit finir AVANT la première relance, 2 s
     après la RÉPONSE en échec) : il remplace l'entrée, il ne part pas tout de suite. */
  const n1 = sent.length
  await moveBoundary(a.page, bCenter, -30, false)
  const gestureAt = (Date.now() - failed[0]) / 1000
  check('A624 un second geste pendant l’attente ne part pas : il rejoint la boîte d’envoi', gestureAt < 1.9 && sent.length === n1, `${n1} → ${sent.length} essai(s), geste fini ${gestureAt.toFixed(1)} s après l’échec`)
  const lastLat = (await screenRing(a.page, B)).lat
  const done = await until(() => ringB(db).length === 12 && ringB(db)[0].lat === lastLat, 25_000)
  const gaps = sent.slice(1).map((t, i) => (t - sent[i]) / 1000)
  check('A624 ★ trois échecs, puis le succès — SANS rechargement ni « online »', done !== null && sent.length === 4, `${sent.length} essai(s) ; écarts ${gaps.map((g) => g.toFixed(1)).join(' · ')} s`)
  check('A624 ★ les délais CROISSENT (≈ 2, 4, 8 s)', gaps.length === 3 && gaps[0] >= 1.5 && gaps[1] > gaps[0] + 1 && gaps[2] > gaps[1] + 2, gaps.map((g) => g.toFixed(1)).join(' · '))
  check('A624 … et la base porte le DERNIER geste', ringB(db).length === 12 && ringB(db)[0].lat === lastLat)
  const nDone = sent.length
  await a.page.waitForTimeout(20_000)
  check('A624 ★ après le succès, plus AUCUN essai (20 s)', sent.length === nDone, `${nDone} → ${sent.length}`)
  /* Le retour du réseau pendant une attente ne double pas la relance. */
  db.failInsert.set('zone_vertices', 1)
  await moveBoundary(a.page, bCenter, 40)
  const lat3 = (await screenRing(a.page, B)).lat
  await until(() => sent.length >= nDone + 1, 3000)
  await toggleNetwork(a.ctx)
  await until(() => ringB(db)[0]?.lat === lat3, 6000)
  const nNet = sent.length
  await a.page.waitForTimeout(6000)
  check('A624 « online » rejoue ; le minuteur, annulé, n’ajoute RIEN ensuite', ringB(db)[0]?.lat === lat3 && sent.length === nNet, `${nNet - nDone} essai(s) pour ce geste`)
  await a.ctx.close()
})

// ===========================================================================
await guard('A625', async () => {
  section('A625 — une fiche de ferme (contacts, engagements)')
  const { db } = db0()
  const a = await open(1440, { db, height: 900, init: INIT })
  const sent = watchWrites(a.ctx)
  const contacts0 = db.rows('entity_contacts').filter((r) => r.entity_id === FARM).length
  const commit0 = db.rows('entity_commitments').filter((r) => r.entity_id === FARM).length
  const name0 = String(db.rows('entities').find((r) => r.id === FARM)?.name)
  check('A625 départ : 2 contacts, 2 engagements', contacts0 === 2 && commit0 === 2)
  await go(a.page, APP, `/coordinator/farms/${FARM}/edit`, 5000)
  const field = a.page.locator('[data-testid="farm-form-name"] input, input[data-testid="farm-form-name"]').first()
  await field.fill(`${name0} (שונה)`)
  db.failInsert.set('entity_contacts', 1)
  await a.page.getByRole('button', { name: 'שמירה', exact: true }).first().click()
  await until(() => sent.length >= 1, 4000)
  await a.page.waitForTimeout(400)
  const contacts1 = db.rows('entity_contacts').filter((r) => r.entity_id === FARM).length
  const commit1 = db.rows('entity_commitments').filter((r) => r.entity_id === FARM).length
  const name1 = String(db.rows('entities').find((r) => r.id === FARM)?.name)
  check('A625 ★ la panne au milieu ne retire à la ferme NI ses contacts NI ses engagements', sent.length >= 1 && contacts1 === 2 && commit1 === 2, `${sent.length} écriture(s) · ${contacts1} contact(s), ${commit1} engagement(s) en base`)
  check('A625 … et la fiche reste ENTIÈRE à l’ancienne version (tout ou rien)', sent.length >= 1 && name1 === name0, name1)
  const took = await until(() => String(db.rows('entities').find((r) => r.id === FARM)?.name) === `${name0} (שונה)`, N_SECONDS * 1000)
  /* Le formulaire range aussi l'exploitant en carte de contact (« חקלאי … ») : on juge les deux contacts D'ORIGINE, par identifiant. */
  const kept = db.rows('entity_contacts').filter((r) => r.entity_id === FARM).map((r) => String(r.id))
  check(
    `A625 rejouée seule (< ${N_SECONDS} s) : le nouveau nom passe, les deux contacts d’origine et les engagements toujours là`,
    took !== null && kept.includes('contact-bk-0') && kept.includes('contact-bk-1') && db.rows('entity_commitments').filter((r) => r.entity_id === FARM).length === 2,
    `${sent.length} essai(s) · contacts [${kept.join(', ')}]`,
  )
  check('A625 aucune erreur de page', a.errors.length === 0, a.errors.slice(0, 2).join(' | '))
  await a.ctx.close()
})

// ===========================================================================
await guard('A626', async () => {
  section('A626 — une zone de menace')
  const { db } = db0()
  /* La carte en vue PARTAGÉE : en plein écran, elle cache le panneau des menaces. */
  const a = await open(1440, { db, height: 900, init: { ...INIT, 'lo-yanum:map-mode:farm-detail': 'split' } })
  const sent = watchWrites(a.ctx)
  await openFarm(a)
  const ring0 = verts(db, 'threat_zone_vertices', 'threat_zone_id', T)
  check('A626 départ : la zone de menace a 6 sommets, intensité « בינוני »', ring0.length === 6 && db.rows('threat_zones')[0]?.intensity === 'medium')
  const high = a.page.getByRole('button', { name: 'גבוה', exact: true }).first()
  await high.scrollIntoViewIfNeeded()
  db.failInsert.set('threat_zone_vertices', 1)
  await high.click()
  await until(() => sent.length >= 1, 4000)
  await a.page.waitForTimeout(400)
  const ring1 = verts(db, 'threat_zone_vertices', 'threat_zone_id', T)
  check('A626 ★ la panne au milieu laisse la zone de menace ENTIÈRE (6 sommets, intensité d’avant)', sent.length >= 1 && ring1.length === 6 && sameRing(ring1, ring0) && db.rows('threat_zones').find((r) => r.id === T)?.intensity === 'medium', `${sent.length} écriture(s) · ${ring1.length} sommet(s), ${db.rows('threat_zones').find((r) => r.id === T)?.intensity}`)
  const took = await until(() => db.rows('threat_zones').find((r) => r.id === T)?.intensity === 'high', N_SECONDS * 1000)
  check(`A626 rejouée seule (< ${N_SECONDS} s) : « גבוה » passe, les 6 sommets intacts`, took !== null && sameRing(verts(db, 'threat_zone_vertices', 'threat_zone_id', T), ring0), `${sent.length} essai(s)`)
  check('A626 aucune erreur de page', a.errors.length === 0, a.errors.slice(0, 2).join(' | '))
  await a.ctx.close()
})

await finish()
