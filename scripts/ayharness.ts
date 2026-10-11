import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdirSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'
import { INSTITUTIONS } from '../src/core/mock/institutions'
import type { Institution } from '../src/core/institutions'
import { AW_INSTITUTIONS } from './awdata'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AY — LE HARNAIS COMMUN DES PORTES `ayui` (build réel + base factice).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Même principe qu'`axui` : le bundle est celui servi (build local, ou le
 * DÉPLOYÉ avec `BASE_URL`), la base est factice (`FakeDb`) mais porte les
 * VRAIES fermes (`buildFarms`) et les onze institutions réelles. Rien n'est
 * écrit sur `lo-yanum-prod`.
 */

export const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
export const ONLY = process.env.ONLY ?? ''
export const CAPTURES = process.env.CAPTURES === '1'

let passed = 0
let failed = 0
export function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
export function section(title: string): void {
  console.log(`\n  ${title}\n  ${'-'.repeat(title.length)}`)
}
export function tally(): { passed: number; failed: number } {
  return { passed, failed }
}

const env = { ...process.env, VITE_SUPABASE_URL: 'https://fake.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_gate' }
const serves: Array<ReturnType<typeof Bun.spawn>> = []
export async function serveBuild(dir: string, port: number, build: boolean): Promise<string> {
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

// --- Les données -------------------------------------------------------------

export const { farms } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0]) as Array<Record<string, unknown>>
export const TOUR: Institution[] = AW_INSTITUTIONS.map((i, n) => ({
  ...INSTITUTIONS[0],
  id: i.id,
  name: i.name,
  locality: '',
  engagement: n % 3 === 2 ? 'contacted' : 'signed',
  engagementConfirmed: n % 4 !== 1,
  position: { lat: i.lat, lng: i.lng },
  positionUncertain: false,
  contactName: n === 0 ? 'רב בדיקה' : '',
  contactPhone: n === 0 ? '050-0000301' : '',
  /* ★★ AZ5 — la forme de la base depuis AZ5 : le contact affiché est le rang 1. */
  contacts: n === 0 ? [{ id: 'ic-ay-1', role: 'head' as const, name: 'רב בדיקה', phone: '050-0000301', note: '' }] : [],
}))
const INST_ROWS = TOUR.map((i) => MAPPINGS.institutions.toRows(i)[0].rows[0])
const now = new Date().toISOString()
export const LEADS = [
  { id: 'lead-ay-1', name: 'משק אלון', contact_name: 'אבי אלון', phone: '050-0000401', status: 'not_called' },
  { id: 'lead-ay-2', name: 'רפת בית', contact_name: 'דנה', phone: '050-0000402', status: 'no_answer' },
  { id: 'lead-ay-3', name: 'גידולי זיו', contact_name: 'זיו', phone: '050-0000403', status: 'call_back' },
].map((l, i) => ({ ...l, email: '', place: 'נתיבות', lat: i === 0 ? 31.42 : i === 1 ? 31.30 : null, lng: i === 0 ? 34.59 : i === 1 ? 34.62 : null, region_id: null, notes: '', source: 'paste', raw: '', rank: i, converted_farm_id: null, converted_at: null, created_at: new Date(Date.now() - i * 86_400_000).toISOString(), updated_at: now }))

export const VOLUNTEERS = [
  { id: 'vol-ay-1', name: 'יוסף כהן', phone: '050-0000501', institution_id: TOUR[0].id, can_drive: true, has_car: true, has_license: true },
  { id: 'vol-ay-2', name: 'דוד לוי', phone: '050-0000502', institution_id: TOUR[0].id, can_drive: false, has_car: false, has_license: false },
  { id: 'vol-ay-3', name: 'משה פרץ', phone: '050-0000503', institution_id: TOUR[2].id, can_drive: true, has_car: false, has_license: true },
].map((v) => ({ ...v, age: 19, phone_type: 'smartphone', yeshiva: '', locality: '', guards_count: 0, status: 'active', inactive_reason: null, notes: '', last_activity_at: null, photo: null, avail_nights: true, avail_days: false, avail_weekends: false, avail_excluded: [], email: '', created_at: now, updated_at: now }))

export function seed(db: FakeDb): void {
  db.seed()
  for (const r of ROWS) db.rows('entities').push({ ...r })
  for (const i of INST_ROWS) db.rows('institutions').push({ ...i })
  for (const l of LEADS) db.rows('leads').push({ ...l })
  for (const v of VOLUNTEERS) db.rows('volunteers').push({ ...v })
}

let browser: Browser | null = null
let closing = false
export async function engine(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
    browser.on('disconnected', () => closing || console.log('  ⚠ navigateur de test DÉCONNECTÉ'))
  }
  return browser
}

export interface Opened {
  ctx: BrowserContext
  page: Page
  db: FakeDb
  errors: string[]
}
export async function open(
  width: number,
  opts: { dark?: boolean; height?: number; db?: FakeDb; numpad?: boolean; touch?: boolean; init?: Record<string, string> } = {},
): Promise<Opened> {
  const db = opts.db ?? new FakeDb()
  if (!opts.db) seed(db)
  const height = opts.height ?? (width >= 1300 ? 900 : width >= 1000 ? 1376 : 874)
  const b = await engine()
  const ctx = await b.newContext({
    viewport: { width, height },
    hasTouch: opts.touch ?? width < 700,
    isMobile: false,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: opts.dark ? 'dark' : 'light',
  })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  const init = { 'lo-yanum:theme:coordinator': 'system', ...(opts.numpad ? { 'lo-yanum:numpad': 'on' } : {}), ...(opts.init ?? {}) }
  await ctx.addInitScript((pairs: Record<string, string>) => {
    if (!sessionStorage.getItem('ay-init')) {
      for (const [k, v] of Object.entries(pairs)) localStorage.setItem(k, v)
      sessionStorage.setItem('ay-init', '1')
    }
  }, init)
  const page = await ctx.newPage()
  /* ★ AZ — `PW_TIMEOUT` : sur une machine à court de mémoire (8 Go, échange
     plein, le 2026-10-11), 8 s mesuraient l'engorgement et non l'app. Le
     défaut reste 8 s ; un délai plus long n'attend que l'ÉLÉMENT. */
  page.setDefaultTimeout(Number(process.env.PW_TIMEOUT ?? 8000))
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('crash', () => console.log('  ⚠ onglet PLANTÉ'))
  return { ctx, page, db, errors }
}

export async function go(page: Page, base: string, hash: string, settle = 3000): Promise<void> {
  await page.goto(`${base}/?ay=${Date.now()}#${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

export async function guard(label: string, run: () => Promise<void>): Promise<void> {
  const kind = label.startsWith('capture') ? 'captures' : 'checks'
  if (ONLY && ONLY !== kind && ONLY !== label) return
  try {
    await run()
  } catch (e) {
    const m = (e as Error).message.split('\n')
    const w = m.find((l) => /waiting for|locator\(/.test(l))
    check(`${label} — section interrompue`, false, m[0] + (w ? ` · ${w.trim()}` : ''))
  }
}

export async function finish(): Promise<never> {
  closing = true
  await browser?.close()
  for (const s of serves) s.kill()
  console.log(`\n  ${passed} PASS, ${failed} FAIL`)
  process.exit(failed === 0 ? 0 : 1)
}

export function shots(dir: string): string {
  const out = `docs/screenshots/aypass/${REMOTE ? 'deployed' : 'local'}/${dir}`
  mkdirSync(out, { recursive: true })
  return out
}
