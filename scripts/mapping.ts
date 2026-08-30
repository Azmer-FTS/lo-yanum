import { readFileSync, readdirSync } from 'node:fs'

import { COLLECTIONS } from '../src/core/backend'
import type { Collection, StoreData } from '../src/core/backend'
import { DEMO_BACKEND } from '../src/core/demo'
import { MAPPINGS, tablesOf } from '../src/data/rows'
import type { Mapping, Row } from '../src/data/rows'

/**
 * A74 — THE 26 TABLES AND THE NESTED MODEL SAY THE SAME THING (P2.6b).
 *
 * `@core/types` is a nested domain model; Postgres holds the same facts as 26
 * flat tables. `src/data/rows.ts` is the translation, and it is 26 hand-written
 * column lists — which is exactly the kind of code that is 98 % right and whose
 * missing 2 % is a farmer's phone number that silently stops arriving.
 *
 * So every aggregate in the fixtures — 12 farms with their contacts and
 * commitments, 300 volunteers, every guard with its presence marks and its
 * cars, every drawn ring — goes out through `toRows` and back through
 * `fromRows`, and any difference fails the run. No network, no database, no
 * dev server: this is a claim about the mapping, and a claim about the mapping
 * should not need Frankfurt to answer.
 *
 * ★ THE ONE FAMILY OF DIFFERENCES THIS GATE ALLOWS, and it is listed rather
 *   than tolerated: three fields on `Farm` are OPTIONAL in the domain model
 *   (`entityKind`, `farmDunamsManual`, `grazingDunamsManual` — added after the
 *   fixtures, absent on most of them) and NOT NULL in the schema. Absent reads
 *   as 'farm' / false everywhere in the app (`entityKindOf`, G15's writer), so
 *   the column stores that default and the round trip hands it back explicitly.
 *   `canon` below applies the same defaults to both sides, and to nothing else:
 *   every other field must come back byte-for-byte.
 *
 *   bun run mapping
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

/**
 * The optional-field defaults, applied to BOTH sides. Deliberately the only
 * normalisation in this file: anything else that needs "adjusting" to make the
 * comparison pass is a mapping bug wearing a disguise.
 */
function canon(collection: Collection, value: unknown): unknown {
  const v = JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  if (collection === 'farms') {
    v.entityKind ??= 'farm'
    v.farmDunamsManual ??= false
    v.grazingDunamsManual ??= false
  }
  return v
}

/** A stable stringification, so key order cannot make two equal things differ. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      )
    }
    return val
  })
}

/** The first field that differs, so a failure names the column, not the row. */
function firstDifference(a: unknown, b: unknown, path = ''): string | null {
  if (stable(a) === stable(b)) return null
  const oa = a as Record<string, unknown>
  const ob = b as Record<string, unknown>
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return `${path || '(root)'}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`
  }
  const keys = new Set([...Object.keys(oa), ...Object.keys(ob)])
  for (const k of keys) {
    const deeper = firstDifference(oa[k], ob[k], path ? `${path}.${k}` : k)
    if (deeper) return deeper
  }
  return `${path || '(root)'}: ${stable(a)} ≠ ${stable(b)}`
}

/** What the database would answer: the child rows, grouped by table. */
function childrenOf(mapping: Mapping<unknown>, written: Array<{ table: string; rows: Row[] }>) {
  const grouped: Record<string, Row[]> = {}
  for (const { table, rows } of written) {
    if (table === mapping.table) continue
    grouped[table] = rows
  }
  return grouped
}

// ===========================================================================

console.log('\n  A74 — the nested model and the 26 tables, in both directions (P2.6b)')

const data: StoreData = DEMO_BACKEND.seed()

// --- 1. Every collection has a mapping, and it names real tables ------------

section('1 — twelve collections, twelve mappings')

check(
  'every collection in COLLECTIONS has a mapping',
  COLLECTIONS.every((c) => MAPPINGS[c] !== undefined),
  `${COLLECTIONS.length} collections`,
)
{
  const tables = new Set<string>()
  for (const c of COLLECTIONS) for (const t of tablesOf(c)) tables.add(t)
  check(
    'and between them they cover the schema',
    tables.size === 25,
    `${tables.size} tables (26 minus app_users, which is identity, not data)`,
  )
  check(
    'app_users is NOT one of them',
    !tables.has('app_users'),
    'who a login speaks for is not an aggregate the app writes',
  )
}
{
  // The parent table's primary key must be the aggregate's id, or an upsert
  // would create a second row every time somebody edits a farm.
  let ok = true
  for (const c of COLLECTIONS) {
    const mapping = MAPPINGS[c] as Mapping<unknown>
    const rows = data[c] as Array<{ id: string }>
    if (rows.length === 0) continue
    const written = mapping.toRows(rows[0])
    const parent = written.find((w) => w.table === mapping.table)
    if (!parent || parent.rows.length !== 1 || parent.rows[0].id !== rows[0].id) ok = false
  }
  check('each aggregate writes exactly one parent row, keyed by its own id', ok)
}

// --- 2. The round trip, over every aggregate in the fixtures ---------------

section('2 — every aggregate in the fixtures survives the round trip')

let total = 0
for (const collection of COLLECTIONS) {
  const mapping = MAPPINGS[collection] as Mapping<unknown>
  const rows = data[collection] as unknown[]
  let broken: string | null = null
  let brokenId = ''

  for (const original of rows) {
    const written = mapping.toRows(original)
    const parent = written.find((w) => w.table === mapping.table)?.rows[0]
    if (!parent) {
      broken = 'no parent row written'
      brokenId = (original as { id: string }).id
      break
    }
    const back = mapping.fromRows(parent, childrenOf(mapping, written))
    const diff = firstDifference(canon(collection, original), canon(collection, back))
    if (diff) {
      broken = diff
      brokenId = (original as { id: string }).id
      break
    }
    total++
  }

  check(
    `${collection} — ${rows.length} aggregate${rows.length === 1 ? '' : 's'}`,
    broken === null,
    broken ? `${brokenId} → ${broken.slice(0, 110)}` : tablesOf(collection).join(' + '),
  )
}
{
  // Not a size claim — a coverage one. The loop above stops a collection at its
  // first bad aggregate, so "everything passed" and "everything was tried" are
  // different statements and only the second one is worth printing.
  const available = COLLECTIONS.reduce((n, c) => n + (data[c] as unknown[]).length, 0)
  check(
    'every aggregate in the fixtures was actually tried',
    total === available,
    `${total} of ${available}`,
  )
}

// --- 3. The cases the fixtures might not happen to contain -----------------

section('3 — the shapes a fixture set can silently lack')

{
  const withMarks = data.missions.find((m) =>
    m.assignments.some((a) => a.outbound.driver !== null && a.outbound.group !== null),
  )
  check(
    'a guard where two channels both marked the same person',
    withMarks !== undefined,
    withMarks?.id ?? 'ABSENT — R6 mismatch detection is untested by this gate',
  )
  const mismatch = data.missions.find((m) =>
    m.assignments.some(
      (a) =>
        a.outbound.driver !== null &&
        a.outbound.group !== null &&
        a.outbound.driver !== a.outbound.group,
    ) ||
    m.assignments.some(
      (a) =>
        a.inbound.driver !== null &&
        a.inbound.group !== null &&
        a.inbound.driver !== a.inbound.group,
    ),
  )
  check(
    'and one where they DISAGREE — the mark rows must not merge',
    mismatch !== undefined,
    mismatch?.id ?? 'ABSENT',
  )
}
{
  const twoCars = data.missions.find((m) => m.drivers.length > 1)
  check(
    'G5.3 — a guard with two cars, so passenger lists cannot be flattened',
    twoCars !== undefined,
    twoCars?.id ?? 'ABSENT',
  )
  const additional = data.missions.find((m) => m.additionalAnchorPointIds.length > 0)
  check(
    'F2 — a guard covering more than the rendezvous',
    additional !== undefined,
    additional ? `${additional.id}: +${additional.additionalAnchorPointIds.length}` : 'ABSENT',
  )
}
{
  const free = data.threatZones.find((z) => z.farmId === null)
  check(
    'G18 — a threat attached to no entity (the nullable FK is real)',
    free !== undefined,
    free?.id ?? 'ABSENT',
  )
}
{
  const linked = data.drivers.find((d) => d.volunteerId !== null)
  check('G5.2 — a driver who is also a volunteer', linked !== undefined, linked?.id ?? 'ABSENT')
}
{
  const commitments = data.farms.find((f) => f.commitments.length > 1)
  check(
    'a farm with more than one commitment — the ORDER is addressable data',
    commitments !== undefined,
    commitments ? `${commitments.id}: ${commitments.commitments.length}` : 'ABSENT',
  )
  if (commitments) {
    // The load-bearing one, spelled out: setCommitmentFulfilled(farmId, index)
    // means a reordering on the way back ticks the wrong commitment.
    const mapping = MAPPINGS.farms
    const written = mapping.toRows(commitments)
    const back = mapping.fromRows(
      written[0].rows[0],
      childrenOf(mapping as Mapping<unknown>, written),
    )
    check(
      'and it comes back in the SAME order — an index addresses the same thing',
      back.commitments.map((c) => `${c.kind}/${c.detail}`).join('|') ===
        commitments.commitments.map((c) => `${c.kind}/${c.detail}`).join('|'),
      back.commitments.map((c) => c.kind).join(' → '),
    )
  }
}

// --- 4. An empty aggregate is still a legal aggregate ----------------------

section('4 — the empty shapes, which is what the real app starts with')

{
  const mapping = MAPPINGS.missions
  const bare = {
    ...data.missions[0],
    additionalAnchorPointIds: [],
    assignments: [],
    drivers: [],
    outreach: [],
  }
  const written = mapping.toRows(bare)
  const back = mapping.fromRows(
    written[0].rows[0],
    childrenOf(mapping as Mapping<unknown>, written),
  )
  const diff = firstDifference(bare, back)
  check('a guard with no team, no car and no notice', diff === null, diff ?? 'identical')
  check(
    'and its child tables are written as empty sets, not skipped',
    written.length === 7,
    `${written.length} tables addressed`,
  )
}
{
  const mapping = MAPPINGS.farms
  const bare = {
    ...data.farms[0],
    contacts: [],
    commitments: [],
    agreements: [],
    photo: null,
    lastVisitAt: null,
    nextVisitAt: null,
  }
  const written = mapping.toRows(bare)
  const back = mapping.fromRows(
    written[0].rows[0],
    childrenOf(mapping as Mapping<unknown>, written),
  )
  const diff = firstDifference(canon('farms', bare), canon('farms', back))
  check('a farm with no contact, no commitment and no photo', diff === null, diff ?? 'identical')
}

// --- 5. The mapper's columns against the migrations in this repository -----

section('5 — every column the mapper writes exists, and every required one is written')

{
  /**
   * ★ THIS IS THE CHECK THAT WOULD HAVE CAUGHT THE DRIFT ON ITS OWN.
   *
   * P0bis.5a put an `email` on three types and P0bis.5b put an `event` on the
   * outreach notice; neither reached the schema, and nothing noticed for a
   * fortnight because the app was still running on the mock store and had
   * never tried to write a volunteer's address to Postgres. A round trip
   * through `toRows`/`fromRows` cannot catch that either — it never touches
   * the database. So the migrations are parsed instead, and both directions
   * are asserted:
   *
   *   · a column the mapper writes that does not exist → a rejected INSERT the
   *     first time somebody edits that record, in production, offline;
   *   · a NOT NULL column with no default that the mapper does not write → the
   *     same rejection, from the other side.
   *
   * It parses OUR OWN migrations, which are ours to keep parseable. It is not
   * a general SQL reader and does not need to be.
   */
  const sql = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'))
    .join('\n')
    // Strip line comments: several of them contain the word `add column` in
    // prose, and a comment is not a schema.
    .replace(/^\s*--.*$/gm, '')

  /** table → column → whether an INSERT may omit it. */
  const schema = new Map<string, Map<string, boolean>>()
  const columnsOf = (table: string): Map<string, boolean> => {
    let cols = schema.get(table)
    if (!cols) {
      cols = new Map()
      schema.set(table, cols)
    }
    return cols
  }

  const NOT_A_COLUMN = /^(primary|foreign|unique|constraint|check|exclude)\b/i
  for (const m of sql.matchAll(/create table (\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const cols = columnsOf(m[1])
    for (const line of m[2].split('\n')) {
      const body = line.trim().replace(/,$/, '')
      if (!body || NOT_A_COLUMN.test(body)) continue
      const name = body.split(/\s+/)[0]
      if (!/^\w+$/.test(name)) continue
      const required = /\bnot null\b/i.test(body) && !/\bdefault\b/i.test(body)
      cols.set(name, !required)
    }
  }
  for (const m of sql.matchAll(
    /alter table (\w+)\s+add column (?:if not exists )?(\w+)([^;]*);/g,
  )) {
    const required = /\bnot null\b/i.test(m[3]) && !/\bdefault\b/i.test(m[3])
    columnsOf(m[1]).set(m[2], !required)
  }

  check(
    'the migrations parsed into a schema at all',
    schema.size >= 26,
    `${schema.size} tables, ${[...schema.values()].reduce((n, c) => n + c.size, 0)} columns`,
  )

  /** Maintained by the database, never by the client. */
  const SERVER_OWNED = new Set(['created_at', 'updated_at'])

  const unknown: string[] = []
  const unwritten: string[] = []

  for (const collection of COLLECTIONS) {
    const mapping = MAPPINGS[collection] as Mapping<unknown>
    const sample = (data[collection] as unknown[])[0]
    if (sample === undefined) continue
    for (const { table, rows } of mapping.toRows(sample)) {
      const cols = schema.get(table)
      if (!cols) {
        unknown.push(`${table} (no such table)`)
        continue
      }
      const written = new Set(rows.length > 0 ? Object.keys(rows[0]) : [])
      // An aggregate whose child list happens to be empty in the fixtures
      // writes no row, so there is nothing to check against for that table.
      if (written.size > 0) {
        for (const column of written) {
          if (!cols.has(column)) unknown.push(`${table}.${column}`)
        }
        for (const [column, optional] of cols) {
          if (optional || SERVER_OWNED.has(column) || written.has(column)) continue
          unwritten.push(`${table}.${column}`)
        }
      }
    }
  }

  check(
    'every column the mapper writes exists in a migration',
    unknown.length === 0,
    unknown.length ? unknown.join(', ') : 'no phantom columns',
  )
  check(
    'and every NOT NULL column with no default is written',
    unwritten.length === 0,
    unwritten.length ? unwritten.join(', ') : 'no column would reject an insert',
  )
  check(
    'the P2.6 catch-up columns are present',
    ['volunteers', 'drivers', 'entity_contacts'].every((t) => schema.get(t)?.has('email')) &&
      schema.get('cancel_notices')?.has('event') === true &&
      schema.get('entity_commitments')?.has('position') === true,
    'email ×3, cancel_notices.event, entity_commitments.position',
  )
}

// ===========================================================================

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} checks passed.`)
