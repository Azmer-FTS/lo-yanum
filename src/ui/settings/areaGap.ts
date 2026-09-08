import { useSyncExternalStore } from 'react'

import { AREA_GAP_THRESHOLD_INITIAL } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AD2.3 (2026-09-08) — LE SEUIL D'ÉCART, RÉGLABLE ET DOCUMENTÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le seuil de 10 % est une CONSTANTE NOMMÉE, réglable dans les réglages. »
 *
 * ★ MÊME FORME QU'AB5a POUR LE יעד ET QU'AC4.5 POUR LE SEUIL D'OUBLI, et pour
 *   la même raison : `AREA_GAP_THRESHOLD_INITIAL` reste dans @core avec le
 *   raisonnement à côté (voir `core/fields.ts` — pourquoi dix et pas trois),
 *   ce qui vit ici est la SURCHARGE de ce coordinateur, et « חזרה לערך
 *   ההתחלתי » revient à la constante. Modifier la constante change ce avec
 *   quoi un appareil neuf démarre, pas ce que le PO est en train de faire.
 *
 * ⚠️ STOCKÉ EN POURCENTAGE ENTIER, PAS EN FRACTION. Le champ demande « 10 » et
 *    non « 0,1 » : c'est ce que le coordinateur écrit, et une fraction dans un
 *    champ numérique est la façon la plus courte d'obtenir un seuil de 1000 %
 *    qui n'allume plus jamais rien.
 *
 * ⚠️ LOCAL, comme les deux autres : il doit marcher sans réseau, et c'est le
 *    jugement d'un coordinateur sur son propre programme.
 */

const KEY = 'lo-yanum:area-gap'

export interface AreaGapSettings {
  /** Écart au-delà duquel la note s'affiche, en POURCENTS entiers. */
  gapPercent: number
}

export function defaultAreaGap(): AreaGapSettings {
  return { gapPercent: Math.round(AREA_GAP_THRESHOLD_INITIAL * 100) }
}

function read(): AreaGapSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultAreaGap()
    const parsed = JSON.parse(raw) as Partial<AreaGapSettings>
    const pct = Number(parsed.gapPercent)
    /* Zéro allumerait la note sur le moindre dounam de différence, ce qui est
       la même chose que ne rien signaler du tout ; un négatif n'a pas de sens.
       Une valeur d'une forme plus ancienne se lit « jamais réglé ». */
    if (!Number.isFinite(pct) || pct <= 0) return defaultAreaGap()
    return { gapPercent: Math.round(pct) }
  } catch {
    return defaultAreaGap()
  }
}

let current: AreaGapSettings = read()
const listeners = new Set<() => void>()

function publish(next: AreaGapSettings): void {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Navigation privée ; l'écran fonctionne quand même pour cette session.
  }
  for (const l of listeners) l()
}

export function writeAreaGap(next: AreaGapSettings): void {
  publish(next)
}

/** Retour à `AREA_GAP_THRESHOLD_INITIAL`. */
export function resetAreaGap(): void {
  publish(defaultAreaGap())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): AreaGapSettings => current

export function useAreaGapSettings(): AreaGapSettings {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * Le seuil sous la forme que @core attend : une FRACTION. Un seul endroit
 * divise par cent, pour qu'aucun écran ne puisse comparer 33 à 0,1.
 */
export function useAreaGapThreshold(): number {
  return useAreaGapSettings().gapPercent / 100
}

/** Lu une fois, hors de React. */
export function readAreaGapSettings(): AreaGapSettings {
  return current
}
