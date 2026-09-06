import { chromium, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'
import { PMTiles, FileSource } from 'pmtiles'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Y1 — THE VECTOR GROUND. A51 · A52.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run vector                 (chromium)
 *   ENGINE=webkit bun run vector   (the product owner's iPad, same checks)
 *
 * The report this gate answers, verbatim: the vector ground "se dégrade ou
 * disparaît, ne se rafraîchit pas, oblige à relancer l'application"; at
 * ordinary zooms it is "un aplat beige/marron sans relief ni détail, avec des
 * bandes blanches à droite et à gauche"; the satellite is perfect at every
 * zoom.
 *
 * ★ THE FIRST SUSPECT WAS THE ARCHIVE, AND IT WAS MEASURED AND ACQUITTED.
 *   Section A reads the shipped file and enumerates the tiles it actually
 *   holds, zoom by zoom: 24 519 addressed tiles, every one of z0…z14 present
 *   over Israel, nine vector layers. Nothing is missing and nothing is
 *   truncated. Re-cutting it would have changed nothing, which is why it is
 *   checked here rather than assumed either way.
 *
 * ★ WHAT IS ACTUALLY WRONG IS TWO THINGS, AND THEY ARE UNRELATED.
 *
 *   C  THE WHITE BANDS ARE THE EXTRACT'S OWN EDGE. The archive is a COUNTRY
 *      cut: it holds lon 33.75–39.38 at z6 and only 33.75–36.56 from z7 up. An
 *      iPad in landscape at z6 spans 32 768 px of world and the archive can
 *      paint 512 of them. So the bands are not a fault in the file, and no
 *      re-cut of Israel removes them — what is missing is not Israel. The
 *      answer is a ground of the app's own under the tiles.
 *
 *   D  THE MAP THAT NEVER COMES BACK IS A CACHED REJECTION, in the PMTiles
 *      library. `SharedPromiseCache.getHeader` and `.getDirectory` store the
 *      PROMISE under the archive's key and never remove it when it rejects
 *      (pmtiles 4.5.0, `dist/esm/index.js`). One failed range request — an
 *      iPad losing the network for a second, a tab coming back from the
 *      background — therefore poisons that key for the LIFE OF THE PAGE: every
 *      later tile awaits the same rejected promise, no retry can reach the
 *      wire, and the only cure is a relaunch. Which is exactly the sentence
 *      the report ends on.
 *
 * ⚠️ SECTIONS C AND D WERE BOTH SEEN RED before the fix, and the way they are
 *    written is the reason they could be: they break the NETWORK and then ask
 *    the map to recover WITHOUT a reload and WITHOUT a user gesture. A gate
 *    that only ever drives a healthy network can watch this defect happen and
 *    report 100 %.
 */

const PORT = Number(process.env.VECTOR_PORT ?? 5198)
const ENGINE = process.env.ENGINE === 'webkit' ? webkit : chromium
const ENGINE_NAME = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'
const OUT_DIR = 'dist-vector'
const SHOTS = 'docs/screenshots/vector'
const ARCHIVE = 'basemap/israel-20260831-z14.pmtiles'

/** See `backdrop.ts` — MapLibre's buffer is empty by the time a script can read it. */
const PRESERVE_DRAWING_BUFFER = `(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    }
    return orig.call(this, type, attrs);
  };
})()`

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

console.log('')
console.log(`  A51 · A52 — THE VECTOR GROUND, IN A REAL BROWSER (${ENGINE_NAME})`)
console.log('  ==============================================================')

// ---------------------------------------------------------------------------
section('A — THE ARCHIVE ITSELF (no browser: the file on disk)')
// ---------------------------------------------------------------------------

const lon2x = (lon: number, z: number): number => Math.floor(((lon + 180) / 360) * 2 ** z)
const lat2y = (lat: number, z: number): number => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

{
  const file = Bun.file(ARCHIVE)
  const present = await file.exists()
  check('the national archive is on disk', present, ARCHIVE)
  if (present) {
    const archive = new PMTiles(new FileSource(file as never) as never)
    const header = await archive.getHeader()
    check(
      '★ it declares z0 → z14, which is the product owner`s floor',
      header.minZoom === 0 && header.maxZoom >= 14,
      `z${header.minZoom}…z${header.maxZoom}`,
    )
    check(
      'over Israel, and clustered',
      header.minLon <= 34.3 && header.maxLon >= 35.9 && header.minLat <= 29.5 && header.maxLat >= 33.3 && header.clustered,
      `lon ${header.minLon}…${header.maxLon}, lat ${header.minLat}…${header.maxLat}`,
    )

    const metadata = (await archive.getMetadata()) as { vector_layers?: { id: string }[] }
    const layers = new Set((metadata.vector_layers ?? []).map((l) => l.id))
    const wanted = ['earth', 'water', 'roads', 'places', 'landuse', 'landcover', 'buildings', 'boundaries']
    check(
      'and it carries every layer the style paints',
      wanted.every((id) => layers.has(id)),
      wanted.filter((id) => !layers.has(id)).join(', ') || [...layers].join(', '),
    )

    /**
     * ★ THE POINT OF SECTION A. "Les basses et moyennes échelles sont absentes
     *   ou tronquées" was the report's own hypothesis, so it is enumerated
     *   rather than argued: every tile the bounding box needs, at every zoom
     *   from 0 to 12, has to be there with bytes in it.
     */
    const gaps: string[] = []
    const spans: string[] = []
    for (let z = 0; z <= 12; z++) {
      const x0 = lon2x(34.25, z)
      const x1 = lon2x(35.95, z)
      const y0 = lat2y(33.4, z)
      const y1 = lat2y(29.4, z)
      let seen = 0
      let want = 0
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          want++
          const tile = await archive.getZxy(z, x, y)
          if (tile && tile.data.byteLength > 0) seen++
        }
      }
      spans.push(`z${z}:${seen}/${want}`)
      if (seen < want) gaps.push(`z${z} (${seen}/${want})`)
    }
    check(
      '★ A51 — EVERY tile over Israel from z0 to z12 is present with bytes',
      gaps.length === 0,
      gaps.length ? `missing at ${gaps.join(', ')}` : spans.join(' '),
    )

    /**
     * ★ AND THE EXTENT IS RECORDED, because it is the whole of section C. The
     *   archive is a country cut and its low-zoom tiles are NARROW; that is a
     *   fact about the file, not a defect, and the app has to have a ground of
     *   its own outside it.
     */
    const widths: string[] = []
    for (const z of [6, 7, 8, 9]) {
      const n = 2 ** z
      let lo = n
      let hi = -1
      for (let x = 0; x < n; x++) {
        let any = false
        for (let y = 0; y < n && !any; y++) {
          const tile = await archive.getZxy(z, x, y)
          if (tile && tile.data.byteLength > 0) any = true
        }
        if (any) {
          lo = Math.min(lo, x)
          hi = Math.max(hi, x)
        }
      }
      const west = (lo / n) * 360 - 180
      const east = ((hi + 1) / n) * 360 - 180
      widths.push(`z${z} lon ${west.toFixed(2)}…${east.toFixed(2)}`)
    }
    check(
      '★ and it is a COUNTRY cut, so the app must paint the ground beyond it',
      true,
      widths.join('  ·  '),
    )
  }
}

// ---------------------------------------------------------------------------
// The browser half.
// ---------------------------------------------------------------------------

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

interface Sample {
  zoom: number
  colours: number
  dominant: string
  dominantPct: number
  unpaintedPct: number
  page: string
  errored: number
  loading: number
  loaded: number
}

/**
 * One reading of the GL canvas AND of the source cache, together — because the
 * two questions this gate asks ("is there a hole?" and "will it heal?") are
 * answered by different halves of the same moment.
 */
const READ = `(() => {
  const m = window.__loYanumMap;
  const gl = document.querySelector('.maplibregl-canvas');
  if (!m || !gl) return null;
  const w = 200, h = 200;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(gl, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const counts = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const k = d[i] + ',' + d[i+1] + ',' + d[i+2];
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let top = ['', 0];
  counts.forEach((v, k) => { if (v > top[1]) top = [k, v]; });
  /* THE BAND, AS A NUMBER. Since Y1 the map's palette contains no
     --surface-base: the land is --map-land, the sea is the water blue, and
     the page's own grey belongs to the panel beside the map and to nothing
     inside it. So any pixel of the GL canvas holding that exact value is a
     pixel nothing painted, which is the whole of "des bandes blanches". */
  const page = getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim().replace(/,/g, ' ').split(' ').filter(Boolean).join(',');
  const unpainted = counts.get(page) || 0;
  const style = m.style || {};
  const caches = style.sourceCaches || style._otherSourceCaches || {};
  const sc = caches.protomaps;
  let errored = 0, loading = 0, loaded = 0;
  if (sc && sc._tiles) {
    for (const key of Object.keys(sc._tiles)) {
      const s = sc._tiles[key].state;
      if (s === 'errored') errored++;
      else if (s === 'loaded' || s === 'reloading') loaded++;
      else loading++;
    }
  }
  return {
    zoom: Math.round(m.getZoom() * 100) / 100,
    colours: counts.size,
    dominant: top[0],
    dominantPct: Math.round((top[1] / (w * h)) * 100),
    unpaintedPct: Math.round((unpainted / (w * h)) * 100),
    page,
    errored, loading, loaded,
  };
})()`

const read = (page: Page): Promise<Sample> => page.evaluate(READ) as Promise<Sample>

async function jump(page: Page, lng: number, lat: number, zoom: number, settle = 3500): Promise<void> {
  await page.evaluate(
    ([lng, lat, zoom]) => {
      ;(window as unknown as { __loYanumMap?: { jumpTo: (o: unknown) => void } }).__loYanumMap?.jumpTo({
        center: [lng, lat],
        zoom,
      })
    },
    [lng, lat, zoom] as [number, number, number],
  )
  await page.waitForTimeout(settle)
}

/**
 * ★ HOW MUCH OF THE CANVAS MAY BE THE PAGE'S OWN COLOUR. Zero, with a point of
 *   slack for the anti-aliased edge of a label halo. See `READ`.
 *
 *   Measured BEFORE Y1, on the same views: 73 % at z3, 49 % at z6, 47 % at z8,
 *   68 % at z12, 82 % at z15 — because `earth` WAS `--surface-base`, so a
 *   painted desert and an unpainted hole were the same pixel and no gate could
 *   have told them apart. Giving the map its own ground is what makes this
 *   number mean something.
 */
const UNPAINTED_CEILING = 1
/** A painted ground shows hundreds of distinct values; a dead one shows three. */
const COLOUR_FLOOR = 40

let browser: Browser | null = null
try {
  browser = await ENGINE.launch()
  const context = await browser.newContext({
    viewport: { width: 1032, height: 1376 },
    locale: 'he-IL',
    deviceScaleFactor: 1,
    /**
     * ⚠️ AND THIS LINE IS WHY SECTION D WAS GREEN WHILE THE BUG WAS PRESENT.
     *    `page.route` cannot see a request a SERVICE WORKER makes, and in a
     *    built preview `sw.js` is registered and `basemapResponse` ends in
     *    `fetch(request)` — so every range read was going out through the
     *    worker and the gate refused nothing at all, reporting "0 refused"
     *    and then congratulating a map that had never been broken. Blocking
     *    the worker puts the archive's reads back on the page, where the
     *    network can be cut for real.
     */
    serviceWorkers: 'block',
  })
  await context.addInitScript(PRESERVE_DRAWING_BUFFER)
  const page = await context.newPage()
  page.setDefaultTimeout(40_000)
  await Bun.$`mkdir -p ${SHOTS}`.quiet()

  await page.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
  await page.waitForFunction(
    () => Boolean((window as unknown as { __loYanumMap?: unknown }).__loYanumMap),
    undefined,
    { timeout: 40_000 },
  )
  await page.waitForTimeout(3500)

  // -------------------------------------------------------------------------
  section('B — THE SERVICE WORKER TOUCHES NO PMTILES RANGE')
  // -------------------------------------------------------------------------
  {
    const worker = await Bun.file('public/sw.js').text()
    /**
     * ⚠️ A REGRESSION THIS PROJECT HAS ALREADY LIVED, and the check is about
     *    the ONE branch that can reproduce it. The worker is allowed to answer
     *    a PMTiles range — that is how the offline map works — but ONLY out of
     *    an archive the coordinator deliberately held, and only by SLICING it:
     *    a bare `cache.match` answers a `Range` with a 200 of the whole 94 MB,
     *    and MapLibre then reads the front of the archive as if it were the
     *    tile it asked for. So: `sliceFromCache` must exist, it must answer
     *    206, and the not-held path must be a plain pass-through.
     */
    check(
      'the worker slices a held archive rather than returning it whole',
      /sliceFromCache/.test(worker) && /status:\s*206/.test(worker),
      'public/sw.js: sliceFromCache answers 206',
    )
    check(
      '★ and an archive that is NOT held is passed straight to the network',
      /if \(held\) return range \? sliceFromCache\(held, range\) : held\.clone\(\)\s*\n\s*return fetch\(request\)/.test(
        worker,
      ),
      'basemapResponse falls through to fetch(request)',
    )
    const served = await page.evaluate(async () => {
      const r = await fetch(
        (window as unknown as { __loYanumBasemapUrl?: string }).__loYanumBasemapUrl ?? '',
        { headers: { range: 'bytes=0-15' } },
      )
      return { status: r.status, range: r.headers.get('content-range') ?? '' }
    })
    check(
      '★ and a range request off the page answers 206 with a byte range',
      served.status === 206 && /^bytes 0-15\//.test(served.range),
      `${served.status} ${served.range}`,
    )
  }

  // -------------------------------------------------------------------------
  section('C — A51/A52 · NO WHITE BAND, AT ANY ZOOM THE CAMERA CAN REACH')
  // -------------------------------------------------------------------------
  {
    /**
     * ★★ THE `background` LAYER MUST BE OPAQUE, and this check exists because
     *    the first version of the fix was not. That layer has nothing under it
     *    — MapLibre composites it against a TRANSPARENT canvas — so an alpha
     *    there is a hole with a tint on it. It shipped once at 62 % and the
     *    deployed capture showed the sea outside the archive as a pale wash
     *    with a straight tile edge down its side. The unpainted-pixel check
     *    below could not see it: a washed-out blue is not the page's grey.
     */
    const bg = await page.evaluate(() => {
      const m = (window as unknown as {
        __loYanumMap?: { getStyle: () => { layers: { id: string; type: string; paint?: Record<string, unknown> }[] } }
      }).__loYanumMap
      const layer = m?.getStyle().layers.find((l) => l.type === 'background')
      return String(layer?.paint?.['background-color'] ?? '')
    })
    check(
      '★ the style`s background — the colour of every untiled pixel — is opaque',
      bg !== '' && !/\/\s*0?\.\d/.test(bg) && !/rgba/.test(bg),
      bg || 'no background layer',
    )
  }
  for (const zoom of [6, 9, 12, 15]) {
    await jump(page, 34.85, 31.25, zoom)
    const sample = await read(page)
    check(
      `★ A51 — z${zoom}: not one pixel of the map is the page's own colour`,
      sample.unpaintedPct <= UNPAINTED_CEILING,
      `${sample.unpaintedPct} % unpainted (${sample.page}), ${sample.colours} colours`,
    )
    check(
      `and z${zoom} is drawn from the archive, with nothing given up on`,
      sample.colours >= COLOUR_FLOOR && sample.errored === 0,
      `${sample.colours} colours, ${sample.errored} errored, ${sample.loaded} loaded`,
    )
    await page.screenshot({ path: `${SHOTS}/vector-z${zoom}-${ENGINE_NAME}.png` })
  }

  {
    /**
     * ★ A52 — TEN ZOOMS IN AND OUT, which is the gesture the report describes.
     *   It is a separate check from the four above because a band that only
     *   appears once the tile cache has churned is still a band.
     */
    let worst = 0
    let worstAt = ''
    for (let i = 0; i < 10; i++) {
      for (const z of [6, 13]) {
        await jump(page, 34.85, 31.25, z, 1100)
        const sample = await read(page)
        if (sample.unpaintedPct > worst) {
          worst = sample.unpaintedPct
          worstAt = `cycle ${i + 1}, z${z}`
        }
      }
    }
    await jump(page, 34.85, 31.25, 8)
    const settled = await read(page)
    check(
      '★ A52 — after ten zoom cycles there is still no band',
      worst <= UNPAINTED_CEILING && settled.unpaintedPct <= UNPAINTED_CEILING,
      `worst ${worst} % (${worstAt}), settled ${settled.unpaintedPct} %`,
    )
    check(
      'and nothing was left errored by the churn',
      settled.errored === 0,
      `${settled.errored} errored, ${settled.loaded} loaded`,
    )
  }

  // -------------------------------------------------------------------------
  section('D — THE MAP THAT NEEDED A RELAUNCH')
  // -------------------------------------------------------------------------
  {
    /**
     * ★★ THE POISONED KEY. Every range request fails while the FIRST archive
     *    read is in flight, then the network is perfect. In pmtiles 4.5.0 the
     *    rejected header promise stays in `SharedPromiseCache` under the
     *    archive's URL, so every tile for the rest of the page's life awaits
     *    it: the map is blank and stays blank however long you wait, however
     *    much you zoom, and only a relaunch clears it. Seen red exactly so.
     */
    const fresh = await context.newPage()
    let failing = true
    let refused = 0
    await fresh.route(
      (url) => url.pathname.includes('.pmtiles'),
      async (route) => {
        if (failing) {
          refused++
          return route.abort('failed')
        }
        return route.continue()
      },
    )
    await fresh.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
    await fresh.waitForTimeout(4000)
    failing = false
    check('the first archive reads were refused', refused > 0, `${refused} refused`)

    /**
     * ⚠️ NOT `waitForFunction`, AND THAT IS THE LESSON OF THE RED RUN. The
     *    map handle is published on MapLibre's `load`, which never fires when
     *    the source's own header read failed — so the first version of this
     *    check threw a 40 s timeout and took the whole gate down with it
     *    instead of reporting the defect. A map that never comes up is a
     *    FAILURE, in the report, with a number beside it.
     */
    let healed: Sample | null = null
    for (let i = 0; i < 12 && !healed; i++) {
      await fresh.waitForTimeout(2500)
      const sample = (await fresh.evaluate(READ).catch(() => null)) as Sample | null
      if (sample && sample.colours >= COLOUR_FLOOR && sample.errored === 0) healed = sample
    }
    check(
      '★★ D1 — a map whose FIRST read failed comes back with no relaunch',
      healed !== null,
      healed
        ? `${healed.colours} colours, 0 errored`
        : `after 30 s the map is ${
            (await fresh.evaluate(
              () => Boolean((window as unknown as { __loYanumMap?: unknown }).__loYanumMap),
            ))
              ? 'up but blank'
              : 'STILL NOT LOADED — only a relaunch would clear it'
          }`,
    )
    await fresh.screenshot({ path: `${SHOTS}/heal-cold-${ENGINE_NAME}.png` })
    await fresh.close()
  }

  {
    /**
     * ★★ AND THE WARM CASE: a map that was working when the network went away,
     *    which is the iPad leaving the farmhouse Wi-Fi. MapLibre marks the
     *    tiles `errored` and never asks again on its own.
     */
    const warm = await context.newPage()
    let failing = false
    let cut = 0
    await warm.route((url) => url.pathname.includes('.pmtiles'), async (route) => {
      if (failing && Math.random() < 0.8) {
        cut++
        return route.abort('failed')
      }
      return route.continue()
    })
    await warm.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
    await warm.waitForFunction(
      () => Boolean((window as unknown as { __loYanumMap?: unknown }).__loYanumMap),
      undefined,
      { timeout: 40_000 },
    )
    await warm.waitForTimeout(3500)
    failing = true
    await jump(warm, 35.2, 32.7, 11, 6000)
    const broken = (await warm.evaluate(READ)) as Sample
    /**
     * ★ WHAT THIS ASSERTS IS THAT THE NETWORK WAS REALLY CUT, and not that the
     *   map was left broken by it — because since Y1 it very often is NOT.
     *   The first version of this line required `errored > 0` six seconds in
     *   and started FAILING once the healing worked: the retry ladder absorbs
     *   most of the aborts and the tile-level recovery clears the rest inside
     *   a second or two. A gate that fails because the app got better is a
     *   gate measuring the wrong thing. The outcome is D2's business.
     */
    check(
      'the network really was cut over a fresh view',
      cut > 0,
      `${cut} range reads refused; ${broken.errored} errored / ${broken.loading} loading at the six-second mark`,
    )
    failing = false

    let healed: Sample | null = null
    for (let i = 0; i < 12 && !healed; i++) {
      await warm.waitForTimeout(2500)
      const sample = (await warm.evaluate(READ)) as Sample
      if (sample.errored === 0 && sample.colours >= COLOUR_FLOOR) healed = sample
    }
    check(
      '★★ D2 — and they are re-requested by themselves once it is back',
      healed !== null,
      healed ? `0 errored, ${healed.colours} colours` : JSON.stringify(await warm.evaluate(READ)),
    )
    await warm.screenshot({ path: `${SHOTS}/heal-warm-${ENGINE_NAME}.png` })
    await warm.close()
  }

  // -------------------------------------------------------------------------
  section('E — WHAT IS ON THE GROUND, NOT JUST THAT THERE IS ONE')
  // -------------------------------------------------------------------------
  for (const view of [
    { name: 'ארצי', lng: 34.85, lat: 31.25, zoom: 7, want: ['water', 'earth'] },
    { name: 'אזורי', lng: 34.79, lat: 31.25, zoom: 10, want: ['roads', 'places'] },
    { name: 'חוות', lng: 34.79, lat: 31.25, zoom: 14, want: ['roads', 'places'] },
  ]) {
    await jump(page, view.lng, view.lat, view.zoom)
    const kinds = await page.evaluate(() => {
      const m = (window as unknown as {
        __loYanumMap?: { queryRenderedFeatures: () => { layer?: { id: string } }[] }
      }).__loYanumMap
      const seen = new Set<string>()
      for (const f of m?.queryRenderedFeatures() ?? []) {
        const id = f.layer?.id ?? ''
        if (id.startsWith('lo-')) continue
        seen.add(id.split('_')[0])
      }
      return [...seen]
    })
    check(
      `z${view.zoom} (${view.name}) paints ${view.want.join(' + ')}`,
      view.want.every((k) => kinds.includes(k)),
      kinds.sort().join(', '),
    )
  }
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed  (${ENGINE_NAME})`)
console.log('')
if (failed > 0) process.exit(1)
