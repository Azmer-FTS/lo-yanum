import { readFileSync, writeFileSync } from 'node:fs'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { PMTiles } from 'pmtiles'
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BL (chantier 3.1) — LA MER, TIRÉE DES TUILES QUE LA CARTE CHARGE DÉJÀ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Celle qui dépasse dans la mer, aucun intérêt. »            — le PO
 *
 * L'archive de la carte (`basemap/israel-*.pmtiles`, OpenStreetMap découpé par
 * Protomaps — la MÊME que celle des routes de BK et des frontières d'AW1.6)
 * porte, dans sa couche `water`, les polygones `kind = ocean` : la mer bornée
 * par le trait de côte d'OpenStreetMap (`natural=coastline`) — la Méditerranée
 * et le golfe d'Eilat. ⚠️ Pas la couche `earth` : dans cet extrait elle couvre
 * TOUT le cadre (mesuré : union = le cadre entier) et la mer est peinte
 * par-dessus. Les lacs (Kinneret, mer Morte) sont `lake`, pas `ocean` : ce ne
 * sont pas des côtes, ils restent dans les régions.
 *
 *   mer = union des polygones `ocean` (zoom 10, ~10 m), dans le cadre
 *
 * puis Douglas–Peucker à 25 m. Écrit dans `src/core/sea.json` (embarqué : le
 * hors-ligne ne charge rien à la demande, cf. AJ).
 *
 *   Rejouer : `bun run scripts/blsea.ts` (lit `basemap/*.pmtiles`).
 */
const ARCHIVE = 'basemap/israel-20260831-z14.pmtiles'
const buf = readFileSync(ARCHIVE)
const pm = new PMTiles({ getKey: () => ARCHIVE, getBytes: async (o: number, l: number) => ({ data: buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + l) }) } as never)
const h = await pm.getHeader()
const z = 10
const n = 2 ** z
const lx = (lng: number) => Math.floor(((lng + 180) / 360) * n)
const ly = (lat: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
}
const W = h.minLon, S = h.minLat, E = h.maxLon, N = h.maxLat
const pieces: Polygon[] = []
for (let x = lx(W); x <= lx(E); x++) {
  for (let y = ly(N); y <= ly(S); y++) {
    const hit = await pm.getZxy(z, x, y)
    if (!hit) continue
    const t = new VectorTile(new Pbf(new Uint8Array(hit.data)))
    const L = t.layers.water
    if (!L) continue
    for (let i = 0; i < L.length; i++) {
      const f = L.feature(i)
      if (f.properties.kind !== 'ocean') continue
      const g = f.toGeoJSON(x, y, z).geometry
      if (g.type === 'Polygon') pieces.push(g.coordinates as Polygon)
      else if (g.type === 'MultiPolygon') for (const p of g.coordinates) pieces.push(p as Polygon)
    }
  }
}
const frame: Polygon = [[[W, S], [E, S], [E, N], [W, N], [W, S]]]
const merged = polygonClipping.union(...(pieces as [Polygon, ...Polygon[]]))
const sea = polygonClipping.intersection(frame, merged)

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
      const px = pts[i][0] * KX, py = pts[i][1] * KY
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
      if (d > best) { best = d; bi = i }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}
/** Un anneau FERMÉ (premier = dernier) : coupé en deux au point le plus éloigné du premier, sinon DP n'a pas de corde. */
function dpRing(r: Array<[number, number]>, tol: number): Array<[number, number]> {
  let far = 1, fd = -1
  for (let i = 1; i < r.length - 1; i++) {
    const d = Math.hypot((r[i][0] - r[0][0]) * KX, (r[i][1] - r[0][1]) * KY)
    if (d > fd) { fd = d; far = i }
  }
  const a = dp(r.slice(0, far + 1), tol)
  const b = dp(r.slice(far), tol)
  return [...a, ...b.slice(1)]
}
const areaKm2 = (r: Array<[number, number]>) => {
  let s = 0
  for (let i = 0; i < r.length - 1; i++) s += r[i][0] * KX * r[i + 1][1] * KY - r[i + 1][0] * KX * r[i][1] * KY
  return Math.abs(s) / 2 / 1e6
}
const out: number[][][][] = []
let pts = 0
for (const poly of sea as MultiPolygon) {
  const outer = poly[0] as Array<[number, number]>
  /* Les bassins de moins de 0,05 km² (marinas, bassins de port) : sans effet sur une région. */
  if (areaKm2(outer) < 0.05) continue
  const rings = poly.map((r) => dpRing(r as Array<[number, number]>, 25).map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]))
  pts += rings.reduce((s, r) => s + r.length, 0)
  out.push(rings)
}
writeFileSync('src/core/sea.json', JSON.stringify({ source: `${ARCHIVE} · earth · z${z}`, frame: [W, S, E, N], sea: out }))
console.log(`morceaux de mer: ${pieces.length}; mers: ${out.length}; points: ${pts}; aires km2: ${out.map((p) => areaKm2(p[0] as Array<[number, number]>).toFixed(1)).join(', ')}`)
