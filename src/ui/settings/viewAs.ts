import { useSyncExternalStore } from 'react'

import { presetToSession, setSession } from '@core/index'
import type { Role, SessionPreset } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ Y13 (2026-09-04) — "מצב תצוגה": THE COORDINATOR LOOKS THROUGH SOMEBODY
 *    ELSE'S SCREEN, AND COMES STRAIGHT BACK.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The product owner's request:
 *
 *   "Dans הגדרות, section 'מצב תצוגה' (visible uniquement pour le
 *    coordinateur) : basculer l'affichage en rôle fermier / volontaire /
 *    conducteur, avec sélection de l'entité ou de la personne à simuler, et
 *    retour immédiat au rôle coordinateur. Permet au PO de tester et de donner
 *    des retours sur les trois autres interfaces. Bandeau discret rappelant le
 *    rôle simulé."
 *
 * ⚠️ THIS IS NOT A PRIVILEGE ESCALATION, AND THE DIRECTION IS WHY. It only
 *    ever moves from the coordinator — who already sees every farm, every
 *    volunteer and every driver — to a role that sees LESS. There is nothing a
 *    simulated farmer can reach that the coordinator could not reach already,
 *    which is what makes a one-tap switch acceptable at all. The reverse would
 *    be a different feature and would need a different door.
 *
 * ⚠️ AND IT IS DEMO-MODE ONLY. `SUPABASE_CONFIGURED` builds get their session
 *    from Supabase auth, where the role is a claim on a token and this store
 *    would be a lie the UI tells itself while every read still went through
 *    the real identity. The section is not rendered there; see
 *    `ViewAsSection`.
 *
 * ★ WHAT IS REMEMBERED IS ONLY WHAT THE BANNER NEEDS TO SAY, plus the fact
 *   that a simulation is running. The SESSION itself stays where it always
 *   was — `@core/store` — so every accessor keeps filtering exactly as it does
 *   for a real farmer, which is the entire point of looking.
 */

const KEY = 'lo-yanum:view-as'

export interface ViewAs {
  role: Role
  /** The person being simulated, for the banner. */
  name: string
  /** Their farm / yeshiva / locality, so two people of a name are told apart. */
  detail: string
}

function read(): ViewAs | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ViewAs>
    if (!parsed.role || parsed.role === 'coordinator') return null
    return {
      role: parsed.role,
      name: String(parsed.name ?? ''),
      detail: String(parsed.detail ?? ''),
    }
  } catch {
    // Private browsing, or a value from an older shape. Not simulating.
    return null
  }
}

let current: ViewAs | null = read()
const listeners = new Set<() => void>()

function publish(next: ViewAs | null): void {
  current = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // The banner still works for this session; nothing worth failing over.
  }
  for (const l of listeners) l()
}

/** Step into a role. The session and the banner change together, or neither. */
export function viewAs(preset: SessionPreset): void {
  if (preset.role === 'coordinator') {
    stopViewAs()
    return
  }
  setSession(presetToSession(preset))
  publish({ role: preset.role, name: preset.name, detail: preset.detail })
}

/** ★ THE WAY BACK, and it is one call from anywhere — see the shell's banner. */
export function stopViewAs(): void {
  setSession({ role: 'coordinator', entityId: null })
  publish(null)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): ViewAs | null => current

export function useViewAs(): ViewAs | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
