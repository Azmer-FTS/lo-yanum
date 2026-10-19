import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon, Ring } from 'polygon-clipping'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BM (chantier 1) — LES FRONTIÈRES, À LA PLEINE RÉSOLUTION D'OPENSTREETMAP.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Il n'a pas vraiment pris la moitié du Jourdain, il n'a pas pris les
 *     vraies frontières de la map. »                                  — le PO
 *
 * BL tirait l'au-delà des LIGNES de la carte (`borders.json` : tuiles au zoom
 * 12, simplifiées à 15 m) par une grille de 150 m puis Douglas–Peucker à
 * 100 m. Ici, plus de lignes ni de grille : les POLYGONES des pays voisins
 * tels qu'OpenStreetMap les enregistre (relations `boundary=administrative`,
 * `admin_level=2`), à la résolution de leurs nœuds, récupérés UNE FOIS par
 * l'API Overpass et rangés dans le dépôt (`geodata/`).
 *
 *   Égypte 1473947 · Jordanie 184818 · Syrie 184840 · Liban 184843
 *   · bande de Gaza 1473938 (admin_level 4)
 *
 * ★ Le Golan et la Judée-Samarie : dans OpenStreetMap, le Golan est DANS la
 *   relation d'Israël (la revendication syrienne est une relation `claim` à
 *   part, 13574167, jamais lue ici) ; la Judée-Samarie n'est dans AUCUN pays
 *   voisin. Les cinq polygones donnent donc EXACTEMENT l'option A du PO, sans
 *   correction. `bmabroad.ts` le vérifie à chaque génération.
 *
 * Écrit `geodata/osm-borders.json` : les cinq polygones découpés au cadre
 * élargi, à pleine résolution ; plus, pour la MESURE seulement, le trait de
 * côte (`natural=coastline`) et le cours du Jourdain (`waterway=river`).
 *
 *   OSM_DIR=<dossier de réponses déjà téléchargées> bun run scripts/bmfetch.ts
 *   bun run scripts/bmfetch.ts            # télécharge dans private/bm/osm/
 *
 * Données © les contributeurs d'OpenStreetMap, sous licence ODbL.
 */
const DIR = process.env.OSM_DIR ?? 'private/bm/osm'
const W = 34.0, E = 36.3, S = 29.2, N = 33.6
const ZONES = { egypt: 1473947, jordan: 184818, syria: 184840, lebanon: 184843, gaza: 1473938 } as const

interface OsmWay { type: 'way'; id: number; nodes: number[]; geometry: Array<{ lat: number; lon: number }>; tags?: Record<string, string> }
interface OsmRel { type: 'relation'; id: number; members: Array<{ type: string; ref: number; role: string }> }
type El = OsmWay | OsmRel

async function overpass(file: string, query: string): Promise<El[]> {
  const path = `${DIR}/${file}`
  if (!existsSync(path)) {
    mkdirSync(DIR, { recursive: true })
    let wait = 10_000
    for (let i = 0; ; i++) {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'lo-yanum-borders/1.0' }, body: new URLSearchParams({ data: query }) })
      const text = await r.text()
      if (r.ok && text.trimStart().startsWith('{')) { writeFileSync(path, text); break }
      if (i >= 6) throw new Error(`Overpass : ${r.status} pour ${file}`)
      await new Promise((ok) => setTimeout(ok, wait))
      wait *= 2
    }
  }
  return (JSON.parse(readFileSync(path, 'utf8')) as { elements: El[] }).elements
}

/** Les chemins d'une relation, mis bout à bout par leurs nœuds d'extrémité, en anneaux fermés. */
function rings(ways: OsmWay[]): Ring[] {
  const left = ways.map((w) => ({ ids: [...w.nodes], pts: w.geometry.map((g) => [g.lon, g.lat] as [number, number]) }))
  const out: Ring[] = []
  while (left.length) {
    const cur = left.shift()!
    while (cur.ids[0] !== cur.ids[cur.ids.length - 1]) {
      const end = cur.ids[cur.ids.length - 1]
      const k = left.findIndex((w) => w.ids[0] === end || w.ids[w.ids.length - 1] === end)
      if (k < 0) throw new Error(`anneau ouvert au nœud ${end}`)
      const w = left.splice(k, 1)[0]
      if (w.ids[0] !== end) { w.ids.reverse(); w.pts.reverse() }
      cur.ids.push(...w.ids.slice(1))
      cur.pts.push(...w.pts.slice(1))
    }
    out.push(cur.pts)
  }
  return out
}

const frame: Polygon = [[[W, S], [E, S], [E, N], [W, N], [W, S]]]
const zones: Record<string, MultiPolygon> = {}
for (const [key, id] of Object.entries(ZONES)) {
  const els = await overpass(`rel-${id}.json`, `[out:json][timeout:240];relation(${id});out body;way(r);out skel geom;`)
  const rel = els.find((e): e is OsmRel => e.type === 'relation')!
  const byId = new Map(els.filter((e): e is OsmWay => e.type === 'way').map((w) => [w.id, w]))
  const pick = (role: string) => rel.members.filter((m) => m.type === 'way' && m.role === role).map((m) => byId.get(m.ref)!)
  /* Extérieurs et trous réunis par différence : l'ordre des anneaux n'a pas à être deviné. */
  const outer = polygonClipping.union(...(rings(pick('outer')).map((r) => [r]) as [Polygon, ...Polygon[]]))
  const inner = rings(pick('inner'))
  const whole = inner.length ? polygonClipping.difference(outer, ...inner.map((r) => [r] as Polygon)) : outer
  zones[key] = polygonClipping.intersection(whole, frame)
  console.log(`${key} (${id}) : ${zones[key].length} polygone(s), ${zones[key].flat(2).length} points dans le cadre`)
}

const coastEls = await overpass('coast.json', `[out:json][timeout:180];way["natural"="coastline"](${S + 0.1},${W + 0.1},${N - 0.1},${E - 0.2});out skel geom;`)
/* Le trait de côte, chemins mis bout à bout par leurs nœuds (sens OSM : la terre à GAUCHE) ; les îles sont des anneaux. */
const coast: number[][][] = []
{
  const left = coastEls.filter((e): e is OsmWay => e.type === 'way').map((w) => ({ ids: [...w.nodes], pts: w.geometry.map((g) => [g.lon, g.lat]) }))
  while (left.length) {
    const cur = left.shift()!
    for (let grown = true; grown && cur.ids[0] !== cur.ids[cur.ids.length - 1]; ) {
      grown = false
      const k = left.findIndex((w) => w.ids[0] === cur.ids[cur.ids.length - 1])
      if (k >= 0) { const w = left.splice(k, 1)[0]; cur.ids.push(...w.ids.slice(1)); cur.pts.push(...w.pts.slice(1)); grown = true; continue }
      const h = left.findIndex((w) => w.ids[w.ids.length - 1] === cur.ids[0])
      if (h >= 0) { const w = left.splice(h, 1)[0]; cur.ids.unshift(...w.ids.slice(0, -1)); cur.pts.unshift(...w.pts.slice(0, -1)); grown = true }
    }
    coast.push(cur.pts)
  }
}
const riverEls = await overpass('rivers.json', '[out:json][timeout:180];way["waterway"="river"](31.75,35.45,32.75,35.65);out tags geom;')
const jordanRiver = riverEls
  .filter((e): e is OsmWay => e.type === 'way' && /River Jordan|Jordan River/.test(e.tags?.['name:en'] ?? ''))
  .map((w) => w.geometry.map((g) => [g.lon, g.lat]))

mkdirSync('geodata', { recursive: true })
writeFileSync(
  'geodata/osm-borders.json',
  JSON.stringify({
    source: 'OpenStreetMap (Overpass API), relations admin_level=2 Égypte 1473947, Jordanie 184818, Syrie 184840, Liban 184843 ; bande de Gaza 1473938 (admin_level 4). © contributeurs OpenStreetMap, ODbL.',
    fetched: new Date().toISOString().slice(0, 10),
    frame: [W, S, E, N],
    zones,
    coast,
    jordanRiver,
  }),
)
console.log(`trait de côte : ${coast.length} chaînes (${coast.filter((c) => c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]).length} anneaux) ; Jourdain : ${jordanRiver.length} chemins`)
