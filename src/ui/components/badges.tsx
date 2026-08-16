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
 * Status presentation, defined exactly once.
 *
 * Chips, list dots, table cells and map markers all read from here, so a status
 * can never be green in one screen and amber in another. Colours resolve from
 * the design tokens — no hex literals in this file or any other component.
 *
 * LOT 0.7 — VIVID vs INK. Each hue is a pair: the bare token is the vivid FILL
 * (dot, marker, severity bar), `-ink` is the same identity as legible TEXT on
 * that colour's own 15 % wash. A chip is therefore always
 * `bg-<hue>/15 text-<hue>-ink`, never `text-<hue>`; the audit in
 * `bun run contrast` measures exactly that composition.
 */

/** Token name per farm status; `readStatusColor` resolves it to a real colour. */
const FARM_STATUS_TOKEN: Record<FarmStatus, string> = {
  to_contact: '--farm-to-contact',
  contacted: '--farm-contacted',
  visited: '--farm-visited',
  verbal_ok: '--farm-verbal-ok',
  signed: '--farm-signed',
  active: '--farm-active',
  declined: '--farm-declined',
}

/**
 * MapLibre markers are raw DOM built outside React, so they need a concrete
 * colour string rather than a Tailwind class. This reads the token's computed
 * value off :root — the token file stays the single source of truth.
 */
export function readStatusColor(status: FarmStatus): string {
  return readToken(FARM_STATUS_TOKEN[status], 'rgb(139, 149, 173)')
}

/**
 * Resolve any colour token to a concrete string, for the DOM-outside-React
 * cases (MapLibre markers and paint properties).
 *
 * Emits the COMMA form `rgb(r, g, b)`. The tokens are stored as space-separated
 * channels for Tailwind's `<alpha-value>` support, but MapLibre's own colour
 * parser only accepts the legacy comma syntax — feeding it `rgb(246 243 237)`
 * throws inside the style-load handler and silently kills tile rendering.
 */
export function readToken(name: string, fallback = 'rgb(240, 140, 0)'): string {
  if (typeof window === 'undefined') return fallback
  const channels = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  if (!channels) return fallback
  const parts = channels.split(/\s+/)
  return parts.length >= 3
    ? `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`
    : fallback
}

/** Tinted chip: INK text on a 15 % wash of the matching VIVID colour. */
const FARM_STATUS_CLASS: Record<FarmStatus, string> = {
  to_contact: 'bg-farm-to-contact/15 text-farm-to-contact-ink',
  contacted: 'bg-farm-contacted/15 text-farm-contacted-ink',
  visited: 'bg-farm-visited/15 text-farm-visited-ink',
  verbal_ok: 'bg-farm-verbal-ok/15 text-farm-verbal-ok-ink',
  signed: 'bg-farm-signed/15 text-farm-signed-ink',
  active: 'bg-farm-active/15 text-farm-active-ink',
  declined: 'bg-farm-declined/15 text-farm-declined-ink',
}

const FARM_STATUS_DOT: Record<FarmStatus, string> = {
  to_contact: 'bg-farm-to-contact',
  contacted: 'bg-farm-contacted',
  visited: 'bg-farm-visited',
  verbal_ok: 'bg-farm-verbal-ok',
  signed: 'bg-farm-signed',
  active: 'bg-farm-active',
  declined: 'bg-farm-declined',
}

export function FarmStatusChip({ status }: { status: FarmStatus }) {
  const { t } = useTranslation()
  return (
    <span className={`chip ${FARM_STATUS_CLASS[status]}`}>
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-pill ${FARM_STATUS_DOT[status]}`}
      />
      {t(`farmStatus.${status}`)}
    </span>
  )
}

export function FarmStatusDot({ status }: { status: FarmStatus }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-pill ${FARM_STATUS_DOT[status]}`}
    />
  )
}

const MISSION_STATUS_CLASS: Record<MissionStatus, string> = {
  planned: 'bg-status-info/15 text-status-info-ink',
  in_progress: 'bg-status-success/15 text-status-success-ink',
  completed: 'bg-content-muted/15 text-content-muted',
  return_not_confirmed: 'bg-status-danger/15 text-status-danger-ink',
}

export function MissionStatusChip({ status }: { status: MissionStatus }) {
  const { t } = useTranslation()
  return (
    <span className={`chip ${MISSION_STATUS_CLASS[status]}`}>
      {/* Only the live state animates. `currentColor` on the dot means the
          halo inherits the chip's ink, so one keyframe serves every status. */}
      {status === 'in_progress' && <span className="live-dot" />}
      {t(`missionStatus.${status}`)}
    </span>
  )
}

export const SEVERITY_CLASS: Record<IncidentSeverity, string> = {
  observation: 'bg-status-success/15 text-status-success-ink',
  suspicious: 'bg-status-warn/15 text-status-warn-ink',
  urgent: 'bg-status-danger/15 text-status-danger-ink',
}

/** The thick inline-start bar on an incident row / alert card. */
export const SEVERITY_ACCENT: Record<IncidentSeverity, string> = {
  observation: 'border-s-status-success',
  suspicious: 'border-s-status-warn',
  urgent: 'border-s-status-danger',
}

/** Solid fills for the R7 severity picker — huge, unmistakable at 2 AM. */
export const SEVERITY_SOLID: Record<IncidentSeverity, string> = {
  observation: 'bg-status-success text-content-on-accent',
  suspicious: 'bg-status-warn text-content-on-accent',
  urgent: 'bg-status-danger text-content-on-accent',
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
          ? 'bg-accent/15 text-accent-ink'
          : 'bg-status-info/15 text-status-info-ink'
      }`}
    >
      <Icon name={type === 'kosher' ? 'phoneBasic' : 'phone'} size={11} />
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
          ? 'bg-status-success/15 text-status-success-ink'
          : 'bg-content-muted/15 text-content-muted'
      }`}
    >
      {t(`volunteerStatus.${status}`)}
    </span>
  )
}

/** R6: per-person confirmation state, shown side by side in mission detail. */
export function ConfirmationChip({
  state,
}: {
  state: 'present' | 'absent' | 'pending' | 'mismatch'
}) {
  const { t } = useTranslation()
  const map = {
    present: 'bg-status-success/15 text-status-success-ink',
    absent: 'bg-status-danger/15 text-status-danger-ink',
    pending: 'bg-content-muted/15 text-content-muted',
    mismatch:
      'bg-status-warn/20 text-status-warn-ink ring-1 ring-status-warn/50',
  } as const
  const icon = {
    present: 'check',
    absent: 'close',
    pending: 'clock',
    mismatch: 'alert',
  } as const

  return (
    <span className={`chip ${map[state]}`}>
      <Icon name={icon[state]} size={12} />
      {t(`confirm.${state}`)}
    </span>
  )
}
