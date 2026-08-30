import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'

/**
 * P2.4 — READING OUT OF THE TWO PRIVATE BUCKETS.
 *
 * Neither bucket has a public URL. Every read is a SIGNED URL minted for a
 * caller the database has already decided may have the object, by the policies
 * in `20260830000500_storage.sql`. Nothing here re-implements those rules —
 * asking for a URL you may not have simply fails, which is the only place that
 * decision should ever be made.
 */

export type PhotoKind = 'entities' | 'contacts' | 'volunteers' | 'drivers'

export const PHOTOS_BUCKET = 'photos'
export const AGREEMENTS_BUCKET = 'agreements'

/**
 * `<kind>/<id>/<filename>` — the shape the storage policies read with
 * `storage.foldername()`: segment 1 is the kind, segment 2 is the id.
 *
 * The id is a FOLDER rather than a filename stem so that replacing a portrait
 * is cheap: a new `filename` under the same folder invalidates every cached
 * signed URL for the old one without touching the row that points at it.
 */
export function photoKey(kind: PhotoKind, id: string, filename: string): string {
  return `${kind}/${id}/${filename}`
}

/** `<entity_id>/<agreement_id>.pdf` — segment 1 is the entity. */
export function agreementKey(entityId: string, agreementId: string): string {
  return `${entityId}/${agreementId}.pdf`
}

/**
 * Is this `photo` value an object key, or something already displayable?
 *
 * The demo store holds data URIs (`placeholderPhoto`) and always will — /poc
 * is frozen on them. A real build holds keys. Rather than give the two modes
 * two component trees, every reader passes its `photo` through here: a value
 * that is already a URL is returned untouched, and only a bare key is signed.
 */
export function isObjectKey(photo: string): boolean {
  return !photo.startsWith('data:') && !photo.startsWith('http://') && !photo.startsWith('https://')
}

/**
 * How long a minted URL is asked to live, and how early it is re-minted.
 *
 * An hour is long enough that scrolling a 300-row roster mints each portrait
 * once, and short enough that a URL copied out of devtools is not a lasting
 * key to a private object. The margin exists because the interesting failure
 * is not "expired an hour ago" but "expired between the render and the GET".
 */
const TTL_SECONDS = 3600
const REFRESH_MARGIN_MS = 5 * 60 * 1000

interface CacheEntry {
  url: string
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function cacheKey(bucket: string, key: string): string {
  return `${bucket}/${key}`
}

/**
 * Signed URLs for several objects in one round trip.
 *
 * Batched on purpose: the roster shows 300 people at once, and 300 sequential
 * POSTs over a phone connection at the edge of coverage is not a slow list, it
 * is a list that never finishes. Keys already cached are answered without a
 * request. An object the caller may not read comes back as `null` rather than
 * throwing — a missing portrait is an initials disc, not an error screen.
 */
export async function signedUrls(
  bucket: string,
  keys: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (!SUPABASE_CONFIGURED || keys.length === 0) return out

  const now = Date.now()
  const wanted: string[] = []
  for (const key of new Set(keys)) {
    const hit = cache.get(cacheKey(bucket, key))
    if (hit && hit.expiresAt - REFRESH_MARGIN_MS > now) out.set(key, hit.url)
    else wanted.push(key)
  }
  if (wanted.length === 0) return out

  const client = await getSupabase()
  if (!client) return out

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrls(wanted, TTL_SECONDS)

  if (error || !data) {
    for (const key of wanted) out.set(key, null)
    return out
  }

  for (const row of data) {
    // `path` is what was asked for; `signedUrl` is null when the policy said no.
    const key = row.path ?? ''
    if (row.signedUrl) {
      cache.set(cacheKey(bucket, key), {
        url: row.signedUrl,
        expiresAt: now + TTL_SECONDS * 1000,
      })
      out.set(key, row.signedUrl)
    } else {
      out.set(key, null)
    }
  }
  return out
}

/** One object. Prefer `signedUrls` wherever more than one is on screen. */
export async function signedUrl(bucket: string, key: string): Promise<string | null> {
  const map = await signedUrls(bucket, [key])
  return map.get(key) ?? null
}

/**
 * Forget what was minted. Called after an upload replaces an object, and on
 * sign-out — a signed URL outlives the session that minted it, so leaving the
 * cache populated would let the next person at a shared iPad see the last
 * one's portraits until the hour ran out.
 */
export function clearSignedUrlCache(): void {
  cache.clear()
}
