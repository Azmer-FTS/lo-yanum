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

/**
 * P0.2 — PEOPLE ARE COUNTED BY LOCALITY, NEVER PLACED INDIVIDUALLY.
 *
 * The coordinator's real question about the roster is geographic — "who can I
 * pull from tonight, and from where" — and the volunteers/drivers tables
 * answer it only by sorting a text column. A map answers it at a glance.
 *
 * What it deliberately does NOT do is put a pin on a volunteer. The programme
 * holds a home locality, not a home address, and inventing a dot on a street
 * would be both wrong and a privacy claim nobody made. A bubble on the town,
 * sized by how many people it holds, is exactly as precise as the data.
 *
 * A locality outside `LOCALITY_POSITIONS` cannot be drawn, and it is REPORTED
 * rather than dropped: `unplaced` names the towns and `unplacedCount` the
 * people, so the map never silently claims to show everybody. Same contract as
 * `distanceKm: null` in the dispatch scoring.
 *
 * Sorted by descending count so the biggest bubble is drawn LAST and therefore
 * on top when two towns overlap at low zoom.
 */
export interface LocalityCluster {
  locality: string
  count: number
  position: LatLng
}

export interface LocalityClusters {
  /** Drawable towns, ascending by count (the caller draws in order). */
  clusters: LocalityCluster[]
  /** Towns absent from the gazetteer, sorted, so the UI can name them. */
  unplaced: string[]
  /** How many PEOPLE live in those towns. */
  unplacedCount: number
  /** The largest count, so a caller can scale bubbles against it. */
  max: number
}

export function clusterByLocality(
  localities: readonly string[],
): LocalityClusters {
  const counts = new Map<string, number>()
  for (const raw of localities) {
    const name = raw.trim()
    if (name === '') continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  const clusters: LocalityCluster[] = []
  const unplaced: string[] = []
  let unplacedCount = 0

  for (const [locality, count] of counts) {
    const position = positionOfLocality(locality)
    if (position === null) {
      unplaced.push(locality)
      unplacedCount += count
      continue
    }
    clusters.push({ locality, count, position })
  }

  clusters.sort((a, b) =>
    a.count === b.count ? a.locality.localeCompare(b.locality, 'he') : a.count - b.count,
  )
  unplaced.sort((a, b) => a.localeCompare(b, 'he'))

  return {
    clusters,
    unplaced,
    unplacedCount,
    max: clusters.reduce((m, c) => Math.max(m, c.count), 0),
  }
}

/**
 * The bubble's diameter in pixels, area-proportional to the count.
 *
 * SQRT, not linear: the eye reads a disc by its AREA, so a linear radius makes
 * a town of 40 look four times a town of 10 instead of twice. Bounded at both
 * ends — under `MIN` the count stops being readable inside the disc, over
 * `MAX` one town eats the Negev.
 */
export function bubbleDiameter(count: number, max: number): number {
  const MIN = 30
  const MAX = 68
  if (max <= 0 || count <= 0) return MIN
  const ratio = Math.sqrt(count) / Math.sqrt(max)
  return Math.round(MIN + (MAX - MIN) * ratio)
}

/**
 * G10 — A SHARED PIN BECOMES A COORDINATE.
 *
 * Nobody types latitude and longitude. A coordinator standing at a farm gate
 * shares the location from Waze or Google Maps — into WhatsApp, into a
 * spreadsheet cell — and what lands there is a URL. The import has to swallow
 * whatever that produces, because the alternative is asking a field worker to
 * transcribe six decimal places from a phone screen, which is how a farm ends
 * up 40 km into Jordan.
 *
 * Recognised, in order of how often they actually turn up:
 *
 *   waze.com/ul?ll=30.98,34.67            · the share link Waze produces
 *   waze.com/ul?ll=30.98%2C34.67          · the same, URL-encoded
 *   waze.com/live-map/directions?to=ll.30.98%2C34.67
 *   google.com/maps/@30.98,34.67,15z      · the URL bar
 *   google.com/maps/search/?api=1&query=30.98,34.67   · our own share format
 *   google.com/maps/place/.../@30.98,34.67,17z
 *   maps.app.goo.gl/...                   · NOT resolvable — see below
 *   "30.98, 34.67"                        · a bare pair, pasted from anywhere
 *   "30.98 34.67" / "30.98;34.67"
 *
 * A SHORTENED link (`maps.app.goo.gl`, `waze.com/ul/h…`) carries no
 * coordinates at all — the position lives behind an HTTP redirect. Resolving
 * it would need a network round trip per row from a browser that the target
 * domain does not CORS-allow, so it returns null and the row is flagged
 * "מיקום חסר" like any other. Saying "we could not read this one" is the
 * honest answer; guessing is not.
 *
 * Israel's bounding box is checked, not assumed: a link that parses to
 * something outside it is a mis-parse (a zoom level read as a longitude, a
 * pair the wrong way round), and a farm silently placed in the Mediterranean
 * is worse than a farm with no pin.
 */
const ISRAEL_BOUNDS = { west: 34.2, east: 35.95, south: 29.4, north: 33.4 }

function inIsrael(lat: number, lng: number): boolean {
  return (
    lat >= ISRAEL_BOUNDS.south &&
    lat <= ISRAEL_BOUNDS.north &&
    lng >= ISRAEL_BOUNDS.west &&
    lng <= ISRAEL_BOUNDS.east
  )
}

/**
 * A latitude/longitude pair somewhere in `raw`, or null.
 *
 * The pair may be separated by a comma, a semicolon, whitespace, or the
 * `%2C` a URL-encoded share link carries. Both orders are tried: a bare
 * "34.67, 30.98" is unambiguous once the Israel box is applied, because only
 * one of the two readings can be inside it.
 */
export function parsePositionInput(raw: string): LatLng | null {
  const text = raw.trim()
  if (text === '') return null

  // `%2C` is a comma; `ll.` is Waze's live-map separator. Normalising them
  // away first means one number-pair regex covers every shape above.
  const normalised = text
    .replace(/%2c/gi, ',')
    .replace(/\bll[.=]/gi, ' ')
    .replace(/[?&#]/g, ' ')

  // A Google Maps URL carries the zoom as a third number ("…,15z"), and a
  // place URL carries ids full of digits. Scanning for ADJACENT decimal pairs
  // and validating them against the box is what keeps those out.
  const matches = [...normalised.matchAll(/(-?\d{1,3}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/g)]

  for (const m of matches) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (inIsrael(a, b)) return { lat: a, lng: b }
    if (inIsrael(b, a)) return { lat: b, lng: a }
  }

  return null
}

/**
 * True when the text LOOKS like a location the coordinator meant to give but
 * that cannot be resolved — a shortened share link, in practice. The import
 * uses it to tell "he left the cell empty" apart from "he gave us something
 * we could not read", which are different conversations to have with him.
 */
export function isUnresolvableLocationLink(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  if (v === '') return false
  if (parsePositionInput(v) !== null) return false
  return /goo\.gl|maps\.app|waze\.com|google\.[a-z.]+\/maps|maps\.google/.test(v)
}

/**
 * G18 — initial bearing from `a` to `b`, in degrees clockwise from north.
 *
 * Used to rotate a threat vector's arrowhead. It is the FORWARD azimuth of a
 * great circle, not the angle of the straight line on screen: over the ~10 km
 * a vector spans the two agree to well under a degree, but computing it
 * properly means the arrow stays right if the map is ever rotated or if
 * somebody draws a vector across the whole Negev.
 */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat)
  const φ2 = toRad(b.lat)
  const Δλ = toRad(b.lng - a.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}
