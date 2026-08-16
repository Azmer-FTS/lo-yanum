import { HOME_BASE, haversineKm, wazeUrl } from './geo'
import type { Farm, LatLng } from './types'

export interface RouteStop {
  farm: Farm
  /** 1-based position in the visit order. */
  order: number
  /** Kilometres travelled from the previous stop (or from the origin). */
  legKm: number
  /** Cumulative kilometres from the origin up to and including this stop. */
  cumulativeKm: number
}

export interface PlannedRoute {
  origin: LatLng
  stops: RouteStop[]
  /** Sum of all legs, origin → last stop. Does not include the return leg. */
  totalKm: number
  /** Kilometres for the final leg back to the origin. */
  returnKm: number
  /** Total including the return leg. */
  roundTripKm: number
}

/**
 * Nearest-neighbour ordering from a fixed origin (Jerusalem by default).
 *
 * Greedy: repeatedly hop to the closest farm not yet visited. Not optimal —
 * good enough for a 3–8 stop field day, and deterministic, which matters more
 * than optimality when the coordinator is comparing two plans.
 */
export function planRoute(farms: Farm[], origin: LatLng = HOME_BASE): PlannedRoute {
  const remaining = [...farms]
  const stops: RouteStop[] = []

  let current = origin
  let cumulative = 0

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestKm = haversineKm(current, remaining[0].position)

    for (let i = 1; i < remaining.length; i++) {
      const km = haversineKm(current, remaining[i].position)
      if (km < bestKm) {
        bestKm = km
        bestIndex = i
      }
    }

    const [farm] = remaining.splice(bestIndex, 1)
    cumulative += bestKm
    stops.push({
      farm,
      order: stops.length + 1,
      legKm: bestKm,
      cumulativeKm: cumulative,
    })
    current = farm.position
  }

  const returnKm = stops.length > 0 ? haversineKm(current, origin) : 0

  return {
    origin,
    stops,
    totalKm: cumulative,
    returnKm,
    roundTripKm: cumulative + returnKm,
  }
}

const coord = (p: LatLng): string => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`

/**
 * Google Maps multi-stop directions URL (Directions API "universal" form).
 * Origin and destination are the home base; every farm is a waypoint, in order.
 */
export function googleMapsRouteUrl(
  route: PlannedRoute,
  returnToOrigin = true,
): string | null {
  if (route.stops.length === 0) return null

  const points = route.stops.map((s) => s.farm.position)
  const destination = returnToOrigin ? route.origin : points[points.length - 1]
  const waypoints = returnToOrigin ? points : points.slice(0, -1)

  const params = new URLSearchParams({
    api: '1',
    origin: coord(route.origin),
    destination: coord(destination),
    travelmode: 'driving',
  })

  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.map(coord).join('|'))
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export interface WazeStep {
  order: number
  farmName: string
  url: string
}

/**
 * Waze has no multi-stop URL scheme — a single link can only carry one
 * destination. So instead of silently dropping stops, produce one link per
 * farm, in visit order, and let the coordinator tap them as they go.
 *
 * Google Maps keeps its single multi-stop URL (see googleMapsRouteUrl), which
 * is why the planner offers both: coverage and routing quality differ by area,
 * and neither app wins everywhere in the Negev.
 */
export function wazeStepLinks(route: PlannedRoute): WazeStep[] {
  return route.stops.map((stop) => ({
    order: stop.order,
    farmName: stop.farm.name,
    url: wazeUrl(stop.farm.position),
  }))
}

/**
 * The polyline drawn on the planner map: origin → each stop in order → back.
 * Straight segments, not road geometry — this POC has no routing service, and
 * the shape is there to make the ORDER legible, not to navigate by.
 */
export function routePolyline(route: PlannedRoute): LatLng[] {
  if (route.stops.length === 0) return []
  return [
    route.origin,
    ...route.stops.map((s) => s.farm.position),
    route.origin,
  ]
}

/** Rough drive-time estimate: Negev road factor 1.35 over a 72 km/h average. */
export function estimateDriveMinutes(km: number): number {
  return Math.round(((km * 1.35) / 72) * 60)
}
