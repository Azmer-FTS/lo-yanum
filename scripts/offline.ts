import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'

/**
 * A72 — THE OFFLINE SHELL (P2.5a).
 *
 * The service worker is PRODUCTION ONLY, so this gate does what no other gate
 * does: it BUILDS the app and serves the build. A dev server would prove
 * nothing, and a stale `dist/` would prove something about last week.
 *
 *   1  the worker registers and takes control of the page;
 *   2  ONE online load is enough — pulled offline and reloaded, the app still
 *      renders, from cache, with no browser error page;
 *   3  ★ NOTHING FROM SUPABASE IS EVER CACHED. This is the check the whole
 *      file exists for. A cached REST answer is a stale fact about tonight; a
 *      cached auth response is somebody else's session on a shared iPad. The
 *      assertion is that a Supabase request made offline FAILS — because the
 *      only correct offline story for data is P2.5b's outbox, which knows
 *      about identity and about last-write-wins, and a service worker knows
 *      about neither;
 *   4  ground that has been LOOKED AT is still there offline — the browsing
 *      tile cache;
 *   5  the offline badge appears when the network goes and leaves when it
 *      comes back;
 *   6  the frozen /poc survives too, and comes back as ITSELF rather than as
 *      the app's shell — which is the navigation fallback's one hard case;
 *   7  a real build's LOGIN screen renders offline as well: a coordinator who
 *      reopens the app with no signal must see the door, not a browser error.
 *
 *   bun run offline
 */

const PORT = Number(process.env.PREVIEW_PORT ?? 5197)
const REAL_PORT = Number(process.env.REAL_PREVIEW_PORT ?? 5196)

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

async function readEnvReal(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const file = Bun.file('.env.real')
  if (!(await file.exists())) return out
  for (const line of (await file.text()).split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

/** Build into `outDir` with the given env, then serve it. */
async function buildAndServe(
  outDir: string,
  port: number,
  env: Record<string, string>,
): Promise<{ url: string; stop: () => void }> {
  const buildEnv = {
    ...process.env,
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_PUBLISHABLE_KEY: '',
    ...env,
  }

  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', outDir], {
    env: buildEnv,
    stdout: 'ignore',
    stderr: 'pipe',
  })
  const code = await build.exited
  if (code !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error(`vite build failed for ${outDir}`)
  }

  const serve = Bun.spawn(
    ['bun', 'x', 'vite', 'preview', '--outDir', outDir, '--port', String(port), '--strictPort'],
    { env: buildEnv, stdout: 'ignore', stderr: 'ignore' },
  )

  const url = `http://localhost:${port}`
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (res.ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      serve.kill()
      throw new Error(`vite preview did not come up on ${port}`)
    }
    await Bun.sleep(250)
  }
  return { url, stop: () => serve.kill() }
}

/** Wait until a service worker is actually controlling the page. */
async function waitForController(page: Page, timeoutMs = 20_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker?.controller),
      undefined,
      { timeout: timeoutMs },
    )
    return true
  } catch {
    return false
  }
}

console.log('A72 — the offline shell: one online load is enough')
console.log('  building… (this gate serves a real production build, not a dev server)')

const fileEnv = await readEnvReal()
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

const demo = await buildAndServe('dist-offline-demo', PORT, {})

let browser: Browser | null = null
let real: { url: string; stop: () => void } | null = null

try {
  browser = await chromium.launch()
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'he-IL',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)

  // ------------------------------------------------------------ register ---
  section('THE WORKER TAKES CONTROL')

  await page.goto(`${demo.url}/#/coordinator`, { waitUntil: 'load' })
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker?.getRegistration()
    return Boolean(reg)
  })
  check('a service worker is registered', registered)

  // The first load registers; control arrives on `claim` or on the next load.
  const controlled = await waitForController(page)
  check('and it controls the page', controlled)

  // A second load with the network still up, so the shell and the assets are
  // in the cache before anything is taken away.
  await page.goto(`${demo.url}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForSelector('nav a[href*="#/coordinator"]', { timeout: 20_000 })

  // Ask for two real tiles the way browsing does, so the tile rule has
  // something to have cached. Two, not six thousand — see ETAT on why bulk
  // pre-fetching against OSM is a policy question and not a technical one.
  const TILE = 'https://tile.openstreetmap.org/10/609/418.png'
  await page.evaluate(async (url) => {
    await fetch(url, { mode: 'no-cors' })
  }, TILE)
  await page.waitForTimeout(800)

  // --------------------------------------------------------------- offline --
  section('PULLED OFFLINE')

  await context.setOffline(true)

  await page.goto(`${demo.url}/#/coordinator`, { waitUntil: 'load' })
  const shellRendered = await page
    .waitForSelector('nav a[href*="#/coordinator"]', { timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  check('the app renders with no network at all', shellRendered)

  // VISIBLE, not present. Both shells render one — the rail's and the mobile
  // top bar's — and CSS hides the wrong one at any given width. Counting DOM
  // nodes would have asserted `=== 1` against a truthful `2`, which is how a
  // gate ends up being fixed by breaking the app.
  const badgesVisible = await page.locator('[data-testid="offline-badge"]:visible').count()
  check(
    'exactly one offline badge is on screen',
    badgesVisible === 1,
    `${badgesVisible} visible of ${await page.locator('[data-testid="offline-badge"]').count()} in the DOM`,
  )

  const tileOffline = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url, { mode: 'no-cors' })
      return res.type === 'opaque' || res.ok
    } catch {
      return false
    }
  }, TILE)
  check('ground already looked at is still there', tileOffline, TILE)

  // ★ the check this file exists for
  if (SUPABASE_URL !== '' && SUPABASE_KEY !== '') {
    const supabaseOffline = await page.evaluate(
      async ([url, key]) => {
        try {
          const res = await fetch(`${url}/rest/v1/volunteers?select=id&limit=1`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
          })
          return { reached: true, status: res.status, body: (await res.text()).slice(0, 40) }
        } catch (err) {
          return { reached: false, status: 0, body: String(err).slice(0, 60) }
        }
      },
      [SUPABASE_URL, SUPABASE_KEY],
    )
    check(
      '★ a Supabase read offline FAILS — nothing from the API was ever cached',
      !supabaseOffline.reached,
      supabaseOffline.reached
        ? `LEAKED FROM CACHE: ${supabaseOffline.status} ${supabaseOffline.body}`
        : 'network error, as it must be',
    )
  } else {
    console.log('  SKIP  the Supabase no-cache check (no .env.real)')
  }

  // ---------------------------------------------------------------- /poc ---
  section('THE FROZEN POC COMES BACK AS ITSELF')

  await context.setOffline(false)
  await page.goto(`${demo.url}/poc/#/`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await context.setOffline(true)
  await page.goto(`${demo.url}/poc/#/`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  const pocText = await page.evaluate(() => document.body.innerText)
  check(
    'the poc renders offline, and it is the POC and not the app shell',
    pocText.includes('כניסה כרכז'),
    pocText.slice(0, 60).replace(/\n/g, ' '),
  )

  // --------------------------------------------------------------- online ---
  section('AND BACK')

  await context.setOffline(false)
  await page.goto(`${demo.url}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForSelector('nav a[href*="#/coordinator"]')
  await page.waitForTimeout(500)
  check(
    'the offline badge is gone entirely — not merely hidden',
    (await page.locator('[data-testid="offline-badge"]').count()) === 0,
  )

  // ------------------------------------------------------------- settings ---
  section('הגדרות REPORTS AND CLEARS')

  await page.goto(`${demo.url}/#/coordinator/settings`, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  const settingsText = await page.evaluate(() => document.body.innerText)
  check('the settings screen names the held ground', settingsText.includes('אריחי מפה') || settingsText.includes('עדיין לא נשמר'))

  const clearButton = page.locator('[data-testid="clear-tiles"]')
  if ((await clearButton.count()) === 1 && (await clearButton.isEnabled())) {
    await clearButton.click()
    await page.waitForTimeout(1000)
    const emptied = await page.evaluate(async () => {
      const cache = await caches.open('lo-yanum-tiles-v1')
      return (await cache.keys()).length
    })
    check('clearing really empties the tile cache', emptied === 0, String(emptied))
  } else {
    check('clearing really empties the tile cache', false, 'the button was not offerable')
  }

  await context.close()

  // ----------------------------------------------------------- real build ---
  section('A REAL BUILD SHOWS ITS DOOR OFFLINE, NOT A BROWSER ERROR')

  if (SUPABASE_URL === '' || SUPABASE_KEY === '') {
    console.log('  SKIP  (no .env.real)')
  } else {
    real = await buildAndServe('dist-offline-real', REAL_PORT, {
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
    })
    const realContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'he-IL',
    })
    const realPage = await realContext.newPage()
    realPage.setDefaultTimeout(30_000)

    await realPage.goto(`${real.url}/#/`, { waitUntil: 'load' })
    await realPage.waitForSelector('[data-testid="login-form"]', { timeout: 20_000 })
    await waitForController(realPage)
    await realPage.goto(`${real.url}/#/`, { waitUntil: 'load' })
    await realPage.waitForSelector('[data-testid="login-form"]')

    await realContext.setOffline(true)
    await realPage.goto(`${real.url}/#/`, { waitUntil: 'load' })
    const doorOffline = await realPage
      .waitForSelector('[data-testid="login-form"]', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    check('the login screen renders with no network', doorOffline)

    await realContext.close()
  }
} finally {
  if (browser) await browser.close()
  demo.stop()
  real?.stop()
}

console.log('')
if (failed === 0) {
  console.log(`  All ${passed} checks passed.`)
} else {
  console.log(`  ${failed} of ${passed + failed} checks FAILED.`)
  process.exit(1)
}
