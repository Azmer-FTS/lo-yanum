import maplibregl from 'maplibre-gl'
import type { ExpressionSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { HOME_BASE, bearingDeg, boundsOf } from '@core/index'
import type { LatLng } from '@core/index'

import { readToken } from './badges'
import { readStoredBase, writeStoredBase } from './mapBase'
import { MapTools } from './MapTools'
import { MARKER_LAYER, useMapLayers } from './mapLayers'
import { buildBasemapStyle, registerPmtilesProtocol, resolvedThemeOf } from './basemap'
import { REGIONS, regionById, regionOf } from '@core/index'
import type { BasemapBase } from './basemap'

/**
 * MapLibre GL over a self-hosted Protomaps PMTiles vector basemap.
 *
 * Raster OSM rather than a vector style so the POC needs no tile-provider API
 * key. Lot 1 should move to a keyed vector provider — the public OSM tile
 * servers are not meant for production traffic.
 *
 * The basemap is VECTOR and themed per feature from `tokens.css` (see
 * `basemap.ts`); there is no canvas filter any more. Markers are DOM siblings of the
 * canvas, so the filter never touches their colours.
 */

// PMTILES (decision 71) — the raster OSM style that used to live here is gone.
// `basemap.ts` builds a VECTOR style from `tokens.css`, and the `pmtiles://`
// protocol is registered once for the page rather than per map: this module is
// imported by seven screens and MapLibre throws on a second registration.
registerPmtilesProtocol()

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
  | 'bubble'

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
   * P0.2 — diameter in px, for the `bubble` kind only. The count drives the
   * size (`bubbleDiameter` in @core/geo), so it cannot come from the SIZE
   * table like every other kind.
   */
  diameter?: number
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
  /** U4.3 — which layer switch governs it; unknown kinds are always drawn. */
  kind?: 'farm_boundary' | 'grazing_area'
  /** U5 — the frank tint the zone takes over satellite imagery. */
  satColor?: string
  emphasis?: boolean
}

/**
 * G18 — a THREAT ZONE, drawn so it can never be mistaken for ground.
 *
 * A farm boundary and a threat assessment are different KINDS of statement,
 * and on a map where four zone tints already compete, a fifth colour would
 * just be a fifth colour. So the threat layer changes the TEXTURE: a diagonal
 * hatch instead of a flat wash, a dashed outline instead of a solid one. That
 * reads as "this is an overlay, not terrain" before any colour is decoded, and
 * it survives the two things colour does not — a sun-washed iPad and
 * colour-blindness.
 */
export interface MapThreatZone {
  id: string
  ring: LatLng[]
  /** Drives the hatch tint and the outline. */
  intensity: 'low' | 'medium' | 'high'
  emphasis?: boolean
}

/** G18 — an approach vector: a shaft from origin to target, plus a head. */
export interface MapThreatVector {
  id: string
  origin: LatLng
  target: LatLng
  intensity: 'low' | 'medium' | 'high'
  emphasis?: boolean
}

export interface MapViewProps {
  markers: MapMarker[]
  /** G1 — zone polygons, under the markers and the route line. */
  polygons?: MapPolygon[]
  /** G18 — the coordinator-only threat overlay, above the ground zones. */
  threatZones?: MapThreatZone[]
  threatVectors?: MapThreatVector[]
  /** A click that lands INSIDE a polygon (fires alongside onMapClick). */
  onPolygonClick?: (id: string) => void
  /** Ordered points for an optional route polyline. */
  line?: LatLng[]
  center?: LatLng
  zoom?: number
  /** Frame all markers instead of using center/zoom. */
  fit?: boolean
  /**
   * U8 (2026-09-02) — "centre on the map" from a list tile. A NEW `key` moves
   * the camera once; the same position twice is two requests, so the key is
   * what the effect watches. Never zooms out below the farm scale.
   */
  flyTo?: { position: LatLng; key: number; zoom?: number }
  /**
   * ★ X4.3 (2026-09-04) — A PREVIEW ANCHORED TO ITS OWN MARKER.
   *
   * Tapping a list tile's photo used to call `flyTo`, which zoomed from the
   * national frame to z13 — the product owner lost the context he tapped the
   * photo to get. What he asked for instead: the camera STAYS where it is,
   * and the entity's card opens with a little arrow pointing at its pin, so
   * he can see the farm in its region. The tight frame is still what OPENING
   * the sheet does (`frameTo`), which is the other gesture and the other
   * question.
   *
   * It is a MapLibre `Popup` with React portalled into it rather than an
   * absolutely-positioned div: the tip, the re-anchoring on pan and zoom, and
   * the flip when the point is near an edge are all things MapLibre already
   * does correctly, and all things a hand-rolled overlay gets wrong first on
   * a device being panned with a thumb.
   */
  anchored?: { position: LatLng; key: number; node: ReactNode }
  /**
   * ★ W6 (2026-09-02) — FRAME AN ENTITY'S OWN GEOMETRY, CLOSE.
   *
   * Opening a farm's sheet used to hand the map `center = farm.position,
   * zoom = 13`, which is a REGIONAL frame: the product owner's holding, its
   * boundary, its grazing and its two guard posts came up as a cluster of
   * dots a centimetre across in the middle of the Negev, and every single
   * visit began by zooming in by hand.
   *
   * This frames the bounding box of everything that BELONGS to the entity —
   * the rings of its zones, its posts, its own pin — with a real margin, and
   * it does it once per `key` (the entity's id), so an edit, a drawn zone or
   * a pan is never undone by a re-frame. `maxZoom` is the far end of the
   * clamp: a single-point entity gets a farm-scale view, not the whole of
   * MapLibre's zoom range.
   */
  frameTo?: { points: LatLng[]; key: string; maxZoom?: number; padding?: number }
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
  /**
   * PO RETURN 2026-09-02 — the fullscreen toggle moved INTO the map's control
   * stack, so the host hands its state down instead of floating a button of
   * its own over the canvas. Omitted where the host has no fullscreen mode.
   */
  fullscreen?: { active: boolean; onToggle: () => void }
  /**
   * מיקומי. On by default wherever the map is driven: "where am I" is the one
   * question every screen with a real map can be asked. Thumbnails never get
   * it, because `interactive: false` skips the whole stack.
   */
  locate?: boolean
  /**
   * PO POINT 9b — ציור חופשי. While `active`, a single continuous pointer
   * gesture TRACES a shape instead of panning the map.
   *
   * ★ POINTER EVENTS, WHICH IS POINT 9a's REQUIREMENT MADE STRUCTURAL. The
   *   handler never asks whether the input was a finger; `pointerType` is
   *   pen, touch or mouse and all three take the same path. That is the only
   *   way an Apple Pencil behaves like a finger without a branch somebody has
   *   to remember to add.
   */
  freehand?: {
    active: boolean
    /** The zone colour to trace in. */
    color: string
    /** Throttled to one animation frame — for the live dunam read-out. */
    onTrace: (points: LatLng[]) => void
    /**
     * The finished trace, on pointer release, WITH the zoom it was drawn at.
     *
     * ★ THE ZOOM TRAVELS WITH THE TRACE because the simplification tolerance
     *   is a number of SCREEN pixels turned into metres, and only the map
     *   knows what a pixel was worth at the moment the hand lifted. Reading it
     *   back afterwards would be reading it after the camera may have moved.
     */
    onEnd: (points: LatLng[], zoom: number) => void
  }
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
  // P0.2 — a bubble sizes itself from its count; SIZE is only the floor a
  // caller gets if it forgets to pass one.
  bubble: 30,
}

/** The kinds drawn as a bottom-anchored teardrop rather than a centred shape. */
const PIN_KINDS: ReadonlyArray<MarkerKind> = ['pin', 'anchor', 'car']

const TEARDROP =
  'M12 1C5.9 1 1 5.9 1 12c0 8.1 11 19 11 19s11-10.9 11-19C23 5.9 18.1 1 12 1z'

/**
 * ★ W5 (2026-09-02) — A GUARD POST IS AN "ÉPINGLE", NOT A DROP.
 *
 * Every bottom-anchored marker on this map wore the SAME teardrop: the farm's
 * meeting point, the car's pickup stops and the guard posts. Three different
 * ideas, one silhouette, told apart only by a 13 px glyph and a colour — on
 * an iPad, in daylight, at z12, that is told apart by nothing at all.
 *
 * A guard post is now a PIN: a round head on a tapering needle, the map-pin
 * shape that reads as "planted here". The drop stays for the things that ARE
 * drops — a location the coordinator placed, a pickup stop — so the two are
 * one glance apart at any zoom.
 *
 * The head's centre is at y ≈ 8.9 rather than 12, so the glyph and the rank
 * badge move up with it; see `HEAD_Y` below.
 */
const NEEDLE_PIN = 'M12 31.2 9.6 17.6a9 9 0 1 1 4.8 0z'

/** Which of the two bottom-anchored silhouettes each pin kind wears. */
const PIN_SHAPE: Partial<Record<MarkerKind, string>> = {
  anchor: NEEDLE_PIN,
}

/** Where the head's centre sits in the 24×32 box, per silhouette. */
const HEAD_Y: Partial<Record<MarkerKind, number>> = {
  anchor: 8.9,
}

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

/**
 * P0.3 — A FINGER NEEDS 44 px, AND THE MAP MUST NOT GROW TO GIVE IT.
 *
 * Every marker on this map is also a control: a farm disc opens a card, a
 * bubble filters a roster, a pin drags to a new position, the centre handle
 * translates a whole polygon. Most of them are drawn between 22 and 34 px,
 * which is right for the map and wrong for a thumb on an iPad in a truck —
 * the product owner's actual instrument.
 *
 * The visual size is therefore left ALONE and the hit area is expanded around
 * it, exactly the trick the G1 vertex grip already used: the button becomes a
 * transparent 44 px box and the drawn marker moves into a child span. Nothing
 * on screen changes; the target under the finger doubles.
 *
 * `anchorBottom` keeps the teardrop kinds honest without a single offset
 * adjustment: their tip IS the coordinate (see the Marker options), the box
 * only ever grows UPWARD and sideways, and `align-items:flex-end` keeps the
 * drawn pin flush with the box's bottom edge. A centre-anchored kind grows
 * symmetrically and needs nothing either.
 */
const TOUCH_MIN = 44

function wrapForTouch(
  el: HTMLElement,
  width: number,
  height: number,
  anchorBottom: boolean,
): void {
  const boxW = Math.max(TOUCH_MIN, width)
  const boxH = Math.max(TOUCH_MIN, height)
  if (boxW === width && boxH === height) return

  const visual = document.createElement('span')
  visual.style.cssText = `${el.style.cssText};position:relative;pointer-events:none;flex:none`
  visual.innerHTML = el.innerHTML
  // The halo is a pseudo-element of the DRAWN marker, not of the hit box:
  // sized to the box it would ring 44 px of empty air.
  if (el.classList.contains('map-marker-pulse')) {
    el.classList.remove('map-marker-pulse')
    visual.classList.add('map-marker-pulse')
    visual.style.setProperty('--pulse-color', el.style.getPropertyValue('--pulse-color'))
  }

  const cursor = el.style.cursor || 'pointer'
  el.innerHTML = ''
  el.removeAttribute('style')
  el.style.cssText = [
    `width:${boxW}px`,
    `height:${boxH}px`,
    'padding:0',
    'background:transparent',
    'border:none',
    'display:flex',
    'justify-content:center',
    anchorBottom ? 'align-items:flex-end' : 'align-items:center',
    `cursor:${cursor}`,
  ].join(';')
  el.appendChild(visual)
}

function markerElement(marker: MapMarker): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute('aria-label', marker.title)

  const kind = marker.kind ?? 'farm'
  const ring = readToken('--surface-base')
  // P0.3 — filled in by whichever branch draws the marker, then handed to
  // `wrapForTouch` at the bottom. Declared here so no branch can forget it and
  // silently ship a 22 px target.
  let footprint: { w: number; h: number; anchorBottom: boolean } | null = null

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

  if (kind === 'bubble') {
    // P0.2 — AGGREGATED PEOPLE. A translucent disc on a town, its area
    // proportional to how many volunteers or drivers live there, with the
    // count written inside. Translucent on purpose: bubbles overlap at low
    // zoom over the Negev's cluster of towns, and an opaque one would erase
    // its neighbour rather than sit in front of it.
    //
    // Selection is loud (a full-opacity fill and a thick ring), because this
    // marker is a FILTER control: "which town am I looking at" has to be
    // answerable without reading the pill row below the map.
    const d = marker.diameter ?? SIZE.bubble
    el.style.cssText = [
      `width:${d}px`,
      `height:${d}px`,
      'padding:0',
      'border-radius:var(--radius-pill)',
      `background:${marker.color}`,
      `opacity:${marker.emphasis ? '1' : '.72'}`,
      `border:${marker.emphasis ? 3.5 : 2}px solid ${ring}`,
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-family:var(--font-sans)',
      'font-weight:700',
      'font-variant-numeric:tabular-nums',
      `font-size:${d >= 46 ? 14 : 11.5}px`,
      `color:${readToken('--text-on-accent')}`,
      'box-shadow:0 2px 8px rgba(0,0,0,.35)',
      'transition:opacity 150ms,border-width 150ms',
    ].join(';')
    el.textContent = marker.badge ?? ''
    wrapForTouch(el, d, d, false)
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
    // W5 — the silhouette and, with it, where the head's contents sit.
    const silhouette = PIN_SHAPE[kind] ?? TEARDROP
    const headY = HEAD_Y[kind] ?? 12
    const head = marker.badge
      ? `<text x="12" y="${headY + 3.6}" text-anchor="middle" font-family="var(--font-sans)"
               font-size="10.5" font-weight="700" fill="${ring}">${escapeHtml(marker.badge)}</text>`
      : GLYPH[kind]
        ? `<g fill="none" stroke="${ring}" stroke-width="2.4" stroke-linecap="round"
              stroke-linejoin="round" transform="translate(5.4 ${headY - 6.6}) scale(0.55)">
             <path d="${GLYPH[kind]}"/>
           </g>`
        : `<circle cx="12" cy="${headY}" r="4.2" fill="${ring}"/>`
    el.innerHTML = `
      <svg viewBox="0 0 24 32" width="${w}" height="${h}" aria-hidden="true">
        <path d="${silhouette}" fill="${marker.color}" stroke="${ring}" stroke-width="1.6"/>
        ${head}
      </svg>`
    footprint = { w, h, anchorBottom: true }
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
    footprint = { w: s, h: s, anchorBottom: false }
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
    footprint = { w: size, h: size, anchorBottom: false }
  }

  if (marker.pulse) {
    // A CSS halo cannot live on the marker itself (it would scale the hit
    // area), so it is a sibling pseudo-element driven by this class.
    el.classList.add('map-marker-pulse')
    el.style.setProperty('--pulse-color', marker.color)
  }

  if (marker.draggable) el.style.cursor = 'grab'

  // P0.3 — LAST, so it inherits the cursor and the pulse class the branches
  // above set. The teardrops need the bottom anchor; everything else centres.
  if (footprint) {
    wrapForTouch(el, footprint.w, footprint.h, footprint.anchorBottom)
  }

  if (marker.onHover) {
    el.addEventListener('mouseenter', () => marker.onHover?.(marker.id))
    el.addEventListener('mouseleave', () => marker.onHover?.(null))
  }

  return el
}

export default function MapCanvas({
  markers: allMarkers,
  polygons: allPolygons,
  threatZones: allThreatZones,
  threatVectors: allThreatVectors,
  onPolygonClick,
  line,
  center,
  zoom = 8,
  fit = false,
  flyTo,
  anchored,
  frameTo,
  interactive = true,
  className = 'h-full w-full',
  ariaLabel,
  onMapClick,
  onMapDblClick,
  cooperative = false,
  fullscreen,
  locate = true,
  freehand,
}: MapViewProps) {
  const { t } = useTranslation()
  /**
   * U4.3 (2026-09-02) — THE LAYER SWITCHES ARE APPLIED HERE, ONCE, for every
   * map in the app: what a screen hands over is filtered by the remembered
   * visibility set before it reaches MapLibre. A marker kind no switch
   * governs (incidents, the route's origin, the drawing grips) is always
   * drawn; a polygon with no `kind` likewise.
   */
  const [layers] = useMapLayers()
  /**
   * ⚠️ X12.3 — THE LAYER SET, READ FROM WITHIN THE MAP'S OWN SETUP. The regions
   *    are MapLibre layers rather than a filtered prop, so their initial
   *    `visibility` has to be decided inside `installProgrammeLayers` — which
   *    runs from the map's `load` and again after every `setStyle`, in an
   *    effect that must not depend on the layer set (it creates the map, and
   *    re-creating a map on a checkbox is not a thing). The ref is what lets
   *    that closure read the CURRENT value without depending on it.
   */
  const layersRef = useRef(layers)
  layersRef.current = layers
  const markers = useMemo(
    () =>
      allMarkers
        .filter((m) => {
          const layer = MARKER_LAYER[m.kind ?? 'farm']
          return layer ? layers[layer] : true
        })
        /**
         * ★ X12.5 — THE DEMONSTRATION COLOURING. With `regionColors` on, an
         *   entity marker takes the colour of the region it stands in instead
         *   of the colour of its own status. It is a switch in the legend and
         *   it is off by default, because status is what a coordinator reads a
         *   marker for; this is for the minutes he spends showing a room where
         *   the association works.
         *
         *   Only ENTITY markers change. A guard post, a pickup point or a
         *   drawing grip is not in a region in any sense the product owner
         *   means, and recolouring those would make the map say something
         *   nobody asked it to.
         */
        .map((m) => {
          if (!layers.regionColors) return m
          const kind = m.kind ?? 'farm'
          if (kind !== 'farm' && kind !== 'moshav') return m
          const region = regionById(regionOf(m.position))
          return region ? { ...m, color: `rgb(${region.rgb})` } : m
        }),
    [allMarkers, layers],
  )
  const polygons = useMemo(
    () =>
      allPolygons?.filter((p) =>
        p.kind === 'grazing_area'
          ? layers.grazing
          : p.kind === 'farm_boundary'
            ? layers.boundaries
            : true,
      ),
    [allPolygons, layers],
  )
  const threatZones = useMemo(
    () => (layers.threatZones ? allThreatZones : allThreatZones && []),
    [allThreatZones, layers.threatZones],
  )
  const threatVectors = useMemo(
    () => (layers.threatVectors ? allThreatVectors : allThreatVectors && []),
    [allThreatVectors, layers.threatVectors],
  )
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
  /**
   * The control is created once, at mount, and the fullscreen flag changes on
   * every toggle — so the control reads the CURRENT value through a ref and is
   * repainted by the effect below. Closing over the prop would pin the button
   * to whatever "fullscreen" was when the map was created.
   */
  const fullscreenRef = useRef(fullscreen)
  fullscreenRef.current = fullscreen
  const locateRef = useRef(locate)
  locateRef.current = locate
  const freehandRef = useRef(freehand)
  freehandRef.current = freehand
  const toolsRef = useRef<MapTools | null>(null)

  // Double-click has one meaning at a time: close the ring, or zoom. The
  // handler's presence decides which.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (onMapDblClick) map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
  }, [onMapDblClick])

  /**
   * X12.3 — the regional washes are MapLibre layers rather than a filtered
   * prop, so their switch is a `visibility` change. Guarded on the layer
   * existing: `setStyle` (a theme or ground change) tears every programme
   * layer down and `installProgrammeLayers` puts them back, and this effect
   * can fire in the gap.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const on = layers.regions ? 'visible' : 'none'
      for (const id of ['regions-fill', 'regions-line', 'regions-label']) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on)
      }
    }
    apply()
    map.on('styledata', apply)
    return () => {
      map.off('styledata', apply)
    }
  }, [layers.regions])
  // Latest requested polyline. Held in a ref so the map's own `load` handler
  // can apply it the moment the source exists, whatever order things mounted in.
  const lineRef = useRef<LatLng[] | undefined>(line)
  const polygonsRef = useRef<MapPolygon[] | undefined>(polygons)
  const threatZonesRef = useRef<MapThreatZone[] | undefined>(threatZones)
  const threatVectorsRef = useRef<MapThreatVector[] | undefined>(threatVectors)
  // X4.3 — one popup and one host node for the anchored preview.
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const [popupHost] = useState(() => document.createElement('div'))

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    /**
     * ★ ASKED ONCE. The initial style and the `ground` the switcher starts on
     *   have to be the same answer, and `readStoredBase` consults
     *   `navigator.onLine` — which can flip between two calls.
     */
    const initialGround = readStoredBase()

    const map = new maplibregl.Map({
      container: containerRef.current,
      // ★ The stored ground, filtered through the network state — see
      //   `readStoredBase`. A device left in satellite mode and opened with no
      //   coverage comes up on the vector archive it is holding.
      style: buildBasemapStyle(resolvedThemeOf(), initialGround),
      center: [center?.lng ?? HOME_BASE.lng, center?.lat ?? HOME_BASE.lat],
      zoom,
      interactive,
      /* ★ X3.4 (2026-09-04) — MAPLIBRE'S ATTRIBUTION CONTROL IS OFF. It is
         added at the PHYSICAL bottom-right, which in this Hebrew app is the
         corner the legend owns, so the "i" ended up under the panel — the
         same four-owners-one-corner defect `MapTools` fixed at the top. The
         licence is a React button inside the legend's own row now; see
         `MapAttribution`, which also carries why the obligation is still
         met. */
      attributionControl: false,
      cooperativeGestures: cooperative,
      // MapLibre ships the gesture hint in English; the app is Hebrew-only and
      // the string is real UI, so it comes from the locale file like the rest.
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': t('map.gestureDesktop'),
        'CooperativeGesturesHandler.MacHelpText': t('map.gestureMac'),
        'CooperativeGesturesHandler.MobileHelpText': t('map.gestureMobile'),
      },
    })

    // ⚠️ MapLibre's own `NavigationControl` IS GONE (PO return 2026-09-02).
    //    Its zoom buttons are now two rows of the single vertical stack in
    //    `MapTools`, together with the ground switch, fullscreen and מיקומי —
    //    which is the whole point: one owner of the map's corner, so nothing
    //    can be laid on top of anything. See `MapTools` for the four-owner
    //    collision this replaces.

    /**
     * PMTILES — THE PROGRAMME'S OWN SOURCES AND LAYERS, AS A FUNCTION THAT CAN
     * BE RUN MORE THAN ONCE.
     *
     * ★ THIS EXTRACTION IS THE WHOLE RISK OF THE VECTOR SWAP, AND IT IS WHY IT
     *   IS DONE HERE RATHER THAN DISCOVERED LATER. With a raster basemap the
     *   theme was a CSS `filter` on the canvas, so switching light/dark never
     *   touched MapLibre at all. A vector style has a colour per feature, so
     *   the switch is a `setStyle` — **and `setStyle` throws away every source
     *   and layer the app added.** Four sources and ten layers: zones, threat
     *   zones, threat vectors, the route. On 27 screens.
     *
     *   So the setup is a named function called from BOTH `load` and, once,
     *   after each `setStyle`. It was already written to be re-runnable
     *   without knowing it: every layer reads its data from a ref rather than
     *   from a closure over props, because P0.1 needed the handler to "apply
     *   it the moment the source exists, whatever order things mounted in".
     *   That property is what makes this safe.
     */
    const installProgrammeLayers = () => {
      /**
       * ★ X12.3 (2026-09-04) — THE REGIONS, UNDER EVERYTHING.
       *
       * Thirteen translucent washes with the region's name at the centre.
       * They are added FIRST, so every programme drawing — zones, threats,
       * the route, the markers — paints on top of them: a region is the
       * ground the work happens on, not a thing on the map, and a wash that
       * covered a farm's boundary would invert that.
       *
       * ⚠️ 10 % OPACITY, AND A HUE THAT IS NOT THE PROGRAMME'S. The zone
       *    colours mean "the edge of a holding we work with" and the threat
       *    colours mean an assessment; borrowing either here would make a
       *    region look like one. The palette lives with the outlines in
       *    `core/regions.ts`, where the reason is written out.
       *
       * OFF BY DEFAULT (`mapLayers.ts`): the product owner turns them on to
       * explain the country and off again to work.
       */
      map.addSource('regions', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: REGIONS.map((r) => ({
            type: 'Feature' as const,
            properties: { id: r.id, name: r.name, color: `rgb(${r.rgb})` },
            geometry: {
              type: 'Polygon' as const,
              coordinates: [[...r.ring, r.ring[0]]],
            },
          })),
        },
      })
      const regionsVisible = layersRef.current.regions ? 'visible' : 'none'
      map.addLayer({
        id: 'regions-fill',
        type: 'fill',
        source: 'regions',
        layout: { visibility: regionsVisible },
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 },
      })
      map.addLayer({
        id: 'regions-line',
        type: 'line',
        source: 'regions',
        layout: { visibility: regionsVisible, 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.4,
          'line-opacity': 0.55,
        },
      })
      /**
       * The name at the centre. `symbol-placement: point` on a polygon puts
       * the label at the centroid, which is where `regionCenter` also puts it
       * and where `bun run regions` asserts it lands inside the outline.
       * `text-allow-overlap` is FALSE on purpose: at a national zoom thirteen
       * names would collide, and MapLibre dropping the ones that do not fit
       * is the right answer rather than a wall of text.
       */
      map.addLayer({
        id: 'regions-label',
        type: 'symbol',
        source: 'regions',
        layout: {
          visibility: regionsVisible,
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 12, 10, 20],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': readToken('--text-secondary'),
          'text-halo-color': readToken('--surface-base'),
          'text-halo-width': 1.6,
        },
      })

      // G1 — zone polygons, declared before the route so the line and the
      // markers always paint above the ground they describe.
      map.addSource('zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      /**
       * U5 (2026-09-02) — THE ZONES OVER SATELLITE IMAGERY. The Negev is
       * brown and green on a photograph, and a 9 % wash of green or amber
       * with a 2 px line simply vanished on it (the product owner's
       * finding). Over imagery the zone takes its `satColor` (cyan /
       * magenta, sky / violet — tokens.css), a 28 % fill, a 3.2 px contour
       * and a dark halo under the contour. The vector palette is untouched.
       *
       * ★ AND THE CONTOURS ARE DRAWN ABOVE EVERY FILL, threat hatch
       *   included: fills first, then the halo, then the lines, so two
       *   overlapping zones both keep a legible edge. The order below IS the
       *   rule; a layer added "where it seems to belong" breaks it.
       */
      const sat = ground === 'satellite'
      const zoneColor: ExpressionSpecification = sat
        ? ['coalesce', ['get', 'satColor'], ['get', 'color']]
        : ['get', 'color']
      map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': zoneColor,
          'fill-opacity': sat
            ? ['case', ['get', 'emphasis'], 0.42, 0.28]
            : ['case', ['get', 'emphasis'], 0.18, 0.09],
        },
      })
      /** Added AFTER the threat fill, below — see `addZoneContours`. */
      const addZoneContours = () => {
        if (sat) {
          map.addLayer({
            id: 'zones-halo',
            type: 'line',
            source: 'zones',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': 'rgb(0 0 0 / 0.6)',
              'line-width': ['case', ['get', 'emphasis'], 8, 6.5],
              'line-blur': 1.5,
            },
          })
        }
        map.addLayer({
          id: 'zones-line',
          type: 'line',
          source: 'zones',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': zoneColor,
            'line-width': sat
              ? ['case', ['get', 'emphasis'], 5, 3.2]
              : ['case', ['get', 'emphasis'], 3.5, 2],
          },
        })
      }
      map.on('click', 'zones-fill', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined
        if (id) polygonClickRef.current?.(id)
      })
      applyPolygons(map, polygonsRef.current)

      // G18 — THE THREAT OVERLAY, above the ground and below the route.
      //
      // The hatch is a generated 8×8 image per intensity rather than a flat
      // fill: `fill-pattern` is the only way MapLibre draws a texture, and a
      // texture is what separates "an assessment laid over the map" from "the
      // ground itself". One image per intensity because a pattern cannot take
      // a per-feature colour the way `fill-color` can.
      for (const intensity of ['low', 'medium', 'high'] as const) {
        const name = `threat-hatch-${intensity}`
        if (!map.hasImage(name)) {
          map.addImage(
            name,
            hatchImage(threatToken(intensity), intensity === 'high'),
            { pixelRatio: 2 },
          )
        }
      }
      // N7.4 (2026-09-02) — ONE HEAD PER INTENSITY, so the tip is the same
      // colour as the shaft it ends. A single medium-red head on an orange
      // low-intensity vector was the product owner's finding.
      for (const intensity of ['low', 'medium', 'high'] as const) {
        const name = `threat-arrow-${intensity}`
        if (!map.hasImage(name)) {
          map.addImage(name, arrowImage(threatToken(intensity), readToken('--surface-base')), {
            pixelRatio: 1,
          })
        }
      }

      map.addSource('threat-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'threat-zones-fill',
        type: 'fill',
        source: 'threat-zones',
        paint: {
          'fill-pattern': ['get', 'pattern'],
          'fill-opacity': ['case', ['get', 'emphasis'], 0.95, 0.75],
        },
      })
      // U5 — every fill is down; now the contours, above all of them.
      addZoneContours()
      map.addLayer({
        id: 'threat-zones-line',
        type: 'line',
        source: 'threat-zones',
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          // The intensity's weight, doubled again when the zone is selected.
          'line-width': [
            'case',
            ['get', 'emphasis'],
            4.5,
            ['case', ['==', ['get', 'intensity'], 'high'], 3.2, 2],
          ],
          // Dashed, so the boundary of an ASSESSMENT never reads as a fence.
          'line-dasharray': [2, 1.6],
        },
      })

      map.addSource('threat-vectors', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'threat-vectors-line',
        type: 'line',
        source: 'threat-vectors',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['get', 'emphasis'], 5, 3.5],
        },
      })
      map.addLayer({
        id: 'threat-vectors-head',
        type: 'symbol',
        source: 'threat-vectors',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'icon-image': ['concat', 'threat-arrow-', ['get', 'intensity']],
          'icon-size': ['case', ['get', 'emphasis'], 1.15, 0.9],
          'icon-rotate': ['get', 'bearing'],
          // Rotate WITH the map, so a two-finger twist does not leave every
          // arrow pointing somewhere it does not mean.
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      })

      applyThreats(map, threatZonesRef.current, threatVectorsRef.current)

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
      /**
       * PO POINT 9b — THE LIVE FREEHAND TRACE.
       *
       * ★ DRAWN BY MAPLIBRE, NOT BY REACT, and that is the whole reason it is
       *   a source rather than a hundred markers. A Pencil emits a point every
       *   few milliseconds; routing each one through a React render would
       *   rebuild the marker set of the entire screen sixty times a second
       *   while the operator is drawing, which is exactly when the app must
       *   not stutter. `setData` on one LineString is a buffer upload.
       *
       * Declared here so it comes back after a `setStyle` like everything
       * else — a trace that vanished because somebody tapped לוויין mid-stroke
       * would be a bug nobody could reproduce on purpose.
       */
      map.addSource('freehand', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      })
      map.addLayer({
        id: 'freehand-casing',
        type: 'line',
        source: 'freehand',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': readToken('--surface-base'),
          'line-width': 7,
          'line-opacity': 0.85,
        },
      })
      map.addLayer({
        id: 'freehand-line',
        type: 'line',
        source: 'freehand',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], readToken('--accent')],
          'line-width': 3.5,
        },
      })

      applyLine(map, lineRef.current)
    }

    map.on('load', () => {
      // A handle for the verification scripts. Published on LOAD, not on
      // create: React's dev-mode double mount creates a map, tears it down and
      // creates another, and a handle published at create time can point at
      // the corpse. A loaded map is by definition the live one.
      ;(window as unknown as { __loYanumMap?: maplibregl.Map }).__loYanumMap = map

      installProgrammeLayers()
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

    /**
     * PMTILES — THE THEME SWITCH IS NOW A `setStyle`, AND THIS IS WHAT PUTS THE
     * PROGRAMME'S LAYERS BACK.
     *
     * The raster basemap was themed with a CSS `filter` on the canvas, so
     * light/dark never reached MapLibre and there was nothing to observe. A
     * vector style holds its colours per layer, so the palette changing means
     * a new style — and a new style is a blank map until
     * `installProgrammeLayers` runs again.
     *
     * ★ WATCHED ON `<html>` RATHER THAN SUBSCRIBED FROM REACT, for the same
     *   reason `resolvedThemeOf` reads the DOM: `theme.tsx` stamps
     *   `data-theme`, the "system" choice stamps nothing and lets the media
     *   query decide, and this component is mounted by seven screens that do
     *   not all sit under the same provider. The attribute and the media query
     *   are the two things that can actually change the answer, so they are
     *   the two things watched.
     *
     * ★ AND IT ONLY ACTS ON A REAL CHANGE. `data-theme` is re-stamped on every
     *   role change and on every re-application of the same choice; rebuilding
     *   a 42 MB-backed style for an attribute that was set to the value it
     *   already had would drop every tile on screen for no reason.
     */
    let painted = resolvedThemeOf()
    let ground: BasemapBase = initialGround

    /**
     * ★ ONE FUNCTION REBUILDS THE STYLE, AND THERE ARE NOW TWO REASONS TO.
     *   The palette can change (light/dark) and the GROUND can change (vector
     *   or satellite, PO request B). Both are a `setStyle`, both therefore
     *   throw away the programme's four sources and ten layers, and both have
     *   to put them back. Two separate call sites doing "nearly the same
     *   thing" is how one of them ends up without the `styledata` handler and
     *   a coordinator loses his zones by toggling a button.
     */
    const applyStyle = () => {
      map.setStyle(buildBasemapStyle(painted, ground))
      // `setStyle` is asynchronous: the sources cannot be added back until the
      // new style is in place, and `styledata` is where MapLibre says so.
      map.once('styledata', installProgrammeLayers)
    }

    const repaint = () => {
      const next = resolvedThemeOf()
      if (next === painted) return
      painted = next
      applyStyle()
    }

    /**
     * PO RETURN 2026-09-02 — THE WHOLE OF THE MAP'S PERMANENT CHROME, IN ONE
     * CONTROL, and only where a map is actually driven. `interactive: false`
     * is the thumbnail case: a control on a 120 px preview is a control nobody
     * can hit. The offline rules — the ground switch disabled with a reason,
     * the automatic fallback to the national archive — live inside it, as they
     * did in `BaseSwitcher`.
     */
    if (interactive) {
      const tools = new MapTools({
        labels: {
          group: t('map.tools.group'),
          baseLabel: t('map.base.label'),
          vector: t('map.base.vector'),
          satellite: t('map.base.satellite'),
          satelliteOffline: t('map.base.offlineHint'),
          fullscreenEnter: t('map.fullscreen'),
          fullscreenExit: t('map.exitFullscreen'),
          locate: t('map.locate.label'),
          locating: t('map.locate.busy'),
          locateDenied: t('map.locate.denied'),
          locateFailed: t('map.locate.failed'),
          zoomIn: t('map.zoomIn'),
          zoomOut: t('map.zoomOut'),
        },
        base: ground,
        onBase: (next) => {
          if (next === ground) return
          ground = next
          writeStoredBase(next)
          applyStyle()
        },
        fullscreen: fullscreenRef.current
          ? {
              active: fullscreenRef.current.active,
              // Through the ref, so the control created once always calls the
              // CURRENT handler — the same rule as `clickRef` above.
              onToggle: () => fullscreenRef.current?.onToggle(),
            }
          : undefined,
        locate: locateRef.current,
      })
      toolsRef.current = tools
      map.addControl(tools, 'top-left')
    }

    const themeObserver = new MutationObserver(repaint)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)')
    systemDark?.addEventListener('change', repaint)

    mapRef.current = map
    return () => {
      resizeObserver.disconnect()
      themeObserver.disconnect()
      systemDark?.removeEventListener('change', repaint)
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

      // P0.3 — WHILE THE MAP IS ARMED, NO MARKER IS IN THE WAY.
      //
      // Every marker stops its click from reaching the map, or tapping a pin
      // would drop a second one underneath it (decision 51). Widening the hit
      // boxes to 44 px made that guard expensive: the transparent corners of a
      // box look like empty map and swallow the tap, so a zone corner placed
      // near a guard post silently did nothing — a trap, and precisely what
      // decision 55 exists to prevent.
      //
      // An armed map therefore suspends the guard for EVERY kind, draggable
      // ones included: while `onMapClick` is live the intent is unambiguous
      // ("put the thing HERE") and a pin under the finger is scenery, not an
      // ambiguity. Reshaping a ring never runs with placement armed
      // (AnchorMap passes `onMapClick` only while `mode.kind !== 'idle'`), so
      // no grip loses its grab. Set out here rather than inside
      // `markerElement` so the early-returning kinds — the vertex grips and
      // the draft corners of the ring being drawn — cannot miss it.
      if (onMapClick) el.style.pointerEvents = 'none'
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
    // `onMapClick` is in the deps because arming the map changes whether a
    // marker intercepts a tap — see `markerElement`.
  }, [markers, onMapClick])

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * PO POINT 9b — ציור חופשי: ONE CONTINUOUS GESTURE INSTEAD OF N TAPS.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * The product owner's finding on a real iPad was that the Pencil "poses les
   * points où il veut" in vertex mode. Vertex-by-vertex is the wrong verb for
   * a stylus: a pen draws. This effect turns the map into a drawing surface
   * for as long as the mode is on, and gives it back untouched afterwards.
   *
   * ★ ON THE CANVAS, NOT ON THE CONTAINER. The container also holds the
   *   control stack and the markers; listening there would start a trace when
   *   the operator reached for the zoom button. The GL canvas is the map
   *   surface and nothing else.
   *
   * ★ AND THE PAN IS GENUINELY SUSPENDED, in the two places it lives: MapLibre
   *   (`dragPan`, `dragRotate`) and the BROWSER (`touch-action`). Disabling
   *   only MapLibre leaves iPadOS free to scroll the page under the finger,
   *   which on a full-height map column looks exactly like the map moving.
   *   Both are restored on cleanup — including when the component unmounts
   *   mid-stroke, which is what happens when a coordinator taps away while
   *   drawing.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !freehand?.active) return
    const canvas = map.getCanvas()

    const panWasEnabled = map.dragPan.isEnabled()
    const rotateWasEnabled = map.dragRotate.isEnabled()
    const previousTouchAction = canvas.style.touchAction
    const previousCursor = canvas.style.cursor
    map.dragPan.disable()
    map.dragRotate.disable()
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'crosshair'

    let trace: LatLng[] = []
    let tracing = false
    let frame = 0
    let lastX = 0
    let lastY = 0

    const source = (): maplibregl.GeoJSONSource | undefined =>
      map.getSource('freehand') as maplibregl.GeoJSONSource | undefined

    const paint = (): void => {
      source()?.setData({
        type: 'Feature',
        properties: { color: freehandRef.current?.color },
        geometry: {
          type: 'LineString',
          coordinates: trace.map((p) => [p.lng, p.lat]),
        },
      })
    }

    const clear = (): void => {
      source()?.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [] },
      })
    }

    const at = (event: PointerEvent): LatLng => {
      const box = canvas.getBoundingClientRect()
      const point = map.unproject([event.clientX - box.left, event.clientY - box.top])
      return { lat: point.lat, lng: point.lng }
    }

    const report = (): void => {
      if (frame) return
      // ★ ONE REPORT PER FRAME. The banner needs the live area; React does not
      //   need three hundred renders a second to show it.
      frame = requestAnimationFrame(() => {
        frame = 0
        freehandRef.current?.onTrace(trace)
      })
    }

    const down = (event: PointerEvent): void => {
      // A second finger during a trace is a pinch the operator did not mean;
      // the primary pointer owns the stroke from start to finish.
      if (!event.isPrimary) return
      event.preventDefault()
      canvas.setPointerCapture(event.pointerId)
      tracing = true
      trace = [at(event)]
      lastX = event.clientX
      lastY = event.clientY
      paint()
      report()
    }

    const move = (event: PointerEvent): void => {
      if (!tracing) return
      event.preventDefault()
      // ⚠️ TWO CSS PIXELS. A Pencil reports sub-pixel movement continuously,
      //    including while it is held still; without this a "stationary" hand
      //    adds thousands of identical vertices and the simplification below
      //    is handed noise instead of a path.
      if (Math.hypot(event.clientX - lastX, event.clientY - lastY) < 2) return
      lastX = event.clientX
      lastY = event.clientY
      trace.push(at(event))
      paint()
      report()
    }

    const up = (event: PointerEvent): void => {
      if (!tracing) return
      event.preventDefault()
      tracing = false
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
      const finished = trace
      trace = []
      clear()
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      freehandRef.current?.onEnd(finished, map.getZoom())
    }

    const cancel = (): void => {
      if (!tracing) return
      tracing = false
      trace = []
      clear()
      freehandRef.current?.onTrace([])
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)

    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      if (frame) cancelAnimationFrame(frame)
      clear()
      canvas.style.touchAction = previousTouchAction
      canvas.style.cursor = previousCursor
      if (panWasEnabled) map.dragPan.enable()
      if (rotateWasEnabled) map.dragRotate.enable()
    }
    /**
     * ⚠️⚠️ THE DEPENDENCY IS `active` AND NOTHING ELSE, AND THE FIRST VERSION
     *      HAD `freehand` IN HERE TOO. That object is created inline in the
     *      host's JSX, so it is a NEW identity on every render — and this
     *      effect calls `onTrace`, which sets state, which renders. The effect
     *      therefore tore itself down and rebuilt itself in the middle of the
     *      stroke, taking `tracing = true` with it: the listeners survived,
     *      the stroke did not. The symptom was a trace that drew a few points,
     *      froze its live area and never produced a polygon, and `bun run
     *      freehand` is what caught it.
     *
     *      Everything that can change while the mode is on — the colour, the
     *      callbacks — is read through `freehandRef`, which is re-pointed on
     *      every render without disturbing anything.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freehand?.active])

  /**
   * PO RETURN 2026-09-02 — repaint the stack when the host's fullscreen state
   * changes. Cheap: it rewrites one icon and one label.
   */
  useEffect(() => {
    toolsRef.current?.update({
      fullscreen: fullscreen
        ? {
            active: fullscreen.active,
            onToggle: () => fullscreenRef.current?.onToggle(),
          }
        : undefined,
    })
  }, [fullscreen?.active, fullscreen])

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

  // G18 — one effect for both shapes: they are one layer to the user, and
  // toggling "שכבת איומים" changes both at once.
  useEffect(() => {
    threatZonesRef.current = threatZones
    threatVectorsRef.current = threatVectors
    const map = mapRef.current
    if (map) applyThreats(map, threatZones, threatVectors)
  }, [threatZones, threatVectors])

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

  /**
   * W6 — one framing per entity. Keyed on `frameTo.key` ALONE, deliberately:
   * the point list changes on every drawn vertex, and re-framing under a
   * hand that is drawing is the defect the `fit` effect above already
   * documents.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !frameTo || frameTo.points.length === 0) return
    /**
     * ⚠️ THE BOX IS COMPUTED HERE AND NOT WITH `boundsOf`, AND THAT IS THE
     *    WHOLE OF THIS FIX. `boundsOf` floors its padding at 0.02° PER SIDE
     *    — about 2.2 km — which is right for the national map it was written
     *    for and catastrophic for one holding: a farm whose geometry spans
     *    0.022° came out of it three times too wide, so `fitBounds` framed
     *    9 km of Negev around 2 km of farm and produced z12.8. That IS the
     *    "everything is minuscule" the product owner reported, and no amount
     *    of tuning `maxZoom` reaches it, because the box was already wrong.
     *
     *    Here the margin is 6 % of the box's own span, with no floor. The
     *    screen-pixel `padding` below is what keeps the geometry clear of
     *    the controls floating over the canvas.
     */
    let west = frameTo.points[0].lng
    let east = west
    let south = frameTo.points[0].lat
    let north = south
    for (const p of frameTo.points) {
      if (p.lng < west) west = p.lng
      if (p.lng > east) east = p.lng
      if (p.lat < south) south = p.lat
      if (p.lat > north) north = p.lat
    }
    // A single-point entity has no span at all: give it a ~200 m box and let
    // `maxZoom` decide, rather than handing MapLibre a degenerate rectangle.
    const padLng = Math.max((east - west) * 0.06, 0.001)
    const padLat = Math.max((north - south) * 0.06, 0.001)
    map.fitBounds(
      [
        [west - padLng, south - padLat],
        [east + padLng, north + padLat],
      ],
      { padding: frameTo.padding ?? 44, duration: 500, maxZoom: frameTo.maxZoom ?? 16 },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameTo?.key])

  // U8 — one camera move per request key (see the prop).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return
    map.easeTo({
      center: [flyTo.position.lng, flyTo.position.lat],
      zoom: Math.max(map.getZoom(), flyTo.zoom ?? 13),
      duration: 600,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.key])

  /**
   * X4.3 — THE ANCHORED PREVIEW. One popup instance, moved rather than
   * recreated; the React content lives in `popupHost` and is portalled in, so
   * it re-renders with the rest of the app while MapLibre keeps owning the
   * geometry.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!anchored) {
      popupRef.current?.remove()
      return
    }
    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        // Clear of a 44 px pin, so the tip lands on the marker rather than in it.
        offset: 26,
        maxWidth: '20rem',
        className: 'lo-anchored',
      }).setDOMContent(popupHost)
    }
    const point: [number, number] = [anchored.position.lng, anchored.position.lat]
    popupRef.current.setLngLat(point).addTo(map)

    /**
     * ⚠️ PAN, NEVER ZOOM. The whole point of this gesture is that the frame
     *    does not change — the product owner tapped the photo to SITUATE the
     *    farm. But a pin outside the viewport would open its card off screen,
     *    so a point outside the padded frame is eased into view at the SAME
     *    zoom, and a point already inside moves the camera not at all.
     */
    const box = map.getContainer().getBoundingClientRect()
    const at = map.project(point)
    const pad = 80
    const outside =
      at.x < pad || at.y < pad || at.x > box.width - pad || at.y > box.height - pad
    if (outside) map.easeTo({ center: point, duration: 500 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchored?.key, anchored === undefined])

  useEffect(
    () => () => {
      popupRef.current?.remove()
      popupRef.current = null
    },
    [],
  )

  return (
    <>
      <div
        ref={containerRef}
        role="application"
        aria-label={ariaLabel}
        className={`overflow-hidden rounded-card bg-surface-sunken ${
          onMapClick ? '[&_.maplibregl-canvas]:cursor-crosshair' : ''
        } ${className}`}
      />
      {anchored && createPortal(anchored.node, popupHost)}
    </>
  )
}

/**
 * G18 — the intensity's colour.
 *
 * TWO hues, not three: decision 49 keeps `--critical` for four meanings and a
 * threat assessment is none of them. The third step of the ladder is carried
 * by hatch DENSITY (see `hatchImage`) and outline weight, which is the better
 * encoding anyway — density survives a sun-washed iPad and colour-blindness.
 */
function threatToken(intensity: 'low' | 'medium' | 'high'): string {
  return readToken(intensity === 'low' ? '--status-warn' : '--status-danger')
}

/**
 * A diagonal-hatch tile, drawn once per intensity and handed to MapLibre.
 *
 * 16 px at pixelRatio 2 is an 8 px repeat on screen: coarse enough to read as
 * texture at farm zoom, fine enough not to turn into stripes at region zoom.
 * The strokes run at 45° and the background is transparent, so the terrain
 * underneath still shows — a threat zone is an overlay, not a lid.
 */
function hatchImage(color: string, dense: boolean): ImageData {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return new ImageData(size, size)
  ctx.clearRect(0, 0, size, size)
  ctx.strokeStyle = color
  ctx.lineWidth = dense ? 4 : 2.5
  ctx.lineCap = 'square'
  // Two stripes per tile when dense, one when not — that step IS the third
  // rung of the intensity ladder. The extra passes at ±size make the stripe
  // wrap cleanly across the tile seam instead of stopping at the edge.
  const stripes = dense ? [0, size / 2] : [0]
  for (const stripe of stripes) {
    for (const offset of [-size, 0, size]) {
      ctx.beginPath()
      ctx.moveTo(offset + stripe, size)
      ctx.lineTo(offset + stripe + size, 0)
      ctx.stroke()
    }
  }
  return ctx.getImageData(0, 0, size, size)
}

/**
 * A solid arrowhead, pointing NORTH so `icon-rotate` can take a bearing
 * directly, with a pale outline so it stays legible over its own hatch.
 *
 * Drawn at 36 px and registered at pixelRatio 1: at pixelRatio 2 the first
 * version came out ~9 px on screen and was invisible against the shaft, which
 * makes a vector indistinguishable from a plain line — and the whole point of
 * a vector is that it has a direction.
 */
function arrowImage(color: string, ring: string): ImageData {
  const size = 36
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return new ImageData(size, size)
  ctx.clearRect(0, 0, size, size)
  ctx.beginPath()
  ctx.moveTo(size / 2, 3)
  ctx.lineTo(size - 5, size - 6)
  ctx.lineTo(size / 2, size - 13)
  ctx.lineTo(5, size - 6)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = ring
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()
  return ctx.getImageData(0, 0, size, size)
}

/**
 * Push the threat overlay into its two pre-declared sources.
 *
 * A vector becomes TWO features — the shaft as a LineString and the head as a
 * Point carrying its bearing — because MapLibre has no way to put a symbol at
 * one end of a line. The layers filter on geometry type, so both live in one
 * source and one `setData`.
 */
function applyThreats(
  map: maplibregl.Map,
  zones: MapThreatZone[] | undefined,
  vectors: MapThreatVector[] | undefined,
): void {
  const zoneSource = map.getSource('threat-zones') as
    | maplibregl.GeoJSONSource
    | undefined
  if (zoneSource) {
    zoneSource.setData({
      type: 'FeatureCollection',
      features: (zones ?? [])
        .filter((z) => z.ring.length >= 3)
        .map((z) => ({
          type: 'Feature',
          properties: {
            id: z.id,
            color: threatToken(z.intensity),
            intensity: z.intensity,
            pattern: `threat-hatch-${z.intensity}`,
            emphasis: z.emphasis ?? false,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[...z.ring, z.ring[0]].map((v) => [v.lng, v.lat])],
          },
        })),
    })
  }

  const vectorSource = map.getSource('threat-vectors') as
    | maplibregl.GeoJSONSource
    | undefined
  if (!vectorSource) return
  const features = (vectors ?? []).flatMap((v) => {
    const props = {
      id: v.id,
      color: threatToken(v.intensity),
      intensity: v.intensity,
      emphasis: v.emphasis ?? false,
      bearing: bearingDeg(v.origin, v.target),
    }
    return [
      {
        type: 'Feature' as const,
        properties: props,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [v.origin.lng, v.origin.lat],
            [v.target.lng, v.target.lat],
          ],
        },
      },
      {
        type: 'Feature' as const,
        properties: props,
        geometry: {
          type: 'Point' as const,
          coordinates: [v.target.lng, v.target.lat],
        },
      },
    ]
  })
  vectorSource.setData({ type: 'FeatureCollection', features })
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
            satColor: p.satColor ?? p.color,
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
