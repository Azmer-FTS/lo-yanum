import { COLLECTIONS } from '@core/backend'
import type { Collection, StoreChange, StoreData } from '@core/backend'
import { emptyData } from '@core/demo'

/**
 * P2.5b — THE OFFLINE DATA LAYER: A READ CACHE AND A WRITE OUTBOX.
 *
 * P2.5a shipped the shell — the app itself survives with no network. This is
 * the other half: the DATA survives, and so do the edits made while there is
 * none. Both are the same primitive, which is why they are one file.
 *
 * ★ THE UNIT OF STORAGE IS THE `StoreChange`, AND THAT IS THE WHOLE REASON
 *   THIS UNIT IS SMALL. P2.6 already made every mutation report itself as
 *   `{ collection, id, json }` — a whole aggregate, serialised, or `null` for
 *   a deletion. That record is simultaneously:
 *     · a row of the read cache (put it under its key),
 *     · an entry of the outbox (put it under the SAME key, in another store),
 *     · and the exact argument the Supabase writer already takes.
 *   Nothing had to be invented here; P2.6's shape is being spent.
 *
 * ★ THE OUTBOX IS KEYED BY `collection/id`, WHICH MAKES IT COALESCE FOR FREE.
 *   A coordinator editing the same guard six times on a farm track produces
 *   six changes and ONE outbox entry — the last one, which is the only one
 *   that was ever going to survive last-write-wins anyway. A queue of six
 *   would replay five states nobody asked for and take six round trips to do
 *   it, over the connection that is by definition the bad one.
 *
 * ★ AND THE STORAGE PRIMITIVE IS AN INTERFACE WITH TWO IMPLEMENTATIONS, for
 *   the same reason the store is: `bun run sync` drives the whole of this
 *   logic — coalescing, flush order, the conflict rule, the restore — in Node
 *   against `memoryCache()`, with no browser. What a browser then has to prove
 *   is only that IndexedDB works, which is one assertion rather than thirty.
 */

/** One aggregate, as stored. `json: null` means "deleted". */
export interface CacheRecord {
  collection: Collection
  id: string
  json: string | null
  /** Client clock at the moment of the change — see the conflict rule below. */
  at: string
}

export type CacheStoreName = 'aggregates' | 'outbox'

export interface CacheStore {
  getAll(store: CacheStoreName): Promise<CacheRecord[]>
  put(store: CacheStoreName, records: CacheRecord[]): Promise<void>
  remove(store: CacheStoreName, keys: string[]): Promise<void>
  clear(store?: CacheStoreName): Promise<void>
}

/** The key both stores use. Keeping it one function is what makes them agree. */
export const keyOf = (record: { collection: Collection; id: string }): string =>
  `${record.collection}/${record.id}`

// ===========================================================================
// The IndexedDB implementation
// ===========================================================================

const DB_NAME = 'lo-yanum'
const DB_VERSION = 1

/**
 * ★ WHY INDEXEDDB AND NOT `localStorage`. The snapshot is ~500 kB with 300
 *   volunteers on it, and `localStorage` is a ~5 MB SYNCHRONOUS store: every
 *   write would block the main thread of a tablet in the middle of a map
 *   gesture, and the quota would be reached by the first real import.
 *   IndexedDB is asynchronous, quota-generous, and — the part that matters
 *   here — it stores structured values, so an aggregate goes in as a record
 *   rather than as a string somebody has to remember to parse.
 */
export function openIndexedDbCache(): Promise<CacheStore | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)

  return new Promise<CacheStore | null>((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      // Safari in a private window throws rather than failing. A cache that
      // cannot open is a slower app, not a broken one.
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of ['aggregates', 'outbox'] as const) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }
    request.onerror = () => {
      resolve(null)
    }
    request.onsuccess = () => {
      resolve(wrap(request.result))
    }
  })
}

function wrap(db: IDBDatabase): CacheStore {
  const run = <T>(
    store: CacheStoreName,
    mode: IDBTransactionMode,
    body: (s: IDBObjectStore) => IDBRequest<T> | null,
  ): Promise<T | undefined> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = body(tx.objectStore(store))
      tx.onerror = () => {
        reject(tx.error ?? new Error(`${store}: transaction failed`))
      }
      tx.oncomplete = () => {
        resolve(request?.result)
      }
    })

  return {
    async getAll(store) {
      return ((await run<CacheRecord[]>(store, 'readonly', (s) => s.getAll())) ??
        []) as CacheRecord[]
    },
    async put(store, records) {
      if (records.length === 0) return
      await run(store, 'readwrite', (s) => {
        for (const record of records) s.put(record, keyOf(record))
        return null
      })
    },
    async remove(store, keys) {
      if (keys.length === 0) return
      await run(store, 'readwrite', (s) => {
        for (const key of keys) s.delete(key)
        return null
      })
    },
    async clear(store) {
      for (const name of store ? [store] : (['aggregates', 'outbox'] as const)) {
        await run(name, 'readwrite', (s) => s.clear())
      }
    },
  }
}

/** The same contract, in memory. What `bun run sync` drives. */
export function memoryCache(): CacheStore {
  const stores: Record<CacheStoreName, Map<string, CacheRecord>> = {
    aggregates: new Map(),
    outbox: new Map(),
  }
  return {
    getAll: (store) => Promise.resolve([...stores[store].values()]),
    put: (store, records) => {
      for (const record of records) stores[store].set(keyOf(record), record)
      return Promise.resolve()
    },
    remove: (store, keys) => {
      for (const key of keys) stores[store].delete(key)
      return Promise.resolve()
    },
    clear: (store) => {
      for (const name of store ? [store] : (['aggregates', 'outbox'] as const)) {
        stores[name].clear()
      }
      return Promise.resolve()
    },
  }
}

// ===========================================================================
// The read cache
// ===========================================================================

export const toRecords = (changes: StoreChange[], at: string): CacheRecord[] =>
  changes.map((c) => ({ collection: c.collection, id: c.id, json: c.json, at }))

/** Everything currently in the app, as cache records. */
export function snapshotRecords(data: StoreData, at: string): CacheRecord[] {
  const records: CacheRecord[] = []
  for (const collection of COLLECTIONS) {
    for (const row of data[collection] as Array<{ id: string }>) {
      records.push({ collection, id: row.id, json: JSON.stringify(row), at })
    }
  }
  return records
}

/**
 * Reassemble a snapshot from the cache.
 *
 * Returns null when there is nothing cached, which is a different answer from
 * an empty snapshot and has to stay one: "no cache" means fall through to the
 * network and show a loading state, "cached and empty" means the database
 * really is empty and the empty screens are the right answer.
 */
export function restoreSnapshot(records: CacheRecord[]): StoreData | null {
  if (records.length === 0) return null
  const data = emptyData()
  for (const record of records) {
    if (record.json === null) continue
    const list = data[record.collection] as unknown[]
    list.push(JSON.parse(record.json))
  }
  return data
}

// ===========================================================================
// The outbox
// ===========================================================================

export interface FlushResult {
  sent: number
  /** Entries that are still there — the badge's number. */
  pending: number
  failed: string | null
}

/**
 * ★ THE CONFLICT RULE, WRITTEN DOWN BECAUSE IT IS A PROMISE TO THE FIELD AND
 *   NOT AN IMPLEMENTATION DETAIL.
 *
 *   **Last write wins, per AGGREGATE, and "last" means the last to REACH the
 *   server.** Not the last by wall clock: the `at` stamp on every record is a
 *   CLIENT clock, and an iPad that has been in the desert since Tuesday can be
 *   minutes out — which is precisely the situation the rule exists to resolve,
 *   so it cannot be the thing that resolves it. `at` is kept because it is
 *   what the badge and the diagnostics show ("waiting since 04:58"), and
 *   because P3 may want it; it is deliberately not the arbiter.
 *
 *   The aggregate is the unit, so two coordinators editing DIFFERENT fields of
 *   the same farm at the same time lose one of the two edits. That is a real
 *   cost and it is accepted for a real reason: phase 1 has exactly ONE
 *   account, so the only way to produce this is one person on two devices, and
 *   the alternative — a field-level merge — cannot be explained to the person
 *   it surprises. A guard, a farm or an incident is a thing a coordinator
 *   holds in his head as one thing.
 *
 *   TWO THINGS MAKE THAT SAFE, AND BOTH ARE ORDER:
 *     1. THE OUTBOX FLUSHES BEFORE THE RE-HYDRATION. Hydrating first would
 *        overwrite the local snapshot with server state that does not yet
 *        contain the pending edits — and since hydration writes nothing back
 *        (by design), those edits would be gone from the screen AND still in
 *        the outbox, which is the worst of both.
 *     2. A FAILED ENTRY STAYS. It is removed only after the server has
 *        accepted it, so a flush that dies halfway resumes rather than
 *        forgets.
 */
export async function flushOutbox(
  cache: CacheStore,
  send: (changes: StoreChange[]) => Promise<void>,
): Promise<FlushResult> {
  const entries = await cache.getAll('outbox')
  if (entries.length === 0) return { sent: 0, pending: 0, failed: null }

  // Oldest first: the order the coordinator produced them is the order their
  // foreign keys resolve in — the farm before the zone drawn on it.
  const ordered = [...entries].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const changes: StoreChange[] = ordered.map((e) => ({
    collection: e.collection,
    id: e.id,
    json: e.json,
  }))

  try {
    await send(changes)
  } catch (error: unknown) {
    return {
      sent: 0,
      pending: entries.length,
      failed: error instanceof Error ? error.message : String(error),
    }
  }
  await cache.remove('outbox', ordered.map(keyOf))
  return { sent: ordered.length, pending: 0, failed: null }
}
