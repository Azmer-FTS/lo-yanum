import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'
import { INSTITUTIONS } from '../src/core/mock/institutions'
import type { Institution } from '../src/core/institutions'
import { AW_INSTITUTIONS } from './awdata'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AW — A329 → A342 AU RENDU.   (A329–A333 en pur : `bun run awpass`.)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run awui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run awui    # le DÉPLOYÉ
 *   CAPTURES=1 …                                                  # + captures clair/sombre × 3 largeurs
 *   ONLY=checks | ONLY=captures                                   # une moitié
 *
 * Le bundle est celui servi ; la base est factice (`FakeDb`) mais porte les
 * VRAIES lignes de fermes (`buildFarms`) et les ONZE institutions réelles de
 * la tournée (positions de `lo-yanum-prod`). Le réseau routier est l'archive
 * SERVIE (locale ou déployée) : le calcul se mesure là où le PO le fera.
 *
 * Le fichier réel du PO (`private/aw/*.vcf`, jamais commité : le dépôt est
 * public) sert A339/A340 quand il est sur le disque ; sinon la même forme,
 * numéro fictif (`docs/aw/fixtures/forme-reelle.vcf`).
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-awui'
const PORT = 5398
const CAPTURES = process.env.CAPTURES === '1'
const ONLY = process.env.ONLY ?? ''
const SHOTS = `docs/screenshots/awpass/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

const REAL_VCF = existsSync('private/aw/אריאל גדש עציון.vcf') ? 'private/aw/אריאל גדש עציון.vcf' : 'docs/aw/fixtures/forme-reelle.vcf'
const MULTI_VCF = 'docs/aw/fixtures/trois-contacts.vcf'
const DUP_VCF = 'docs/aw/fixtures/doublon.vcf'
/** Le numéro que porte la fiche (« +972 52-… ») en chiffres LOCAUX attendus. */
const REAL_DIGITS = `0${(/waid=972(\d+)/.exec(await Bun.file(REAL_VCF).text()) ?? ['', ''])[1]}`
const REAL_LOCAL = `${REAL_DIGITS.slice(0, 3)}-${REAL_DIGITS.slice(3, 6)}-${REAL_DIGITS.slice(6)}`

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
console.log(`  fiche réelle : ${REAL_VCF}`)

// --- Les données -------------------------------------------------------------

const { farms } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0]) as Array<Record<string, unknown>>
const TOUR: Institution[] = AW_INSTITUTIONS.map((i) => ({
  ...INSTITUTIONS[0],
  id: i.id,
  name: i.name,
  locality: '',
  engagement: 'signed',
  engagementConfirmed: true,
  position: { lat: i.lat, lng: i.lng },
  positionUncertain: false,
  contactName: '',
  contactPhone: '',
}))
const INST_ROWS = TOUR.map((i) => MAPPINGS.institutions.toRows(i)[0].rows[0])
const LEAD_DUP = { id: 'lead-aw-dup', name: 'רפת השקד', contact_name: 'שמעון', phone: '050-9998877', email: '', place: '', lat: null, lng: null, region_id: null, status: 'not_called', notes: '', source: 'paste', raw: '', rank: 0, converted_farm_id: null, converted_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }

function seed(db: FakeDb): void {
  db.seed()
  for (const r of ROWS) db.rows('entities').push({ ...r })
  for (const i of INST_ROWS) db.rows('institutions').push({ ...i })
  db.rows('leads').push({ ...LEAD_DUP })
}

const browsers: Record<string, Browser> = {}
async function engine(name: 'chromium' | 'webkit'): Promise<Browser> {
  if (!browsers[name]) browsers[name] = name === 'webkit' ? await webkit.launch() : await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
  return browsers[name]
}

interface Opened {
  ctx: BrowserContext
  page: Page
  db: FakeDb
  errors: string[]
}
async function open(width: number, opts: { dark?: boolean; height?: number; touch?: boolean; webkit?: boolean; db?: FakeDb } = {}): Promise<Opened> {
  const db = opts.db ?? new FakeDb()
  if (!opts.db) seed(db)
  const height = opts.height ?? (width >= 1300 ? 900 : width >= 1000 ? 1376 : 874)
  const touch = opts.touch ?? width < 700
  const b = await engine(opts.webkit ? 'webkit' : 'chromium')
  const ctx = await b.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: false, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: opts.dark ? 'dark' : 'light' })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('aw-init')) {
      localStorage.setItem('lo-yanum:theme:coordinator', 'system')
      sessionStorage.setItem('aw-init', '1')
    }
  })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, db, errors }
}
async function go(page: Page, hash: string, settle = 3500): Promise<void> {
  await page.goto(`${APP}/?aw=${Date.now()}#${hash}`, { waitUntil: 'load' })
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
async function meshDone(page: Page, timeout = 180_000): Promise<void> {
  await page.waitForFunction(() => {
    const m = document.querySelector('[data-testid="coverage-mesh"]')
    return !!m && m.getAttribute('data-running') === 'false' && m.getAttribute('data-pending') === '0'
  }, undefined, { timeout })
  await page.waitForTimeout(500)
}
const mesh = (page: Page) =>
  page.locator('[data-testid="coverage-mesh"]').evaluate((e) => ({
    air: Number(e.getAttribute('data-air')),
    road: Number(e.getAttribute('data-road')),
    dropped: Number(e.getAttribute('data-dropped')),
    blocked: Number(e.getAttribute('data-blocked')),
    beyond: Number(e.getAttribute('data-beyond')),
    lastMs: e.getAttribute('data-last-ms'),
    text: (e as HTMLElement).innerText.replace(/\s+/g, ' '),
  }))
const linkFeatures = (page: Page) =>
  page.evaluate(() => {
    const map = (window as unknown as { __loYanumMap?: { getSource(id: string): unknown } }).__loYanumMap
    const src = map?.getSource('coverage-links') as { serialize?: () => { data?: { features?: Array<{ properties: Record<string, unknown> }> } }; _data?: { features?: Array<{ properties: Record<string, unknown> }> } } | undefined
    const f = src?.serialize?.().data?.features ?? src?._data?.features ?? []
    return f.map((x) => ({ tone: String(x.properties.tone), label: String(x.properties.label) }))
  })
const PREFS = (km: number) => JSON.stringify({ radiusKm: km, visible: { signed: true, pipeline: true, leads: true, engaged: true, prospect: true } })

// ===========================================================================
section('A329 · A330 · A331 · A332 · A333 — le maillage routier, au rendu')
// ===========================================================================

await guard('A329', async () => {
  const o = await open(1440)
  await o.ctx.addInitScript((p: string) => localStorage.setItem('lo-yanum:coverage', p), PREFS(35))
  const t0 = Date.now()
  await go(o.page, '/coordinator/coverage', 500)
  // A332 — à froid : ni graphe ni mémoire sur l'appareil.
  await o.page.waitForSelector('[data-testid="coverage-mesh-progress"]', { timeout: 30_000 }).catch(() => null)
  const sawProgress = (await o.page.locator('[data-testid="coverage-mesh-progress"]').count()) > 0
  await meshDone(o.page)
  const coldWall = Date.now() - t0
  const m = await mesh(o.page)
  const inner = await o.page.evaluate(() => (window as unknown as { __loYanumMesh?: { ms: number; pairs: number; stats: { tiles: number; nodes: number } } }).__loYanumMesh ?? null)
  console.log(`  A332 froid : ${inner ? `${inner.ms} ms de calcul, ${inner.pairs} paires, ${inner.stats.tiles} tuiles, ${inner.stats.nodes} sommets` : '?'} · ${coldWall} ms de l'ouverture au maillage complet`)
  check('A332 la PROGRESSION s’affiche pendant le premier calcul', sawProgress)
  check('A332 premier calcul complet mesuré', !!inner && inner.ms > 0, inner ? `${inner.ms} ms` : 'aucune mesure')
  check('A329 le bilan dit la route ET le vol d’oiseau', m.road > 0 && m.air > m.road && m.dropped > 0 && /בכביש/.test(m.text) && /בקו אווירי/.test(m.text), m.text)
  const feats = await linkFeatures(o.page)
  check('A329 liens tracés = liens tenus par la route', feats.length === m.road, `${feats.length} tracés, ${m.road} par la route, ${m.air} au vol d’oiseau`)
  check('A330 chaque lien tracé porte « km · דק׳ »', feats.length > 0 && feats.every((f) => /\d+(\.\d)? ק״מ · \d+ דק׳/.test(f.label)), feats.slice(0, 2).map((f) => f.label).join(' | '))
  const rendered = await o.page.evaluate(() => {
    const map = (window as unknown as { __loYanumMap?: { queryRenderedFeatures(o: unknown): unknown[]; getLayer(id: string): unknown } }).__loYanumMap
    return { layer: !!map?.getLayer('coverage-links-label'), blockedLayer: !!map?.getLayer('coverage-links-blocked') }
  })
  check('A330 le calque d’étiquettes et le trait d’alerte existent', rendered.layer && rendered.blockedLayer, JSON.stringify(rendered))
  if (CAPTURES) await o.page.screenshot({ path: `${SHOTS}/a329-maillage-35km-1440.png` })

  // A331 — au rayon de 60 km, des trajets passent par la Ligne verte (Jérusalem).
  await o.page.locator('[data-testid="coverage-radius-number"]').fill('60')
  await o.page.waitForTimeout(600)
  await meshDone(o.page)
  const m60 = await mesh(o.page)
  const f60 = await linkFeatures(o.page)
  check('A331 un trajet au-delà de la Ligne verte est signalé', (m60.beyond > 0 || m60.blocked > 0) && (await o.page.locator('[data-testid="coverage-mesh-beyond"], [data-testid="coverage-mesh-blocked"]').count()) > 0, `${m60.beyond} « le plus rapide passe au-delà », ${m60.blocked} « au-delà seulement »`)
  check('A331 … et son lien porte « ⚠ »', f60.some((f) => f.label.startsWith('⚠')), `${f60.filter((f) => f.label.startsWith('⚠')).length} liens`)
  if (CAPTURES) await o.page.screenshot({ path: `${SHOTS}/a331-ligne-verte-60km-1440.png` })

  // A333 — aucun plafond.
  await o.page.locator('[data-testid="coverage-radius-number"]').fill('250')
  await o.page.waitForTimeout(600)
  const v = await o.page.locator('[data-testid="coverage-radius-value"]').innerText()
  const slider = await o.page.locator('[data-testid="coverage-radius-input"]').evaluate((e) => ({ max: (e as HTMLInputElement).max, value: (e as HTMLInputElement).value }))
  check('A333 rayon 250 km accepté, la réglette suit', v.includes('250') && Number(slider.max) >= 250 && slider.value === '250', `${v} · réglette ${slider.value}/${slider.max}`)
  await meshDone(o.page)
  const m250 = await mesh(o.page)
  check('A333 à 250 km, toutes les paires sont mesurées', m250.air >= m60.air && m250.road > m60.road, `${m250.road}/${m250.air}`)
  check('A329 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))

  // A332 — rouvert : la mémoire de l'appareil, rien n'est recalculé.
  await o.page.locator('[data-testid="coverage-radius-number"]').fill('35')
  const t1 = Date.now()
  await go(o.page, '/coordinator/coverage', 200)
  await meshDone(o.page, 30_000)
  const reopen = Date.now() - t1
  const mAgain = await mesh(o.page)
  const ran = await o.page.evaluate(() => (window as unknown as { __loYanumMesh?: unknown }).__loYanumMesh ?? null)
  console.log(`  A332 rouvert : maillage complet ${reopen} ms après l'ouverture (mémoire de l'appareil)`)
  check('A332 rouvert : aucune paire recalculée, même maillage', ran === null && mAgain.road === m.road, `${mAgain.road} = ${m.road}`)
  await o.ctx.close()
})

// ===========================================================================
section('A334 · A335 · A336 — le type d’abord, les trois chemins')
// ===========================================================================

await guard('A334', async () => {
  const o = await open(1440)
  await go(o.page, '/coordinator/add')
  const disabled = await o.page.locator('[data-testid="add-paths"]').evaluate((e) => (e as HTMLFieldSetElement).disabled)
  check('A334 avant le type : les trois chemins sont inactifs, l’écran dit pourquoi', disabled && (await o.page.locator('[data-testid="add-not-ready"]').count()) === 1)
  const paths = await o.page.locator('[data-testid="add-path-form"], [data-testid="add-path-files"], [data-testid="add-path-paste"]').count()
  check('A334 les trois chemins sur le même écran, nommés', paths === 3)
  check('A334 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
  // Le type s'applique aux trois chemins : une fiche par chemin, chacune au bon endroit.
  // (Une base neuve par type : les mêmes numéros seraient, à juste titre, des doublons.)
  for (const [kind, table] of [['farm', 'leads'], ['institution', 'institutions']] as const) {
    const o = await open(1440)
    await go(o.page, '/coordinator/add')
    await o.page.click(`[data-testid="add-kind-${kind}"]`)
    const before = o.db.rows(table).length
    await o.page.fill('[data-testid="add-form-first"]', kind === 'farm' ? 'אבי' : 'הרב')
    await o.page.fill('[data-testid="add-form-org"]', kind === 'farm' ? 'רפת הזית' : 'ישיבת הבדיקה')
    await o.page.click('[data-testid="add-form-save"]')
    await o.page.waitForTimeout(300)
    await o.page.setInputFiles('[data-testid="add-files-input"]', [MULTI_VCF])
    await o.page.waitForTimeout(300)
    await o.page.fill('[data-testid="add-paste-text"]', kind === 'farm' ? 'רון גד״ש הנגב 050-4445566' : 'יעקב מכינת הדרום 050-4445567')
    await o.page.click('[data-testid="add-paste-read"]')
    await o.page.waitForTimeout(300)
    await o.page.click('[data-testid="add-create"]')
    await o.page.waitForTimeout(2500)
    const after = o.db.rows(table).length
    check(`A334 « ${kind} » : saisie + fichier + collage → ${table}`, after - before === 5, `${before} → ${after}`)
    check(`A334 « ${kind} » : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
})

await guard('A335', async () => {
  const o = await open(1032, { touch: true })
  await go(o.page, '/coordinator/add?type=volunteer')
  const disabled = await o.page.locator('[data-testid="add-paths"]').evaluate((e) => (e as HTMLFieldSetElement).disabled)
  check('A335 volontaires : rien avant l’institution', disabled)
  await o.page.click('[data-testid="add-institution-new"]')
  await o.page.fill('[data-testid="add-institution-new-name"]', 'מכינת עין הבשור')
  await o.page.click('[data-testid="add-institution-create"]')
  await o.page.waitForTimeout(2000)
  const inst = o.db.rows('institutions').find((r) => r.name === 'מכינת עין הבשור')
  check('A335 institution créée SANS quitter l’écran', !!inst && o.page.url().includes('/coordinator/add'), inst ? String(inst.id) : 'absente')
  await o.page.setInputFiles('[data-testid="add-files-input"]', [MULTI_VCF, REAL_VCF])
  await o.page.waitForTimeout(500)
  const n = await o.page.locator('[data-testid="add-draft"][data-on="true"]').count()
  await o.page.click('[data-testid="add-create"]')
  await o.page.waitForTimeout(2500)
  const vols = o.db.rows('volunteers').filter((r) => r.institution_id === inst?.id)
  check('A335 tout le lot rattaché EN UNE FOIS à l’institution', n === 4 && vols.length === 4 && vols.every((v) => v.yeshiva === 'מכינת עין הבשור'), `${vols.length}/${n}`)
  const ariel = vols.find((v) => String(v.name).startsWith('אריאל'))
  check('A335 un volontaire n’hérite pas d’une exploitation dans son nom', !!ariel && ariel.name === 'אריאל', ariel ? String(ariel.name) : '—')
  await o.ctx.close()
})

await guard('A336', async () => {
  const o = await open(402, { touch: true })
  await go(o.page, '/coordinator/add?type=farm')
  check('A336 sans nom, « שמירה » est éteint', await o.page.locator('[data-testid="add-form-save"]').isDisabled())
  await o.page.fill('[data-testid="add-form-org"]', 'חוות רק שם')
  check('A336 un nom seul suffit', await o.page.locator('[data-testid="add-form-save"]').isEnabled())
  const forms: Array<[string, string, number, number]> = [
    ['Waze', 'https://waze.com/ul?ll=31.42140%2C34.58820&navigate=yes', 31.4214, 34.5882],
    ['Google Maps', 'https://www.google.com/maps/place/X/@31.40,34.50,14z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d31.38123!4d34.61234', 31.38123, 34.61234],
    ['coordonnées', '31.33333, 34.59501', 31.33333, 34.59501],
  ]
  for (const [label, text, lat, lng] of forms) {
    await o.page.fill('[data-testid="add-form-org"]', `חוות ${label}`)
    await o.page.fill('[data-testid="add-form-location"]', text)
    await o.page.waitForTimeout(200)
    const echo = await o.page.locator('[data-testid="add-location-ok"]').count()
    await o.page.click('[data-testid="add-form-save"]')
    await o.page.waitForTimeout(1500)
    const row = o.db.rows('leads').find((r) => r.name === `חוות ${label}`)
    check(`A336 ${label} reconnu et épinglé`, echo === 1 && !!row && Math.abs(Number(row.lat) - lat) < 1e-4 && Math.abs(Number(row.lng) - lng) < 1e-4, row ? `${row.lat}, ${row.lng}` : 'rien')
  }
  await o.page.fill('[data-testid="add-form-org"]', 'חוות רק שם')
  await o.page.click('[data-testid="add-form-save"]')
  await o.page.waitForTimeout(1500)
  check('A336 une fiche avec SEULEMENT un nom est créée', o.db.rows('leads').some((r) => r.name === 'חוות רק שם' && r.phone === '' && r.lat === null))
  await o.page.fill('[data-testid="add-form-location"]', 'https://maps.app.goo.gl/AbCdEf')
  check('A336 un lien raccourci est DIT, pas deviné', (await o.page.locator('[data-testid="add-location-bad"][data-reason="shortLink"]').count()) === 1)
  await o.ctx.close()
})

// ===========================================================================
section('A337 → A342 — les fiches .vcf')
// ===========================================================================

await guard('A337', async () => {
  const o = await open(1440)
  await go(o.page, '/coordinator/add?type=farm')
  await o.page.setInputFiles('[data-testid="add-files-input"]', [REAL_VCF, MULTI_VCF, DUP_VCF])
  await o.page.waitForTimeout(600)
  const rep = await o.page.locator('[data-testid="add-files-report"]').evaluate((e) => ({ files: e.getAttribute('data-files'), contacts: e.getAttribute('data-contacts') }))
  check('A337 trois fichiers d’un coup → cinq fiches lues', rep.files === '3' && rep.contacts === '5', JSON.stringify(rep))
  const rows = await o.page.locator('[data-testid="add-draft"]').evaluateAll((els) => els.map((e) => ({ org: e.getAttribute('data-org'), dup: e.getAttribute('data-dup'), on: e.getAttribute('data-on') })))
  const dup = rows.find((r) => r.dup)
  check('A337 le doublon est signalé et décoché', !!dup && dup.on === 'false' && dup.dup === 'lead', JSON.stringify(dup))
  check('A337 rien n’est écrit avant « הוספה »', o.db.rows('leads').length === 1)
  if (CAPTURES) await o.page.screenshot({ path: `${SHOTS}/a337-apercu-1440.png`, fullPage: true })
  const before = o.db.rows('leads').length
  await o.page.click('[data-testid="add-create"]')
  await o.page.waitForTimeout(2500)
  const created = o.db.rows('leads').slice(before)
  check('A337 autant de fiches que de cochées (4), le doublon non', created.length === 4, `${created.length}`)
  check('A338 un .vcf à trois contacts les crée tous', ['משק כהן', 'חוות הגבעה', 'משה'].every((n) => created.some((r) => r.name === n)), created.map((r) => r.name).join(' · '))
  const a = created.find((r) => r.name === 'גד״ש עציון')
  check('A339 le fichier réel : אריאל = contact, גד״ש עציון = exploitation', !!a && a.contact_name === 'אריאל', a ? `${a.name} / ${a.contact_name}` : 'absent')
  check('A339 jamais un contact nommé « אריאל גדש עציון »', !o.db.rows('leads').some((r) => r.name === 'אריאל גדש עציון' || r.contact_name === 'אריאל גדש עציון'))
  check(`A340 +972 … → numéro local ${REAL_LOCAL}`, !!a && String(a.phone).replace(/\D/g, '') === REAL_DIGITS, a ? String(a.phone) : '')
  check('A340 source « vcf »', !!a && a.source === 'vcf')
  const waze = created.find((r) => r.name === 'משה')
  check('A338 un lien Waze dans la fiche pose l’épingle', !!waze && Math.abs(Number(waze.lat) - 31.4214) < 1e-4)
  const adr = created.find((r) => r.name === 'חוות הגבעה')
  check('A338 une adresse exploitable pose l’épingle (centre de la localité)', !!adr && adr.lat !== null && adr.place === 'נתיבות', adr ? `${adr.place} ${adr.lat}` : '')
  await o.ctx.close()
})

await guard('A341', async () => {
  const o = await open(1032, { touch: true })
  await go(o.page, '/coordinator/add?type=farm')
  await o.page.setInputFiles('[data-testid="add-files-input"]', [REAL_VCF])
  await o.page.waitForTimeout(500)
  const row = o.page.locator('[data-testid="add-draft"]').first()
  const shown = await row.locator('[data-testid="add-draft-phone"]').innerText()
  check(`A340 l’aperçu affiche ${REAL_LOCAL}`, shown.replace(/[^\d-]/g, '') === REAL_LOCAL, shown)
  // Un geste : toucher « עציון » → l'exploitation ne commence qu'à ce mot.
  await row.locator('[data-testid="add-draft-token-2"]').click()
  check('A341 un toucher déplace la limite personne / exploitation', (await row.getAttribute('data-first')) === 'אריאל' && (await row.getAttribute('data-last')) === 'גדש' && (await row.getAttribute('data-org')) === 'עציון', `${await row.getAttribute('data-first')} | ${await row.getAttribute('data-last')} | ${await row.getAttribute('data-org')}`)
  await row.locator('[data-testid="add-draft-token-1"]').click()
  check('A341 … et revient d’un autre toucher', (await row.getAttribute('data-org')) === 'גד״ש עציון')
  // Un nom FAUX : corrigé avant écriture.
  await row.locator('[data-testid="add-draft-edit-toggle"]').click()
  await row.locator('[data-testid="add-draft-first"]').fill('אריאלי')
  await row.locator('[data-testid="add-draft-org"]').fill('גד״ש עציון החדש')
  if (CAPTURES) await o.page.screenshot({ path: `${SHOTS}/a341-correction-1032.png`, fullPage: true })
  await o.page.click('[data-testid="add-create"]')
  await o.page.waitForTimeout(2500)
  const r = o.db.rows('leads').find((x) => x.name === 'גד״ש עציון החדש')
  check('A341 le nom corrigé est celui écrit', !!r && r.contact_name === 'אריאלי', r ? `${r.name} / ${r.contact_name}` : 'absent')
  // Retirer une ligne.
  await o.page.setInputFiles('[data-testid="add-files-input"]', [MULTI_VCF])
  await o.page.waitForTimeout(400)
  await o.page.locator('[data-testid="add-draft-remove"]').first().click()
  check('A341 une ligne se retire', (await o.page.locator('[data-testid="add-draft"]').count()) === 2)
  await o.ctx.close()
})

await guard('A342', async () => {
  // iPad : WebKit, tactile, 1032 × 1376 — par le SÉLECTEUR, plusieurs fichiers.
  const o = await open(1032, { touch: true, webkit: true })
  await go(o.page, '/coordinator/add?type=farm')
  const accept = await o.page.locator('[data-testid="add-files-input"]').evaluate((e) => ({ multiple: (e as HTMLInputElement).multiple, accept: (e as HTMLInputElement).accept }))
  check('A342 sélecteur : plusieurs fichiers, .vcf accepté', accept.multiple && accept.accept.includes('.vcf'), JSON.stringify(accept))
  await o.page.setInputFiles('[data-testid="add-files-input"]', [REAL_VCF, MULTI_VCF])
  await o.page.waitForTimeout(800)
  check('A342 WebKit (iPad) : deux fichiers par le sélecteur → quatre fiches', (await o.page.locator('[data-testid="add-draft"]').count()) === 4)
  const btn = await o.page.locator('[data-testid="add-files-input"]').evaluate((e) => (e.closest('label') as HTMLElement).getBoundingClientRect().height)
  check('A342 le bouton de sélection fait au moins 44 px', btn >= 44, `${Math.round(btn)} px`)
  await o.ctx.close()
  // Ordinateur : le glisser-déposer (événement `drop` avec de vrais fichiers).
  const d = await open(1440)
  await go(d.page, '/coordinator/add?type=farm')
  const text = await Bun.file(MULTI_VCF).text()
  await d.page.evaluate((content) => {
    const dt = new DataTransfer()
    dt.items.add(new File([content], 'a.vcf', { type: 'text/vcard' }))
    dt.items.add(new File([content.replace(/050-111-2233/g, '050-111-2299').replace(/2223344/g, '2223399').replace(/333-4455/g, '333-4499')], 'b.vcf', { type: 'text/vcard' }))
    const zone = document.querySelector('[data-testid="add-files-drop"]')!
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
  }, text)
  await d.page.waitForTimeout(800)
  check('A342 ordinateur : deux fichiers déposés → six fiches', (await d.page.locator('[data-testid="add-draft"]').count()) === 6)
  check('A342 aucune erreur de page', d.errors.length === 0, d.errors.slice(0, 2).join(' | '))
  await d.ctx.close()
})

// ===========================================================================
// Captures du déployé : clair et sombre × 402 / 1032 / 1440
// ===========================================================================

await guard('captures', async () => {
  section('captures — maillage routier et écran d’ajout')
  let shots = 0
  for (const dark of [false, true]) {
    for (const width of [402, 1032, 1440]) {
      const tag = `${dark ? 'sombre' : 'clair'}-${width}`
      const o = await open(width, { dark })
      await o.ctx.addInitScript((p: string) => localStorage.setItem('lo-yanum:coverage', p), PREFS(35))
      await go(o.page, '/coordinator/coverage', 1000)
      await meshDone(o.page).catch(() => null)
      await o.page.waitForTimeout(2500)
      await o.page.screenshot({ path: `${SHOTS}/maillage-${tag}.png` })
      shots++
      await go(o.page, '/coordinator/add?type=farm', 1500)
      await o.page.fill('[data-testid="add-form-first"]', 'אבי')
      await o.page.fill('[data-testid="add-form-location"]', 'https://waze.com/ul?ll=31.42140%2C34.58820&navigate=yes')
      await o.page.setInputFiles('[data-testid="add-files-input"]', [REAL_VCF, MULTI_VCF, DUP_VCF])
      await o.page.fill('[data-testid="add-paste-text"]', 'רון גד״ש הנגב 050-4445566')
      await o.page.waitForTimeout(800)
      await o.page.screenshot({ path: `${SHOTS}/ajout-${tag}.png`, fullPage: true })
      shots++
      check(`capture ${tag} : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 1).join(''))
      await o.ctx.close()
    }
  }
  console.log(`  ${shots} captures → ${SHOTS}`)
})

for (const b of Object.values(browsers)) await b.close()
serve?.kill()
console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
