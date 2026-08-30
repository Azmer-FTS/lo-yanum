import { COLLECTIONS } from '@core/backend'
import type { Collection, StoreBackend, StoreChange, StoreData } from '@core/backend'
import { emptyData } from '@core/demo'
import { installBackend, replaceSnapshot, setSession } from '@core/store'
import type { Role } from '@core/types'

import { subscribeAuth, getAuthState } from './auth'
import { getSupabase } from './client'
import { MAPPINGS, tablesOf } from './rows'
import type { Mapping, Row, TableRows } from './rows'

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
  /** Aggregates whose write failed and have not been retried. P2.5b: the outbox. */
  pending: number
  /** The last error, for the shell to show and for the console. */
  message: string | null
}

let state: DataState = { status: 'idle', pending: 0, message: null }
const listeners = new Set<() => void>()

function publish(next: Partial<DataState>): void {
  const merged = { ...state, ...next }
  if (
    merged.status === state.status &&
    merged.pending === state.pending &&
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

// --- Reading ---------------------------------------------------------------

/**
 * PostgREST answers at most 1 000 rows unless asked otherwise, and it does so
 * SILENTLY — a roster of 1 200 volunteers would come back as 1 000 and look
 * complete. So every read pages until a short page arrives.
 */
const PAGE = 1000

async function selectAll(
  client: Awaited<ReturnType<typeof getSupabase>>,
  table: string,
): Promise<Row[]> {
  if (!client) return []
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const page = (data ?? []) as Row[]
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

/** `fk value → the rows that belong to it`, for assembling one aggregate. */
function bucket(rows: Row[], fk: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>()
  for (const row of rows) {
    const key = String(row[fk] ?? '')
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }
  return map
}

async function hydrate(): Promise<StoreData> {
  const client = await getSupabase()
  if (!client) throw new Error('no client')

  // Every table at once. They are independent selects and the assembly is
  // local, so the wall clock is one round trip rather than twenty-five.
  const tables = new Set<string>()
  for (const c of COLLECTIONS) for (const t of tablesOf(c)) tables.add(t)
  const names = [...tables]
  const answers = await Promise.all(names.map((t) => selectAll(client, t)))
  const byTable = new Map<string, Row[]>(names.map((t, i) => [t, answers[i]]))

  const next = emptyData()
  for (const collection of COLLECTIONS) {
    const mapping = MAPPINGS[collection] as Mapping<unknown>
    const parents = byTable.get(mapping.table) ?? []
    const buckets = mapping.children.map((c) => ({
      table: c.table,
      rows: bucket(byTable.get(c.table) ?? [], c.fk),
    }))
    const assembled = parents.map((parent) => {
      const id = String(parent.id ?? '')
      const children: Record<string, Row[]> = {}
      for (const b of buckets) children[b.table] = b.rows.get(id) ?? []
      return mapping.fromRows(parent, children)
    })
    ;(next[collection] as unknown[]) = assembled
  }
  return next
}

/**
 * Who this login speaks for.
 *
 * `app_users` is readable by its owner and by nobody else (P2.2), so a missing
 * row is not an error to retry — it is the answer, and it means the account
 * exists and has been granted nothing.
 */
async function readGrant(): Promise<{ role: Role; entityId: string | null } | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client
    .from('app_users')
    .select('role, entity_ref')
    .maybeSingle()
  if (error) throw new Error(`app_users: ${error.message}`)
  if (!data) return null
  return {
    role: (data as { role: Role }).role,
    entityId: (data as { entity_ref: string | null }).entity_ref ?? null,
  }
}

// --- Writing ---------------------------------------------------------------

/** The serial queue. Every write appends to it; nothing overtakes. */
let queue: Promise<void> = Promise.resolve()

/** Aggregates whose write failed. P2.5b turns this into a persisted outbox. */
const failed: StoreChange[] = []

function onWriteFailed(changes: StoreChange[], error: unknown): void {
  // P2.5b — REPLACE THIS BODY, not its callers: the outbox goes here, keyed by
  // (collection, id) so a later write of the same aggregate supersedes an
  // earlier failed one instead of queueing behind it.
  failed.push(...changes)
  const message = error instanceof Error ? error.message : String(error)
  console.error('[lo-yanum] write failed', message, changes.map((c) => `${c.collection}/${c.id}`))
  publish({ pending: failed.length, message })
}

/** One collection's worth of changes, as few statements as they allow. */
async function writeCollection(
  client: NonNullable<Awaited<ReturnType<typeof getSupabase>>>,
  collection: Collection,
  changes: StoreChange[],
): Promise<void> {
  const mapping = MAPPINGS[collection] as Mapping<unknown>
  const removed = changes.filter((c) => c.json === null).map((c) => c.id)
  const upserted = changes.filter((c) => c.json !== null)

  if (removed.length > 0) {
    // The children go with it: every child FK in the schema is
    // `on delete cascade`, which is what makes this one statement.
    const { error } = await client.from(mapping.table).delete().in('id', removed)
    if (error) throw new Error(`delete ${mapping.table}: ${error.message}`)
  }
  if (upserted.length === 0) return

  const ids = upserted.map((c) => c.id)
  const written: TableRows[][] = upserted.map((c) =>
    mapping.toRows(JSON.parse(c.json as string)),
  )
  const rowsFor = (table: string): Row[] =>
    written.flatMap((w) => w.find((t) => t.table === table)?.rows ?? [])

  // Children first, in REVERSE — `presence_marks` references
  // `mission_assignments` and `mission_driver_passengers` references
  // `mission_drivers`, so a forward delete would be refused.
  for (const child of [...mapping.children].reverse()) {
    const { error } = await client.from(child.table).delete().in(child.fk, ids)
    if (error) throw new Error(`clear ${child.table}: ${error.message}`)
  }

  const { error: parentError } = await client
    .from(mapping.table)
    .upsert(rowsFor(mapping.table), { onConflict: 'id' })
  if (parentError) throw new Error(`upsert ${mapping.table}: ${parentError.message}`)

  // Then forward, so each child's own dependency already exists.
  for (const child of mapping.children) {
    const rows = rowsFor(child.table)
    if (rows.length === 0) continue
    const { error } = await client.from(child.table).insert(rows)
    if (error) throw new Error(`insert ${child.table}: ${error.message}`)
  }
}

async function applyChanges(changes: StoreChange[]): Promise<void> {
  const client = await getSupabase()
  if (!client) return

  const byCollection = new Map<Collection, StoreChange[]>()
  for (const change of changes) {
    const list = byCollection.get(change.collection)
    if (list) list.push(change)
    else byCollection.set(change.collection, [change])
  }

  // Deletes in reverse dependency order, upserts forward — a farm removed in
  // the same breath as a zone added to another farm must not reorder into a
  // foreign key that has just been dropped.
  for (const collection of [...COLLECTIONS].reverse()) {
    const list = byCollection.get(collection)?.filter((c) => c.json === null)
    if (list?.length) await writeCollection(client, collection, list)
  }
  for (const collection of COLLECTIONS) {
    const list = byCollection.get(collection)?.filter((c) => c.json !== null)
    if (list?.length) await writeCollection(client, collection, list)
  }
}

// --- The backend -----------------------------------------------------------

const SUPABASE_BACKEND: StoreBackend = {
  name: 'supabase',
  persists: true,
  // EMPTY, and it is the honest first frame: the database has never been
  // imported into, so the empty states the screens already have are the
  // correct answer rather than a placeholder for one.
  seed: emptyData,
  onChange: (changes) => {
    queue = queue
      .then(() => applyChanges(changes))
      .catch((error: unknown) => {
        onWriteFailed(changes, error)
      })
  },
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

  let loadedFor: string | null = null

  const sync = (): void => {
    const auth = getAuthState()

    if (auth.status !== 'signed-in' || auth.userId === null) {
      if (loadedFor !== null) {
        // Signing out empties the app rather than leaving the last
        // coordinator's farms on a shared iPad for the next person.
        loadedFor = null
        replaceSnapshot(emptyData())
      }
      publish({ status: 'idle', message: null })
      return
    }
    // A token refresh republishes `signed-in` every hour. Re-fetching 300
    // volunteers each time would be a self-inflicted hourly stall.
    if (loadedFor === auth.userId) return
    loadedFor = auth.userId

    publish({ status: 'loading', message: null })
    void (async () => {
      try {
        const grant = await readGrant()
        if (!grant) {
          publish({ status: 'no-grant', message: null })
          return
        }
        setSession({ role: grant.role, entityId: grant.entityId })
        replaceSnapshot(await hydrate())
        publish({ status: 'ready', message: null })
      } catch (error: unknown) {
        // Offline is the common case here, not a bug — P2.5b makes it a
        // non-event by answering from the cache instead.
        loadedFor = null
        publish({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })()
  }

  subscribeAuth(sync)
  sync()
}
