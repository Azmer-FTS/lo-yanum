import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * ★★ A170 — L'ITINÉRAIRE LIBRE, DE BOUT EN BOUT.
 *
 *   bun run ahroute
 *
 * Collage de plusieurs liens · trajet tracé · durées · réordonnancement ·
 * heures d'arrivée · envoi · conversion en fiche.
 */
const OUT = process.env.OUT ?? 'dist-ahpass'
const PORT = Number(process.env.PORT ?? 5311)
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
console.log('  A170 — L’ITINÉRAIRE LIBRE')
console.log('  =========================')

/**
 * Trois liens de localisation, dans les trois formes que le PO reçoit
 * réellement, et posés dans un ORDRE VOLONTAIREMENT MAUVAIS : le plus loin en
 * premier. C'est ce qui rend la proposition d'ordre court vérifiable.
 */
const LINKS = [
  'https://www.google.com/maps/@30.6100,34.8000,15z',      // le plus au sud
  'https://waze.com/ul?ll=31.2500%2C34.7900',              // le plus au nord
  '31.0512, 34.7231',                                      // entre les deux
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1032, height: 1376 } })
const page = await ctx.newPage()
try {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(900)
  await page.goto(`${base}/#/coordinator/route/free`, { waitUntil: 'load' })
  await page.waitForTimeout(3200)

  check('A170 · l’écran s’ouvre', (await page.locator('[data-testid="free-route-offline-note"]').count()) === 1)

  // --- 1 · coller plusieurs liens ------------------------------------------
  for (const link of LINKS) {
    await page.locator('[data-testid="position-link"]').first().fill(link)
    await page.locator('[data-testid="position-link"]').first().press('Enter')
    await page.waitForTimeout(700)
  }
  const stops = page.locator('[data-testid="free-route-stop"]')
  check('A170 · chaque lien collé devient une épingle', (await stops.count()) === 3, `${await stops.count()}`)

  // --- 2 · le trajet, ses durées et ses heures ------------------------------
  const totals = await page.locator('[data-testid="free-route-totals"]').innerText()
  check('A170 · le total et l’heure de retour sont affichés', /\d/.test(totals), totals.replace(/\s+/g, ' '))
  const arrivals = await page.locator('[data-testid="free-route-arrive"]').allInnerTexts()
  check(
    'A170 · chaque étape porte une heure d’arrivée estimée',
    arrivals.length === 3 && arrivals.every((a) => /\d{2}:\d{2}/.test(a)),
    arrivals.join(' | '),
  )
  const line = await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getLayer: (id: string) => unknown } }).__loYanumMap
    return m ? (m.getLayer('route-line') ? 'drawn' : 'no-layer') : 'no-map'
  })
  check('A170 · le trajet est TRACÉ sur la carte', line === 'drawn', line)

  // --- 3 · réordonnancement -------------------------------------------------
  const before = await page.locator('[data-testid="free-route-stop-label"]').first().inputValue()
  await page.locator('[data-testid="free-route-down"]').first().click()
  await page.waitForTimeout(600)
  const after = await page.locator('[data-testid="free-route-stop-label"]').first().inputValue()
  check('A170 · les flèches réordonnent les étapes', before !== after, `${before} → ${after}`)

  // --- 4 · la proposition d'ordre court ------------------------------------
  const suggest = page.locator('[data-testid="free-route-accept-order"]')
  const hasSuggestion = (await suggest.count()) === 1
  check('A170 · un ordre plus court est PROPOSÉ quand il en existe un', hasSuggestion)
  if (hasSuggestion) {
    const kmBefore = await page.locator('[data-testid="free-route-totals"]').innerText()
    await suggest.click()
    await page.waitForTimeout(700)
    const kmAfter = await page.locator('[data-testid="free-route-totals"]').innerText()
    const n = (s: string) => Number(/([\d.]+)/.exec(s)?.[1] ?? '0')
    check(
      'A170 · l’accepter raccourcit vraiment le trajet',
      n(kmAfter) < n(kmBefore),
      `${n(kmBefore)} → ${n(kmAfter)} km`,
    )
  }

  // --- 5 · l'heure de départ change les arrivées ----------------------------
  await page.locator('[data-testid="free-route-depart"]').fill('06:00')
  await page.waitForTimeout(700)
  const early = await page.locator('[data-testid="free-route-arrive"]').first().innerText()
  check('A170 · changer l’heure de départ déplace les arrivées', /0[6-9]:/.test(early), early)

  // --- 6 · envoyer l'heure --------------------------------------------------
  await page.locator('[data-testid="free-route-stop"] input[type="tel"]').first().fill('050-1234567')
  await page.waitForTimeout(500)
  const sms = (await page.locator('[data-testid="free-route-sms"]').first().getAttribute('href')) ?? ''
  const wa = (await page.locator('[data-testid="free-route-whatsapp"]').first().getAttribute('href')) ?? ''
  check('A170 · l’heure part par SMS, avec le numéro et le message', sms.startsWith('sms:') && sms.includes('%3A'), sms.slice(0, 70))
  check('A170 · et par WhatsApp', wa.includes('wa.me') || wa.includes('whatsapp'), wa.slice(0, 50))

  // --- 7 · conversion en fiche ferme ---------------------------------------
  await page.locator('[data-testid="free-route-to-farm"]').first().click()
  await page.waitForTimeout(2600)
  const url = page.url()
  check('A170 · une étape se convertit en fiche ferme, point et nom déjà dedans', url.includes('/farms/new?at='), url.split('#')[1] ?? '')
  /* La carte du formulaire met quelques secondes à monter ses tuiles et son
     marqueur ; l'attendre est plus honnête qu'un délai fixe plus long. */
  await page
    .waitForSelector('[data-marker-kind="pin"]', { timeout: 20000 })
    .catch(() => null)
  const pinned = await page.evaluate(() => document.querySelectorAll('[data-marker-kind="pin"]').length)
  check('A170 · et l’épingle est déjà posée sur le formulaire', pinned >= 1, `${pinned}`)

  // --- 8 · enregistrer et reprendre ----------------------------------------
  await page.goBack()
  await page.waitForTimeout(2600)
  await page.locator('[data-testid="free-route-save"]').click()
  await page.waitForTimeout(700)
  check('A170 · l’itinéraire s’enregistre', (await page.locator('[data-testid="free-route-list"] li').count()) >= 1)
  await page.reload()
  await page.waitForTimeout(3000)
  check(
    'A170 · et il se reprend après un rechargement',
    (await page.locator('[data-testid="free-route-list"] li').count()) >= 1,
  )
  await page.screenshot({ path: `${SHOTS}/a170-itineraire-libre.png`, fullPage: true })
} finally {
  await browser.close()
  serve.kill()
}
console.log('')
console.log(`  ${passed} PASS · ${failed} FAIL`)
console.log('')
if (failed > 0) process.exit(1)
