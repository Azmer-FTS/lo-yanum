import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * X5 (2026-09-04) — THE PIECES EVERY ROSTER ROW IS MADE OF.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The three rosters — volunteers, drivers, farms — had each grown their own
 * copy of the same two components, and the copies had drifted: a 28 px action
 * button on one screen and a 32 px one on the next, a header cell that
 * truncated on one and overflowed on another. The GRID itself lives in
 * `index.css` (`.roster` / `.roster-row` and the per-roster tracks); what is
 * here is what goes in the cells.
 *
 * `tier` is the narrowest container width at which a column appears. It is
 * NOT a viewport breakpoint: since P0bis.2 the panel is a width the
 * coordinator drags, so the question "does this column fit" has to be asked of
 * the panel. See the long note in `index.css`.
 */
export type RosterTier = 'base' | 'md' | 'lg' | 'xl'

/** A column label. Its width is the roster's track, never its own. */
export function RosterHead({
  label,
  tier = 'base',
  className = '',
}: {
  label: string
  tier?: RosterTier
  className?: string
}) {
  return (
    <span
      data-col={tier}
      className={`truncate text-micro font-semibold uppercase tracking-wide text-content-muted ${className}`}
    >
      {label}
    </span>
  )
}

/**
 * One icon action of a roster row: a button, or a link when given `href`.
 *
 * ★ 32 px OF INK EITHER WAY, so a row's action group has one rhythm — and,
 *   more to the point, so the group has a PREDICTABLE width that the grid's
 *   actions track can be sized `max-content` against. The 40 px
 *   `ContactButtons` trio needs 175 px, which the panel does not have at 25 %
 *   of the seam, and squeezing it is what put icons on top of each other.
 */
export function RowAction({
  icon,
  label,
  onClick,
  href,
  external = false,
  testId,
  danger = false,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  href?: string
  external?: boolean
  testId?: string
  /** PO POINT 8 — a delete is not the same weight as a history button. */
  danger?: boolean
}) {
  const cls = `flex h-8 w-8 shrink-0 items-center justify-center rounded-field transition-colors duration-fast ${
    danger
      ? 'text-content-muted hover:bg-status-danger/10 hover:text-status-danger-ink'
      : 'text-content-muted hover:bg-surface-overlay hover:text-content-primary'
  }`

  if (href) {
    return (
      <a
        href={href}
        title={label}
        aria-label={label}
        data-testid={testId}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        className={cls}
      >
        <Icon name={icon} size={16} />
      </a>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      data-testid={testId}
      className={cls}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}
