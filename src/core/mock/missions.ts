import { guardNight, hoursFromNow } from '../clock'
import { EMPTY_LEG } from '../types'
import type { LegConfirmation, Mission, MissionAssignment, PresenceMark } from '../types'

/**
 * 6 missions covering every status.
 *
 * Anything that must be *live* or *already closed* is placed with hour offsets
 * rather than wall-clock times, so the POC demos correctly whether it is opened
 * at 09:00 or at 02:00: one guard is genuinely under way, one is genuinely
 * about to start, and the two finished guards are unambiguously over. Only the
 * far-future guards use day offsets, where a 21:00–05:00 night reads naturally.
 */

const future = (days: number) => guardNight(days)

const leg = (
  driver: PresenceMark | null = null,
  group: PresenceMark | null = null,
  self: PresenceMark | null = null,
): LegConfirmation => ({ driver, group, self })

/** Assignment helper — keeps the mission literals readable. */
const who = (
  volunteerId: string,
  isGroupPhone: boolean,
  outbound: LegConfirmation = { ...EMPTY_LEG },
  inbound: LegConfirmation = { ...EMPTY_LEG },
): MissionAssignment => ({ volunteerId, isGroupPhone, outbound, inbound })

export const MISSIONS: Mission[] = [
  // Under way right now — drives the volunteer, driver and farmer live views.
  //
  // ⚠️ vol-03 carries the SEEDED MISMATCH (A10): the driver marked him picked
  // up, the group-phone holder says he is not with them. Neither side is
  // overridden — it surfaces as an alert with one-tap call buttons.
  {
    id: 'mission-01',
    farmId: 'farm-01',
    anchorPointId: 'anchor-01',
    startAt: hoursFromNow(-2),
    endAt: hoursFromNow(6),
    status: 'in_progress',
    assignments: [
      who('vol-001', true, leg('present', 'present', 'present')),
      who('vol-002', false, leg('present', 'present')),
      who('vol-003', false, leg('present', 'absent')),
    ],
    driverId: 'drv-03',
    arrivalConfirmedAt: hoursFromNow(-1.8),
    endConfirmedAt: null,
  },

  // Starting later tonight — nobody has moved yet, every mark still pending.
  {
    id: 'mission-02',
    farmId: 'farm-03',
    anchorPointId: 'anchor-04',
    startAt: hoursFromNow(4),
    endAt: hoursFromNow(12),
    status: 'planned',
    assignments: [
      who('vol-007', true),
      who('vol-008', false),
      who('vol-009', false),
    ],
    driverId: 'drv-05',
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
  },

  // Last night: the group ended the guard, went out fine, but the morning
  // return was never confirmed by anyone — the alert the coordinator chases.
  {
    id: 'mission-03',
    farmId: 'farm-01',
    anchorPointId: 'anchor-02',
    startAt: hoursFromNow(-30),
    endAt: hoursFromNow(-22),
    status: 'return_not_confirmed',
    assignments: [
      who('vol-020', true, leg('present', 'present', 'present')),
      who('vol-019', false, leg('present', 'present')),
      who('vol-021', false, leg('present', 'present')),
    ],
    driverId: 'drv-06',
    arrivalConfirmedAt: hoursFromNow(-29.8),
    endConfirmedAt: hoursFromNow(-22),
  },

  // Two nights ago, closed cleanly — both legs fully confirmed on both sides.
  {
    id: 'mission-04',
    farmId: 'farm-02',
    anchorPointId: 'anchor-03',
    startAt: hoursFromNow(-54),
    endAt: hoursFromNow(-46),
    status: 'completed',
    assignments: [
      who(
        'vol-013',
        true,
        leg('present', 'present', 'present'),
        leg('present', 'present', 'present'),
      ),
      who('vol-014', false, leg('present', 'present'), leg('present', 'present')),
    ],
    driverId: 'drv-01',
    arrivalConfirmedAt: hoursFromNow(-53.8),
    endConfirmedAt: hoursFromNow(-46),
  },

  {
    id: 'mission-05',
    farmId: 'farm-02',
    anchorPointId: 'anchor-03',
    ...future(2),
    status: 'planned',
    assignments: [who('vol-016', true), who('vol-017', false)],
    driverId: 'drv-01',
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
  },

  {
    id: 'mission-06',
    farmId: 'farm-03',
    anchorPointId: 'anchor-04',
    ...future(4),
    status: 'planned',
    assignments: [
      who('vol-022', true),
      who('vol-023', false),
      who('vol-019', false),
    ],
    driverId: null,
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
  },
]
