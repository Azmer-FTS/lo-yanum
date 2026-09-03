import type { ReactNode } from 'react'
import type { LatLng } from '@core/index'

import { MapLegend } from './MapLegend'
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
  /**
   * X4.3 — when given, `detail` is drawn ANCHORED to this point with a tip
   * pointing at it, instead of parked in the map's corner. The key is what
   * re-opens it; see `MapCanvas.anchored`.
   */
  detailAt?: { position: LatLng; key: number }
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
  detailAt,
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
      map={() => (
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
            anchored={
              detail && detailAt
                ? { position: detailAt.position, key: detailAt.key, node: detail }
                : undefined
            }
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

          {/* ★ W5 — THE LEGEND IS ON EVERY MAP AT EVERY WIDTH. It used to be
              hidden below `lg` unless the map was in `full`, on the argument
              that a 40dvh map cannot spare the room — but it is FOLDED by
              default now, so what it costs when unopened is one 36 px title
              row, and the seven layer switches are the same seven on every
              screen (see `MapLegend`). A control that disappears at some
              widths is a control the product owner stops trusting. */}
          {/* ★ X3.5 — `start-7` RATHER THAN `start-3`, AND THE 16 EXTRA PIXELS
              ARE THE SEAM'S. The resize grip now hangs 20 px INTO the map from
              its physical right edge (see `PanelSplitter`), which is the same
              edge the legend is anchored to in Hebrew. Either the grip covers
              the legend or the legend covers the grip; a clearance is the only
              answer that leaves both readable in every state, folded or not. */}
          <div className="pointer-events-none absolute bottom-3 end-3 start-7 z-10 flex justify-start">
            <MapLegend>{legend}</MapLegend>
          </div>

          {/* U4.4 — `left-[3.75rem]` is PHYSICAL: the floating mode pill sits
              at the physical bottom-left whatever the writing direction. */}
          {/* X4.3 — the corner card is the fallback for the screens whose
              selection is not a point on the ground; with `detailAt` the same
              node is drawn on the marker instead. */}
          {detail && !detailAt && (
            <div className="pointer-events-none absolute bottom-3 left-[3.75rem] right-3 z-20 sm:left-auto sm:end-4 sm:w-80">
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
