import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Publish an element's measured height as a CSS custom property on `:root`.
 *
 * Extracted from DevToolbar, which has done this for `--shell-bottom` since
 * Lot 0.7 (standing decision 39: the offset is MEASURED, not declared). F5.4
 * needed the same thing at the top of the screen — the wizard's stepper is
 * sticky, and on a phone it has to sit under the shell's own sticky header,
 * whose height changes when its contents wrap.
 *
 * Declaring `top-14` instead is wrong in the one place it matters: at 390 px
 * the header is a different height than the guess, and the stepper either
 * floats over the brand or leaves a gap the page scrolls through.
 *
 * The property is REMOVED on unmount rather than zeroed, so the token's own
 * default in tokens.css takes over — which is what makes the variable safe to
 * use on screens that never mount the element publishing it.
 */
export function usePublishedHeight(
  ref: RefObject<HTMLElement | null>,
  property: string,
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const publish = () => {
      const height = el.getBoundingClientRect().height
      // P3.4 — A ZERO-HEIGHT BAR PUBLISHES NOTHING, WHICH IS NOT THE SAME AS
      // PUBLISHING ZERO. The coordinator's top bar is `lg:hidden`: on a desktop
      // or an iPad in landscape it is in the tree and `display:none`, so it
      // measures 0. Writing `0px` there pins the inline style over the top of
      // the token's own default and there is no way back to it — which is
      // exactly how the installed app's status-bar inset (tokens.css,
      // `:root[data-standalone]`) would be lost on every screen wide enough not
      // to have a header. A bar that is not on screen is a bar with nothing to
      // say about where the top of the shell is.
      if (height === 0) {
        document.documentElement.style.removeProperty(property)
        return
      }
      document.documentElement.style.setProperty(property, `${height}px`)
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty(property)
    }
  }, [ref, property])
}

/**
 * ★★ AH2 (2026-09-09) — LA MÊME CHOSE, EN LARGEUR, ET UNE PORTE A DÛ LA
 *    RÉCLAMER.
 *
 * La barre d'actions, une fois VRAIMENT ancrée au bas de la fenêtre (AH2),
 * s'est posée là où la pilule de mode est posée depuis U4.4 — et le bouton
 * שמור s'est retrouvé DESSOUS. `bun run zones` l'a trouvé en cinquante-cinq
 * tentatives de clic sur un bouton parfaitement visible et parfaitement
 * inatteignable : le défaut exact que la note d'A86 décrit.
 *
 * ⚠️ ET LE DÉGAGEMENT ÉTAIT UN NOMBRE ÉCRIT À LA MAIN — `pl-[4.5rem]`, soit
 *    72 px, pour une pilule qui commence à 76 et finit à 220. Il n'a jamais
 *    été juste ; il ne se voyait pas parce que la barre collante ne descendait
 *    jamais assez bas pour la rencontrer. La pilule publie donc sa largeur, et
 *    la barre la lit — décision permanente 39, une fois de plus.
 */
export function usePublishedWidth(
  ref: RefObject<HTMLElement | null>,
  property: string,
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const publish = () => {
      const width = el.getBoundingClientRect().width
      if (width === 0) {
        document.documentElement.style.removeProperty(property)
        return
      }
      document.documentElement.style.setProperty(property, `${width}px`)
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty(property)
    }
  }, [ref, property])
}
