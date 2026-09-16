import { LOCALITIES } from './gazetteer'
import type { Locality } from './gazetteer'
import { haversineKm } from './geo'
import { rankOptions } from './lookup'
import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AM1 (2026-09-16) — « LA LISTE DES LOCALITÉS NE CONTIENT QUE HUIT ENTRÉES ».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le gazetteer en portait 1 174 depuis N4. Ce que le PO voyait, c'était le
 * PLAFOND de la liste déroulante : `rankOptions(…, 8)` sur les options, et à
 * champ vide les huit premières de l'ordre alphabétique (אבו גוש, אבו סנאן…),
 * sans rien qui dise qu'il en existe mille autres. Huit lignes, toujours les
 * mêmes : pour lui, la liste « contenait huit entrées ». Il avait raison sur ce
 * qu'il voyait.
 *
 * ★ Ce module répond aux deux questions du champ, et à elles seules :
 *   · `rankLocalities` — ce qui a été tapé, toléré aux fautes, sur le nom, les
 *     autres graphies et le nom latin ;
 *   · `nearestLocalities` — rien n'est tapé mais une épingle existe : les
 *     localités les plus PROCHES, avec leur distance, au lieu de l'alphabet.
 *
 * PUR : ni DOM, ni React.
 */

/** Taille de la liste proposée. Elle défile ; elle n'est plus « la liste ». */
export const LOCALITY_SUGGESTIONS = 30

export function rankLocalities(query: string, limit = LOCALITY_SUGGESTIONS): Locality[] {
  return rankOptions(query, LOCALITIES, (l) => [l.name, ...l.aliases, l.latin], limit).map(
    (r) => r.item,
  )
}

export interface NearLocality {
  locality: Locality
  km: number
}

/** Les `limit` localités les plus proches d'un point, la plus proche d'abord. */
export function nearestLocalities(at: LatLng, limit = 5): NearLocality[] {
  const all: NearLocality[] = []
  for (const l of LOCALITIES) all.push({ locality: l, km: haversineKm(at, l.position) })
  all.sort((a, b) => a.km - b.km)
  return all.slice(0, limit)
}

/** Le nombre de localités connues — le champ le DIT, pour que huit lignes ne passent plus pour la liste. */
export const LOCALITY_COUNT = LOCALITIES.length
