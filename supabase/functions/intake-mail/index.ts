// ★★ AQ3 (2026-09-25) — la fonction Edge `intake-mail`. Le parcours est dans
// `mail.ts` ; ici, seulement ce qui parle au monde.
//
// ⛔ LES SECRETS VIVENT ICI ET NULLE PART AILLEURS. `RESEND_API_KEY` est un
//    secret de fonction Edge (`supabase secrets set`), lu par `Deno.env` sur
//    les serveurs de Supabase ; la clé de service est injectée par Supabase dans
//    ce même environnement. Aucun des deux n'est dans le dépôt, ni dans une
//    variable `VITE_*`, donc aucun ne peut atterrir dans un bundle servi au
//    navigateur — `bun run aqmail` (A266) le vérifie sur le build.
//
// Variables :
//   RESEND_API_KEY     — la clé de l'expéditeur. Absente : rien ne part, et la
//                        demande porte « not_configured » (l'app le dit).
//   INTAKE_MAIL_FROM   — « לא ינום <bakasha@domaine-vérifié> ». Sans domaine
//                        vérifié chez Resend, seul `onboarding@resend.dev` est
//                        permis, et il n'écrit qu'au titulaire du compte.
//   INTAKE_PO_EMAIL    — facultatif : l'adresse du PO. Sinon, celle du compte
//                        coordinateur (app_users → auth.users).
//   INTAKE_APP_URL     — facultatif : l'adresse de l'app pour le lien.

import { processRequest } from './mail.ts'
import type { Coordinator, Deps, Outgoing, RequestRow } from './mail.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('INTAKE_MAIL_FROM') ?? 'Lo Yanum <onboarding@resend.dev>'
const PO_EMAIL = Deno.env.get('INTAKE_PO_EMAIL') ?? ''
const APP_URL = Deno.env.get('INTAKE_APP_URL') ?? 'https://azmer-fts.github.io/lo-yanum/'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const COLUMNS =
  'id,created_at,need,land_kind,farm_name,full_name,phone,email,locality,reference,appointment_at,entity_id,document_ids,mail_po,mail_farmer,mail_attempts'

function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const deps: Deps = {
  async readRequest(id) {
    const res = await rest(`aid_requests?id=eq.${id}&select=${COLUMNS}`)
    if (!res.ok) throw new Error(`lecture ${res.status}`)
    const rows = (await res.json()) as RequestRow[]
    return rows[0] ?? null
  },
  async claim(id, expected, patch) {
    const res = await rest(`aid_requests?id=eq.${id}&mail_attempts=eq.${expected}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error(`réservation ${res.status}`)
    return ((await res.json()) as unknown[]).length === 1
  },
  async update(id, patch) {
    const res = await rest(`aid_requests?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (!res.ok) throw new Error(`écriture ${res.status}`)
  },
  async coordinator(): Promise<Coordinator | null> {
    const users = await rest(`app_users?role=eq.coordinator&select=user_id&limit=1`)
    const user = users.ok ? (((await users.json()) as Array<{ user_id: string }>)[0] ?? null) : null
    let email = PO_EMAIL
    let name = ''
    let phone = ''
    if (user) {
      if (!email) {
        const auth = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.user_id}`, {
          headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
        })
        if (auth.ok) email = ((await auth.json()) as { email?: string }).email ?? ''
      }
      const settings = await rest(`user_settings?user_id=eq.${user.user_id}&select=data`)
      if (settings.ok) {
        const row = ((await settings.json()) as Array<{ data: Record<string, string> }>)[0]
        try {
          const card = JSON.parse(row?.data?.['lo-yanum:coordinator'] ?? '{}') as { name?: string; phone?: string }
          name = card.name ?? ''
          phone = card.phone ?? ''
        } catch {
          /* carte illisible : le message part sans elle */
        }
      }
    }
    return email || name || phone ? { name, phone, email } : null
  },
  send: RESEND_API_KEY
    ? async (m: Outgoing) => {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from: FROM,
            to: [m.to],
            subject: m.subject,
            html: m.html,
            text: m.text,
            ...(m.replyTo ? { reply_to: m.replyTo } : {}),
          }),
        })
        if (res.ok) return { ok: true as const }
        return { ok: false as const, error: `${res.status} ${(await res.text()).slice(0, 200)}` }
      }
    : null,
  from: FROM,
  appUrl: APP_URL,
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('method', { status: 405, headers: CORS })
  let body: { id?: unknown; retry?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'json' }), { status: 400, headers: CORS })
  }
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null
  if (!id) return new Response(JSON.stringify({ error: 'id' }), { status: 400, headers: CORS })
  try {
    const outcome = await processRequest(id, body.retry === true, deps)
    return new Response(JSON.stringify(outcome), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 200) }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
