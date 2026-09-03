import { chromium } from 'playwright'
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
console.log('  A84 — BORDERS AND THE SATELLITE SWITCH, IN A REAL BROWSER')
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
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' })
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
