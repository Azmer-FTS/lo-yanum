import { useCallback, useSyncExternalStore } from 'react'

/**
 * U4.3 (2026-09-02) — THE MAP'S LAYERS, SWITCHABLE ONE BY ONE, REMEMBERED.
 *
 * The product owner demonstrates the map one layer at a time: "here are the
 * boundaries; now the grazing; now the threats". Seven switches, in the
 * legend, each a checkbox; the set is ONE localStorage value shared by every
 * map in the app, so a layer hidden on the farms map is hidden on the farm's
 * own map too — the same rule as the folded blocks (U1).
 *
 * Applied in `MapCanvas`, which FILTERS what it is handed rather than asking
 * every screen to: polygons by their `kind`, markers by their `kind`, the two
 * threat collections whole.
 */
export type MapLayerKey =
  | 'boundaries'
  | 'grazing'
  | 'posts'
  | 'pickups'
  | 'threatZones'
  | 'threatVectors'
  | 'entities'

export const MAP_LAYERS: readonly MapLayerKey[] = [
  'entities',
  'boundaries',
  'grazing',
  'posts',
  'pickups',
  'threatZones',
  'threatVectors',
] as const

export type MapLayerVisibility = Record<MapLayerKey, boolean>

const STORAGE_KEY = 'lo-yanum:map-layers'

const ALL_ON: MapLayerVisibility = {
  entities: true,
  boundaries: true,
  grazing: true,
  posts: true,
  pickups: true,
  threatZones: true,
  threatVectors: true,
}

let current: MapLayerVisibility = read()
const listeners = new Set<() => void>()

function read(): MapLayerVisibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return ALL_ON
    const parsed = JSON.parse(raw) as Partial<MapLayerVisibility>
    return { ...ALL_ON, ...parsed }
  } catch {
    return ALL_ON
  }
}

export function getMapLayers(): MapLayerVisibility {
  return current
}

export function setMapLayer(key: MapLayerKey, on: boolean): void {
  current = { ...current, [key]: on }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // A remembered layer set is a convenience, not a requirement.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The live visibility set, and a setter — one store for every map. */
export function useMapLayers(): [MapLayerVisibility, (key: MapLayerKey, on: boolean) => void] {
  const value = useSyncExternalStore(subscribe, getMapLayers, getMapLayers)
  const set = useCallback((key: MapLayerKey, on: boolean) => setMapLayer(key, on), [])
  return [value, set]
}

/** Marker kinds each layer switch governs. */
export const MARKER_LAYER: Partial<Record<string, MapLayerKey>> = {
  farm: 'entities',
  moshav: 'entities',
  anchor: 'posts',
  car: 'pickups',
}

/*
 * ★ W5 (2026-09-02) — `offeredLayers` IS DELETED. Showing only the layers a
 *   given map happened to be drawing meant a different number of boxes per
 *   screen for ONE remembered set; see `MapLegend` for why that reads as a
 *   lie. Every legend lists all seven.
 */
