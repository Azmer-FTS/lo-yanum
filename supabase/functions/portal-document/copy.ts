/**
 * ★★ AS1.5 — RECOPIER LES CONTRATS DU PORTAIL DANS LE SEAU `agreements`.
 *
 * Logique PURE, sans Deno ni réseau (les dépendances sont passées) : la porte
 * `asgate` la rejoue sur des doublures, comme `aqmail` le fait de `mail.ts`.
 *
 * ⛔ CE N'EST PAS UN RELAIS. La fonction ne reçoit qu'un identifiant de fiche ;
 *    l'adresse à lire est celle que la BASE a mise en file (écrite par le
 *    coordinateur, sous RLS), et seulement si elle est sur l'hôte des
 *    fichiers Tadabase. Appelée par n'importe qui, elle ne fait que ce qui
 *    était déjà en attente — la même posture qu'`intake-mail` (AQ3).
 */

export const ALLOWED_HOST = /^[0-9]+-application-data-[0-9]+\.s3\.amazonaws\.com$/u
export const MAX_BYTES = 20 * 1024 * 1024
export const ENTITY_ID = /^[A-Za-z0-9_-]{1,80}$/u

export interface LandDoc {
  id: string
  source: string
  url: string | null
  fileName: string
  addedAt: string
  status: 'pending' | 'stored' | 'failed'
  storageKey: string | null
  size: number | null
  error?: string | null
}

export interface Deps {
  readDocs(entityId: string): Promise<LandDoc[] | null>
  fetchFile(url: string): Promise<{ ok: boolean; status: number; type: string; bytes: Uint8Array }>
  upload(key: string, bytes: Uint8Array, type: string): Promise<void>
  /** Réécrit SEULEMENT les entrées traitées, sur la version courante (pas d'écrasement). */
  writeDocs(entityId: string, docs: LandDoc[]): Promise<void>
}

export function allowedUrl(url: string | null): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && ALLOWED_HOST.test(u.hostname)
  } catch {
    return false
  }
}

export function storageKeyOf(entityId: string, doc: LandDoc, type: string): string {
  const ext = type.includes('pdf') ? 'pdf' : type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg' : 'bin'
  return `land/${entityId}/${doc.id}.${ext}`
}

export async function processEntity(
  entityId: string,
  deps: Deps,
): Promise<{ stored: number; failed: number; skipped: number }> {
  const out = { stored: 0, failed: 0, skipped: 0 }
  if (!ENTITY_ID.test(entityId)) return out
  const docs = await deps.readDocs(entityId)
  if (!docs) return out
  const next = docs.map((d) => ({ ...d }))
  for (const doc of next) {
    if (doc.status !== 'pending') continue
    if (!allowedUrl(doc.url)) {
      doc.status = 'failed'
      doc.error = 'host'
      out.failed++
      continue
    }
    try {
      const res = await deps.fetchFile(doc.url!)
      if (!res.ok) throw new Error(`http ${res.status}`)
      if (res.bytes.byteLength > MAX_BYTES) throw new Error('size')
      if (!/pdf|image\//u.test(res.type)) throw new Error(`type ${res.type}`)
      const key = storageKeyOf(entityId, doc, res.type)
      await deps.upload(key, res.bytes, res.type.split(';')[0])
      doc.status = 'stored'
      doc.storageKey = key
      doc.size = res.bytes.byteLength
      doc.error = null
      out.stored++
    } catch (e) {
      doc.status = 'failed'
      doc.error = String(e).slice(0, 120)
      out.failed++
    }
  }
  if (out.stored + out.failed > 0) await deps.writeDocs(entityId, next)
  else out.skipped = docs.length
  return out
}
