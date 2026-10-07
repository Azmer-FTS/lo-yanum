import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'

import { FakeDb, installFakeSession, installFakeSupabase, USER_ID } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS4 — A289 · A290 : LES RÉGLAGES ENTRE DEUX APPAREILS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run assettings                                               # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run assettings # le DÉPLOYÉ
 *
 * DEUX CONTEXTES DE NAVIGATEUR = DEUX APPAREILS : chacun son `localStorage`,
 * sa session, son cache. UNE base (`FakeDb`) que les deux interrogent à la
 * place de Supabase — le bundle est celui servi, la base est factice
 * (décision 0-AO ter : le mot de passe du PO n'est pas demandé).
 *
 * Ce que la porte mesure, dans l'ordre du constat du PO :
 *   1. ce qui MONTE quand l'iPhone (A) change sa carte ;
 *   2. ce que l'iPad (B), déjà ouvert, voit au RETOUR EN AVANT-PLAN, puis
 *      après un RAFRAÎCHISSEMENT ;
 *   3. un EFFACEMENT (retour à la carte livrée) ;
 *   4. un appareil aux valeurs d'hier qui change AUTRE CHOSE n'écrase pas ;
 *   5. deux appareils en conflit : la plus récente gagne, le PO est averti ;
 *   6. ce qui ne doit JAMAIS monter (thème, laissez-passer, temporisation).
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-aspass'
const PORT = 5393
const SHOTS = `docs/screenshots/aspass/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log(`\n  ${title}\n  ${'-'.repeat(title.length)}`)
}

const env = { ...process.env, VITE_SUPABASE_URL: 'https://fake.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_gate' }
let serve: ReturnType<typeof Bun.spawn> | null = null
async function serveBuild(): Promise<string> {
  if (process.env.SKIP_BUILD !== '1') {
    const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], { env, stdout: 'ignore', stderr: 'pipe' })
    if ((await build.exited) !== 0) {
      console.error(await new Response(build.stderr).text())
      throw new Error('vite build failed')
    }
  }
  serve = Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { env, stdout: 'ignore', stderr: 'ignore' })
  const base = `http://localhost:${PORT}`
  const deadline = Date.now() + 40_000
  for (;;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* pas encore */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
  return base
}

const APP = REMOTE ?? (await serveBuild())
console.log(`  app : ${APP}${REMOTE ? '  (DÉPLOYÉ)' : `  (build local ${OUT})`}`)

const db = new FakeDb()
db.seed()

const browser: Browser = await chromium.launch()

interface Device {
  name: string
  ctx: BrowserContext
  page: Page
  lastResume: number
}

async function device(name: string): Promise<Device> {
  const ctx = await browser.newContext({ viewport: { width: 1032, height: 1376 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  const page = await ctx.newPage()
  await page.goto(`${APP}/?as=${Date.now()}#/coordinator/settings`, { waitUntil: 'load' })
  await page.waitForTimeout(5000)
  return { name, ctx, page, lastResume: Date.now() }
}

/** Le retour en avant-plan, sans recharger : ce que fait une PWA reprise. */
async function resume(d: Device): Promise<void> {
  const wait = 10_600 - (Date.now() - d.lastResume)
  if (wait > 0) await d.page.waitForTimeout(wait)
  await d.page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    window.dispatchEvent(new Event('focus'))
  })
  d.lastResume = Date.now()
  await d.page.waitForTimeout(2500)
}

const ls = (d: Device, key: string) => d.page.evaluate((k) => localStorage.getItem(k), key)
const card = async (d: Device) => JSON.parse((await ls(d, 'lo-yanum:coordinator')) ?? '{}') as { name?: string; role?: string }
const remoteBlob = (): Record<string, string> => (db.rows('user_settings').find((r) => r.user_id === USER_ID)?.data as Record<string, string>) ?? {}
const remoteCard = (): { name?: string; role?: string } => {
  try {
    return JSON.parse(remoteBlob()['lo-yanum:coordinator'] ?? '{}')
  } catch {
    return {}
  }
}

async function saveCard(d: Device, patch: { name?: string; role?: string }): Promise<void> {
  if (patch.name !== undefined) await d.page.fill('[data-testid="coordinator-name"]', patch.name)
  if (patch.role !== undefined) await d.page.fill('[data-testid="coordinator-role"]', patch.role)
  await d.page.click('[data-testid="coordinator-save"]')
  await d.page.waitForTimeout(2600)
}

try {
  const A = await device('iPhone')
  const B = await device('iPad')

  section('1 — ce qui MONTE quand A change sa carte de coordinateur')
  await saveCard(A, { name: 'רכז מהאייפון' })
  check('A289 · la carte de A est dans la base', remoteCard().name === 'רכז מהאייפון', JSON.stringify(remoteCard()))
  check('la base ne porte AUCUNE clé hors liste (A290)', Object.keys(remoteBlob()).every((k) => k === '__stamps' || k.startsWith('lo-yanum:')), Object.keys(remoteBlob()).join(','))

  section('2 — B, déjà ouvert, au RETOUR EN AVANT-PLAN (sans recharger)')
  check('avant : B porte encore l’ancienne carte', (await card(B)).name !== 'רכז מהאייפון')
  await resume(B)
  check('A289 · après retour en avant-plan, B porte la carte de A', (await card(B)).name === 'רכז מהאייפון', String((await card(B)).name))
  const shown = await B.page.inputValue('[data-testid="coordinator-name"]').catch(() => '')
  check('… et l’ÉCRAN ouvert la montre (pas seulement le stockage)', shown === 'רכז מהאייפון', shown)
  await B.page.screenshot({ path: `${SHOTS}/as4-ipad-apres-retour.png` })
  const notice = await B.page.locator('[data-testid="settings-sync-notice"]').count()
  check('le PO est informé que des réglages sont arrivés', notice === 1)

  section('2bis — B après RAFRAÎCHISSEMENT')
  await B.page.reload({ waitUntil: 'load' })
  await B.page.waitForTimeout(5000)
  check('A289 · après rafraîchissement, B porte la carte de A', (await card(B)).name === 'רכז מהאייפון')
  B.lastResume = Date.now()

  section('3 — un EFFACEMENT voyage aussi')
  await A.page.click('[data-testid="coordinator-reset"]')
  await A.page.waitForTimeout(2600)
  check('le retour à la carte livrée MONTE (la clé disparaît de la base)', remoteBlob()['lo-yanum:coordinator'] === undefined, String(remoteBlob()['lo-yanum:coordinator']))
  await resume(B)
  check('… et B l’applique', (await ls(B, 'lo-yanum:coordinator')) === null, String(await ls(B, 'lo-yanum:coordinator')))

  section('4 — un appareil aux valeurs d’hier n’écrase pas ce qu’il n’a pas touché')
  /* A pose un objectif ; B, sans avoir relu, change sa marge de route. */
  await A.page.evaluate(() => localStorage.setItem('lo-yanum:route-margin', '25'))
  await A.page.waitForTimeout(2600)
  check('la marge de A est dans la base', remoteBlob()['lo-yanum:route-margin'] === '25', String(remoteBlob()['lo-yanum:route-margin']))
  await B.page.evaluate(() => localStorage.setItem('lo-yanum:origin', JSON.stringify({ label: 'נתיבות', position: { lat: 31.42, lng: 34.59 } })))
  await B.page.waitForTimeout(2600)
  check('A289 · l’écriture de B n’a PAS effacé la marge posée par A', remoteBlob()['lo-yanum:route-margin'] === '25', String(remoteBlob()['lo-yanum:route-margin']))
  check('… et le point de départ de B est monté', (remoteBlob()['lo-yanum:origin'] ?? '').includes('נתיבות'))

  section('5 — deux appareils en conflit : la plus récente gagne, et le PO le sait')
  /* B perd le réseau (lui seul), change son rôle ; A, en ligne, change le
     même réglage PLUS TARD ; B retrouve le réseau. */
  let bOffline = true
  await B.ctx.route('**/*.supabase.co/rest/**', (r) => (bOffline ? r.abort('internetdisconnected') : r.fallback()))
  await saveCard(B, { role: 'תפקיד מהאייפד' })
  check('hors ligne, l’écriture de B n’est pas montée', remoteCard().role !== 'תפקיד מהאייפד', JSON.stringify(remoteCard()))
  await A.page.waitForTimeout(1500)
  await saveCard(A, { role: 'תפקיד מהאייפון' })
  check('l’écriture la plus récente (A) est dans la base', remoteCard().role === 'תפקיד מהאייפון', JSON.stringify(remoteCard()))
  bOffline = false
  await B.page.evaluate(() => window.dispatchEvent(new Event('online')))
  await resume(B)
  check('A289 · B adopte la plus récente', (await card(B)).role === 'תפקיד מהאייפון', String((await card(B)).role))
  const kind = await B.page.locator('[data-testid="settings-sync-notice"]').getAttribute('data-kind').catch(() => null)
  check('… et un bandeau de CONFLIT dit au PO ce qui a été remplacé', kind === 'conflict', String(kind))
  await B.page.screenshot({ path: `${SHOTS}/as4-ipad-conflit.png` })

  section('6 — A290 · ce qui ne doit jamais monter')
  await A.page.evaluate(() => {
    localStorage.setItem('lo-yanum:theme:coordinator', 'dark')
    localStorage.setItem('lo-yanum:farmer-pass', '{"token":"x"}')
    localStorage.setItem('lo-yanum:link-unlock', '{"x":1}')
    localStorage.setItem('lo-yanum:route-margin', '30')
  })
  await A.page.waitForTimeout(2600)
  const keys = Object.keys(remoteBlob())
  check('ni thème, ni laissez-passer, ni temporisation dans la base', !keys.some((k) => /theme|farmer-pass|link-unlock|guard-pass/.test(k)), keys.join(','))
  await resume(B)
  check('B garde SON thème', (await ls(B, 'lo-yanum:theme:coordinator')) !== 'dark')

  await A.ctx.close()
  await B.ctx.close()
} catch (e) {
  check('scénario interrompu', false, (e as Error).message.split('\n')[0])
} finally {
  await browser.close()
  serve?.kill()
}

console.log(`\n  ${failed === 0 ? `All ${passed} checks passed.` : `${failed} of ${passed + failed} checks FAILED.`}`)
if (failed > 0) process.exit(1)
