import { findLocality } from './gazetteer'
import { isInIsrael, parsePositionInput } from './geo'
import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BD (2026-10-12) — UNE ADRESSE PROPOSE UN POINT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO cherche l'adresse d'une institution sur Google, la saisit dans la
 * fiche… et rien ne se passait : aucune carte, aucun point. Une adresse est
 * désormais une PROPOSITION de point, que le PO valide ou corrige sur la carte
 * (glisser, ou appui long ailleurs). Jamais posée sans lui.
 *
 * Trois lectures, de la plus précise à la plus grossière :
 *   1. des COORDONNÉES ou un lien de carte collés dans le champ (`coords`) —
 *      la lecture d'AB6 (`parsePositionInput`), exacte ;
 *   2. l'adresse COMPLÈTE, cherchée en ligne (OpenStreetMap / Nominatim,
 *      `address`) — rue et numéro quand la base les connaît ; c'est l'appel
 *      réseau, fait par l'interface (`ui/geocode.ts`), ce module ne fait que
 *      lire sa réponse (`readGeocoderReply`) ;
 *   3. la LOCALITÉ trouvée dans l'adresse, ou à défaut celle de la fiche
 *      (`locality`) — le centre de la localité, du répertoire national hors
 *      ligne (`gazetteer`). Approximatif, et dit comme tel.
 * Un point hors de la boîte d'Israël est refusé (une adresse homonyme à
 * l'étranger n'est pas une proposition).
 */
export type AddressPointSource = 'coords' | 'address' | 'locality'

export interface AddressPoint {
  position: LatLng
  source: AddressPointSource
  /** Ce que la proposition a reconnu : la localité, ou le libellé du géocodeur. */
  label: string
}

/**
 * ⚠️ « רחוב », « שדרות », « דרך » sont AUSSI des localités (le moshav Rehov, la
 *    ville de Sderot) : en tête d'un morceau d'adresse, ce sont des mots de rue.
 */
const STREET_WORDS = new Set(['רחוב', 'רח', 'שדרות', 'שד', 'דרך', 'כיכר', 'סמטת', 'סמטה', 'משעול', 'שכונת', 'ת.ד', 'תד'])
const isStreetWord = (w: string): boolean => STREET_WORDS.has(w.replace(/[׳'".]/g, ''))

/** Les localités possibles d'un morceau : les suites de mots, des plus longues, en finissant par la fin. */
function candidatesOf(part: string): string[] {
  const words = part.split(/\s+/).filter(Boolean)
  const out: string[] = [part]
  for (let len = Math.min(4, words.length - 1); len >= 1; len--) {
    for (let start = words.length - len; start >= 0; start--) {
      if (start === 0 && words.length > len && isStreetWord(words[0])) continue
      out.push(words.slice(start, start + len).join(' '))
    }
  }
  return out.filter((c) => !(c.split(/\s+/).length === 1 && isStreetWord(c)) || part.trim() === c)
}

function findIn(candidates: readonly string[]): AddressPoint | null {
  for (const candidate of candidates) {
    // Un mot d'une lettre ou deux (« 3 », « ד׳ ») n'est jamais une localité.
    if (candidate.replace(/[\d\s]/g, '').length < 3) continue
    const hit = findLocality(candidate)
    if (hit) return { position: hit.position, source: 'locality', label: hit.name }
  }
  return null
}

/**
 * ★ La proposition SANS réseau : coordonnées collées ; sinon la localité d'un
 * morceau de l'adresse APRÈS le premier (« רחוב …, אופקים ») ; sinon celle de
 * la fiche ; sinon une localité du premier morceau, hors mots de rue.
 * `null` = rien de reconnu.
 */
export function localPointForAddress(address: string, locality = ''): AddressPoint | null {
  const text = address.trim()
  const coords = text ? parsePositionInput(text) : null
  if (coords) return { position: coords, source: 'coords', label: '' }
  const parts = text
    .split(/[,،\n/|]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const later = findIn(parts.slice(1).reverse().flatMap(candidatesOf))
  if (later) return later
  const own = locality.trim() ? findLocality(locality) : null
  if (own) return { position: own.position, source: 'locality', label: own.name }
  return parts[0] ? findIn(candidatesOf(parts[0])) : null
}

/** L'adresse demandée au géocodeur : celle saisie, avec la localité de la fiche si elle n'y est pas. */
export function geocoderQuery(address: string, locality = ''): string {
  const a = address.trim()
  const l = locality.trim()
  if (!l || a.includes(l)) return a
  return `${a}, ${l}`
}

/**
 * La réponse de Nominatim (`format=jsonv2`) : le PREMIER résultat qui tombe en
 * Israël, ou `null`. Lue ici, sans réseau, pour être éprouvée par une porte pure.
 */
export function readGeocoderReply(reply: unknown): AddressPoint | null {
  if (!Array.isArray(reply)) return null
  for (const hit of reply) {
    if (!hit || typeof hit !== 'object') continue
    const h = hit as Record<string, unknown>
    const lat = Number(h.lat)
    const lng = Number(h.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInIsrael({ lat, lng })) continue
    const label = typeof h.display_name === 'string' ? h.display_name.split(',').slice(0, 3).join(',').trim() : ''
    return { position: { lat, lng }, source: 'address', label }
  }
  return null
}
