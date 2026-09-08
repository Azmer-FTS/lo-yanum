import { useSyncExternalStore } from 'react'

import {
  ARRIVAL_GRACE_MINUTES_INITIAL,
  CHECKPOINT_INTERVAL_MINUTES_INITIAL,
  GUARD_CLOSE_GRACE_MINUTES_INITIAL,
} from '@core/index'
import type { VigilThresholds } from '@core/index'

/**
 * ★★ AE3.2 · AE3.3 (2026-09-08) — LES TROIS DÉLAIS, RÉGLABLES.
 *
 * Même forme qu'AB5a pour le יעד, qu'AC4.5 pour le seuil d'oubli et qu'AD2.3
 * pour l'écart de surface : les constantes NOMMÉES restent dans @core avec le
 * raisonnement à côté (core/vigil.ts — pourquoi deux heures et pas vingt
 * minutes), ce qui vit ici est la surcharge de ce coordinateur, et le bouton
 * de retour nomme la valeur à laquelle il revient.
 *
 * ⚠️ EN MINUTES ENTIÈRES, ce qui est l'unité dans laquelle le coordinateur
 *    pense la nuit. Une fraction d'heure dans un champ numérique est la façon
 *    la plus courte d'obtenir un délai de trente heures.
 */

const KEY = 'lo-yanum:vigil'

export function defaultVigil(): VigilThresholds {
  return {
    arrivalGraceMinutes: ARRIVAL_GRACE_MINUTES_INITIAL,
    checkpointIntervalMinutes: CHECKPOINT_INTERVAL_MINUTES_INITIAL,
    closeGraceMinutes: GUARD_CLOSE_GRACE_MINUTES_INITIAL,
  }
}

const positive = (v: unknown, fallback: number): number => {
  const n = Number(v)
  /* Zéro alerterait à l'instant de l'heure de début, c'est-à-dire sur chaque
     garde du programme, toutes les nuits — ce qui revient exactement à ne plus
     alerter du tout. Négatif n'a pas de sens. */
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
}

function read(): VigilThresholds {
  const d = defaultVigil()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return d
    const p = JSON.parse(raw) as Partial<VigilThresholds>
    return {
      arrivalGraceMinutes: positive(p.arrivalGraceMinutes, d.arrivalGraceMinutes),
      checkpointIntervalMinutes: positive(
        p.checkpointIntervalMinutes,
        d.checkpointIntervalMinutes,
      ),
      closeGraceMinutes: positive(p.closeGraceMinutes, d.closeGraceMinutes),
    }
  } catch {
    return d
  }
}

let current: VigilThresholds = read()
const listeners = new Set<() => void>()

function publish(next: VigilThresholds): void {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Navigation privée ; l'écran fonctionne pour cette session.
  }
  for (const l of listeners) l()
}

export function writeVigil(next: VigilThresholds): void {
  publish(next)
}

export function resetVigil(): void {
  publish(defaultVigil())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): VigilThresholds => current

export function useVigil(): VigilThresholds {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Lu une fois, hors de React. */
export function readVigil(): VigilThresholds {
  return current
}
