import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AV2 (2026-10-08) — LE POINT DE REPÈRE (נקודת ציון).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un lieu NOMMÉ, posé d'un appui long sur n'importe quelle carte, sans nature
 * particulière : « le portail de la ferme du père », « le point d'eau ». Un
 * nom et un point — rien d'autre n'est demandé, rien d'autre n'est exigé.
 *
 * ⛔ UN REPÈRE N'ENTRE DANS AUCUN COMPTEUR : ni objectif, ni dounams, ni
 *    couverture. Il vit dans `StoreData.landmarks`, que ni `access.ts`
 *    (compteurs), ni `report.ts`, ni `activity.ts`, ni `coverage.ts` ne
 *    lisent. `bun run avpass` (A326) le vérifie dans le code.
 */
export interface Landmark {
  id: string
  /** ⛔ Jamais vide : le PO ne veut pas de points anonymes (A324). */
  name: string
  position: LatLng
  note: string
  createdAt: string
  updatedAt: string
}

/** Un nom acceptable : au moins un caractère qui n'est pas un espace. */
export const isPinNameValid = (name: string): boolean => name.trim().length > 0
