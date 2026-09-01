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
    // ★ SAME ORIGIN FIRST, AND THIS BRANCH IS THE ONE THAT SHIPS (§28). The
    //   archive is served by GitHub Pages out of `basemap/` next to the app,
    //   because Supabase's free plan refuses any upload over 50 MiB and the
    //   national cut is 94.3 MB — measured, ETAT §27. Matched on the `.pmtiles`
    //   suffix under a `basemap/` directory rather than on a build-time
    //   constant, so a re-cut archive (a NEW name, by the naming rule) is held
    //   by a worker that shipped before it existed.
    //
    // ⚠️ `.pmtiles.png` IS THE SAME FILE AND THE SUFFIX IS DELIBERATE (§29).
    //    Pages gzips `application/octet-stream` and applies `Range` to the
    //    COMPRESSED object, which aims every PMTiles read at the wrong bytes;
    //    `image/png` is not compressed. Both spellings are matched so that a
    //    device still holding the un-suffixed archive keeps answering from
    //    cache instead of quietly going back to the network.
    //
    // ⚠️ IT MUST STAY AHEAD OF `isImmutableAsset`, WHICH IS WHY IT IS HERE AND
    //   NOT THERE. `cacheFirst` calls `cache.put()`, and `cache.put()` REFUSES
    //   a 206 outright — so routing the archive through the shell cache would
    //   fail every single range request PMTiles makes. The basemap needs the
    //   whole-archive-plus-slicing path in `basemapResponse`, and nothing else.
    (url.origin === self.location.origin &&
      /\/basemap\/[^/]+\.pmtiles(\.png)?$/.test(url.pathname)) ||
    // The previous home, kept so that a device still holding the Supabase-hosted
    // archive keeps answering from cache instead of silently going to network.
    ((url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) &&
      url.pathname.includes('/storage/v1/object/public/basemap/'))
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

/**
 * How much room there is, asked of the browser rather than assumed.
 *
 * ★ IT IS THE ONE FACT THAT DECIDES WHETHER A 94 MB ARCHIVE CAN LAND, and it
 *   was never asked before (PO return, 2026-09-01). Safari's quota is a
 *   fraction of free disk rather than a fixed number, so it differs between
 *   two iPads of the same model — which is precisely why guessing is wrong and
 *   why the settings screen now prints the answer.
 *
 * `estimate()` exists in a service worker as well as in a page. It returns
 * zeros where it is unimplemented, and every caller treats `quota === 0` as
 * "unknown, do not refuse on this basis".
 */
async function storageEstimate() {
  try {
    const estimate = await self.navigator?.storage?.estimate?.()
    return { usage: Number(estimate?.usage || 0), quota: Number(estimate?.quota || 0) }
  } catch {
    return { usage: 0, quota: 0 }
  }
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
        const room = await storageEstimate()
        if (keys.length === 0) {
          reply({
            held: false,
            bytes: 0,
            heldUrl: null,
            stale: false,
            usage: room.usage,
            quota: room.quota,
          })
          return
        }

        /**
         * ★★ "HELD" MEANS **THIS** ARCHIVE, NOT "SOME ARCHIVE" — AND THE
         *    DIFFERENCE IS A BUG THE PRODUCT OWNER FOUND ON A REAL iPAD.
         *
         *    This used to answer `held: true` for whatever happened to be in
         *    the cache. The archive's name carries the OSM build date, so a
         *    device that downloaded a previous cut keeps answering "held" with
         *    that cut's size — 42.6 MB of the old southern extract, reported
         *    on a screen whose own words say "the whole map of Israel". The
         *    screen was telling the truth about the cache and lying about the
         *    map, and no amount of re-tapping the button could show it: the
         *    page had no way to tell that the two names differed.
         *
         *    So the page now NAMES the archive this build asks for, and the
         *    worker answers about that one. `stale` is the case that matters:
         *    something is held, it is not what this build wants, and the
         *    coordinator has to be told rather than reassured.
         *
         *    A page that asks without a url — an older tab against a newer
         *    worker — still gets the old, looser answer.
         */
        const wanted =
          typeof data.url === 'string'
            ? new URL(data.url, self.location.href).href
            : null
        const match = wanted ? keys.find((key) => key.url === wanted) : keys[0]
        const entry = match || keys[0]
        const stored = await cache.match(entry)
        const blob = stored ? await stored.blob() : null
        reply({
          held: Boolean(match),
          bytes: blob ? blob.size : 0,
          heldUrl: entry.url,
          stale: Boolean(wanted) && !match,
          usage: room.usage,
          quota: room.quota,
        })
      })(),
    )
  }

  /**
   * PO RETURN, 2026-09-01 — DOWNLOAD THE ARCHIVE, AND **NEVER FAIL SILENTLY**.
   *
   * The previous version had three faults and the product owner met all three
   * on a real iPad in one evening.
   *
   * ★ 1. IT BUFFERED THE WHOLE ARCHIVE IN MEMORY. Every chunk went into an
   *      array and became one `Blob` at the end. That is fine at 42 MB and is
   *      exactly the shape that dies at 94 MB inside a service worker on a
   *      tablet — and it dies at 80 % of the progress bar, after the minutes
   *      the coordinator already spent. **It now STREAMS through a
   *      `TransformStream` straight into `cache.put`**, counting bytes as they
   *      pass. Nothing bigger than one chunk is ever held.
   *
   * ★ 2. IT ASKED FOR ROOM IT HAD NOT CHECKED, AND IT ASKED FOR IT TWICE. The
   *      old archive was deleted only AFTER a successful download, so the peak
   *      requirement was old + new — 137 MB to end up holding 94. On a device
   *      whose quota is a fraction of free space that is the difference
   *      between fitting and not. It now calls `navigator.storage.estimate()`
   *      BEFORE the download, drops the superseded archive first when the two
   *      would not fit together, and **refuses with a stated reason** rather
   *      than starting a download that cannot land.
   *
   * ★ 3. EVERY FAILURE LOOKED LIKE A SHRUG. `reply({ok:false, error:'network'})`
   *      for all of them, and the screen showed nothing at all. **Each failure
   *      now names itself** — `http` with its status, `quota` with the usage
   *      and the ceiling, `truncated` with received vs expected, `store` with
   *      the exception's own name — and the settings screen prints it.
   *
   * ★ AND WHAT IS STORED IS VERIFIED BY READING IT BACK. A stream that ends
   *   early can still resolve `cache.put`, so the entry is re-opened and
   *   measured, and a mismatch DELETES it. A half archive that reports
   *   `held: true` fails every range request in the field, which is the worst
   *   of the three outcomes.
   *
   * ★ 2026-09-01 (§29) — AND THE ARCHIVE'S OWN HEADER IS THE LAST WORD, not a
   *   `content-length`. Two of those were measured lying about this exact file
   *   on this exact host, which is how a complete download came to be deleted
   *   as "truncated". `error: 'corrupt'` is the new verdict for bytes that
   *   arrive whole and are not a PMTiles archive.
   */
  if (data.type === 'DOWNLOAD_MAP' && typeof data.url === 'string') {
    event.waitUntil(
      (async () => {
        const wanted = new URL(data.url, self.location.href).href
        const cache = await caches.open(MAP_CACHE)
        const dropWanted = async () => {
          for (const key of await cache.keys()) {
            if (key.url === wanted) await cache.delete(key)
          }
        }
        const fail = async (error, extra) => {
          const room = await storageEstimate()
          reply({ ok: false, error, usage: room.usage, quota: room.quota, ...extra })
        }

        let response
        try {
          response = await fetch(data.url, { cache: 'reload' })
        } catch (error) {
          await fail('network', { detail: String((error && error.message) || error) })
          return
        }

        if (!response.ok || !response.body) {
          await fail('http', { status: response.status })
          return
        }

        /**
         * ★ THE PAGE'S NUMBER IS THE FALLBACK, AND IT HAD TO BECOME ONE (§28).
         *   `content-length` is present on a HEAD of the archive and absent
         *   from the streamed GET on its new same-origin home — measured. With
         *   `expected` at 0 the progress percentage never renders AND the
         *   truncation check below compares against nothing and passes, which
         *   is how a half archive would come to report `held: true`. So the
         *   header wins when it exists and the page's HEAD stands in when it
         *   does not; 0 only survives if neither knew, and that is honest.
         */
        /**
         * ⚠️ A `content-length` UNDER A `content-encoding` DESCRIBES THE
         *    COMPRESSED BODY, AND THAT IS EXACTLY WHAT PRODUCED THE PRODUCT
         *    OWNER'S "94.3 OF 93.9" (§29).
         *
         *    Pages was gzipping the archive: the header announced 93 926 002
         *    (the compressed length) while the stream decoded to 94 268 129
         *    (the real one). `received` counts DECODED bytes, so it overshot
         *    the ceiling it was being measured against, the equality below
         *    failed, and a download that had in fact completed perfectly was
         *    deleted and reported as truncated. The archive was never the
         *    problem, and neither was the network.
         *
         *    So a compressed stream's own header is not comparable and is not
         *    used. The page's HEAD stands in — and since the `.png` suffix
         *    landed there is no encoding on this object at all, which is the
         *    real fix; this is the guard that stops the same lie being told
         *    again by some future host.
         */
        const encoded = Boolean(response.headers.get('content-encoding'))
        const headerLength = Number(response.headers.get('content-length') || '0')
        const pageLength = Number(data.expectedBytes || 0)
        const expected = encoded ? pageLength : headerLength || pageLength

        // ---- room, asked before the minutes are spent rather than after ----
        let droppedOld = false
        const before = await storageEstimate()
        if (expected > 0 && before.quota > 0) {
          // ×1.1: the archive is not the only thing that will be written while
          // it downloads, and a check that leaves no margin is a check that
          // passes and then throws.
          if (before.quota - before.usage < expected * 1.1) {
            for (const key of await cache.keys()) {
              if (key.url !== wanted) {
                await cache.delete(key)
                droppedOld = true
              }
            }
          }
          const after = await storageEstimate()
          if (after.quota - after.usage < expected) {
            await fail('quota', { expected, droppedOld })
            return
          }
        }

        // ---- the stream, counted on its way past rather than collected ----
        let received = 0
        const counted = response.body.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              received += chunk.byteLength
              reply({ progress: received, total: expected })
              controller.enqueue(chunk)
            },
          }),
        )

        const headers = {
          'content-type': 'application/octet-stream',
          'accept-ranges': 'bytes',
        }
        // ⚠️ NO `content-length` IS WRITTEN HERE (§29). It could only be the
        //    number the server announced, which is the number that was wrong;
        //    the cached blob's own size is the truth and is what `MAP_STATS`
        //    and `sliceFromCache` both read.

        try {
          await cache.put(wanted, new Response(counted, { status: 200, headers }))
        } catch (error) {
          const name = (error && error.name) || 'unknown'
          await dropWanted()
          await fail(name === 'QuotaExceededError' ? 'quota' : 'store', {
            detail: String((error && error.message) || name),
            received,
            expected,
            droppedOld,
          })
          return
        }

        // ---- read it back: what is on the device, not what was sent --------
        const stored = await cache.match(wanted)
        const storedBlob = stored ? await stored.blob() : null
        const storedBytes = storedBlob ? storedBlob.size : 0

        /**
         * ★ SHORT IS A FAILURE; LONG IS NOT (§29).
         *
         *   A stream that ends early is a truncated archive and must be
         *   deleted. A stream that delivers MORE than was announced cannot be
         *   truncated — it can only mean the announcement was wrong, which is
         *   precisely the case that threw away a perfectly good 94 MB
         *   download. What must always hold is that what is ON THE DEVICE is
         *   what CAME OFF THE WIRE, and that is its own line below.
         */
        if ((expected > 0 && received < expected) || storedBytes !== received) {
          await dropWanted()
          await fail('truncated', {
            received,
            expected,
            stored: storedBytes,
            droppedOld,
          })
          return
        }

        /**
         * ★★ AND THEN THE ARCHIVE IS ASKED WHETHER IT IS WHOLE, RATHER THAN
         *    THE HEADERS BEING ASKED ABOUT IT.
         *
         *    Every length in this function comes from a server that has now
         *    been caught stating one twice. A PMTiles archive carries its own
         *    extent in its first 127 bytes: the magic, the version, and where
         *    the tile data ends. If the file on the device stops before its
         *    own header says it should, it is short — whatever any
         *    `content-length` claimed, and whatever the network reported. This
         *    is the check that does not depend on anybody's honesty, and it is
         *    the one a coordinator's map actually needs to pass.
         */
        const head = new Uint8Array(await storedBlob.slice(0, 127).arrayBuffer())
        const magic = String.fromCharCode(...head.subarray(0, 7))
        if (head.length < 127 || magic !== 'PMTiles' || head[7] !== 3) {
          await dropWanted()
          await fail('corrupt', {
            received,
            expected,
            stored: storedBytes,
            droppedOld,
            detail: `magic '${magic}' v${head[7]}`,
          })
          return
        }
        const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
        const tileDataEnd =
          Number(view.getBigUint64(56, true)) + Number(view.getBigUint64(64, true))
        if (tileDataEnd > storedBytes) {
          await dropWanted()
          await fail('corrupt', {
            received,
            expected,
            stored: storedBytes,
            droppedOld,
            detail: `its header ends the tile data at ${tileDataEnd}`,
          })
          return
        }

        // ---- only now is the superseded archive certainly unnecessary ------
        for (const key of await cache.keys()) {
          if (key.url !== wanted) {
            await cache.delete(key)
            droppedOld = true
          }
        }

        /**
         * ★ AND THE STYLE'S OWN ASSETS GO WITH IT, because "the map is
         *   downloaded" has to mean the map DRAWS. The archive is the
         *   geometry; the sprite sheet and the glyph ranges are how it becomes
         *   a picture, and a coordinator who tapped a button that said 94 MB
         *   does not then want to discover that the labels needed a network.
         *
         *   The page sends the list rather than the worker guessing it: the
         *   style is built in `basemap.ts` and only it knows which sprite and
         *   which fontstacks this build asks for. Failures here are swallowed
         *   on purpose — a missing glyph range is a label in a fallback face,
         *   not a reason to fail an archive that landed. They are COUNTED
         *   though, and the count is reported, because "the map is held but
         *   three glyph ranges are not" is a real state and used to be silent.
         */
        let assetsHeld = 0
        let assetsMissed = 0
        if (Array.isArray(data.assets)) {
          const shell = await caches.open(SHELL_CACHE)
          await Promise.all(
            data.assets.map((href) =>
              fetch(href)
                .then(async (r) => {
                  if (!r.ok) throw new Error(String(r.status))
                  await shell.put(href, r)
                  assetsHeld += 1
                })
                .catch(() => {
                  assetsMissed += 1
                }),
            ),
          )
        }

        const room = await storageEstimate()
        reply({
          ok: true,
          bytes: storedBytes,
          expected,
          heldUrl: wanted,
          droppedOld,
          assetsHeld,
          assetsMissed,
          usage: room.usage,
          quota: room.quota,
        })
      })(),
    )
  }

  if (data.type === 'CLEAR_MAP') {
    event.waitUntil(
      (async () => {
        await caches.delete(MAP_CACHE)
        const room = await storageEstimate()
        reply({ held: false, bytes: 0, heldUrl: null, stale: false, usage: room.usage, quota: room.quota })
      })(),
    )
  }
})
