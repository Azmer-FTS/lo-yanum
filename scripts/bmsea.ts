import { readFileSync, writeFileSync } from 'node:fs'
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'

import { tile } from './bmtiles'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BM (chantier 1) — LA MER, TIRÉE DU TRAIT DE CÔTE D'OPENSTREETMAP.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Remplace `scripts/blsea.ts` (BL 3.1) : même fichier (`src/core/sea.json`),
 * même usage — un MASQUE, jamais une réécriture du tracé. BL prenait les
 * polygones `ocean` des tuiles de la carte au zoom 10, simplifiés à 25 m :
 * mesuré (`scripts/bmmeasure.ts`), 35 à 57 m d'écart au 95ᵉ centile, jusqu'à
 * 259 m dans les ports. Ici, la mer est construite directement depuis
 * `natural=coastline` (`geodata/osm-borders.json`, `scripts/bmfetch.ts`), à la
 * résolution de ses nœuds, puis Douglas–Peucker à TOL mètres (2 par défaut).
 *
 * Le trait de côte d'OSM est orienté : la terre est à GAUCHE. Les deux chaînes
 * ouvertes (la Méditerranée, du Liban au Sinaï ; le golfe d'Eilat, de l'Égypte
 * à l'Arabie) sont coupées au cadre, puis la TERRE se ferme en suivant le bord
 * du cadre dans le sens trigonométrique, d'une sortie à l'entrée suivante.
 * Les îles (anneaux fermés) de plus de 0,1 km² sont de la terre aussi ; les ÎLOTS,
 * en dessous (dans le cadre : 33, tous sous 0,04 km² — les rochers d'Andromède à
 * Jaffa, ceux d'Achziv, l'île de Pharaon côté égyptien), restent de la MER, comme
 * en BL : aucun ne porte une région, et gardés comme terre ils perçaient la
 * voisine d'une région qui avançait en mer (`blpass` A592, « hole »).
 *
 *   mer = cadre − terre − îles, découpée en cases de 0,1° (`bmtiles.ts`)
 *
 * ⚠️ S'arrête si Tel-Aviv, Eilat ou Haïfa tombent en mer, ou si un point au
 *    large n'y est pas.
 *
 *   bun run scripts/bmsea.ts && bun run scripts/bmabroad.ts
 */
type Pt = [number, number]
const TOL = Number(process.env.TOL ?? 2)
const W = 34.2, E = 36.0, S = 29.35, N = 33.45
const src = JSON.parse(readFileSync('geodata/osm-borders.json', 'utf8')) as { coast: Pt[][]; fetched: string }
const inside = (p: Pt) => p[0] > W && p[0] < E && p[1] > S && p[1] < N
const closed = (c: Pt[]) => c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]

/** Le point où le segment a→b (a dedans, b dehors, ou l'inverse) coupe le bord du cadre. */
function cross(a: Pt, b: Pt): Pt {
  let lo = 0, hi = 1
  const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  const aIn = inside(a)
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2
    if (inside(at(m)) === aIn) lo = m
    else hi = m
  }
  const p = at((lo + hi) / 2)
  /* Collé exactement au bord. */
  const d = [Math.abs(p[0] - W), Math.abs(p[0] - E), Math.abs(p[1] - S), Math.abs(p[1] - N)]
  const k = d.indexOf(Math.min(...d))
  return k === 0 ? [W, p[1]] : k === 1 ? [E, p[1]] : k === 2 ? [p[0], S] : [p[0], N]
}
/** Position le long du bord, dans le sens trigonométrique depuis le coin sud-ouest. */
function perim(p: Pt): number {
  const w = E - W, h = N - S
  if (p[1] === S) return p[0] - W
  if (p[0] === E) return w + (p[1] - S)
  if (p[1] === N) return w + h + (E - p[0])
  return 2 * w + h + (N - p[1])
}
const CORNERS: Array<{ t: number; p: Pt }> = [
  { t: 0, p: [W, S] }, { t: E - W, p: [E, S] }, { t: E - W + (N - S), p: [E, N] }, { t: 2 * (E - W) + (N - S), p: [W, N] },
]
const PER = 2 * (E - W + N - S)

const ISLAND_KM2 = 0.1
const ringKm2 = (r: Pt[]) => {
  let a = 0
  for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
  return (Math.abs(a) / 2) * 111_320 * Math.cos((31.5 * Math.PI) / 180) * 110_540 / 1e6
}
let islets = 0

/* Les morceaux de chaîne DANS le cadre, chacun d'une entrée à une sortie sur le bord. */
const pieces: Pt[][] = []
const islands: Polygon[] = []
for (const c of src.coast) {
  if (closed(c)) {
    if (c.some(inside) && ringKm2(c) >= ISLAND_KM2) islands.push([c])
    else if (c.some(inside)) islets++
    continue
  }
  let cur: Pt[] | null = null
  for (let i = 0; i < c.length; i++) {
    const p = c[i]
    if (inside(p)) {
      if (!cur) {
        if (i === 0) throw new Error('une chaîne de côte commence DANS le cadre : elle ne se fermerait pas')
        cur = [cross(c[i - 1], p)]
      }
      cur.push(p)
    } else if (cur) {
      cur.push(cross(c[i - 1], p))
      pieces.push(cur)
      cur = null
    }
  }
  if (cur) throw new Error('une chaîne de côte finit DANS le cadre')
}

/* La terre : chaque morceau, puis le bord du cadre jusqu'à l'entrée du morceau suivant. */
const land: Pt[] = []
const left = [...pieces]
let piece = left.shift()!
const first = piece
for (;;) {
  land.push(...piece)
  const tOut = perim(piece[piece.length - 1])
  const gap = (q: Pt[]) => (perim(q[0]) - tOut + PER) % PER
  const candidates = [...left, first].sort((a, b) => gap(a) - gap(b))
  const next = candidates[0]
  const tIn = perim(next[0])
  for (const k of [...CORNERS].sort((a, b) => ((a.t - tOut + PER) % PER) - ((b.t - tOut + PER) % PER)))
    if ((k.t - tOut + PER) % PER < (tIn - tOut + PER) % PER) land.push(k.p)
  if (next === first) break
  left.splice(left.indexOf(next), 1)
  piece = next
}
land.push(land[0])

const frame: Polygon = [[[W, S], [E, S], [E, N], [W, N], [W, S]]]
const sea = polygonClipping.difference(frame, [land], ...islands)

const KX = 111_320 * Math.cos((31.5 * Math.PI) / 180)
const KY = 110_540
function dp(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: Array<[number, number]> = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const ax = pts[a][0] * KX, ay = pts[a][1] * KY, bx = pts[b][0] * KX, by = pts[b][1] * KY
    const len = Math.hypot(bx - ax, by - ay) || 1
    let best = -1, bi = -1
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1] * KY) - (ax - pts[i][0] * KX) * (by - ay)) / len
      if (d > best) { best = d; bi = i }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}
function dpRing(r: Pt[], tol: number): Pt[] {
  let far = 1, fd = -1
  for (let i = 1; i < r.length - 1; i++) {
    const d = Math.hypot((r[i][0] - r[0][0]) * KX, (r[i][1] - r[0][1]) * KY)
    if (d > fd) { fd = d; far = i }
  }
  return [...dp(r.slice(0, far + 1), tol), ...dp(r.slice(far), tol).slice(1)]
}
const r6 = (v: number) => Math.round(v * 1e6) / 1e6
const out = polygonClipping.union(
  sea.map((poly) => poly.map((r) => dpRing(r as Pt[], TOL).map(([x, y]) => [r6(x), r6(y)] as Pt)).filter((r) => r.length >= 4)) as MultiPolygon,
)

function inRing(r: number[][], x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c
  return c
}
const wet = (lat: number, lng: number) => out.some((p) => inRing(p[0], lng, lat) && !p.slice(1).some((h) => inRing(h, lng, lat)))
for (const [name, lat, lng] of [['Tel-Aviv', 32.08, 34.79], ['Haïfa', 32.8, 34.99], ['Eilat', 29.56, 34.95], ['Gaza', 31.5, 34.46], ['Ashdod', 31.8, 34.65], ['Naharia', 33.0, 35.1]] as Array<[string, number, number]>)
  if (wet(lat, lng)) throw new Error(`⛔ ${name} tombe en mer`)
for (const [name, lat, lng] of [['large de Tel-Aviv', 32.08, 34.7], ['golfe d’Eilat', 29.4, 34.92], ['large du Liban', 33.4, 35.2], ['large de Rafah', 31.4, 34.22]] as Array<[string, number, number]>)
  if (!wet(lat, lng)) throw new Error(`⛔ ${name} n'est pas en mer`)

writeFileSync(
  'src/core/sea.json',
  JSON.stringify({ source: `OpenStreetMap natural=coastline (geodata/osm-borders.json, ${src.fetched}) · Douglas–Peucker ${TOL} m · cases de 0,1° · © contributeurs OpenStreetMap, ODbL`, frame: [W, S, E, N], sea: tile(out) }),
)
console.log(`mer : ${pieces.length} morceaux de côte, ${islands.length} îles, ${islets} îlots laissés en mer → ${out.length} polygone(s), ${out.flat(2).length} points (TOL ${TOL} m)`)
