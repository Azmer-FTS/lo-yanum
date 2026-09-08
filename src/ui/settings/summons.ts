import { useSyncExternalStore } from 'react'

import { missingSummonsTokens } from '@core/index'

/**
 * ★★ AE4 (2026-09-08) — LE GABARIT DU SMS DE CONVOCATION, MODIFIABLE.
 *
 * ⚠️ ET IL EST VALIDÉ AVANT D'ÊTRE ENREGISTRÉ, ce qui est la moitié
 *    intéressante. Un gabarit libre est un gabarit dont on peut effacer le
 *    numéro du coordinateur sans s'en apercevoir — et le SMS partirait quand
 *    même, tous les jours, à tout le monde. `missingSummonsTokens` (@core) dit
 *    ce qui manque, `writeSummonsTemplate` REFUSE, et l'écran nomme les jetons
 *    perdus. C'est A128 : la complétude est structurelle, pas une relecture.
 *
 * ⚠️ LE DÉFAUT VIENT DE `he.json` ET NON D'ICI. @core ne porte pas de copie et
 *    /src/ui ne porte pas d'hébreu : le gabarit initial est une chaîne
 *    traduite, passée à `seedSummonsTemplate` au premier rendu de l'écran de
 *    réglages et de l'écran qui envoie. Tant que personne n'a rien modifié, la
 *    case est vide et la traduction fait foi — ce qui veut aussi dire qu'une
 *    reformulation du gabarit livré atteint tous ceux qui n'y ont pas touché.
 */

const KEY = 'lo-yanum:summons-template'

const listeners = new Set<() => void>()

let cache: string | null | undefined

function load(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** La surcharge du coordinateur, ou `null` s'il n'a rien modifié. */
export function readSummonsOverride(): string | null {
  if (cache === undefined) cache = load()
  return cache
}

/** Le gabarit en vigueur : la surcharge, sinon celui qui est livré. */
export function summonsTemplate(shipped: string): string {
  return readSummonsOverride() ?? shipped
}

export type SummonsSaveResult =
  | { ok: true }
  | { ok: false; missing: ReturnType<typeof missingSummonsTokens> }

export function writeSummonsTemplate(next: string): SummonsSaveResult {
  const missing = missingSummonsTokens(next)
  if (missing.length > 0) return { ok: false, missing }
  cache = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Navigation privée.
  }
  for (const l of listeners) l()
  return { ok: true }
}

/** Retour au gabarit livré : on efface la surcharge plutôt que de la recopier. */
export function resetSummonsTemplate(): void {
  cache = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Idem.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): string | null => readSummonsOverride()

export function useSummonsOverride(): string | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
