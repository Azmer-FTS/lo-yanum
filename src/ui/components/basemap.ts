import { Protocol } from 'pmtiles'
import maplibregl from 'maplibre-gl'
import { layersWithCustomTheme, namedTheme } from 'protomaps-themes-base'
import type { Theme } from 'protomaps-themes-base'
import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl'

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A. THE STATE BORDERS — PO REQUEST, 2026-09-01
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Protomaps ships exactly two boundary layers and both are whispers: 0.7 px
 * for a national border, 0.4 px for everything below it, both in the same grey
 * as a service road, both dashed the same way. On a map where the operator is
 * looking for a farm, a border drawn like a driveway is a border he does not
 * see — which is what the product owner reported.
 *
 * ★ WHAT THE ARCHIVE ACTUALLY CARRIES, decoded from the tiles rather than
 *   assumed from the schema docs (Jerusalem, the Jordan valley and the
 *   southern line, z8 → z14):
 *
 *     kind         "country" | "region" | "county" | "locality"
 *     kind_detail  2 | 4 | 5 | 6 | 8        (the OSM admin_level)
 *     disputed     true, and ONLY on some of them
 *     sort_rank    288 on the disputed ones, 289 otherwise
 *
 *   `disputed: true` is present, at kind_detail 2 AND 5, at every zoom from 8
 *   to 14. That is the fact this design rests on: the distinction the product
 *   owner asked for is IN THE DATA, so it does not have to be invented, drawn
 *   by hand, or approximated by geography.
 *
 * ★ SO THE LINES SAY THREE DIFFERENT THINGS, and they say them the way OSM's
 *   own rendering does, because that is the vocabulary anybody looking at this
 *   map has already learned:
 *
 *     settled international line   SOLID, the heaviest line on the basemap
 *     disputed / armistice line    DASHED, same weight — equal in importance,
 *                                  explicitly not equal in status
 *     region / county / locality   thin, finely dotted, quiet
 *
 * ★ AND EVERY ONE OF THEM IS DRAWN ON ITS OWN HALO. MapLibre has no line halo,
 *   so it is a second, wider line underneath in the page's own surface colour.
 *   It is not decoration: without it a grey border crossing the Mediterranean,
 *   a built-up area and open sand changes contrast three times along its
 *   length, and it is exactly the stretches where it disappears that somebody
 *   needs to read. The halo is what makes ONE line weight work everywhere.
 *   Each line gets its own so that a dash stays a dash — see `haloDash`.
 *
 * ⚠️ THE COLOUR IS INK, NEVER A ZONE COLOUR, AND THAT IS THE SAME RULE AS THE
 *    REST OF THIS FILE. `--zone-boundary` means "the edge of a farm we work
 *    with". An administrative line is a different kind of statement and must
 *    not be mistakable for one at a glance — so it is `--text-secondary`, the
 *    app's ink: unmistakably darker than any road, and carrying no hue that
 *    could be read as programme data. The product owner's own drawings stay
 *    the only saturated things on the map, and they are still painted ON TOP
 *    of all of this by `installProgrammeLayers`.
 */

/** The three kinds of line, and the one halo they all sit on. */
function boundaryLayers(mode: 'vector' | 'imagery'): LayerSpecification[] {
  /**
   * Over the vector map: ink on the page. Over imagery: white on black, which
   * is the only pair that survives an orchard, a rooftop and bare rock in the
   * same frame.
   */
  const ink = mode === 'imagery' ? 'rgb(255 255 255 / 0.95)' : token('--text-secondary', 0.9)
  const quiet = mode === 'imagery' ? 'rgb(255 255 255 / 0.6)' : token('--text-muted', 0.65)
  const halo = mode === 'imagery' ? 'rgb(0 0 0 / 0.55)' : token('--surface-base', 0.75)

  /** One ramp for every boundary line, so weight means the same thing at every zoom. */
  const width = (scale: number): ExpressionSpecification =>
    [
      'interpolate',
      ['linear'],
      ['zoom'],
      4,
      1.0 * scale,
      8,
      1.7 * scale,
      12,
      2.6 * scale,
      16,
      3.4 * scale,
    ] as ExpressionSpecification

  /**
   * ⚠️ A DASH ARRAY IS IN LINE-WIDTHS, NOT PIXELS, so a pattern written for a
   *    2.6 px line becomes a different pattern on a 1.2 px one. The two below
   *    are therefore written against their own weights: the disputed line
   *    reads as a long dash with a clear gap at every zoom, and the regional
   *    one as a fine dot that never competes with it.
   */
  const disputedDash = [2.2, 1.4]
  const regionalDash = [1.2, 1.6]

  /**
   * ★★ THE HALO UNDER A DASHED LINE MUST BE DASHED TOO, AND IT WAS NOT — the
   *    first version of this drew ONE solid halo under all three kinds, and
   *    over the satellite imagery that turned the armistice line into a SOLID
   *    BLACK line with white dashes cut into it. The gaps in a dash are meant
   *    to show the ground; a solid halo fills them with the halo's own colour,
   *    which inverts exactly the distinction the dash exists to make. Caught by
   *    looking at the capture, which is the only way this kind of thing is ever
   *    caught.
   *
   * ⚠️ AND THE PATTERN HAS TO BE RESCALED, because a dash array is measured in
   *    LINE-WIDTHS. A halo 1.9× wider carrying the same numbers would draw
   *    dashes 1.9× longer and gaps 1.9× wider, so the two would drift apart
   *    along the line. Dividing by the same factor makes the halo's dashes land
   *    exactly on the line's.
   */
  const HALO = 1.9
  const haloDash = (dash: number[]): number[] => dash.map((d) => d / HALO)

  const country: ExpressionSpecification = ['<=', ['get', 'kind_detail'], 2]
  const isDisputed: ExpressionSpecification = ['==', ['get', 'disputed'], true]
  const regional: FilterSpecification = ['>', ['get', 'kind_detail'], 2] as FilterSpecification
  const settled: FilterSpecification = ['all', country, ['!', isDisputed]] as FilterSpecification
  const armistice: FilterSpecification = [
    'all',
    ['<=', ['get', 'kind_detail'], 5],
    isDisputed,
  ] as FilterSpecification

  return [
    // ---- region, county, locality: present, quiet, never a state ---------
    {
      id: 'lo-boundaries-regional-halo',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'boundaries',
      filter: regional,
      paint: {
        'line-color': halo,
        'line-width': width(0.45 * HALO),
        'line-dasharray': haloDash(regionalDash),
        'line-opacity': 0.7,
      },
    } as LayerSpecification,
    {
      id: 'lo-boundaries-regional',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'boundaries',
      filter: regional,
      paint: {
        'line-color': quiet,
        'line-width': width(0.45),
        'line-dasharray': regionalDash,
      },
    } as LayerSpecification,

    // ---- the settled international line ----------------------------------
    // ★ SOLID, and the heaviest thing on the basemap. Nothing else drawn from
    //   OpenStreetMap is allowed to be wider.
    {
      id: 'lo-boundaries-country-halo',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'boundaries',
      filter: settled,
      paint: { 'line-color': halo, 'line-width': width(HALO) },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    } as LayerSpecification,
    {
      id: 'lo-boundaries-country',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'boundaries',
      filter: settled,
      paint: { 'line-color': ink, 'line-width': width(1) },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    } as LayerSpecification,

    // ---- the disputed / armistice line -----------------------------------
    // ★★ The SAME weight, deliberately, and a dash that cannot be confused
    //    with the regional dot. Equal importance, different status — the
    //    distinction the product owner asked for, and the one OSM's own
    //    rendering makes.
    {
      id: 'lo-boundaries-disputed-halo',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'boundaries',
      filter: armistice,
      paint: {
        'line-color': halo,
        'line-width': width(HALO),
        'line-dasharray': haloDash(disputedDash),
      },
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
    } as LayerSpecification,
    {
      id: 'lo-boundaries-disputed',
      type: 'line',
      source: 'protomaps',
      'source-layer': 'boundaries',
      filter: armistice,
      paint: {
        'line-color': ink,
        'line-width': width(1),
        'line-dasharray': disputedDash,
      },
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
    } as LayerSpecification,
  ]
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B. THE SATELLITE LAYER — PO REQUEST, 2026-09-01. ONLINE ONLY, BY DESIGN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️⚠️ WHICH PROVIDER, AND WHY IT IS NOT THE ONE IN THE BRIEF.
 *
 * The request named Esri's world imagery as an example AND said to verify the
 * conditions. Verified, 2026-09-01 — and the verification is the reason this
 * ships pointed somewhere else:
 *
 *   · `server.arcgisonline.com/.../World_Imagery` answers anonymously, sends
 *     `access-control-allow-origin: *`, and serves real sub-metre detail up to
 *     z17+. Technically it would work today, with one line.
 *   · Its own service metadata carries NO licence field — only
 *     `copyrightText`. Esri's published position is that the service is
 *     covered by their Terms of Use and requires an ArcGIS Online or
 *     Enterprise licence, and their community answers say plainly that it is
 *     not free and not for commercial use.
 *
 *   That is not a licence this project can grant itself on the product
 *   owner's behalf, so it is HIS decision and not a default. It is registered
 *   below, fully written, one word from being switched on.
 *
 * ★ WHAT SHIPS INSTEAD: EOX's Sentinel-2 cloudless. The 2016 mosaic is
 *   published under CC BY 4.0 — a real, named, permissive licence with one
 *   obligation, attribution, which is honoured in the source's own
 *   `attribution` string and therefore in MapLibre's attribution control. It
 *   answers anonymously and sends CORS for this exact origin (measured:
 *   `access-control-allow-origin: https://azmer-fts.github.io`).
 *
 * ⚠️ AND ITS ONE REAL LIMIT, STATED RATHER THAN HIDDEN: Sentinel-2 is 10 m per
 *    pixel. The service will answer a z17 request, but with 3.7 kB of
 *    upsampled blur against Esri's 24 kB of actual detail — measured, both, at
 *    the same tile. So the SOURCE is capped at `maxzoom: 14` and MapLibre
 *    upsamples visibly past it, which is the honest behaviour: the operator
 *    sees the imagery going soft instead of being shown invented sharpness.
 *    Orchards, wadis, bare ground, built-up edges and tracks all read at z13–14
 *    — which is the scale at which imagery answers "what is the ground like
 *    around this farm". For "what is in this yard", the answer is Esri's terms
 *    or a keyed provider, and that is a decision, not an oversight.
 */
export interface SatelliteProvider {
  id: string
  tiles: string[]
  /** Past this, MapLibre upsamples rather than requesting detail that is not there. */
  maxzoom: number
  /** Rendered by MapLibre's own attribution control. The licence obligation. */
  attribution: string
}

export const SATELLITE: SatelliteProvider = {
  id: 's2cloudless-2016',
  tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
  maxzoom: 14,
  attribution:
    '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by ' +
    '<a href="https://eox.at">EOX IT Services GmbH</a> ' +
    '(Contains modified Copernicus Sentinel data 2016) — CC BY 4.0',
}

/**
 * ⛔ NOT WIRED UP, AND THAT IS DELIBERATE. Swapping `SATELLITE` for this is a
 *    one-line change and it is the product owner's to make, because what it
 *    changes is not the code but which terms this app is operating under:
 *
 *      "Source: Esri, Vantor, Earthstar Geographics, and the GIS User
 *       Community" — sub-metre over most of Israel, z0–z23, anonymous, CORS
 *       open; and covered by Esri's Terms of Use, which state an ArcGIS
 *       licence is required and exclude commercial use.
 */
export const SATELLITE_ESRI: SatelliteProvider = {
  id: 'esri-world-imagery',
  tiles: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  maxzoom: 19,
  attribution:
    'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
}

/** Which ground is under the programme's own drawings. */
export type BasemapBase = 'vector' | 'satellite'

/**
 * The vector layers that stay ON TOP of the imagery, by id.
 *
 * ★ THE GROUND IS THE IMAGERY, SO EVERY LAYER THAT PAINTS GROUND IS DROPPED —
 *   earth, landcover, landuse, water, buildings and every road casing. What is
 *   left is the three things imagery cannot say on its own: where the roads
 *   go, what the places are called, and where the lines on the ground are.
 *
 * ⚠️ `pois` IS DELIBERATELY ABSENT. Over a flat page a POI pin is information;
 *    over aerial imagery it is a field of dots on top of a field of detail,
 *    and the markers the coordinator actually placed have to win that contest.
 */
const OVER_IMAGERY = new Set([
  'roads_other',
  'roads_link',
  'roads_minor_service',
  'roads_minor',
  'roads_major',
  'roads_highway',
  'roads_rail',
  'roads_bridges_major',
  'roads_bridges_highway',
  'roads_labels_minor',
  'roads_labels_major',
  'water_label_ocean',
  'water_label_lakes',
  'water_waterway_label',
  'places_subplace',
  'places_locality',
  'places_region',
  'places_country',
])

/**
 * The palette for labels and roads drawn OVER aerial imagery.
 *
 * ★ THIS IS NOT THE APP'S PALETTE AND MUST NOT BE. Every token in
 *   `themeFromTokens` is chosen against the app's own surface; imagery has no
 *   surface — it is orchard, rooftop, rock and shadow in the same frame, and
 *   the app's ink vanishes into all four. The only pair that survives is white
 *   text on a dark halo, which is what every aerial map on earth uses, and the
 *   reason is contrast rather than convention.
 *
 * ⚠️ AND IT IS THE SAME IN LIGHT AND DARK THEME, on purpose: the theme
 *    describes the app's chrome, not the photograph. A "light mode" satellite
 *    map with dark labels would be unreadable at exactly the moments a dark
 *    theme exists for.
 */
function imageryTheme(resolved: 'light' | 'dark'): Theme {
  const base = namedTheme(resolved)
  const label = 'rgb(255 255 255)'
  const labelHalo = 'rgb(0 0 0 / 0.85)'
  const road = 'rgb(255 255 255 / 0.55)'

  return {
    ...base,
    other: road,
    minor_service: road,
    minor_a: road,
    minor_b: road,
    link: road,
    major: 'rgb(255 255 255 / 0.75)',
    highway: 'rgb(255 244 214 / 0.85)',
    railway: 'rgb(255 255 255 / 0.5)',
    bridges_major: 'rgb(255 255 255 / 0.75)',
    bridges_highway: 'rgb(255 244 214 / 0.85)',

    country_label: label,
    state_label: label,
    state_label_halo: labelHalo,
    city_label: label,
    city_label_halo: labelHalo,
    subplace_label: 'rgb(255 255 255 / 0.9)',
    subplace_label_halo: labelHalo,
    roads_label_major: label,
    roads_label_major_halo: labelHalo,
    roads_label_minor: 'rgb(255 255 255 / 0.85)',
    roads_label_minor_halo: labelHalo,
    ocean_label: 'rgb(255 255 255 / 0.9)',
    waterway_label: 'rgb(255 255 255 / 0.9)',
  }
}

/**
 * The style, for one theme and one ground.
 *
 * ★ THE PMTILES SOURCE IS DECLARED IN BOTH CASES, and that is not waste: the
 *   satellite view keeps its roads, its names and its borders from the same
 *   archive, so the layer that says WHERE YOU ARE keeps working when the
 *   imagery is slow, and the switch back to `'vector'` needs nothing fetched.
 */
export function buildBasemapStyle(
  resolved: 'light' | 'dark',
  base: BasemapBase = 'vector',
): StyleSpecification {
  const common = {
    version: 8 as const,
    // Protomaps' layer specs reference sprites and glyphs by these names; both
    // are served by Protomaps' own CDN and are a few kB, unlike the tiles.
    glyphs: assetUrl('fonts/{fontstack}/{range}.pbf'),
    // The sprite sheet follows the palette: Protomaps ships a light and a dark
    // set, and its shields and pictograms are drawn for the ground under them.
    sprite: assetUrl(`sprites/${resolved}`),
  }

  const protomaps = {
    type: 'vector' as const,
    url: `pmtiles://${BASEMAP_URL}`,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }

  if (base === 'satellite') {
    const over = layersWithCustomTheme(
      'protomaps',
      imageryTheme(resolved),
      'he',
    ).filter((l) => OVER_IMAGERY.has(l.id))

    /**
     * The borders go BETWEEN the roads and the labels, exactly as they do on
     * the vector map — a name has to stay on top of the line it belongs to.
     */
    const firstLabel = over.findIndex((l) => l.type === 'symbol')
    const cut = firstLabel === -1 ? over.length : firstLabel

    return {
      ...common,
      sources: {
        protomaps,
        satellite: {
          type: 'raster',
          tiles: SATELLITE.tiles,
          tileSize: 256,
          maxzoom: SATELLITE.maxzoom,
          attribution: SATELLITE.attribution,
        },
      },
      layers: [
        { id: 'satellite', type: 'raster', source: 'satellite' } as LayerSpecification,
        ...over.slice(0, cut),
        ...boundaryLayers('imagery'),
        ...over.slice(cut),
      ],
    }
  }

  const layers = layersWithCustomTheme('protomaps', themeFromTokens(resolved), 'he')

  /**
   * ★ PROTOMAPS' OWN TWO BOUNDARY LAYERS ARE REPLACED IN PLACE, not hidden and
   *   not appended. Appending would put a national border on top of every
   *   label on the map; hiding them and adding elsewhere would leave two dead
   *   ids for the next person to wonder about. The index they occupied is the
   *   right index — between the roads and the bridges — so that is where the
   *   four new ones go.
   */
  const at = layers.findIndex((l) => l.id === 'boundaries_country')
  const kept = layers.filter((l) => l.id !== 'boundaries_country' && l.id !== 'boundaries')
  const insert = at === -1 ? kept.length : at

  return {
    ...common,
    sources: { protomaps },
    layers: [
      ...kept.slice(0, insert),
      ...boundaryLayers('vector'),
      ...kept.slice(insert),
    ],
  }
}
