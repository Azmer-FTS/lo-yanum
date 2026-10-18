import type maplibregl from 'maplibre-gl'

import type { LatLng } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BK — L'ACCROCHE AUX ROUTES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le PO veut épouser le tracé des routes. »
 *
 * ★ LA GÉOMÉTRIE EST DÉJÀ LÀ, RIEN N'EST TÉLÉCHARGÉ DE PLUS. Les tuiles
 *   vectorielles que la carte charge (`protomaps`, l'archive PMTiles d'Israël)
 *   portent une couche `roads` — celle que le calcul d'itinéraire décode déjà
 *   (`routing/decodeRoads.ts`). Elle est dans le style en fond « plan » COMME
 *   en fond satellite (les routes sont dessinées par-dessus la photo). On lit
 *   ce que MapLibre a déjà chargé pour l'écran (`querySourceFeatures`).
 *
 * ⚠️ LIMITE, DITE : l'archive s'arrête au zoom 14. Au-delà, les routes sont
 *    celles du zoom 14, agrandies : à quelques mètres près, pas au centimètre.
 *    Et hors des tuiles chargées (une zone pas encore affichée) il n'y a rien
 *    à accrocher : le point reste où le doigt l'a mis.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BL — ELLE MARCHAIT, ET RIEN NE LE MONTRAIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Je clique dessus, mais il ne se passe rien. Je ne crois pas que ça
 *     marche. »                                                     — le PO
 *
 * Observé sur le build de BK (`private/bl`, sonde `blprobe3`) : un point lâché
 * à 9 px d'une route finissait à 0,00 px d'elle, en plan comme en satellite.
 * L'accroche marchait. Mais l'option était cachée dans « פעולות », dont le menu
 * se REFERMAIT au clic sans que rien ne change à l'écran ; aucune route ne
 * s'éclairait ; et le point, qui collait à la route pendant le geste, ne
 * « sautait » jamais. Une accroche silencieuse est une accroche cassée. D'où
 * ce qui suit : chaque segment garde la route dont il vient (`line`), pour
 * que l'éditeur ÉCLAIRE la route visée pendant le geste.
 */

export interface RoadSegments {
  /** Segments en PIXELS d'écran (relatifs au conteneur de la carte), et l'index de leur route. */
  segs: Array<[number, number, number, number, number]>
  /** Les routes, en pixels d'écran : de quoi éclairer celle qu'on vise. */
  lines: Array<Array<[number, number]>>
}

/** Les segments de route visibles, projetés à l'écran — calculés une fois par geste. */
export function roadSegments(map: maplibregl.Map): RoadSegments {
  const out: RoadSegments = { segs: [], lines: [] }
  let features: maplibregl.MapGeoJSONFeature[] = []
  try {
    features = map.querySourceFeatures('protomaps', { sourceLayer: 'roads' })
  } catch {
    return out
  }
  const { width, height } = map.getContainer().getBoundingClientRect()
  const margin = 64
  const lines = (g: GeoJSON.Geometry): number[][][] => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [])
  for (const f of features) {
    for (const line of lines(f.geometry)) {
      const pts: Array<[number, number]> = []
      let any = false
      let prev: maplibregl.Point | null = null
      const li = out.lines.length
      for (const c of line) {
        const p = map.project([c[0], c[1]] as [number, number])
        pts.push([p.x, p.y])
        if (prev) {
          const off = (prev.x < -margin && p.x < -margin) || (prev.y < -margin && p.y < -margin) || (prev.x > width + margin && p.x > width + margin) || (prev.y > height + margin && p.y > height + margin)
          if (!off) {
            out.segs.push([prev.x, prev.y, p.x, p.y, li])
            any = true
          }
        }
        prev = p
      }
      if (any) out.lines.push(pts)
      else if (out.lines.length > li) out.lines.length = li
    }
  }
  return out
}

/** Le point de route le plus proche de (x, y), à moins de `maxPx` pixels — et sa route — ou `null`. */
export function snapPoint(roads: RoadSegments, x: number, y: number, maxPx: number): { x: number; y: number; line: number } | null {
  let best: { x: number; y: number; d: number; line: number } | null = null
  for (const [ax, ay, bx, by, line] of roads.segs) {
    const vx = bx - ax
    const vy = by - ay
    const L2 = vx * vx + vy * vy
    const u = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2))
    const qx = ax + u * vx
    const qy = ay + u * vy
    const d = Math.hypot(x - qx, y - qy)
    if (d <= maxPx && (!best || d < best.d)) best = { x: qx, y: qy, d, line }
  }
  return best ? { x: best.x, y: best.y, line: best.line } : null
}

/** ★★ BL — à quelle distance (en pixels) une route attire un point : un doigt est moins précis qu'une souris. */
export const SNAP_PX = 18

export function snapLngLat(map: maplibregl.Map, roads: RoadSegments | null, p: LatLng, maxPx = SNAP_PX): LatLng {
  if (!roads || roads.segs.length === 0) return p
  const s = map.project([p.lng, p.lat])
  const q = snapPoint(roads, s.x, s.y, maxPx)
  if (!q) return p
  const ll = map.unproject([q.x, q.y])
  return { lat: ll.lat, lng: ll.lng }
}
