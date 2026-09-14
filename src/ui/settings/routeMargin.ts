import { useSyncExternalStore } from 'react'

import { ROUTE_MARGIN_INITIAL } from '@core/index'

/**
 * ★★ AI3.2 (2026-09-14) — LA MARGE DES DURÉES DE ROULAGE.
 *
 * Un nombre, en pour cent, ajouté à chaque durée de roulage calculée par
 * l'itinéraire libre. La valeur initiale et sa raison sont à côté de la
 * constante, dans `core/freeRoute.ts` (`ROUTE_MARGIN_INITIAL`), parce que
 * c'est là que se tiendra celui qui la changera.
 *
 * ★ ELLE VOYAGE D'UN APPAREIL À L'AUTRE (`sync.ts`) : c'est un jugement du PO
 *   sur ses routes, pas un fait de l'appareil.
 */

const KEY = 'lo-yanum:route-margin'
export const ROUTE_MARGIN_MAX = 100

function read(): number {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return ROUTE_MARGIN_INITIAL
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0 || n > ROUTE_MARGIN_MAX) return ROUTE_MARGIN_INITIAL
    return Math.round(n)
  } catch {
    return ROUTE_MARGIN_INITIAL
  }
}

/* ⚠️ LU À LA PREMIÈRE DEMANDE, PAS À L'IMPORT : les réglages du compte sont
   restaurés avant le premier rendu (AH11.2), et un module lu à l'import
   garderait la valeur d'avant la restauration. */
let current: number | null = null
const listeners = new Set<() => void>()

export function writeRouteMargin(percent: number | null): void {
  current = percent === null ? ROUTE_MARGIN_INITIAL : Math.round(percent)
  try {
    if (percent === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(current))
  } catch {
    // Private browsing; the value still applies for this session.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): number => {
  if (current === null) current = read()
  return current
}

export function useRouteMargin(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
