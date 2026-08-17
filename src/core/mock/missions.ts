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

/**
 * D6.2 timeline defaults. A planned guard has been CREATED and nothing else;
 * spelling that out here rather than defaulting in the type keeps every
 * fixture's timeline explicit and reviewable.
 */
const notYet = (createdHoursBeforeStart: number, startAt: string) => ({
  createdAt: new Date(
    new Date(startAt).getTime() - createdHoursBeforeStart * 3_600_000,
  ).toISOString(),
  droppedOffAt: null,
  pickedUpAt: null,
  completedAt: null,
})

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
    // Seeds the F2 two-position case: this group meets the driver at the north
    // gate and moves to the eastern lookout for the second half of the night.
    additionalAnchorPointIds: ['anchor-02'],
    // G8 — the A40 seed: the group boards at the yeshiva parking in Beer
    // Sheva, and the car stops at the farm's gate on route 222 — NOT at the
    // guard post, which is a 4x4 track further in.
    pickupPoint: { lat: 31.2591, lng: 34.7938 },
    dropoffPoint: { lat: 31.0601, lng: 34.6478 },
    returnPickupPoint: null,
    returnDropoffPoint: null,
    startAt: hoursFromNow(-2),
    endAt: hoursFromNow(6),
    requiredVolunteers: 3,
    status: 'in_progress',
    assignments: [
      who('vol-001', true, leg('present', 'present', 'present')),
      who('vol-002', false, leg('present', 'present')),
      who('vol-003', false, leg('present', 'absent')),
    ],
    drivers: [
      {
        driverId: 'drv-03',
        passengerVolunteerIds: ['vol-001', 'vol-002', 'vol-003'],
        confirmed: true,
      },
    ],
    arrivalConfirmedAt: hoursFromNow(-1.8),
    endConfirmedAt: null,
    createdAt: hoursFromNow(-50),
    droppedOffAt: hoursFromNow(-2.1),
    pickedUpAt: null,
    completedAt: null,
  },

  // Starting later tonight — nobody has moved yet, every mark still pending.
  {
    id: 'mission-02',
    farmId: 'farm-03',
    anchorPointId: 'anchor-04',
    additionalAnchorPointIds: [],
    pickupPoint: null,
    dropoffPoint: null,
    returnPickupPoint: null,
    returnDropoffPoint: null,
    startAt: hoursFromNow(4),
    endAt: hoursFromNow(12),
    requiredVolunteers: 3,
    status: 'planned',
    assignments: [
      who('vol-007', true),
      who('vol-008', false),
      who('vol-009', false),
    ],
    // G5.3 — the seeded TWO-CAR night: drv-05's Viano is in the shop, so a
    // dual-hat volunteer covers the overflow. Each confirms his own list.
    drivers: [
      {
        driverId: 'drv-05',
        passengerVolunteerIds: ['vol-007', 'vol-008'],
        confirmed: true,
      },
      {
        driverId: 'drv-v01',
        passengerVolunteerIds: ['vol-009'],
        confirmed: false,
      },
    ],
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
    ...notYet(30, hoursFromNow(4)),
  },

  // Last night: the group ended the guard, went out fine, but the morning
  // return was never confirmed by anyone — the alert the coordinator chases.
  {
    id: 'mission-03',
    farmId: 'farm-01',
    anchorPointId: 'anchor-02',
    additionalAnchorPointIds: [],
    pickupPoint: null,
    dropoffPoint: null,
    returnPickupPoint: null,
    returnDropoffPoint: null,
    startAt: hoursFromNow(-30),
    endAt: hoursFromNow(-22),
    requiredVolunteers: 3,
    status: 'return_not_confirmed',
    assignments: [
      who('vol-020', true, leg('present', 'present', 'present')),
      who('vol-019', false, leg('present', 'present')),
      who('vol-021', false, leg('present', 'present')),
    ],
    drivers: [
      {
        driverId: 'drv-06',
        passengerVolunteerIds: ['vol-020', 'vol-019', 'vol-021'],
        confirmed: true,
      },
    ],
    arrivalConfirmedAt: hoursFromNow(-29.8),
    endConfirmedAt: hoursFromNow(-22),
    createdAt: hoursFromNow(-78),
    droppedOffAt: hoursFromNow(-30.2),
    pickedUpAt: null,
    completedAt: null,
  },

  // Two nights ago, closed cleanly — both legs fully confirmed on both sides.
  {
    id: 'mission-04',
    farmId: 'farm-02',
    anchorPointId: 'anchor-03',
    additionalAnchorPointIds: [],
    pickupPoint: null,
    dropoffPoint: null,
    returnPickupPoint: null,
    returnDropoffPoint: null,
    startAt: hoursFromNow(-54),
    endAt: hoursFromNow(-46),
    requiredVolunteers: 2,
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
    drivers: [
      {
        driverId: 'drv-01',
        passengerVolunteerIds: ['vol-013', 'vol-014'],
        confirmed: true,
      },
    ],
    arrivalConfirmedAt: hoursFromNow(-53.8),
    endConfirmedAt: hoursFromNow(-46),
    createdAt: hoursFromNow(-102),
    droppedOffAt: hoursFromNow(-54.2),
    pickedUpAt: hoursFromNow(-45.6),
    completedAt: hoursFromNow(-45.4),
  },

  {
    id: 'mission-05',
    farmId: 'farm-02',
    anchorPointId: 'anchor-03',
    additionalAnchorPointIds: [],
    pickupPoint: null,
    dropoffPoint: null,
    returnPickupPoint: null,
    returnDropoffPoint: null,
    ...future(2),
    requiredVolunteers: 2,
    status: 'planned',
    assignments: [who('vol-016', true), who('vol-017', false)],
    drivers: [
      {
        driverId: 'drv-01',
        passengerVolunteerIds: ['vol-016', 'vol-017'],
        confirmed: true,
      },
    ],
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
    ...notYet(48, future(2).startAt),
  },

  {
    id: 'mission-06',
    farmId: 'farm-03',
    anchorPointId: 'anchor-04',
    additionalAnchorPointIds: [],
    pickupPoint: null,
    dropoffPoint: null,
    returnPickupPoint: null,
    returnDropoffPoint: null,
    ...future(4),
    requiredVolunteers: 3,
    status: 'planned',
    assignments: [
      who('vol-022', true),
      who('vol-023', false),
      who('vol-019', false),
    ],
    drivers: [],
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
    ...notYet(72, future(4).startAt),
  },
]
