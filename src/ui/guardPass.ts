import { useSyncExternalStore } from 'react'

import type { GuardPass } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE1.3 (2026-09-08) — CE QUE L'APPAREIL DU VOLONTAIRE GARDE, ET LA RAISON
 *    POUR LAQUELLE C'EST UNE CASE ET NON UNE LISTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Sur l'appareil du volontaire, ne conserver que le nécessaire : la garde
 *     en cours, la fiche de la ferme, les numéros. Rien d'historique. S'il
 *     désinstalle l'app, il ne perd rien de critique. »
 *
 * ★ UNE SEULE CLÉ, ET ELLE EST ÉCRASÉE. Le lien suivant remplace le
 *   précédent ; il n'y a pas d'accumulation à purger, pas de date de purge à
 *   régler, pas de tâche de nettoyage à ne pas oublier de lancer. « Rien
 *   d'historique » est la FORME de la case, pas une règle qu'on applique.
 *
 * ★ ET IL EST RELU AU DÉMARRAGE, CE QUI EST TOUT L'INTÉRÊT. Le volontaire
 *   ouvre le lien à 19:00 chez lui avec du réseau ; à 03:00 dans le champ il
 *   ouvre l'app depuis son écran d'accueil, sans données, et sa garde est là —
 *   avec le contour, les numéros et le code du portail. C'est le mode hors
 *   ligne d'AE2a.6 appliqué à tout le reste de l'écran.
 *
 * ⚠️ ET IL S'EFFACE TOUT SEUL À L'EXPIRATION. Le jeton porte sa date (AE1.2) ;
 *    un laissez-passer périmé n'est pas rendu et il est RETIRÉ du stockage à
 *    la première lecture qui le trouve périmé. Un téléphone perdu trois
 *    semaines plus tard ne porte plus le numéro d'un agriculteur.
 */

const KEY = 'lo-yanum:guard-pass'

const listeners = new Set<() => void>()

let cache: GuardPass | null | undefined

function load(): GuardPass | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GuardPass
    /* Une forme plus ancienne, ou un stockage abîmé : on se tait plutôt que de
       rendre un demi-laissez-passer à un écran qui va lire `farm.name`. */
    if (!parsed?.token || !parsed?.mission || !parsed?.farm) return null
    if (Date.now() > parsed.token.expiresAt) {
      clearGuardPass()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Le laissez-passer courant, ou `null`. Jamais périmé. */
export function readGuardPass(): GuardPass | null {
  if (cache === undefined) cache = load()
  return cache
}

export function writeGuardPass(pass: GuardPass): void {
  cache = pass
  try {
    localStorage.setItem(KEY, JSON.stringify(pass))
  } catch {
    /* Navigation privée : l'écran fonctionne pour cette session, il ne
       survivra pas à une fermeture. C'est dégradé, pas cassé. */
  }
  for (const l of listeners) l()
}

export function clearGuardPass(): void {
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

const snapshot = (): GuardPass | null => readGuardPass()

export function useGuardPass(): GuardPass | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * ★ CE QUI EST ÉCRIT SUR CE TÉLÉPHONE, ÉNUMÉRÉ.
 *
 * A119 pose la question à l'appareil et non au code : après avoir ouvert deux
 * liens de garde, quelles clés `lo-yanum:*` portent des données du programme ?
 * Cette fonction est ce que la porte interroge, et c'est aussi ce qui rend la
 * réponse lisible dans la console plutôt qu'un décompte.
 */
export const GUARD_PASS_KEY = KEY
