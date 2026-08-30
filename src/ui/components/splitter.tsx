import { useCallback, useRef } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { RATIO_MAX, RATIO_MIN } from './mapMode'
import type { MapRatioState } from './mapMode'

/**
 * P0bis.2 — THE SEAM BETWEEN THE MAP AND THE CONTENT IS A CONTROL.
 *
 * The three map states (P0.1) answer "do I want geography at all"; this
 * answers "how much", which is the question that changes hour by hour. A fixed
 * two-thirds map is right while placing posts and wrong while reading a roster
 * — and the product owner is on an iPad in a truck, where the answer also
 * depends on which way he is holding it.
 *
 * WHY IT IS ONE COMPONENT AND NOT A `MapSplit` DETAIL
 * ---------------------------------------------------
 * The guard wizard's step 1 is map-first (Lot 0.9 F2) but lives inside the
 * stepper's own shell rather than in `MapSplit`, so the seam had to be
 * reusable or that screen would have been the one exception to a frozen rule.
 *
 * DIRECTION: ONE FORMULA, NO BRANCH
 * ---------------------------------
 * The content column is always the PHYSICAL right one (decision 34), in both
 * writing directions, so its width is "the shell's right edge minus the
 * pointer". That is why the ratio is stored as the CONTENT's share of the row:
 * expressed as the map's share it would need a per-direction sign.
 *
 * TOUCH
 * -----
 * `touch-action: none` is load-bearing — without it the first millimetre of a
 * drag is claimed by the page's own scroll and the handle never sees the rest
 * of the gesture. Pointer capture keeps the drag alive once the finger leaves
 * the band, which on a moving vehicle it always does. The visible grip is
 * 44 px tall (P0.3) and the hit area is widened to 44 px ACROSS by an overlay,
 * because a 16 px strip is a mouse target, not a thumb target.
 */
export function PanelSplitter({
  shellRef,
  ratio,
  setRatio,
  reset,
  className = '',
  label,
}: MapRatioState & {
  /** The row whose width the percentage is measured against. */
  shellRef: RefObject<HTMLDivElement | null>
  className?: string
  label?: string
}) {
  const { t } = useTranslation()
  // Two taps inside this window are a RESET, not two zero-length drags. A ref
  // rather than state: a re-render per tap would be a change nobody can see.
  const lastTapRef = useRef(0)

  const applyPointer = useCallback(
    (clientX: number) => {
      const el = shellRef.current
      if (!el) return
      const box = el.getBoundingClientRect()
      if (box.width <= 0) return
      setRatio(((box.right - clientX) / box.width) * 100)
    },
    [shellRef, setRatio],
  )

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const now = e.timeStamp
    if (now - lastTapRef.current < 400) {
      lastTapRef.current = 0
      reset()
      return
    }
    lastTapRef.current = now
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    applyPointer(e.clientX)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  /**
   * A separator only a mouse can move is a separator half the users cannot
   * move. Arrows step it (10 % with Shift), Home/End go to the bounds, Enter
   * and Space are the keyboard's double-tap.
   */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2
    if (e.key === 'ArrowLeft') setRatio(ratio + step)
    else if (e.key === 'ArrowRight') setRatio(ratio - step)
    else if (e.key === 'Home') setRatio(RATIO_MAX)
    else if (e.key === 'End') setRatio(RATIO_MIN)
    else if (e.key === 'Enter' || e.key === ' ') reset()
    else return
    e.preventDefault()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label ?? t('map.resize')}
      aria-valuemin={RATIO_MIN}
      aria-valuemax={RATIO_MAX}
      aria-valuenow={Math.round(ratio)}
      tabIndex={0}
      title={t('map.resizeHint')}
      data-panel-splitter=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={`group relative z-20 w-4 shrink-0 cursor-col-resize touch-none select-none items-center justify-center self-stretch
                  bg-surface-base outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      <span className="pointer-events-none block h-11 w-1.5 rounded-pill bg-edge-strong transition-colors duration-fast group-hover:bg-accent group-focus-visible:bg-accent" />
      <span className="absolute inset-y-0 -start-3.5 -end-3.5" aria-hidden />
    </div>
  )
}
