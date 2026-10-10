import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'

import { LEADS } from '../src/core/mock/leads'
import { MAPPINGS } from '../src/data/rows'
import { buildFarms } from './aodata'
import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS8 — LA PORTE D'INTERFACE. A286 · A291 · A292 · A293 · A294 · A295 · A297
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run asui                                               # build local, mode réel, FakeDb
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run asui # le DÉPLOYÉ
 *   CAPTURES=1 …                                               # + captures clair/sombre × 3 largeurs
 *
 * Le bundle est celui servi ; la base est `FakeDb`, peuplée dans la FORME
 * EXACTE des lignes de `lo-yanum-prod` (par `MAPPINGS`), avec une fiche qui
 * porte une signature importée et un contrat de terre recopié.
 * (A284–A285, A287–A288, A290, A296 : pures, `bun run aspass` ; A289 :
 * `bun run assettings`.)
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-asui'
const PORT = 5395
const SHOTS = `docs/screenshots/aspass/${REMOTE ? 'deployed' : 'local'}`
const CAPTURES = process.env.CAPTURES === '1'
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
async function guard(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    check(`${label} — section interrompue`, false, (e as Error).message.split('\n')[0])
  }
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

// --- Les données ------------------------------------------------------------

const { farms } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0])
const DOC_FARM = String(ROWS[1].id)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const LEAD_ROWS = LEADS.map((l) => MAPPINGS.leads.toRows(l)[0].rows[0])

function seed(db: FakeDb): void {
  db.seed()
  for (const r of ROWS) db.rows('entities').push({ ...r })
  const doc = db.rows('entities').find((r) => r.id === DOC_FARM)!
  doc.signature = PNG
  doc.signature_origin = JSON.stringify({ kind: 'imported', signedAt: null, fileName: 'portal.csv', importedAt: '2026-10-07T12:00:00.000Z' })
  doc.land_documents = [
    { id: 'land-gate', source: 'portal', url: 'https://8232-application-data-2273.s3.amazonaws.com/x/contract.pdf', fileName: 'contract.pdf', addedAt: '2026-10-07T12:00:00.000Z', status: 'stored', storageKey: `land/${DOC_FARM}/land-gate.pdf`, size: 1234, error: null },
  ]
  for (const r of LEAD_ROWS) db.rows('leads').push({ ...r })
}

const browser: Browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })

async function open(viewport: { width: number; height: number }, opts: { dark?: boolean; touch?: boolean; db?: FakeDb } = {}) {
  const db = opts.db ?? new FakeDb()
  if (!opts.db) seed(db)
  const ctx: BrowserContext = await browser.newContext({
    viewport,
    hasTouch: opts.touch ?? false,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: opts.dark ? 'dark' : 'light',
  })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  await ctx.addInitScript(() => localStorage.setItem('lo-yanum:theme:coordinator', 'system'))
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, db, errors }
}

async function go(page: Page, hash: string, settle = 4500): Promise<void> {
  await page.goto(`${APP}/?as=${Date.now()}#${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

const WIDTHS = [
  { width: 402, height: 874 },
  { width: 1032, height: 1376 },
  { width: 1376, height: 1032 },
]
const FARM = String(ROWS[0].id)

// --- A291 — l'en-tête épinglé et les onglets --------------------------------

section('A291 — en-tête épinglé aux trois largeurs ; onglets ; onglet retenu')
for (const vp of WIDTHS) {
  await guard(`A291 @${vp.width}`, async () => {
    const { ctx, page, errors } = await open(vp)
    await go(page, `/coordinator/farms/${FARM}`)
    const header = page.locator('[data-testid="farm-sticky"]')
    check(`@${vp.width} · l’en-tête de fiche existe, avec le nom`, (await header.locator('[data-page-title]').innerText()).trim().length > 0)
    check(`@${vp.width} · … le nom de l’agriculteur`, (await header.locator('[data-page-title] + p').innerText()).length > 0)
    check(`@${vp.width} · … les actions`, (await header.locator('[data-testid="sheet-actions"]').count()) === 1)
    check(`@${vp.width} · … et six onglets (role=tab)`, (await header.locator('[role="tab"]').count()) === 6)
    /* Défiler le panneau de contenu loin, puis mesurer. */
    await page.mouse.move(vp.width * (vp.width >= 1280 ? 0.7 : 0.5), vp.height * 0.8)
    await page.mouse.wheel(0, 2500)
    await page.waitForTimeout(700)
    const box = await header.boundingBox()
    const covered = box
      ? await page.evaluate(
          ({ x, y }) => {
            const el = document.elementFromPoint(x, y)
            return !!el?.closest('[data-testid="farm-sticky"]')
          },
          { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        )
      : false
    check(`@${vp.width} · après défilement, l’en-tête est À L’ÉCRAN, en haut`, !!box && box.y >= 0 && box.y < vp.height * 0.6, box ? `y=${Math.round(box.y)} h=${Math.round(box.height)}` : 'absent')
    check(`@${vp.width} · … et rien ne le recouvre`, covered)
    /* Les onglets découpent : un seul panneau visible. */
    await page.click('[data-testid="farm-tab-people"]')
    await page.waitForTimeout(400)
    const visible = await page.$$eval('[role="tabpanel"]', (ps) => ps.filter((p) => (p as HTMLElement).offsetParent !== null).map((p) => p.id))
    check(`@${vp.width} · « אנשים » : seul son panneau est visible`, visible.length === 1 && visible[0] === 'farm-panel-people', visible.join(','))
    check(`@${vp.width} · le bloc « אנשים » y est`, await page.locator('#farm-panel-people [data-block="entity-contacts"]').isVisible())
    check(`@${vp.width} · les blocs des autres onglets restent dans la page (A217)`, (await page.locator('[data-block="entity-posts"]').count()) === 1)
    /* Retenu : quitter, revenir. */
    await go(page, '/coordinator/farms', 2000)
    await go(page, `/coordinator/farms/${FARM}`, 3000)
    check(`@${vp.width} · revenir sur la fiche rouvre « אנשים »`, (await page.locator('[data-testid="farm-tab-people"]').getAttribute('aria-selected')) === 'true')
    await go(page, `/coordinator/farms/${ROWS[2].id}`, 3000)
    check(`@${vp.width} · une AUTRE fiche s’ouvre sur « החווה »`, (await page.locator('[data-testid="farm-tab-farm"]').getAttribute('aria-selected')) === 'true')
    check(`@${vp.width} · aucune erreur de page`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  })
}

// --- A286 (écran) — signature et contrat dans « מסמכים » ---------------------

section('A286 — la signature importée et le contrat de terre, dans « מסמכים »')
await guard('A286', async () => {
  const { ctx, page } = await open(WIDTHS[1])
  await go(page, `/coordinator/farms/${DOC_FARM}?tab=docs`)
  check('le contrat recopié est listé, « שמור באפליקציה »', (await page.locator('[data-testid="land-doc-land-gate"]').getAttribute('data-status')) === 'stored')
  check('la signature importée du portail est montrée', (await page.locator('#farm-panel-docs [data-testid="imported-signature"], #farm-panel-docs [data-testid="signature-image"]').count()) >= 1)
  await ctx.close()
})

// --- A292 · A293 · A294 · A295 — la salle d'attente --------------------------

const BLOCK = ['משה בדיקה 050-7000001 נתיבות', 'דנה בדיקה - 0527000002 - משק בדיקה בשדרות', '+972 54 700 0003 יוסי מאופקים', 'רפת בדיקה', '052 700 0004', 'BEGIN:VCARD', 'VERSION:3.0', 'FN:אבי בדיקה', 'TEL;type=CELL;waid=972507000005:+972 50-700-0005', 'END:VCARD'].join('\n')

section('A292 — un bloc collé de plusieurs contacts crée autant de pistes')
await guard('A292', async () => {
  const { ctx, page, db } = await open(WIDTHS[1])
  await go(page, '/coordinator/leads')
  const before = await page.locator('[data-lead-id]').count()
  /* ★ AW2 — le collage vit sur l'écran d'ajout, ouvert type « חווה » depuis
     la salle d'attente. Même bloc, même résultat attendu. */
  /* ★★ AX10 — le « + » de la salle d'attente ouvre l'écran d'ajout, type
     « חקלאי » déjà dit ; la source « הדבקה » se choisit d'un toucher. */
  await page.click('[data-testid="action-fab-toggle"]')
  await page.waitForTimeout(800)
  await page.click('[data-testid="add-source-paste"]')
  await page.click('[data-testid="add-kind-farm"]')
  await page.fill('[data-testid="add-paste-text"]', BLOCK)
  await page.click('[data-testid="add-paste-read"]')
  await page.waitForTimeout(300)
  const rows = await page.locator('[data-testid="add-draft"]').count()
  check('l’aperçu montre cinq contacts', rows === 5, String(rows))
  await page.click('[data-testid="add-create"]')
  await page.waitForTimeout(2500)
  await go(page, '/coordinator/leads')
  const after = await page.locator('[data-lead-id]').count()
  check('cinq lignes de plus dans la liste', after === before + 5, `${before} → ${after}`)
  check('… et cinq lignes de plus dans `leads` (base)', db.rows('leads').length === LEAD_ROWS.length + 5, String(db.rows('leads').length))
  check('aucune ferme créée par le collage', db.rows('entities').length === ROWS.length)
  if (CAPTURES) await page.screenshot({ path: `${SHOTS}/as6-apres-collage-1032.png` })
  await ctx.close()
})

section('A293 — statut en un geste (AT2 : la liste remplace les colonnes, `atui` A301)')
await guard('A293', async () => {
  const { ctx, page, db } = await open(WIDTHS[1], { touch: true })
  await go(page, '/coordinator/leads')
  const id = String(LEAD_ROWS[0].id)
  /* ★ AT2 — le statut est un sélecteur segmenté sur la ligne : UN toucher. */
  await page.click(`[data-testid="lead-status-${id}-call_back"]`)
  await page.waitForTimeout(500)
  check('le statut change d’un geste', (await page.locator(`[data-testid="lead-${id}"]`).getAttribute('data-status')) === 'call_back')
  const seg = await page.locator(`[data-testid="lead-status-${id}-meeting_set"]`).boundingBox()
  check('chaque case fait au moins 44 px de haut', !!seg && seg.height >= 43.5, seg ? `${seg.width}×${seg.height}` : '')
  await page.waitForTimeout(2000)
  const row = db.rows('leads').find((r) => r.id === id)
  check('… et la base le sait', row?.status === 'call_back', String(row?.status))
  await ctx.close()
})

section('A294 — une piste devient une ferme sans ressaisie, et quitte la salle d’attente')
await guard('A294', async () => {
  const { ctx, page, db } = await open(WIDTHS[1])
  await go(page, '/coordinator/leads')
  const lead = LEADS[0]
  /* ★ AT2.1 — la conversion passe par « ⋯ » et une CONFIRMATION, puis on
     ouvre la fiche par le bandeau. */
  await page.click(`[data-testid="lead-menu-${lead.id}-toggle"]`)
  await page.click(`[data-testid="lead-convert-${lead.id}"]`)
  await page.click('[data-testid="leads-confirm-ok"]')
  await page.waitForTimeout(1500)
  await page.locator('[data-testid="leads-toast"] button').first().click()
  await page.waitForTimeout(2500)
  check('on arrive sur la fiche de la nouvelle ferme', /#\/coordinator\/farms\/farm-/u.test(page.url()), page.url())
  check('la fiche porte le nom de la piste', (await page.locator('[data-page-title]').innerText()).includes(lead.name))
  const farm = db.rows('entities').find((r) => r.name === lead.name)
  check('… en base : téléphone, personne, lieu, point, sans ressaisie', !!farm && farm.farmer_phone === lead.phone && farm.farmer_name === lead.contactName && farm.locality === lead.place && farm.lat === lead.position?.lat, JSON.stringify(farm ? { p: farm.farmer_phone, n: farm.farmer_name, l: farm.locality } : null))
  await go(page, '/coordinator/leads')
  check('la piste n’est plus dans la salle d’attente', (await page.locator(`[data-lead-id="${lead.id}"]`).count()) === 0)
  check('elle garde la trace de sa ferme (base)', !!db.rows('leads').find((r) => r.id === lead.id)?.converted_farm_id)
  const refused = LEADS[3]
  /* ★★ AX5 — « לא רלוונטי » : le ⋯ de la ligne en grand écran. */
  await page.click(`[data-testid="lead-menu-${refused.id}-toggle"]`)
  await page.click(`[data-testid="lead-notnow-${refused.id}"]`)
  await page.waitForTimeout(400)
  check('une piste « לא רלוונטי » RESTE, marquée (sur place jusqu’au prochain onglet)', (await page.locator(`[data-testid="lead-${refused.id}"]`).getAttribute('data-status')) === 'not_now')
  await ctx.close()
})

section('A295 — un rendez-vous posé depuis une piste apparaît dans l’agenda')
await guard('A295', async () => {
  const { ctx, page, db } = await open(WIDTHS[1])
  await go(page, '/coordinator/leads')
  const lead = LEADS[1]
  await page.click(`[data-testid="lead-menu-${lead.id}-toggle"]`)
  await page.click(`[data-testid="lead-meeting-${lead.id}"]`)
  await page.waitForTimeout(1200)
  const m = await page.evaluate(() => ({ hash: location.hash, dialog: document.querySelectorAll('[role="dialog"]').length }))
  check('le rendez-vous s’ouvre en PAGE (AN11), pas en fenêtre', /agenda\/meeting\/new\?lead=/u.test(m.hash) && m.dialog === 0, JSON.stringify(m))
  check('… pré-rempli depuis la piste', (await page.locator('input').first().inputValue()).includes(lead.name))
  await page.locator('[data-testid="meeting-save"]').click()
  await page.waitForTimeout(2500)
  const meeting = db.rows('general_meetings').find((r) => r.lead_id === lead.id)
  check('la rencontre est en base, liée à la piste', !!meeting, meeting ? String(meeting.title) : 'aucune')
  await go(page, '/coordinator/leads', 3000)
  check('la piste passe à « נקבעה פגישה »', (await page.locator(`[data-testid="lead-${lead.id}"]`).getAttribute('data-status')) === 'meeting_set')
  await go(page, '/coordinator/agenda')
  const text = await page.locator('main, #root').first().innerText()
  check('l’agenda la montre', text.includes(lead.name), lead.name)
  await ctx.close()
})

// --- A297 — l'adresse ---------------------------------------------------------

section('A297 — l’adresse courante s’affiche dans הגדרות › נתונים')
await guard('A297', async () => {
  const { ctx, page } = await open(WIDTHS[1])
  await go(page, '/coordinator/settings')
  const shown = (await page.locator('[data-testid="app-address"]').innerText()).trim()
  const expected = await page.evaluate(() => `${location.origin}${location.pathname}`)
  check('l’adresse affichée est celle ouverte', shown === expected, shown)
  await ctx.close()
})

// --- Captures -----------------------------------------------------------------

if (CAPTURES) {
  section('Captures — clair et sombre, trois largeurs : fiche en onglets, salle d’attente')
  let n = 0
  for (const dark of [false, true]) {
    for (const vp of WIDTHS) {
      const { ctx, page, errors } = await open(vp, { dark })
      const theme = dark ? 'sombre' : 'clair'
      await go(page, `/coordinator/farms/${DOC_FARM}`)
      await page.screenshot({ path: `${SHOTS}/as5-fiche-${vp.width}-${theme}.png` })
      await page.mouse.move(vp.width * (vp.width >= 1280 ? 0.7 : 0.5), vp.height * 0.8)
      await page.mouse.wheel(0, 1500)
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${SHOTS}/as5-fiche-defilee-${vp.width}-${theme}.png` })
      await page.click('[data-testid="farm-tab-docs"]')
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${SHOTS}/as5-fiche-documents-${vp.width}-${theme}.png` })
      await go(page, '/coordinator/leads')
      await page.screenshot({ path: `${SHOTS}/as6-salle-${vp.width}-${theme}.png` })
      /* ★ AT2.6 — plus de colonnes par région : le tri « לפי אזור ». */
      /* ★★ AX5 — le tri par la COLONNE « אזור » (montrée quand le tableau a la place). */
      await page.click('[data-testid="leads-table-sort-region"]', { timeout: 3000 }).catch(() => undefined)
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${SHOTS}/as6-salle-par-region-${vp.width}-${theme}.png` })
      n += 5
      check(`captures @${vp.width} ${theme} : aucune erreur de page`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
  console.log(`  ${n} captures dans ${SHOTS}`)
}

await browser.close()
serve?.kill()
console.log(`\n  ${failed === 0 ? `All ${passed} checks passed.` : `${failed} of ${passed + failed} checks FAILED.`}`)
if (failed > 0) process.exit(1)
