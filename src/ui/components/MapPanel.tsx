import type { ReactNode } from 'react'
import type { LatLng } from '@core/index'

import { MapView } from './MapView'
import type {
  MapMarker,
  MapPolygon,
  MapThreatVector,
  MapThreatZone,
} from './MapView'
import { MapModeSwitch, useMapMode } from './mapMode'

/**
 * C1 — THE MAP-FIRST SHELL.
 *
 * The coordinator thinks in geography, so on every major screen the map is a
 * first-class half of the layout rather than a thumbnail in a sidebar.
 *
 * D2 — THE MAP IS ALWAYS ON THE PHYSICAL LEFT.
 * ---------------------------------------------
 * Geography left, content right — in every language, RTL included. This is a
 * deliberate exception to the "everything is logical/flippable" rule: a map is
 * not text, and mirroring the whole screen for Hebrew moved the map to the
 * right, which the product owner reads as a different app rather than as a
 * translated one.
 *
 * Getting there needs both direction variants, because the same
 * `flex-direction` produces opposite physical results per writing mode. The
 * DOM order is list-then-map (a screen reader should hear the content first),
 * so:
 *   RTL  + `row`          → first child at the right  → map physically left ✓
 *   LTR  + `row-reverse`  → first child at the right  → map physically left ✓
 * `rtl:` outranks the bare class on specificity (`[dir='rtl'] .x`), so the
 * order they appear in the class string does not matter.
 *
 * For the same reason the divider between the two panels is a PHYSICAL
 * `border-r` on the map: the map's right edge is the seam in both directions,
 * and a logical `border-e` would jump to its outer edge in RTL.
 *
 * Ratio: 2/3 map, 1/3 content — in the `split` state.
 *
 * P0.1 — THREE STATES, NOT A MOBILE-ONLY COLLAPSE.
 * ------------------------------------------------
 * `screenKey` gives the panel a persisted `hidden`/`split`/`full` mode (see
 * `mapMode.tsx`) and the switch that drives it, at every width. Lot 0.9's
 * collapse button only existed below `lg`, which is the one width where the
 * map was not in the way. `split` stays the default and is byte-for-byte the
 * Lot 0.9 reading, so no screen changes shape until the coordinator asks.
 *
 * Mobile: in `split` the single map is a ~40vh block above the list.
 *
 * The map is rendered EXACTLY ONCE and repositioned with CSS. Rendering a
 * desktop copy and a mobile copy would create two WebGL contexts and two sets
 * of tile requests per screen — one of them permanently invisible.
 *
 * Hover/selection is synchronised in BOTH directions by the parent: it passes
 * `hoveredId` / `selectedId` down and receives `onHover` / `onSelect` back, so
 * a list row and its marker are always the same object to the user.
 */

/**
 * How much of the row the CONTENT column takes.
 *
 * `third` is the list screens: the map is the subject and the list annotates it.
 * `half` is the dashboard, where the decisions column carries as much weight as
 * the geography.
 */
export type ContentWidth = 'third' | 'half'

const CONTENT_WIDTH: Record<ContentWidth, string> = {
  third: 'lg:w-1/3',
  half: 'lg:w-1/2',
}

export interface MapPanelProps {
  markers: MapMarker[]
  /** G1 — farm-zone polygons drawn beneath the markers. */
  polygons?: MapPolygon[]
  /** G18 — the coordinator-only threat overlay, above the ground zones. */
  threatZones?: MapThreatZone[]
  threatVectors?: MapThreatVector[]
  /** Optional polyline (route planner) drawn beneath the markers. */
  line?: LatLng[]
  center?: LatLng
  zoom?: number
  fit?: boolean
  /** Floating legend, bottom corner of the map. */
  legend?: ReactNode
  /** Floating controls over the top of the map. */
  overlay?: ReactNode
  /** Card shown over the map for the selected marker. */
  detail?: ReactNode
  /** The list / content panel. */
  children: ReactNode
  ariaLabel: string
  contentWidth?: ContentWidth
  /**
   * P0.1 — identifies the screen whose map mode is being remembered. One key
   * per screen: a coordinator who wants the incidents map full does not
   * thereby want the volunteers list to disappear.
   */
  screenKey: string
}

export function MapPanel({
  markers,
  polygons,
  threatZones,
  threatVectors,
  line,
  center,
  zoom,
  fit = true,
  legend,
  overlay,
  detail,
  children,
  ariaLabel,
  contentWidth = 'third',
  screenKey,
}: MapPanelProps) {
  const { mode, setMode } = useMapMode(screenKey)

  return (
    // `--shell-bottom` is the height of the sticky dev toolbar. Without
    // subtracting it, a full-`dvh` map column is taller than the space actually
    // available and the floating legend renders behind the toolbar.
    <div
      className={`flex flex-col lg:h-[calc(100dvh-var(--shell-bottom))] lg:min-h-0 lg:flex-row-reverse lg:rtl:flex-row ${
        // In `full` below `lg` the map IS the screen, so the shell is pinned
        // to the viewport instead of growing with a list that is not there.
        mode === 'full'
          ? 'h-[calc(100dvh-var(--shell-top)-var(--shell-bottom))] min-h-0'
          : 'min-h-dvh'
      }`}
    >
      {/* List panel — first in the DOM, physically on the right on desktop.
          In `full` it is `hidden` rather than unmounted: a list that is
          re-created loses its scroll position and its progressive page. */}
      <div
        className={`order-2 min-w-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 lg:order-none lg:pb-5 ${
          mode === 'full'
            ? 'hidden'
            : mode === 'hidden'
              ? 'lg:w-full lg:px-5'
              : `lg:flex-none lg:px-5 ${CONTENT_WIDTH[contentWidth]}`
        }`}
      >
        {/* One switch on screen at a time. Below `lg` the map sits ABOVE the
            content, so its own bar carries the control and this copy stands
            down — except in `hidden`, where there is no bar to carry it. */}
        <MapModeSwitch
          mode={mode}
          onChange={setMode}
          className={`mb-3 flex-wrap ${mode === 'hidden' ? '' : 'hidden lg:flex'}`}
        />
        {children}
      </div>

      {/* Map — ONE instance, never remounted. `hidden` keeps the WebGL context
          and the camera; MapCanvas's ResizeObserver calls `map.resize()` on
          the way back. */}
      <div
        className={`order-1 flex-col lg:order-none lg:flex-1 ${
          mode === 'hidden' ? 'hidden' : 'flex'
        } ${
          // BELOW `lg` the row is a COLUMN, so `lg:flex-1` does nothing and a
          // `flex-1` map inside an unflexed parent collapses to nothing —
          // which is what the first `full`-mode capture at 390 px showed: an
          // empty grey band with the legend riding up over the header.
          mode === 'full' ? 'min-h-0 flex-1' : ''
        }`}
      >
        {/* In `full` the switch is the only chrome the map has left, so it
            rides the map's own header bar at every width. Below `lg` the bar
            carries it in `split` too — the map is above the content there,
            and a control below a 40vh map is a control nobody finds. */}
        <div
          className={`items-center justify-between gap-2 border-b border-edge-subtle bg-surface-overlay px-4 py-2 ${
            mode === 'full' ? 'flex' : 'flex lg:hidden'
          }`}
        >
          <span className="truncate text-caption font-medium text-content-secondary">
            {ariaLabel}
          </span>
          <MapModeSwitch mode={mode} onChange={setMode} />
        </div>

        <div
          className={`relative w-full border-edge-subtle lg:h-full lg:border-r ${
            mode === 'full' ? 'min-h-0 flex-1' : 'h-[40dvh]'
          } lg:!h-full`}
        >
          <MapView
            ariaLabel={ariaLabel}
            className="h-full w-full rounded-none"
            markers={markers}
            polygons={polygons}
            threatZones={threatZones}
            threatVectors={threatVectors}
            line={line}
            center={center}
            zoom={zoom}
            fit={fit}
          />

          {overlay && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
              <div className="pointer-events-auto">{overlay}</div>
            </div>
          )}

          {legend && (
            <div
              className={`pointer-events-none absolute bottom-3 start-3 z-10 lg:block ${
                mode === 'full' ? 'block' : 'hidden'
              }`}
            >
              {/* P0.1 — `full` is the one state where a phone shows the legend
                  at all (below `lg` it is hidden, because a 40dvh map cannot
                  spare the room). Capped and scrollable so it annotates the
                  map instead of covering a third of it: the farms legend runs
                  to eleven rows once the four zone tints and the seven
                  statuses are both on. */}
              <div className="pointer-events-auto max-h-[42dvh] overflow-y-auto rounded-card bg-surface-overlay/95 p-3 shadow-lift backdrop-blur lg:max-h-none">
                {legend}
              </div>
            </div>
          )}

          {detail && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 sm:inset-x-auto sm:end-4 sm:w-80">
              <div className="pointer-events-auto">{detail}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Marker builder shared by the map-first screens, so hover/selection is styled
 * identically everywhere: the active marker grows and gains a ring.
 */
export function withInteraction(
  marker: MapMarker,
  state: { hoveredId: string | null; selectedId: string | null },
  handlers: { onHover: (id: string | null) => void; onSelect: (id: string) => void },
): MapMarker {
  const active = marker.id === state.hoveredId || marker.id === state.selectedId
  return {
    ...marker,
    emphasis: active,
    onSelect: () => handlers.onSelect(marker.id),
    onHover: handlers.onHover,
  }
}
