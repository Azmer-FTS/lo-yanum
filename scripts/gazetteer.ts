/**
 * ORDRE DE NUIT 2026-09-02 (N4) — THE NATIONAL GAZETTEER, BUILT FROM OPEN DATA.
 *
 *   bun run scripts/gazetteer.ts <localities.csv>
 *
 * Source: "שמות יישובים עם קואורדינטות" — the Survey of Israel's list of
 * every recognised locality with its centre point, published on the
 * government open-data portal (data.gov.il dataset 828, mirrored on the
 * portal's ArcGIS hub as item a589d87604c6477ca4afb78f205b98fb). 1 240
 * localities, WGS84, with the CBS locality code, the Hebrew name, the CBS
 * transliteration and the settlement type. Licence: the data.gov.il open
 * terms ("אחר (פתוח)" — free reuse with attribution). The raw CSV is kept
 * under `docs/data/` with its download date; this script turns it into the
 * compact JSON the app ships, `src/core/gazetteer.json`.
 *
 * Each row becomes `[hebrewName, latinName, lat, lng, kind]` where `kind` is a
 * one-letter class read off the CBS type column — c city, m moshav, k kibbutz,
 * y community (ישוב קהילתי), v other village, ? unknown — enough for the
 * autocomplete to say "מושב" next to a name without carrying the whole
 * Hebrew category string 1 240 times.
 */

const source = process.argv[2] ?? 'docs/data/localities-israel-2026-09-02.csv'
const target = 'src/core/gazetteer.json'

const text = (await Bun.file(source).text()).replace(/^﻿/, '')
const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
const header = lines[0].split(',')
const col = (name: string) => header.indexOf(name)
const X = col('X')
const Y = col('Y')
const HE = col('MGLSDE_LOC')
const EN = col('MGLSDE_L_4')
const TYPE = col('MGLSDE_L_3')

/** A CSV line, honouring quotes — a few English names carry commas. */
function split(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === ',' && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function kindOf(type: string): string {
  if (/קיבוצ/.test(type)) return 'k'
  if (/מושב/.test(type)) return 'm'
  if (/קהילתי/.test(type)) return 'y'
  if (/תושבים|ירושלים|תל אביב|חיפה/.test(type)) return 'c'
  if (/כפרי|בדווי|שבט/.test(type)) return 'v'
  return '?'
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

const rows: Array<[string, string, number, number, string]> = []
const seen = new Set<string>()
for (const line of lines.slice(1)) {
  const f = split(line)
  const he = tidy(f[HE] ?? '')
  const lat = Number(f[Y])
  const lng = Number(f[X])
  if (!he || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
  if (lat < 29 || lat > 34 || lng < 34 || lng > 36.5) continue
  const key = `${he}|${lat.toFixed(3)}`
  if (seen.has(key)) continue
  seen.add(key)
  rows.push([he, tidy(f[EN] ?? ''), +lat.toFixed(5), +lng.toFixed(5), kindOf(f[TYPE] ?? '')])
}
rows.sort((a, b) => a[0].localeCompare(b[0], 'he'))

await Bun.write(target, JSON.stringify(rows))
const kinds = rows.reduce<Record<string, number>>((acc, r) => ((acc[r[4]] = (acc[r[4]] ?? 0) + 1), acc), {})
console.log(`  ${rows.length} localities → ${target} (${(JSON.stringify(rows).length / 1024).toFixed(0)} kB)`)
console.log(`  kinds: ${JSON.stringify(kinds)}`)
