/**
 * THE TWO BUILD-TIME VALUES, AND NOTHING ELSE (P2.3).
 *
 * Deliberately free of any import: this module decides which of the app's two
 * modes is running, and that decision is needed in the FIRST frame — by the
 * gate in `App`, and by `DevToolbar` deciding whether to exist at all. Putting
 * it next to `createClient` would have dragged the whole Supabase library onto
 * the critical path of a build that may never speak to Supabase.
 *
 *   REAL MODE  — both set. The app requires a Supabase session; nothing renders
 *                until someone signs in.
 *   DEMO MODE  — either missing. The app runs exactly as it did before P2.3, on
 *                the mock store, with the role switcher. This is what the frozen
 *                /poc is, and what every browser verification script drives — so
 *                the gates keep passing without any of them knowing about auth.
 *
 * The publishable key is PUBLIC BY DESIGN and belongs in the bundle: it names
 * the project, it does not authorise anything. The security is the RLS applied
 * in P2.2 — which is why `bun run auth` proves an anonymous read is REFUSED.
 * The service-role key is never fetched, never committed, never in the client.
 */

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()

export const SUPABASE_PUBLISHABLE_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
).trim()

/** True when this build is pointed at a real Supabase project. */
export const SUPABASE_CONFIGURED =
  SUPABASE_URL !== '' && SUPABASE_PUBLISHABLE_KEY !== ''
