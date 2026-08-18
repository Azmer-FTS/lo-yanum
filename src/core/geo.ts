import type { LatLng } from './types'

/** Jerusalem — the coordinator's home base, origin of every planned route. */
export const HOME_BASE: LatLng = { lat: 31.7683, lng: 35.2137 }

/**
 * Where a location map looks before anything is placed on it — the programme's
 * own ground (the northern Negev around Beer Sheva), not the coordinator's
 * desk. A new farm's pin map opening on Jerusalem would start every farm
 * 100 km from where it is.
 */
export const NEGEV_CENTER: LatLng = { lat: 31.27, lng: 34.79 }

/**
 * Gazetteer of the localities volunteers and drivers live in.
 *
 * Real coordinates of real towns, not fixture data — which is why this sits in
 * geo.ts rather than under mock/. `src/core/dispatch.ts` needs it to turn a
 * volunteer's `locality` string into a distance, and dispatch must not depend
 * on the mock layer.
 *
 * A locality that is absent here simply scores no distance component (see
 * `positionOfLocality`); it never throws, because a roster imported from a
 * spreadsheet will always contain a town nobody anticipated.
 */
export const LOCALITY_POSITIONS: Readonly<Record<string, LatLng>> = {
  ירושלים: { lat: 31.7683, lng: 35.2137 },
  'אלון שבות': { lat: 31.6519, lng: 35.1281 },
  אפרת: { lat: 31.6547, lng: 35.1519 },
  'מעלה אדומים': { lat: 31.7772, lng: 35.2983 },
  'בית שמש': { lat: 31.7497, lng: 34.9886 },
  'מודיעין עילית': { lat: 31.9319, lng: 35.0428 },
  שדרות: { lat: 31.5241, lng: 34.5964 },
  נתיבות: { lat: 31.4222, lng: 34.5889 },
  אופקים: { lat: 31.3144, lng: 34.6206 },
  'באר שבע': { lat: 31.2518, lng: 34.7913 },
  להבים: { lat: 31.3714, lng: 34.8172 },
  עומר: { lat: 31.2686, lng: 34.8489 },
  מיתר: { lat: 31.3231, lng: 34.9339 },
  אשקלון: { lat: 31.6688, lng: 34.5743 },
  אשדוד: { lat: 31.8014, lng: 34.6435 },
  ניצן: { lat: 31.7228, lng: 34.6089 },
  'קרית גת': { lat: 31.6100, lng: 34.7642 },
  ירוחם: { lat: 30.9878, lng: 34.9297 },
  דימונה: { lat: 31.0686, lng: 35.0333 },
  רחובות: { lat: 31.8928, lng: 34.8113 },
}

/** Coordinates for a locality name, or null when it is not in the gazetteer. */
export function positionOfLocality(locality: string): LatLng | null {
  return LOCALITY_POSITIONS[locality.trim()] ?? null
}

const EARTH_RADIUS_KM = 6371

const toRad = (deg: number): number => (deg * Math.PI) / 180

/** Great-circle distance in kilometres between two points. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * G15 — geodesic area of a vertex ring, in DUNAMS (1 dunam = 1000 m²).
 *
 * Chamberlain–Duquette spherical excess (the formula turf.js uses): each edge
 * contributes `Δλ · (2 + sin φ₁ + sin φ₂)`, and half the absolute total times
 * R² is the area — so winding direction does not matter, and neither does the
 * ring being explicitly closed (the last vertex joins the first, same
 * convention as FarmZone.ring). Under 3 vertices there is no surface.
 */
export function ringAreaDunams(ring: LatLng[]): number {
  if (ring.length < 3) return 0
  const R_M = EARTH_RADIUS_KM * 1000
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += toRad(b.lng - a.lng) * (2 + Math.sin(toRad(a.lat)) + Math.sin(toRad(b.lat)))
  }
  const areaM2 = Math.abs((sum * R_M * R_M) / 2)
  return areaM2 / 1000
}

/**
 * G15 — the ring's vertex average: where the move handle and the live area
 * label sit. Not a true centroid, but stable, cheap, and inside every convex
 * ring — which hand-drawn field polygons overwhelmingly are.
 */
export function ringCenter(ring: LatLng[]): LatLng {
  const n = Math.max(1, ring.length)
  return {
    lat: ring.reduce((s, p) => s + p.lat, 0) / n,
    lng: ring.reduce((s, p) => s + p.lng, 0) / n,
  }
}

/** Decimal degrees, 5 dp (~1 m) — the form used in SMS to kosher phones. */
export function formatCoords(p: LatLng): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
}

export function wazeUrl(p: LatLng): string {
  return `https://waze.com/ul?ll=${p.lat.toFixed(6)}%2C${p.lng.toFixed(6)}&navigate=yes`
}

export function googleMapsPointUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)}%2C${p.lng.toFixed(6)}`
}

/** Bounding box [west, south, east, north] with a relative padding. */
export function boundsOf(
  points: LatLng[],
  padRatio = 0.15,
): [number, number, number, number] | null {
  if (points.length === 0) return null

  let west = points[0].lng
  let east = points[0].lng
  let south = points[0].lat
  let north = points[0].lat

  for (const p of points) {
    if (p.lng < west) west = p.lng
    if (p.lng > east) east = p.lng
    if (p.lat < south) south = p.lat
    if (p.lat > north) north = p.lat
  }

  const padLng = Math.max((east - west) * padRatio, 0.02)
  const padLat = Math.max((north - south) * padRatio, 0.02)

  return [west - padLng, south - padLat, east + padLng, north + padLat]
}
