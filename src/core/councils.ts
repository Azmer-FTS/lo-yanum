import data from './councils.json'
import { findLocality, normalizeLocality } from './gazetteer'
import { nearestLocalities } from './localitySearch'
import { regionOf } from './regions'
import type { LatLng, RegionId } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AN7.3 (2026-09-16) — LA מועצה אזורית : UNE LISTE, ET DÉDUITE DE L'ADRESSE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Le PO ne les connaît pas et fera des fautes. » Elle était tapée à la main.
 * La liste vient du fichier du למ״ס (`scripts/councils.ts` → `councils.json`) :
 * les 54 conseils régionaux de 2021 et, pour 1 203 localités, le conseil
 * auquel elles appartiennent. Une ville ou un conseil local n'a pas de מועצה
 * אזורית : rien n'est proposé, ce qui est la vérité.
 *
 * Deux sources, dans cet ordre :
 *   1. le יישוב choisi (son סמל → son conseil) ;
 *   2. à défaut, l'épingle : le conseil de la localité la plus proche, à moins
 *      de `COUNCIL_NEAR_KM` — une ferme hors localité appartient au conseil
 *      des localités qui l'entourent.
 */
export const REGIONAL_COUNCILS: readonly string[] = data.names
const BY_CODE = data.byCode as Record<string, number>

/** À quelle distance une localité voisine prête son conseil à une épingle. */
export const COUNCIL_NEAR_KM = 6

export function councilOfCode(code: number | null | undefined): string | null {
  if (code == null) return null
  const i = BY_CODE[String(code)]
  return i === undefined ? null : REGIONAL_COUNCILS[i]
}

/**
 * Une saisie ancienne ou importée (« מ.א. שדות נגב », « מועצה אזורית רמת
 * נגב ») ramenée au nom de la liste, ou `null` si elle n'y est pas.
 */
export function matchCouncil(input: string): string | null {
  const bare = normalizeLocality(
    input.replace(/^\s*(מועצה אזורית|מ\.?\s*א\.?|מ["״׳']א)\s*/u, ''),
  )
  if (bare === '') return null
  return REGIONAL_COUNCILS.find((c) => normalizeLocality(c) === bare) ?? null
}

export interface AddressSuggestion<T> {
  value: T
  source: 'locality' | 'position'
  /** Le nom de la localité qui a répondu. */
  via: string
  km?: number
}

export function suggestCouncil(input: {
  locality: string
  position: LatLng | null
}): AddressSuggestion<string> | null {
  const l = input.locality.trim() === '' ? null : findLocality(input.locality)
  if (l) {
    const c = councilOfCode(l.code)
    return c ? { value: c, source: 'locality', via: l.name } : null
  }
  if (!input.position) return null
  for (const near of nearestLocalities(input.position, 8)) {
    if (near.km > COUNCIL_NEAR_KM) break
    const c = councilOfCode(near.locality.code)
    if (c) return { value: c, source: 'position', via: near.locality.name, km: near.km }
  }
  return null
}

/** ★ AN7.2 — la région que l'adresse désigne : l'épingle, sinon le יישוב. */
export function suggestRegion(input: {
  locality: string
  position: LatLng | null
}): AddressSuggestion<RegionId> | null {
  if (input.position) {
    const r = regionOf(input.position)
    return r ? { value: r, source: 'position', via: '' } : null
  }
  const l = input.locality.trim() === '' ? null : findLocality(input.locality)
  const r = l ? regionOf(l.position) : null
  return r && l ? { value: r, source: 'locality', via: l.name } : null
}
