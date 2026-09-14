import { chromium, webkit } from 'playwright'
import type { Page } from 'playwright'

/**
 * ★★ A184 — LE THÈME SYSTÈME EST SUIVI : AU DÉMARRAGE, À CHAUD, AU RETOUR
 *    D'ARRIÈRE-PLAN, ET APRÈS UN « VOIR COMME ».
 *
 *   bun run aitheme                                   # build local (jumeau)
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum/demo/ bun run aitheme
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum/ bun run aitheme
 *
 * Chaque mesure IMPRIME LES TROIS VALEURS — ce que répond
 * `prefers-color-scheme`, ce que vaut le réglage enregistré, ce qui est peint
 * (`--surface-base`) — et échoue si le peint ne correspond pas à l'appareil
 * alors que le réglage est « selon l'appareil ».
 *
 * ⚠️ VUE ROUGE SUR LE DÉPLOYÉ D'AVANT AI6 : après un aller-retour « voir comme »
 *    un volontaire, appareil sombre, réglage `system`, l'écran peignait
 *    `243 244 246`. Le shell de terrain avait posé l'attribut du volontaire et
 *    rien ne le retirait au retour.
 *
 * L'app réelle n'a pas de session de coordinateur sur cette machine : sur son
 * URL, le « voir comme » est sauté (et dit), le reste est mesuré sur l'écran
 * de connexion — c'est le même contrôleur.
 */
const DARK = '11 17 25'
const LIGHT = '243 244 246'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

let base = process.env.BASE_URL ?? ''
let serve: ReturnType<typeof Bun.spawn> | null = null
if (!base) {
  const OUT = process.env.OUT ?? 'dist-aipass'
  const PORT = Number(process.env.PORT ?? 5331)
  const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
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
  base = `http://localhost:${PORT}/`
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
}
if (!base.endsWith('/')) base += '/'

const READ = `(() => ({
  device: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  stored: localStorage.getItem('lo-yanum:theme:coordinator'),
  choice: document.documentElement.getAttribute('data-theme-choice'),
  attr: document.documentElement.getAttribute('data-theme'),
  painted: getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim(),
}))()`

interface Reading {
  device: 'dark' | 'light'
  stored: string | null
  choice: string | null
  attr: string | null
  painted: string
}

async function measure(page: Page, label: string, expect: 'dark' | 'light'): Promise<void> {
  const r = (await page.evaluate(READ)) as Reading
  const want = expect === 'dark' ? DARK : LIGHT
  check(
    label,
    r.device === expect && r.painted === want,
    `appareil=${r.device} · réglage=${r.stored ?? '(défaut)'} · peint=${r.painted === DARK ? 'sombre' : r.painted === LIGHT ? 'clair' : r.painted}`,
  )
}

const engines = [
  ['chromium', chromium],
  ['webkit', webkit],
] as const

for (const [engineName, engine] of engines) {
  console.log('')
  console.log(`  A184 — ${engineName} — ${base}`)
  const browser = await engine.launch()
  const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 1032, height: 1376 } })
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('ai6-seeded')) return
    localStorage.setItem('lo-yanum:theme:coordinator', 'system')
    // Le cas du PO : le volontaire a été mis en clair pendant un « voir comme ».
    localStorage.setItem('lo-yanum:theme:volunteer', 'light')
    localStorage.setItem('lo-yanum:block:settings-viewas', '1')
    localStorage.setItem('lo-yanum:block:settings-display', '1')
    sessionStorage.setItem('ai6-seeded', '1')
  })
  const page = await ctx.newPage()
  try {
    // 1 · démarrage, appareil sombre
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(`${base}#/coordinator/settings`, { waitUntil: 'load' })
    await page.waitForTimeout(3000)
    await measure(page, 'A184 · démarrage, appareil sombre', 'dark')

    // 2 · à chaud : le soleil se lève, puis se couche
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(500)
    await measure(page, 'A184 · à chaud, l’appareil passe en clair', 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(500)
    await measure(page, 'A184 · à chaud, l’appareil repasse en sombre', 'dark')

    // 3 · retour d'arrière-plan : l'app est cachée pendant la bascule
    const other = await ctx.newPage()
    await other.bringToFront()
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(400)
    await page.bringToFront()
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await page.waitForTimeout(500)
    await other.close()
    await measure(page, 'A184 · retour d’arrière-plan après bascule', 'light')

    // 4 · « voir comme » un volontaire, retour, puis coucher du soleil
    const roles = page.locator('[data-testid="role-switch"] button')
    if ((await roles.count()) >= 3) {
      await roles.nth(2).click()
      await page.waitForTimeout(500)
      const people = page.locator('[data-testid="view-as-person"]')
      if ((await people.count()) > 0) {
        await people.first().click()
        await page.waitForTimeout(2200)
        await page.locator('[data-testid="view-as-banner-stop"]').click()
        await page.waitForTimeout(1600)
        await measure(page, 'A184 · retour de « voir comme », appareil clair', 'light')
        await page.emulateMedia({ colorScheme: 'dark' })
        await page.waitForTimeout(600)
        await measure(page, 'A184 · retour de « voir comme », puis coucher du soleil', 'dark')
      } else {
        console.log('  SKIP  A184 · « voir comme » — personne à regarder sur ce build')
      }
    } else {
      console.log('  SKIP  A184 · « voir comme » — pas de session de coordinateur sur ce build')
    }

    // 5 · un choix explicite tient contre l'appareil
    await page.goto(`${base}#/coordinator/settings`, { waitUntil: 'load' })
    await page.waitForTimeout(1800)
    const settingsLight = page.locator('[data-testid="settings-theme-light"]')
    if ((await settingsLight.count()) > 0) {
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.locator('[data-testid="settings-theme-light"]').click()
      await page.waitForTimeout(300)
      const r = (await page.evaluate(READ)) as Reading
      check('A184 · « clair » choisi tient sur un appareil sombre', r.painted === LIGHT, `peint=${r.painted}`)
      await page.locator('[data-testid="settings-theme-system"]').click()
      await page.waitForTimeout(300)
      await measure(page, 'A184 · retour à « selon l’appareil »', 'dark')
      const diag = page.locator('[data-testid="theme-diagnostic"]')
      check('A184 · la ligne de mesure est à l’écran', (await diag.count()) === 1)
    } else {
      console.log('  SKIP  A184 · choix explicite — pas d’écran de réglages sans session sur ce build')
    }
  } finally {
    await browser.close()
  }
}

serve?.kill()
console.log('')
console.log(`  ${passed} passed · ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
