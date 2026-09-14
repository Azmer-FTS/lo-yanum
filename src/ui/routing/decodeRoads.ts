import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'

import type { RoadFeature, RoadTile } from '@core/roadGraph'

/**
 * ★★ AI2.1 — LA COUCHE `roads` D'UNE TUILE, ET RIEN D'AUTRE.
 *
 * Le décodeur est celui que MapLibre embarque déjà (`@mapbox/vector-tile` sur
 * `pbf`), déclaré en dépendance directe plutôt qu'emprunté à une dépendance
 * transitive. Une tuile Protomaps porte aussi les bâtiments, les lieux, l'eau :
 * seules les lignes de `roads` sont lues, et leurs propriétés réduites aux
 * quatre qui décident d'une durée — `kind`, `kind_detail`, `is_link`, `oneway`.
 *
 * Partagé par l'application (`roadNetwork.ts`) et par `bun run aipass`, qui lit
 * l'archive depuis le disque : les deux décodent la même chose de la même
 * façon, ce qui est ce qui rend la mesure hors navigateur significative.
 */
export function decodeRoadTile(bytes: Uint8Array, z: number, x: number, y: number): RoadTile {
  const tile = new VectorTile(new Pbf(bytes))
  const layer = tile.layers.roads
  const features: RoadFeature[] = []
  if (!layer) return { z, x, y, extent: 4096, features }
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i)
    // 2 = LineString dans la spécification MVT.
    if (f.type !== 2) continue
    const p = f.properties
    features.push({
      kind: String(p.kind ?? ''),
      kindDetail: String(p.kind_detail ?? p.kind ?? ''),
      isLink: p.is_link === true || p.is_link === 'true',
      oneway: p.oneway === undefined || p.oneway === null ? null : String(p.oneway),
      lines: f.loadGeometry().map((line) => line.map((pt) => ({ x: pt.x, y: pt.y }))),
    })
  }
  return { z, x, y, extent: layer.extent, features }
}
