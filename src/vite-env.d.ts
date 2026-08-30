/// <reference types="vite/client" />

/**
 * P2.3 — the two build-time values that point the app at its Supabase project.
 *
 * Both are PUBLIC BY DESIGN. The publishable key identifies the project; it
 * authorises nothing. The security is the RLS (P2.2). The service-role key is
 * never fetched, never committed and never reaches the client.
 *
 * Optional on purpose: an app built WITHOUT them runs in demo mode on the mock
 * store, which is what /poc is and what every verification script drives.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
