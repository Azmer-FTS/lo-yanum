/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AQ3 (2026-09-25) — LES DEUX COURRIELS D'UNE DEMANDE PUBLIQUE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le cœur de la fonction Edge `intake-mail`, SANS Deno ni réseau : tout ce qui
 * parle au monde (la base, l'expéditeur, l'horloge) est passé en argument.
 * `index.ts` le branche sur Deno ; `scripts/aqmail.ts` le branche sur des
 * doublures et prouve A265 sans envoyer un seul message.
 *
 * ★ L'ORDRE EST LA GARANTIE D'AQ3.4. La demande est déjà en base quand cette
 *   fonction tourne (un déclencheur `after insert` l'appelle) : elle ne peut
 *   donc rien perdre. Elle ne fait que consigner, sur la ligne, ce qui est
 *   parti et ce qui n'est pas parti — et l'application le montre.
 *
 * ★ IDEMPOTENTE, ET C'EST CE QUI LA REND SÛRE SANS JETON. Elle ne s'occupe
 *   que d'une demande dont l'état le permet (`pending` à la création,
 *   `failed`/`not_configured` pour une nouvelle tentative, cinq au plus), et
 *   elle le RÉSERVE par une écriture conditionnelle avant d'envoyer. L'appeler
 *   dix fois avec le même identifiant envoie au plus un message de chaque.
 *
 * ⛔ CE QUI NE PART PAS : le numéro d'identité (ת״ז), la signature, les
 *    fichiers. Le message dit QUELS documents ont été fournis ; les documents
 *    restent dans l'application.
 */

export type MailState = 'pending' | 'sending' | 'sent' | 'failed' | 'not_configured' | 'skipped'

export interface RequestRow {
  id: string
  created_at: string
  need: string
  land_kind: string
  farm_name: string
  full_name: string
  phone: string
  email: string
  locality: string
  reference: string
  appointment_at: string | null
  entity_id: string | null
  document_ids: string[] | null
  mail_po: MailState | null
  mail_farmer: MailState | null
  mail_attempts: number | null
}

export interface Coordinator {
  name: string
  phone: string
  email: string
}

export interface Outgoing {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export interface Deps {
  /** La ligne, lue avec la clé de service. `null` si elle n'existe pas. */
  readRequest(id: string): Promise<RequestRow | null>
  /**
   * Écriture CONDITIONNELLE : n'écrit que si `mail_attempts` vaut encore
   * `expectedAttempts`. Rend vrai si la ligne a été écrite — c'est la réservation.
   */
  claim(id: string, expectedAttempts: number, patch: Record<string, unknown>): Promise<boolean>
  update(id: string, patch: Record<string, unknown>): Promise<void>
  coordinator(): Promise<Coordinator | null>
  /** `null` : aucune clé d'expéditeur sur le serveur. */
  send: ((message: Outgoing) => Promise<{ ok: true } | { ok: false; error: string }>) | null
  from: string
  appUrl: string
}

export const MAX_ATTEMPTS = 5

const NEED: Record<string, string> = {
  guarding: 'שמירה',
  farm_work: 'עזרה בעבודה חקלאית',
  both: 'שמירה ועזרה בעבודה חקלאית',
}
const LAND: Record<string, string> = {
  crops: 'גידולים',
  grazing: 'מרעה',
  both: 'גידולים ומרעה',
}
const DOC: Record<string, string> = {
  crops: 'מסמך זכות בקרקע — גידולים',
  grazing: 'מסמך זכות בקרקע — מרעה',
}

export function whenJerusalem(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** Un message hébreu, de droite à gauche, lisible sans images ni styles distants. */
function page(title: string, rows: Array<[string, string]>, foot: string): string {
  const body = rows
    .filter(([, v]) => v !== '')
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 0 4px 12px;color:#5b6472;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
        `<td style="padding:4px 0;color:#0b1220;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join('')
  return (
    `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f4f6f8">` +
    `<div dir="rtl" style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;text-align:right">` +
    `<h1 style="font-size:20px;margin:0 0 16px;color:#0b3d2c">${esc(title)}</h1>` +
    `<table dir="rtl" style="border-collapse:collapse">${body}</table>` +
    `<p style="margin:20px 0 0;color:#5b6472">${foot}</p>` +
    `</div></body></html>`
  )
}

function plain(title: string, rows: Array<[string, string]>, foot: string): string {
  return [title, '', ...rows.filter(([, v]) => v !== '').map(([k, v]) => `${k}: ${v}`), '', foot.replace(/<[^>]+>/g, '')].join('\n')
}

export function documentsLine(ids: readonly string[] | null): string {
  if (!ids || ids.length === 0) return 'לא צורפו מסמכים'
  return ids.map((id) => DOC[id] ?? id).join(' · ')
}

/** Le message au PO : tout ce qu'il faut pour rappeler sans ouvrir l'application. */
export function messageToCoordinator(r: RequestRow, to: string, appUrl: string): Outgoing {
  const title = `בקשת עזרה חדשה: ${r.farm_name}`
  const link = r.entity_id ? `${appUrl.replace(/\/$/, '')}/#/coordinator/farms/${r.entity_id}` : appUrl
  const rows: Array<[string, string]> = [
    ['שם', r.full_name],
    ['טלפון', r.phone],
    ['דוא״ל', r.email],
    ['המקום', r.farm_name],
    ['יישוב', r.locality],
    ['מה מבוקש', NEED[r.need] ?? r.need],
    ['סוג הקרקע', LAND[r.land_kind] ?? r.land_kind],
    ['מסמכים', documentsLine(r.document_ids)],
    ['מועד מבוקש', r.appointment_at ? `${whenJerusalem(r.appointment_at)} (ממתין לאישור)` : 'לא נקבע מועד'],
    ['התקבלה', whenJerusalem(r.created_at)],
    ['אסמכתא', r.reference],
  ]
  const foot = `הבקשה נשמרה באפליקציה: <a href="${esc(link)}">${esc(link)}</a>`
  return {
    to,
    subject: `${title} · ${r.full_name}`,
    html: page(title, rows, foot),
    text: plain(title, rows, `הבקשה נשמרה באפליקציה: ${link}`),
    replyTo: r.email || undefined,
  }
}

/** L'accusé de réception à l'agriculteur : sa référence et à qui parler. */
export function messageToFarmer(r: RequestRow, coordinator: Coordinator | null): Outgoing {
  const title = 'קיבלנו את בקשתך'
  const rows: Array<[string, string]> = [
    ['אסמכתא', r.reference],
    ['המקום', r.farm_name],
    ['מה ביקשת', NEED[r.need] ?? r.need],
    ['מועד שביקשת', r.appointment_at ? `${whenJerusalem(r.appointment_at)} — נאשר אותו בהקדם` : ''],
    ['רכז/ת', coordinator?.name ?? ''],
    ['טלפון הרכז/ת', coordinator?.phone ?? ''],
    ['דוא״ל הרכז/ת', coordinator?.email ?? ''],
  ]
  const foot = 'תודה שפנית אלינו. ניצור איתך קשר בקרוב. אפשר להשיב להודעה זו.'
  return {
    to: r.email,
    subject: `קיבלנו את בקשתך · אסמכתא ${r.reference}`,
    html: page(title, rows, foot),
    text: plain(title, rows, foot),
    replyTo: coordinator?.email || undefined,
  }
}

export interface Outcome {
  status: 'done' | 'skipped' | 'not_found'
  po?: MailState
  farmer?: MailState
  error?: string | null
}

/**
 * Le parcours entier. `retry` : le PO a touché « שליחה חוזרת ». Sans lui, seule
 * une demande neuve (`pending`) est prise.
 */
export async function processRequest(id: string, retry: boolean, deps: Deps): Promise<Outcome> {
  const row = await deps.readRequest(id)
  if (!row) return { status: 'not_found' }
  const attempts = row.mail_attempts ?? 0
  const open: MailState[] = retry ? ['pending', 'failed', 'not_configured'] : ['pending']
  const poOpen = open.includes(row.mail_po ?? 'pending')
  const farmerOpen = row.email !== '' && open.includes(row.mail_farmer ?? 'pending')
  if ((!poOpen && !farmerOpen) || attempts >= MAX_ATTEMPTS) return { status: 'skipped' }

  /* La réservation : une seule exécution passe, les autres trouvent `attempts` changé. */
  const claimed = await deps.claim(id, attempts, {
    mail_attempts: attempts + 1,
    ...(poOpen ? { mail_po: 'sending' } : {}),
    ...(farmerOpen ? { mail_farmer: 'sending' } : {}),
  })
  if (!claimed) return { status: 'skipped' }

  const errors: string[] = []
  let po: MailState | undefined
  let farmer: MailState | undefined = row.email === '' ? 'skipped' : undefined

  if (!deps.send) {
    if (poOpen) po = 'not_configured'
    if (farmerOpen) farmer = 'not_configured'
    errors.push('RESEND_API_KEY absent : aucun expéditeur configuré')
  } else {
    const coordinator = await deps.coordinator().catch(() => null)
    if (poOpen) {
      if (!coordinator?.email) {
        po = 'failed'
        errors.push('adresse du coordinateur introuvable')
      } else {
        const res = await deps.send(messageToCoordinator(row, coordinator.email, deps.appUrl)).catch((e: unknown) => ({
          ok: false as const,
          error: String(e),
        }))
        po = res.ok ? 'sent' : 'failed'
        if (!res.ok) errors.push(`coordinateur : ${res.error}`)
      }
    }
    if (farmerOpen) {
      const res = await deps.send(messageToFarmer(row, coordinator)).catch((e: unknown) => ({
        ok: false as const,
        error: String(e),
      }))
      farmer = res.ok ? 'sent' : 'failed'
      if (!res.ok) errors.push(`agriculteur : ${res.error}`)
    }
  }

  const error = errors.length ? errors.join(' ; ').slice(0, 500) : null
  await deps.update(id, {
    ...(po ? { mail_po: po } : {}),
    ...(farmer ? { mail_farmer: farmer } : {}),
    mail_error: error,
    mail_at: new Date().toISOString(),
  })
  return { status: 'done', po, farmer, error }
}
