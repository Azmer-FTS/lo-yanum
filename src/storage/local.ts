import { settingDef } from './registry'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ BJ — LE SEUL MODULE QUI TOUCHE `localStorage`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tout module de l'application lit et écrit un réglage par `readSetting` /
 * `writeSetting`, jamais par `localStorage` (`bun run bjguard` refuse le
 * contraire). Ce que cela garantit :
 *
 *   1. UNE CLÉ NON DÉCLARÉE DANS `registry.ts` N'EST NI LUE NI ÉCRITE — elle
 *      est REFUSÉE, et le refus est compté (`refusedSettings`, montré par le
 *      diagnostic). Plus de clé qui naît en douce sur un seul appareil.
 *   2. UNE VALEUR ILLISIBLE N'ARRIVE JAMAIS À L'ÉCRAN : le validateur du
 *      registre la remplace par le défaut, qui MONTRE.
 *   3. UN RÉGLAGE DE COMPTE ÉCRIT ICI PART VERS LE COMPTE SUR-LE-CHAMP :
 *      `account.ts` écoute `onSettingWritten` et met la valeur en file.
 *
 * ⚠️ Aucune de ces fonctions ne jette : navigation privée, stockage plein ou
 *    interdit → la lecture rend `null`, l'écriture rend `false`, et l'écran
 *    garde sa valeur en mémoire pour la session.
 */

export type WriteOrigin = 'local' | 'account'
type Listener = (key: string, value: string | null, origin: WriteOrigin) => void

const listeners = new Set<Listener>()
/** `account.ts` s'y abonne : une écriture LOCALE d'un réglage de compte part en file. */
export function onSettingWritten(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export interface Refusal {
  key: string
  op: 'read' | 'write'
  why: 'undeclared' | 'invalid'
  at: number
}
const refusals: Refusal[] = []
/** ★ Les accès refusés depuis l'ouverture de la page (diagnostic). */
export function refusedSettings(): readonly Refusal[] {
  return refusals
}
function refuse(key: string, op: Refusal['op'], why: Refusal['why']): void {
  if (refusals.length < 50) refusals.push({ key, op, why, at: Date.now() })
  if (typeof console !== 'undefined') console.error(`[réglages] ${op} refusé (${why}) : ${key}`)
}

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null
  } catch {
    return null
  }
}

/** La valeur brute rangée, sans validation (pour le diagnostic et la migration). */
export function peekSetting(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

/**
 * ★ LIRE UN RÉGLAGE. `null` = absent (le module applique son défaut, qui
 * montre). Une valeur que le validateur refuse rend le défaut du registre.
 */
export function readSetting(key: string): string | null {
  const def = settingDef(key)
  if (!def) {
    refuse(key, 'read', 'undeclared')
    return null
  }
  const raw = peekSetting(key)
  if (raw === null) return null
  return def.validate(raw) ? raw : def.fallback
}

/** Lire et décoder du JSON ; illisible → `null`. */
export function readSettingJson<T>(key: string): T | null {
  const raw = readSetting(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function rawWrite(key: string, value: string | null): boolean {
  const s = storage()
  if (!s) return false
  try {
    if (value === null) s.removeItem(key)
    else s.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * ★ ÉCRIRE UN RÉGLAGE. `null` = retour au défaut (un effacement voyage comme
 * un choix). Une clé non déclarée ou une valeur que le validateur refuse
 * n'est PAS écrite.
 */
export function writeSetting(key: string, value: string | null): boolean {
  const def = settingDef(key)
  if (!def) {
    refuse(key, 'write', 'undeclared')
    return false
  }
  if (value !== null && !def.validate(value)) {
    refuse(key, 'write', 'invalid')
    return false
  }
  const ok = rawWrite(key, value)
  for (const l of listeners) l(key, value, 'local')
  return ok
}

export function writeSettingJson(key: string, value: unknown): boolean {
  return writeSetting(key, value === null || value === undefined ? null : JSON.stringify(value))
}

/**
 * Réservé à `account.ts` : poser la valeur que le COMPTE porte. Elle n'est pas
 * remise en file (ce n'est pas un geste de cet appareil).
 */
export function applyAccountValue(key: string, value: string | null): boolean {
  const ok = rawWrite(key, value)
  for (const l of listeners) l(key, value, 'account')
  return ok
}

/** Réservé à `account.ts` et au diagnostic : la mémoire de synchronisation. */
export function writeDeviceRecord(key: string, value: unknown): void {
  if (!settingDef(key)) {
    refuse(key, 'write', 'undeclared')
    return
  }
  rawWrite(key, value === null ? null : JSON.stringify(value))
}

/** Toutes les clés que cet appareil porte (diagnostic, migration). */
export function storedKeys(): string[] {
  const s = storage()
  if (!s) return []
  const out: string[] = []
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k !== null) out.push(k)
    }
  } catch {
    /* stockage indisponible */
  }
  return out
}

/**
 * ★ L'ADAPTATEUR DE SESSION DE supabase-js. La bibliothèque écrit SES clés
 * (`lo-yanum:auth`, `…-code-verifier`, `…-user`) par ici, et non dans
 * `localStorage` directement : même une écriture tierce passe par le registre.
 */
export const authStorage = {
  getItem(key: string): string | null {
    if (!settingDef(key)) {
      refuse(key, 'read', 'undeclared')
      return null
    }
    return peekSetting(key)
  },
  setItem(key: string, value: string): void {
    if (!settingDef(key)) {
      refuse(key, 'write', 'undeclared')
      return
    }
    rawWrite(key, value)
  },
  removeItem(key: string): void {
    if (!settingDef(key)) return
    rawWrite(key, null)
  },
}
