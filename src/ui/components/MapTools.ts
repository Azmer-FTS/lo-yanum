import maplibregl from 'maplibre-gl'
import type { IControl, Map as MapLibreMap } from 'maplibre-gl'

import type { BasemapBase } from './basemap'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PO RETURN, 2026-09-02 — ONE COMPACT VERTICAL STACK, AND NOTHING OVER
 * ANYTHING ELSE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ WHAT WAS WRONG, AND IT WAS A LAYOUT FACT RATHER THAN A TASTE. The map had
 *   FOUR independent things all claiming the top of the canvas:
 *
 *     · MapLibre's `NavigationControl`   — added at `top-left`
 *     · `BaseSwitcher` (מפה / לוויין)     — also added at `top-left`
 *     · `FullscreenToggle`               — a React overlay at `self-end`,
 *       which in an RTL document is the PHYSICAL LEFT, i.e. on top of the two
 *       above
 *     · and the zone-drawing toolbar     — a full-width wrapping row of five
 *       buttons across the same strip
 *
 *   Four owners, one corner, no arbitration. On an iPad the drawing buttons
 *   covered the zoom and the fullscreen button sat on the ground switch. That
 *   is exactly what the product owner reported, and no amount of `z-index`
 *   fixes a thing that has four parents.
 *
 * ★ SO THERE IS ONE OWNER NOW. Everything that must be reachable AT ALL TIMES
 *   — the ground switch, fullscreen, מיקומי and the zoom — is this control,
 *   in one column, icon-only, 44 px per target, with the label on
 *   `title`/`aria-label` (hover on a desktop, long-press on iPadOS). Everything
 *   that is CONTEXTUAL — the drawing tools — moved into the bottom bar that
 *   already appears while editing (see `AnchorMap`). Nothing floats free any
 *   more, so nothing can land on top of anything.
 *
 * ⚠️ `maplibregl-ctrl-group` IS DELIBERATELY NOT ON THIS ELEMENT, for the
 *    reason `BaseSwitcher` discovered the hard way: MapLibre's own stylesheet
 *    carries `.maplibregl-ctrl-group button { background: transparent;
 *    width: 29px; height: 29px }` — two class selectors, which beats every
 *    Tailwind utility. Wearing that class silently shrinks every button in
 *    here back to 29 px and erases the selected state.
 *
 * ⚠️ AND MAPLIBRE'S OWN `NavigationControl` AND `GeolocateControl` ARE NOT
 *    USED, for the same reason plus one more: their markup is theirs, so the
 *    Hebrew label, the 44 px target and the "מיקום אינו זמין" wording would
 *    all be fighting a stylesheet on every release.
 */
export interface MapToolsLabels {
  group: string
  vector: string
  satellite: string
  /** Why the ground switch is off. */
  satelliteOffline: string
  fullscreenEnter: string
  fullscreenExit: string
  locate: string
  locating: string
  locateDenied: string
  locateFailed: string
  zoomIn: string
  zoomOut: string
}

export interface MapToolsOptions {
  labels: MapToolsLabels
  /** The ground the map is currently on, and how to change it. */
  base: BasemapBase
  onBase: (next: BasemapBase) => void
  /** Omitted on maps whose host has no fullscreen mode (thumbnails). */
  fullscreen?: { active: boolean; onToggle: () => void }
  /** מיקומי — off on a map that is not the operator's own position. */
  locate?: boolean
}

/** 24×24 stroke paths, the same silhouettes as `Icon.tsx`. */
const PATHS: Record<string, string> = {
  layers:
    '<path d="m12 3 8.5 4.5L12 12 3.5 7.5z"/><path d="m4 12 8 4.2 8-4.2M4 16.3l8 4.2 8-4.2"/>',
  satellite:
    '<path d="m12 3 8.5 4.5L12 12 3.5 7.5z"/><path d="m4 12 8 4.2 8-4.2"/><circle cx="12" cy="7.5" r="1.6"/>',
  expand: '<path d="M9 4H4v5M15 20h5v-5M4 15v5h5M20 9V4h-5"/>',
  collapse: '<path d="M4 9h5V4M20 15h-5v5M9 20v-5H4M15 4v5h5"/>',
  /**
   * ★ A CROSSHAIR, NOT A PIN. A pin on this button would be the same
   *   silhouette the map already uses for "a point somebody placed"; the whole
   *   claim of this button is "where *I* am", which is a different idea and
   *   deserves a different shape.
   */
  locate:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
}

function icon(name: keyof typeof PATHS | string): string {
  return (
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`
  )
}

type LocateState = 'idle' | 'busy' | 'on' | 'denied' | 'failed'

export class MapTools implements IControl {
  private map: MapLibreMap | null = null
  private container: HTMLDivElement | null = null

  private baseButton: HTMLButtonElement | null = null
  private fullscreenButton: HTMLButtonElement | null = null
  private locateButton: HTMLButtonElement | null = null

  private base: BasemapBase
  private locateState: LocateState = 'idle'
  private meMarker: maplibregl.Marker | null = null
  private watchId: number | null = null

  private options: MapToolsOptions
  private readonly onConnectivity = (): void => this.applyConnectivity()

  constructor(options: MapToolsOptions) {
    this.options = options
    this.base = options.base
  }

  onAdd(map: MapLibreMap): HTMLElement {
    this.map = map
    const container = document.createElement('div')
    container.className =
      'maplibregl-ctrl flex flex-col overflow-hidden rounded-field ' +
      'divide-y divide-edge-subtle border border-edge-subtle ' +
      'bg-surface-overlay shadow-card'
    container.setAttribute('role', 'group')
    container.setAttribute('aria-label', this.options.labels.group)
    container.setAttribute('data-testid', 'map-tools')

    this.baseButton = this.button('map-tool-base', () => this.toggleBase())
    container.append(this.baseButton)

    if (this.options.fullscreen) {
      this.fullscreenButton = this.button('map-tool-fullscreen', () =>
        this.options.fullscreen?.onToggle(),
      )
      container.append(this.fullscreenButton)
    }

    if (this.options.locate) {
      this.locateButton = this.button('map-tool-locate', () => this.toggleLocate())
      container.append(this.locateButton)
    }

    const zoomIn = this.button('map-tool-zoom-in', () => map.zoomIn({ duration: 240 }))
    zoomIn.innerHTML = icon('plus')
    zoomIn.title = this.options.labels.zoomIn
    zoomIn.setAttribute('aria-label', this.options.labels.zoomIn)

    const zoomOut = this.button('map-tool-zoom-out', () => map.zoomOut({ duration: 240 }))
    zoomOut.innerHTML = icon('minus')
    zoomOut.title = this.options.labels.zoomOut
    zoomOut.setAttribute('aria-label', this.options.labels.zoomOut)

    container.append(zoomIn, zoomOut)

    this.container = container
    this.paint()
    this.applyConnectivity()
    window.addEventListener('online', this.onConnectivity)
    window.addEventListener('offline', this.onConnectivity)
    return container
  }

  onRemove(): void {
    window.removeEventListener('online', this.onConnectivity)
    window.removeEventListener('offline', this.onConnectivity)
    this.stopWatching()
    this.meMarker?.remove()
    this.meMarker = null
    this.container?.remove()
    this.container = null
    this.map = null
  }

  /**
   * Re-sync with the host after a React render — the fullscreen flag and the
   * ground can both change from outside this control.
   */
  update(next: Partial<MapToolsOptions>): void {
    this.options = { ...this.options, ...next }
    if (next.base !== undefined) this.base = next.base
    this.paint()
  }

  private button(testid: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.testid = testid
    // ★ 44 px, the app's floor everywhere else. MapLibre's own controls are
    //   29 px and this stack is driven with a thumb on an iPad in daylight.
    b.className =
      'flex h-11 w-11 items-center justify-center text-content-secondary ' +
      'transition-colors hover:bg-surface-high disabled:cursor-not-allowed ' +
      'disabled:opacity-45'
    b.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!b.disabled) onClick()
    })
    return b
  }

  private toggleBase(): void {
    const next: BasemapBase = this.base === 'vector' ? 'satellite' : 'vector'
    if (next === 'satellite' && !navigator.onLine) return
    this.base = next
    this.options.onBase(next)
    this.paint()
  }

  private paint(): void {
    const l = this.options.labels

    if (this.baseButton) {
      const satellite = this.base === 'satellite'
      // ★ THE ICON SHOWS THE CURRENT GROUND AND THE LABEL NAMES WHAT A TAP
      //   WOULD DO. Either alone is ambiguous on an icon-only control; the
      //   pair is what makes a single button honest.
      this.baseButton.innerHTML = icon(satellite ? 'satellite' : 'layers')
      const label = satellite ? l.vector : l.satellite
      this.baseButton.title = label
      this.baseButton.setAttribute('aria-label', label)
      this.baseButton.setAttribute('aria-pressed', String(satellite))
      this.baseButton.dataset.base = this.base
      this.baseButton.classList.toggle('bg-accent', satellite)
      this.baseButton.classList.toggle('text-content-on-accent', satellite)
    }

    if (this.fullscreenButton && this.options.fullscreen) {
      const active = this.options.fullscreen.active
      this.fullscreenButton.innerHTML = icon(active ? 'collapse' : 'expand')
      const label = active ? l.fullscreenExit : l.fullscreenEnter
      this.fullscreenButton.title = label
      this.fullscreenButton.setAttribute('aria-label', label)
      this.fullscreenButton.setAttribute('aria-pressed', String(active))
    }

    if (this.locateButton) {
      this.locateButton.innerHTML = icon('locate')
      const label =
        this.locateState === 'busy'
          ? l.locating
          : this.locateState === 'denied'
            ? l.locateDenied
            : this.locateState === 'failed'
              ? l.locateFailed
              : l.locate
      this.locateButton.title = label
      this.locateButton.setAttribute('aria-label', label)
      this.locateButton.setAttribute('aria-pressed', String(this.locateState === 'on'))
      this.locateButton.dataset.state = this.locateState
      this.locateButton.classList.toggle('animate-pulse', this.locateState === 'busy')
      this.locateButton.classList.toggle('bg-accent', this.locateState === 'on')
      this.locateButton.classList.toggle(
        'text-content-on-accent',
        this.locateState === 'on',
      )
      this.locateButton.classList.toggle(
        'text-status-danger-ink',
        this.locateState === 'denied' || this.locateState === 'failed',
      )
    }
  }

  /**
   * ★ THE ONE PLACE THE OFFLINE RULE LIVES, carried over from `BaseSwitcher`
   *   unchanged: the imagery is a remote raster service, so with no network it
   *   is not slower, it is nothing. A map already on satellite falls back to
   *   the national vector archive BY ITSELF rather than leaving the
   *   coordinator holding a black rectangle with his own markers floating on
   *   it.
   */
  private applyConnectivity(): void {
    const online = navigator.onLine
    // The fallback FIRST, so `paint()` below describes the ground the map is
    // actually on rather than the one it was on a line ago.
    if (!online && this.base === 'satellite') {
      this.base = 'vector'
      this.options.onBase('vector')
    }
    this.paint()
    if (this.baseButton) {
      // Offline the only thing this button could do is turn the imagery ON,
      // and that is the thing that cannot work. Disabled, with the reason
      // written on it — applied AFTER `paint()`, which sets the normal title.
      this.baseButton.disabled = !online
      if (!online) this.baseButton.title = this.options.labels.satelliteOffline
    }
  }

  // ---------------------------------------------------------------------
  // מיקומי
  // ---------------------------------------------------------------------

  /**
   * ⚠️ IT IS A TOGGLE, AND THE SECOND PRESS REALLY STOPS THE WATCH. A control
   *    that quietly keeps a GPS watch open after the operator has moved on is
   *    a battery bill on a device that has to last a night shift.
   */
  private toggleLocate(): void {
    if (this.locateState === 'on' || this.locateState === 'busy') {
      this.stopWatching()
      this.meMarker?.remove()
      this.meMarker = null
      this.locateState = 'idle'
      this.paint()
      return
    }

    if (!('geolocation' in navigator)) {
      this.locateState = 'failed'
      this.paint()
      return
    }

    this.locateState = 'busy'
    this.paint()

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.locateState = 'on'
        this.showPosition(position, true)
        this.startWatching()
        this.paint()
      },
      (error) => {
        // 1 is PERMISSION_DENIED. The two cases have different remedies, so
        // they get different words rather than one "location unavailable".
        this.locateState = error.code === 1 ? 'denied' : 'failed'
        this.paint()
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  }

  private startWatching(): void {
    if (this.watchId !== null) return
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.showPosition(position, false),
      () => {
        /* A lost fix while tracking is not worth a state change; the dot
           simply stops moving until the next one arrives. */
      },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
  }

  private stopWatching(): void {
    if (this.watchId === null) return
    navigator.geolocation.clearWatch(this.watchId)
    this.watchId = null
  }

  /**
   * ★ A DOM MARKER RATHER THAN A GEOJSON LAYER, and that is not a shortcut.
   *   Switching מפה ↔ לוויין is a `setStyle`, and `setStyle` throws away every
   *   source and layer the app added — a "you are here" dot that vanishes when
   *   the operator switches to imagery is worse than none. Markers are DOM
   *   siblings of the canvas and survive it untouched, which is the same
   *   reason every programme marker is one.
   */
  private showPosition(position: GeolocationPosition, recentre: boolean): void {
    const map = this.map
    if (!map) return
    const point: [number, number] = [
      position.coords.longitude,
      position.coords.latitude,
    ]

    if (!this.meMarker) {
      const el = document.createElement('div')
      el.dataset.testid = 'map-me'
      el.setAttribute('aria-label', this.options.labels.locate)
      el.className = 'relative flex h-4 w-4 items-center justify-center'
      el.innerHTML =
        '<span class="absolute inline-flex h-full w-full animate-ping rounded-pill ' +
        'bg-accent opacity-60"></span>' +
        '<span class="relative inline-flex h-3.5 w-3.5 rounded-pill bg-accent ' +
        'ring-2 ring-surface-overlay"></span>'
      this.meMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(point)
        .addTo(map)
    } else {
      this.meMarker.setLngLat(point)
    }

    if (recentre) {
      // ★ NEVER ZOOMS OUT. A coordinator at z16 on a farm who taps מיקומי wants
      //   to be centred, not pulled back to a national view.
      map.easeTo({ center: point, zoom: Math.max(map.getZoom(), 15), duration: 500 })
    }
  }
}
