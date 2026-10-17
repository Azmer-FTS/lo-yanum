import { mkdirSync } from 'node:fs'

import type { Page } from 'playwright'

import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import type { Opened } from './ayharness'
import { FakeDb, USER_ID } from './fake-supabase'
import { settingDef } from '../src/storage/registry'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BJ — AU RENDU : DEUX APPAREILS, UN COMPTE.   A518 … A525
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bjui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bjui    # le DÉPLOYÉ
 *
 * ★ DEUX PROFILS DE NAVIGATEUR DISTINCTS = DEUX APPAREILS : chacun son
 *   `localStorage`, son IndexedDB, son service worker. UN compte (`USER_ID`),
 *   UNE base factice qui joue le serveur — y compris le déclencheur qui
 *   HORODATE (copie de `user_setting_values_stamp`, horloge du processus de la
 *   porte). Le bundle est celui construit, ou celui que sert GitHub Pages.
 *   (Décision 0-AO ter : le mot de passe du PO n'est pas demandé ; la base
 *   RÉELLE est éprouvée à part, par le MCP, dans une transaction annulée.)
 *
 *   A518  ★ LE THÈME : choisi sur A → B rechargé l'a, sans geste ; et retour
 *   A519  ★ LES COUCHES DE LA CARTE : décochées sur A → B rechargé les a
 *         décochées ; recochées sur B → A rechargé les a
 *   A520  ★ LE FOND DE CARTE (un réglage d'APPAREIL avant BJ) : satellite sur
 *         A → B rechargé est en satellite
 *   A521  ★ LA MIGRATION d'un appareil existant : le compte a une valeur → elle
 *         gagne ; l'ancien bloc `user_settings` → promu ; la valeur locale →
 *         promue ; illisible → défaut (qui montre) ; tracée avec sa date
 *   A522  ★ L'HEURE DU SERVEUR, JAMAIS CELLE DE L'APPAREIL : un appareil en
 *         avance d'une heure ne gagne pas ; une file HORS LIGNE n'écrase pas
 *         une valeur plus récente venue d'ailleurs, et gagne quand elle est
 *         la plus récente
 *   A523  le panneau « אבחון המכשיר » : portée, appareil, compte, date ; une
 *         différence DITE en clair ; « העתקה » emporte le bloc
 *   A524  au fil des écrans : aucune clé refusée, chaque clé rangée est
 *         déclarée, et chaque réglage de compte est sur le compte
 *   A525  LE JUMEAU (/demo, sans compte) : le registre s'applique, rien n'est
 *         refusé, le diagnostic dit « sans compte »
 */

const OUT = process.env.DIST ?? 'dist-bjui'
const DEMO_OUT = process.env.DIST_DEMO ?? 'dist-bjdemo'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5498), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bj/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })
const DESK = 1440
const TAB = 1032

async function demoBase(): Promise<string> {
  if (REMOTE) return `${REMOTE}/demo`
  if (process.env.SKIP_BUILD !== '1') {
    const b = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', DEMO_OUT], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }, stdout: 'ignore', stderr: 'pipe' })
    if ((await b.exited) !== 0) throw new Error(await new Response(b.stderr).text())
  }
  const port = 5499
  Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', DEMO_OUT, '--port', String(port), '--strictPort'], { env: { ...process.env, VITE_SUPABASE_URL: '' }, stdout: 'ignore', stderr: 'ignore' })
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* pas encore */
    }
    await Bun.sleep(300)
  }
  return `http://localhost:${port}`
}

/** Une base neuve : le banc, fermes REBAPTISÉES (aucun nom réel dans une capture ou un journal). */
function bjDb(): FakeDb {
  const d = new FakeDb()
  seed(d)
  d.rows('entities').forEach((r, n) => {
    const k = String(n + 1).padStart(2, '0')
    Object.assign(r, { name: `חוות בדיקה ${k}`, farm_name: '', farmer_name: `חקלאי ${k}`, farmer_phone: `050-000-13${k}`, farmer_email: '', liaison_name: '', liaison_phone: '', standby_phone: '', notes: '', farmer_id_no: '' })
  })
  return d
}

const accountRow = (db: FakeDb, key: string) => db.rows('user_setting_values').find((r) => r.user_id === USER_ID && r.key === key) ?? null
const accountValue = (db: FakeDb, key: string): string | null | undefined => {
  const r = accountRow(db, key)
  return r ? (r.value as string | null) : undefined
}
const ls = (p: Page, key: string) => p.evaluate((k) => localStorage.getItem(k), key)
const themeOf = (p: Page) => p.evaluate(() => document.documentElement.getAttribute('data-theme'))
/** Changer d'écran SANS recharger (le routeur à dièse) : possible hors ligne. */
async function hashTo(p: Page, hash: string, settle = 2500): Promise<void> {
  await p.evaluate((h) => {
    window.location.hash = h
  }, hash)
  await p.waitForTimeout(settle)
}

/** ★ « Je recharge le profil B » — et rien d'autre. */
async function reload(p: Page, settle = 5000): Promise<void> {
  await p.reload({ waitUntil: 'load' })
  await p.waitForTimeout(settle)
}

/**
 * ★ COUPER LE RÉSEAU D'UN SEUL APPAREIL. `setOffline` de Playwright laisse
 * passer les requêtes que la base factice intercepte : on les fait échouer
 * nous-mêmes (comme `assettings`), et `navigator.onLine` suit.
 */
const cuts = new WeakMap<Opened, { off: boolean }>()
async function network(o: Opened, online: boolean): Promise<void> {
  let st = cuts.get(o)
  if (!st) {
    const s = { off: false }
    st = s
    cuts.set(o, s)
    await o.ctx.route('**/*.supabase.co/rest/**', (r) => (s.off ? r.abort('internetdisconnected') : r.fallback()))
  }
  st.off = !online
  await o.ctx.setOffline(!online)
}

/** Attendre que la file de réglages de l'appareil soit vide (envoyée). */
async function flushed(p: Page, ms = 6000): Promise<boolean> {
  for (let t = 0; t < ms; t += 250) {
    if ((await ls(p, 'lo-yanum:settings-queue')) === null) return true
    await p.waitForTimeout(250)
  }
  return false
}

async function device(db: FakeDb, width: number, hash: string, init: Record<string, string> = {}, skewMs = 0): Promise<Opened> {
  const o = await open(width, { db, init })
  if (skewMs !== 0) {
    await o.ctx.addInitScript((ms: number) => {
      const real = Date.now.bind(Date)
      Date.now = () => real() + ms
    }, skewMs)
  }
  await o.ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
  const logs: string[] = []
  o.page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('[réglages]')) logs.push(m.text())
  })
  ;(o as Opened & { refused: string[] }).refused = logs
  await go(o.page, APP, hash, 5500)
  return o
}
const refusedOf = (o: Opened) => (o as Opened & { refused?: string[] }).refused ?? []

async function openBlocks(p: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const closed = p.locator('main [data-testid^="block-"][aria-expanded="false"]')
    if ((await closed.count()) === 0) break
    await closed.first().click().catch(() => undefined)
    await p.waitForTimeout(80)
  }
}

async function pickTheme(p: Page, choice: 'light' | 'dark' | 'system'): Promise<void> {
  await go(p, APP, '/coordinator/settings', 3500)
  await openBlocks(p)
  const b = p.locator(`[data-testid="settings-theme-${choice}"]`).first()
  await b.scrollIntoViewIfNeeded()
  await b.click()
  await p.waitForTimeout(400)
}

async function layerBox(p: Page, key: string) {
  const legend = p.locator('[data-testid="map-legend-toggle"]').first()
  if ((await p.locator(`[data-testid="layer-${key}"]`).count()) === 0) {
    await legend.click()
    await p.waitForTimeout(400)
  }
  return p.locator(`input[data-testid="layer-${key}"], [data-testid="layer-${key}"] input`).first()
}

// ===========================================================================
await guard('A518', async () => {
  section('A518 — ★ le thème : A choisit, B recharge')
  const db = bjDb()
  const A = await device(db, DESK, '/coordinator')
  const B = await device(db, TAB, '/coordinator')
  check('A518 avant : les deux appareils suivent leur système (rien de choisi)', (await themeOf(A.page)) === null && (await themeOf(B.page)) === null, `${await themeOf(A.page)} · ${await themeOf(B.page)}`)
  await pickTheme(A.page, 'dark')
  check('A518 A est sombre', (await themeOf(A.page)) === 'dark')
  check('A518 ★ envoyé SUR-LE-CHAMP (pas au rechargement) : la file de A est vide en ≤ 6 s', await flushed(A.page))
  const row = accountRow(db, 'lo-yanum:theme:coordinator')
  check('A518 le compte porte « dark », horodaté par le SERVEUR (updated_at = written_at, posés par la base)', row?.value === 'dark' && typeof row?.updated_at === 'string' && row.updated_at === row.written_at, JSON.stringify(row))
  await reload(B.page)
  check('A518 ★ B rechargé, AUCUN geste : B est sombre', (await themeOf(B.page)) === 'dark', String(await themeOf(B.page)))
  check('A518 … et B le range comme la valeur du compte', (await ls(B.page, 'lo-yanum:theme:coordinator')) === 'dark')
  await B.page.screenshot({ path: `${SHOTS}/a518-B-sombre-apres-rechargement.png` })
  await pickTheme(B.page, 'light')
  await flushed(B.page)
  await reload(A.page)
  check('A518 ★ et dans l’autre sens : B choisit « clair », A rechargé est clair', (await themeOf(A.page)) === 'light', String(await themeOf(A.page)))
  check('A518 aucune erreur de page', A.errors.length + B.errors.length === 0, [...A.errors, ...B.errors].slice(0, 2).join(' | '))
  await A.ctx.close()
  await B.ctx.close()
})

// ===========================================================================
await guard('A519', async () => {
  section('A519 — ★ les couches de la carte : A décoche, B recharge')
  const db = bjDb()
  const A = await device(db, DESK, '/coordinator/farms')
  const B = await device(db, TAB, '/coordinator/farms')
  const boxA = await layerBox(A.page, 'boundaries')
  check('A519 avant : « גבולות יישויות » cochée sur A (le défaut montre)', await boxA.isChecked())
  await boxA.uncheck()
  await A.page.waitForTimeout(300)
  check('A519 ★ envoyé sur-le-champ', await flushed(A.page))
  const acc = JSON.parse(String(accountValue(db, 'lo-yanum:map-layers') ?? '{}')) as Record<string, unknown>
  check('A519 le compte porte boundaries = false', acc.boundaries === false, JSON.stringify(acc))
  await reload(B.page)
  const boxB = await layerBox(B.page, 'boundaries')
  check('A519 ★ B rechargé, aucun geste : la case est DÉCOCHÉE sur B', !(await boxB.isChecked()))
  await B.page.screenshot({ path: `${SHOTS}/a519-B-couches-apres-rechargement.png` })
  await boxB.check()
  await B.page.waitForTimeout(300)
  await flushed(B.page)
  await reload(A.page)
  const boxA2 = await layerBox(A.page, 'boundaries')
  check('A519 ★ retour : B recoche, A rechargé l’a cochée', await boxA2.isChecked())
  await A.ctx.close()
  await B.ctx.close()
})

// ===========================================================================
await guard('A520', async () => {
  section('A520 — ★ le fond de carte (restait sur l’appareil avant BJ) : A passe en satellite, B recharge')
  const db = bjDb()
  const A = await device(db, DESK, '/coordinator/farms')
  const B = await device(db, TAB, '/coordinator/farms')
  const baseA = A.page.locator('[data-testid="map-tool-base"]').first()
  check('A520 avant : A est sur le plan', (await baseA.getAttribute('data-base')) === 'vector', String(await baseA.getAttribute('data-base')))
  await baseA.click()
  await A.page.waitForTimeout(500)
  check('A520 A est en satellite', (await baseA.getAttribute('data-base')) === 'satellite')
  check('A520 ★ envoyé sur-le-champ ; le compte porte « satellite »', (await flushed(A.page)) && accountValue(db, 'lo-yanum:map-base') === 'satellite', String(accountValue(db, 'lo-yanum:map-base')))
  await reload(B.page)
  const baseB = B.page.locator('[data-testid="map-tool-base"]').first()
  check('A520 ★ B rechargé, aucun geste : B est en satellite', (await baseB.getAttribute('data-base')) === 'satellite', String(await baseB.getAttribute('data-base')))
  await B.page.screenshot({ path: `${SHOTS}/a520-B-satellite-apres-rechargement.png` })
  await A.ctx.close()
  await B.ctx.close()
})

// ===========================================================================
await guard('A521', async () => {
  section('A521 — ★ la migration d’un appareil existant')
  const db = bjDb()
  /* Le compte d'avant BJ : l'ancien bloc, avec le thème « dark » sans instant (BC) et la vigilance. */
  db.rows('user_settings').push({
    user_id: USER_ID,
    data: { 'lo-yanum:theme:coordinator': 'dark', 'lo-yanum:vigil': JSON.stringify({ arrivalMinutes: 25, checkpointMinutes: 90 }), __stamps: '{}' },
    updated_at: new Date(Date.now() - 86_400_000).toISOString(),
  })
  /* Un compte qui a DÉJÀ, en table, le bandeau de couverture replié (posé par un autre appareil migré avant).
     ★★ BK : c'était le rail — il est passé sur l'APPAREIL (taille de l'écran). */
  db.rows('user_setting_values').push(db.triggers.get('user_setting_values')!({ user_id: USER_ID, key: 'lo-yanum:coverage-band', value: 'folded', client_at: null }, null))
  const pre: Record<string, string> = {
    'lo-yanum:theme:coordinator': 'light',
    'lo-yanum:coverage-band': 'open',
    'lo-yanum:map-base': 'satellite',
    'lo-yanum:people-grouped': '1',
    'lo-yanum:map-layers': '{boundaries:false',
    'lo-yanum:settings-stamps': JSON.stringify({ 'lo-yanum:theme:coordinator': 1 }),
    'lo-yanum:settings-synced-at': '1',
  }
  const C = await device(db, DESK, '/coordinator', pre)
  const mig = JSON.parse(String(await ls(C.page, 'lo-yanum:settings-migration'))) as { at: number; accountWon: string[]; legacy: string[]; promoted: string[]; defaulted: string[] }
  check('A521 la migration a eu lieu, datée', typeof mig?.at === 'number' && Math.abs(Date.now() - mig.at) < 120_000, JSON.stringify(mig))
  check('A521 ★ le compte avait une valeur (bandeau replié) → elle GAGNE, la locale est remplacée', mig.accountWon.includes('lo-yanum:coverage-band') && (await ls(C.page, 'lo-yanum:coverage-band')) === 'folded')
  check('A521 ★ l’ancien bloc portait le thème « dark » → il est le compte : promu, et il gagne sur « light » de l’appareil', mig.legacy.includes('lo-yanum:theme:coordinator') && accountValue(db, 'lo-yanum:theme:coordinator') === 'dark' && (await themeOf(C.page)) === 'dark', `${accountValue(db, 'lo-yanum:theme:coordinator')} · ${await themeOf(C.page)}`)
  check('A521 l’ancien bloc portait la vigilance → promue sur la table', mig.legacy.includes('lo-yanum:vigil') && typeof accountValue(db, 'lo-yanum:vigil') === 'string')
  check('A521 ★ le compte n’avait rien, l’appareil oui → PROMUE (fond satellite, volontaires groupés)', mig.promoted.includes('lo-yanum:map-base') && mig.promoted.includes('lo-yanum:people-grouped') && accountValue(db, 'lo-yanum:map-base') === 'satellite' && accountValue(db, 'lo-yanum:people-grouped') === '1')
  check('A521 ★ illisible → le DÉFAUT (couches effacées : tout est montré), rien de promu', mig.defaulted.includes('lo-yanum:map-layers') && (await ls(C.page, 'lo-yanum:map-layers')) === null && accountValue(db, 'lo-yanum:map-layers') === undefined)
  check('A521 les instants d’APPAREIL d’avant BJ sont effacés', (await ls(C.page, 'lo-yanum:settings-stamps')) === null && (await ls(C.page, 'lo-yanum:settings-synced-at')) === null)
  /* Le diagnostic le dit, avec la date. */
  await go(C.page, APP, '/coordinator/settings', 3000)
  await openBlocks(C.page)
  await C.page.locator('[data-testid="diagnostic-open"]').first().click()
  await C.page.locator('[data-testid="device-diagnostic"]').waitFor()
  await C.page.waitForTimeout(2000)
  const migLine = String(await C.page.locator('[data-row="settingsMigration"]').getAttribute('data-value'))
  check('A521 ★ le panneau de diagnostic trace la migration, avec sa date', /\d{1,2}[./:]\d{2}/.test(migLine) && migLine.includes('קודמו'), migLine)
  await C.page.screenshot({ path: `${SHOTS}/a521-diagnostic-migration.png` })
  /* Un second appareil, à l'ancienne lui aussi : le compte, désormais rempli, gagne partout. */
  const D = await device(db, TAB, '/coordinator', { 'lo-yanum:map-base': 'vector', 'lo-yanum:theme:coordinator': 'light', 'lo-yanum:tasks:tab': 'mine' })
  const migD = JSON.parse(String(await ls(D.page, 'lo-yanum:settings-migration'))) as { accountWon: string[]; promoted: string[] }
  check('A521 ★ second appareil : le compte gagne (satellite, sombre) ; ce que le compte n’a pas est promu (onglet des tâches)', (await ls(D.page, 'lo-yanum:map-base')) === 'satellite' && (await themeOf(D.page)) === 'dark' && migD.promoted.includes('lo-yanum:tasks:tab'), JSON.stringify(migD))
  check('A521 aucune erreur de page', C.errors.length + D.errors.length === 0, [...C.errors, ...D.errors].slice(0, 2).join(' | '))
  await C.ctx.close()
  await D.ctx.close()
})

// ===========================================================================
await guard('A522', async () => {
  section('A522 — ★ l’heure du serveur, jamais celle de l’appareil ; la file hors ligne')
  const db = bjDb()
  const HOUR = 3_600_000
  /* A a une horloge EN AVANCE d'une heure (un iPad mal réglé). */
  const A = await device(db, TAB, '/coordinator/settings', {}, HOUR)
  const B = await device(db, DESK, '/coordinator/settings')
  await pickTheme(A.page, 'dark')
  await flushed(A.page)
  await A.page.waitForTimeout(1200)
  await pickTheme(B.page, 'light')
  await flushed(B.page)
  check('A522 ★ A (en avance d’une heure) a écrit AVANT B : la valeur la plus récente sur le compte est celle de B', accountValue(db, 'lo-yanum:theme:coordinator') === 'light', String(accountValue(db, 'lo-yanum:theme:coordinator')))
  await reload(A.page)
  check('A522 ★ … et A rechargé l’adopte (avant BJ, l’instant d’appareil de A aurait gagné)', (await themeOf(A.page)) === 'light', String(await themeOf(A.page)))
  const meta = JSON.parse(String(await ls(A.page, 'lo-yanum:settings-meta'))) as { offsetMs: number | null }
  check('A522 A a MESURÉ son écart avec le serveur (≈ −1 h)', typeof meta.offsetMs === 'number' && Math.abs(meta.offsetMs + HOUR) < 60_000, String(meta.offsetMs))

  /* 1 — A HORS LIGNE modifie d'abord ; B, en ligne, modifie APRÈS. (Les couches
     de la légende : le bouton de fond, lui, se retire hors ligne — AK6.) */
  const grazing = (v: string | null | undefined) => (v ? (JSON.parse(v) as Record<string, unknown>).grazing : undefined)
  await hashTo(A.page, '#/coordinator/farms', 1500)
  const boxA = await layerBox(A.page, 'grazing')
  await boxA.waitFor({ timeout: 20_000 })
  await network(A, false)
  await boxA.uncheck()
  await A.page.waitForTimeout(800)
  const queued = JSON.parse(String(await ls(A.page, 'lo-yanum:settings-queue'))) as Record<string, { value: string; offline: boolean }>
  check('A522 hors ligne : la modification de A (pâturages éteints) attend dans la FILE', grazing(queued?.['lo-yanum:map-layers']?.value) === false, JSON.stringify(Object.keys(queued ?? {})))
  await B.page.waitForTimeout(1500)
  await go(B.page, APP, '/coordinator/farms', 3000)
  const boxB = await layerBox(B.page, 'grazing')
  await boxB.uncheck()
  await B.page.waitForTimeout(400)
  await boxB.check()
  await B.page.waitForTimeout(400)
  await flushed(B.page)
  check('A522 B, en ligne, a choisi APRÈS : le compte porte pâturages MONTRÉS', grazing(accountValue(db, 'lo-yanum:map-layers')) === true, String(grazing(accountValue(db, 'lo-yanum:map-layers'))))
  await network(A, true)
  await A.page.evaluate(() => window.dispatchEvent(new Event('online')))
  await A.page.waitForTimeout(4000)
  check('A522 ★ A revient : sa file (plus ANCIENNE) n’écrase PAS la valeur plus récente de B', grazing(accountValue(db, 'lo-yanum:map-layers')) === true, String(grazing(accountValue(db, 'lo-yanum:map-layers'))))
  check('A522 ★ … A adopte la valeur du compte, et sa file est vide', grazing(await ls(A.page, 'lo-yanum:map-layers')) === true && (await ls(A.page, 'lo-yanum:settings-queue')) === null, String(grazing(await ls(A.page, 'lo-yanum:map-layers'))))
  const notice = await A.page.locator('[data-testid="settings-sync-notice"][data-kind="conflict"]').count()
  check('A522 … et le PO en est averti (« הוחלף »)', notice === 1)
  await A.page.screenshot({ path: `${SHOTS}/a522-A-file-battue-avertie.png` })

  /* 2 — B en ligne modifie d'abord ; A HORS LIGNE modifie APRÈS : A gagne au retour. */
  await pickTheme(B.page, 'dark')
  await flushed(B.page)
  await B.page.waitForTimeout(1500)
  await network(A, false)
  await hashTo(A.page, '#/coordinator/settings')
  await openBlocks(A.page)
  await A.page.locator('[data-testid="settings-theme-light"]').first().click()
  await A.page.waitForTimeout(800)
  await network(A, true)
  await A.page.evaluate(() => window.dispatchEvent(new Event('online')))
  await A.page.waitForTimeout(4000)
  check('A522 ★ la file de A est la plus RÉCENTE : au retour du réseau elle gagne (« light »)', accountValue(db, 'lo-yanum:theme:coordinator') === 'light', String(accountValue(db, 'lo-yanum:theme:coordinator')))
  await reload(B.page)
  check('A522 … et B rechargé l’a', (await themeOf(B.page)) === 'light', String(await themeOf(B.page)))
  await A.ctx.close()
  await B.ctx.close()
})

// ===========================================================================
await guard('A523', async () => {
  section('A523 — le panneau « אבחון המכשיר » : portée, appareil, compte, date ; différences dites')
  const db = bjDb()
  const A = await device(db, DESK, '/coordinator/settings')
  await pickTheme(A.page, 'dark')
  await flushed(A.page)
  /* Une différence fabriquée : hors ligne, le fond change ; la file attend. */
  await hashTo(A.page, '#/coordinator/farms', 1500)
  const box = await layerBox(A.page, 'grazing')
  await box.waitFor({ timeout: 20_000 })
  await network(A, false)
  await box.uncheck()
  await A.page.waitForTimeout(500)
  await A.page.locator('[data-testid="diagnostic-open"]').first().click()
  await A.page.locator('[data-testid="device-diagnostic"]').waitFor()
  await A.page.waitForTimeout(1500)
  const rows = A.page.locator('[data-testid="diagnostic-settings"] tbody tr')
  const n = await rows.count()
  check('A523 une ligne par réglage (au moins les réglages de compte déclarés)', n >= 20, String(n))
  const theme = A.page.locator('[data-testid="diagnostic-settings"] tr[data-key="lo-yanum:theme:coordinator"]')
  check('A523 le thème : portée « compte », appareil = compte = כהה/dark, date de synchronisation', (await theme.getAttribute('data-scope')) === 'account' && (await theme.getAttribute('data-differs')) === '0' && /dark/.test(String(await theme.locator('[data-cell="device"]').textContent())) && /dark/.test(String(await theme.locator('[data-cell="account"]').textContent())))
  const base = A.page.locator('[data-testid="diagnostic-settings"] tr[data-key="lo-yanum:map-layers"]')
  check('A523 ★ les couches, modifiées hors ligne : « différent », DIT en clair (en attente d’envoi)', (await base.getAttribute('data-differs')) === '1' && (await base.getAttribute('data-pending')) === '1' && /⚠/.test(String(await base.textContent())), String(await base.textContent()))
  const draft = A.page.locator('[data-testid="diagnostic-settings"] tr[data-key="lo-yanum:auth"]')
  check('A523 une clé d’appareil dit sa raison (la session : « התחברות »)', (await draft.getAttribute('data-scope')) === 'device' && /התחברות/.test(String(await draft.textContent())))
  check('A523 ⛔ la SESSION n’est jamais montrée : seulement sa longueur', !/access_token|eyJ/.test(String(await draft.textContent())), String(await draft.textContent()).slice(0, 80))
  const differLine = String(await A.page.locator('[data-row="settingsDiffer"]').getAttribute('data-value'))
  check('A523 la ligne de synthèse nomme la différence', differLine.includes('lo-yanum:map-layers'), differLine)
  const text = await A.page.locator('[data-testid="diagnostic-text"]').inputValue()
  check('A523 ★ le texte de « העתקה » emporte le bloc des réglages (titre, une ligne par réglage, la différence)', text.includes('הגדרות — במכשיר מול בחשבון') && text.includes('lo-yanum:theme:coordinator [חשבון]') && text.includes('⚠'), text.split('\n').slice(-3).join(' / '))
  await A.page.locator('[data-testid="device-diagnostic"] button:has-text("העתקה")').first().click()
  await A.page.waitForTimeout(400)
  const clip = await A.page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  check('A523 ★ « העתקה » copie bien ce texte dans le presse-papiers', clip === text, `${clip.length} / ${text.length} caractères`)
  check('A523 ⛔ … et le texte copié ne porte AUCUN jeton de session', !/access_token|refresh_token|eyJ[A-Za-z0-9_-]{10,}/.test(clip))
  await A.page.screenshot({ path: `${SHOTS}/a523-diagnostic-reglages.png` })
  await A.ctx.close()
})

// ===========================================================================
await guard('A524', async () => {
  section('A524 — au fil des écrans : rien de refusé, tout est déclaré, tout est sur le compte')
  const db = bjDb()
  const A = await device(db, DESK, '/coordinator')
  for (const route of ['/coordinator/farms', '/coordinator/missions', '/coordinator/volunteers', '/coordinator/leads', '/coordinator/institutions', '/coordinator/coverage', '/coordinator/route', '/coordinator/settings']) {
    await go(A.page, APP, route, 2500)
  }
  await openBlocks(A.page)
  await A.page.waitForTimeout(1500)
  await flushed(A.page)
  check('A524 ★ aucun accès refusé par le registre (console)', refusedOf(A).length === 0, refusedOf(A).slice(0, 3).join(' | '))
  const keys = await A.page.evaluate(() => Object.keys(localStorage))
  const undeclared = keys.filter((k) => settingDef(k) === null)
  check(`A524 ★ chaque clé rangée sur l’appareil est déclarée (${keys.length} clés)`, undeclared.length === 0, undeclared.join(', '))
  const accountKeys = keys.filter((k) => settingDef(k)?.scope === 'account')
  const missing: string[] = []
  for (const k of accountKeys) if (accountValue(db, k) !== (await ls(A.page, k))) missing.push(k)
  check(`A524 ★ chaque réglage de compte rangé ici est SUR LE COMPTE, à la même valeur (${accountKeys.length})`, missing.length === 0, missing.join(', '))
  check('A524 aucune erreur de page', A.errors.length === 0, A.errors.slice(0, 2).join(' | '))
  await A.ctx.close()
})

// ===========================================================================
await guard('A525', async () => {
  section('A525 — le jumeau (/demo, sans compte)')
  const DEMO = await demoBase()
  const o = await open(DESK, {})
  const sb: string[] = []
  o.page.on('request', (r) => r.url().includes('supabase.co') && sb.push(r.url()))
  const logs: string[] = []
  o.page.on('console', (m) => m.type() === 'error' && m.text().includes('[réglages]') && logs.push(m.text()))
  await go(o.page, DEMO, '/coordinator/settings', 4000)
  await openBlocks(o.page)
  await o.page.locator('[data-testid="settings-theme-dark"]').first().click()
  await o.page.waitForTimeout(400)
  check('A525 le thème s’applique (rangé sur l’appareil : il n’y a pas de compte)', (await themeOf(o.page)) === 'dark' && (await ls(o.page, 'lo-yanum:theme:coordinator')) === 'dark')
  check('A525 aucune file de réglages (rien à envoyer sans compte)', (await ls(o.page, 'lo-yanum:settings-queue')) === null)
  await o.page.locator('[data-testid="diagnostic-open"]').first().click()
  await o.page.locator('[data-testid="device-diagnostic"]').waitFor()
  await o.page.waitForTimeout(800)
  const sum = String(await o.page.locator('[data-row="settingsSummary"]').getAttribute('data-value'))
  check('A525 le diagnostic dit « sans compte »', sum.includes('ללא חשבון'), sum)
  check('A525 ★ le registre s’applique au jumeau : aucun accès refusé', logs.length === 0, logs.slice(0, 2).join(' | '))
  const keys = await o.page.evaluate(() => Object.keys(localStorage))
  check('A525 chaque clé rangée est déclarée', keys.every((k) => settingDef(k) !== null), keys.filter((k) => settingDef(k) === null).join(', '))
  check('A525 le jumeau n’a parlé à AUCUN Supabase', sb.length === 0, sb.slice(0, 2).join(' | '))
  await o.page.screenshot({ path: `${SHOTS}/a525-jumeau-diagnostic.png` })
  await o.ctx.close()
})

await finish()
