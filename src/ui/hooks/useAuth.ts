import { useSyncExternalStore } from 'react'

import { getAuthState, subscribeAuth } from '../../data/auth'
import type { AuthState } from '../../data/auth'

/**
 * Binds a component to the Supabase session (P2.3).
 *
 * Same contract as `useCoreValue`: the snapshot is a stable object replaced
 * only when something actually changed, so a token refresh every hour does not
 * re-render the whole shell.
 */
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState)
}
