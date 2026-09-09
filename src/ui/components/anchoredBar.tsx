import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH2 (2026-09-09) — LA BARRE D'ACTIONS EST ANCRÉE AU BAS DE LA FENÊTRE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AF2 a corrigé le glissement latéral et le PO le confirme. Ce qui restait :
 * « les boutons שמור/ביטול sont FLOTTANTS au lieu d'être collés au bas de
 * l'écran ».
 *
 * ★★ ET « flottants » ÉTAIT LA DESCRIPTION EXACTE DE `position: sticky`, PAS
 *    UN DÉFAUT DE RÉGLAGE. Une barre collante ne se colle au bas de la fenêtre
 *    que s'il reste du contenu SOUS elle pour l'y pousser. La fiche de ferme
 *    ouvre quatre de ses sections REPLIÉES (A30) : sur un iPad le document est
 *    plus court que l'écran, la barre se pose donc à la fin du contenu — au
 *    milieu de la page — et elle y reste. Et même sur un formulaire long, au
 *    bas du défilement elle remonte du rembourrage que la coquille ajoute
 *    après elle (`--float-reserve`).
 *
 * ★ LA BARRE DEVIENT DONC `fixed`, ET SA BOÎTE HORIZONTALE EST MESURÉE SUR LA
 *   COLONNE PLUTÔT QUE DEVINÉE. `fixed inset-x-0` prendrait la fenêtre entière
 *   et repasserait sous la carte du panneau de gauche — le défaut d'AF2, dans
 *   l'autre sens. Un témoin invisible reste DANS le flux, à la place exacte
 *   qu'occupait la barre ; il donne son `left` et sa `width`, et il RÉSERVE sa
 *   hauteur, ce qui est la seule façon de garantir qu'aucun champ ne finit
 *   dessous (AH2.2).
 *
 * ⚠️ LE TÉMOIN EST AUSSI CE QUI REND LA MESURE JUSTE QUAND LE PO TIRE LE
 *    SÉPARATEUR. `MapSplit` change la largeur de la colonne sans que la
 *    fenêtre change de taille : un `resize` ne suffit pas, un
 *    `ResizeObserver` sur le témoin, si.
 *
 * ⚠️ ET LE `bottom` EST `--shell-bottom`, PAS `0`. C'est le maximum de la
 *    barre d'onglets du téléphone et de la zone sûre du bas (tokens.css) —
 *    donc la barre se pose au-dessus des onglets sur un iPhone, et au-dessus
 *    du menton sur un iPhone sans bouton (AH2.3). Mesuré, jamais déclaré :
 *    c'est la décision permanente 39.
 */

export interface AnchoredBox {
  left: number
  width: number
  height: number
}

export interface AnchoredBar {
  /** À poser sur l'élément invisible qui reste dans le flux. */
  spacerRef: MutableRefObject<HTMLDivElement | null>
  /** À poser sur la barre `fixed` elle-même. */
  barRef: MutableRefObject<HTMLDivElement | null>
  /** Le style en ligne de la barre : sa boîte horizontale, prise sur le témoin. */
  barStyle: { left: number; width: number }
  /** Le style du témoin : la hauteur réservée. */
  spacerStyle: { height: number }
  box: AnchoredBox
}

export function useAnchoredBar(): AnchoredBar {
  const spacerRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<AnchoredBox>({ left: 0, width: 0, height: 0 })

  const measure = useCallback(() => {
    const spacer = spacerRef.current
    const bar = barRef.current
    if (!spacer || !bar) return
    const s = spacer.getBoundingClientRect()
    const height = bar.getBoundingClientRect().height
    setBox((prev) =>
      Math.abs(prev.left - s.left) < 0.5 &&
      Math.abs(prev.width - s.width) < 0.5 &&
      Math.abs(prev.height - height) < 0.5
        ? prev
        : { left: s.left, width: s.width, height }
    )
  }, [])

  useLayoutEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (spacerRef.current) observer.observe(spacerRef.current)
    if (barRef.current) observer.observe(barRef.current)
    /* La coquille elle-même bouge : rotation, clavier virtuel, barre d'onglets
       qui apparaît. `documentElement` couvre les trois d'un seul coup. */
    observer.observe(document.documentElement)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [measure])

  return {
    spacerRef,
    barRef,
    barStyle: { left: box.left, width: box.width },
    spacerStyle: { height: box.height },
    box,
  }
}

/** L'effet qui remesure quand une valeur change (le nombre de boutons, p. ex.). */
export function useRemeasureOn(bar: AnchoredBar, dep: unknown): void {
  const { barRef, spacerRef } = bar
  useEffect(() => {
    const spacer = spacerRef.current
    const el = barRef.current
    if (!spacer || !el) return
    /* Un `requestAnimationFrame` serait plus élégant et ne se déclenche jamais
       dans un onglet d'arrière-plan — le défaut trouvé en U7. Un délai zéro
       passe partout. */
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 0)
    return () => window.clearTimeout(id)
  }, [barRef, spacerRef, dep])
}
