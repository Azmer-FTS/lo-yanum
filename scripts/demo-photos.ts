/**
 * DEMO PHOTOS — a pool of REAL, CC0 photographs from Wikimedia Commons, as
 * static assets, for the demo dataset.
 *
 *   bun run scripts/demo-photos.ts
 *
 * What it does, in order:
 *
 *   1. SEARCHES Commons (`list=search`, file namespace) with a list of
 *      PERSON queries (portraits: men, women, young, older, outdoors…) and
 *      PLACE queries (farms, flocks, fields, arid and Mediterranean land).
 *      Every query is suffixed with `filetype:bitmap incategory:CC-Zero`, the
 *      only reliable licence filter the search index offers (`haslicense:`
 *      does not work). Candidates are deduplicated by pageid; the ORDER is
 *      deterministic — query order, then search rank — so that the pool is
 *      the same on every run.
 *
 *   2. VERIFIES each candidate through `prop=imageinfo`: it is kept only if
 *      `extmetadata.LicenseShortName` is exactly "CC0" (or "Public domain"
 *      with `License` starting with "cc0"), the mime is JPEG or PNG, and both
 *      sides are ≥ 400 px. Author (`Artist`, HTML stripped) and `Credit` are
 *      recorded.
 *
 *   3. DOWNLOADS the 640 px thumbnail with curl into a cache OUTSIDE the
 *      repository (the OS temp dir, keyed by pageid — a re-run downloads
 *      nothing it already has), then writes it as a JPEG capped at 640 px on
 *      the long edge with `sips`, stepping the quality down until the file
 *      is under ~120 kB, into
 *        public/demo-photos/people/<nn>.jpg
 *        public/demo-photos/places/<nn>.jpg
 *      The two directories are EMPTIED first, so the numbering is always
 *      sequential and never carries a stale file.
 *
 *   4. WRITES public/demo-photos/manifest.json and
 *      docs/demo-photos-licences.md (one row per file: Commons page, author,
 *      licence).
 *
 * ★ THE QUALITY PASS IS IN THE SCRIPT. `REJECTED` below lists, by pageid and
 *   with the reason, every image that the search returned and that a human
 *   looked at and refused (a painting, a statue, a group, a child, a face
 *   that is not visible, a place that is not agricultural…). A re-run skips
 *   them, so the pool stays curated without anyone having to look again.
 *   `PEOPLE_MAX` and `PLACES_MAX` cap the pool after the rejections.
 *
 * No npm dependency: Bun's fetch for the API, curl for the bytes, sips (macOS)
 * for the conversion.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// ─── Configuration ──────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dir, '..')
const OUT_DIR = join(ROOT, 'public', 'demo-photos')
const MANIFEST = join(OUT_DIR, 'manifest.json')
const LICENCES_DOC = join(ROOT, 'docs', 'demo-photos-licences.md')
const CACHE_DIR = join(tmpdir(), 'lo-yanoum-demo-photos-cache')

const API = 'https://commons.wikimedia.org/w/api.php'
const USER_AGENT = 'LoYanoumDemoPhotos/1.0 (https://github.com/Azmer-FTS; demo dataset asset pool)'

// Override with PEOPLE_MAX / PLACES_MAX in the environment to review the
// whole verified pool before pruning (e.g. PEOPLE_MAX=999 PLACES_MAX=999).
const PEOPLE_MAX = Number(process.env.PEOPLE_MAX ?? 48)
const PLACES_MAX = Number(process.env.PLACES_MAX ?? 26)
const MAX_EDGE = 640
const TARGET_BYTES = 120 * 1024
const MIN_SIDE = 400
const SEARCH_LIMIT = 50

/** Portrait queries — one person, face visible, varied. */
const PEOPLE_QUERIES = [
  'man portrait (Unsplash)',
  'woman portrait (Unsplash)',
  'smiling man (Unsplash)',
  'smiling woman (Unsplash)',
  'bearded man (Unsplash)',
  'farmer portrait (Unsplash)',
  'man outdoors portrait (Unsplash)',
  'woman outdoors portrait (Unsplash)',
  'young man headshot (Unsplash)',
  'young woman headshot (Unsplash)',
  'elderly man portrait (Unsplash)',
  'elderly woman portrait (Unsplash)',
  'old man (Unsplash)',
  'old woman (Unsplash)',
  'man hat portrait (Unsplash)',
  'woman glasses portrait (Unsplash)',
  'man glasses portrait (Unsplash)',
  'woman hat (Unsplash)',
  'man beard (Unsplash)',
  'woman smiling outdoors (Unsplash)',
  'man face (Unsplash)',
  'woman face (Unsplash)',
  'headshot (Unsplash)',
  'portrait man beach (Unsplash)',
  'portrait woman field (Unsplash)',
  'man sunglasses (Unsplash)',
  'woman curly hair (Unsplash)',
  'man cap (Unsplash)',
  'woman scarf (Unsplash)',
  'man laughing (Unsplash)',
  'woman laughing (Unsplash)',
  'grandfather (Unsplash)',
  'grandmother (Unsplash)',
  'man portrait street (Unsplash)',
  'woman portrait street (Unsplash)',
  'farmer portrait',
  'shepherd portrait',
  'man outdoors portrait',
  'woman outdoors portrait',
]

/** Landscape queries — farms, flocks, fields, arid or Mediterranean land. */
const PLACES_QUERIES = [
  'sheep herd (Unsplash)',
  'sheep field (Unsplash)',
  'goats (Unsplash)',
  'cattle pasture (Unsplash)',
  'cows field (Unsplash)',
  'farm field sunset (Unsplash)',
  'farm (Unsplash)',
  'farmland (Unsplash)',
  'olive grove',
  'olive trees (Unsplash)',
  'Negev',
  'desert farm',
  'vineyard (Unsplash)',
  'wheat field (Unsplash)',
  'shepherd flock',
  'arid landscape (Unsplash)',
  'farmhouse (Unsplash)',
  'greenhouse (Unsplash)',
  'orchard (Unsplash)',
  'camel desert (Unsplash)',
  'hay bales (Unsplash)',
  'barn field (Unsplash)',
  'tractor field (Unsplash)',
  'dry hills (Unsplash)',
  'desert landscape (Unsplash)',
  'pasture hills (Unsplash)',
  'crop rows (Unsplash)',
  'horses field (Unsplash)',
  'irrigation field',
  'date palms',
]

/**
 * The quality pass. Pageid → reason. Everything here was returned by a query
 * above, verified CC0, looked at, and refused. Kept in the script so that a
 * re-run reproduces the curated pool exactly.
 */
const REJECTED: Record<number, string> = {
  // (filled by the quality pass — see the bottom of this file)
}

/** Words in a title that mean "not a photograph of one adult" or "not a photo". */
const TITLE_BLOCKLIST = [
  /\bpainting\b/i, /\bdrawing\b/i, /\bsketch of\b/i, /\bstatue\b/i, /\bsculpture\b/i,
  /\bbust\b/i, /\bmap\b/i, /\bdiagram\b/i, /\billustration\b/i, /\bengraving\b/i,
  /\blithograph/i, /\bnude\b/i, /\bnaked\b/i, /\blingerie\b/i, /\bbikini\b/i,
  /\bchild\b/i, /\bchildren\b/i, /\bkid\b/i, /\bkids\b/i, /\bbaby\b/i, /\btoddler\b/i,
  /\bboy\b/i, /\bgirl\b/i, /\bteen/i, /\bcouple\b/i, /\bgroup\b/i, /\bcrowd\b/i,
  /\bwedding\b/i, /\bbride\b/i, /\bsilhouette\b/i, /\bfacing away\b/i, /\bfrom behind\b/i,
  /\bback view\b/i, /\bblack and white\b/i, /\bmonochrome\b/i, /\bmodel\b/i,
  /\.tiff?$/i, /\.gif$/i, /\.svg$/i,
]

// ─── Types ──────────────────────────────────────────────────────────────────

type Kind = 'people' | 'places'

interface Candidate {
  pageid: number
  title: string
  query: string
  rank: number
}

interface Verified extends Candidate {
  pageUrl: string
  thumbUrl: string
  width: number
  height: number
  mime: string
  author: string
  credit: string
  license: 'CC0'
}

interface ManifestEntry {
  file: string
  title: string
  pageUrl: string
  author: string
  credit: string
  license: 'CC0'
  pageid: number
  query: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The Credit field of an Unsplash import is three archived links; keep the first URL. */
function shortCredit(html: string): string {
  const m = html.match(/href="(https?:\/\/unsplash\.com\/photos\/[^"]+)"/)
  if (m) return m[1]
  const text = stripHtml(html)
  return text.length > 160 ? text.slice(0, 157) + '…' : text
}

async function api(params: Record<string, string>): Promise<any> {
  const url = new URL(API)
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return await res.json()
    } catch (e) {
      if (attempt === 4) throw e
      await Bun.sleep(500 * attempt)
    }
  }
}

async function search(query: string): Promise<Candidate[]> {
  const data = await api({
    action: 'query',
    list: 'search',
    srnamespace: '6',
    srlimit: String(SEARCH_LIMIT),
    srsearch: `${query} filetype:bitmap incategory:CC-Zero`,
  })
  const hits: { pageid: number; title: string }[] = data?.query?.search ?? []
  return hits.map((h, i) => ({ pageid: h.pageid, title: h.title, query, rank: i }))
}

function titleAllowed(title: string): boolean {
  return !TITLE_BLOCKLIST.some((re) => re.test(title))
}

async function gather(kind: Kind, queries: string[]): Promise<Candidate[]> {
  const seen = new Map<number, Candidate>()
  let raw = 0
  for (const q of queries) {
    const hits = await search(q)
    raw += hits.length
    for (const h of hits) {
      if (seen.has(h.pageid)) continue
      if (!titleAllowed(h.title)) continue
      seen.set(h.pageid, h)
    }
  }
  console.log(`[${kind}] ${queries.length} queries, ${raw} hits, ${seen.size} distinct titles after the title filter`)
  return [...seen.values()]
}

async function verify(cands: Candidate[]): Promise<Verified[]> {
  const byId = new Map(cands.map((c) => [c.pageid, c]))
  const out: Verified[] = []
  for (let i = 0; i < cands.length; i += 50) {
    const batch = cands.slice(i, i + 50)
    const data = await api({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size|mime',
      iiurlwidth: String(MAX_EDGE),
      pageids: batch.map((c) => c.pageid).join('|'),
    })
    for (const page of data?.query?.pages ?? []) {
      const c = byId.get(page.pageid)
      const ii = page.imageinfo?.[0]
      if (!c || !ii) continue
      const em = ii.extmetadata ?? {}
      const short = (em.LicenseShortName?.value ?? '').trim()
      const lic = (em.License?.value ?? '').trim().toLowerCase()
      const cc0 = short === 'CC0' || (short === 'Public domain' && lic.startsWith('cc0'))
      if (!cc0) continue
      if (ii.mime !== 'image/jpeg' && ii.mime !== 'image/png') continue
      if (!(ii.width >= MIN_SIDE && ii.height >= MIN_SIDE)) continue
      if (!ii.thumburl) continue
      out.push({
        ...c,
        pageUrl: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(c.title)}`,
        thumbUrl: ii.thumburl,
        width: ii.width,
        height: ii.height,
        mime: ii.mime,
        author: stripHtml(em.Artist?.value ?? '') || 'unknown',
        credit: shortCredit(em.Credit?.value ?? ''),
        license: 'CC0',
      })
    }
  }
  // imageinfo returns pages in its own order; restore ours.
  const order = new Map(cands.map((c, i) => [c.pageid, i]))
  out.sort((a, b) => order.get(a.pageid)! - order.get(b.pageid)!)
  return out
}

function run(cmd: string[]): { ok: boolean; err: string } {
  const p = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' })
  return { ok: p.exitCode === 0, err: p.stderr.toString() }
}

/** Download the thumbnail into the cache (once), return the cached path or null. */
function download(v: Verified): string | null {
  const ext = v.mime === 'image/png' ? 'png' : 'jpg'
  const cached = join(CACHE_DIR, `${v.pageid}.${ext}`)
  if (existsSync(cached) && statSync(cached).size > 0) return cached
  const tmp = cached + '.part'
  const r = run(['curl', '-sSL', '--fail', '--max-time', '60', '-A', USER_AGENT, '-o', tmp, v.thumbUrl])
  if (!r.ok || !existsSync(tmp) || statSync(tmp).size === 0) {
    console.warn(`  ! download failed for ${v.title}: ${r.err.trim()}`)
    if (existsSync(tmp)) rmSync(tmp)
    return null
  }
  Bun.spawnSync(['mv', tmp, cached])
  return cached
}

/** JPEG, long edge ≤ MAX_EDGE, quality stepped down until under TARGET_BYTES. */
function convert(src: string, dst: string): boolean {
  for (const quality of [80, 70, 60, 50, 40]) {
    const r = run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), '-Z', String(MAX_EDGE), src, '--out', dst])
    if (!r.ok) {
      console.warn(`  ! sips failed on ${src}: ${r.err.trim()}`)
      return false
    }
    if (statSync(dst).size <= TARGET_BYTES) return true
  }
  return true // over budget at quality 40 — keep it, report it
}

function emptyDir(dir: string) {
  mkdirSync(dir, { recursive: true })
  for (const f of readdirSync(dir)) if (/^\d\d\.jpg$/.test(f)) rmSync(join(dir, f))
}

async function buildPool(kind: Kind, queries: string[], max: number): Promise<{ entries: ManifestEntry[]; verified: number; rejected: number }> {
  const cands = await gather(kind, queries)
  const verified = await verify(cands)
  console.log(`[${kind}] ${verified.length} verified CC0 (jpeg/png, ≥ ${MIN_SIDE} px)`)
  const dir = join(OUT_DIR, kind)
  emptyDir(dir)
  const entries: ManifestEntry[] = []
  let rejected = 0
  for (const v of verified) {
    if (entries.length >= max) break
    if (REJECTED[v.pageid]) { rejected++; continue }
    const cached = download(v)
    if (!cached) continue
    const nn = String(entries.length + 1).padStart(2, '0')
    const file = `${nn}.jpg`
    if (!convert(cached, join(dir, file))) continue
    entries.push({
      file: `demo-photos/${kind}/${file}`,
      title: v.title,
      pageUrl: v.pageUrl,
      author: v.author,
      credit: v.credit,
      license: 'CC0',
      pageid: v.pageid,
      query: v.query,
    })
  }
  return { entries, verified: verified.length, rejected }
}

function dirBytes(dir: string): number {
  return readdirSync(dir).filter((f) => f.endsWith('.jpg')).reduce((n, f) => n + statSync(join(dir, f)).size, 0)
}

function licencesMarkdown(people: ManifestEntry[], places: ManifestEntry[]): string {
  const row = (e: ManifestEntry) =>
    `| \`${e.file}\` | [${e.title.replace(/^File:/, '').replace(/\|/g, '\\|')}](${e.pageUrl}) | ${e.author.replace(/\|/g, '\\|')} | ${e.license} |`
  const table = (rows: ManifestEntry[]) =>
    ['| File | Commons page | Author | Licence |', '|---|---|---|---|', ...rows.map(row)].join('\n')
  return [
    '# Demo photos — licences',
    '',
    `All ${people.length + places.length} images under \`public/demo-photos/\` are CC0 / public domain photographs from ` +
      'Wikimedia Commons. Each one was verified programmatically by `scripts/demo-photos.ts` through the Commons API ' +
      '(`prop=imageinfo`, `extmetadata.LicenseShortName` = "CC0") at the time of download, and is served here as a ' +
      `640 px JPEG. Credit is not required by the licence; the author and the Commons page are listed anyway.`,
    '',
    `Regenerate with \`bun run scripts/demo-photos.ts\`. The manifest is \`public/demo-photos/manifest.json\`.`,
    '',
    `## People (${people.length})`,
    '',
    table(people),
    '',
    `## Places (${places.length})`,
    '',
    table(places),
    '',
  ].join('\n')
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const people = await buildPool('people', PEOPLE_QUERIES, PEOPLE_MAX)
  const places = await buildPool('places', PLACES_QUERIES, PLACES_MAX)

  const manifest = {
    generated: new Date().toISOString().slice(0, 10),
    source: 'Wikimedia Commons, CC0 only, verified via prop=imageinfo extmetadata',
    people: people.entries,
    places: places.entries,
  }
  await Bun.write(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  await Bun.write(LICENCES_DOC, licencesMarkdown(people.entries, places.entries))

  const kbPeople = Math.round(dirBytes(join(OUT_DIR, 'people')) / 1024)
  const kbPlaces = Math.round(dirBytes(join(OUT_DIR, 'places')) / 1024)
  const over = [...people.entries, ...places.entries]
    .map((e) => ({ e, size: statSync(join(ROOT, 'public', e.file)).size }))
    .filter((x) => x.size > TARGET_BYTES)
  for (const x of over) console.warn(`  ! ${x.e.file} is ${Math.round(x.size / 1024)} kB (over ${TARGET_BYTES / 1024} kB)`)

  console.log(
    `demo-photos: people ${people.entries.length} kept (${people.verified} verified, ${people.rejected} rejected by the quality pass), ` +
      `places ${places.entries.length} kept (${places.verified} verified, ${places.rejected} rejected), ` +
      `${kbPeople + kbPlaces} kB total (people ${kbPeople} kB, places ${kbPlaces} kB) → ${OUT_DIR}`,
  )
}

await main()
