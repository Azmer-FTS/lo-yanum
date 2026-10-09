import { parsePositionInput } from './geo'
import { comparableInstitutionName, readInstitutionAudience, readInstitutionKind } from './institutions'
import type { Institution } from './institutions'
import { canonicalLeadPhone, findPlaceIn, parseLeadBlock, phoneKeyOf } from './leads'
import type { LatLng, Lead } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AW2 (2026-10-09) — AJOUTER DES CONTACTS : TROIS CHEMINS, UN SEUL CALCUL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La saisie champ par champ, le dépôt de fiches `.vcf` et le collage de texte
 * produisent tous la même chose : des BROUILLONS (`ContactDraft`) qu'on lit,
 * corrige ou retire avant d'écrire. Ce module est PUR (`bun run awpass`).
 *
 * ★ LE TYPE D'ABORD (AW2.0). Ferme, institution ou volontaire : le PO reçoit
 *   ses contacts par lots homogènes, et le type décide de TOUT le reste —
 *   quels mots d'un nom désignent l'exploitation ou l'institution, où la fiche
 *   est écrite (piste de la salle d'attente / fiche d'institution / volontaire
 *   rattaché), contre quoi on cherche les doublons.
 *
 * ★★ LE NOM MÉLANGE LA PERSONNE ET L'EXPLOITATION (AW2.3). Le carnet
 *   d'adresses du PO dit « אריאל גדש עציון » : אריאל est la personne, « גד״ש
 *   עציון » l'exploitation — Apple a rangé « גדש » en deuxième prénom et
 *   « עציון » en nom de famille. Le découpage cherche un MOT-MARQUEUR (גד״ש,
 *   משק, חוות, קיבוץ… ; ישיבת, מכינת…) : ce qui le précède est la personne, le
 *   marqueur et la suite sont l'exploitation. Le découpage est toujours une
 *   PROPOSITION : l'aperçu montre les mots, un toucher déplace la limite.
 *   ⛔ Un nom complet collé (« אריאל גדש עציון ») n'est jamais créé tel quel
 *   quand un marqueur est trouvé.
 */

export type ContactKind = 'farm' | 'institution' | 'volunteer'
export const CONTACT_KINDS: readonly ContactKind[] = ['farm', 'institution', 'volunteer'] as const

// ---------------------------------------------------------------------------
// Les mots qui désignent une exploitation ou une institution
// ---------------------------------------------------------------------------

/** Quote hébraïque et ses imitations, ramenées au גרשיים pour comparer. */
const Q = `[״"”'׳]?`
const FARM_MARKERS: RegExp[] = [
  new RegExp(`^גד${Q}ש$`, 'u'),
  /^משק$/u,
  /^חוו(?:ת|ה)$/u,
  /^קיבוץ$/u,
  /^מושב$/u,
  /^אגודה$/u,
  /^אגודת$/u,
  new RegExp(`^שח${Q}ם$`, 'u'),
  /^רפת$/u,
  /^דיר$/u,
  /^לול$/u,
  /^מכוורת$/u,
  /^מטע$/u,
]
const INSTITUTION_MARKERS: RegExp[] = [
  /^ישיב(?:ה|ת)$/u,
  /^מכינ(?:ה|ת)$/u,
  /^מדרש(?:ה|ת)$/u,
  /^כולל$/u,
  /^אולפנ(?:ה|ת)$/u,
  /^המכינה$/u,
  /^הישיבה$/u,
]
/** Titres gardés AVEC le prénom : « הרב אמיר ». */
const TITLES = /^(?:הרב|הרבנית|רב|ר['׳]|הר"ר|ד"ר|דר['׳]|מר|גב['׳])$/u

/**
 * Les marqueurs cherchés pour un type. ★ Un VOLONTAIRE n'a ni exploitation ni
 * institution dans son nom : tout marqueur (גד״ש comme ישיבת) y commence une
 * mention à ôter du nom — gardée en note, jamais dans le nom de la personne.
 */
export function markersFor(kind: ContactKind): RegExp[] {
  return kind === 'farm' ? FARM_MARKERS : kind === 'institution' ? INSTITUTION_MARKERS : [...INSTITUTION_MARKERS, ...FARM_MARKERS]
}

/** Les graphies du PO ramenées à une seule : « גדש » → « גד״ש », « שחם » → « שח״ם ». */
export function normalizeOrgName(s: string): string {
  return s
    .replace(new RegExp(`(^|\\s)גד${Q}ש(?=\\s|$)`, 'gu'), '$1גד״ש')
    .replace(new RegExp(`(^|\\s)שח${Q}ם(?=\\s|$)`, 'gu'), '$1שח״ם')
    .replace(/\s+/gu, ' ')
    .trim()
}

const BIDI = /[‎‏‪-‮⁦-⁩﻿]/gu
export function nameTokens(s: string): string[] {
  return s
    .replace(BIDI, '')
    .replace(/^\s*~\s*/u, '')
    .replace(/[,|•·]+/gu, ' ')
    .split(/\s+/u)
    // Un tiret ou une ponctuation seule n'est pas un mot du nom.
    .filter((w) => w && !/^[-–—_.:;/\\*]+$/u.test(w))
}

/** L'indice du premier mot-marqueur, ou -1. */
export function markerIndex(tokens: readonly string[], kind: ContactKind): number {
  const markers = markersFor(kind)
  return tokens.findIndex((t) => markers.some((m) => m.test(t)))
}

// ---------------------------------------------------------------------------
// Le brouillon
// ---------------------------------------------------------------------------

export type SplitOrigin = 'marker' | 'orgField' | 'none' | 'manual' | 'form'

export interface ContactDraft {
  /** Clé stable dans l'aperçu. */
  key: string
  firstName: string
  lastName: string
  /** L'exploitation ou l'institution (vide pour un volontaire). */
  orgName: string
  /** Le nom tel que la fiche le donnait, et ses mots, pour corriger d'un geste. */
  fullName: string
  tokens: string[]
  /** Indice du premier mot de l'organisation dans `tokens`, `null` = aucun. */
  orgStart: number | null
  split: SplitOrigin
  /** Format de l'app (`05X-XXXXXXX`). */
  phone: string
  /** Les autres numéros, déjà mis en forme. */
  otherPhones: string[]
  email: string
  /** L'adresse brute, quand la fiche en portait une. */
  address: string
  /** La localité reconnue (gazetteer), sinon `''`. */
  place: string
  position: LatLng | null
  /** D'où vient le point. */
  positionFrom: 'waze' | 'google' | 'coords' | 'locality' | null
  notes: string
  /** Pour un volontaire : l'institution que SA fiche nommait (information seule). */
  cardInstitution: string
  origin: { path: 'form' | 'vcf' | 'paste'; file?: string }
  /** Ce qui n'a pas été compris ou manque, en codes (traduits à l'écran). */
  problems: ContactProblem[]
}

export type ContactProblem = 'noName' | 'noPhone' | 'noPlace' | 'shortLink' | 'unreadLocation' | 'splitUncertain' | 'noOrg'

let seq = 0
const nextKey = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * Applique un découpage : les mots avant `orgStart` sont la personne, les
 * autres l'organisation. Le prénom est le premier mot (titre compris), le nom
 * de famille le reste. `null` = aucune organisation dans le nom.
 */
export function applySplit(d: ContactDraft, orgStart: number | null, kind: ContactKind, origin: SplitOrigin = 'manual'): ContactDraft {
  const tokens = d.tokens
  const cut = orgStart === null ? tokens.length : Math.max(0, Math.min(tokens.length, orgStart))
  const person = tokens.slice(0, cut)
  let first = person[0] ?? ''
  let rest = person.slice(1)
  if (TITLES.test(first) && rest.length > 0) {
    first = `${first} ${rest[0]}`
    rest = rest.slice(1)
  }
  const orgText = normalizeOrgName(tokens.slice(cut).join(' '))
  const next: ContactDraft = {
    ...d,
    orgStart: orgStart === null ? null : cut,
    split: origin,
    firstName: first,
    lastName: rest.join(' '),
  }
  if (kind === 'volunteer') {
    next.orgName = ''
    next.cardInstitution = orgText
  } else {
    // « Pas d'organisation dans le nom », choisi à la main : il n'y en a plus.
    // Au premier découpage, un nom venu du champ ORG de la fiche est gardé.
    next.orgName = orgText || (orgStart === null && origin !== 'manual' ? d.orgName : '')
  }
  return withProblems(next, kind)
}

function withProblems(d: ContactDraft, kind: ContactKind): ContactDraft {
  const p = new Set<ContactProblem>(d.problems.filter((x) => x === 'shortLink' || x === 'unreadLocation'))
  if (!displayName(d, kind)) p.add('noName')
  if (!phoneKeyOf(d.phone)) p.add('noPhone')
  if (kind !== 'volunteer' && !d.position) p.add('noPlace')
  if (kind === 'institution' && !d.orgName) p.add('noOrg')
  if (d.split === 'marker' && d.orgStart === 0) p.add('splitUncertain')
  return { ...d, problems: [...p] }
}

/** La personne, prénom + nom. */
export function personName(d: Pick<ContactDraft, 'firstName' | 'lastName'>): string {
  return `${d.firstName} ${d.lastName}`.replace(/\s+/gu, ' ').trim()
}

/** Ce qui sera le titre de la fiche créée. */
export function displayName(d: Pick<ContactDraft, 'firstName' | 'lastName' | 'orgName'>, kind: ContactKind): string {
  if (kind === 'volunteer') return personName(d)
  return d.orgName || personName(d)
}

/** Un brouillon depuis un nom et quelques champs : le découpage proposé est appliqué. */
export function draftFromName(
  input: {
    fullName: string
    orgField?: string
    nParts?: { family: string; given: string; additional: string }
    phone?: string
    otherPhones?: string[]
    email?: string
    address?: string
    notes?: string
    locationText?: string
    origin: ContactDraft['origin']
  },
  kind: ContactKind,
): ContactDraft {
  const fullName = input.fullName.replace(BIDI, '').replace(/\s+/gu, ' ').trim()
  const tokens = nameTokens(fullName)
  let d: ContactDraft = {
    key: nextKey(),
    firstName: '',
    lastName: '',
    orgName: '',
    fullName,
    tokens,
    orgStart: null,
    split: 'none',
    phone: input.phone ? canonicalLeadPhone(input.phone) : '',
    otherPhones: (input.otherPhones ?? []).map(canonicalLeadPhone),
    email: input.email ?? '',
    address: input.address ?? '',
    place: '',
    position: null,
    positionFrom: null,
    notes: input.notes ?? '',
    cardInstitution: '',
    origin: input.origin,
    problems: [],
  }
  // Le lieu : un lien ou des coordonnées d'abord, l'adresse ensuite.
  const loc = input.locationText ? readLocation(input.locationText) : null
  if (loc?.ok) {
    d.position = loc.position
    d.positionFrom = loc.via
  } else if (loc && !loc.ok && loc.reason !== 'empty') {
    d.problems.push(loc.reason === 'shortLink' ? 'shortLink' : 'unreadLocation')
  }
  const m = markerIndex(tokens, kind)
  if (m >= 0) {
    d = applySplit(d, m, kind, 'marker')
  } else if (input.orgField && kind !== 'volunteer') {
    d = applySplit({ ...d, orgName: normalizeOrgName(input.orgField) }, null, kind, 'orgField')
    d.orgName = normalizeOrgName(input.orgField)
  } else {
    d = applySplit(d, null, kind, 'none')
    if (kind === 'volunteer' && input.orgField) d.cardInstitution = input.orgField
  }
  // ★ Le lieu : l'ADRESSE pose l'épingle (centre de la localité, « à vérifier ») ;
  //   le nom de l'exploitation peut nommer une localité (« גד״ש שומריה ») —
  //   dit, jamais épinglé. ⛔ Jamais le nom de la PERSONNE : « אריאל » est
  //   aussi une ville.
  const fromAddress = (input.address ?? '').trim() ? findPlaceIn(input.address ?? '') : null
  const fromOrg = !fromAddress?.place && d.orgName ? findPlaceIn(d.orgName) : null
  const place = fromAddress?.place ? fromAddress : fromOrg
  if (place?.place) {
    d.place = place.place
    if (!d.position && fromAddress?.position) {
      d.position = fromAddress.position
      d.positionFrom = 'locality'
    }
  }
  // Le nom structuré de la fiche, quand il dit la même personne : prénom et nom
  // tels qu'ils y sont rangés (sauf ce qui a été reconnu comme organisation).
  if (input.nParts && d.split !== 'marker') {
    const { given, family } = input.nParts
    if (given && personName(d) === `${given} ${input.nParts.additional} ${family}`.replace(/\s+/gu, ' ').trim()) {
      d.firstName = [given, input.nParts.additional].filter(Boolean).join(' ')
      d.lastName = family
    }
  }
  return withProblems(d, kind)
}

/** La correction directe d'un champ, qui recalcule ce qui manque. */
export function editDraft(d: ContactDraft, patch: Partial<Pick<ContactDraft, 'firstName' | 'lastName' | 'orgName' | 'phone' | 'email' | 'notes'>>, kind: ContactKind): ContactDraft {
  const next = { ...d, ...patch }
  if (patch.phone !== undefined) next.phone = canonicalLeadPhone(patch.phone)
  if (patch.orgName !== undefined) next.orgName = normalizeOrgName(patch.orgName)
  if (patch.firstName !== undefined || patch.lastName !== undefined || patch.orgName !== undefined) next.split = 'manual'
  return withProblems(next, kind)
}

/** Poser le lieu d'un brouillon depuis un lien ou des coordonnées collés. */
export function locateDraft(d: ContactDraft, text: string, kind: ContactKind): ContactDraft {
  const loc = readLocation(text)
  const problems: ContactProblem[] = d.problems.filter((p) => p !== 'shortLink' && p !== 'unreadLocation')
  if (loc.ok) return withProblems({ ...d, position: loc.position, positionFrom: loc.via, problems }, kind)
  if (loc.reason !== 'empty') problems.push(loc.reason === 'shortLink' ? 'shortLink' : 'unreadLocation')
  return withProblems({ ...d, problems }, kind)
}

// ---------------------------------------------------------------------------
// Le numéro, au format que le PO lit
// ---------------------------------------------------------------------------

/**
 * « +972 52-890-2606 » → « 052-890-2606 » : le format LOCAL du PO, pour
 * l'affichage. L'app stocke `052-8902606` depuis AA4 (`canonicalLeadPhone`) ;
 * les deux écritures désignent les mêmes chiffres, que comparent les doublons.
 */
export function localPhoneDisplay(phone: string): string {
  const c = canonicalLeadPhone(phone)
  const d = c.replace(/\D/gu, '')
  if (d.length === 10 && /^0[57]/u.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 9 && d.startsWith('0')) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
  return c
}

// ---------------------------------------------------------------------------
// AW2.1 — l'emplacement : un lien Waze, un lien Google Maps, des coordonnées
// ---------------------------------------------------------------------------

export type LocationRead =
  | { ok: true; position: LatLng; via: 'waze' | 'google' | 'coords' }
  | { ok: false; reason: 'empty' | 'shortLink' | 'unreadable'; via?: 'waze' | 'google' }

const GEOHASH = '0123456789bcdefghjkmnpqrstuvwxyz'
/** Le géohash d'un lien court Waze (`waze.com/ul/h<géohash>`). */
export function decodeGeohash(hash: string): LatLng | null {
  let even = true
  const lat = [-90, 90]
  const lng = [-180, 180]
  for (const ch of hash.toLowerCase()) {
    const v = GEOHASH.indexOf(ch)
    if (v < 0) return null
    for (let bit = 4; bit >= 0; bit--) {
      const on = (v >> bit) & 1
      const r = even ? lng : lat
      const mid = (r[0] + r[1]) / 2
      if (on) r[0] = mid
      else r[1] = mid
      even = !even
    }
  }
  return { lat: (lat[0] + lat[1]) / 2, lng: (lng[0] + lng[1]) / 2 }
}

const inIsrael = (p: LatLng) => p.lat >= 29.4 && p.lat <= 33.4 && p.lng >= 34.2 && p.lng <= 35.95

function dms(text: string): LatLng | null {
  const re = /(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["″]|'')?\s*([NSצד])?[\s,;]*(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["″]|'')?\s*([EWמ])?/u
  const m = re.exec(text)
  if (!m) return null
  const a = Number(m[1]) + Number(m[2]) / 60 + Number(m[3].replace(',', '.')) / 3600
  const b = Number(m[5]) + Number(m[6]) / 60 + Number(m[7].replace(',', '.')) / 3600
  const p = { lat: a, lng: b }
  if (inIsrael(p)) return p
  const q = { lat: b, lng: a }
  return inIsrael(q) ? q : null
}

/**
 * Reconnaît SEUL la forme collée : lien Waze (complet ou court à géohash),
 * lien Google Maps (point du lieu `!3d…!4d…` préféré au centre de la vue
 * `@…`), coordonnées décimales (avec ou sans N/E) ou en degrés-minutes-
 * secondes. Un lien raccourci Google (`maps.app.goo.gl`) ne porte AUCUNE
 * coordonnée : il est dit, jamais deviné.
 */
export function readLocation(raw: string): LocationRead {
  const text = raw.replace(BIDI, '').trim()
  if (!text) return { ok: false, reason: 'empty' }
  const via: 'waze' | 'google' | undefined = /waze\.com/iu.test(text) ? 'waze' : /google\.|goo\.gl|maps\.app/iu.test(text) ? 'google' : undefined
  if (via === 'waze') {
    const h = /waze\.com\/ul\/h([0-9b-hjkmnp-z]{5,12})/iu.exec(text)
    if (h) {
      const p = decodeGeohash(h[1])
      if (p && inIsrael(p)) return { ok: true, position: p, via }
    }
  }
  if (via === 'google') {
    const place = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/u.exec(text)
    if (place) {
      const p = { lat: Number(place[1]), lng: Number(place[2]) }
      if (inIsrael(p)) return { ok: true, position: p, via }
    }
  }
  const decoded = (() => {
    try {
      return decodeURIComponent(text)
    } catch {
      return text
    }
  })()
  const plain = parsePositionInput(decoded.replace(/(\d)\s*°?\s*[NSEW]\b/giu, '$1 ').replace(/\b[NSEW]\s*(\d)/giu, ' $1'))
  if (plain) return { ok: true, position: plain, via: via ?? 'coords' }
  const d = dms(decoded)
  if (d) return { ok: true, position: d, via: via ?? 'coords' }
  if (via && /goo\.gl|maps\.app|waze\.com\/ul\b|waze\.com\/ul\//iu.test(text)) return { ok: false, reason: 'shortLink', via }
  return { ok: false, reason: 'unreadable', via }
}

// ---------------------------------------------------------------------------
// AW2.2 · AW2.3 — les fiches .vcf
// ---------------------------------------------------------------------------

export interface VCardProp {
  group: string
  name: string
  params: Record<string, string>
  value: string
}

export interface VCard {
  props: VCardProp[]
}

function decodeQuotedPrintable(s: string, charset: string): string {
  const bytes: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '=' && /^[0-9A-Fa-f]{2}$/u.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      // Un caractère déjà décodé (fichier mal étiqueté) : ses octets UTF-8.
      for (const b of new TextEncoder().encode(c)) bytes.push(b)
    }
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(new Uint8Array(bytes))
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  }
}

const unescapeValue = (s: string) => s.replace(/\\n/giu, '\n').replace(/\\([,;:\\])/gu, '$1')

/** Découpe en champs en respectant `\;` échappé. */
function splitStructured(s: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      cur += s[i] + s[i + 1]
      i++
    } else if (s[i] === ';') {
      out.push(cur)
      cur = ''
    } else cur += s[i]
  }
  out.push(cur)
  return out.map(unescapeValue).map((x) => x.trim())
}

/**
 * Toutes les fiches d'un fichier `.vcf` — une ou cinquante, version 2.1
 * (Android : `ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8`), 3.0 (Apple, WhatsApp)
 * ou 4.0 ; fin de ligne Windows ou Unix ; lignes repliées ; SANS retour à la
 * ligne final (le fichier réel du PO) ; `END:VCARD` manquant en fin de fichier.
 */
export function parseVcf(text: string): VCard[] {
  const clean = text.replace(/^﻿/u, '').replace(/\r\n?/gu, '\n')
  // Lignes repliées (RFC 6350 : une ligne qui commence par une espace continue la précédente).
  const raw = clean.replace(/\n[ \t]/gu, '').split('\n')
  // Quoted-printable : « = » en fin de ligne = la suite est sur la ligne suivante.
  const lines: string[] = []
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i]
    if (/QUOTED-PRINTABLE/iu.test(line.split(':')[0] ?? '')) {
      while (line.endsWith('=') && i + 1 < raw.length) {
        line = line.slice(0, -1) + raw[++i]
      }
    }
    lines.push(line)
  }
  const cards: VCard[] = []
  let cur: VCard | null = null
  for (const line of lines) {
    if (!line.trim()) continue
    if (/^BEGIN:VCARD\s*$/iu.test(line.trim())) {
      if (cur && cur.props.length) cards.push(cur)
      cur = { props: [] }
      continue
    }
    if (/^END:VCARD\s*$/iu.test(line.trim())) {
      if (cur) cards.push(cur)
      cur = null
      continue
    }
    if (!cur) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const head = line.slice(0, colon)
    let value = line.slice(colon + 1)
    const parts = head.split(';')
    let name = parts[0]
    let group = ''
    const dot = name.indexOf('.')
    if (dot >= 0) {
      group = name.slice(0, dot)
      name = name.slice(dot + 1)
    }
    const params: Record<string, string> = {}
    for (const p of parts.slice(1)) {
      const eq = p.indexOf('=')
      if (eq < 0) params.TYPE = params.TYPE ? `${params.TYPE},${p}` : p
      else params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1)
    }
    if ((params.ENCODING ?? '').toUpperCase() === 'QUOTED-PRINTABLE' || params.TYPE?.toUpperCase().includes('QUOTED-PRINTABLE')) {
      value = decodeQuotedPrintable(value, (params.CHARSET ?? 'utf-8').toLowerCase())
    }
    cur.props.push({ group, name: name.toUpperCase(), params, value })
  }
  if (cur && cur.props.length) cards.push(cur)
  return cards
}

/** Le brouillon d'une fiche. Aucun champ supposé présent (AW2.2.5). */
export function draftFromVCard(card: VCard, kind: ContactKind, file?: string): ContactDraft {
  const all = (n: string) => card.props.filter((p) => p.name === n)
  const one = (n: string) => all(n)[0]?.value ?? ''
  const nRaw = one('N')
  const n = nRaw ? splitStructured(nRaw) : []
  const nParts = { family: n[0] ?? '', given: n[1] ?? '', additional: n[2] ?? '' }
  let fullName = unescapeValue(one('FN')).trim()
  if (!fullName) fullName = [nParts.given, nParts.additional, nParts.family].filter(Boolean).join(' ')
  const org = splitStructured(one('ORG')).filter(Boolean).join(' ')

  // Les téléphones : le mobile d'abord (TYPE=CELL, « נייד », iPhone), puis les autres.
  const labels = new Map(all('X-ABLABEL').map((p) => [p.group, p.value]))
  const tels = all('TEL').map((p) => {
    const label = `${p.params.TYPE ?? ''} ${labels.get(p.group) ?? ''}`.toLowerCase()
    let v = p.value.replace(/^tel:/iu, '').trim()
    if (!v && p.params.WAID) v = `+${p.params.WAID}`
    return { v, mobile: /cell|mobile|iphone|נייד|סלולר/u.test(label) }
  }).filter((t) => t.v)
  tels.sort((a, b) => Number(b.mobile) - Number(a.mobile))
  // Une fiche WhatsApp sans TEL lisible : le waid est le numéro.
  if (tels.length === 0) {
    for (const p of card.props) if (p.params.WAID) tels.push({ v: `+${p.params.WAID}`, mobile: true })
  }
  const adr = all('ADR').map((p) => splitStructured(p.value).filter(Boolean).join(' ')).join(' · ')
  const urls = all('URL').map((p) => p.value)
  const geo = one('GEO').replace(/^geo:/iu, '').replace(';', ',')
  const notes = all('NOTE').map((p) => unescapeValue(p.value)).filter(Boolean)
  const locationText = [geo, ...urls, ...notes].find((x) => readLocation(x).ok) ?? urls.find((u) => /waze|goo\.gl|google|maps\.app/iu.test(u)) ?? ''
  return draftFromName(
    {
      fullName,
      orgField: org,
      nParts,
      phone: tels[0]?.v ?? '',
      otherPhones: tels.slice(1).map((t) => t.v),
      email: all('EMAIL')[0]?.value.trim() ?? '',
      address: adr,
      notes: notes.join(' · '),
      locationText,
      origin: { path: 'vcf', file },
    },
    kind,
  )
}

/** Un fichier : ses fiches, ou la raison pour laquelle il n'a pas été lu. */
export function draftsFromVcfFile(text: string, kind: ContactKind, file: string): { drafts: ContactDraft[]; unreadable: boolean } {
  const cards = parseVcf(text)
  if (cards.length === 0) return { drafts: [], unreadable: true }
  return { drafts: cards.map((c) => draftFromVCard(c, kind, file)), unreadable: false }
}

// ---------------------------------------------------------------------------
// Le collage de texte (le lecteur d'AS6/AT3), ramené au même brouillon
// ---------------------------------------------------------------------------

export function draftsFromPaste(text: string, kind: ContactKind): ContactDraft[] {
  return parseLeadBlock(text).map((p) => {
    /* ★ Le nom se relit sur la LIGNE d'origine, téléphones et courriel ôtés :
       le lecteur du collage retire toute localité qu'il croise, y compris un
       prénom qui en est une (« אריאל »). Seule une localité en FIN de ligne
       est prise pour un lieu. Un bloc étiqueté (plusieurs lignes) garde les
       champs que le lecteur a rangés. */
    let fullName = ''
    let place = ''
    let position: LatLng | null = null
    if (!p.raw.includes('\n')) {
      let line = p.raw.replace(/^\s*\[?\d{1,2}[./]\d{1,2}[./]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\]?\s*(?:-\s*)?(?:[^:\n]{1,40}:\s+)?/u, '')
      line = line.replace(/(?:\+?\s*9\s*7\s*2[\s\-.]*|\b0)(?:5\d|[23489]|7\d)(?:[\s\-.]*\d){7}\b/gu, ' ')
      line = line.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu, ' ')
      const tokens = nameTokens(line.replace(/[:;()[\]]/gu, ' '))
      if (p.place) {
        for (let len = Math.min(3, tokens.length - 1); len >= 1; len--) {
          const tail = tokens.slice(-len).join(' ').replace(/^[מב](?=\S{3,})/u, '')
          const found = findPlaceIn(tail)
          if (found.place === p.place && found.rest.trim() === '') {
            tokens.splice(tokens.length - len, len)
            place = p.place
            position = p.position
            break
          }
        }
      }
      fullName = tokens.join(' ')
    }
    /* Une ligne qui n'était QU'UN numéro : le nom était sur la ligne d'avant
       (« רפת בדיקה » puis « 052 700 0004 »), le lecteur l'a rangé. */
    if (!fullName) {
      fullName = p.contactName && p.name && p.contactName !== p.name ? `${p.contactName} ${p.name}` : p.contactName || p.name
      place = p.place
      position = p.position
    }
    const d = draftFromName({ fullName, phone: p.phone, email: p.email, notes: p.notes, origin: { path: 'paste' } }, kind)
    if (!place) return d
    return withProblems({ ...d, place, position: d.position ?? position, positionFrom: d.position ? d.positionFrom : position ? 'locality' : null }, kind)
  })
}

// ---------------------------------------------------------------------------
// Les doublons
// ---------------------------------------------------------------------------

export interface Existing {
  leads: ReadonlyArray<Pick<Lead, 'name' | 'contactName' | 'phone' | 'convertedFarmId'>>
  farms: ReadonlyArray<{ name: string; farmerPhone?: string; liaisonPhone?: string; farmerName?: string }>
  institutions: ReadonlyArray<Pick<Institution, 'name' | 'contactPhone' | 'aliases'>>
  volunteers: ReadonlyArray<{ name: string; phone: string }>
}

export interface Duplicate {
  kind: 'lead' | 'farm' | 'institution' | 'volunteer' | 'batch'
  name: string
  by: 'phone' | 'name'
}

const comparable = (s: string) =>
  comparableInstitutionName(normalizeOrgName(s))
    // Le mot de type ne distingue pas deux institutions : « ישיבת אפיקי דעת » = « אפיקי דעת ».
    .replace(/^(?:ישיבת ההסדר|ישיבת הסדר|ישיבת|ישיבה|הישיבה|מכינת|מכינה|המכינה|מדרשת|מדרשה|אולפנת|אולפנה)\s+/u, '')
    .replace(/^(ה|ב)(?=\S{3,})/u, '')

/** Le doublon de chaque brouillon, ou `null` — par téléphone d'abord, par nom ensuite. */
export function findDuplicates(drafts: readonly ContactDraft[], existing: Existing, kind: ContactKind): Array<Duplicate | null> {
  const phones = new Map<string, Duplicate>()
  const add = (phone: string | undefined, d: Duplicate) => {
    const k = phoneKeyOf(phone)
    if (k && !phones.has(k)) phones.set(k, d)
  }
  for (const v of existing.volunteers) add(v.phone, { kind: 'volunteer', name: v.name, by: 'phone' })
  for (const i of existing.institutions) add(i.contactPhone, { kind: 'institution', name: i.name, by: 'phone' })
  for (const f of existing.farms) {
    add(f.farmerPhone, { kind: 'farm', name: f.name, by: 'phone' })
    add(f.liaisonPhone, { kind: 'farm', name: f.name, by: 'phone' })
  }
  for (const l of existing.leads) add(l.phone, { kind: 'lead', name: l.name, by: 'phone' })

  const names = new Map<string, Duplicate>()
  const addName = (n: string, d: Duplicate) => {
    const k = comparable(n)
    if (k.length >= 3 && !names.has(k)) names.set(k, d)
  }
  if (kind === 'institution') {
    for (const i of existing.institutions) {
      addName(i.name, { kind: 'institution', name: i.name, by: 'name' })
      for (const a of i.aliases.split('·')) if (a.trim()) addName(a, { kind: 'institution', name: i.name, by: 'name' })
    }
  } else if (kind === 'farm') {
    for (const f of existing.farms) addName(f.name, { kind: 'farm', name: f.name, by: 'name' })
    for (const l of existing.leads) if (!l.convertedFarmId) addName(l.name, { kind: 'lead', name: l.name, by: 'name' })
  } else {
    for (const v of existing.volunteers) addName(v.name, { kind: 'volunteer', name: v.name, by: 'name' })
  }

  const seenPhone = new Map<string, string>()
  const seenName = new Map<string, string>()
  return drafts.map((d) => {
    const k = phoneKeyOf(d.phone)
    if (k && phones.has(k)) return phones.get(k)!
    const nk = comparable(displayName(d, kind))
    if (nk.length >= 3 && names.has(nk)) return names.get(nk)!
    const label = displayName(d, kind) || d.phone
    if (k && seenPhone.has(k)) return { kind: 'batch', name: seenPhone.get(k)!, by: 'phone' }
    if (kind !== 'volunteer' && nk.length >= 3 && seenName.has(nk) && !k) return { kind: 'batch', name: seenName.get(nk)!, by: 'name' }
    if (k) seenPhone.set(k, label)
    if (nk.length >= 3) seenName.set(nk, label)
    return null
  })
}

// ---------------------------------------------------------------------------
// Ce qui est écrit
// ---------------------------------------------------------------------------

const POSITION_SOURCE: Record<NonNullable<ContactDraft['positionFrom']>, string> = {
  waze: 'קישור Waze',
  google: 'קישור Google Maps',
  coords: 'קואורדינטות',
  locality: 'מרכז היישוב מכרטיס איש הקשר — לבדוק',
}

/** Une ferme = une PISTE de la salle d'attente (dans aucun compteur, AS6.8). */
export function leadFromDraft(d: ContactDraft) {
  return {
    name: displayName(d, 'farm') || localPhoneDisplay(d.phone),
    contactName: d.orgName ? personName(d) : personName(d) === displayName(d, 'farm') ? personName(d) : '',
    phone: d.phone,
    email: d.email,
    place: d.place,
    position: d.position,
    regionId: null,
    notes: [d.notes, ...d.otherPhones, d.address && !d.place ? d.address : ''].filter(Boolean).join(' · '),
    source: d.origin.path === 'vcf' ? ('vcf' as const) : d.origin.path === 'paste' ? ('paste' as const) : ('manual' as const),
    raw: [d.fullName, d.phone].filter(Boolean).join(' '),
  }
}

export function institutionFromDraft(d: ContactDraft) {
  const name = d.orgName || personName(d)
  const kind = readInstitutionKind('', name)
  return {
    name,
    locality: d.place,
    kind,
    audience: readInstitutionAudience('', kind),
    position: d.position,
    positionUncertain: d.positionFrom === 'locality',
    positionSource: d.positionFrom ? POSITION_SOURCE[d.positionFrom] : '',
    contactName: d.orgName ? personName(d) : '',
    contactPhone: d.phone,
    notes: [d.email, d.notes, ...d.otherPhones, d.address && !d.place ? d.address : ''].filter(Boolean).join(' · '),
    engagement: 'not_contacted' as const,
    engagementConfirmed: true,
    source: 'manual' as const,
  }
}

export function volunteerFromDraft(d: ContactDraft, institution: Pick<Institution, 'id' | 'name'>) {
  return {
    name: personName(d) || d.fullName,
    /* L'âge n'est sur aucune fiche : 0 = inconnu (jamais inventé), affiché vide. */
    age: 0,
    phone: d.phone,
    phoneType: 'smartphone' as const,
    email: d.email,
    yeshiva: institution.name,
    institutionId: institution.id,
    locality: d.place,
    status: 'active' as const,
    inactiveReason: null,
    photo: null,
    notes: [d.notes, ...d.otherPhones, d.cardInstitution && comparable(d.cardInstitution) !== comparable(institution.name) ? `בכרטיס: ${d.cardInstitution}` : ''].filter(Boolean).join(' · '),
  }
}
