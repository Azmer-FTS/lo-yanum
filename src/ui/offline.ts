import { useCallback, useEffect, useState } from 'react'

/**
 * P2.5a — THE OFFLINE SHELL, FROM THE PAGE'S SIDE.
 *
 * Registration, the connection state, and the two questions the הגדרות screen
 * asks the worker: how much ground is held, and drop it.
 */

const SW_URL = 'sw.js'

/**
 * PRODUCTION ONLY, and that is not caution — it is what keeps the other gates
 * meaningful. A service worker in dev would serve `mapfirst`, `splitter`,
 * `outreach`, `rtl`, `touch`, `wizard`, `import` and `layout` a cached shell
 * from a previous run, and a stale-asset failure in a browser test reads as a
 * broken feature. `bun run offline` drives a real production build instead.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    // Relative to the document, so the scope is the deployed sub-path
    // (/lo-yanum/) rather than the origin root — which GitHub Pages would
    // refuse anyway.
    void navigator.serviceWorker.register(SW_URL).catch(() => {
      // A refused registration is not a reason to fail the app: everything
      // still works, it just works only online.
    })
  })
}

/** `navigator.onLine`, kept current. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}

interface WorkerAnswer {
  type: string
  count?: number
}

/**
 * Ask the worker something and wait for its reply.
 *
 * A `MessageChannel` would be tidier, but the worker replies through
 * `event.source` so that the same handler serves a page that asks and a page
 * that is merely told. The timeout matters: if no worker is controlling the
 * page — the very first load, or a browser with them disabled — nothing ever
 * answers, and a settings screen that spins forever is worse than one that
 * says "not available".
 */
function askWorker(type: string, timeoutMs = 3000): Promise<WorkerAnswer | null> {
  return new Promise((resolve) => {
    const controller = navigator.serviceWorker?.controller
    if (!controller) {
      resolve(null)
      return
    }

    let settled = false
    const done = (value: WorkerAnswer | null) => {
      if (settled) return
      settled = true
      navigator.serviceWorker.removeEventListener('message', onMessage)
      clearTimeout(timer)
      resolve(value)
    }

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === type) done(event.data as WorkerAnswer)
    }

    const timer = setTimeout(() => done(null), timeoutMs)
    navigator.serviceWorker.addEventListener('message', onMessage)
    controller.postMessage({ type })
  })
}

export interface OfflineMaps {
  /** null while unknown, or when no worker is controlling this page. */
  tileCount: number | null
  /** True once a worker controls the page — i.e. offline actually works. */
  active: boolean
  refresh: () => Promise<void>
  clear: () => Promise<void>
}

export function useOfflineMaps(): OfflineMaps {
  const [tileCount, setTileCount] = useState<number | null>(null)
  const [active, setActive] = useState(false)

  const refresh = useCallback(async () => {
    const controlled = Boolean(navigator.serviceWorker?.controller)
    setActive(controlled)
    const answer = await askWorker('TILE_STATS')
    setTileCount(answer?.count ?? null)
  }, [])

  const clear = useCallback(async () => {
    const answer = await askWorker('CLEAR_TILES')
    setTileCount(answer?.count ?? 0)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { tileCount, active, refresh, clear }
}

/**
 * A rough size for a count of raster tiles.
 *
 * Deliberately approximate and LABELLED as approximate in the UI: Cache
 * Storage will not tell a page how many bytes it holds, and
 * `navigator.storage.estimate()` reports the whole origin — every cache, plus
 * IndexedDB, plus whatever the browser counts today. Twelve kilobytes is the
 * observed average for OSM raster over the Negev, where most tiles are mostly
 * empty desert. A number that says "about" is more useful than a precise
 * number about the wrong thing.
 */
export const AVERAGE_TILE_BYTES = 12 * 1024
