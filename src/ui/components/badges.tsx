import { useTranslation } from 'react-i18next'

import type {
  FarmStatus,
  IncidentSeverity,
  MissionStatus,
  PhoneType,
  VolunteerStatus,
} from '@core/index'

import { Icon } from './Icon'

/**
 * Status colours live here and nowhere else — the map markers, the list chips
 * and the detail headers all read from the same table, so a status can never
 * look green in one screen and amber in another.
 */

export const FARM_STATUS_COLOR: Record<FarmStatus, string> = {
  to_contact: '#9aa3b8',
  contacted: '#e0a325',
  visited: '#d3781f',
  verbal_ok: '#5b8ac9',
  signed: '#4b63b6',
  active: '#2f8f5b',
  declined: '#b4483f',
}

const FARM_STATUS_CLASS: Record<FarmStatus, string> = {
  to_contact: 'bg-slate-100 text-slate-700',
  contacted: 'bg-amber-100 text-amber-800',
  visited: 'bg-orange-100 text-orange-800',
  verbal_ok: 'bg-sky-100 text-sky-800',
  signed: 'bg-indigo-100 text-indigo-800',
  active: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-rose-100 text-rose-800',
}

export function FarmStatusChip({ status }: { status: FarmStatus }) {
  const { t } = useTranslation()
  return (
    <span className={`chip ${FARM_STATUS_CLASS[status]}`}>
      {t(`farmStatus.${status}`)}
    </span>
  )
}

export function FarmStatusDot({ status }: { status: FarmStatus }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: FARM_STATUS_COLOR[status] }}
    />
  )
}

const MISSION_STATUS_CLASS: Record<MissionStatus, string> = {
  planned: 'bg-sky-100 text-sky-800',
  in_progress: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-slate-100 text-slate-700',
  return_not_confirmed: 'bg-rose-100 text-rose-800',
}

export function MissionStatusChip({ status }: { status: MissionStatus }) {
  const { t } = useTranslation()
  return (
    <span className={`chip ${MISSION_STATUS_CLASS[status]}`}>
      {status === 'in_progress' && (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
      )}
      {t(`missionStatus.${status}`)}
    </span>
  )
}

export const SEVERITY_CLASS: Record<IncidentSeverity, string> = {
  observation: 'bg-slate-100 text-slate-700',
  suspicious: 'bg-amber-100 text-amber-800',
  urgent: 'bg-rose-100 text-rose-800',
}

export const SEVERITY_ACCENT: Record<IncidentSeverity, string> = {
  observation: 'border-slate-300',
  suspicious: 'border-amber-400',
  urgent: 'border-rose-500',
}

export function SeverityChip({ severity }: { severity: IncidentSeverity }) {
  const { t } = useTranslation()
  return (
    <span className={`chip ${SEVERITY_CLASS[severity]}`}>
      {severity === 'urgent' && <Icon name="alert" size={13} />}
      {t(`severity.${severity}`)}
    </span>
  )
}

export function PhoneTypeChip({ type }: { type: PhoneType }) {
  const { t } = useTranslation()
  return (
    <span
      className={`chip ${
        type === 'kosher'
          ? 'bg-sand-200 text-sand-900'
          : 'bg-night-100 text-night-800'
      }`}
    >
      {t(`phoneType.${type}`)}
    </span>
  )
}

export function VolunteerStatusChip({ status }: { status: VolunteerStatus }) {
  const { t } = useTranslation()
  return (
    <span
      className={`chip ${
        status === 'active'
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-slate-100 text-slate-600'
      }`}
    >
      {t(`volunteerStatus.${status}`)}
    </span>
  )
}
