import { useSyncExternalStore } from 'react'

import { missingDeclarationTokens } from '@core/index'

/**
 * ★★ AF1.4 (2026-09-09) — LE GABARIT DU הצהרה, MODIFIABLE DANS LES RÉGLAGES.
 *
 * Copie conforme de `settings/summons.ts`, et c'est voulu : deux gabarits qui
 * se règlent de deux façons différentes sont deux choses à réapprendre. Même
 * clé de forme, même validation avant écriture, même retour au noyau livré par
 * SUPPRESSION de la surcharge plutôt que par recopie — de sorte qu'une
 * reformulation du texte livré atteigne tous ceux qui n'y ont pas touché.
 *
 * ⚠️ ET LE REFUS EST LA MOITIÉ QUI COMPTE, comme pour le SMS. Un gabarit dont
 *    on a effacé `{{year}}` produit un document qui affirme une activité « en
 *    l'an » sans année : parfaitement lisible, parfaitement inutilisable, et
 *    personne ne s'en apercevrait avant que l'association refuse la pile.
 */
const KEY = 'lo-yanum:declaration-template'

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
export function readDeclarationOverride(): string | null {
  if (cache === undefined) cache = load()
  return cache
}

/** Le gabarit en vigueur : la surcharge, sinon celui qui est livré. */
export function declarationTemplate(shipped: string): string {
  return readDeclarationOverride() ?? shipped
}

export type DeclarationSaveResult =
  | { ok: true }
  | { ok: false; missing: ReturnType<typeof missingDeclarationTokens> }

export function writeDeclarationTemplate(next: string): DeclarationSaveResult {
  const missing = missingDeclarationTokens(next)
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

export function resetDeclarationTemplate(): void {
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

const snapshot = (): string | null => readDeclarationOverride()

export function useDeclarationOverride(): string | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
