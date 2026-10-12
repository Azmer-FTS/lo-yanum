import { LOCALITIES } from './gazetteer'
import { farmPoint, haversineKm } from './geo'
import type { Farm, LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BC (2026-10-12) — LA LOCALITÉ DE REPÈRE D'UNE FERME (« ליד … »).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Quand le PO rencontre les administrations qui lui prêtent des volontaires,
 * il doit pouvoir dire “cette ferme est à côté de tel endroit” et que la
 * personne en face situe immédiatement. »
 *
 * ★ CALCULÉE DEPUIS LE POINT, PAR LA LISTE QUE L'APPLICATION POSSÈDE DÉJÀ —
 *   celle qui alimente `LocalityField` (`gazetteer.json`, embarquée). Aucun
 *   service extérieur, aucune dépendance de plus.
 * ★ RANGÉE EN BASE (`entities.nearest_locality`), jamais devinée à l'écran :
 *   les autres appareils, l'export et une version d'avant la lisent telle
 *   quelle. `settleNearestLocality` la tient à jour quand le point bouge.
 * ★ UNE VALEUR SAISIE PAR LE PO (`nearestLocalityManual`) N'EST JAMAIS
 *   ÉCRASÉE par un recalcul. Une ferme SANS POINT garde la sienne (les cinq
 *   fermes sans point la portent dans leur propre nom : saisie, pas calcul).
 *
 * C'est un REPÈRE, pas un titre : à l'écran elle vient après le nom de la
 * ferme et celui de l'agriculteur, en texte secondaire.
 *
 * PUR : ni DOM, ni React.
 */

const memo = new Map<string, string | null>()

/** La localité la plus proche d'un point (parcours linéaire, ~1 330 noms). */
export function nearestLocalityName(at: LatLng): string | null {
  const key = `${at.lat.toFixed(5)},${at.lng.toFixed(5)}`
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  let best: string | null = null
  let bestKm = Infinity
  for (const l of LOCALITIES) {
    const km = haversineKm(at, l.position)
    if (km < bestKm) {
      bestKm = km
      best = l.name
    }
  }
  if (memo.size > 2000) memo.clear()
  memo.set(key, best)
  return best
}

/**
 * La valeur qu'une ferme doit porter :
 *   · saisie par le PO   → la sienne, toujours ;
 *   · sans point         → la sienne (rien à calculer) ;
 *   · sinon              → la plus proche de son point.
 * Rend la MÊME référence quand rien ne change (le magasin s'en sert pour ne
 * pousser que ce qui a bougé).
 */
export function settleNearestLocality(farm: Farm): Farm {
  if (farm.nearestLocalityManual) return farm
  const point = farmPoint(farm)
  if (!point) return farm
  const name = nearestLocalityName(point)
  if (!name || name === farm.nearestLocality) return farm
  return { ...farm, nearestLocality: name }
}

/** Le recalcul de toutes les fiches (même règle, une à une). */
export function recomputeNearestLocalities(farms: readonly Farm[]): Farm[] {
  return farms.map(settleNearestLocality)
}

/** Ce que la fiche dit : la valeur, et d'où elle vient. */
export function nearestLocalityOf(farm: Farm): { name: string; manual: boolean } | null {
  const name = (farm.nearestLocality ?? '').trim()
  if (!name) return null
  return { name, manual: farm.nearestLocalityManual === true }
}
