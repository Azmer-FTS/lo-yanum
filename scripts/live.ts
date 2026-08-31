import { writtenColumns } from './samples'

/**
 * A75 — THE LIVE SCHEMA AND THE MAPPER AGREE, PROVED WITHOUT A PASSWORD.
 *
 * A74 (`bun run mapping`) checks the mapper against the migration FILES in this
 * repository. That is the right check for a repository and the wrong one for a
 * deployment: the files say what was written, not what was applied. A migration
 * that failed halfway, a column added by hand in the dashboard, a branch that
 * was never merged — all of them leave the repo saying yes and Frankfurt saying
 * no, and the first thing that notices is a coordinator whose edit vanishes.
 *
 * ★ THE PROBE IS ONE PROPERTY OF POSTGREST, AND IT IS WHAT MAKES THIS GATE
 *   POSSIBLE AT ALL. `?select=a,b,c` is PARSED AND RESOLVED AGAINST THE SCHEMA
 *   BEFORE ROW-LEVEL SECURITY IS APPLIED. So an anonymous request for a column
 *   that does not exist comes back 400 / 42703 naming it, while a request for
 *   columns that all exist comes back 200 with an EMPTY ARRAY — the rows being
 *   exactly what RLS refuses. Column existence is already public (these
 *   migrations are in a public repository); no row, no name and no phone number
 *   crosses the wire.
 *
 * So this gate needs **no password, no service-role key and no session** — the
 * same constraint that shaped A70, for the same reason: the coordinator's
 * password belongs to the product owner and must never reach this repository.
 *
 * It also re-asserts B1 from a second angle, and that assertion GROWS TEETH the
 * day P3 imports real data: today `[]` is what an empty table returns anyway,
 * but from the first imported farm onwards `[]` is RLS doing its job and a row
 * coming back is the leak.
 *
 *   bun run live
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

/** `.env.real` is not auto-loaded by anything — see `.env.example` for why. */
async function readEnvReal(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const file = Bun.file('.env.real')
  if (!(await file.exists())) return out
  for (const line of (await file.text()).split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

const fileEnv = await readEnvReal()
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

if (SUPABASE_URL === '' || SUPABASE_KEY === '') {
  console.error(
    '\n  A75 needs the project it is meant to check.\n' +
      '  Copy .env.example to .env.real, or export VITE_SUPABASE_URL and\n' +
      '  VITE_SUPABASE_PUBLISHABLE_KEY. Both values are public by design.\n',
  )
  process.exit(1)
}

const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }

async function ask(query: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers })
  return { status: res.status, body: (await res.text()).trim() }
}

// ===========================================================================

console.log('\n  A75 — the LIVE schema against the mapper, anonymously (P2.6b)')
console.log(`  ${SUPABASE_URL}`)

// --- 1. The probe itself is sound ------------------------------------------

section('1 — the probe, checked before anything is concluded from it')

{
  const missing = await ask('volunteers?select=this_column_does_not_exist&limit=1')
  check(
    'a column that does not exist is refused, and named',
    missing.status === 400 && missing.body.includes('42703'),
    `${missing.status} ${missing.body.slice(0, 60)}`,
  )
  const present = await ask('volunteers?select=id&limit=1')
  check(
    'a column that does exist is accepted',
    present.status === 200,
    `${present.status} ${present.body.slice(0, 40)}`,
  )
  check(
    'and answers with NO ROWS — the whole security model in one reply',
    present.body === '[]',
    present.body.slice(0, 60),
  )
}

// --- 2. Every column the mapper writes, table by table ---------------------

section('2 — every column src/data/rows.ts writes exists in the live schema')

const wanted = writtenColumns()

let probed = 0
for (const [table, columns] of [...wanted].sort(([a], [b]) => (a < b ? -1 : 1))) {
  if (columns.size === 0) {
    // A table nothing writes to, even after `samples.ts` tops the fixtures up.
    // Print the failure rather than a pass nobody checked anything for.
    check(`${table} — nothing to probe`, false, 'add a sample for it in scripts/samples.ts')
    continue
  }
  const list = [...columns].sort().join(',')
  const answer = await ask(`${table}?select=${list}&limit=1`)
  probed++
  check(
    `${table} — ${columns.size} column${columns.size === 1 ? '' : 's'}`,
    answer.status === 200 && answer.body === '[]',
    answer.status === 200 ? '[]' : `${answer.status} ${answer.body.slice(0, 90)}`,
  )
}
check('every table the mapper writes was probed', probed === wanted.size, `${probed} tables`)

// --- 3. The enums the mapper spells ---------------------------------------

section('3 — the closed sets, spelled the way the mapper spells them')

{
  // A Postgres enum rejects an unknown label on the way IN, which is the point
  // of using enums (schema note 2). A filter is the anonymous way to ask
  // whether a label parses: 200 means the value is in the type, 400 means the
  // mapper writes a word this column cannot hold.
  const cases: Array<[string, string, string[]]> = [
    ['cancel_notices', 'event', ['created', 'updated', 'cancelled']],
    ['cancel_notices', 'recipient_kind', ['volunteer', 'driver', 'farmer']],
    ['presence_marks', 'leg', ['outbound', 'inbound']],
    ['presence_marks', 'source', ['driver', 'group', 'self']],
    ['presence_marks', 'mark', ['present', 'absent']],
    ['entities', 'entity_kind', ['farm', 'moshav', 'other']],
    ['entities', 'status', ['to_contact', 'contacted', 'visited', 'verbal_ok', 'signed', 'active', 'declined']],
    ['missions', 'status', ['recruiting', 'planned', 'in_progress', 'completed', 'return_not_confirmed', 'cancelled']],
    ['missions', 'cancel_reason', ['no_volunteers', 'no_driver', 'farmer_request', 'weather', 'security_forces', 'other']],
    ['volunteers', 'phone_type', ['smartphone', 'kosher']],
    ['incidents', 'severity', ['observation', 'suspicious', 'urgent']],
    ['incidents', 'source', ['volunteer', 'farmer', 'coordinator']],
    ['zones', 'kind', ['farm_boundary', 'grazing_area']],
    ['threat_zones', 'intensity', ['low', 'medium', 'high']],
    ['entity_commitments', 'kind', ['shelter', 'water', 'food', 'other']],
    // PO POINT 6 — the head count's species list, live against the database.
    // A closed list is what keeps the funding totals addable, so a label the
    // app spells and Postgres has never heard of is a silent write failure.
    [
      'entity_livestock',
      'kind',
      ['cattle', 'sheep', 'goats', 'camels', 'horses', 'poultry', 'other'],
    ],
  ]
  for (const [table, column, values] of cases) {
    const answers = await Promise.all(
      values.map((v) => ask(`${table}?select=${column}&${column}=eq.${v}&limit=1`)),
    )
    const rejected = values.filter((_, i) => answers[i].status !== 200)
    check(
      `${table}.${column} — ${values.length} labels`,
      rejected.length === 0,
      rejected.length ? `REFUSED: ${rejected.join(', ')}` : values.join(' · '),
    )
  }
}

// --- 4. app_users, which is where a login becomes somebody -----------------

section('4 — the grant table, and what a stranger gets from it')

{
  const answer = await ask('app_users?select=user_id,role,entity_ref&limit=1')
  check(
    'app_users has the three columns the data layer reads',
    answer.status === 200,
    answer.status === 200 ? '[]' : `${answer.status} ${answer.body.slice(0, 80)}`,
  )
  check(
    'and an anonymous reader gets nobody — not even the fact that a row exists',
    answer.body === '[]',
    answer.body.slice(0, 60),
  )
}

// ===========================================================================

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} checks passed.`)
