/* eslint-disable no-restricted-globals */
/**
 * P2.5a — THE SERVICE WORKER.
 *
 * Hand-written, no Workbox, no build plugin. The rules below are short enough
 * to read in one sitting, and a generated 40 kB runtime whose behaviour has to
 * be inferred from a config object is the wrong trade for a tool that has to be
 * debugged on a farm track at 02:00.
 *
 * ★ THE ONE RULE THAT MATTERS MOST IS A RULE ABOUT NOT CACHING.
 *   Nothing from the Supabase origin is ever cached — not a REST read, not an
 *   auth token refresh, not a signed URL. A cached REST response is a stale
 *   answer to a question about tonight; a cached auth response is somebody
 *   else's session on a shared iPad. The offline story for DATA is the
 *   IndexedDB cache and the write outbox in P2.5b, which know about identity
 *   and about last-write-wins. A service worker knows about neither, so it
 *   stays out.
 *
 * WHAT IS CACHED, AND WHY EACH RULE IS THE ONE IT IS:
 *
 *   navigations      NETWORK FIRST, cached copy as the fallback. A deploy must
 *                    be picked up on the next online load — an app shell
 *                    frozen by a cache-first rule is the classic way a PWA
 *                    ships a bug that outlives its fix.
 *   /assets/*        CACHE FIRST. Vite content-hashes these, so a given URL's
 *                    bytes never change; revalidating them is pure latency.
 *   fonts, icon,     CACHE FIRST, same reasoning — and the fonts especially:
 *   manifest         Hebrew rendered in a fallback face is a different app.
 *   map tiles        CACHE FIRST, and what is fetched is kept. This is a
 *                    BROWSING cache: it holds the ground the coordinator has
 *                    actually looked at. See the note on bulk pre-fetching in
 *                    ETAT — it is a policy question, not a technical one.
 *   Supabase         NEVER. See above.
 *
 * The frozen /poc lives under this scope too and is therefore made to work
 * offline by the same rules, which is a small bonus and no extra code: its
 * assets are content-hashed exactly like the app's.
 */

const VERSION = 'v2'
const SHELL_CACHE = `lo-yanum-shell-${VERSION}`

/**
 * PMTILES (decision 71) — THE BASEMAP HAS ITS OWN CACHE, AND ITS OWN RULES.
 *
 * The raster tile cache this replaces held up to four thousand small opaque
 * responses and was a BROWSING cache: it kept the ground the coordinator had
 * happened to look at, which is a promise nobody could state precisely. This
 * holds **one file**, its name carries the OSM build date it was cut from, and
 * either the archive is there or it is not. That is a promise a settings
 * screen can make and a coordinator can check before he drives.
 *
 * It is kept OUT of `KEEP`-by-version on purpose — see `activate` below.
 */
const MAP_CACHE = 'lo-yanum-basemap'
const KEEP = new Set([SHELL_CACHE, MAP_CACHE])

self.addEventListener('install', (event) => {
  // Take over as soon as possible: the first visit is the one that populates
  // the cache, and waiting for every tab to close would postpone that to the
  // second one — which on a field device may be days later, offline.
  self.skipWaiting()
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // `./` rather than a list of hashed filenames: those are only known at
      // build time, and generating a precache manifest would mean a post-build
      // step whose output nobody reads. Everything else is picked up by the
      // fetch handler on the first online load.
      cache.add(new Request('./', { cache: 'reload' })).catch(() => undefined),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (!KEEP.has(key)) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

/**
 * ★ THE ONE THING ON `*.supabase.co` THAT IS AN ASSET AND NOT AN API.
 *
 * P2.5a's rule is absolute and `bun run offline` asserts it: **nothing from
 * the Supabase API is ever cached**, because a stale row about who is standing
 * where tonight is worse than no row. The basemap sits on the same host and is
 * the exact opposite kind of thing — a public, immutable, version-named file
 * of ground that does not change.
 *
 * So the exception is drawn as narrowly as it can be: the PUBLIC object path
 * of the `basemap` bucket, and nothing else. `/rest/v1/…`, `/auth/v1/…` and
 * every other bucket stay uncacheable, which keeps the gate's claim true.
 */
function isBasemap(url) {
  return (
    (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) &&
    url.pathname.includes('/storage/v1/object/public/basemap/')
  )
}

/**
 * Serve a byte range out of a cached FULL archive.
 *
 * ★ THE CACHE API CANNOT DO THIS FOR US, AND THAT IS THE WHOLE REASON THIS
 *   FUNCTION EXISTS. `cache.put()` REFUSES a 206 response outright, so the
 *   thousands of range requests PMTiles makes can never be stored one by one.
 *   The only workable shape is: hold ONE complete 200 response, and synthesise
 *   the 206s from it here.
 *
 * ★ AND IT SLICES A **BLOB**, NOT AN ArrayBuffer. `response.arrayBuffer()`
 *   would pull all 42 MB into the worker's memory on every tile request, on an
 *   iPad, several times a second. `blob.slice()` is lazy and stays backed by
 *   the browser's own storage, so what crosses into memory is the few KB
 *   actually asked for.
 */
async function sliceFromCache(full, rangeHeader) {
  const blob = await full.blob()
  const size = blob.size
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) return new Response(blob, { status: 200 })

  let start
  let end
  if (match[1] === '') {
    // `bytes=-N` — the LAST n bytes. PMTiles does not currently ask this way,
    // but a suffix range is valid HTTP and answering it wrongly would be a bug
    // that only appears on a library upgrade.
    const n = Number(match[2] || '0')
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return new Response(null, {
      status: 416,
      headers: { 'content-range': `bytes */${size}` },
    })
  }

  return new Response(blob.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(end - start + 1),
      'content-range': `bytes ${start}-${end}/${size}`,
      'accept-ranges': 'bytes',
    },
  })
}

/**
 * The basemap, held or not held.
 *
 * NOT cache-first-then-store: a range request cannot be stored (see above), so
 * browsing the map online never fills this cache by accident. The archive gets
 * here exactly one way — the coordinator taps "רענן מפות לא מקוונות" in
 * הגדרות and accepts the size. **That is the honest version of an offline
 * map**: he knows it happened, he chose when, and he can check.
 */
async function basemapResponse(request) {
  const cache = await caches.open(MAP_CACHE)
  const held = await cache.match(request.url)
  const range = request.headers.get('range')
  if (held) return range ? sliceFromCache(held, range) : held.clone()
  return fetch(request)
}

function isImmutableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.includes('/assets/') ||
      url.pathname.includes('/fonts/') ||
      // PMTILES — the vector style's glyphs, sprites and the RTL plugin.
      //
      // ★ THIS LINE IS WHY THE GATE EXISTS. Without it the archive was held
      //   offline and answered its range requests perfectly — and the map
      //   still drew NOTHING, because a MapLibre style cannot load without its
      //   sprite sheet. The glyph ranges happened to be covered by `/fonts/`
      //   above and the sprites by nothing at all, which is the most
      //   expensive kind of near-miss: every visible signal said the offline
      //   map worked.
      url.pathname.includes('/basemap-assets/') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.webmanifest') ||
      url.pathname.endsWith('/icon.svg'))
  )
}

/**
 * Supabase, and anything else that is an API rather than an asset.
 *
 * Matched on the host shape rather than on a build-time constant: the service
 * worker is a static file in `public/`, so it never sees `import.meta.env`.
 */
function isApi(url) {
  return url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  // Opaque responses (no-cors, which is what a tile from another origin is)
  // have status 0 and are still worth keeping; a real error is not.
  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // BEFORE `isApi`, and the order is the rule: the basemap lives on the same
  // host as the API and is the one path on it that may be held.
  if (isBasemap(url)) {
    event.respondWith(basemapResponse(request))
    return
  }

  if (isApi(url)) return // straight to the network, never cached

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE)
        try {
          const fresh = await fetch(request)
          if (fresh && fresh.ok) await cache.put(request, fresh.clone())
          return fresh
        } catch {
          // Offline. The exact document first — /poc/ must come back as /poc/
          // and not as the app's shell — then the scope root.
          const exact = await cache.match(request)
          if (exact) return exact
          const root = await cache.match('./')
          if (root) return root
          return new Response('offline', { status: 503 })
        }
      })(),
    )
  }
})

/**
 * The page asks; the worker answers. Used by the הגדרות screen to report how
 * much ground is held offline and to let the coordinator drop it.
 */
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data.type !== 'string') return
  const reply = (payload) => event.source?.postMessage({ type: data.type, ...payload })

  /**
   * PMTILES — WHAT THE הגדרות SCREEN ASKS, AND WHY IT ASKS IT IN THIS SHAPE.
   *
   * The old pair was `TILE_STATS` / `CLEAR_TILES` and answered a COUNT: "3 812
   * tiles held", which is a number nobody can act on — it does not say whether
   * the road to a particular farm is in it. One archive answers a better
   * question: held or not, and how many bytes.
   */
  if (data.type === 'MAP_STATS') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(MAP_CACHE)
        const keys = await cache.keys()
        if (keys.length === 0) {
          reply({ held: false, bytes: 0 })
          return
        }
        const held = await cache.match(keys[0])
        const blob = held ? await held.blob() : null
        reply({ held: true, bytes: blob ? blob.size : 0, url: keys[0].url })
      })(),
    )
  }

  /**
   * Download the whole archive, once, with progress.
   *
   * ★ IT REPORTS PROGRESS BY READING THE BODY ITSELF rather than by trusting
   *   `content-length` and a timer. 42 MB on a cellular connection at the edge
   *   of coverage is minutes, and a progress bar that is a guess is worse than
   *   none — the coordinator has to be able to tell "still going" from "stuck"
   *   before he starts driving.
   *
   * ★ AND IT CACHES A RECONSTRUCTED 200, not the streamed response: the body
   *   has already been consumed to count it, so what is stored is the bytes
   *   that were actually received. If the stream broke halfway, the length
   *   check below refuses to store a truncated archive — a half-file would
   *   pass `held: true` and then fail every range request in the field.
   */
  if (data.type === 'DOWNLOAD_MAP' && typeof data.url === 'string') {
    event.waitUntil(
      (async () => {
        try {
          const response = await fetch(data.url, { cache: 'reload' })
          if (!response.ok || !response.body) {
            reply({ ok: false, error: 'fetch' })
            return
          }
          const expected = Number(response.headers.get('content-length') || '0')
          const reader = response.body.getReader()
          const chunks = []
          let received = 0
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
            received += value.byteLength
            reply({ progress: received, total: expected })
          }
          if (expected > 0 && received !== expected) {
            reply({ ok: false, error: 'truncated', progress: received, total: expected })
            return
          }
          /**
           * ★ AND THE STYLE'S OWN ASSETS GO WITH IT, because "the map is
           *   downloaded" has to mean the map DRAWS. The archive is the
           *   geometry; the sprite sheet and the glyph ranges are how it
           *   becomes a picture, and a coordinator who tapped a button that
           *   said 40.6 MB does not then want to discover that the labels
           *   needed a network too.
           *
           *   The page sends the list rather than the worker guessing it: the
           *   style is built in `basemap.ts` and only it knows which sprite
           *   and which fontstacks this build asks for. Failures here are
           *   swallowed on purpose — a missing glyph range is a label in a
           *   fallback face, not a reason to fail a 40 MB download.
           */
          if (Array.isArray(data.assets)) {
            const shell = await caches.open(SHELL_CACHE)
            await Promise.all(
              data.assets.map((href) =>
                fetch(href)
                  .then((r) => (r.ok ? shell.put(href, r) : undefined))
                  .catch(() => undefined),
              ),
            )
          }

          const cache = await caches.open(MAP_CACHE)
          // One archive at a time: a re-cut map is a NEW url, and keeping the
          // old one would silently double the device's map storage.
          for (const key of await cache.keys()) await cache.delete(key)
          await cache.put(
            data.url,
            new Response(new Blob(chunks), {
              status: 200,
              headers: {
                'content-type': 'application/octet-stream',
                'content-length': String(received),
                'accept-ranges': 'bytes',
              },
            }),
          )
          reply({ ok: true, bytes: received })
        } catch {
          reply({ ok: false, error: 'network' })
        }
      })(),
    )
  }

  if (data.type === 'CLEAR_MAP') {
    event.waitUntil(
      (async () => {
        await caches.delete(MAP_CACHE)
        reply({ held: false, bytes: 0 })
      })(),
    )
  }
})
