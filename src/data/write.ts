import type { SupabaseClient } from '@supabase/supabase-js'

import { COLLECTIONS } from '@core/backend'
import type { Collection, StoreChange, StoreData } from '@core/backend'
import { emptyData } from '@core/demo'
import type { Role } from '@core/types'

import { MAPPINGS, tablesOf } from './rows'
import type { Mapping, Row, TableRows } from './rows'

/**
 * P2.6b — TALKING TO POSTGRES, AND NOT OWNING THE CLIENT.
 *
 * `hydrateFrom`, `applyChanges` and `readGrantFrom` take the Supabase client as
 * an ARGUMENT rather than reaching for the app's one. That is not indirection
 * for its own sake: it is what lets `bun run write` drive THESE EXACT
 * FUNCTIONS — the ones the app runs, not a re-implementation of them — against
 * the real database with a signed-in test account, and so prove the round trip
 * that P2.6 could not otherwise prove at all.
 *
 * `./store` supplies `await getSupabase()`; the gate supplies its own client.
 * The type import above is erased at compile time and costs the bundle nothing;
 * `./client` is still the only module that IMPORTS the library.
 */

// --- Reading ---------------------------------------------------------------

/**
 * PostgREST answers at most 1 000 rows unless asked otherwise, and it does so
 * SILENTLY — a roster of 1 200 volunteers would come back as 1 000 and look
 * complete. So every read pages until a short page arrives.
 */
const PAGE = 1000

async function selectAll(client: SupabaseClient, table: string): Promise<Row[]> {
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

export async function hydrateFrom(client: SupabaseClient): Promise<StoreData> {
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
export async function readGrantFrom(
  client: SupabaseClient,
): Promise<{ role: Role; entityId: string | null } | null> {
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

/** One collection's worth of changes, as few statements as they allow. */
async function writeCollection(
  client: SupabaseClient,
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

export async function applyChanges(
  client: SupabaseClient,
  changes: StoreChange[],
): Promise<void> {
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

