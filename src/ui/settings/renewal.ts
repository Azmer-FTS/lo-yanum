import { useSyncExternalStore } from 'react'

import { RENEWAL_WINDOW_DAYS_DEFAULT } from '@core/index'

/**
 * ★★ AG5.1 (2026-09-09) — LE DÉLAI DE RENOUVELLEMENT, RÉGLABLE, SUR CET
 *    APPAREIL.
 *
 *   « Soixante jours avant l'expiration — délai en constante nommée, réglable
 *     — l'agriculteur reçoit un SMS avec son lien. »
 *
 * ★ MÊME RAISONNEMENT QUE LE SEUIL D'OUBLI ET LES DÉLAIS DE VEILLE, écrit en
 *   entier dans `core/profile.ts` : c'est un réglage d'un coordinateur sur son
 *   iPad, pas une donnée du programme, il doit se lire SANS RÉSEAU au moment
 *   où l'écran des fermes compte sa file, et il survit à la remise à zéro de
 *   la base pour cette raison exacte (AF8).
 *
 * ★ ET LA VALEUR PAR DÉFAUT EST DANS @core, PAS ICI. Les portes sans
 *   navigateur interrogent `RENEWAL_WINDOW_DAYS_DEFAULT` ; ce fichier n'est
 *   que la surcharge que le PO a le droit de poser.
 */

const KEY = 'lo-yanum:renewal-window'

/** Bornes : moins d'une semaine ne laisse le temps de rien, un an est le cycle. */
export const RENEWAL_WINDOW_MIN = 7
export const RENEWAL_WINDOW_MAX = 365

export function renewalWindowDays(): number {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return RENEWAL_WINDOW_DAYS_DEFAULT
    const n = Number(raw)
    if (!Number.isFinite(n)) return RENEWAL_WINDOW_DAYS_DEFAULT
    return Math.min(RENEWAL_WINDOW_MAX, Math.max(RENEWAL_WINDOW_MIN, Math.round(n)))
  } catch {
    return RENEWAL_WINDOW_DAYS_DEFAULT
  }
}

export function writeRenewalWindowDays(days: number): void {
  try {
    localStorage.setItem(KEY, String(Math.round(days)))
  } catch {
    // Navigation privée : la valeur par défaut continue de servir.
  }
  for (const l of listeners) l()
}

/**
 * ★★ AG4.1 — LA PHOTO DE LA CARTE D'IDENTITÉ EST FACULTATIVE PAR DÉFAUT, ET
 *    C'EST UN RÉGLAGE ET NON UNE CONSTANTE.
 *
 *   « photo de la carte d'identité (FACULTATIVE par défaut, rendue obligatoire
 *     par un réglage que le PO active s'il le décide plus tard) »
 *
 * ⚠️ ET LE DÉFAUT EST « FACULTATIVE » DANS LE SENS FORT : c'est la règle qui
 *    gouverne toute la passe — « chaque champ ajouté est un abandon possible ».
 *    Demander à un agriculteur de soixante ans de photographier sa ת״ז avant
 *    de pouvoir signer, c'est le renvoyer chercher son portefeuille au milieu
 *    d'un formulaire, et un formulaire qu'on quitte n'est pas signé.
 */
const PHOTO_KEY = 'lo-yanum:require-id-photo'

export function requiresIdPhoto(): boolean {
  try {
    return localStorage.getItem(PHOTO_KEY) === '1'
  } catch {
    return false
  }
}

export function writeRequiresIdPhoto(required: boolean): void {
  try {
    if (required) localStorage.setItem(PHOTO_KEY, '1')
    else localStorage.removeItem(PHOTO_KEY)
  } catch {
    // Idem.
  }
  for (const l of listeners) l()
}

const listeners = new Set<() => void>()

export function subscribeRenewal(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * ★ LE DÉLAI, ABONNÉ PLUTÔT QUE LU UNE FOIS.
 *
 * ⚠️ `renewalWindowDays()` LU DANS UN CORPS DE COMPOSANT NE SUFFIT PAS, et
 *    c'est la même leçon que `useAreaGapThreshold` d'AD2.3. L'écran חוות
 *    compte sa file à chaque rendu ; sans abonnement, un coordinateur qui passe
 *    de 60 à 90 dans les réglages revient sur חוות et voit le MÊME nombre,
 *    jusqu'à ce qu'il navigue ailleurs et revienne. Il conclut que le réglage
 *    ne fait rien — ce qui est le pire résultat possible pour un réglage.
 */
export function useRenewalWindow(): number {
  return useSyncExternalStore(subscribeRenewal, renewalWindowDays, renewalWindowDays)
}

/** Idem pour l'exigence de la photo de carte. */
export function useRequiresIdPhoto(): boolean {
  return useSyncExternalStore(subscribeRenewal, requiresIdPhoto, requiresIdPhoto)
}
