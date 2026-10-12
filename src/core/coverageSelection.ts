/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BC (2026-10-12) — LA CARTE DE COUVERTURE : SÉLECTIONNER N'EST PAS OUVRIR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « La bulle se pose au milieu de la carte, pile sur les trajets qu'elle
 * décrit, et il ne peut pas la déplacer. S'il la ferme pour voir dessous, les
 * trajets de cette institution ne sont plus isolés. »
 *
 * LA CAUSE : les liens étaient filtrés par l'institution choisie, et la croix
 * de la bulle appelait `setSelected(null)`. Fermer et désélectionner étaient
 * le MÊME geste. Ce sont deux intentions :
 *
 *   · `id`     — QUELLE institution est sélectionnée : ses trajets restent
 *                seuls affichés, son épingle marquée ;
 *   · `bubble` — la bulle est-elle ouverte.
 *
 * Les gestes :
 *   pick        toucher une épingle : la sélectionner, bulle ouverte ; la même
 *               épingle, bulle fermée → la bulle se rouvre ;
 *   closeBubble la croix de la bulle : la SÉLECTION RESTE ;
 *   openBubble  le bouton de la barre de rappel ;
 *   deselect    toucher le fond de la carte, ou la croix de la barre ;
 *   step        les flèches ‹ › : l'institution voisine, la bulle GARDE son
 *               état (ouverte ou fermée).
 *
 * PUR : ni DOM, ni React (`bcpass` A412 le rejoue).
 */

export interface CoverageSelection {
  id: string | null
  bubble: boolean
}

export type CoverageAction =
  | { type: 'pick'; id: string }
  | { type: 'closeBubble' }
  | { type: 'openBubble' }
  | { type: 'deselect' }
  | { type: 'step'; dir: 1 | -1; order: readonly string[] }

export const NO_SELECTION: CoverageSelection = { id: null, bubble: false }

export function coverageSelect(state: CoverageSelection, action: CoverageAction): CoverageSelection {
  switch (action.type) {
    case 'pick':
      return { id: action.id, bubble: true }
    case 'closeBubble':
      return { id: state.id, bubble: false }
    case 'openBubble':
      return { id: state.id, bubble: state.id !== null }
    case 'deselect':
      return NO_SELECTION
    case 'step': {
      const order = action.order
      if (order.length === 0) return state
      const at = state.id === null ? -1 : order.indexOf(state.id)
      const next =
        at === -1
          ? action.dir === 1
            ? 0
            : order.length - 1
          : (at + action.dir + order.length) % order.length
      return { id: order[next], bubble: state.id === null ? false : state.bubble }
    }
  }
}

/**
 * L'ordre des flèches : les institutions DESSINÉES sur la carte (placées,
 * famille visible), par nom — l'ordre de l'écran מוסדות, prévisible.
 */
export function coverageOrder(places: ReadonlyArray<{ id: string; name: string; family: string }>): string[] {
  return places
    .filter((p) => p.family === 'engaged' || p.family === 'prospect')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'he') || a.id.localeCompare(b.id))
    .map((p) => p.id)
}

/** Les trajets à dessiner : ceux de l'institution SÉLECTIONNÉE seulement — bulle ouverte ou non. */
export function linksOfSelection<L extends { institutionId: string }>(links: readonly L[], selectedId: string | null): L[] {
  return selectedId === null ? [...links] : links.filter((l) => l.institutionId === selectedId)
}
