import { _raw } from './store'
import type { Role, Session } from './types'

/**
 * Presets for the POC role switcher. In Lot 1 this file disappears entirely —
 * the session comes from Supabase auth instead. Nothing else in /src/core
 * imports it, so removing it is a one-file change.
 */

export interface SessionPreset {
  id: string
  role: Role
  entityId: string | null
  /** Person's name, resolved from mock data. Empty for the coordinator. */
  name: string
  /** Farm / yeshiva / locality — enough to tell two presets apart. */
  detail: string
}

export function listSessionPresets(): SessionPreset[] {
  const d = _raw()
  const presets: SessionPreset[] = [
    {
      id: 'coordinator',
      role: 'coordinator',
      entityId: null,
      name: '',
      detail: '',
    },
  ]

  // One farmer per farm that actually has a guard history worth showing.
  for (const farm of d.farms) {
    const primary = farm.contacts.find((c) => c.isPrimary)
    if (!primary) continue
    if (!d.missions.some((m) => m.farmId === farm.id)) continue
    presets.push({
      id: `farmer:${primary.id}`,
      role: 'farmer',
      entityId: primary.id,
      name: primary.name,
      detail: farm.name,
    })
  }

  // Only group-phone holders: they are the ones who use the app for the group.
  const groupPhoneIds = new Set(
    d.missions.flatMap((m) =>
      m.assignments.filter((a) => a.isGroupPhone).map((a) => a.volunteerId),
    ),
  )
  for (const volunteer of d.volunteers) {
    if (!groupPhoneIds.has(volunteer.id)) continue
    presets.push({
      id: `volunteer:${volunteer.id}`,
      role: 'volunteer',
      entityId: volunteer.id,
      name: volunteer.name,
      detail: volunteer.yeshiva,
    })
  }

  for (const driver of d.drivers) {
    if (!d.missions.some((m) => m.drivers.some((dr) => dr.driverId === driver.id))) continue
    presets.push({
      id: `driver:${driver.id}`,
      role: 'driver',
      entityId: driver.id,
      name: driver.name,
      detail: driver.locality,
    })
  }

  return presets
}

export function presetToSession(preset: SessionPreset): Session {
  return { role: preset.role, entityId: preset.entityId }
}

export function presetIdOf(session: Session): string {
  return session.role === 'coordinator'
    ? 'coordinator'
    : `${session.role}:${session.entityId}`
}

/** Landing route for a role — the field roles have no dashboard. */
export function homeRouteFor(role: Role): string {
  switch (role) {
    case 'coordinator':
      return '/coordinator'
    case 'farmer':
      return '/farmer'
    case 'volunteer':
      return '/volunteer'
    case 'driver':
      return '/driver'
  }
}
