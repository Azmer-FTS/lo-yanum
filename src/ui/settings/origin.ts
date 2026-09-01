import { HOME_BASE, LOCALITY_POSITIONS, parsePositionInput } from '@core/index'
import type { LatLng } from '@core/index'

/**
 * PO RETURN, 2026-09-02 — "נקודת מוצא" IN הגדרות.
 *
 * ★ WHAT IT REPLACES, AND WHY THE PRODUCT OWNER IS RIGHT TO WANT IT. The route
 *   planner has always started every day from `HOME_BASE`, which is a CONSTANT
 *   in `core/geo.ts` reading 31.7683 / 35.2137 — Jerusalem. That was fine
 *   while the programme was one person's corridor and is wrong now: the
 *   distance of every stop, the arrival time of every visit and the ★ marker
 *   on the planner's map are all measured from a point nobody chose. A
 *   coordinator who leaves from Beer Sheva is shown a day that begins 100 km
 *   from his car.
 *
 * ★ IT ACCEPTS THE THREE THINGS A COORDINATOR ACTUALLY HAS, in this order:
 *
 *     1. a locality NAME that is in the gazetteer          ("באר שבע")
 *     2. a coordinate pair, in either order                ("31.2518, 34.7913")
 *     3. anything a maps/Waze link carries a pair inside   (paste and go)
 *
 *   2 and 3 are the same function — `parsePositionInput`, which already backs
 *   the spreadsheet import and already refuses a pair outside Israel's box, so
 *   a mis-parsed zoom level cannot become somebody's depot.
 *
 * ⚠️ LOCAL, LIKE THE REPORT RECIPIENT AND FOR THE SAME TWO REASONS: it is
 *    needed with no network, and it is one person's preference about his own
 *    working day rather than programme data. The same P3.3bis note applies —
 *    if a server ever has to plan a route, this becomes a row and this module
 *    becomes its cache.
 */
const KEY = 'lo-yanum:origin'

export interface MapOrigin {
  /** What the coordinator typed, kept verbatim so the field can show it back. */
  label: string
  position: LatLng
}

/**
 * Resolve typed text to a point, or null.
 *
 * ★ THE GAZETTEER IS TRIED FIRST, and that matters for a reason that is not
 *   obvious: a name is stable and a pair of decimals is not. If the gazetteer
 *   ever corrects a town's coordinates, an origin stored as "באר שבע" follows
 *   it and an origin stored as two numbers does not.
 */
export function resolveOrigin(raw: string): MapOrigin | null {
  const label = raw.trim()
  if (label === '') return null

  const known = LOCALITY_POSITIONS[label]
  if (known) return { label, position: known }

  const parsed = parsePositionInput(label)
  if (parsed) return { label, position: parsed }

  return null
}

/** Every locality the field can complete, for the `<datalist>`. */
export function originSuggestions(): string[] {
  return Object.keys(LOCALITY_POSITIONS)
}

export function readOrigin(): MapOrigin | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<MapOrigin> & Partial<LatLng>
    const lat = parsed.position?.lat
    const lng = parsed.position?.lng
    if (typeof lat !== 'number' || typeof lng !== 'number') return null
    return { label: String(parsed.label ?? ''), position: { lat, lng } }
  } catch {
    // Private browsing, or a value written by an older build. The constant is
    // the right answer in both cases.
    return null
  }
}

export function writeOrigin(origin: MapOrigin | null): void {
  try {
    if (origin === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(origin))
  } catch {
    // A preference, never a requirement.
  }
}

/**
 * ★ THE ONE FUNCTION EVERY CALLER SHOULD USE. `HOME_BASE` stays exported from
 *   `@core` because it is also the map's default centre and the import
 *   wizard's fallback, which are different questions; but "where does the
 *   working day start" is this, and it has a default rather than a
 *   requirement.
 */
export function originPosition(): LatLng {
  return readOrigin()?.position ?? HOME_BASE
}

/** The name to print on the planner's ★ marker. Empty when it is the default. */
export function originLabel(): string {
  return readOrigin()?.label ?? ''
}
