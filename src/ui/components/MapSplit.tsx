import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { MapModeSwitch, clampRatio, useMapMode, useMapRatio } from './mapMode'
import type { MapModeState } from './mapMode'
import { PanelSplitter } from './splitter'

/**
 * P0bis.1 — THE MAP-FIRST GABARIT, ONCE, FOR EVERY SCREEN THAT CARRIES A MAP.
 *
 * The product owner's frozen rule: **the map is on the visual LEFT and the
 * content on the right, on every screen and sub-screen that has a map, without
 * exception**. Before this, three screens implemented that gabarit and eight
 * others put the map on TOP of the content — the same information in two
 * different places depending on which route you came from, which is exactly
 * the thing that makes an app feel like several apps.
 *
 * `MapPanel` (the list screens' shell) and the farm detail each carried their
 * own hand-written copy of the layout, and the copies had already drifted (the
 * detail breaks at `xl`, the panel at `lg`). This is the single implementation
 * both now delegate to, and the one place P0bis.2's draggable splitter had to
 * be added.
 *
 * WHY THE MAP IS PHYSICALLY LEFT AND NOT LOGICALLY FIRST (decision 34)
 * --------------------------------------------------------------------
 * Geography left, content right, in every writing direction. The DOM order is
 * CONTENT-then-map, so a screen reader hears the substance first, and the
 * physical order comes from the direction-aware row:
 *   RTL + `row`         → first child on the right → map physically left ✓
 *   LTR + `row-reverse` → first child on the right → map physically left ✓
 * The seam is a PHYSICAL `border-r` on the map for the same reason: a logical
 * `border-e` jumps to the map's outer edge in RTL.
 *
 * TWO SCROLL STRATEGIES, BECAUSE G7 EXISTS
 * ----------------------------------------
 * · `panel` — the content column is its own scroll container and the shell is
 *   pinned to the viewport. The Lot 0.9 reading, byte for byte.
 * · `page`  — the WINDOW stays the scroll container and the map column is
 *   `sticky` instead. The volunteers and drivers rosters are G7
 *   window-virtualised tables: taking the window's scroll away from them makes
 *   the virtualiser measure a scrollMargin against the wrong box and draw its
 *   rows a page above themselves. This is what lets those two rosters join the
 *   gabarit at all — the P0.2 note "WHY NOT MapPanel" is answered here rather
 *   than worked around.
 *
 * THE RATIO IS A CSS VARIABLE, NOT A UTILITY CLASS
 * ------------------------------------------------
 * The content column's width is `var(--content-w)`, published inline on the
 * shell. A `lg:w-1/3` cannot be dragged; a variable can, which is the whole of
 * P0bis.2 (`ratio` + `onRatioChange` below). Below the breakpoint the width is
 * not applied at all — the stack is the responsive form and stays it.
 */
export type MapSplitScroll = 'panel' | 'page'
export type MapSplitBreakpoint = 'lg' | 'xl'

/**
 * Tailwind scans the SOURCE for literal class names, so a breakpoint cannot be
 * interpolated into a class string. Both variants are written out.
 */
interface BreakpointClasses {
  shellPanel: string
  shellPage: string
  contentPanel: string
  contentPage: string
  contentHidden: string
  contentSplit: string
  mapCol: string
  mapColPage: string
  mapBox: string
  bar: string
  switchInContent: string
  splitter: string
  splitterPage: string
}

const BP: Record<MapSplitBreakpoint, BreakpointClasses> = {
  lg: {
    shellPanel:
      'flex flex-col lg:h-[calc(100dvh-var(--shell-bottom))] lg:min-h-0 lg:flex-row-reverse lg:rtl:flex-row',
    shellPage:
      'flex flex-col lg:flex-row-reverse lg:rtl:flex-row lg:items-start',
    contentPanel:
      'order-2 min-w-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 lg:order-none lg:pb-5',
    contentPage: 'order-2 min-w-0 flex-1 px-4 pb-24 pt-5 lg:order-none lg:pb-5',
    contentHidden: 'lg:w-full lg:px-5',
    contentSplit: 'lg:w-[var(--content-w)] lg:flex-none lg:px-5',
    mapCol: 'order-1 flex-col lg:order-none lg:flex-1',
    mapColPage:
      'lg:sticky lg:top-[var(--shell-top)] lg:h-[calc(100dvh-var(--shell-top)-var(--shell-bottom))] lg:self-start',
    mapBox: 'relative w-full border-edge-subtle lg:h-full lg:border-r lg:!h-full',
    bar: 'flex lg:hidden',
    switchInContent: 'hidden lg:flex',
    splitter: 'hidden lg:flex',
    splitterPage:
      'lg:sticky lg:top-[var(--shell-top)] lg:h-[calc(100dvh-var(--shell-top)-var(--shell-bottom))] lg:self-start',
  },
  xl: {
    shellPanel:
      'flex flex-col xl:h-[calc(100dvh-var(--shell-bottom))] xl:min-h-0 xl:flex-row-reverse xl:rtl:flex-row',
    shellPage:
      'flex flex-col xl:flex-row-reverse xl:rtl:flex-row xl:items-start',
    contentPanel:
      'order-2 min-w-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 xl:order-none xl:pb-5',
    contentPage: 'order-2 min-w-0 flex-1 px-4 pb-24 pt-5 xl:order-none xl:pb-5',
    contentHidden: 'xl:w-full xl:px-5',
    contentSplit: 'xl:w-[var(--content-w)] xl:flex-none xl:px-5',
    mapCol: 'order-1 flex-col xl:order-none xl:flex-1',
    mapColPage:
      'xl:sticky xl:top-[var(--shell-top)] xl:h-[calc(100dvh-var(--shell-top)-var(--shell-bottom))] xl:self-start',
    mapBox: 'relative w-full border-edge-subtle xl:h-full xl:border-r xl:!h-full',
    bar: 'flex xl:hidden',
    switchInContent: 'hidden xl:flex',
    splitter: 'hidden xl:flex',
    splitterPage:
      'xl:sticky xl:top-[var(--shell-top)] xl:h-[calc(100dvh-var(--shell-top)-var(--shell-bottom))] xl:self-start',
  },
}

export interface MapSplitProps {
  /** P0.1 — the localStorage key the three-state mode is remembered under. */
  screenKey: string
  /** Named on the map's own header bar, and given to the map for a11y. */
  ariaLabel: string
  /**
   * The map, already sized `h-full w-full`. Receives the mode AND its setter:
   * a screen where selecting a row has to bring a hidden map back needs both.
   */
  map: (state: MapModeState) => ReactNode
  /** The content column. Receives the mode and its setter. */
  children: (state: MapModeState) => ReactNode
  scroll?: MapSplitScroll
  breakpoint?: MapSplitBreakpoint
  /** Percentage of the row the CONTENT takes at and above the breakpoint. */
  contentPercent?: number
  /**
   * `hide` keeps the content mounted behind `display:none` in `full`, which is
   * what preserves a list's scroll position and its progressive page. A WINDOW-
   * virtualised table must be UNMOUNTED instead: hidden, it measures a
   * scrollMargin of 0 and comes back drawing its rows a page above themselves.
   */
  contentInFull?: 'hide' | 'unmount'
  /** Height of the map block below the breakpoint, in `split`. */
  splitHeight?: string
  /** Extra content for the map's own header bar, before the switch. */
  barExtra?: ReactNode
}

export function MapSplit({
  screenKey,
  ariaLabel,
  map,
  children,
  scroll = 'panel',
  breakpoint = 'lg',
  contentPercent = 33.3333,
  contentInFull = 'hide',
  splitHeight = 'h-[40dvh]',
  barExtra,
}: MapSplitProps) {
  const state = useMapMode(screenKey)
  const { mode, setMode } = state
  const ratioState = useMapRatio(screenKey, contentPercent)
  const { ratio } = ratioState
  const c = BP[breakpoint]

  const shellRef = useRef<HTMLDivElement | null>(null)

  const style = {
    '--content-w': `${clampRatio(ratio)}%`,
  } as CSSProperties

  return (
    <div
      ref={shellRef}
      data-map-shell={screenKey}
      style={style}
      className={`${scroll === 'page' ? c.shellPage : c.shellPanel} ${
        // In `full` below the breakpoint the map IS the screen, so the shell is
        // pinned to the viewport instead of growing with a list that is not
        // there. `min-h-dvh` otherwise, so a short list still fills the page.
        mode === 'full'
          ? 'h-[calc(100dvh-var(--shell-top)-var(--shell-bottom))] min-h-0'
          : 'min-h-dvh'
      }`}
    >
      {/* Content — FIRST in the DOM, physically on the right past the
          breakpoint (see the direction note above). */}
      {!(mode === 'full' && contentInFull === 'unmount') && (
        <div
          data-map-content=""
          className={`${scroll === 'page' ? c.contentPage : c.contentPanel} ${
            mode === 'full'
              ? 'hidden'
              : mode === 'hidden'
                ? c.contentHidden
                : c.contentSplit
          }`}
        >
          {/* ONE switch on screen at a time. Below the breakpoint the map sits
              ABOVE the content and its own bar carries the control, so this
              copy stands down — except in `hidden`, where there is no bar. */}
          <MapModeSwitch
            mode={mode}
            onChange={setMode}
            className={`mb-3 flex-wrap ${mode === 'hidden' ? '' : c.switchInContent}`}
          />
          {children(state)}
        </div>
      )}

      {/* P0bis.2 — THE SEAM IS THE CONTROL.
          DOM order is [content, splitter, map] and the row is reversed per
          direction, so physically it renders [map, splitter, content] in both
          Hebrew and English without a second variant. It exists only in
          `split` and only past the breakpoint: below it the two panels are
          STACKED, and a vertical seam between a map and the list under it is
          a control that would move nothing. */}
      {mode === 'split' && (
        <PanelSplitter
          {...ratioState}
          shellRef={shellRef}
          className={`${c.splitter} ${scroll === 'page' ? c.splitterPage : ''}`}
        />
      )}

      {/* Map — ONE instance, never remounted. `hidden` is `display:none`, which
          keeps the WebGL context and the camera; MapCanvas's ResizeObserver
          calls `map.resize()` on the way back. */}
      <div
        data-map-panel=""
        className={`${c.mapCol} ${scroll === 'page' ? c.mapColPage : ''} ${
          mode === 'hidden' ? 'hidden' : 'flex'
        } ${
          // Below the breakpoint the row is still a COLUMN, so the `flex-1`
          // that sizes the map past it does nothing and the map collapses to
          // zero height — the defect the first `full`-mode capture showed.
          mode === 'full' ? 'min-h-0 flex-1' : ''
        }`}
      >
        <div
          className={`items-center justify-between gap-2 border-b border-edge-subtle bg-surface-overlay px-4 py-2 ${
            mode === 'full' ? 'flex' : c.bar
          }`}
        >
          <span className="truncate text-caption font-medium text-content-secondary">
            {ariaLabel}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {barExtra}
            <MapModeSwitch mode={mode} onChange={setMode} />
          </div>
        </div>

        <div
          className={`${c.mapBox} ${
            mode === 'full' ? 'min-h-0 flex-1' : splitHeight
          }`}
        >
          {map(state)}
        </div>
      </div>
    </div>
  )
}
