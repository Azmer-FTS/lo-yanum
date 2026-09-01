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
  /** The archive actually in the cache, whichever one it is. */
  heldUrl?: string | null
  /** Something is held and it is NOT the archive this build asks for. */
  stale?: boolean
  ok?: boolean
  error?: string
  progress?: number
  total?: number
  /* PO return 2026-09-01 — everything a failure has to be able to say. */
  status?: number
  detail?: string
  received?: number
  expected?: number
  stored?: number
  droppedOld?: boolean
  assetsHeld?: number
  assetsMissed?: number
  usage?: number
  quota?: number
}

/**
 * PO RETURN 2026-09-01 — WHAT THE LAST DOWNLOAD ACTUALLY DID, KEPT.
 *
 * ★ HIS WORDING WAS "PLUS JAMAIS D'ÉCHEC MUET", and a result that only exists
 *   while the screen is open is still nearly mute: the coordinator taps, walks
 *   away, comes back and finds the same old size with nothing to explain it.
 *   So the verdict is written to `localStorage` and read back on mount.
 */
export interface MapAttempt {
  ok: boolean
  /** 'network' | 'http' | 'quota' | 'store' | 'truncated' — named, never blank. */
  error?: string
  status?: number
  detail?: string
  received?: number
  expected?: number
  stored?: number
  droppedOld?: boolean
  assetsHeld?: number
  assetsMissed?: number
  usage?: number
  quota?: number
  /** The archive it was an attempt AT, by name. */
  archive: string
  /** Epoch ms, so the screen can say WHEN rather than just what. */
  at: number
}

const ATTEMPT_KEY = 'lo-yanum:map-attempt'

function readAttempt(): MapAttempt | null {
  try {
    const raw = localStorage.getItem(ATTEMPT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MapAttempt
    return typeof parsed?.at === 'number' ? parsed : null
  } catch {
    return null
  }
}

function writeAttempt(attempt: MapAttempt): void {
  try {
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt))
  } catch {
    // Private browsing, or a full device. The in-memory copy still shows.
  }
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
  /**
   * null while unknown, or when no worker is controlling this page.
   *
   * ★ IT MEANS "THE ARCHIVE THIS BUILD ASKS FOR IS HELD", not "some archive
   *   is held" — see `stale`, and the note in `sw.js`'s `MAP_STATS`.
   */
  held: boolean | null
  /** Bytes actually held on the device. 0 when nothing is. */
  bytes: number
  /**
   * ★ SOMETHING IS HELD AND IT IS THE WRONG MAP. The archive's name carries
   *   the OSM build date it was cut from, so replacing the map is a new URL —
   *   and a device that downloaded the previous one keeps it until it is told.
   *   This is what lets the screen say so instead of reporting the old cut's
   *   size under a label that promises the new one.
   */
  stale: boolean
  /** The archive on the device, by name. null when there is none. */
  heldArchive: string | null
  /** The archive this build asks for, by name. */
  wantedArchive: string
  /**
   * ★ WHAT THE LAST ATTEMPT DID, AND WHY IT IS A FIELD RATHER THAN A TOAST.
   *   Kept across mounts (localStorage), so a coordinator who tapped, walked
   *   away and came back still finds out that the download refused and why.
   */
  attempt: MapAttempt | null
  /** Bytes received so far in the RUNNING download; null when none is. */
  received: number | null
  /** What the running download expects in total; null when unknown. */
  expected: number | null
  /** Device storage as the browser reports it. 0 when it will not say. */
  usage: number
  quota: number
  /**
   * Whether the browser has promised not to evict this origin's storage.
   * ★ IT MATTERS FOR A 94 MB ARCHIVE: without it, Safari may reclaim the whole
   *   cache under pressure, and the coordinator finds out on a farm track.
   */
  persisted: boolean | null
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

/**
 * An archive URL as the one thing a coordinator can compare on a screen: its
 * file name. `negev-20260829-z14.pmtiles` and `israel-20260831-z14.pmtiles`
 * differ in the two places that matter — the ground and the OSM build date —
 * and both are in the name on purpose.
 */
export function archiveName(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || '')
  } catch {
    return ''
  }
}

export function useOfflineMaps(url: string, assets: string[] = []): OfflineMaps {
  const [held, setHeld] = useState<boolean | null>(null)
  const [bytes, setBytes] = useState(0)
  const [stale, setStale] = useState(false)
  const [heldArchive, setHeldArchive] = useState<string | null>(null)
  const [downloadBytes, setDownloadBytes] = useState<number | null>(null)
  const [active, setActive] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [received, setReceived] = useState<number | null>(null)
  const [expected, setExpected] = useState<number | null>(null)
  const [usage, setUsage] = useState(0)
  const [quota, setQuota] = useState(0)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [attempt, setAttempt] = useState<MapAttempt | null>(() => readAttempt())

  /**
   * ★ THE URL GOES WITH THE QUESTION. Without it the worker can only answer
   *   "is anything held", which is the question that let a device report the
   *   size of a superseded archive as though it were the current map.
   */
  const refresh = useCallback(async () => {
    const controlled = Boolean(navigator.serviceWorker?.controller)
    setActive(controlled)
    const answer = await askWorker('MAP_STATS', 3000, { url })
    setHeld(answer ? Boolean(answer.held) : null)
    setBytes(answer?.bytes ?? 0)
    setStale(Boolean(answer?.stale))
    setHeldArchive(archiveName(answer?.heldUrl) || null)
    setUsage(answer?.usage ?? 0)
    setQuota(answer?.quota ?? 0)
  }, [url])

  /**
   * Has the browser promised to keep this origin's storage?
   *
   * ★ `persist()` AND NOT ONLY `persisted()`, AND IT IS ASKED FROM THE PAGE
   *   BECAUSE THE WORKER CANNOT. Safari grants it silently to an INSTALLED web
   *   app and refuses it in a tab, which is exactly the distinction that
   *   matters: the coordinator's device is the installed one. Refusal is not
   *   an error and does not block anything — it is reported.
   */
  const askPersistence = useCallback(async () => {
    try {
      const storage = navigator.storage
      if (!storage?.persisted) return
      let granted = await storage.persisted()
      if (!granted && storage.persist) granted = await storage.persist()
      setPersisted(granted)
    } catch {
      setPersisted(null)
    }
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
        /**
         * ★ `r.ok` FIRST, AND IT IS NOT PEDANTRY. Supabase answers a missing
         *   object with `400` and an 88-byte JSON body, so reading
         *   `content-length` off a failed HEAD gave 88 — a button offering to
         *   download "0.1 MB" of a map that does not exist. A refusal has to
         *   read as a refusal.
         */
        const length = r.ok ? Number(r.headers.get('content-length') || '0') : 0
        // A PMTiles archive is megabytes. Anything under a megabyte on this
        // URL is an error page wearing a content-length.
        if (!cancelled) setDownloadBytes(length > 1_000_000 ? length : null)
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
    setReceived(0)
    setExpected(null)
    // Asked before the download and not after: an origin that may be evicted
    // is an origin that can lose 94 MB between the tap and the drive.
    await askPersistence()

    const verdict = await new Promise<WorkerAnswer>((resolve) => {
      const onMessage = (event: MessageEvent) => {
        const data = event.data as WorkerAnswer | undefined
        if (data?.type !== 'DOWNLOAD_MAP') return
        if (typeof data.progress === 'number' && data.total) {
          setProgress(Math.min(1, data.progress / data.total))
          setReceived(data.progress)
          setExpected(data.total)
          return
        }
        navigator.serviceWorker.removeEventListener('message', onMessage)
        resolve(data as WorkerAnswer)
      }
      navigator.serviceWorker.addEventListener('message', onMessage)
      /**
       * ★ `expectedBytes` IS SENT BECAUSE THE STREAM DOES NOT ALWAYS CARRY IT,
       *   and two things break quietly when it is missing (§28).
       *
       *   The worker reads the size off `content-length` on its own streaming
       *   response. Since the archive moved to the app's own origin that header
       *   is not always there — measured: the HEAD above returns it, the
       *   streamed GET does not — and a missing length costs BOTH the progress
       *   percentage (nothing to divide by, so the button never moves) and the
       *   truncation guard (a short stream compares against 0 and passes).
       *   The second one is the dangerous half: a half archive that reports
       *   `held: true` fails every range request in the field.
       *
       *   The page already knows the number — it is the same one on the button
       *   the coordinator just tapped — so it is sent rather than re-derived.
       *   The worker still prefers its own `content-length` when it has one;
       *   this is a floor under the case where it does not.
       */
      controller.postMessage({
        type: 'DOWNLOAD_MAP',
        url,
        assets,
        expectedBytes: downloadBytes ?? 0,
      })
    })

    /**
     * ★ THE VERDICT IS RECORDED WHATEVER IT IS. This is the whole of "no more
     *   silent failures": success and every named failure land in the same
     *   record, with the bytes, the ceiling and the archive it was for.
     */
    const record: MapAttempt = {
      ok: Boolean(verdict.ok),
      error: verdict.error,
      status: verdict.status,
      detail: verdict.detail,
      received: verdict.received ?? verdict.bytes,
      expected: verdict.expected,
      stored: verdict.stored,
      droppedOld: verdict.droppedOld,
      assetsHeld: verdict.assetsHeld,
      assetsMissed: verdict.assetsMissed,
      usage: verdict.usage,
      quota: verdict.quota,
      archive: archiveName(url),
      at: Date.now(),
    }
    setAttempt(record)
    writeAttempt(record)

    setProgress(null)
    setReceived(null)
    setExpected(null)
    await refresh()
    return record.ok
    // ★ `downloadBytes` IS A DEPENDENCY AND LEAVING IT OUT WAS A REAL BUG.
    //   Without it this callback closes over the value from the FIRST render —
    //   `null`, before the HEAD has answered — so `expectedBytes` above was
    //   always 0 and the fallback it exists for could never fire. The symptom
    //   is quiet and specific: the button shows the size, the download works,
    //   and the percentage never moves.
  }, [url, assets, refresh, askPersistence, downloadBytes])

  const clear = useCallback(async () => {
    const answer = await askWorker('CLEAR_MAP')
    setHeld(answer ? Boolean(answer.held) : false)
    setBytes(answer?.bytes ?? 0)
    setStale(false)
    setHeldArchive(null)
    setUsage(answer?.usage ?? 0)
    setQuota(answer?.quota ?? 0)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    // Report-only on mount: `persisted()` is a question, `persist()` is only
    // asked when a download is about to happen (in `download` above).
    let cancelled = false
    void navigator.storage
      ?.persisted?.()
      .then((value) => {
        if (!cancelled) setPersisted(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return {
    held,
    bytes,
    stale,
    heldArchive,
    wantedArchive: archiveName(url),
    attempt,
    received,
    expected,
    usage,
    quota,
    persisted,
    downloadBytes,
    active,
    progress,
    refresh,
    download,
    clear,
  }
}

/**
 * Bytes as MB, for a screen read one-handed in the dark.
 *
 * ★ DECIMAL MB (10⁶), NOT MIB (2²⁰), AND THE REASON IS RECONCILIATION.
 *   Every other number anybody will hold this one against is decimal: the
 *   `content-length` the bucket reports, the size the Supabase dashboard
 *   prints next to the object, the figure in ETAT. Dividing by 1 048 576 made
 *   the same 42 560 293 bytes read as "40.6 MB" on the device and "42.6 MB"
 *   everywhere else — a 5 % gap, on the exact number a coordinator uses to
 *   decide whether the map he holds is the map he was promised. The label says
 *   MB, so the arithmetic is now the one the label means.
 */
export function megabytes(bytes: number): string {
  return (bytes / 1e6).toFixed(1)
}
