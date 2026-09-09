import { useSyncExternalStore } from 'react'

import { challengeStatus } from '@core/index'
import type { ChallengeStatus } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG2.2 · AG2.3 (2026-09-09) — CE QUE L'APPAREIL RETIENT DE LA QUESTION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Saisie mémorisée sur l'appareil : on ne la redemande pas à chaque
 *     ouverture. Durée en constante nommée. »
 *
 * ★ QUATRE-VINGT-DIX JOURS, ET LE NOMBRE A UNE RAISON. Un agriculteur ouvre
 *   son espace à chaque garde — quelques fois par mois en saison, et pas du
 *   tout entre deux campagnes. Une mémoire de sept jours reposerait la
 *   question à presque chaque visite, ce qui reviendrait à ne rien mémoriser.
 *   Une mémoire éternelle ferait d'un téléphone revendu une porte ouverte pour
 *   toujours. Un trimestre est la durée après laquelle « c'est encore le même
 *   téléphone » cesse d'être une évidence.
 *
 * ⚠️ ET C'EST PAR PERSONNE, PAS PAR APPAREIL. La clé porte l'id de la fiche :
 *    un iPad partagé entre deux agriculteurs pose la question à chacun. Un
 *    drapeau global « cet appareil est de confiance » aurait ouvert le second
 *    espace à quelqu'un qui n'a jamais répondu pour lui.
 *
 * ★ LES ÉCHECS SONT COMPTÉS AU MÊME ENDROIT ET SURVIVENT AU RECHARGEMENT,
 *   parce que recharger la page est le premier réflexe de qui veut échapper à
 *   une attente. Voir `challengeWaitMs` dans @core : l'attente est une
 *   soustraction de dates, jamais un minuteur en mémoire.
 */

export const CHALLENGE_MEMORY_DAYS = 90
export const CHALLENGE_MEMORY_MS = CHALLENGE_MEMORY_DAYS * 86_400_000

const KEY = 'lo-yanum:link-unlock'

interface Entry {
  unlockedAt: number | null
  failures: number
  lastFailureAt: number
}

type Book = Record<string, Entry>

const EMPTY: Entry = { unlockedAt: null, failures: 0, lastFailureAt: 0 }

const listeners = new Set<() => void>()
let cache: Book | undefined

function load(): Book {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Book = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Partial<Entry>
      out[id] = {
        unlockedAt: typeof v.unlockedAt === 'number' ? v.unlockedAt : null,
        failures: Number(v.failures) || 0,
        lastFailureAt: Number(v.lastFailureAt) || 0,
      }
    }
    return out
  } catch {
    /* Navigation privée, ou une forme plus ancienne. La question est reposée,
       ce qui est le comportement sûr : jamais l'inverse. */
    return {}
  }
}

function book(): Book {
  if (cache === undefined) cache = load()
  return cache
}

function save(next: Book): void {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* L'appareil refuse le stockage : la porte fonctionne pour cette session
       et reposera la question à la prochaine. Dégradé, pas cassé. */
  }
  for (const l of listeners) l()
}

export function challengeEntry(personId: string): Entry {
  return book()[personId] ?? EMPTY
}

/** Une réponse juste : la mémoire est posée et le compteur d'échecs remis à zéro. */
export function rememberUnlock(personId: string, at: number = Date.now()): void {
  save({ ...book(), [personId]: { unlockedAt: at, failures: 0, lastFailureAt: 0 } })
}

/** Une réponse fausse : le compteur monte, l'attente suit (voir @core). */
export function recordFailure(personId: string, at: number = Date.now()): void {
  const current = challengeEntry(personId)
  save({
    ...book(),
    [personId]: {
      unlockedAt: null,
      failures: current.failures + 1,
      lastFailureAt: at,
    },
  })
}

/** Oublier ce qu'on sait d'une personne — utilisé par les portes et les réglages. */
export function forgetUnlock(personId: string): void {
  const next = { ...book() }
  delete next[personId]
  save(next)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * L'état de la porte pour une personne, recalculé à chaque rendu.
 *
 * ⚠️ `Date.now()` EST LU ICI ET NON DANS @core, ce qui est la règle de tout le
 *    programme : le calcul est pur et testable au 30 décembre, l'horloge est
 *    lue au bord.
 */
export function useChallenge(personId: string, phone: string): ChallengeStatus {
  const entry = useSyncExternalStore(
    subscribe,
    () => challengeEntry(personId),
    () => challengeEntry(personId),
  )
  return challengeStatus({
    phone,
    unlockedAt: entry.unlockedAt,
    failures: entry.failures,
    lastFailureAt: entry.lastFailureAt,
    at: Date.now(),
    memoryMs: CHALLENGE_MEMORY_MS,
  })
}

/** Ce que la porte A142 interroge, pour que la réponse soit lisible. */
export const CHALLENGE_KEY = KEY
