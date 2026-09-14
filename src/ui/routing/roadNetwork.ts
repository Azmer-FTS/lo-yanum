import { PMTiles } from 'pmtiles'
import type { RangeResponse, Source } from 'pmtiles'

import {
  RoadGraph,
  corridorTiles,
  roadLeg,
} from '@core/roadGraph'
import type { RoadLeg, Snap } from '@core/roadGraph'
import type { LatLng } from '@core/types'

import { BASEMAP_URL, RetryingSource } from '../components/basemap'
import { decodeRoadTile } from './decodeRoads'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AI2 · AI4 (2026-09-14) — LE RÉSEAU ROUTIER, LU DANS L'ARCHIVE DE LA CARTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ AI10 · A179 — CE FICHIER NE CONNAÎT QU'UNE ADRESSE, `BASEMAP_URL`, CELLE
 *    DE L'ARCHIVE QUE LA CARTE LIT DÉJÀ (même origine, servie par l'application
 *    ou par le service worker quand elle est téléchargée). Aucun calculateur
 *    d'itinéraire, aucune coordonnée dans une URL, rien qui quitte l'appareil
 *    que la carte n'envoie pas déjà — et quand l'archive est dans l'appareil,
 *    rien du tout.
 *
 * ★★ AI4.2 — LE GRAPHE VIT ICI, UNE FOIS, POUR LA VIE DE LA PAGE. Il n'est ni
 *    dans un composant ni dans la carte : déplacer la carte, changer l'ordre,
 *    renommer une étape ne reconstruit rien. Une tuile lue une fois reste lue ;
 *    un trajet qui repasse sur la même zone ne lit plus rien.
 *
 * ★ LES LECTURES PAR BLOCS. PMTiles lit une plage d'octets par tuile ; trois
 *   cents tuiles feraient trois cents requêtes, chacune traversant le service
 *   worker. L'archive est rangée selon une courbe de Hilbert : les tuiles
 *   voisines sur le terrain sont voisines dans le fichier. On lit donc par
 *   blocs de 256 Kio, gardés en mémoire, et une zone de tournée se lit en
 *   quelques blocs.
 */

const CHUNK = 256 * 1024
/** Au-delà, une étape sans chemin se replie au lieu d'élargir (voir plus bas). */
const MAX_WIDEN_TILES = 160
const MAX_CHUNKS = 96

class ChunkedSource implements Source {
  private readonly chunks = new Map<number, Promise<ArrayBuffer>>()

  constructor(private readonly inner: Source) {}

  getKey(): string {
    return `${this.inner.getKey()}#roads`
  }

  private chunk(index: number, etag?: string): Promise<ArrayBuffer> {
    let hit = this.chunks.get(index)
    if (!hit) {
      loadBreakdown.chunks += 1
      hit = this.inner.getBytes(index * CHUNK, CHUNK, undefined, etag).then((r) => r.data)
      /* Un bloc raté ne doit pas empoisonner sa case (la leçon de
         `HealingCache`) : la prochaine demande refait la lecture. */
      hit.catch(() => this.chunks.delete(index))
      this.chunks.set(index, hit)
      if (this.chunks.size > MAX_CHUNKS) {
        const oldest = this.chunks.keys().next().value as number
        this.chunks.delete(oldest)
      }
    }
    return hit
  }

  async getBytes(offset: number, length: number, _signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    const first = Math.floor(offset / CHUNK)
    const last = Math.floor((offset + length - 1) / CHUNK)
    const parts = await Promise.all(
      Array.from({ length: last - first + 1 }, (_, i) => this.chunk(first + i, etag)),
    )
    const out = new Uint8Array(length)
    let written = 0
    for (let i = 0; i < parts.length && written < length; i++) {
      const base = (first + i) * CHUNK
      const start = Math.max(0, offset - base)
      const bytes = new Uint8Array(parts[i], start, Math.min(parts[i].byteLength - start, length - written))
      out.set(bytes, written)
      written += bytes.length
    }
    return { data: out.buffer.slice(0, written) }
  }
}

let archive: PMTiles | null = null
const graph = new RoadGraph()

/**
 * ★ AI4 — LES ÉTAPES DÉJÀ TRACÉES NE SE RETRACENT PAS. Ajouter une neuvième
 *   étape ne change que deux trajets (l'arrivée sur elle, le retour) ; les
 *   huit autres sont les mêmes couples de points. Mesuré avant : recalculer
 *   toute la tournée à chaque collage coûtait 200 ms de tracé en plus des
 *   tuiles, et poussait l'ajout d'une étape au-delà de la seconde.
 *
 * ⚠️ UNE ÉTAPE SANS CHEMIN N'EST PAS MISE EN CACHE : des tuiles arrivées
 *    depuis peuvent en ouvrir un.
 */
const legCache = new Map<string, { leg: RoadLeg; from: Snap; to: Snap }>()
const legKey = (a: LatLng, b: LatLng) => `${a.lat.toFixed(6)},${a.lng.toFixed(6)}>${b.lat.toFixed(6)},${b.lng.toFixed(6)}`

function pmtiles(): PMTiles {
  if (!archive) archive = new PMTiles(new ChunkedSource(new RetryingSource(BASEMAP_URL)))
  return archive
}

async function gunzipIfNeeded(data: ArrayBuffer): Promise<Uint8Array> {
  const bytes = new Uint8Array(data)
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Où passe le temps d'un chargement — imprimé par la mesure d'A177. */
export const loadBreakdown = { readMs: 0, decodeMs: 0, addMs: 0, repairMs: 0, chunks: 0 }

/** Charge ce qui manque, par lots, et répare les jonctions une fois le lot posé. */
async function ensureTiles(tiles: Array<[number, number, number]>): Promise<number> {
  const missing = tiles.filter(([z, x, y]) => !graph.hasTile(z, x, y))
  const unique = [...new Map(missing.map((t) => [t.join('/'), t])).values()]
  /* Toutes les tuiles en même temps : les lectures partagent les blocs de
     256 Kio, donc lancer les trois cents à la fois ne fait partir qu'une
     vingtaine de requêtes — en parallèle au lieu de lot après lot. */
  const decoded = await Promise.all(
    unique.map(async ([z, x, y]) => {
      const r0 = performance.now()
      const hit = await pmtiles().getZxy(z, x, y)
      loadBreakdown.readMs += performance.now() - r0
      if (!hit) return { z, x, y, extent: 4096, features: [] }
      const bytes = await gunzipIfNeeded(hit.data)
      const d0 = performance.now()
      const tile = decodeRoadTile(bytes, z, x, y)
      loadBreakdown.decodeMs += performance.now() - d0
      return tile
    }),
  )
  const a0 = performance.now()
  for (const tile of decoded) graph.addTile(tile)
  loadBreakdown.addMs += performance.now() - a0
  const j0 = performance.now()
  if (unique.length > 0) graph.repairJunctions()
  loadBreakdown.repairMs += performance.now() - j0
  return unique.length
}

export interface RoadRouteResult {
  /** Une étape par couple de points consécutifs ; `null` = aucun chemin. */
  legs: Array<RoadLeg | null>
  /** Le rattachement de chaque point ; `null` = aucune route à 5 km. */
  snaps: Array<Snap | null>
  /** L'archive n'a pas pu être lue : ni téléchargée, ni joignable. */
  unavailable: boolean
  timings: { loadMs: number; routeMs: number; tilesRead: number; totalMs: number }
  breakdown: typeof loadBreakdown
  stats: ReturnType<RoadGraph['stats']>
}

/**
 * Le tracé sur route d'une suite de points : départ, étapes, retour.
 *
 * ★ AI2.6 — UNE ÉTAPE SANS CHEMIN EST RETENTÉE UNE FOIS, SUR UN COULOIR DEUX
 *   FOIS ET DEMIE PLUS LARGE, avant d'être rendue `null`. Le repli à vol d'oiseau est
 *   décidé par l'écran, qui le dessine autrement et le dit.
 */
export async function planRoadRoute(points: LatLng[]): Promise<RoadRouteResult> {
  const t0 = performance.now()
  let tilesRead = 0
  try {
    const wanted: Array<[number, number, number]> = []
    for (let i = 1; i < points.length; i++) wanted.push(...corridorTiles(points[i - 1], points[i]))
    tilesRead += await ensureTiles(wanted)
  } catch {
    return {
      legs: points.slice(1).map(() => null),
      snaps: points.map(() => null),
      unavailable: true,
      timings: { loadMs: performance.now() - t0, routeMs: 0, tilesRead, totalMs: performance.now() - t0 },
      stats: graph.stats(),
      breakdown: { ...loadBreakdown },
    }
  }
  const t1 = performance.now()
  let loadExtra = 0

  const snaps: Array<Snap | null> = points.map(() => null)
  const snapAt = (k: number): Snap | null => {
    if (snaps[k] === null) snaps[k] = graph.snap(points[k])
    return snaps[k]
  }
  const legs: Array<RoadLeg | null> = []
  for (let i = 1; i < points.length; i++) {
    const key = legKey(points[i - 1], points[i])
    const cached = legCache.get(key)
    if (cached) {
      legs.push(cached.leg)
      snaps[i - 1] = snaps[i - 1] ?? cached.from
      snaps[i] = snaps[i] ?? cached.to
      continue
    }
    const a = snapAt(i - 1)
    const b = snapAt(i)
    let leg = a && b ? roadLeg(graph, points[i - 1], points[i], a, b) : null
    /**
     * ⚠️★ L'ÉLARGISSEMENT EST BORNÉ, ET A176 L'A EXIGÉ. Un point en mer (aucune
     *    route à 5 km) déclenchait l'élargissement d'un trajet de 90 km vers
     *    Jérusalem : plus de mille tuiles, toute l'agglomération de Tel-Aviv
     *    dans le graphe, et le fil principal gelé plus de trente secondes.
     *    Deux règles : un point qu'on ne peut RATTACHER à rien n'a pas de
     *    chemin, élargir n'y changera rien ; et on n'élargit pas au-delà de
     *    `MAX_WIDEN_TILES` tuiles neuves — au-delà, le repli dit la vérité plus
     *    vite qu'un calcul qui fige l'écran.
     */
    const widened = corridorTiles(points[i - 1], points[i], 2.5).filter(([z, x, y]) => !graph.hasTile(z, x, y))
    if (!leg && a && b && widened.length <= MAX_WIDEN_TILES) {
      const t2 = performance.now()
      try {
        tilesRead += await ensureTiles(widened)
      } catch {
        /* le couloir élargi n'a pas pu être lu : l'étape reste sans chemin */
      }
      loadExtra += performance.now() - t2
      snaps[i - 1] = graph.snap(points[i - 1])
      snaps[i] = graph.snap(points[i])
      const a2 = snaps[i - 1]
      const b2 = snaps[i]
      leg = a2 && b2 ? roadLeg(graph, points[i - 1], points[i], a2, b2) : null
    }
    const from = snaps[i - 1]
    const to = snaps[i]
    if (leg && from && to) legCache.set(key, { leg, from, to })
    legs.push(leg)
  }
  const end = performance.now()
  return {
    legs,
    snaps,
    unavailable: false,
    timings: {
      loadMs: t1 - t0 + loadExtra,
      routeMs: end - t1 - loadExtra,
      tilesRead,
      totalMs: end - t0,
    },
    stats: graph.stats(),
    breakdown: { ...loadBreakdown },
  }
}
