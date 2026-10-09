import { readFileSync } from 'node:fs'
import { PMTiles } from 'pmtiles'

import { RoadGraph } from '../src/core/roadGraph'
import { BorderEdges, measurePair, pairKey } from '../src/core/roadMesh'
import type { PairRoad } from '../src/core/roadMesh'
import type { LatLng } from '../src/core/types'
import { decodeRoadTile } from '../src/ui/routing/decodeRoads'

/**
 * ★ AW1 — LA VÉRITÉ ROUTIÈRE, HORS NAVIGATEUR : l'archive de la carte lue
 *   depuis le disque, décodée et routée par le MÊME code que l'app
 *   (`core/roadMesh.ts`). Ce que les portes comparent à l'écran.
 */
export const ARCHIVE = 'basemap/israel-20260831-z14.pmtiles'

export function makeTruth() {
  const buf = readFileSync(ARCHIVE)
  const pm = new PMTiles({
    getKey: () => ARCHIVE,
    getBytes: async (o: number, l: number) => ({ data: buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + l) }),
  } as never)
  const graph = new RoadGraph()
  const borders = new BorderEdges(graph)
  const load = async (ts: Array<[number, number, number]>) => {
    let added = 0
    for (const [z, x, y] of ts) {
      if (graph.hasTile(z, x, y)) continue
      const hit = await pm.getZxy(z, x, y)
      graph.addTile(hit ? decodeRoadTile(new Uint8Array(hit.data), z, x, y) : { z, x, y, extent: 4096, features: [] })
      added++
    }
    if (added) graph.repairJunctions()
  }
  const known = new Map<string, PairRoad>()
  return {
    graph,
    known,
    async measure(from: LatLng, to: LatLng): Promise<PairRoad> {
      const k = pairKey(from, to)
      const hit = known.get(k)
      if (hit) return hit
      const r = await measurePair(graph, borders, load, from, to)
      known.set(k, r)
      return r
    },
    road: (from: LatLng, to: LatLng) => known.get(pairKey(from, to)),
  }
}
