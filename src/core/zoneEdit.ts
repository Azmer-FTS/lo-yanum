import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BH (2026-10-14) — RETOUCHER UNE FORME DÉJÀ TRACÉE. LA PARTIE PURE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Il a tracé une forme, s'est trompé, et ne peut ni la corriger ni la
 * supprimer. » Chaque geste de l'édition est une fonction d'un anneau vers un
 * anneau, sans effet de bord : déplacer un sommet, en insérer un sur une
 * arête, en retirer un. Une SESSION garde l'anneau courant et la pile des
 * états précédents : « annuler » rend EXACTEMENT l'état d'avant, autant de
 * fois qu'il y a eu de gestes.
 *
 * ⛔ UNE FORME A AU MOINS TROIS SOMMETS. Retirer le troisième est refusé (et
 *    l'écran dit pourquoi) ; le magasin refuse d'enregistrer une forme à
 *    deux sommets (`isValidRing`).
 *
 * PUR (`bhpass`).
 */

export type Ring = readonly LatLng[]

export const MIN_RING_VERTICES = 3

/** Une forme qu'on peut enregistrer : trois sommets au moins, tous des nombres finis, trois distincts. */
export function isValidRing(ring: Ring): boolean {
  if (ring.length < MIN_RING_VERTICES) return false
  if (!ring.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))) return false
  const distinct = new Set(ring.map((p) => `${p.lat.toFixed(9)},${p.lng.toFixed(9)}`))
  return distinct.size >= MIN_RING_VERTICES
}

/** Déplacer le sommet `i` : lui seul change. */
export function moveVertex(ring: Ring, i: number, to: LatLng): LatLng[] {
  return ring.map((p, j) => (j === i ? { lat: to.lat, lng: to.lng } : p))
}

/**
 * Insérer un sommet sur l'arête qui va du sommet `edge` au suivant (le
 * dernier rejoint le premier) : il prend le rang `edge + 1`.
 */
export function insertVertex(ring: Ring, edge: number, at: LatLng): LatLng[] {
  const out = [...ring]
  out.splice(edge + 1, 0, { lat: at.lat, lng: at.lng })
  return out
}

/** Le milieu de l'arête `edge` : où se pose la demi-poignée. */
export function edgeMidpoint(ring: Ring, edge: number): LatLng {
  const a = ring[edge]
  const b = ring[(edge + 1) % ring.length]
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
}

export type RemoveResult = { ok: true; ring: LatLng[] } | { ok: false; reason: 'min-vertices' }

/** Retirer le sommet `i` — refusé s'il n'en resterait pas trois. */
export function removeVertex(ring: Ring, i: number): RemoveResult {
  if (ring.length <= MIN_RING_VERTICES) return { ok: false, reason: 'min-vertices' }
  return { ok: true, ring: ring.filter((_, j) => j !== i) }
}

/** Translater toute la forme. */
export function translateRing(ring: Ring, dLat: number, dLng: number): LatLng[] {
  return ring.map((p) => ({ lat: p.lat + dLat, lng: p.lng + dLng }))
}

// --- La session d'édition : l'anneau courant et la pile d'annulation ---------

export interface EditSession {
  zoneId: string
  /** L'anneau tel qu'il était à l'ouverture (ce que la base porte). */
  original: LatLng[]
  ring: LatLng[]
  /** Les anneaux précédents, le plus récent EN DERNIER. */
  past: LatLng[][]
}

/** Au-delà, le plus ancien geste tombe : cent gestes suffisent largement. */
export const UNDO_DEPTH = 100

export function openSession(zoneId: string, ring: Ring): EditSession {
  const copy = ring.map((p) => ({ lat: p.lat, lng: p.lng }))
  return { zoneId, original: copy, ring: copy, past: [] }
}

/** Un geste : le nouvel anneau devient courant, l'ancien va sur la pile. */
export function applyGesture(s: EditSession, ring: Ring): EditSession {
  const past = [...s.past, s.ring]
  return { ...s, ring: ring.map((p) => ({ lat: p.lat, lng: p.lng })), past: past.length > UNDO_DEPTH ? past.slice(past.length - UNDO_DEPTH) : past }
}

export function canUndo(s: EditSession): boolean {
  return s.past.length > 0
}

/** Annuler le dernier geste : l'état d'avant, exactement. */
export function undoGesture(s: EditSession): EditSession {
  if (s.past.length === 0) return s
  return { ...s, ring: s.past[s.past.length - 1], past: s.past.slice(0, -1) }
}

/** La forme a-t-elle changé depuis l'ouverture ? (sinon « סיום » n'écrit rien). */
export function isDirty(s: EditSession): boolean {
  if (s.ring.length !== s.original.length) return true
  return s.ring.some((p, i) => p.lat !== s.original[i].lat || p.lng !== s.original[i].lng)
}
