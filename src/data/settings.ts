import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH11.2 (2026-09-10) — LES RÉGLAGES DU PO, RATTACHÉS À SON COMPTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une ligne par compte, un `jsonb` qui porte exactement ce que `localStorage`
 * portait — voir la migration `20260910000100_user_settings.sql` pour les
 * trois raisons de cette forme.
 *
 * ⚠️ CE MODULE NE SAIT PAS CE QU'EST UN RÉGLAGE, et c'est ce qui le garde
 *    petit : il transporte un dictionnaire de chaînes. La liste des clés qui
 *    voyagent est dans `ui/settings/sync.ts`, à côté des modules qui les
 *    écrivent.
 */
export type SettingsBlob = Record<string, string>

export async function loadRemoteSettings(): Promise<SettingsBlob | null> {
  if (!SUPABASE_CONFIGURED) return null
  const client = await getSupabase()
  if (!client) return null
  const { data: user } = await client.auth.getUser()
  const id = user.user?.id
  if (!id) return null
  const { data, error } = await client
    .from('user_settings')
    .select('data')
    .eq('user_id', id)
    .maybeSingle()
  if (error) return null
  const blob = (data?.data ?? null) as SettingsBlob | null
  if (!blob || typeof blob !== 'object') return null
  return blob
}

/**
 * ⚠️ `upsert` ET NON `update`, ET LE `user_id` EST ÉCRIT EXPLICITEMENT. La
 *    politique d'insertion exige `user_id = auth.uid()` ; un `upsert` sans la
 *    colonne serait refusé au premier enregistrement d'un compte neuf — c'est
 *    à dire précisément le cas que ce module existe pour servir.
 */
export async function saveRemoteSettings(blob: SettingsBlob): Promise<boolean> {
  if (!SUPABASE_CONFIGURED) return false
  const client = await getSupabase()
  if (!client) return false
  const { data: user } = await client.auth.getUser()
  const id = user.user?.id
  if (!id) return false
  const { error } = await client
    .from('user_settings')
    .upsert(
      { user_id: id, data: blob, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  return !error
}
