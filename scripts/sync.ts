import { COLLECTIONS } from '../src/core/backend'
import type { StoreChange } from '../src/core/backend'
import { DEMO_BACKEND } from '../src/core/demo'
import {
  flushOutbox,
  keyOf,
  memoryCache,
  restoreSnapshot,
  snapshotRecords,
  toRecords,
} from '../src/data/cache'

/**
 * A77 — THE OFFLINE DATA LAYER'S RULES (P2.5b).
 *
 * The cache and the outbox are the part of this app that runs where nobody is
 * watching: a coordinator on a farm track at 02:00 with no signal, whose next
 * three hours of work exist only on his own device. Every rule below is a
 * promise made to that situation, and each one is asserted here rather than
 * argued for in a comment nobody re-reads.
 *
 * It drives the real functions against `memoryCache()`, which satisfies the
 * same `CacheStore` contract IndexedDB does — so what a browser is then left to
 * prove is only that IndexedDB works, which is one assertion rather than
 * twenty. No browser, no dev server, no network, no password.
 *
 *   bun run sync
 */

let failures = 0
let checks = 0

function check(label: string, ok: boolean, detail = ''): void {
  checks++
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string): void {
  console.log(`\n  ${title}`)
  console.log(`  ${'-'.repeat(68)}`)
}

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : val,
  )

const change = (id: string, note: string): StoreChange => ({
  collection: 'generalMeetings',
  id,
  json: JSON.stringify({
    id,
    title: note,
    at: '2026-08-31T04:00:00.000Z',
    endAt: '2026-08-31T05:00:00.000Z',
    location: '',
    person: '',
    note,
  }),
})

// ===========================================================================

console.log('\n  A77 — the read cache and the write outbox (P2.5b)')

// --- 1. The read cache -----------------------------------------------------

section('1 — what is on screen is what comes back after a cold start')

{
  const data = DEMO_BACKEND.seed()
  const records = snapshotRecords(data, '2026-08-31T04:00:00.000Z')
  const restored = restoreSnapshot(records)

  check('a snapshot survives being cached and restored', restored !== null)
  if (restored) {
    const broken = COLLECTIONS.filter(
      (c) => stable(restored[c]) !== stable(data[c]),
    )
    check(
      'every collection comes back identical',
      broken.length === 0,
      broken.length ? broken.join(', ') : `${records.length} aggregates`,
    )
    check(
      'and the session is NOT among them — identity is not cached data',
      restored.session.role === 'coordinator' && restored.session.entityId === null,
      `${restored.session.role}`,
    )
  }
}
{
  // ★ THE DISTINCTION THAT DECIDES WHAT THE FIRST FRAME SHOWS. "No cache"
  //   means fall through to the network and show a loading state; "cached and
  //   empty" means the database really is empty and the empty screens ARE the
  //   answer. Collapsing the two would make a first-ever launch look like a
  //   broken one, or a genuinely empty programme look like it is still loading.
  check('an empty cache answers null, not an empty snapshot', restoreSnapshot([]) === null)
  const emptyish = restoreSnapshot([
    { collection: 'farms', id: 'gone', json: null, at: '2026-08-31T04:00:00.000Z' },
  ])
  check(
    'a cache holding only tombstones restores an EMPTY snapshot, not null',
    emptyish !== null && emptyish.farms.length === 0,
    emptyish ? `${emptyish.farms.length} farms` : 'null',
  )
}

// --- 2. The outbox coalesces ----------------------------------------------

section('2 — six edits to one guard are one thing to send')

{
  const cache = memoryCache()
  const at = '2026-08-31T04:00:00.000Z'
  for (let i = 1; i <= 6; i++) {
    await cache.put('outbox', toRecords([change('meet-a', `edit ${i}`)], at))
  }
  const entries = await cache.getAll('outbox')
  check('six writes of the same aggregate leave ONE entry', entries.length === 1, `${entries.length}`)
  check(
    'and it is the LAST one — the only one last-write-wins was ever going to keep',
    (entries[0].json ?? '').includes('edit 6'),
    (entries[0].json ?? '').slice(0, 60),
  )
  await cache.put('outbox', toRecords([change('meet-b', 'another')], at))
  check(
    'a DIFFERENT aggregate is a second entry',
    (await cache.getAll('outbox')).length === 2,
  )
  check(
    'the key is what makes that work, and it is one function',
    keyOf({ collection: 'generalMeetings', id: 'meet-a' }) === 'generalMeetings/meet-a',
  )
}

// --- 3. Flushing ----------------------------------------------------------

section('3 — flushing, and what a failed flush must not do')

{
  const cache = memoryCache()
  // Deliberately inserted NEWEST FIRST, so "it happened to be in order" cannot
  // be the reason the next assertion passes.
  await cache.put('outbox', toRecords([change('meet-late', 'late')], '2026-08-31T09:00:00.000Z'))
  await cache.put('outbox', toRecords([change('meet-early', 'early')], '2026-08-31T04:00:00.000Z'))

  let seen: string[] = []
  const result = await flushOutbox(cache, (changes) => {
    seen = changes.map((c) => c.id)
    return Promise.resolve()
  })
  check(
    'the oldest goes first — the farm before the zone drawn on it',
    seen.join(',') === 'meet-early,meet-late',
    seen.join(','),
  )
  check('a successful flush reports what it sent', result.sent === 2, `${result.sent}`)
  check('and empties the outbox', (await cache.getAll('outbox')).length === 0)
  check('nothing left to report', result.pending === 0 && result.failed === null)
}
{
  const cache = memoryCache()
  await cache.put('outbox', toRecords([change('meet-a', 'a'), change('meet-b', 'b')], '2026-08-31T04:00:00.000Z'))

  const result = await flushOutbox(cache, () => Promise.reject(new Error('offline')))
  check('a failed flush sends nothing', result.sent === 0, `${result.sent}`)
  check(
    '★ AND KEEPS EVERYTHING — an entry is removed only once the server has it',
    (await cache.getAll('outbox')).length === 2,
    `${(await cache.getAll('outbox')).length} still waiting`,
  )
  check('the badge gets its number', result.pending === 2, `${result.pending}`)
  check('and the reason is carried, not swallowed', result.failed === 'offline', result.failed ?? '')

  // The retry, once the network is back.
  const retry = await flushOutbox(cache, () => Promise.resolve())
  check('a retry sends what the failure kept', retry.sent === 2, `${retry.sent}`)
  check('and the outbox is finally empty', (await cache.getAll('outbox')).length === 0)
}
{
  const cache = memoryCache()
  const result = await flushOutbox(cache, () => Promise.reject(new Error('never called')))
  check(
    'flushing an empty outbox does not reach the network at all',
    result.sent === 0 && result.pending === 0 && result.failed === null,
  )
}

// --- 4. Deletions ---------------------------------------------------------

section('4 — a deletion is a thing to remember, not a thing to forget')

{
  const cache = memoryCache()
  const at = '2026-08-31T04:00:00.000Z'
  await cache.put('aggregates', toRecords([change('meet-a', 'a')], at))
  await cache.put('aggregates', toRecords([{ collection: 'generalMeetings', id: 'meet-a', json: null }], at))

  const records = await cache.getAll('aggregates')
  check('the tombstone REPLACES the row rather than adding to it', records.length === 1, `${records.length}`)
  check('and it is a tombstone', records[0].json === null)

  const restored = restoreSnapshot(records)
  check(
    'a restored snapshot does not resurrect it',
    restored !== null && restored.generalMeetings.length === 0,
    `${restored?.generalMeetings.length ?? -1} meetings`,
  )

  let sent: Array<string | null> = []
  await cache.put('outbox', records)
  await flushOutbox(cache, (changes) => {
    sent = changes.map((c) => c.json)
    return Promise.resolve()
  })
  check(
    'and the outbox carries it to the server AS a deletion',
    sent.length === 1 && sent[0] === null,
    `json=${String(sent[0])}`,
  )
}

// --- 5. The two stores are independent ------------------------------------

section('5 — signing out empties the device; losing the network does not')

{
  const cache = memoryCache()
  const at = '2026-08-31T04:00:00.000Z'
  await cache.put('aggregates', toRecords([change('meet-a', 'a')], at))
  await cache.put('outbox', toRecords([change('meet-b', 'b')], at))

  await cache.clear('aggregates')
  check(
    'the read cache can be cleared without touching the outbox',
    (await cache.getAll('aggregates')).length === 0 &&
      (await cache.getAll('outbox')).length === 1,
    'hydration re-records the cache; it must not lose pending writes doing it',
  )

  await cache.clear()
  check(
    'and an explicit sign-out clears BOTH',
    (await cache.getAll('aggregates')).length === 0 &&
      (await cache.getAll('outbox')).length === 0,
    'leaving deliberately leaves nothing for the next person on a shared iPad',
  )
}

// --- 6. Every collection is cacheable -------------------------------------

section('6 — nothing is quietly left out of the cache')

{
  const data = DEMO_BACKEND.seed()
  const records = snapshotRecords(data, '2026-08-31T04:00:00.000Z')
  const covered = new Set(records.map((r) => r.collection))
  const missing = COLLECTIONS.filter((c) => (data[c] as unknown[]).length > 0 && !covered.has(c))
  check(
    'every non-empty collection is in the cache',
    missing.length === 0,
    missing.length ? missing.join(', ') : `${covered.size} of ${COLLECTIONS.length}`,
  )
  check(
    'and every record is addressable by its own key',
    new Set(records.map(keyOf)).size === records.length,
    `${records.length} records, ${new Set(records.map(keyOf)).size} keys`,
  )
}

// ===========================================================================

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} checks passed.`)
