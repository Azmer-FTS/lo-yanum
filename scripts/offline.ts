import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'

import { applyChanges } from '../src/data/write'

import { fixtureChanges, fixtureDeletions } from './fixture'

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
 * P2.5b added an eighth, and it is the only claim in this project that cannot
 * be made anywhere but in a real browser:
 *
 *   8  ★ SIGNED IN, THE APP SURVIVES LOSING THE NETWORK — AND SIGNING OUT
 *      LEAVES NOTHING BEHIND. A77 proves every rule of the cache and the
 *      outbox against a memory implementation of the same contract; A76 proves
 *      the writes land. Neither can prove that INDEXEDDB itself holds the
 *      snapshot, that the session is not thrown away when the token cannot be
 *      refreshed, or that an explicit sign-out really empties the device. This
 *      does, and it needs the disposable test account (`.env.test`) — which
 *      MUST BE DELETED BEFORE P3.1. Without it this section SKIPS rather than
 *      fails, because that deletion is the intended end state.
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

async function readEnv(name: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const file = Bun.file(name)
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

const fileEnv = await readEnv('.env.real')
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

const testEnvFile = await readEnv('.env.test')
const TEST_EMAIL = process.env.TEST_EMAIL ?? testEnvFile.TEST_EMAIL ?? ''
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? testEnvFile.TEST_PASSWORD ?? ''

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

    /**
     * PO RETURN 3 (2026-08-31) — AND IT SAYS WHY, IN HEBREW, BEFORE THE
     * ATTEMPT.
     *
     * A first sign-in genuinely cannot happen without a network: the password
     * is checked by Supabase and by nothing on the device. That is a
     * structural limit and the app is allowed to have it. What it is not
     * allowed to do is dress it up as a server problem — "no connection to the
     * server, check your connection and try again" is advice, and it is advice
     * that cannot be followed by someone in a wadi. The screen now says the
     * true thing, and says it above the button rather than after a password
     * has been typed and lost.
     */
    const OFFLINE_MSG = 'אין חיבור לאינטרנט — נדרש חיבור להתחברות ראשונה'
    const noticeText = await realPage
      .textContent('[data-testid="login-offline"]', { timeout: 5_000 })
      .catch(() => null)
    check(
      '★ the door explains the offline case BEFORE a password is typed',
      (noticeText ?? '').includes(OFFLINE_MSG),
      noticeText ?? 'no notice',
    )

    // And the same message, not the generic one, if he tries anyway.
    await realPage.fill('input[name="email"]', 'someone@example.com')
    await realPage.fill('input[name="password"]', 'not-a-real-password')
    await realPage.click('button[type="submit"]')
    const errText = await realPage
      .textContent('[data-testid="login-error"]', { timeout: 10_000 })
      .catch(() => null)
    check(
      'and an attempt offline gets that message, not a generic server error',
      (errText ?? '').includes(OFFLINE_MSG),
      errText ?? 'no error shown',
    )

    await realContext.close()

    // ------------------------------------------- P2.5b: signed in, offline ---
    section('SIGNED IN, THE APP SURVIVES LOSING THE NETWORK (P2.5b)')

    if (TEST_EMAIL === '' || TEST_PASSWORD === '') {
      console.log('  SKIP  (no .env.test — the disposable account is gone, which is the end state)')
    } else {
      // Seed something worth caching, through the app's OWN writer, with ids
      // that begin `a76-` so the cleanup below is a statement and not a hope.
      const seeder = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const { error: seedAuth } = await seeder.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      })
      check('the disposable account signs in (for seeding)', seedAuth === null, seedAuth?.message ?? '')

      if (!seedAuth) {
        await applyChanges(seeder, fixtureChanges())
        try {
          const ctx = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            locale: 'he-IL',
          })
          const page = await ctx.newPage()
          page.setDefaultTimeout(30_000)

          await page.goto(`${real.url}/#/`, { waitUntil: 'load' })
          await page.waitForSelector('[data-testid="login-form"]')
          await page.fill('input[name="email"]', TEST_EMAIL)
          await page.fill('input[name="password"]', TEST_PASSWORD)
          await page.click('button[type="submit"]')

          const shell = await page
            .waitForSelector('[data-testid="sign-out"]', { timeout: 30_000 })
            .then(() => true)
            .catch(() => false)
          check('signing in through the form opens the app', shell)

          await page.goto(`${real.url}/#/coordinator/farms`, { waitUntil: 'load' })
          const seenOnline = await page
            .waitForSelector('text=חוות א76', { timeout: 30_000 })
            .then(() => true)
            .catch(() => false)
          check('the seeded entity is on screen, from the server', seenOnline)

          // The cache is written on the same queue as the hydration; give it
          // the tick it needs rather than racing it.
          const cached = await page.waitForFunction(
            () =>
              new Promise<number>((resolve) => {
                const request = indexedDB.open('lo-yanum')
                request.onerror = () => resolve(-1)
                request.onsuccess = () => {
                  const db = request.result
                  if (!db.objectStoreNames.contains('aggregates')) {
                    resolve(0)
                    return
                  }
                  const count = db.transaction('aggregates').objectStore('aggregates').count()
                  count.onsuccess = () => resolve(count.result)
                  count.onerror = () => resolve(-1)
                }
              }).then((n) => (n > 0 ? n : false)),
            undefined,
            { timeout: 20_000 },
          ).then((h) => h.jsonValue()).catch(() => 0)
          check('IndexedDB really holds the snapshot', Number(cached) > 10, `${String(cached)} aggregates`)

          // ★ THE ONE THAT MATTERS. Offline, reloaded: the coordinator must get
          //   his farms, not a login form he cannot possibly satisfy.
          await ctx.setOffline(true)
          await page.goto(`${real.url}/#/coordinator/farms`, { waitUntil: 'load' })

          const stillIn = await page
            .waitForSelector('[data-testid="sign-out"]', { timeout: 30_000 })
            .then(() => true)
            .catch(() => false)
          check('an offline reload keeps the coordinator inside the app', stillIn)

          const loginShown = await page
            .$('[data-testid="login-form"]')
            .then((el) => el !== null)
          check('and the login form is NOT what a coordinator with no signal sees', !loginShown)

          /**
           * PO return 3 — AND HE CAN SEE THAT HE IS OFFLINE, which is the
           * other half of the scenario he actually lived: session established,
           * app closed, aeroplane mode, app reopened. Being let in is only
           * reassuring if the app also admits WHY the numbers might be an hour
           * old. `OfflineBadge` renders nothing when there is a network, on
           * purpose (P2.5a), so its presence here is the whole assertion.
           */
          const badgeOffline = await page
            .waitForSelector('[data-testid="offline-badge"]', { timeout: 10_000 })
            .then(() => true)
            .catch(() => false)
          check('★ and the offline badge is visible on the reopened app', badgeOffline)

          const seenOffline = await page
            .waitForSelector('text=חוות א76', { timeout: 20_000 })
            .then(() => true)
            .catch(() => false)
          check('the data is still there, out of the cache', seenOffline)

          /**
           * ★ AND NOW THE CASE THE RELOAD ABOVE DOES NOT ACTUALLY REACH.
           *
           * A reload a minute after signing in still has a valid access token
           * in storage, so `getSession()` answers from localStorage and never
           * touches the network — which proves the app reloads offline, and
           * proves nothing about the token EXPIRING offline. That is the case
           * that ends a night, and it is the one `resolveSignedOut` exists for.
           *
           * Emptying supabase-js's own storage key reproduces it exactly:
           * `getSession()` then has nothing to answer with and no network to
           * refresh from, which is what an expired token offline amounts to.
           * The app must stay open on the remembered identity.
           */
          await page.evaluate(() => {
            localStorage.removeItem('lo-yanum:auth')
          })
          await page.goto(`${real.url}/#/coordinator/farms`, { waitUntil: 'load' })
          const survivedExpiry = await page
            .waitForSelector('[data-testid="sign-out"]', { timeout: 30_000 })
            .then(() => true)
            .catch(() => false)
          check('★ a token that cannot be refreshed offline does NOT end the session', survivedExpiry)
          check(
            'and the cached data is still what the screen shows',
            await page
              .waitForSelector('text=חוות א76', { timeout: 20_000 })
              .then(() => true)
              .catch(() => false),
          )

          /**
           * ★ AND THE OTHER HALF OF THE SAME RULE: online, ASKED, and refused
           *   is a real sign-out. Keeping a session forever because the device
           *   once had one would be a device that can never be handed over.
           */
          await ctx.setOffline(false)
          const askedAndRefused = await page
            .waitForSelector('[data-testid="login-form"]', { timeout: 30_000 })
            .then(() => true)
            .catch(() => false)
          check(
            '★ but the network coming back re-asks, and a refusal DOES end it',
            askedAndRefused,
          )

          // Back in for the sign-out half.
          await page.fill('input[name="email"]', TEST_EMAIL)
          await page.fill('input[name="password"]', TEST_PASSWORD)
          await page.click('button[type="submit"]')
          await page.waitForSelector('[data-testid="sign-out"]', { timeout: 30_000 })

          // Signing out is the OTHER half of the asymmetry, and it is the half
          // that protects the next person on a shared iPad.
          await page.goto(`${real.url}/#/coordinator`, { waitUntil: 'load' })
          await page.waitForSelector('[data-testid="sign-out"]')
          page.once('dialog', (d) => {
            void d.accept()
          })
          await page.click('[data-testid="sign-out"]')
          const doorBack = await page
            .waitForSelector('[data-testid="login-form"]', { timeout: 30_000 })
            .then(() => true)
            .catch(() => false)
          check('signing out shows the door again', doorBack)

          const leftOver = await page.evaluate(
            () =>
              new Promise<number>((resolve) => {
                const request = indexedDB.open('lo-yanum')
                request.onerror = () => resolve(-1)
                request.onsuccess = () => {
                  const db = request.result
                  if (!db.objectStoreNames.contains('aggregates')) {
                    resolve(0)
                    return
                  }
                  const count = db.transaction('aggregates').objectStore('aggregates').count()
                  count.onsuccess = () => resolve(count.result)
                  count.onerror = () => resolve(-1)
                }
              }),
          )
          check(
            '★ and it empties the device — nothing for the next person',
            leftOver === 0,
            `${leftOver} aggregate(s) left in IndexedDB`,
          )
          check(
            'the remembered identity goes with it',
            (await page.evaluate(() => localStorage.getItem('lo-yanum:last-session'))) === null,
          )

          await ctx.close()
        } finally {
          await applyChanges(seeder, fixtureDeletions())
          await seeder.auth.signOut()
        }
      }
    }
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
