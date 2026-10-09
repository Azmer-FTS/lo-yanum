import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'
import { INSTITUTIONS } from '../src/core/mock/institutions'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AV — A322 (au rendu) · A323 · A324 · A325 · A326 (au rendu) · A327.
 * A326 et A328 dans le code et le calcul : `bun run avpass`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run avui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run avui    # le DÉPLOYÉ
 *   ONLY=checks | ONLY=captures, CAPTURES=1                       # en deux moitiés
 *
 * ★★ LE DOIGT EST UN VRAI DOIGT. L'appui long est envoyé par le protocole du
 *    navigateur (`Input.dispatchTouchEvent` : touchStart, 800 ms, touchEnd) —
 *    exactement ce que l'écran de l'iPad produit, pas un `click` ni un
 *    `dispatchEvent` fabriqué (règle d'AT : une porte qui fabrique l'événement
 *    qu'elle attend ne mesure rien).
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-avui'
const PORT = 5399
const CAPTURES = process.env.CAPTURES === '1'
const ONLY = process.env.ONLY ?? ''
const SHOTS = `docs/screenshots/avpass/${REMOTE ? 'deployed' : 'local'}`
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

// --- Les données : les vraies fermes, les ONZE institutions de la tournée ------

const { farms } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0]) as Array<Record<string, unknown>>
const sql = readFileSync('supabase/migrations/20261008000200_av_institutions_tournee.sql', 'utf8')
const TOUR = [...sql.matchAll(/\('(inst-[^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)', '[^']*', ([\d.]+), ([\d.]+), (true|false), 'signed', false, '([^']*)'/g)].map((m) => ({
  ...MAPPINGS.institutions.toRows(INSTITUTIONS[0])[0].rows[0],
  id: m[1], name: m[2], locality: m[3], kind: m[4], audience: m[5], lat: +m[6], lng: +m[7], position_uncertain: m[8] === 'true',
  engagement: 'signed', engagement_confirmed: false, contact_name: m[9], met_on: '2026-10-08', source: 'manual', aliases: '', position_source: 'web', students: null,
}))

function seed(db: FakeDb): void {
  db.seed()
  for (const r of ROWS) db.rows('entities').push({ ...r })
  for (const i of TOUR) db.rows('institutions').push({ ...i })
}

const browser: Browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
interface Opened {
  ctx: BrowserContext
  page: Page
  db: FakeDb
  errors: string[]
}
async function open(width: number, opts: { dark?: boolean; touch?: boolean; storage?: Record<string, string> } = {}): Promise<Opened> {
  const db = new FakeDb()
  seed(db)
  const height = width >= 1300 ? 900 : width >= 1000 ? 1376 : 874
  const touch = opts.touch ?? width < 1300
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: false, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: opts.dark ? 'dark' : 'light' })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  await ctx.addInitScript((s: Record<string, string>) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v)
  }, { 'lo-yanum:theme:coordinator': 'system', ...(opts.storage ?? {}) })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, db, errors }
}
async function go(page: Page, hash: string, settle = 4500): Promise<void> {
  await page.goto(`${APP}/?av=${Date.now()}#${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}
async function guard(label: string, run: () => Promise<void>): Promise<void> {
  if (ONLY === 'captures' && !label.startsWith('capture')) return
  if (ONLY === 'checks' && label.startsWith('capture')) return
  try {
    await run()
  } catch (e) {
    check(`${label} — section interrompue`, false, (e as Error).message.split('\n')[0])
  }
}

/** Un point de la carte où le doigt tombe sur la TOILE (ni marqueur, ni contrôle, ni bulle). */
async function emptySpot(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const maps = [...document.querySelectorAll<HTMLElement>('.maplibregl-map')].filter((m) => m.getBoundingClientRect().width > 50 && m.offsetParent !== null)
    const map = maps[0]
    if (!map) return null
    const r = map.getBoundingClientRect()
    for (let fy = 0.45; fy <= 0.8; fy += 0.07) {
      for (let fx = 0.35; fx <= 0.8; fx += 0.07) {
        const x = Math.round(r.left + r.width * fx)
        const y = Math.round(r.top + r.height * fy)
        if (y > innerHeight - 10 || y < 0) continue
        const el = document.elementFromPoint(x, y)
        if (el && el.classList.contains('maplibregl-canvas')) return { x, y }
      }
    }
    return null
  })
}

/** ★ L'appui long d'un DOIGT : le protocole du navigateur, 800 ms immobile. */
async function fingerLongPress(page: Page, at: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, radiusX: 6, radiusY: 6, force: 0.6, id: 1 }] })
  await page.waitForTimeout(800)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}
async function mouseLongPress(page: Page, at: { x: number; y: number }): Promise<void> {
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.waitForTimeout(800)
  await page.mouse.up()
}
const sheet = (page: Page) => page.locator('[data-testid="quick-pin"]')

const MAP_ROUTES = ['/coordinator', '/coordinator/agenda', '/coordinator/farms', '/coordinator/leads', '/coordinator/route', '/coordinator/route/free', '/coordinator/coverage', '/coordinator/volunteers', '/coordinator/drivers', '/coordinator/missions', '/coordinator/incidents']

// --- A322 — les onze, à confirmer -------------------------------------------------

section('A322 — les onze institutions de la tournée : sur la carte, « חתום », à confirmer')
await guard('A322', async () => {
  const o = await open(1440, { touch: false, storage: { 'lo-yanum:coverage': JSON.stringify({ radiusKm: 35, visible: { signed: true, pipeline: true, leads: true, engaged: true, prospect: true } }) } })
  await go(o.page, '/coordinator/coverage')
  const kinds = await o.page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.maplibregl-marker[data-marker-kind="institution"]')].map((e) => e.querySelector('[data-marker-label]')?.textContent ?? ''))
  check('A322 onze institutions sur la carte, nommées', kinds.filter(Boolean).length === 11, `${kinds.filter(Boolean).length}`)
  const banner = o.page.locator('[data-testid="coverage-to-confirm"]')
  check('A322 le bandeau dit « 11 à confirmer »', (await banner.getAttribute('data-count')) === '11', (await banner.count()) ? await banner.innerText() : 'absent')
  const rows = await o.page.locator('[data-testid^="institution-row-"][data-to-confirm]').count()
  check('A322 la liste s’ouvre sur « לאשר » : 11 lignes', rows === 11, `${rows}`)
  const first = TOUR.find((i) => i.name === 'ישיבת ההסדר שדרות')!
  await o.page.locator(`[data-testid="institution-confirm-${first.id}"]`).click()
  await o.page.waitForTimeout(1500)
  const saved = o.db.rows('institutions').find((r) => r.id === first.id)
  check('A322 confirmer = UN toucher, écrit en base', saved?.engagement_confirmed === true, JSON.stringify({ engagement: saved?.engagement, confirmed: saved?.engagement_confirmed }))
  // Corriger = choisir un statut : il est aussi confirmé.
  const other = TOUR.find((i) => i.name === 'שומריה לצעירים')!
  await o.page.locator(`[data-testid="institution-row-${other.id}"]`).click()
  await o.page.waitForTimeout(600)
  await o.page.locator('[data-testid="institution-engagement-interested"]').click()
  await o.page.waitForTimeout(1500)
  const fixed = o.db.rows('institutions').find((r) => r.id === other.id)
  check('A322 corriger le statut en un toucher (מעוניין) le confirme', fixed?.engagement === 'interested' && fixed?.engagement_confirmed === true, JSON.stringify({ engagement: fixed?.engagement, confirmed: fixed?.engagement_confirmed }))
  const facts = await o.page.locator('[data-testid="coverage-institution-card"]').innerText().catch(() => '')
  check('A322 la bulle porte le responsable et la date de rencontre', facts.includes('יונתן רום') && facts.includes('08.10.2026'), facts.replace(/\s+/g, ' ').slice(0, 120))
  if (CAPTURES) await o.page.screenshot({ path: `${SHOTS}/a322-a-confirmer-1440.png` })
  check('A322 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// --- A323 · A324 · A325 · A327 -----------------------------------------------------

section('A323 · A327 — l’appui long au doigt pose une épingle, sur TOUS les écrans à carte')
for (const width of [1032, 402]) {
  await guard(`A327 ${width}`, async () => {
    const o = await open(width, { touch: true, storage: Object.fromEntries(MAP_ROUTES.map((r) => [`lo-yanum:map-mode:${r.split('/').pop() || 'dashboard'}`, 'split'])) })
    for (const route of MAP_ROUTES) {
      await go(o.page, route, 3500)
      const at = await emptySpot(o.page)
      if (!at) {
        check(`A327 ${width} ${route} : un point libre de la carte`, false, 'aucun')
        continue
      }
      await fingerLongPress(o.page, at)
      await o.page.waitForTimeout(500)
      const shown = await sheet(o.page).isVisible().catch(() => false)
      const focused = shown ? await o.page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? '') : ''
      check(`A327 ${width} ${route} : appui long → la demande de nom`, shown && focused === 'quick-pin-name', `${shown ? 'ouverte' : 'rien'} · focus ${focused}`)
      if (shown) {
        await o.page.locator('[data-testid="quick-pin-cancel"]').click()
        await o.page.waitForTimeout(300)
      }
    }
    // Un glisser (le doigt BOUGE) ne pose rien.
    await go(o.page, '/coordinator/farms', 3500)
    const at = await emptySpot(o.page)
    if (at) {
      const cdp = await o.page.context().newCDPSession(o.page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }] })
      for (let i = 1; i <= 8; i++) {
        await o.page.waitForTimeout(90)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at.x + i * 12, y: at.y + i * 6, id: 1 }] })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await cdp.detach()
      await o.page.waitForTimeout(500)
      check(`A323 ${width} un glisser de la carte n’ouvre rien`, !(await sheet(o.page).isVisible().catch(() => false)))
    }
    await o.ctx.close()
  })
}

await guard('A323 souris', async () => {
  const o = await open(1440, { touch: false })
  await go(o.page, '/coordinator/farms')
  let at = await emptySpot(o.page)
  await mouseLongPress(o.page, at!)
  await o.page.waitForTimeout(400)
  check('A323 1440 souris : appui long → la demande de nom', await sheet(o.page).isVisible())
  await o.page.locator('[data-testid="quick-pin-cancel"]').click()
  await o.page.waitForTimeout(900)
  at = await emptySpot(o.page)
  await o.page.mouse.click(at!.x, at!.y, { button: 'right' })
  await o.page.waitForTimeout(400)
  check('A323 1440 clic droit → la demande de nom', await sheet(o.page).isVisible())
  await o.page.locator('[data-testid="quick-pin-cancel"]').click()
  await o.page.waitForTimeout(900)
  // Le bouton dédié arme la carte ; le toucher suivant pose.
  await o.page.locator('[data-testid="map-tool-pin"]').first().click()
  await o.page.waitForTimeout(300)
  check('A323 le bouton « épingle + » arme la carte, et le DIT', await o.page.locator('[data-testid="quick-pin-armed"]').isVisible())
  at = await emptySpot(o.page)
  await o.page.mouse.click(at!.x, at!.y)
  await o.page.waitForTimeout(400)
  check('A323 le toucher suivant ouvre la demande de nom', await sheet(o.page).isVisible())
  await o.ctx.close()
})

section('A324 · A325 · A326 — pas d’épingle sans nom ; la fiche naît avec son nom et son point')
await guard('A324', async () => {
  const o = await open(1032, { touch: true })
  await go(o.page, '/coordinator/farms')
  const before = { entities: o.db.rows('entities').length, landmarks: o.db.rows('landmarks').length, institutions: o.db.rows('institutions').length, leads: o.db.rows('leads').length }
  await fingerLongPress(o.page, (await emptySpot(o.page))!)
  await o.page.waitForTimeout(500)
  const next = o.page.locator('[data-testid="quick-pin-next"]')
  check('A324 nom vide : « המשך » éteint', await next.isDisabled())
  await o.page.locator('[data-testid="quick-pin-name"]').fill('   ')
  check('A324 des espaces ne font pas un nom', await next.isDisabled())
  await o.page.locator('[data-testid="quick-pin-name"]').press('Enter')
  await o.page.waitForTimeout(300)
  check('A324 Entrée sans nom ne mène nulle part', (await o.page.locator('[data-testid="quick-pin-kinds"]').count()) === 0)
  await o.page.locator('[data-testid="quick-pin-cancel"]').click()
  await o.page.waitForTimeout(1200)
  const after = { entities: o.db.rows('entities').length, landmarks: o.db.rows('landmarks').length, institutions: o.db.rows('institutions').length, leads: o.db.rows('leads').length }
  check('A324 annuler : rien n’est créé nulle part', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after))
  if (CAPTURES) {
    await fingerLongPress(o.page, (await emptySpot(o.page))!)
    await o.page.waitForTimeout(500)
    await o.page.screenshot({ path: `${SHOTS}/a324-nom-d-abord-1032.png` })
  }
  await o.ctx.close()
})

const KINDS = [
  { kind: 'farm', table: 'entities', name: 'חוות הבדיקה בגבעה' },
  { kind: 'institution', table: 'institutions', name: 'מכינת בדיקה' },
  { kind: 'lead', table: 'leads', name: 'רועה בדיקה' },
  { kind: 'landmark', table: 'landmarks', name: 'שער הכניסה' },
] as const
await guard('A325', async () => {
  for (const k of KINDS) {
    const o = await open(1032, { touch: true })
    await go(o.page, '/coordinator/coverage')
    /* ★ AW1 — les compteurs suivent la ROUTE, mesurée au premier passage :
       on les lit une fois le maillage complet (sinon ils montent pendant). */
    await o.page.waitForFunction(() => {
      const m = document.querySelector('[data-testid="coverage-mesh"]')
      return !m || (m.getAttribute('data-running') === 'false' && m.getAttribute('data-pending') === '0')
    }, undefined, { timeout: 180_000 })
    await o.page.waitForTimeout(500)
    const counts = async () => ({
      farms: await o.page.locator('[data-testid="coverage-counts"]').getAttribute('data-farms'),
      covered: await o.page.locator('[data-testid="coverage-counts"]').getAttribute('data-covered'),
    })
    const c0 = await counts()
    const at = (await emptySpot(o.page))!
    const expect = await o.page.evaluate((p) => {
      const map = (window as unknown as { __loYanumMap?: { unproject(x: [number, number]): { lat: number; lng: number }; getContainer(): HTMLElement } }).__loYanumMap!
      const r = map.getContainer().getBoundingClientRect()
      return map.unproject([p.x - r.left, p.y - r.top])
    }, at)
    await fingerLongPress(o.page, at)
    await o.page.waitForTimeout(500)
    await o.page.locator('[data-testid="quick-pin-name"]').fill(k.name)
    await o.page.locator('[data-testid="quick-pin-next"]').click()
    await o.page.waitForTimeout(300)
    if (CAPTURES && k.kind === 'farm') await o.page.screenshot({ path: `${SHOTS}/a325-nature-1032.png` })
    await o.page.locator(`[data-testid="quick-pin-kind-${k.kind}"]`).click()
    await o.page.waitForTimeout(2000)
    const row = o.db.rows(k.table).find((r) => r.name === k.name)
    const near = row && Math.abs(Number(row.lat) - expect.lat) < 1e-4 && Math.abs(Number(row.lng) - expect.lng) < 1e-4
    check(`A325 ${k.kind} : créé avec son nom et SA position (là où le doigt s’est posé)`, !!row && !!near, row ? `${Number(row.lat).toFixed(5)}, ${Number(row.lng).toFixed(5)}` : 'aucune ligne')
    if (k.kind === 'farm') check('A325 ferme : rien d’autre de rempli (יישוב vide, טרם נוצר קשר, 0 דונם)', row?.locality === '' && row?.status === 'to_contact' && row?.farm_dunams === 0 && row?.position_missing === false, JSON.stringify({ locality: row?.locality, status: row?.status }))
    check(`A325 ${k.kind} : la confirmation s’affiche`, await o.page.locator('[data-testid="quick-pin-done"]').isVisible())
    if (k.kind === 'landmark') {
      const flag = await o.page.locator('.maplibregl-marker[data-marker-kind="landmark"] [data-marker-label]').allInnerTexts()
      check('A325 le repère est sur la carte, nommé', flag.includes(k.name), flag.join(' · '))
      const c1 = await counts()
      check('A326 un repère ne change AUCUN compteur de couverture', JSON.stringify(c0) === JSON.stringify(c1), `${JSON.stringify(c0)} → ${JSON.stringify(c1)}`)
      await go(o.page, '/coordinator/farms', 3500)
      const flags = await o.page.locator('.maplibregl-marker[data-marker-kind="landmark"]').count()
      check('A327 le repère paraît sur les AUTRES cartes (חוות)', flags === 1, `${flags}`)
      if (CAPTURES) await o.page.screenshot({ path: `${SHOTS}/a326-repere-sur-fermes-1032.png` })
    }
    check(`A325 ${k.kind} : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
})

// --- Captures ------------------------------------------------------------------

if (CAPTURES) {
  section('Captures — la demande de nom et la carte, clair et sombre, trois largeurs')
  for (const dark of [false, true]) {
    for (const width of [402, 1032, 1440]) {
      await guard(`capture ${width} ${dark}`, async () => {
        const o = await open(width, { dark, touch: width < 1300 })
        await go(o.page, '/coordinator/coverage', 5000)
        await o.page.screenshot({ path: `${SHOTS}/couverture-onze-${width}-${dark ? 'sombre' : 'clair'}.png` })
        const at = await emptySpot(o.page)
        if (at) {
          if (width < 1300) await fingerLongPress(o.page, at)
          else await mouseLongPress(o.page, at)
          await o.page.waitForTimeout(500)
          await o.page.locator('[data-testid="quick-pin-name"]').fill('חוות הגבעה')
          await o.page.screenshot({ path: `${SHOTS}/epingle-nom-${width}-${dark ? 'sombre' : 'clair'}.png` })
          await o.page.locator('[data-testid="quick-pin-next"]').click()
          await o.page.waitForTimeout(300)
          await o.page.screenshot({ path: `${SHOTS}/epingle-nature-${width}-${dark ? 'sombre' : 'clair'}.png` })
        }
        check(`capture ${width} ${dark ? 'sombre' : 'clair'}`, o.errors.length === 0, o.errors.slice(0, 1).join(''))
        await o.ctx.close()
      })
    }
  }
}

await browser.close()
serve?.kill()
console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
