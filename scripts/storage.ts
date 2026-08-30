/**
 * A71 — THE TWO PRIVATE BUCKETS (P2.4).
 *
 * P2.4's claim is that a photograph of a volunteer and a farmer's signed
 * agreement are not on the open internet, and that the only way to a byte is a
 * signed URL minted for somebody the database already decided may have it.
 *
 * ★ WHAT THIS GATE CAN AND CANNOT PROVE, stated up front because the gap is
 *   the honest part:
 *
 *   IT PROVES the anonymous half, completely and unambiguously — and
 *   "unambiguously" is the word that cost the thought. Both buckets are empty,
 *   so "refused" and "there is nothing there" look identical on most
 *   endpoints, exactly the trap P2.2's own migration comment records ("an
 *   empty table returning [] proves nothing at all"). One endpoint escapes it:
 *   the PUBLIC route. A public bucket answers a missing object with
 *   `NoSuchKey`; a PRIVATE bucket answers with `NoSuchBucket`, because for an
 *   anonymous caller the public route does not exist at all. That answer is
 *   independent of whether the bucket has anything in it, which is what makes
 *   it evidence rather than an absence.
 *
 *   IT CANNOT PROVE the role half — that a farmer reaches his own agreement
 *   and not his neighbour's, that a volunteer reaches the group he is standing
 *   with. That needs a signed-in caller, and the one account's password
 *   belongs to the product owner and must never reach this repository or an
 *   agent. It is verified by hand the first time he signs in, and it becomes a
 *   gate the day there is a disposable test account.
 *
 *   bun run storage
 */

const fileEnv: Record<string, string> = {}
const envFile = Bun.file('.env.real')
if (await envFile.exists()) {
  for (const line of (await envFile.text()).split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    fileEnv[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
}

const URL_ = process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL ?? ''
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

if (URL_ === '' || KEY === '') {
  console.error(
    '  A71 needs a Supabase project. Copy .env.example to .env.real, or export\n' +
      '  VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Both are public by design.',
  )
  process.exit(1)
}

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

const anon = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

const BUCKETS = ['photos', 'agreements']

console.log('A71 — the two private buckets: nothing is reachable anonymously')

// --------------------------------------------------------------- private ---
section('THE BUCKETS ARE PRIVATE — and this is the check that does not depend on them being empty')

for (const bucket of BUCKETS) {
  const res = await fetch(
    `${URL_}/storage/v1/object/public/${bucket}/probe/does-not-exist.bin`,
    { headers: { apikey: KEY } },
  )
  const body = await res.text()
  check(
    `\`${bucket}\` has no public route (NoSuchBucket, not NoSuchKey)`,
    body.includes('NoSuchBucket'),
    `${res.status} ${body.slice(0, 70)}`,
  )
}

// ------------------------------------------------------------ enumeration ---
section('NOTHING CAN BE ENUMERATED')

const bucketList = await fetch(`${URL_}/storage/v1/bucket`, { headers: anon })
const bucketBody = (await bucketList.text()).trim()
check(
  'an anonymous caller cannot list the buckets',
  bucketBody === '[]' || bucketList.status === 401 || bucketList.status === 403,
  `${bucketList.status} ${bucketBody.slice(0, 70)}`,
)

for (const bucket of BUCKETS) {
  const res = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: anon,
    body: JSON.stringify({ prefix: '', limit: 100 }),
  })
  const body = (await res.text()).trim()
  check(
    `an anonymous caller cannot list objects in \`${bucket}\``,
    body === '[]' || res.status === 401 || res.status === 403,
    `${res.status} ${body.slice(0, 70)}`,
  )
}

// ------------------------------------------------------------------ sign ---
section('NO SIGNED URL IS MINTED FOR A STRANGER')

for (const [bucket, path] of [
  ['photos', 'volunteers/vol-01/portrait.jpg'],
  ['photos', 'entities/ent-01/farm.jpg'],
  ['agreements', 'ent-01/agr-01.pdf'],
] as const) {
  const res = await fetch(`${URL_}/storage/v1/object/sign/${bucket}`, {
    method: 'POST',
    headers: anon,
    body: JSON.stringify({ expiresIn: 60, paths: [path] }),
  })
  const body = await res.text()
  // The batch endpoint answers 200 with `signedURL: null` per path; a mint
  // would put a `token=` bearing URL there. Anything containing one is a leak.
  check(
    `\`${bucket}/${path}\` is not signed for a stranger`,
    !body.includes('token='),
    `${res.status} ${body.slice(0, 90)}`,
  )
}

// ---------------------------------------------------------------- upload ---
section('AND NOTHING CAN BE PUT IN')

for (const [bucket, path, type, payload] of [
  ['photos', 'volunteers/vol-01/a71-probe.png', 'image/png', 'not-a-png'],
  ['agreements', 'ent-01/a71-probe.pdf', 'application/pdf', 'not-a-pdf'],
] as const) {
  const res = await fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': type },
    body: payload,
  })
  const body = await res.text()
  check(
    `an anonymous upload to \`${bucket}\` is refused`,
    res.status === 400 || res.status === 401 || res.status === 403,
    `${res.status} ${body.slice(0, 70)}`,
  )
}

console.log('')
console.log('  NOT PROVEN HERE, and it is not an oversight: that a FARMER reaches his own')
console.log('  agreement and not his neighbour\'s, and that a VOLUNTEER reaches the group he')
console.log('  is standing with. Both need a signed-in caller, and the one account\'s password')
console.log('  belongs to the product owner. Verified by hand at first sign-in; a gate the day')
console.log('  a disposable test account exists.')

console.log('')
if (failed === 0) {
  console.log(`  All ${passed} checks passed.`)
} else {
  console.log(`  ${failed} of ${passed + failed} checks FAILED.`)
  process.exit(1)
}
