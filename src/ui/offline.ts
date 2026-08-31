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
  held?: boolean
  bytes?: number
  ok?: boolean
  error?: string
  progress?: number
  total?: number
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
function askWorker(
  type: string,
  timeoutMs = 3000,
  payload: Record<string, unknown> = {},
): Promise<WorkerAnswer | null> {
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
    controller.postMessage({ type, ...payload })
  })
}

/**
 * PMTILES — THE OFFLINE MAP IS ONE FILE, SO THIS ANSWERS "HELD OR NOT".
 *
 * It replaces a hook that reported a COUNT of raster tiles and multiplied it
 * by an average to guess megabytes. That number was honest about its own
 * imprecision and still useless: 3 812 tiles does not tell a coordinator
 * whether the track to a particular farm is among them. One archive covers the
 * whole bbox or it does not, and its size is a fact rather than an estimate.
 */
export interface OfflineMaps {
  /** null while unknown, or when no worker is controlling this page. */
  held: boolean | null
  /** Bytes actually held on the device. 0 when nothing is. */
  bytes: number
  /**
   * ★ THE SIZE BEFORE THE TAP. The product owner's own condition: a
   *   coordinator on cellular data at the edge of coverage has to be able to
   *   DECLINE. Read with a HEAD request rather than hard-coded, so a re-cut
   *   archive cannot make the screen lie. null when it could not be asked.
   */
  downloadBytes: number | null
  /** True once a worker controls the page — i.e. offline actually works. */
  active: boolean
  /** 0–1 while a download is running, null otherwise. */
  progress: number | null
  refresh: () => Promise<void>
  download: () => Promise<boolean>
  clear: () => Promise<void>
}

export function useOfflineMaps(url: string, assets: string[] = []): OfflineMaps {
  const [held, setHeld] = useState<boolean | null>(null)
  const [bytes, setBytes] = useState(0)
  const [downloadBytes, setDownloadBytes] = useState<number | null>(null)
  const [active, setActive] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    const controlled = Boolean(navigator.serviceWorker?.controller)
    setActive(controlled)
    const answer = await askWorker('MAP_STATS')
    setHeld(answer ? Boolean(answer.held) : null)
    setBytes(answer?.bytes ?? 0)
  }, [])

  /**
   * How big the download would be, asked of the server rather than assumed.
   *
   * A HEAD costs one request and needs a network — which is fine, because a
   * coordinator with no network cannot download the map either. Failing
   * quietly to null is deliberate: the screen then says it cannot tell, rather
   * than showing a number it made up.
   */
  useEffect(() => {
    let cancelled = false
    void fetch(url, { method: 'HEAD' })
      .then((r) => {
        const length = Number(r.headers.get('content-length') || '0')
        if (!cancelled) setDownloadBytes(length > 0 ? length : null)
      })
      .catch(() => {
        if (!cancelled) setDownloadBytes(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  /**
   * Run the download, following the worker's progress messages.
   *
   * Not `askWorker`: that helper resolves on the FIRST reply, and this
   * conversation is many replies — one per chunk — followed by a verdict. A
   * 42 MB download at the edge of coverage is minutes, and the whole point of
   * the progress is that it keeps arriving.
   */
  const download = useCallback(async (): Promise<boolean> => {
    const controller = navigator.serviceWorker?.controller
    if (!controller) return false
    setProgress(0)

    const finished = await new Promise<boolean>((resolve) => {
      const onMessage = (event: MessageEvent) => {
        const data = event.data as WorkerAnswer | undefined
        if (data?.type !== 'DOWNLOAD_MAP') return
        if (typeof data.progress === 'number' && data.total) {
          setProgress(Math.min(1, data.progress / data.total))
          return
        }
        navigator.serviceWorker.removeEventListener('message', onMessage)
        resolve(Boolean(data.ok))
      }
      navigator.serviceWorker.addEventListener('message', onMessage)
      controller.postMessage({ type: 'DOWNLOAD_MAP', url, assets })
    })

    setProgress(null)
    await refresh()
    return finished
  }, [url, assets, refresh])

  const clear = useCallback(async () => {
    const answer = await askWorker('CLEAR_MAP')
    setHeld(answer ? Boolean(answer.held) : false)
    setBytes(answer?.bytes ?? 0)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { held, bytes, downloadBytes, active, progress, refresh, download, clear }
}

/** Bytes as MB, for a screen read one-handed in the dark. */
export function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}
