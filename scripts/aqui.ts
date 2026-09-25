import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdirSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AQ5 — LES DEMANDES ENTRANTES SE VOIENT. A260 · A261 · A262 · A263 · A264 · A267
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aqui                                                  # build local, mode RÉEL
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run aqui    # le DÉPLOYÉ
 *   DIST=dist-aq-before SKIP_BUILD=1 bun run aqui                 # le rouge d'avant
 *
 * ⚠️ L'APP RÉELLE, JAMAIS `/demo` (règle 12 d'AO) : le jumeau n'a pas de
 *    Supabase, donc ni fiche entrante, ni `aid_requests`, ni retour en
 *    avant-plan qui redemande quoi que ce soit. Ici : les VINGT-CINQ lignes
 *    d'AO1 + UNE demande calquée sur la vraie d'AQ0 (même forme de ligne,
 *    documents compris), servies par `FakeDb` au bundle.
 *
 * ⚠️ ET LES RECTANGLES, PAS LE DOM (AC · AD · AK). A262 et A267 échantillonnent
 *    `elementFromPoint` sur toute la surface de la vignette et du champ ; une
 *    capture accompagne chaque mesure dans `docs/screenshots/aqpass/`.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const OUT = process.env.DIST ?? 'dist-aqpass'
const PORT = 5391
const SHOTS = `docs/screenshots/aqpass/${REMOTE ? 'deployed' : 'local'}`
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
  await page.goto(`${APP}/?aq=${Date.now()}#${hash}`, { waitUntil: 'load' })
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

try {
  // =========================================================================
  section('A260 — le tableau de bord, en tête : le bloc et son nombre ; absent sans demande')
  // =========================================================================
  for (const vp of VIEWPORTS) {
    await guard(`A260 ${vp.name}`, async () => {
      const { ctx, page, errors } = await open(vp, { requests: 2, seen: ['farm-req-aq00000001', 'farm-req-aq00000002'] })
      await go(page, '/coordinator')
      const block = page.locator('[data-testid="dash-intake"]')
      check(`${vp.name} — le bloc « בקשות נכנסות » est là`, (await block.count()) === 1)
      const count = (await page.locator('[data-testid="dash-intake-count"]').textContent())?.trim()
      check(`${vp.name} — il porte leur NOMBRE`, count === '2', `« ${count} »`)
      /* EN TÊTE : avant le titre de la page et avant les grands chiffres. */
      const order = await page.evaluate(() => {
        const b = document.querySelector('[data-testid="dash-intake"]')!.getBoundingClientRect()
        const h = document.querySelector('[data-page-title]')!.getBoundingClientRect()
        const hero = document.querySelector('[data-testid="hero-figures"]')!.getBoundingClientRect()
        return { block: Math.round(b.top), title: Math.round(h.top), hero: Math.round(hero.top), bottom: Math.round(b.bottom), vh: innerHeight }
      })
      check(`${vp.name} — ★ AVANT le titre et les chiffres`, order.block < order.title && order.block < order.hero, JSON.stringify(order))
      check(`${vp.name} — ★ dans l'écran au repos, sans défiler`, order.bottom <= order.vh, `bas ${order.bottom} / ${order.vh}`)
      const ex = await exposure(page, '[data-testid="dash-intake"]')
      check(`${vp.name} — recouvert par rien`, !!ex && ex.hits === ex.total, ex ? `${ex.hits}/${ex.total} ${ex.blockers.join(' ')}` : 'absent')
      await page.screenshot({ path: `${SHOTS}/a260-tableau-${vp.name}.png` })
      check(`${vp.name} — aucune erreur de page`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    })
  }
  await guard('A260 absent', async () => {
    const { ctx, page } = await open({ width: 1032, height: 1376 }, { requests: 0 })
    await go(page, '/coordinator')
    check('sans demande, le bloc est ABSENT (pas une vignette à zéro)', (await page.locator('[data-testid="dash-intake"]').count()) === 0)
    await ctx.close()
  })

  // =========================================================================
  section('A261 — חוות : la demande EN PREMIER, sans filtre, visuellement distincte')
  // =========================================================================
  for (const vp of VIEWPORTS) {
    await guard(`A261 ${vp.name}`, async () => {
      const { ctx, page } = await open(vp, { requests: 1, seen: ['farm-req-aq00000001'] })
      await go(page, '/coordinator/farms')
      const tiles = page.locator('[data-testid="farm-tile"]')
      const first = (await tiles.first().textContent()) ?? ''
      check(`${vp.name} — ★ la PREMIÈRE tuile est la demande`, first.includes('חוות הבדיקה'), first.slice(0, 60))
      const filtered = await page.locator('[data-testid="farms-intake"][aria-pressed="true"]').count()
      check(`${vp.name} — sans aucun filtre actif`, filtered === 0)
      const distinct = await tiles.first().evaluate((el) => {
        const s = getComputedStyle(el)
        return { cls: el.className.includes('farm-tile-intake'), ring: s.boxShadow !== 'none', bg: s.backgroundColor }
      })
      check(`${vp.name} — ★ distincte : liseré et fond propres`, distinct.cls && distinct.ring, JSON.stringify(distinct))
      const tag = (await page.locator('[data-testid="farm-tile-intake"]').first().textContent()) ?? ''
      check(`${vp.name} — elle se nomme « בקשה נכנסת » avec sa date`, tag.includes('בקשה נכנסת') && tag.includes('התקבלה'), tag)
      const second = (await tiles.nth(1).evaluate((el) => el.className.includes('farm-tile-intake')))
      check(`${vp.name} — la suivante est une fiche ordinaire`, !second)
      /* Même règle dans le tableau (mode « liste seule »). */
      const hidden = page.locator('[data-testid="map-mode-hidden"]')
      if (await hidden.count()) {
        await hidden.first().click()
        await page.waitForTimeout(1500)
        const firstRow = page.locator('.roster-row[data-intake="true"]').first()
        const rows = await page.locator('.roster-farms .roster-row[type="button"], .roster-farms button.roster-row').allTextContents()
        check(`${vp.name} — tableau : la demande en tête aussi`, (rows[0] ?? '').includes('חוות הבדיקה') && (await firstRow.count()) === 1, (rows[0] ?? '').slice(0, 40))
      }
      await ctx.close()
    })
  }

  // =========================================================================
  section('A262 — la vignette de filtre, visible et recouverte par rien, aux trois largeurs')
  // =========================================================================
  for (const vp of VIEWPORTS) {
    await guard(`A262 ${vp.name}`, async () => {
      const { ctx, page } = await open(vp, { requests: 1, seen: ['farm-req-aq00000001'] })
      await go(page, '/coordinator/farms')
      const ex = await exposure(page, '[data-testid="farms-intake"]')
      check(`${vp.name} — la vignette existe`, !!ex)
      if (ex) {
        check(`${vp.name} — ★ entière dans l'écran`, ex.left >= 0 && ex.right <= ex.vw && ex.top >= 0 && ex.bottom <= ex.vh, `${ex.left}…${ex.right} / ${ex.vw}, ${ex.top}…${ex.bottom} / ${ex.vh}`)
        check(`${vp.name} — ★ recouverte par RIEN (21 points)`, ex.hits === ex.total, `${ex.hits}/${ex.total} ${ex.blockers.join(' ')}`)
        const panel = await page.evaluate(() => {
          const row = document.querySelector('[data-testid="kpi-strip"]')!.getBoundingClientRect()
          const chip = document.querySelector('[data-testid="farms-intake"]')!.getBoundingClientRect()
          return { inRow: chip.left >= row.left - 0.5 && chip.right <= row.right + 0.5 }
        })
        check(`${vp.name} — ★ entière dans sa bande (pas coupée par le bord qui défile)`, panel.inRow)
        const first = await page.evaluate(() => {
          const strip = document.querySelector('[data-testid="kpi-strip"]')!
          const chips = [...strip.querySelectorAll('[data-testid^="farms-"]')] as HTMLElement[]
          return chips[0]?.dataset.testid ?? ''
        })
        check(`${vp.name} — première de la bande`, first === 'farms-intake', first)
      }
      await page.locator('[data-testid="farms-intake"]').first().click()
      await page.waitForTimeout(600)
      const n = await page.locator('[data-testid="farm-tile"]').count()
      check(`${vp.name} — la toucher filtre : une seule fiche`, n === 1, `${n}`)
      await page.locator('[data-testid="farms-intake"]').first().click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${SHOTS}/a262-vignette-${vp.name}.png` })
      await ctx.close()
    })
  }

  // =========================================================================
  section('A263 — le bandeau de nouveauté : au retour, sans minuteur, sans répétition, sans superposition')
  // =========================================================================
  await guard('A263', async () => {
    const { ctx, page, db } = await open({ width: 1032, height: 1376 }, { requests: 1, newVersion: true })
    await go(page, '/coordinator', 6000)
    const banner = page.locator('[data-testid="intake-banner"]')
    check('au démarrage, une demande non vue → le bandeau', (await banner.count()) === 1)
    const body = (await page.locator('[data-testid="intake-banner-body"]').textContent()) ?? ''
    check('il nomme l\'agriculteur et la ferme', body.includes('ישראל ישראלי') && body.includes('חוות הבדיקה'), body)
    check('il dit le rendez-vous demandé', (await page.locator('[data-testid="intake-banner-appointment"]').count()) === 1)

    /* ★ AM6 — le bandeau de mise à jour est là AUSSI : ils s'empilent. */
    const update = page.locator('[data-testid="update-banner"]')
    const hasUpdate = (await update.count()) === 1
    check('(le bandeau de mise à jour est provoqué)', hasUpdate)
    if (hasUpdate) {
      const boxes = await page.evaluate(() => {
        const a = (document.querySelector('[data-testid="update-banner"]')!.firstElementChild as HTMLElement).getBoundingClientRect()
        const b = (document.querySelector('[data-testid="intake-banner"]')!.firstElementChild as HTMLElement).getBoundingClientRect()
        return { a: [a.top, a.bottom].map(Math.round), b: [b.top, b.bottom].map(Math.round), overlap: a.bottom > b.top && b.bottom > a.top && a.right > b.left && b.right > a.left }
      })
      check('★ les deux bandeaux ne se SUPERPOSENT pas, ils s\'empilent', !boxes.overlap, JSON.stringify(boxes))
      await page.screenshot({ path: `${SHOTS}/a263-bandeaux-empiles.png` })
    }

    await page.waitForTimeout(12_000)
    check('★ il ne disparaît PAS seul (12 s plus tard)', (await banner.count()) === 1)

    await page.locator('[data-testid="intake-banner-dismiss"]').click()
    await page.waitForTimeout(500)
    check('« סגירה » le renvoie', (await banner.count()) === 0)

    /* Retour en avant-plan : rien de neuf → rien. */
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(3000)
    check('★ il ne revient pas pour la MÊME demande', (await banner.count()) === 0)

    /* Une demande arrive pendant que l'app est en arrière-plan. */
    const second = requestRows(2, 1)
    db.rows('entities').push(second.entity)
    db.rows('aid_requests').push(second.request)
    await page.waitForTimeout(10_500)
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pageshow'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(5000)
    check('★ au retour en avant-plan, la NOUVELLE demande → le bandeau', (await banner.count()) === 1)
    const body2 = (await page.locator('[data-testid="intake-banner-body"]').textContent()) ?? ''
    const count2 = await banner.getAttribute('data-count')
    check('… et il ne parle que d\'elle', body2.includes('חווה חדשה 2') && count2 === '1', `${count2} · ${body2}`)
    const dash = (await page.locator('[data-testid="dash-intake-count"]').textContent())?.trim()
    check('… et le tableau de bord compte 2, sans recharger', dash === '2', `${dash}`)

    await page.locator('[data-testid="intake-banner-open"]').click()
    await page.waitForTimeout(2500)
    check('« לפתיחה » ouvre la fiche', page.url().includes('/coordinator/farms/farm-req-aq00000002'), page.url())
    check('… et le bandeau est parti', (await banner.count()) === 0)
    await ctx.close()
  })

  // =========================================================================
  section('A264 — une demande ne cesse d\'être entrante que sur un GESTE du PO')
  // =========================================================================
  await guard('A264', async () => {
    const { ctx, page, db } = await open({ width: 1032, height: 1376 }, { requests: 1, seen: ['farm-req-aq00000001'] })
    await go(page, '/coordinator/farms/farm-req-aq00000001', 6000)
    const strip = page.locator('[data-testid="farm-intake-strip"]')
    check('la fiche porte la bande « בקשה מהעמוד הציבורי »', (await strip.count()) === 1)
    const text = (await strip.textContent()) ?? ''
    check('… avec sa date, sa référence, ce qui est demandé', text.includes('התקבלה') && text.includes('AQ0001') && text.includes('שמירה'), text.slice(0, 140))
    check('… le rendez-vous et les documents', text.includes('מועד מבוקש') && text.includes('צורף'))
    check('… et que le courriel n\'est pas parti (AQ3.4)', (await page.locator('[data-testid="farm-intake-mail-problem"]').count()) === 1)
    await page.screenshot({ path: `${SHOTS}/a264-fiche-bande.png` })
    await page.mouse.wheel(0, 800)
    await page.waitForTimeout(4000)
    const row = () => db.rows('entities').find((r) => r.id === 'farm-req-aq00000001')
    check('★ OUVRIR et LIRE la fiche ne la traite pas (en base : toujours entrante)', row()?.status === 'incoming_request', String(row()?.status))
    await go(page, '/coordinator', 4000)
    check('… et le tableau de bord la montre encore', (await page.locator('[data-testid="dash-intake"]').count()) === 1)

    await go(page, '/coordinator/farms/farm-req-aq00000001', 4000)
    await page.locator('[data-testid="farm-intake-handled"]').click()
    await page.waitForTimeout(3000)
    check('★ le geste « טופלה · נוצר קשר » la traite (en base : contacted)', row()?.status === 'contacted', String(row()?.status))
    check('… la bande reste, discrète, sans les boutons', (await page.locator('[data-testid="farm-intake-strip"][data-incoming="false"]').count()) === 1 && (await page.locator('[data-testid="farm-intake-handled"]').count()) === 0)
    await go(page, '/coordinator', 4000)
    check('★ le bloc du tableau de bord a DISPARU', (await page.locator('[data-testid="dash-intake"]').count()) === 0)
    await go(page, '/coordinator/farms', 4000)
    check('… et la vignette aussi', (await page.locator('[data-testid="farms-intake"]').count()) === 0)
    const first = (await page.locator('[data-testid="farm-tile"]').first().textContent()) ?? ''
    check('… et elle a rejoint l\'ordre ordinaire', !first.includes('חוות הבדיקה'))
    await ctx.close()
  })

  // =========================================================================
  section('A267 — le champ de recherche ne passe sous rien : trois largeurs, trois modes')
  // =========================================================================
  for (const vp of VIEWPORTS) {
    for (const mode of ['split', 'hidden', 'full'] as const) {
      await guard(`A267 ${vp.name} ${mode}`, async () => {
        const { ctx, page } = await open(vp, { requests: 1, seen: ['farm-req-aq00000001'] })
        await go(page, '/coordinator/farms', 4500)
        const btn = page.locator(`[data-testid="map-mode-${mode}"]`)
        if (await btn.count()) {
          await btn.first().click()
          await page.waitForTimeout(1200)
        }
        const loupe = page.locator('[data-testid="list-search-open"]:visible')
        if (mode === 'full') {
          /* Carte seule : la liste est repliée, il n'y a pas de champ à recouvrir. */
          check(`${vp.name} carte seule — aucune liste, donc aucun champ (sans objet)`, (await loupe.count()) === 0)
          await ctx.close()
          return
        }
        await loupe.first().click()
        await page.waitForTimeout(700)
        const ex = await exposure(page, '[data-testid="list-search-panel"]')
        const row = await page.evaluate(() => {
          const r = document.querySelector('[data-title-row]')!.getBoundingClientRect()
          return { left: Math.round(r.left), right: Math.round(r.right) }
        })
        check(`${vp.name} ${mode} — le champ s'ouvre`, !!ex)
        if (ex) {
          check(`${vp.name} ${mode} — ★ recouvert par RIEN`, ex.hits === ex.total, `${ex.hits}/${ex.total} ${ex.blockers.join(' ')}`)
          check(`${vp.name} ${mode} — ★ entier dans l'écran`, ex.left >= 0 && ex.right <= ex.vw, `${ex.left}…${ex.right} / ${ex.vw}`)
          check(`${vp.name} ${mode} — ★ pleine largeur du panneau`, Math.abs(ex.left - row.left) <= 1 && Math.abs(ex.right - row.right) <= 1, `champ ${ex.left}…${ex.right}, rangée ${row.left}…${row.right}`)
        }
        await page.locator('[data-testid="list-search"]').fill('חוות')
        await page.waitForTimeout(400)
        check(`${vp.name} ${mode} — on y tape`, (await page.locator('[data-testid="list-search"]').inputValue()) === 'חוות')
        await page.screenshot({ path: `${SHOTS}/a267-recherche-${vp.name}-${mode}.png` })
        await ctx.close()
      })
    }
  }

  // =========================================================================
  section('Captures — tableau de bord et חוות, avec une demande, clair et sombre, trois viewports')
  // =========================================================================
  for (const dark of [false, true]) {
    for (const vp of VIEWPORTS) {
      await guard(`captures ${vp.name}`, async () => {
        const { ctx, page, errors } = await open(vp, { requests: 1, dark })
        const theme = dark ? 'sombre' : 'clair'
        await go(page, '/coordinator', 5500)
        await page.screenshot({ path: `${SHOTS}/tableau-${theme}-${vp.name}.png` })
        await page.locator('[data-testid="intake-banner-dismiss"]').click().catch(() => undefined)
        await go(page, '/coordinator/farms', 4500)
        await page.screenshot({ path: `${SHOTS}/fermes-${theme}-${vp.name}.png` })
        await go(page, '/coordinator/farms/farm-req-aq00000001', 4500)
        await page.screenshot({ path: `${SHOTS}/fiche-${theme}-${vp.name}.png` })
        check(`${theme} ${vp.name} — trois captures, aucune erreur de page`, errors.length === 0, errors.join(' | '))
        await ctx.close()
      })
    }
  }
} finally {
  await browser.close()
  serve?.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
