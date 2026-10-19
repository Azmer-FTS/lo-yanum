import { readFileSync, writeFileSync } from 'node:fs'
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'

/**
 * ⛔ REMPLACÉ EN BM (2026-10-19) par `scripts/bmabroad.ts` (polygones et trait de côte d'OpenStreetMap à
 *    pleine résolution : `docs/bm/frontieres.md`). Gardé pour mémoire : le relancer RÉÉCRIRAIT
 *    les masques de BL, approchés à ~150 m (au-delà) ou ~25 m (mer).
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BL (3.2, OPTION A — DÉCIDÉE PAR LE PO LE 2026-10-19) — L'AU-DELÀ DES
 *    FRONTIÈRES, EN POLYGONES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Applique l'option A : le sud, plus la Jordanie le long du Jourdain, la
 *     Syrie, le Liban et Gaza ; la Judée-Samarie et le Golan restent dedans. »
 *                                                                   — le PO
 *
 * Les lignes sont celles de la carte (`src/core/borders.json`, OpenStreetMap
 * via Protomaps, AW1.6). Le jeu ne donne que des LIGNES : on en tire des
 * SURFACES par une grille fine (0,0015°, ~150 m) où les lignes et la mer sont
 * des murs ; chaque zone au-delà est la composante atteinte depuis un point
 * témoin (Sinaï, Jordanie, Gaza, Liban, Syrie). La Judée-Samarie et le Golan,
 * composantes elles aussi, sont GARDÉES (décision du PO). L'Égypte et la
 * Jordanie se rejoignent au sud du cadre : partagées au méridien de Taba (34,96°).
 *
 * Les composantes deviennent des polygones (rangées de cellules réunies,
 * puis Douglas–Peucker à 100 m) : `src/core/abroad.json`. Précision : la
 * maille, ~150 m le long des lignes — une région n'est pas un cadastre.
 *
 * ⚠️ Contrôle d'étanchéité : si une zone au-delà rejoint Tel-Aviv (une ligne
 *    trouée), le script S'ARRÊTE au lieu d'écrire.
 *
 *   bun run scripts/blabroad.ts
 */
const STEP = 0.0015
const W = 34.2, E = 36.0, S = 29.35, N = 33.45
const NX = Math.ceil((E - W) / STEP)
const NY = Math.ceil((N - S) / STEP)
const idx = (i: number, j: number) => j * NX + i
const ci = (lng: number) => Math.floor((lng - W) / STEP)
const cj = (lat: number) => Math.floor((N - lat) / STEP)
const lngOf = (i: number) => W + (i + 0.5) * STEP
const latOf = (j: number) => N - (j + 0.5) * STEP

const borders = JSON.parse(readFileSync('src/core/borders.json', 'utf8')) as { greenLine: number[][]; border: number[][] }
const sea = JSON.parse(readFileSync('src/core/sea.json', 'utf8')) as { sea: number[][][][] }

function fill(rings: number[][][], set: (k: number) => void): void {
  for (let j = 0; j < NY; j++) {
    const y = latOf(j)
    const xs: number[] = []
    for (const r of rings)
      for (let k = 0; k < r.length; k++) {
        const [x1, y1] = r[k]
        const [x2, y2] = r[(k + 1) % r.length]
        if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
      }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil((xs[k] - W) / STEP - 0.5)); i < NX && lngOf(i) <= xs[k + 1]; i++) set(idx(i, j))
  }
}
const seaMask = new Uint8Array(NX * NY)
for (const p of sea.sea) fill(p, (k) => (seaMask[k] = 1))

const walls = new Uint8Array(NX * NY)
for (const f of [...borders.border, ...borders.greenLine])
  for (let k = 0; k + 3 < f.length; k += 2) {
    const [a, b, c, d] = [f[k], f[k + 1], f[k + 2], f[k + 3]]
    const n = Math.max(2, Math.ceil(Math.hypot(c - a, d - b) / (STEP / 4)))
    for (let t = 0; t <= n; t++) {
      const i = ci(b + ((d - b) * t) / n)
      const j = cj(a + ((c - a) * t) / n)
      if (i >= 0 && i < NX && j >= 0 && j < NY) walls[idx(i, j)] = 1
    }
  }

function flood(lat: number, lng: number): Uint8Array {
  const seen = new Uint8Array(NX * NY)
  const start = idx(ci(lng), cj(lat))
  if (walls[start] || seaMask[start]) throw new Error(`témoin sur un mur ou en mer : ${lat},${lng}`)
  const stack = [start]
  seen[start] = 1
  while (stack.length) {
    const k = stack.pop()!
    const i = k % NX
    const j = (k - i) / NX
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di
      const b = j + dj
      if (a < 0 || b < 0 || a >= NX || b >= NY) continue
      const q = idx(a, b)
      if (seen[q] || walls[q] || seaMask[q]) continue
      seen[q] = 1
      stack.push(q)
    }
  }
  return seen
}

const inside = flood(32.08, 34.8)
const WITNESS = [
  { key: 'egypt', lat: 30.6, lng: 34.35 },
  { key: 'gaza', lat: 31.45, lng: 34.4 },
  { key: 'lebanon', lat: 33.35, lng: 35.4 },
  { key: 'syria', lat: 33.0, lng: 35.97 },
  { key: 'jordan', lat: 30.6, lng: 35.6 },
]
const zone = new Int8Array(NX * NY).fill(-1)
WITNESS.forEach((w, n) => {
  const k = idx(ci(w.lng), cj(w.lat))
  if (inside[k]) throw new Error(`⛔ fuite : « ${w.key} » rejoint Tel-Aviv — une ligne est trouée à cette maille`)
  if (zone[k] !== -1) return
  const comp = flood(w.lat, w.lng)
  for (let q = 0; q < comp.length; q++) if (comp[q] && zone[q] === -1) zone[q] = n
})
const EG = WITNESS.findIndex((w) => w.key === 'egypt')
const JO = WITNESS.findIndex((w) => w.key === 'jordan')
for (let q = 0; q < zone.length; q++) if (zone[q] === EG && lngOf(q % NX) >= 34.96) zone[q] = JO
/* Les témoins gardés (Judée-Samarie, Golan) ne doivent PAS être dans une zone retirée. */
for (const [lat, lng, name] of [[32.0, 35.25, 'Judée-Samarie'], [33.0, 35.75, 'Golan']] as Array<[number, number, string]>) {
  const k = idx(ci(lng), cj(lat))
  if (zone[k] !== -1) throw new Error(`⛔ ${name} tombe dans « ${WITNESS[zone[k]].key} »`)
}

/* Les rangées de cellules → rectangles, réunis par paquets. */
const KX = 111_320 * Math.cos((31.5 * Math.PI) / 180)
const KY = 110_540
function dp(pts: Array<[number, number]>, tol: number): Array<[number, number]> {
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
function dpRing(r: Array<[number, number]>, tol: number): Array<[number, number]> {
  let far = 1, fd = -1
  for (let i = 1; i < r.length - 1; i++) {
    const d = Math.hypot((r[i][0] - r[0][0]) * KX, (r[i][1] - r[0][1]) * KY)
    if (d > fd) { fd = d; far = i }
  }
  return [...dp(r.slice(0, far + 1), tol), ...dp(r.slice(far), tol).slice(1)]
}
function unionAll(polys: Polygon[]): MultiPolygon {
  let layer: MultiPolygon[] = polys.map((p) => [p])
  while (layer.length > 1) {
    const next: MultiPolygon[] = []
    for (let k = 0; k < layer.length; k += 16) next.push(polygonClipping.union(...(layer.slice(k, k + 16) as [MultiPolygon, ...MultiPolygon[]])))
    layer = next
  }
  return layer[0] ?? []
}
const out: Record<string, number[][][][]> = {}
const r5 = (v: number) => Math.round(v * 1e5) / 1e5
for (const [n, w] of WITNESS.entries()) {
  /* Une bande verticale ne change pas d'une rangée à l'autre : on prolonge le rectangle. */
  const open = new Map<string, { x0: number; x1: number; top: number; bottom: number }>()
  const rects: Polygon[] = []
  const close = (r: { x0: number; x1: number; top: number; bottom: number }) => rects.push([[[r.x0, r.bottom], [r.x1, r.bottom], [r.x1, r.top], [r.x0, r.top], [r.x0, r.bottom]]])
  for (let j = 0; j < NY; j++) {
    const top = N - j * STEP
    const bottom = top - STEP
    const runs: Array<[number, number]> = []
    let i = 0
    while (i < NX) {
      /* Les cellules de MUR (la ligne elle-même) restent à l'intérieur : la région garde jusqu'à la ligne. */
      if (zone[idx(i, j)] !== n) { i++; continue }
      const a = i
      while (i < NX && zone[idx(i, j)] === n) i++
      runs.push([W + a * STEP, W + i * STEP])
    }
    const seenKeys = new Set<string>()
    for (const [x0, x1] of runs) {
      const key = `${x0.toFixed(6)}|${x1.toFixed(6)}`
      seenKeys.add(key)
      const r = open.get(key)
      if (r) r.bottom = bottom
      else open.set(key, { x0, x1, top, bottom })
    }
    for (const [key, r] of [...open]) if (!seenKeys.has(key)) { close(r); open.delete(key) }
  }
  for (const r of open.values()) close(r)
  const merged = unionAll(rects)
  const polys = merged
    .map((poly) => poly.map((ring) => dpRing(ring as Array<[number, number]>, 100).map(([x, y]) => [r5(x), r5(y)])))
    .filter((poly) => poly[0].length >= 4)
  out[w.key] = polys
  console.log(`${w.key}: ${rects.length} rectangles → ${polys.length} polygone(s), ${polys.reduce((s, p) => s + p.reduce((t, r) => t + r.length, 0), 0)} points`)
}
writeFileSync('src/core/abroad.json', JSON.stringify({ source: 'src/core/borders.json (OpenStreetMap via Protomaps, AW1.6) · grille 0,0015° · option A du PO (2026-10-19)', kept: ['westbank', 'golan'], zones: out }))
