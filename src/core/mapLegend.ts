import { ALL_FARM_STATUSES } from './types'
import type { FarmStatus } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BD 5 (2026-10-12) — LA LÉGENDE NE LISTE PLUS LE VIDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dix statuts affichés, sept à zéro : le modèle est bon, l'affichage ment par
 * excès. La légende montre les statuts PRÉSENTS SUR LA CARTE, chacun avec son
 * compte, dans l'ordre du modèle ; les autres sont repliés derrière
 * « הצג את כל הסטטוסים ». ⛔ Aucun statut n'est supprimé : בוקרה et פעילה se
 * rempliront dès les premières gardes, et ils reviendront d'eux-mêmes.
 */
export interface LegendRow {
  status: FarmStatus
  count: number
}

export function statusLegend(statuses: readonly FarmStatus[], order: readonly FarmStatus[] = ALL_FARM_STATUSES): { present: LegendRow[]; empty: FarmStatus[] } {
  const counts = new Map<FarmStatus, number>()
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1)
  const present: LegendRow[] = []
  const empty: FarmStatus[] = []
  for (const status of order) {
    const count = counts.get(status) ?? 0
    if (count > 0) present.push({ status, count })
    else empty.push(status)
  }
  return { present, empty }
}
