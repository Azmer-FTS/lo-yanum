import { useEffect, useRef, useState } from 'react'

/**
 * ★★ Y7.3 (2026-09-04) — "IS THIS BOX TOO NARROW FOR A ROW OF PILLS?", ASKED
 *    OF THE BOX.
 *
 * The product owner asked, twice, for the filters to become a DROP-DOWN when
 * there is no room for them:
 *
 *   "Sur petit viewport, les filtres passent dans un DROP-DOWN (demandé
 *    précédemment, non fait) plutôt qu'en rangée écrasée."
 *
 * ⚠️ AND "PETIT VIEWPORT" IS THE PANEL, NOT THE WINDOW — the same lesson X5
 *    learned on the rosters. Since P0bis.2 the list sits in a column whose
 *    width the coordinator DRAGS, so a media query answers a question nobody
 *    asked: the filters are crushed at 25 % of the seam on a 1376 px iPad and
 *    perfectly comfortable at 75 % on the same device.
 *
 * ⚠️ AND IT IS A HOOK RATHER THAN A CONTAINER QUERY, because the two states
 *    are different MARKUP — a row of buttons, or one button and a panel — not
 *    two paintings of the same markup. A container query would mean rendering
 *    both and hiding one, which is the two-markups-for-one-record mistake X5
 *    spent a pass undoing on the rosters: duplicate tap targets, duplicate
 *    test ids, and two things to keep in step.
 *
 * Returns the ref to put on the box, and whether that box is under `at`.
 * `null` until it has been measured, so nothing flashes the wrong shape on
 * the first frame.
 */
export function useNarrow(at: number): {
  ref: (node: HTMLElement | null) => void
  narrow: boolean | null
} {
  const [narrow, setNarrow] = useState<boolean | null>(null)
  const observed = useRef<HTMLElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    return () => {
      observer.current?.disconnect()
      observer.current = null
    }
  }, [])

  const ref = (node: HTMLElement | null): void => {
    if (node === observed.current) return
    observer.current?.disconnect()
    observed.current = node
    if (!node) {
      observer.current = null
      return
    }
    const measure = (): void => {
      setNarrow(node.getBoundingClientRect().width < at)
    }
    measure()
    observer.current = new ResizeObserver(measure)
    observer.current.observe(node)
  }

  return { ref, narrow }
}
