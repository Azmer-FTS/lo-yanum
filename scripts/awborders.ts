import { readFileSync, writeFileSync } from 'node:fs'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { PMTiles } from 'pmtiles'

/**
 * ★ AW1.6 — LES FRONTIÈRES QUE LA ROUTE NE DOIT PAS FRANCHIR, extraites de
 *   l'archive de la carte (la même que celle du réseau routier, OpenStreetMap
 *   découpé par Protomaps), et écrites dans `src/core/borders.json`.
 *
 *   Couche `boundaries`, `kind = country` uniquement :
 *     disputed = true  → la Ligne verte (Judée-Samarie) et le Golan ;
 *     disputed absent  → les frontières reconnues, dont celle de la bande de
 *                        Gaza, d'Égypte, de Jordanie, du Liban.
 *   Les lignes `county` disputées (découpage interne au-delà de la ligne) ne
 *   servent à rien : un trajet qui les touche a déjà franchi la ligne.
 *
 *   Zoom 12 (tuile ~8,5 km, quantum ~2 m) puis Douglas–Peucker à 15 m :
 *   assez fin pour un trajet qui longe la bande de Gaza à 3 km, assez léger
 *   pour être embarqué (hors ligne : aucun import paresseux, cf. AJ).
 *
 *   Rejouer : `bun run scripts/awborders.ts` (lit `basemap/*.pmtiles`).
 */
const ARCHIVE = 'basemap/israel-20260831-z14.pmtiles'
const buf = readFileSync(ARCHIVE)
const pm = new PMTiles({ getKey: () => ARCHIVE, getBytes: async (o: number, l: number) => ({ data: buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + l) }) } as never)
const z = 12
const n = 2 ** z
const lx = (lng: number) => Math.floor(((lng + 180) / 360) * n)
const ly = (lat: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
}
const t2lng = (x: number) => (x / n) * 360 - 180
const t2lat = (y: number) => {
  const k = Math.PI - (2 * Math.PI * y) / n
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)))
}
const KX = 111_320 * Math.cos((31.5 * Math.PI) / 180)
const KY = 110_540
function dp(pts: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: Array<[number, number]> = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const ax = pts[a][1] * KX, ay = pts[a][0] * KY, bx = pts[b][1] * KX, by = pts[b][0] * KY
    const len = Math.hypot(bx - ax, by - ay) || 1
    let best = -1, bi = -1
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][1] * KX, py = pts[i][0] * KY
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
      if (d > best) { best = d; bi = i }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}
const out: { greenLine: number[][]; border: number[][] } = { greenLine: [], border: [] }
let points = 0
for (let x = lx(34.2); x <= lx(35.95); x++) {
  for (let y = ly(33.45); y <= ly(29.4); y++) {
    const hit = await pm.getZxy(z, x, y)
    if (!hit) continue
    const t = new VectorTile(new Pbf(new Uint8Array(hit.data)))
    const L = t.layers.boundaries
    if (!L) continue
    for (let i = 0; i < L.length; i++) {
      const f = L.feature(i)
      if (f.properties.kind !== 'country') continue
      const disputed = f.properties.disputed === true
      for (const line of f.loadGeometry()) {
        const pts = line.map((q) => [t2lat(y + q.y / L.extent), t2lng(x + q.x / L.extent)] as [number, number])
        const s = dp(pts, 15)
        if (s.length < 2) continue
        points += s.length
        ;(disputed ? out.greenLine : out.border).push(s.flatMap(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]))
      }
    }
  }
}
writeFileSync('src/core/borders.json', JSON.stringify(out))
console.log(`lignes : ${out.greenLine.length} disputées, ${out.border.length} reconnues — ${points} points`)
