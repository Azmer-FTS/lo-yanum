import { useCallback, useEffect, useRef } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { RATIO_MAX, RATIO_MIN, clampRatio as clamp } from './mapMode'
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

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ★ X13 (2026-09-04) — WHY THE SEAM USED TO SEIZE UP, AND WHAT IS DIFFERENT
   * ═══════════════════════════════════════════════════════════════════════
   *
   * The product owner reported that after a long session the separator stops
   * moving and only closing the app brings it back. It is not a leak in the
   * sense of a listener that is never removed — every listener in this file
   * and in `MapCanvas` is torn down. It is a COST that grows with the session,
   * and the cost was paid on every pointermove:
   *
   *     pointermove  →  setRatio()      (React state, at the pointer's rate)
   *                  →  localStorage.setItem()   ← SYNCHRONOUS, every sample
   *                  →  MapSplit re-render
   *                  →  MapPanel / MapView / MapCanvas re-render
   *                  →  ResizeObserver → map.resize()
   *
   * `bun run seam` counts it: a forty-move drag was FORTY blocking storage
   * writes, each followed by a React commit of the whole map-first shell.
   * Early in a session it is merely janky; on a device that has been running
   * all day it saturates the main thread, the pointer stream backs up behind
   * it, and the handle stops answering. "It freezes after a while" is exactly
   * what that looks like from outside.
   *
   * ⚠️ IT IS NOT MARKER CHURN, which was the first guess. A screen's
   *    `markers` array is memoised on its own data, so a ratio change does
   *    not rebuild the pins — the gate check written on that assumption
   *    passed on the BROKEN build, which is how the wrong explanation was
   *    caught rather than shipped.
   *
   * ★ SO A DRAG NO LONGER RENDERS ANYTHING. While the pointer is down the
   *   width is written straight onto the shell's own custom property — one
   *   style recalculation, no React, no marker churn, no storage — coalesced
   *   to one write per animation frame. React state and localStorage are
   *   updated ONCE, on pointerup. The visible behaviour is identical; the
   *   cost is three orders of magnitude smaller.
   *
   * ★ AND THE GESTURE ALWAYS ENDS. `lostpointercapture` is handled (the
   *   browser can revoke capture on its own — a system gesture, the element
   *   being re-rendered under the finger), `setPointerCapture` is wrapped
   *   because it throws on a detached node, and a document-level
   *   pointerup/pointercancel is armed for the duration of the drag so a
   *   release the element never sees still ends the drag. A drag state that
   *   is never cleared is the other way this control dies.
   */
  // Two taps inside this window are a RESET, not two zero-length drags.
  // A ref rather than state: a re-render per tap would be a change nobody
  // can see.
  const lastTapRef = useRef(0)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const frameRef = useRef(0)
  const pendingRef = useRef<number | null>(null)

  /** The live width, written to the DOM and nothing else. */
  const paint = useCallback(
    (pct: number) => {
      const el = shellRef.current
      if (!el) return
      el.style.setProperty('--content-w', `${clamp(pct)}%`)
    },
    [shellRef],
  )

  const applyPointer = useCallback(
    (clientX: number) => {
      const el = shellRef.current
      if (!el) return
      const box = el.getBoundingClientRect()
      if (box.width <= 0) return
      pendingRef.current = ((box.right - clientX) / box.width) * 100
      // One paint per frame however fast the pointer reports.
      if (frameRef.current) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0
        if (pendingRef.current !== null) paint(pendingRef.current)
      })
    },
    [shellRef, paint],
  )

  /** Commit whatever the drag left on screen to React state and storage. */
  const commit = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending !== null) setRatio(pending)
  }, [setRatio])

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    commit()
  }, [commit])

  /**
   * The safety net. Armed only while a drag is live, so it costs nothing the
   * rest of the time; it catches the release the handle itself never sees.
   */
  useEffect(() => {
    const onUp = () => endDrag()
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [endDrag])

  // A drag interrupted by an unmount must not leave a frame queued.
  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const now = e.timeStamp
    /**
     * ⚠️ ONLY A TAP COUNTS TOWARDS THE DOUBLE-TAP. The first version compared
     *    timestamps alone, so two quick DRAGS — which is how the seam is
     *    actually adjusted — read as a double-tap and reset the ratio the
     *    second one was about to set. `movedRef` is what makes the gesture a
     *    tap.
     */
    if (!movedRef.current && now - lastTapRef.current < 400) {
      lastTapRef.current = 0
      reset()
      return
    }
    lastTapRef.current = now
    movedRef.current = false
    draggingRef.current = true
    pendingRef.current = null
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // A detached or already-captured node. The window-level listeners above
      // and `onPointerMove`'s own guard keep the drag working without it.
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    movedRef.current = true
    applyPointer(e.clientX)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    endDrag()
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
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
      /**
       * ★ X3.5 (2026-09-04) — THE SEAM IS A HAIRLINE, AND EVERYTHING IT
       *   OCCUPIES IS ON THE MAP'S SIDE.
       *
       *   What the product owner saw was list tiles clipped along their
       *   physical left edge. The cause was this element: a 16 px band of
       *   `--surface-base` PLUS a hit overlay stretched 14 px into BOTH
       *   neighbours (`-start-3.5 -end-3.5`), so a 44 px-wide invisible strip
       *   lay over the first characters of every tile and swallowed their
       *   taps.
       *
       *   Now the flex item is a 2 px rule, and the hit area and the grip are
       *   absolutely positioned entirely onto the PHYSICAL LEFT — which is
       *   the map in both writing directions (decision 34). The list is never
       *   under the seam again, and dragging still starts anywhere in a 44 px
       *   band.
       *
       * ⚠️ PHYSICAL `left`, NOT LOGICAL `start`. A logical inset flips with
       *    the direction and would put the grip over the CONTENT in Hebrew —
       *    which is the defect, not the fix. The row is reversed per
       *    direction precisely so that the map is always physically left.
       */
      className={`group relative z-20 w-0.5 shrink-0 cursor-col-resize touch-none select-none items-stretch
                  self-stretch bg-edge-subtle outline-none transition-colors duration-fast
                  hover:bg-accent focus-visible:bg-accent ${className}`}
    >
      {/**
       * ★ VISIBLE ON BOTH GROUNDS. A grip painted in `--border-strong` reads
       *   on the vector map and vanishes over satellite imagery, which is
       *   half the time the product owner is dragging it. `glass` is the
       *   app's one definition of a control that sits OVER imagery, so the
       *   grip wears it — the same answer W5 gave the tools rail.
       */}
      {/**
        * ★★ Y3.1 (2026-09-04) — THE TAB WAS ROUNDED ON THE WRONG SIDE.
        *
        * "La poignée est orientée à l'envers : la retourner, verticale,
        * collée à la barre." The grip is a tab sitting entirely on the map's
        * side of the rule, so its PHYSICAL RIGHT edge is the one against the
        * rule and its PHYSICAL LEFT edge is the one facing the map. It wore
        * `rounded-s-card`, which in this RTL document is the physical RIGHT —
        * so the curve was against the bar and the square edge was in the
        * open. That is a tab peeling AWAY from the rule, which is precisely
        * what "à l'envers" and "collée à la barre" name.
        *
        * ⚠️ PHYSICAL `l`, NOT LOGICAL `s`, for the same reason the insets
        *    above are physical: the row is reversed per direction so that the
        *    map is always physically left, so the side this tab has to be
        *    square on does not flip with the writing direction and a logical
        *    corner would put the mistake back in the other language.
        */}
      <span
        className="glass pointer-events-none absolute left-0 top-1/2 flex h-14 w-5 -translate-x-full -translate-y-1/2
                   items-center justify-center rounded-l-card text-content-secondary
                   transition-colors duration-fast group-hover:text-accent-ink group-focus-visible:text-accent-ink"
      >
        <svg width="10" height="18" viewBox="0 0 10 18" aria-hidden="true" focusable="false">
          <g fill="currentColor">
            <circle cx="3" cy="4" r="1.1" />
            <circle cx="3" cy="9" r="1.1" />
            <circle cx="3" cy="14" r="1.1" />
            <circle cx="7" cy="4" r="1.1" />
            <circle cx="7" cy="9" r="1.1" />
            <circle cx="7" cy="14" r="1.1" />
          </g>
        </svg>
      </span>
      {/* ⚠️ LAST CHILD ON PURPOSE. The 44 px thumb band, entirely over the map
          — and `bun run splitter` reads this element as `lastElementChild`
          and the grip as `firstElementChild`. Swapping the two makes the gate
          measure the wrong box, which is exactly what happened when X3.5
          rewrote this element. */}
      <span className="absolute inset-y-0 -left-11 right-0" aria-hidden />
    </div>
  )
}
