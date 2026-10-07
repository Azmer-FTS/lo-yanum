import { canonicalPhone } from './association'
import { FARM_STATUS_OPTIONS, normaliseValue, readOption, typeFromAreas } from './fields'
import type { Farm, FarmStatus, LandDocument, LatLng, Lead, LeadStatus } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AS1 (2026-10-07) — L'EXPORT CSV DU PORTAIL DE L'ASSOCIATION, RÉPÉTABLE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le portail (Tadabase) n'a ni clé d'API pour le PO, ni pré-remplissage par
 * l'adresse : l'export CSV de son espace est le SEUL pont. Le PO le refera à
 * chaque saisie chez eux ; ce module en fait un plan, l'écran le montre, le
 * PO l'applique. Rien ici n'écrit.
 *
 * ⚠️ CINQ PIÈGES, TOUS MESURÉS SUR LE FICHIER RÉEL DU 2026-10-07 :
 *
 *   1. TOUT EST DU TEXTE. `parsePortalCsv` ne convertit RIEN : un lecteur de
 *      tableur fait de `0526067361` le nombre 526067361 (zéro perdu, `.0`
 *      ajouté). Les ת״ז / ח״פ passent tels quels : AUCUN zéro inventé —
 *      `21985189` a huit chiffres dans le portail et les garde ici.
 *   2. « מיקום » N'EST PAS LA COLONNE DES COORDONNÉES. Dans le fichier réel,
 *      elle porte un courriel (`tomershabtay@gmail.com`), un nom (« ניר
 *      עקובא ») ou rien ; les coordonnées sont dans « כתובת ». On ne croit
 *      donc AUCUN en-tête : chaque cellule des deux colonnes est TYPÉE
 *      (`classifyLocationCell`) avant d'être lue.
 *   3. L'ORDRE EST LATITUDE, LONGITUDE (« 31.2056556, 34.3175954 ») — l'inverse
 *      des captures d'AB6. En Israël les deux plages ne se recouvrent pas
 *      (lat 29,4–33,4 ; lng 34,2–35,95) : l'ordre se DÉDUIT, et un point
 *      hors du pays est refusé et nommé dans le rapport.
 *   4. LES SURFACES PORTENT DES SÉPARATEURS DE MILLIERS (`26,000`, `1,058`).
 *   5. « חתימה » EST UNE IMAGE PNG EN BASE64 ; « הסכם רעיה/חכירה » EST UN LIEN
 *      S3 (affiché « הורדה » dans le portail). Le lien est mis en FILE : le
 *      navigateur ne peut pas le lire (aucun en-tête CORS), la fonction Edge
 *      `portal-document` le recopie.
 *
 * ★★ LES RÉGIMES DE COLONNE SONT CEUX D'AO (règle 9bis), SANS EXCEPTION :
 *   - nom, statut, surfaces            → le portail fait autorité ;
 *   - ת״ז, contact, téléphone, courriel → le portail COMBLE UN VIDE ;
 *   - position                         → l'épingle du PO gagne TOUJOURS ;
 *   - photo, visite, תיק אתר, שטחים שמירה, notes → jamais nommés, jamais touchés.
 *   Une différence sur un champ « comble un vide » n'écrit rien : elle devient
 *   une ligne du rapport, pour que le PO tranche.
 *
 * ★★ AS2 — DEUX LIGNES, UNE EXPLOITATION. Une ligne à astérisques dont le
 *   téléphone est celui d'une ligne SANS astérisques du même fichier est un
 *   vestige : elle ne crée ni fiche ni piste. Et une ligne qui ne retrouve
 *   aucune fiche par son nom retrouve celle qui porte SON téléphone, si une
 *   seule le porte — c'est ce qui fait de l'ancienne « חוות אורחאן » la fiche
 *   de « החווה של צביקה », avec son identifiant et son historique.
 *
 * ★★ AS3 — UN NOM ENTRE ASTÉRISQUES EST UNE PISTE, PAS UNE FERME. C'est la
 *   convention du PO pour « pas encore démarché ». Aucune astérisque ne
 *   survit dans un libellé. Une FICHE qui existait pour elle est CONVERTIE
 *   en piste — si et seulement si elle n'a encore aucune histoire (signature,
 *   accord, visite, zone) : une histoire ne se perd pas sur une ponctuation.
 *
 * PUR : ni DOM, ni React, ni Supabase — comme tout /src/core.
 */

// ---------------------------------------------------------------------------
// 1 — Le CSV, en texte
// ---------------------------------------------------------------------------

/** RFC 4180 : guillemets doublés, retours à la ligne dans un champ, BOM. */
export function parsePortalCsv(text: string): string[][] {
  const src = text.replace(/^﻿/u, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"' && field === '') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((v) => v !== '')) rows.push(row)
  return rows
}

// ---------------------------------------------------------------------------
// 2 — Les colonnes
// ---------------------------------------------------------------------------

export type PortalField =
  | 'name'
  | 'location'
  | 'contact'
  | 'phone'
  | 'landAgreement'
  | 'grazing'
  | 'cultivated'
  | 'guarded'
  | 'email'
  | 'idNo'
  | 'signature'
  | 'address'
  | 'status'

/**
 * L'en-tête tel que le portail l'écrit. Un en-tête RÉPÉTÉ (« איש קשר »,
 * « שם המקום » reviennent en fin de ligne) se lit à sa PREMIÈRE occurrence ;
 * un lecteur qui suffixe (`איש קשר.1`) est toléré.
 */
export const PORTAL_HEADERS: ReadonlyArray<{ field: PortalField; headers: readonly string[] }> = [
  { field: 'name', headers: ['שם המקום'] },
  { field: 'location', headers: ['מיקום'] },
  { field: 'contact', headers: ['איש קשר'] },
  { field: 'phone', headers: ['נייד איש קשר', 'נייד'] },
  { field: 'landAgreement', headers: ['הסכם רעיה/חכירה', 'הסכם רעיה / חכירה'] },
  { field: 'grazing', headers: ['שטחי מרעה'] },
  { field: 'cultivated', headers: ['שטחים מעובדים'] },
  { field: 'guarded', headers: ['שטחים שמירה'] },
  { field: 'email', headers: ['מייל חקלאי', 'מייל'] },
  { field: 'idNo', headers: ['תז/ח.פ', 'ת״ז/ח״פ', 'תז / ח.פ'] },
  { field: 'signature', headers: ['חתימה'] },
  { field: 'address', headers: ['כתובת'] },
  /* Absent de l'export du 2026-10-07 ; lu s'il apparaît un jour. */
  { field: 'status', headers: ['סטטוס חתימה', 'סטטוס'] },
]

export function portalColumnIndex(headers: readonly string[]): Partial<Record<PortalField, number>> {
  const out: Partial<Record<PortalField, number>> = {}
  const clean = headers.map((h) => normaliseValue(h.replace(/\.\d+$/u, '')))
  for (const { field, headers: names } of PORTAL_HEADERS) {
    const wanted = names.map(normaliseValue)
    const i = clean.findIndex((h, idx) => wanted.includes(h) && !headers[idx].match(/\.\d+$/u))
    if (i !== -1) out[field] = i
  }
  return out
}

/** Est-ce l'export du portail ? Il faut au moins le nom et un téléphone. */
export function looksLikePortalExport(headers: readonly string[]): boolean {
  const idx = portalColumnIndex(headers)
  return idx.name !== undefined && idx.phone !== undefined
}

// ---------------------------------------------------------------------------
// 3 — Les cellules
// ---------------------------------------------------------------------------

export type LocationCellKind = 'coords' | 'email' | 'text' | 'empty'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const PAIR = /^\s*\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?\s*$/u

/** Les deux plages ne se recouvrent pas : l'ordre se déduit. */
const LAT = [29.4, 33.4] as const
const LNG = [34.2, 35.95] as const
const within = (v: number, r: readonly [number, number]): boolean => v >= r[0] && v <= r[1]

export interface LocationReading {
  kind: LocationCellKind
  /** `coords` : le point, si — et seulement si — il tombe en Israël. */
  position: LatLng | null
  /** `lat-lng` = l'ordre du portail ; `lng-lat` lu mais retourné ; `outside` refusé. */
  order: 'lat-lng' | 'lng-lat' | 'outside' | null
  value: string
}

export function classifyLocationCell(raw: string): LocationReading {
  const value = raw.trim()
  if (value === '') return { kind: 'empty', position: null, order: null, value }
  if (EMAIL.test(value)) return { kind: 'email', position: null, order: null, value }
  const m = PAIR.exec(value)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (within(a, LAT) && within(b, LNG)) return { kind: 'coords', position: { lat: a, lng: b }, order: 'lat-lng', value }
    if (within(a, LNG) && within(b, LAT)) return { kind: 'coords', position: { lat: b, lng: a }, order: 'lng-lat', value }
    return { kind: 'coords', position: null, order: 'outside', value }
  }
  return { kind: 'text', position: null, order: null, value }
}

/** `26,000` → 26000 ; `1 058` → 1058 ; vide ou illisible → `null`. */
export function readPortalArea(raw: string): number | null {
  const v = raw.replace(/[\s,  ']/gu, '').trim()
  if (v === '') return null
  if (!/^\d+(?:\.\d+)?$/u.test(v)) return null
  return Math.round(Number(v))
}

/**
 * ת״ז / ח״פ : les chiffres SEULS, tels quels. `0` est la case vide du portail.
 * ⛔ Aucun zéro ajouté, aucun retiré.
 */
export function readPortalIdNo(raw: string): string {
  const v = raw.trim()
  if (v === '' || /^0+$/u.test(v)) return ''
  return v
}

/** « *גד׳׳ש להב* » → étoilé, « גד״ש להב ». */
export function readPortalName(raw: string): { name: string; starred: boolean } {
  const trimmed = raw.trim()
  const starred = /^\*.*\*$/su.test(trimmed) || /^\*/u.test(trimmed)
  const name = trimmed
    .replace(/\*/gu, '')
    .replace(/[׳'’‘]{2}/gu, '״')
    .replace(/"/gu, '״')
    .replace(/\s+/gu, ' ')
    .trim()
  return { name, starred }
}

/**
 * La forme qui COMPARE deux noms : tirets, guillemets et espaces confondus
 * (« חוות הר–שמש » = « חוות הר-שמש », « גד׳׳ש » = « גד״ש »).
 */
export function comparableName(name: string): string {
  return normaliseValue(readPortalName(name).name).replace(/\s*-\s*/gu, ' ').replace(/\s+/gu, ' ')
}

/** Le même nom SANS son préfixe d'ordre (« 05 - ») — pour RETROUVER, jamais pour identifier. */
export function pairingName(name: string): string {
  return comparableName(name).replace(/^\d{1,3}\s+/u, '')
}

function phoneKey(phone: string | undefined | null): string {
  const d = (phone ?? '').replace(/\D/gu, '')
  return d.length >= 9 ? d.replace(/^972/u, '0') : ''
}

export interface PortalRow {
  /** Ligne du fichier, en-tête = 1. */
  line: number
  rawName: string
  name: string
  starred: boolean
  contact: string
  phone: string
  email: string
  idNo: string
  grazing: number | null
  cultivated: number | null
  position: LatLng | null
  /** Ce que les colonnes de lieu portaient, typé. */
  locations: LocationReading[]
  signature: string | null
  contract: { url: string | null; mention: boolean } | null
  status: FarmStatus | null
}

export function readPortalRows(matrix: readonly (readonly string[])[]): {
  rows: PortalRow[]
  columns: Partial<Record<PortalField, number>>
} {
  const [headers = [], ...body] = matrix
  const columns = portalColumnIndex(headers)
  const cell = (r: readonly string[], f: PortalField): string => {
    const i = columns[f]
    return i === undefined ? '' : (r[i] ?? '')
  }
  const rows: PortalRow[] = []
  body.forEach((r, i) => {
    const { name, starred } = readPortalName(cell(r, 'name'))
    if (name === '') return
    const locations = [classifyLocationCell(cell(r, 'location')), classifyLocationCell(cell(r, 'address'))]
    const coords = locations.find((l) => l.kind === 'coords' && l.position)
    const typedEmail = cell(r, 'email').trim()
    const locatedEmail = locations.find((l) => l.kind === 'email')?.value ?? ''
    const sig = cell(r, 'signature').trim()
    const agreement = cell(r, 'landAgreement').trim()
    const statusCell = cell(r, 'status').trim()
    rows.push({
      line: i + 2,
      rawName: cell(r, 'name'),
      name,
      starred,
      contact: cell(r, 'contact').trim(),
      phone: canonicalPhone(cell(r, 'phone')),
      email: EMAIL.test(typedEmail) ? typedEmail : locatedEmail,
      idNo: readPortalIdNo(cell(r, 'idNo')),
      grazing: readPortalArea(cell(r, 'grazing')),
      cultivated: readPortalArea(cell(r, 'cultivated')),
      position: coords?.position ?? null,
      locations,
      signature: /^data:image\/(png|jpeg|svg\+xml);base64,/u.test(sig) ? sig : null,
      contract:
        agreement === ''
          ? null
          : /^https?:\/\//u.test(agreement)
            ? { url: agreement, mention: false }
            : { url: null, mention: true },
      status: statusCell ? ((readOption(statusCell, FARM_STATUS_OPTIONS)?.id as FarmStatus | undefined) ?? null) : null,
    })
  })
  return { rows, columns }
}

// ---------------------------------------------------------------------------
// 4 — Le plan
// ---------------------------------------------------------------------------

export type PortalWarningCode =
  | 'id-not-9-digits'
  | 'id-differs'
  | 'phone-differs'
  | 'contact-differs'
  | 'email-differs'
  | 'location-text'
  | 'outside-israel'
  | 'swapped-order'
  | 'signature-without-signed-status'
  | 'contract-mention-without-link'
  | 'pin-kept'
  | 'has-history'
  | 'ambiguous'
  | 'status-column-missing'

export interface PortalWarning {
  line: number
  name: string
  code: PortalWarningCode
  detail: string
}

export interface FieldChange {
  field: string
  from: string
  to: string
}

export type PortalAction =
  | { kind: 'update'; row: PortalRow; farmId: string; pairedBy: 'name' | 'key' | 'phone'; patch: Partial<Farm>; changes: FieldChange[] }
  | { kind: 'create-farm'; row: PortalRow; farm: Partial<Farm> & { name: string } }
  | { kind: 'farm-to-lead'; row: PortalRow; farmId: string; lead: Omit<Lead, 'id' | 'rank'> }
  | { kind: 'lead-update'; row: PortalRow; leadId: string; patch: Partial<Lead>; changes: FieldChange[] }
  | { kind: 'lead-create'; row: PortalRow; lead: Omit<Lead, 'id' | 'rank'> }
  | { kind: 'skip-duplicate'; row: PortalRow; sameAs: PortalRow }

export interface PortalPlan {
  actions: PortalAction[]
  warnings: PortalWarning[]
  /** Les fiches dont le portail porte une signature (ce qui sera rattaché ou l'est déjà). */
  signatures: Array<{ line: number; name: string; attached: boolean }>
  contracts: Array<{ line: number; name: string; url: string | null; queued: boolean }>
  statusColumn: boolean
}

export interface PortalPlanInput {
  matrix: readonly (readonly string[])[]
  farms: readonly Farm[]
  leads: readonly Lead[]
  fileName: string
  nowIso: string
  /** Ce qu'une fiche a déjà vécu (signature, accord, visite, zone…) — vide = convertible. */
  historyOf?: (farmId: string) => string[]
}

/** Une ancienne fiche → le statut de piste qui dit la même chose. */
export function leadStatusFromFarm(status: FarmStatus): LeadStatus {
  if (status === 'contacted') return 'call_back'
  if (status === 'not_relevant_now' || status === 'on_hold') return 'not_now'
  if (status === 'declined') return 'not_interested'
  return 'not_called'
}

function contractFileName(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    return last || 'contract.pdf'
  } catch {
    return 'contract.pdf'
  }
}

function shortId(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

export function planPortalImport(input: PortalPlanInput): PortalPlan {
  const { rows, columns } = readPortalRows(input.matrix)
  const plan: PortalPlan = { actions: [], warnings: [], signatures: [], contracts: [], statusColumn: columns.status !== undefined }
  const warn = (row: PortalRow, code: PortalWarningCode, detail: string): void => {
    plan.warnings.push({ line: row.line, name: row.name, code, detail })
  }
  const history = input.historyOf ?? (() => [])

  /* Les constats de LECTURE, une fois par ligne. */
  for (const row of rows) {
    const digits = row.idNo.replace(/\D/gu, '')
    if (digits !== '' && digits.length !== 9) {
      warn(row, 'id-not-9-digits', `${row.idNo} — ${digits.length} ספרות`)
    }
    for (const loc of row.locations) {
      if (loc.kind === 'text') warn(row, 'location-text', loc.value)
      if (loc.kind === 'coords' && loc.order === 'outside') warn(row, 'outside-israel', loc.value)
      if (loc.kind === 'coords' && loc.order === 'lng-lat') warn(row, 'swapped-order', loc.value)
    }
    if (row.contract?.mention) warn(row, 'contract-mention-without-link', 'הורדה')
  }

  /* AS2 — les vestiges : étoilé + téléphone d'une ligne non étoilée. */
  const plainByPhone = new Map<string, PortalRow>()
  for (const r of rows) if (!r.starred && phoneKey(r.phone)) plainByPhone.set(phoneKey(r.phone), r)

  const farms = input.farms.filter((f) => !f.archivedAt)
  const takenFarms = new Set<string>()
  const takenLeads = new Set<string>()
  const keyCount = new Map<string, number>()
  for (const r of rows) keyCount.set(pairingName(r.name), (keyCount.get(pairingName(r.name)) ?? 0) + 1)

  const findFarm = (row: PortalRow): { farm: Farm; by: 'name' | 'key' | 'phone' } | null => {
    const free = farms.filter((f) => !takenFarms.has(f.id))
    const exact = free.filter((f) => comparableName(f.name) === comparableName(row.name))
    if (exact.length === 1) return { farm: exact[0], by: 'name' }
    if (exact.length > 1) {
      warn(row, 'ambiguous', exact.map((f) => f.name).join(' · '))
      return null
    }
    const key = pairingName(row.name)
    const loose = free.filter((f) => pairingName(f.name) === key)
    if (loose.length === 1 && keyCount.get(key) === 1) return { farm: loose[0], by: 'key' }
    if (loose.length > 1) {
      warn(row, 'ambiguous', loose.map((f) => f.name).join(' · '))
      return null
    }
    const pk = phoneKey(row.phone)
    if (pk) {
      const byPhone = free.filter((f) => phoneKey(f.farmerPhone) === pk)
      if (byPhone.length === 1) return { farm: byPhone[0], by: 'phone' }
    }
    return null
  }

  const findLead = (row: PortalRow): Lead | null => {
    const free = input.leads.filter((l) => !takenLeads.has(l.id) && !l.convertedFarmId)
    const byName = free.filter((l) => comparableName(l.name) === comparableName(row.name))
    if (byName.length === 1) return byName[0]
    const pk = phoneKey(row.phone)
    const byPhone = pk ? free.filter((l) => phoneKey(l.phone) === pk) : []
    return byPhone.length === 1 ? byPhone[0] : null
  }

  const fill = (
    changes: FieldChange[],
    row: PortalRow,
    field: string,
    current: string | undefined | null,
    incoming: string,
    code: PortalWarningCode,
    same: (a: string, b: string) => boolean = (a, b) => a.trim() === b.trim(),
  ): string | undefined => {
    if (!incoming) return undefined
    if (!current || current.trim() === '') {
      changes.push({ field, from: '', to: incoming })
      return incoming
    }
    if (!same(current, incoming)) warn(row, code, `${current} ≠ ${incoming}`)
    return undefined
  }

  /* 1 — les lignes NON étoilées d'abord : ce sont des fermes, et ce sont elles
         qui ont droit à une fiche existante retrouvée par téléphone (AS2). */
  for (const row of rows.filter((r) => !r.starred)) {
    if (row.signature) plan.signatures.push({ line: row.line, name: row.name, attached: false })
    if (row.contract) plan.contracts.push({ line: row.line, name: row.name, url: row.contract.url, queued: false })

    const found = findFarm(row)
    if (!found) {
      const status: FarmStatus = row.status ?? (row.signature ? 'signed' : 'verbal_ok')
      const cultivated = row.cultivated ?? 0
      const grazing = row.grazing ?? 0
      const farm: Partial<Farm> & { name: string } = {
        name: row.name,
        status,
        farmerName: row.contact || undefined,
        farmerPhone: row.phone || undefined,
        farmerEmail: row.email || undefined,
        farmerId: row.idNo || undefined,
        farmDunams: cultivated,
        grazingDunams: grazing,
        farmDunamsManual: cultivated > 0,
        grazingDunamsManual: grazing > 0,
        type: typeFromAreas(cultivated, grazing),
        position: row.position ?? undefined,
        positionMissing: !row.position,
        signature: row.signature,
        signatureOrigin: row.signature
          ? { kind: 'imported', signedAt: null, fileName: input.fileName, importedAt: input.nowIso }
          : undefined,
        landDocuments: row.contract?.url ? [landDocumentOf(row.contract.url, input.nowIso)] : undefined,
      }
      plan.actions.push({ kind: 'create-farm', row, farm })
      markDocs(plan, row, true)
      continue
    }

    const { farm, by } = found
    takenFarms.add(farm.id)
    const patch: Partial<Farm> = {}
    const changes: FieldChange[] = []

    /* nom — autorité, sauf différence purement typographique */
    if (comparableName(farm.name) !== comparableName(row.name)) {
      patch.name = row.name
      changes.push({ field: 'name', from: farm.name, to: row.name })
    }
    /* statut — autorité, s'il est dans le fichier */
    if (row.status && row.status !== farm.status && !(row.status === 'signed' && farm.status === 'active')) {
      patch.status = row.status
      changes.push({ field: 'status', from: farm.status, to: row.status })
    }
    if (!row.status && row.signature && farm.status !== 'signed' && farm.status !== 'active') {
      warn(row, 'signature-without-signed-status', farm.status)
    }
    /* surfaces — autorité */
    if (row.cultivated !== null && row.cultivated !== (farm.farmDunams ?? 0)) {
      patch.farmDunams = row.cultivated
      patch.farmDunamsManual = row.cultivated > 0
      changes.push({ field: 'farmDunams', from: String(farm.farmDunams ?? 0), to: String(row.cultivated) })
    }
    if (row.grazing !== null && row.grazing !== (farm.grazingDunams ?? 0)) {
      patch.grazingDunams = row.grazing
      patch.grazingDunamsManual = row.grazing > 0
      changes.push({ field: 'grazingDunams', from: String(farm.grazingDunams ?? 0), to: String(row.grazing) })
    }
    if (patch.farmDunams !== undefined || patch.grazingDunams !== undefined) {
      const c = patch.farmDunams ?? farm.farmDunams ?? 0
      const g = patch.grazingDunams ?? farm.grazingDunams ?? 0
      if (c > 0 || g > 0) patch.type = typeFromAreas(c, g)
    }
    /* comble un vide */
    const name = fill(changes, row, 'farmerName', farm.farmerName, row.contact, 'contact-differs')
    if (name) patch.farmerName = name
    const phone = fill(changes, row, 'farmerPhone', farm.farmerPhone, row.phone, 'phone-differs', (a, b) => phoneKey(a) === phoneKey(b))
    if (phone) patch.farmerPhone = phone
    const id = fill(changes, row, 'farmerId', farm.farmerId, row.idNo, 'id-differs')
    if (id) patch.farmerId = id
    const email = fill(changes, row, 'farmerEmail', farm.farmerEmail, row.email, 'email-differs', (a, b) => a.toLowerCase() === b.toLowerCase())
    if (email) patch.farmerEmail = email
    /* position — l'épingle du PO gagne */
    if (row.position) {
      if (farm.positionMissing) {
        patch.position = row.position
        patch.positionMissing = false
        changes.push({ field: 'position', from: '', to: `${row.position.lat}, ${row.position.lng}` })
      } else if (farm.position && distanceM(farm.position, row.position) > 5) {
        warn(row, 'pin-kept', `${Math.round(distanceM(farm.position, row.position))} m`)
      }
    }
    /* documents — la signature comble un vide ; le contrat s'ajoute s'il est neuf */
    if (row.signature && !farm.signature) {
      patch.signature = row.signature
      patch.signatureMissing = undefined
      patch.signatureOrigin = { kind: 'imported', signedAt: null, fileName: input.fileName, importedAt: input.nowIso }
      changes.push({ field: 'signature', from: '', to: 'PNG' })
    }
    if (row.contract?.url && !(farm.landDocuments ?? []).some((d) => d.url === row.contract!.url)) {
      patch.landDocuments = [...(farm.landDocuments ?? []), landDocumentOf(row.contract.url, input.nowIso)]
      changes.push({ field: 'landDocuments', from: '', to: contractFileName(row.contract.url) })
    }
    markDocs(plan, row, Boolean(patch.signature) || Boolean(farm.signature), Boolean(patch.landDocuments) || (farm.landDocuments ?? []).some((d) => d.url === row.contract?.url))
    plan.actions.push({ kind: 'update', row, farmId: farm.id, pairedBy: by, patch, changes })
  }

  /* 2 — les lignes étoilées : des pistes. */
  for (const row of rows.filter((r) => r.starred)) {
    const twin = plainByPhone.get(phoneKey(row.phone))
    if (twin) {
      /* AS2 : vestige d'une exploitation déjà présente sans astérisques. Si
         une fiche à son nom subsiste encore, elle a été reprise par la ligne
         jumelle (par téléphone) ; on ne la touche pas une seconde fois. */
      plan.actions.push({ kind: 'skip-duplicate', row, sameAs: twin })
      continue
    }
    const lead = findLead(row)
    if (lead) {
      takenLeads.add(lead.id)
      const patch: Partial<Lead> = {}
      const changes: FieldChange[] = []
      const c = fill(changes, row, 'contactName', lead.contactName, row.contact, 'contact-differs')
      if (c) patch.contactName = c
      const p = fill(changes, row, 'phone', lead.phone, row.phone, 'phone-differs', (a, b) => phoneKey(a) === phoneKey(b))
      if (p) patch.phone = p
      if (!lead.position && row.position) {
        patch.position = row.position
        changes.push({ field: 'position', from: '', to: `${row.position.lat}, ${row.position.lng}` })
      }
      plan.actions.push({ kind: 'lead-update', row, leadId: lead.id, patch, changes })
      continue
    }
    const found = findFarm(row)
    if (found) {
      const { farm } = found
      const past = history(farm.id)
      if (past.length > 0) {
        takenFarms.add(farm.id)
        warn(row, 'has-history', past.join(' · '))
        continue
      }
      takenFarms.add(farm.id)
      const contact = farm.farmerName?.trim() ? farm.farmerName : row.contact
      if (farm.farmerName?.trim() && row.contact && farm.farmerName.trim() !== row.contact) {
        warn(row, 'contact-differs', `${farm.farmerName} ≠ ${row.contact}`)
      }
      plan.actions.push({
        kind: 'farm-to-lead',
        row,
        farmId: farm.id,
        lead: {
          /* même nom à la typographie près : on garde celle du PO */
          name: comparableName(farm.name) === comparableName(row.name) ? readPortalName(farm.name).name : row.name,
          contactName: contact ?? '',
          phone: farm.farmerPhone?.trim() ? farm.farmerPhone : row.phone,
          place: farm.locality ?? '',
          position: !farm.positionMissing && farm.position ? farm.position : row.position,
          regionId: farm.regionId ?? null,
          status: leadStatusFromFarm(farm.status),
          notes: farm.notes ?? '',
          source: 'farm',
          raw: row.rawName,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
          convertedFarmId: null,
          convertedAt: null,
        },
      })
      continue
    }
    plan.actions.push({
      kind: 'lead-create',
      row,
      lead: {
        name: row.name,
        contactName: row.contact,
        phone: row.phone,
        place: '',
        position: row.position,
        regionId: null,
        status: 'not_called',
        notes: '',
        source: 'portal',
        raw: row.rawName,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
        convertedFarmId: null,
        convertedAt: null,
      },
    })
  }

  if (!plan.statusColumn && rows.length > 0) {
    plan.warnings.push({ line: 1, name: '', code: 'status-column-missing', detail: 'סטטוס חתימה' })
  }
  return plan
}

function markDocs(plan: PortalPlan, row: PortalRow, signatureAttached: boolean, contractQueued = Boolean(row.contract?.url)): void {
  const s = plan.signatures.find((x) => x.line === row.line)
  if (s) s.attached = Boolean(row.signature) && signatureAttached
  const c = plan.contracts.find((x) => x.line === row.line)
  if (c) c.queued = Boolean(row.contract?.url) && contractQueued
}

export function landDocumentOf(url: string, nowIso: string): LandDocument {
  return {
    id: `land-${shortId(url)}`,
    source: 'portal',
    url,
    fileName: contractFileName(url),
    addedAt: nowIso,
    status: 'pending',
    storageKey: null,
    size: null,
    error: null,
  }
}

function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Le résumé chiffré d'un plan — l'écran et le rapport disent la même chose. */
export function portalPlanSummary(plan: PortalPlan): Record<PortalAction['kind'], number> {
  const out = { update: 0, 'create-farm': 0, 'farm-to-lead': 0, 'lead-update': 0, 'lead-create': 0, 'skip-duplicate': 0 }
  for (const a of plan.actions) out[a.kind] += 1
  return out
}
