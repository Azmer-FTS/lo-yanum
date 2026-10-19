import { readFileSync, writeFileSync } from 'node:fs'
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'

import { tile } from './bmtiles'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BM (chantier 1) — L'AU-DELÀ DES FRONTIÈRES, SANS GRILLE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Remplace `scripts/blabroad.ts` (BL, option A) : mêmes cinq zones, même
 * fichier (`src/core/abroad.json`), même usage — un MASQUE de mesure et
 * d'affichage (`core/topology.ts`, `landOf`), jamais une réécriture du tracé.
 *
 * Ce qui change, c'est la précision. BL tirait des surfaces de LIGNES par une
 * grille de 150 m, puis simplifiait à 100 m : sur le Jourdain, la ligne coupait
 * les méandres. Ici, les surfaces SONT les polygones des pays voisins
 * d'OpenStreetMap (`geodata/osm-borders.json`, `scripts/bmfetch.ts`), à la
 * résolution de leurs nœuds :
 *
 *   zone = polygone OSM du voisin − la mer (`sea.json`), dans le cadre,
 *          Douglas–Peucker à TOL mètres (2 m par défaut),
 *          découpée en cases de 0,1° (`bmtiles.ts` : `landOf` ne soustrait que ce qui est proche)
 *
 * La mer est retirée des zones : une région qui déborde en mer près de Gaza
 * perd ce morceau UNE fois, comme « mer » (la barre ne le compte pas deux fois).
 *
 * ⚠️ Contrôles — le script S'ARRÊTE au lieu d'écrire si :
 *    · un point du pays (Tel-Aviv, Jérusalem, Jéricho, Katzrin, Majdal Shams,
 *      le Hermon israélien, Eilat, Kiryat Shmona…) tombe dans une zone ;
 *    · un point témoin d'un voisin n'est pas dans SA zone.
 *
 *   bun run scripts/bmabroad.ts            (TOL=… pour une autre tolérance)
 */
const TOL = Number(process.env.TOL ?? 2)
const W = 34.2, E = 36.0, S = 29.35, N = 33.45
const src = JSON.parse(readFileSync('geodata/osm-borders.json', 'utf8')) as { zones: Record<string, MultiPolygon>; fetched: string }
const sea = JSON.parse(readFileSync('src/core/sea.json', 'utf8')) as { sea: MultiPolygon }
const frame: Polygon = [[[W, S], [E, S], [E, N], [W, N], [W, S]]]

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
function inRing(r: number[][], x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c
  return c
}
const inShape = (s: MultiPolygon, x: number, y: number) => s.some((p) => inRing(p[0], x, y) && !p.slice(1).some((h) => inRing(h, x, y)))

const r6 = (v: number) => Math.round(v * 1e6) / 1e6
const out: Record<string, MultiPolygon> = {}
for (const key of ['egypt', 'jordan', 'syria', 'lebanon', 'gaza']) {
  const land = polygonClipping.difference(polygonClipping.intersection(src.zones[key], frame), sea.sea)
  /* L'arrondi à 1e-6° (~10 cm) peut fermer un anneau sur lui-même : on le refait passer par polygon-clipping. */
  const simple = land
    .map((poly) => poly.map((ring) => dpRing(ring as Array<[number, number]>, TOL).map(([x, y]) => [r6(x), r6(y)] as [number, number])))
    .filter((poly) => poly[0].length >= 4)
  out[key] = polygonClipping.union(simple as MultiPolygon)
  console.log(`${key} : ${out[key].length} polygone(s), ${out[key].flat(2).length} points`)
}

/* Le pays reste le pays. */
const HOME: Array<[string, number, number]> = [
  ['Tel-Aviv', 32.08, 34.8], ['Jérusalem', 31.78, 35.22], ['Ramallah (Judée-Samarie)', 31.9, 35.2], ['Jéricho (Judée-Samarie)', 31.86, 35.45],
  ['Naplouse (Samarie)', 32.22, 35.26], ['Katzrin (Golan)', 32.99, 35.69], ['Majdal Shams (Golan)', 33.27, 35.77], ['Hermon israélien', 33.3, 35.78],
  ['Kiryat Shmona', 33.21, 35.57], ['Eilat', 29.56, 34.95], ['Beit Shean', 32.5, 35.5], ['Sdérot', 31.52, 34.6], ['Golan, centre', 33.0, 35.75], ['Judée-Samarie, centre', 32.0, 35.25],
]
for (const [name, lat, lng] of HOME) for (const [k, z] of Object.entries(out)) if (inShape(z, lng, lat)) throw new Error(`⛔ ${name} tombe dans « ${k} »`)
const AWAY: Array<[string, number, number]> = [['egypt', 30.6, 34.35], ['gaza', 31.45, 34.4], ['lebanon', 33.35, 35.4], ['syria', 33.0, 35.97], ['jordan', 30.6, 35.6], ['jordan', 32.0, 35.6]]
for (const [k, lat, lng] of AWAY) if (!inShape(out[k], lng, lat)) throw new Error(`⛔ le témoin ${lat},${lng} n'est pas dans « ${k} »`)

writeFileSync(
  'src/core/abroad.json',
  JSON.stringify({
    source: `OpenStreetMap, polygones des pays voisins (geodata/osm-borders.json, ${src.fetched}) − la mer · Douglas–Peucker ${TOL} m · option A du PO (2026-10-19) · © contributeurs OpenStreetMap, ODbL`,
    kept: ['westbank', 'golan'],
    zones: Object.fromEntries(Object.entries(out).map(([k, z]) => [k, tile(z)])),
  }),
)
console.log(`src/core/abroad.json écrit (TOL ${TOL} m)`)
