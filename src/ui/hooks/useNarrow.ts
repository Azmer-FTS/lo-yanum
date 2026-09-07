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

/**
 * ★★ AA1.4 · AA1.5 (2026-09-07) — "SUR TÉLÉPHONE", ASKED OF THE PHONE.
 *
 * `useNarrow` above is right for every question about a panel the coordinator
 * DRAGS. The filter row's shape is not one of them, and Z3 discovered why the
 * hard way: measuring the bar's own box means the same iPad answers "row" at
 * 75 % of the seam and "drop-down" at 25 %, so the pills the product owner is
 * looking for disappear behind « סינון » on a 1376 px screen. His decision on
 * AA1.5 settles it — "sur iPad et desktop : pastilles VISIBLES en permanence"
 * — and that is a fact about the DEVICE, not about the panel.
 *
 * 640 px is the same floor `sm:` uses everywhere else in this repository, so
 * the folded shape is exactly "a phone" and nothing else.
 */
const PHONE_SHAPE = '(max-width: 639px)'

export function usePhoneShape(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_SHAPE).matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(PHONE_SHAPE)
    const onChange = (): void => setPhone(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return phone
}
