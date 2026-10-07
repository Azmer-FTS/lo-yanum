// ★★ AS1.5 — fonction Edge `portal-document`. Logique : `copy.ts`.
// Appelée par `pg_net` (déclencheur `entities_land_documents_dispatch`) dès
// qu'une fiche porte un contrat en file. Clé de service lue par `Deno.env`,
// jamais servie au navigateur.
import { processEntity } from './copy.ts'
import type { Deps, LandDoc } from './copy.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const auth = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` }

const deps: Deps = {
  async readDocs(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/entities?id=eq.${encodeURIComponent(id)}&select=land_documents`, { headers: auth })
    if (!res.ok) throw new Error(`lecture ${res.status}`)
    const rows = (await res.json()) as Array<{ land_documents: LandDoc[] | null }>
    return rows[0]?.land_documents ?? null
  },
  async fetchFile(url) {
    const res = await fetch(url, { redirect: 'error' })
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { ok: res.ok, status: res.status, type: res.headers.get('content-type') ?? '', bytes }
  },
  async upload(key, bytes, type) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/agreements/${key}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': type, 'x-upsert': 'true' },
      body: bytes,
    })
    if (!res.ok) throw new Error(`upload ${res.status} ${(await res.text()).slice(0, 80)}`)
  },
  async writeDocs(id, docs) {
    /* Relire juste avant d'écrire : ne réécrire que les entrées traitées. */
    const current = (await deps.readDocs(id)) ?? []
    const byId = new Map(docs.map((d) => [d.id, d]))
    const merged = current.map((d) => (d.status === 'pending' && byId.has(d.id) ? byId.get(d.id)! : d))
    const res = await fetch(`${SUPABASE_URL}/rest/v1/entities?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ land_documents: merged }),
    })
    if (!res.ok) throw new Error(`écriture ${res.status}`)
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('method', { status: 405, headers: CORS })
  let body: { entity_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'json' }), { status: 400, headers: CORS })
  }
  const id = typeof body.entity_id === 'string' ? body.entity_id : ''
  try {
    const outcome = await processEntity(id, deps)
    return new Response(JSON.stringify(outcome), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 200) }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
  }
})
