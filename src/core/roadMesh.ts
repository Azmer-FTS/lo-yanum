import { routeCrossing, segmentCrossing } from './borders'
import type { BorderKind } from './borders'
import { RoadGraph, corridorTiles, roadLeg } from './roadGraph'
import type { RoadLeg } from './roadGraph'
import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AW1 (2026-10-09) — LE MAILLAGE SUR LA ROUTE, PAIRE PAR PAIRE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « À 35 km, TOUT est relié à TOUT. » — le PO, sur la carte de couverture.
 *
 * AU4.6 filtrait au vol d'oiseau et ne mesurait la route que pour
 * l'institution choisie. Or la route fait en moyenne +69 % du vol d'oiseau
 * dans sa zone (AI3.4) : un rayon de 35 km reliait des points distants de 50
 * à 80 km. Le PO s'est engagé sur 30–35 km PAR LA ROUTE devant onze
 * institutions ; le maillage doit dire la route, partout.
 *
 * ★ LE VOL D'OISEAU NE SERT PLUS QU'À ÉCARTER L'IMPOSSIBLE. Une route n'est
 *   jamais plus courte que le vol d'oiseau : une paire à plus de R km à vol
 *   d'oiseau est hors rayon sur route, SANS calcul. C'est exact, pas une
 *   approximation. Tout le reste est mesuré sur le réseau hors ligne (AI2).
 *
 * ★ LA LIGNE VERTE (AW1.6). Le plus rapide est cherché d'abord ; s'il franchit
 *   la Ligne verte ou une frontière, un second calcul INTERDIT les arêtes qui
 *   la coupent — c'est le trajet par Israël, que le PO peut prendre. Le lien
 *   porte ce trajet-là, et dit que le plus rapide passe au-delà. S'il n'y a
 *   pas de trajet par Israël, le lien est « au-delà seulement » : dessiné
 *   autrement, et compté dans AUCUNE couverture.
 *
 * Ce module est PUR (le graphe et le chargeur de tuiles sont passés) :
 * `bun run awpass` le rejoue sur l'archive réelle, hors navigateur.
 */

export type PairRoad =
  | {
      kind: 'road'
      km: number
      seconds: number
      trackKm: number
      /** Le plus rapide franchit une ligne : sa longueur et sa durée. */
      fastestBeyond: null | { line: BorderKind; km: number; seconds: number }
      /** Le tracé (mémoire de la page seulement, jamais stocké). */
      coords?: LatLng[]
    }
  | { kind: 'beyondOnly'; line: BorderKind; km: number; seconds: number; coords?: LatLng[] }
  | { kind: 'none' }

/** La clé d'une paire : les deux points au 1/100 000 de degré (~1 m). */
export function pairKey(from: LatLng, to: LatLng): string {
  return `${from.lat.toFixed(5)},${from.lng.toFixed(5)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}`
}

/** Au-delà, un couloir élargi n'est pas lu : la paire reste « sans chemin ». */
export const MESH_MAX_WIDEN_TILES = 400

export type TileLoader = (tiles: Array<[number, number, number]>) => Promise<void>

/**
 * Mémoire « cette arête franchit-elle une ligne ? » — les indices d'arêtes
 * du graphe ne bougent jamais (il ne fait que grandir).
 */
export class BorderEdges {
  private memo = new Uint8Array(0)
  constructor(private readonly graph: RoadGraph) {}
  readonly blocked = (e: number): boolean => {
    if (e >= this.memo.length) {
      const next = new Uint8Array(Math.max(this.graph.eFrom.length, e + 1) + 4096)
      next.set(this.memo)
      this.memo = next
    }
    const m = this.memo[e]
    if (m !== 0) return m === 2
    const g = this.graph
    const a = g.eFrom[e]
    const b = g.eTo[e]
    const hit = segmentCrossing(g.lat[a], g.lng[a], g.lat[b], g.lng[b]) !== null
    this.memo[e] = hit ? 2 : 1
    return hit
  }
}

async function legBetween(
  graph: RoadGraph,
  load: TileLoader,
  from: LatLng,
  to: LatLng,
  blocked?: (e: number) => boolean,
): Promise<RoadLeg | null> {
  await load(corridorTiles(from, to))
  let a = graph.snap(from)
  let b = graph.snap(to)
  if (!a || !b) return null
  let leg = roadLeg(graph, from, to, a, b, blocked)
  if (leg) return leg
  const wider = corridorTiles(from, to, 2.5).filter(([z, x, y]) => !graph.hasTile(z, x, y))
  if (wider.length === 0 || wider.length > MESH_MAX_WIDEN_TILES) return null
  await load(wider)
  a = graph.snap(from)
  b = graph.snap(to)
  if (!a || !b) return null
  leg = roadLeg(graph, from, to, a, b, blocked)
  return leg
}

/** La route d'une paire, telle que la carte de couverture la montre. */
export async function measurePair(
  graph: RoadGraph,
  borders: BorderEdges,
  load: TileLoader,
  from: LatLng,
  to: LatLng,
): Promise<PairRoad> {
  const fastest = await legBetween(graph, load, from, to)
  if (!fastest) return { kind: 'none' }
  const line = routeCrossing(fastest.coords)
  if (!line) {
    return { kind: 'road', km: fastest.meters / 1000, seconds: fastest.seconds, trackKm: fastest.trackMeters / 1000, fastestBeyond: null, coords: fastest.coords }
  }
  const inside = await legBetween(graph, load, from, to, borders.blocked)
  if (!inside) return { kind: 'beyondOnly', line, km: fastest.meters / 1000, seconds: fastest.seconds, coords: fastest.coords }
  return {
    kind: 'road',
    km: inside.meters / 1000,
    seconds: inside.seconds,
    trackKm: inside.trackMeters / 1000,
    fastestBeyond: { line, km: fastest.meters / 1000, seconds: fastest.seconds },
    coords: inside.coords,
  }
}

/** Compacté pour le stockage : ~40 octets par paire. */
export function packPair(p: PairRoad): string {
  if (p.kind === 'none') return 'n'
  if (p.kind === 'beyondOnly') return `b|${p.line === 'greenLine' ? 'g' : 'f'}|${p.km.toFixed(2)}|${Math.round(p.seconds)}`
  const fb = p.fastestBeyond
  return `r|${p.km.toFixed(2)}|${Math.round(p.seconds)}|${p.trackKm.toFixed(2)}${fb ? `|${fb.line === 'greenLine' ? 'g' : 'f'}|${fb.km.toFixed(2)}|${Math.round(fb.seconds)}` : ''}`
}

export function unpackPair(s: string): PairRoad | null {
  const p = s.split('|')
  if (p[0] === 'n') return { kind: 'none' }
  const line = (c: string): BorderKind => (c === 'g' ? 'greenLine' : 'border')
  if (p[0] === 'b' && p.length === 4) return { kind: 'beyondOnly', line: line(p[1]), km: Number(p[2]), seconds: Number(p[3]) }
  if (p[0] === 'r' && (p.length === 4 || p.length === 7)) {
    return {
      kind: 'road',
      km: Number(p[1]),
      seconds: Number(p[2]),
      trackKm: Number(p[3]),
      fastestBeyond: p.length === 7 ? { line: line(p[4]), km: Number(p[5]), seconds: Number(p[6]) } : null,
    }
  }
  return null
}
