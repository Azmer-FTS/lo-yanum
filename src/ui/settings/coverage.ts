import { useSyncExternalStore } from 'react'

import { NEGLECT_DAYS_INITIAL } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AC4.5 (2026-09-08) — LE SEUIL D'OUBLI, RÉGLABLE ET DOCUMENTÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Signal visuel sobre sur les fermes actives n'ayant reçu aucune garde
 *     depuis longtemps, ou aucune du tout. Seuil réglable dans les réglages,
 *     valeur initiale à décider et à documenter. »
 *
 * ★ THE VALUE IS THIRTY DAYS AND THE REASON IS IN `core/access.ts`, beside the
 *   constant, because that is where somebody changing it will be standing: the
 *   association reports monthly, so a farm that has gone a whole reporting
 *   month without a night is a farm that appears in that month's report having
 *   received nothing.
 *
 * ★ AND IT IS A NAMED INITIAL VALUE, NOT A DEFAULT TO BE EDITED OUT — the
 *   AB5a.4 shape exactly. `NEGLECT_DAYS_INITIAL` stays in @core with its
 *   reasoning; what lives here is the coordinator's OVERRIDE, and « חזרה לערך
 *   ההתחלתי » comes back to the constant.
 *
 * ⚠️ LOCAL, like נקודת מוצא and the יעד, and for the same reason: it must work
 *    with no network, and it is one coordinator's judgement about his own
 *    programme rather than data another role reads.
 */

const KEY = 'lo-yanum:coverage'

export interface CoverageSettings {
  /** Days without a guard after which an active farm is flagged. */
  neglectDays: number
}

export function defaultCoverage(): CoverageSettings {
  return { neglectDays: NEGLECT_DAYS_INITIAL }
}

function read(): CoverageSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultCoverage()
    const parsed = JSON.parse(raw) as Partial<CoverageSettings>
    const days = Number(parsed.neglectDays)
    /* A zero or a negative would flag the whole roster for ever; a value from
       an older shape reads as "never set". */
    if (!Number.isFinite(days) || days <= 0) return defaultCoverage()
    return { neglectDays: Math.round(days) }
  } catch {
    return defaultCoverage()
  }
}

let current: CoverageSettings = read()
const listeners = new Set<() => void>()

function publish(next: CoverageSettings): void {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private browsing; the screen still works for this session.
  }
  for (const l of listeners) l()
}

export function writeCoverage(next: CoverageSettings): void {
  publish(next)
}

/** Back to `NEGLECT_DAYS_INITIAL`. */
export function resetCoverage(): void {
  publish(defaultCoverage())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): CoverageSettings => current

export function useCoverageSettings(): CoverageSettings {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Read once, outside React. */
export function readCoverageSettings(): CoverageSettings {
  return current
}
