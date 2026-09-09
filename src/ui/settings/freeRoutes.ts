import { useSyncExternalStore } from 'react'

import { DEFAULT_VISIT_MINUTES, FREE_ROUTE_ORIGIN, newFreeRouteId } from '@core/index'
import type { FreeRoute } from '@core/index'

/**
 * ★★ AH9.6 (2026-09-09) — « L'ITINÉRAIRE S'ENREGISTRE ET SE REPREND. »
 *
 * ⚠️ SUR L'APPAREIL, ET C'EST DIT PLUTÔT QUE SUPPOSÉ. Un itinéraire libre ne
 *    porte AUCUNE ligne de la base : ses étapes sont des points collés depuis
 *    WhatsApp, pas des fiches. Le ranger dans le magasin obligerait à inventer
 *    une table pour des données qui n'existent que le temps d'une tournée. Il
 *    vit donc à côté des réglages du coordinateur — et il partage leur limite,
 *    qui est écrite en toutes lettres dans AH11.2 : un vidage de Safari les
 *    perd tous les deux.
 */
const KEY = 'lo-yanum:free-routes'

const listeners = new Set<() => void>()
let cache: FreeRoute[] | undefined
/** `useSyncExternalStore` exige une référence STABLE tant que rien n'a changé. */
let snapshot: FreeRoute[] = []

function load(): FreeRoute[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as FreeRoute[]) : []
  } catch {
    return []
  }
}

export function readFreeRoutes(): FreeRoute[] {
  if (cache === undefined) {
    cache = load()
    snapshot = cache
  }
  return snapshot
}

function write(next: FreeRoute[]): void {
  cache = next
  snapshot = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Navigation privée : la tournée vit le temps de l'onglet.
  }
  for (const l of listeners) l()
}

export function saveFreeRoute(route: FreeRoute): void {
  const next = readFreeRoutes().filter((r) => r.id !== route.id)
  write([{ ...route, updatedAt: new Date().toISOString() }, ...next])
}

export function deleteFreeRoute(id: string): void {
  write(readFreeRoutes().filter((r) => r.id !== id))
}

export function blankFreeRoute(name: string, originLabel: string): FreeRoute {
  return {
    id: newFreeRouteId(),
    name,
    dayKey: null,
    origin: FREE_ROUTE_ORIGIN,
    originLabel,
    departAt: '08:30',
    defaultVisitMinutes: DEFAULT_VISIT_MINUTES,
    stops: [],
    updatedAt: new Date().toISOString(),
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useFreeRoutes(): FreeRoute[] {
  return useSyncExternalStore(subscribe, readFreeRoutes, readFreeRoutes)
}
