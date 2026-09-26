import { mkdirSync } from 'node:fs'

import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page, Route } from 'playwright'

import { jerusalemInstant } from '../src/core/availability'
import { AUTO_ADVANCE_DELAY_MS, AUTO_ADVANCE_STEPS } from '../src/core/request'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AR — LE FORMULAIRE PUBLIC AVANCE SEUL, ET LE RETOUR NE PERD RIEN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run arui                                                   # build local
 *   AR_ENGINES=chromium BASE_URL=https://azmer-fts.github.io/lo-yanum/bakasha/ bun run arui
 *   CAPTURES=1 …                                                   # + les captures
 *
 *   A268  les deux étapes à choix unique avancent seules après un toucher,
 *         APRÈS un délai qui laisse voir la coche ; aucun « המשך » dessus ;
 *         le dernier choix gagne ; « חזרה » pendant le délai annule.
 *   A269  aucune étape de saisie n'avance seule — champs, touche « הבא » du
 *         clavier, document, signature, créneau.
 *   A270  le retour retrouve TOUT, à chaque étape : choix cochés, champs,
 *         document joint, SIGNATURE REPEINTE, créneau.
 *   A271  le parcours se compte en gestes, et les gestes évitables sont
 *         partis : pas de « המשך » après un choix, UN bouton aux documents,
 *         « הבא » du clavier passe au champ suivant, et un document joint
 *         pour une autre nature de terre ne part pas.
 *
 * ⚠️ LES TROIS RPC SONT INTERCEPTÉES, Y COMPRIS SUR LE DÉPLOYÉ : aucune
 *    demande n'arrive dans `lo-yanum-prod` (même règle qu'`apui`).
 * ⚠️ 402 px D'ABORD : le téléphone est le cas principal (AP).
 */
const REMOTE = process.env.BASE_URL ?? ''
const ENGINES = (process.env.AR_ENGINES ?? 'chromium,webkit').split(',').map((e) => e.trim()).filter(Boolean)
const PORT = Number(process.env.AR_PORT ?? 5362)
const OUT = process.env.DIST ?? 'dist-bakasha'
const CAPTURES = process.env.CAPTURES === '1'
const SHOTS = `docs/screenshots/arpass/${REMOTE === '' ? 'local' : 'deployed'}`

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

// ---------------------------------------------------------------------------
// Build + serveur (même recette qu'apui : une paire FABRIQUÉE, interceptée)
// ---------------------------------------------------------------------------

const serves: Array<ReturnType<typeof Bun.spawn>> = []
async function serveBuild(): Promise<string> {
  if (process.env.SKIP_BUILD !== '1') {
    const build = Bun.spawn(
      ['bun', 'x', 'vite', 'build', '--config', 'vite.bakasha.config.ts', '--outDir', OUT],
      {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://fake.supabase.co',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_gate_0000000000000000',
        },
        stdout: 'ignore',
        stderr: 'pipe',
      },
    )
    if ((await build.exited) !== 0) {
      console.error(await new Response(build.stderr).text())
      throw new Error('vite build failed (bakasha)')
    }
  }
  serves.push(
    Bun.spawn(
      ['bun', 'x', 'vite', 'preview', '--config', 'vite.bakasha.config.ts', '--outDir', OUT, '--port', String(PORT), '--strictPort'],
      { stdout: 'ignore', stderr: 'ignore' },
    ),
  )
  const base = `http://localhost:${PORT}`
  const deadline = Date.now() + 40_000
  for (;;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* pas encore */
    }
    if (Date.now() > deadline) throw new Error('vite preview (bakasha) did not come up')
    await Bun.sleep(300)
  }
  return base
}
const BASE = REMOTE !== '' ? REMOTE : await serveBuild()
console.log(`  page    : ${BASE}\n  moteurs : ${ENGINES.join(' · ')}\n  délai   : ${AUTO_ADVANCE_DELAY_MS} ms`)

interface Sent {
  payload: Record<string, unknown>
}

function openDayKey(offsetDays: number): string {
  for (let i = 0; i < 7; i += 1) {
    const key = new Date(Date.now() + (offsetDays + i) * 86_400_000).toISOString().slice(0, 10)
    const dow = new Date(`${key}T12:00:00Z`).getUTCDay()
    if (dow !== 5 && dow !== 6) return key
  }
  throw new Error('no open day')
}
const BUSY_DAY = openDayKey(8)

async function installRpc(ctx: BrowserContext, sent: Sent[]): Promise<void> {
  await ctx.route('**/rest/v1/rpc/**', async (route: Route) => {
    const url = route.request().url()
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
    if (url.includes('public_busy_intervals')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { starts_at: jerusalemInstant(BUSY_DAY, 6).toISOString(), ends_at: jerusalemInstant(BUSY_DAY, 23).toISOString() },
        ]),
      })
      return
    }
    if (url.includes('public_agreement_template')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
      return
    }
    if (url.includes('submit_aid_request')) {
      sent.push({ payload: (body.payload ?? {}) as Record<string, unknown> })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, reference: 'AR1234' }) })
      return
    }
    await route.fulfill({ status: 404, body: '{}' })
  })
}

const VIEWPORTS = {
  '402': { width: 402, height: 874 },
  '1032': { width: 1032, height: 1376 },
  '1376': { width: 1376, height: 1032 },
} as const

async function newPage(browser: Browser, sent: Sent[], vp: keyof typeof VIEWPORTS = '402', dark = false) {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[vp],
    hasTouch: true,
    isMobile: browser.browserType().name() === 'chromium' && vp === '402',
    locale: 'he-IL',
    colorScheme: dark ? 'dark' : 'light',
    timeZoneId: 'Asia/Jerusalem',
  })
  await installRpc(ctx, sent)
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(BASE, { waitUntil: 'load', timeout: 45_000 })
      break
    } catch (e) {
      if (attempt >= (REMOTE === '' ? 0 : 2)) throw e
      await page.waitForTimeout(2_000 * (attempt + 1))
    }
  }
  await page.getByTestId('landing').waitFor()
  return { ctx, page, errors }
}

const stepOf = async (page: Page) => await page.getAttribute('[data-step]', 'data-step')
const pressed = async (page: Page, id: string) => await page.getAttribute(`[data-testid="${id}"]`, 'aria-pressed')

async function sign(page: Page): Promise<void> {
  const pad = await page.getByTestId('signature').boundingBox()
  if (!pad) throw new Error('no signature pad')
  const cy = pad.y + pad.height / 2
  await page.mouse.move(pad.x + 40, cy)
  await page.mouse.down()
  await page.mouse.move(pad.x + 120, cy - 30, { steps: 10 })
  await page.mouse.move(pad.x + 200, cy + 24, { steps: 10 })
  await page.mouse.up()
}

/** Encre réellement peinte sur le canevas (pixels non transparents). */
async function inkPixels(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="signature"]')
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return -1
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1
    return n
  })
}

const pdf = { name: 'זכות-בקרקע.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% ar\n') }

async function fillWho(page: Page): Promise<void> {
  await page.getByTestId('farmName').fill('חוות הבדיקה')
  await page.getByTestId('fullName').fill('ישראל ישראלי')
  await page.getByTestId('idNumber').fill('021985189')
  await page.getByTestId('phone').fill('0525274774')
  await page.getByTestId('email').fill('dov@example.com')
  await page.getByTestId('locality').fill('מיצד')
}

async function footButtons(page: Page): Promise<string[]> {
  return await page.locator('.az-foot button').evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e as HTMLElement).dataset.testid ?? ''),
  )
}

/** Une section qui casse (élément absent, délai) compte UN rouge et la porte continue. */
async function guarded(fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    check('section interrompue', false, String(e).split('\n')[0].slice(0, 160))
  }
}

// ---------------------------------------------------------------------------

for (const engineName of ENGINES) {
  const type = engineName === 'webkit' ? webkit : chromium
  const browser = await type.launch()
  const name = type.name()

  // -------------------------------------------------------------------------
  section(`A268 — ${name} · 402 px : les choix uniques avancent seuls`)
  // -------------------------------------------------------------------------
  check(`A268 · la liste des étapes qui avancent seules est exactement « need, land »`,
    JSON.stringify(AUTO_ADVANCE_STEPS) === JSON.stringify(['need', 'land']), JSON.stringify(AUTO_ADVANCE_STEPS))
  check(`A268 · le délai est une constante nommée, entre 250 et 700 ms`,
    AUTO_ADVANCE_DELAY_MS >= 250 && AUTO_ADVANCE_DELAY_MS <= 700, `${AUTO_ADVANCE_DELAY_MS} ms`)
  await guarded(async () => {
    const sent: Sent[] = []
    const { ctx, page, errors } = await newPage(browser, sent)
    await page.getByTestId('start').click()
    await page.waitForSelector('[data-step="need"]')
    check(`A268 · ${name} · « מה אתם מחפשים » n'a pas de « המשך »`,
      (await page.getByTestId('next').count()) === 0 && (await footButtons(page)).length === 0,
      JSON.stringify(await footButtons(page)))

    for (const [stepName, id, nextStep] of [
      ['need', 'need-both', 'land'],
      ['land', 'land-crops', 'who'],
    ] as const) {
      const t0 = Date.now()
      await page.getByTestId(id).click()
      const early = { step: await stepOf(page), pressed: await pressed(page, id), ms: Date.now() - t0 }
      check(`A268 · ${name} · ${stepName} : au toucher, la ligne est COCHÉE et l'écran reste`,
        early.step === stepName && early.pressed === 'true', JSON.stringify(early))
      /* Toujours là un peu avant la fin du délai : la coche se VOIT. */
      await page.waitForTimeout(Math.max(0, AUTO_ADVANCE_DELAY_MS - 180 - (Date.now() - t0)))
      const mid = { step: await stepOf(page), ms: Date.now() - t0 }
      check(`A268 · ${name} · ${stepName} : encore affiché à ${mid.ms} ms (le choix se lit)`,
        mid.step === stepName, JSON.stringify(mid))
      await page.waitForSelector(`[data-step="${nextStep}"]`, { timeout: 3_000 })
      const took = Date.now() - t0
      check(`A268 · ${name} · ${stepName} → ${nextStep} tout seul, en ${took} ms`,
        took >= AUTO_ADVANCE_DELAY_MS - 20 && took < AUTO_ADVANCE_DELAY_MS + 1_500, `${took} ms`)
      if (nextStep === 'land') {
        check(`A268 · ${name} · « מה יש לכם בשטח » n'a pas de « המשך »`,
          (await page.getByTestId('next').count()) === 0)
      }
    }
    check(`A268 · ${name} · le focus est sur la question de l'étape suivante`,
      await page.evaluate(() => document.activeElement?.classList.contains('az-q') === true))

    /* Le dernier choix gagne, et on n'avance qu'UNE fois. */
    await page.getByTestId('back').click()
    await page.waitForSelector('[data-step="land"]')
    await page.getByTestId('land-grazing').click()
    await page.waitForTimeout(80)
    await page.getByTestId('land-both').click()
    await page.waitForSelector('[data-step="who"]')
    await page.waitForTimeout(AUTO_ADVANCE_DELAY_MS + 300)
    check(`A268 · ${name} · deux touchers rapides : UNE avance, pas deux`, (await stepOf(page)) === 'who', String(await stepOf(page)))
    await page.getByTestId('back').click()
    await page.waitForSelector('[data-step="land"]')
    check(`A268 · ${name} · … et c'est le DERNIER choix qui est gardé`,
      (await pressed(page, 'land-both')) === 'true' && (await pressed(page, 'land-grazing')) === 'false')

    /* « חזרה » pendant le délai annule l'avance. */
    await page.getByTestId('land-crops').click()
    await page.getByTestId('back').click()
    await page.waitForTimeout(AUTO_ADVANCE_DELAY_MS + 500)
    check(`A268 · ${name} · « חזרה » pendant le délai l'ANNULE (on reste où on est revenu)`,
      (await stepOf(page)) === 'need', String(await stepOf(page)))
    check(`A268 · ${name} · aucune erreur de page`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })

  // -------------------------------------------------------------------------
  section(`A269 — ${name} · 402 px : aucune étape de saisie n'avance seule`)
  // -------------------------------------------------------------------------
  await guarded(async () => {
    const sent: Sent[] = []
    const { ctx, page } = await newPage(browser, sent)
    await page.getByTestId('start').click()
    await page.getByTestId('need-both').click()
    await page.waitForSelector('[data-step="land"]')
    await page.getByTestId('land-both').click()
    await page.waitForSelector('[data-step="who"]')
    await fillWho(page)
    await page.getByTestId('locality').press('Enter')
    await page.waitForTimeout(AUTO_ADVANCE_DELAY_MS + 900)
    check(`A269 · ${name} · מי אתם : tout rempli, « הבא » du dernier champ — l'étape RESTE`,
      (await stepOf(page)) === 'who', String(await stepOf(page)))
    check(`A269 · ${name} · מי אתם : un bouton explicite le dit`, (await footButtons(page)).includes('next'))
    await page.getByTestId('next').click()
    await page.getByTestId('documents-step').waitFor()
    await page.setInputFiles('[data-testid="doc-crops-pdf"]', pdf)
    await page.waitForFunction(() => document.querySelector('[data-testid="doc-crops"]')?.getAttribute('data-provided') === 'yes')
    await page.waitForTimeout(AUTO_ADVANCE_DELAY_MS + 900)
    check(`A269 · ${name} · מסמכים : un document joint — l'étape RESTE`, (await stepOf(page)) === 'documents')
    await page.getByTestId('next').click()
    await page.getByTestId('agreement').waitFor()
    await sign(page)
    await page.waitForTimeout(AUTO_ADVANCE_DELAY_MS + 900)
    check(`A269 · ${name} · הסכם : signé — l'étape RESTE`, (await stepOf(page)) === 'agreement')
    await page.getByTestId('next').click()
    await page.getByTestId('slots').waitFor()
    await page.getByTestId('slot').first().click()
    await page.waitForTimeout(AUTO_ADVANCE_DELAY_MS + 900)
    check(`A269 · ${name} · מועד : créneau choisi — RIEN ne part tout seul`,
      (await stepOf(page)) === 'appointment' && sent.length === 0, `${await stepOf(page)} · ${sent.length} envoi(s)`)
    await ctx.close()
  })

  // -------------------------------------------------------------------------
  section(`A270 — ${name} · 402 px : le retour retrouve tout, à chaque étape`)
  // -------------------------------------------------------------------------
  await guarded(async () => {
    const sent: Sent[] = []
    const { ctx, page, errors } = await newPage(browser, sent)
    await page.getByTestId('start').click()
    await page.getByTestId('need-farm_work').click()
    await page.waitForSelector('[data-step="land"]')
    await page.getByTestId('land-crops').click()
    await page.waitForSelector('[data-step="who"]')
    await fillWho(page)
    await page.getByTestId('next').click()
    await page.getByTestId('documents-step').waitFor()
    await page.setInputFiles('[data-testid="doc-crops-pdf"]', pdf)
    await page.waitForFunction(() => document.querySelector('[data-testid="doc-crops"]')?.getAttribute('data-provided') === 'yes')
    await page.getByTestId('next').click()
    await page.getByTestId('agreement').waitFor()
    await sign(page)
    const inkBefore = await inkPixels(page)
    await page.getByTestId('next').click()
    await page.getByTestId('slots').waitFor()
    const slot = await page.getByTestId('slot').nth(1).getAttribute('data-start')
    await page.getByTestId('slot').nth(1).click()

    /* ← de l'étape 6 à l'étape 1, une à une */
    await page.getByTestId('back').click()
    await page.getByTestId('agreement').waitFor()
    await page.waitForTimeout(250)
    const inkAfter = await inkPixels(page)
    check(`A270 · ${name} · הסכם : la signature est REPEINTE (${inkAfter} px d'encre, ${inkBefore} avant)`,
      (await page.getAttribute('[data-testid="signature"]', 'data-signed')) === 'yes' && inkAfter > inkBefore * 0.5,
      `${inkAfter}/${inkBefore}`)
    await page.getByTestId('back').click()
    await page.getByTestId('documents-step').waitFor()
    check(`A270 · ${name} · מסמכים : le document est encore joint`,
      (await page.getAttribute('[data-testid="doc-crops"]', 'data-provided')) === 'yes')
    await page.getByTestId('back').click()
    await page.waitForSelector('[data-step="who"]')
    const values = await page.locator('.az-input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
    check(`A270 · ${name} · מי אתם : les six champs sont intacts`,
      values.filter((v) => v !== '').length === 6 && values.some((v) => v.replace(/\D/g, '') === '021985189'),
      JSON.stringify(values))
    await page.getByTestId('back').click()
    await page.waitForSelector('[data-step="land"]')
    check(`A270 · ${name} · מה יש לכם בשטח : « גידולים » est coché`, (await pressed(page, 'land-crops')) === 'true')
    await page.getByTestId('back').click()
    await page.waitForSelector('[data-step="need"]')
    check(`A270 · ${name} · מה אתם מחפשים : le choix est coché, pas un écran vide`,
      (await pressed(page, 'need-farm_work')) === 'true')

    /* → en avant sans rien changer : retoucher la ligne cochée avance. */
    await page.getByTestId('need-farm_work').click()
    await page.waitForSelector('[data-step="land"]')
    check(`A270 · ${name} · retoucher le choix déjà coché avance (il n'y a plus de « המשך »)`,
      (await pressed(page, 'land-crops')) === 'true')
    await page.getByTestId('land-crops').click()
    await page.waitForSelector('[data-step="who"]')
    await page.getByTestId('next').click()
    await page.getByTestId('documents-step').waitFor()
    await page.getByTestId('next').click()
    await page.getByTestId('agreement').waitFor()
    await page.getByTestId('next').click()
    await page.getByTestId('slots').waitFor()
    check(`A270 · ${name} · מועד : le créneau choisi est encore sélectionné`,
      (await page.getAttribute(`[data-testid="slot"][data-start="${slot}"]`, 'aria-pressed')) === 'true')
    await page.getByTestId('send').click()
    await page.getByTestId('done').waitFor()
    const p = sent[0]?.payload ?? {}
    check(`A270 · ${name} · après l'aller-retour, TOUT part : besoin, terre, ת״ז, document, signature, créneau`,
      p.need === 'farm_work' && p.landKind === 'crops' && p.idNumber === '021985189' &&
        (p.documents as unknown[]).length === 1 &&
        String(p.signature ?? '').startsWith('data:image/png') && p.appointmentAt === slot,
      JSON.stringify({ ...p, documents: (p.documents as unknown[])?.length, signature: String(p.signature ?? '').slice(0, 22) }))
    check(`A270 · ${name} · aucune erreur de page`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })

  // -------------------------------------------------------------------------
  section(`A271 — ${name} · 402 px : les gestes évitables sont partis`)
  // -------------------------------------------------------------------------
  await guarded(async () => {
    const sent: Sent[] = []
    const { ctx, page } = await newPage(browser, sent)
    let taps = 0
    const tap = async (id: string) => {
      taps += 1
      await page.getByTestId(id).first().click()
    }
    await tap('start')
    await tap('need-both')
    await page.waitForSelector('[data-step="land"]')
    await tap('land-both')
    await page.waitForSelector('[data-step="who"]')
    /* « הבא » du clavier : du nom de lieu au champ suivant, sans viser. */
    await page.getByTestId('farmName').focus()
    const hints = await page.locator('.az-input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).enterKeyHint))
    check(`A271 · ${name} · la touche du clavier dit « הבא » partout, « סיום » sur le dernier`,
      hints.slice(0, -1).every((h) => h === 'next') && hints.at(-1) === 'done', JSON.stringify(hints))
    const order: string[] = []
    for (const [id, v] of [['farmName', 'חוות'], ['fullName', 'ישראל'], ['idNumber', '021985189'], ['phone', '0525274774'], ['email', ''], ['locality', 'מיצד']] as const) {
      order.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? ''))
      if (v !== '') await page.keyboard.type(v)
      await page.keyboard.press('Enter')
      void id
    }
    check(`A271 · ${name} · « הבא » enchaîne les six champs dans l'ordre, sans un toucher`,
      order.join(',') === 'farmName,fullName,idNumber,phone,email,locality', order.join(','))
    check(`A271 · ${name} · … et le dernier ferme le clavier sans quitter l'étape`,
      (await stepOf(page)) === 'who' && (await page.evaluate(() => document.activeElement?.tagName)) !== 'INPUT')
    await tap('next')
    await page.getByTestId('documents-step').waitFor()
    const docsEmpty = await footButtons(page)
    check(`A271 · ${name} · מסמכים sans document : UN seul bouton, qui dit « אני אשלח בהמשך »`,
      docsEmpty.length === 1 && docsEmpty[0] === 'skip', JSON.stringify(docsEmpty))
    await page.setInputFiles('[data-testid="doc-crops-pdf"]', pdf)
    await page.waitForFunction(() => document.querySelector('[data-testid="doc-crops"]')?.getAttribute('data-provided') === 'yes')
    const docsSome = await footButtons(page)
    check(`A271 · ${name} · avec un document : UN seul bouton, « המשך »`,
      docsSome.length === 1 && docsSome[0] === 'next', JSON.stringify(docsSome))
    await tap('next')
    await page.getByTestId('agreement').waitFor()
    await tap('next')
    await page.getByTestId('slots').waitFor()
    await tap('slot')
    await tap('send')
    await page.getByTestId('done').waitFor()
    check(`A271 · ${name} · accueil → confirmation en ${taps} touchers de bouton (AP : ${taps + 2}, deux « המשך » en moins)`,
      taps === 8, `${taps}`)
    await ctx.close()

    /* Changer d'avis sur la terre : le papier de l'autre nature ne part pas. */
    const sent2: Sent[] = []
    const b = await newPage(browser, sent2)
    await b.page.getByTestId('start').click()
    await b.page.getByTestId('need-both').click()
    await b.page.waitForSelector('[data-step="land"]')
    await b.page.getByTestId('land-crops').click()
    await b.page.waitForSelector('[data-step="who"]')
    await fillWho(b.page)
    await b.page.getByTestId('next').click()
    await b.page.getByTestId('documents-step').waitFor()
    await b.page.setInputFiles('[data-testid="doc-crops-pdf"]', pdf)
    await b.page.waitForFunction(() => document.querySelector('[data-testid="doc-crops"]')?.getAttribute('data-provided') === 'yes')
    await b.page.getByTestId('back').click()
    await b.page.getByTestId('back').click()
    await b.page.waitForSelector('[data-step="land"]')
    await b.page.getByTestId('land-grazing').click()
    await b.page.waitForSelector('[data-step="who"]')
    await b.page.getByTestId('next').click()
    await b.page.getByTestId('documents-step').waitFor()
    const shown = await b.page.locator('[data-testid^="doc-"][data-provided]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid))
    await b.page.getByTestId('skip').click()
    await b.page.getByTestId('agreement').waitFor()
    await b.page.getByTestId('next').click()
    await b.page.waitForSelector('[data-step="appointment"]')
    await b.page.getByTestId('skip').click()
    await b.page.getByTestId('done').waitFor()
    const docs = (sent2[0]?.payload.documents ?? []) as unknown[]
    check(`A271 · ${name} · terre changée en « מרעה » : le papier « גידולים » n'est plus montré ET ne part pas`,
      !shown.includes('doc-crops') && docs.length === 0, `${JSON.stringify(shown)} · ${docs.length} parti(s)`)
    await b.ctx.close()
  })

  // -------------------------------------------------------------------------
  if (CAPTURES && name === 'chromium') {
    section(`Captures — chaque étape, 402 · 1032 · 1376, clair et sombre`)
    mkdirSync(SHOTS, { recursive: true })
    let n = 0
    let pageErrors = 0
    for (const vp of Object.keys(VIEWPORTS) as Array<keyof typeof VIEWPORTS>) {
      for (const dark of [false, true]) {
        const tag = `${vp}-${dark ? 'sombre' : 'clair'}`
        const sent: Sent[] = []
        const { ctx, page, errors } = await newPage(browser, sent, vp, dark)
        const shot = async (label: string) => {
          await page.waitForTimeout(120)
          await page.screenshot({ path: `${SHOTS}/ar-${tag}-${label}.png`, fullPage: false })
          n += 1
        }
        await shot('0-accueil')
        await page.getByTestId('start').click()
        await page.waitForSelector('[data-step="need"]')
        await shot('1a-mah-atem-mechapsim')
        await page.getByTestId('need-both').click()
        await shot('1b-bechira-nirat') // la coche, pendant le délai
        await page.waitForSelector('[data-step="land"]')
        await shot('2a-mah-yesh-lachem')
        await page.getByTestId('land-both').click()
        await shot('2b-bechira-nirat')
        await page.waitForSelector('[data-step="who"]')
        await fillWho(page)
        await shot('3-mi-atem')
        await page.getByTestId('next').click()
        await page.getByTestId('documents-step').waitFor()
        await shot('4a-mismachim')
        await page.setInputFiles('[data-testid="doc-crops-pdf"]', pdf)
        await page.waitForFunction(() => document.querySelector('[data-testid="doc-crops"]')?.getAttribute('data-provided') === 'yes')
        await shot('4b-mismach-tsoraf')
        await page.getByTestId('next').click()
        await page.getByTestId('agreement').waitFor()
        await sign(page)
        await shot('5-heskem')
        await page.getByTestId('next').click()
        await page.getByTestId('slots').waitFor()
        await page.getByTestId('slot').first().click()
        await shot('6-moed')
        await page.getByTestId('back').click()
        await page.getByTestId('agreement').waitFor()
        await page.waitForTimeout(200)
        await shot('7-chazara-chatima-nishmeret')
        await page.getByTestId('back').click()
        await page.getByTestId('back').click()
        await page.getByTestId('back').click()
        await page.waitForSelector('[data-step="land"]')
        await shot('8-chazara-bechira-nishmeret')
        await page.getByTestId('land-both').click()
        await page.waitForSelector('[data-step="who"]')
        await page.getByTestId('next').click()
        await page.getByTestId('documents-step').waitFor()
        await page.getByTestId('next').click()
        await page.getByTestId('agreement').waitFor()
        await page.getByTestId('next').click()
        await page.getByTestId('slots').waitFor()
        await page.getByTestId('send').click()
        await page.getByTestId('done').waitFor()
        await shot('9-nishlach')
        pageErrors += errors.length
        await ctx.close()
      }
    }
    check(`captures : ${n} écrans dans ${SHOTS}`, n === 6 * 13, `${n}`)
    check('captures : 0 erreur de page', pageErrors === 0, `${pageErrors}`)
  }

  await browser.close()
}

for (const s of serves) s.kill()
console.log(`\n  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
