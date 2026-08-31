import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'
import { clearSignedUrlCache } from './storage'

/**
 * THE SESSION, AS THE APP SEES IT (P2.3).
 *
 * A tiny observable in the shape `useSyncExternalStore` wants, deliberately
 * mirroring `@core/store`'s subscribe/snapshot pair so the UI has one habit
 * rather than two. No React here — this file is as plain as `src/core` is.
 */

export type AuthStatus =
  /** The build is not pointed at Supabase: demo mode, no gate, no login. */
  | 'disabled'
  /** Supabase is answering "is there a stored session?" — a frame or two. */
  | 'loading'
  | 'signed-out'
  | 'signed-in'

export interface AuthState {
  status: AuthStatus
  email: string | null
  userId: string | null
  /**
   * P2.5b — SIGNED IN ON A SESSION THAT CANNOT CURRENTLY BE PROVED.
   *
   * True when the token could not be refreshed AND the device is offline AND
   * the last thing that happened was a real sign-in that was never signed out
   * of. The app runs from its cache; writes go to the outbox. It goes false by
   * itself the moment the network comes back and the refresh succeeds.
   */
  stale: boolean
}

/**
 * Why a sign-in failed, in terms the UI can translate.
 *
 * `credentials` is deliberately ONE code for a wrong address and a wrong
 * password: telling them apart tells an attacker which addresses exist.
 */
export type SignInError = 'credentials' | 'unconfirmed' | 'rate-limit' | 'network'

const SIGNED_OUT: AuthState = {
  status: 'signed-out',
  email: null,
  userId: null,
  stale: false,
}

let state: AuthState = SUPABASE_CONFIGURED
  ? { status: 'loading', email: null, userId: null, stale: false }
  : { status: 'disabled', email: null, userId: null, stale: false }

const listeners = new Set<() => void>()

/**
 * P2.5b — THE LAST SIGN-IN THAT WAS NEVER SIGNED OUT OF.
 *
 * ★ THE PROBLEM THIS SOLVES IS THE ONE THAT ENDS A NIGHT. The access token is
 *   short-lived by design and is refreshed against Supabase; a coordinator on a
 *   farm track at 02:00 has no network, the refresh cannot happen, and the
 *   library's honest answer — "there is no valid session" — puts a LOGIN FORM
 *   in front of the one person who cannot reach a login server. Every guard,
 *   every phone number and every anchor-point description on that device is
 *   two taps away in IndexedDB and unreachable.
 *
 *   So the app remembers WHO was signed in, keeps rendering for them while the
 *   device is offline, and re-proves it silently the moment the network
 *   returns. What is stored is an identity, never a credential: an id and an
 *   address, both of which the shell already displays. The tokens stay where
 *   supabase-js put them.
 *
 * ★ AND AN EXPLICIT SIGN-OUT CLEARS THIS AND THE DATA CACHE, WHILE AN
 *   INVOLUNTARY EXPIRY CLEARS NEITHER. That asymmetry IS the security model of
 *   this feature and it has to be stated: "I have finished with this iPad"
 *   must leave nothing behind for the next person, and "I drove into a wadi"
 *   must leave everything.
 */
const LAST_SESSION_KEY = 'lo-yanum:last-session'

interface LastSession {
  userId: string
  email: string | null
}

function readLastSession(): LastSession | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastSession>
    return typeof parsed.userId === 'string'
      ? { userId: parsed.userId, email: parsed.email ?? null }
      : null
  } catch {
    return null
  }
}

function writeLastSession(value: LastSession | null): void {
  try {
    if (value === null) localStorage.removeItem(LAST_SESSION_KEY)
    else localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(value))
  } catch {
    // A browser refusing storage is a browser that cannot survive offline.
    // It can still sign in, which is the part that must not break.
  }
}

const isOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * What to publish when Supabase says there is no session.
 *
 * Online, that is the truth and it is a sign-out. Offline, with a remembered
 * identity, it is very probably a refresh that could not happen — so the app
 * keeps going, marked `stale`, and asks again on reconnection.
 */
function resolveSignedOut(): AuthState {
  const last = readLastSession()
  if (last === null || !isOffline()) return SIGNED_OUT
  return { status: 'signed-in', email: last.email, userId: last.userId, stale: true }
}

/** Cleared by an explicit sign-out and by nothing else. See the note above. */
const signOutHandlers = new Set<() => void | Promise<void>>()

export function onSignOut(handler: () => void | Promise<void>): () => void {
  signOutHandlers.add(handler)
  return () => {
    signOutHandlers.delete(handler)
  }
}

function publish(next: AuthState): void {
  // Reference equality is the snapshot contract: emitting a fresh object with
  // identical fields would re-render every subscriber on every token refresh,
  // and the token refreshes on a timer.
  if (
    next.status === state.status &&
    next.email === state.email &&
    next.userId === state.userId &&
    next.stale === state.stale
  ) {
    return
  }
  state = next
  for (const listener of listeners) listener()
}

export function getAuthState(): AuthState {
  return state
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (SUPABASE_CONFIGURED) {
  // Fetch the client chunk immediately: in a real build nothing can render
  // until we know whether there is a stored session, so `loading` lasts
  // exactly as long as this takes and not a frame longer.
  void getSupabase().then((client) => {
    if (!client) {
      publish(resolveSignedOut())
      return
    }

    const settle = (user: { id: string; email?: string } | undefined): void => {
      if (!user) {
        publish(resolveSignedOut())
        return
      }
      writeLastSession({ userId: user.id, email: user.email ?? null })
      publish({
        status: 'signed-in',
        email: user.email ?? null,
        userId: user.id,
        stale: false,
      })
    }

    // `getSession` reads localStorage and refreshes an expired token before
    // answering, so this settles `loading` exactly once. Offline it settles it
    // from the remembered identity instead of onto a login form.
    void client.auth
      .getSession()
      .then(({ data }) => {
        settle(data.session?.user)
      })
      .catch(() => {
        publish(resolveSignedOut())
      })

    // And every change afterwards: sign-in, sign-out, token refresh, and the
    // sign-out that happens in ANOTHER TAB — which matters, because "I logged
    // out" must mean logged out everywhere on that machine.
    client.auth.onAuthStateChange((_event, session) => {
      settle(session?.user)
    })

    /**
     * P2.5b — THE SILENT RECONNECTION.
     *
     * A stale session is a question that has not been asked yet, and the
     * moment the network returns is when to ask it. If the refresh token is
     * still good — it lives far longer than the access token — the answer is a
     * fresh session and the coordinator never learns there was a gap. If it is
     * not, THIS is the honest sign-out: online, asked, refused.
     */
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void client.auth
          .getSession()
          .then(({ data }) => {
            if (data.session?.user) {
              settle(data.session.user)
              return
            }
            // Asked with a network and refused: really signed out. The data
            // cache goes with it, because the identity that could read it no
            // longer exists on this device.
            writeLastSession(null)
            for (const handler of signOutHandlers) void handler()
            publish(SIGNED_OUT)
          })
          .catch(() => {
            // Still no answer. Nothing changes; `online` may fire again.
          })
      })
    }
  })
}

/**
 * Sign in with a password.
 *
 * The app NEVER creates an account and never sets a password. The coordinator's
 * account is created in Supabase's own dashboard, by the product owner, with a
 * password only he ever types (standing decision, ETAT §12). There is no
 * sign-up form here and there is not meant to be one.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: SignInError }> {
  const client = await getSupabase()
  if (!client) return { ok: false, error: 'network' }

  const { error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (!error) return { ok: true }

  return { ok: false, error: classify(error) }
}

function classify(error: { code?: string; status?: number; name?: string }): SignInError {
  if (error.code === 'email_not_confirmed') return 'unconfirmed'
  if (error.code === 'over_request_rate_limit' || error.status === 429) {
    return 'rate-limit'
  }
  // Supabase's own retryable class: DNS, offline, CORS, a paused project. A
  // farm track at 02:00 is exactly where this happens, so it must not read as
  // "wrong password".
  if (error.name === 'AuthRetryableFetchError' || error.status === undefined) {
    return 'network'
  }
  return 'credentials'
}

export async function signOut(): Promise<void> {
  // FIRST, and before anything can fail: an explicit sign-out must not be able
  // to leave the remembered identity behind, and `resolveSignedOut` reads it.
  writeLastSession(null)
  // P2.5b — the read cache and the outbox go too. This is the asymmetry the
  // note on LAST_SESSION_KEY describes: leaving deliberately clears the
  // device, losing the network does not.
  for (const handler of signOutHandlers) await handler()

  const client = await getSupabase()
  if (!client) {
    publish(SIGNED_OUT)
    return
  }
  await client.auth.signOut()
  // A signed URL outlives the session that minted it (P2.4). On a shared iPad
  // the next person must not inherit an hour of the last one's portraits.
  clearSignedUrlCache()
  // `onAuthStateChange` publishes the new state; nothing to do here.
}
