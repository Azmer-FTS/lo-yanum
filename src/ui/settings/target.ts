import { useSyncExternalStore } from 'react'

import { WEIGHTED_DUNAM_TARGET, localDayKey, now } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AB5a (2026-09-08) — « יעד » : L'OBJECTIF EST PILOTÉ PAR LE PO.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le PO a aimé la carte d'objectif du tableau de bord mais ne peut pas la
 *     piloter. Dans les réglages, une section « יעד » : valeur de l'objectif
 *     en dounams pondérés, date d'échéance, libellé. »
 *
 * ★ AB5a.4 — THE CONSTANT SURVIVES AS THE INITIAL VALUE. `WEIGHTED_DUNAM_TARGET`
 *   in `core/fields.ts` still carries the association's own figure from its
 *   מקרא sheet, with its origin written beside it, and a device that has never
 *   opened this section reads exactly that. What is stored here is an
 *   OVERRIDE; deleting it goes back to the constant, which is what makes the
 *   constant worth keeping rather than a value to be edited out.
 *
 * ⚠️ LOCAL, LIKE נקודת מוצא AND THE REPORT ADDRESS, AND FOR THE SAME REASONS:
 *    it must work with no network, and — until Lot 1 gives the programme a
 *    table of campaigns — it is one coordinator's statement about his own
 *    budget year rather than data other roles read. The same P3.3bis note
 *    applies: if a server ever owns campaigns, this becomes its cache.
 *
 * ★ AB5a.3 — AND IT KEEPS A HISTORY, because « le PO travaille par campagnes
 *   budgétaires ». A target that is replaced without trace turns "we did
 *   80 000 last year" into something nobody can answer. Each reached target is
 *   written down once, with the day it was reached and the total on that day.
 *
 * ⚠️ WHY THE HISTORY IS WRITTEN BY `settleTarget` AND NOT BY THE DASHBOARD'S
 *    RENDER. Reaching a target is an EVENT — it happens once, at a moment —
 *    and a card that appended a row every time it painted would fill the
 *    history with one entry per render. `settleTarget` is idempotent: it does
 *    nothing at all unless the current target has just been passed, and the
 *    dashboard calls it from an effect.
 */

const KEY = 'lo-yanum:target'

export interface Target {
  /** What this campaign is called — « יעד ספטמבר », « תקציב 2026 ». */
  label: string
  /** The figure, in weighted dunams. */
  dunams: number
  /** `YYYY-MM-DD`, or `''` when the campaign has no deadline. */
  dueOn: string
}

export interface ReachedTarget extends Target {
  /** The day it was passed, as a local day key. */
  reachedOn: string
  /** The weighted total on that day — which may be more than `dunams`. */
  total: number
}

/**
 * ★ AB5a.2 — WHAT HAPPENS WHEN IT IS REACHED, AND THE DEFAULT CONGRATULATES.
 *
 *   « garder l'objectif atteint affiché avec sa mention de réussite, ou passer
 *     automatiquement à un objectif suivant que le PO saisit. Par défaut, on
 *     garde et on félicite. »
 */
export type OnReached = 'keep' | 'next'

export interface TargetState {
  current: Target
  onReached: OnReached
  /** The campaign that takes over on `next`. Null until the PO types one. */
  next: Target | null
  /** Newest first. */
  history: ReachedTarget[]
}

/** The state a device has before anybody has touched this section. */
export function defaultTarget(): TargetState {
  return {
    current: { label: '', dunams: WEIGHTED_DUNAM_TARGET, dueOn: '' },
    onReached: 'keep',
    next: null,
    history: [],
  }
}

const readTarget = (raw: unknown): Target | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const t = raw as Partial<Target>
  const dunams = Number(t.dunams)
  if (!Number.isFinite(dunams) || dunams <= 0) return null
  return {
    label: String(t.label ?? ''),
    dunams: Math.round(dunams),
    dueOn: String(t.dueOn ?? ''),
  }
}

function read(): TargetState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultTarget()
    const parsed = JSON.parse(raw) as Partial<TargetState>
    const current = readTarget(parsed.current)
    return {
      current: current ?? defaultTarget().current,
      onReached: parsed.onReached === 'next' ? 'next' : 'keep',
      next: readTarget(parsed.next),
      history: Array.isArray(parsed.history)
        ? parsed.history
            .map((row) => {
              const base = readTarget(row)
              if (!base) return null
              const r = row as Partial<ReachedTarget>
              return {
                ...base,
                reachedOn: String(r.reachedOn ?? ''),
                total: Number(r.total) || base.dunams,
              }
            })
            .filter((r): r is ReachedTarget => r !== null)
        : [],
    }
  } catch {
    // Private browsing, or a value from an older shape.
    return defaultTarget()
  }
}

let current: TargetState = read()
const listeners = new Set<() => void>()

function publish(next: TargetState): void {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // The screen still works for this session; nothing worth failing over.
  }
  for (const l of listeners) l()
}

export function writeTarget(next: TargetState): void {
  publish(next)
}

/** Back to `WEIGHTED_DUNAM_TARGET` and an empty history. */
export function resetTarget(): void {
  publish(defaultTarget())
}

/**
 * ★ THE ONE PLACE A TARGET IS RETIRED. Call it with the live weighted total;
 *   it returns whether anything changed, so a caller can avoid a re-render.
 *
 * ⚠️ IT NEVER RETIRES A TARGET TWICE. The guard is the history's own head: a
 *    campaign already recorded as reached, with the same label and figure, is
 *    left alone whatever the total does afterwards. That is what makes it safe
 *    to call on every data change.
 */
export function settleTarget(total: number): boolean {
  const state = current
  if (total < state.current.dunams) return false
  const head = state.history[0]
  if (
    head &&
    head.label === state.current.label &&
    head.dunams === state.current.dunams
  ) {
    // Already recorded. `keep` stops here for ever, which is the default.
    return false
  }
  const reached: ReachedTarget = {
    ...state.current,
    reachedOn: localDayKey(now()),
    total: Math.round(total),
  }
  const history = [reached, ...state.history].slice(0, 24)
  if (state.onReached === 'next' && state.next) {
    publish({ ...state, current: state.next, next: null, history })
  } else {
    publish({ ...state, history })
  }
  return true
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): TargetState => current

export function useTarget(): TargetState {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Read once, outside React — for a report or a one-off computation. */
export function readTargetState(): TargetState {
  return current
}

/** Where a total stands against the live target, as a whole percentage. */
export function progressAgainst(total: number, target: Target): number {
  if (target.dunams <= 0) return 0
  return Math.round((total / target.dunams) * 100)
}

/**
 * Has the CURRENT campaign been passed? Read by the dashboard for the success
 * mention; `settleTarget` is what writes it down.
 */
export function isReached(total: number, target: Target): boolean {
  return total >= target.dunams
}
