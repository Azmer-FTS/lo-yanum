import { useSyncExternalStore } from 'react'

import type { BasemapBase } from './basemap'

/**
 * WHICH GROUND THE MAP COMES UP ON — the stored preference, and the network
 * rule that filters it.
 *
 * ⚠️ `BaseSwitcher`, THE CONTROL, WAS HERE AND IS GONE (PO return
 *    2026-09-02). It was a two-button "מפה / לוויין" pair added at the map's
 *    top-left, and it was one of the FOUR independent owners of that corner
 *    that were laying controls on top of each other on his iPad. The ground
 *    switch is now one row of the single vertical stack in `MapTools`, which
 *    also carries its offline rules verbatim. What is left here is the part
 *    that was never about the widget: where the choice is remembered, and why
 *    it is read through `navigator.onLine`.
 */
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

export function writeStoredBase(base: BasemapBase): void {
  current = base
  try {
    localStorage.setItem(STORE_KEY, base)
  } catch {
    // Nothing to do and nothing worth failing a map over.
  }
  for (const l of listeners) l()
}

/**
 * ★ X3.4 (2026-09-04) — THE GROUND IS ALSO A REACT-READABLE VALUE NOW, and
 *   the reason is the attribution. MapLibre's own attribution control is gone
 *   (see `MapCanvas`): it lived at the map's physical bottom-right, which in
 *   this RTL app is where the legend lives, so the two sat on each other and
 *   the "i" ended up under the panel. The replacement is a React button beside
 *   the legend — and a React button has to know which ground is on screen to
 *   name its source. One tiny store, the same shape as `mapLayers.ts`.
 */
let current: BasemapBase = readStoredBase()
const listeners = new Set<() => void>()

const getBase = (): BasemapBase => current

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMapBase(): BasemapBase {
  return useSyncExternalStore(subscribe, getBase, getBase)
}
