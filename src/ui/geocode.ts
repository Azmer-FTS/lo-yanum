import { geocoderQuery, localPointForAddress, readGeocoderReply } from '@core/index'
import type { AddressPoint } from '@core/index'

/**
 * ★★ BD (2026-10-12) — LA PROPOSITION D'UN POINT POUR UNE ADRESSE, avec le
 * réseau quand il y en a (voir `core/addressPoint.ts` pour les trois lectures).
 *
 * ★ UN SEUL APPEL, SUR UN GESTE DU PO (« חיפוש במפה » ou la sortie du champ),
 *   jamais à chaque frappe : c'est la règle d'usage de Nominatim (une requête
 *   par seconde au plus), et c'est ce qui suffit ici. 8 s au plus (deux essais : l'adresse, puis la rue sans numéro) ; au-delà,
 *   ou hors ligne, la lecture sans réseau (coordonnées, puis la localité) prend
 *   le relais — la proposition est alors le centre de la localité, et le dit.
 * ⛔ Seule l'ADRESSE d'un lieu part (celle d'une institution, d'un contact à
 *    traiter) : jamais un nom, jamais un téléphone.
 */
const GEOCODER = 'https://nominatim.openstreetmap.org/search'

export async function proposePointForAddress(address: string, locality = ''): Promise<AddressPoint | null> {
  const local = localPointForAddress(address, locality)
  if (local?.source === 'coords') return local
  if (!address.trim()) return local
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return local
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 8000)
  const ask = async (text: string) => {
    const q = new URLSearchParams({ format: 'jsonv2', limit: '3', countrycodes: 'il', 'accept-language': 'he', q: geocoderQuery(text, locality) })
    const res = await fetch(`${GEOCODER}?${q.toString()}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    return res.ok ? readGeocoderReply(await res.json()) : null
  }
  try {
    const hit = await ask(address)
    if (hit) return hit
    /* Le numéro que la base ne connaît pas : la RUE, une seconde fois (une
       seconde plus tard — une requête par seconde au plus). */
    const street = address.replace(/\d+[א-ת]?/g, ' ').replace(/\s+/g, ' ').trim()
    if (street && street !== address.trim()) {
      await new Promise((r) => window.setTimeout(r, 1100))
      const again = await ask(street)
      if (again) return again
    }
    return local
  } catch {
    return local
  } finally {
    window.clearTimeout(timer)
  }
}
