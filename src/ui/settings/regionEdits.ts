import { defaultRing, modelForRing, notifyDerivedChange, regionRings, setRegionRings } from '@core/index'
import type { LatLng, PathModel, RegionId } from '@core/index'
import { readSetting, writeSetting } from '../../storage/local'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ Y2 (2026-09-06) — WHERE THE REDRAWN BOUNDARIES LIVE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `core/regions.ts` holds the overlay in memory and stays pure; this is the
 * half that remembers it. One key, one JSON object of `RegionId → ring`.
 *
 * ★ WHY `localStorage` AND NOT THE STORE. The outlines are not a row: they
 *   describe how the association reads its own country, they are the same on
 *   every screen and for every user of this device (★★★ BJ — this said « of
 *   this device » while the key had travelled with the account since AH11.2;
 *   it is an `account` entry of `storage/registry.ts`), and the demo backend
 *   persists nothing at all. A store mutation would also mean a Supabase
 *   column, an RLS policy and a migration for something that is, today,
 *   thirteen arrays. When the boundaries become an association-wide setting
 *   rather than this coordinator's, `load()` and `save()` are the two
 *   functions that change and nothing else is.
 *
 * ⚠️ A STORED VALUE IS UNTRUSTED. It can be from an older build, hand-edited,
 *    or half-written by a tab that was closed. Anything that is not an array
 *    of at least three `[lng, lat]` pairs of finite numbers is dropped for
 *    that region — which falls back to X12's own outline rather than to a
 *    region that contains nothing and silently empties every filter.
 */
const KEY = 'lo-yanum:region-rings'
/** ★★ BK — les tracés éditables (nœuds, poignées) des régions redessinées. */
const PATHS_KEY = 'lo-yanum:region-paths'

type Ring = Array<[number, number]>

function sane(value: unknown): Ring | null {
  if (!Array.isArray(value) || value.length < 3) return null
  const ring: Ring = []
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2) return null
    const [lng, lat] = point
    if (typeof lng !== 'number' || typeof lat !== 'number') return null
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null
    ring.push([lng, lat])
  }
  return ring
}

function read(): Partial<Record<RegionId, Ring>> {
  try {
    const raw = readSetting(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Record<RegionId, Ring>> = {}
    for (const [id, value] of Object.entries(parsed)) {
      const ring = sane(value)
      if (ring) out[id as RegionId] = ring
    }
    return out
  } catch {
    return {}
  }
}

function write(next: Partial<Record<RegionId, Ring>>): void {
  try {
    if (Object.keys(next).length === 0) writeSetting(KEY, null)
    else writeSetting(KEY, JSON.stringify(next))
  } catch {
    // A full or blocked storage must not lose the edit that is on screen; it
    // is applied either way and simply does not survive a reload.
  }
}

/**
 * Called once, before the first render. Every derived read — a farm's region,
 * a volunteer's region, the dunam distribution, the washes — goes through
 * `regions()`, so this is the only place the app has to remember to do.
 */
export function loadRegionEdits(): void {
  setRegionRings(read())
}

/** The ring as it stands for editing: the edit if there is one, else X12's. */
export function ringOf(id: RegionId): LatLng[] {
  const stored = regionRings()[id] ?? defaultRing(id) ?? []
  return stored.map(([lng, lat]) => ({ lat, lng }))
}

/**
 * Save one region's outline and re-file everything that hangs off it.
 *
 * ⚠️ `notifyDerivedChange` IS THE HALF THAT IS EASY TO FORGET, and without it
 *    the brief's point 5 is unimplemented: not one farm has changed, so the
 *    store has nothing to announce, and every list would go on showing the
 *    regions it computed under the old outlines until something else happened
 *    to bump the version. One call, and every `useCoreValue` selector re-runs
 *    through the new boundaries.
 */
export function saveRegionRing(id: RegionId, ring: LatLng[]): void {
  const next = regionRings()
  next[id] = ring.map((p) => [p.lng, p.lat] as [number, number])
  setRegionRings(next)
  write(next)
  notifyDerivedChange()
}

/** "שחזר ברירת מחדל" — delete the edit; the literal in `regions.ts` returns. */
export function resetRegionRing(id: RegionId): void {
  const paths = readPaths()
  if (id in paths) {
    delete paths[id]
    writePaths(paths)
  }
  const next = regionRings()
  delete next[id]
  setRegionRings(next)
  write(next)
  notifyDerivedChange()
}

// ---------------------------------------------------------------------------
// ★★ BK — LE TRACÉ ÉDITABLE D'UNE RÉGION
// ---------------------------------------------------------------------------

function readPaths(): Record<string, unknown> {
  try {
    const raw = readSetting(PATHS_KEY)
    if (!raw) return {}
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function writePaths(next: Record<string, unknown>): void {
  try {
    writeSetting(PATHS_KEY, Object.keys(next).length === 0 ? null : JSON.stringify(next))
  } catch {
    /* Le tracé n'est pas perdu à l'écran ; il se reprendra en coins au prochain chargement. */
  }
}

/**
 * Le tracé à éditer pour une région : son modèle enregistré s'il redonne
 * exactement l'anneau en vigueur, sinon l'anneau repris en coins.
 */
export function pathOf(id: RegionId): PathModel {
  return modelForRing(ringOf(id), readPaths()[id]).model
}

/** Enregistrer une région redessinée : l'anneau (ce que tout le reste lit) ET son tracé. */
export function saveRegionPath(id: RegionId, ring: LatLng[], model: PathModel): void {
  saveRegionPaths([{ id, ring, model }])
}

/**
 * ★★ BL — PLUSIEURS régions d'un coup : la région éditée ET les voisines que
 * son geste a poussées (3.4), ou les perdants d'une résolution de
 * recouvrements (3.3). UNE écriture de chaque clé, UNE annonce : jamais un
 * état intermédiaire où la région est enregistrée et pas sa voisine.
 */
export function saveRegionPaths(list: ReadonlyArray<{ id: RegionId; ring: LatLng[]; model: PathModel }>): void {
  if (list.length === 0) return
  const paths = readPaths()
  const next = regionRings()
  for (const { id, ring, model } of list) {
    paths[id] = model
    next[id] = ring.map((p) => [p.lng, p.lat] as [number, number])
  }
  writePaths(paths)
  setRegionRings(next)
  write(next)
  notifyDerivedChange()
}
