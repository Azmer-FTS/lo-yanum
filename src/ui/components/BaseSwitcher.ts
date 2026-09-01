import type { IControl, Map as MapLibreMap } from 'maplibre-gl'

import type { BasemapBase } from './basemap'

/**
 * PO REQUEST B, 2026-09-01 — THE "מפה / לוויין" GROUND SWITCH.
 *
 * ★ WHY IT IS A MAPLIBRE CONTROL AND NOT A REACT OVERLAY, and this is a
 *   structural decision rather than a preference. `MapCanvas` renders ONE
 *   element — the GL container — and 27 screens size and position it through
 *   the `className` they pass in. Wrapping it to hang an absolutely-positioned
 *   button off it would move that className onto a new parent and put every
 *   one of those layouts at risk for a two-button widget. A control is
 *   rendered by MapLibre INSIDE the container, in the same corner group as the
 *   zoom buttons it belongs next to, and the component's DOM contract does not
 *   change at all.
 *
 * ★ AND IT OWNS THE ONLINE QUESTION ITSELF. The imagery is a remote raster
 *   tile service: with no network it is not "slower", it is nothing at all,
 *   and the national vector archive on the device is the whole point of this
 *   application. So the control listens to `online`/`offline` directly rather
 *   than being told by a prop — it is the thing that has to be disabled, and a
 *   round trip through React to disable it is a window in which the
 *   coordinator can tap it and get a blank map on a farm track.
 *
 * ⚠️ GOING OFFLINE WHILE SATELLITE IS ON SWITCHES BACK, WITHOUT ASKING. The
 *    alternative is a coordinator who put the map in satellite mode in the
 *    yard, drove out of coverage, and is now holding a black rectangle with
 *    his own markers floating on it. The vector ground is held on the device
 *    precisely so that never happens, so the fallback is automatic and the
 *    button says why it is disabled.
 */
export interface BaseSwitcherLabels {
  /** Accessible name for the pair. */
  group: string
  vector: string
  satellite: string
  /** Tooltip when the imagery cannot be reached. */
  offlineHint: string
  /** Tooltip when it can. */
  onlineHint: string
}

const STORE_KEY = 'lo-yanum:map-base'

/**
 * The choice survives a reload, because it is a working preference and not a
 * mode: a coordinator who prefers imagery prefers it on the next screen too.
 *
 * ⚠️ IT IS READ THROUGH THE NETWORK STATE, ALWAYS. A device that was left in
 *    satellite mode and is opened with no coverage must come up on the vector
 *    ground, not on an empty raster source waiting for tiles that will not
 *    arrive.
 */
export function readStoredBase(): BasemapBase {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw === 'satellite' && navigator.onLine) return 'satellite'
  } catch {
    // Private browsing. The default is the right default.
  }
  return 'vector'
}

function writeStoredBase(base: BasemapBase): void {
  try {
    localStorage.setItem(STORE_KEY, base)
  } catch {
    // Nothing to do and nothing worth failing a map over.
  }
}

export class BaseSwitcher implements IControl {
  private container: HTMLDivElement | null = null
  private vectorButton: HTMLButtonElement | null = null
  private satelliteButton: HTMLButtonElement | null = null
  private base: BasemapBase
  private readonly labels: BaseSwitcherLabels
  private readonly onChange: (base: BasemapBase) => void
  private readonly onConnectivity = (): void => this.applyConnectivity()

  constructor(
    labels: BaseSwitcherLabels,
    base: BasemapBase,
    onChange: (base: BasemapBase) => void,
  ) {
    this.labels = labels
    this.base = base
    this.onChange = onChange
  }

  onAdd(_map: MapLibreMap): HTMLElement {
    const container = document.createElement('div')
    /**
     * ⚠️ `maplibregl-ctrl-group` IS DELIBERATELY NOT ON THIS ELEMENT, AND THE
     *    FIRST VERSION HAD IT. MapLibre's own stylesheet carries
     *    `.maplibregl-ctrl-group button { background-color: transparent;
     *    width: 29px; height: 29px }` — two class selectors, so it beats every
     *    Tailwind utility, which are one. The result was a pair of buttons
     *    that ignored both the 44 px tap target and the selected state
     *    entirely: on the capture, "מפה" and "לוויין" looked identical and
     *    nothing said which ground was live. `maplibregl-ctrl` alone is what
     *    positions the control in the corner group; the group class only
     *    supplies a look this control is replacing anyway.
     */
    container.className =
      'maplibregl-ctrl flex overflow-hidden rounded-field divide-x ' +
      'divide-edge-subtle border border-edge-subtle bg-surface-overlay ' +
      'text-caption shadow-card'
    container.setAttribute('role', 'group')
    container.setAttribute('aria-label', this.labels.group)
    container.setAttribute('data-testid', 'map-base-switcher')

    this.vectorButton = this.button('vector', this.labels.vector)
    this.satelliteButton = this.button('satellite', this.labels.satellite)
    container.append(this.vectorButton, this.satelliteButton)

    this.container = container
    this.applyConnectivity()
    window.addEventListener('online', this.onConnectivity)
    window.addEventListener('offline', this.onConnectivity)
    return container
  }

  onRemove(): void {
    window.removeEventListener('online', this.onConnectivity)
    window.removeEventListener('offline', this.onConnectivity)
    this.container?.remove()
    this.container = null
    this.vectorButton = null
    this.satelliteButton = null
  }

  /** Reflect a change decided elsewhere (the offline fallback, or a restore). */
  setBase(base: BasemapBase): void {
    this.base = base
    this.paint()
  }

  private button(value: BasemapBase, text: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    b.dataset.testid = `map-base-${value}`
    // ★ A REAL TAP TARGET. This sits on a map that is driven with a thumb on an
    //   iPad in daylight, and MapLibre's own 29 px control buttons are already
    //   the smallest thing the app ships. 44 px is the floor `bun run touch`
    //   enforces everywhere else and there is no reason for the map to be the
    //   exception.
    b.className =
      'min-h-[44px] min-w-[44px] px-4 font-medium leading-none transition-colors ' +
      'disabled:cursor-not-allowed disabled:opacity-45'
    b.addEventListener('click', () => {
      if (b.disabled || this.base === value) return
      this.base = value
      writeStoredBase(value)
      this.paint()
      this.onChange(value)
    })
    return b
  }

  private paint(): void {
    for (const [value, node] of [
      ['vector', this.vectorButton],
      ['satellite', this.satelliteButton],
    ] as [BasemapBase, HTMLButtonElement | null][]) {
      if (!node) continue
      const on = this.base === value
      node.setAttribute('aria-pressed', String(on))
      node.classList.toggle('bg-accent', on)
      node.classList.toggle('text-content-on-accent', on)
      node.classList.toggle('bg-surface-overlay', !on)
      node.classList.toggle('text-content-secondary', !on)
    }
  }

  /**
   * ★ THE ONE PLACE THE OFFLINE RULE LIVES. Called on add and on every
   *   connectivity event, so "disabled with a reason" and "fell back to the
   *   vector ground" can never disagree.
   */
  private applyConnectivity(): void {
    const online = navigator.onLine
    if (this.satelliteButton) {
      this.satelliteButton.disabled = !online
      this.satelliteButton.title = online
        ? this.labels.onlineHint
        : this.labels.offlineHint
    }
    if (!online && this.base === 'satellite') {
      this.base = 'vector'
      this.onChange('vector')
    }
    this.paint()
  }
}
