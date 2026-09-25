import { useEffect, useSyncExternalStore } from 'react'

import type { IntakeRequest } from '@core/index'
import { SUPABASE_CONFIGURED } from '../../data/config'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AQ — CE QUE L'INTERFACE SAIT DES DEMANDES ENTRANTES, ET QUAND ELLE LE REDEMANDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LA CAUSE MESURÉE EN AQ0, ET CE N'ÉTAIT PAS LA VIGNETTE. Sur le bundle
 *    déployé, chargé à neuf avec la vraie ligne de la demande, la vignette
 *    « בקשות נכנסות » EST rendue aux trois largeurs. Mais l'application
 *    hydrate ses données UNE fois, à l'ouverture, et ne les redemande jamais :
 *    ni au retour en avant-plan, ni à intervalle. Or une PWA reprise ne
 *    navigue pas (AJ0.1) — l'app ouverte le matin montre encore le soir les
 *    fiches du matin. Une demande arrivée entre-temps n'existe pas pour elle,
 *    avec ou sans vignette. D'où `useForegroundRefresh` ci-dessous : au
 *    démarrage ET à chaque retour, l'app redemande (AQ2.1).
 *
 * ★ LE « DÉJÀ VU » VIT SUR L'APPAREIL (`localStorage`), ET C'EST VOULU. Il ne
 *   commande que la répétition du BANDEAU ; ce qui compte — la demande reste
 *   en tête tant qu'elle n'est pas traitée — est en base, dans le statut de
 *   la fiche. Perdre le « déjà vu » (navigation privée, données effacées) fait
 *   au pire réapparaître un bandeau une fois, jamais disparaître une demande.
 */

const SEEN_KEY = 'lo-yanum:intake:seen'
/** Un retour toutes les dix secondes au plus : iOS émet `focus`, `pageshow` et `visibilitychange` d'un coup. */
const MIN_INTERVAL_MS = 10_000

let requests: readonly IntakeRequest[] = []
let seen: ReadonlySet<string> = readSeen()
let version = 0
const listeners = new Set<() => void>()

function emit(): void {
  version++
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readSeen(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function getIntakeRequests(): readonly IntakeRequest[] {
  return requests
}

export function getSeenIntake(): ReadonlySet<string> {
  return seen
}

/** ★ AQ2.3 — le bandeau ne se répète pas pour ces fiches. Rien d'autre ne change. */
export function markIntakeSeen(farmIds: readonly string[]): void {
  if (farmIds.every((id) => seen.has(id))) return
  const next = new Set(seen)
  for (const id of farmIds) next.add(id)
  seen = next
  try {
    /* Borné : deux cents identifiants suffisent à des années de demandes. */
    localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-200)))
  } catch {
    /* Stockage refusé : le bandeau reviendra une fois, rien ne se perd. */
  }
  emit()
}

let inflight: Promise<void> | null = null
export function refreshIntake(): Promise<void> {
  if (!SUPABASE_CONFIGURED) return Promise.resolve()
  if (inflight) return inflight
  inflight = import('../../data/intake')
    .then((m) => m.loadIntakeRequests())
    .then((next) => {
      if (next) {
        requests = next
        emit()
      }
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function useIntakeRequests(): readonly IntakeRequest[] {
  useSyncExternalStore(subscribe, () => version)
  return requests
}

export function useSeenIntake(): ReadonlySet<string> {
  useSyncExternalStore(subscribe, () => version)
  return seen
}

/**
 * ★★ AQ2.1 — « AU DÉMARRAGE ET AU RETOUR EN AVANT-PLAN, L'APP VÉRIFIE S'IL Y A
 *    DU NEUF. »
 *
 * Au démarrage : les demandes seulement — le magasin hydrate déjà ses fiches
 * de lui-même. Au retour : les deux, et par le MÊME chemin que le « tirer pour
 * rafraîchir » (`refreshData`), qui vide la file d'attente avant de relire et
 * ne perd donc aucune modification en cours.
 */
export function useForegroundRefresh(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !SUPABASE_CONFIGURED) return
    let last = Date.now()
    void refreshIntake()
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - last < MIN_INTERVAL_MS) return
      last = Date.now()
      void import('../../data/store')
        .then((m) => m.refreshData())
        .catch(() => undefined)
      void refreshIntake()
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('pageshow', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('pageshow', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [enabled])
}
