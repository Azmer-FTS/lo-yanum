import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'

import { HOME_BASE, boundsOf } from '@core/index'
import type { LatLng } from '@core/index'

import { readToken } from './badges'

/**
 * MapLibre GL over raster OpenStreetMap tiles.
 *
 * Raster OSM rather than a vector style so the POC needs no tile-provider API
 * key. Lot 1 should move to a keyed vector provider — the public OSM tile
 * servers are not meant for production traffic.
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

export interface MapMarker {
  id: string
  position: LatLng
  color: string
  title: string
  subtitle?: string
  /** Render larger — used for the focal point of a detail map. */
  emphasis?: boolean
  onSelect?: () => void
}

export interface MapViewProps {
  markers: MapMarker[]
  center?: LatLng
  zoom?: number
  /** Frame all markers instead of using center/zoom. */
  fit?: boolean
  interactive?: boolean
  className?: string
  ariaLabel: string
}

function markerElement(marker: MapMarker): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute('aria-label', marker.title)
  const ring = readToken('--surface-base')
  el.style.cssText = [
    `width:${marker.emphasis ? 26 : 20}px`,
    `height:${marker.emphasis ? 26 : 20}px`,
    'border-radius:999px',
    `border:3px solid ${ring}`,
    'cursor:pointer',
    'box-shadow:0 0 0 1px rgba(255,255,255,.18), 0 2px 10px rgba(0,0,0,.6)',
    'transition:transform 150ms cubic-bezier(.16,1,.3,1)',
    `background:${marker.color}`,
  ].join(';')
  el.addEventListener('mouseenter', () => {
    el.style.transform = 'scale(1.25)'
  })
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'none'
  })
  return el
}

export default function MapCanvas({
  markers,
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

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // Intentionally mount-only: later prop changes are handled by the effects
    // below, which is cheaper than tearing the GL context down.
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

  // Frame the markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (fit) {
      const b = boundsOf(markers.map((m) => m.position))
      if (b) {
        map.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: 40, duration: 0, maxZoom: 13 },
        )
        return
      }
    }
    if (center) {
      map.jumpTo({ center: [center.lng, center.lat], zoom })
    }
  }, [markers, fit, center, zoom])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      className={`map-night overflow-hidden rounded-lg bg-surface-sunken ${className}`}
    />
  )
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
