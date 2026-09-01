import { Protocol } from 'pmtiles'
import maplibregl from 'maplibre-gl'
import { layersWithCustomTheme, namedTheme } from 'protomaps-themes-base'
import type { Theme } from 'protomaps-themes-base'
import type { StyleSpecification } from 'maplibre-gl'

/**
 * PMTILES (decision 71) — THE BASEMAP, VECTOR, SELF-HOSTED, IN THE APP'S OWN
 * TOKENS.
 *
 * Replaces four thousand raster requests to OpenStreetMap's tile servers —
 * which their tile usage policy forbids at this volume, and which cannot be
 * held offline in any honest way — with ONE archive read by HTTP range
 * requests from the project's own public Storage bucket. That is criterion B3
 * revised: a basemap that survives a farm track after one download.
 *
 * ★ AND THE COLOURS COME FROM `tokens.css`, WHICH IS THE OTHER HALF OF THE
 *   POINT. Lot 0.9's carry-in item 2 has been open since the map became the
 *   primary input on three screens: the raster was approximated with a CSS
 *   `hue-rotate` on the whole canvas, which is a filter and not a palette — it
 *   moved every hue including the ones that meant something, and open
 *   question 9 (the violet Mediterranean) was its most visible symptom. A
 *   vector style has a colour per feature, so there is nothing to approximate.
 */

/**
 * ★ NOT "THE CHARTER'S GREENS", AND THIS IS A CORRECTION TO THE WRITTEN BRIEF.
 *
 * ETAT's PMTiles brief — written before G17 — says the map can finally be
 * themed in the charter's greens. **G17 (2026-08-18) retired the charter
 * palette**: the identity is now a neutral blue-grey with a single
 * professional blue accent. Following the brief literally today would be
 * actively wrong, and not by a matter of taste:
 *
 *   `--zone-boundary` (#1E7A4F) and `--zone-grazing` (#2FA372) are GREEN, and
 *   `--marker-farm` (#175E3B) is green, because green is what a farm's ground
 *   means on this map. **A green basemap would put the zones on top of their
 *   own colour** and the one thing the coordinator is looking at would stop
 *   being findable.
 *
 * So the basemap is deliberately QUIET: the app's surface tones for land, its
 * border greys for roads, its ink for labels. Everything saturated on screen
 * then belongs to the programme — a zone, a marker, a threat — and not to the
 * ground it sits on. That is the same reasoning `--map-filter`'s heavy
 * desaturation was reaching for with a blunt instrument.
 */

/** Read a `--token` off `:root` as an `rgb()` string MapLibre can parse. */
function token(name: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  // The tokens are space-separated triplets ("243 244 246") so they can be
  // used with `/ <alpha>` in Tailwind. MapLibre wants a real colour string.
  if (raw === '') return alpha === undefined ? '#000000' : 'rgba(0,0,0,0)'
  return alpha === undefined ? `rgb(${raw})` : `rgb(${raw} / ${alpha})`
}

/**
 * The app's palette, expressed in Protomaps' ~80-key vocabulary.
 *
 * Built by SPREADING the named base theme and overriding what is visible in
 * the southern Negev, rather than by writing eighty literals: the keys left
 * inherited are glaciers, zoos, aerodromes and piers, and inventing token
 * values for them would be eighty chances to be wrong about something nobody
 * will ever see. Every key that DOES show is below, and every value is a
 * token — so `bun run contrast`'s palette is the map's palette.
 */
function themeFromTokens(resolved: 'light' | 'dark'): Theme {
  const base = namedTheme(resolved)

  const surfaceBase = token('--surface-base')
  const surfaceHigh = token('--surface-high')
  const surfaceSunken = token('--surface-sunken')
  const borderSubtle = token('--border-subtle')
  const borderStrong = token('--border-strong')
  const textSecondary = token('--text-secondary')
  const textMuted = token('--text-muted')

  /**
   * WATER IS THE ONE PLACE A HUE IS SPENT, and it is spent carefully.
   *
   * It must not be `--accent`: the accent is what a MARKER is, and a
   * Mediterranean in marker-blue is the same mistake as a green basemap. It is
   * the accent taken most of the way to the page's own surface — enough blue
   * to read as water at a glance, not enough to compete with anything the
   * programme drew. This is also the honest answer to open question 9: the
   * violet Mediterranean was `hue-rotate` acting on a raster, and there is no
   * filter here to produce it.
   */
  const water = token('--accent', 0.28)

  return {
    ...base,

    // --- Ground -----------------------------------------------------------
    background: surfaceBase,
    earth: surfaceBase,
    // The Negev IS sand and scrub; these three are most of what is on screen
    // south of Beersheba, so they are a hair off the page rather than a
    // colour, or the whole map becomes a texture.
    sand: surfaceHigh,
    scrub_a: surfaceHigh,
    scrub_b: surfaceHigh,
    beach: surfaceHigh,
    park_a: surfaceHigh,
    park_b: surfaceHigh,
    wood_a: surfaceHigh,
    wood_b: surfaceHigh,
    pedestrian: surfaceHigh,
    industrial: surfaceHigh,
    school: surfaceHigh,
    hospital: surfaceHigh,
    military: surfaceHigh,
    zoo: surfaceHigh,
    aerodrome: surfaceHigh,

    water,

    // Buildings: present, never prominent. A moshav read as a grey texture is
    // right; a moshav read as a field of shapes competes with its own zone.
    buildings: surfaceSunken,

    // --- Roads ------------------------------------------------------------
    // Casings from the STRONG border, fills from the subtle one: that is the
    // same two-step the app uses to separate a field from its page, and it is
    // what makes a track legible without giving it a colour.
    other: borderSubtle,
    minor_service: borderSubtle,
    minor_a: borderSubtle,
    minor_b: borderSubtle,
    link: borderSubtle,
    major: borderStrong,
    highway: borderStrong,
    railway: borderStrong,
    pier: borderSubtle,

    minor_service_casing: surfaceBase,
    minor_casing: surfaceBase,
    link_casing: surfaceBase,
    major_casing_early: surfaceBase,
    major_casing_late: surfaceBase,
    highway_casing_early: surfaceBase,
    highway_casing_late: surfaceBase,

    tunnel_other: borderSubtle,
    tunnel_minor: borderSubtle,
    tunnel_link: borderSubtle,
    tunnel_major: borderStrong,
    tunnel_highway: borderStrong,
    tunnel_other_casing: surfaceBase,
    tunnel_minor_casing: surfaceBase,
    tunnel_link_casing: surfaceBase,
    tunnel_major_casing: surfaceBase,
    tunnel_highway_casing: surfaceBase,

    bridges_other: borderSubtle,
    bridges_minor: borderSubtle,
    bridges_link: borderSubtle,
    bridges_major: borderStrong,
    bridges_highway: borderStrong,
    bridges_other_casing: surfaceBase,
    bridges_minor_casing: surfaceBase,
    bridges_link_casing: surfaceBase,
    bridges_major_casing: surfaceBase,
    bridges_highway_casing: surfaceBase,

    // --- Boundaries -------------------------------------------------------
    // ⚠️ NOT a zone colour. `--zone-boundary` means "the edge of a farm we
    // work with"; this is an administrative line on the ground and it must not
    // be mistakable for one at a glance.
    boundaries: borderStrong,

    // --- Labels -----------------------------------------------------------
    // The app's own ink, with the page as the halo — which is what makes a
    // place name readable over sand AND over water without a second palette.
    country_label: textMuted,
    state_label: textMuted,
    state_label_halo: surfaceBase,
    city_label: textSecondary,
    city_label_halo: surfaceBase,
    subplace_label: textMuted,
    subplace_label_halo: surfaceBase,
    roads_label_major: textMuted,
    roads_label_major_halo: surfaceBase,
    roads_label_minor: textMuted,
    roads_label_minor_halo: surfaceBase,
    address_label: textMuted,
    address_label_halo: surfaceBase,
    ocean_label: textMuted,
    waterway_label: textMuted,
    peak_label: textMuted,
  }
}

/**
 * WHICH PALETTE IS ON SCREEN RIGHT NOW.
 *
 * Read off `<html>` rather than taken from React, deliberately: `theme.tsx`
 * stamps `data-theme` and the "system" choice stamps NOTHING, leaving the
 * media query in `tokens.css` to decide. So the DOM is the one place that
 * knows the RESOLVED answer in all three cases, and it is also the thing
 * `token()` above is reading its values through — asking two different sources
 * is how a map ends up half in one palette.
 */
export function resolvedThemeOf(): 'light' | 'dark' {
  const explicit = document.documentElement.getAttribute('data-theme')
  if (explicit === 'light' || explicit === 'dark') return explicit
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/**
 * SELF-HOSTED GLYPHS, SPRITES AND THE RTL PLUGIN — `public/basemap-assets/`.
 *
 * ★ A BASEMAP THAT NEEDS A CDN IS NOT AN OFFLINE BASEMAP, AND THE FIRST
 *   WORKING VERSION OF THIS UNIT QUIETLY WAS ONE. The style rendered
 *   beautifully and made **nine requests to `protomaps.github.io`** — two
 *   sprite files and seven glyph ranges — which criterion B3 would have failed
 *   on the first farm track, after the 42 MB archive had been downloaded
 *   precisely so it would not. Caught by watching the network rather than by
 *   looking at the map, which is the only way this kind of defect is ever
 *   caught.
 *
 *   Vendored: both sprite sheets, and FIVE glyph ranges per weight rather than
 *   the three the first viewport happened to ask for — Latin (0-255),
 *   Latin-ext (256-511), **Hebrew (1280-1535)**, **Arabic (1536-1791)** and
 *   general punctuation (8192-8447). The two in bold are the point: this is a
 *   map of the northern Negev, and panning it crosses Hebrew and Arabic place
 *   names constantly. Fetching a missing range is exactly the request that
 *   cannot happen at 02:00. 1.2 MB for all of it, in the same `public/` where
 *   G17 already self-hosts the app's own OFL faces and for the same stated
 *   reason.
 *
 * ★ AND THE RTL PLUGIN, WITHOUT WHICH HEBREW LABELS RENDER BACKWARDS.
 *   MapLibre does not shape right-to-left text on its own; it delegates to a
 *   plugin, and a Hebrew basemap in a Hebrew app without one prints every
 *   place name reversed. `@mapbox/mapbox-gl-rtl-text` is vendored next to the
 *   glyphs rather than loaded from unpkg for the same reason they are.
 */
function assetUrl(path: string): string {
  // ★ THE BASE IS RESOLVED, THE PATH IS CONCATENATED, AND THAT SPLIT IS NOT
  //   STYLE. Resolving the whole thing through `new URL()` percent-encodes the
  //   braces in `{fontstack}` and `{range}` — MapLibre then rejects the style
  //   with `"glyphs" url must include a "{fontstack}" token`, which is what the
  //   first attempt did. Only the DIRECTORY goes through the URL constructor,
  //   so the deployed sub-path (`/lo-yanum/`) and the hash router are both
  //   handled while MapLibre's own placeholders survive verbatim.
  return new URL('basemap-assets/', document.baseURI).toString() + path
}

/**
 * Register the `pmtiles://` protocol with MapLibre, once per page.
 *
 * MapLibre resolves a source URL through whatever handler is registered for
 * its scheme; `pmtiles://` is how the archive's range reads are turned into
 * tile responses. Registering twice throws, and React's dev-mode double mount
 * makes that a real possibility rather than a theoretical one.
 */
let registered = false

export function registerPmtilesProtocol(): void {
  if (registered) return
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)

  // Same "once per page" contract, same reason: MapLibre throws if the RTL
  // plugin is set twice, and this module is imported by seven screens.
  // `false` is the lazy flag — the plugin is fetched immediately rather than
  // on the first RTL label, because on this map the first label IS RTL.
  try {
    maplibregl.setRTLTextPlugin(assetUrl('mapbox-gl-rtl-text.js'), false)
  } catch {
    // Already set by a previous mount in React's dev double-render. Labels are
    // shaped either way; this is not worth failing a map over.
  }

  registered = true
}

/**
 * WHERE THE ARCHIVE LIVES — A CONSTANT, NOT AN ENVIRONMENT VARIABLE, AND THE
 * REASON IS THAT EVERY BROWSER GATE RUNS IN DEMO MODE.
 *
 * `mapfirst`, `splitter`, `touch`, `wizard`, `layout` and `screenshots` all
 * drive the map through `bun run dev`, which reads NO env file at all — that
 * is the whole of `.env.example`'s warning about why the real config is called
 * `.env.real`. Deriving this from `VITE_SUPABASE_URL` would therefore leave
 * every one of those gates testing a basemap the app no longer ships, and the
 * vector style would be exercised for the first time in production.
 *
 * A committed `.env` was the other candidate and is worse: `.gitignore` keeps
 * `.env` out precisely so that nobody can put the Supabase pair in it and flip
 * demo mode into real by accident. Un-ignoring it to carry ONE public URL
 * re-opens that door for the next person.
 *
 * ★ THE VALUE IS PUBLIC BY CONSTRUCTION, not by concession: it addresses a
 *   PUBLIC bucket holding a map of southern Israel cut from OpenStreetMap's
 *   own planet. There is no key in it and nothing behind it.
 *
 * ⚠️ ONE CONSEQUENCE, AND IT HAD TO BE PAID SOMEWHERE. The project ref now
 *   appears in the DEMO bundle too, so "the bundle contains the project ref"
 *   has stopped being a proof that a deployed build is the REAL one. ETAT's
 *   deploy check moved to the publishable key (`sb_publishable_…`), which only
 *   a real build ever carries — a strictly better proxy, and one this cannot
 *   weaken.
 *
 * The key carries the OSM build date it was cut from, so replacing the map is
 * a NEW URL rather than an overwrite. That matters more than usual here: the
 * free tier serves `cache-control: no-cache` whatever is stored on the object
 * (measured 2026-08-31), so a versioned name is what lets the service worker
 * hold one archive indefinitely and drop it only when the name changes.
 */
/**
 * ⚠️⚠️ THE `.png` SUFFIX IS LOAD-BEARING. IT IS NOT A TYPO, IT IS NOT A
 *      LEFTOVER, AND REMOVING IT PUTS HOLES BACK IN THE MAP (§29).
 *
 * The bytes are a PMTiles archive. The name ends `.png` because that is the
 * only lever GitHub Pages gives us over a response header, and one response
 * header was silently destroying every tile the app read over the network.
 *
 * ★ WHAT WAS MEASURED, 2026-09-01, on the live site.
 *
 *   Pages sits behind Fastly, and Fastly gzips by CONTENT-TYPE. An unknown
 *   extension — `.pmtiles` — is served `application/octet-stream`, and that
 *   type IS on the compress list:
 *
 *     Accept-Encoding: identity  →  200, content-length: 94268129
 *     Accept-Encoding: gzip      →  200, content-encoding: gzip,
 *                                        content-length: 93926002
 *
 *   A browser ALWAYS sends the second one — `Accept-Encoding` is a forbidden
 *   header name in `fetch`, so neither the page nor the service worker can ask
 *   for `identity`. And the killer is what happens to a RANGE:
 *
 *     Range: bytes=64777443-64856698  (the Jerusalem z14 tile, exactly)
 *     →  206  content-range: bytes 64777443-64856698/93926002   ← /93926002
 *     →  body = a slice of the GZIP STREAM, not of the archive
 *     →  the client tries to gunzip a fragment that is not a gzip member
 *     →  "incorrect header check" — the tile never arrives.
 *
 *   The denominator is the giveaway: the range is applied to the COMPRESSED
 *   object. PMTiles computes every offset against the UNCOMPRESSED file, so
 *   every read after the first is aimed at the wrong bytes.
 *
 * ★ WHY THE MAP LOOKED *ALMOST* RIGHT, which is what made this so hard to see.
 *   The one range that survives is the one starting at byte 0 — a truncated
 *   gzip stream still decodes from its own start — and bytes 0…16383 are
 *   exactly the header, the root directory and the metadata. So the archive
 *   identified itself correctly, the app named the right file, every curl run
 *   from a terminal passed (curl sends NO `Accept-Encoding` unless asked), and
 *   the deep zooms — whose tiles live at high offsets — came back empty.
 *   Jerusalem blank at z14 and drawn at z11 is not a corrupt archive; it is
 *   this, and only this.
 *
 * ★ WHY `.png` AND NOT SOMETHING HONEST. Measured on this same host, same day:
 *
 *     image/png        not compressed   ← chosen
 *     font/woff2       not compressed
 *     application/pdf  not compressed
 *     application/octet-stream   COMPRESSED
 *     text (any), javascript, json, svg+xml        COMPRESSED
 *
 *   Pages offers no `_headers` file, no `.htaccess` and no per-file
 *   configuration: the extension IS the content-type, and the content-type IS
 *   the compression decision. Of the three that work, `.png` is the one every
 *   proxy and CDN on earth already knows to leave alone. The archive keeps its
 *   real name in front of the suffix so that nothing about it is hidden — the
 *   הגדרות screen prints `israel-20260831-z14.pmtiles.png` verbatim, and that
 *   string is the truth about what is served.
 *
 * ⚠️ THE RELEASE ASSET KEEPS THE PLAIN `.pmtiles` NAME. Only the object served
 *    by Pages needs the suffix; `deploy.yml` renames it while staging. Nothing
 *    has to be re-uploaded, and the stored bytes are untouched — verified
 *    sha256-identical, served vs. local: c7265232b57eb2d6…
 *
 * The rest of the name is untouched, so the versioning rule above still holds.
 */
export const BASEMAP_KEY = 'israel-20260831-z14.pmtiles.png'

/**
 * ★ THE ARCHIVE IS SERVED FROM THE APP'S OWN ORIGIN, AND THAT IS A MEASUREMENT
 *   RATHER THAN A PREFERENCE (§27, §28).
 *
 *   It lived in a public Supabase bucket until 2026-09-01, and it could not go
 *   on living there: `lo-yanum-prod` refuses any upload over **52 428 800 bytes
 *   (50 MiB)** and the national cut is **94 268 129**. Bounded to the byte —
 *   a TUS create declaring exactly 50 MiB is refused on AUTHORISATION (403),
 *   one byte more is refused on SIZE (413), before it even looks at who is
 *   asking. So no token and no password could ever have uploaded it. That is
 *   why four reports in a row promised a national map and shipped the Negev:
 *   the act everyone was waiting on was impossible, not merely pending.
 *
 *   GitHub Pages hosts it instead, next to the app. Measured on the live site:
 *   a `Range` request comes back `206` with `accept-ranges: bytes` and
 *   `access-control-allow-origin: *` — the complete list of what PMTiles needs.
 *   The 94 MB never enters git: the deploy workflow pulls it from a release
 *   asset into `public/basemap/` before `vite build`, and Vite copies it into
 *   `dist/`. `.gitignore` keeps the working copy out for the same reason.
 *
 * ⚠️ A RELEASE ASSET CANNOT BE THE URL THE BROWSER USES, AND IT WAS TRIED.
 *   `…/releases/download/…` serves the right 94 268 129 bytes and answers a
 *   range with 206, but it sends NO `access-control-allow-origin`, so a
 *   cross-origin PMTiles read from the page fails. Same origin removes the
 *   question entirely. The release is STORAGE; Pages is the HOST.
 *
 * ★ RESOLVED AGAINST `document.baseURI`, exactly like `assetUrl` above and for
 *   the same two reasons: the deployed sub-path (`/lo-yanum/`) and the hash
 *   router. No braces here, so the whole thing can go through `new URL()`.
 */
const DEFAULT_BASEMAP_URL =
  typeof document === 'undefined'
    ? `./basemap/${BASEMAP_KEY}`
    : new URL(`basemap/${BASEMAP_KEY}`, document.baseURI).toString()

/** Overridable for a re-cut archive or a local file, defaulted for the gates. */
export const BASEMAP_URL: string =
  import.meta.env.VITE_BASEMAP_URL || DEFAULT_BASEMAP_URL

/**
 * The style, for one theme.
 *
 * `lang: 'he'` asks Protomaps for the Hebrew name where the tiles carry one
 * and falls back to the local name where they do not — which is the right
 * behaviour for a Hebrew app in Israel either way: a Negev place with no
 * `name:he` is labelled in Hebrew on the ground too.
 */
/**
 * Every file the STYLE needs, for the service worker to hold alongside the
 * archive.
 *
 * ★ BOTH SPRITE SHEETS AND EVERY GLYPH RANGE, not the ones this session
 *   happens to have loaded. The coordinator who downloads the map in daylight
 *   is the coordinator who opens it at 02:00 in the dark theme, and a sprite
 *   sheet fetched lazily is a sprite sheet fetched never. 1.2 MB on top of a
 *   40 MB archive is not a trade worth thinking about twice.
 *
 * Listed here rather than in `sw.js` because the style is built here: the
 * worker cannot know which fontstacks Protomaps asked for without parsing the
 * layers, and a hand-kept copy in a second file is a list that goes stale.
 */
export function basemapAssets(): string[] {
  const stacks = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic']
  const ranges = ['0-255', '256-511', '1280-1535', '1536-1791', '8192-8447']
  const out = [
    assetUrl('mapbox-gl-rtl-text.js'),
    assetUrl('sprites/light.json'),
    assetUrl('sprites/light.png'),
    assetUrl('sprites/dark.json'),
    assetUrl('sprites/dark.png'),
  ]
  for (const stack of stacks) {
    for (const range of ranges) {
      out.push(assetUrl(`fonts/${encodeURIComponent(stack)}/${range}.pbf`))
    }
  }
  return out
}

export function buildBasemapStyle(resolved: 'light' | 'dark'): StyleSpecification {
  return {
    version: 8,
    // Protomaps' layer specs reference sprites and glyphs by these names; both
    // are served by Protomaps' own CDN and are a few kB, unlike the tiles.
    glyphs: assetUrl('fonts/{fontstack}/{range}.pbf'),
    // The sprite sheet follows the palette: Protomaps ships a light and a dark
    // set, and its shields and pictograms are drawn for the ground under them.
    sprite: assetUrl(`sprites/${resolved}`),
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${BASEMAP_URL}`,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: layersWithCustomTheme('protomaps', themeFromTokens(resolved), 'he'),
  }
}
