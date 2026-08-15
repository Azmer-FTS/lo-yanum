import { guardNight, hoursFromNow } from '../clock'
import type { Mission } from '../types'

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

export const MISSIONS: Mission[] = [
  // Under way right now — drives the volunteer, driver and farmer live views.
  {
    id: 'mission-01',
    farmId: 'farm-01',
    anchorPointId: 'anchor-01',
    startAt: hoursFromNow(-2),
    endAt: hoursFromNow(6),
    status: 'in_progress',
    assignments: [
      { volunteerId: 'vol-01', isGroupPhone: true },
      { volunteerId: 'vol-02', isGroupPhone: false },
      { volunteerId: 'vol-03', isGroupPhone: false },
    ],
    driverId: 'drv-03',
    arrivalConfirmedAt: hoursFromNow(-1.8),
    endConfirmedAt: null,
    dropoffConfirmedCount: 3,
    pickupConfirmedCount: null,
  },

  // Starting later tonight — still "planned", nobody has moved yet.
  {
    id: 'mission-02',
    farmId: 'farm-03',
    anchorPointId: 'anchor-04',
    startAt: hoursFromNow(4),
    endAt: hoursFromNow(12),
    status: 'planned',
    assignments: [
      { volunteerId: 'vol-07', isGroupPhone: true },
      { volunteerId: 'vol-08', isGroupPhone: false },
      { volunteerId: 'vol-09', isGroupPhone: false },
    ],
    driverId: 'drv-05',
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
    dropoffConfirmedCount: null,
    pickupConfirmedCount: null,
  },

  // Last night: the group ended the guard but the driver never confirmed the
  // morning pick-up — this is the alert the coordinator must chase.
  {
    id: 'mission-03',
    farmId: 'farm-01',
    anchorPointId: 'anchor-02',
    startAt: hoursFromNow(-30),
    endAt: hoursFromNow(-22),
    status: 'return_not_confirmed',
    assignments: [
      { volunteerId: 'vol-20', isGroupPhone: true },
      { volunteerId: 'vol-19', isGroupPhone: false },
      { volunteerId: 'vol-21', isGroupPhone: false },
    ],
    driverId: 'drv-06',
    arrivalConfirmedAt: hoursFromNow(-29.8),
    endConfirmedAt: hoursFromNow(-22),
    dropoffConfirmedCount: 3,
    pickupConfirmedCount: null,
  },

  // Two nights ago, closed cleanly.
  {
    id: 'mission-04',
    farmId: 'farm-02',
    anchorPointId: 'anchor-03',
    startAt: hoursFromNow(-54),
    endAt: hoursFromNow(-46),
    status: 'completed',
    assignments: [
      { volunteerId: 'vol-13', isGroupPhone: true },
      { volunteerId: 'vol-14', isGroupPhone: false },
    ],
    driverId: 'drv-01',
    arrivalConfirmedAt: hoursFromNow(-53.8),
    endConfirmedAt: hoursFromNow(-46),
    dropoffConfirmedCount: 2,
    pickupConfirmedCount: 2,
  },

  {
    id: 'mission-05',
    farmId: 'farm-02',
    anchorPointId: 'anchor-03',
    ...future(2),
    status: 'planned',
    assignments: [
      { volunteerId: 'vol-16', isGroupPhone: true },
      { volunteerId: 'vol-17', isGroupPhone: false },
    ],
    driverId: 'drv-01',
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
    dropoffConfirmedCount: null,
    pickupConfirmedCount: null,
  },

  {
    id: 'mission-06',
    farmId: 'farm-03',
    anchorPointId: 'anchor-04',
    ...future(4),
    status: 'planned',
    assignments: [
      { volunteerId: 'vol-22', isGroupPhone: true },
      { volunteerId: 'vol-23', isGroupPhone: false },
      { volunteerId: 'vol-19', isGroupPhone: false },
    ],
    driverId: null,
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
    dropoffConfirmedCount: null,
    pickupConfirmedCount: null,
  },
]
