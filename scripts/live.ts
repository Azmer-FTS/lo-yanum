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
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ AP4.4 (2026-09-25) — LA SONDE ANONYME NE FONCTIONNE PLUS, ET C'EST LE
 *      DURCISSEMENT QUI MARCHE, PAS UNE PANNE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tout ce qui est écrit ci-dessus reposait sur un fait qui n'est plus vrai :
 * `anon` avait `select` sur les trente tables (par les privilèges PAR DÉFAUT
 * du schéma `public`, que personne n'avait accordés), et seule RLS retenait les
 * lignes. C'est ce qui permettait à `?select=` d'être résolu contre le schéma
 * et de rendre `[]`.
 *
 * AP publie une page où une clé `anon` est dans les mains de n'importe qui.
 * `20260925000300_revoke_anon_everywhere.sql` a donc retiré ces droits : une
 * lecture anonyme rend désormais **42501 — permission denied**, avant même
 * d'atteindre le schéma. Un anonyme n'apprend plus qu'une table existe.
 *
 * ★ CETTE PORTE FAIT DONC DEUX CHOSES SELON CE QU'ON LUI DONNE :
 *
 *   · AVEC LA SEULE CLÉ PUBLIABLE — elle vérifie que le refus est bien PAR
 *     DROIT (42501) et non seulement par politique, ce qui est une assertion
 *     PLUS FORTE que l'ancienne. Les sections de schéma sont alors SAUTÉES et
 *     le disent.
 *   · AVEC `SUPABASE_READ_KEY` (une clé de service, fournie par l'opérateur et
 *     jamais commise) — elle refait le contrôle de schéma d'origine, colonne
 *     par colonne et enum par enum.
 *
 *   bun run live
 *   SUPABASE_READ_KEY=<clé de service> bun run live
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

/**
 * ⚠️ LA CLÉ DE LECTURE EST FACULTATIVE ET N'EST JAMAIS DANS LE DÉPÔT. Sans
 *    elle, la porte ne peut plus lire le schéma — voir l'en-tête — et le dit
 *    au lieu de rendre quarante-sept rouges qui ne veulent rien dire.
 */
const READ_KEY = process.env.SUPABASE_READ_KEY ?? fileEnv.SUPABASE_READ_KEY ?? ''
const ANON_HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
const headers =
  READ_KEY === '' ? ANON_HEADERS : { apikey: READ_KEY, Authorization: `Bearer ${READ_KEY}` }

async function ask(query: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers })
  return { status: res.status, body: (await res.text()).trim() }
}

/** La même question, toujours posée en ANONYME, quoi qu'on ait donné. */
async function askAnon(query: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers: ANON_HEADERS })
  return { status: res.status, body: (await res.text()).trim() }
}

let skipped = 0
function skip(label: string, why: string): void {
  skipped++
  console.log(`  SKIP  ${label}  — ${why}`)
}

// ===========================================================================

console.log('\n  A75 — the LIVE schema against the mapper, anonymously (P2.6b)')
console.log(`  ${SUPABASE_URL}`)

// --- 1. The probe itself is sound ------------------------------------------

section('1 — AP4.4 : un anonyme est refusé PAR DROIT, sur chaque table')

/**
 * ★★ C'EST L'ASSERTION QUI A REMPLACÉ LA SONDE, ET ELLE EST PLUS FORTE.
 *    Avant AP, un anonyme recevait `[]` : la table existait, il n'en voyait
 *    pas les lignes. Désormais il reçoit 42501 : il n'apprend même pas qu'elle
 *    existe. Quatre tables choisies pour ce qu'elles porteraient si elles
 *    fuyaient — des personnes, des exploitations, un agenda, des réglages.
 */
for (const table of ['entities', 'volunteers', 'farm_visits', 'user_settings', 'aid_requests']) {
  /* ⚠️ `select=*` ET NON `select=id` : `user_settings` n'a pas de colonne
     `id`, et PostgREST résout la LISTE DES COLONNES contre son cache de schéma
     avant de toucher la base — il rendait donc 42703 (« colonne inconnue »)
     au lieu du 42501 qu'on veut mesurer. Une porte qui pose la mauvaise
     question obtient une mauvaise réponse et l'appelle un défaut. */
  const answer = await askAnon(`${table}?select=*&limit=1`)
  check(
    `${table} — un anonyme est refusé AVANT le schéma (42501)`,
    answer.status === 401 || (answer.status === 403 && answer.body.includes('42501')) ||
      answer.body.includes('42501'),
    `${answer.status} ${answer.body.slice(0, 50)}`,
  )
}

/* Et les trois verbes de la page publique répondent, eux. */
for (const fn of ['public_busy_intervals', 'public_agreement_template']) {
  const body = fn === 'public_busy_intervals'
    ? JSON.stringify({ from_at: new Date().toISOString(), to_at: new Date(Date.now() + 86_400_000).toISOString() })
    : '{}'
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...ANON_HEADERS, 'Content-Type': 'application/json' },
    body,
  })
  check(`${fn} — la page publique, elle, obtient une réponse`, res.ok, String(res.status))
}

const CAN_READ = await (async () => {
  if (READ_KEY === '') return false
  const probe = await ask('volunteers?select=id&limit=1')
  return probe.status === 200
})()

if (!CAN_READ) {
  console.log('')
  console.log('  ⚠️ SUPABASE_READ_KEY absente (ou sans droit de lecture) : les sections 2 à 4')
  console.log('     lisent le SCHÉMA, ce qu\'un anonyme ne peut plus faire depuis AP4.4.')
  console.log('     Relancer avec une clé de service pour les jouer.')
}

if (CAN_READ) {
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
}

// --- 2. Every column the mapper writes, table by table ---------------------

section('2 — every column src/data/rows.ts writes exists in the live schema')

const wanted = writtenColumns()

let probed = 0
for (const [table, columns] of CAN_READ ? [...wanted].sort(([a], [b]) => (a < b ? -1 : 1)) : []) {
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
if (CAN_READ) check('every table the mapper writes was probed', probed === wanted.size, `${probed} tables`)
else skip(`les ${wanted.size} tables du mapper`, 'lecture du schéma impossible en anonyme (AP4.4)')

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
    /* ★★ AO2 (2026-09-24) — NEUF, ET LA PORTE LE DEMANDE VRAIMENT. Cette
       ligne portait sept étiquettes et elle est restée VERTE après que
       `not_relevant_now` et `on_hold` eurent été ajoutés en base : elle ne
       posait la question que pour les sept qu'elle connaissait. Une porte qui
       ne demande pas la chose neuve ne peut pas la prouver. */
    /* AP4 — DIX : `incoming_request` ajouté en tête, comme dans `ALL_FARM_STATUSES`. */
    ['entities', 'status', ['incoming_request', 'to_contact', 'contacted', 'visited', 'verbal_ok', 'signed', 'active', 'declined', 'not_relevant_now', 'on_hold']],
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
  if (!CAN_READ) skip(`les ${cases.length} ensembles fermés`, 'lecture du schéma impossible en anonyme (AP4.4)')
  for (const [table, column, values] of CAN_READ ? cases : []) {
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

if (CAN_READ) {
  const answer = await ask('app_users?select=user_id,role,entity_ref&limit=1')
  check(
    'app_users has the three columns the data layer reads',
    answer.status === 200,
    answer.status === 200 ? '[]' : `${answer.status} ${answer.body.slice(0, 80)}`,
  )
} else {
  skip('app_users — les trois colonnes', 'lecture du schéma impossible en anonyme (AP4.4)')
}

/* ⚠️ CELLE-CI RESTE ANONYME EN TOUTE CIRCONSTANCE : c'est la question du
   brief (B1), et elle ne se pose qu'à un étranger. Depuis AP4.4 la réponse
   n'est plus « aucune ligne » mais « aucun droit », ce qui est mieux. */
{
  const answer = await askAnon('app_users?select=*&limit=1')
  check(
    'et un lecteur anonyme n\'obtient personne — ni même le fait qu\'une ligne existe',
    answer.body !== '[]' ? answer.body.includes('42501') : true,
    answer.body.slice(0, 60),
  )
}

// ===========================================================================

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(
  `  All ${checks} checks passed.${skipped > 0 ? ` (${skipped} sautés : voir l'en-tête, AP4.4)` : ''}`,
)
