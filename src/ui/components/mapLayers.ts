import { useCallback, useSyncExternalStore } from 'react'

import { FARM_BRANCHES } from '@core/index'
import type { FarmBranchKind } from '@core/index'

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
  /** X12.3 — the thirteen regional washes, with their names. */
  | 'regions'
  /**
   * X12.5 — the demonstration switch: a marker takes the colour of the region
   * it stands in instead of the colour of its own status. Useful while showing
   * the country to a room; never on while working, because status is what a
   * coordinator reads a marker for.
   */
  | 'regionColors'
  /**
   * ★★ BD 4 (2026-10-12) — COMPOSER SA CARTE. Les institutions et les
   * contacts à traiter, chacun sa couche, indépendante de celle des fermes
   * (`entities`, « חוות ») ; et deux replis : par NATURE dans les fermes
   * (`branch:*`, « sans nature » = `branch:none`), signées / les autres dans
   * les institutions (`inst:*`). Une ferme se voit si sa couche est allumée ET
   * si l'une de ses natures l'est (OU, comme le filtre de la liste).
   */
  | 'institutions'
  | 'leads'
  | `branch:${FarmBranchKind}`
  | 'branch:none'
  | 'inst:signed'
  | 'inst:other'

/** ★★ BD 4 — les replis, sous la couche qu'ils détaillent. */
export const BRANCH_LAYERS: readonly MapLayerKey[] = [...FARM_BRANCHES.map((k) => `branch:${k}` as MapLayerKey), 'branch:none']
export const INSTITUTION_LAYERS: readonly MapLayerKey[] = ['inst:signed', 'inst:other']
export const SUB_LAYERS: Partial<Record<MapLayerKey, readonly MapLayerKey[]>> = {
  entities: BRANCH_LAYERS,
  institutions: INSTITUTION_LAYERS,
}

export const MAP_LAYERS: readonly MapLayerKey[] = [
  'entities',
  'institutions',
  'leads',
  'boundaries',
  'grazing',
  'posts',
  'pickups',
  'threatZones',
  'threatVectors',
  'regions',
  'regionColors',
] as const

export type MapLayerVisibility = Record<MapLayerKey, boolean>

const STORAGE_KEY = 'lo-yanum:map-layers'

/**
 * ★ X2 (2026-09-04) — THE THREAT LAYERS START OFF, and that is not a taste.
 *   Until now the farms screen carried its own "שכבת איומים" pill whose
 *   remembered default was OFF, and the two legend checkboxes said ON — two
 *   controls disagreeing about one layer. The pill is deleted (see
 *   `FarmsListScreen`) and the checkboxes inherit its default: a hatched
 *   overlay across half the Negev is not what "where are my farms and how are
 *   they doing" is asking, and it is one tick away when it is.
 */
const DEFAULTS: MapLayerVisibility = {
  entities: true,
  /* ★★ BD 4 — « la vue la plus complète » : tout est allumé d'abord. */
  institutions: true,
  leads: true,
  ...(Object.fromEntries(BRANCH_LAYERS.map((k) => [k, true])) as Record<`branch:${FarmBranchKind}` | 'branch:none', boolean>),
  'inst:signed': true,
  'inst:other': true,
  boundaries: true,
  grazing: true,
  posts: true,
  pickups: true,
  threatZones: false,
  threatVectors: false,
  // X12.3 — off by default, on the product owner's own instruction: the
  // washes are for explaining the country, not for working in it.
  regions: false,
  regionColors: false,
}

let current: MapLayerVisibility = read()
const listeners = new Set<() => void>()

function read(): MapLayerVisibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<MapLayerVisibility>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

export function getMapLayers(): MapLayerVisibility {
  return current
}

export function setMapLayer(key: MapLayerKey, on: boolean): void {
  setMapLayers({ [key]: on })
}

/** ★★ BD 4 — plusieurs couches en un geste (« tout montrer », « seulement celle-ci »). */
export function setMapLayers(patch: Partial<MapLayerVisibility>): void {
  current = { ...current, ...patch }
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
  /* ★★ BD 4 */
  institution: 'institutions',
  lead: 'leads',
}

/**
 * ★★ BD 4 — UN MARQUEUR EST-IL MONTRÉ ? Sa couche allumée, et — s'il porte des
 * étiquettes de repli (`layerTags` : ses natures, ou signée / non) — l'une
 * d'elles allumée. Un marqueur sans couche (incident, origine…) l'est toujours.
 */
export function markerShown(m: { kind?: string; layerTags?: readonly string[] }, layers: MapLayerVisibility): boolean {
  const layer = MARKER_LAYER[m.kind ?? 'farm']
  if (layer && !layers[layer]) return false
  const tags = m.layerTags ?? []
  if (tags.length === 0) return true
  return tags.some((tag) => layers[tag as MapLayerKey] !== false)
}

/*
 * ★ W5 (2026-09-02) — `offeredLayers` IS DELETED. Showing only the layers a
 *   given map happened to be drawing meant a different number of boxes per
 *   screen for ONE remembered set; see `MapLegend` for why that reads as a
 *   lie. Every legend lists all seven.
 */
