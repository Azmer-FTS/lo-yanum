import { chromium } from 'playwright'
import type { Browser, BrowserContext, Locator, Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'
import { INSTITUTIONS } from '../src/core/mock/institutions'
import type { Institution } from '../src/core/institutions'
import { AW_INSTITUTIONS } from './awdata'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AX — A345 → A354 AU RENDU.   (A343 · A344 · A350 calcul : `bun run axpass`.)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run axui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run axui    # le DÉPLOYÉ
 *   CAPTURES=1 …          # + captures clair/sombre × 3 largeurs des écrans touchés
 *   ONLY=checks | ONLY=captures | ONLY=clicks
 *   BEFORE=dist-ax-before ONLY=clicks …   # A354 « avant » : build de e8570e5
 *
 * Le bundle est celui servi ; la base est factice (`FakeDb`) mais porte les
 * VRAIES lignes de fermes (`buildFarms`) et les onze institutions réelles de
 * la tournée. Rien n'est écrit sur `lo-yanum-prod`.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-axui'
const PORT = Number(process.env.PORT ?? 5399)
const CAPTURES = process.env.CAPTURES === '1'
const ONLY = process.env.ONLY ?? ''
const BEFORE = process.env.BEFORE ?? null
const SHOTS = `docs/screenshots/axpass/${REMOTE ? 'deployed' : 'local'}`
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
const serves: Array<ReturnType<typeof Bun.spawn>> = []
async function serveBuild(dir: string, port: number, build: boolean): Promise<string> {
  if (build && process.env.SKIP_BUILD !== '1') {
    const b = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', dir], { env, stdout: 'ignore', stderr: 'pipe' })
    if ((await b.exited) !== 0) {
      console.error(await new Response(b.stderr).text())
      throw new Error('vite build failed')
    }
  }
  serves.push(Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', dir, '--port', String(port), '--strictPort'], { env, stdout: 'ignore', stderr: 'ignore' }))
  const base = `http://localhost:${port}`
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

const APP = REMOTE ?? (await serveBuild(OUT, PORT, true))
const APP_BEFORE = BEFORE ? await serveBuild(BEFORE, PORT + 1, false) : null
console.log(`  app : ${APP}${REMOTE ? '  (DÉPLOYÉ)' : `  (build local ${OUT})`}${APP_BEFORE ? `  · avant : ${APP_BEFORE} (${BEFORE})` : ''}`)

// --- Les données -------------------------------------------------------------

const { farms } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0]) as Array<Record<string, unknown>>
const TOUR: Institution[] = AW_INSTITUTIONS.map((i, n) => ({
  ...INSTITUTIONS[0],
  id: i.id,
  name: i.name,
  locality: '',
  engagement: n % 3 === 0 ? 'signed' : n % 3 === 1 ? 'contacted' : 'interested',
  engagementConfirmed: n !== 1,
  position: { lat: i.lat, lng: i.lng },
  positionUncertain: false,
  contactName: n === 0 ? 'רב בדיקה' : '',
  contactPhone: n === 0 ? '050-0000301' : '',
}))
const INST_ROWS = TOUR.map((i) => MAPPINGS.institutions.toRows(i)[0].rows[0])
const now = new Date().toISOString()
const LEADS = [
  { id: 'lead-ax-1', name: 'משק אלון', contact_name: 'אבי אלון', phone: '050-0000401', status: 'not_called' },
  { id: 'lead-ax-2', name: 'רפת בית', contact_name: 'דנה', phone: '050-0000402', status: 'no_answer' },
  { id: 'lead-ax-3', name: 'גידולי זיו', contact_name: 'זיו', phone: '050-0000403', status: 'call_back' },
  { id: 'lead-ax-4', name: 'דיר העמק', contact_name: 'יוסי', phone: '050-0000404', status: 'meeting_set' },
  { id: 'lead-ax-5', name: 'בוסתן גל', contact_name: 'גל', phone: '050-0000405', status: 'not_now' },
].map((l, i) => ({ ...l, email: '', place: 'נתיבות', lat: null, lng: null, region_id: null, notes: '', source: 'paste', raw: '', rank: i, converted_farm_id: null, converted_at: null, created_at: new Date(Date.now() - i * 86_400_000).toISOString(), updated_at: now }))
const placed = farms.filter((f) => !f.positionMissing).slice(0, 3)
const todayKey = (() => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

function seed(db: FakeDb): void {
  db.seed()
  for (const r of ROWS) db.rows('entities').push({ ...r })
  for (const i of INST_ROWS) db.rows('institutions').push({ ...i })
  for (const l of LEADS) db.rows('leads').push({ ...l })
  // « Ma journée » : une tournée aujourd'hui, trois fermes placées.
  db.rows('tours').push({ id: 'tour-ax-today', day_key: todayKey, depart_at: new Date().toISOString(), name: '', created_at: now, updated_at: now })
  placed.forEach((f, position) => db.rows('tour_stops').push({ tour_id: 'tour-ax-today', entity_id: f.id, position }))
}

let browser: Browser | null = null
async function engine(): Promise<Browser> {
  if (!browser) browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
  return browser
}

interface Opened {
  ctx: BrowserContext
  page: Page
  db: FakeDb
  errors: string[]
}
async function open(width: number, opts: { dark?: boolean; height?: number; db?: FakeDb } = {}): Promise<Opened> {
  const db = opts.db ?? new FakeDb()
  if (!opts.db) seed(db)
  const height = opts.height ?? (width >= 1300 ? 900 : width >= 1000 ? 1376 : 874)
  const b = await engine()
  const ctx = await b.newContext({ viewport: { width, height }, hasTouch: width < 700, isMobile: false, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: opts.dark ? 'dark' : 'light' })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('ax-init')) {
      localStorage.setItem('lo-yanum:theme:coordinator', 'system')
      sessionStorage.setItem('ax-init', '1')
    }
  })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, db, errors }
}
async function go(page: Page, hash: string, settle = 3000, base = APP): Promise<void> {
  await page.goto(`${base}/?ax=${Date.now()}#${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}
async function guard(label: string, run: () => Promise<void>): Promise<void> {
  const kind = label.startsWith('capture') ? 'captures' : label.startsWith('clicks') ? 'clicks' : 'checks'
  if (ONLY && ONLY !== kind) return
  try {
    await run()
  } catch (e) {
    check(`${label} — section interrompue`, false, (e as Error).message.split('\n')[0])
  }
}
const box = (l: Locator) => l.boundingBox()
/** Deux éléments sur UNE ligne : leurs boîtes se recouvrent verticalement. */
async function sameLine(a: Locator, b: Locator): Promise<boolean> {
  const [x, y] = await Promise.all([box(a), box(b)])
  if (!x || !y) return false
  return x.y < y.y + y.height && y.y < x.y + x.height
}

const LIST_SCREENS = [
  '/coordinator',
  '/coordinator/agenda',
  '/coordinator/leads',
  '/coordinator/farms',
  '/coordinator/institutions',
  '/coordinator/volunteers',
  '/coordinator/drivers',
  '/coordinator/coverage',
  '/coordinator/route',
  '/coordinator/route/free',
  '/coordinator/missions',
  '/coordinator/incidents',
  '/coordinator/add',
  '/coordinator/settings',
]

// ===========================================================================
section('AX1 — le rail suit les trois temps du métier, chaque entrée nommée')
// ===========================================================================
await guard('AX1', async () => {
  for (const w of [1440, 1376]) {
    const o = await open(w)
    await go(o.page, '/coordinator')
    const groups = await o.page.locator('[data-testid^="rail-group-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    check(`AX1 ${w} px : trois temps — גיוס · תכנון · ביצוע`, groups.join(',') === 'rail-group-recruit,rail-group-plan,rail-group-execute', groups.join(','))
    const labels = await o.page.locator('[data-testid="rail-nav"] a').evaluateAll((as) => as.map((a) => (a as HTMLElement).innerText.trim()))
    check(`AX1 ${w} px : les ${labels.length} entrées portent un nom visible`, labels.length === 12 && labels.every((l) => l.length > 1), labels.join(' | '))
    const settings = o.page.locator('[data-testid="rail-settings"]')
    const fits = await settings.evaluate((e) => e.getBoundingClientRect().bottom <= window.innerHeight)
    check(`AX1 ${w} px : le rail tient sans défiler (הגדרות visible)`, fits)
    await o.ctx.close()
  }
})

// ===========================================================================
section('A345 · A346 · A347 — onglets / filtres, une rangée, une forme d’aide')
// ===========================================================================
await guard('A345', async () => {
  const o = await open(1440)
  const rows: string[] = []
  for (const r of LIST_SCREENS) {
    await go(o.page, r, 2500)
    const m = await o.page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body
      const shown = (e: Element) => {
        const b = (e as HTMLElement).getBoundingClientRect()
        return b.width > 0 && b.height > 0
      }
      const filterRows = [...main.querySelectorAll('[data-filter-row]')].filter(shown).length
      const kpiStrips = main.querySelectorAll('[data-testid="kpi-strip"]').length
      const tabs = [...main.querySelectorAll('[role="tab"]')].filter(shown).length
      const panels = main.querySelectorAll('[data-info-panel]').length
      const toggles = [...main.querySelectorAll('[data-info-toggle]')].filter(shown).length
      const long: string[] = []
      const bodyColor = getComputedStyle(document.body).color
      for (const el of main.querySelectorAll('p, span, div')) {
        const e = el as HTMLElement
        if (e.children.length > 2) continue
        if (e.closest('[data-info-panel], [role="dialog"], table, li, label, button, a, [role="status"], [data-testid="add-done"]')) continue
        if (!shown(e)) continue
        const txt = (e.innerText || '').trim()
        if (txt.length <= 80) continue
        const muted = e.classList.contains('muted') || getComputedStyle(e).color !== bodyColor
        if (muted && [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 40)) long.push(txt.slice(0, 60))
      }
      return { filterRows, kpiStrips, tabs, panels, toggles, long: [...new Set(long)] }
    })
    rows.push(`${r} f=${m.filterRows} t=${m.tabs} ⓘ=${m.toggles} long=${m.long.length}`)
    check(`A346 ${r} : au plus UNE rangée de filtres, aucune bande de tuiles`, m.filterRows <= 1 && m.kpiStrips === 0, `${m.filterRows} rangée(s), ${m.kpiStrips} bande(s)`)
    if (['/coordinator/leads', '/coordinator/institutions', '/coordinator/coverage', '/coordinator/missions'].includes(r)) {
      check(`A345 ${r} : aucun onglet pour restreindre une liste`, m.tabs === 0, `${m.tabs} onglet(s)`)
    }
    check(`A347 ${r} : aucune explication ouverte d’office`, m.panels === 0 && m.long.length === 0, m.long.join(' | '))
  }
  console.log(`  ${rows.join('\n  ')}`)

  // La forme : ⓘ ouvre en place, × referme — la même partout.
  for (const r of ['/coordinator/farms', '/coordinator/leads', '/coordinator/coverage', '/coordinator/add', '/coordinator/institutions']) {
    await go(o.page, r, 2500)
    const t = o.page.locator('main [data-info-toggle]').first()
    await t.click()
    const opened = await o.page.locator('main [data-info-panel]').count()
    await o.page.locator('main [data-info-panel] [data-info-close]').first().click()
    const closed = await o.page.locator('main [data-info-panel]').count()
    check(`A347 ${r} : ⓘ ouvre l’explication sur place, × la referme`, opened === 1 && closed === 0, `${opened} → ${closed}`)
  }
  // Une file de travail des fermes est un FILTRE qui a son compte, dans la rangée.
  await go(o.page, '/coordinator/farms', 2500)
  const pills = await o.page.locator('[data-filter-row] .filter-pill, [data-filter-row] [data-testid="filter-dropdown"]').count()
  check('A346 חוות : les files de travail et le statut sont dans l’unique rangée de filtres', pills > 0)
  check('A345 חוות : le chiffre (dounams · pondérés) se lit, ne se touche pas', (await o.page.locator('[data-list-stat]').count()) === 1 && (await o.page.locator('[data-list-stat]').evaluate((e) => !e.closest('button'))), await o.page.locator('[data-list-stat]').innerText().catch(() => '?'))
  check('aucune erreur de page', o.errors.length === 0, o.errors.join(' | '))
  await o.ctx.close()
})

// ===========================================================================
section('A348 — l’écran des contacts est un tableau')
// ===========================================================================
await guard('A348', async () => {
  for (const w of [1440, 1032]) {
    const o = await open(w)
    await go(o.page, '/coordinator/leads')
    const table = o.page.locator('[data-testid="leads-table"] table')
    check(`A348 ${w} px : un TABLEAU, avec ses en-têtes de colonnes`, (await table.count()) === 1 && (await table.locator('thead th').count()) >= 4)
    const filters = await o.page.locator('[data-testid^="leads-filter-"]').count()
    const shownFilters = filters > 0 ? filters : await o.page.locator('[data-testid="filter-dropdown"]').count()
    check(`A348 ${w} px : les statuts sont des FILTRES en haut (pas des onglets)`, shownFilters > 0 && (await o.page.locator('main [role="tab"]').count()) === 0, `${filters} pastille(s)`)
    const opens = o.page.locator('[data-row-open]')
    check(`A348 ${w} px : chaque ligne DIT qu’elle s’ouvre (« פרטים »)`, (await opens.count()) >= 4 && (await opens.first().isVisible()) && /פרטים/.test(await opens.first().innerText()))
    if (w === 1440) {
      // Le tri, par les colonnes.
      await o.page.locator('[data-testid="leads-table-sort-name"]').click()
      await o.page.waitForTimeout(200)
      const asc = await o.page.locator('[data-testid="leads-table"] tbody tr[data-row-key] td:first-child').allInnerTexts()
      await o.page.locator('[data-testid="leads-table-sort-name"]').click()
      await o.page.waitForTimeout(200)
      const desc = await o.page.locator('[data-testid="leads-table"] tbody tr[data-row-key] td:first-child').allInnerTexts()
      const sorted = [...asc].sort((a, b) => a.localeCompare(b, 'he'))
      check('A348 le tri se fait par la colonne : un toucher trie, un second inverse', asc.join('|') === sorted.join('|') && desc.join('|') === [...sorted].reverse().join('|'), `${asc.join(', ')} / ${desc.join(', ')}`)
      check('A348 l’en-tête dit le sens (aria-sort)', (await o.page.locator('th[aria-sort="descending"]').count()) === 1)
      // Le filtre.
      await o.page.locator('[data-testid="leads-filter-call_back"]').click()
      const only = await o.page.locator('[data-testid="leads-table"] tbody tr[data-row-key]').evaluateAll((rs) => rs.map((r) => r.getAttribute('data-status')))
      check('A348 le filtre « לחזור » ne garde que les contacts à rappeler', only.length === 1 && only[0] === 'call_back', only.join(','))
      await o.page.locator('[data-testid="leads-filter-open"]').click()
      // Ouvrir : la ligne entière, la note et le secteur.
      await o.page.locator('tr[data-row-key="lead-ax-1"] td').first().click()
      const notes = o.page.locator('[data-testid="lead-notes-lead-ax-1"]')
      check('A348 toucher la ligne OUVRE la fiche : note et secteur', (await notes.isVisible()) && (await o.page.locator('[data-testid="lead-region-lead-ax-1"]').isVisible()))
      await notes.fill('לחזור אחרי החג')
      await o.page.locator('[data-testid="leads-top"] h1').click()
      await o.page.waitForTimeout(1500)
      check('A348 la note est ÉCRITE en base', o.db.rows('leads').find((r) => r.id === 'lead-ax-1')?.notes === 'לחזור אחרי החג')
      // Le statut, dans sa colonne, en un toucher.
      await o.page.locator('[data-testid="lead-status-lead-ax-2-call_back"]').click()
      await o.page.waitForTimeout(1500)
      check('A348 le statut se change DANS sa colonne, un toucher, et s’écrit', o.db.rows('leads').find((r) => r.id === 'lead-ax-2')?.status === 'call_back')
      const h = await o.page.locator('[data-testid="leads-table"] tbody tr[data-row-key]').evaluateAll((rs) => rs.map((r) => Math.round(r.getBoundingClientRect().height)))
      check('A349 contacts 1 440 px : chaque ligne tient sur UNE ligne (≤ 56 px)', h.every((x) => x <= 56), h.join(','))
    }
    check('aucune erreur de page', o.errors.length === 0, o.errors.join(' | '))
    await o.ctx.close()
  }
})

// ===========================================================================
section('A349 — en grand écran, une ligne reste une ligne')
// ===========================================================================
await guard('A349', async () => {
  for (const w of [1440, 1376]) {
    const o = await open(w)
    // Ma journée (tableau de bord) — la tournée d'aujourd'hui.
    await go(o.page, '/coordinator', 4000)
    const myday = o.page.locator('[data-testid="myday-stop"]')
    const n = await myday.count()
    let ok = n > 0
    for (let i = 0; i < n; i++) ok = ok && (await sameLine(myday.nth(i).locator('[data-area="name"]'), myday.nth(i).locator('[data-testid="myday-figs"]')))
    check(`A349 ${w} px : « היום שלי » — heure · nom · km · durée sur UNE ligne`, ok, `${n} étape(s)`)
    // Le planificateur.
    await go(o.page, `/coordinator/route?tour=tour-ax-today`, 4000)
    const stops = o.page.locator('[data-testid="route-stop"]')
    const k = await stops.count()
    let ok2 = k > 0
    for (let i = 0; i < k; i++) ok2 = ok2 && (await sameLine(stops.nth(i).locator('[data-area="name"]'), stops.nth(i).locator('[data-testid="route-stop-figs"]')))
    check(`A349 ${w} px : תכנון מסלול — nom · heure · km · durée sur UNE ligne`, ok2, `${k} étape(s)`)
    const figs = await stops.first().locator('[data-testid="route-stop-figs"] [data-fig]').evaluateAll((es) => es.map((e) => e.getAttribute('data-fig')))
    check(`A349 ${w} px : l’étape porte la distance ET la durée`, figs.includes('km') && figs.includes('min'), figs.join(','))
    check(`A349 ${w} px : les deux totaux côte à côte`, await sameLine(o.page.locator('[data-testid="route-totals"] dt').first(), o.page.locator('[data-testid="route-drive-time"]')))
    // Les institutions.
    await go(o.page, '/coordinator/institutions')
    const ih = await o.page.locator('[data-testid="institutions-table"] tbody tr[data-row-key]').evaluateAll((rs) => rs.map((r) => Math.round(r.getBoundingClientRect().height)))
    check(`A349 ${w} px : מוסדות — une ligne par institution (≤ 56 px)`, ih.length > 0 && ih.every((x) => x <= 56), ih.join(','))
    check('aucune erreur de page', o.errors.length === 0, o.errors.join(' | '))
    await o.ctx.close()
  }
})

// ===========================================================================
section('A350 — kilomètres ou minutes ; les deux sur chaque lien')
// ===========================================================================
await guard('A350', async () => {
  const o = await open(1440)
  await o.ctx.addInitScript(() => localStorage.setItem('lo-yanum:coverage-map', JSON.stringify({ radiusKm: 35, minutes: 35, unit: 'km', nightPct: 0, visible: { signed: true, pipeline: true, leads: true, engaged: true, prospect: true } })))
  await go(o.page, '/coordinator/coverage', 1000)
  await o.page.waitForFunction(() => {
    const m = document.querySelector('[data-testid="coverage-mesh"]')
    return !!m && m.getAttribute('data-running') === 'false' && m.getAttribute('data-pending') === '0'
  }, undefined, { timeout: 240_000 })
  const read = async () => ({
    unit: await o.page.locator('[data-testid="coverage-radius"]').getAttribute('data-unit'),
    value: await o.page.locator('[data-testid="coverage-radius-value"]').innerText(),
    road: Number(await o.page.locator('[data-testid="coverage-mesh"]').getAttribute('data-road')),
    labels: await o.page.evaluate(() => {
      const map = (window as unknown as { __loYanumMap?: { getSource(id: string): unknown } }).__loYanumMap
      const src = map?.getSource('coverage-links') as { serialize?: () => { data?: { features?: Array<{ properties: Record<string, unknown> }> } } } | undefined
      return (src?.serialize?.().data?.features ?? []).map((f) => String(f.properties.label))
    }),
  })
  const km = await read()
  check('A350 en km : la borne se lit en ק״מ', km.unit === 'km' && /ק״מ/.test(km.value), km.value)
  check('A350 chaque lien porte km ET minutes (borne en km)', km.labels.length > 0 && km.labels.every((l) => /ק״מ/.test(l) && /דק׳/.test(l)), km.labels.slice(0, 2).join(' | '))
  await o.page.locator('[data-testid="coverage-unit-min"]').click()
  await o.page.waitForFunction(() => document.querySelector('[data-testid="coverage-mesh"]')?.getAttribute('data-pending') === '0', undefined, { timeout: 240_000 })
  await o.page.waitForTimeout(800)
  const min = await read()
  check('A350 le PO CHOISIT les minutes : la borne se lit en דק׳', min.unit === 'min' && /דק׳/.test(min.value), min.value)
  check('A350 chaque lien porte km ET minutes (borne en minutes)', min.labels.length > 0 && min.labels.every((l) => /ק״מ/.test(l) && /דק׳/.test(l)), `${min.labels.length} liens`)
  check('A350 la borne en minutes change le maillage', min.road !== km.road, `${km.road} → ${min.road}`)
  await o.page.locator('[data-testid="coverage-night"]').fill('30')
  await o.page.waitForTimeout(1200)
  const night = await read()
  check('A350 la tenue de NUIT se règle et resserre la borne', night.road <= min.road && /30%/.test(await o.page.locator('[data-testid="coverage-duration-line"]').innerText()), `${min.road} → ${night.road}`)
  await o.page.locator('[data-testid="coverage-duration-info-toggle"]').click()
  const explained = await o.page.locator('[data-testid="coverage-duration-info"]').innerText()
  check('A350 l’écran DIT de quoi est faite la durée (vitesses, marge, nuit)', /95/.test(explained) && /מרווח/.test(explained) && /לילה/.test(explained))
  const stored = await o.page.evaluate(() => localStorage.getItem('lo-yanum:coverage-map'))
  check('A350 le choix est gardé (et voyage : clé synchronisée)', /"unit":"min"/.test(stored ?? '') && /"nightPct":30/.test(stored ?? ''))
  check('aucune erreur de page', o.errors.length === 0, o.errors.join(' | '))
  await o.ctx.close()
})

// ===========================================================================
section('A351 — un itinéraire enregistré se retrouve (fermeture, autre appareil)')
// ===========================================================================
await guard('A351', async () => {
  const db = new FakeDb()
  seed(db)
  db.rows('tours').splice(0)
  db.rows('tour_stops').splice(0)
  const a = await open(1440, { db })
  await go(a.page, '/coordinator/route')
  const tile = (i: number) => a.page.locator('[data-testid="route-step-picker"] button[aria-pressed]').nth(i)
  const pickers = await a.page.locator('[data-testid="route-step-picker"] button[aria-pressed]').count()
  // Tournée A : deux fermes.
  await tile(0).click()
  await tile(1).click()
  await a.page.locator('[data-testid="tour-name"]').fill('סבב א')
  await a.page.locator('[data-testid="tour-save"]').click()
  await a.page.waitForTimeout(800)
  // Tournée B, le MÊME jour : une nouvelle, une autre ferme.
  await a.page.locator('[data-testid="tour-new"]').click()
  await tile(2).click()
  await a.page.locator('[data-testid="tour-name"]').fill('סבב ב')
  await a.page.locator('[data-testid="tour-save"]').click()
  await a.page.waitForTimeout(800)
  // Le geste du constat : décocher les points.
  await a.page.getByRole('button', { name: 'ניקוי', exact: true }).first().click().catch(() => undefined)
  await tile(2).click().catch(() => undefined)
  await a.page.waitForTimeout(500)
  const listed = async (p: Page) => p.locator('[data-testid="tour-list"] [data-tour-name]').evaluateAll((ls) => ls.map((l) => l.getAttribute('data-tour-name')))
  const l1 = await listed(a.page)
  check('A351 deux tournées du même jour : DEUX dans la liste, même après avoir décoché', l1.length === 2 && l1.includes('סבב א') && l1.includes('סבב ב'), `${pickers} fermes choisissables · ${l1.join(', ')}`)
  await a.page.waitForTimeout(1500)
  const rows = db.rows('tours').map((r) => String(r.name))
  check('A351 les deux sont ÉCRITES en base, avec leur nom', rows.length === 2 && rows.includes('סבב א') && rows.includes('סבב ב'), rows.join(', '))
  // Fermeture et réouverture.
  await go(a.page, '/coordinator/route')
  const l2 = await listed(a.page)
  check('A351 l’application fermée puis rouverte : les deux sont là', l2.length === 2, l2.join(', '))
  // Rouvrir : la tournée revient avec ses fermes.
  const idB = String(db.rows('tours').find((r) => r.name === 'סבב ב')?.id)
  await a.page.locator(`[data-testid="tour-open-${idB}"]`).click()
  await a.page.waitForTimeout(500)
  check('A351 rouvrir une tournée la recharge (nom, étapes, « enregistrée »)', (await a.page.locator('[data-testid="tour-name"]').inputValue()) === 'סבב ב' && (await a.page.locator('[data-testid="tour-saved-chip"]').count()) === 1)
  // Renommer.
  await a.page.locator(`[data-testid="tour-rename-${idB}"]`).click()
  await a.page.locator(`[data-testid="tour-rename-input-${idB}"]`).fill('סבב הנגב')
  await a.page.locator(`[data-testid="tour-rename-ok-${idB}"]`).click()
  await a.page.waitForTimeout(1500)
  check('A351 se renomme (et s’écrit)', db.rows('tours').find((r) => r.id === idB)?.name === 'סבב הנגב')
  await a.ctx.close()
  // Un AUTRE appareil, le même compte.
  const b = await open(1032, { db })
  await go(b.page, '/coordinator/route')
  const l3 = await listed(b.page)
  check('A351 sur un AUTRE appareil : les deux tournées, avec leur nom', l3.length === 2 && l3.includes('סבב הנגב'), l3.join(', '))
  // Supprimer (confirmé).
  const idA = String(db.rows('tours').find((r) => r.name === 'סבב א')?.id)
  await b.page.locator(`[data-testid="tour-row-delete-${idA}"]`).click()
  await b.page.locator('[data-testid="delete-confirm"]').click()
  await b.page.waitForTimeout(1500)
  check('A351 se supprime, après confirmation', db.rows('tours').length === 1 && (await listed(b.page)).length === 1)
  check('aucune erreur de page', b.errors.length === 0, b.errors.join(' | '))
  await b.ctx.close()

  // L'itinéraire LIBRE : le même défaut (il gardait son identifiant).
  const c = await open(1440, { db })
  await go(c.page, '/coordinator/route/free')
  const addStop = async (txt: string) => {
    await c.page.locator('[data-testid="position-link"]').first().fill(txt)
    await c.page.locator('[data-testid="position-link-apply"]').first().click()
    await c.page.waitForTimeout(400)
  }
  await addStop('31.4167, 34.5880')
  await c.page.locator('[data-testid="free-route-name"]').fill('חופשי א')
  await c.page.locator('[data-testid="free-route-save"]').click()
  // On vide ses étapes, on en colle d'autres, on renomme, on « enregistre comme nouveau ».
  await c.page.locator('[data-testid="free-route-remove"]').first().click()
  await addStop('31.2500, 34.7900')
  await c.page.locator('[data-testid="free-route-name"]').fill('חופשי ב')
  await c.page.locator('[data-testid="free-route-save-as-new"]').click()
  await c.page.waitForTimeout(600)
  const names = await c.page.locator('[data-testid="free-route-list"] li').allInnerTexts()
  check('A351 itinéraire libre : « שמירה כמסלול חדש » GARDE le premier', names.length === 2 && names.some((n) => n.includes('חופשי א')) && names.some((n) => n.includes('חופשי ב')), names.map((n) => n.split('\n')[0]).join(', '))
  await go(c.page, '/coordinator/route/free')
  check('A351 itinéraire libre : rouvert, les deux sont là ; le brouillon aussi', (await c.page.locator('[data-testid="free-route-list"] li').count()) === 2 && (await c.page.locator('[data-testid="free-route-name"]').inputValue()) === 'חופשי ב')
  await c.page.waitForTimeout(4000)
  await c.ctx.close()
  const d = await open(1032, { db })
  await go(d.page, '/coordinator/route/free', 6000)
  const other = await d.page.locator('[data-testid="free-route-list"] li').count()
  check('A351 itinéraire libre : sur un AUTRE appareil (réglages synchronisés), les deux sont là', other === 2, `${other}`)
  await d.ctx.close()
})

// ===========================================================================
section('A352 — la région, en colonne, dans le tableau des fermes')
// ===========================================================================
await guard('A352', async () => {
  for (const w of [1376, 1440]) {
    const o = await open(w)
    await o.ctx.addInitScript(() => localStorage.setItem('lo-yanum:map-mode:farms', 'hidden'))
    await go(o.page, '/coordinator/farms', 3500)
    if ((await o.page.locator('[data-testid="farm-region-cell"]').count()) === 0) {
      await o.page.locator('[data-testid="map-mode-hidden"]').click().catch(() => undefined)
      await o.page.waitForTimeout(1200)
    }
    const cells = o.page.locator('[data-testid="farm-region-cell"]')
    const vis = await cells.evaluateAll((cs) => cs.filter((c) => (c as HTMLElement).getBoundingClientRect().width > 0).map((c) => (c as HTMLElement).innerText.trim()))
    check(`A352 ${w} px : la colonne « אזור » est AFFICHÉE`, vis.length > 0, `${vis.length} cellules`)
    /* Vide n'est juste que pour une fiche qui n'a NI point NI région choisie
       (AN2 : le point de repli ne décide d'aucune région). */
    const unknowable = farms.filter((f) => !f.archivedAt && f.positionMissing && !f.regionId).length
    const empty = vis.filter((x) => !x || x === '—').length
    check(`A352 ${w} px : chaque ferme placée montre sa région (vides : seulement les ${unknowable} sans point ni région)`, empty <= unknowable, `${empty} vide(s) · ${vis.slice(0, 6).join(', ')}`)
    if (w === 1376) {
      // Filtrer sur une région : chaque ligne affiche CETTE région.
      if ((await o.page.locator('[data-testid="farms-region"]').count()) === 0) await o.page.locator('[data-testid="filter-dropdown"]').click()
      const sel = o.page.locator('[data-testid="farms-region"] select, select[data-testid="farms-region"]').first()
      const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: (o as HTMLOptionElement).text, d: (o as HTMLOptionElement).disabled })))
      const pick = opts.find((x) => /נגב/.test(x.t) && !x.d) ?? opts.find((x) => x.v && x.v !== 'all' && !x.d && !/כל/.test(x.t))
      if (pick) {
        await sel.selectOption(pick.v)
        await o.page.waitForTimeout(600)
        const after = await o.page.locator('[data-testid="farm-region-cell"]').allInnerTexts()
        const name = pick.t.replace(/\s*\(?\d+\)?\s*$/, '').replace(/\s*·\s*\d+$/, '').trim()
        check('A352 filtrer sur une région : CHAQUE ligne la montre dans sa colonne', after.length > 0 && after.every((x) => x.trim() === name || name.startsWith(x.trim())), `${name} : ${after.join(', ')}`)
      }
    }
    check('aucune erreur de page', o.errors.length === 0, o.errors.join(' | '))
    await o.ctx.close()
  }
})

// ===========================================================================
section('A353 — un seul point d’entrée, par étapes, rien de déployé d’avance')
// ===========================================================================
await guard('A353', async () => {
  const o = await open(1440)
  await go(o.page, '/coordinator')
  await o.page.locator('[data-testid="action-fab-toggle"]').click()
  const fab = await o.page.locator('[data-testid="action-fab-menu"] a, [data-testid="action-fab-menu"] button').evaluateAll((as) => as.map((a) => (a as HTMLElement).getAttribute('data-testid') ?? ''))
  check('A353 le « + » : les cinq ajouts mènent tous au même écran', fab.filter((x) => x.startsWith('fab-add-')).length === 5 && !fab.some((x) => /farm-new|moshav-new|volunteer-new|driver-new/.test(x)), fab.join(', '))
  await go(o.page, '/coordinator/add')
  const step = async () => o.page.locator('[data-testid="add-contacts"]').getAttribute('data-step')
  const nothing = {
    s2: await o.page.locator('[data-testid="add-step-2"]').count(),
    s3: await o.page.locator('[data-testid="add-step-3"]').count(),
    files: await o.page.locator('input[type="file"]').count(),
    areas: await o.page.locator('main textarea').count(),
  }
  check('A353 à l’ouverture : SEULEMENT le nom (ni type, ni fichier, ni collage)', (await step()) === '1' && nothing.s2 + nothing.s3 + nothing.files + nothing.areas === 0, JSON.stringify(nothing))
  await o.page.locator('[data-testid="add-name"]').fill('משק בדיקת הוספה')
  check('A353 un nom → l’étape ② (ce que c’est) apparaît, pas la ③', (await step()) === '2' && (await o.page.locator('[data-testid="add-step-3"]').count()) === 0)
  await o.page.locator('[data-testid="add-kind-farm"]').click()
  check('A353 le type → l’étape ③ : ce que CE type demande', (await step()) === '3' && (await o.page.locator('[data-testid="add-form-phone"]').isVisible()))
  await o.page.locator('[data-testid="add-form-phone"]').fill('0500000499')
  await o.page.locator('[data-testid="add-form-save"]').click()
  await o.page.waitForTimeout(1500)
  check('A353 enregistré : un contact de plus, écrit en base', o.db.rows('leads').some((r) => r.name === 'משק בדיקת הוספה' || r.contact_name === 'משק בדיקת הוספה'))
  // Une institution, à la main, une par une.
  await o.page.locator('[data-testid="add-name"]').fill('מכינת בדיקה')
  await o.page.locator('[data-testid="add-kind-institution"]').click()
  await o.page.locator('[data-testid="add-form-save"]').click()
  await o.page.waitForTimeout(1500)
  check('A353 une institution s’ajoute À LA MAIN, une par une', o.db.rows('institutions').some((r) => r.name === 'מכינת בדיקה'))
  // Une liste de volontaires : l'institution, puis le fichier.
  await o.page.locator('[data-testid="add-source-list"]').click()
  await o.page.locator('[data-testid="add-kind-volunteer"]').click()
  const inst = String(INST_ROWS[0].id)
  await o.page.locator('[data-testid="add-institution-select"]').selectOption(inst)
  const to = await o.page.locator('[data-testid="add-list-go"]').getAttribute('data-to')
  check('A353 liste CSV/Excel de volontaires → l’import, l’institution reprise', to === `/coordinator/import/volunteers?institution=${inst}`, to ?? '')
  await o.page.locator('[data-testid="add-list-go"]').click()
  await o.page.waitForTimeout(1200)
  check('A353 l’import dit à quelle institution la liste sera rattachée', (await o.page.locator(`[data-testid="import-institution"][data-institution="${inst}"]`).count()) === 1)
  // Depuis une liste, le « + » y va directement, le type dit.
  await go(o.page, '/coordinator/volunteers')
  await o.page.locator('[data-testid="action-fab-toggle"], [data-testid="fab-add-volunteer"]').first().click()
  await o.page.waitForTimeout(800)
  check('A353 depuis מתנדבים, « + » → /add?type=volunteer (un toucher)', /#\/coordinator\/add\?type=volunteer/.test(o.page.url()), o.page.url())
  check('aucune erreur de page', o.errors.length === 0, o.errors.join(' | '))
  await o.ctx.close()
})

// ===========================================================================
section('A354 — les cinq gestes du PO, comptés en clics, avant / après')
// ===========================================================================
interface Gesture {
  key: string
  label: string
  run: (p: Page, db: FakeDb, click: (l: Locator) => Promise<void>) => Promise<boolean>
}
const farmId = String(ROWS.find((r) => r.lat !== null)?.id ?? ROWS[0].id)
const rail = (p: Page, to: string) => p.locator(`aside a[href="#/coordinator/${to}"]`).first()
function gestures(after: boolean): Gesture[] {
  return [
    {
      key: 'G1',
      label: 'changer le statut d’un contact',
      run: async (p, db, click) => {
        await click(rail(p, 'leads'))
        await click(p.locator('[data-testid="lead-status-lead-ax-1-call_back"]'))
        await p.waitForTimeout(1200)
        return db.rows('leads').find((r) => r.id === 'lead-ax-1')?.status === 'call_back'
      },
    },
    {
      key: 'G2',
      label: 'ajouter une ferme',
      run: async (p, db, click) => {
        await click(p.locator('[data-testid="action-fab-toggle"]'))
        if (after) {
          await click(p.locator('[data-testid="fab-add-farmFile"]'))
          await p.locator('[data-testid="add-name"]').fill('חוות בדיקת קליקים')
          await click(p.locator('[data-testid="add-farm-go"]'))
        } else {
          await click(p.locator('[data-testid="fab-farm-new"]'))
        }
        await p.waitForTimeout(800)
        if (!after) await p.locator('[data-testid="farm-form-name"] input, input[data-testid="farm-form-name"]').first().fill('חוות בדיקת קליקים')
        await click(p.getByRole('button', { name: 'שמירה', exact: true }).last())
        await p.waitForTimeout(1500)
        return db.rows('entities').some((r) => r.name === 'חוות בדיקת קליקים')
      },
    },
    {
      key: 'G3',
      label: 'voir les gardes d’une ferme',
      run: async (p, _db, click) => {
        await click(rail(p, 'farms'))
        await click(p.locator(`[data-testid="farm-tile-open"]`).first())
        await click(p.locator('[data-testid="farm-tab-guards"]'))
        return /tab=guards|farms\//.test(p.url()) && (await p.locator('[data-testid="farm-tab-guards"][aria-selected="true"]').count()) === 1
      },
    },
    {
      key: 'G4',
      label: 'poser un rendez-vous (visite de ferme)',
      run: async (p, db, click) => {
        const before = db.rows('farm_visits').length
        await click(rail(p, 'farms'))
        await click(p.locator(`[data-testid="farm-tile-open"]`).first())
        /* Un nom long replie la pilule d'actions en « ⋯ » (AT5) : l'ouvrir est un clic, compté. */
        const plan = p.getByRole('button', { name: 'תכנון ביקור' }).first()
        if (!(await plan.isVisible().catch(() => false))) await click(p.locator('[data-testid="sheet-actions-more"]'))
        await click(p.getByRole('menuitem', { name: 'תכנון ביקור' }).or(p.getByRole('button', { name: 'תכנון ביקור' })).first())
        await p.waitForTimeout(600)
        await click(p.getByRole('button', { name: 'שמירה', exact: true }).last())
        await p.waitForTimeout(1500)
        return db.rows('farm_visits').length === before + 1
      },
    },
    {
      key: 'G5',
      label: 'écrire un commentaire sur un contact',
      run: async (p, _db, click) => {
        await click(rail(p, 'leads'))
        if (after) await click(p.locator('tr[data-row-key="lead-ax-3"] td').first())
        else await click(p.locator('[data-testid="lead-open-lead-ax-3"]'))
        return p.locator('[data-testid="lead-notes-lead-ax-3"]').isVisible()
      },
    },
  ]
}
await guard('clicks', async () => {
  const results: Record<string, { before?: number; after?: number; okB?: boolean; okA?: boolean }> = {}
  for (const [which, base] of [['after', APP], ['before', APP_BEFORE]] as const) {
    if (!base) continue
    for (const g of gestures(which === 'after')) {
      const o = await open(1440)
      await go(o.page, '/coordinator', 3000, base)
      let n = 0
      const click = async (l: Locator) => {
        await l.click({ timeout: 15_000 })
        n++
        await o.page.waitForTimeout(450)
      }
      let ok = false
      try {
        ok = await g.run(o.page, o.db, click)
      } catch (e) {
        console.log(`  (${which} ${g.key} après ${n} clic(s) : ${(e as Error).message.split('\n')[0]})`)
        await o.page.screenshot({ path: `${SHOTS}/a354-echec-${which}-${g.key}.png` }).catch(() => undefined)
      }
      results[g.key] = { ...results[g.key], [which]: n, [which === 'after' ? 'okA' : 'okB']: ok }
      await o.ctx.close()
    }
  }
  const lines: string[] = []
  for (const g of gestures(true)) {
    const r = results[g.key] ?? {}
    lines.push(`| ${g.key} · ${g.label} | ${r.before ?? '—'}${r.okB === false ? ' ⚠' : ''} | ${r.after ?? '—'}${r.okA === false ? ' ⚠' : ''} |`)
    check(`A354 ${g.key} ${g.label} : le geste ABOUTIT après AX`, r.okA === true, `${r.after} clic(s)`)
    if (APP_BEFORE) check(`A354 ${g.key} : mesuré avant (${r.before}) et après (${r.after})`, r.okB === true && typeof r.after === 'number', `${r.before} → ${r.after}`)
  }
  const table = ['| Geste | Clics avant | Clics après |', '|---|---:|---:|', ...lines].join('\n')
  console.log(`\n${table}\n`)
  writeFileSync(`docs/ax/clics-${REMOTE ? 'deploye' : 'local'}.md`, `${table}\n`)
})

// ===========================================================================
section('Captures — clair et sombre, trois largeurs, les écrans touchés')
// ===========================================================================
await guard('captures', async () => {
  if (!CAPTURES) return
  const SCREENS: Array<[string, string, ((p: Page) => Promise<void>)?]> = [
    ['tableau-de-bord', '/coordinator'],
    ['rail-menu', '/coordinator', async (p) => void (await p.locator('[data-testid="shell-menu"]').click().catch(() => undefined))],
    ['contacts', '/coordinator/leads'],
    ['contacts-ouvert', '/coordinator/leads', async (p) => void (await p.locator('tr[data-row-key="lead-ax-1"] td').first().click().catch(() => undefined))],
    ['fermes', '/coordinator/farms'],
    ['fermes-tableau', '/coordinator/farms', async (p) => void (await p.locator('[data-testid="map-mode-hidden"]').click().catch(() => undefined))],
    ['institutions', '/coordinator/institutions'],
    ['volontaires', '/coordinator/volunteers'],
    ['chauffeurs', '/coordinator/drivers'],
    ['couverture', '/coordinator/coverage'],
    ['couverture-minutes', '/coordinator/coverage', async (p) => void (await p.locator('[data-testid="coverage-unit-min"]').click().catch(() => undefined))],
    ['tournee', '/coordinator/route?tour=tour-ax-today'],
    ['itineraire-libre', '/coordinator/route/free'],
    ['ajout-1-nom', '/coordinator/add'],
    ['ajout-3-type', '/coordinator/add', async (p) => {
      await p.locator('[data-testid="add-name"]').fill('משק דוגמה')
      await p.locator('[data-testid="add-kind-farm"]').click()
    }],
    ['aide-ouverte', '/coordinator/farms', async (p) => void (await p.locator('main [data-info-toggle]').first().click().catch(() => undefined))],
    ['reglages', '/coordinator/settings'],
  ]
  let n = 0
  for (const dark of [false, true]) {
    for (const w of [402, 1032, 1440]) {
      const o = await open(w, { dark })
      for (const [name, route, act] of SCREENS) {
        if (name === 'rail-menu' && w >= 1024) continue
        await go(o.page, route, 3000)
        if (act) {
          await act(o.page)
          await o.page.waitForTimeout(900)
        }
        await o.page.screenshot({ path: `${SHOTS}/${name}-${dark ? 'sombre' : 'clair'}-${w}.png` })
        n++
      }
      check(`captures ${dark ? 'sombres' : 'claires'} ${w} px : aucune erreur de page`, o.errors.length === 0, o.errors.join(' | '))
      await o.ctx.close()
    }
  }
  console.log(`  ${n} captures → ${SHOTS}`)
})

await browser?.close()
for (const s of serves) s.kill()
console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
