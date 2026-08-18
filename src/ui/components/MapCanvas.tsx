import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

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
export type MarkerKind =
  | 'farm'
  | 'moshav'
  | 'anchor'
  | 'incident'
  | 'mission'
  | 'origin'
  | 'pin'
  | 'vertex'
  | 'car'
  | 'label'
  | 'move'

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
  /**
   * F2 — the pin can be dragged to a new position.
   *
   * Only anchor points use this, and only while the guard they belong to is
   * still being composed: once a group has been told where to stand, moving the
   * pin under them is not an edit, it is a lie.
   */
  draggable?: boolean
  onDragEnd?: (position: LatLng) => void
  onSelect?: () => void
  onHover?: (id: string | null) => void
}

/**
 * G1 — a farm zone painted on the map: crisp outline, ~9 % fill of the same
 * colour. Emphasis (the polygon being edited) doubles the outline and deepens
 * the fill.
 */
export interface MapPolygon {
  id: string
  ring: LatLng[]
  color: string
  emphasis?: boolean
}

export interface MapViewProps {
  markers: MapMarker[]
  /** G1 — zone polygons, under the markers and the route line. */
  polygons?: MapPolygon[]
  /** A click that lands INSIDE a polygon (fires alongside onMapClick). */
  onPolygonClick?: (id: string) => void
  /** Ordered points for an optional route polyline. */
  line?: LatLng[]
  center?: LatLng
  zoom?: number
  /** Frame all markers instead of using center/zoom. */
  fit?: boolean
  interactive?: boolean
  className?: string
  ariaLabel: string
  /**
   * F2 — a click on empty map, and the long-press that means the same thing on
   * a phone. Setting it also turns the cursor into a crosshair, which is the
   * only affordance a map has for "this is armed".
   */
  onMapClick?: (position: LatLng) => void
  /**
   * G1 — closing a polygon with a double-click. While set, MapLibre's own
   * double-click zoom is suspended so the gesture means exactly one thing.
   */
  onMapDblClick?: (position: LatLng) => void
  /**
   * F6.2 — COOPERATIVE GESTURES, for a map EMBEDDED IN A SCROLLING PAGE.
   *
   * The maps on the detail screens went from 12 rem to 24 rem this lot, which
   * makes them usable and creates a new problem: at that size a one-finger
   * swipe on a phone lands on the map far more often than not, and the map eats
   * the gesture, so the page appears frozen. Cooperative gestures reserve
   * one-finger drag for the PAGE and ask for two fingers (or ctrl+scroll) for
   * the map — which is the behaviour every embedded map on the web has, and the
   * reason this is a prop rather than a default: the full-height map columns,
   * where the map IS the page, must keep the single-finger pan.
   */
  cooperative?: boolean
}

const SIZE: Record<MarkerKind, number> = {
  farm: 26,
  moshav: 26,
  anchor: 30,
  incident: 24,
  mission: 22,
  origin: 22,
  pin: 30,
  vertex: 12,
  car: 28,
  label: 0,
  move: 26,
}

/** The kinds drawn as a bottom-anchored teardrop rather than a centred shape. */
const PIN_KINDS: ReadonlyArray<MarkerKind> = ['pin', 'anchor', 'car']

const TEARDROP =
  'M12 1C5.9 1 1 5.9 1 12c0 8.1 11 19 11 19s11-10.9 11-19C23 5.9 18.1 1 12 1z'

/** G8 — the meeting-point glyph: a car. */
const CAR_PATH =
  'M5 11l1.3-3.3A2 2 0 0 1 8.2 6h7.6a2 2 0 0 1 1.9 1.7L19 11m-14 0h14m-14 0a1.6 1.6 0 0 0-1.6 1.6V16a1 1 0 0 0 1 1H6m13-6a1.6 1.6 0 0 1 1.6 1.6V16a1 1 0 0 1-1 1H18m-12 0v1.4a.6.6 0 0 0 .6.6h1.2a.6.6 0 0 0 .6-.6V17m-2.4 0h2.4m9.6 0v1.4a.6.6 0 0 1-.6.6h-1.2a.6.6 0 0 1-.6-.6V17m2.4 0H16m-8.5-3.5h.01m8.99 0h.01'

/**
 * G7bis.1 — the glyph each kind carries, copied from Icon.tsx so the DOM built
 * outside React speaks the same visual vocabulary as the rest of the UI. A
 * marker is no longer "a coloured dot": the FARM is a barn on its disc, a
 * guard POST is a shield on its pin, the car's stops carry the car, and an
 * incident is a warning triangle — recognisable by shape before colour, which
 * is what colour-blindness and a sun-washed iPad both require.
 */
const GLYPH: Partial<Record<MarkerKind, string>> = {
  farm: 'M3 10.5 12 4l9 6.5M5 10v10h14V10M9.5 20v-5h5v5',
  // G16 — a moshav is a VILLAGE: two rooftops on its disc, not one barn.
  moshav:
    'M2.5 20v-6l4-3.5 4 3.5v6M10.5 20v-8.5L15.5 7l5 4.5V20M2 20h20M13.5 20v-4h4v4',
  mission:
    'M12 3c-2.6 1.6-5 2.3-7 2.4v7.2c0 4.4 2.9 6.8 7 8.4 4.1-1.6 7-4 7-8.4V5.4c-2-.1-4.4-.8-7-2.4z',
  anchor:
    'M12 3c-2.6 1.6-5 2.3-7 2.4v7.2c0 4.4 2.9 6.8 7 8.4 4.1-1.6 7-4 7-8.4V5.4c-2-.1-4.4-.8-7-2.4z',
  car: CAR_PATH,
  // G15 — the whole-polygon move handle: a four-way arrow cross.
  move: 'M12 2v20M2 12h20M12 2l-2.5 2.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5M2 12l2.5-2.5M2 12l2.5 2.5M22 12l-2.5-2.5M22 12l-2.5 2.5',
}

function markerElement(marker: MapMarker): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute('aria-label', marker.title)

  const kind = marker.kind ?? 'farm'
  const ring = readToken('--surface-base')

  if (kind === 'label') {
    // G15 — a READ-OUT, not a control: the live area chip riding a polygon.
    // pointer-events:none so panning and vertex drags pass straight through;
    // the colour identifies which zone the number belongs to.
    el.style.cssText = [
      'pointer-events:none',
      'border:none',
      'padding:2px 9px',
      'border-radius:var(--radius-pill)',
      `background:${marker.color}`,
      `color:${readToken('--text-on-accent')}`,
      'font-family:var(--font-sans)',
      'font-size:11.5px',
      'font-weight:700',
      'font-variant-numeric:tabular-nums',
      'white-space:nowrap',
      'box-shadow:0 1px 6px rgba(0,0,0,.35)',
    ].join(';')
    el.textContent = marker.title
    el.tabIndex = -1
    return el
  }

  if (kind === 'vertex') {
    // G1 — a polygon-vertex handle: a small ROUND grip (G7bis.1 — the raw
    // square read as debris next to the new pins). The VISIBLE dot is small so
    // a ring of them does not bury the polygon, but the hit area is the full
    // 44 px a fingertip needs (G11): the button is padded and transparent, the
    // handle is an inner dot.
    const visual = marker.emphasis ? SIZE.vertex + 4 : SIZE.vertex
    el.style.cssText = [
      'width:44px',
      'height:44px',
      'padding:0',
      'background:transparent',
      'border:none',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      `cursor:${marker.draggable ? 'grab' : 'pointer'}`,
    ].join(';')
    const handle = document.createElement('span')
    handle.style.cssText = [
      `width:${visual}px`,
      `height:${visual}px`,
      'border-radius:var(--radius-pill)',
      `background:${marker.color}`,
      `border:2.5px solid ${ring}`,
      'box-shadow:0 1px 6px rgba(0,0,0,.45)',
      'pointer-events:none',
      'transition:width 120ms,height 120ms',
    ].join(';')
    el.appendChild(handle)
    return el
  }

  if (PIN_KINDS.includes(kind)) {
    // G2 / G7bis.1 — a POINT ON THE GROUND is a real pin, not another disc.
    // The teardrop points at the exact spot (the marker is bottom-anchored,
    // see the Marker options): "the group stands here", not "roughly under
    // this dot". The head carries the kind's glyph — shield for a guard post,
    // car for a meeting point — or the rank badge when the caller numbers the
    // stops, or a plain dot for the generic location pin.
    const w = marker.emphasis ? SIZE[kind] + 6 : SIZE[kind]
    const h = Math.round((w * 4) / 3)
    el.style.cssText = [
      `width:${w}px`,
      `height:${h}px`,
      'padding:0',
      'background:transparent',
      'border:none',
      `cursor:${marker.draggable ? 'grab' : 'pointer'}`,
      'display:block',
      marker.emphasis
        ? 'filter:drop-shadow(0 0 3px rgba(255,255,255,.4)) drop-shadow(0 4px 8px rgba(0,0,0,.55))'
        : 'filter:drop-shadow(0 3px 6px rgba(0,0,0,.45))',
      'transition:width 150ms cubic-bezier(.16,1,.3,1),height 150ms cubic-bezier(.16,1,.3,1),filter 150ms',
    ].join(';')
    const head = marker.badge
      ? `<text x="12" y="15.6" text-anchor="middle" font-family="var(--font-sans)"
               font-size="10.5" font-weight="700" fill="${ring}">${escapeHtml(marker.badge)}</text>`
      : GLYPH[kind]
        ? `<g fill="none" stroke="${ring}" stroke-width="2.4" stroke-linecap="round"
              stroke-linejoin="round" transform="translate(5.4 5.4) scale(0.55)">
             <path d="${GLYPH[kind]}"/>
           </g>`
        : `<circle cx="12" cy="12" r="4.2" fill="${ring}"/>`
    el.innerHTML = `
      <svg viewBox="0 0 24 32" width="${w}" height="${h}" aria-hidden="true">
        <path d="${TEARDROP}" fill="${marker.color}" stroke="${ring}" stroke-width="1.6"/>
        ${head}
      </svg>`
  } else if (kind === 'incident') {
    // G7bis.1 — an incident is a WARNING TRIANGLE, the shape every road sign
    // has already taught. Severity keeps the colour scale it always had.
    const s = marker.emphasis ? SIZE.incident + 8 : SIZE.incident
    el.style.cssText = [
      `width:${s}px`,
      `height:${s}px`,
      'padding:0',
      'background:transparent',
      'border:none',
      'cursor:pointer',
      'display:block',
      marker.emphasis
        ? 'filter:drop-shadow(0 0 3px rgba(255,255,255,.4)) drop-shadow(0 4px 8px rgba(0,0,0,.55))'
        : 'filter:drop-shadow(0 2px 5px rgba(0,0,0,.45))',
      'transition:width 150ms cubic-bezier(.16,1,.3,1),height 150ms cubic-bezier(.16,1,.3,1),filter 150ms',
    ].join(';')
    el.innerHTML = `
      <svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">
        <path d="M12 2.6 22.6 20.9H1.4Z" fill="${marker.color}" stroke="${ring}"
              stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M12 9.6v4.6M12 17.1v.2" fill="none" stroke="${ring}"
              stroke-width="2" stroke-linecap="round"/>
      </svg>`
  } else {
    // The disc kinds: the farm's identity pastille (barn glyph), a guard on
    // the missions map (shield), the route's origin. A numbered badge wins
    // over the glyph — the number IS the information on a route.
    const base = SIZE[kind]
    const size = marker.emphasis ? base + 10 : base

    el.style.cssText = [
      `width:${size}px`,
      `height:${size}px`,
      // The radius comes from the scale — a marker is built outside React but
      // is still part of the system, and `bun run tokens` refuses a literal.
      'border-radius:var(--radius-pill)',
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

    if (marker.badge) {
      el.textContent = marker.badge
    } else if (GLYPH[kind]) {
      // The glyph strokes in the RING colour, not `--text-on-accent`: the farm
      // disc is brand forest in light, and a near-black ink on it is invisible.
      el.innerHTML = `
        <svg viewBox="0 0 24 24" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}" aria-hidden="true"
             fill="none" stroke="${ring}" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="${GLYPH[kind]}"/>
        </svg>`
    }
  }

  if (marker.pulse) {
    // A CSS halo cannot live on the marker itself (it would scale the hit
    // area), so it is a sibling pseudo-element driven by this class.
    el.classList.add('map-marker-pulse')
    el.style.setProperty('--pulse-color', marker.color)
  }

  if (marker.draggable) el.style.cursor = 'grab'

  if (marker.onHover) {
    el.addEventListener('mouseenter', () => marker.onHover?.(marker.id))
    el.addEventListener('mouseleave', () => marker.onHover?.(null))
  }

  return el
}

export default function MapCanvas({
  markers,
  polygons,
  onPolygonClick,
  line,
  center,
  zoom = 8,
  fit = false,
  interactive = true,
  className = 'h-full w-full',
  ariaLabel,
  onMapClick,
  onMapDblClick,
  cooperative = false,
}: MapViewProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  /**
   * The map is created once and never re-created, so its click handler has to
   * be registered once too — but the callback it should invoke changes on every
   * parent render. A ref is what lets one permanent listener always call the
   * CURRENT handler; closing over the prop instead would pin the listener to
   * whatever `onMapClick` was at mount, i.e. to the first farm the wizard
   * happened to show.
   */
  const clickRef = useRef(onMapClick)
  clickRef.current = onMapClick
  const polygonClickRef = useRef(onPolygonClick)
  polygonClickRef.current = onPolygonClick
  const dblClickRef = useRef(onMapDblClick)
  dblClickRef.current = onMapDblClick

  // Double-click has one meaning at a time: close the ring, or zoom. The
  // handler's presence decides which.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (onMapDblClick) map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
  }, [onMapDblClick])
  // Latest requested polyline. Held in a ref so the map's own `load` handler
  // can apply it the moment the source exists, whatever order things mounted in.
  const lineRef = useRef<LatLng[] | undefined>(line)
  const polygonsRef = useRef<MapPolygon[] | undefined>(polygons)

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
      cooperativeGestures: cooperative,
      // MapLibre ships the gesture hint in English; the app is Hebrew-only and
      // the string is real UI, so it comes from the locale file like the rest.
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': t('map.gestureDesktop'),
        'CooperativeGesturesHandler.MacHelpText': t('map.gestureMac'),
        'CooperativeGesturesHandler.MobileHelpText': t('map.gestureMobile'),
      },
    })

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }))
    }

    map.on('load', () => {
      // G1 — zone polygons, declared before the route so the line and the
      // markers always paint above the ground they describe.
      map.addSource('zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['case', ['get', 'emphasis'], 0.18, 0.09],
        },
      })
      map.addLayer({
        id: 'zones-line',
        type: 'line',
        source: 'zones',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['get', 'emphasis'], 3.5, 2],
        },
      })
      map.on('click', 'zones-fill', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined
        if (id) polygonClickRef.current?.(id)
      })
      applyPolygons(map, polygonsRef.current)

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

    // F2 — placing a point. `contextmenu` is the same gesture on a phone: a
    // long press. MapLibre already separates a click from the end of a pan, so
    // this never fires because somebody dragged the map.
    const place = (e: maplibregl.MapMouseEvent) => {
      clickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    }
    if (dblClickRef.current) map.doubleClickZoom.disable()
    map.on('click', place)
    map.on('contextmenu', place)
    map.on('dblclick', (e) => {
      if (!dblClickRef.current) return
      e.preventDefault()
      dblClickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })

    // G7bis.2 — the fullscreen mode swaps the CONTAINER's size without any
    // window resize, and this MapLibre build only listens for the latter. The
    // observer keeps the GL canvas glued to whatever box the container takes.
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    mapRef.current = map
    return () => {
      resizeObserver.disconnect()
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

      // A marker sits in the map container, so its click bubbles to the
      // container and MapLibre reports it as a map click too. Without this,
      // tapping an existing anchor point ALSO drops a new one underneath it.
      el.addEventListener('click', (e) => e.stopPropagation())

      const instance = new maplibregl.Marker({
        element: el,
        draggable: marker.draggable ?? false,
        // A teardrop points with its TIP; centre-anchoring it would report a
        // position half a pin height south of where the user aimed.
        anchor: PIN_KINDS.includes(marker.kind ?? 'farm') ? 'bottom' : 'center',
        // G15 — the area chip floats ABOVE its anchor so it never buries the
        // move handle that shares the polygon's centre.
        offset: marker.kind === 'label' ? [0, -26] : [0, 0],
      })
        .setLngLat([marker.position.lng, marker.position.lat])
        .addTo(map)

      if (marker.draggable) {
        instance.on('dragstart', () => {
          el.style.cursor = 'grabbing'
        })
        instance.on('dragend', () => {
          el.style.cursor = 'grab'
          const { lat, lng } = instance.getLngLat()
          marker.onDragEnd?.({ lat, lng })
        })
      }

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

  useEffect(() => {
    polygonsRef.current = polygons
    const map = mapRef.current
    if (map) applyPolygons(map, polygons)
  }, [polygons])

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
    if (!map || !fit) return
    const points = [...markers.map((m) => m.position), ...(line ?? [])]
    const b = boundsOf(points)
    if (!b) return
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 48, duration: 400, maxZoom: 13 },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, fit])

  /**
   * Centring is keyed on the CENTRE, not on the markers.
   *
   * F2 made this matter: an editable map re-renders on every drag, and while
   * the two behaviours shared one effect a dropped pin re-ran `jumpTo` and
   * snapped the view back — so the user's own edit undid their pan. The centre
   * changing is the only thing that should move the camera on a centred map;
   * `fit` maps keep their own effect above.
   */
  const centreKey = center ? `${center.lat},${center.lng}` : ''

  useEffect(() => {
    const map = mapRef.current
    if (!map || fit || !center) return
    map.jumpTo({ center: [center.lng, center.lat], zoom })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreKey, zoom, fit])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      className={`map-night overflow-hidden rounded-card bg-surface-sunken ${
        onMapClick ? '[&_.maplibregl-canvas]:cursor-crosshair' : ''
      } ${className}`}
    />
  )
}

/** Push the zone polygons into the pre-declared `zones` source. */
function applyPolygons(
  map: maplibregl.Map,
  polygons: MapPolygon[] | undefined,
): void {
  const source = map.getSource('zones') as maplibregl.GeoJSONSource | undefined
  if (!source) return
  source.setData({
    type: 'FeatureCollection',
    features: (polygons ?? [])
      .filter((p) => p.ring.length >= 3)
      .map((p) => ({
        type: 'Feature',
        properties: {
          id: p.id,
          color: p.color,
          emphasis: p.emphasis ?? false,
        },
        geometry: {
          type: 'Polygon',
          // GeoJSON wants an explicitly closed ring; the domain type keeps it
          // implicit so a vertex drag never has to touch two array slots.
          coordinates: [
            [...p.ring, p.ring[0]].map((v) => [v.lng, v.lat]),
          ],
        },
      })),
  })
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
