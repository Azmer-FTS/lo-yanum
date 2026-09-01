import rows from './gazetteer.json'
import type { LatLng } from './types'

/**
 * ORDRE DE NUIT 2026-09-02 (N4) — THE NATIONAL GAZETTEER.
 *
 * ★ WHAT THE PRODUCT OWNER FOUND: he could not book a meeting at בית שאן.
 *   The gazetteer was 21 towns, all Negev and Jerusalem corridor (ETAT §22.4
 *   called it "the cheapest high-value follow-up in the file"), so the
 *   autocomplete had nothing to offer and the pin map opened on the Negev.
 *
 * ★ WHAT IT IS NOW: every recognised locality in Israel — 1 174 of them,
 *   cities, moshavim, kibbutzim, community and Bedouin villages — with the
 *   Survey of Israel's centre point, the Hebrew name and the CBS
 *   transliteration. Built once from the government open-data list by
 *   `scripts/gazetteer.ts` (source, licence and download date are in that
 *   file and under `docs/data/`), shipped as a 52 kB JSON, no network, no
 *   key, no API. Street-level geocoding is a different question and is not
 *   answered here; if it is ever wanted, Nominatim is the online option to
 *   look at first.
 *
 * ★ LOOKUPS ARE TOLERANT OF HOW HEBREW GETS TYPED. `normalizeLocality`
 *   drops geresh/gershayim and the ASCII quotes people type instead of them,
 *   turns hyphens and maqaf into spaces, strips niqqud, and collapses
 *   whitespace — so `באר-שבע`, `באר שבע` and `באר  שבע` are one town, and
 *   `ק"ש` is not silently a different string from `ק״ש`. A name with a
 *   qualifier in parentheses (`עין חרוד (מאוחד)`) also answers to the bare
 *   name when that is unambiguous enough to place a pin.
 */

export type LocalityKind = 'c' | 'm' | 'k' | 'y' | 'v' | '?'

export interface Locality {
  name: string
  latin: string
  position: LatLng
  kind: LocalityKind
}

const NIQQUD = /[֑-ׇ]/g
const QUOTES = /[׳״'"`´’‘“”]/g
const DASHES = /[-־‐‑–—]/g

export function normalizeLocality(s: string): string {
  return s
    .replace(NIQQUD, '')
    .replace(QUOTES, '')
    .replace(DASHES, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The bare name, without a parenthesised qualifier. */
const bare = (s: string): string => s.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim()

export const LOCALITIES: readonly Locality[] = (rows as Array<[string, string, number, number, string]>).map(
  ([name, latin, lat, lng, kind]) => ({
    name,
    latin,
    position: { lat, lng },
    kind: kind as LocalityKind,
  }),
)

/** Exact (normalised) name → locality. */
const byName = new Map<string, Locality>()
/** Bare name → the localities that share it, for the qualifier-free lookup. */
const byBare = new Map<string, Locality[]>()
/** Latin name → locality, for rosters typed in English. */
const byLatin = new Map<string, Locality>()

for (const l of LOCALITIES) {
  byName.set(normalizeLocality(l.name), l)
  const b = normalizeLocality(bare(l.name))
  const list = byBare.get(b) ?? []
  list.push(l)
  byBare.set(b, list)
  if (l.latin) byLatin.set(normalizeLocality(l.latin), l)
}

/** The locality a typed name means, or null. */
export function findLocality(input: string): Locality | null {
  const q = normalizeLocality(input)
  if (q === '') return null
  const exact = byName.get(q)
  if (exact) return exact
  const shared = byBare.get(q)
  // Two kibbutzim called עין חרוד are 800 m apart: either pin is the right
  // town. Only a bare name shared by places in DIFFERENT regions stays null.
  if (shared && shared.length > 0) {
    const first = shared[0]
    const close = shared.every(
      (l) => Math.abs(l.position.lat - first.position.lat) < 0.05 && Math.abs(l.position.lng - first.position.lng) < 0.05,
    )
    if (close) return first
  }
  return byLatin.get(q) ?? null
}

/**
 * The names to offer for what has been typed so far — prefix matches first
 * (that is what a person is doing), then names containing the query, then
 * Latin names, each group in gazetteer (alphabetical Hebrew) order.
 */
export function searchLocalities(query: string, limit = 8): Locality[] {
  const q = normalizeLocality(query)
  if (q === '') return LOCALITIES.slice(0, limit)
  const prefix: Locality[] = []
  const inside: Locality[] = []
  const latin: Locality[] = []
  for (const l of LOCALITIES) {
    const n = normalizeLocality(l.name)
    if (n.startsWith(q)) prefix.push(l)
    else if (n.includes(q)) inside.push(l)
    else if (l.latin && normalizeLocality(l.latin).startsWith(q)) latin.push(l)
    if (prefix.length >= limit) break
  }
  return [...prefix, ...inside, ...latin].slice(0, limit)
}

export const LOCALITY_KIND_LABEL: Record<LocalityKind, string> = {
  c: 'עיר',
  m: 'מושב',
  k: 'קיבוץ',
  y: 'יישוב קהילתי',
  v: 'כפר',
  '?': '',
}
