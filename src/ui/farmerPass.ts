import { useSyncExternalStore } from 'react'

import { decodeFarmerToken, encodeFarmerToken } from '@core/index'
import type { FarmerToken } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG3.1 (2026-09-09) — CE QUI FAIT QUE L'ICÔNE DE L'ÉCRAN D'ACCUEIL OUVRE
 *    SON ESPACE, ET NON LA PAGE D'ACCUEIL DE TOUT LE MONDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LE PROBLÈME EST RÉEL ET IL EST DANS LE MANIFESTE. `manifest.webmanifest`
 *    déclare `start_url: "./"` — c'est-à-dire la RACINE — et c'est correct :
 *    l'application est une seule application, installée par le coordinateur
 *    comme par l'agriculteur, et un manifeste par personne est impossible sur
 *    un site statique. Conséquence directe : un agriculteur qui « ajoute à
 *    l'écran d'accueil » depuis `#/f/<jeton>` obtient une icône qui ouvre la
 *    racine et PERD son jeton au premier lancement. Il retrouverait alors la
 *    page d'accueil de démonstration, ou la porte de connexion — dans les deux
 *    cas, une application vide, ce qui est la définition d'une installation
 *    ratée.
 *
 * ★ LA CLÉ EST DONC SUR L'APPAREIL, ET LA RACINE LA RELIT. Exactement le
 *   mécanisme d'AE1.3 pour le laissez-passer de garde, avec deux différences
 *   que le brief impose :
 *
 *     · IL NE PÉRIME PAS. Le lien est permanent (voir `FarmerToken` dans
 *       core/invite.ts) : « ce n'est pas un guichet ouvert trois fois par an,
 *       c'est SON application ». Une icône qui cesse de fonctionner en février
 *       est une icône qu'on supprime.
 *     · IL NE PORTE QUE LE JETON. Le laissez-passer de garde emporte la nuit,
 *       les numéros et le contour parce qu'un volontaire est dans un champ
 *       sans réseau à trois heures du matin. L'agriculteur, lui, est chez lui
 *       et son espace est une VUE sur sa fiche : recopier la fiche ici en
 *       ferait une seconde copie à tenir à jour, et c'est elle qui serait
 *       fausse le jour où le coordinateur corrige un numéro.
 *
 * ⚠️ ET IL EST REMPLACÉ, JAMAIS ACCUMULÉ, comme le laissez-passer de garde :
 *    un iPad partagé entre deux agriculteurs porte le dernier lien ouvert, et
 *    la porte d'AG2 repose la question pour l'autre.
 */

const KEY = 'lo-yanum:farmer-pass'

const listeners = new Set<() => void>()
let cache: FarmerToken | null | undefined

function load(): FarmerToken | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    /* ⚠️ RELU PAR `decodeFarmerToken` ET NON PAR `JSON.parse`, ET LA RAISON EST
       CELLE D'AF3.3 : `localStorage` est éditable par n'importe qui avec les
       outils de développement, donc ce qu'on y trouve est une ENTRÉE et pas un
       état de confiance. Le faire passer par l'empreinte coûte une ligne. */
    const read = decodeFarmerToken(raw)
    return read.status === 'valid' ? read.token : null
  } catch {
    return null
  }
}

export function readFarmerPass(): FarmerToken | null {
  if (cache === undefined) cache = load()
  return cache
}

export function writeFarmerPass(token: FarmerToken): void {
  cache = token
  try {
    localStorage.setItem(KEY, encodeFarmerToken(token))
  } catch {
    /* Navigation privée : l'espace fonctionne pour cette session et l'icône ne
       le retrouvera pas. Dégradé, pas cassé. */
  }
  for (const l of listeners) l()
}

export function clearFarmerPass(): void {
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

const snapshot = (): FarmerToken | null => readFarmerPass()

export function useFarmerPass(): FarmerToken | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export const FARMER_PASS_KEY = KEY
