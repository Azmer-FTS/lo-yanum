import { phoneE164 } from '@core/phone'

import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'
import { signedUrls } from './storage'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BA (2026-10-12) — LA PHOTO D'UNE PERSONNE SE RETROUVE PAR SON TÉLÉPHONE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les photos des contacts (agriculteurs, contacts à traiter, contacts des
 * institutions) vivent dans le bucket PRIVÉ `contact-photos`, nommées par le
 * numéro, et la table `contact_photos` dit quel numéro (E.164) a la sienne.
 * Aucun enregistrement ne porte de lien vers sa photo : c'est le téléphone,
 * normalisé, qui relie — jamais le nom (règle du PO). Une personne qui
 * apparaît à trois endroits (rang 1 d'une ferme, contact à traiter converti,
 * contact d'institution) a donc la même photo partout, sans recopie.
 *
 * Une seule lecture de la table et un seul lot d'URL signées (une heure) par
 * session ; relu quand les URL approchent de leur fin. Sans Supabase (jumeau,
 * portes pures), le module ne répond rien : les initiales restent.
 */

export const CONTACT_PHOTOS_BUCKET = 'contact-photos'

const REFRESH_MS = 50 * 60 * 1000

let urls = new Map<string, string>()
let loadedAt = 0
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

export function subscribeContactPhotos(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function contactPhotosVersion(): number {
  return loadedAt
}

/** Lit la table et signe les URL. Sans effet hors Supabase ; jamais d'exception. */
export function loadContactPhotos(force = false): Promise<void> {
  if (!SUPABASE_CONFIGURED) return Promise.resolve()
  if (loading) return loading
  if (!force && loadedAt !== 0 && Date.now() - loadedAt < REFRESH_MS) return Promise.resolve()
  loading = (async () => {
    try {
      const client = await getSupabase()
      if (!client) return
      const { data, error } = await client.from('contact_photos').select('phone_e164, object_key')
      if (error || !data) return
      const rows = data as Array<{ phone_e164: string; object_key: string }>
      const signed = await signedUrls(CONTACT_PHOTOS_BUCKET, rows.map((r) => r.object_key))
      const next = new Map<string, string>()
      for (const r of rows) {
        const url = signed.get(r.object_key)
        if (url) next.set(r.phone_e164, url)
      }
      urls = next
      loadedAt = Date.now()
      emit()
    } catch {
      /* hors ligne, droits refusés : les initiales restent */
    } finally {
      loading = null
    }
  })()
  return loading
}

/** L'URL de la photo de ce numéro, si elle existe et est déjà signée. */
export function contactPhotoUrl(phone: string | null | undefined): string | null {
  const k = phoneE164(phone)
  if (!k) return null
  if (loadedAt === 0 || Date.now() - loadedAt > REFRESH_MS) void loadContactPhotos()
  return urls.get(k) ?? null
}

/** Pour les portes : vider ce qui a été chargé (déconnexion, autre compte). */
export function clearContactPhotos(): void {
  urls = new Map()
  loadedAt = 0
  emit()
}
