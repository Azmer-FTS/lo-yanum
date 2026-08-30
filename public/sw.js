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

const VERSION = 'v1'
const SHELL_CACHE = `lo-yanum-shell-${VERSION}`
const TILE_CACHE = `lo-yanum-tiles-${VERSION}`
const KEEP = new Set([SHELL_CACHE, TILE_CACHE])

const TILE_HOSTS = ['tile.openstreetmap.org']

/** Cap the browsing tile cache so it cannot grow without limit on an iPad. */
const TILE_CACHE_MAX = 4000

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

function isTile(url) {
  return TILE_HOSTS.includes(url.hostname)
}

function isImmutableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.includes('/assets/') ||
      url.pathname.includes('/fonts/') ||
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

async function trimTileCache() {
  const cache = await caches.open(TILE_CACHE)
  const keys = await cache.keys()
  if (keys.length <= TILE_CACHE_MAX) return
  // Oldest first: Cache Storage preserves insertion order.
  for (const key of keys.slice(0, keys.length - TILE_CACHE_MAX)) {
    await cache.delete(key)
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (isApi(url)) return // straight to the network, never cached

  if (isTile(url)) {
    event.respondWith(
      cacheFirst(request, TILE_CACHE).then((response) => {
        void trimTileCache()
        return response
      }),
    )
    return
  }

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

  if (data.type === 'TILE_STATS') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(TILE_CACHE)
        const keys = await cache.keys()
        reply({ count: keys.length })
      })(),
    )
  }

  if (data.type === 'CLEAR_TILES') {
    event.waitUntil(
      (async () => {
        await caches.delete(TILE_CACHE)
        reply({ count: 0 })
      })(),
    )
  }
})
