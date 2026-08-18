import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { LatLng } from '@core/index'

import { Icon } from './Icon'
import { MapView } from './MapView'
import type { MapMarker, MapPolygon } from './MapView'

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
 * Ratio: 2/3 map, 1/3 content.
 * Mobile: the same single map becomes a collapsible ~40vh block above the list.
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
}

export function MapPanel({
  markers,
  polygons,
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
}: MapPanelProps) {
  const { t } = useTranslation()
  const [openOnMobile, setOpenOnMobile] = useState(true)

  return (
    // `--shell-bottom` is the height of the sticky dev toolbar. Without
    // subtracting it, a full-`dvh` map column is taller than the space actually
    // available and the floating legend renders behind the toolbar.
    <div className="flex min-h-dvh flex-col lg:h-[calc(100dvh-var(--shell-bottom))] lg:min-h-0 lg:flex-row-reverse lg:rtl:flex-row">
      {/* List panel — first in the DOM, physically on the right on desktop. */}
      <div
        className={`order-2 min-w-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 lg:order-none lg:flex-none lg:px-5 lg:pb-5 ${CONTENT_WIDTH[contentWidth]}`}
      >
        {children}
      </div>

      {/* Map — one instance, sized by breakpoint. */}
      <div className="order-1 flex flex-col lg:order-none lg:flex-1">
        {/* Mobile-only collapse control. */}
        <div className="flex items-center justify-between gap-2 border-b border-edge-subtle bg-surface-overlay px-4 py-2 lg:hidden">
          <span className="text-caption font-medium text-content-secondary">
            {ariaLabel}
          </span>
          <button
            type="button"
            onClick={() => setOpenOnMobile((v) => !v)}
            className="btn-ghost py-1.5 text-micro"
            aria-expanded={openOnMobile}
          >
            <Icon
              name="chevronDown"
              size={14}
              className={`transition-transform duration-base ${
                openOnMobile ? '' : '-rotate-90'
              }`}
            />
            {t(openOnMobile ? 'map.collapse' : 'map.expand')}
          </button>
        </div>

        <div
          className={`relative w-full border-edge-subtle lg:h-full lg:border-r ${
            openOnMobile ? 'h-[40dvh]' : 'h-0 overflow-hidden'
          } lg:!h-full`}
        >
          <MapView
            ariaLabel={ariaLabel}
            className="h-full w-full rounded-none"
            markers={markers}
            polygons={polygons}
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
            <div className="pointer-events-none absolute bottom-3 start-3 z-10 hidden lg:block">
              <div className="pointer-events-auto rounded-card bg-surface-overlay/95 p-3 shadow-lift backdrop-blur">
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
