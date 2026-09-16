import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AN — LOGIQUE D'INTERFACE, CONTRADICTIONS, RÉGRESSIONS. Dans un navigateur.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run anui                                          # build local (démo)
 *   DIST=dist-an-before SKIP_BUILD=1 bun run anui         # le ROUGE (build de 1dacc2c)
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run anui   # le DÉPLOYÉ
 *
 * ⚠️ CE QUE CETTE PORTE NE PROUVE PAS, ET QUI EST PROUVÉ AILLEURS.
 *    Le clavier qu'un iPad OUVRE ne se lit dans aucun navigateur de test : il
 *    a été vu sur le simulateur iPad (ETAT.md, AN1.2). Cette porte mesure ce
 *    qui en découle et qu'un navigateur peut constater : sur un agent iPad,
 *    le champ numérique touché passe en `inputmode=none` et le pavé de l'app
 *    s'ouvre, les chiffres entrent, la mise en forme suit ; sur un iPhone,
 *    rien de tout cela.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const PORT = Number(process.env.ANUI_PORT ?? 5351)
const OUT = process.env.DIST ?? 'dist-anpass'
const SHOTS = process.env.SHOTS ?? 'docs/screenshots/anpass/local'
const IPAD = { width: 1032, height: 1376 }
const PHONE = { width: 402, height: 874 }
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
mkdirSync(SHOTS, { recursive: true })

const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
const wants = (id: string) => only.length === 0 || only.includes(id)

let passed = 0
let failed = 0
export function check(label: string, ok: boolean, detail = ''): void {
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
async function serveBuild(out: string, port: number): Promise<string> {
  const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
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

const demo = REMOTE ? `${REMOTE}/demo` : await serveBuild(OUT, PORT)
console.log(`  démo : ${demo}`)

async function open(page: Page, hash: string, settle = 2600): Promise<void> {
  await page.goto(`${demo}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  await page.goto(`${demo}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

async function context(
  browser: Browser,
  opts: { viewport?: { width: number; height: number }; ua?: string; dark?: boolean; storage?: Record<string, string> } = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? IPAD,
    hasTouch: true,
    locale: 'he-IL',
    userAgent: opts.ua,
    colorScheme: opts.dark ? 'dark' : 'light',
    permissions: ['geolocation'],
    geolocation: { latitude: 31.0611, longitude: 34.6552 },
  })
  if (opts.storage) {
    await ctx.addInitScript((entries: Record<string, string>) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v)
    }, opts.storage)
  }
  ctx.setDefaultTimeout(8000)
  return ctx
}

async function guard(run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    check('section interrompue', false, (e as Error).message.split('\n')[0])
  }
}

const chrome = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const safari = await webkit.launch()

try {
  if (wants('A222')) {
    // =======================================================================
    section('A222 — thème « לפי המכשיר » : l\'appareil bascule, l\'app suit sans rechargement')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(safari)
      const page = await ctx.newPage()
      await open(page, '#/coordinator/farms')
      const bg = () =>
        page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim())
      const light = await bg()
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.waitForTimeout(600)
      const dark = await bg()
      await page.emulateMedia({ colorScheme: 'light' })
      await page.waitForTimeout(600)
      const back = await bg()
      check('clair → sombre sans rechargement', light === '243 244 246' && dark === '11 17 25', `${light} → ${dark}`)
      check('sombre → clair sans rechargement', back === '243 244 246', back)
      const src = await page.evaluate(() => document.documentElement.getAttribute('data-theme-choice'))
      check('le choix du coordinateur est « system » par défaut', src === 'system', String(src))
      await ctx.close()
    })
  }

  if (wants('A223')) {
    // =======================================================================
    section('A223 — iPad : le champ numérique ouvre le pavé de l\'app, pas le clavier complet')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(safari, { ua: IPAD_UA })
      const page = await ctx.newPage()
      await open(page, '#/coordinator/farms/farm-07/edit')
      const tz = page.locator('[data-testid="farm-farmer-id"]')
      await tz.scrollIntoViewIfNeeded()
      await tz.tap()
      await page.waitForTimeout(500)
      const mode = await tz.getAttribute('inputmode')
      check('ת״ז touché → inputmode=none (le système n\'ouvre pas son clavier)', mode === 'none', String(mode))
      const pad = page.locator('[data-testid="numpad"]')
      check('le pavé de l\'app est ouvert', await pad.isVisible())
      await tz.fill('')
      await tz.tap()
      for (const k of ['0', '2', '1', '9', '8', '5', '1', '8', '9']) {
        await page.locator(`[data-numpad-key="${k}"]`).click()
      }
      await page.waitForTimeout(200)
      check('les chiffres entrent, zéro de tête compris', (await tz.inputValue()) === '021985189', await tz.inputValue())
      await page.screenshot({ path: `${SHOTS}/a223-ipad-tz-pave.png` })

      const phone = page.locator('[data-testid="farm-form-farmerPhone"]')
      await phone.tap()
      await page.waitForTimeout(300)
      for (let i = 0; i < 12; i++) await page.locator('[data-numpad-key="back"]').click()
      for (const k of '0501234567') await page.locator(`[data-numpad-key="${k}"]`).click()
      await page.waitForTimeout(200)
      check('portable : la mise en forme suit le pavé', (await phone.inputValue()) === '(050) 123-4567', await phone.inputValue())

      await page.locator('[data-numpad-key="done"]').click()
      await page.waitForTimeout(300)
      check('« סיום » ferme le pavé', !(await pad.isVisible()))

      // Tous les champs numériques de l'écran passent par le pavé.
      const numeric = page.locator('input[inputmode="numeric"], input[inputmode="decimal"], input[inputmode="tel"], input[type="tel"], input[inputmode="none"]')
      const n = await numeric.count()
      let viaPad = 0
      for (let i = 0; i < n; i++) {
        const el = numeric.nth(i)
        if (!(await el.isVisible()) || (await el.getAttribute('readonly')) !== null) {
          viaPad++
          continue
        }
        await el.scrollIntoViewIfNeeded()
        await el.tap()
        await page.waitForTimeout(150)
        if ((await el.getAttribute('inputmode')) === 'none' && (await pad.isVisible())) viaPad++
      }
      check(`les ${n} champs numériques de l'édition de ferme ouvrent le pavé`, n > 0 && viaPad === n, `${viaPad}/${n}`)
      await ctx.close()

      const phoneCtx = await context(safari, { ua: IPHONE_UA, viewport: PHONE })
      const p2 = await phoneCtx.newPage()
      await open(p2, '#/coordinator/farms/farm-07/edit')
      const tz2 = p2.locator('[data-testid="farm-farmer-id"]')
      await tz2.scrollIntoViewIfNeeded()
      await tz2.tap()
      await p2.waitForTimeout(400)
      check('iPhone : le pavé du système suffit — inputmode=numeric, pas de pavé de l\'app',
        (await tz2.getAttribute('inputmode')) === 'numeric' && (await p2.locator('[data-testid="numpad"]').count()) === 0)
      await phoneCtx.close()
    })
  }

  if (wants('A224')) {
    // =======================================================================
    section('A224 — un téléphone saisi n\'est jamais remplacé ; aucun numéro générique')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(chrome, { storage: { 'lo-yanum:block:settings-profile': '1' } })
      const page = await ctx.newPage()
      await open(page, '#/coordinator/settings')
      const field = page.locator('[data-testid="coordinator-phone"]')
      await field.scrollIntoViewIfNeeded()
      const initial = await field.inputValue()
      /* ⚠️ Sur les CHIFFRES : la première version cherchait « 0000049 » dans la
         valeur AFFICHÉE, « (052) 000-0049 », et passait au vert sur le build
         d'avant. Vue rouge-qui-ment sur dist-an-before, corrigée. */
      check('aucun numéro par défaut dans la carte du coordinateur', initial.replace(/\D/g, '') === '', JSON.stringify(initial))
      await field.fill('0529876543')
      await page.waitForTimeout(200)
      // Il QUITTE l'écran sans toucher « שמירה ».
      await open(page, '#/coordinator/farms', 1200)
      await open(page, '#/coordinator/settings')
      const kept = await page.locator('[data-testid="coordinator-phone"]').inputValue()
      check('tapé, écran quitté sans « שמירה », rouvert : le numéro est là', kept === '(052) 987-6543', kept)
      await page.locator('[data-testid="coordinator-phone"]').fill('')
      await open(page, '#/coordinator/farms', 1200)
      await open(page, '#/coordinator/settings')
      const cleared = await page.locator('[data-testid="coordinator-phone"]').inputValue()
      check('vidé : il reste vide, aucun numéro ne revient', cleared === '', JSON.stringify(cleared))
      await ctx.close()
    })
    if (!REMOTE) {
      const dir = `${OUT}/assets`
      const hits = readdirSync(dir)
        .filter((f) => f.endsWith('.js'))
        .filter((f) => /052-0000049|08-0000050/.test(readFileSync(`${dir}/${f}`, 'utf8')))
      check('le bundle ne contient plus 052-0000049 ni 08-0000050', hits.length === 0, hits.join(', '))
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
