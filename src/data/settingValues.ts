import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'
import { SETTINGS_REQUEST_TIMEOUT_MS, SettingsSyncError } from './settings'

/**
 * ★★★ BJ — LES RÉGLAGES DU COMPTE, UNE LIGNE PAR RÉGLAGE
 * (`public.user_setting_values`, migration `20261015000100`).
 *
 * Ce module transporte des lignes ; il ne sait pas ce qu'est un réglage. Le
 * sens (quoi envoyer, qui gagne) est dans `storage/account.ts`. L'INSTANT de
 * chaque ligne est posé par la BASE (déclencheur `user_setting_values_stamp`),
 * jamais par l'appareil : il n'y a ici aucun `new Date()` envoyé comme vérité.
 */
export interface SettingRow {
  key: string
  value: string | null
  /** Instant du CHOIX, à l'horloge du serveur — départage deux appareils. */
  updated_at: string
  /** Instant d'ARRIVÉE en base — le curseur de relecture. */
  written_at: string
  device?: string | null
}

export interface SettingPush {
  key: string
  value: string | null
  /** Instant du geste HORS LIGNE, déjà corrigé à l'horloge du serveur ; `null` = « maintenant » (le serveur). */
  client_at: string | null
  device: string | null
}

const COLUMNS = 'key, value, updated_at, written_at, device'

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
  if (!SUPABASE_CONFIGURED) throw new SettingsSyncError('no-session')
  const u = await withTimeout(async () => {
    const client = await getSupabase()
    if (!client) return null
    const { data } = await client.auth.getSession()
    const id = data.session?.user?.id
    return id ? { client, id } : null
  })
  if (!u) throw new SettingsSyncError('no-session')
  return u
}

function fail(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? ''
  if (/abort/i.test(msg)) throw new SettingsSyncError('timeout')
  if (/fetch|network|load failed/i.test(msg)) throw new SettingsSyncError('network', msg)
  throw new SettingsSyncError('server', [error?.code, msg].filter(Boolean).join(' '))
}

/** L'utilisateur de la session, sans réseau (`null` = pas de session). */
export async function settingsUserId(): Promise<string | null> {
  try {
    return (await requireClient()).id
  } catch {
    return null
  }
}

/** Les lignes ARRIVÉES en base après `since` (toutes si `null`). */
export async function pullSettingValues(since: string | null): Promise<SettingRow[]> {
  const u = await requireClient()
  const { data, error } = await withTimeout((signal) => {
    let q = u.client.from('user_setting_values').select(COLUMNS).eq('user_id', u.id)
    if (since) q = q.gt('written_at', since)
    return q.order('written_at', { ascending: true }).abortSignal(signal)
  })
  if (error) fail(error)
  return (data ?? []) as SettingRow[]
}

/** ★ La question bon marché du battement : l'arrivée la plus récente (`null` = aucune ligne). */
export async function headSettingValues(): Promise<string | null> {
  const u = await requireClient()
  const { data, error } = await withTimeout((signal) =>
    u.client.from('user_setting_values').select('written_at').eq('user_id', u.id).order('written_at', { ascending: false }).limit(1).abortSignal(signal),
  )
  if (error) fail(error)
  const rows = (data ?? []) as Array<{ written_at: string }>
  return rows[0]?.written_at ?? null
}

/**
 * ★ ÉCRIRE. Rend les lignes TELLES QUE LA BASE LES PORTE APRÈS l'écriture :
 * si une valeur plus récente était déjà en place, le déclencheur l'a gardée,
 * et c'est elle qui revient (l'appelant voit qu'il a perdu).
 */
export async function pushSettingValues(rows: SettingPush[]): Promise<SettingRow[]> {
  if (rows.length === 0) return []
  const u = await requireClient()
  const { data, error } = await withTimeout((signal) =>
    u.client
      .from('user_setting_values')
      .upsert(
        rows.map((r) => ({ user_id: u.id, ...r })),
        { onConflict: 'user_id,key' },
      )
      .select(COLUMNS)
      .abortSignal(signal),
  )
  if (error) fail(error)
  return (data ?? []) as SettingRow[]
}

/**
 * ★ LA MIGRATION : n'écrire QUE ce que le compte n'a pas encore
 * (`on conflict do nothing`). Rend les lignes effectivement créées ; une clé
 * absente de la réponse a été posée entre-temps par un autre appareil, et
 * c'est la sienne qui gagne.
 */
export async function insertMissingSettingValues(rows: SettingPush[]): Promise<SettingRow[]> {
  if (rows.length === 0) return []
  const u = await requireClient()
  const { data, error } = await withTimeout((signal) =>
    u.client
      .from('user_setting_values')
      .upsert(
        rows.map((r) => ({ user_id: u.id, ...r })),
        { onConflict: 'user_id,key', ignoreDuplicates: true },
      )
      .select(COLUMNS)
      .abortSignal(signal),
  )
  if (error) fail(error)
  return (data ?? []) as SettingRow[]
}
