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
 * colonnes.
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

/** L'ordre des colonnes du tableau. */
export const LEAD_STATUSES: readonly LeadStatus[] = [
  'not_called',
  'no_answer',
  'message_sent',
  'call_back',
  'meeting_set',
  'not_now',
  'not_interested',
]

/** Les deux statuts « porte non fermée » : la piste reste, marquée. */
export const LEAD_CLOSED_STATUSES: readonly LeadStatus[] = ['not_now', 'not_interested']

export function leadRegionId(lead: Pick<Lead, 'regionId' | 'position'> & Partial<Pick<Lead, 'place'>>): RegionId | null {
  if (lead.regionId) return lead.regionId
  if (lead.position) return regionOf(lead.position)
  /* Un lieu dit sans point : la localité du répertoire national, s'il la connaît. */
  const loc = lead.place ? findLocality(lead.place) : null
  return loc ? regionOf(loc.position) : null
}

export type LeadGrouping = 'status' | 'region'

export interface LeadColumn {
  key: string
  status: LeadStatus | null
  regionId: RegionId | null | 'none'
  leads: Lead[]
}

export function leadColumns(leads: readonly Lead[], by: LeadGrouping, regionOrder: readonly RegionId[]): LeadColumn[] {
  const open = leads.filter((l) => !l.convertedFarmId)
  const sorted = [...open].sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt))
  if (by === 'status') {
    return LEAD_STATUSES.map((s) => ({ key: s, status: s, regionId: null, leads: sorted.filter((l) => l.status === s) }))
  }
  const cols: LeadColumn[] = regionOrder.map((r) => ({ key: r, status: null, regionId: r, leads: sorted.filter((l) => leadRegionId(l) === r) }))
  cols.push({ key: 'none', status: null, regionId: 'none', leads: sorted.filter((l) => leadRegionId(l) === null) })
  return cols.filter((c) => c.leads.length > 0 || c.regionId === 'none')
}

// ---------------------------------------------------------------------------
// Le collage
// ---------------------------------------------------------------------------

export interface ParsedLead {
  name: string
  contactName: string
  phone: string
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

function parseVCards(text: string): { cards: Array<{ fn: string; tel: string; note: string; adr: string }>; rest: string } {
  const cards: Array<{ fn: string; tel: string; note: string; adr: string }> = []
  const rest = text.replace(/BEGIN:VCARD[\s\S]*?END:VCARD/giu, (block) => {
    const line = (k: string): string => {
      const m = new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, 'imu').exec(block)
      return m ? m[1].trim() : ''
    }
    let fn = line('FN')
    if (!fn) fn = line('N').split(';').filter(Boolean).reverse().join(' ')
    const tel = line('TEL') || (/waid=(\d+)/iu.exec(block)?.[1] ?? '')
    cards.push({ fn, tel, note: line('NOTE'), adr: line('ADR').split(';').filter(Boolean).join(' ') })
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
    const names = splitNames(c.fn)
    const place = findPlaceIn(`${c.adr} ${c.note}`.trim())
    push({
      name: names.name || c.fn,
      contactName: names.contactName || c.fn,
      phone: canonicalLeadPhone(c.tel),
      place: place.place,
      position: place.position,
      notes: c.note,
      raw: `${c.fn} ${c.tel}`.trim(),
    })
  }

  let pending: string[] = []
  let last: ParsedLead | null = null
  for (const rawLine of rest.split('\n')) {
    const line = rawLine.replace(CHAT_PREFIX, '').trim()
    if (!line) continue
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
    push({ name: names.name || place.place, contactName: names.contactName, phone: '', place: place.place, position: place.position, notes: '', raw: line })
  }
  return out
}
