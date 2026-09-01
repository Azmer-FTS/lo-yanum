import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page, Request, Response } from 'playwright'

/**
 * A83 — THE BASEMAP, PROVED IN A REAL BROWSER ON A BLANK PROFILE.
 *
 *   bun run ground
 *
 * ★ WHY THIS FILE EXISTS, AND IT IS NOT A THIRD COPY OF AN EXISTING GATE.
 *
 * The product owner refused three "it is fixed" reports in a row on the map,
 * and he was right to: each one was argued from the SOURCE or from a green
 * HEAD, and none of them was the thing he could see. His rule, 2026-09-01, is
 * the rule this file implements and it admits ONE kind of evidence —
 *
 *   1  the pmtiles request that actually LEAVES a real browser, URL logged;
 *   2  the response that comes back, its total length read off the wire;
 *   3  the הגדרות screen of that same build, naming the same archive and the
 *      same megabytes a coordinator would read with his thumb;
 *   4  Haifa DRAWN — at z12, z13 and z14, with captures.
 *
 * `bun run offline` already proves the archive works with the network taken
 * away, which is criterion B3. It cannot answer this question: it seeds the
 * cache first, so by the time it looks, the URL it observes is the one it
 * chose. This one starts from NOTHING — a fresh context is a blank profile:
 * no storage, no service worker, no cache — and watches what the app asks the
 * network for of its own accord.
 *
 * ★ WHY IT DRIVES A DEMO BUILD AND WHY THAT IS NOT A CHEAT. The deployed app
 *   is a REAL build and its first screen is a login door whose password only
 *   the product owner has ever typed (decision 70, §14.4). No gate can sign
 *   in, and none should be able to. What decides the basemap is not the
 *   session: it is `VITE_BASEMAP_URL` at build time and the constant in
 *   `basemap.ts` behind it — the same two inputs in both modes. So this builds
 *   the tree with the SAME basemap input the deploy resolved, and drives the
 *   map behind the only door that opens without a credential.
 *
 * ★ WHAT IT REFUSES TO DO: hard-code the archive it expects. The register
 *   below is the same one the deploy workflow keeps, for the same reason —
 *   a new cut is a NEW NAME and a NEW LENGTH, and exact equality catches the
 *   half-finished upload that a "> 100 MB" threshold waves through. And the
 *   national archive is 94.3 MB, so a "> 100 MB" rule would refuse the real
 *   map of Israel for ever. That number has been wrong in this project's
 *   history three times; it is written here once, in bytes.
 */

/** The register of cut archives: exact bytes, and whether it is the country. */
const ARCHIVES: Record<string, { bytes: number; national: boolean }> = {
  'israel-20260831-z14.pmtiles': { bytes: 94_268_129, national: true },
  'negev-20260829-z14.pmtiles': { bytes: 42_560_293, national: false },
}

const NATIONAL_KEY = 'israel-20260831-z14.pmtiles'

const BUCKET =
  'https://lvrptqmkjikkkhcxocbe.supabase.co/storage/v1/object/public/basemap'

const PORT = Number(process.env.GROUND_PORT ?? 5195)
const OUT_DIR = 'dist-ground'
const SHOTS = 'docs/screenshots/basemap'

/** Haifa. The northern city the southern extract does not contain. */
const HAIFA = { name: 'חיפה (Haifa)', lat: 32.794, lng: 34.9896 }
const ZOOMS = [12, 13, 14]

let passed = 0
let failed = 0
/** Haifa's three lines, counted apart: they are the ones the upload settles. */
let haifaFailed = 0

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

function archiveName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
  } catch {
    return ''
  }
}

/**
 * Ask the bucket about one key the way the deploy workflow asks: a HEAD for
 * the length, and a range request, because a `200` on a whole file proves
 * nothing about an archive that is only ever read in slices.
 */
async function probe(key: string): Promise<{ length: number; range: number }> {
  let length = 0
  let range = 0
  try {
    const head = await fetch(`${BUCKET}/${key}`, { method: 'HEAD' })
    if (head.ok) length = Number(head.headers.get('content-length') || '0')
  } catch {
    /* absent, and the caller reads that off the zero */
  }
  try {
    const res = await fetch(`${BUCKET}/${key}`, { headers: { Range: 'bytes=0-15' } })
    range = res.status
    await res.arrayBuffer()
  } catch {
    /* same */
  }
  return { length, range }
}

/**
 * ★ IT RETURNS FALSE, IT DOES NOT THROW, AND THAT IS THE POINT OF THE HELPER.
 *   A missing archive makes the style never load; the first version of this
 *   file then died on a raw Playwright timeout with a stack trace, which is
 *   the exact shape of failure this whole gate exists to stop — a map that
 *   does not work and an instrument that will not say why. Below, a false here
 *   becomes a named FAIL and the wire is printed anyway, because the wire is
 *   where the answer is.
 */
async function styleLoaded(page: Page, ms = 40_000): Promise<boolean> {
  return page
    .waitForFunction(
      () =>
        Boolean(
          (window as unknown as { __loYanumMap?: { isStyleLoaded: () => boolean } })
            .__loYanumMap?.isStyleLoaded(),
        ),
      undefined,
      { timeout: ms },
    )
    .then(() => true)
    .catch(() => false)
}

async function buildAndServe(url: string): Promise<{ base: string; stop: () => void }> {
  const env = {
    ...process.env,
    // DEMO MODE, deliberately and explicitly: no door, and the basemap inputs
    // are identical to the real build's. See the header.
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_PUBLISHABLE_KEY: '',
    VITE_BASEMAP_URL: url,
  }

  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT_DIR], {
    env,
    stdout: 'ignore',
    stderr: 'pipe',
  })
  if ((await build.exited) !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error('vite build failed')
  }

  const serve = Bun.spawn(
    ['bun', 'x', 'vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'],
    { env, stdout: 'ignore', stderr: 'ignore' },
  )

  const base = `http://localhost:${PORT}`
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(1000) })
      if (res.ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
  return { base, stop: () => serve.kill() }
}

// ---------------------------------------------------------------------------
// 0. WHICH ARCHIVE IS LIVE — asked of the bucket, exactly as the deploy asks.
// ---------------------------------------------------------------------------

console.log('')
console.log('  A83 — THE BASEMAP IN A REAL BROWSER, BLANK PROFILE')
console.log('  ==================================================')

/**
 * ★ ASKED OF THE PAYLOAD, NOT OF THE BUCKET — AND THAT CHANGED ON 2026-09-01.
 *
 *   The archive is no longer in Supabase and cannot be: the project refuses any
 *   upload over 52 428 800 bytes and the national cut is 94 268 129 (ETAT §27,
 *   bounded to the byte by a 403/413 boundary). It is served by GitHub Pages
 *   from the app's own origin, staged into `public/basemap/` — by the deploy
 *   workflow on a runner, by hand on a laptop — so that Vite copies it into
 *   `dist/` like any other public asset.
 *
 *   So the question "which archive is live" is now answered by the file that is
 *   about to be BUILT IN, which is strictly closer to the artefact than a
 *   remote HEAD ever was. That it really serves, and really answers a range
 *   with 206, is not assumed here either: proof 2 below reads both off the
 *   request the browser actually makes.
 */
section('WHAT THE PAYLOAD HOLDS RIGHT NOW')

const staged = Bun.file(`public/basemap/${NATIONAL_KEY}`)
const stagedBytes = (await staged.exists()) ? staged.size : 0
const nationalUsable = stagedBytes === ARCHIVES[NATIONAL_KEY].bytes

console.log(
  `  public/basemap/${NATIONAL_KEY}: ${stagedBytes || '<absent>'} bytes ` +
    `(registered ${ARCHIVES[NATIONAL_KEY].bytes})`,
)

/**
 * ★ THE SAME RESOLUTION RULE AS `.github/workflows/deploy.yml`, AND ONE
 *   SENTENCE ON WHY IT IS DUPLICATED RATHER THAN SHARED: the workflow decides
 *   what to SHIP and must run on a runner with nothing but curl; this decides
 *   what to PROVE and runs on a laptop. What keeps them honest is that this
 *   gate then reads the answer off the running app rather than off its own
 *   variable — if they ever disagree, step 1 below fails.
 */
/**
 * ★ `GROUND_URL` EXISTS FOR ONE REASON AND IT IS WRITTEN DOWN SO IT IS NOT
 *   MISTAKEN FOR A CONVENIENCE: the strict branch of the verdict below — the
 *   one where all four proofs MUST pass — cannot be exercised until the
 *   national archive is in the bucket, and a gate whose failing path has never
 *   run is a gate nobody should trust the day it matters. Pointing this at the
 *   national key while the object is still absent runs exactly that branch and
 *   it must exit 1. CI never sets it.
 */
const resolved = process.env.GROUND_URL ?? ''
console.log(
  resolved
    ? `  → GROUND_URL is set; building against ${resolved}`
    : `  → building against the compiled-in default (same origin, basemap/${NATIONAL_KEY})`,
)

const server = await buildAndServe(resolved)

let browser: Browser | null = null
let liveKey = ''
let wireLength = 0

try {
  browser = await chromium.launch()

  /**
   * ★ A BLANK PROFILE, AND THIS LINE IS THE WHOLE POINT OF THE FILE.
   *   `newContext()` is a fresh profile: empty storage, empty HTTP cache, no
   *   service worker, no IndexedDB. Everything observed below is what THIS
   *   BUILD asks for with nothing on the device to prefer — which is the one
   *   thing the product owner's iPad could not be made to do without a
   *   reinstall, and the reason he had to reinstall three times.
   */
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'he-IL',
  })
  const page: Page = await context.newPage()
  page.setDefaultTimeout(30_000)

  /** Every request and response that touches the bucket, kept in order. */
  const wire: string[] = []
  const requestedUrls = new Set<string>()

  page.on('request', (r: Request) => {
    if (!r.url().includes('/basemap/')) return
    requestedUrls.add(r.url())
    wire.push(`REQ  ${r.method()} ${r.url()}  Range: ${r.headers()['range'] ?? '—'}`)
  })
  page.on('response', (r: Response) => {
    if (!r.url().includes('/basemap/')) return
    const h = r.headers()
    const contentRange = h['content-range'] ?? ''
    const total = /\/(\d+)$/.exec(contentRange)?.[1]
    if (total) wireLength = Number(total)
    else if (r.request().method() === 'HEAD' && r.ok())
      wireLength = Number(h['content-length'] ?? '0') || wireLength
    wire.push(
      `RES  ${r.status()} ${r.url()}  content-length: ${h['content-length'] ?? '—'}` +
        `  content-range: ${contentRange || '—'}`,
    )
  })

  // -------------------------------------------------------------------------
  section('PROOF 1 — THE REQUEST THAT ACTUALLY LEAVES THE BROWSER')
  // -------------------------------------------------------------------------

  await page.goto(`${server.base}/#/coordinator/farms`, { waitUntil: 'load' })
  const loaded = await styleLoaded(page)

  /**
   * The style's own answer, and then the WIRE's answer, and they have to be
   * the same string. Asking only the style would be asking the code again.
   */
  const styleUrl = (
    await page.evaluate(() => {
      const m = (
        window as unknown as {
          __loYanumMap?: { getStyle: () => { sources: Record<string, { url?: string }> } }
        }
      ).__loYanumMap
      return m?.getStyle().sources.protomaps?.url ?? ''
    })
  ).replace(/^pmtiles:\/\//, '')

  const onTheWire = [...requestedUrls]
  /**
   * ★ THE WIRE IS THE FALLBACK, NOT THE STYLE. When the archive is missing the
   *   style never loads and `styleUrl` is empty — and an empty key made the
   *   verdict below announce a "partial extract ''" and made proof 3 pass on
   *   `includes('')`. The request that left the browser is still there, and it
   *   is the more authoritative of the two anyway.
   */
  liveKey = archiveName(styleUrl) || archiveName(onTheWire[0] ?? '')

  check(
    'the map style loads at all',
    loaded,
    loaded ? '' : 'the style never finished — the archive below is why',
  )
  check(
    'the map asks for exactly ONE archive',
    onTheWire.length === 1,
    onTheWire.length === 0
      ? 'nothing was requested from the bucket at all'
      : onTheWire.map(archiveName).join(', '),
  )
  check(
    '★ and the URL that left the browser is the one the style names',
    onTheWire.length === 1 && onTheWire[0] === styleUrl,
    styleUrl,
  )
  check(
    'the archive is one this project has registered',
    Boolean(ARCHIVES[liveKey]),
    liveKey || '<none>',
  )

  console.log('')
  console.log('  the wire, verbatim:')
  for (const line of wire.slice(0, 12)) console.log(`    ${line}`)
  if (wire.length > 12) console.log(`    … ${wire.length - 12} more`)

  // -------------------------------------------------------------------------
  section('PROOF 2 — WHAT THE SERVER SENT BACK')
  // -------------------------------------------------------------------------

  const expected = ARCHIVES[liveKey]?.bytes ?? 0
  check(
    '★ the archive answers a RANGE request — a 206, not a 200',
    wire.some((l) => l.startsWith('RES  206')),
    wire.find((l) => l.startsWith('RES  2'))?.slice(0, 90) ?? 'no 2xx seen',
  )
  check(
    '★ and its TOTAL length, read off the wire, is the registered one',
    wireLength === expected && expected > 0,
    `${wireLength} on the wire, ${expected} registered (${(wireLength / 1e6).toFixed(1)} MB)`,
  )

  // -------------------------------------------------------------------------
  section('PROOF 3 — WHAT הגדרות SAYS ON THE SAME BUILD')
  // -------------------------------------------------------------------------

  await page.goto(`${server.base}/#/coordinator/settings`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="download-map"]', { timeout: 20_000 })
  await page.waitForTimeout(1500)

  const settingsText = await page.evaluate(() => document.body.innerText)
  const buttonLabel = (
    (await page.locator('[data-testid="download-map"]').textContent()) ?? ''
  ).trim()

  check(
    '★ the screen NAMES the archive, and it is the one on the wire',
    liveKey !== '' && settingsText.includes(liveKey),
    liveKey || 'no archive was identified at all',
  )
  const shownMb = /(\d+(?:\.\d+)?)\s*MB/.exec(buttonLabel)?.[1] ?? ''
  check(
    '★ and the megabytes on the button are the megabytes on the wire',
    shownMb === (wireLength / 1e6).toFixed(1),
    `button says "${buttonLabel}", wire says ${(wireLength / 1e6).toFixed(1)} MB`,
  )

  // -------------------------------------------------------------------------
  section(`PROOF 4 — ${HAIFA.name}, DRAWN, AT z${ZOOMS.join(' z')}`)
  // -------------------------------------------------------------------------

  await Bun.$`mkdir -p ${SHOTS}`.quiet()
  await page.goto(`${server.base}/#/coordinator/farms`, { waitUntil: 'load' })
  await styleLoaded(page)

  for (const zoom of ZOOMS) {
    const drawn = await page.evaluate(
      async ([lat, lng, z]) => {
        const m = (
          window as unknown as {
            __loYanumMap?: {
              jumpTo: (o: unknown) => void
              once: (e: string, f: () => void) => void
              queryRenderedFeatures: () => { sourceLayer?: string }[]
            }
          }
        ).__loYanumMap
        if (!m) return { total: 0, roads: 0, error: 'no map handle' }
        m.jumpTo({ center: [lng, lat], zoom: z })
        await new Promise<void>((resolve) => {
          let settled = false
          const done = (): void => {
            if (!settled) {
              settled = true
              resolve()
            }
          }
          m.once('idle', done)
          setTimeout(done, 20_000)
        })
        const feats = m.queryRenderedFeatures()
        return {
          total: feats.length,
          roads: feats.filter((f) => f.sourceLayer === 'roads').length,
          error: '',
        }
      },
      [HAIFA.lat, HAIFA.lng, zoom] as [number, number, number],
    )

    await page.screenshot({ path: `${SHOTS}/haifa-z${zoom}-${liveKey}.png` })
    if (drawn.roads <= 0) haifaFailed++
    check(
      `★ ${HAIFA.name} has ground under it at z${zoom}`,
      drawn.roads > 0,
      drawn.error || `${drawn.total} features, ${drawn.roads} of them roads`,
    )
  }
  console.log(`  captures: ${SHOTS}/haifa-z{12,13,14}-${liveKey}.png`)
} finally {
  await browser?.close()
  server.stop()
}

// ---------------------------------------------------------------------------
// THE VERDICT, AND IT FOLLOWS THE DEPLOY GATE'S POLICY RATHER THAN INVENTING
// A SECOND ONE.
// ---------------------------------------------------------------------------

section('VERDICT')
console.log(`  ${passed} passed, ${failed} failed`)

const isNational = ARCHIVES[liveKey]?.national === true

if (isNational) {
  console.log('')
  console.log('  The four proofs are about the NATIONAL archive. Every one must pass.')
  process.exit(failed === 0 ? 0 : 1)
}

if (nationalUsable) {
  console.log('')
  console.error(
    `  ⛔ ${NATIONAL_KEY} IS in the bucket and usable, and this build still drives\n` +
      `     '${liveKey}'. That is the regression this gate exists to stop.`,
  )
  process.exit(1)
}

/**
 * ⛔ THIS USED TO WARN AND SHIP. IT NOW FAILS, AND §27 IS WHY.
 *
 *   The old leniency existed for one reason, written down at the time: the
 *   national archive could only be put in the bucket by the product owner, so
 *   failing here would have stopped every deploy — including work with nothing
 *   to do with the map — on an act no session could perform.
 *
 *   That premise is dead. The act was never his to perform either: the upload
 *   was refused on SIZE, before authorisation, by a plan-level cap no password
 *   reaches. The archive is now staged into the payload by the deploy itself,
 *   so a build driving anything other than the national cut is a broken
 *   pipeline rather than a pending favour — and a broken pipeline must not
 *   reach an iPad quietly. There is nobody left to wait for.
 */
console.log('')
console.error(
  `  ⛔ THIS BUILD DRIVES '${liveKey}' RATHER THAN THE NATIONAL ARCHIVE.\n` +
    `     public/basemap/${NATIONAL_KEY} holds ${stagedBytes || 'nothing'} bytes, and it must\n` +
    `     hold ${ARCHIVES[NATIONAL_KEY].bytes}. On a runner the deploy stages it from the release\n` +
    `     asset before building; on a laptop, copy it there by hand. Haifa is EMPTY\n` +
    `     above and that is the consequence. Refusing to pass.`,
)
process.exit(1)

/**
 * Everything except Haifa still has to hold, even on the southern extract:
 * the URL, the 206, the exact length and the screen's own numbers are claims
 * about THIS archive, whichever one it is, and none of them waits on anybody.
 */
const other = failed - haifaFailed
if (other > 0) console.error(`  ⛔ ${other} failure(s) that the upload does NOT explain.`)
process.exit(other === 0 ? 0 : 1)
