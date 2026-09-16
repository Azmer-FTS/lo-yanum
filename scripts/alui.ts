import { chromium, webkit } from 'playwright'
import type { Browser, BrowserType, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AL — LE GESTE, ET LA MESURE DE LA LOCALISATION, DANS UN VRAI NAVIGATEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run alui                  (build de démonstration, WebKit puis Chromium)
 *   SKIP_BUILD=1 bun run alui
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run alui
 *   DIST=dist-al-before SKIP_BUILD=1 bun run alui   → le ROUGE d'avant la passe
 *
 *   A207  « שטחים שמירה » : le champ s'ouvre VIDE, la somme est proposée SOUS
 *         lui, un doigt l'accepte, la ligne s'en va, et ce qui a été accepté
 *         ne bouge plus quand les surfaces changent. Cible tactile ≥ 44 px.
 *   A210  l'écran אבחון מיקום : une ligne PAR LANCEMENT, et le bouton de copie
 *         qui copie réellement (et qui DIT l'échec, au lieu d'une coche).
 */

const PORT = Number(process.env.ALUI_PORT ?? 5311)
const OUT = process.env.DIST ?? 'dist-alpass'
const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const IPAD_PORTRAIT = { width: 1032, height: 1376 }

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

const base = REMOTE ?? `http://localhost:${PORT}`
let serve: ReturnType<typeof Bun.spawn> | null = null
if (!REMOTE) {
  const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
  if (process.env.SKIP_BUILD !== '1') {
    const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], { env, stdout: 'ignore', stderr: 'pipe' })
    if ((await build.exited) !== 0) {
      console.error(await new Response(build.stderr).text())
      throw new Error('vite build failed')
    }
  }
  serve = Bun.spawn(
    ['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'],
    { env, stdout: 'ignore', stderr: 'ignore' },
  )
  const deadline = Date.now() + 40_000
  for (;;) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break } catch { /* pas encore */ }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

async function open(page: Page, hash: string, settle = 2400): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

async function tap(page: Page, testId: string): Promise<boolean> {
  const el = page.getByTestId(testId).first()
  if ((await el.count()) === 0) return false
  /* Au CENTRE de l'écran : un en-tête épinglé recouvre ce que
     `scrollIntoViewIfNeeded` pose en haut (la leçon de Z1bis). */
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }))
  await page.waitForTimeout(150)
  const box = await el.boundingBox()
  if (!box) return false
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(350)
  return true
}

/** Le même toucher, mais sur un localisateur quelconque. */
async function tapAt(page: Page, locator: ReturnType<Page['locator']>): Promise<boolean> {
  if ((await locator.count()) === 0) return false
  await locator.first().evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }))
  await page.waitForTimeout(200)
  const box = await locator.first().boundingBox()
  if (!box) return false
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(400)
  return true
}

const valueOf = async (page: Page, testId: string): Promise<string> => {
  const el = page.getByTestId(testId).first()
  return (await el.count()) === 0 ? '(champ absent)' : await el.inputValue()
}

async function setField(page: Page, testId: string, text: string): Promise<void> {
  const el = page.getByTestId(testId).first()
  if ((await el.count()) === 0) return
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await el.fill('')
  await el.fill(text)
  await page.waitForTimeout(250)
}

async function saveForm(page: Page): Promise<void> {
  const save = page.locator('[data-testid="form-actions"] .btn-primary')
  const box = await save.boundingBox()
  if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(1600)
}

async function guardedScenario(browserType: BrowserType, engine: string): Promise<void> {
  const browser: Browser = await browserType.launch()
  try {
    const context = await browser.newContext({
      viewport: IPAD_PORTRAIT,
      hasTouch: true,
      isMobile: engine === 'chromium' ? false : undefined,
    })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => { if (!String(e).includes('ResizeObserver loop')) errors.push(String(e)) })

    section(`A207 — ${engine} — la surface gardée se propose, elle ne se remplit pas`)

    await open(page, '#/coordinator/farms/farm-07/edit', 2800)
    const cultivated = await valueOf(page, 'farm-area-cultivated')
    const grazing = await valueOf(page, 'farm-area-grazing')
    const guardedAtOpen = await valueOf(page, 'farm-area-guarded')
    check(`A207 · ${engine} · le champ s'ouvre VIDE — rien n'a été écrit d'office`,
      guardedAtOpen.trim() === '', `«${guardedAtOpen}»`)

    /* Deux surfaces connues, pour que la somme soit vérifiable à la main. */
    await setField(page, 'farm-area-cultivated', '100')
    await setField(page, 'farm-area-grazing', '1000')
    const suggestion = page.getByTestId('farm-guarded-suggestion')
    check(`A207 · ${engine} · la somme est PROPOSÉE sous le champ`, (await suggestion.count()) === 1,
      `avant : ${cultivated} + ${grazing}`)
    /* ⚠️ TOUTES LES LECTURES QUI SUIVENT SONT TOLÉRANTES À L'ABSENCE, et c'est
       ce qui rend le ROUGE lisible : sur le build d'AVANT la passe rien de
       tout cela n'existe, et une porte qui LÈVE au premier manque ne dit pas
       combien de choses manquent. */
    const textOf = async (testId: string): Promise<string> => {
      const el = page.getByTestId(testId).first()
      return (await el.count()) === 0 ? '' : ((await el.textContent()) ?? '').trim()
    }
    const shown = await textOf('farm-guarded-suggestion-value')
    check(`A207 · ${engine} · et elle vaut 1100`, shown === '1100', shown)
    check(`A207 · ${engine} · ⚠️ LE CHAMP EST TOUJOURS VIDE — proposer n'est pas écrire`,
      (await valueOf(page, 'farm-area-guarded')).trim() === '',
      `«${await valueOf(page, 'farm-area-guarded')}»`)

    /* La cible tactile : 44 px, comme tout ce qui se touche sur cet écran. */
    const adopt = page.getByTestId('farm-guarded-adopt').first()
    const adoptBox = (await adopt.count()) === 0 ? null : await adopt.boundingBox()
    check(`A207 · ${engine} · le bouton fait au moins 44 px de haut`,
      !!adoptBox && adoptBox.height >= 43.5, adoptBox ? `${Math.round(adoptBox.height)} px` : 'absent')

    /* LE GESTE. */
    check(`A207 · ${engine} · le doigt touche « להשתמש בסכום השטחים »`, await tap(page, 'farm-guarded-adopt'))
    check(`A207 · ${engine} · le champ porte 1100`, (await valueOf(page, 'farm-area-guarded')) === '1100',
      await valueOf(page, 'farm-area-guarded'))
    check(`A207 · ${engine} · et la ligne de suggestion s'efface — plus rien à écraser`,
      (await suggestion.count()) === 0)

    /* UNE VALEUR ACCEPTÉE NE SE RECALCULE PAS. */
    await setField(page, 'farm-area-cultivated', '700')
    await setField(page, 'farm-area-grazing', '4000')
    check(`A207 · ${engine} · les surfaces changent, 1100 ne bouge pas`,
      (await valueOf(page, 'farm-area-guarded')) === '1100', await valueOf(page, 'farm-area-guarded'))
    check(`A207 · ${engine} · et aucune suggestion ne revient par-dessus`, (await suggestion.count()) === 0)

    await saveForm(page)
    await open(page, '#/coordinator/farms/farm-07', 2400)
    const figure = (await page.textContent('body')) ?? ''
    check(`A207 · ${engine} · la fiche enregistrée montre 1,100`, figure.includes('1,100') || figure.includes('1100'),
      figure.includes('1,100') ? '1,100' : 'absent')

    await open(page, '#/coordinator/farms/farm-07/edit', 2600)
    check(`A207 · ${engine} · rouverte, elle porte toujours 1100`,
      (await valueOf(page, 'farm-area-guarded')) === '1100', await valueOf(page, 'farm-area-guarded'))
    check(`A207 · ${engine} · et la suggestion reste muette`, (await suggestion.count()) === 0)

    /* VIDER LE CHAMP EST UN GESTE AUSSI : la proposition revient. */
    await setField(page, 'farm-area-guarded', '')
    check(`A207 · ${engine} · vidé, le champ redemande la suggestion`, (await suggestion.count()) === 1,
      `${await suggestion.count()} ligne(s)`)

    /* UNE FICHE À QUI PERSONNE N'A RÉPONDU : la fiche dit « — ». */
    await open(page, '#/coordinator/farms/farm-09', 2400)
    const untouched = (await textOf('band-guarded-dunams')).replace(/\s+/g, ' ')
    check(`A207 · ${engine} · une fiche sans geste affiche « — » sur SA vignette`,
      untouched.includes('—'), untouched.slice(0, 60))
    check(`A207 · ${engine} · et elle DIT « לא הוצהר » plutôt que de laisser deviner`,
      untouched.includes('לא הוצהר'), untouched.slice(0, 80))

    check(`A207 · ${engine} · aucune erreur de page`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  } finally {
    await browser.close()
  }
}

async function geoScenario(browserType: BrowserType, engine: string): Promise<void> {
  const browser: Browser = await browserType.launch()
  try {
    const context = await browser.newContext({
      viewport: IPAD_PORTRAIT,
      hasTouch: true,
      permissions: engine === 'chromium' ? ['clipboard-read', 'clipboard-write'] : undefined,
    })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => { if (!String(e).includes('ResizeObserver loop')) errors.push(String(e)) })

    section(`A210 — ${engine} — אבחון מיקום : une ligne par lancement, un bouton qui copie`)

    await open(page, '#/coordinator/settings', 2600)
    const block = page.getByTestId('block-settings-geo-diag')
    check(`A210 · ${engine} · l'écran de diagnostic est en place, dans les réglages`,
      (await block.count()) === 1)
    /* Replié par défaut (`defaultOpen={false}`) : il faut le déplier. */
    if ((await page.locator('[data-block="settings-geo-diag"][data-open="0"]').count()) === 1) {
      await tap(page, 'block-settings-geo-diag')
      await page.waitForTimeout(400)
    }
    const rows = () => page.getByTestId('geo-diag-row').count()
    const first = await rows()
    check(`A210 · ${engine} · ce lancement a été enregistré`, first >= 1, `${first} ligne(s)`)

    /* UN AUTRE LANCEMENT = UNE LIGNE DE PLUS. C'est la question d'AG7. */
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(2200)
    if ((await page.locator('[data-block="settings-geo-diag"][data-open="0"]').count()) === 1) {
      await tap(page, 'block-settings-geo-diag')
      await page.waitForTimeout(400)
    }
    const second = await rows()
    check(`A210 · ${engine} · un second lancement ajoute UNE ligne, pas zéro et pas deux`,
      second === first + 1, `${first} → ${second}`)

    const row = page.getByTestId('geo-diag-row').first()
    const standalone = await row.getAttribute('data-standalone')
    const permission = await row.getAttribute('data-permission')
    check(`A210 · ${engine} · chaque ligne porte les trois faits`,
      standalone !== null && permission !== null &&
        (await row.getAttribute('data-prompts')) !== null,
      `standalone=${standalone} permission=${permission}`)

    /* LE BOUTON DE COPIE. */
    const copy = page.locator('[data-block="settings-geo-diag"] [data-testid="copy-button"]')
    check(`A210 · ${engine} · le bouton de copie existe`, (await copy.count()) === 1)
    check(`A210 · ${engine} · le doigt l'atteint`, await tapAt(page, copy))
    await page.waitForTimeout(500)
    const stateOf = async (): Promise<string> =>
      (await copy.count()) === 0 ? '(bouton absent)' : ((await copy.getAttribute('data-copy-state')) ?? '(sans état)')
    const state = await stateOf()
    check(`A210 · ${engine} · il annonce « הועתק », pas un échec`, state === 'copied', String(state))
    if (engine === 'chromium' && (await copy.count()) === 1) {
      const clip = await page.evaluate(() => navigator.clipboard.readText())
      check(`A210 · ${engine} · et le presse-papiers porte VRAIMENT les mesures`,
        clip.includes('standalone=') && clip.includes('permission=') && clip.includes('prompts='),
        clip.split('\n')[0]?.slice(0, 60) ?? 'vide')
      check(`A210 · ${engine} · autant de lignes copiées que de lignes affichées`,
        clip.split('\n').filter((l) => l.trim() !== '').length === second,
        `${clip.split('\n').filter((l) => l.trim() !== '').length} / ${second}`)
    }

    /* ⚠️ ET QUAND LA COPIE ÉCHOUE, LE BOUTON LE DIT. C'est le défaut trouvé en
       AL3.2 : le `catch` était muet et la coche mentait. */
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        get: () => ({ writeText: () => Promise.reject(new Error('refusé')) }),
      })
      ;(document as unknown as { execCommand: () => boolean }).execCommand = () => false
    })
    await page.waitForTimeout(1900) /* l'état revient à « idle » au bout de 1,8 s */
    await tapAt(page, copy)
    await page.waitForTimeout(500)
    const failedState = await stateOf()
    check(`A210 · ${engine} · presse-papiers refusé → le bouton DIT l'échec`,
      failedState === 'failed', String(failedState))

    check(`A210 · ${engine} · aucune erreur de page`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  } finally {
    await browser.close()
  }
}

console.log('')
console.log('  AL — LA SUGGESTION, LE GESTE, ET LA MESURE DE LA LOCALISATION')
console.log('  =============================================================')
console.log(`  ${base}`)

try {
  const only = process.env.ENGINE
  if (!only || only === 'webkit') {
    await guardedScenario(webkit, 'webkit')
    await geoScenario(webkit, 'webkit')
  }
  if (!only || only === 'chromium') {
    await guardedScenario(chromium, 'chromium')
    await geoScenario(chromium, 'chromium')
  }
} finally {
  serve?.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
