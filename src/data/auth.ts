import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'

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
}

/**
 * Why a sign-in failed, in terms the UI can translate.
 *
 * `credentials` is deliberately ONE code for a wrong address and a wrong
 * password: telling them apart tells an attacker which addresses exist.
 */
export type SignInError = 'credentials' | 'unconfirmed' | 'rate-limit' | 'network'

const SIGNED_OUT: AuthState = { status: 'signed-out', email: null, userId: null }

let state: AuthState = SUPABASE_CONFIGURED
  ? { status: 'loading', email: null, userId: null }
  : { status: 'disabled', email: null, userId: null }

const listeners = new Set<() => void>()

function publish(next: AuthState): void {
  // Reference equality is the snapshot contract: emitting a fresh object with
  // identical fields would re-render every subscriber on every token refresh,
  // and the token refreshes on a timer.
  if (
    next.status === state.status &&
    next.email === state.email &&
    next.userId === state.userId
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
      publish(SIGNED_OUT)
      return
    }

    // `getSession` reads localStorage and refreshes an expired token before
    // answering, so this settles `loading` exactly once.
    void client.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      publish(
        user
          ? { status: 'signed-in', email: user.email ?? null, userId: user.id }
          : SIGNED_OUT,
      )
    })

    // And every change afterwards: sign-in, sign-out, token refresh, and the
    // sign-out that happens in ANOTHER TAB — which matters, because "I logged
    // out" must mean logged out everywhere on that machine.
    client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      publish(
        user
          ? { status: 'signed-in', email: user.email ?? null, userId: user.id }
          : SIGNED_OUT,
      )
    })
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
  const client = await getSupabase()
  if (!client) return
  await client.auth.signOut()
  // `onAuthStateChange` publishes the new state; nothing to do here.
}
