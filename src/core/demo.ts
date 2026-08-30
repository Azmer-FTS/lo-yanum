import type { StoreBackend, StoreData } from './backend'
import { ringAreaDunams } from './geo'
import { ANCHOR_POINTS } from './mock/anchors'
import { FARMS } from './mock/farms'
import { INCIDENTS } from './mock/incidents'
import { MISSIONS } from './mock/missions'
import { DRIVERS, VOLUNTEERS } from './mock/people'
import { THREAT_VECTORS, THREAT_ZONES } from './mock/threats'
import { TOURS } from './mock/tours'
import { FARM_VISITS, GENERAL_MEETINGS } from './mock/visits'
import { FARM_ZONES } from './mock/zones'

/**
 * P2.6 — THE DEMO IMPLEMENTATION OF THE STORE INTERFACE.
 *
 * This is the behaviour the app had from Lot 0 to P2.5a, moved behind
 * `StoreBackend` and otherwise untouched. It is what the FROZEN /poc runs on,
 * what `bun run dev` gives, and what all eleven browser gates drive — which is
 * why P2.6a's whole claim is "nothing changed", provable by those gates before
 * a single line of Supabase reading was written.
 *
 * `persists: false` is the point of it: the demo store has nowhere to write to,
 * so no change is ever derived and the mutation path is the one it always was.
 */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/**
 * G15 — the fixtures' dunam figures were hand-estimated before the polygons
 * existed; at seed the drawn ground wins (unless a farm is flagged manual),
 * so the map, the form and the dashboard KPIs agree from the first render.
 */
function seedZoneDunams(seed: StoreData): StoreData {
  const sums = new Map<string, { boundary: number; grazing: number }>()
  for (const z of seed.farmZones) {
    const entry = sums.get(z.farmId) ?? { boundary: 0, grazing: 0 }
    if (z.kind === 'farm_boundary') entry.boundary += ringAreaDunams(z.ring)
    else entry.grazing += ringAreaDunams(z.ring)
    sums.set(z.farmId, entry)
  }
  seed.farms = seed.farms.map((f) => {
    const s = sums.get(f.id)
    if (!s) return f
    return {
      ...f,
      farmDunams:
        !f.farmDunamsManual && s.boundary > 0 ? Math.round(s.boundary) : f.farmDunams,
      grazingDunams:
        !f.grazingDunamsManual && s.grazing > 0 ? Math.round(s.grazing) : f.grazingDunams,
    }
  })
  return seed
}

export const DEMO_BACKEND: StoreBackend = {
  name: 'demo',
  persists: false,
  seed: (): StoreData =>
    seedZoneDunams({
      farms: clone(FARMS),
      generalMeetings: clone(GENERAL_MEETINGS),
      farmZones: clone(FARM_ZONES),
      threatZones: clone(THREAT_ZONES),
      threatVectors: clone(THREAT_VECTORS),
      volunteers: clone(VOLUNTEERS),
      drivers: clone(DRIVERS),
      anchorPoints: clone(ANCHOR_POINTS),
      missions: clone(MISSIONS),
      incidents: clone(INCIDENTS),
      farmVisits: clone(FARM_VISITS),
      tours: clone(TOURS),
      session: { role: 'coordinator', entityId: null },
    }),
}

/**
 * An EMPTY snapshot of the same shape.
 *
 * Exported because the Supabase backend seeds from it: the real app starts with
 * nothing on screen and fills in when Frankfurt answers, and "nothing" has to
 * be a real `StoreData` in the first frame rather than a null every accessor
 * would have to test for.
 */
export const emptyData = (): StoreData => ({
  farms: [],
  generalMeetings: [],
  farmZones: [],
  threatZones: [],
  threatVectors: [],
  volunteers: [],
  drivers: [],
  anchorPoints: [],
  missions: [],
  incidents: [],
  farmVisits: [],
  tours: [],
  session: { role: 'coordinator', entityId: null },
})

/**
 * The empty snapshot as a BACKEND, installed synchronously by a real build
 * before the data layer has finished loading.
 *
 * It exists for one frame's worth of reason and it is a load-bearing frame:
 * `installSupabaseStore` lives in `src/data`, which pulls in the row mapper and
 * — through it — the Supabase client chunk, so it can only be imported
 * asynchronously if demo builds are not to carry it. Between the module's
 * request and its arrival the store would otherwise still be holding the DEMO
 * fixtures, and the real app would flash twelve farms it does not have. So the
 * real entry point installs THIS first, synchronously, and the Supabase backend
 * replaces it a tick later. Nothing can be mutated in that tick: there is no
 * session yet, and without one the app renders a login form.
 */
export const EMPTY_BACKEND: StoreBackend = {
  name: 'empty',
  persists: false,
  seed: emptyData,
}
