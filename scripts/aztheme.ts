import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'

import { FakeDb, installFakeSession, installFakeSupabase, USER_ID } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AZ6 — A378 : LE THÈME D'UN APPAREIL À L'AUTRE, MESURÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aztheme                                                # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run aztheme  # le DÉPLOYÉ
 *   AZ_ENGINE=webkit …                                             # le moteur de l'iPad / de l'iPhone
 *
 * Le défaut que vit le PO depuis cinq passes : il change le thème sur un
 * appareil ; l'autre, DÉJÀ OUVERT AU PREMIER PLAN, ne le reçoit pas tant qu'il
 * ne relance pas l'app. Cette porte le simule tel quel :
 *
 *   · DEUX appareils (deux navigateurs isolés : rien en commun que la BASE) ;
 *   · le second est ouvert sur un écran ordinaire et n'est PLUS TOUCHÉ —
 *     aucun `focus`, `visibilitychange`, `pageshow`, rechargement ni clic :
 *     seul le temps passe (la leçon d'AT1) ;
 *   · le premier change le thème PAR L'ÉCRAN (הגדרות › ערכת נושא) ;
 *   · on mesure, à la demi-seconde : l'arrivée en base, puis le moment où le
 *     second appareil PEINT le nouveau thème (la couleur de fond réelle de
 *     la page, pas une valeur stockée).
 *
 * Trois allers-retours (sombre → clair → sombre), dans les deux sens
 * (iPhone → iPad et iPad → iPhone). Le délai est écrit dans
 * `docs/az/az6-theme-<moteur>-<local|deploye>.json`.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-aztheme'
const PORT = 5434
const ENGINE_NAME = process.env.AZ_ENGINE === 'webkit' ? 'webkit' : 'chromium'
const ENGINE = ENGINE_NAME === 'webkit' ? webkit : chromium
const SHOTS = `docs/screenshots/azpass/${REMOTE ? 'deployed' : 'local'}/theme`
mkdirSync(SHOTS, { recursive: true })
mkdirSync('docs/az', { recursive: true })
/** Le plafond accepté : un battement (30 s) + le délai d'envoi (1,2 s) + une marge. */
const LIMIT_MS = 40_000

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
console.log(`  app : ${APP}${REMOTE ? '  (DÉPLOYÉ)' : `  (build local ${OUT})`} · moteur ${ENGINE_NAME}`)

const db = new FakeDb()
db.seed()
const browser: Browser = await ENGINE.launch()

interface Device {
  name: string
  ctx: BrowserContext
  page: Page
  events: string[]
}

async function device(name: string, width: number, route: string): Promise<Device> {
  // Le système de l'appareil est CLAIR : un thème sombre vu à l'écran vient donc du réglage.
  const ctx = await browser.newContext({ viewport: { width, height: width > 700 ? 1376 : 874 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: 'light' })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  const page = await ctx.newPage()
  const d: Device = { name, ctx, page, events: [] }
  page.on('pageerror', (e) => d.events.push(`erreur: ${e.message}`))
  await page.goto(`${APP}/?az=${Date.now()}#${route}`, { waitUntil: 'load' })
  await page.waitForTimeout(4000)
  return d
}

/** Ce que l'appareil PEINT : le fond réel du corps de page. */
const painted = (d: Device) =>
  d.page.evaluate(() => {
    const c = getComputedStyle(document.body).backgroundColor
    const m = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [255, 255, 255]
    const l = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255
    return { dark: l < 0.35, bg: c, choice: document.documentElement.getAttribute('data-theme-choice') }
  })
const remoteTheme = () => {
  const row = db.rows('user_settings').find((r) => r.user_id === USER_ID)
  return ((row?.data as Record<string, string> | undefined) ?? {})['lo-yanum:theme:coordinator'] ?? null
}

async function choose(d: Device, choice: 'dark' | 'light'): Promise<void> {
  // PAR L'ÉCRAN : הגדרות › תצוגה › ערכת נושא.
  const btn = d.page.locator(`[data-testid="settings-theme-${choice}"]`).first()
  if (!(await btn.isVisible().catch(() => false))) {
    await d.page.locator('button:has-text("תצוגה")').first().click().catch(() => undefined)
  }
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
}

async function until(ms: number, probe: () => Promise<boolean> | boolean): Promise<number | null> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await probe()) return Date.now() - t0
    await Bun.sleep(500)
  }
  return null
}

const measures: Array<{ from: string; to: string; choice: string; toBase: number | null; painted: number | null }> = []

try {
  section('A378 — deux appareils, une base ; le second reste ouvert au premier plan, sans geste')
  const iPhone = await device('iPhone', 402, '/coordinator/settings')
  const iPad = await device('iPad', 1032, '/coordinator/farms')
  check('les deux appareils démarrent en clair (le système est clair)', !(await painted(iPhone)).dark && !(await painted(iPad)).dark)
  // Laisser le premier cycle de synchronisation se faire des deux côtés.
  await Bun.sleep(3000)

  const round = async (from: Device, to: Device, choice: 'dark' | 'light', n: number) => {
    await choose(from, choice)
    const t0 = Date.now()
    const local = await until(3000, async () => (await painted(from)).dark === (choice === 'dark'))
    const toBase = await until(LIMIT_MS, () => remoteTheme() === choice)
    const got = await until(LIMIT_MS + 5000 - (Date.now() - t0), async () => (await painted(to)).dark === (choice === 'dark'))
    const total = got === null ? null : Date.now() - t0
    measures.push({ from: from.name, to: to.name, choice, toBase, painted: total })
    check(`A378.${n} ${from.name} → ${choice} : appliqué tout de suite sur ${from.name}`, local !== null, `${local ?? '—'} ms`)
    check(`A378.${n} … écrit en base`, toBase !== null, `${toBase ?? '—'} ms`)
    check(
      `A378.${n} … PEINT sur ${to.name} resté ouvert, sans geste, en ≤ ${LIMIT_MS / 1000} s`,
      total !== null && total <= LIMIT_MS,
      total === null ? `rien après ${Date.now() - t0} ms : ${JSON.stringify(await painted(to))}` : `${(total / 1000).toFixed(1)} s · ${JSON.stringify(await painted(to))}`,
    )
    await to.page.screenshot({ path: `${SHOTS}/a378-${n}-${to.name}-${choice}-${ENGINE_NAME}.png` })
  }

  await round(iPhone, iPad, 'dark', 1)
  await round(iPhone, iPad, 'light', 2)
  // Dans l'autre sens : l'iPad change, l'iPhone (sur les réglages, ouvert) reçoit.
  await iPad.page.goto(`${APP}/?az=${Date.now()}#/coordinator/settings`, { waitUntil: 'load' })
  await iPad.page.waitForTimeout(4000)
  await iPhone.page.goto(`${APP}/?az=${Date.now()}#/coordinator/missions`, { waitUntil: 'load' })
  await iPhone.page.waitForTimeout(4000)
  await round(iPad, iPhone, 'dark', 3)

  const delays = measures.map((m) => m.painted).filter((v): v is number => v !== null)
  const worst = delays.length ? Math.max(...delays) : null
  const mean = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null
  console.log(`\n  délai mesuré (changement → peint sur l'autre appareil) : moyen ${mean === null ? '—' : (mean / 1000).toFixed(1)} s · pire ${worst === null ? '—' : (worst / 1000).toFixed(1)} s`)
  writeFileSync(
    `docs/az/az6-theme-${ENGINE_NAME}-${REMOTE ? 'deploye' : 'local'}.json`,
    JSON.stringify({ engine: ENGINE_NAME, app: APP, at: new Date().toISOString(), limitMs: LIMIT_MS, meanMs: mean, worstMs: worst, measures }, null, 2),
  )
  check('A378 aucune erreur de page sur les deux appareils', iPhone.events.length + iPad.events.length === 0, [...iPhone.events, ...iPad.events].slice(0, 2).join(' | '))
} catch (e) {
  check('A378 — interrompue', false, (e as Error).message.split('\n')[0])
} finally {
  await browser.close()
  serve?.kill()
}
console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
