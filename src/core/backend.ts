import type { Tour } from './tours'
import type {
  AnchorPoint,
  Driver,
  Farm,
  FarmVisit,
  FarmZone,
  GeneralMeeting,
  Incident,
  Mission,
  Session,
  ThreatVector,
  ThreatZone,
  Volunteer,
} from './types'

/**
 * P2.6 — THE STORE IS AN INTERFACE, AND THIS FILE IS THE INTERFACE.
 *
 * Two implementations satisfy it: the DEMO one (`./demo`, the mock fixtures,
 * which is what the frozen /poc keeps and what every verification gate drives)
 * and the SUPABASE one (`src/data/store.ts`). `store.ts` holds exactly one of
 * them at a time and nothing above it — no accessor, no screen — can tell which.
 *
 * ★ THE CONSTRAINT THAT DECIDES THE WHOLE SHAPE, AND IT IS NOT OBVIOUS.
 *   Every screen reads through `access.ts` SYNCHRONOUSLY: `useCoreValue`
 *   re-runs a selector on each version bump and gets a value, never a promise.
 *   So a backend does not "answer queries" — it SEEDS a snapshot synchronously,
 *   may REPLACE that snapshot later (hydration), and is TOLD what changed after
 *   the fact. Turning the 52 accessors into promises would mean touching every
 *   screen, which is the one thing this unit is forbidden to do.
 */

/**
 * Everything the app holds in memory.
 *
 * `session` is deliberately part of it and deliberately NOT part of
 * `COLLECTIONS` below: it is who is looking, not something looked at. In real
 * mode it is derived from the Supabase JWT and the `app_users` row; persisting
 * it would mean writing the identity back over itself on every role change.
 */
export interface StoreData {
  farms: Farm[]
  generalMeetings: GeneralMeeting[]
  farmZones: FarmZone[]
  /** G18 — the coordinator-only threat layer. */
  threatZones: ThreatZone[]
  threatVectors: ThreatVector[]
  volunteers: Volunteer[]
  drivers: Driver[]
  anchorPoints: AnchorPoint[]
  missions: Mission[]
  incidents: Incident[]
  farmVisits: FarmVisit[]
  tours: Tour[]
  session: Session
}

/**
 * The twelve aggregate roots, in hydration order — a list a later reader can
 * loop over instead of remembering. The order matters exactly once, in the
 * Supabase writer: `missions` reference `anchorPoints`, which reference
 * `farms`, so writing them in this order never presents Postgres with a
 * foreign key that does not exist yet.
 */
export const COLLECTIONS = [
  'farms',
  'farmZones',
  'anchorPoints',
  'threatZones',
  'threatVectors',
  'volunteers',
  'drivers',
  'missions',
  'incidents',
  'farmVisits',
  'generalMeetings',
  'tours',
] as const

export type Collection = (typeof COLLECTIONS)[number]

/**
 * One aggregate that changed, as JSON.
 *
 * JSON rather than the live object on purpose, and it is worth stating because
 * it looks like a needless copy: this record is EXACTLY what P2.5b's outbox has
 * to survive a reload with, and an outbox entry holding a reference into a
 * store that has moved on since is an outbox that flushes the wrong thing.
 * `json: null` means the row is gone.
 */
export interface StoreChange {
  collection: Collection
  id: string
  json: string | null
}

export interface StoreBackend {
  /** For diagnostics and for the gates: 'demo' | 'supabase' | 'recording'. */
  readonly name: string
  /**
   * The snapshot the app starts from — SYNCHRONOUS, always. The Supabase
   * backend seeds EMPTY and fills it in through `replaceSnapshot` once the
   * network has answered, because the first frame cannot wait for Frankfurt.
   */
  seed(): StoreData
  /**
   * Whether changes should be derived at all.
   *
   * False for the demo backend, and that is not a micro-optimisation: with it
   * false the derivation below never runs, so demo mode — which is what /poc
   * and all eleven browser gates are — executes byte-for-byte the code it did
   * before P2.6.
   */
  readonly persists: boolean
  /** Called after each mutation with the aggregates it actually changed. */
  onChange?(changes: StoreChange[]): void
}

// --- Change derivation -----------------------------------------------------

/** `collection → id → the row's JSON`, the shape a diff can be taken over. */
export type StoreIndex = Map<Collection, Map<string, string>>

/**
 * ★ THE CHANGES ARE DERIVED FROM THE SNAPSHOT, NEVER DECLARED BY THE MUTATION,
 *   AND THAT IS THE LOAD-BEARING DECISION OF P2.6.
 *
 * The obvious design is to have each of the 53 mutations say what it touched.
 * It is also the one that breaks, for two reasons this store demonstrates in
 * its own source:
 *
 *   · MUTATIONS FAN OUT. `createFarmZone` writes a zone AND the farm's dunam
 *     totals (G15's one writer). `createVolunteer` writes a volunteer AND may
 *     materialise a driver (G5.2's dual hat). `createFarmVisit` writes a visit
 *     AND the farm's `nextVisitAt` cache (decision 35). `updateDriver` writes
 *     a driver AND mirrors four fields back onto a volunteer. A hand-written
 *     declaration gets the fan-out wrong the first time somebody adds one.
 *
 *   · HALF THE MUTATIONS WRITE IN PLACE. `setIncidentResolved` sets a field on
 *     an object the array still holds by the same reference; so does every
 *     `withMission` caller. An identity diff (`prev[i] !== next[i]`) would
 *     report NOTHING for them — the worst possible failure, because it is
 *     silent and it loses exactly the mutations a night in the field produces.
 *
 * So the comparison is STRUCTURAL: one `JSON.stringify` per aggregate, about a
 * thousand short rows, a few milliseconds, once per user action. `bun run
 * persist` exists to keep it that way — it drives every exported mutation and
 * fails if one of them produces no change, which is what would happen the day
 * somebody "optimises" this into a reference comparison.
 */
export function indexOf(data: StoreData): StoreIndex {
  const index: StoreIndex = new Map()
  for (const collection of COLLECTIONS) {
    const rows = new Map<string, string>()
    for (const row of data[collection] as Array<{ id: string }>) {
      rows.set(row.id, JSON.stringify(row))
    }
    index.set(collection, rows)
  }
  return index
}

/** Everything that appeared, changed or vanished between two indexes. */
export function changesBetween(prev: StoreIndex, next: StoreIndex): StoreChange[] {
  const changes: StoreChange[] = []
  for (const collection of COLLECTIONS) {
    const before = prev.get(collection) ?? new Map<string, string>()
    const after = next.get(collection) ?? new Map<string, string>()
    for (const [id, json] of after) {
      if (before.get(id) !== json) changes.push({ collection, id, json })
    }
    for (const id of before.keys()) {
      if (!after.has(id)) changes.push({ collection, id, json: null })
    }
  }
  return changes
}
