import { boundedDistance } from './lookup'
import type { AgendaEvent, Farm, LatLng } from './types'
import type { Institution, InstitutionContactRole } from './institutions'
import { contactPhones } from './institutions'
import type { Task, TaskList } from './tasks'
import type { Tour } from './tours'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BF (2026-10-14) — LA RECHERCHE GLOBALE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Une barre de recherche globale qui s'ouvrirait un peu comme celle d'Apple…
 *   qui me permet même de faire des fautes d'orthographe… il me dit : j'ai
 *   trouvé ce résultat dans les fermes et ce résultat dans les itinéraires. »
 *
 * PUR : ni DOM, ni React, ni réseau. Les documents sont construits à partir de
 * ce que l'application a DÉJÀ en mémoire (`buildSearchDocs`) ; la frappe ne
 * déclenche aucune requête.
 *
 * ★ LE CLASSEMENT, DANS CET ORDRE STRICT (un rang ne passe jamais devant un
 *   rang meilleur, quel que soit le champ) :
 *     0. préfixe exact du champ              (« אשק » → אשקלון)
 *     1. préfixe d'un mot du champ           (« אשק » → ישיבת אורות אשקלון)
 *     2. sous-chaîne                         (« שקל » → אשקלון)
 *     3. approchant, MOT À MOT : Levenshtein ≤ 1 jusqu'à 5 caractères, ≤ 2
 *        au-delà (la transposition compte pour une, `boundedDistance`).
 *   Dans un rang, le NOM passe devant les autres champs (localité, agriculteur,
 *   téléphone…) ; à score égal, ce qui a été ouvert récemment passe devant.
 *
 * ⚠️ PAS D'APPROCHANT SOUS TROIS CARACTÈRES. À une correction près, une
 *    requête de deux lettres rejoint presque chaque mot de la base : le rang 3
 *    noierait les vrais résultats et « לא נמצאו תוצאות » n'apparaîtrait jamais.
 */

export type SearchKind = 'farm' | 'institution' | 'contact' | 'tour' | 'task' | 'event' | 'locality'

/** L'ordre de départage des groupes à score égal (pas l'ordre d'affichage). */
export const SEARCH_KINDS: readonly SearchKind[] = ['farm', 'institution', 'contact', 'tour', 'task', 'event', 'locality']

export interface SearchField {
  text: string
  /** Le nom de l'entité : passe devant les autres champs à rang égal. */
  primary?: boolean
  /** Un numéro : comparé chiffres contre chiffres (voir `phoneDigits`). */
  phone?: boolean
}

export interface SearchDoc {
  kind: SearchKind
  /** Unique dans son type. */
  id: string
  title: string
  /** La ligne de contexte (localité · agriculteur, rôle · fiche, date…). */
  context: string
  fields: SearchField[]
  /** Où mène la ligne (l'écran et la sélection, comme depuis sa liste). */
  href: string
  /** Une ferme ou une institution placée : la carte s'y centre. */
  position?: LatLng | null
  /** Pour la pastille de statut d'une ferme (`FarmStatusDot`). */
  status?: Farm['status']
}

export interface SearchHit {
  doc: SearchDoc
  /** Plus petit = meilleur : `rang × 2 + (champ secondaire ? 1 : 0)`. */
  score: number
  /** Le champ qui a produit la correspondance (index dans `doc.fields`). */
  field: number
  /** La portion du texte ORIGINAL du champ à surligner, `[début, fin)`. */
  range: [number, number] | null
}

export interface SearchGroup {
  kind: SearchKind
  hits: SearchHit[]
  best: number
}

// --- La normalisation ----------------------------------------------------------

/**
 * Les finales hébraïques ramenées à leur forme ordinaire (on tape les deux), et
 * ע ramené à א : les deux se confondent à l'oreille et à la dictée.
 */
const FOLD: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ', 'ע': 'א' }
/** Effacés : geresh, gershayim, guillemets et apostrophes, points. */
const DROP = /['"`’‘׳״.]/
/** Des séparateurs : tirets (dont le maqaf ־), barres, virgules, parenthèses. */
const SEPARATOR = /[\s\-–—‐־_/\\,;:()[\]{}|]/

/**
 * La forme normalisée ET, pour chacun de ses caractères, l'index du caractère
 * d'origine — c'est ce qui permet de surligner dans le texte affiché ce qui a
 * été trouvé dans le texte normalisé.
 */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    /* Le niqqud et les cantillations (U+0591–U+05C7), sauf le maqaf (U+05BE),
       qui sépare deux mots. */
    if (code >= 0x0591 && code <= 0x05c7 && code !== 0x05be) continue
    const c = text[i]
    if (DROP.test(c)) continue
    if (SEPARATOR.test(c)) {
      if (norm !== '' && !norm.endsWith(' ')) {
        norm += ' '
        map.push(i)
      }
      continue
    }
    const lower = c.toLowerCase()
    const folded = FOLD[lower] ?? lower
    for (const ch of folded) {
      norm += ch
      map.push(i)
    }
  }
  if (norm.endsWith(' ')) {
    norm = norm.slice(0, -1)
    map.pop()
  }
  return { norm, map }
}

export function normalizeSearch(text: string): string {
  return normalizeWithMap(text).norm
}

/**
 * Un numéro israélien sous UNE forme : chiffres seuls, sans `00`, sans `972`,
 * sans le `0` national. « 050-000-0123 », « 0500000123 », « +972500000123 » et
 * « 00972 50 000 0123 » donnent tous « 500000123 » (numéro fictif).
 */
export function phoneDigits(text: string): string {
  let d = text.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('972')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return d
}

/** Une requête qui n'est qu'un numéro (chiffres et ponctuation de numéro). */
function phoneQuery(raw: string): string | null {
  const t = raw.trim()
  if (!/^[+\d\s\-().]+$/.test(t)) return null
  const d = phoneDigits(t)
  return d.length >= 3 ? d : null
}

/** Le budget de fautes d'un mot tapé. Voir l'en-tête. */
export function typoBudgetOf(token: string): number {
  if (token.length < 3) return 0
  return token.length <= 5 ? 1 : 2
}

// --- La correspondance ---------------------------------------------------------

interface FieldMatch {
  tier: 0 | 1 | 2 | 3
  /** `[début, fin)` dans la forme NORMALISÉE. */
  at: [number, number]
}

/** Les mots d'une forme normalisée, avec leur position. */
function wordsOf(norm: string): Array<{ word: string; start: number }> {
  const out: Array<{ word: string; start: number }> = []
  let start = 0
  for (const w of norm.split(' ')) {
    if (w !== '') out.push({ word: w, start })
    start += w.length + 1
  }
  return out
}

/** Le meilleur rang de `q` (normalisé) dans `norm` (normalisé). */
function matchText(q: string, norm: string, fuzzy: boolean): FieldMatch | null {
  if (norm === '' || q === '') return null
  if (norm.startsWith(q)) return { tier: 0, at: [0, q.length] }
  const words = wordsOf(norm)
  for (const w of words) {
    if (w.start > 0 && norm.startsWith(q, w.start)) return { tier: 1, at: [w.start, w.start + q.length] }
  }
  const inside = norm.indexOf(q)
  if (inside >= 0) return { tier: 2, at: [inside, inside + q.length] }
  /* « קרייתגת » tapé sans espace trouve « קריית־גת ». */
  const compactQ = q.replace(/ /g, '')
  if (compactQ.length >= 3 && norm.replace(/ /g, '').includes(compactQ)) {
    const first = norm.indexOf(compactQ[0])
    return { tier: 2, at: [Math.max(0, first), norm.length] }
  }
  if (!fuzzy || q.includes(' ')) return null
  const budget = typoBudgetOf(q)
  if (budget === 0) return null
  let best: { d: number; w: { word: string; start: number } } | null = null
  for (const w of words) {
    /* Le mot entier, ou son début à la longueur de la requête (une faute dans
       un mot qu'on n'a pas fini de taper). */
    const d = Math.min(
      boundedDistance(q, w.word, budget),
      w.word.length > q.length ? boundedDistance(q, w.word.slice(0, q.length), budget) : budget + 1,
    )
    if (d <= budget && (!best || d < best.d)) best = { d, w }
  }
  return best ? { tier: 3, at: [best.w.start, best.w.start + best.w.word.length] } : null
}

/** Ramène une portion de la forme normalisée au texte d'origine. */
function originalRange(map: number[], at: [number, number]): [number, number] | null {
  if (at[1] <= at[0] || map.length === 0) return null
  const start = map[Math.min(at[0], map.length - 1)]
  const end = map[Math.min(at[1] - 1, map.length - 1)] + 1
  return [start, end]
}

/**
 * Le score d'un document pour une requête, ou `null` s'il ne correspond pas.
 * `q` est la requête normalisée, `digits` sa forme de numéro (ou `null`).
 */
function scoreDoc(doc: SearchDoc, q: string, digits: string | null): SearchHit | null {
  let best: SearchHit | null = null
  const consider = (tier: number, primary: boolean, field: number, range: [number, number] | null): void => {
    const score = tier * 2 + (primary ? 0 : 1)
    if (!best || score < best.score) best = { doc, score, field, range }
  }

  const norms = doc.fields.map((f) => normalizeWithMap(f.text))

  doc.fields.forEach((f, i) => {
    if (f.phone) {
      if (!digits) return
      const fd = phoneDigits(f.text)
      if (fd === '') return
      if (fd.startsWith(digits)) consider(f.primary ? 0 : 1, !!f.primary, i, [0, f.text.length])
      else if (digits.length >= 4 && fd.includes(digits)) consider(2, !!f.primary, i, [0, f.text.length])
      return
    }
    const m = matchText(q, norms[i].norm, true)
    if (m) consider(m.tier, !!f.primary, i, originalRange(norms[i].map, m.at))
  })
  if (best) return best

  /* Plusieurs mots tapés, aucun champ ne les porte d'un bloc : chaque mot doit
     se trouver quelque part (mot à mot, une faute par mot permise) ; le rang
     est celui du pire mot, et jamais mieux qu'une sous-chaîne. */
  const tokens = q.split(' ').filter(Boolean)
  if (tokens.length < 2) return null
  let worst = 2
  let allPrimary = true
  let firstField = -1
  let firstRange: [number, number] | null = null
  for (const token of tokens) {
    let tokenBest: { tier: number; field: number; primary: boolean; at: [number, number] } | null = null
    doc.fields.forEach((f, i) => {
      if (f.phone) return
      const m = matchText(token, norms[i].norm, true)
      if (!m) return
      const better = !tokenBest || m.tier < tokenBest.tier || (m.tier === tokenBest.tier && !!f.primary && !tokenBest.primary)
      if (better) tokenBest = { tier: m.tier, field: i, primary: !!f.primary, at: m.at }
    })
    if (!tokenBest) return null
    const tb = tokenBest as { tier: number; field: number; primary: boolean; at: [number, number] }
    worst = Math.max(worst, tb.tier)
    allPrimary = allPrimary && tb.primary
    if (firstField < 0) {
      firstField = tb.field
      firstRange = originalRange(norms[tb.field].map, tb.at)
    }
  }
  return { doc, score: worst * 2 + (allPrimary ? 0 : 1), field: firstField, range: firstRange }
}

export const recentKeyOf = (doc: Pick<SearchDoc, 'kind' | 'id'>): string => `${doc.kind}:${doc.id}`

/**
 * Les documents qui correspondent, du meilleur au moins bon. Une requête vide
 * (ou faite de ponctuation seule) ne rend RIEN — jamais toute la base.
 */
export function searchDocs(query: string, docs: readonly SearchDoc[], opts: { recent?: readonly string[] } = {}): SearchHit[] {
  const q = normalizeSearch(query)
  const digits = phoneQuery(query)
  if (q === '' && !digits) return []
  const recent = opts.recent ?? []
  const recency = (h: SearchHit): number => {
    const i = recent.indexOf(recentKeyOf(h.doc))
    return i < 0 ? Number.POSITIVE_INFINITY : i
  }
  const hits: SearchHit[] = []
  for (const doc of docs) {
    const h = scoreDoc(doc, q, digits)
    if (h) hits.push(h)
  }
  return hits.sort((a, b) => a.score - b.score || recency(a) - recency(b) || a.doc.title.localeCompare(b.doc.title, 'he'))
}

/**
 * Par type d'entité, les groupes rangés par leur MEILLEUR score (puis par
 * l'ordre de `SEARCH_KINDS`) — jamais dans un ordre fixe.
 */
export function groupHits(hits: readonly SearchHit[]): SearchGroup[] {
  const byKind = new Map<SearchKind, SearchHit[]>()
  for (const h of hits) {
    const list = byKind.get(h.doc.kind)
    if (list) list.push(h)
    else byKind.set(h.doc.kind, [h])
  }
  return [...byKind.entries()]
    .map(([kind, list]) => ({ kind, hits: list, best: list[0].score }))
    .sort((a, b) => a.best - b.best || SEARCH_KINDS.indexOf(a.kind) - SEARCH_KINDS.indexOf(b.kind))
}

/** Les dix derniers éléments ouverts, le plus récent en tête, sans doublon. */
export const RECENT_MAX = 10
export function pushRecent(list: readonly string[], key: string, max = RECENT_MAX): string[] {
  return [key, ...list.filter((k) => k !== key)].slice(0, max)
}

// --- Les documents -------------------------------------------------------------

export interface SearchSources {
  farms: readonly Farm[]
  institutions: readonly Institution[]
  tours: readonly Tour[]
  tasks: readonly Task[]
  taskLists: readonly TaskList[]
  events: readonly AgendaEvent[]
}

/** Les mots de l'interface, injectés : le cœur ne parle aucune langue. */
export interface SearchWords {
  date: (iso: string) => string
  day: (dayKey: string) => string
  institutionRole: (inst: Institution, role: InstitutionContactRole, secretariat: boolean) => string
  farmContact: string
  stops: (count: number) => string
  localityCounts: (farms: number, institutions: number) => string
}

const join = (...parts: Array<string | null | undefined>): string => parts.filter((p) => p && p.trim() !== '').join(' · ')

/**
 * Tout ce que la recherche couvre, à partir des données DÉJÀ chargées :
 * fermes, institutions, contacts (d'une ferme ou d'une institution),
 * itinéraires, tâches ouvertes, rendez-vous et gardes de l'agenda, localités.
 */
export function buildSearchDocs(src: SearchSources, words: SearchWords): SearchDoc[] {
  const docs: SearchDoc[] = []

  for (const f of src.farms) {
    const phones = [f.farmerPhone ?? '', ...f.contacts.map((c) => c.phone)].filter((p) => p.trim() !== '')
    docs.push({
      kind: 'farm',
      id: f.id,
      title: f.name,
      context: join(f.locality, f.farmerName),
      fields: [
        { text: f.name, primary: true },
        { text: f.farmName ?? '' },
        { text: f.farmerName ?? '' },
        { text: f.locality },
        { text: f.nearestLocality ?? '' },
        ...f.contacts.map((c) => ({ text: c.name })),
        ...phones.map((p) => ({ text: p, phone: true })),
      ],
      href: `/coordinator/farms/${f.id}`,
      position: f.positionMissing ? null : f.position,
      status: f.status,
    })
    for (const c of f.contacts) {
      if (c.name.trim() === '' && c.phone.trim() === '') continue
      docs.push({
        kind: 'contact',
        id: `farm:${f.id}:${c.id}`,
        title: c.name.trim() || c.phone,
        context: join(c.role.trim() || words.farmContact, f.name),
        fields: [
          { text: c.name, primary: true },
          { text: c.role },
          { text: c.phone, phone: true },
        ],
        href: `/coordinator/farms/${f.id}`,
        position: f.positionMissing ? null : f.position,
      })
    }
  }

  for (const i of src.institutions) {
    const contacts = i.contacts ?? []
    docs.push({
      kind: 'institution',
      id: i.id,
      title: i.name,
      context: join(i.locality, contacts[0]?.name || i.contactName),
      fields: [
        { text: i.name, primary: true },
        ...i.aliases
          .split('·')
          .map((a) => a.trim())
          .filter(Boolean)
          .map((a) => ({ text: a, primary: true })),
        { text: i.locality },
        { text: i.network },
        { text: i.address ?? '' },
        { text: i.contactName },
        ...contacts.map((c) => ({ text: c.name })),
        { text: i.contactPhone, phone: true },
        ...contacts.flatMap((c) => contactPhones(c).map((p) => ({ text: p.number, phone: true }))),
      ],
      href: `/coordinator/institutions?open=${encodeURIComponent(i.id)}`,
      position: i.position,
    })
    for (const c of contacts) {
      const numbers = contactPhones(c).map((p) => p.number)
      const secretariat = c.name.trim() === ''
      if (secretariat && numbers.length === 0) continue
      const role = words.institutionRole(i, c.role, secretariat)
      docs.push({
        kind: 'contact',
        id: `institution:${i.id}:${c.id}`,
        title: c.name.trim() || role,
        context: join(c.name.trim() ? role : '', i.name),
        fields: [{ text: c.name, primary: true }, { text: role }, ...numbers.map((n) => ({ text: n, phone: true }))],
        href: `/coordinator/institutions?open=${encodeURIComponent(i.id)}`,
        position: i.position,
      })
    }
  }

  const farmName = new Map(src.farms.map((f) => [f.id, f.name]))
  for (const t of src.tours) {
    const stops = t.farmIds.map((id) => farmName.get(id) ?? '').filter(Boolean)
    docs.push({
      kind: 'tour',
      id: t.id,
      title: t.name.trim() || words.day(t.dayKey),
      context: join(words.day(t.dayKey), words.stops(t.farmIds.length + (t.freeStops?.length ?? 0))),
      fields: [
        { text: t.name, primary: true },
        ...stops.map((s) => ({ text: s })),
        ...(t.freeStops ?? []).map((s) => ({ text: s.name })),
      ],
      href: `/coordinator/route?tour=${encodeURIComponent(t.id)}`,
    })
  }

  const listName = new Map(src.taskLists.map((l) => [l.id, l.name]))
  for (const t of src.tasks) {
    if (t.archivedAt) continue
    docs.push({
      kind: 'task',
      id: t.id,
      title: t.title,
      context: join(listName.get(t.listId), t.dueOn ? words.day(t.dueOn) : ''),
      fields: [{ text: t.title, primary: true }, { text: t.note }, { text: listName.get(t.listId) ?? '' }],
      href: `/coordinator/agenda?task=${encodeURIComponent(t.id)}`,
    })
  }

  for (const e of src.events) {
    /* Un itinéraire est déjà dans son groupe : son reflet n'y est pas répété. */
    if (e.kind === 'tour') continue
    docs.push({
      kind: 'event',
      id: `${e.kind}:${e.id}`,
      title: e.title,
      context: join(words.date(e.at), e.subtitle),
      fields: [{ text: e.title, primary: true }, { text: e.subtitle }],
      href: `/coordinator/agenda?event=${encodeURIComponent(`${e.kind}:${e.id}`)}`,
      position: e.position,
    })
  }

  /* Les localités où le programme a quelque chose — pas les 1 174 du pays. */
  const places = new Map<string, { name: string; farms: number; institutions: number }>()
  const count = (name: string, which: 'farms' | 'institutions'): void => {
    const key = normalizeSearch(name)
    if (key === '') return
    const p = places.get(key) ?? { name: name.trim(), farms: 0, institutions: 0 }
    p[which] += 1
    places.set(key, p)
  }
  for (const f of src.farms) count(f.locality, 'farms')
  for (const i of src.institutions) count(i.locality, 'institutions')
  for (const p of places.values()) {
    docs.push({
      kind: 'locality',
      id: normalizeSearch(p.name),
      title: p.name,
      context: words.localityCounts(p.farms, p.institutions),
      fields: [{ text: p.name, primary: true }],
      href: p.farms > 0 ? `/coordinator/farms?q=${encodeURIComponent(p.name)}` : `/coordinator/institutions?q=${encodeURIComponent(p.name)}`,
    })
  }

  return docs
}
