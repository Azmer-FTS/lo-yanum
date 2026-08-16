/** Programme-level constants. Data, not UI copy — labels live in the locales. */

export const COORDINATOR = {
  id: 'coord-01',
  name: 'דוד לוי',
  phone: '052-0000049',
  role: 'רכז אזורי — נגב',
} as const

export interface EmergencyNumber {
  /** i18n key under `emergency.*` for the label. */
  key: string
  number: string
}

/**
 * Shown prominently when an urgent incident is being reported. Reporting
 * documents the event — calling is still the primary action.
 */
export const EMERGENCY_NUMBERS: EmergencyNumber[] = [
  { key: 'police', number: '100' },
  { key: 'ambulance', number: '101' },
  { key: 'fire', number: '102' },
  { key: 'regionalSecurity', number: '08-0000050' },
]
