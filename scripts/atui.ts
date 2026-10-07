import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'
import { parseLeadBlock } from '../src/core/leads'
import { readPortalRows } from '../src/core/portalImport'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AT — A299 · A301 · A302 · A303 · A304 · A305 · A306 · A307.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run atui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run atui    # le DÉPLOYÉ
 *   CAPTURES=1 …                                                  # + captures clair/sombre × 3 largeurs
 *
 * Le bundle est celui servi ; la base est factice (`FakeDb`) mais porte les
 * VRAIES lignes de fermes (`buildFarms`, la forme exacte de `entities`), six
 * pistes et un incident urgent ouvert. A298 est `atsync`, A300 et A308 se
 * prouvent sur la production (`docs/at/`).
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-atui'
const PORT = 5396
const CAPTURES = process.env.CAPTURES === '1'
const SHOTS = `docs/screenshots/atpass/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

let passed = 0
let failed = 0
const measures: Record<string, unknown> = {}
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
const ALERT_FARM = String(ROWS[0].id)
const LONGEST = [...ROWS].sort((a, b) => String(b.name).length - String(a.name).length).slice(0, 2).map((r) => String(r.id))

function leadRow(id: string, name: string, contact: string, status: string, daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString()
  return { id, name, contact_name: contact, phone: `050-00000${id.slice(-2)}`, email: '', place: 'נתיבות', lat: null, lng: null, region_id: null, status, notes: '', source: 'paste', raw: '', rank: 0, converted_farm_id: null, converted_at: null, created_at: at, updated_at: at }
}
const LEADS = [
  leadRow('lead-at-01', 'משק אלון', 'אבי', 'not_called', 1),
  leadRow('lead-at-02', 'גד״ש דביר', 'לירן', 'message_sent', 5),
  leadRow('lead-at-03', 'בקר השקמה', 'דנה', 'not_called', 3),
  leadRow('lead-at-04', 'רפת זית', 'יוסי', 'call_back', 2),
  leadRow('lead-at-05', 'דיר הגבעה', 'רונית', 'no_answer', 4),
  leadRow('lead-at-06', 'חוות תמר', 'משה', 'not_interested', 6),
]

function seed(db: FakeDb): void {
  db.seed()
  for (const r of ROWS) db.rows('entities').push({ ...r })
  for (const l of LEADS) db.rows('leads').push({ ...l })
  db.rows('incidents').push({
    id: 'inc-at-01', entity_id: ALERT_FARM, mission_id: null, source: 'coordinator', reporter_id: null, reporter_name: 'בדיקה',
    severity: 'urgent', description: 'גדר פרוצה', lat: null, lng: null, reported_at: new Date(Date.now() - 3600_000).toISOString(), resolved: false,
  })
}

const browser: Browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })

interface Opened {
  ctx: BrowserContext
  page: Page
  db: FakeDb
  errors: string[]
}
async function open(width: number, dark = false): Promise<Opened> {
  const db = new FakeDb()
  seed(db)
  const ctx = await browser.newContext({ viewport: { width, height: width >= 1300 ? 1032 : width >= 1000 ? 1376 : 874 }, hasTouch: true, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: dark ? 'dark' : 'light' })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  await ctx.addInitScript(() => localStorage.setItem('lo-yanum:theme:coordinator', 'system'))
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, db, errors }
}
async function go(page: Page, hash: string, settle = 4500): Promise<void> {
  await page.goto(`${APP}/?at=${Date.now()}#${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}
async function guard(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    check(`${label} — section interrompue`, false, (e as Error).message.split('\n')[0])
  }
}
const WIDTHS = [402, 1032, 1376]

// --- A307 — pur ---------------------------------------------------------------

section('A307 — un courriel trouvé ailleurs qu’à sa place va au champ courriel')
{
  const { rows } = readPortalRows([
    ['שם המקום', 'איש קשר', 'נייד איש קשר', 'מייל', 'כתובת'],
    ['חוות בדיקה', 'דני dani@farm.co.il', '0501234567', '', '31.5, 34.6'],
    ['חוות שתיים', 'רות', '0507654321', '', 'ruth@example.org'],
  ])
  check('portail : courriel dans la colonne « איש קשר » → champ courriel', rows[0].email === 'dani@farm.co.il', rows[0].email)
  check('portail : … et retiré du nom du contact', rows[0].contact === 'דני', rows[0].contact)
  check('portail : courriel dans « כתובת » → champ courriel (pas un lieu)', rows[1].email === 'ruth@example.org' && rows[1].position === null)
  const vc = parseLeadBlock('BEGIN:VCARD\nFN:משה כהן\nORG:משק כהן\nitem1.TEL;waid=972501234567:+972 50-123-4567\nitem2.EMAIL;type=INTERNET:moshe@example.com\nEND:VCARD')
  check('collage : carte WhatsApp → nom de l’exploitation (ORG), personne, téléphone, courriel', vc[0]?.name === 'משק כהן' && vc[0]?.contactName === 'משה כהן' && vc[0]?.phone === '050-1234567' && vc[0]?.email === 'moshe@example.com', JSON.stringify(vc[0]))
  const lab = parseLeadBlock('שם: דנה לוי\nחווה: רפת השקמה\nטלפון: 052-7654321\nישוב: שדרות\nמייל: dana@farm.co.il')
  check('collage : fiche étiquetée (שם/חווה/טלפון/ישוב/מייל) → une piste complète', lab.length === 1 && lab[0].email === 'dana@farm.co.il' && lab[0].place === 'שדרות' && lab[0].name === 'רפת השקמה', JSON.stringify(lab[0]))
  const line = parseLeadBlock('[7.10.2026, 12:13] Tamir: ~ אבי 050-555-1234 אופקים avi@gmail.com')
  check('collage : courriel sur une ligne de discussion → champ courriel, pas dans le nom', line[0]?.email === 'avi@gmail.com' && !line[0]?.name.includes('@'), JSON.stringify(line[0]))
}

// --- A299 · A301 · A302 — la salle d'attente -----------------------------------

for (const width of WIDTHS) {
  await guard(`salle d’attente ${width}`, async () => {
    section(`A301 · A302 · A299 — la salle d’attente à ${width} px`)
    const o = await open(width)
    const { page, db } = o
    await go(page, '/coordinator/leads')
    const tabs = page.locator('[data-testid="leads-tabs"]')
    check('une rangée d’onglets de filtre (role=tablist), pas de pilule', (await tabs.getAttribute('role')) === 'tablist' && (await tabs.locator('.filter-pill').count()) === 0)
    check('aucune colonne : plus de tableau à défiler en deux sens', (await page.locator('[data-testid="leads-board"]').count()) === 0)
    const list = page.locator('[data-testid="leads-list"] article[data-lead-id]')
    check('les cinq pistes ouvertes sont dans UNE liste (la « לא רלוונטי » repliée)', (await list.count()) === 5, String(await list.count()))
    const row = page.locator('[data-testid="lead-lead-at-01"]')
    const seg = row.locator('[role="radiogroup"] [role="radio"]')
    check('A301 · cinq choix de statut visibles sur la ligne', (await seg.count()) === 5)
    const wrapped = await seg.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().height > 48).map((e) => e.textContent))
    check('A301 · aucun libellé de statut ne passe à la ligne ni n’est rogné', wrapped.length === 0, wrapped.join(','))
    const yBefore = (await row.boundingBox())!.y
    const countBefore = Number((await page.locator('[data-testid="leads-count-call_back"]').textContent().catch(() => '0')) || 0)
    await page.click('[data-testid="lead-status-lead-at-01-call_back"]')
    await page.waitForTimeout(600)
    check('A301 · UN toucher : le statut change', (await page.getAttribute('[data-testid="lead-status-lead-at-01-call_back"]', 'aria-checked')) === 'true')
    const yAfter = (await row.boundingBox())!.y
    check('A301 · la ligne ne bouge pas sous le doigt', Math.abs(yAfter - yBefore) < 2, `${yBefore} → ${yAfter}`)
    const countAfter = Number((await page.locator('[data-testid="leads-count-call_back"]').textContent()) || 0)
    check('A301 · le compte de l’onglet « לחזור » dit où elle est partie (+1)', countAfter === countBefore + 1, `${countBefore} → ${countAfter}`)
    check('A301 · un bandeau propose « ביטול »', await page.locator('[data-testid="leads-undo"]').isVisible())
    await page.waitForTimeout(1600)
    check('… et la base a reçu le statut', db.rows('leads').find((l) => l.id === 'lead-at-01')?.status === 'call_back')
    await page.click('[data-testid="leads-undo"]')
    await page.waitForTimeout(1600)
    check('« ביטול » rend l’ancien statut (écran ET base)', (await page.getAttribute('[data-testid="lead-status-lead-at-01-not_called"]', 'aria-checked')) === 'true' && db.rows('leads').find((l) => l.id === 'lead-at-01')?.status === 'not_called')
    check('A301 · l’ancien « שלחתי הודעה » se lit « ממתין »', (await page.getAttribute('[data-testid="lead-status-lead-at-02-no_answer"]', 'aria-checked')) === 'true')
    if (CAPTURES) await page.screenshot({ path: `${SHOTS}/a301-leads-${width}-light.png` })

    // A302
    const opts = await page.locator('[data-testid="leads-sort"] option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))
    check('A302 · tris : plus récent, mis à jour, alphabétique, région', ['newest', 'updated', 'name', 'region'].every((v) => opts.includes(v)), opts.join(','))
    const names = async () => list.evaluateAll((els) => els.map((e) => e.querySelector('p')?.textContent ?? ''))
    const newest = await names()
    check('A302 · par défaut, le plus récent d’abord', newest[0] === 'משק אלון' && newest[newest.length - 1] === 'גד״ש דביר', newest.join(' · '))
    await page.selectOption('[data-testid="leads-sort"]', 'name')
    await page.waitForTimeout(300)
    const alpha = await names()
    const sorted = [...alpha].sort((a, b) => a.localeCompare(b, 'he'))
    check('A302 · alphabétique (א–ת)', alpha.join('|') === sorted.join('|'), alpha.join(' · '))
    await page.selectOption('[data-testid="leads-sort"]', 'newest')

    // A299 — conversion
    const farmsBefore = db.rows('entities').length
    await page.click('[data-testid="lead-menu-lead-at-03-toggle"]')
    await page.click('[data-testid="lead-convert-lead-at-03"]')
    await page.waitForTimeout(1500)
    check('A299 · « הפיכה לחווה » DEMANDE confirmation (fenêtre ouverte)', await page.locator('[data-testid="leads-confirm"]').isVisible())
    check('A299 · … et rien n’est encore écrit', db.rows('entities').length === farmsBefore)
    await page.click('[data-testid="leads-confirm-ok"]')
    await page.waitForTimeout(2000)
    check('A299 · confirmée : une ferme naît', db.rows('entities').length === farmsBefore + 1)
    check('A299 · on reste sur la liste (pas emporté vers la fiche)', page.url().includes('/coordinator/leads'))
    await page.click('[data-testid="leads-undo"]')
    await page.waitForTimeout(2000)
    check('A299 · « ביטול » : la ferme disparaît de la base', db.rows('entities').length === farmsBefore, `${db.rows('entities').length}`)
    check('A299 · … et la piste revient dans la liste', await page.locator('[data-testid="lead-lead-at-03"]').isVisible())
    // conversion annulée plus tard, depuis « הפכו לחוות »
    await page.click('[data-testid="lead-menu-lead-at-03-toggle"]')
    await page.click('[data-testid="lead-convert-lead-at-03"]')
    await page.click('[data-testid="leads-confirm-ok"]')
    await page.waitForTimeout(9000)
    await page.click('[data-testid="leads-converted-toggle"]')
    await page.click('[data-testid="lead-revert-lead-at-03"]')
    check('A299 · « החזרה לרשימה » demande confirmation', await page.locator('[data-testid="leads-confirm"]').isVisible())
    await page.click('[data-testid="leads-confirm-ok"]')
    await page.waitForTimeout(2000)
    check('A299 · une conversion d’hier s’annule aussi : piste de retour, ferme retirée', (await page.locator('[data-testid="lead-lead-at-03"]').isVisible()) && db.rows('entities').length === farmsBefore)
    // suppression
    await page.click('[data-testid="lead-menu-lead-at-05-toggle"]')
    await page.click('[data-testid="lead-delete-lead-at-05"]')
    check('A299 · supprimer demande confirmation', await page.locator('[data-testid="leads-confirm"]').isVisible())
    await page.click('[data-testid="leads-confirm-cancel"]')
    check('A299 · « ביטול » de la fenêtre : rien n’est supprimé', await page.locator('[data-testid="lead-lead-at-05"]').isVisible())
    check('aucune erreur de page', o.errors.length === 0, o.errors.join(' | '))
    await o.ctx.close()
    if (CAPTURES) {
      const d = await open(width, true)
      await go(d.page, '/coordinator/leads')
      await d.page.screenshot({ path: `${SHOTS}/a301-leads-${width}-dark.png` })
      await d.ctx.close()
    }
  })
}

// --- A303 · A304 — la fiche : onglets et barre épinglée -------------------------

for (const width of WIDTHS) {
  await guard(`fiche ${width}`, async () => {
    section(`A303 · A304 — la fiche à ${width} px`)
    const o = await open(width)
    const { page } = o
    await go(page, `/coordinator/farms/${ALERT_FARM}`)
    const bar = page.locator('[data-testid="farm-tabs"]')
    check('A303 · role=tablist, aucune pilule (`filter-pill`)', (await bar.getAttribute('role')) === 'tablist' && (await bar.locator('.filter-pill').count()) === 0)
    const header = page.locator('[data-testid="farm-sticky"] > div').first()
    const hb = (await header.boundingBox())!
    const tb = (await bar.boundingBox())!
    check('A303 · la rangée occupe toute la largeur du contenu de la barre (celle de la ligne de titre)', tb.width >= hb.width * 0.95, `${Math.round(tb.width)} / ${Math.round(hb.width)}`)
    const tabs = await bar.locator('[role="tab"]').evaluateAll((els) =>
      els.map((e) => ({ k: e.id, w: e.getBoundingClientRect().width, tone: e.getAttribute('data-tone'), alert: e.getAttribute('data-alert'), bb: getComputedStyle(e).borderBottomWidth, sel: e.getAttribute('aria-selected'), wrap: e.scrollWidth > e.clientWidth + 1 })),
    )
    const visible = await bar.evaluate((b) => [...b.querySelectorAll('[role="tab"]')].every((t) => { const r = t.getBoundingClientRect(); const R = b.getBoundingClientRect(); return r.left >= R.left - 1 && r.right <= R.right + 1 }))
    check('A303 · les six onglets tiennent sans défiler', visible)
    check('A303 · l’actif est souligné (3 px)', tabs.find((x) => x.sel === 'true')?.bb === '3px')
    const guards = tabs.find((x) => x.k.endsWith('guards'))
    check('A303 · l’onglet des gardes se distingue (teinte propre)', guards?.tone === 'vivid' && tabs.filter((x) => x.tone === 'vivid').length === 1)
    check('A303 · … et porte un signal quand une alerte y attend (incident urgent ouvert)', guards?.alert === '1')
    check('A304 · aucun libellé d’onglet ne passe à la ligne', tabs.every((x) => !x.wrap))
    const closed = await page.locator('[id^="farm-panel-"] button[aria-expanded="false"]').count()
    check('AT4.4 · tous les blocs dépliés par défaut (fiche neuve sur cet appareil)', closed === 0, `${closed} replié(s)`)
    if (CAPTURES) await page.screenshot({ path: `${SHOTS}/a303-fiche-${width}-light.png` })
    await o.ctx.close()
    for (const id of LONGEST) {
      const p = await open(width)
      await go(p.page, `/coordinator/farms/${id}`)
      const m = await p.page.evaluate(() => {
        const h = document.querySelector('[data-testid="farm-sticky"]') as HTMLElement
        const row = h.firstElementChild as HTMLElement
        const title = h.querySelector('h1') as HTMLElement
        const acts = h.querySelector('[data-testid="sheet-actions"]') as HTMLElement
        const r = row.getBoundingClientRect()
        const a = acts.getBoundingClientRect()
        return { bar: Math.round(h.getBoundingClientRect().height), row: Math.round(r.height), actionsBelowTitle: a.top > r.top + 30, folded: !!h.querySelector('[data-actions-folded]'), title: title.textContent, titleCut: title.scrollHeight > title.clientHeight + 2 || title.scrollWidth > title.clientWidth + 1 }
      })
      measures[`bar-${width}-${id}`] = m
      check(`A304 · ${m.title} : les icônes ne passent jamais sous le nom (ligne ≤ 2 lignes de titre)`, m.row <= 84 && !m.actionsBelowTitle, JSON.stringify(m))
      check(`A304 · … le nom reste ENTIER (jamais coupé par « … »)`, !m.titleCut, JSON.stringify(m))
      check(`A304 · … barre épinglée ≤ 150 px (titre + onglets)`, m.bar <= 150, `${m.bar} px${m.folded ? ' · actions repliées « ⋯ »' : ''}`)
      if (m.folded) {
        await p.page.click('[data-testid="sheet-actions-more"]')
        const items = await p.page.locator('[data-testid="sheet-actions-menu"] [role="menuitem"]').count()
        check('A304 · repliées, les actions sont dans le menu « ⋯ » (cinq entrées)', items === 5, String(items))
      }
      await p.ctx.close()
    }
    if (CAPTURES) {
      const d = await open(width, true)
      await go(d.page, `/coordinator/farms/${ALERT_FARM}`)
      await d.page.screenshot({ path: `${SHOTS}/a303-fiche-${width}-dark.png` })
      await d.ctx.close()
    }
  })
}

// --- A304 — les autres écrans ---------------------------------------------------

for (const width of WIDTHS) {
  await guard(`balayage ${width}`, async () => {
    section(`A304 — en-têtes des écrans à ${width} px (aucune action passée à la ligne)`)
    const o = await open(width)
    for (const route of ['/coordinator/farms', '/coordinator/leads', '/coordinator/volunteers', '/coordinator/drivers', '/coordinator/missions', '/coordinator/incidents', '/coordinator/agenda', '/coordinator/settings', `/coordinator/farms/${ALERT_FARM}/edit`]) {
      await go(o.page, route, 3500)
      const m = await o.page.evaluate(() => {
        const out: string[] = []
        for (const h of document.querySelectorAll('header')) {
          const row = h.firstElementChild as HTMLElement | null
          if (!row || row.closest('[data-overlay]')) continue
          const kids = [...row.children] as HTMLElement[]
          if (kids.length >= 2) {
            const tops = kids.map((k) => k.getBoundingClientRect().top)
            if (Math.max(...tops) - Math.min(...tops) > 24) out.push(`header: ${kids.map((k) => (k.textContent ?? '').slice(0, 12)).join(' / ')}`)
          }
        }
        for (const b of document.querySelectorAll('[data-testid="farm-edit-sticky"] button, [data-tabbar] [role="tab"], [data-header-actions] button, [data-header-actions] a')) {
          const el = b as HTMLElement
          if (el.offsetParent === null) continue
          if (el.getBoundingClientRect().height > 56) out.push(`bouton haut ${Math.round(el.getBoundingClientRect().height)} : ${(el.textContent ?? '').slice(0, 20)}`)
        }
        const edit = document.querySelector('[data-testid="farm-edit-sticky"]') as HTMLElement | null
        if (edit && edit.getBoundingClientRect().height > 72) out.push(`barre d'édition ${Math.round(edit.getBoundingClientRect().height)} px`)
        return out
      })
      check(`A304 · ${route}`, m.length === 0, m.join(' | '))
    }
    await o.ctx.close()
  })
}

// --- A305 — la fenêtre de signature -------------------------------------------

for (const width of WIDTHS) {
  await guard(`signature ${width}`, async () => {
    section(`A305 — la fenêtre de signature à ${width} px`)
    const target = String(ROWS.find((r) => !r.signature)?.id ?? ROWS[1].id)
    const o = await open(width)
    const { page, db } = o
    await go(page, `/coordinator/farms/${target}`)
    await page.click('[data-testid="farm-open-assoc-form"]')
    await page.waitForTimeout(1200)
    const m = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="assoc-form"]')?.closest('[role="dialog"]') ?? document.querySelector('[data-testid="assoc-form"]')
      const logo = document.querySelector('[data-testid="assoc-form-logo"]')!.getBoundingClientRect()
      const pad = document.querySelector('[data-testid="assoc-signature"] canvas')!.getBoundingClientRect()
      const decl = document.querySelector('[data-testid="assoc-declaration"]')?.getBoundingClientRect()
      return { logo: Math.round(logo.height), pad: Math.round(pad.height), decl: Math.round(decl?.height ?? 0), modal: Math.round((modal as HTMLElement).getBoundingClientRect().height), vh: innerHeight }
    })
    measures[`sign-${width}`] = m
    check('A305 · logo agrandi (≥ 64 px, il en faisait 32)', m.logo >= 64, JSON.stringify(m))
    check('A305 · cadre de signature réduit : ≤ 32 % de la hauteur de l’écran', m.pad <= m.vh * 0.32, `${m.pad} / ${m.vh}`)
    check('A305 · la déclaration a plus de place que l’encre', m.decl >= m.pad * 0.9, `déclaration ${m.decl} · encre ${m.pad}`)
    if (CAPTURES) await page.screenshot({ path: `${SHOTS}/a305-signature-${width}-light.png` })
    const before = String(db.rows('entities').find((r) => r.id === target)?.name)
    await page.click('[data-testid="assoc-form-place"]')
    await page.fill('[data-testid="assoc-form-place-input"]', `${before} תוקן`)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    check('A305 · le nom de la ferme se corrige SUR PLACE', ((await page.textContent('[data-testid="assoc-form-place"]')) ?? '').includes('תוקן'))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(2500)
    const after = db.rows('entities').find((r) => r.id === target)
    check('A305 · … et la correction est dans la FICHE (base)', String(after?.name).includes('תוקן') || String(after?.farm_name).includes('תוקן'), `${after?.name} / ${after?.farm_name}`)
    check('aucune erreur de page', o.errors.length === 0, o.errors.join(' | '))
    await o.ctx.close()
    if (CAPTURES) {
      const d = await open(width, true)
      await go(d.page, `/coordinator/farms/${target}`)
      await d.page.click('[data-testid="farm-open-assoc-form"]')
      await d.page.waitForTimeout(1200)
      await d.page.screenshot({ path: `${SHOTS}/a305-signature-${width}-dark.png` })
      await d.ctx.close()
    }
  })
}

// --- A306 — le menu du téléphone -----------------------------------------------

for (const width of [402, 768]) {
  for (const dark of [false, true]) {
    await guard(`menu ${width} ${dark}`, async () => {
      section(`A306 — le menu du téléphone à ${width} px (${dark ? 'sombre' : 'clair'})`)
      const o = await open(width, dark)
      await go(o.page, '/coordinator/leads', 3500)
      await o.page.click('[data-testid="shell-menu"]')
      await o.page.waitForTimeout(500)
      const m = await o.page.evaluate(() => {
        const grid = document.querySelector('[data-testid="shell-menu-grid"]') as HTMLElement
        const g = grid.getBoundingClientRect()
        const tiles = [...grid.querySelectorAll('[data-tile-hue]')] as HTMLElement[]
        const lum = (c: number[]) => {
          const f = (v: number) => {
            v /= 255
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
        }
        const rgba = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
        const page = rgba(getComputedStyle(grid).backgroundColor)
        const rows = tiles.map((t) => {
          const r = t.getBoundingClientRect()
          const bg = rgba(getComputedStyle(t).backgroundColor)
          const a = bg[3] ?? 1
          const mix = [0, 1, 2].map((i) => bg[i] * a + page[i] * (1 - a))
          const label = t.querySelector('span') as HTMLElement
          const fg = rgba(getComputedStyle(label).color)
          const L1 = lum(fg)
          const L2 = lum(mix)
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
          return { hue: t.getAttribute('data-tile-hue'), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), ratio: Math.round(ratio * 100) / 100, label: label.textContent }
        })
        return { full: g.width >= innerWidth - 1 && g.height >= innerHeight - 1, rows, cols: new Set(rows.map((r) => r.top)).size ? rows.filter((r) => r.top === rows[0].top).length : 0 }
      })
      check('A306 · plein écran', m.full)
      check('A306 · dix tuiles', m.rows.length === 10, String(m.rows.length))
      check('A306 · tuiles CARRÉES (|l − h| ≤ 2 px)', m.rows.every((r) => Math.abs(r.w - r.h) <= 2), m.rows.map((r) => `${r.w}×${r.h}`).slice(0, 3).join(' '))
      check(`A306 · ≥ 3 colonnes (${m.cols})`, m.cols >= 3)
      check('A306 · une couleur PROPRE à chaque entrée', new Set(m.rows.map((r) => r.hue)).size === 10)
      const low = m.rows.filter((r) => r.ratio < 4.5)
      check('A306 · contraste du libellé ≥ 4,5:1 sur sa tuile, mesuré au rendu', low.length === 0, low.map((r) => `${r.label} ${r.ratio}`).join(', ') || `min ${Math.min(...m.rows.map((r) => r.ratio))}`)
      if (CAPTURES) await o.page.screenshot({ path: `${SHOTS}/a306-menu-${width}-${dark ? 'dark' : 'light'}.png` })
      await o.ctx.close()
    })
  }
}

writeFileSync(`${SHOTS}/at-mesures.json`, JSON.stringify(measures, null, 2))
await browser.close()
serve?.kill()
console.log(`\n  atui : ${passed} PASS · ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
