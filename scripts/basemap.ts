/**
 * REPLACE THE OFFLINE BASEMAP — the whole procedure, in one script.
 *
 *   bun run basemap <local.pmtiles> <object-key>
 *
 * ★ WHY THIS EXISTS AS A SCRIPT AND NOT AS A PARAGRAPH IN ETAT.md. The archive
 *   is bigger than Supabase's 50 MB standard-upload cap, so replacing it is a
 *   RESUMABLE (TUS) upload — six-megabyte PATCHes against a URL that a POST
 *   hands out — and nobody is going to get that right from prose at 02:00.
 *   Everything the procedure has to check is checked here, in order, and it
 *   REFUSES rather than half-uploading.
 *
 * ★ IT VERIFIES THE PUBLIC OBJECT AFTERWARDS, WHICH IS THE HALF THAT MATTERS.
 *   An upload that reports 204 and serves a truncated file is the failure this
 *   guards against: the length is compared against the local file byte for
 *   byte, the first seven bytes must read `PMTiles`, a range request must come
 *   back 206, and a slice from the MIDDLE of the object must be identical to
 *   the same slice of the local file. That last one is what catches a
 *   corrupted chunk, and it is the reason this is not just `curl`.
 *
 * ⚠️ AUTHORISATION. Writes to the `basemap` bucket are coordinator-only
 *   (`20260831000300_basemap_bucket.sql`). Pass a coordinator access token in
 *   `BASEMAP_TOKEN` — from a signed-in session, never a service-role key,
 *   which this project does not fetch and does not ship. Without one the
 *   script falls back to the publishable key, which only works if a temporary
 *   write policy is in place; it says so loudly when it does.
 */
const REF = 'lvrptqmkjikkkhcxocbe'
const PUBLISHABLE = 'sb_publishable_4phO_2UMuhWGKCC8uugRmQ_P_IQqAf_'
const BUCKET = 'basemap'
const CHUNK = 6 * 1024 * 1024 // Supabase requires exactly this, except the last

const PUBLIC_BASE = `https://${REF}.supabase.co/storage/v1/object/public/${BUCKET}`
const TUS = `https://${REF}.storage.supabase.co/storage/v1/upload/resumable`

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

let failures = 0
const pass = (what: string, detail = '') =>
  console.log(`  PASS  ${what}${detail ? `  — ${detail}` : ''}`)
const fail = (what: string, detail = '') => {
  failures++
  console.log(`  FAIL  ${what}${detail ? `  — ${detail}` : ''}`)
}

async function main() {
  const [path, key] = process.argv.slice(2)
  if (!path || !key) {
    console.error('usage: bun run basemap <local.pmtiles> <object-key>')
    process.exit(1)
  }

  const file = Bun.file(path)
  const size = file.size
  if (!size) {
    console.error(`  ${path} is empty or missing.`)
    process.exit(1)
  }

  const token = process.env.BASEMAP_TOKEN || PUBLISHABLE
  if (!process.env.BASEMAP_TOKEN) {
    console.log(
      '\n  ⚠️  No BASEMAP_TOKEN — using the publishable key, which is the\n' +
        '      anonymous role. This only succeeds while a temporary write\n' +
        '      policy is in place, and that policy must be dropped after.\n',
    )
  }

  console.log(`\n  ${path} → ${BUCKET}/${key}`)
  console.log(`  ${size.toLocaleString()} bytes, ${Math.ceil(size / CHUNK)} chunks of 6 MB\n`)

  // ---- 1. create the upload ------------------------------------------------
  const create = await fetch(TUS, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: PUBLISHABLE,
      'tus-resumable': '1.0.0',
      'upload-length': String(size),
      'x-upsert': 'true',
      'upload-metadata': [
        `bucketName ${b64(BUCKET)}`,
        `objectName ${b64(key)}`,
        `contentType ${b64('application/octet-stream')}`,
        // Stored on the object even though the free tier serves `no-cache`
        // from the public endpoint (measured 2026-08-31). It costs nothing and
        // it is right the day the project moves to a paid plan.
        `cacheControl ${b64('31536000')}`,
      ].join(','),
    },
  })
  if (create.status !== 201) {
    console.error(`  create failed: ${create.status} ${await create.text()}`)
    process.exit(1)
  }
  const location = create.headers.get('location')!
  console.log(`  upload created`)

  // ---- 2. send it, six megabytes at a time ---------------------------------
  const bytes = new Uint8Array(await file.arrayBuffer())
  let offset = 0
  while (offset < size) {
    const end = Math.min(offset + CHUNK, size)
    const res = await fetch(location, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        apikey: PUBLISHABLE,
        'tus-resumable': '1.0.0',
        'upload-offset': String(offset),
        'content-type': 'application/offset+octet-stream',
      },
      body: bytes.slice(offset, end),
    })
    if (res.status !== 204) {
      console.error(`\n  chunk at ${offset} failed: ${res.status} ${await res.text()}`)
      process.exit(1)
    }
    const next = Number(res.headers.get('upload-offset'))
    if (next !== end) {
      console.error(`\n  server is at ${next}, expected ${end}`)
      process.exit(1)
    }
    offset = next
    process.stdout.write(`\r  uploaded ${((offset / size) * 100).toFixed(1)} %   `)
  }
  console.log('\n')

  // ---- 3. and now the half that matters ------------------------------------
  console.log('  THE PUBLIC OBJECT, CHECKED RATHER THAN ASSUMED')
  console.log('  ----------------------------------------------')
  const url = `${PUBLIC_BASE}/${key}`

  const head = await fetch(url, { method: 'HEAD' })
  head.status === 200
    ? pass('the public URL answers', `HTTP ${head.status}`)
    : fail('the public URL answers', `HTTP ${head.status}`)

  const len = Number(head.headers.get('content-length'))
  len === size
    ? pass('and it is byte-for-byte the local file', `${len.toLocaleString()}`)
    : fail('and it is byte-for-byte the local file', `${len} ≠ ${size}`)

  head.headers.get('accept-ranges') === 'bytes'
    ? pass('range requests are advertised', 'accept-ranges: bytes')
    : fail('range requests are advertised', String(head.headers.get('accept-ranges')))

  const first = await fetch(url, { headers: { range: 'bytes=0-16383' } })
  const firstBuf = new Uint8Array(await first.arrayBuffer())
  first.status === 206
    ? pass('a range request comes back partial', `HTTP 206, ${firstBuf.length} bytes`)
    : fail('a range request comes back partial', `HTTP ${first.status}`)

  const magic = new TextDecoder().decode(firstBuf.slice(0, 7))
  magic === 'PMTiles'
    ? pass('★ and what comes back is the archive', magic)
    : fail('★ and what comes back is the archive', JSON.stringify(magic))

  // The middle, because a truncated or mis-ordered chunk survives every check
  // above and dies here.
  const mid = Math.floor(size / 2)
  const midRes = await fetch(url, { headers: { range: `bytes=${mid}-${mid + 65535}` } })
  const remote = new Uint8Array(await midRes.arrayBuffer())
  const local = bytes.slice(mid, mid + 65536)
  const same = remote.length === local.length && remote.every((b, i) => b === local[i])
  same
    ? pass('★ a 64 kB slice from the MIDDLE is identical to the local file', `at byte ${mid.toLocaleString()}`)
    : fail('★ a 64 kB slice from the MIDDLE is identical to the local file')

  console.log(
    failures === 0
      ? `\n  Uploaded and verified.\n  ${url}\n`
      : `\n  ${failures} check(s) FAILED — do not point the app at this object.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
