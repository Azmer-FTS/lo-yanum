import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef } from 'react'

import { HOME_BASE, boundsOf } from '@core/index'
import type { LatLng } from '@core/index'

import { readToken } from './badges'

/**
 * MapLibre GL over raster OpenStreetMap tiles.
 *
 * Raster OSM rather than a vector style so the POC needs no tile-provider API
 * key. Lot 1 should move to a keyed vector provider — the public OSM tile
 * servers are not meant for production traffic.
 *
 * The tile canvas is filtered by `--map-filter`, a THEME token: the dark theme
 * inverts the daylight raster into a night map. Markers are DOM siblings of the
 * canvas, so the filter never touches their colours.
 */

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

/** What a marker represents — drives its silhouette. */
export type MarkerKind = 'farm' | 'anchor' | 'incident' | 'mission' | 'origin'

export interface MapMarker {
  id: string
  position: LatLng
  color: string
  title: string
  subtitle?: string
  kind?: MarkerKind
  /** Render larger with a ring — hover, selection, or the focal point. */
  emphasis?: boolean
  /** Draw a pulsing halo (unresolved urgent incidents). */
  pulse?: boolean
  /** Step number for route planning; rendered inside the marker. */
  badge?: string
  onSelect?: () => void
  onHover?: (id: string | null) => void
}

export interface MapViewProps {
  markers: MapMarker[]
  /** Ordered points for an optional route polyline. */
  line?: LatLng[]
  center?: LatLng
  zoom?: number
  /** Frame all markers instead of using center/zoom. */
  fit?: boolean
  interactive?: boolean
  className?: string
  ariaLabel: string
}

const SIZE: Record<MarkerKind, number> = {
  farm: 20,
  anchor: 18,
  incident: 20,
  mission: 22,
  origin: 22,
}

function markerElement(marker: MapMarker): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute('aria-label', marker.title)

  const kind = marker.kind ?? 'farm'
  const base = SIZE[kind]
  const size = marker.emphasis ? base + 10 : base
  const ring = readToken('--surface-base')

  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    // Anchor points are square-ish so they read as infrastructure rather than
    // as another farm; everything else is a disc.
    kind === 'anchor' ? 'border-radius:5px' : 'border-radius:999px',
    `border:3px solid ${ring}`,
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-family:var(--font-sans)',
    'font-weight:700',
    `font-size:${Math.max(9, size - 12)}px`,
    `color:${readToken('--text-on-accent')}`,
    marker.emphasis
      ? 'box-shadow:0 0 0 3px rgba(255,255,255,.35), 0 4px 14px rgba(0,0,0,.55); z-index:5'
      : 'box-shadow:0 0 0 1px rgba(255,255,255,.18), 0 2px 10px rgba(0,0,0,.5)',
    'transition:width 150ms cubic-bezier(.16,1,.3,1),height 150ms cubic-bezier(.16,1,.3,1),box-shadow 150ms',
    `background:${marker.color}`,
  ].join(';')

  if (marker.badge) el.textContent = marker.badge

  if (marker.pulse) {
    // A CSS halo cannot live on the marker itself (it would scale the hit
    // area), so it is a sibling pseudo-element driven by this class.
    el.classList.add('map-marker-pulse')
    el.style.setProperty('--pulse-color', marker.color)
  }

  if (marker.onHover) {
    el.addEventListener('mouseenter', () => marker.onHover?.(marker.id))
    el.addEventListener('mouseleave', () => marker.onHover?.(null))
  }

  return el
}

export default function MapCanvas({
  markers,
  line,
  center,
  zoom = 8,
  fit = false,
  interactive = true,
  className = 'h-full w-full',
  ariaLabel,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  // Latest requested polyline. Held in a ref so the map's own `load` handler
  // can apply it the moment the source exists, whatever order things mounted in.
  const lineRef = useRef<LatLng[] | undefined>(line)

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [center?.lng ?? HOME_BASE.lng, center?.lat ?? HOME_BASE.lat],
      zoom,
      interactive,
      attributionControl: { compact: true },
    })

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }))
    }

    map.on('load', () => {
      // Declared up-front with an empty source so route updates are a cheap
      // setData() rather than an add/remove layer cycle on every keystroke.
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      })
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': readToken('--surface-base'),
          'line-width': 7,
          'line-opacity': 0.9,
        },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': readToken('--accent'),
          'line-width': 3.5,
          'line-dasharray': [2, 1.4],
        },
      })

      // Apply whatever line was requested while the style was still loading.
      applyLine(map, lineRef.current)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // Mount-only: later prop changes are handled by the effects below, which is
    // far cheaper than tearing the GL context down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = markers.map((marker) => {
      const el = markerElement(marker)
      if (marker.onSelect) el.addEventListener('click', marker.onSelect)

      const instance = new maplibregl.Marker({ element: el })
        .setLngLat([marker.position.lng, marker.position.lat])
        .addTo(map)

      // MapLibre stamps its own generic "Map marker" label on the element, so
      // the real name has to be re-applied after it is added.
      el.setAttribute('aria-label', marker.title)

      if (marker.subtitle !== undefined) {
        instance.setPopup(
          new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
            `<div style="font-family:var(--font-sans);direction:rtl;text-align:start">
               <strong style="display:block;font-size:13px">${escapeHtml(marker.title)}</strong>
               <span style="font-size:12px;opacity:.6">${escapeHtml(marker.subtitle)}</span>
             </div>`,
          ),
        )
      }
      return instance
    })
  }, [markers])

  // Sync the route polyline.
  //
  // Probing for the SOURCE rather than tracking a "map is ready" flag: under
  // StrictMode the map is created, torn down and recreated, and a shared flag
  // ends up describing the previous instance — so the line was being applied to
  // a map that had no route source yet, and silently vanished.
  useEffect(() => {
    lineRef.current = line
    const map = mapRef.current
    if (map) applyLine(map, line)
  }, [line])

  /**
   * Frame the content.
   *
   * Keyed on the GEOMETRY only, never on the marker array itself. Hover restyles
   * produce a brand-new markers array on every pointer move; re-running
   * fitBounds on that made the map re-frame continuously and never let the
   * tiles settle. The set of positions is what should drive framing.
   */
  const frameKey = useMemo(
    () =>
      [...markers.map((m) => `${m.position.lat},${m.position.lng}`), (line ?? []).length]
        .join('|'),
    [markers, line],
  )

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (fit) {
      const points = [...markers.map((m) => m.position), ...(line ?? [])]
      const b = boundsOf(points)
      if (b) {
        map.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: 48, duration: 400, maxZoom: 13 },
        )
        return
      }
    }
    if (center) {
      map.jumpTo({ center: [center.lng, center.lat], zoom })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, fit, center, zoom])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      className={`map-night overflow-hidden rounded-lg bg-surface-sunken ${className}`}
    />
  )
}

/** Push a polyline into the pre-declared `route` source, if it exists yet. */
function applyLine(map: maplibregl.Map, line: LatLng[] | undefined): void {
  const source = map.getSource('route') as maplibregl.GeoJSONSource | undefined
  if (!source) return
  source.setData({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: (line ?? []).map((p) => [p.lng, p.lat]),
    },
  })
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string,
  )
}
