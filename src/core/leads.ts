import { findLocality } from './gazetteer'
import { regionOf } from './regions'
import type { Lead, LeadStatus, RegionId } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AS6 (2026-10-07) — LA SALLE D'ATTENTE DES CONTACTS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le PO reçoit des contacts par WhatsApp, souvent vingt d'un coup. Ils
 *     s'empilent, il en oublie. »
 *
 * Une PISTE n'est pas une ferme (voir `Lead`). Ce module est pur : le bloc
 * collé → des pistes proposées ; une piste → sa région ; des pistes → des
 * listes triées.
 *
 * ★★ LE COLLAGE EST TOLÉRANT, PARCE QUE CES TEXTES NE SONT JAMAIS BIEN FORMÉS.
 *   Formes reconnues, mesurées sur ce que WhatsApp produit réellement :
 *   - la carte de contact (vCard : `BEGIN:VCARD … FN: … TEL;waid=…: … END`) ;
 *   - « שם 050-1234567 מקום », dans n'importe quel ordre, séparé par des
 *     espaces, tirets, virgules, barres, deux-points ;
 *   - le numéro seul sur sa ligne, le nom sur la ligne d'AVANT ;
 *   - une ligne « מקום » seule APRÈS un contact : c'est son lieu ;
 *   - les lignes d'un export de discussion (`[7.10.2026, 12:13] יוסי: …`),
 *     dont l'horodatage et l'expéditeur sont retirés ;
 *   - +972, 972, espaces et tirets n'importe où dans le numéro.
 *   Le lieu est reconnu par le répertoire national des localités (1 330), y
 *   compris avec « מ » / « ב » collé devant (« מנתיבות »).
 *   Un numéro déjà connu (piste ou ferme) est SIGNALÉ et décoché, pas refusé.
 */

/**
 * ★★ AT2.5 — CINQ STATUTS, PAS SEPT. Ce que le PO note après un appel, et
 *    rien d'autre :
 *    - חדש (`not_called`)         : reçu, pas encore appelé ;
 *    - ממתין לתשובה (`no_answer`) : appelé sans réponse OU message laissé — dans
 *      les deux cas la balle est chez eux, et le geste suivant est le même
 *      (réessayer). « שלחתי הודעה » (`message_sent`, ajouté en AS) s'y fond ;
 *    - לחזור אליו (`call_back`)   : on s'est parlé, on se rappelle ;
 *    - נקבעה פגישה (`meeting_set`) ;
 *    - לא רלוונטי (`not_now`)     : la porte se ferme — pour l'instant ou pour
 *      de bon, le geste est le même (la ligne sort de la liste active, reste
 *      consultable). « לא מעוניין » (`not_interested`, ajouté en AS) s'y fond.
 * ⚠️ Les deux anciennes valeurs restent LISIBLES (base, appareils pas encore à
 *    jour) : `normalizeLeadStatus` les replie ; la contrainte de la base les
 *    accepte toujours, pour qu'un iPad d'hier n'échoue pas à écrire.
 */
export const LEAD_STATUSES: readonly LeadStatus[] = ['not_called', 'no_answer', 'call_back', 'meeting_set', 'not_now']

/** Les statuts de la liste ACTIVE (le reste est replié en bas). */
export const LEAD_OPEN_STATUSES: readonly LeadStatus[] = ['not_called', 'no_answer', 'call_back', 'meeting_set']
export const LEAD_CLOSED_STATUSES: readonly LeadStatus[] = ['not_now']

export function normalizeLeadStatus(s: string): LeadStatus {
  if (s === 'message_sent') return 'no_answer'
  if (s === 'not_interested') return 'not_now'
  return (LEAD_STATUSES as readonly string[]).includes(s) ? (s as LeadStatus) : 'not_called'
}

export function leadRegionId(lead: Pick<Lead, 'regionId' | 'position'> & Partial<Pick<Lead, 'place'>>): RegionId | null {
  if (lead.regionId) return lead.regionId
  if (lead.position) return regionOf(lead.position)
  /* Un lieu dit sans point : la localité du répertoire national, s'il la connaît. */
  const loc = lead.place ? findLocality(lead.place) : null
  return loc ? regionOf(loc.position) : null
}

/**
 * ★★ AT2.6 — LES TRIS. « Le plus récent d'abord » (demandé), « mis à jour
 *    récemment » (ce que j'ai touché hier), l'alphabet, et la région (la veille
 *    d'une tournée). Tri STABLE : à égalité, le plus récent d'abord.
 */
export type LeadSort = 'newest' | 'updated' | 'name' | 'region'
export const LEAD_SORTS: readonly LeadSort[] = ['newest', 'updated', 'name', 'region']

export function sortLeads(leads: readonly Lead[], sort: LeadSort, regionName: (id: RegionId) => string = String): Lead[] {
  const newest = (a: Lead, b: Lead) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  const label = (l: Lead) => (l.name || l.contactName || l.phone).trim()
  const list = [...leads]
  switch (sort) {
    case 'newest':
      return list.sort(newest)
    case 'updated':
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || newest(a, b))
    case 'name':
      return list.sort((a, b) => label(a).localeCompare(label(b), 'he') || newest(a, b))
    case 'region': {
      const r = (l: Lead) => {
        const id = leadRegionId(l)
        return id ? regionName(id) : '\uffff'
      }
      return list.sort((a, b) => r(a).localeCompare(r(b), 'he') || newest(a, b))
    }
  }
}

/** Les comptes de la rangée d'onglets : tout ce qui est ouvert, puis par statut. */
export function leadCounts(leads: readonly Lead[]): Record<LeadStatus | 'open', number> {
  const out = { open: 0, not_called: 0, no_answer: 0, message_sent: 0, call_back: 0, meeting_set: 0, not_now: 0, not_interested: 0 }
  for (const l of leads) {
    if (l.convertedFarmId) continue
    const s = normalizeLeadStatus(l.status)
    out[s] += 1
    if (s !== 'not_now') out.open += 1
  }
  return out
}

// ---------------------------------------------------------------------------
// Le collage
// ---------------------------------------------------------------------------

export interface ParsedLead {
  name: string
  contactName: string
  phone: string
  /** ★ AT3 — un courriel trouvé n'importe où dans le bloc. */
  email: string
  place: string
  position: { lat: number; lng: number } | null
  notes: string
  raw: string
  /** Déjà connu : par une piste ou par une ferme. */
  duplicateOf: { kind: 'lead' | 'farm'; name: string } | null
  /** Ni numéro ni vCard : proposé décoché. */
  noPhone: boolean
}

const PHONE = /(?:\+?\s*9\s*7\s*2[\s\-.]*|\b0)(?:5\d|[23489]|7\d)(?:[\s\-.]*\d){7}\b/gu
const BIDI = /[‎‏‪-‮⁦-⁩﻿]/gu
const CHAT_PREFIX = /^\s*\[?\d{1,2}[./]\d{1,2}[./]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\]?\s*(?:-\s*)?(?:[^:\n]{1,40}:\s+)?/u
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u
/** WhatsApp préfixe d'un « ~ » le nom d'un numéro absent du carnet. */
const TILDE = /^\s*~\s*/u
/**
 * ★★ AT3 — LES FICHES « ÉTIQUETÉES ». Ce que Tamir envoie souvent, une ligne
 * par champ : « שם: … / טלפון: … / ישוב: … / מייל: … ». Reconnues par
 * l'étiquette, dans n'importe quel ordre, une fiche par paragraphe.
 */
const LABELS: ReadonlyArray<{ field: 'farm' | 'contact' | 'phone' | 'place' | 'email' | 'notes'; re: RegExp }> = [
  { field: 'farm', re: /^(?:שם\s*(?:ה)?(?:חווה|משק|עסק)|חווה|משק|ארגון|org)\s*[:：-]\s*/iu },
  { field: 'contact', re: /^(?:שם(?:\s*מלא)?|איש\s*קשר|שם\s*איש\s*(?:ה)?קשר|name)\s*[:：-]\s*/iu },
  { field: 'phone', re: /^(?:טלפון|טל[׳']?|נייד|פלאפון|סלולרי|מספר|phone|tel)\s*[:：-]\s*/iu },
  { field: 'place', re: /^(?:ישוב|יישוב|מקום|מושב|קיבוץ|כתובת|אזור|עיר|place|address)\s*[:：-]\s*/iu },
  { field: 'email', re: /^(?:מייל|אימייל|דוא[״"]?ל|email|e-mail)\s*[:：-]\s*/iu },
  { field: 'notes', re: /^(?:הערות?|הערה|פרטים|notes?)\s*[:：-]\s*/iu },
]

function parseLabelled(block: string): Omit<ParsedLead, 'duplicateOf' | 'noPhone'> | null {
  const got: Partial<Record<(typeof LABELS)[number]['field'], string>> = {}
  let hits = 0
  for (const raw of block.split('\n')) {
    const line = raw.replace(CHAT_PREFIX, '').trim()
    for (const { field, re } of LABELS) {
      if (re.test(line)) {
        got[field] = line.replace(re, '').trim()
        hits++
        break
      }
    }
  }
  if (hits < 2) return null
  const phone = got.phone ? ([...got.phone.matchAll(PHONE)][0]?.[0] ?? '') : ''
  const place = findPlaceIn(got.place ?? '')
  const email = (got.email && EMAIL_RE.exec(got.email)?.[0]) || EMAIL_RE.exec(block)?.[0] || ''
  const names = splitNames(got.contact ?? '')
  const farm = got.farm?.trim() || names.name
  return {
    name: farm || got.contact || place.place,
    contactName: names.contactName || got.contact || '',
    phone: phone ? canonicalLeadPhone(phone) : '',
    email,
    place: place.place || (got.place ?? ''),
    position: place.position,
    notes: got.notes ?? '',
    raw: block.trim(),
  }
}

const FARM_WORDS = /(חוות?|משק|רפת|דיר|לול|גד״ש|גד"ש|גדש|מושב|קיבוץ|מכוורת|כרם|מטע|שח״ם|שח"ם)/u

/** Le numéro au format de l'app : `05X-XXXXXXX`, `0X-XXXXXXX`. */
export function canonicalLeadPhone(raw: string): string {
  let d = raw.replace(/\D/gu, '')
  if (d.startsWith('972')) d = `0${d.slice(3)}`
  if (d.length === 10 && d.startsWith('05')) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length === 10 && d.startsWith('07')) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length === 9 && d.startsWith('0')) return `${d.slice(0, 2)}-${d.slice(2)}`
  return raw.trim()
}

export function phoneKeyOf(phone: string | null | undefined): string {
  let d = (phone ?? '').replace(/\D/gu, '')
  if (d.startsWith('972')) d = `0${d.slice(3)}`
  return d.length >= 9 ? d : ''
}

function cleanText(s: string): string {
  return s
    .replace(/[|,;:•·\-–—_/\\()[\]*]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** La plus longue suite de 1 à 3 mots qui nomme une localité, « מ »/« ב » tolérés. */
export function findPlaceIn(text: string): { place: string; position: { lat: number; lng: number } | null; rest: string } {
  const words = text.split(/\s+/u).filter(Boolean)
  for (let len = Math.min(3, words.length); len >= 1; len--) {
    for (let i = words.length - len; i >= 0; i--) {
      const chunk = words.slice(i, i + len).join(' ')
      const tries = [chunk]
      if (/^[מב]/u.test(chunk) && chunk.length > 3) tries.push(chunk.slice(1))
      for (const t of tries) {
        if (len === 1 && t.replace(/[״"']/gu, '').length < 3) continue
        const loc = findLocality(t)
        if (loc) {
          const rest = [...words.slice(0, i), ...words.slice(i + len)].join(' ')
          return { place: loc.name, position: loc.position, rest }
        }
      }
    }
  }
  return { place: '', position: null, rest: text }
}

function splitNames(text: string): { name: string; contactName: string } {
  const t = cleanText(text)
  if (!t) return { name: '', contactName: '' }
  const m = FARM_WORDS.exec(t)
  if (m && m.index !== undefined) {
    const farm = t.slice(m.index).trim()
    const person = t.slice(0, m.index).trim()
    if (person) return { name: farm, contactName: person }
    return { name: farm, contactName: '' }
  }
  return { name: t, contactName: t }
}

function parseVCards(text: string): { cards: Array<{ fn: string; org: string; tel: string; tels: string[]; email: string; note: string; adr: string }>; rest: string } {
  const cards: Array<{ fn: string; org: string; tel: string; tels: string[]; email: string; note: string; adr: string }> = []
  const rest = text.replace(/BEGIN:VCARD[\s\S]*?END:VCARD/giu, (raw) => {
    /* Lignes repliées (RFC 6350 : une ligne qui commence par un espace continue la précédente). */
    const block = raw.replace(/\n[ \t]/gu, '')
    /* `item1.TEL;…:` — le préfixe de groupe d'Apple et de WhatsApp. */
    const all = (k: string): string[] =>
      [...block.matchAll(new RegExp(`^(?:item\\d+\\.)?${k}(?:;[^:\\n]*)?:(.*)$`, 'gimu'))].map((m) => m[1].trim()).filter(Boolean)
    const line = (k: string): string => all(k)[0] ?? ''
    let fn = line('FN')
    if (!fn) fn = line('N').split(';').filter(Boolean).reverse().join(' ')
    const waids = [...block.matchAll(/waid=(\d+)/giu)].map((m) => m[1])
    const tels = all('TEL').length ? all('TEL') : waids
    cards.push({
      fn,
      org: line('ORG').split(';').filter(Boolean).join(' '),
      tel: tels[0] ?? '',
      tels,
      email: line('EMAIL'),
      note: line('NOTE'),
      adr: line('ADR').split(';').filter(Boolean).join(' '),
    })
    return '\n'
  })
  return { cards, rest }
}

export interface ParseContext {
  leads?: ReadonlyArray<Pick<Lead, 'phone' | 'name' | 'convertedFarmId'>>
  farms?: ReadonlyArray<{ farmerPhone?: string; liaisonPhone?: string; name: string }>
}

export function parseLeadBlock(text: string, ctx: ParseContext = {}): ParsedLead[] {
  const known = new Map<string, { kind: 'lead' | 'farm'; name: string }>()
  for (const f of ctx.farms ?? []) {
    for (const p of [f.farmerPhone, f.liaisonPhone]) if (phoneKeyOf(p)) known.set(phoneKeyOf(p), { kind: 'farm', name: f.name })
  }
  for (const l of ctx.leads ?? []) if (phoneKeyOf(l.phone)) known.set(phoneKeyOf(l.phone), { kind: 'lead', name: l.name })

  const out: ParsedLead[] = []
  const seen = new Set<string>()
  const push = (p: Omit<ParsedLead, 'duplicateOf' | 'noPhone'>): void => {
    const key = phoneKeyOf(p.phone)
    if (key && seen.has(key)) {
      const prev = out.find((o) => phoneKeyOf(o.phone) === key)
      if (prev && !prev.place && p.place) Object.assign(prev, { place: p.place, position: p.position })
      return
    }
    if (key) seen.add(key)
    out.push({ ...p, duplicateOf: key ? (known.get(key) ?? null) : null, noPhone: !key })
  }

  const clean = text.replace(BIDI, '').replace(/\r\n?/gu, '\n')
  const { cards, rest } = parseVCards(clean)
  for (const c of cards) {
    const fn = c.fn.replace(TILDE, '')
    const names = splitNames(fn)
    const place = findPlaceIn(`${c.adr} ${c.org} ${c.note}`.trim())
    push({
      /* ORG est le nom de l'exploitation quand la carte en porte un. */
      name: c.org || names.name || fn,
      contactName: c.org ? fn : names.contactName || fn,
      phone: canonicalLeadPhone(c.tel),
      email: EMAIL_RE.exec(c.email)?.[0] ?? '',
      place: place.place,
      position: place.position,
      notes: [c.note, ...c.tels.slice(1).map(canonicalLeadPhone)].filter(Boolean).join(' · '),
      raw: `${fn} ${c.tel}`.trim(),
    })
  }

  /* ★ AT3 — les fiches étiquetées, un paragraphe chacune. */
  const paragraphs = rest.split(/\n\s*\n/u)
  const unlabelled: string[] = []
  for (const para of paragraphs) {
    const rec = parseLabelled(para)
    if (rec) push(rec)
    else unlabelled.push(para)
  }

  let pending: string[] = []
  let last: ParsedLead | null = null
  for (const rawLine of unlabelled.join('\n').split('\n')) {
    let line = rawLine.replace(CHAT_PREFIX, '').replace(TILDE, '').trim()
    if (!line) continue
    /* ★ AT3 — un courriel sur la ligne : il va au champ courriel, pas au nom. */
    const mail = EMAIL_RE.exec(line)?.[0] ?? ''
    if (mail) {
      line = line.replace(mail, ' ').trim()
      if (last && !last.email && ![...line.matchAll(PHONE)].length && cleanText(line).length < 3) {
        last.email = mail
        continue
      }
    }
    const phones = [...line.matchAll(PHONE)].map((m) => m[0])
    if (phones.length === 0) {
      /* Une ligne qui n'est QU'UN lieu, juste après un contact : son lieu. */
      const only = findPlaceIn(cleanText(line))
      if (last && !last.place && only.place && cleanText(only.rest) === '') {
        last.place = only.place
        last.position = only.position
        continue
      }
      pending.push(line)
      continue
    }
    let textPart = line
    for (const p of phones) textPart = textPart.replace(p, ' ')
    textPart = cleanText(textPart)
    if (!textPart && pending.length > 0) textPart = cleanText(pending.join(' '))
    pending = []
    const place = findPlaceIn(textPart)
    const names = splitNames(place.rest)
    const before = out.length
    push({
      name: names.name || names.contactName || place.place,
      contactName: names.contactName,
      phone: canonicalLeadPhone(phones[0]),
      email: mail,
      place: place.place,
      position: place.position,
      notes: phones.slice(1).map(canonicalLeadPhone).join(' · '),
      raw: rawLine.trim(),
    })
    last = out.length > before ? out[out.length - 1] : last
  }
  /* Ce qui reste sans numéro : proposé, décoché (souvent du bavardage). */
  for (const line of pending) {
    const t = cleanText(line)
    if (t.length < 2) continue
    const place = findPlaceIn(t)
    const names = splitNames(place.rest)
    push({ name: names.name || place.place, contactName: names.contactName, phone: '', email: EMAIL_RE.exec(line)?.[0] ?? '', place: place.place, position: place.position, notes: '', raw: line })
  }
  return out
}
