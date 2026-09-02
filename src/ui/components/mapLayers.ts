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

/**
 * Which switches a map should OFFER, read off what it is about to draw. A
 * switch for pickup points on a map that has none is a switch that does
 * nothing, so the legend asks this before listing them.
 */
export function offeredLayers(input: {
  markers?: ReadonlyArray<{ kind?: string }>
  polygons?: ReadonlyArray<{ kind?: string }>
  threatZones?: ReadonlyArray<unknown>
  threatVectors?: ReadonlyArray<unknown>
}): MapLayerKey[] {
  const out = new Set<MapLayerKey>()
  for (const m of input.markers ?? []) {
    const layer = MARKER_LAYER[m.kind ?? 'farm']
    if (layer) out.add(layer)
  }
  for (const p of input.polygons ?? []) {
    if (p.kind === 'farm_boundary') out.add('boundaries')
    if (p.kind === 'grazing_area') out.add('grazing')
  }
  if ((input.threatZones?.length ?? 0) > 0) out.add('threatZones')
  if ((input.threatVectors?.length ?? 0) > 0) out.add('threatVectors')
  return MAP_LAYERS.filter((k) => out.has(k))
}
