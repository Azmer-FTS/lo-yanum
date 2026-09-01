import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * A85 — THE MAP REPAINTS AFTER A BRUTAL ZOOM-OUT.
 *
 *   bun run redraw
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE PRODUCT OWNER REPORTED, AND WHAT IT ACTUALLY WAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "En zoom-out brusque, des pans de carte restent blancs et ne se
 *  rafraîchissent qu'après un léger zoom inverse. En zoom-out progressif, ça
 *  passe."
 *
 * Four things were eliminated before anything was changed, and eliminating
 * them is what found the cause:
 *
 *   · the ARCHIVE is not corrupt — every failing tile decodes locally into
 *     valid MVT with 7–8 layers;
 *   · the TRANSPORT is not the problem — the same tiles fetched by range from
 *     the browser are sha256-identical to the local bytes, uncompressed, with
 *     the right `content-range` denominator (that was §29, and it stayed fixed);
 *   · the PMTILES READ is not the problem — instrumented, the protocol handed
 *     MapLibre `7/76/51` at 149 834 bytes with the same hash as the local
 *     decode;
 *   · and MapLibre still reported `Unimplemented type: 4` on that tile.
 *
 * ★★ THE CAUSE IS A FONT. Protomaps' label block with `lang: 'he'` is
 *    BILINGUAL — Hebrew on one line and, when the local name is in another
 *    script, the local name underneath. At z1–z7 that is Greek over Cyprus,
 *    Georgian over Georgia, Cyrillic, Ethiopic. Five glyph ranges are
 *    vendored. A range that is not there is not a 404 the map can shrug off:
 *    **this is a single-page app, so the host answers `200` with
 *    `index.html`**, MapLibre feeds that HTML to its protobuf reader, and the
 *    reader throws. A glyph failure fails the TILE — which MapLibre marks
 *    `errored`, never re-requests, and still counts as loaded. Hence a hole
 *    that only heals when the camera needs different tiles.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS GATE REFUSES TO ACCEPT AS EVIDENCE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `areTilesLoaded()`. It returned **true** through the entire bug, which is
 * precisely why nothing caught this. So every scenario below asks three
 * different questions instead:
 *
 *   1. did MapLibre emit ANY error, on any tile;
 *   2. is any tile in the source cache in the `errored` state;
 *   3. and does a grid of probe points — restricted to points INSIDE the
 *      archive's own bounds, because outside them "nothing" is the correct
 *      answer — actually return rendered features.
 *
 * The last one is the product owner's sentence turned into a number.
 */

const PORT = Number(process.env.REDRAW_PORT ?? 5197)
const OUT_DIR = 'dist-redraw'
const SHOTS = 'docs/screenshots/basemap'

/**
 * The archive's own bounds, from its PMTiles header: 34.20–36.00 E,
 * 29.35–33.45 N. A probe outside them is over ground the national cut does not
 * contain, and demanding paint there would be demanding an invented map.
 */
const BOUNDS = { west: 34.2, east: 36.0, south: 29.35, north: 33.45 }

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

interface Verdict {
  errored: number
  loaded: number
  probed: number
  blank: number
  zoom: number
}

async function measure(page: Page, bounds: typeof BOUNDS): Promise<Verdict> {
  return page.evaluate((b) => {
    const map = (window as unknown as { __loYanumMap?: Record<string, never> })
      .__loYanumMap as unknown as {
      getZoom: () => number
      getCanvas: () => HTMLCanvasElement
      unproject: (p: [number, number]) => { lat: number; lng: number }
      queryRenderedFeatures: (p: [number, number]) => unknown[]
      style: Record<string, unknown>
    }
    const style = map.style
    const caches =
      (style.sourceCaches as Record<string, { _tiles: Record<string, unknown> }>) ??
      (style._otherSourceCaches as Record<string, { _tiles: Record<string, unknown> }>)
    const tiles = Object.values(caches?.protomaps?._tiles ?? {}) as { state: string }[]

    const canvas = map.getCanvas()
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    let probed = 0
    let blank = 0
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 7; j++) {
        const point: [number, number] = [
          Math.round((w * i) / 10),
          Math.round((h * j) / 8),
        ]
        const at = map.unproject(point)
        if (
          at.lng < b.west ||
          at.lng > b.east ||
          at.lat < b.south ||
          at.lat > b.north
        ) {
          continue
        }
        probed++
        if (map.queryRenderedFeatures(point).length === 0) blank++
      }
    }
    return {
      errored: tiles.filter((t) => t.state === 'errored').length,
      loaded: tiles.filter((t) => t.state === 'loaded').length,
      probed,
      blank,
      zoom: Number(map.getZoom().toFixed(2)),
    }
  }, bounds)
}

/** Run a camera command and wait for the map to say it has finished. */
async function settle(page: Page, command: string): Promise<void> {
  await page.evaluate((code) => {
    const map = (window as unknown as { __loYanumMap?: unknown }).__loYanumMap as {
      once: (e: string, f: () => void) => void
    }
    // ⚠️ THE COMMAND IS WRITTEN AGAINST `m`, AND `m` HAS TO BE A REAL BINDING.
    //    Minified `eval` in a bundled page does not see the enclosing `map`
    //    const, so the first version threw "m is not defined" on every
    //    scenario. It is this file's own text, never anything off the network.
    const m = map
    void m
    // eslint-disable-next-line no-eval
    ;(0, eval)(`(function(m){${code}})`)(m)
    return new Promise<void>((resolve) => {
      let done = false
      const finish = (): void => {
        if (!done) {
          done = true
          resolve()
        }
      }
      map.once('idle', finish)
      setTimeout(finish, 25_000)
    })
  }, command)
  // `idle` fires when the renderer has nothing left to do; a beat after it is
  // when a late symbol placement would have landed.
  await page.waitForTimeout(1200)
}

console.log('')
console.log('  A85 — THE MAP REPAINTS AFTER A BRUTAL ZOOM-OUT')
console.log('  ==============================================')

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
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
{
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

let browser: Browser | null = null
try {
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'he-IL',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)

  /** Every glyph range the style asks for, and what came back. */
  const glyphs = new Map<string, number>()
  page.on('response', (r) => {
    const url = r.url()
    if (!url.includes('/basemap-assets/fonts/')) return
    const name = decodeURIComponent(url.split('/basemap-assets/fonts/')[1] ?? url)
    glyphs.set(name, r.status())
  })

  await Bun.$`mkdir -p ${SHOTS}`.quiet()
  await page.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
  await page.waitForFunction(
    () =>
      Boolean(
        (window as unknown as { __loYanumMap?: { isStyleLoaded: () => boolean } })
          .__loYanumMap?.isStyleLoaded(),
      ),
    undefined,
    { timeout: 60_000 },
  )

  // Every error MapLibre raises, from this point on, whatever its source.
  await page.evaluate(() => {
    const map = (window as unknown as { __loYanumMap?: unknown }).__loYanumMap as {
      on: (e: string, f: (ev: unknown) => void) => void
    }
    ;(window as unknown as { __redrawErrors: unknown[] }).__redrawErrors = []
    map.on('error', (event: unknown) => {
      const e = event as {
        error?: { message?: string }
        tile?: { tileID?: { canonical?: { z: number; x: number; y: number } } }
      }
      const c = e.tile?.tileID?.canonical
      ;(window as unknown as { __redrawErrors: unknown[] }).__redrawErrors.push({
        message: e.error?.message ?? String(event),
        tile: c ? `${c.z}/${c.x}/${c.y}` : undefined,
      })
    })
  })

  const errorsSince = async (): Promise<{ message: string; tile?: string }[]> =>
    page.evaluate(
      () =>
        (window as unknown as { __redrawErrors: { message: string; tile?: string }[] })
          .__redrawErrors,
    )
  const resetErrors = async (): Promise<void> => {
    await page.evaluate(() => {
      ;(window as unknown as { __redrawErrors: unknown[] }).__redrawErrors = []
    })
  }

  /**
   * ★ THE PRODUCT OWNER'S OWN SEQUENCE IS THE FIRST ONE, and it is a SINGLE
   *   camera command rather than a ladder — "d'un coup" is the whole of the
   *   report. Three cities, because a hole that only exists over one of them
   *   would say something different about the cause.
   */
  const scenarios: { name: string; at: string; go: string; shot: string }[] = [
    {
      name: 'ירושלים — z14 → z7 in ONE animated gesture',
      at: 'm.jumpTo({center:[35.2137,31.7683], zoom:14})',
      go: 'm.easeTo({zoom:7, duration:500})',
      shot: 'redraw-jerusalem',
    },
    {
      name: 'באר שבע — z14 → z7 INSTANTLY, no animation at all',
      at: 'm.jumpTo({center:[34.7913,31.2518], zoom:14})',
      go: 'm.jumpTo({zoom:7})',
      shot: 'redraw-beersheva',
    },
    {
      name: 'חיפה — z13 → z6, further out than the archive is cut for',
      at: 'm.jumpTo({center:[34.9896,32.7940], zoom:13})',
      go: 'm.easeTo({zoom:6, duration:400})',
      shot: 'redraw-haifa',
    },
    {
      name: '★ and the other direction — z7 → z15 in one gesture',
      at: 'm.jumpTo({center:[34.7913,31.2518], zoom:7})',
      go: 'm.easeTo({zoom:15, duration:500})',
      shot: 'redraw-zoom-in',
    },
  ]

  section('THE BRUTAL SEQUENCES')

  for (const scenario of scenarios) {
    await settle(page, scenario.at)
    await resetErrors()
    await settle(page, scenario.go)
    const verdict = await measure(page, BOUNDS)
    const errors = await errorsSince()
    await page.screenshot({ path: `${SHOTS}/${scenario.shot}.png` })

    check(
      `${scenario.name}: MapLibre raised NO error`,
      errors.length === 0,
      errors.length === 0
        ? `settled at z${verdict.zoom}`
        : errors
            .slice(0, 4)
            .map((e) => `${e.tile ?? '—'}: ${e.message}`)
            .join(' | '),
    )
    check(
      `${scenario.name}: no tile is in the errored state`,
      verdict.errored === 0,
      `${verdict.loaded} loaded, ${verdict.errored} errored`,
    )
    check(
      `★★ ${scenario.name}: the map is PAINTED, with no further gesture`,
      verdict.blank === 0 && verdict.probed > 0,
      `${verdict.probed - verdict.blank}/${verdict.probed} probe points inside the archive's bounds paint`,
    )
  }

  /**
   * ★ THE LADDER TOO, and it is not redundant: the slow path was ALSO failing
   *   before the fix (z7 → z6 → z5 → z4 each lost a tile), which is what ruled
   *   out "aborted requests during a fast animation" as the cause. If a future
   *   change re-breaks only one of the two paths, the two blocks say which.
   */
  section('AND THE LADDER, ONE LEVEL AT A TIME')

  await settle(page, 'm.jumpTo({center:[35.2137,31.7683], zoom:14})')
  await resetErrors()
  let ladderBlank = 0
  let ladderProbed = 0
  let ladderErrored = 0
  for (let z = 13; z >= 1; z--) {
    await settle(page, `m.jumpTo({zoom:${z}})`)
    const verdict = await measure(page, BOUNDS)
    ladderBlank += verdict.blank
    ladderProbed += verdict.probed
    ladderErrored += verdict.errored
  }
  const ladderErrors = await errorsSince()
  check(
    'z13 → z1, one level at a time: no error on any level',
    ladderErrors.length === 0,
    ladderErrors
      .slice(0, 4)
      .map((e) => `${e.tile ?? '—'}: ${e.message}`)
      .join(' | ') || '13 levels',
  )
  check(
    'and nothing errored anywhere on the way down',
    ladderErrored === 0,
    `${ladderErrored} errored tiles across 13 levels`,
  )
  check(
    '★★ every level painted inside the archive',
    ladderBlank === 0 && ladderProbed > 0,
    `${ladderProbed - ladderBlank}/${ladderProbed} probe points across 13 levels`,
  )
  await page.screenshot({ path: `${SHOTS}/redraw-ladder-z1.png` })

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * THE GUARD ITSELF, EXERCISED RATHER THAN ASSUMED
   * ═════════════════════════════════════════════════════════════════════════
   *
   * The two fixes are "stop asking for scripts we do not carry" and "a range
   * we do not carry resolves to an empty stack". The first one makes the
   * second one invisible in normal use — which is exactly how a guard rots.
   * So this asks for a range that is deliberately NOT vendored and requires
   * the protocol to answer it with zero bytes instead of an HTML page.
   */
  section('THE EMPTY-STACK GUARD, DRIVEN DIRECTLY')

  /**
   * ⚠️ SNAPSHOT FIRST. The probe below fetches an unvendored range ON PURPOSE,
   *    and the response listener cannot tell that request apart from one the
   *    style made — so taking the list afterwards would report this gate's own
   *    probe as a range the app asks for, and fail on itself.
   */
  const asked = [...glyphs.keys()]

  const guard = await page.evaluate(async (b) => {
    const missing = `${b}/basemap-assets/fonts/Noto%20Sans%20Regular/44032-44287.pbf`
    const direct = await fetch(missing)
    const body = await direct.text()
    return {
      hostStatus: direct.status,
      hostType: direct.headers.get('content-type') ?? '',
      hostLooksLikeHtml: body.trimStart().slice(0, 15).toLowerCase().includes('<!doctype'),
    }
  }, base)

  check(
    '★ the host really does answer an unvendored range with the app shell',
    guard.hostLooksLikeHtml,
    `status ${guard.hostStatus}, content-type ${guard.hostType || '—'}`,
  )

  const vendored = [
    '0-255',
    '256-511',
    '768-1023',
    '1280-1535',
    '1536-1791',
    '8192-8447',
    '64256-64511',
    '65024-65279',
  ]
  const unvendored = asked.filter(
    (name) => !vendored.some((range) => name.endsWith(`${range}.pbf`)),
  )
  check(
    '★★ and after the label fix the style asks for NO unvendored range at all',
    unvendored.length === 0,
    unvendored.join(', ') || `${asked.length} ranges asked for, all vendored`,
  )
  check(
    '★ the two presentation-form ranges are among them — shaped Arabic and pointed Hebrew',
    asked.some((name) => name.endsWith('65024-65279.pbf')) &&
      asked.some((name) => name.endsWith('64256-64511.pbf')),
    asked
      .filter((n) => n.endsWith('65024-65279.pbf') || n.endsWith('64256-64511.pbf'))
      .join(', ') || 'neither asked for',
  )

  console.log('')
  console.log(`  captures: ${SHOTS}/redraw-*.png`)
} finally {
  await browser?.close()
  serve.kill()
}

section('VERDICT')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
