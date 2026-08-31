import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import { COLLECTIONS } from '../src/core/backend'
import type { Collection } from '../src/core/backend'
import { applyChanges, hydrateFrom, readGrantFrom } from '../src/data/write'

import { fixtureChanges, fixtureData, fixtureDeletions, ownRows } from './fixture'

/**
 * A76 — THE WRITE PATH, END TO END, AGAINST THE REAL DATABASE.
 *
 * This is the one claim P2.6 could not make on its own. A73 proves every
 * mutation reports the right aggregates; A74 proves the mapper is lossless in
 * memory; A75 proves the live schema accepts every column and label the mapper
 * writes. None of them proves the sentence a coordinator cares about: **I
 * changed something, and it is still there.**
 *
 * So this signs in, writes a whole programme in miniature through
 * `applyChanges` — the function the app itself calls, not a copy of it — reads
 * it back through `hydrateFrom` — likewise — and compares. Then it deletes
 * everything it wrote and checks that the deletion took.
 *
 * ★ IT USES A DISPOSABLE ACCOUNT, AND THE PASSWORD IS NOT IN THIS REPOSITORY.
 *   `dov+test@serialkolors.com`, created by the product owner in Supabase's own
 *   dashboard on 2026-08-31 for this purpose alone. The password is read from
 *   `TEST_PASSWORD` or from `.env.test`, which is git-ignored. The product
 *   owner's OWN password is not involved and never will be (decision 70).
 *
 * ⚠️ **THE ACCOUNT MUST BE DELETED BEFORE P3.1 — the real import — AND SO MUST
 *   ITS GRANT ROW.** It carries `coordinator`, which is total read and write
 *   over every farmer's phone number and the threat layer. Today that is a
 *   grant over nothing, because the database is empty; from the first imported
 *   farm it is a second door onto the programme's data. The two steps are in
 *   `supabase/migrations/20260831000200_test_account_grant.sql`. When they are
 *   done, this gate fails at its first check, loudly — which is the intended
 *   end state, not a regression.
 *
 * ★ EVERY ID IT WRITES BEGINS `a76-`. That is what makes the cleanup a
 *   statement rather than a hope, and it is why the gate does not reuse the
 *   demo fixtures: those use `farm-01`, `vol-001` — exactly the ids a real
 *   import would use.
 *
 *   bun run write
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

async function readEnv(file: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const handle = Bun.file(file)
  if (!(await handle.exists())) return out
  for (const line of (await handle.text()).split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

const realEnv = await readEnv('.env.real')
const testEnv = await readEnv('.env.test')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? realEnv.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? realEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const TEST_EMAIL = process.env.TEST_EMAIL ?? testEnv.TEST_EMAIL ?? ''
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? testEnv.TEST_PASSWORD ?? ''

if (SUPABASE_URL === '' || SUPABASE_KEY === '') {
  console.error(
    '\n  A76 needs the project. Copy .env.example to .env.real, or export\n' +
      '  VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.\n',
  )
  process.exit(1)
}
if (TEST_EMAIL === '' || TEST_PASSWORD === '') {
  console.error(
    '\n  A76 needs the DISPOSABLE test account, and only that one.\n' +
      '  Put TEST_EMAIL and TEST_PASSWORD in .env.test (git-ignored), or export\n' +
      '  them. Never the product owner\'s own password — see decision 70.\n' +
      '\n  If the account has already been deleted before P3.1, that is the\n' +
      '  intended end state and this gate is meant to stop working.\n',
  )
  process.exit(1)
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

function firstDifference(a: unknown, b: unknown, path = ''): string | null {
  if (stable(a) === stable(b)) return null
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return `${path || '(root)'}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`
  }
  const oa = a as Record<string, unknown>
  const ob = b as Record<string, unknown>
  for (const k of new Set([...Object.keys(oa), ...Object.keys(ob)])) {
    const deeper = firstDifference(oa[k], ob[k], path ? `${path}.${k}` : k)
    if (deeper) return deeper
  }
  return `${path || '(root)'}: differs`
}

// ===========================================================================

console.log('\n  A76 — the write path, end to end, against the real database (P2.6b)')
console.log(`  ${SUPABASE_URL} as ${TEST_EMAIL}`)

const client: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

// --- 1. The door, and the grant behind it ----------------------------------

section('1 — signed in, and somebody')

{
  const { error } = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  check('the disposable test account signs in', error === null, error?.message ?? TEST_EMAIL)
  if (error) {
    console.log(
      '\n  Cannot continue without a session. If this account was deleted before\n' +
        '  P3.1, that is the intended end state — see the migration.\n',
    )
    process.exit(1)
  }
}
{
  const grant = await readGrantFrom(client)
  check(
    'app_users answers with a role — a login has become somebody',
    grant?.role === 'coordinator',
    grant ? `${grant.role} / ${grant.entityId ?? 'the programme'}` : 'NO ROW — the account is nobody',
  )
}

// --- 2. Nothing of the gate's is there yet ---------------------------------

section('2 — the database has no a76- record before this run')

let before = await hydrateFrom(client)
{
  const mine = ownRows(before)
  const stray = COLLECTIONS.filter((c) => mine[c].length > 0)
  check(
    'a previous run left nothing behind',
    stray.length === 0,
    stray.length ? `STRAY: ${stray.map((c) => `${c}×${mine[c].length}`).join(', ')}` : 'clean',
  )
}

// --- 3. Write it, read it back, compare ------------------------------------

section('3 — a whole programme in miniature, written and read back')

const intended = fixtureData()
{
  const changes = fixtureChanges()
  let error: string | null = null
  try {
    await applyChanges(client, changes)
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : String(e)
  }
  check(
    `applyChanges accepted ${changes.length} aggregates`,
    error === null,
    error ?? COLLECTIONS.filter((c) => (intended[c] as unknown[]).length > 0).join(', '),
  )
  if (error) {
    console.log('\n  Cannot compare what was not written.\n')
    process.exit(1)
  }
}

const roundTripped = await hydrateFrom(client)
{
  const mine = ownRows(roundTripped)
  for (const collection of COLLECTIONS) {
    const expected = intended[collection] as Array<{ id: string }>
    if (expected.length === 0) continue
    const actual = mine[collection] as Array<{ id: string }>
    const byId = new Map(actual.map((r) => [r.id, r]))
    const missing = expected.filter((r) => !byId.has(r.id)).map((r) => r.id)
    const diff =
      missing.length > 0
        ? `MISSING ${missing.join(', ')}`
        : (expected
            .map((r) => firstDifference(r, byId.get(r.id)))
            .find((d) => d !== null) ?? null)
    check(
      `${collection} — ${expected.length} written, ${actual.length} read back`,
      diff === null,
      diff ? diff.slice(0, 110) : 'identical',
    )
  }
}

// --- 4. The shapes that would survive a careless mapper ---------------------

section('4 — the details a round trip can lose without looking wrong')

{
  const mission = (ownRows(roundTripped).missions as Array<{ id: string }>).find(
    (m) => m.id === 'a76-mission',
  ) as (typeof intended.missions)[number] | undefined

  check('the guard came back at all', mission !== undefined)
  if (mission) {
    const two = mission.assignments.find((a) => a.volunteerId === 'a76-vol-2')
    check(
      'R6 — the driver and the group DISAGREE, and both marks survived',
      two?.outbound.driver === 'present' && two?.outbound.group === 'absent',
      `driver=${two?.outbound.driver} group=${two?.outbound.group}`,
    )
    check(
      'a mark that was never made is still absent, not invented',
      two?.inbound.driver === null && two?.outbound.self === null,
      `inbound.driver=${String(two?.inbound.driver)} outbound.self=${String(two?.outbound.self)}`,
    )
    check(
      'G5.3 — two cars, each with ITS OWN passengers in boarding order',
      mission.drivers.length === 2 &&
        mission.drivers[0].passengerVolunteerIds.join(',') === 'a76-vol-2,a76-vol-3' &&
        mission.drivers[1].passengerVolunteerIds.join(',') === 'a76-vol-1',
      mission.drivers.map((d) => `${d.driverId}:${d.passengerVolunteerIds.length}`).join(' '),
    )
    check(
      'F2 — the extra position, kept separate from the rendezvous',
      mission.anchorPointId === 'a76-post-gate' &&
        mission.additionalAnchorPointIds.join(',') === 'a76-post-tower',
      `${mission.anchorPointId} + ${mission.additionalAnchorPointIds.join(',')}`,
    )
    check(
      'P0bis.5b — three outreach events, and the un-sent one is still un-sent',
      mission.outreach.length === 3 &&
        mission.outreach.filter((n) => n.sentAt === null).length === 1,
      mission.outreach.map((n) => `${n.event}${n.sentAt ? '✓' : '…'}`).join(' '),
    )
    check(
      'the assignment order is the shortlist order the coordinator chose',
      mission.assignments.map((a) => a.volunteerId).join(',') ===
        'a76-vol-1,a76-vol-2,a76-vol-3',
      mission.assignments.map((a) => a.volunteerId).join(','),
    )
  }
}
{
  const farm = (ownRows(roundTripped).farms as Array<{ id: string }>)[0] as
    | (typeof intended.farms)[number]
    | undefined
  check(
    'the commitments came back IN ORDER — an index addresses the same thing',
    farm?.commitments.map((c) => c.kind).join(',') === 'shelter,water,food',
    farm?.commitments.map((c) => c.kind).join(',') ?? 'no farm',
  )
  check(
    'P0bis.5a — an address that exists, and one that deliberately does not',
    farm?.contacts[0].email === 'moshe@example.test' && farm?.contacts[1].email === '',
    `${farm?.contacts[0].email} / "${farm?.contacts[1].email}"`,
  )
  check(
    'G15 — the manual flag is a fact about who typed the number',
    farm?.farmDunamsManual === true && farm?.grazingDunamsManual === false,
    `${String(farm?.farmDunamsManual)} / ${String(farm?.grazingDunamsManual)}`,
  )
}
{
  const incident = (ownRows(roundTripped).incidents as Array<{ id: string }>)[0] as
    | (typeof intended.incidents)[number]
    | undefined
  check(
    'the incident log is in the order it happened, not in id order',
    incident?.entries.map((e) => e.id).join(',') === 'a76-ent-11,a76-ent-2',
    incident?.entries.map((e) => e.id).join(',') ?? 'no incident',
  )
}
{
  const vector = (ownRows(roundTripped).threatVectors as Array<{ id: string }>)[0] as
    | (typeof intended.threatVectors)[number]
    | undefined
  check(
    'G18 — a threat attached to no entity survives as attached to no entity',
    vector?.farmId === null,
    String(vector?.farmId),
  )
}

// --- 5. A second write of the same thing is an UPDATE, not a duplicate -----

section('5 — writing twice')

{
  const edited = fixtureData()
  edited.farms[0].notes = 'עודכן בריצה שנייה'
  edited.farms[0].contacts = [edited.farms[0].contacts[0]]
  edited.missions[0].drivers = [edited.missions[0].drivers[0]]

  await applyChanges(client, [
    { collection: 'farms', id: 'a76-farm', json: JSON.stringify(edited.farms[0]) },
    { collection: 'missions', id: 'a76-mission', json: JSON.stringify(edited.missions[0]) },
  ])
  const again = ownRows(await hydrateFrom(client))
  const farm = (again.farms as Array<{ id: string }>)[0] as (typeof intended.farms)[number]
  const mission = (again.missions as Array<{ id: string }>)[0] as
    (typeof intended.missions)[number]

  check('the entity was updated, not duplicated', again.farms.length === 1, `${again.farms.length}`)
  check('the new value is the one that is there', farm.notes === 'עודכן בריצה שנייה', farm.notes)
  check(
    'a REMOVED child is gone — the write replaces the set, it does not merge',
    farm.contacts.length === 1 && mission.drivers.length === 1,
    `${farm.contacts.length} contact(s), ${mission.drivers.length} car(s)`,
  )
  check(
    'and the passengers of the removed car went with it',
    mission.drivers[0].driverId === 'a76-drv-1',
    mission.drivers[0].driverId,
  )
}

// --- 6. Clean up, and prove it -------------------------------------------

section('6 — everything this run wrote is removed')

{
  let error: string | null = null
  try {
    await applyChanges(client, fixtureDeletions())
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : String(e)
  }
  check('the deletions were accepted', error === null, error ?? 'all twelve collections')

  const after = ownRows(await hydrateFrom(client))
  const left = COLLECTIONS.filter((c) => after[c].length > 0)
  check(
    'nothing with an a76- id is left in the database',
    left.length === 0,
    left.length ? `STILL THERE: ${left.map((c) => `${c}×${after[c].length}`).join(', ')}` : 'clean',
  )

  const total = await hydrateFrom(client)
  const rows = COLLECTIONS.reduce((n, c) => n + (total[c] as unknown[]).length, 0)
  check(
    'and the database is back exactly as this run found it',
    rows === COLLECTIONS.reduce((n, c) => n + (before[c] as unknown[]).length, 0),
    `${rows} aggregate(s) in total`,
  )
  before = total
}

await client.auth.signOut()

// ===========================================================================

console.log('')
console.log('  ⚠️  The account this gate uses is DISPOSABLE and must be deleted')
console.log('     before P3.1 (the real import) — the auth user AND its app_users')
console.log('     row. See supabase/migrations/20260831000200_test_account_grant.sql.')
console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} checks passed.`)
