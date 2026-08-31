import { _raw } from './store'
import type { MissionStatus } from './types'

/**
 * PO POINT 8 (2026-08-31) — DELETING A RECORD, AND THE ONE RULE THAT DECIDES
 * WHETHER IT IS ALLOWED.
 *
 * The product owner asked for a delete button because there was no way to
 * correct a typo: a farm created twice, a volunteer whose name went in wrong,
 * a guard post dropped in the wrong field. Every one of those is a MISTAKE, and
 * a mistake has no history — nobody has stood a night at it.
 *
 * ★ SO THE RULE IS NOT "WHO MAY DELETE", IT IS "HAS THIS THING HAPPENED YET".
 *   A record with OPERATIONAL HISTORY — guards done or planned, incidents, a
 *   signed agreement — is not a typo, it is a fact about a night somebody
 *   worked, and deleting it silently rewrites what the programme did. Those are
 *   REFUSED, with the reason and with the alternative that actually solves the
 *   coordinator's problem: archive the volunteer, change the entity's status,
 *   or cancel the guards first and then delete.
 *
 * ★ AND A REFUSAL HAS TO SAY *WHAT* IS IN THE WAY, not "cannot delete". The
 *   coordinator is standing in a field. "3 שמירות מתוכננות" tells him what to
 *   cancel; "לא ניתן למחוק" tells him to phone somebody.
 *
 * ★ THE PLAN IS COMPUTED, NEVER GUESSED AT THE CALL SITE. One function, one
 *   answer, used by the confirmation dialog to LIST the dependencies, by the
 *   button to decide whether it is even offered, and by `bun run deletion` to
 *   check the whole matrix without a browser. A screen that decided for itself
 *   would drift from the store that actually performs the delete.
 *
 * ★ A MISSION IS IN `DeletableKind` ONLY SO THAT IT CAN BE REFUSED IN THE SAME
 *   VOICE AS EVERYTHING ELSE. A guard is CANCELLED — `בוטלה` already exists,
 *   keeps the record and keeps the reason — never deleted. The single
 *   exception is a guard nobody was ever asked to attend, which is a wizard
 *   somebody walked away from rather than a night; `isUnsolicitedDraft` below
 *   is the whole of that judgement.
 */

export type DeletableKind =
  | 'entity'
  | 'volunteer'
  | 'driver'
  | 'anchorPoint'
  | 'farmZone'
  | 'threatZone'
  | 'threatVector'
  | 'contact'
  | 'farmVisit'
  | 'generalMeeting'
  | 'tour'
  | 'mission'

/**
 * One line of "this goes too", or one line of "this is in the way".
 *
 * `key` is an i18n key under `deletion.dep.*`; the UI renders
 * `t(key, { count })`. Kept as a key rather than a string because /src/core
 * never touches i18n and never will — it is the half of this app that is
 * verified without a browser.
 */
export interface DeletionItem {
  key: string
  count: number
}

export interface DeletionPlan {
  kind: DeletableKind
  id: string
  /** Whether the record exists at all. A stale row id is not a refusal. */
  found: boolean
  allowed: boolean
  /** Human name of the thing, for the confirmation and for the refusal. */
  name: string
  /** What disappears WITH it. Empty means "this row and nothing else". */
  cascades: DeletionItem[]
  /** What stands in the way. Non-empty exactly when `allowed` is false. */
  blockers: DeletionItem[]
  /** i18n key of the alternative offered instead of the refused deletion. */
  alternativeKey: string | null
  /**
   * PO POINT 8d — retype the name to confirm.
   *
   * ★ ONLY FOR AN ENTITY THAT HAS DRAWN ZONES, and the reason is that the
   *   drawing is the expensive thing in this app. A farm's boundary and its
   *   grazing ground are twenty minutes of a coordinator's finger on a map at
   *   the side of a road; everything else on the record was typed in ninety
   *   seconds and can be typed again. A confirmation that asks for the name
   *   back is friction, and friction is only worth spending where the loss is
   *   not recoverable by re-typing.
   */
  requireName: boolean
}

const empty = (kind: DeletableKind, id: string): DeletionPlan => ({
  kind,
  id,
  found: false,
  allowed: false,
  name: '',
  cascades: [],
  blockers: [],
  alternativeKey: null,
  requireName: false,
})

/**
 * Guard statuses that count as HISTORY.
 *
 * ★ A CANCELLED GUARD DOES NOT BLOCK, and that is deliberate rather than an
 *   oversight. `בוטלה` is already the record of a night that did not happen;
 *   holding a farm hostage to a guard the coordinator himself called off would
 *   make "cancel then delete" — the alternative this module offers — a road to
 *   nowhere.
 */
const LIVE_MISSION: ReadonlySet<MissionStatus> = new Set<MissionStatus>([
  'recruiting',
  'planned',
  'in_progress',
  'completed',
  'return_not_confirmed',
])

const isLive = (status: MissionStatus): boolean => LIVE_MISSION.has(status)

/**
 * A guard nobody was ever asked to attend.
 *
 * ★ THERE IS NO `draft` STATUS IN THIS MODEL, and that is worth stating rather
 *   than working around: G4's `recruiting` IS the draft — "the guard exists but
 *   its team does not, yet". So "never solicited" is a fact about the OUTREACH
 *   and about the roster, not about a column: a `recruiting` guard with nobody
 *   assigned, no driver and no message sent is a wizard somebody abandoned. One
 *   message out and it is a promise, whatever the status says.
 */
function isUnsolicitedDraft(missionId: string): boolean {
  const m = _raw().missions.find((x) => x.id === missionId)
  if (!m) return false
  if (m.status !== 'recruiting') return false
  const asked =
    m.assignments.length > 0 ||
    m.drivers.length > 0 ||
    (m.outreach?.length ?? 0) > 0
  return !asked
}

const item = (key: string, count: number): DeletionItem[] =>
  count > 0 ? [{ key, count }] : []

/**
 * THE PLAN FOR ONE RECORD.
 *
 * Everything is counted off `_raw()` rather than off the role-filtered
 * accessors, on purpose: a coordinator who cannot SEE a mission still must not
 * be allowed to delete the farm under it. Deletion is a coordinator-only
 * action (RLS enforces that half), so the question here is about the data, not
 * about who is looking.
 */
export function deletionPlan(kind: DeletableKind, id: string): DeletionPlan {
  const d = _raw()

  switch (kind) {
    case 'entity': {
      const farm = d.farms.find((f) => f.id === id)
      if (!farm) return empty(kind, id)

      const missions = d.missions.filter((m) => m.farmId === id && isLive(m.status))
      const incidents = d.incidents.filter((i) => i.farmId === id)
      const signed = farm.agreements.length

      const zones = d.farmZones.filter((z) => z.farmId === id).length
      const anchors = d.anchorPoints.filter((a) => a.farmId === id).length
      const visits = d.farmVisits.filter((v) => v.farmId === id).length
      const threats = d.threatZones.filter((z) => z.farmId === id).length
      const vectors = d.threatVectors.filter((v) => v.farmId === id).length
      const tours = d.tours.filter((t) => t.farmIds.includes(id)).length

      const blockers = [
        ...item('deletion.dep.missions', missions.length),
        ...item('deletion.dep.incidents', incidents.length),
        ...item('deletion.dep.agreements', signed),
      ]

      return {
        kind,
        id,
        found: true,
        allowed: blockers.length === 0,
        name: farm.name,
        cascades: [
          ...item('deletion.dep.zones', zones),
          ...item('deletion.dep.anchors', anchors),
          ...item('deletion.dep.contacts', farm.contacts.length),
          ...item('deletion.dep.visits', visits),
          ...item('deletion.dep.threatZones', threats),
          ...item('deletion.dep.threatVectors', vectors),
          ...item('deletion.dep.tourStops', tours),
        ],
        blockers,
        alternativeKey: blockers.length === 0 ? null : 'deletion.alt.entityStatus',
        // PO POINT 8d — the drawing is the expensive thing.
        requireName: zones > 0,
      }
    }

    case 'volunteer': {
      const v = d.volunteers.find((x) => x.id === id)
      if (!v) return empty(kind, id)

      const missions = d.missions.filter(
        (m) => isLive(m.status) && m.assignments.some((a) => a.volunteerId === id),
      )
      const incidents = d.incidents.filter((i) => i.reporterId === id)
      const blockers = [
        ...item('deletion.dep.guards', missions.length),
        ...item('deletion.dep.incidents', incidents.length),
      ]

      // G5.2 — the dual hat is one human, and deleting him deletes both rows.
      const driver = d.drivers.filter((x) => x.volunteerId === id).length

      return {
        kind,
        id,
        found: true,
        allowed: blockers.length === 0,
        name: v.name,
        cascades: item('deletion.dep.driverRow', driver),
        blockers,
        alternativeKey: blockers.length === 0 ? null : 'deletion.alt.archiveVolunteer',
        requireName: false,
      }
    }

    case 'driver': {
      const dr = d.drivers.find((x) => x.id === id)
      if (!dr) return empty(kind, id)

      const missions = d.missions.filter(
        (m) => isLive(m.status) && m.drivers.some((x) => x.driverId === id),
      )
      const blockers = item('deletion.dep.trips', missions.length)

      return {
        kind,
        id,
        found: true,
        allowed: blockers.length === 0,
        name: dr.name,
        cascades: [],
        blockers,
        // ★ THE DUAL HAT GETS A DIFFERENT ALTERNATIVE, because the right move
        //   is not "archive the driver" — it is to take the driver hat off the
        //   volunteer, who stays a volunteer.
        alternativeKey:
          blockers.length === 0
            ? null
            : dr.volunteerId
              ? 'deletion.alt.unsetCanDrive'
              : 'deletion.alt.cancelTrips',
        requireName: false,
      }
    }

    case 'anchorPoint': {
      const a = d.anchorPoints.find((x) => x.id === id)
      if (!a) return empty(kind, id)

      // Any mission at all, live or not: `toMissionView` returns null for a
      // guard whose rendezvous does not resolve, so the guard would not be
      // "deleted", it would become INVISIBLE. That is worse than a refusal.
      const used = d.missions.filter(
        (m) => m.anchorPointId === id || m.additionalAnchorPointIds.includes(id),
      )
      const blockers = item('deletion.dep.guards', used.length)

      return {
        kind,
        id,
        found: true,
        allowed: blockers.length === 0,
        name: a.name,
        cascades: [],
        blockers,
        alternativeKey: blockers.length === 0 ? null : 'deletion.alt.cancelGuards',
        requireName: false,
      }
    }

    case 'farmZone': {
      const z = d.farmZones.find((x) => x.id === id)
      if (!z) return empty(kind, id)
      // A zone carries no history of its own — nobody stands a night AT a
      // polygon. It is deletable, and the dunam totals follow.
      return {
        kind,
        id,
        found: true,
        allowed: true,
        // A zone has no name of its own — it is a KIND drawn on a farm. The
        // dialog's title is built by the caller from the kind and the entity;
        // this is the identifier a log line needs.
        name: z.id,
        cascades: [],
        blockers: [],
        alternativeKey: null,
        requireName: false,
      }
    }

    case 'threatZone': {
      const z = d.threatZones.find((x) => x.id === id)
      if (!z) return empty(kind, id)
      // ★ A VECTOR IS NOT OWNED BY A ZONE in this model — both hang off the
      //   ENTITY (`farmId`), which is what `20260830000100_schema.sql` says
      //   too. So deleting a threat zone cascades to nothing, and saying it
      //   cascaded to the vectors nearby would be a lie the dialog told.
      return {
        kind,
        id,
        found: true,
        allowed: true,
        name: z.note || z.id,
        cascades: [],
        blockers: [],
        alternativeKey: null,
        requireName: false,
      }
    }

    case 'threatVector': {
      const v = d.threatVectors.find((x) => x.id === id)
      if (!v) return empty(kind, id)
      return {
        kind,
        id,
        found: true,
        allowed: true,
        name: v.note || v.id,
        cascades: [],
        blockers: [],
        alternativeKey: null,
        requireName: false,
      }
    }

    case 'contact': {
      const farm = d.farms.find((f) => f.contacts.some((c) => c.id === id))
      const contact = farm?.contacts.find((c) => c.id === id)
      if (!farm || !contact) return empty(kind, id)

      // ★ A SIGNATORY IS NOT A CONTACT ANY MORE, IT IS A NAME ON A DOCUMENT.
      //   Deleting him would leave `signedBy` pointing at nobody, which is the
      //   one field on an agreement a court would care about.
      const signed = farm.agreements.filter((a) => a.signedBy === contact.name).length
      const blockers = item('deletion.dep.agreements', signed)

      return {
        kind,
        id,
        found: true,
        allowed: blockers.length === 0,
        name: contact.name,
        cascades: [],
        blockers,
        alternativeKey: blockers.length === 0 ? null : 'deletion.alt.keepSignatory',
        requireName: false,
      }
    }

    case 'farmVisit': {
      const v = d.farmVisits.find((x) => x.id === id)
      if (!v) return empty(kind, id)
      // ★ A VISIT THAT HAPPENED IS HISTORY; one still to come is a plan. The
      //   flag the coordinator ticks when he gets back is the whole test.
      const blockers = v.done ? [{ key: 'deletion.dep.visitDone', count: 1 }] : []
      return {
        kind,
        id,
        found: true,
        allowed: blockers.length === 0,
        name: v.note || v.at,
        cascades: [],
        blockers,
        alternativeKey: blockers.length === 0 ? null : 'deletion.alt.keepVisit',
        requireName: false,
      }
    }

    case 'generalMeeting': {
      const m = d.generalMeetings.find((x) => x.id === id)
      if (!m) return empty(kind, id)
      return {
        kind,
        id,
        found: true,
        allowed: true,
        name: m.title,
        cascades: [],
        blockers: [],
        alternativeKey: null,
        requireName: false,
      }
    }

    case 'tour': {
      const t = d.tours.find((x) => x.id === id)
      if (!t) return empty(kind, id)
      // A tour is a PLAN for one day. Deleting it deletes no visit and no
      // guard; the farms it names are untouched.
      return {
        kind,
        id,
        found: true,
        allowed: true,
        name: t.dayKey,
        cascades: item('deletion.dep.tourStops', t.farmIds.length),
        blockers: [],
        alternativeKey: null,
        requireName: false,
      }
    }

    case 'mission': {
      const m = d.missions.find((x) => x.id === id)
      if (!m) return empty(kind, id)
      const allowed = isUnsolicitedDraft(id)
      return {
        kind,
        id,
        found: true,
        allowed,
        name: m.id,
        cascades: [],
        // ★ NOT A COUNT OF ANYTHING — the blocker IS the kind. A guard is
        //   cancelled, never deleted, and the message says so.
        blockers: allowed ? [] : [{ key: 'deletion.dep.missionIsCancelled', count: 1 }],
        alternativeKey: allowed ? null : 'deletion.alt.cancelMission',
        requireName: false,
      }
    }
  }
}
