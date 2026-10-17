import { mkdirSync } from 'node:fs'

import type { Page } from 'playwright'

import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import type { Opened } from './ayharness'
import { FakeDb, USER_ID } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BK — CHANTIER 1 AU RENDU : DEUX PROFILS, UN COMPTE.   A530 … A534
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bkui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bkui    # le DÉPLOYÉ
 *
 * Même banc que `bjui` : deux profils de navigateur = deux appareils, un
 * compte, une base factice qui joue le serveur (déclencheur d'horodatage
 * compris). Des GESTES à l'écran, jamais un `localStorage.setItem` pour
 * simuler un choix.
 *
 *   A530  ★ LA ZONE REGARDÉE : A déplace la carte des fermes → B rechargé est
 *         à la même position
 *   A531  ★ UNE SECTION REPLIÉE sur A (ferme 01) → repliée sur B, et sur
 *         TOUTES les fermes (01, 02, 03) : c'est par type de section
 *   A532  ★ LA PREUVE INVERSE : « carte seule » choisi sur A → B rechargé n'a
 *         PAS changé, et le compte n'en porte rien
 *   A533  ★ le contrôle : aucune clé par ferme `farm-form-…` n'est écrite,
 *         ni sur un appareil ni sur le compte ; aucune clé « écran » non plus
 *         sur le compte
 *   A534  ★ activity-reports : l'ancienne clé se vide dans la table ; effacée
 *         seulement quand la table porte TOUT ; un envoi refusé → elle reste
 */

const OUT = process.env.DIST ?? 'dist-bkui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5502), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bk/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })
const DESK = 1440
const TAB = 1032

function bkDb(): FakeDb {
  const d = new FakeDb()
  seed(d)
  d.rows('entities').forEach((r, n) => {
    const k = String(n + 1).padStart(2, '0')
    Object.assign(r, { name: `חוות בדיקה ${k}`, farm_name: '', farmer_name: `חקלאי ${k}`, farmer_phone: `050-000-13${k}`, farmer_email: '', liaison_name: '', liaison_phone: '', standby_phone: '', notes: '', farmer_id_no: '' })
  })
  return d
}

const accountRows = (db: FakeDb) => db.rows('user_setting_values').filter((r) => r.user_id === USER_ID)
const accountValue = (db: FakeDb, key: string): string | null | undefined => {
  const r = accountRows(db).find((x) => x.key === key)
  return r ? (r.value as string | null) : undefined
}
const ls = (p: Page, key: string) => p.evaluate((k) => localStorage.getItem(k), key)
const lsKeys = (p: Page) => p.evaluate(() => Object.keys(localStorage))

async function reload(p: Page, settle = 5000): Promise<void> {
  await p.reload({ waitUntil: 'load' })
  await p.waitForTimeout(settle)
}
async function flushed(p: Page, ms = 6000): Promise<boolean> {
  for (let t = 0; t < ms; t += 250) {
    if ((await ls(p, 'lo-yanum:settings-queue')) === null) return true
    await p.waitForTimeout(250)
  }
  return false
}
async function device(db: FakeDb, width: number, hash: string, init: Record<string, string> = {}): Promise<Opened> {
  const o = await open(width, { db, init })
  await go(o.page, APP, hash, 5500)
  return o
}

type Camera = { lat: number; lng: number; zoom: number; loaded: boolean }
const camera = (page: Page): Promise<Camera> =>
  page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getCenter(): { lat: number; lng: number }; getZoom(): number } }).__loYanumMap
    if (!m) return { lat: NaN, lng: NaN, zoom: NaN, loaded: false }
    const c = m.getCenter()
    return { lat: c.lat, lng: c.lng, zoom: m.getZoom(), loaded: true }
  })
const fmt = (c: Camera) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)} z${c.zoom.toFixed(2)}`
async function waitMap(page: Page, ms = 15000): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if ((await camera(page)).loaded) return true
    await page.waitForTimeout(250)
  }
  return false
}
/** Le PO : la molette au milieu de la carte, puis un glissé. De VRAIS événements. */
async function userMoves(page: Page): Promise<void> {
  const at = await page.evaluate(() => {
    const map = document.querySelector('[role="application"].maplibregl-map') as HTMLElement | null
    if (!map) return null
    const r = map.getBoundingClientRect()
    for (const fy of [0.55, 0.45, 0.65, 0.35])
      for (const fx of [0.5, 0.35, 0.65, 0.25]) {
        const x = r.left + r.width * fx
        const y = r.top + r.height * fy
        const el = document.elementFromPoint(x, y)
        if (el && el.classList.contains('maplibregl-canvas')) return { x, y }
      }
    return null
  })
  if (!at) throw new Error('aucun point libre sur la carte')
  await page.mouse.move(at.x, at.y)
  await page.mouse.wheel(0, -480)
  await page.waitForTimeout(900)
  await page.mouse.down()
  await page.mouse.move(at.x + 90, at.y + 40, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(2200)
}

const seen: { local: string[]; account: string[] } = { local: [], account: [] }
async function collect(db: FakeDb, ...pages: Page[]): Promise<void> {
  for (const p of pages) seen.local.push(...(await lsKeys(p)))
  seen.account.push(...accountRows(db).map((r) => String(r.key)))
}

// ===========================================================================
await guard('A530', async () => {
  section('A530 — ★ la zone regardée : A déplace la carte, B recharge')
  const db = bkDb()
  const A = await device(db, DESK, '/coordinator/farms')
  const B = await device(db, TAB, '/coordinator/farms')
  check('A530 les deux cartes sont chargées', (await waitMap(A.page)) && (await waitMap(B.page)))
  const before = await camera(B.page)
  await userMoves(A.page)
  const a = await camera(A.page)
  check('A530 A a bougé (zoom + glissé)', Math.abs(a.zoom - before.zoom) > 0.3 || Math.abs(a.lat - before.lat) > 0.01, `${fmt(before)} → ${fmt(a)}`)
  check('A530 ★ envoyé : le compte porte la zone de A', (await flushed(A.page)) && typeof accountValue(db, 'lo-yanum:map-view') === 'string', String(accountValue(db, 'lo-yanum:map-view')))
  await reload(B.page, 6000)
  await waitMap(B.page)
  const b = await camera(B.page)
  check('A530 ★ B rechargé, AUCUN geste : B est à la même position que A', Math.abs(b.lat - a.lat) < 1e-4 && Math.abs(b.lng - a.lng) < 1e-4 && Math.abs(b.zoom - a.zoom) < 0.02, `A ${fmt(a)} · B ${fmt(b)}`)
  await B.page.waitForTimeout(4000)
  const b2 = await camera(B.page)
  check('A530 … et elle y RESTE (l’arrivée des données ne la recadre pas)', Math.abs(b2.lat - b.lat) < 1e-6 && Math.abs(b2.zoom - b.zoom) < 1e-4, `${fmt(b)} → ${fmt(b2)}`)
  await B.page.screenshot({ path: `${SHOTS}/a530-B-meme-zone.png` })
  await collect(db, A.page, B.page)
  check('A530 aucune erreur de page', A.errors.length + B.errors.length === 0, [...A.errors, ...B.errors].slice(0, 2).join(' | '))
  await A.ctx.close()
  await B.ctx.close()
})

// ===========================================================================
await guard('A531', async () => {
  section('A531 — ★ une section repliée sur A : repliée sur B, et sur toutes les fermes')
  const db = bkDb()
  const A = await device(db, DESK, '/coordinator/farms/farm-ak1-01/edit')
  const B = await device(db, TAB, '/coordinator/farms/farm-ak1-01/edit')
  const toggle = (p: Page, farm: string) => p.locator(`[data-testid="section-farm-form-people:${farm}"]`).first()
  check('A531 avant : « אנשים » est ouverte sur A et sur B', (await toggle(A.page, 'farm-ak1-01').getAttribute('aria-expanded')) === 'true' && (await toggle(B.page, 'farm-ak1-01').getAttribute('aria-expanded')) === 'true')
  await toggle(A.page, 'farm-ak1-01').click()
  await A.page.waitForTimeout(400)
  check('A531 A l’a repliée', (await toggle(A.page, 'farm-ak1-01').getAttribute('aria-expanded')) === 'false')
  check('A531 ★ envoyé : le compte porte `lo-yanum:farm-section:people` = 0 (UNE clé, sans ferme)', (await flushed(A.page)) && accountValue(db, 'lo-yanum:farm-section:people') === '0', String(accountValue(db, 'lo-yanum:farm-section:people')))
  await reload(B.page)
  check('A531 ★ B rechargé, ferme 01 : repliée', (await toggle(B.page, 'farm-ak1-01').getAttribute('aria-expanded')) === 'false')
  for (const farm of ['farm-ak1-02', 'farm-ak1-03']) {
    await go(B.page, APP, `/coordinator/farms/${farm}/edit`, 3500)
    check(`A531 ★ B, ${farm} (jamais ouverte) : repliée aussi — par type de section`, (await toggle(B.page, farm).getAttribute('aria-expanded')) === 'false')
  }
  await go(A.page, APP, '/coordinator/farms/farm-ak1-02/edit', 3500)
  check('A531 A, ferme 02 : repliée', (await toggle(A.page, 'farm-ak1-02').getAttribute('aria-expanded')) === 'false')
  await B.page.screenshot({ path: `${SHOTS}/a531-B-ferme-03-replie.png` })
  /* Et dans l'autre sens. */
  await toggle(B.page, 'farm-ak1-03').click()
  await B.page.waitForTimeout(400)
  await flushed(B.page)
  await reload(A.page)
  check('A531 ★ retour : B la rouvre (ferme 03), A rechargé (ferme 02) l’a ouverte', (await toggle(A.page, 'farm-ak1-02').getAttribute('aria-expanded')) === 'true')
  await collect(db, A.page, B.page)
  await A.ctx.close()
  await B.ctx.close()
})

// ===========================================================================
await guard('A532', async () => {
  section('A532 — ★ la preuve inverse : « carte seule » sur A, B rechargé n’a PAS changé')
  const db = bkDb()
  const A = await device(db, DESK, '/coordinator/farms')
  const B = await device(db, TAB, '/coordinator/farms')
  const pressed = async (p: Page, m: string) => (await p.locator(`[data-testid="map-mode-${m}"]`).first().getAttribute('aria-pressed')) === 'true'
  check('A532 avant : A et B en « split »', (await pressed(A.page, 'split')) && (await pressed(B.page, 'split')))
  await A.page.locator('[data-testid="map-mode-full"]').first().click()
  await A.page.waitForTimeout(800)
  check('A532 A est en « carte seule », et le range sur l’appareil', (await pressed(A.page, 'full')) && (await ls(A.page, 'lo-yanum:map-mode:farms')) === 'full')
  /* Attendre l'envoi d'autre chose : la file est vide, et le compte n'a rien reçu de la carte. */
  await flushed(A.page)
  await A.page.waitForTimeout(1500)
  check('A532 ★ le compte ne porte AUCUN mode de carte', !accountRows(db).some((r) => String(r.key).startsWith('lo-yanum:map-mode:')), accountRows(db).map((r) => r.key).join(', '))
  await reload(B.page)
  check('A532 ★ B rechargé : toujours « split », rien n’a changé', (await pressed(B.page, 'split')) && !(await pressed(B.page, 'full')) && (await ls(B.page, 'lo-yanum:map-mode:farms')) === null, String(await ls(B.page, 'lo-yanum:map-mode:farms')))
  await reload(A.page)
  check('A532 A rechargé : garde SA « carte seule » (l’appareil se souvient)', await pressed(A.page, 'full'))
  await B.page.screenshot({ path: `${SHOTS}/a532-B-split-inchange.png` })
  await collect(db, A.page, B.page)
  await A.ctx.close()
  await B.ctx.close()
})

// ===========================================================================
await guard('A533', async () => {
  section('A533 — ★ le contrôle : aucune clé par ferme `farm-form-…`, aucune clé d’écran sur le compte')
  const local = [...new Set(seen.local)]
  const account = [...new Set(seen.account)]
  check(`A533 ${local.length} clés vues sur les appareils, ${account.length} sur le compte`, local.length > 5 && account.length > 0)
  check('A533 ★ aucune clé `farm-form-…` sur un appareil', !local.some((k) => k.startsWith('farm-form-')), local.filter((k) => k.startsWith('farm-form-')).join(', '))
  check('A533 ★ aucune clé `farm-form-…` sur le compte', !account.some((k) => k.startsWith('farm-form-')))
  check('A533 ★ aucun pli rangé avec un identifiant de ferme', ![...local, ...account].some((k) => /^lo-yanum:farm-section:.*farm-/.test(k)))
  check('A533 ★ aucune clé d’écran (mode, ratio, rail) sur le compte', !account.some((k) => /^lo-yanum:(map-mode:|map-ratio:|rail:expanded)/.test(k)), account.filter((k) => /map-mode|map-ratio|rail/.test(k)).join(', '))
  check('A533 l’ancienne clé de l’historique n’est écrite nulle part', !account.includes('lo-yanum:activity-reports') && !local.includes('lo-yanum:activity-reports'))
})

// ===========================================================================
const report = (id: string, to: string, body: string) => ({
  id,
  period: { id: 'month', from: `${to.slice(0, 8)}01`, to },
  generatedAt: `${to}T18:00:00.000Z`,
  previousId: null,
  totals: { farms: 2, cultivatedDunams: 10, grazingDunams: 3, weightedDunams: 11, targetPercent: 5, signed: 1, signedWithDocuments: 0, contacts: 1 },
  farms: [{ id: 'farm-ak1-01', status: 'signed', weightedDunams: 6 }],
  body,
})
const tableRow = (r: ReturnType<typeof report>) => ({ id: r.id, user_id: USER_ID, period_from: r.period.from, period_to: r.period.to, generated_at: r.generatedAt.replace('.000Z', '+00:00'), previous_id: null, payload: { period: r.period, totals: r.totals, farms: r.farms }, body: r.body, created_at: r.generatedAt })

await guard('A534', async () => {
  section('A534 — ★ activity-reports : vidée dans la table, effacée seulement quand la table porte tout')
  const r1 = report('bk-r1', '2026-08-31', 'דוח אוגוסט')
  const r2 = report('bk-r2', '2026-09-30', 'דוח ספטמבר')
  {
    const db = bkDb()
    db.rows('activity_reports').push(tableRow(r1))
    const A = await device(db, DESK, '/coordinator', { 'lo-yanum:activity-reports': JSON.stringify([r2, r1]) })
    await A.page.waitForTimeout(4000)
    const inTable = db.rows('activity_reports').filter((r) => r.user_id === USER_ID).map((r) => String(r.id)).sort()
    check('A534 ★ le rapport que la table n’avait pas (r2) y est envoyé', inTable.join() === 'bk-r1,bk-r2', inTable.join())
    const sent = db.rows('activity_reports').find((r) => r.id === 'bk-r2')
    check('A534 … entier : texte, période, instantané', sent?.body === r2.body && sent?.period_to === r2.period.to && JSON.stringify((sent?.payload as { farms: unknown }).farms) === JSON.stringify(r2.farms))
    const off = JSON.parse(String(await ls(A.page, 'lo-yanum:activity-offline'))) as { drained?: { erased: boolean; sent: number; kept: number } }
    check('A534 ★ la table porte tout, à l’identique → l’ancienne clé est EFFACÉE', (await ls(A.page, 'lo-yanum:activity-reports')) === null && off.drained?.erased === true && off.drained.kept === 0, JSON.stringify(off.drained))
    await A.ctx.close()
  }
  {
    const db = bkDb()
    db.rows('activity_reports').push(tableRow(r1))
    const A = await open(DESK, { db, init: { 'lo-yanum:activity-reports': JSON.stringify([r2, r1]) } })
    /* L'envoi vers la table est refusé (une politique, un réseau qui tombe au mauvais moment). */
    await A.ctx.route('**/rest/v1/activity_reports**', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 403, body: '{"message":"refusé par la porte"}' }) : r.fallback()))
    await go(A.page, APP, '/coordinator', 9000)
    const kept = await ls(A.page, 'lo-yanum:activity-reports')
    check('A534 ★ envoi refusé : r2 n’est pas dans la table → l’ancienne clé RESTE, intacte', kept !== null && (JSON.parse(kept) as unknown[]).length === 2, String(kept).slice(0, 60))
    const off = JSON.parse(String((await ls(A.page, 'lo-yanum:activity-offline')) ?? '{}')) as { drained?: { erased: boolean; kept: number } }
    check('A534 … et c’est DIT (vidange : 1 non retrouvé, rien effacé)', off.drained?.erased === false && off.drained.kept === 1, JSON.stringify(off.drained))
    await A.page.locator('[data-testid="activity-open"]').first().click()
    await A.page.waitForTimeout(1500)
    const compare = await A.page.locator('[data-testid="activity-compare"]').first().textContent().catch(() => '')
    check('A534 les deux rapports restent MONTRÉS (rien de perdu à l’écran)', /2026|ספטמבר|אוגוסט|\d/.test(compare ?? ''), String(compare).slice(0, 80))
    await A.ctx.close()
  }
})

await finish()
