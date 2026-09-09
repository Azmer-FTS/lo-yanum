import { chromium } from 'playwright'
import type { Browser } from 'playwright'

import { FakeDb, USER_ID, installFakeSession, installFakeSupabase } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ A172 — LES RÉGLAGES, LES GABARITS ET LE LOGO SURVIVENT À UN VIDAGE DU
 *    STOCKAGE LOCAL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run ahsettings
 *
 * ★★ CE QU'ELLE FAIT EST EXACTEMENT CE QUE LE PO CRAINT : elle règle quelque
 *    chose, elle VIDE `localStorage` — le nettoyage de Safari, le changement
 *    d'appareil —, elle recharge, et elle regarde si le réglage est revenu.
 *
 * ⚠️ LA BASE EST FAUSSE, ET C'EST DIT. `fake-supabase.ts` intercepte les appels
 *    REST et tient les lignes en mémoire ; la vraie table `user_settings` a été
 *    créée sur `lo-yanum-prod` (migration 20260910000100) mais aucune session
 *    de coordinateur n'existe sur cette machine (ETAT §13), donc le
 *    va-et-vient RÉEL ne peut pas être conduit ici. Ce que cette porte prouve
 *    est que L'APPLICATION lit, écrit et restaure ; ce qu'elle ne prouve pas
 *    est que la politique RLS de Frankfurt accepte l'écriture. Cette
 *    moitié-là, c'est le PO qui la verra à la première ouverture.
 */
const OUT = process.env.OUT ?? 'dist-ahreal'
const PORT = Number(process.env.PORT ?? 5331)

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

/** Un build RÉEL : `SUPABASE_CONFIGURED` doit être vrai pour que la synchro existe. */
const env = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://fake.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_gate',
}
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
console.log('  A172 — LES RÉGLAGES SURVIVENT À UN VIDAGE DU STOCKAGE LOCAL')
console.log('  ===========================================================')

const db = new FakeDb()
db.seed()

const MY_TEMPLATE = '## הסכם מותאם AH11\n\nשם: {{שם_החקלאי}}\n\nסעיף שנוסף בבדיקה.'

let browser: Browser | undefined
try {
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1032, height: 1376 }, locale: 'he-IL' })
  await installFakeSupabase(context, db)
  await installFakeSession(context)
  const page = await context.newPage()
  page.setDefaultTimeout(25_000)

  await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
  await page.waitForTimeout(4000)

  // --- 1 · le PO règle quelque chose --------------------------------------
  const block = page.locator('[data-testid="block-settings-agreement-doc"]')
  check('l’écran de réglages est ouvert sur un build RÉEL', (await block.count()) === 1)
  if ((await block.count()) === 1) {
    await block.click()
    await page.waitForTimeout(1000)
  }
  await page.locator('[data-testid="agreement-doc-template"]').fill(MY_TEMPLATE)
  await page.locator('[data-testid="agreement-doc-save"]').click()
  /* La poussée est différée de 1,2 s (une requête par frappe serait absurde). */
  await page.waitForTimeout(2600)

  const stored = db.rows('user_settings')
  check(
    'A172 · le gabarit est monté sur le compte',
    stored.length === 1 &&
      String((stored[0].data as Record<string, string>)['lo-yanum:agreement-doc-template'] ?? '')
        .includes('AH11'),
    `${stored.length} ligne(s)`,
  )
  check(
    'A172 · rattaché à SON compte et à aucun autre',
    stored.length === 1 && stored[0].user_id === USER_ID,
    String(stored[0]?.user_id ?? '—'),
  )

  // --- 2 · le logo, réglé lui aussi ---------------------------------------
  await page.locator('[data-testid="agreement-doc-logo-none"]').click()
  await page.waitForTimeout(2600)
  const withLogo = db.rows('user_settings')[0]?.data as Record<string, string>
  check(
    'A172 · le réglage du logo monte aussi',
    typeof withLogo['lo-yanum:agreement-doc-logo'] === 'string',
    withLogo['lo-yanum:agreement-doc-logo'] ?? '—',
  )

  // --- 3 · ⚠️ LE VIDAGE DE SAFARI -----------------------------------------
  const before = await page.evaluate(() => localStorage.length)
  await page.evaluate(() => {
    /* Le laissez-passer de session est conservé : « vider le stockage » du PO
       est un nettoyage de site, pas une déconnexion — et sans session il n'y
       aurait rien à restaurer, ce qui rendrait la porte vide de sens. */
    const auth = localStorage.getItem('lo-yanum:auth')
    const sb = Object.keys(localStorage).filter((k) => k.startsWith('sb-'))
    const keep = sb.map((k) => [k, localStorage.getItem(k)] as const)
    localStorage.clear()
    if (auth) localStorage.setItem('lo-yanum:auth', auth)
    for (const [k, v] of keep) if (v !== null) localStorage.setItem(k, v)
  })
  const after = await page.evaluate(() => localStorage.length)
  check('A172 · le stockage local a bien été vidé', after < before, `${before} → ${after} clés`)

  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(5000)

  const restored = await page.evaluate(() =>
    localStorage.getItem('lo-yanum:agreement-doc-template'),
  )
  check(
    'A172 · le gabarit est REVENU après le vidage',
    (restored ?? '').includes('AH11'),
    (restored ?? '—').slice(0, 40),
  )
  const restoredLogo = await page.evaluate(() =>
    localStorage.getItem('lo-yanum:agreement-doc-logo'),
  )
  check('A172 · le logo aussi', typeof restoredLogo === 'string', restoredLogo ?? '—')

  // --- 4 · et l'écran le montre -------------------------------------------
  await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
  await page.waitForTimeout(4000)
  const b2 = page.locator('[data-testid="block-settings-agreement-doc"]')
  if ((await b2.count()) === 1) {
    await b2.click()
    await page.waitForTimeout(1200)
  }
  const shown = await page.locator('[data-testid="agreement-doc-template"]').inputValue()
  check('A172 · et l’écran affiche le texte du PO, pas celui livré', shown.includes('AH11'), shown.slice(0, 40))

  // --- 5 · ce qui NE doit PAS voyager --------------------------------------
  const blob = db.rows('user_settings')[0]?.data as Record<string, string>
  check(
    '⚠️ A172 · le laissez-passer de l’agriculteur et les plis de blocs ne montent JAMAIS',
    !Object.keys(blob).some((k) => k.includes('farmer-pass') || k.includes(':block:') || k.includes('challenge')),
    Object.keys(blob).join(' · '),
  )
} finally {
  if (browser) await browser.close()
  serve.kill()
}
console.log('')
console.log(`  ${passed} PASS · ${failed} FAIL`)
console.log('')
if (failed > 0) process.exit(1)
