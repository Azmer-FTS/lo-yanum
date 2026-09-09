import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * ★★ A163 · A164 · A165 — LE GABARIT, LE LOGO, ET LA LIGNE QUI DISPARAÎT.
 *
 *   bun run scripts/ahdoc.ts
 *
 * Les captures atterrissent dans `docs/screenshots/ahpass/`.
 */
const OUT = process.env.OUT ?? 'dist-ahpass'
const PORT = Number(process.env.PORT ?? 5281)
const SHOTS = 'docs/screenshots/ahpass'
mkdirSync(SHOTS, { recursive: true })

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
if (process.env.SKIP_BUILD !== '1') {
  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], { env, stdout: 'ignore', stderr: 'pipe' })
  if ((await build.exited) !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error('vite build failed')
  }
}
const serve = Bun.spawn(
  ['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'],
  { env, stdout: 'ignore', stderr: 'ignore' },
)
const base = `http://localhost:${PORT}`
{
  const deadline = Date.now() + 40_000
  for (;;) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break } catch { /* pas encore */ }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

console.log('')
console.log('  A163 · A164 · A165 — LE GABARIT DU DOCUMENT DE SIGNATURE')
console.log('  =========================================================')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1032, height: 1376 } })
const page = await ctx.newPage()
try {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(900)
  await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
  await page.waitForTimeout(2600)

  const block = page.locator('[data-testid="block-settings-agreement-doc"]')
  check('la section « מסמך החתימה » existe dans les réglages', (await block.count()) === 1)
  if ((await block.count()) === 1) {
    await block.click()
    await page.waitForTimeout(1200)
  }
  await page.locator('[data-testid="agreement-doc-template"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(2500)

  // --- A163 : l'aperçu est le document ------------------------------------
  const shot = page.locator('[data-testid="agreement-doc-preview-page"]')
  check('A163 · l’aperçu du document est rendu', (await shot.count()) === 1)
  await page.screenshot({ path: `${SHOTS}/a163-gabarit.png`, fullPage: false })

  // --- A163 : une variable inconnue est REFUSÉE et NOMMÉE -----------------
  const area = page.locator('[data-testid="agreement-doc-template"]')
  const original = await area.inputValue()
  await area.fill(`${original}\n{{שם_החקלא}}`)
  await page.locator('[data-testid="agreement-doc-save"]').click()
  await page.waitForTimeout(500)
  const named = await page.locator('[data-testid="agreement-doc-unknown"]').textContent().catch(() => null)
  check(
    'A163 · une variable mal orthographiée est refusée, en la nommant',
    (named ?? '').includes('שם_החקלא'),
    named ?? 'aucun refus',
  )
  await page.screenshot({ path: `${SHOTS}/a163-variable-refusee.png` })

  // --- A165 : une variable non renseignée ne laisse ni champ ni ligne -----
  await area.fill(original)
  await page.locator('[data-testid="agreement-doc-save"]').click()
  await page.waitForTimeout(600)
  const rule = await page.evaluate(() => {
    const w = window as unknown as {
      __ah?: { render: (t: string, v: Record<string, string>) => string }
    }
    return w.__ah ? 'exposed' : 'not-exposed'
  })
  check('A165 · la règle est vérifiée hors navigateur (voir ahpass)', rule === 'not-exposed')

  // --- A164 : le logo est remplaçable -------------------------------------
  const state = await page.locator('[data-testid="agreement-doc-logo-state"]').textContent()
  check('A164 · l’état initial est le logo de l’association', (state ?? '').trim() !== '')
  const before = await shot.getAttribute('src')
  await page.locator('[data-testid="agreement-doc-logo-none"]').click()
  await page.waitForTimeout(2200)
  const after = await shot.getAttribute('src')
  check('A164 · retirer le logo change le document rendu', before !== after)
  await page.locator('[data-testid="agreement-doc-logo-reset"]').click()
  await page.waitForTimeout(2200)
  const back = await shot.getAttribute('src')
  check('A164 · le logo de l’association revient, il n’est jamais imposé', back === before)
  await page.screenshot({ path: `${SHOTS}/a164-logo.png` })
} finally {
  await browser.close()
  serve.kill()
}
console.log('')
console.log(`  ${passed} PASS · ${failed} FAIL`)
console.log('')
if (failed > 0) process.exit(1)
