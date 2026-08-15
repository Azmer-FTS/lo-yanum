import type { LatLng } from './types'

/** Jerusalem — the coordinator's home base, origin of every planned route. */
export const HOME_BASE: LatLng = { lat: 31.7683, lng: 35.2137 }

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
