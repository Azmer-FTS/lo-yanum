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

/**
 * ★★ AT1 — LA SESSION SE LIT SUR L'APPAREIL, PAS SUR LE RÉSEAU.
 *    `getUser()` faisait un aller-retour vers `/auth/v1/user` à chaque cycle,
 *    sans délai : au sortir de veille, une connexion morte tenait la roue de
 *    « סנכרון עכשיו » sans qu'aucune requête n'arrive (mesuré sur les journaux
 *    du serveur : aucune trace de l'iPad). `getSession()` lit le jeton stocké
 *    et ne sort que pour le rafraîchir.
 */
async function userClient() {
  if (!SUPABASE_CONFIGURED) return null
  const client = await getSupabase()
  if (!client) return null
  const { data } = await client.auth.getSession()
  const id = data.session?.user?.id
  if (!id) return null
  return { client, id }
}

/** ★ AT1 — une requête de réglages ne dure JAMAIS plus que ceci. */
export const SETTINGS_REQUEST_TIMEOUT_MS = 12_000

/** Une erreur nommée : l'écran la DIT au lieu de tourner. */
export class SettingsSyncError extends Error {
  constructor(public readonly reason: 'no-session' | 'timeout' | 'network' | 'server', detail = '') {
    super(detail ? `${reason}: ${detail}` : reason)
  }
}

function withTimeout<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const ctl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort()
      reject(new SettingsSyncError('timeout'))
    }, SETTINGS_REQUEST_TIMEOUT_MS)
  })
  return Promise.race([Promise.resolve(run(ctl.signal)), timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function requireClient() {
  const u = await withTimeout(() => userClient())
  if (!u) throw new SettingsSyncError('no-session')
  return u
}

function fail(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? ''
  if (/abort/i.test(msg)) throw new SettingsSyncError('timeout')
  if (/fetch|network|load failed/i.test(msg)) throw new SettingsSyncError('network', msg)
  throw new SettingsSyncError('server', [error?.code, msg].filter(Boolean).join(' '))
}

/**
 * ★ AT1 — la question bon marché : « la ligne a-t-elle changé ? ». La ligne
 * porte le logo du contrat (≈ 200 ko) ; la relire toutes les 30 s sur un
 * téléphone serait un gaspillage. `undefined` = aucune ligne.
 */
export async function loadRemoteSettingsStamp(): Promise<string | null> {
  const u = await requireClient()
  const { data, error } = await withTimeout((signal) =>
    u.client.from('user_settings').select('updated_at').eq('user_id', u.id).abortSignal(signal).maybeSingle(),
  )
  if (error) fail(error)
  return (data?.updated_at as string | undefined) ?? null
}

/** La ligne entière. Jette une `SettingsSyncError` nommée. */
export async function loadRemoteSettingsRowStrict(): Promise<RemoteSettings> {
  const u = await requireClient()
  const { data, error } = await withTimeout((signal) =>
    u.client.from('user_settings').select('data, updated_at').eq('user_id', u.id).abortSignal(signal).maybeSingle(),
  )
  if (error) fail(error)
  if (!data) return { blob: {}, updatedAt: null }
  const blob = (data.data ?? {}) as SettingsBlob
  return { blob: blob && typeof blob === 'object' ? blob : {}, updatedAt: (data.updated_at as string) ?? null }
}

/** `null` = pas de session ou pas de réseau : rien n'est conclu. */
export async function loadRemoteSettingsRow(): Promise<RemoteSettings | null> {
  return loadRemoteSettingsRowStrict().catch(() => null)
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
  const r = await saveRemoteSettingsIfStrict(blob, expectedUpdatedAt).catch(() => 'error' as const)
  return r
}

/** ★ AT1 — la même écriture, bornée dans le temps, qui DIT son erreur. */
export async function saveRemoteSettingsIfStrict(
  blob: SettingsBlob,
  expectedUpdatedAt: string | null,
): Promise<'ok' | 'conflict'> {
  const u = await requireClient()
  const stamp = new Date().toISOString()
  if (expectedUpdatedAt === null) {
    const { data, error } = await withTimeout((signal) =>
      u.client
        .from('user_settings')
        .upsert({ user_id: u.id, data: blob, updated_at: stamp }, { onConflict: 'user_id', ignoreDuplicates: true })
        .select('user_id')
        .abortSignal(signal),
    )
    if (error) fail(error)
    return (data?.length ?? 0) === 1 ? 'ok' : 'conflict'
  }
  const { data, error } = await withTimeout((signal) =>
    u.client
      .from('user_settings')
      .update({ data: blob, updated_at: stamp })
      .eq('user_id', u.id)
      .eq('updated_at', expectedUpdatedAt)
      .select('user_id')
      .abortSignal(signal),
  )
  if (error) fail(error)
  return (data?.length ?? 0) === 1 ? 'ok' : 'conflict'
}

/** Compatibilité : l'écriture inconditionnelle d'avant AS4. */
export async function saveRemoteSettings(blob: SettingsBlob): Promise<boolean> {
  const u = await userClient().catch(() => null)
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
    /* ★ AT1 — jamais d'appel d'authentification DANS le rappel (auth-js le
       déconseille : il tient la session pendant qu'il nous appelle). */
    if (event === 'SIGNED_IN') setTimeout(cb, 0)
  })
}
