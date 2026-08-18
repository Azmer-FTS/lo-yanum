import { atTime, localDayKey, now } from '../clock'
import { HOME_BASE } from '../geo'
import { planRoute } from '../routing'
import type { Tour } from '../tours'
import { FARMS } from './farms'

/**
 * G9 — one saved tour for TODAY, so the "היום שלי" block demos populated on
 * first load. Relative to `now()` like every other fixture: whenever the POC
 * is opened, today has a field day.
 *
 * The three farms are the ones whose next visit is soonest — the tour a real
 * coordinator would plausibly have saved — and their order is the planner's
 * own nearest-neighbour ordering, so the fixture and a freshly saved tour are
 * indistinguishable.
 */
const soonest = FARMS.filter((f) => f.nextVisitAt !== null)
  .sort(
    (a, b) =>
      new Date(a.nextVisitAt as string).getTime() -
      new Date(b.nextVisitAt as string).getTime(),
  )
  .slice(0, 3)

export const TOURS: Tour[] = [
  {
    id: 'tour-today',
    dayKey: localDayKey(now()),
    departAt: atTime(0, 8, 30),
    farmIds: planRoute(soonest, HOME_BASE).stops.map((s) => s.farm.id),
  },
]
