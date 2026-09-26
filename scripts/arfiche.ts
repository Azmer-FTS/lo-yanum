import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdirSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AR3 — SUR LA FICHE, LE NOM DE LA FERME N'EST RECOUVERT PAR RIEN. A272
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run arfiche                                                  # build local, mode RÉEL
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run arfiche    # le DÉPLOYÉ
 *
 * ★ LA CAUSE (mesurée, pas supposée) : dans `PageHeader`, le groupe du titre
 *   était `flex-1` — une base de 0 %. Pour décider du retour à la ligne, le
 *   navigateur le comptait donc LARGE DE ZÉRO : la pilule « tenait » toujours
 *   sur la ligne du titre, et le titre était écrasé sous elle. Tant qu'elle
 *   avait trois icônes (W6/X4.2) ça passait ; à cinq (AH7.3 le lien, AK7.1
 *   l'archive), 240 px, plus à 402. Chaque icône ajoutée aurait rejoué le
 *   défaut : la porte mesure donc le RECOUVREMENT, pas une largeur.
 *
 * Même banc qu'`aqui` : l'app RÉELLE, les 25 lignes d'AO1 + une demande
 * entrante, servies par `FakeDb`. Trois largeurs × trois modes de carte ×
 * clair/sombre ; deux fiches : la demande (nom court) et le nom le plus
 * LONG des vingt-cinq.
 *
 * ⚠️ L'APP RÉELLE, JAMAIS `/demo` (règle 12 d'AO) : le jumeau n'a pas de
 *    Supabase, donc ni fiche entrante, ni `aid_requests`, ni retour en
 *    avant-plan qui redemande quoi que ce soit. Ici : les VINGT-CINQ lignes
 *    d'AO1 + UNE demande calquée sur la vraie d'AQ0 (même forme de ligne,
 *    documents compris), servies par `FakeDb` au bundle.
 *
 * ⚠️ ET LES RECTANGLES, PAS LE DOM (AC · AD · AK). A262 et A267 échantillonnent
 *    `elementFromPoint` sur toute la surface de la vignette et du champ ; une
 *    capture accompagne chaque mesure dans `docs/screenshots/arpass/fiche-`.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-arfiche'
const PORT = 5393
const SHOTS = `docs/screenshots/arpass/fiche-${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

const env = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://fake.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_gate',
}
let serve: ReturnType<typeof Bun.spawn> | null = null
async function serveBuild(): Promise<string> {
  if (process.env.SKIP_BUILD !== '1') {
    const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], { env, stdout: 'ignore', stderr: 'pipe' })
    if ((await build.exited) !== 0) {
      console.error(await new Response(build.stderr).text())
      throw new Error('vite build failed')
    }
  }
  serve = Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], {
    env,
    stdout: 'ignore',
    stderr: 'ignore',
  })
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

/** Une demande calquée sur la vraie d'AQ0 : mêmes colonnes, un PDF minuscule. */
function requestRows(n: number, minutesAgo: number, withAppointment = true) {
  const id = `farm-req-aq${String(n).padStart(8, '0')}`
  const created = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  const appt = new Date(Date.now() + 3 * 24 * 3600_000)
  appt.setUTCHours(7, 0, 0, 0)
  const entity = {
    ...ROWS[0],
    id,
    name: n === 1 ? 'חוות הבדיקה' : `חווה חדשה ${n}`,
    farm_name: n === 1 ? 'חוות הבדיקה' : `חווה חדשה ${n}`,
    status: 'incoming_request',
    type: 'mixed',
    locality: 'קרני שומרון',
    region: '',
    lat: 31.27,
    lng: 34.79,
    position_missing: true,
    farmer_name: n === 1 ? 'ישראל ישראלי' : `חקלאי ${n}`,
    farmer_phone: '052-0000000',
    farmer_email: 'farmer@example.org',
    notes: 'בקשה שהתקבלה מהעמוד הציבורי · שמירה · אסמכתא AQ0000',
    provided_documents: [{ id: 'crops', file: 'data:application/pdf;base64,JVBERi0xLjQK', providedAt: created }],
    farm_dunams: 0,
    grazing_dunams: 0,
    guarded_dunams: null,
    archived_at: null,
    created_at: created,
    updated_at: created,
  }
  const request = {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    created_at: created,
    need: 'guarding',
    land_kind: 'both',
    farm_name: entity.name,
    full_name: entity.farmer_name,
    phone: '052-0000000',
    email: 'farmer@example.org',
    reference: `AQ000${n}`,
    appointment_at: withAppointment ? appt.toISOString() : null,
    entity_id: id,
    mail_po: 'not_configured',
    mail_farmer: 'not_configured',
    mail_error: 'RESEND_API_KEY absent',
  }
  return { entity, request, id }
}

const browser: Browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
})

interface Opened {
  ctx: BrowserContext
  page: Page
  db: FakeDb
  errors: string[]
}

async function open(
  viewport: { width: number; height: number },
  opts: { requests?: number; dark?: boolean; seen?: string[]; newVersion?: boolean } = {},
): Promise<Opened> {
  const db = new FakeDb()
  db.seed()
  db.rows('entities').length = 0
  for (const r of ROWS) db.rows('entities').push({ ...r })
  for (let n = 1; n <= (opts.requests ?? 1); n++) {
    const { entity, request } = requestRows(n, 90 + n)
    db.rows('entities').push(entity)
    db.rows('aid_requests').push(request)
  }
  const ctx = await browser.newContext({
    viewport,
    hasTouch: true,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: opts.dark ? 'dark' : 'light',
  })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  const seen = opts.seen ?? []
  await ctx.addInitScript((s: string[]) => {
    localStorage.setItem('lo-yanum:theme:coordinator', 'system')
    if (s.length) localStorage.setItem('lo-yanum:intake:seen', JSON.stringify(s))
  }, seen)
  if (opts.newVersion) {
    await ctx.route('**/version.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'aq00000', builtAt: new Date().toISOString() }),
      }),
    )
  }
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, db, errors }
}

async function go(page: Page, hash: string, settle = 5000): Promise<void> {
  await page.goto(`${APP}/?ar=${Date.now()}#${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

async function guard(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    check(`${label} — section interrompue`, false, (e as Error).message.split('\n')[0])
  }
}

/** Le rectangle d'un élément, et la part de sa surface où il est vraiment en haut de la pile. */
async function exposure(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    let hits = 0
    let total = 0
    const blockers: string[] = []
    for (let i = 1; i <= 7; i++) {
      for (let j = 1; j <= 3; j++) {
        const x = r.left + (r.width * i) / 8
        const y = r.top + (r.height * j) / 4
        total++
        const top = document.elementFromPoint(x, y)
        if (top && (el.contains(top) || top === el)) hits++
        else if (top) blockers.push(`${top.tagName.toLowerCase()}[${top.getAttribute('data-testid') ?? ''}]`)
      }
    }
    return {
      left: Math.round(r.left),
      top: Math.round(r.top),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
      width: Math.round(r.width),
      vw: innerWidth,
      vh: innerHeight,
      hits,
      total,
      blockers: [...new Set(blockers)].slice(0, 4),
    }
  }, selector)
}

const VIEWPORTS = [
  { name: '402', width: 402, height: 874 },
  { name: '1032', width: 1032, height: 1376 },
  { name: '1376', width: 1376, height: 1032 },
] as const

const LONGEST = [...farms].sort((a, b) => b.name.length - a.name.length)[0]
const FICHES = [
  { key: 'demande', id: 'farm-req-aq00000001', name: 'חוות הבדיקה' },
  { key: 'long', id: LONGEST.id, name: LONGEST.name },
]
console.log(`  nom le plus long : « ${LONGEST.name} » (${LONGEST.name.length} caractères)`)

/** Le titre, la pilule, et qui est au-dessus de chaque point du titre. */
async function header(page: Page) {
  return page.evaluate(() => {
    const h = document.querySelector('[data-page-title]') as HTMLElement | null
    const pill = document.querySelector('[data-testid="sheet-actions"]') as HTMLElement | null
    const sub = h?.parentElement?.querySelector('p') ?? null
    if (!h || !pill) return null
    /* ⚠️ « REPLIÉ » = HORS DE LA MISE EN PAGE (carte seule), PAS « LARGE DE
       ZÉRO ». Un titre écrasé à 0 px EST le défaut : première écriture de
       cette sonde, elle le prenait pour une fiche repliée. */
    if (h.offsetParent === null || getComputedStyle(h).visibility === 'hidden') return { hidden: true as const }
    /* La largeur NATURELLE du nom, sur une ligne. */
    const probe = h.cloneNode(true) as HTMLElement
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;width:auto;left:-9999px'
    document.body.appendChild(probe)
    const natural = probe.getBoundingClientRect().width
    probe.remove()
    const column = (h.parentElement as HTMLElement).getBoundingClientRect().width
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width) }
    }
    /* Chaque LIGNE de texte du titre et du sous-titre, échantillonnée. */
    const blockers: string[] = []
    let hits = 0
    let total = 0
    for (const el of [h, sub].filter(Boolean) as HTMLElement[]) {
      const range = document.createRange()
      range.selectNodeContents(el)
      for (const box of range.getClientRects()) {
        for (let i = 1; i <= 5; i++) {
          const x = box.left + (box.width * i) / 6
          const y = box.top + box.height / 2
          total++
          const top = document.elementFromPoint(x, y)
          if (top && (el.contains(top) || top === el)) hits++
          else if (top) blockers.push(`${top.tagName.toLowerCase()}[${top.getAttribute('data-testid') ?? top.className.toString().slice(0, 20)}]`)
        }
      }
    }
    const a = h.getBoundingClientRect()
    const p = pill.getBoundingClientRect()
    const overlap = !(a.right <= p.left || p.right <= a.left || a.bottom <= p.top || p.bottom <= a.top)
    return {
      hidden: false as const,
      title: rect(h),
      pill: rect(pill),
      overlap,
      hits,
      total,
      blockers: [...new Set(blockers)].slice(0, 4),
      /* Un mot coupé en plein milieu = une colonne trop étroite pour un nom. */
      column: Math.round(column),
      natural: Math.round(natural),
      vw: innerWidth,
      pillInside: p.left >= 0 && p.right <= innerWidth,
    }
  })
}

try {
  section('A272 — le nom de la ferme n\'est recouvert par rien : trois largeurs, trois modes, clair et sombre')
  for (const dark of [false, true]) {
    const theme = dark ? 'sombre' : 'clair'
    for (const vp of VIEWPORTS) {
      for (const mode of ['split', 'hidden', 'full'] as const) {
        for (const fiche of FICHES) {
          await guard(`A272 ${theme} ${vp.name} ${mode} ${fiche.key}`, async () => {
            const { ctx, page, errors } = await open(vp, { requests: 1, dark, seen: ['farm-req-aq00000001'] })
            await go(page, `/coordinator/farms/${fiche.id}`, 4500)
            const btn = page.locator(`[data-testid="map-mode-${mode}"]`)
            if (await btn.count()) {
              await btn.first().click()
              await page.waitForTimeout(1000)
            }
            const label = `${theme} ${vp.name} ${mode} ${fiche.key}`
            const m = await header(page)
            if (m === null || m.hidden) {
              check(`${label} — carte seule : la fiche est repliée, aucun titre à recouvrir (sans objet)`, mode === 'full', JSON.stringify(m))
            } else {
              check(`${label} — ★ le nom et la localité recouverts par RIEN`, m.hits === m.total && m.total > 0, `${m.hits}/${m.total} ${m.blockers.join(' ')}`)
              check(`${label} — ★ le titre et la pilule ne se chevauchent pas`, !m.overlap, `titre ${JSON.stringify(m.title)} pilule ${JSON.stringify(m.pill)}`)
              check(`${label} — la pilule est entière dans l'écran`, m.pillInside, JSON.stringify(m.pill))
              /* Sa colonne tient le nom entier, ou au moins 200 px (un nom très
                 long peut passer à la ligne, pas être écrasé mot par mot). */
              check(`${label} — ★ la colonne du titre n'est pas écrasée`, m.column >= Math.min(m.natural, 200), `colonne ${m.column} px, nom ${m.natural} px`)
            }
            if (vp.name === '402' || mode === 'split') {
              await page.screenshot({ path: `${SHOTS}/a272-${fiche.key}-${theme}-${vp.name}-${mode}.png` })
            }
            check(`${label} — aucune erreur de page`, errors.length === 0, errors.join(' | '))
            await ctx.close()
          })
        }
      }
    }
  }
} finally {
  await browser.close()
  serve?.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
