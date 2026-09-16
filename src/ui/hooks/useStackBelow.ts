import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AM6.1 (2026-09-16) — DEUX BANDEAUX NE SE SUPERPOSENT JAMAIS : ILS S'EMPILENT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO ne pouvait pas lire « מסונכרן » : la pastille flottait en haut de
 * l'écran, À LA MÊME HAUTEUR que le panneau « גררו את הסיכה » de la carte,
 * posé en haut du panneau carte — et la carte est en haut de l'écran sur un
 * téléphone comme sur l'iPad en portrait. Deux textes, un seul endroit.
 *
 * ★ LA RÈGLE EST GÉNÉRIQUE, PAS UN DÉCALAGE ÉCRIT POUR CET ÉCRAN : tout bandeau
 *   posé en haut porte `data-top-banner`. Un bandeau FLOTTANT (réseau, mise à
 *   jour) mesure ceux qui occupent sa bande horizontale et se place SOUS le plus
 *   bas d'entre eux. Un bandeau qui arrive ne recouvre donc jamais celui qui
 *   était là.
 *
 * ⚠️ Pas de `requestAnimationFrame` (il ne tourne pas dans un onglet caché —
 *    U7) : écouteurs de redimensionnement et de défilement, plus un relevé à la
 *    seconde tant que le bandeau est visible, ce qui est rare et court.
 */
export function useStackBelow(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  /** Le bandeau lui-même, pour ne pas s'éviter soi-même. */
  selfId: string,
  /* Ce que ce bandeau évite. La pastille réseau évite aussi les bandeaux
     flottants (mise à jour) ; ceux-ci n'évitent que les bandeaux de page.
     Une priorité, sinon deux flottants se repousseraient sans fin. */
  selector = '[data-top-banner]',
  gap = 8,
): number {
  const [offset, setOffset] = useState(0)
  const offsetRef = useRef(0)

  useEffect(() => {
    if (!active) {
      offsetRef.current = 0
      setOffset(0)
      return
    }
    let timer: number | null = null
    const measure = () => {
      timer = null
      const self = ref.current
      if (!self) return
      /* La bande horizontale est celle de ce qui est PEINT (la pastille), pas
         celle du conteneur qui traverse l'écran. */
      const painted = (self.firstElementChild as HTMLElement | null) ?? self
      const box = painted.getBoundingClientRect()
      const baseTop = box.top - offsetRef.current
      const others: DOMRect[] = []
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        if (el.dataset.topBanner === selfId || el.dataset.topBannerFloat === selfId || self.contains(el) || el.contains(self)) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        if (r.right <= box.left || r.left >= box.right) continue
        others.push(r)
      }
      others.sort((x, y) => x.top - y.top)
      /* On descend tant que la place visée est occupée. */
      let top = baseTop
      for (const r of others) {
        if (r.bottom <= top || r.top >= top + box.height) continue
        top = r.bottom + gap
      }
      const push = top - baseTop
      if (Math.abs(push - offsetRef.current) >= 1) {
        offsetRef.current = push
        setOffset(push)
      }
    }
    const schedule = () => {
      if (timer === null) timer = window.setTimeout(measure, 50)
    }
    measure()
    const tick = window.setInterval(measure, 1000)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => {
      window.clearInterval(tick)
      if (timer !== null) window.clearTimeout(timer)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [active, ref, selfId, selector, gap])

  return offset
}
