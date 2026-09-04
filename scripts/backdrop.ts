import { chromium, webkit } from 'playwright'
import type { Browser, Page, Request } from 'playwright'

import { SATELLITE } from '../src/ui/components/basemap'

/**
 * A84 — THE GROUND UNDER THE PROGRAMME: BORDERS, AND THE SATELLITE SWITCH.
 *
 *   bun run backdrop
 *
 * The product owner asked for two things on 2026-09-01, after the archive was
 * fixed, and both are claims about what is DRAWN rather than about what is
 * configured — so both are proved the way §29 established: in a real browser,
 * on a blank profile, with captures.
 *
 *   A  the state borders are too faint on the vector style. Make them read,
 *      and make a disputed / armistice line distinguishable from a settled
 *      one the way OSM's own rendering does, in light AND dark, without
 *      competing with the zones he draws himself.
 *
 *   B  a "מפה / לוויין" ground switch, on line only: with no network the
 *      button is disabled with a stated reason and the national vector archive
 *      stays the ground.
 *
 * ★ WHAT THIS GATE REFUSES TO ACCEPT AS EVIDENCE: that the layers are in the
 *   style. A layer can be present, correctly filtered and invisible — that is
 *   what Protomaps' own 0.4 px boundary was. So every check below either
 *   queries what MapLibre actually RENDERED at a viewport, or watches the
 *   network, or reads the DOM of the control.
 */

const PORT = Number(process.env.BACKDROP_PORT ?? 5196)

/**
 * ★★ Y1 (2026-09-04) — THE ENGINE IS A CHOICE NOW, AND THE REASON IS THE
 *    PRODUCT OWNER'S IPAD. Every sweep in this repository has run on Chromium
 *    because the WebKit build was not installed on the machine, and ETAT.md has
 *    carried "the iPad is WebKit, so that is the half that is missing" as a
 *    standing caveat for four rounds. It is installed. `ENGINE=webkit bun run
 *    backdrop` is now a real run, and section C below — the one that answers
 *    his white map — is written to be worth running on both.
 */
const ENGINE = process.env.ENGINE === 'webkit' ? webkit : chromium
const ENGINE_NAME = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'

/**
 * ★★ Y1 — READING THE PIXELS THE GPU ACTUALLY PAINTED.
 *
 * MapLibre creates its context with `preserveDrawingBuffer: false`, which is
 * the right default and which also means the buffer is empty by the time any
 * script can sample it: `drawImage` of the live canvas returns one flat colour
 * whether the map is perfect or dead. That is not a detail — it is the exact
 * reason a gate can watch `getStyle().sources`, see `protomaps` present, and
 * sign off on a white rectangle.
 *
 * So the flag is forced on for the duration of the gate, by patching
 * `getContext` before any application script runs. It costs a copy per frame
 * and buys the only evidence that answers the product owner's report.
 */
const PRESERVE_DRAWING_BUFFER = `(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    }
    return orig.call(this, type, attrs);
  };
})()`

/**
 * How many distinct colours the GL canvas is showing, over a 200×200 sample.
 *
 * A painted basemap is well over a hundred — land, water, roads, labels, the
 * halo under each of them. A dead context, a style with no ground, or a
 * `background` layer alone is one, two or three. The threshold below is set at
 * eight, which is an order of magnitude clear of both.
 */
const PAINTED_COLOURS = `(() => {
  const gl = document.querySelector('.maplibregl-canvas');
  if (!gl) return -1;
  const w = 200, h = 200;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(gl, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 3) + ',' + (d[i+1] >> 3) + ',' + (d[i+2] >> 3));
  return seen.size;
})()`

/** Below this, the map is not showing a ground. See `PAINTED_COLOURS`. */
const PAINTED_FLOOR = 8
const OUT_DIR = 'dist-backdrop'
const SHOTS = 'docs/screenshots/basemap'

/**
 * ★ A VIEWPORT ON A LINE THAT IS ACTUALLY DISPUTED, and it was chosen by
 *   DECODING THE ARCHIVE rather than by looking at a map. The `boundaries`
 *   layer of the tiles around Jerusalem carries `disputed: true` at
 *   kind_detail 2 from z8 to z14 — that is measured, and it is what makes the
 *   dashed-line check below a check rather than a hope.
 */
/**
 * ★ THE PROVIDER'S HOST IS DERIVED FROM THE SHIPPED CONSTANT, NOT TYPED HERE.
 *   §32 swapped the imagery from EOX to Esri on the product owner's word, and
 *   the first version of this gate carried `tiles.maps.eox.at` as a literal —
 *   which would have gone on passing while watching for requests the app no
 *   longer makes. One source of truth: `basemap.ts`.
 */
const IMAGERY_HOST = new URL(SATELLITE.tiles[0].replace(/\{[a-z]\}/g, '0')).host

const BORDER_VIEW = { name: 'ירושלים / קו שביתת הנשק', lat: 31.83, lng: 35.12, zoom: 11 }
/**
 * ★ AND A SECOND ONE, BECAUSE THE FIRST VERSION OF THIS GATE FAILED ON
 *   GEOGRAPHY RATHER THAN ON CODE. At z11 over Jerusalem every country-level
 *   line in the data is `disputed: true` — 8 of them, 0 settled — so asking
 *   that viewport for a settled international border asks it for something
 *   that is not there. The treaty borders with Egypt and Jordan are, and this
 *   is the frame that holds them.
 */
const COUNTRY_VIEW = { name: 'ישראל, מבט ארצי', lat: 31.0, lng: 34.9, zoom: 7 }
/** A farm-scale view, which is the zoom the imagery is actually for. */
const FARM_VIEW = { name: 'הנגב המערבי', lat: 31.42, lng: 34.55, zoom: 13 }

let passed = 0
let failed = 0
let warned = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

/**
 * ★ THE ONE NON-FATAL OUTCOME IN THIS FILE, AND IT IS NARROW ON PURPOSE.
 *
 *   §27 and §28 are a long argument against gates that warn and ship, and
 *   every branch here follows that rule with one exception: whether a THIRD
 *   PARTY'S SERVER answered. That this app asks for imagery is our artefact
 *   and is checked hard below; whether EOX's tile service is up this minute is
 *   not, and a hard failure there would let somebody else's outage block the
 *   deploy of a tool people use at night. The distinction is exact:
 *
 *     no imagery request left the browser at all   → FAIL (our wiring)
 *     requests left, and none came back            → WARN (their uptime)
 *
 *   And the warning names the provider, so it can never be mistaken for the
 *   map being fine.
 */
function warn(label: string, detail = ''): void {
  warned++
  console.log(`  WARN  ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

interface MapHandle {
  jumpTo: (o: unknown) => void
  once: (e: string, f: () => void) => void
  getStyle: () => { layers: { id: string; type: string }[]; sources: Record<string, unknown> }
  queryRenderedFeatures: (g?: unknown, o?: unknown) => { layer?: { id: string } }[]
  isStyleLoaded: () => boolean
}

async function settle(page: Page, view: { lat: number; lng: number; zoom: number }): Promise<void> {
  await page.evaluate(
    async ([lat, lng, z]) => {
      const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
      if (!m) return
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
    },
    [view.lat, view.lng, view.zoom] as [number, number, number],
  )
}

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

console.log('')
console.log(`  A84 — BORDERS AND THE SATELLITE SWITCH, IN A REAL BROWSER (${ENGINE_NAME})`)
console.log('  ========================================================')

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
  browser = await ENGINE.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' })
  await context.addInitScript(PRESERVE_DRAWING_BUFFER)
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)

  /** Every imagery request the page makes, so "it loaded" is not a claim. */
  const imagery: string[] = []
  const imageryStatus = new Map<number, number>()
  page.on('request', (r: Request) => {
    if (r.url().includes(IMAGERY_HOST)) imagery.push(r.url())
  })
  page.on('response', (r) => {
    if (r.url().includes(IMAGERY_HOST))
      imageryStatus.set(r.status(), (imageryStatus.get(r.status()) ?? 0) + 1)
  })

  await Bun.$`mkdir -p ${SHOTS}`.quiet()
  await page.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
  check('the map style loads at all', await styleLoaded(page))

  // -------------------------------------------------------------------------
  section('A — THE BORDERS')
  // -------------------------------------------------------------------------

  const layerIds = await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
    return m ? m.getStyle().layers.map((l) => l.id) : []
  })
  check(
    "★ Protomaps' two whisper-thin boundary layers are GONE, not merely hidden",
    !layerIds.includes('boundaries') && !layerIds.includes('boundaries_country'),
    layerIds.filter((l) => /^boundaries/.test(l)).join(', ') || 'neither is in the style',
  )
  const mine = [
    'lo-boundaries-regional-halo',
    'lo-boundaries-regional',
    'lo-boundaries-country-halo',
    'lo-boundaries-country',
    'lo-boundaries-disputed-halo',
    'lo-boundaries-disputed',
  ]
  check(
    'and the six replacements are, in the roads/bridges slot',
    mine.every((id) => layerIds.includes(id)),
    mine.filter((id) => layerIds.includes(id)).join(', '),
  )
  check(
    '★ and they sit UNDER every label, so a place name still wins',
    (() => {
      const firstLabel = layerIds.findIndex((id) => /label|places_|pois/.test(id))
      const lastMine = Math.max(...mine.map((id) => layerIds.indexOf(id)))
      return firstLabel > lastMine
    })(),
    `last border at ${Math.max(...mine.map((id) => layerIds.indexOf(id)))}, first label at ${layerIds.findIndex((id) => /label|places_|pois/.test(id))}`,
  )

  const countAll = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
      if (!m) return {}
      const count = (id: string): number => {
        try {
          return m.queryRenderedFeatures(undefined, { layers: [id] }).length
        } catch {
          return -1
        }
      }
      return {
        halo: count('lo-boundaries-country-halo') + count('lo-boundaries-disputed-halo'),
        country: count('lo-boundaries-country'),
        disputed: count('lo-boundaries-disputed'),
        regional: count('lo-boundaries-regional'),
      }
    })

  await settle(page, COUNTRY_VIEW)
  const national = await countAll()
  check(
    `★★ a SETTLED international line is actually rendered at ${COUNTRY_VIEW.name}`,
    (national.country ?? 0) > 0,
    `${national.country} settled, ${national.disputed} disputed in the same frame`,
  )
  await page.screenshot({ path: `${SHOTS}/borders-national.png` })

  await settle(page, BORDER_VIEW)
  const drawn = await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
    if (!m) return {}
    const count = (id: string): number => {
      try {
        return m.queryRenderedFeatures(undefined, { layers: [id] }).length
      } catch {
        return -1
      }
    }
    return {
      halo: count('lo-boundaries-country-halo') + count('lo-boundaries-disputed-halo'),
      country: count('lo-boundaries-country'),
      disputed: count('lo-boundaries-disputed'),
      regional: count('lo-boundaries-regional'),
    }
  })
  check(
    `★★ and a DISPUTED / armistice line is rendered at ${BORDER_VIEW.name}, on its own layer`,
    (drawn.disputed ?? 0) > 0,
    `${drawn.disputed} features — the archive carries disputed:true, so the dash is data and not decoration`,
  )
  check(
    'the halo under them is drawn as well',
    (drawn.halo ?? 0) > 0,
    `${drawn.halo} features`,
  )
  check(
    'and the regional lines are present but a separate layer',
    (drawn.regional ?? 0) >= 0,
    `${drawn.regional} features`,
  )

  /**
   * ★ X3.6 (2026-09-04) — THE DROPPED CAPTION, MEASURED WHERE IT USED TO
   *   RENDER. The product owner asked for "השטחים הפלסטיניים" to come off the
   *   basemap; `dropNamedLabels` (basemap.ts) filters it out of
   *   `places_country` / `places_region` by name. The BOUNDARY lines above are
   *   untouched and this gate has just proved they are still drawn — which is
   *   the point: a dashed armistice line is a different statement from a
   *   floating area caption, and only one of the two was asked to go.
   */
  const dropped = await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
    if (!m) return -1
    return m
      .queryRenderedFeatures(undefined, {
        layers: ['places_country', 'places_region'],
      })
      .filter((f) => {
        const p = (f as unknown as { properties?: Record<string, unknown> }).properties ?? {}
        return [p.name, p['name:he'], p['name:en']].includes('השטחים הפלסטיניים')
      }).length
  })
  check(
    '★ X3.6 — "השטחים הפלסטיניים" is not rendered as a place label',
    dropped === 0,
    `${dropped} matching label features in the armistice-line frame`,
  )

  await page.screenshot({ path: `${SHOTS}/borders-light.png` })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await styleLoaded(page)
  await settle(page, BORDER_VIEW)
  await page.screenshot({ path: `${SHOTS}/borders-dark.png` })
  const darkDrawn = await countAll()
  check(
    '★ and the same lines survive the dark palette',
    (darkDrawn.disputed ?? 0) > 0 && (darkDrawn.halo ?? 0) > 0,
    `${darkDrawn.disputed} disputed, ${darkDrawn.halo} halo segments in dark theme`,
  )
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await styleLoaded(page)
  console.log(`  captures: ${SHOTS}/borders-{national,light,dark}.png`)

  // -------------------------------------------------------------------------
  section('B — THE SATELLITE SWITCH')
  // -------------------------------------------------------------------------

  /**
   * ⚠️ X3.2 (2026-09-04) — THE GROUND IS ONE TARGET AGAIN. W5 split it into
   *    מפה / לוויין because a single toggle whose LABEL named the other
   *    ground read as a riddle; the product owner has since asked for the
   *    pair to go, and the riddle is answered instead by the GLYPH being the
   *    destination. So there is one `map-tool-base`, and `data-base` on it
   *    says which ground the map is on while `data-target` says where a tap
   *    would take it. Same claims about the style, one button.
   */
  const stack = page.locator('[data-testid="map-tools"]')
  const baseBtn = page.locator('[data-testid="map-tool-base"]')
  check('the map carries ONE control stack', (await stack.count()) === 1)
  check(
    'the ground switch is ONE target of it, not two',
    (await baseBtn.count()) === 1 &&
      (await page.locator('[data-testid="map-tool-satellite"]').count()) === 0,
  )
  check(
    'and it starts on the vector ground, offering the imagery',
    (await baseBtn.getAttribute('data-base')) === 'vector' &&
      (await baseBtn.getAttribute('data-target')) === 'satellite',
  )

  await settle(page, FARM_VIEW)
  await baseBtn.click()
  await styleLoaded(page)
  await settle(page, FARM_VIEW)
  await page.waitForTimeout(2500)

  const satStyle = await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
    if (!m) return { sources: [] as string[], layers: [] as string[] }
    const s = m.getStyle()
    return { sources: Object.keys(s.sources), layers: s.layers.map((l) => l.id) }
  })
  check(
    '★ the imagery source is in the style, and the archive is STILL there with it',
    satStyle.sources.includes('satellite') && satStyle.sources.includes('protomaps'),
    satStyle.sources.join(', '),
  )
  const statuses = [...imageryStatus].map(([s, n]) => `${s}×${n}`).join(' ') || 'none'
  check(
    '★ the browser really ASKED the licensed provider for imagery',
    imagery.length > 0,
    `${imagery.length} tile requests to ${IMAGERY_HOST}`,
  )
  if ((imageryStatus.get(200) ?? 0) > 0) {
    check(
      '★★ and real imagery tiles came back',
      true,
      `${imagery.length} requested, statuses ${statuses}`,
    )
  } else {
    warn(
      `imagery was requested and NOTHING came back — ${IMAGERY_HOST}, not this app`,
      `${imagery.length} requested, statuses ${statuses}. The switch, the style and the fallback are all still checked below.`,
    )
  }
  check(
    '★ the ground is gone but the ORIENTATION is not — roads, names and borders stay',
    satStyle.layers.includes('satellite') &&
      !satStyle.layers.includes('earth') &&
      satStyle.layers.includes('lo-boundaries-country') &&
      satStyle.layers.some((id) => /places_|labels_/.test(id)),
    `${satStyle.layers.length} layers over the imagery`,
  )
  const labelled = await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
    if (!m) return 0
    return m.queryRenderedFeatures(undefined, {
      layers: ['places_locality', 'places_subplace', 'roads_labels_major'],
    }).length
  })
  check(
    '★ and those labels are actually rendered ON the photograph',
    labelled > 0,
    `${labelled} label features over imagery`,
  )
  await page.screenshot({ path: `${SHOTS}/satellite.png` })

  /**
   * ★★ PO RETURN 2026-09-02 — "SATELLITE FLOU EN ZOOM FORT". His diagnosis was
   *    that the raster source's declared `maxzoom` was capped too low, and it
   *    was: the shipped provider was Sentinel-2 at 10 m/px, whose real ceiling
   *    IS z14, so past it MapLibre was magnifying a z14 tile and the imagery
   *    went soft while the vector roads stayed sharp — exactly what he saw.
   *
   *    The provider is now Esri (§32, his word), maxzoom 19. So the check is
   *    not "is 19 in the style" — that is a configuration — but **whether the
   *    browser actually holds LOADED imagery tiles at z16 and z17**. Under the
   *    old cap it could not: the highest canonical zoom in the raster cache
   *    would be 14 whatever the camera did.
   */
  for (const z of [16, 17]) {
    await settle(page, { ...FARM_VIEW, zoom: z })
    await page.waitForTimeout(2500)
    const deep = await page.evaluate(() => {
      const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
      const style = (m as unknown as { style?: Record<string, unknown> })?.style
      const caches =
        (style?.sourceCaches as Record<string, { _tiles: Record<string, unknown> }>) ??
        (style?._otherSourceCaches as Record<string, { _tiles: Record<string, unknown> }>)
      const cache = caches?.satellite
      if (!cache) return { max: -1, loaded: 0 }
      const tiles = Object.values(cache._tiles) as {
        state: string
        tileID: { canonical: { z: number } }
      }[]
      const loaded = tiles.filter((t) => t.state === 'loaded')
      return {
        max: loaded.reduce((a, t) => Math.max(a, t.tileID.canonical.z), -1),
        loaded: loaded.length,
      }
    })
    check(
      `★★ at z${z} the imagery on screen is REAL z${z} data, not a magnified z14 tile`,
      deep.max >= z,
      `${deep.loaded} loaded imagery tiles, deepest canonical zoom ${deep.max}`,
    )
    await page.screenshot({ path: `${SHOTS}/satellite-z${z}.png` })
  }
  await settle(page, FARM_VIEW)
  console.log(`  captures: ${SHOTS}/satellite-z16.png, ${SHOTS}/satellite-z17.png`)

  // ---- the offline rule, which is the half that matters in the field ------
  await context.setOffline(true)
  await page.waitForTimeout(1200)
  check(
    '★★ offline, the ground switch is DISABLED',
    await baseBtn.isDisabled(),
  )
  check(
    'and it says why, in Hebrew, on the control itself',
    (await baseBtn.getAttribute('title')) === 'לוויין זמין רק בחיבור',
    (await baseBtn.getAttribute('title')) ?? '<none>',
  )
  await styleLoaded(page)
  await page.waitForTimeout(800)
  const fellBack = await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
    return m ? Object.keys(m.getStyle().sources) : []
  })
  check(
    '★★ and the map FELL BACK to the national vector archive by itself',
    !fellBack.includes('satellite') && fellBack.includes('protomaps'),
    fellBack.join(', '),
  )
  check(
    'the control shows the vector ground as the live one again',
    (await baseBtn.getAttribute('data-base')) === 'vector',
  )
  await page.screenshot({ path: `${SHOTS}/satellite-offline-fallback.png` })
  await context.setOffline(false)
  console.log(`  captures: ${SHOTS}/satellite.png, ${SHOTS}/satellite-offline-fallback.png`)

  // -------------------------------------------------------------------------
  section('C — Y1: THE GROUND COMES BACK, EVERY TIME AND FROM ANYTHING')
  // -------------------------------------------------------------------------

  /**
   * ★★ Y1 (2026-09-04) — THE PRODUCT OWNER'S WHITE MAP.
   *
   *   "en basculant satellite → vectoriel, le fond de carte ne revient pas —
   *    seuls les marqueurs restent sur un écran blanc. Aucun zoom/dézoom ni
   *    re-bascule ne le récupère."
   *
   * Two claims are separated here, because the first one turned out to be
   * innocent and saying so is part of the answer.
   *
   * C1 — THE SWITCH ITSELF. Ten round-trips, and at all twenty states the
   *      canvas is asked how many colours it is PAINTING rather than which
   *      sources it declares. The earlier version of this gate checked
   *      `getStyle().sources` and would have passed a blank map without
   *      hesitating; that is exactly the evidence §29 rules out, and it is why
   *      `PRESERVE_DRAWING_BUFFER` exists above.
   *
   * C2 — A LOST WEBGL CONTEXT, which is what actually produces his screen.
   *      iOS discards GL contexts under memory pressure and on backgrounding,
   *      and MapLibre 4.7.1 announces a recovery it does not perform: after
   *      its `webglcontextrestored` handler has run `_setupPainter`, `resize`
   *      and `_update`, the canvas holds ONE colour and stays there through a
   *      zoom and a ground switch — measured, and the reason nothing the
   *      product owner tried helped. `MapCanvas` rebuilds the map instead.
   *      Both shapes are driven: the loss that is restored, and the loss that
   *      is never restored at all.
   */
  const painted = async (): Promise<number> => Number(await page.evaluate(PAINTED_COLOURS))

  await settle(page, FARM_VIEW)
  await page.waitForTimeout(1500)
  check(
    '★ the sampler sees a PAINTED map before anything is done to it',
    (await painted()) >= PAINTED_FLOOR,
    `${await painted()} distinct colours over 200×200`,
  )

  let worstVector = Number.POSITIVE_INFINITY
  let worstSatellite = Number.POSITIVE_INFINITY
  let blankStates = 0
  for (let cycle = 1; cycle <= 10; cycle++) {
    await baseBtn.click()
    await styleLoaded(page)
    await page.waitForTimeout(2200)
    const onImagery = await painted()
    worstSatellite = Math.min(worstSatellite, onImagery)
    if (onImagery < PAINTED_FLOOR) blankStates++

    await baseBtn.click()
    await styleLoaded(page)
    await page.waitForTimeout(2200)
    const onVector = await painted()
    worstVector = Math.min(worstVector, onVector)
    if (onVector < PAINTED_FLOOR) blankStates++

    if (cycle === 10) await page.screenshot({ path: `${SHOTS}/y1-after-10-round-trips.png` })
  }
  check(
    '★★ C1 — ten satellite↔vector round-trips, and the ground is PAINTED at all 20 states',
    blankStates === 0,
    `${blankStates} blank states; thinnest vector frame ${worstVector} colours, thinnest imagery frame ${worstSatellite}`,
  )
  check(
    'and the switch ends where it started, on the vector ground',
    (await baseBtn.getAttribute('data-base')) === 'vector',
  )

  /** The camera, so the recovery can be shown not to have moved it. */
  const cameraNow = async (): Promise<string> =>
    page.evaluate(() => {
      const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap as unknown as {
        getCenter: () => { lng: number; lat: number }
        getZoom: () => number
      }
      const c = m.getCenter()
      return `${c.lng.toFixed(3)},${c.lat.toFixed(3)}@${m.getZoom().toFixed(1)}`
    })

  const markerCount = async (): Promise<number> => page.locator('.maplibregl-marker').count()

  const before = { pixels: await painted(), camera: await cameraNow(), markers: await markerCount() }

  /** C2a — the ordinary case: the browser takes the context and gives it back. */
  await page.evaluate(() => {
    const c = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext
    const lose = gl.getExtension('WEBGL_lose_context') as { loseContext: () => void; restoreContext: () => void }
    lose.loseContext()
    setTimeout(() => lose.restoreContext(), 300)
  })
  await page.waitForTimeout(7000)
  const restored = { pixels: await painted(), camera: await cameraNow(), markers: await markerCount() }
  check(
    '★★ C2a — a WebGL context that is lost and restored leaves a PAINTED map',
    restored.pixels >= PAINTED_FLOOR,
    `${before.pixels} colours before, ${restored.pixels} after`,
  )
  check(
    '★ and the coordinator is still looking at the same place',
    restored.camera === before.camera,
    `${before.camera} → ${restored.camera}`,
  )
  check(
    '★ and his markers came back with the ground',
    restored.markers === before.markers && restored.markers > 0,
    `${before.markers} before, ${restored.markers} after`,
  )
  await page.screenshot({ path: `${SHOTS}/y1-context-restored.png` })

  /** C2b — the backgrounded-iPad case: the context goes and never comes back. */
  await page.evaluate(() => {
    const c = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext
    ;(gl.getExtension('WEBGL_lose_context') as { loseContext: () => void }).loseContext()
  })
  await page.waitForTimeout(9000)
  check(
    '★★ C2b — a context that is lost and NEVER restored is rebuilt anyway',
    (await painted()) >= PAINTED_FLOOR,
    `${await painted()} colours after a silent loss`,
  )

  /** And the thing he reported is the thing that still has to work afterwards. */
  await baseBtn.click()
  await styleLoaded(page)
  await page.waitForTimeout(2200)
  const satAfterLoss = await painted()
  await baseBtn.click()
  await styleLoaded(page)
  await page.waitForTimeout(2200)
  const vecAfterLoss = await painted()
  check(
    '★★ and the ground switch still paints both grounds after a recovery',
    satAfterLoss >= PAINTED_FLOOR && vecAfterLoss >= PAINTED_FLOOR,
    `imagery ${satAfterLoss} colours, vector ${vecAfterLoss} colours`,
  )
  await page.screenshot({ path: `${SHOTS}/y1-recovered-and-switching.png` })
  console.log(`  captures: ${SHOTS}/y1-after-10-round-trips.png, ${SHOTS}/y1-context-restored.png`)

  // -------------------------------------------------------------------------
  section('D — Y8: THE REGIONS ARE VISIBLE, AND THE COAST CUTS THEM')
  // -------------------------------------------------------------------------

  /**
   * ★★ Y8 (2026-09-04) — TWO CLAIMS, BOTH ABOUT WHAT IS PAINTED.
   *
   *   D1  "les aplats de régions sont quasi invisibles : augmenter nettement
   *        l'opacité et la saturation". X12 painted them at 10 % of a
   *        deliberately pale palette. The check is not the declared opacity —
   *        that is a configuration — but whether turning the layer ON changes
   *        the PIXELS, measured the way section C measures the ground.
   *
   *   D2  "réutiliser la géométrie déjà présente dans le fond vectoriel …
   *        pour que les aplats épousent exactement la forme du pays". The
   *        implementation is a paint order rather than a computation: the
   *        washes are inserted BELOW the archive's own `water`, so the sea
   *        paints over every overhang. So what is checked is the ORDER — and
   *        then, over the Mediterranean, that a point which is inside a
   *        region's hand-written ring shows NO region colour, because the
   *        coastline the coordinator is looking at cut it.
   */
  await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap as unknown as {
      jumpTo: (o: unknown) => void
    }
    m.jumpTo({ center: [34.9, 31.9], zoom: 7 })
  })
  await page.waitForTimeout(2500)

  const regionOrder = await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
    if (!m) return { fill: -1, line: -1, water: -1, earth: -1 }
    const ids = m.getStyle().layers.map((l) => l.id)
    return {
      fill: ids.indexOf('regions-fill'),
      line: ids.indexOf('regions-line'),
      water: ids.indexOf('water'),
      earth: ids.indexOf('earth'),
    }
  })
  check(
    '★★ D2 — the region washes are painted UNDER the archive\'s own water',
    regionOrder.fill > regionOrder.earth &&
      regionOrder.fill < regionOrder.water &&
      regionOrder.line < regionOrder.water,
    `earth ${regionOrder.earth} < fill ${regionOrder.fill} / line ${regionOrder.line} < water ${regionOrder.water}`,
  )

  /** The legend's checkbox is how the coordinator turns them on, so it is how this does. */
  const legendToggle = page.locator('[data-testid="map-legend-toggle"]')
  if (await legendToggle.count()) {
    await legendToggle.click()
    await page.waitForTimeout(400)
  }
  /**
   * ⚠️ `beforeRegions` / `afterRegions` / `regionsDrawn`, NOT `before` /
   *    `after` / `drawn`. Sections B and C already bind those names at this
   *    file's top level, and the first version of this section reused them —
   *    which `bun x tsc --noEmit` cannot see (it includes `src`, not
   *    `scripts`) and which failed the DEPLOY. `bun run parse` is the guard
   *    that now catches it in under a second.
   */
  const beforeRegions = await painted()
  const regionBox = page.locator('[data-testid="layer-regions"]')
  check('the regions layer has a switch in the legend', (await regionBox.count()) === 1)
  await regionBox.check({ force: true })
  await page.waitForTimeout(2000)
  const afterRegions = await painted()
  const regionsDrawn = await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap
    return m ? m.queryRenderedFeatures(undefined, { layers: ['regions-fill'] }).length : 0
  })
  check(
    '★★ D1 — switching them on CHANGES the map, and by a lot',
    regionsDrawn > 0 && afterRegions > beforeRegions + 40,
    `${regionsDrawn} washes drawn, ${beforeRegions} colours before → ${afterRegions} after`,
  )

  /**
   * ★★ D2, MEASURED WHERE IT MATTERS: a point in the sea that IS inside one of
   *    the hand-written rings. If the cut works, `regions-fill` is not among
   *    what is rendered there — the Mediterranean is painted over it.
   */
  const overSea = await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: MapHandle }).__loYanumMap as unknown as {
      project: (c: [number, number]) => { x: number; y: number }
      queryRenderedFeatures: (p: unknown, o?: unknown) => { layer?: { id: string } }[]
    }
    // 20 km off Ashdod: open water, and well inside the coastal rings.
    const p = m.project([34.4, 31.8])
    const at = m.queryRenderedFeatures(p) as { layer?: { id: string } }[]
    return {
      water: at.some((f) => f.layer?.id === 'water'),
      region: at.some((f) => f.layer?.id === 'regions-fill'),
    }
  })
  check(
    "★★ D2 — a point at sea inside a region's ring shows the SEA, not the wash",
    overSea.water && !overSea.region,
    `water ${overSea.water}, region wash ${overSea.region}`,
  )
  await page.screenshot({ path: `${SHOTS}/y8-regions-national.png` })
  console.log(`  captures: ${SHOTS}/y8-regions-national.png`)
} finally {
  await browser?.close()
  serve.kill()
}

section('VERDICT')
console.log(`  ${passed} passed, ${failed} failed${warned ? `, ${warned} warned` : ''}`)
if (warned) {
  console.log('')
  console.log('  A warning here is a third party being unreachable, never this app.')
}
process.exit(failed === 0 ? 0 : 1)
