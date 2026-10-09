import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdirSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'
import { INSTITUTIONS } from '../src/core/mock/institutions'
import { computeCoverage, COVERAGE_PRESETS } from '../src/core/coverage'
import type { Farm, Lead } from '../src/core/types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AU — A315 · A316 · A318 · A319 · A320 (au rendu). A317 et A321 : `aupass`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run auui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run auui    # le DÉPLOYÉ
 *   CAPTURES=1 …                                                  # + captures clair/sombre × 3 largeurs
 *
 * ★★ UN NAVIGATEUR DE BUREAU N'A PAS D'ÉCRAN TACTILE. Toutes les portes
 *    précédentes ouvraient leurs contextes avec `hasTouch: true` — un iPad, y
 *    compris à 1 376 px. Ici, les contextes larges sont SANS tactile, à la
 *    souris : c'est l'ordinateur du PO.
 *
 * Le bundle est celui servi ; la base est factice (`FakeDb`) mais porte les
 * VRAIES lignes de fermes (`buildFarms`), des pistes avec et sans lieu, et les
 * institutions de démonstration.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-auui'
const PORT = 5397
const CAPTURES = process.env.CAPTURES === '1'
/** `ONLY=captures` : les captures seules (le déploiement se mesure en deux passages de moins de 10 min). */
const ONLY = process.env.ONLY ?? ''
const SHOTS = `docs/screenshots/aupass/${REMOTE ? 'deployed' : 'local'}`
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

// --- Les données -------------------------------------------------------------

const { farms } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0]) as Array<Record<string, unknown>>
const PLACED = ROWS.filter((r) => !r.position_missing)
const PLACED_ID = String(PLACED[0].id)

function leadRow(id: string, name: string, place: string, pos: { lat: number; lng: number } | null, status = 'not_called') {
  const at = new Date(Date.now() - 86_400_000).toISOString()
  return { id, name, contact_name: 'בדיקה', phone: `050-00000${id.slice(-2)}`, email: '', place, lat: pos?.lat ?? null, lng: pos?.lng ?? null, region_id: null, status, notes: '', source: 'paste', raw: '', rank: 0, converted_farm_id: null, converted_at: null, created_at: at, updated_at: at }
}
const LEAD_ROWS = [
  leadRow('lead-au-01', 'משק אלון', 'נתיבות', { lat: 31.4214, lng: 34.5882 }),
  leadRow('lead-au-02', 'בקר השקמה', 'אופקים', { lat: 31.3133, lng: 34.6214 }),
  leadRow('lead-au-03', 'רפת זית', 'שדרות', null),
  leadRow('lead-au-04', 'דיר הגבעה', '', null, 'no_answer'),
  leadRow('lead-au-05', 'חוות תמר', 'ירוחם', { lat: 30.99, lng: 34.93 }, 'not_interested'),
]
const INST_ROWS = INSTITUTIONS.map((i) => MAPPINGS.institutions.toRows(i)[0].rows[0])

function seed(db: FakeDb): void {
  db.seed()
  for (const r of ROWS) db.rows('entities').push({ ...r })
  for (const l of LEAD_ROWS) db.rows('leads').push({ ...l })
  for (const i of INST_ROWS) db.rows('institutions').push({ ...i })
}

const browser: Browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })

interface Opened {
  ctx: BrowserContext
  page: Page
  db: FakeDb
  errors: string[]
}
/** ★ Large = ordinateur : SANS écran tactile. 402 = téléphone, tactile. */
async function open(width: number, opts: { dark?: boolean; height?: number; storage?: Record<string, string> } = {}): Promise<Opened> {
  const db = new FakeDb()
  seed(db)
  const height = opts.height ?? (width >= 1300 ? 900 : width >= 1000 ? 1376 : 874)
  const phone = width < 700
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: false, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: opts.dark ? 'dark' : 'light' })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  const storage = { 'lo-yanum:theme:coordinator': 'system', ...(opts.storage ?? {}) }
  await ctx.addInitScript((s: Record<string, string>) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v)
  }, storage)
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, db, errors }
}
async function go(page: Page, hash: string, settle = 4500): Promise<void> {
  await page.goto(`${APP}/?au=${Date.now()}#${hash}`, { waitUntil: 'load' })
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
const WIDTHS = [402, 1032, 1440]
const markerKinds = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.maplibregl-marker[data-marker-kind]')].map((e) => e.dataset.markerKind ?? ''))

// --- A315 — les épingles sur ordinateur ----------------------------------------

section('A315 — les épingles s’affichent sur ordinateur, trois largeurs, quatre modes')
for (const width of WIDTHS) {
  await guard(`A315 ${width}`, async () => {
    for (const mode of ['split', 'full', 'overlay', 'hidden'] as const) {
      const storage: Record<string, string> = { 'lo-yanum:map-mode:farms': mode === 'overlay' ? 'split' : mode }
      const o = await open(width, { storage })
      await go(o.page, '/coordinator/farms')
      if (mode === 'overlay') {
        const btn = o.page.locator('[data-testid="map-tool-fullscreen"], .map-tool-fullscreen').first()
        if (await btn.count()) {
          await btn.click()
          await o.page.waitForTimeout(800)
        }
      }
      const kinds = await markerKinds(o.page)
      const pins = kinds.filter((k) => k === 'farm' || k === 'moshav' || k === 'cluster').length
      if (mode === 'hidden') {
        const m = await o.page.evaluate((names) => ({
          mapShown: [...document.querySelectorAll('.maplibregl-map')].some((e) => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().width > 0),
          listed: names.filter((n) => document.body.innerText.includes(n)).length,
        }), ROWS.map((r) => String(r.name)))
        check(`A315 ${width} « מוסתר » : pas de carte, la liste est là`, !m.mapShown && m.listed >= 10, JSON.stringify(m))
      }
      else check(`A315 ${width} ${mode} : épingles de fermes sur la carte`, pins > 0, `${pins} repères`)
      await o.ctx.close()
    }
  })
}

await guard('A315 calque éteint', async () => {
  for (const width of [1032, 1440]) {
    const o = await open(width, { storage: { 'lo-yanum:map-layers': JSON.stringify({ entities: false }) } })
    await go(o.page, '/coordinator/farms')
    const chip = o.page.locator('[data-testid="map-hidden-entities"]')
    check(`A315 ${width} calque « ישויות » éteint : la carte le DIT`, (await chip.count()) === 1, (await chip.count()) ? (await chip.innerText()).replace(/\s+/g, ' ') : 'aucune pastille')
    if (await chip.count()) {
      await chip.click()
      await o.page.waitForTimeout(800)
      const pins = (await markerKinds(o.page)).filter((k) => k === 'farm' || k === 'cluster').length
      check(`A315 ${width} un geste les rend`, pins > 0, `${pins} repères`)
    }
    await o.ctx.close()
    const d = await open(width, { storage: { 'lo-yanum:map-layers': JSON.stringify({ entities: false }) } })
    await go(d.page, `/coordinator/farms/${PLACED_ID}`)
    const own = (await markerKinds(d.page)).filter((k) => k === 'farm' || k === 'moshav').length
    check(`A315 ${width} fiche, calque éteint : l'épingle de la ferme est posée`, own === 1, `${own}`)
    await d.ctx.close()
  }
})

await guard('A315 bulle', async () => {
  for (const width of [402, 1032, 1440]) {
    const o = await open(width)
    await go(o.page, '/coordinator/farms')
    // Toucher une épingle ouvre la bulle ancrée.
    const pin = o.page.locator('.maplibregl-marker[data-marker-kind="farm"]').first()
    await pin.click({ force: true })
    await o.page.waitForTimeout(900)
    const card = o.page.locator('.lo-anchored [data-testid="entity-quick-card"]')
    const box = (await card.count()) ? await card.boundingBox() : null
    const where = (await card.count()) ? await card.locator('[data-testid="quick-card-where"]').innerText().catch(() => '') : ''
    const want = width >= 1024 ? 440 : 300
    check(`A315 ${width} bulle d'information ≥ ${want} px et situe le lieu`, !!box && box.width >= want && where.trim().length > 0, box ? `${Math.round(box.width)} px · « ${where.trim()} »` : 'aucune bulle')
    if (CAPTURES && box) await o.page.screenshot({ path: `${SHOTS}/a315-bulle-${width}.png` })
    await o.ctx.close()
  }
})

// --- A316 — aucun défilement parasite sur les écrans à carte ------------------

section('A316 — la carte descend jusqu’en bas, aucun défilement parasite')
const MAP_ROUTES = ['/coordinator', '/coordinator/agenda', '/coordinator/farms', '/coordinator/leads', '/coordinator/route', '/coordinator/route/free', '/coordinator/coverage', '/coordinator/volunteers', '/coordinator/drivers', '/coordinator/missions', '/coordinator/incidents']
for (const [width, height] of [[1440, 900], [1376, 1032]] as const) {
  await guard(`A316 ${width}`, async () => {
    const o = await open(width, { height })
    for (const route of MAP_ROUTES) {
      await go(o.page, route, 3500)
      const m = await o.page.evaluate(() => {
        const map = document.querySelector('.maplibregl-map')
        const r = map?.getBoundingClientRect()
        return { sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth, top: r ? Math.round(r.top) : -1, bottom: r ? Math.round(r.bottom) : -1 }
      })
      const ok = m.sh <= m.ih + 1 && m.sw <= m.iw + 1 && m.bottom >= m.ih - 2 && m.top <= 1
      check(`A316 ${width}×${height} ${route}`, ok, `page ${m.sh}/${m.ih} · carte ${m.top}→${m.bottom}`)
    }
    await o.ctx.close()
  })
}
await guard('A316 402', async () => {
  const o = await open(402)
  await go(o.page, '/coordinator/route/free')
  const m = await o.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))
  check('A316 402 itinéraire libre : aucun défilement horizontal', m.sw <= m.iw + 1, `${m.sw}/${m.iw}`)
  await o.ctx.close()
})

// --- A318 · A319 · A320 — la carte de couverture --------------------------------

section('A318 · A319 · A320 — la carte de couverture')

/** La vérité, calculée HORS de l'app avec le même module pur. */
function expected(radiusKm: number, visible = COVERAGE_PRESETS.prepare) {
  const fs = ROWS.map((r) => MAPPINGS.farms.fromRows(r as never, {} as never) as Farm)
  const ls = LEAD_ROWS.map((r) => MAPPINGS.leads.fromRows(r as never, {} as never) as Lead)
  return computeCoverage({ farms: fs, leads: ls, institutions: INSTITUTIONS, radiusKm, visible })
}

await guard('A318', async () => {
  const o = await open(1440, { storage: { 'lo-yanum:coverage': JSON.stringify({ radiusKm: 35, visible: COVERAGE_PRESETS.prepare }) } })
  await go(o.page, '/coordinator/coverage')
  const counts = o.page.locator('[data-testid="coverage-counts"]')
  const read = async () => ({
    farms: Number(await counts.getAttribute('data-farms')),
    covered: Number(await counts.getAttribute('data-covered')),
    uncovered: Number(await counts.getAttribute('data-uncovered')),
    potential: Number(await counts.getAttribute('data-potential')),
  })
  const linkCount = () => o.page.evaluate(() => {
    const map = (window as unknown as { __loYanumMap?: { getSource(id: string): { _data?: { features?: unknown[] } } | undefined } }).__loYanumMap
    const src = map?.getSource('coverage-links') as unknown as { _data?: { features?: unknown[] }; serialize?: () => { data?: { features?: unknown[] } } } | undefined
    return src?.serialize?.().data?.features?.length ?? src?._data?.features?.length ?? -1
  })
  const e35 = expected(35)
  const a35 = await read()
  check('A318 compteurs à 35 km = calcul indépendant', JSON.stringify(a35) === JSON.stringify({ farms: e35.counts.farms, covered: e35.counts.covered, uncovered: e35.counts.uncovered, potential: e35.counts.potential }), `app ${JSON.stringify(a35)} · attendu ${JSON.stringify(e35.counts)}`)
  const l35 = await linkCount()
  check('A318 liens tracés à 35 km', l35 === e35.links.length && l35 > 0, `${l35} (attendu ${e35.links.length})`)
  // Le rayon change → le dessin se recompose.
  await o.page.locator('[data-testid="coverage-radius-input"]').fill('15')
  await o.page.waitForTimeout(700)
  const e15 = expected(15)
  const a15 = await read()
  const l15 = await linkCount()
  check('A318 rayon 15 km : compteurs recomposés', a15.covered === e15.counts.covered && a15.potential === e15.counts.potential, `${JSON.stringify(a15)} · attendu ${JSON.stringify(e15.counts)}`)
  check('A318 rayon 15 km : liens recomposés', l15 === e15.links.length && l15 < l35, `${l15} < ${l35}`)
  check('A318 la valeur du rayon est affichée', (await o.page.locator('[data-testid="coverage-radius-value"]').innerText()).includes('15'))
  // Choisir une institution : la route se mesure.
  const engaged = INSTITUTIONS.find((i) => i.engagement === 'signed' && i.position)!
  await o.page.locator('[data-testid="coverage-radius-input"]').fill('35')
  await o.page.waitForTimeout(500)
  // AV1 — la liste peut s'ouvrir sur « לאשר » : « הכול » d'abord.
  await o.page.locator('#institutions-filter-tab-all').first().click()
  await o.page.waitForTimeout(300)
  await o.page.locator(`[data-testid="institution-row-${engaged.id}"]`).click()
  await o.page.waitForTimeout(12_000)
  const roads = await o.page.locator('[data-testid="coverage-reach-list"] button[data-road]').evaluateAll((els) => els.map((e) => e.getAttribute('data-road')))
  const measured = roads.filter((r) => r !== '' && r !== null).length
  check('A318 institution choisie : distances mesurées SUR LA ROUTE', roads.length > 0 && measured > 0, `${measured}/${roads.length} mesurées`)
  if (CAPTURES) await o.page.screenshot({ path: `${SHOTS}/a318-institution-choisie-1440.png` })
  check('A318 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

await guard('A319', async () => {
  const o = await open(1440, { storage: { 'lo-yanum:coverage': JSON.stringify({ radiusKm: 35, visible: COVERAGE_PRESETS.prepare }) } })
  await go(o.page, '/coordinator/coverage')
  const shape = await o.page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.maplibregl-marker[data-marker-kind]')].map((e) => {
      const svgPath = e.querySelector('path[data-pin-outline]')
      const drawn = (e.querySelector('span') ?? e) as HTMLElement
      return {
        kind: e.dataset.markerKind,
        fill: svgPath?.getAttribute('fill') ?? getComputedStyle(drawn).backgroundColor,
        border: getComputedStyle(drawn).borderStyle,
        label: e.querySelector('[data-marker-label]')?.textContent ?? '',
      }
    }),
  )
  const fills = (kind: string) => new Set(shape.filter((s) => s.kind === kind).map((s) => s.fill))
  check('A319 cinq familles : épingle pleine ET creuse, carré plein ET creux, rond pointillé', fills('farm').size >= 2 && fills('institution').size >= 2 && shape.some((s) => s.kind === 'lead' && s.border === 'dashed'), `fermes ${fills('farm').size} remplissages · institutions ${fills('institution').size} · pistes ${shape.filter((s) => s.kind === 'lead').length}`)
  const labels = shape.filter((s) => s.kind === 'institution' && s.label).length
  check('A319 les institutions engagées sont NOMMÉES sur la carte', labels === INSTITUTIONS.filter((i) => i.engagement === 'signed' && i.position).length, `${labels}`)
  const paint = await o.page.evaluate(() => {
    const map = (window as unknown as { __loYanumMap?: { getPaintProperty(l: string, p: string): unknown; getLayer(l: string): unknown } }).__loYanumMap
    return { real: map?.getPaintProperty('coverage-links-real', 'line-dasharray') ?? null, potential: map?.getPaintProperty('coverage-links-potential', 'line-dasharray') ?? null, hasReal: !!map?.getLayer('coverage-links-real') }
  })
  check('A319 lien réel = trait plein, lien possible = tirets', paint.hasReal && !paint.real && Array.isArray(paint.potential), JSON.stringify(paint))
  // Un geste par famille.
  const before = (await markerKinds(o.page)).filter((k) => k === 'institution').length
  await o.page.locator('[data-testid="coverage-family-prospect"]').click()
  await o.page.waitForTimeout(500)
  const after = (await markerKinds(o.page)).filter((k) => k === 'institution').length
  check('A319 un geste éteint une famille (institutions à démarcher)', after < before, `${before} → ${after}`)
  check('A319 l’usage passe en « מותאם »', (await o.page.locator('[data-testid="coverage-screen"]').getAttribute('data-usage')) === 'custom')
  await o.page.locator('#coverage-usage-meeting, [data-testid="coverage-usage"] [role="tab"]').first().click()
  await o.page.waitForTimeout(500)
  const kinds = await markerKinds(o.page)
  check('A319 « פגישה » en un geste : ni pistes ni institutions à démarcher', (await o.page.locator('[data-testid="coverage-screen"]').getAttribute('data-usage')) === 'meeting' && !kinds.includes('lead'), JSON.stringify([...new Set(kinds)]))
  check('A319 « פגישה » : rien d’interne à l’écran', (await o.page.locator('[data-testid="coverage-missing"]').count()) === 0)
  await o.ctx.close()
})

await guard('A320', async () => {
  const o = await open(1440, { storage: { 'lo-yanum:coverage': JSON.stringify({ radiusKm: 35, visible: COVERAGE_PRESETS.prepare }) } })
  await go(o.page, '/coordinator/coverage')
  const farmsWith = Number(await o.page.locator('[data-testid="coverage-counts"]').getAttribute('data-farms'))
  const leadsShown = (await markerKinds(o.page)).filter((k) => k === 'lead').length
  await o.page.locator('[data-testid="coverage-family-leads"]').click()
  await o.page.waitForTimeout(500)
  const farmsWithout = Number(await o.page.locator('[data-testid="coverage-counts"]').getAttribute('data-farms'))
  check('A320 des pistes sont sur la carte', leadsShown === 2, `${leadsShown} (2 ont un lieu et sont ouvertes)`)
  check('A320 afficher/masquer les pistes ne change AUCUN compteur', farmsWith === farmsWithout, `${farmsWith} = ${farmsWithout}`)
  await o.page.locator('[data-testid="coverage-family-leads"]').click()
  await o.page.waitForTimeout(400)
  const unplaced = o.page.locator('[data-testid="coverage-leads-unplaced"]')
  check('A320 le nombre de pistes sans lieu est DIT', (await unplaced.count()) === 1 && (await unplaced.getAttribute('data-count')) === '2', (await unplaced.count()) ? await unplaced.innerText() : 'absent')
  // Et le tableau de bord ne bouge pas avec les pistes / institutions.
  await o.ctx.close()
})

// --- Captures : les deux usages, clair et sombre, trois largeurs ----------------

if (CAPTURES) {
  section('Captures — parc seul (פגישה) et tout affiché (הכנה)')
  for (const dark of [false, true]) {
    for (const width of WIDTHS) {
      for (const usage of ['meeting', 'prepare'] as const) {
        await guard(`capture ${usage} ${width}`, async () => {
          const o = await open(width, { dark, storage: { 'lo-yanum:coverage': JSON.stringify({ radiusKm: 35, visible: COVERAGE_PRESETS[usage] }) } })
          await go(o.page, '/coordinator/coverage', 5500)
          const name = `${SHOTS}/couverture-${usage === 'meeting' ? 'parc-seul' : 'tout'}-${width}-${dark ? 'sombre' : 'clair'}.png`
          await o.page.screenshot({ path: name })
          check(`capture ${name.split('/').pop()}`, o.errors.length === 0, o.errors.slice(0, 1).join(''))
          await o.ctx.close()
        })
      }
    }
    for (const width of [1032, 1440]) {
      await guard(`capture farms ${width}`, async () => {
        const o = await open(width, { dark })
        await go(o.page, '/coordinator/farms')
        await o.page.screenshot({ path: `${SHOTS}/a315-fermes-${width}-${dark ? 'sombre' : 'clair'}.png` })
        await go(o.page, '/coordinator/route/free')
        await o.page.screenshot({ path: `${SHOTS}/a316-itineraire-libre-${width}-${dark ? 'sombre' : 'clair'}.png` })
        await o.ctx.close()
      })
    }
  }
}

await browser.close()
serve?.kill()
console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
