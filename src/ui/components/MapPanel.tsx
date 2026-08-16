import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { LatLng } from '@core/index'

import { Icon } from './Icon'
import { MapView } from './MapView'
import type { MapMarker } from './MapView'

/**
 * C1 — THE MAP-FIRST SHELL.
 *
 * The coordinator thinks in geography, so on every major screen the map is a
 * first-class half of the layout rather than a thumbnail in a sidebar.
 *
 * Desktop: map on the visual LEFT at ~2/3, full height; the list panel takes
 * the remaining ~1/3 and scrolls independently. The document order is
 * list-then-map (so a screen reader hears the content first) and the visual
 * order is flipped with `flex-row-reverse`, which in an RTL document puts the
 * map on the left.
 *
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

export interface MapPanelProps {
  markers: MapMarker[]
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
}

export function MapPanel({
  markers,
  line,
  center,
  zoom,
  fit = true,
  legend,
  overlay,
  detail,
  children,
  ariaLabel,
}: MapPanelProps) {
  const { t } = useTranslation()
  const [openOnMobile, setOpenOnMobile] = useState(true)

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0 lg:flex-row-reverse">
      {/* List panel — first in the DOM, visually second on desktop. */}
      <div className="order-2 min-w-0 flex-1 overflow-y-auto px-4 py-5 lg:order-none lg:w-[34%] lg:max-w-lg lg:flex-none lg:px-5">
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
          className={`relative w-full border-e-edge-subtle lg:h-full lg:border-e ${
            openOnMobile ? 'h-[40dvh]' : 'h-0 overflow-hidden'
          } lg:!h-full`}
        >
          <MapView
            ariaLabel={ariaLabel}
            className="h-full w-full rounded-none"
            markers={markers}
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
              <div className="pointer-events-auto rounded-lg border border-edge-strong bg-surface-overlay/95 p-3 shadow-lift backdrop-blur">
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
