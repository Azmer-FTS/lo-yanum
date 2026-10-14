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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BI (2026-10-15) — « SUR L'IPAD LA FORME EST LÀ, SUR L'ORDINATEUR ELLE
 *    N'APPARAÎT PAS ». CE RÉGLAGE ÉTAIT LE SEUL ÉTAT D'APPAREIL QUI LE FAIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rejoué sur le bundle DÉPLOYÉ, deux formes de 31 et 29 sommets en base : thème
 * sombre, satellite, carte pleine, 1 920 px — les deux anneaux sont dessinés.
 * `boundaries` / `grazing` à `false` dans CETTE clé : zéro anneau, et rien à
 * l'écran ne le disait (la légende est repliée par défaut ; AU1 avait mis une
 * pastille pour les FERMES cachées, pas pour les formes). Et la clé ne voyageait
 * pas (`LOCAL_ONLY_KEYS`), alors que le commentaire de BD 4 l'affirmait : le
 * motif du thème de BC, un réglage qui décide de l'affichage, vivant sur un
 * seul appareil, sans instant.
 *
 * ★ LA RÈGLE QUI EN DÉCOULE, ET QUE CE MODULE APPLIQUE : PAR DÉFAUT, ON MONTRE.
 *   1. Absente, illisible, d'une forme inconnue, une valeur non booléenne :
 *      la couche prend son défaut — et le défaut des formes est « montrées ».
 *   2. Une valeur écrite AVANT BI (sans `__v`) a ses couches de FORMES
 *      rallumées, une fois, au démarrage (`migrateMapLayers`) — elle avait été
 *      posée sans que rien ne la rappelle ensuite. La trace est gardée
 *      (`lo-yanum:map-layers-bi`) : le panneau de diagnostic dit si CET
 *      appareil les avait éteintes. Les autres couches restent ce qu'elles
 *      étaient.
 *   3. Depuis BI, la clé VOYAGE avec le compte (`SYNCED_SETTING_KEYS`), mais
 *      seulement une fois choisie (instant posé, `STAMPED_ONLY_KEYS`) : la
 *      valeur d'avant BI d'un appareil n'éteint pas l'autre.
 *   4. Une forme cachée par une couche SE VOIT sur la carte (MapCanvas,
 *      `map-hidden-zones`), avec le geste qui la rend.
 */
export const MAP_LAYERS_KEY = 'lo-yanum:map-layers'
const STORAGE_KEY = MAP_LAYERS_KEY
/** ★★ BI — la forme de la valeur ; sans elle, la valeur est d'avant BI. */
export const MAP_LAYERS_FORMAT = 2
/** ★★ BI — la trace de la réactivation : `{ at, restored: ['boundaries', …] }`. */
export const MAP_LAYERS_MIGRATION_KEY = 'lo-yanum:map-layers-bi'
/** ★★ BI — les couches qui décident si une FORME (contour, pâturage) est dessinée. */
export const ZONE_LAYERS: readonly MapLayerKey[] = ['boundaries', 'grazing']

export interface ParsedMapLayers {
  layers: MapLayerVisibility
  /** Une valeur existait, écrite avant BI (sans `__v`). */
  legacy: boolean
  /** Les couches de formes rallumées parce que la valeur était d'avant BI. */
  restored: MapLayerKey[]
}

/**
 * ★★ BI — LIRE LA VALEUR STOCKÉE, PURE (`bipass` la rejoue). Seules les clés
 * connues ET booléennes comptent ; tout le reste prend le défaut.
 */
export function parseMapLayers(raw: string | null): ParsedMapLayers {
  const layers: MapLayerVisibility = { ...DEFAULTS }
  if (raw === null) return { layers, legacy: false, restored: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { layers, legacy: false, restored: [] }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { layers, legacy: false, restored: [] }
  const obj = parsed as Record<string, unknown>
  for (const key of Object.keys(DEFAULTS) as MapLayerKey[]) {
    if (typeof obj[key] === 'boolean') layers[key] = obj[key] as boolean
  }
  const legacy = obj.__v !== MAP_LAYERS_FORMAT
  const restored: MapLayerKey[] = []
  if (legacy) {
    for (const key of ZONE_LAYERS) {
      if (layers[key] === false) {
        layers[key] = true
        restored.push(key)
      }
    }
  }
  return { layers, legacy, restored }
}

/** ★★ BI — la forme écrite, toujours datée de son format. */
export function serializeMapLayers(layers: MapLayerVisibility): string {
  return JSON.stringify({ __v: MAP_LAYERS_FORMAT, ...layers })
}

/**
 * ★★ BI — AU DÉMARRAGE, AVANT LA SYNCHRONISATION DES RÉGLAGES (main.tsx) :
 * une valeur d'avant BI est réécrite au format, couches de formes rallumées.
 * Écrite AVANT que `startSettingsSync` n'enveloppe `localStorage`, elle ne
 * reçoit pas d'instant : ce n'est pas un choix, elle ne voyage pas.
 */
export function migrateMapLayers(): ParsedMapLayers | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed = parseMapLayers(raw)
    if (!parsed.legacy) return parsed
    localStorage.setItem(STORAGE_KEY, serializeMapLayers(parsed.layers))
    if (parsed.restored.length > 0) {
      localStorage.setItem(MAP_LAYERS_MIGRATION_KEY, JSON.stringify({ at: Date.now(), restored: parsed.restored }))
    }
    current = parsed.layers
    for (const l of listeners) l()
    return parsed
  } catch {
    return null
  }
}

/** ★★ BI — ce que la réactivation a fait sur CET appareil, pour le diagnostic. */
export function mapLayersMigration(): { at: number; restored: MapLayerKey[] } | null {
  try {
    const raw = localStorage.getItem(MAP_LAYERS_MIGRATION_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { at?: unknown; restored?: unknown }
    return typeof v.at === 'number' && Array.isArray(v.restored) ? { at: v.at, restored: v.restored as MapLayerKey[] } : null
  } catch {
    return null
  }
}

const listeners = new Set<() => void>()
let current: MapLayerVisibility = read()

function read(): MapLayerVisibility {
  try {
    return parseMapLayers(localStorage.getItem(STORAGE_KEY)).layers
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * ★★ BI — UNE VALEUR ARRIVÉE D'UN AUTRE APPAREIL (la synchronisation l'a
 * écrite) : le cache est relu et les cartes ouvertes suivent, sans rechargement.
 */
export function reloadMapLayers(): void {
  current = read()
  for (const l of listeners) l()
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
    localStorage.setItem(STORAGE_KEY, serializeMapLayers(current))
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
