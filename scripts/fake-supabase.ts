import type { BrowserContext, Route } from 'playwright'

/**
 * A FAKE SUPABASE FOR THE BROWSER GATES — the real bundle, the real data
 * layer, a database that lives in the gate's own process.
 *
 * Every request the app sends to `*.supabase.co` is intercepted by Playwright
 * and answered here: a miniature PostgREST (upsert on `id`, `in.(…)` deletes,
 * offset/limit pages, `maybeSingle`) and a fabricated session placed in
 * `localStorage` before the first script runs. supabase-js does not verify a
 * signature client-side — it decodes the payload and reads `expires_at` — so
 * the REAL app on the REAL deployed URL believes it is signed in, hydrates,
 * writes through, and every one of those writes can be inspected between
 * steps. Nothing ever reaches the production database.
 *
 * Shared by `bun run zones` (A88) and by any probe that needs the real app
 * signed in without the product owner's password (ETAT §14.4).
 */

export type Row = Record<string, unknown>

export const USER_ID = '00000000-0000-4000-8000-00000000a088'
export const EMAIL = 'gate@lo-yanum.invalid'

const b64url = (s: string): string =>
  Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function fakeJwt(): string {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      iss: 'gate',
      sub: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: EMAIL,
      exp,
      iat: exp - 365 * 24 * 3600,
      session_id: '00000000-0000-4000-8000-0000000000aa',
    }),
  )
  return `${header}.${payload}.${b64url('not-a-signature-and-never-sent-to-frankfurt')}`
}

const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: EMAIL,
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

export function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  return {
    access_token: fakeJwt(),
    refresh_token: 'gate-refresh',
    token_type: 'bearer',
    expires_in: 365 * 24 * 3600,
    expires_at: exp,
    user,
  }
}

/**
 * A miniature PostgREST. Parents are keyed on `id`; child tables are just
 * rows, deleted by the `fk=in.(…)` filter the writer sends.
 */
export class FakeDb {
  tables = new Map<string, Row[]>()
  /** Every request, for the log and for the "nothing reached the network" checks. */
  log: string[] = []
  /** When true, every REST request fails as if the network were gone. */
  offline = false
  /** Milliseconds to hold every GET before answering — a slow hydration. */
  slowReads = 0

  rows(table: string): Row[] {
    let list = this.tables.get(table)
    if (!list) {
      list = []
      this.tables.set(table, list)
    }
    return list
  }

  seed(): void {
    this.tables.clear()
    this.rows('app_users').push({ user_id: USER_ID, role: 'coordinator', entity_ref: null })
  }

  private matches(row: Row, params: URLSearchParams): boolean {
    for (const [key, value] of params) {
      if (['select', 'offset', 'limit', 'on_conflict', 'order', 'columns'].includes(key)) continue
      if (value.startsWith('in.(')) {
        const list = value
          .slice(4, -1)
          .split(',')
          .map((v) => v.replace(/^"(.*)"$/, '$1'))
        if (!list.includes(String(row[key]))) return false
      } else if (value.startsWith('eq.')) {
        if (String(row[key]) !== value.slice(3)) return false
      } else if (value.startsWith('is.null')) {
        if (row[key] != null) return false
      }
    }
    return true
  }

  handle(method: string, url: URL, headers: Record<string, string>, body: string): {
    status: number
    body: string
  } {
    const table = url.pathname.replace(/^.*\/rest\/v1\//, '')
    const params = url.searchParams
    const prefer = headers['prefer'] ?? ''
    const accept = headers['accept'] ?? ''

    if (method === 'GET') {
      const all = this.rows(table).filter((r) => this.matches(r, params))
      const offset = Number(params.get('offset') ?? 0)
      const limit = params.has('limit') ? Number(params.get('limit')) : all.length
      const page = all.slice(offset, offset + limit)
      // `maybeSingle()` asks for an object; PostgREST answers one row or 406.
      if (accept.includes('vnd.pgrst.object')) {
        if (page.length === 1) return { status: 200, body: JSON.stringify(page[0]) }
        if (page.length === 0) return { status: 406, body: JSON.stringify({ code: 'PGRST116', message: 'no rows', details: null, hint: null }) }
      }
      return { status: 200, body: JSON.stringify(page) }
    }

    if (method === 'DELETE') {
      const list = this.rows(table)
      const keep = list.filter((r) => !this.matches(r, params))
      const removed = list.length - keep.length
      this.tables.set(table, keep)
      this.log.push(`DELETE ${table} -${removed}`)
      return { status: 204, body: '' }
    }

    if (method === 'POST') {
      const incoming = JSON.parse(body || '[]') as Row | Row[]
      const rows = Array.isArray(incoming) ? incoming : [incoming]
      const list = this.rows(table)
      const merge = prefer.includes('merge-duplicates')
      const conflict = params.get('on_conflict') ?? 'id'
      for (const row of rows) {
        const index = merge ? list.findIndex((r) => r[conflict] === row[conflict]) : -1
        if (index === -1) list.push({ ...row })
        else list[index] = { ...list[index], ...row }
      }
      this.log.push(`POST ${table} +${rows.length}${merge ? ' (upsert)' : ''}`)
      return { status: 201, body: prefer.includes('return=representation') ? JSON.stringify(rows) : '' }
    }

    if (method === 'PATCH') {
      const patch = JSON.parse(body || '{}') as Row
      let n = 0
      for (const row of this.rows(table)) {
        if (this.matches(row, params)) {
          Object.assign(row, patch)
          n++
        }
      }
      this.log.push(`PATCH ${table} ~${n}`)
      return { status: 204, body: '' }
    }

    return { status: 405, body: '' }
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': '*',
}

export function installFakeSupabase(context: BrowserContext, db: FakeDb): Promise<void> {
  return context.route('**/*.supabase.co/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS, body: '' })
      return
    }

    // The door: supabase-js asks for the user, or refreshes. Both answered
    // locally so the fabricated session never has to reach a server.
    if (url.pathname.includes('/auth/v1/')) {
      if (url.pathname.endsWith('/user')) {
        await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(user) })
        return
      }
      if (url.pathname.endsWith('/token')) {
        await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(fakeSession()) })
        return
      }
      if (url.pathname.endsWith('/logout')) {
        await route.fulfill({ status: 204, headers: CORS, body: '' })
        return
      }
      await route.fulfill({ status: 404, headers: CORS, body: '{}' })
      return
    }

    if (url.pathname.includes('/rest/v1/')) {
      if (db.offline) {
        db.log.push(`ABORT ${method} ${url.pathname.replace(/^.*\/rest\/v1\//, '')}`)
        await route.abort('internetdisconnected')
        return
      }
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(request.headers())) headers[k.toLowerCase()] = v
      // ★ THE ANSWER IS COMPUTED FIRST AND HELD, so a slow read is a TRUE
      //   race: what the app receives is the database as it was when it
      //   asked, not as it is when the bytes finally arrive — which is what a
      //   real server does, and what makes the hydration-vs-write race real.
      const answer = db.handle(method, url, headers, request.postData() ?? '')
      if (method === 'GET' && db.slowReads > 0) await Bun.sleep(db.slowReads)
      await route.fulfill({
        status: answer.status,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: answer.body,
      })
      return
    }

    await route.fulfill({ status: 404, headers: CORS, body: '' })
  })
}


/** Put the fabricated session where supabase-js will find it, before any script runs. */
export function installFakeSession(context: BrowserContext): Promise<void> {
  const session = fakeSession()
  return context.addInitScript(
    ({ session, userId, email }) => {
      localStorage.setItem('lo-yanum:auth', JSON.stringify(session))
      localStorage.setItem('lo-yanum:last-session', JSON.stringify({ userId, email }))
      localStorage.setItem('lo-yanum:last-email', email)
    },
    { session, userId: USER_ID, email: EMAIL },
  )
}
