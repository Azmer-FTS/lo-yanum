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
      document.documentElement.style.setProperty(
        property,
        `${el.getBoundingClientRect().height}px`,
      )
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
