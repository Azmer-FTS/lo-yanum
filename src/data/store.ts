import type { StoreBackend, StoreChange } from '@core/backend'
import { emptyData } from '@core/demo'
import { installBackend, replaceSnapshot, setSession } from '@core/store'

import { subscribeAuth, getAuthState, onSignOut } from './auth'
import {
  flushOutbox,
  keyOf,
  memoryCache,
  openIndexedDbCache,
  restoreSnapshot,
  snapshotRecords,
  toRecords,
} from './cache'
import type { CacheStore } from './cache'
import { getSupabase } from './client'
import { applyChanges, hydrateFrom, readGrantFrom } from './write'

/**
 * P2.6b — THE SUPABASE IMPLEMENTATION OF THE STORE INTERFACE.
 *
 * It does exactly three things, and the order they are listed in is the order
 * they matter:
 *
 *   1. SEEDS EMPTY, SYNCHRONOUSLY. The first frame cannot wait for Frankfurt,
 *      and every accessor in `@core/access` reads a value rather than a
 *      promise. So the app starts with a real, empty `StoreData` and shows its
 *      empty states — which, against a database that has never been imported
 *      into, is also the correct final answer.
 *   2. HYDRATES ONCE, when there is a session. 25 selects, assembled into the
 *      nested model in TypeScript, handed over with `replaceSnapshot` — which
 *      writes nothing back, on purpose.
 *   3. WRITES THROUGH, aggregate by aggregate, in a strictly serial queue.
 *
 * ★ THE QUEUE IS SERIAL AND THAT IS NOT CAUTION. The changes arrive in the
 *   order the coordinator produced them, and they carry foreign keys to each
 *   other: creating a farm and immediately drawing a zone on it emits two
 *   changes a millisecond apart, and a zone whose entity does not exist yet is
 *   a rejected INSERT, not a slow one. Parallelising this would trade a
 *   guarantee for latency nobody would notice.
 *
 * ★ AND THE FAILURE PATH IS DELIBERATELY A STUB WITH A NAME. `onWriteFailed`
 *   currently records the failure and reports it; P2.5b replaces its body with
 *   "put it in the outbox and raise the badge". Writing it as a named seam now
 *   is what keeps P2.5b a small unit — the alternative is a try/catch inlined
 *   in a loop that somebody has to find again.
 */

// --- What the data layer is doing, for the shell to show -------------------

export type DataStatus =
  /** Demo mode, or nobody signed in: there is nothing to fetch. */
  | 'idle'
  | 'loading'
  | 'ready'
  /**
   * ★ SIGNED IN, BUT NOBODY. `app_users` is where a login becomes a
   * coordinator; a user with no row there passes every policy's `false`. The
   * symptom without this state is the worst one available — a successful
   * sign-in onto 26 empty tables with no error anywhere, indistinguishable
   * from a database that simply has not been imported into yet.
   */
  | 'no-grant'
  | 'error'

export interface DataState {
  status: DataStatus
  /** Aggregates in the outbox — the badge's number ("N ממתינים לסנכרון"). */
  pending: number
  /**
   * P2.5b — the snapshot on screen came from the cache and has not been
   * confirmed against the server since. Data, not an error: it is the normal
   * state of a tablet on a farm track, and the shell says so quietly.
   */
  stale: boolean
  /** The last error, for the shell to show and for the console. */
  message: string | null
}

let state: DataState = { status: 'idle', pending: 0, stale: false, message: null }
const listeners = new Set<() => void>()

function publish(next: Partial<DataState>): void {
  const merged = { ...state, ...next }
  if (
    merged.status === state.status &&
    merged.pending === state.pending &&
    merged.stale === state.stale &&
    merged.message === state.message
  ) {
    return
  }
  state = merged
  for (const listener of listeners) listener()
}

export function getDataState(): DataState {
  return state
}

export function subscribeData(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// --- Writing ---------------------------------------------------------------

/** The serial queue. Every write appends to it; nothing overtakes. */
let queue: Promise<void> = Promise.resolve()

/**
 * P2.5b — the read cache and the outbox. `memoryCache()` is the fallback for a
 * browser that refuses IndexedDB: the app then works exactly as it did before
 * this unit, online only, rather than not at all.
 */
let cache: CacheStore = memoryCache()

async function pendingCount(): Promise<number> {
  return (await cache.getAll('outbox')).length
}

/** The app's own client, handed to the writer that deliberately has none. */
async function sendChanges(changes: StoreChange[]): Promise<void> {
  const client = await getSupabase()
  if (!client) throw new Error('no client')
  await applyChanges(client, changes)
}

// --- The backend -----------------------------------------------------------

/**
 * ★ ONE WRITE, AND THE THREE THINGS IT DOES IN THIS ORDER.
 *
 *   1. THE READ CACHE IS UPDATED FIRST, ALWAYS, whether or not the network is
 *      reachable. The cache's job is to hold what the app is showing, and the
 *      app is showing this — the mutation already ran in memory. A cache that
 *      only recorded successful writes would lose the coordinator's last three
 *      hours on the drive home.
 *   2. IF ANYTHING IS ALREADY WAITING, THIS WAITS TOO, without trying. Not
 *      timidity — ORDER. A guard created while offline is in the outbox; a
 *      presence mark on that guard, written a minute later once one bar
 *      appears, would be an INSERT against a mission that does not exist yet.
 *      The outbox is a queue precisely so that it cannot be overtaken.
 *   3. OTHERWISE it goes, and a failure puts it in the outbox rather than
 *      losing it. A success clears any older entry for the same aggregate —
 *      the key is `collection/id`, so there is at most one.
 */
async function writeThrough(changes: StoreChange[]): Promise<void> {
  const at = new Date().toISOString()
  const records = toRecords(changes, at)
  await cache.put('aggregates', records)

  if ((await pendingCount()) > 0) {
    await cache.put('outbox', records)
    publish({ pending: await pendingCount() })
    return
  }
  try {
    await sendChanges(changes)
    await cache.remove('outbox', records.map(keyOf))
  } catch (error: unknown) {
    await cache.put('outbox', records)
    publish({
      pending: await pendingCount(),
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

const SUPABASE_BACKEND: StoreBackend = {
  name: 'supabase',
  persists: true,
  // EMPTY, and it is the honest first frame: the database has never been
  // imported into, so the empty states the screens already have are the
  // correct answer rather than a placeholder for one.
  seed: emptyData,
  onChange: (changes) => {
    queue = queue.then(() => writeThrough(changes)).catch((error: unknown) => {
      // writeThrough handles its own failures; anything reaching here is the
      // cache itself refusing, which must not break the serial chain.
      console.error('[lo-yanum] cache write failed', error)
    })
  },
}

/**
 * Send everything that is waiting, then say how much still is.
 *
 * Appended to the SAME serial queue as the writes, so a flush can never
 * interleave with a mutation the coordinator is making at that moment.
 */
export function flushPending(): Promise<void> {
  queue = queue.then(async () => {
    const result = await flushOutbox(cache, sendChanges)
    publish({ pending: result.pending, message: result.failed })
  })
  return queue
}

let started = false

/**
 * Install the Supabase store. Called ONCE, synchronously, before the first
 * render — see `installBackend`'s note on why the core cannot do this itself.
 */
export function installSupabaseStore(): void {
  if (started) return
  started = true
  installBackend(SUPABASE_BACKEND)

  // An explicit sign-out empties the device. An expired token does not — see
  // the note on LAST_SESSION_KEY in ./auth, which is where that asymmetry is
  // argued.
  onSignOut(async () => {
    await cache.clear()
    publish({ pending: 0, stale: false, message: null })
  })

  let loadedFor: string | null = null

  /**
   * ★ THE ORDER OF THE FOUR STEPS IS THE WHOLE OF P2.5b, and each one is
   *   before the next for a reason that costs data if reversed.
   *
   *   1. RESTORE FROM THE CACHE FIRST. It is local, it is instant, and it is
   *      the only step that works with no network at all. The coordinator sees
   *      his farms before anything has been asked of Frankfurt — and if
   *      Frankfurt is unreachable, he still sees them.
   *   2. FLUSH THE OUTBOX SECOND, BEFORE HYDRATING. Hydrating first would
   *      replace the local snapshot with server state that does not contain
   *      the pending edits, and since hydration deliberately writes nothing
   *      back, those edits would vanish from the screen while still sitting in
   *      the outbox. That is the worst of both and it is one line's difference.
   *   3. HYDRATE THIRD. Now the server has everything this device knows, so
   *      what comes back is the truth rather than a truth missing three hours.
   *   4. RE-RECORD THE CACHE from the hydrated snapshot, so the next cold
   *      start begins from the server's version rather than from a local
   *      history of edits.
   */
  const load = async (): Promise<void> => {
    const restored = restoreSnapshot(await cache.getAll('aggregates'))
    if (restored) {
      replaceSnapshot(restored)
      // Ready, from the cache. If the network then answers, this is replaced
      // by the same status with `stale: false`; if it does not, the app is
      // usable and says why.
      publish({ status: 'ready', stale: true, message: null })
    } else {
      publish({ status: 'loading', message: null })
    }
    publish({ pending: await pendingCount() })

    const client = await getSupabase()
    if (!client) throw new Error('no client')

    const grant = await readGrantFrom(client)
    if (!grant) {
      publish({ status: 'no-grant', stale: false, message: null })
      return
    }
    setSession({ role: grant.role, entityId: grant.entityId })

    await flushPending()

    const fresh = await hydrateFrom(client)
    replaceSnapshot(fresh)
    await cache.clear('aggregates')
    await cache.put('aggregates', snapshotRecords(fresh, new Date().toISOString()))
    publish({ status: 'ready', stale: false, message: null })
  }

  const sync = (): void => {
    const auth = getAuthState()

    if (auth.status !== 'signed-in' || auth.userId === null) {
      if (loadedFor !== null) {
        // The snapshot goes even though the CACHE may not: `onSignOut` above
        // decides that, and only an explicit sign-out reaches it.
        loadedFor = null
        replaceSnapshot(emptyData())
      }
      publish({ status: 'idle', stale: false, message: null })
      return
    }
    // A token refresh republishes `signed-in` every hour. Re-fetching 300
    // volunteers each time would be a self-inflicted hourly stall.
    if (loadedFor === auth.userId) return
    loadedFor = auth.userId

    void load().catch((error: unknown) => {
      // Offline is the COMMON case here, not a bug. With a cache behind us the
      // app is already usable and says `stale`; without one there is nothing
      // to show and the banner has to say so.
      const message = error instanceof Error ? error.message : String(error)
      loadedFor = null
      publish(
        state.status === 'ready'
          ? { stale: true, message }
          : { status: 'error', message },
      )
    })
  }

  subscribeAuth(sync)
  sync()

  // The network coming back is the one moment worth retrying on: a timer would
  // spend a farm track's worth of battery asking a question whose answer has
  // not changed.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      void flushPending()
    })
  }

  // Real IndexedDB replaces the in-memory fallback as soon as it opens. Doing
  // this AFTER the first `sync()` would mean a cold start reading an empty
  // cache; doing it before would mean blocking the first frame on a database
  // handle. So: swap, then reload from what it turns out to hold.
  void openIndexedDbCache().then((real) => {
    if (!real) return
    cache = real
    if (getAuthState().status === 'signed-in') {
      loadedFor = null
      sync()
    }
  })
}
