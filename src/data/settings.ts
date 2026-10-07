import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH11.2 (2026-09-10) — LES RÉGLAGES DU PO, RATTACHÉS À SON COMPTE.
 * ★★ AS4 (2026-10-07) — ET ILS VOYAGENT VRAIMENT, DANS LES DEUX SENS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une ligne par compte, un `jsonb` qui porte exactement ce que `localStorage`
 * portait — voir la migration `20260910000100_user_settings.sql` pour les
 * trois raisons de cette forme. AS4 y ajoute UNE clé, `__stamps` (l'instant
 * de chaque réglage), que les anciens builds ignorent sans rien casser.
 *
 * ⚠️ CE MODULE NE SAIT PAS CE QU'EST UN RÉGLAGE, et c'est ce qui le garde
 *    petit : il transporte un dictionnaire de chaînes. La liste des clés qui
 *    voyagent et la fusion sont dans `ui/settings/sync.ts`.
 *
 * ★ AS4 — L'ÉCRITURE EST CONDITIONNELLE (`updated_at` relu = `updated_at` en
 *   base). Deux appareils qui écrivent en même temps ne s'écrasent plus : le
 *   second voit 0 ligne touchée, relit, refusionne, réécrit.
 */
export type SettingsBlob = Record<string, string>

export interface RemoteSettings {
  blob: SettingsBlob
  /** `null` = aucune ligne encore pour ce compte. */
  updatedAt: string | null
}

async function userClient() {
  if (!SUPABASE_CONFIGURED) return null
  const client = await getSupabase()
  if (!client) return null
  const { data: user } = await client.auth.getUser()
  const id = user.user?.id
  if (!id) return null
  return { client, id }
}

/** `null` = pas de session ou pas de réseau : rien n'est conclu. */
export async function loadRemoteSettingsRow(): Promise<RemoteSettings | null> {
  const u = await userClient()
  if (!u) return null
  const { data, error } = await u.client
    .from('user_settings')
    .select('data, updated_at')
    .eq('user_id', u.id)
    .maybeSingle()
  if (error) return null
  if (!data) return { blob: {}, updatedAt: null }
  const blob = (data.data ?? {}) as SettingsBlob
  return { blob: blob && typeof blob === 'object' ? blob : {}, updatedAt: (data.updated_at as string) ?? null }
}

/** Compatibilité : la lecture d'avant AS4 (le bloc seul). */
export async function loadRemoteSettings(): Promise<SettingsBlob | null> {
  return (await loadRemoteSettingsRow())?.blob ?? null
}

/**
 * ⚠️ `upsert`/`insert` portent le `user_id` explicitement : la politique
 *    d'insertion exige `user_id = auth.uid()`.
 * Renvoie `'conflict'` quand un autre appareil a écrit entre la lecture et
 * l'écriture — à l'appelant de relire et refusionner.
 */
export async function saveRemoteSettingsIf(
  blob: SettingsBlob,
  expectedUpdatedAt: string | null,
): Promise<'ok' | 'conflict' | 'error'> {
  const u = await userClient()
  if (!u) return 'error'
  const stamp = new Date().toISOString()
  if (expectedUpdatedAt === null) {
    const { data, error } = await u.client
      .from('user_settings')
      .upsert({ user_id: u.id, data: blob, updated_at: stamp }, { onConflict: 'user_id', ignoreDuplicates: true })
      .select('user_id')
    if (error) return 'error'
    return (data?.length ?? 0) === 1 ? 'ok' : 'conflict'
  }
  const { data, error } = await u.client
    .from('user_settings')
    .update({ data: blob, updated_at: stamp })
    .eq('user_id', u.id)
    .eq('updated_at', expectedUpdatedAt)
    .select('user_id')
  if (error) return 'error'
  return (data?.length ?? 0) === 1 ? 'ok' : 'conflict'
}

/** Compatibilité : l'écriture inconditionnelle d'avant AS4. */
export async function saveRemoteSettings(blob: SettingsBlob): Promise<boolean> {
  const u = await userClient()
  if (!u) return false
  const { error } = await u.client
    .from('user_settings')
    .upsert({ user_id: u.id, data: blob, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  return !error
}

/** ★ AS4 — la connexion est un moment de synchronisation (avant elle, rien à lire). */
export async function onSignedIn(cb: () => void): Promise<void> {
  if (!SUPABASE_CONFIGURED) return
  const client = await getSupabase()
  if (!client) return
  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') cb()
  })
}
