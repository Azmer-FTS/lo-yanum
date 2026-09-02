import type { ReactNode } from 'react'
import type { LatLng } from '@core/index'

import { MapSplit } from './MapSplit'
import { MapView } from './MapView'
import type {
  MapMarker,
  MapPolygon,
  MapThreatVector,
  MapThreatZone,
} from './MapView'

/**
 * C1 — THE MAP-FIRST SHELL FOR THE LIST SCREENS.
 *
 * The coordinator thinks in geography, so on every major screen the map is a
 * first-class half of the layout rather than a thumbnail in a sidebar.
 *
 * The LAYOUT itself now lives in `MapSplit` (P0bis.1) — map physically left in
 * both writing directions, three persisted states, the draggable seam — and is
 * shared with every other screen that carries a map. What is left here is what
 * is specific to a map-first LIST: the markers, the floating legend, the
 * overlay controls and the selected-marker card.
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

const CONTENT_PERCENT: Record<ContentWidth, number> = {
  third: 33.3333,
  half: 50,
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
  /** U8 — centre the map on a tile's entity (see MapCanvas). */
  flyTo?: { position: LatLng; key: number; zoom?: number }
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
  flyTo,
  legend,
  overlay,
  detail,
  children,
  ariaLabel,
  contentWidth = 'third',
  screenKey,
}: MapPanelProps) {
  return (
    <MapSplit
      screenKey={screenKey}
      ariaLabel={ariaLabel}
      contentPercent={CONTENT_PERCENT[contentWidth]}
      map={({ mode }) => (
        <>
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
            flyTo={flyTo}
          />

          {/* ⚠️ `pl-[4.5rem]` — PHYSICAL LEFT, AND IT HAS TO BE (PO return
              2026-09-02). MapLibre puts its `top-left` control group on the
              physical left whatever the document direction, so in this RTL app
              a logical `ps-` clears the wrong side and the screen's own
              overlay lands on the zoom buttons. 4.5rem is the 44 px stack plus
              its gutter. */}
          {overlay && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 pl-[4.5rem]">
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
        </>
      )}
    >
      {() => children}
    </MapSplit>
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
