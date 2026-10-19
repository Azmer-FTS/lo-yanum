import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { PMTiles } from 'pmtiles'
import type { MultiPolygon } from 'polygon-clipping'

import { SEGS, coastVs, compare, dense, edgesOfLines, frontier, riverOf, riverVs, whole } from './bmgeo'
import type { Geo, Pt, Stat } from './bmgeo'

/**
 * ★★ BM (chantier 1) — OÙ LES FRONTIÈRES TOMBENT MAL, EN MÈTRES. Lecture seule.
 *
 * Référence : les polygones des voisins d'OpenStreetMap à PLEINE résolution
 * (`geodata/osm-borders.json`). On en tire la FRONTIÈRE TERRESTRE (le bord de
 * leur réunion, côté terre, côté pays — les frontières entre voisins
 * disparaissent dans la réunion) ; chaque segment est nommé par le voisin qui
 * la borde et, pour la Jordanie, par la latitude.
 *
 * Pour chaque segment et chaque candidat, l'écart au PIRE endroit : la plus
 * grande distance d'un point de l'une des deux lignes à l'autre (Hausdorff,
 * points tous les 10 m), plus le 95ᵉ centile et la moyenne.
 *
 *   candidats : BL (abroad.json d'avant, OLD=…), BM (src/core/abroad.json),
 *               les lignes de la carte au zoom 12 (borders.json) et au zoom 14
 *               (extraites de l'archive, si elle est là).
 *   + le trait de côte : sea.json contre `natural=coastline` d'OSM ;
 *   + le Jourdain : le cours de la rivière contre chaque ligne.
 *
 *   OLD=private/bm/abroad-bl.json bun run scripts/bmmeasure.ts  → docs/bm/ecarts.json
 */
const geo = JSON.parse(readFileSync('geodata/osm-borders.json', 'utf8')) as Geo
const sea = whole((JSON.parse(readFileSync('src/core/sea.json', 'utf8')) as { sea: MultiPolygon }).sea)
const zonesOf = (f: string) => (JSON.parse(readFileSync(f, 'utf8')) as { zones: Record<string, MultiPolygon> }).zones
const truthEdges = frontier(geo.zones, sea)

const results: Record<string, Record<string, { fwd: Stat; rev: Stat }>> = {}
const OLD = process.env.OLD ?? 'private/bm/abroad-bl.json'
if (existsSync(OLD)) results.bl = compare(truthEdges, frontier(zonesOf(OLD), sea))
results.bm = compare(truthEdges, frontier(zonesOf('src/core/abroad.json'), sea))
const b12 = JSON.parse(readFileSync('src/core/borders.json', 'utf8')) as { greenLine: number[][]; border: number[][] }
const flatToLines = (fs: number[][]) => fs.map((f) => Array.from({ length: f.length / 2 }, (_, k) => [f[2 * k + 1], f[2 * k]] as Pt))
results.tiles12 = compare(truthEdges, edgesOfLines(flatToLines([...b12.border, ...b12.greenLine])))

/* Les mêmes lignes au zoom 14 (le plus fin de l'archive), sans simplification. */
const ARCHIVE = 'basemap/israel-20260831-z14.pmtiles'
if (existsSync(ARCHIVE)) {
  const buf = readFileSync(ARCHIVE)
  const pm = new PMTiles({ getKey: () => ARCHIVE, getBytes: async (o: number, l: number) => ({ data: buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + l) }) } as never)
  const z = 14, n = 2 ** z
  const lx = (lng: number) => Math.floor(((lng + 180) / 360) * n)
  const ly = (lat: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) }
  const t2lng = (x: number) => (x / n) * 360 - 180
  const t2lat = (y: number) => { const k = Math.PI - (2 * Math.PI * y) / n; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k))) }
  const lines: Pt[][] = []
  /* Seulement les cases que la frontière vraie traverse (± une) : l'archive entière au zoom 14, c'est 15 000 tuiles. */
  const cells = new Set<string>()
  for (const e of truthEdges) for (const p of dense(e.a, e.b, 500)) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) cells.add(`${lx(p[0]) + dx},${ly(p[1]) + dy}`)
  for (const c of cells) {
    const [x, y] = c.split(',').map(Number)
    const hit = await pm.getZxy(z, x, y)
    if (!hit) continue
    const t = new VectorTile(new Pbf(new Uint8Array(hit.data)))
    const L = t.layers.boundaries
    if (!L) continue
    for (let i = 0; i < L.length; i++) {
      const f = L.feature(i)
      if (f.properties.kind !== 'country') continue
      for (const line of f.loadGeometry()) lines.push(line.map((q) => [t2lng(x + q.x / L.extent), t2lat(y + q.y / L.extent)] as Pt))
    }
  }
  results.tiles14 = compare(truthEdges, edgesOfLines(lines))
}

/* Le trait de côte : la mer (sea.json, avant et après) contre `natural=coastline`, par tronçon, dans les deux sens. */
const OLD_SEA = process.env.OLD_SEA ?? 'private/bm/sea-bl.json'
const coast: Record<string, Record<string, { fwd: Stat; rev: Stat }>> = { bm: coastVs(geo.coast, sea) }
if (existsSync(OLD_SEA)) coast.bl = coastVs(geo.coast, whole((JSON.parse(readFileSync(OLD_SEA, 'utf8')) as { sea: MultiPolygon }).sea))

/* Le Jourdain : le cours de la rivière (Kinneret → mer Morte) contre chaque ligne. */
const river = riverOf(geo)
const riverRes: Record<string, Stat> = { osm: riverVs(river, truthEdges.filter((e) => e.seg === 'jordan-river')) }
if (existsSync(OLD)) riverRes.bl = riverVs(river, frontier(zonesOf(OLD), sea).filter((e) => e.seg === 'jordan-river'))
riverRes.bm = riverVs(river, frontier(zonesOf('src/core/abroad.json'), sea).filter((e) => e.seg === 'jordan-river'))
riverRes.tiles12 = riverVs(river, edgesOfLines(flatToLines([...b12.border, ...b12.greenLine])))

const report = { borders: results, coast, river: riverRes }
writeFileSync(process.env.OUT ?? 'docs/bm/ecarts.json', JSON.stringify(report, null, 1))
for (const [cand, r] of Object.entries(results)) console.log(cand.padEnd(8), SEGS.map((s) => `${s} ${r[s].fwd.max}/${r[s].fwd.p95}/${r[s].fwd.mean} ↩${r[s].rev.max}`).join(' · '))
for (const [cand, r] of Object.entries(coast)) console.log(`côte ${cand}`, Object.entries(r).map(([k, s]) => `${k} ${s.fwd.max}/${s.fwd.p95}/${s.fwd.mean} ↩${s.rev.max} (${s.fwd.km} km)`).join(' · '))
console.log('Jourdain', Object.entries(riverRes).map(([k, s]) => `${k} max ${s.max} p95 ${s.p95} moy ${s.mean}`).join(' · '))
