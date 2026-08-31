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
  /**
   * PMTiles — an OVERRIDE, not a requirement. The basemap archive's public URL
   * has a default in `ui/components/basemap.ts` precisely so that demo mode —
   * which reads no env file, and which is what every browser gate drives — has
   * a working map. Set this only to point at a re-cut archive or a local file.
   */
  readonly VITE_BASEMAP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
