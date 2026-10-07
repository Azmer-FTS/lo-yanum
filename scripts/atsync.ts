import { mkdirSync } from 'node:fs'
import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'

import { FakeDb, installFakeSession, installFakeSupabase, USER_ID } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AT1 — A298 : LA SYNCHRONISATION DANS LES CONDITIONS DU PO.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run atsync                                                # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run atsync  # le DÉPLOYÉ
 *   AT_ENGINE=webkit …                                            # le moteur de l'iPad
 *
 * ⚠️ CE QUE LA PORTE D'AS4 FAISAIT ET QUE CELLE-CI NE FAIT JAMAIS : envoyer
 *    `visibilitychange`/`focus`/`pageshow` pour « faire revenir » un appareil.
 *    L'iPad du PO, le 2026-10-07, n'est jamais revenu : posé, écran allumé.
 *    Aucun événement n'est simulé ici ; seul le temps passe.
 *
 * La séquence est celle que les journaux de `lo-yanum-prod` ont montrée
 * (`docs/at/at1-synchronisation.md`) :
 *   1. aucune ligne de réglages en base ;
 *   2. l'iPad (sans nom ni téléphone) s'ouvre le premier et CRÉE la ligne ;
 *   3. l'iPhone (nom, téléphone, région, valeurs d'avant AS4 sans instant)
 *      s'ouvre ensuite et écrit les siens ;
 *   4. l'iPad, resté ouvert, doit les recevoir — sans retour, sans geste.
 * Puis : un changement sur l'iPhone descend seul ; une connexion morte ne fait
 * pas tourner la roue sans fin et DIT son erreur ; le panneau nomme ce qui est
 * monté et descendu ; un rechargement sur un build PLUS récent que la cible
 * n'est plus un échec (AT1.3).
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-atsync'
const PORT = 5394
const ENGINE = process.env.AT_ENGINE === 'webkit' ? webkit : chromium
const SHOTS = `docs/screenshots/atpass/${REMOTE ? 'deployed' : 'local'}`
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

const browser: Browser = await ENGINE.launch()

const PO_CARD = JSON.stringify({ name: 'רכז לדוגמה', phone: '050-0001111', role: 'רכז דרום' })

interface Device {
  name: string
  ctx: BrowserContext
  page: Page
  settingsReads: { stamp: number; full: number }
}

async function device(name: string, preset: Record<string, string>, width: number): Promise<Device> {
  const ctx = await browser.newContext({ viewport: { width, height: 1100 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  /* Les valeurs d'AVANT AS4 : écrites avant le premier script, donc sans instant. */
  await ctx.addInitScript((p: Record<string, string>) => {
    if (sessionStorage.getItem('at-preset')) return
    sessionStorage.setItem('at-preset', '1')
    for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v)
  }, preset)
  const d: Device = { name, ctx, page: await ctx.newPage(), settingsReads: { stamp: 0, full: 0 } }
  d.page.on('request', (r) => {
    const u = r.url()
    if (r.method() !== 'GET' || !u.includes('/rest/v1/user_settings')) return
    if (decodeURIComponent(u).includes('select=updated_at')) d.settingsReads.stamp++
    else d.settingsReads.full++
  })
  await d.page.goto(`${APP}/?at=${Date.now()}#/coordinator/settings`, { waitUntil: 'load' })
  return d
}

const card = async (d: Device) => JSON.parse((await d.page.evaluate(() => localStorage.getItem('lo-yanum:coordinator'))) ?? '{}') as { name?: string; phone?: string; role?: string }
const remoteRow = () => db.rows('user_settings').find((r) => r.user_id === USER_ID)
const remoteCard = (): { name?: string } => {
  try {
    return JSON.parse(((remoteRow()?.data as Record<string, string>) ?? {})['lo-yanum:coordinator'] ?? '{}')
  } catch {
    return {}
  }
}

/** Attendre, SANS rien envoyer à la page, qu'une condition devienne vraie. */
async function within(ms: number, probe: () => Promise<boolean>): Promise<number | null> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await probe()) return Date.now() - t0
    await Bun.sleep(1000)
  }
  return null
}

async function openSyncPanel(d: Device): Promise<void> {
  /* L'onglet « נתונים » des réglages, s'il existe ; sinon la page entière. */
  const tab = d.page.locator('[role="tab"]:has-text("נתונים")').first()
  if (await tab.count()) await tab.click().catch(() => undefined)
  const head = d.page.locator('[data-testid="settings-sync-status"]')
  if (!(await head.isVisible().catch(() => false))) {
    /* Section repliée par défaut : l'ouvrir par son titre. */
    await d.page.locator('button:has-text("סנכרון בין מכשירים")').first().click().catch(() => undefined)
  }
  await head.scrollIntoViewIfNeeded().catch(() => undefined)
}

let code = 0
try {
  section('1 — la séquence du 2026-10-07 : l’iPad crée la ligne, l’iPhone écrit après, l’iPad reste ouvert')
  check('avant : aucune ligne de réglages en base', remoteRow() === undefined)
  const iPad = await device('iPad', { 'lo-yanum:area-gap': '{"gapPercent":20}' }, 1032)
  await iPad.page.waitForTimeout(4000)
  check('l’iPad (ouvert le premier) a créé la ligne', remoteRow() !== undefined)
  check('… sans nom (il n’en a pas)', !remoteCard().name, JSON.stringify(remoteCard()))
  const iPhone = await device('iPhone', { 'lo-yanum:coordinator': PO_CARD }, 402)
  const wrote = await within(10_000, async () => remoteCard().name === 'רכז לדוגמה')
  check('l’iPhone, ouvert ensuite, a écrit son nom dans la base', wrote !== null, `${wrote ?? '—'} ms`)
  const t0 = Date.now()
  const got = await within(45_000, async () => (await card(iPad)).name === 'רכז לדוגמה')
  check(
    'A298 · l’iPad, resté OUVERT sans aucun retour en avant-plan, reçoit nom + téléphone + région en ≤ 45 s',
    got !== null && (await card(iPad)).phone === '050-0001111' && (await card(iPad)).role === 'רכז דרום',
    got === null ? `rien après ${Date.now() - t0} ms : ${JSON.stringify(await card(iPad))}` : `${got} ms`,
  )

  section('2 — le panneau de l’iPad le DIT : quand, ce qui est descendu')
  await openSyncPanel(iPad)
  const status = iPad.page.locator('[data-testid="settings-sync-status"]')
  check('le panneau « סנכרון בין מכשירים » est affiché', await status.isVisible().catch(() => false))
  check('statut : réussi', (await status.getAttribute('data-ok').catch(() => null)) === '1', (await status.textContent().catch(() => '')) ?? '')
  const down = (await iPad.page.locator('[data-testid="settings-sync-down"]').textContent().catch(() => '')) ?? ''
  check('« התקבל ממכשיר אחר » nomme « כרטיס הרכז »', down.includes('כרטיס הרכז'), down)
  await iPad.page.screenshot({ path: `${SHOTS}/a298-ipad-panneau-recu.png` })

  section('3 — un changement sur l’iPhone descend seul sur l’iPad (aucun événement)')
  await iPhone.page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('lo-yanum:coordinator') ?? '{}')
    localStorage.setItem('lo-yanum:coordinator', JSON.stringify({ ...c, phone: '052-0000000' }))
  })
  const up = await within(10_000, async () => (remoteCard() as { phone?: string }).phone === '052-0000000')
  check('l’iPhone a fait monter le téléphone changé (≤ 10 s)', up !== null, `${up ?? '—'} ms`)
  await openSyncPanel(iPhone)
  const upText = (await iPhone.page.locator('[data-testid="settings-sync-up"]').textContent().catch(() => '')) ?? ''
  check('le panneau de l’iPhone nomme ce qui est MONTÉ', upText.includes('כרטיס הרכז'), upText)
  await iPhone.page.screenshot({ path: `${SHOTS}/a298-iphone-panneau-envoye.png` })
  const got2 = await within(45_000, async () => (await card(iPad)).phone === '052-0000000')
  check('A298 · l’iPad, toujours ouvert, le reçoit en ≤ 45 s', got2 !== null, `${got2 ?? '—'} ms`)

  section('4 — le battement est léger : la ligne entière n’est relue que si elle a changé')
  const before = { ...iPad.settingsReads }
  await iPad.page.waitForTimeout(65_000)
  const after = iPad.settingsReads
  check(
    'en 65 s sans changement : ≥ 2 questions légères (updated_at), 0 relecture de la ligne',
    after.stamp - before.stamp >= 2 && after.full - before.full === 0,
    `légères +${after.stamp - before.stamp}, entières +${after.full - before.full}`,
  )

  section('5 — une connexion morte : la roue s’arrête et l’erreur est DITE')
  db.hang = true
  await openSyncPanel(iPad)
  const btn = iPad.page.locator('[data-testid="settings-sync-now"]')
  await btn.click()
  const stopped = await within(20_000, async () => (await status.getAttribute('data-ok').catch(() => null)) === '0')
  check('« סנכרון עכשיו » se termine en ≤ 20 s au lieu de tourner sans fin', stopped !== null, `${stopped ?? '—'} ms`)
  const err = (await iPad.page.locator('[data-testid="settings-sync-error"]').textContent().catch(() => '')) ?? ''
  check('l’erreur est dite en mots (« השרת לא ענה … »)', err.includes('השרת לא ענה'), err)
  await iPad.page.screenshot({ path: `${SHOTS}/a298-ipad-erreur.png` })
  db.hang = false
  await db.release()
  await iPad.page.waitForTimeout(1500)
  await btn.click()
  const ok = await within(15_000, async () => (await status.getAttribute('data-ok').catch(() => null)) === '1')
  check('le réseau revenu, le même bouton réussit', ok !== null, `${ok ?? '—'} ms`)

  section('6 — AT1.3 : un rechargement sur un build PLUS RÉCENT que la cible est une RÉUSSITE')
  const running = (await iPad.page.locator('[data-testid="app-version-id"]').textContent().catch(() => '')) ?? ''
  await iPad.page.evaluate(() => {
    localStorage.setItem('lo-yanum:update-pending', JSON.stringify({ from: 'ancien-build', to: 'cible-depassee', at: Date.now() }))
  })
  await iPad.page.reload({ waitUntil: 'load' })
  await iPad.page.waitForTimeout(3000)
  await openSyncPanel(iPad)
  const verdict = iPad.page.locator('[data-testid="app-version-applied"]')
  check(
    'cible 0b97ed4, servi b632ace : « הוחלה גרסה חדשה », pas « לא נקלט »',
    (await verdict.getAttribute('data-ok').catch(() => null)) === '1',
    (await verdict.textContent().catch(() => '')) ?? '',
  )
  await iPad.page.evaluate((id) => {
    localStorage.setItem('lo-yanum:update-pending', JSON.stringify({ from: id, to: 'cible', at: Date.now() }))
  }, running.trim())
  await iPad.page.reload({ waitUntil: 'load' })
  await iPad.page.waitForTimeout(3000)
  check(
    'le même code qu’avant après rechargement : l’échec est toujours dit',
    (await verdict.getAttribute('data-ok').catch(() => null)) === '0',
  )
} catch (e) {
  console.error(e)
  failed++
} finally {
  await db.release()
  await browser.close()
  serve?.kill()
  console.log(`\n  atsync : ${passed} PASS · ${failed} FAIL`)
  code = failed === 0 ? 0 : 1
}
process.exit(code)
