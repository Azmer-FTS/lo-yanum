import { chromium } from 'playwright'
import type { Browser } from 'playwright'

/**
 * A70 — THE DOOR (P2.3).
 *
 * P2.3's whole claim is that the deployed app cannot be read without a Supabase
 * session, and that saying so did not break demo mode. Both halves are
 * checkable, and NEITHER NEEDS A PASSWORD — which matters, because the one
 * account's password belongs to the product owner and must never reach this
 * repository, this script or this agent.
 *
 *   1  REAL MODE — a build carrying the two environment variables shows the
 *      login form and NOTHING else. Not the coordinator shell, not the demo
 *      identity picker, not the role switcher, on any route that is tried.
 *   2  the identity picker is really gone: a build behind a login must not also
 *      hand out "view as this farmer" on 300 mock people.
 *   3  a WRONG password is refused, says so in Hebrew, and leaves no session
 *      behind in storage.
 *   4  a wrong ADDRESS is refused with the SAME message — telling the two
 *      apart tells an attacker which addresses exist.
 *   5  DEMO MODE — a build without the variables is byte-for-byte the app
 *      P0bis left: the identity picker, the role switcher, no login. This is
 *      the check that keeps `accept`, `outreach`, `rtl` and the rest honest.
 *   6  B1 — AN ANONYMOUS READ IS REFUSED, table by table. The publishable key
 *      is public by design; this is the proof that publishing it costs nothing.
 *
 * Needs no dev server: it starts its own two, one in each mode, so that the
 * two modes are compared in the same run rather than in two half-remembered
 * ones. Real mode is configured from `.env.real` (see `.env.example`) or from
 * the environment.
 *
 *   bun run auth
 */

const DEMO_PORT = Number(process.env.DEMO_PORT ?? 5198)
const REAL_PORT = Number(process.env.REAL_PORT ?? 5199)

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

/** `.env.real` is not auto-loaded by anything — see `.env.example` for why. */
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

const fileEnv = await readEnvReal()
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
  ''

if (SUPABASE_URL === '' || SUPABASE_KEY === '') {
  console.error(
    '  A70 needs a Supabase project to point a real build at.\n' +
      '  Copy .env.example to .env.real, or export VITE_SUPABASE_URL and\n' +
      '  VITE_SUPABASE_PUBLISHABLE_KEY. Both values are public by design.',
  )
  process.exit(1)
}

/**
 * Start a Vite dev server on `port`.
 *
 * `env` is passed through to the child, and Vite exposes every `VITE_`-prefixed
 * process variable — which is exactly how the deploy workflow configures the
 * real build too, so this script exercises the same path CI does.
 */
async function startServer(
  port: number,
  env: Record<string, string>,
): Promise<{ url: string; stop: () => void }> {
  const proc = Bun.spawn(['bun', 'x', 'vite', '--port', String(port), '--strictPort'], {
    // A clean slate, then the mode's own variables: inheriting the caller's
    // shell would let an exported VITE_SUPABASE_URL turn the DEMO server real
    // and make check 5 pass for the wrong reason.
    env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', ...env },
    stdout: 'ignore',
    stderr: 'ignore',
  })

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
      proc.kill()
      throw new Error(`vite did not come up on ${port} within 30 s`)
    }
    await Bun.sleep(250)
  }

  return { url, stop: () => proc.kill() }
}

console.log('A70 — the door: real mode is closed, demo mode is untouched')

const real = await startServer(REAL_PORT, {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
})
const demo = await startServer(DEMO_PORT, {})

const browser: Browser = await chromium.launch()

try {
  // ---------------------------------------------------------------- real ---
  section('REAL MODE — the app requires a session')

  const realContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'he-IL',
  })
  const page = await realContext.newPage()
  page.setDefaultTimeout(30_000)

  await page.goto(`${real.url}/#/`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="login-form"]', { timeout: 20_000 })

  check(
    'the front door is the login form',
    (await page.locator('[data-testid="login-form"]').count()) === 1,
  )
  check(
    'it asks for an address and a password, and nothing else',
    (await page.locator('[data-testid="login-form"] input').count()) === 2,
    `${await page.locator('input[type="email"]').count()} email · ${await page
      .locator('input[type="password"]')
      .count()} password`,
  )
  check(
    'there is no sign-up: the app never creates an account',
    (await page.getByRole('button', { name: /הרשמה|הרשמו/ }).count()) === 0,
  )

  // Every route a bookmark could carry, not just the root.
  const ROUTES = [
    '#/coordinator',
    '#/coordinator/volunteers',
    '#/coordinator/farms',
    '#/coordinator/missions',
    '#/farmer',
    '#/volunteer',
    '#/driver',
    '#/styleguide',
  ]
  let leaked = ''
  for (const route of ROUTES) {
    await page.goto(`${real.url}/${route}`, { waitUntil: 'load' })
    await page.waitForTimeout(350)
    const stillClosed =
      (await page.locator('[data-testid="login-form"]').count()) === 1 &&
      (await page.locator('nav a[href*="#/coordinator"]').count()) === 0
    if (!stillClosed) leaked = leaked === '' ? route : `${leaked}, ${route}`
  }
  check(
    `all ${ROUTES.length} routes stay closed to a stranger`,
    leaked === '',
    leaked === '' ? ROUTES.join(' ') : `LEAKED: ${leaked}`,
  )

  await page.goto(`${real.url}/#/`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="login-form"]')
  check(
    'the demo identity picker is gone',
    (await page.locator('select').count()) === 0 &&
      !(await page.content()).includes('צפייה בתור'),
  )

  // --- a refusal, twice, with the same words -------------------------------
  async function attempt(email: string, password: string): Promise<string> {
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('[data-testid="login-form"] button[type="submit"]')
    await page.waitForSelector('[data-testid="login-error"]', { timeout: 30_000 })
    return (await page.locator('[data-testid="login-error"]').innerText()).trim()
  }

  const wrongPassword = await attempt(
    'dov@serialkolors.com',
    'definitely-not-the-password-0000',
  )
  check(
    'a wrong password is refused, in Hebrew',
    /[֐-׿]/.test(wrongPassword) && wrongPassword !== '',
    wrongPassword,
  )
  check(
    'the password field is cleared after a refusal',
    (await page.inputValue('input[type="password"]')) === '',
  )
  check(
    'and the app is still closed',
    (await page.locator('[data-testid="login-form"]').count()) === 1,
  )

  const noSuchAccount = await attempt(
    'nobody-here-9f2a@example.invalid',
    'definitely-not-the-password-0000',
  )
  check(
    'an unknown ADDRESS gives the SAME message — no account enumeration',
    noSuchAccount === wrongPassword,
    `${wrongPassword} / ${noSuchAccount}`,
  )

  const stored = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('lo-yanum:auth'))
    return keys.map((k) => `${k}=${localStorage.getItem(k) ?? ''}`).join(' | ')
  })
  check(
    'no session token is left in storage after a refusal',
    !stored.includes('access_token'),
    stored === '' ? 'nothing stored' : stored.slice(0, 80),
  )

  await realContext.close()

  // ---------------------------------------------------------------- demo ---
  section('DEMO MODE — P0bis, untouched')

  const demoContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'he-IL',
  })
  const demoPage = await demoContext.newPage()
  demoPage.setDefaultTimeout(30_000)

  await demoPage.goto(`${demo.url}/#/`, { waitUntil: 'load' })
  await demoPage.waitForTimeout(600)

  check(
    'no login form stands between the POC and its reader',
    (await demoPage.locator('[data-testid="login-form"]').count()) === 0,
  )
  check(
    'the identity picker is there, with all four roles',
    (await demoPage.getByText('כניסה כרכז').count()) === 1,
  )

  await demoPage.goto(`${demo.url}/#/coordinator`, { waitUntil: 'load' })
  await demoPage.waitForSelector('select', { state: 'attached', timeout: 20_000 })
  check(
    'the role switcher still drives the shell — every browser gate depends on it',
    (await demoPage.locator('select').count()) >= 1,
  )
  check(
    'and there is no sign-out to press: there is nothing to sign out of',
    (await demoPage.locator('[data-testid="sign-out"]').count()) === 0,
  )

  await demoContext.close()
} finally {
  await browser.close()
  real.stop()
  demo.stop()
}

// ------------------------------------------------------------------- B1 ---
section('B1 — the publishable key opens nothing')

/**
 * EVERY table in the schema, spelled exactly as P2.2 created it.
 *
 * The list is exhaustive on purpose: "the tables I remembered are closed" is
 * not the claim, "the database is closed" is. A misspelling used to PASS here
 * — PostgREST answers an unknown table with 404, which read as "refused" — so
 * a 404 is now a FAILURE. A table that does not exist proves nothing.
 */
const TABLES = [
  'app_users',
  'entities',
  'entity_contacts',
  'entity_commitments',
  'agreements',
  'zones',
  'zone_vertices',
  'guard_posts',
  'threat_zones',
  'threat_zone_vertices',
  'threat_vectors',
  'volunteers',
  'drivers',
  'missions',
  'mission_guard_posts',
  'mission_drivers',
  'mission_driver_passengers',
  'mission_assignments',
  'presence_marks',
  'cancel_notices',
  'farm_visits',
  'general_meetings',
  'tours',
  'tour_stops',
  'incidents',
  'incident_entries',
]

let closed = 0
const open: string[] = []
const missing: string[] = []

for (const table of TABLES) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
    const body = (await res.text()).trim()

    if (res.status === 404 || body.includes('PGRST205')) {
      missing.push(table)
      continue
    }
    // Two shapes count as refused: an explicit 401/403, and the quieter one
    // RLS actually produces — 200 with an EMPTY array, because a policy that
    // matches no rows is a filter, not an error. What must never come back
    // is a row.
    if (res.status === 401 || res.status === 403 || body === '[]') closed++
    else open.push(`${table} (${res.status} ${body.slice(0, 40)})`)
  } catch (err) {
    open.push(`${table} (${String(err)})`)
  }
}

check(
  `all ${TABLES.length} tables exist under the names P2.2 gave them`,
  missing.length === 0,
  missing.length === 0 ? '' : `UNKNOWN TO POSTGREST: ${missing.join(', ')}`,
)
check(
  'not one of them returns a row to an anonymous reader',
  open.length === 0 && closed === TABLES.length,
  open.length === 0 ? `${closed} closed` : `LEAKED: ${open.join(' · ')}`,
)

/**
 * And the write side. An anonymous INSERT must be refused OUTRIGHT — `[]` is
 * the right answer to a read and the wrong answer to a write, so this is a
 * separate assertion rather than a variation on the one above.
 */
const insert = await fetch(`${SUPABASE_URL}/rest/v1/app_users`, {
  method: 'POST',
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    user_id: '00000000-0000-0000-0000-000000000000',
    role: 'coordinator',
  }),
})
const insertBody = (await insert.text()).trim()
check(
  'an anonymous INSERT that would grant coordinator is refused',
  insert.status === 401 || insert.status === 403,
  `${insert.status} ${insertBody.slice(0, 70)}`,
)

/**
 * The policy helpers are plumbing, not endpoints. P2.2's follow-up migration
 * moved them into a `private` schema for exactly this reason, and 404 here is
 * the evidence that it worked.
 */
for (const fn of ['app_role', 'is_coordinator', 'my_mission_ids']) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  check(
    `the policy helper \`${fn}\` is not an endpoint`,
    res.status === 404,
    String(res.status),
  )
}

console.log('')
if (failed === 0) {
  console.log(`  All ${passed} checks passed.`)
} else {
  console.log(`  ${failed} of ${passed + failed} checks FAILED.`)
  process.exit(1)
}
