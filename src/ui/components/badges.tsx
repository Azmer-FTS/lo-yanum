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

/**
 * G7bis.1 — the marker colour vocabulary, one function per point kind so a map
 * can never paint a guard post in the farm's green. The farm's pastille is the
 * charter forest (theme-aware token); a guard post is AMBER — the watch-fire
 * colour, far from both the accent olive and the meet-point blue.
 */
export function farmMarkerColor(entity: { entityKind?: import('@core/index').EntityKind } = {}): string {
  // N7.2 (2026-09-02) — a moshav is painted in ITS family (the boundary
  // blue), so farm and moshav are tellable by colour before the glyph.
  return readToken(entity.entityKind === 'moshav' ? '--zone-boundary-moshav' : '--marker-farm')
}

/**
 * G16 — which SILHOUETTE the entity's pastille takes: the barn disc for a
 * farm (and 'other'), the village disc for a moshav. Colour stays the shared
 * forest pastille; the glyph is the distinction, legible before colour.
 */
export function entityMarkerKind(farm: {
  entityKind?: import('@core/index').EntityKind
}): 'farm' | 'moshav' {
  return (farm.entityKind ?? 'farm') === 'moshav' ? 'moshav' : 'farm'
}

export function postColor(): string {
  return readToken('--status-warn')
}

/**
 * G7bis.1 — a legend swatch that repeats the MARKER'S SHAPE, not just its
 * colour. A legend of identical dots explains nothing once the markers
 * themselves stopped being dots.
 */
export function MarkerSwatch({
  shape,
  color,
}: {
  /**
   * W5 — `post` is the needle pin the guard posts wear on the canvas; `pin`
   * stays the teardrop of the placed points and the pickup stops. The legend
   * repeats the marker's SILHOUETTE, so it has to carry both.
   */
  shape: 'disc' | 'pin' | 'post' | 'triangle'
  color: string
}) {
  if (shape === 'disc') {
    return (
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-pill"
        style={{ backgroundColor: color }}
      />
    )
  }
  if (shape === 'triangle') {
    return (
      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" aria-hidden="true">
        <path d="M12 2.6 22.6 20.9H1.4Z" fill={color} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 32" className="h-3.5 w-3 shrink-0" aria-hidden="true">
      <path
        d={
          shape === 'post'
            ? 'M12 31.2 9.6 17.6a9 9 0 1 1 4.8 0z'
            : 'M12 1C5.9 1 1 5.9 1 12c0 8.1 11 19 11 19s11-10.9 11-19C23 5.9 18.1 1 12 1z'
        }
        fill={color}
      />
    </svg>
  )
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

/**
 * F4 — `return_not_confirmed` is one of the two CRITICAL states: it means a
 * group left a farm and nobody has said they got home. It carries the charter
 * orange as a solid fill, not a wash, because it is the one mission state a
 * coordinator must never scroll past.
 */
const MISSION_STATUS_CLASS: Record<MissionStatus, string> = {
  recruiting: 'bg-status-warn/15 text-status-warn-ink',
  planned: 'bg-status-info/15 text-status-info-ink',
  in_progress: 'bg-status-success/15 text-status-success-ink',
  completed: 'bg-content-muted/15 text-content-muted',
  return_not_confirmed: 'bg-critical text-content-on-accent',
  // G9bis — muted, NOT danger-tinted: a cancelled guard is an archived fact,
  // and painting it red would let it compete with the states that need chasing.
  cancelled: 'bg-content-muted/15 text-content-muted',
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

/**
 * F4 — THE דחוף BADGE IS THE CHARTER ORANGE, SOLID.
 *
 * The other two severities stay tinted. An urgent incident is not "the same
 * chip, darker": it is the thing the whole programme exists to catch, and it
 * gets the association's loud CTA colour at full strength so it separates from
 * a page of green at arm's length.
 */
export const SEVERITY_CLASS: Record<IncidentSeverity, string> = {
  observation: 'bg-status-success/15 text-status-success-ink',
  suspicious: 'bg-status-warn/15 text-status-warn-ink',
  urgent: 'bg-critical text-content-on-accent',
}

/** The thick inline-start bar on an incident row / alert card. */
export const SEVERITY_ACCENT: Record<IncidentSeverity, string> = {
  observation: 'border-s-status-success',
  suspicious: 'border-s-status-warn',
  urgent: 'border-s-critical',
}

/** Solid fills for the R7 severity picker — huge, unmistakable at 2 AM. */
export const SEVERITY_SOLID: Record<IncidentSeverity, string> = {
  observation: 'bg-status-success text-content-on-accent',
  suspicious: 'bg-status-warn text-content-on-accent',
  urgent: 'bg-critical text-content-on-accent',
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
  // F4 — `mismatch` is the second CRITICAL state: the driver and the group
  // holder disagree about who is on the bus. Solid charter orange; `absent`
  // stays an ordinary danger wash, because "he did not come" is a known fact
  // and "we do not agree on whether he came" is not.
  const map = {
    present: 'bg-status-success/15 text-status-success-ink',
    absent: 'bg-status-danger/15 text-status-danger-ink',
    pending: 'bg-content-muted/15 text-content-muted',
    mismatch: 'bg-critical text-content-on-accent',
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
