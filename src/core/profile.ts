import { COORDINATOR } from './config'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * W7 (2026-09-02) — THE COORDINATOR'S OWN CARD, AND IT IS HIS TO EDIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `COORDINATOR` in `config.ts` is a frozen constant, and three things read
 * it: the rail's account block, the signature at the foot of every generated
 * WhatsApp / SMS message, and the number those messages tell a farmer to call
 * back. So the one identity the product owner cannot change is the one that
 * goes out under his name.
 *
 * ★ WHY LOCALSTORAGE AND NOT THE DATABASE — the same reasoning as the report
 *   recipient (`report/recipient.ts`), written out there in full: it is
 *   needed with NO NETWORK (the messages are composed standing in a field),
 *   and it is one person's own card on his own device rather than programme
 *   data. It is read synchronously because `outreach.ts` builds a message
 *   body in a pure function that cannot await anything.
 *
 * ⚠️ WHEN A SECOND COORDINATOR EXISTS this becomes a row on `app_users` and
 *    this module becomes its cache — the same note the recipient carries. A
 *    device-local identity is correct for one coordinator and wrong for two.
 *
 * The DEFAULT is the product owner himself; `config.ts` holds it, so there is
 * still exactly one place where the shipped name is written down.
 */
export interface CoordinatorProfile {
  name: string
  phone: string
  role: string
}

const KEY = 'lo-yanum:coordinator'

export const COORDINATOR_DEFAULT: CoordinatorProfile = {
  name: COORDINATOR.name,
  phone: COORDINATOR.phone,
  role: COORDINATOR.role,
}

/** The card as it stands. Never throws, never returns a blank field. */
export function readCoordinator(): CoordinatorProfile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return COORDINATOR_DEFAULT
    const parsed = JSON.parse(raw) as Partial<CoordinatorProfile>
    return {
      // A stored blank is a stored mistake: fall back field by field rather
      // than signing a message "‏ · 052-…" with an empty name.
      name: parsed.name?.trim() || COORDINATOR_DEFAULT.name,
      phone: parsed.phone?.trim() || COORDINATOR_DEFAULT.phone,
      role: parsed.role?.trim() || COORDINATOR_DEFAULT.role,
    }
  } catch {
    return COORDINATOR_DEFAULT
  }
}

export function writeCoordinator(next: CoordinatorProfile): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        name: next.name.trim(),
        phone: next.phone.trim(),
        role: next.role.trim(),
      }),
    )
  } catch {
    // Private browsing, or storage disabled. The default card still works.
  }
  for (const l of listeners) l()
}

/** Back to the shipped card. */
export function resetCoordinator(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Same.
  }
  for (const l of listeners) l()
}

// The rail's account block and the settings form are two views of one value,
// so a save in one repaints the other without a reload.
const listeners = new Set<() => void>()

export function subscribeCoordinator(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
