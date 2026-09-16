import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdirSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AM — LE FORMULAIRE DE FERME, DANS UN NAVIGATEUR. A212 · A213 · A215 · A216 ·
 *      A217 · A218 · A219 · A220 · A221
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run amui                                    # deux builds locaux (démo + réel)
 *   DIST=dist-am-before DIST_REAL=dist-am-before-real SKIP_BUILD=1 bun run amui   # le ROUGE
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run amui                    # le DÉPLOYÉ
 *
 *   A212  le champ יישוב : à vide, les localités PROCHES de l'épingle (pas
 *         l'alphabet) ; en tapant, trente propositions tolérantes aux fautes.
 *   A213  une ferme neuve s'enregistre avec un nom seul (réel : la ligne arrive
 *         en base, sans יישוב, `position_missing`) ; une épingle sans יישוב
 *         PROPOSE la localité la plus proche, n'écrit rien, un geste l'accepte,
 *         la relation « dans / rattachée » est enregistrée.
 *   A215  une personne connue est une carte pré-remplie ; aucune carte vide ;
 *         le bouton d'ajout est APRÈS les personnes et dit « נוסף ».
 *   A216  ת״ז, nom et portable dans la MÊME carte.
 *   A217  les intitulés de l'édition, dans l'ordre, sont ceux du détail.
 *   A218  TOUS les champs de TOUS les écrans : clavier conforme à ce que le
 *         champ contient, jamais `type=number` pour un code, aucun champ sous
 *         16 px — sur WebKit tactile ET sur un pointeur fin.
 *   A219  la barre d'actions couvre jusqu'au bord bas, zone sûre comprise.
 *   A220  deux bandeaux ne se superposent pas ; « מסונכרן » ne suit pas un
 *         enregistrement ordinaire, il suit un retour du réseau.
 *   A221  épingle : un seul contour, tête entière et ronde, contraste tenu sur
 *         vectoriel et satellite, clair et sombre.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const PORT = Number(process.env.AMUI_PORT ?? 5331)
const PORT_REAL = PORT + 1
const OUT = process.env.DIST ?? 'dist-ampass'
const OUT_REAL = process.env.DIST_REAL ?? 'dist-amreal'
const SHOTS = process.env.SHOTS ?? 'docs/screenshots/ampass/local'
const IPAD = { width: 1032, height: 1376 }
const PHONE = { width: 402, height: 874 }
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

const serves: Array<ReturnType<typeof Bun.spawn>> = []
async function serveBuild(out: string, port: number, real: boolean): Promise<string> {
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: real ? 'https://fake.supabase.co' : '',
    VITE_SUPABASE_PUBLISHABLE_KEY: real ? 'x' : '',
  }
  if (process.env.SKIP_BUILD !== '1') {
    const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', out], { env, stdout: 'ignore', stderr: 'pipe' })
    if ((await build.exited) !== 0) {
      console.error(await new Response(build.stderr).text())
      throw new Error(`vite build failed (${out})`)
    }
  }
  serves.push(
    Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', out, '--port', String(port), '--strictPort'], {
      env,
      stdout: 'ignore',
      stderr: 'ignore',
    }),
  )
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

const demo = REMOTE ? `${REMOTE}/demo` : await serveBuild(OUT, PORT, false)
const real = REMOTE ?? (await serveBuild(OUT_REAL, PORT_REAL, true))
console.log(`  démo : ${demo}\n  réel : ${real}`)

async function open(page: Page, base: string, hash: string, settle = 2600): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

async function context(browser: Browser, viewport = IPAD, touch = true): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport,
    hasTouch: touch,
    locale: 'he-IL',
    permissions: ['geolocation'],
    geolocation: { latitude: 31.0611, longitude: 34.6552 },
  })
  ctx.setDefaultTimeout(8000)
  return ctx
}

/* Une section qui casse (un sélecteur absent sur le build d'AVANT) compte
   comme un échec NOMMÉ et laisse les suivantes se mesurer. */
async function guard(run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    check('section interrompue', false, (e as Error).message.split('\n')[0])
  }
}

const saveButton = '[data-testid="form-actions"] .btn-primary'

const chrome = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const safari = await webkit.launch()

try {
  // =========================================================================
  section('A212 — le champ יישוב : la liste entière, et ce qu\'elle montre à vide')
  // =========================================================================
  await guard(async () => {
    const ctx = await context(chrome)
    const page = await ctx.newPage()
    await open(page, demo, '#/coordinator/farms/farm-01/edit')
    const field = page.locator('[data-testid="farm-form-locality"]')
    const reached = (await field.count()) > 0
    check('le champ יישוב de l\'édition est identifiable', reached)
    const input = reached ? field : page.getByRole('combobox').first()
    await input.fill('')
    await input.focus()
    await page.waitForTimeout(400)
    const emptyOptions = await page.locator('[role="listbox"] [role="option"]').allInnerTexts()
    check(
      'à champ vide, avec une épingle : les localités PROCHES, avec leur distance',
      emptyOptions.length >= 5 && emptyOptions.every((o) => /ק״מ/.test(o)),
      emptyOptions.slice(0, 3).join(' | ').replace(/\n/g, ' '),
    )
    check(
      'et plus les huit premières de l\'alphabet (אבו גוש…)',
      !emptyOptions.some((o) => o.startsWith('אבו גוש')),
    )
    await input.fill('כפר')
    await page.waitForTimeout(400)
    const many = await page.locator('[role="listbox"] [role="option"]').count()
    check('« כפר » : trente propositions, pas huit', many >= 30, `${many}`)
    const scrolls = await page.locator('[role="listbox"]').evaluate((ul) => ul.scrollHeight > ul.clientHeight + 10).catch(() => false)
    check('la liste DÉFILE', scrolls)
    await input.fill('באר שבה')
    await page.waitForTimeout(400)
    const typo = await page.locator('[role="listbox"] [role="option"]').allInnerTexts()
    check('« באר שבה » (une faute) propose באר שבע', typo.some((o) => o.includes('באר שבע')), typo.slice(0, 3).join(' | '))
    await input.fill('חריש')
    await page.waitForTimeout(400)
    const alias = await page.locator('[role="listbox"] [role="option"]').allInnerTexts()
    check('« חריש » (graphie du למ״ס) est trouvé', alias.some((o) => o.includes('חריש')), alias.slice(0, 3).join(' | '))
    await page.screenshot({ path: `${SHOTS}/a212-liste.png` })
    await ctx.close()
  })

  // =========================================================================
  section('A213 — sans יישוב, sans épingle ; la localité proche PROPOSÉE')
  // =========================================================================
  await guard(async () => {
    // (a) démo : un nom seul suffit.
    const ctx = await context(chrome)
    const page = await ctx.newPage()
    await open(page, demo, '#/coordinator/farms/new')
    await page.locator('[data-testid="farm-form-name"]').fill('חוות הבודד בנגב')
    await page.locator(saveButton).click()
    await page.waitForTimeout(1500)
    const url = page.url()
    check('une ferme neuve, un NOM seul, s\'enregistre', /#\/coordinator\/farms\/farm-/.test(url) && !url.endsWith('/new'), url.replace(demo, ''))
    await ctx.close()
  })
  await guard(async () => {
    // (b) réel + base factice : la ligne arrive en base.
    const db = new FakeDb()
    db.seed()
    const ctx = await context(chrome)
    await installFakeSupabase(ctx, db)
    await installFakeSession(ctx)
    const page = await ctx.newPage()
    await open(page, real, '#/coordinator/farms/new', 3500)
    await page.locator('[data-testid="farm-form-name"]').fill('חוות מבודדת')
    await page.locator('[data-testid="farm-form-farmerName"]').fill('דני בראל')
    await page.locator('[data-testid="farm-form-farmerPhone"]').fill('0521234567')
    await page.locator(saveButton).click()
    await page.waitForTimeout(4000)
    const row = db.rows('entities').find((r) => r.name === 'חוות מבודדת')
    check('build RÉEL : la fiche sans יישוב ni épingle arrive en base', Boolean(row), `${db.rows('entities').length} ligne(s)`)
    check('… sans יישוב, et marquée sans position', Boolean(row) && !row?.locality && row?.position_missing === true)
    check('… le portable tapé « 0521234567 » est enregistré 052-1234567', row?.farmer_phone === '052-1234567', String(row?.farmer_phone))
    const contacts = db.rows('entity_contacts').filter((c) => c.entity_id === row?.id)
    check('… et l\'agriculteur devient la ligne de contact principale (une seule)', contacts.length === 1 && contacts[0].is_primary === true, `${contacts.length}`)
    await ctx.close()
  })
  await guard(async () => {
    // (c) une épingle, pas de יישוב : la suggestion.
    const ctx = await context(chrome)
    const page = await ctx.newPage()
    await open(page, demo, '#/coordinator/farms/farm-01/edit')
    const input = page.locator('[data-testid="farm-form-locality"]')
    await input.fill('')
    await page.locator('[data-testid="farm-form-name"]').click()
    await page.waitForTimeout(400)
    const suggestion = page.locator('[data-testid="farm-locality-suggestion"]')
    const shown = (await suggestion.count()) > 0
    const name = shown ? await page.locator('[data-testid="farm-locality-suggestion-name"]').innerText() : ''
    check('épingle posée, champ vide : la localité la plus proche est PROPOSÉE', shown && name.trim() !== '', name)
    check('… et le champ reste VIDE tant que rien n\'est touché', (await input.inputValue().catch(() => 'x')) === '')
    if (shown) {
      await page.locator('[data-testid="farm-locality-adopt"]').click()
      await page.waitForTimeout(300)
    }
    check('un geste l\'accepte : le champ porte le nom proposé', shown && (await input.inputValue()) === name.trim())
    const chosen = await page.locator('[data-testid^="farm-locality-relation-"][aria-checked="true"]').count()
    check('… et la relation « dans / rattachée » est déduite de la distance, modifiable', chosen === 1)
    await input.fill(name.trim() === 'רתמים' ? 'טללים' : 'רתמים')
    const attached = page.locator('[data-testid="farm-locality-relation-attached"]')
    if ((await attached.getAttribute('aria-checked').catch(() => null)) !== 'true') await attached.click().catch(() => undefined)
    await page.waitForTimeout(200)
    await page.locator('[data-testid="farm-form-name"]').click()
    check('la valeur reste MODIFIABLE (tapée par-dessus)', (await input.inputValue()) !== name.trim())
    await page.locator(saveButton).click()
    await page.waitForTimeout(1500)
    const shownValue = await page.locator('[data-testid="farm-locality-value"]').innerText().catch(() => '')
    check('le détail dit « משויכת ל… » après enregistrement', /משויכת ל/.test(shownValue), shownValue)
    await page.screenshot({ path: `${SHOTS}/a213-detail.png` })
    await ctx.close()
  })

  // =========================================================================
  section('A215 · A216 — une personne connue s\'édite en place ; ת״ז à côté')
  // =========================================================================
  await guard(async () => {
    const db = new FakeDb()
    db.seed()
    const ctx = await context(chrome)
    await installFakeSupabase(ctx, db)
    await installFakeSession(ctx)
    const page = await ctx.newPage()
    // Le cas du PO : nom + portable dans les colonnes de l'agriculteur, AUCUN contact.
    db.rows('entities').push({
      id: 'farm-am-dani', kind: 'farm', name: 'חוות דני', locality: '', region: '', type: 'unknown',
      status: 'to_contact', lat: 31.2, lng: 34.8, position_missing: false, farm_dunams: 0, grazing_dunams: 0,
      notes: '', farmer_name: 'דני בראל', farmer_phone: '052-1234567', farmer_id_no: '021985189',
    })
    await open(page, real, '#/coordinator/farms/farm-am-dani/edit', 4000)
    const farmerCard = page.locator('[data-testid="person-farmer"]')
    const reached = (await farmerCard.count()) > 0
    check('la fiche de דני בראל a UNE carte « החקלאי »', reached)
    const nameValue = await page.locator('[data-testid="farm-form-farmerName"]').inputValue().catch(() => '')
    const phoneValue = await page.locator('[data-testid="farm-form-farmerPhone"]').inputValue().catch(() => '')
    const idValue = await page.locator('[data-testid="farm-farmer-id"]').inputValue().catch(() => '')
    check('pré-remplie : nom', nameValue === 'דני בראל', nameValue)
    check('pré-remplie : portable, mis en forme', phoneValue === '(052) 123-4567', phoneValue)
    check('pré-remplie : ת״ז, zéro initial compris', idValue === '021985189', idValue)
    const inCard = async (testId: string) => farmerCard.locator(`[data-testid="${testId}"]`).count()
    check(
      'A216 — ת״ז, nom et portable sont dans la MÊME carte',
      reached && (await inCard('farm-farmer-id')) === 1 && (await inCard('farm-form-farmerName')) === 1 && (await inCard('farm-form-farmerPhone')) === 1,
    )
    const cards = await page.locator('[data-testid^="person-contact-"]').count()
    check('aucune carte de contact vide au-dessus ou au-dessous', cards === 0, `${cards}`)
    const addText = await page.locator('[data-testid="person-add"]').innerText().catch(() => '')
    check('le bouton d\'ajout dit « נוסף », pas « הוספת איש קשר » tout court', /נוסף/.test(addText), addText)
    const addAfter = await page.evaluate(() => {
      const add = document.querySelector('[data-testid="person-add"]')
      const card = document.querySelector('[data-testid="person-farmer"]')
      return Boolean(add && card && card.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    check('et il est APRÈS la personne existante', addAfter)
    const oldAdd = await page.getByText('הוספת איש קשר', { exact: true }).count()
    check('plus aucun « הוספת איש קשר » au-dessus des personnes', oldAdd === 0)
    await farmerCard.screenshot({ path: `${SHOTS}/a215-carte-agriculteur.png` }).catch(() => undefined)
    // Modifier en place, enregistrer, rouvrir : toujours une carte, pas de doublon.
    await page.locator('[data-testid="person-farmer-email"]').fill('dani@example.co.il')
    await page.locator(saveButton).click()
    await page.waitForTimeout(4000)
    const contacts = db.rows('entity_contacts').filter((c) => c.entity_id === 'farm-am-dani')
    check('enregistrer : une seule ligne de contact, et c\'est lui', contacts.length === 1 && contacts[0].name === 'דני בראל', `${contacts.length}`)
    await open(page, real, '#/coordinator/farms/farm-am-dani/edit', 4000)
    check(
      'rouvrir : toujours une seule carte, courriel retrouvé',
      (await page.locator('[data-testid^="person-contact-"]').count()) === 0 &&
        (await page.locator('[data-testid="person-farmer-email"]').inputValue().catch(() => '')) === 'dani@example.co.il',
    )
    await ctx.close()
  })

  // =========================================================================
  section('A217 — l\'ordre et les intitulés de l\'édition sont ceux du détail')
  // =========================================================================
  for (const farm of ['farm-01', 'farm-02']) {
    const ctx = await context(chrome)
    const page = await ctx.newPage()
    await open(page, demo, `#/coordinator/farms/${farm}/edit`)
    const form = await page.$$eval('[data-farm-form] [data-block-title]', (els) =>
      els.map((e) => e.getAttribute('data-block-title') ?? ''),
    )
    await open(page, demo, `#/coordinator/farms/${farm}`)
    const detail = await page.$$eval('[data-block-title]', (els) => els.map((e) => e.getAttribute('data-block-title') ?? ''))
    const editable = form.slice(1) // l'en-tête (photo, nom) est l'en-tête de la fiche
    const inDetail = detail.filter((d) => editable.includes(d))
    check(
      `${farm} : chaque bloc de l'édition existe au détail, sous le même intitulé`,
      editable.length >= 6 && editable.every((e) => detail.includes(e)),
      editable.filter((e) => !detail.includes(e)).join(', '),
    )
    check(`${farm} : dans le même ordre`, JSON.stringify(inDetail) === JSON.stringify(editable), `édition ${editable.join(' › ')} | détail ${inDetail.join(' › ')}`)
    await ctx.close()
  }

  // =========================================================================
  section('A218 — tous les champs de tous les écrans : clavier et taille')
  // =========================================================================
  type Visit = { name: string; hash: string; session?: string; act?: (page: Page) => Promise<void> }
  const expandAll = async (page: Page) => {
    for (let round = 0; round < 4; round++) {
      const closed = page.locator('[data-testid^="block-"][aria-expanded="false"]:visible, [data-testid^="section-"][aria-expanded="false"]:visible')
      const n = await closed.count()
      if (n === 0) break
      for (let i = 0; i < n; i++) await closed.nth(0).click({ timeout: 1500 }).catch(() => undefined)
      await page.waitForTimeout(250)
    }
  }
  const VISITS: Visit[] = [
    { name: 'dashboard', hash: '#/coordinator' },
    { name: 'agenda', hash: '#/coordinator/agenda' },
    { name: 'farms', hash: '#/coordinator/farms', act: async (p) => { await p.locator('[data-testid="list-search-toggle"], [aria-label="חיפוש"]').first().click({ timeout: 1500 }).catch(() => undefined) } },
    { name: 'farm-detail', hash: '#/coordinator/farms/farm-01', act: expandAll },
    { name: 'farm-detail · הסכם', hash: '#/coordinator/farms/farm-01', act: async (p) => { await p.locator('[data-testid="farm-open-assoc-form"]').first().click({ timeout: 2000 }).catch(() => undefined) } },
    { name: 'farm-detail · ארכיון', hash: '#/coordinator/farms/farm-01', act: async (p) => { await p.locator('[data-testid="farm-archive"]').first().click({ timeout: 2000 }).catch(() => undefined) } },
    { name: 'farm-detail · מחיקה', hash: '#/coordinator/farms/farm-01', act: async (p) => { await p.locator('[data-testid="delete-entity"]').first().click({ timeout: 2000 }).catch(() => undefined) } },
    { name: 'farm-form', hash: '#/coordinator/farms/farm-01/edit', act: expandAll },
    { name: 'farm-form-new', hash: '#/coordinator/farms/new', act: async (p) => { await expandAll(p); await p.locator('[data-testid="person-add"]').click().catch(() => undefined) } },
    { name: 'anchor-form', hash: '#/coordinator/farms/farm-01/anchors/anchor-01/edit' },
    { name: 'anchor-form-new', hash: '#/coordinator/farms/farm-01/anchors/new' },
    { name: 'route-planner', hash: '#/coordinator/route' },
    { name: 'free-route', hash: '#/coordinator/route/free' },
    { name: 'volunteers · modal', hash: '#/coordinator/volunteers', act: async (p) => { await p.locator('[data-testid="action-fab-toggle"]').click({ timeout: 2000 }).catch(() => undefined); await p.waitForTimeout(400); const item = p.locator('[data-testid^="action-fab-item"]').first(); if (await item.count()) await item.click().catch(() => undefined) } },
    { name: 'drivers · modal', hash: '#/coordinator/drivers', act: async (p) => { await p.locator('[data-testid="driver-tile-open"]:visible').first().click({ timeout: 2000 }).catch(() => undefined) } },
    { name: 'import', hash: '#/coordinator/volunteers/import' },
    { name: 'missions', hash: '#/coordinator/missions' },
    { name: 'wizard', hash: '#/coordinator/missions/new?resume=mission-01' },
    { name: 'mission-detail', hash: '#/coordinator/missions/mission-01' },
    { name: 'incidents', hash: '#/coordinator/incidents' },
    { name: 'incident-detail', hash: '#/coordinator/incidents/inc-01' },
    { name: 'settings', hash: '#/coordinator/settings', act: expandAll },
    { name: 'export', hash: '#/coordinator/export' },
    { name: 'farmer-sign', hash: '#/farmer/sign', session: 'farmer:contact-01a' },
    { name: 'farmer-documents', hash: '#/farmer/documents', session: 'farmer:contact-01a' },
    { name: 'farmer-report', hash: '#/farmer/report', session: 'farmer:contact-01a' },
    { name: 'volunteer-report', hash: '#/volunteer/report', session: 'volunteer:vol-001' },
    { name: 'driver', hash: '#/driver', session: 'driver:drv-03' },
  ]
  const sweep = async (browser: Browser, label: string, touch: boolean, viewport: { width: number; height: number }) => {
    const ctx = await context(browser, viewport, touch)
    const page = await ctx.newPage()
    const violations: string[] = []
    let fields = 0
    let screens = 0
    for (const v of VISITS) {
      try {
        await open(page, demo, '#/coordinator', 600)
        if (v.session) {
          if ((await page.locator('select').count()) === 0) await page.locator('[data-testid="devbar-toggle"]').click({ timeout: 2000 }).catch(() => undefined)
          await page.selectOption('select', v.session, { timeout: 3000 })
          await page.waitForTimeout(800)
        }
        await page.goto(`${demo}/${v.hash}`, { waitUntil: 'load' })
        await page.waitForTimeout(2200)
        if (v.act) {
          await v.act(page)
          await page.waitForTimeout(700)
        }
        const found = await page.evaluate(() => {
          const out: Array<{ label: string; problems: string[] }> = []
          const skip = new Set(['checkbox', 'radio', 'hidden', 'file', 'range', 'color', 'submit', 'button'])
          const els = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')].filter(
            (el) => !(el instanceof HTMLInputElement && skip.has(el.type)) && !el.closest('[data-testid^="devbar"]'),
          )
          for (const el of els) {
            const labelEl = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null)
            const label = (labelEl?.querySelector('.label')?.textContent ?? labelEl?.textContent ?? el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.getAttribute('data-testid') ?? '?').trim().slice(0, 60)
            const type = el instanceof HTMLInputElement ? el.type : 'textarea'
            const mode = el.getAttribute('inputmode') ?? ''
            const kind = el.getAttribute('data-kind')
            const problems: string[] = []
            const size = parseFloat(getComputedStyle(el).fontSize)
            if (size < 16) problems.push(`police ${size}px`)
            const expect =
              type === 'textarea' ? null
              : /ת["״]?ז|ח["״]?פ/.test(label) ? 'id'
              : /טלפון|נייד|פלאפון|מוקד|כונן/.test(label) ? 'phone'
              : /מייל|דוא["״]?ל|אימייל|email/i.test(label) ? 'email'
              : /דונם|^שטח (מעובד|מרעה)|^שטחים שמירה/.test(label) ? 'decimal'
              : /סמל יישוב/.test(label) ? 'code'
              : /מקומות|גיל|ראשים|דקות|אחוז|%|ימים|נדרשים|כמות/.test(label) ? 'integer'
              : null
            const temporal = ['date', 'time', 'datetime-local', 'password', 'search'].includes(type)
            if (!temporal && expect && ['id', 'phone', 'code', 'integer'].includes(expect)) {
              if (mode !== 'numeric') problems.push(`${expect} sans pavé numérique (inputmode="${mode}", type=${type})`)
              if (type === 'number' && expect !== 'integer') problems.push(`${expect} en type=number (zéro initial perdu)`)
              if (type === 'tel') problems.push(`${expect} en type=tel (clavier téléphone, pas le pavé)`)
            }
            if (!temporal && expect === 'decimal' && !['numeric', 'decimal'].includes(mode)) problems.push(`surface sans pavé numérique (inputmode="${mode}")`)
            if (!temporal && expect === 'email' && type !== 'email' && mode !== 'email') problems.push('courriel sans clavier courriel')
            if (!temporal && expect === null && (mode === 'numeric' || mode === 'decimal') && !kind) problems.push(`texte « ${label} » avec pavé numérique`)
            if (kind && expect && kind !== expect && !(expect === 'integer' && kind === 'decimal')) problems.push(`data-kind=${kind} mais l'intitulé dit ${expect}`)
            if (kind === 'phone' || kind === 'id' || kind === 'code' || kind === 'integer') {
              if (mode !== 'numeric') problems.push(`data-kind=${kind} sans inputmode=numeric`)
            }
            out.push({ label, problems })
          }
          return out
        })
        screens++
        fields += found.length
        for (const f of found) for (const p of f.problems) violations.push(`${v.name} · « ${f.label} » : ${p}`)
      } catch (e) {
        violations.push(`${v.name} : écran non atteint (${(e as Error).message.split('\n')[0]})`)
      }
    }
    check(`${label} : ${screens}/${VISITS.length} écrans, ${fields} champs — aucun clavier faux, aucun champ sous 16 px`, violations.length === 0 && screens === VISITS.length && fields > 60, violations.slice(0, 12).join('\n          '))
    if (violations.length > 12) console.log(`          … et ${violations.length - 12} de plus`)
    await ctx.close()
  }
  await sweep(safari, 'WebKit tactile, iPad', true, IPAD)
  await sweep(chrome, 'Chromium, pointeur FIN (iPad au trackpad, bureau)', false, { width: 1440, height: 1000 })

  // =========================================================================
  section('A219 — la barre d\'actions couvre jusqu\'au bord bas')
  // =========================================================================
  for (const [label, viewport, safe] of [['iPad installé', IPAD, 20], ['iPhone', PHONE, 34]] as const) {
    for (const [screen, hash] of [['fiche ferme', '#/coordinator/farms/farm-01/edit'], ['assistant de garde', '#/coordinator/missions/new?resume=mission-01']] as const) {
      const ctx = await context(safari, viewport)
      const page = await ctx.newPage()
      await open(page, demo, hash)
      const r = await page.evaluate((s) => {
        document.documentElement.style.setProperty('--safe-bottom', `${s}px`)
        for (const e of document.querySelectorAll<HTMLElement>('[data-testid^="devbar"]')) e.style.display = 'none'
        return new Promise<{ bar: boolean; uncovered: number; opaque: boolean }>((resolve) =>
          setTimeout(() => {
            const bars = [...document.querySelectorAll<HTMLElement>('.fixed.z-30')].filter((b) => getComputedStyle(b).position === 'fixed' && b.getBoundingClientRect().bottom > window.innerHeight - 200 && b.querySelector('button'))
            const bar = bars[0]
            if (!bar) return resolve({ bar: false, uncovered: -1, opaque: false })
            const rect = bar.getBoundingClientRect()
            let uncovered = 0
            for (let y = Math.floor(rect.bottom); y < window.innerHeight; y++) {
              for (const x of [rect.left + 8, rect.left + rect.width / 2, rect.right - 8]) {
                const el = document.elementFromPoint(x, y)
                if (!el || !bar.contains(el)) {
                  uncovered++
                  break
                }
              }
            }
            const bg = getComputedStyle(bar).backgroundColor
            const after = getComputedStyle(bar, '::after').backgroundColor
            const alpha = (c: string) => (/rgba\(.*,\s*([\d.]+)\)/.exec(c)?.[1] ?? '1')
            resolve({ bar: true, uncovered, opaque: alpha(bg) === '1' && (Number(getComputedStyle(bar, '::after').height.replace('px', '')) === 0 || alpha(after) === '1') })
          }, 600),
        )
      }, safe)
      check(`${label} · ${screen} : interstice visible sous la barre = 0 px (zone sûre ${safe} px)`, r.bar && r.uncovered === 0, `${r.uncovered} px de contenu visible`)
      check(`${label} · ${screen} : barre et prolongement opaques`, r.bar && r.opaque)
      await ctx.close()
    }
  }

  // =========================================================================
  section('A220 — les bandeaux s\'empilent ; « מסונכרן » sur changement d\'état seulement')
  // =========================================================================
  for (const viewport of [IPAD, { width: 1376, height: 1032 }]) {
    await guard(async () => {
      // Le cas du PO : « האפליקציה עודכנה · הגרסה הפעילה » ouvert par-dessus
      // « גררו את הסיכה ». Le verdict d'une mise à jour réussie, posé comme
      // l'app le pose après son rechargement.
      const ctx = await context(chrome, viewport)
      await ctx.addInitScript(() => {
        if (sessionStorage.getItem('am-verdict')) return
        sessionStorage.setItem('am-verdict', '1')
        localStorage.setItem('lo-yanum:update-verdict', JSON.stringify({ from: 'avant', to: 'apres', ok: true, at: Date.now() }))
      })
      const page = await ctx.newPage()
      await page.goto(`${demo}/#/coordinator/farms/farm-01/edit`, { waitUntil: 'load' })
      await page.waitForTimeout(2500)
      const measure = () =>
        page.evaluate(() => {
          const card = document.querySelector<HTMLElement>('[data-testid="update-banner"]')?.firstElementChild?.getBoundingClientRect()
          const pin = document.querySelector<HTMLElement>('[data-testid="pin-panel"]')?.getBoundingClientRect()
          const hit = Boolean(card && pin && card.left < pin.right && card.right > pin.left && card.top < pin.bottom && card.bottom > pin.top)
          return { banner: Boolean(card), pin: Boolean(pin), hit, card: card && [card.left, card.top, card.right, card.bottom].map(Math.round), pinBox: pin && [pin.left, pin.top, pin.right, pin.bottom].map(Math.round) }
        })
      const first = await measure()
      await page.screenshot({ path: `${SHOTS}/a220-mise-a-jour-${viewport.width}.png` })
      check(`${viewport.width} px : le bandeau de mise à jour ET le panneau de l'épingle sont à l'écran`, first.banner && first.pin)
      check(`${viewport.width} px : ils ne se superposent pas`, first.banner && first.pin && !first.hit, `bandeau ${first.card} · épingle ${first.pinBox}`)
      await page.waitForTimeout(9000)
      const later = await measure()
      const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('lo-yanum:update-verdict') ?? '{}').seen === true)
      check(`${viewport.width} px : la confirmation s'en va d'elle-même et ne reviendra pas (lue)`, !later.banner && seen)
      await page.reload({ waitUntil: 'load' })
      await page.waitForTimeout(2500)
      check(`${viewport.width} px : rouvrir l'app ne la ré-affiche pas`, (await page.locator('[data-testid="update-banner"]').count()) === 0)
      await ctx.close()
    })
  }
  await guard(async () => {
    const ctx = await context(chrome, PHONE)
    const page = await ctx.newPage()
    await open(page, demo, '#/coordinator/farms/farm-01/edit', 3500)
    // Un bandeau flottant déjà posé en haut (la forme de la bannière de mise à jour).
    await page.evaluate(() => {
      const b = document.createElement('div')
      b.setAttribute('data-top-banner-float', 'gate')
      b.setAttribute('data-testid', 'gate-float')
      b.style.cssText = 'position:fixed;top:8px;left:16px;right:16px;height:64px;background:#fff;z-index:50'
      document.body.appendChild(b)
    })
    await ctx.setOffline(true)
    await page.waitForTimeout(1200)
    await ctx.setOffline(false)
    const samples: Array<{ phase: string | null; overlaps: string[] }> = []
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(250)
      samples.push(
        await page.evaluate(() => {
          const pill = document.querySelector<HTMLElement>('[data-testid="network-status"], [data-testid="offline-badge"]')
          const painted = pill?.firstElementChild as HTMLElement | undefined
          const overlaps: string[] = []
          if (painted) {
            const a = painted.getBoundingClientRect()
            for (const el of document.querySelectorAll<HTMLElement>('[data-top-banner], [data-top-banner-float]')) {
              const b = el.getBoundingClientRect()
              if (b.width === 0) continue
              if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps.push(el.dataset.topBanner ?? el.dataset.topBannerFloat ?? '?')
            }
          }
          return { phase: pill?.getAttribute('data-phase') ?? null, overlaps }
        }),
      )
    }
    const done = samples.filter((s) => s.phase === 'done')
    check('retour du réseau : « מסונכרן » s\'affiche (un changement d\'état)', done.length > 0, samples.map((s) => s.phase).join(','))
    check(
      'et il ne recouvre NI le panneau de l\'épingle NI un bandeau déjà posé',
      samples.every((s) => s.overlaps.length === 0),
      samples.flatMap((s) => s.overlaps).join(', '),
    )
    await page.screenshot({ path: `${SHOTS}/a220-empilement.png` })
    await ctx.close()
  })
  await guard(async () => {
    const db = new FakeDb()
    db.seed()
    const ctx = await context(chrome, PHONE)
    await installFakeSupabase(ctx, db)
    await installFakeSession(ctx)
    const page = await ctx.newPage()
    await open(page, real, '#/coordinator/farms/new', 3500)
    await page.evaluate(() => {
      ;(window as unknown as { __phases: string[] }).__phases = []
      const seen = (window as unknown as { __phases: string[] }).__phases
      new MutationObserver(() => {
        const p = document.querySelector('[data-testid="network-status"]')?.getAttribute('data-phase')
        if (p && seen[seen.length - 1] !== p) seen.push(p)
      }).observe(document.body, { subtree: true, childList: true, attributes: true })
    })
    await page.locator('[data-testid="farm-form-name"]').fill('חוות סנכרון')
    await page.locator(saveButton).click()
    await page.waitForTimeout(5000)
    const phases = await page.evaluate(() => (window as unknown as { __phases: string[] }).__phases)
    const reached = db.rows('entities').some((r) => r.name === 'חוות סנכרון')
    check('build réel : l\'enregistrement ordinaire est bien parti en base', reached)
    check('… et AUCUN « מסונכרן » ni « ממתינים » ne l\'a suivi', reached && !phases.includes('done') && !phases.includes('pending'), phases.join(',') || 'rien')
    await ctx.close()
  })

  // =========================================================================
  section('A221 — l\'épingle : un contour, une tête entière et ronde, du contraste')
  // =========================================================================
  const lum = (r: number, g: number, b: number) => {
    const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  for (const theme of ['light', 'dark'] as const) {
    for (const mapBase of ['vector', 'satellite'] as const) {
      const ctx = await chrome.newContext({ viewport: IPAD, deviceScaleFactor: 2, colorScheme: theme, locale: 'he-IL' })
      await ctx.addInitScript(([th, mb]) => {
        localStorage.setItem('lo-yanum:map-base', mb)
        localStorage.setItem('lo-yanum:theme:coordinator', th)
      }, [theme, mapBase])
      const page = await ctx.newPage()
      await open(page, demo, '#/coordinator/farms', 9000)
      const geo = await page.$$eval('.maplibregl-marker [data-marker-kind="farm"] svg, .maplibregl-marker svg', (svgs) =>
        svgs
          .map((svg) => {
            const paths = [...svg.querySelectorAll('path')].filter((p) => (p.getAttribute('stroke') ?? 'none') !== 'none' && !p.closest('g'))
            const vb = (svg.getAttribute('viewBox') ?? '0 0 0 0').split(/\s+/).map(Number)
            const r = svg.getBoundingClientRect()
            const d = paths[0]?.getAttribute('d') ?? ''
            const needle = /a9 9 0 1 1/.test(d)
            const stroke = Number(paths[0]?.getAttribute('stroke-width') ?? 0)
            return {
              needle,
              outlines: paths.length,
              halo: svg.innerHTML.includes('rgba(0,0,0,.45)'),
              headTopInBox: vb[1] <= 8.93 - 9 - stroke / 2 + 1e-6,
              sidesInBox: vb[0] <= 3 - stroke / 2 + 1e-6 && vb[0] + vb[2] >= 21 + stroke / 2 - 1e-6,
              round: Math.abs(r.width / r.height - vb[2] / vb[3]) < 0.02,
              box: { x: r.x, y: r.y, w: r.width, h: r.height },
              fill: paths[0]?.getAttribute('fill') ?? '',
              ring: paths[0]?.getAttribute('stroke') ?? '',
            }
          })
          .filter((p) => p.needle && p.box.y > 60 && p.box.x > 60 && p.box.x < 900 && p.box.y < 1200),
      )
      const tag = `${theme} · ${mapBase}`
      check(`${tag} : des épingles à mesurer`, geo.length > 0, `${geo.length}`)
      check(`${tag} : UN seul contour par épingle, plus de halo sombre`, geo.length > 0 && geo.every((g) => g.outlines === 1 && !g.halo))
      check(`${tag} : la tête et son trait tiennent dans la boîte (rien de rogné)`, geo.length > 0 && geo.every((g) => g.headTopInBox && g.sidesInBox))
      check(`${tag} : boîte au rapport du dessin (le cercle reste rond)`, geo.length > 0 && geo.every((g) => g.round))
      if (geo.length > 0) {
        const g = geo[0]
        const shot = await page.screenshot({ clip: { x: g.box.x - 10, y: g.box.y - 4, width: g.box.w + 20, height: g.box.h + 8 } })
        await Bun.write(`${SHOTS}/a221-${theme}-${mapBase}.png`, shot)
        // Le fond, lu à 8 px à gauche de la tête, marqueurs masqués.
        await page.addStyleTag({ content: '.maplibregl-marker{visibility:hidden!important}' })
        await page.waitForTimeout(300)
        const bgShot = await page.screenshot({ clip: { x: Math.max(0, g.box.x - 8), y: g.box.y + g.box.h * 0.3, width: 4, height: 4 } })
        const png = await import('pngjs').catch(() => null)
        let bgL = NaN
        if (png) {
          const img = png.PNG.sync.read(bgShot)
          bgL = lum(img.data[0], img.data[1], img.data[2])
        } else {
          const b64 = bgShot.toString('base64')
          bgL = await page.evaluate(async (src) => {
            const im = new Image()
            im.src = `data:image/png;base64,${src}`
            await im.decode()
            const c = document.createElement('canvas')
            c.width = im.width
            c.height = im.height
            const x = c.getContext('2d')!
            x.drawImage(im, 0, 0)
            const [r, gg, b] = x.getImageData(1, 1, 1, 1).data
            const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
            return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b)
          }, b64)
        }
        const hex = (h: string) => {
          const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
          if (!m) return NaN
          const n = parseInt(m[1], 16)
          return lum((n >> 16) & 255, (n >> 8) & 255, n & 255)
        }
        const resolve = (c: string) =>
          page.evaluate((color) => {
            const probe = document.createElement('i')
            probe.style.color = color
            document.body.appendChild(probe)
            const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).color)
            probe.remove()
            if (!m) return NaN
            const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
            return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3])
          }, c)
        const ringL = Number.isNaN(hex(g.ring)) ? await resolve(g.ring) : hex(g.ring)
        const fillL = Number.isNaN(hex(g.fill)) ? await resolve(g.fill) : hex(g.fill)
        const best = Math.max(ratio(ringL, bgL), Number.isNaN(fillL) ? 0 : ratio(fillL, bgL))
        check(`${tag} : contraste contour ou remplissage / fond ≥ 3:1`, best >= 3, `contour ${ratio(ringL, bgL).toFixed(1)}:1, remplissage ${Number.isNaN(fillL) ? '?' : ratio(fillL, bgL).toFixed(1)}:1`)
      }
      await ctx.close()
    }
  }
} finally {
  await chrome.close()
  await safari.close()
  for (const s of serves) s.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
