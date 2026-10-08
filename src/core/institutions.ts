import { normalizeLocality } from './gazetteer'
import { parsePositionInput } from './geo'
import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AU3 (2026-10-08) — LES INSTITUTIONS : מכינות, ישיבות הסדר, מדרשות.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Elles fournissent les volontaires ; les fermes les reçoivent. Le PO les
 * démarche comme il démarche les fermes, et la carte de couverture (AU4)
 * montre qui atteint qui.
 *
 * ⛔ UNE INSTITUTION N'EST PAS UNE FERME. Elle vit dans `StoreData.institutions`
 *    et aucune fonction de compteur (objectif, dounams, compte rendu, rapport
 *    d'activité) ne lit cette collection — exactement comme les pistes (AS6.8).
 *    `bun run aupass` (A321) le vérifie dans le code.
 *
 * ★ LES CINQ STATUTS D'ENGAGEMENT, GARDÉS TELS QUE LE PO LES A DONNÉS. Chacun
 *   correspond à UN geste du PO, et la carte n'a besoin que d'une frontière :
 *     טרם נוצר קשר → appeler · נוצר קשר → relancer · מעוניין → conclure ·
 *     חתום → c'est acquis · לא רלוונטי → ne plus en parler.
 *   « Engagée » = חתום, et rien d'autre : une institution « intéressée » qui
 *   s'affiche comme acquise devant une autre institution, en rendez-vous, est
 *   un argument de vente qui ment. « À démarcher » = les trois premiers.
 *   « לא רלוונטי » quitte la carte (le compte en est dit).
 *   Je n'ai PAS ajouté « פעיל » (envoie déjà des volontaires) : rien dans
 *   l'app ne relie aujourd'hui un volontaire à son institution de façon
 *   fiable (`Volunteer.institution` est un texte libre) ; un statut que rien
 *   ne mesure serait déclaratif. Quand le lien existera, ce sera un CHIFFRE
 *   affiché, pas un sixième statut.
 */

export type InstitutionKind = 'mechina' | 'hesder' | 'midrasha' | 'other'
export type InstitutionAudience = 'boys' | 'girls' | 'mixed' | 'unknown'
export type InstitutionEngagement = 'not_contacted' | 'contacted' | 'interested' | 'signed' | 'not_relevant'

export const INSTITUTION_ENGAGEMENTS: readonly InstitutionEngagement[] = [
  'not_contacted',
  'contacted',
  'interested',
  'signed',
  'not_relevant',
] as const

export const INSTITUTION_KINDS: readonly InstitutionKind[] = ['mechina', 'hesder', 'midrasha', 'other'] as const
export const INSTITUTION_AUDIENCES: readonly InstitutionAudience[] = ['boys', 'girls', 'mixed', 'unknown'] as const

export interface Institution {
  id: string
  name: string
  /** La localité telle que le classeur la donne. */
  locality: string
  kind: InstitutionKind
  audience: InstitutionAudience
  /** Réseau ou association gestionnaire (texte libre, souvent vide). */
  network: string
  /** `null` = aucun point connu : l'institution reste hors carte, comptée. */
  position: LatLng | null
  /**
   * ⚠️ AU3.4 — le point est à VÉRIFIER. Dessiné en pointillé sur la carte,
   * signalé sur la fiche ; les liens qui en partent restent tracés (le rayon
   * est de 35 km, une erreur de quelques km ne change pas l'ordre de grandeur)
   * mais le compteur dit combien en dépendent.
   */
  positionUncertain: boolean
  engagement: InstitutionEngagement
  /** AU3.3 — à compléter par le PO. */
  contactName: string
  /** Format de l'app : `05X-XXXXXXX` (voir `formatContactPhone`). */
  contactPhone: string
  notes: string
  /** Les colonnes du classeur que l'app ne lit pas (distances…), au texte près. */
  extra: string
  source: 'import' | 'manual'
  /**
   * ★★ AV1 — FAUX = le statut a été posé SANS être confirmé (« חתום » mis par
   * le PO pendant sa tournée du 08.10.2026, « à confirmer »). Choisir un
   * statut, ou toucher « אישור », le rend vrai : un geste.
   */
  engagementConfirmed: boolean
  /** ★★ AV1 — date de la rencontre (`AAAA-MM-JJ`), quand il y en a eu une. */
  metOn: string | null
  /** ★★ AV1 — effectif quand il est public ; `null` = inconnu (jamais deviné). */
  students: number | null
  /** ★★ AV1 — d'où vient la coordonnée, et la confiance qu'on lui accorde. */
  positionSource: string
  /** ★★ AV1 — les autres noms, séparés par « · » : l'import les apparie. */
  aliases: string
  createdAt: string
  updatedAt: string
}

/** ★★ AV1 — un « חתום » qui attend la confirmation du PO. */
export const isInstitutionToConfirm = (i: Pick<Institution, 'engagementConfirmed'>): boolean => !i.engagementConfirmed

/** ★ La seule définition d'« engagée ». */
export const isInstitutionEngaged = (i: Pick<Institution, 'engagement'>): boolean => i.engagement === 'signed'
/** ★ La seule définition d'« à démarcher ». */
export const isInstitutionProspect = (i: Pick<Institution, 'engagement'>): boolean =>
  i.engagement === 'not_contacted' || i.engagement === 'contacted' || i.engagement === 'interested'

// ---------------------------------------------------------------------------
// AU3.4 — les quatre points marqués incertains dans le classeur du PO.
// ---------------------------------------------------------------------------

/**
 * Nommées par le PO. Reconnues par le NOM (normalisé), et en plus de toute
 * colonne « ודאות / הערה » que le classeur porterait : un point douteux ne
 * doit jamais devenir sûr parce qu'une colonne a été renommée.
 */
export const UNCERTAIN_NAMED: ReadonlyArray<{ name: string; locality?: string }> = [
  { name: 'ממדבר מתנה', locality: 'נווה' },
  { name: 'מכינת עצמונה' },
  { name: 'מדבר שור', locality: 'אשכול' },
  { name: 'ישיבת מרחבעם' },
]

const QUOTES = /[׳״'"`´’‘“”]/g
export function comparableInstitutionName(s: string): string {
  return normalizeLocality(s).replace(QUOTES, '').replace(/\s+/g, ' ').trim()
}

/** Le cœur distinctif d'un nom : sans « מכינת », « ישיבת », « מדרשת », « מ » initial. */
function nameCore(s: string): string {
  return comparableInstitutionName(s)
    .replace(/^(המכינה|מכינת|מכינה|ישיבת ההסדר|ישיבת|ישיבה|מדרשת|מדרשה)\s+/u, '')
    .replace(/^ממדבר/u, 'מדבר')
}

export function isNamedUncertain(name: string, locality: string): boolean {
  const core = nameCore(name)
  const loc = comparableInstitutionName(locality)
  return UNCERTAIN_NAMED.some((u) => {
    const uc = nameCore(u.name)
    if (!core.includes(uc) && !uc.includes(core)) return false
    // « מדבר מתנה » existe peut-être ailleurs : la localité tranche quand le PO l'a dite.
    if (u.locality && loc && !loc.includes(comparableInstitutionName(u.locality))) return false
    return core.length > 0
  })
}

// ---------------------------------------------------------------------------
// Lecture du classeur
// ---------------------------------------------------------------------------

export type InstitutionField =
  | 'name'
  | 'locality'
  | 'kind'
  | 'audience'
  | 'network'
  | 'lat'
  | 'lng'
  | 'coords'
  | 'certainty'
  | 'engagement'
  | 'contactName'
  | 'contactPhone'
  | 'notes'

/** En-têtes reconnus, comparés après normalisation (espaces, guillemets). */
export const INSTITUTION_HEADERS: ReadonlyArray<{ field: InstitutionField; headers: readonly string[] }> = [
  { field: 'name', headers: ['שם', 'שם המוסד', 'מוסד', 'שם מוסד', 'המוסד', 'institution', 'name'] },
  { field: 'locality', headers: ['יישוב', 'ישוב', 'מקום', 'עיר', 'מיקום', 'locality', 'city', 'town'] },
  { field: 'kind', headers: ['סוג', 'סוג מוסד', 'סוג המוסד', 'type', 'kind'] },
  { field: 'audience', headers: ['קהל', 'קהל יעד', 'מגדר', 'בנים/בנות', 'בנים / בנות', 'מין', 'audience', 'gender'] },
  { field: 'network', headers: ['רשת', 'עמותה', 'רשת/עמותה', 'רשת / עמותה', 'עמותה מנהלת', 'ארגון', 'רשת או עמותה', 'גוף מפעיל', 'network', 'organization'] },
  { field: 'lat', headers: ['lat', 'latitude', 'קו רוחב', 'רוחב'] },
  { field: 'lng', headers: ['lng', 'lon', 'long', 'longitude', 'קו אורך', 'אורך'] },
  { field: 'coords', headers: ['קואורדינטות', 'נקודה', 'מיקום gps', 'gps', 'coordinates', 'coords', 'נ״צ', 'נצ'] },
  { field: 'certainty', headers: ['ודאות', 'דיוק', 'אמינות', 'ודאות מיקום', 'הערת מיקום', 'certainty', 'accuracy'] },
  { field: 'engagement', headers: ['סטטוס', 'סטטוס התקשרות', 'מצב', 'status', 'engagement'] },
  { field: 'contactName', headers: ['איש קשר', 'שם איש קשר', 'contact'] },
  { field: 'contactPhone', headers: ['טלפון', 'נייד', 'טלפון איש קשר', 'phone'] },
  { field: 'notes', headers: ['הערות', 'הערה', 'notes'] },
]

export function institutionColumnIndex(headers: readonly string[]): Partial<Record<InstitutionField, number>> {
  const out: Partial<Record<InstitutionField, number>> = {}
  const norm = headers.map((h) => comparableInstitutionName(h).toLowerCase())
  for (const { field, headers: names } of INSTITUTION_HEADERS) {
    const wanted = names.map((n) => comparableInstitutionName(n).toLowerCase())
    const at = norm.findIndex((h, i) => wanted.includes(h) && !Object.values(out).includes(i))
    if (at >= 0) out[field] = at
  }
  return out
}

export function readInstitutionKind(raw: string, name = ''): InstitutionKind {
  const s = comparableInstitutionName(`${raw} ${raw ? '' : name}`)
  if (/מכינ|mechin|pre.?army/i.test(s)) return 'mechina'
  if (/הסדר|hesder|ישיב/i.test(s)) return 'hesder'
  if (/מדרש|midrash/i.test(s)) return 'midrasha'
  if (raw.trim() === '' && name) return readInstitutionKind(name)
  return 'other'
}

export function readInstitutionAudience(raw: string, kind: InstitutionKind): InstitutionAudience {
  const s = comparableInstitutionName(raw)
  if (/מעורב|משולב|מעורבת|mixed|co.?ed/i.test(s)) return 'mixed'
  if (/בנות|נשים|girls|women|female/i.test(s)) return 'girls'
  if (/בנים|גברים|boys|men|male/i.test(s)) return 'boys'
  // Par définition du type, quand la cellule est muette.
  if (kind === 'hesder') return 'boys'
  if (kind === 'midrasha') return 'girls'
  return 'unknown'
}

export function readEngagement(raw: string): InstitutionEngagement | null {
  const s = comparableInstitutionName(raw)
  if (!s) return null
  if (/לא רלוונט|not relevant/i.test(s)) return 'not_relevant'
  if (/טרם|לא נוצר|not contacted/i.test(s)) return 'not_contacted'
  if (/חתום|חתמ|signed/i.test(s)) return 'signed'
  if (/מעוניי|interested/i.test(s)) return 'interested'
  if (/נוצר קשר|contacted/i.test(s)) return 'contacted'
  return null
}

const UNCERTAIN_WORDS = /לא ודא|לא בטוח|משוער|לבדוק|לאמת|בערך|מקורב|לא מדויק|incertain|uncertain|approx|\?/i

function readNumber(raw: string): number | null {
  const v = Number(raw.replace(',', '.').trim())
  return raw.trim() !== '' && Number.isFinite(v) ? v : null
}

/** Israël et ses abords : un point hors de cette boîte n'est pas lu. */
function plausible(p: LatLng): boolean {
  return p.lat > 29 && p.lat < 33.6 && p.lng > 34 && p.lng < 36
}

export interface InstitutionRow {
  line: number
  name: string
  locality: string
  kind: InstitutionKind
  audience: InstitutionAudience
  network: string
  position: LatLng | null
  /** Le point a été lu dans l'ordre lng, lat et retourné. */
  swapped: boolean
  positionUncertain: boolean
  /** Pourquoi il est incertain : la colonne du classeur, ou la liste du PO. */
  uncertainBy: 'column' | 'named' | null
  engagement: InstitutionEngagement | null
  contactName: string
  contactPhone: string
  notes: string
  extra: string
}

/**
 * La grille du classeur (première ligne = en-têtes) → des lignes lues.
 * Tolérant : en-têtes en hébreu ou en anglais, coordonnées en deux colonnes ou
 * en une (« 31.25, 34.79 »), ordre lat/lng deviné (les plages ne se
 * recouvrent pas en Israël), lignes vides ignorées.
 */
export function readInstitutionRows(matrix: readonly (readonly string[])[]): {
  rows: InstitutionRow[]
  columns: Partial<Record<InstitutionField, number>>
  unknownHeaders: string[]
} {
  const headers = (matrix[0] ?? []).map((h) => String(h ?? ''))
  const columns = institutionColumnIndex(headers)
  const used = new Set(Object.values(columns))
  const unknownHeaders = headers.filter((h, i) => !used.has(i) && h.trim() !== '')
  const cell = (r: readonly string[], f: InstitutionField): string => {
    const i = columns[f]
    return i === undefined ? '' : String(r[i] ?? '').trim()
  }
  const rows: InstitutionRow[] = []
  matrix.slice(1).forEach((r, k) => {
    const name = cell(r, 'name')
    if (!name) return
    const locality = cell(r, 'locality')
    const kind = readInstitutionKind(cell(r, 'kind'), name)
    let position: LatLng | null = null
    let swapped = false
    const lat = readNumber(cell(r, 'lat'))
    const lng = readNumber(cell(r, 'lng'))
    if (lat !== null && lng !== null) position = { lat, lng }
    else if (cell(r, 'coords')) position = parsePositionInput(cell(r, 'coords'))
    if (position && !plausible(position) && plausible({ lat: position.lng, lng: position.lat })) {
      position = { lat: position.lng, lng: position.lat }
      swapped = true
    }
    if (position && !plausible(position)) position = null
    const certainty = cell(r, 'certainty')
    const byColumn = certainty !== '' && UNCERTAIN_WORDS.test(certainty)
    const byName = isNamedUncertain(name, locality)
    const extra = headers
      .map((h, i) => (!used.has(i) && String(r[i] ?? '').trim() !== '' ? `${h}: ${String(r[i]).trim()}` : ''))
      .filter(Boolean)
      .join(' · ')
    rows.push({
      line: k + 2,
      name,
      locality,
      kind,
      audience: readInstitutionAudience(cell(r, 'audience'), kind),
      network: cell(r, 'network'),
      position,
      swapped,
      positionUncertain: byColumn || byName,
      uncertainBy: byName ? 'named' : byColumn ? 'column' : null,
      engagement: readEngagement(cell(r, 'engagement')),
      contactName: cell(r, 'contactName'),
      contactPhone: cell(r, 'contactPhone'),
      notes: [cell(r, 'notes'), byColumn ? certainty : ''].filter(Boolean).join(' · '),
      extra,
    })
  })
  return { rows, columns, unknownHeaders }
}

// ---------------------------------------------------------------------------
// Le plan d'import (répétable)
// ---------------------------------------------------------------------------

/** Identité STABLE : le même classeur réimporté retrouve les mêmes lignes. */
export function institutionKey(name: string, locality: string): string {
  return `${comparableInstitutionName(name)}|${comparableInstitutionName(locality)}`
}

export function institutionIdOf(name: string, locality: string): string {
  // FNV-1a 32 bits : court, déterministe, sans dépendance.
  let h = 0x811c9dc5
  for (const ch of institutionKey(name, locality)) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `inst-${h.toString(36)}`
}

export type InstitutionAction =
  | { kind: 'create'; row: InstitutionRow; institution: Institution }
  | { kind: 'update'; row: InstitutionRow; id: string; patch: Partial<Institution>; changed: string[] }
  | { kind: 'same'; row: InstitutionRow; id: string }
  | { kind: 'duplicate'; row: InstitutionRow; sameLine: number }

export interface InstitutionPlan {
  actions: InstitutionAction[]
  uncertain: InstitutionRow[]
  withoutPosition: InstitutionRow[]
  unknownHeaders: string[]
  missingName: boolean
}

/**
 * ★ LES RÉGIMES DE COLONNE D'AO (règle 9bis), appliqués aux institutions :
 *   · le classeur FAIT AUTORITÉ sur nom, localité, type, public, réseau ;
 *   · il COMBLE un vide sur contact, téléphone, notes — jamais il n'efface ce
 *     que le PO a saisi dans l'app ;
 *   · le STATUT D'ENGAGEMENT est celui du PO dès qu'il existe : le classeur ne
 *     le pose qu'à la création (sinon « טרם נוצר קשר ») ;
 *   · le POINT : le classeur le remplace seulement s'il n'y en avait pas, ou
 *     si celui de l'app était incertain et que le classeur en donne un sûr.
 *     Un point INCERTAIN ne redevient jamais sûr par un réimport.
 */
export function planInstitutionImport(input: {
  matrix: readonly (readonly string[])[]
  existing: readonly Institution[]
  nowIso: string
}): InstitutionPlan {
  const { rows, columns, unknownHeaders } = readInstitutionRows(input.matrix)
  const byKey = new Map(input.existing.map((i) => [institutionKey(i.name, i.locality), i]))
  const findExisting = (row: InstitutionRow): Institution | undefined =>
    byKey.get(institutionKey(row.name, row.locality)) ?? matchInstitution(row, input.existing)
  const seen = new Map<string, number>()
  const actions: InstitutionAction[] = []
  for (const row of rows) {
    const key = institutionKey(row.name, row.locality)
    const dup = seen.get(key)
    if (dup !== undefined) {
      actions.push({ kind: 'duplicate', row, sameLine: dup })
      continue
    }
    seen.set(key, row.line)
    const found = findExisting(row)
    if (!found) {
      actions.push({
        kind: 'create',
        row,
        institution: {
          id: institutionIdOf(row.name, row.locality),
          name: row.name,
          locality: row.locality,
          kind: row.kind,
          audience: row.audience,
          network: row.network,
          position: row.position,
          positionUncertain: row.positionUncertain,
          engagement: row.engagement ?? 'not_contacted',
          contactName: row.contactName,
          contactPhone: row.contactPhone,
          notes: row.notes,
          extra: row.extra,
          source: 'import',
          engagementConfirmed: true,
          metOn: null,
          students: null,
          positionSource: row.position ? 'classeur' : '',
          aliases: '',
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        },
      })
      continue
    }
    const patch: Partial<Institution> = {}
    const changed: string[] = []
    const set = <K extends keyof Institution>(k: K, v: Institution[K]) => {
      if (JSON.stringify(found[k]) !== JSON.stringify(v)) {
        patch[k] = v
        changed.push(k)
      }
    }
    set('kind', row.kind)
    set('audience', row.audience)
    set('network', row.network)
    set('extra', row.extra)
    if (!found.contactName && row.contactName) set('contactName', row.contactName)
    if (!found.contactPhone && row.contactPhone) set('contactPhone', row.contactPhone)
    if (!found.notes && row.notes) set('notes', row.notes)
    if (row.position && (!found.position || (found.positionUncertain && !row.positionUncertain))) {
      set('position', row.position)
      set('positionUncertain', row.positionUncertain)
    } else if (row.positionUncertain && !found.positionUncertain && !found.positionSource) {
      // ★ AV1.6 — un point VÉRIFIÉ dans l'app (sa provenance est écrite) n'est
      // pas re-déclaré douteux par la liste du classeur.
      set('positionUncertain', true)
    }
    actions.push(changed.length ? { kind: 'update', row, id: found.id, patch, changed } : { kind: 'same', row, id: found.id })
  }
  return {
    actions,
    uncertain: rows.filter((r) => r.positionUncertain),
    withoutPosition: rows.filter((r) => !r.position),
    unknownHeaders,
    missingName: columns.name === undefined,
  }
}

// ---------------------------------------------------------------------------
// ★★ AV1.6 — L'APPARIEMENT : une institution saisie à la main (la tournée)
// n'est pas dupliquée par le classeur qui l'écrit autrement.
// ---------------------------------------------------------------------------

/** « קרית » et « קריית », « נוה » et « נווה » : une seule graphie pour comparer. */
export function comparableLocality(s: string): string {
  return comparableInstitutionName(s).replace(/קריית/g, 'קרית').replace(/(^|\s)נוה(\s|$)/g, '$1נווה$2')
}

/** Le cœur d'un nom, avec ses variantes d'écriture ramenées à une seule. */
function looseCore(s: string): string {
  return nameCore(s)
    .replace(/^(ההסדר|הסדר|תיכונית|ישיבה תיכונית|תיכונית תורנית)\s+/u, '')
    .replace(/קריית/g, 'קרית')
    .replace(/נוה/g, 'נווה')
    .replace(/מיימון/g, 'מימון')
    .trim()
}

/** Le mot de type en tête d'un nom ; deux types différents = deux établissements. */
function typeWord(s: string): 'mechina' | 'yeshiva' | 'midrasha' | 'ulpana' | null {
  const n = comparableInstitutionName(s)
  if (/^(המכינה|מכינת|מכינה)/.test(n)) return 'mechina'
  if (/^(ישיבת|ישיבה|הישיבה)/.test(n)) return 'yeshiva'
  if (/^(מדרשת|מדרשה)/.test(n)) return 'midrasha'
  if (/^(אולפנת|אולפנה|אולפנא)/.test(n)) return 'ulpana'
  return null
}
const sameType = (a: string, b: string): boolean => {
  const x = typeWord(a)
  const y = typeWord(b)
  return !x || !y || x === y
}

function namesOf(i: Pick<Institution, 'name' | 'aliases'>): string[] {
  return [i.name, ...i.aliases.split('·').map((a) => a.trim()).filter(Boolean)]
}

/**
 * Trois règles, de la plus sûre à la plus large, et jamais deux candidats :
 *   1. un NOM (ou un autre nom) identique après normalisation, même localité ;
 *   2. même localité, et l'un des cœurs de nom contient l'autre ;
 *   3. à moins de 1,5 km l'un de l'autre, et un même cœur de nom.
 * Un appariement AMBIGU (deux candidats) n'apparie rien : la ligne devient
 * une création, que l'aperçu montre — jamais tranché en silence (règle d'AO).
 */
export function matchInstitution(row: Pick<InstitutionRow, 'name' | 'locality' | 'position'>, existing: readonly Institution[]): Institution | undefined {
  const loc = comparableLocality(row.locality)
  const core = looseCore(row.name)
  if (!core) return undefined
  const sameLoc = (i: Institution) => !loc || !i.locality || comparableLocality(i.locality) === loc
  const pick = (c: Institution[]) => (c.length === 1 ? c[0] : undefined)
  const r1 = existing.filter((i) => sameLoc(i) && namesOf(i).some((n) => sameType(n, row.name) && looseCore(n) === core))
  if (r1.length) return pick(r1)
  const r2 = existing.filter((i) => sameLoc(i) && loc !== '' && namesOf(i).some((n) => {
    if (!sameType(n, row.name)) return false
    const c = looseCore(n)
    return c.length >= 3 && (c.includes(core) || core.includes(c))
  }))
  if (r2.length) return pick(r2)
  if (!row.position) return undefined
  const near = (i: Institution) => {
    if (!i.position) return false
    const dLat = (i.position.lat - row.position!.lat) * 111
    const dLng = (i.position.lng - row.position!.lng) * 95
    return Math.hypot(dLat, dLng) <= 1.5
  }
  const r3 = existing.filter((i) => near(i) && namesOf(i).some((n) => sameType(n, row.name) && (looseCore(n) === core || (looseCore(n).length >= 3 && (looseCore(n).includes(core) || core.includes(looseCore(n)))))))
  return pick(r3)
}
