import { COLLECTIONS } from '@core/backend'
import type { Collection } from '@core/backend'
import { _raw } from '@core/store'

import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'
import { MAPPINGS } from './rows'
import type { Mapping } from './rows'
import { refreshData } from './store'

/**
 * ORDRE DE NUIT 2026-09-02 (N3) — THE DEMO DATASET'S MARKER, AND ITS PURGE.
 *
 * ★ THE MARKER IS THE ID PREFIX `demo-`, on every aggregate of the demo
 *   dataset (`scripts/demo-data.ts`). Every child row hangs off one of them by
 *   a foreign key declared `on delete cascade`, so removing the whole dataset
 *   is twelve statements — one per aggregate root, parents deleted in reverse
 *   dependency order — and nothing else. Ids minted by the app (`nextId`)
 *   never carry that prefix, so the product owner's own entity, his settings
 *   and anything he creates from now on are untouched by construction.
 *
 * ★ AND IT NEVER LOOKS INTO THE BUCKETS. The demo portraits are
 *   `placeholder:` markers rendered on the device (`photoSource`), not
 *   objects in `photos`; the demo agreements name files that were never
 *   uploaded. There is nothing of the dataset's in storage to remove.
 *
 * Runs through the app's own signed-in client, under the coordinator's RLS
 * (`for all`), then re-hydrates so the screens show the emptied programme
 * without a reload.
 */

export const DEMO_PREFIX = 'demo-'

export const isDemoId = (id: string): boolean => id.startsWith(DEMO_PREFIX)

/** How much of what is on screen is demo data — for הגדרות to print. */
export function demoCounts(): { entities: number; volunteers: number; missions: number; total: number } {
  const data = _raw()
  const count = (c: Collection) => (data[c] as Array<{ id: string }>).filter((r) => isDemoId(r.id)).length
  const total = COLLECTIONS.reduce((s, c) => s + count(c), 0)
  return { entities: count('farms'), volunteers: count('volunteers'), missions: count('missions'), total }
}

/** The parent tables, in the order the purge deletes them. */
export const DEMO_PURGE_TABLES: string[] = [...COLLECTIONS]
  .reverse()
  .map((c) => (MAPPINGS[c] as Mapping<unknown>).table)

export async function purgeDemoData(): Promise<{ removed: number }> {
  if (!SUPABASE_CONFIGURED) return { removed: 0 }
  const client = await getSupabase()
  if (!client) throw new Error('no client')
  let removed = 0
  for (const table of DEMO_PURGE_TABLES) {
    const { error, count } = await client
      .from(table)
      .delete({ count: 'exact' })
      .like('id', `${DEMO_PREFIX}%`)
    if (error) throw new Error(`${table}: ${error.message}`)
    removed += count ?? 0
  }
  await refreshData()
  return { removed }
}
