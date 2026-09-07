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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AB2 (2026-09-08) — "WOULD THESE PILLS NEED A SECOND LINE?", ASKED OF THE
 *    PILLS AND OF THE PANEL THEY ARE IN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The product owner, restating what the « סינון » button was always for:
 *
 *   « le but de cette icône, c'était de regrouper tous les autres filtres pour
 *     qu'au lieu de s'empiler en dessous les uns des autres, ils rentrent dans
 *     un bouton filtre qui s'ouvre comme un menu déroulant. »
 *
 * ★ SO THE QUESTION IS NEITHER Y7.3'S NOR AA1.5'S, AND BOTH WERE HALF RIGHT.
 *   Y7.3 measured the PANEL, which is right about which box the pills have to
 *   fit in and wrong about desktops — it folded four screens away at 1376 px.
 *   AA1.5 answered « is this a phone », which is right about desktops and
 *   wrong about the one case AB2.3 names explicitly: an iPad in split view,
 *   where the panel is a phone's width and the device is not.
 *
 *   The question that is right in all three cases is the one the sentence
 *   actually asks — DO THEY FIT ON ONE LINE HERE — so this hook measures the
 *   pills' own single-line width against the box they are in.
 *
 * ⚠️ THE REQUIREMENT IS REMEMBERED, BECAUSE ONCE FOLDED THERE IS NOTHING LEFT
 *    TO MEASURE. The folded shape removes the pills from the bar, so a hook
 *    that re-measured every frame would fold, find a row of zero pills, decide
 *    they fit, unfold, and oscillate for ever. What is stable is the pills'
 *    NATURAL width — a pill's size comes from its text, not from its
 *    container — so it is measured while they are laid out and kept. The bar's
 *    width keeps being observed either way, which is what lets a dragged seam
 *    unfold them again.
 *
 * ⚠️ AND THE COMPARISON IS `>` WITH NO SLACK, DELIBERATELY. `sum(widths) +
 *    gap × (n − 1)` is exactly what one line costs; anything above the box's
 *    content width wraps, and AA1.2 already learnt that three pixels is a
 *    second line. A tolerance here would be three pixels' worth of a defect
 *    the product owner has already reported twice.
 */
export function useFilterFold(): {
  /** Put on the box the pills have to fit inside. */
  boxRef: (node: HTMLElement | null) => void
  /** Put on the row that lays the pills out, in the unfolded shape only. */
  pillsRef: (node: HTMLElement | null) => void
  /** True when they would take two lines — fold them behind « סינון ». */
  fold: boolean
  /** The box's content width, and what one line of pills costs. */
  available: number | null
  required: number | null
} {
  const [available, setAvailable] = useState<number | null>(null)
  const [required, setRequired] = useState<number | null>(null)
  const boxNode = useRef<HTMLElement | null>(null)
  const boxObserver = useRef<ResizeObserver | null>(null)
  const pillsNode = useRef<HTMLElement | null>(null)
  const pillsObserver = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    return () => {
      boxObserver.current?.disconnect()
      pillsObserver.current?.disconnect()
    }
  }, [])

  const boxRef = (node: HTMLElement | null): void => {
    if (node === boxNode.current) return
    boxObserver.current?.disconnect()
    boxNode.current = node
    if (!node) {
      boxObserver.current = null
      return
    }
    const measure = (): void => setAvailable(node.clientWidth)
    measure()
    boxObserver.current = new ResizeObserver(measure)
    boxObserver.current.observe(node)
  }

  const pillsRef = (node: HTMLElement | null): void => {
    if (node === pillsNode.current) return
    pillsObserver.current?.disconnect()
    pillsNode.current = node
    if (!node) {
      pillsObserver.current = null
      return
    }
    const measure = (): void => {
      const kids = [...node.children] as HTMLElement[]
      if (kids.length === 0) {
        setRequired(0)
        return
      }
      const style = getComputedStyle(node)
      const gap = parseFloat(style.columnGap || style.gap || '0') || 0
      const sum = kids.reduce((total, el) => total + el.getBoundingClientRect().width, 0)
      setRequired(sum + gap * (kids.length - 1))
    }
    measure()
    /* The pills' own widths change with their labels — a count appearing on a
       pill is a wider pill — so the row is observed, not measured once. */
    pillsObserver.current = new ResizeObserver(measure)
    pillsObserver.current.observe(node)
    for (const el of [...node.children]) pillsObserver.current.observe(el)
  }

  const fold =
    available !== null && required !== null && required > available

  /**
   * ⚠️ THE TWO NUMBERS ARE PUBLISHED ON THE BAR (`data-fold-*` in
   *    `FilterRow`), and that is not debug scaffolding left behind: `bun run
   *    filters` sweeps 360 → 1440 px in steps of 20 and has to say WHY a width
   *    folded. "shape=phone" is an assertion; "487 > 458" is a measurement,
   *    and the difference is the whole of AA1's lesson about probes.
   */
  return { boxRef, pillsRef, fold, available, required }
}
