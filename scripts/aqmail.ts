import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { MAX_ATTEMPTS, processRequest } from '../supabase/functions/intake-mail/mail'
import type { Deps, Outgoing, RequestRow } from '../supabase/functions/intake-mail/mail'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AQ5 — LES COURRIELS. A265 (ils partent ; l'échec ne perd rien) · A266 (aucune clé servie)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aqmail                     # A265 sur doublures + A266 sur dist/
 *   DIST=dist-aqpass bun run aqmail    # A266 sur un autre build
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run aqmail   # A266 sur le DÉPLOYÉ
 *
 * ★ A265 BRANCHE LE VRAI PARCOURS (`processRequest`, le code même de la
 *   fonction Edge) SUR DES DOUBLURES : une base en mémoire qui applique
 *   l'écriture conditionnelle comme PostgREST, un expéditeur qui enregistre ce
 *   qu'on lui donne. Aucun message ne part d'ici. Le passage réel (base de
 *   production, déclencheur, fonction déployée) est prouvé à part, en SQL,
 *   et consigné dans `docs/aq/aq3-courriels.md`.
 *
 * ★ A266 LIT CE QUE LE NAVIGATEUR REÇOIT : chaque fichier du build (les trois
 *   produits : app, jumeau, page publique), et, avec BASE_URL, les scripts
 *   réellement servis.
 */

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

const ID = '00000000-0000-4000-8000-000000000001'
function row(over: Partial<RequestRow> = {}): RequestRow {
  return {
    id: ID,
    created_at: '2026-09-25T11:21:33Z',
    need: 'guarding',
    land_kind: 'both',
    farm_name: 'חוות הבדיקה',
    full_name: 'ישראל ישראלי',
    phone: '052-0000000',
    email: 'farmer@example.org',
    locality: 'קרני שומרון',
    reference: 'AQ0001',
    appointment_at: '2026-09-28T07:00:00Z',
    entity_id: 'farm-req-aq00000001',
    document_ids: ['crops'],
    mail_po: 'pending',
    mail_farmer: 'pending',
    mail_attempts: 0,
    ...over,
  }
}

/** Une base d'une ligne qui se comporte comme PostgREST pour les trois appels. */
function harness(
  start: RequestRow,
  send: ((m: Outgoing) => Promise<{ ok: true } | { ok: false; error: string }>) | null,
  coordinator = { name: 'הרכז', phone: '050-1234567', email: 'po@example.org' },
) {
  const db: Record<string, unknown> = { ...start }
  const sent: Outgoing[] = []
  const deps: Deps = {
    readRequest: async (id) => (id === db.id ? ({ ...db } as unknown as RequestRow) : null),
    claim: async (id, expected, patch) => {
      if (id !== db.id || db.mail_attempts !== expected) return false
      Object.assign(db, patch)
      return true
    },
    update: async (id, patch) => {
      if (id === db.id) Object.assign(db, patch)
    },
    coordinator: async () => coordinator,
    send: send
      ? async (m) => {
          sent.push(m)
          return send(m)
        }
      : null,
    from: 'Lo Yanum <bakasha@example.org>',
    appUrl: 'https://azmer-fts.github.io/lo-yanum/',
  }
  return { db, sent, deps }
}

const OK = async () => ({ ok: true as const })

// ===========================================================================
section('A265 — les deux courriels partent, avec ce que le brief exige')
// ===========================================================================
{
  const h = harness(row(), OK)
  const out = await processRequest(ID, false, h.deps)
  check('la demande est traitée', out.status === 'done', JSON.stringify(out))
  check('★ DEUX messages envoyés', h.sent.length === 2, `${h.sent.length}`)
  const po = h.sent.find((m) => m.to === 'po@example.org')
  const farmer = h.sent.find((m) => m.to === 'farmer@example.org')
  check('un au PO', !!po)
  check('un à l\'agriculteur', !!farmer)
  if (po) {
    for (const [what, needle] of [
      ['le nom', 'ישראל ישראלי'],
      ['le téléphone', '052-0000000'],
      ['ce qui est demandé', 'שמירה'],
      ['les documents fournis', 'מסמך זכות בקרקע — גידולים'],
      ['le rendez-vous souhaité', 'ממתין לאישור'],
      ['le lien vers la fiche', '#/coordinator/farms/farm-req-aq00000001'],
    ] as const) {
      check(`PO — ${what}`, po.html.includes(needle) && po.text.includes(needle), needle)
    }
    check('PO — le rendez-vous à l\'heure de Jérusalem (10:00)', po.text.includes('10:00'), po.text.split('\n').find((l) => l.startsWith('מועד')) ?? '')
    check('PO — ⛔ pas de numéro d\'identité', !po.html.includes('ת״ז') && !po.text.includes('ת״ז'))
    check('PO — « répondre » écrit à l\'agriculteur', po.replyTo === 'farmer@example.org')
    check('PO — hébreu, de droite à gauche', po.html.includes('dir="rtl"') && po.html.includes('lang="he"'))
  }
  if (farmer) {
    check('agriculteur — l\'accusé de réception', farmer.subject.includes('קיבלנו את בקשתך'), farmer.subject)
    check('agriculteur — sa référence', farmer.text.includes('AQ0001') && farmer.subject.includes('AQ0001'))
    check('agriculteur — les coordonnées du PO (nom, téléphone, courriel)', farmer.text.includes('הרכז') && farmer.text.includes('050-1234567') && farmer.text.includes('po@example.org'))
    check('agriculteur — « répondre » écrit au PO', farmer.replyTo === 'po@example.org')
  }
  check('★ l\'état est consigné sur la ligne : sent / sent', h.db.mail_po === 'sent' && h.db.mail_farmer === 'sent', `${h.db.mail_po} / ${h.db.mail_farmer}`)

  /* Idempotente : un second appel (le déclencheur rejoué, un double clic) n'envoie rien. */
  const again = await processRequest(ID, false, h.deps)
  check('★ rappelée, elle n\'envoie RIEN de plus', again.status === 'skipped' && h.sent.length === 2, JSON.stringify(again))
  const retry = await processRequest(ID, true, h.deps)
  check('… même en « שליחה חוזרת » quand tout est parti', retry.status === 'skipped' && h.sent.length === 2)
}
{
  const h = harness(row({ email: '', mail_farmer: 'skipped' }), OK)
  await processRequest(ID, false, h.deps)
  check('sans adresse de l\'agriculteur : UN seul message, au PO', h.sent.length === 1 && h.sent[0].to === 'po@example.org', `${h.sent.length}`)
  check('… et l\'état le dit (skipped)', h.db.mail_farmer === 'skipped' && h.db.mail_po === 'sent')
}
{
  const h = harness(row({ appointment_at: null, document_ids: [] }), OK)
  await processRequest(ID, false, h.deps)
  const po = h.sent[0]
  check('sans rendez-vous ni document, le message le DIT', po.text.includes('לא נקבע מועד') && po.text.includes('לא צורפו מסמכים'))
}

// ===========================================================================
section('A265 — l\'échec d\'envoi ne perd pas la demande, et se voit')
// ===========================================================================
{
  const h = harness(row(), null)
  const out = await processRequest(ID, false, h.deps)
  check('★ sans clé d\'expéditeur : aucun envoi tenté', h.sent.length === 0)
  check('… l\'état est « not_configured » des deux côtés', h.db.mail_po === 'not_configured' && h.db.mail_farmer === 'not_configured', `${h.db.mail_po} / ${h.db.mail_farmer}`)
  check('… avec la raison', String(h.db.mail_error).includes('RESEND_API_KEY'), String(h.db.mail_error))
  check('… et la ligne de demande est entière (rien d\'effacé)', h.db.full_name === 'ישראל ישראלי' && h.db.phone === '052-0000000' && h.db.entity_id === 'farm-req-aq00000001')
  check('la fonction rend « done », pas une erreur', out.status === 'done')
}
{
  const h = harness(row(), async () => ({ ok: false as const, error: '500 boom' }))
  await processRequest(ID, false, h.deps)
  check('★ expéditeur en panne : failed / failed, avec l\'erreur', h.db.mail_po === 'failed' && h.db.mail_farmer === 'failed' && String(h.db.mail_error).includes('500'), String(h.db.mail_error))
  check('… la demande est intacte', h.db.full_name === 'ישראל ישראלי' && h.db.reference === 'AQ0001')
  /* Le PO touche « שליחה חוזרת » quand l'expéditeur est revenu. */
  const hh = harness({ ...(h.db as unknown as RequestRow) }, OK)
  const fresh = await processRequest(ID, false, hh.deps)
  check('sans « retry », un échec n\'est pas relancé tout seul', fresh.status === 'skipped' && hh.sent.length === 0)
  const retried = await processRequest(ID, true, hh.deps)
  check('★ « שליחה חוזרת » renvoie les deux', retried.status === 'done' && hh.sent.length === 2 && hh.db.mail_po === 'sent', `${hh.sent.length} · ${hh.db.mail_po}`)
}
{
  const h = harness(row(), async (m) => (m.to === 'po@example.org' ? { ok: true as const } : { ok: false as const, error: '422 domaine non vérifié' }))
  await processRequest(ID, false, h.deps)
  check('un seul des deux en échec : chacun porte SON état', h.db.mail_po === 'sent' && h.db.mail_farmer === 'failed', `${h.db.mail_po} / ${h.db.mail_farmer}`)
  const hh = harness({ ...(h.db as unknown as RequestRow) }, OK)
  await processRequest(ID, true, hh.deps)
  check('… et la nouvelle tentative ne renvoie QUE celui qui a échoué', hh.sent.length === 1 && hh.sent[0].to === 'farmer@example.org', `${hh.sent.map((m) => m.to).join(',')}`)
}
{
  const h = harness(row({ mail_attempts: MAX_ATTEMPTS, mail_po: 'failed', mail_farmer: 'failed' }), OK)
  const out = await processRequest(ID, true, h.deps)
  check(`plafond : au-delà de ${MAX_ATTEMPTS} tentatives, plus rien (un appel anonyme ne peut pas arroser)`, out.status === 'skipped' && h.sent.length === 0)
}
{
  const h = harness(row(), async () => {
    throw new Error('réseau coupé')
  })
  await processRequest(ID, false, h.deps)
  check('une exception de l\'expéditeur devient un « failed » consigné', h.db.mail_po === 'failed' && String(h.db.mail_error).includes('réseau'), String(h.db.mail_error))
}
{
  const h = harness(row(), OK)
  const out = await processRequest('00000000-0000-4000-8000-00000000dead', false, h.deps)
  check('un identifiant inconnu ne fait rien', out.status === 'not_found' && h.sent.length === 0)
}

// ===========================================================================
section('A265 — le chemin en base : l\'envoi part APRÈS l\'écriture, et ne peut pas la défaire')
// ===========================================================================
{
  const sql = readFileSync('supabase/migrations/20260925000400_intake_mail.sql', 'utf8')
  const stmts = sql.replace(/--[^\n]*\n/g, '\n').split(/;\s*\n/)
  const trig = stmts.find((s) => /create trigger aid_requests_mail_dispatch/i.test(s)) ?? ''
  check('le déclencheur d\'envoi est AFTER INSERT', /after\s+insert\s+on\s+public\.aid_requests/i.test(trig), trig.replace(/\s+/g, ' ').trim().slice(0, 80))
  const fn = sql.slice(sql.indexOf('create or replace function public.aid_requests_mail_dispatch'))
  check('★ l\'appel est rattrapé : « exception when others » (jamais d\'échec de l\'insertion)', /exception\s+when\s+others\s+then/i.test(fn))
  check('il passe par pg_net (file asynchrone, hors transaction)', /net\.http_post/.test(fn))
  check('il n\'envoie que l\'identifiant, pas la demande', /jsonb_build_object\('id',\s*new\.id\)/.test(fn))
  check('⛔ aucun droit pour anon dans cette migration', !/to\s+anon/i.test(sql))
}

// ===========================================================================
section('A266 — aucune clé secrète dans le code servi au navigateur')
// ===========================================================================
const PATTERNS: Array<[string, RegExp]> = [
  ['une clé Resend (re_…)', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/],
  ['le nom RESEND_API_KEY', /RESEND_API_KEY/],
  ['une clé secrète Supabase (sb_secret_…)', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['le nom SERVICE_ROLE', /SERVICE_ROLE/i],
  ['le code de la fonction Edge', /api\.resend\.com/],
]
function jwtRoles(text: string): string[] {
  const roles: string[] = []
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString('utf8')) as { role?: string }
      roles.push(payload.role ?? '?')
    } catch {
      /* pas un jeton */
    }
  }
  return roles
}
function scan(name: string, text: string, hits: string[]): void {
  for (const [label, re] of PATTERNS) if (re.test(text)) hits.push(`${name} : ${label}`)
  for (const role of jwtRoles(text)) if (role !== 'anon') hits.push(`${name} : jeton ${role}`)
}

const DIST = process.env.DIST ?? 'dist'
if (existsSync(DIST)) {
  const hits: string[] = []
  let files = 0
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(js|html|json|css|webmanifest|map)$/.test(f)) {
        files++
        scan(p, readFileSync(p, 'utf8'), hits)
      }
    }
  }
  walk(DIST)
  check(`★ ${DIST}/ : ${files} fichiers lus, aucun secret`, files > 0 && hits.length === 0, hits.slice(0, 4).join(' | '))
} else {
  check(`${DIST}/ existe (build à lire)`, false, 'lancer `bun run build` avant')
}

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '')
if (REMOTE) {
  /* ★ EN LARGEUR : chaque script servi est lu, et chaque nom de script qu'il
     porte (morceaux paresseux compris) est suivi — une clé cachée dans un
     écran chargé à la demande est servie au navigateur tout autant. */
  const hits: string[] = []
  const seen = new Set<string>()
  const queue: string[] = []
  for (const root of [`${REMOTE}/`, `${REMOTE}/bakasha/`, `${REMOTE}/demo/`]) {
    const html = await (await fetch(`${root}?aqmail=${Date.now()}`)).text()
    scan(root, html, hits)
    for (const m of html.matchAll(/(?:src|href)="([^"]+\.js)"/g)) queue.push(new URL(m[1], root).href)
  }
  while (queue.length > 0 && seen.size < 400) {
    const url = queue.shift() as string
    if (seen.has(url)) continue
    seen.add(url)
    const res = await fetch(url)
    if (!res.ok) continue
    const js = await res.text()
    scan(url, js, hits)
    for (const c of js.matchAll(/["'`(,]\s*(?:\.\.?\/)?(?:assets\/)?([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{6,}\.js)["'`]/g)) {
      queue.push(new URL(c[1], url).href)
    }
  }
  check(`★ DÉPLOYÉ : ${seen.size} scripts servis lus (entrées ET morceaux paresseux), aucun secret`, seen.size > 10 && hits.length === 0, hits.slice(0, 4).join(' | '))
}

/* Le secret n'a pas de place dans le dépôt non plus. */
{
  const tracked = Bun.spawnSync(['git', 'ls-files']).stdout.toString().split('\n').filter(Boolean)
  const hits: string[] = []
  for (const f of tracked) {
    if (!/\.(ts|tsx|js|json|sql|md|env|toml|example|real)$/.test(f) && !f.startsWith('.env')) continue
    if (!existsSync(f) || statSync(f).size > 2_000_000) continue
    const text = readFileSync(f, 'utf8')
    if (/\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/.test(text) || /sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) hits.push(f)
  }
  check('aucune clé d\'expéditeur ni clé secrète dans les fichiers suivis', hits.length === 0, hits.join(', '))
  const fn = readFileSync('supabase/functions/intake-mail/index.ts', 'utf8')
  check('la fonction lit sa clé dans Deno.env, jamais en dur', /Deno\.env\.get\('RESEND_API_KEY'\)/.test(fn) && !/re_[A-Za-z0-9]{8,}/.test(fn))
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
