import { COLLECTIONS } from '../src/core/backend'
import type { StoreData } from '../src/core/backend'
import { DEMO_BACKEND } from '../src/core/demo'
import { MAPPINGS } from '../src/data/rows'
import type { Mapping } from '../src/data/rows'

/**
 * EVERY COLUMN THE MAPPER CAN WRITE, TABLE BY TABLE.
 *
 * Shared by A74 (`mapping`, against the migration files) and A75 (`live`,
 * against the deployed schema) because they ask the same question of two
 * different answerers, and a column list that drifted between them would make
 * one of the two gates quietly narrower than it reads.
 *
 * ★ IT SCANS EVERY AGGREGATE, AND THEN TOPS THE FIXTURES UP. Reading only the
 *   first record of each collection is the obvious version and it is wrong in
 *   a way that hides: an aggregate whose child list happens to be EMPTY writes
 *   no row to that child's table, so the table is never probed and its columns
 *   are never checked. `cancel_notices` is exactly that case — no fixture guard
 *   carries an outreach tick, because a tick is something a coordinator does
 *   rather than something a fixture is — and it is also the table P2.6's
 *   catch-up migration had to change. The one table nobody could see was the
 *   one that was wrong.
 *
 * So anything the fixtures cannot supply is supplied here, deliberately and by
 * name, rather than left to be a silent gap.
 */
export function writtenColumns(): Map<string, Set<string>> {
  const data: StoreData = DEMO_BACKEND.seed()
  const columns = new Map<string, Set<string>>()

  const record = (table: string, keys: string[]): void => {
    const set = columns.get(table) ?? new Set<string>()
    for (const key of keys) set.add(key)
    columns.set(table, set)
  }

  const scan = (mapping: Mapping<unknown>, aggregate: unknown): void => {
    for (const { table, rows } of mapping.toRows(aggregate)) {
      // Register the table even with no rows, so a table that is NEVER filled
      // shows up as an empty set the caller can complain about.
      record(table, [])
      for (const row of rows) record(table, Object.keys(row))
    }
  }

  for (const collection of COLLECTIONS) {
    const mapping = MAPPINGS[collection] as Mapping<unknown>
    for (const aggregate of data[collection] as unknown[]) scan(mapping, aggregate)
  }

  // --- The top-ups, each one named -----------------------------------------

  // `cancel_notices`: no fixture guard has been ticked off, so give one all
  // three events and both nullable/non-null shapes of `sent_at`.
  const mission = data.missions[0]
  scan(MAPPINGS.missions as Mapping<unknown>, {
    ...mission,
    outreach: [
      { event: 'created', recipientKind: 'volunteer', recipientId: 'vol-001', sentAt: mission.createdAt },
      { event: 'updated', recipientKind: 'driver', recipientId: 'drv-01', sentAt: mission.createdAt },
      { event: 'cancelled', recipientKind: 'farmer', recipientId: 'contact-01a', sentAt: null },
    ],
  })

  return columns
}
