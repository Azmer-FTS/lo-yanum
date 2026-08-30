import type { SupabaseClient } from '@supabase/supabase-js'

import { SUPABASE_CONFIGURED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config'

/**
 * THE ONE SUPABASE CLIENT (P2.3) — AND IT ARRIVES IN ITS OWN CHUNK.
 *
 * `src/core` is pure TS with no I/O by invariant, and `src/ui` is React. The
 * backend belongs to neither, so it gets its own layer: `src/data` holds the
 * client, the auth API, and — in P2.6 — the Supabase implementation of the
 * store interface.
 *
 * ★ THE IMPORT IS DYNAMIC, AND THAT IS NOT AN OPTIMISATION DETAIL.
 *   `@supabase/supabase-js` is ~100 kB gzipped: it carries postgrest, storage,
 *   functions and realtime whether or not a screen uses them. Imported
 *   statically it landed in the initial bundle and took it from 146 kB to
 *   249 kB gzipped — a two-thirds increase on the one number this app cannot
 *   afford to grow, because the volunteer opening it is on a farm track at
 *   02:00 with one bar of signal. Behind `import()` it is a second chunk
 *   fetched in parallel, cached on its own, and NEVER FETCHED AT ALL in demo
 *   mode. The type import above is erased at compile time and costs nothing.
 *
 * The promise is memoised: `getSupabase()` may be called from anywhere and
 * there is exactly one client, exactly one stored session, exactly one
 * refresh timer.
 */

let pending: Promise<SupabaseClient | null> | null = null

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!SUPABASE_CONFIGURED) return Promise.resolve(null)
  pending ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        // The coordinator closes the laptop at 23:00 and reopens it at 02:00
        // when a farmer calls. The session survives that, and the refresh
        // happens without him noticing.
        persistSession: true,
        autoRefreshToken: true,
        /**
         * OFF, deliberately. Supabase's implicit flow returns its tokens in the
         * URL **hash** — and this app is a HashRouter, where the hash IS the
         * route. Nothing in phase 1 arrives that way: the coordinator's account
         * is created in Supabase's own dashboard and he signs in with a
         * password. Leaving detection on would only let the client eat a stray
         * hash before the router ever saw it.
         */
        detectSessionInUrl: false,
        storageKey: 'lo-yanum:auth',
      },
    }),
  )
  return pending
}

export { SUPABASE_CONFIGURED, SUPABASE_URL } from './config'
