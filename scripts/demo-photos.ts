/**
 * DEMO PHOTOS — a pool of REAL, CC0 photographs from Wikimedia Commons, as
 * static assets, for the demo dataset.
 *
 *   bun run scripts/demo-photos.ts                         # rebuild the pool
 *   DEMO_PHOTOS_REVIEW=1 bun run scripts/demo-photos.ts    # discover candidates
 *
 * ★ THE POOL IS A CURATED LIST, VERIFIED ON EVERY RUN. `PEOPLE` and `PLACES`
 *   below name, by Commons pageid, every photograph that was found by the
 *   searches in `PEOPLE_QUERIES` / `PLACES_QUERIES`, looked at by a human,
 *   and kept: one adult, face visible, no child, no nudity, no painting, no
 *   statue, no archival scan, no group, no couple, no costume; and for the
 *   places, a photograph (not a drawing, not a map) of farmland, a flock, a
 *   field, an orchard, arid or Mediterranean land. The searches returned
 *   about 560 portraits and 300 landscapes; the picks are what survived.
 *
 *   A normal run does NOT search. It:
 *     1. asks the API (`prop=imageinfo`) for every pick, and KEEPS it only if
 *        `extmetadata.LicenseShortName` is exactly "CC0" (or "Public domain"
 *        with `License` starting with "cc0"), the mime is JPEG or PNG, and
 *        both sides are ≥ 400 px — a pick that fails is dropped with a
 *        warning, never silently kept;
 *     2. downloads the 640 px thumbnail with curl into a cache OUTSIDE the
 *        repository (the OS temp dir, keyed by pageid — a re-run downloads
 *        nothing it already has);
 *     3. writes each as a JPEG capped at 640 px on the long edge (`sips`,
 *        quality stepped down until the file is under ~120 kB) into
 *          public/demo-photos/people/<nn>.jpg
 *          public/demo-photos/places/<nn>.jpg
 *        — the directories are EMPTIED first, so the numbering is always
 *        sequential (the order of the pick lists) and never carries a stale
 *        file;
 *     4. writes public/demo-photos/manifest.json and
 *        docs/demo-photos-licences.md (one row per file: Commons page,
 *        author, licence).
 *
 *   A REVIEW run (`DEMO_PHOTOS_REVIEW=1`) is how the lists were built and how
 *   they get extended: it runs every query (each suffixed with
 *   `filetype:bitmap incategory:CC-Zero`, the only licence filter the search
 *   index honours — `haslicense:` does not work), deduplicates by pageid,
 *   verifies the licence of every candidate exactly as above, downloads them
 *   all into the cache, and lays them out as numbered JPEGs in
 *   <tmp>/lo-yanoum-demo-photos-review/{people,places}/ with a `review.json`
 *   mapping each number to its pageid and title. Nothing under `public/` is
 *   touched by a review run. Look at the sheet, add the good pageids to the
 *   lists, run normally.
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
const REVIEW_DIR = join(tmpdir(), 'lo-yanoum-demo-photos-review')

const API = 'https://commons.wikimedia.org/w/api.php'
const USER_AGENT = 'LoYanoumDemoPhotos/1.0 (https://github.com/Azmer-FTS; demo dataset asset pool)'

const REVIEW = process.env.DEMO_PHOTOS_REVIEW === '1'
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

/**
 * THE PICKS. [pageid, note]. Order = file number. Reviewed on 2026-09-02 from
 * the review run's sheets; the note is what the reviewer saw, not the Commons
 * title (that is in the manifest).
 */
const PEOPLE: [number, string][] = [
  // — men —
  [61874612, 'older man, glasses, studio, grey background'],
  [61878193, 'young man, head and shoulders, outdoors'],
  [61848389, 'young man, glasses, blue jacket, woods'],
  [62057252, 'young man, close-up, hand on chin'],
  [61850571, 'smiling man with backpack, city street'],
  [61874678, 'elderly man in straw hat, farmer'],
  [61733565, 'smiling man, arms crossed, field at sunset'],
  [61724220, 'laughing man, white sweater, plain background'],
  [62055463, 'man with dreadlocks, white t-shirt, shutter'],
  [61847301, 'man in black, green vines behind'],
  [61850380, 'elderly Karen man smiling, red shirt, stick'],
  [61682257, 'laughing older worker, gloves and drill'],
  [61782151, 'smiling young man in hoodie, winter woods'],
  [61667090, 'older man at a market stall, smiling'],
  [61728392, 'bald man sitting, autumn trees'],
  [62057708, 'man in grey hoodie, dark background'],
  [61874266, 'bearded man in fur hood, looking at camera'],
  [61844929, 'bearded man in suit and tie'],
  [61847324, 'man with cap, sunglasses and camera, green hills'],
  [61850863, 'older man holding a camera, dry lakebed'],
  [61682931, 'young mechanic beside a scooter'],
  [61857601, 'young man in red striped t-shirt'],
  [61758315, 'man in white polo, city street'],
  [62058386, 'young man in jersey, looking aside'],
  // — women —
  [61654448, 'young woman, dark hair, hedge behind'],
  [61825662, 'smiling woman, yellow leaves'],
  [61834605, 'woman in hat by a tree'],
  [61831510, 'smiling woman with a phone, outdoors'],
  [61753747, 'smiling woman in denim jacket, night lights'],
  [61829078, 'woman in sunglasses, striped top, hand on chin'],
  [61758627, 'woman with short blonde hair, dark background'],
  [61831725, 'smiling woman in plaid, corn leaves'],
  [61824017, 'young woman in pink, sitting by roses'],
  [61831412, 'woman with earrings, stone wall'],
  [61827586, 'red-haired woman, arms crossed, misty field'],
  [61776322, 'smiling woman in fur hood, pumpkins'],
  [61825702, 'smiling woman in a dry field, winter'],
  [61826552, 'woman in denim jacket, leaf crown, ivy'],
  [61839496, 'smiling woman in hat, hand on chin'],
  [61833060, 'older woman smiling by a window'],
  [61850221, 'Indian woman in sari, smiling'],
  [61827173, 'smiling young woman, grey t-shirt, trees'],
  [61847056, 'woman in hat and plaid, sunset field'],
  [61758494, 'woman in white t-shirt under trees'],
  [58821688, 'red-haired woman at a laptop, cafe'],
  [61824207, 'smiling woman in hat by red flowers'],
  [61850754, 'smiling woman in sunglasses, leaning on a rail'],
  [61826749, 'elderly woman, glasses, red hat, close-up'],
  [61830040, 'woman in glasses and red sweater, rock behind'],
  [61828358, 'woman in glasses holding a cat, yellow coat'],
  [61756942, 'smiling red-haired woman in tall grasses'],
]

const PLACES: [number, string][] = [
  // — flocks —
  [62303498, 'sheep flock on stony ground, red hills'],
  [62307301, 'sheep flock, red mountains'],
  [62071269, 'sheep on dry plain, snowy mountains (Peru)'],
  [61701145, 'two sheep by a signpost, dry grassland'],
  [59541881, 'sheep scattered on a brown hillside'],
  [143535141, 'sheep facing the camera, flock behind'],
  [62176080, 'goats in a barn'],
  [62336278, 'goat on a green slope'],
  [62273687, 'white goat close-up, herd behind'],
  // — cattle and horses —
  [61837953, 'cow at sunset, backlit'],
  [61768886, 'cattle herd from above'],
  [62318755, 'cattle on a plain, snowy mountain'],
  [62173120, 'bull in dry grass'],
  [61911476, 'horses at sunset, fence'],
  [62302899, 'horses grazing on a dry hill'],
  // — fields —
  [31469180, 'pasture at sunset, trees'],
  [62290474, 'wheat field rows to the horizon'],
  [62277319, 'farmland from above, green parcels'],
  [58831161, 'crop fields from above, road'],
  [62311256, 'tractor in a green field, big sky'],
  [61732365, 'stables fence at sunset'],
  [61800235, 'combine harvesting wheat'],
  [62290316, 'wheat ears against blue sky'],
  [61654293, 'hay bales on a dry hill'],
  [31236894, 'tractor and hay bales, dry field'],
  // — olive groves, vineyards, orchards —
  [176431458, 'old olive trees, sun through the grove'],
  [65405286, 'olive orchard and dry hills (Kurdistan)'],
  [65405294, 'olive orchard, pylon, hazy sky'],
  [65405287, 'lone olive tree in a dry orchard'],
  [35906113, 'olive and almond terraces above a turquoise lake (Andalusia)'],
  [62119818, 'vineyard and brown hills'],
  [61654309, 'vineyard terraces from above'],
  // — desert —
  [61863114, 'Negev, storm light over the crater'],
  [112595228, 'lonely road in the Negev hills'],
  [58859365, 'camels resting in the Negev'],
  [61653651, 'flat rocks on arid hills, blue sky'],
  [62103756, 'camel train at sunset'],
  [61849494, 'camels on a desert plain'],
  [51439009, 'arid hills under a blue sky'],
]

// ─── Types ──────────────────────────────────────────────────────────────────

type Kind = 'people' | 'places'

interface Candidate {
  pageid: number
  title: string
  note: string
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
  note: string
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
  return hits.map((h) => ({ pageid: h.pageid, title: h.title, note: query }))
}

/** Every query, deduplicated by pageid, in query order then search rank. */
async function gather(kind: Kind, queries: string[]): Promise<Candidate[]> {
  const seen = new Map<number, Candidate>()
  let raw = 0
  for (const q of queries) {
    const hits = await search(q)
    raw += hits.length
    for (const h of hits) {
      if (seen.has(h.pageid)) continue
      if (TITLE_BLOCKLIST.some((re) => re.test(h.title))) continue
      seen.set(h.pageid, h)
    }
  }
  console.log(`[${kind}] ${queries.length} queries, ${raw} hits, ${seen.size} distinct titles after the title filter`)
  return [...seen.values()]
}

/** The licence check. Returns only the candidates that pass, in the input order. */
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
        title: page.title ?? c.title,
        pageUrl: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? c.title)}`,
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
  const order = new Map(cands.map((c, i) => [c.pageid, i]))
  out.sort((a, b) => order.get(a.pageid)! - order.get(b.pageid)!)
  return out
}

function run(cmd: string[]): { ok: boolean; err: string } {
  const p = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' })
  return { ok: p.exitCode === 0, err: p.stderr.toString() }
}

/** Download the thumbnail into the cache (once); the cached path, or null. */
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
  return true // still over budget at quality 40 — kept, and reported below
}

function emptyDir(dir: string) {
  mkdirSync(dir, { recursive: true })
  for (const f of readdirSync(dir)) if (/^\d+\.jpg$/.test(f)) rmSync(join(dir, f))
}

/** Verify + download + convert a list into `dir`, numbered in list order. */
async function materialise(kind: Kind, cands: Candidate[], dir: string, warnLost = true): Promise<{ entries: ManifestEntry[]; verified: Verified[] }> {
  const verified = await verify(cands)
  const lost = warnLost ? cands.filter((c) => !verified.some((v) => v.pageid === c.pageid)) : []
  for (const c of lost) console.warn(`  ! [${kind}] dropped, no longer CC0/jpeg/png/≥${MIN_SIDE}px: pageid ${c.pageid} (${c.note})`)
  emptyDir(dir)
  const entries: ManifestEntry[] = []
  for (const v of verified) {
    const cached = download(v)
    if (!cached) continue
    const file = `${String(entries.length + 1).padStart(2, '0')}.jpg`
    if (!convert(cached, join(dir, file))) continue
    entries.push({
      file: `demo-photos/${kind}/${file}`,
      title: v.title,
      pageUrl: v.pageUrl,
      author: v.author,
      credit: v.credit,
      license: 'CC0',
      pageid: v.pageid,
      note: v.note,
    })
  }
  return { entries, verified }
}

function dirBytes(dir: string): number {
  return readdirSync(dir).filter((f) => f.endsWith('.jpg')).reduce((n, f) => n + statSync(join(dir, f)).size, 0)
}

function licencesMarkdown(people: ManifestEntry[], places: ManifestEntry[]): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|')
  const row = (e: ManifestEntry) =>
    `| \`${e.file}\` | [${cell(e.title.replace(/^File:/, ''))}](${e.pageUrl}) | ${cell(e.author)} | ${e.license} |`
  const table = (rows: ManifestEntry[]) =>
    ['| File | Commons page | Author | Licence |', '|---|---|---|---|', ...rows.map(row)].join('\n')
  return [
    '# Demo photos — licences',
    '',
    `All ${people.length + places.length} images under \`public/demo-photos/\` are CC0 / public domain photographs from ` +
      'Wikimedia Commons. Each one was verified programmatically by `scripts/demo-photos.ts` through the Commons API ' +
      '(`prop=imageinfo`, `extmetadata.LicenseShortName` = "CC0") at the time of download, and is served here as a ' +
      '640 px JPEG. CC0 requires no attribution; the author and the Commons page are listed anyway.',
    '',
    'Regenerate with `bun run scripts/demo-photos.ts`. The manifest is `public/demo-photos/manifest.json`.',
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

async function reviewRun() {
  mkdirSync(CACHE_DIR, { recursive: true })
  const picked = new Set([...PEOPLE, ...PLACES].map(([id]) => id))
  for (const [kind, queries] of [['people', PEOPLE_QUERIES], ['places', PLACES_QUERIES]] as [Kind, string[]][]) {
    const cands = await gather(kind, queries)
    const dir = join(REVIEW_DIR, kind)
    const { entries, verified } = await materialise(kind, cands, dir, false) // search hits are not picks; a refused one is just not CC0
    await Bun.write(join(dir, 'review.json'), JSON.stringify(entries.map((e) => ({ n: e.file.split('/').pop(), pageid: e.pageid, title: e.title, query: e.note, picked: picked.has(e.pageid) })), null, 2) + '\n')
    const unreviewed = entries.filter((e) => !picked.has(e.pageid)).length
    console.log(`[${kind}] review: ${verified.length} verified CC0, ${entries.length} laid out in ${dir} (${unreviewed} not in the pick list)`)
  }
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const toCands = (picks: [number, string][]): Candidate[] => picks.map(([pageid, note]) => ({ pageid, title: '', note }))
  const people = await materialise('people', toCands(PEOPLE), join(OUT_DIR, 'people'))
  const places = await materialise('places', toCands(PLACES), join(OUT_DIR, 'places'))

  const manifest = {
    generated: new Date().toISOString().slice(0, 10),
    source: 'Wikimedia Commons, CC0 only, verified via prop=imageinfo extmetadata (scripts/demo-photos.ts)',
    people: people.entries,
    places: places.entries,
  }
  await Bun.write(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  await Bun.write(LICENCES_DOC, licencesMarkdown(people.entries, places.entries))

  const kbPeople = Math.round(dirBytes(join(OUT_DIR, 'people')) / 1024)
  const kbPlaces = Math.round(dirBytes(join(OUT_DIR, 'places')) / 1024)
  for (const e of [...people.entries, ...places.entries]) {
    const size = statSync(join(ROOT, 'public', e.file)).size
    if (size > TARGET_BYTES) console.warn(`  ! ${e.file} is ${Math.round(size / 1024)} kB (over ${TARGET_BYTES / 1024} kB)`)
  }

  console.log(
    `demo-photos: people ${people.entries.length}/${PEOPLE.length} kept, places ${places.entries.length}/${PLACES.length} kept, ` +
      `${kbPeople + kbPlaces} kB total (people ${kbPeople} kB, places ${kbPlaces} kB) → ${OUT_DIR}`,
  )
}

if (REVIEW) await reviewRun()
else await main()
