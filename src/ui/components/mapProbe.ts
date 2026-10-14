/**
 * ★★ BI (2026-10-15) — CE QUE LA CARTE A RÉELLEMENT DESSINÉ, POUR LE DIAGNOSTIC.
 *
 * « En mémoire » ne suffit pas : en BI, l'ordinateur avait les 77 sommets en
 * mémoire et n'en dessinait aucun. `MapCanvas` inscrit ici, à chaque mise à jour
 * de sa source `zones`, la liste des formes qu'il vient de lui donner — après le
 * filtre des couches, c'est-à-dire ce qui est à l'écran. Un petit module à part,
 * dans le paquet principal, pour que le panneau puisse le lire sans charger
 * MapLibre ni lire ses champs internes.
 */
export interface DrawnZone {
  id: string
  vertices: number
}

let drawn: DrawnZone[] | null = null
let at = 0

export function recordDrawnZones(list: DrawnZone[] | null): void {
  drawn = list
  at = Date.now()
}

/** null : aucune carte montée en ce moment. */
export function drawnZones(): { zones: DrawnZone[]; at: number } | null {
  return drawn === null ? null : { zones: drawn, at }
}
