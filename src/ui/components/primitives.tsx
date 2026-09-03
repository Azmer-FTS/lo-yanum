import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { ChevronForward, Icon } from './Icon'
import type { IconName } from './Icon'

// --- Layout blocks ---------------------------------------------------------

/**
 * ★ W6 (2026-09-02) — AN ARROW, NOT A BREADCRUMB.
 *
 * The way back was a line of its own above the title — "‹ חוות" in muted
 * 13 px — which cost a whole row at the top of every sheet to restate the
 * name of the list the coordinator had just come from, and was a 14 px hit
 * target on a device driven with a thumb. It is a 40 px round button BESIDE
 * the title now, where the back arrow is in every application he already
 * uses; the list's name lives on `title` / `aria-label`, where a name that
 * is only ever confirmation belongs.
 *
 * `ltr:-scale-x-100`: back is towards the inline START, which is the RIGHT
 * in Hebrew and the LEFT in English, so the glyph flips with the direction.
 */
/**
 * ★ X4.1 (2026-09-04) — THE SHEET SHOWS THE PLACE IT IS ABOUT.
 *
 * A farm's file opened on a name and two words of geography, and the product
 * owner's complaint was recognition: he taps a photo in the roster and lands
 * on a page that looks like every other page. `media` is a square thumbnail
 * beside the title — the same picture he tapped, at 64 px, which is a
 * confirmation rather than a banner. A full-width band was the other option
 * and it costs 140 px of a column that is already a long read; the square
 * costs nothing, because the header row was that tall anyway.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  media,
}: {
  title: ReactNode
  subtitle?: string
  actions?: ReactNode
  /** The parent list. Rendered as a round back arrow beside the title. */
  back?: { to: string; label: string }
  /** A square thumbnail of the record — its photo, or its initials. */
  media?: ReactNode
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {back && (
            <Link
              to={back.to}
              aria-label={back.label}
              title={back.label}
              data-testid="page-back"
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-pill
                         border border-edge-subtle bg-surface-raised text-content-secondary
                         shadow-card transition-colors duration-fast
                         hover:bg-surface-high hover:text-content-primary"
            >
              <Icon name="chevron" size={18} className="ltr:-scale-x-100" />
            </Link>
          )}
          {media && (
            <span data-page-media="" className="shrink-0">
              {media}
            </span>
          )}
          <div className="min-w-0">
            <h1 data-page-title="" className="text-title text-content-primary">
              {title}
            </h1>
            {subtitle && <p className="muted mt-1">{subtitle}</p>}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  )
}

/**
 * ★ W6 — THE SHEET'S ACTIONS ARE ONE PILL.
 *
 * A farm's header carried three separate buttons — תכנון ביקור, עריכה and a
 * ghost מחיקה in the danger ink — three different skins for three things
 * that are one idea: what can be done to this record. Wrapped, on an iPad in
 * portrait, they took two rows and the delete drifted under the edit.
 *
 * One segmented pill, hairlines between the segments, the destructive one
 * last and in its ink. It is a row of buttons rather than a menu because
 * three is exactly the number that still reads faster open than folded.
 */
export function ActionPill({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-testid="sheet-actions"
      className={`flex shrink-0 items-center overflow-hidden rounded-pill border border-edge-subtle
                  bg-surface-raised shadow-card divide-x divide-edge-subtle rtl:divide-x-reverse ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * One segment of an `ActionPill`. Renders a button, or a link when given `to`.
 *
 * ★ X4.2 (2026-09-04) — ICONS ONLY, AND THE LABEL MOVES TO `title`/`aria-label`.
 *   Three labelled segments made a pill about 22 rem wide sitting beside a
 *   title in a 42 % column, so on an iPad in portrait it wrapped under the
 *   name and the delete drifted. A bin, a pencil and a calendar are three
 *   glyphs nobody has to read, and at 48×44 px each the pill is 9 rem — with
 *   BIGGER targets than the labelled version had. Nothing is lost for a
 *   screen reader or a hover: the words are still on the element.
 */
export function ActionPillItem({
  icon,
  label,
  to,
  onClick,
  danger = false,
  testId,
}: {
  icon: IconName
  label: string
  to?: string
  onClick?: () => void
  danger?: boolean
  testId?: string
}) {
  const cls = `flex h-12 w-12 items-center justify-center
               transition-colors duration-fast ${
                 danger
                   ? 'text-status-danger-ink hover:bg-status-danger/10'
                   : 'text-content-secondary hover:bg-surface-high hover:text-content-primary'
               }`
  const body = <Icon name={icon} size={19} />
  return to ? (
    <Link to={to} data-testid={testId} className={cls} title={label} aria-label={label}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cls}
      title={label}
      aria-label={label}
    >
      {body}
    </button>
  )
}

/**
 * U1 (2026-09-02) — EVERY SIGNIFICANT BLOCK FOLDS, AND THE FOLD IS REMEMBERED
 * PER KIND OF BLOCK, NOT PER RECORD.
 *
 * The product owner's rule, verbatim: if he folds "שכבת איומים" on one farm,
 * it is folded on EVERY farm, and it stays folded tomorrow. So the memory is
 * keyed by the block's TYPE (`collapseKey`) in localStorage — never by the
 * record's id, and never in sessionStorage, which iPadOS empties every time
 * it reaps the tab.
 *
 * A folded block costs one line: its title, a chevron, and a one-line
 * summary/counter the caller supplies ("3 עמדות · 2 אזורים"). The whole
 * heading is the hit area (G11), not the 15 px chevron.
 */
const BLOCK_PREFIX = 'lo-yanum:block:'

export function readBlockOpen(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(BLOCK_PREFIX + key)
    return stored !== null ? stored === '1' : fallback
  } catch {
    return fallback
  }
}

export function writeBlockOpen(key: string, open: boolean): void {
  try {
    localStorage.setItem(BLOCK_PREFIX + key, open ? '1' : '0')
  } catch {
    // A remembered fold is a convenience, not a requirement.
  }
}

/**
 * C3 — the section heading lives ABOVE the card, not inside it.
 *
 * Burying a 13px uppercase label inside the card made every block look the
 * same weight, so the page had no scannable structure. The heading now sits
 * outside at the `section` scale, with generous space above it and tight space
 * below, so it visually belongs to the card it introduces. The card itself
 * holds content only.
 *
 * With `collapseKey` the heading is also the block's switch (U1 above).
 */
export function Section({
  title,
  action,
  children,
  className = '',
  padded = true,
  /** Suppress the top margin when the section opens a column. */
  flush = false,
  /**
   * F5.3 — drop the card, keep the heading.
   *
   * For a section whose CONTENT is already a set of cards. Nesting
   * `surface-raised` rows inside a `surface-raised` card is what made the guard
   * lists read as one grey slab: the rows and their container were the same
   * colour, so the only thing separating two guards was a 1 px line. With the
   * container gone the page shows through between the rows and they read as
   * separate objects — which is what they are.
   */
  bare = false,
  collapseKey,
  defaultOpen = true,
  summary,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  flush?: boolean
  bare?: boolean
  /** U1 — the block TYPE the fold is remembered under (global, persistent). */
  collapseKey?: string
  /** First-ever state, before the product owner has touched the block. */
  defaultOpen?: boolean
  /** One line shown beside the title while the block is folded. */
  summary?: ReactNode
}) {
  const [open, setOpen] = useState<boolean>(() =>
    collapseKey ? readBlockOpen(collapseKey, defaultOpen) : true,
  )
  const toggle = () => {
    if (!collapseKey) return
    setOpen((v) => {
      writeBlockOpen(collapseKey, !v)
      return !v
    })
  }
  const foldable = collapseKey !== undefined

  return (
    <section
      className={className}
      data-block={collapseKey}
      data-open={foldable ? (open ? '1' : '0') : undefined}
    >
      {(title || action) && (
        <div
          className={`flex items-center justify-between gap-3 pb-2 ${
            flush ? '' : 'pt-1'
          }`}
        >
          {foldable ? (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              data-testid={`block-${collapseKey}`}
              className="group flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-field text-start
                         transition-colors duration-fast hover:bg-surface-high/70 -ms-1.5 ps-1.5"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-surface-high text-content-secondary
                            transition-transform duration-fast group-hover:text-content-primary ${
                              open ? '' : 'ltr:-rotate-90 rtl:rotate-90'
                            }`}
              >
                <Icon name="chevronDown" size={14} />
              </span>
              {/* The title never gives way; the summary beside it does. */}
              <h2 className="shrink-0 text-section text-content-primary">{title}</h2>
              {!open && summary && (
                <span
                  className="min-w-0 truncate text-caption text-content-muted"
                  data-block-summary=""
                >
                  {summary}
                </span>
              )}
            </button>
          ) : (
            title && <h2 className="text-section text-content-primary">{title}</h2>
          )}
          {action}
        </div>
      )}
      {open &&
        (bare ? (
          children
        ) : (
          <div className={`card ${padded ? 'card-pad' : ''}`}>{children}</div>
        ))}
    </section>
  )
}

/**
 * G7bis.3 → U1 — kept as a name for the older call sites; it is `Section`
 * with a `collapseKey`. `storageKey` used to be a sessionStorage key per
 * screen; it is now the block TYPE and the memory is global.
 */
export function CollapsibleSection({
  storageKey,
  title,
  defaultOpen,
  action,
  children,
  className = '',
  padded = true,
  bare = false,
  summary,
}: {
  storageKey: string
  title: string
  defaultOpen: boolean
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  bare?: boolean
  summary?: ReactNode
}) {
  return (
    <Section
      collapseKey={storageKey}
      title={title}
      defaultOpen={defaultOpen}
      action={action}
      className={className}
      padded={padded}
      bare={bare}
      summary={summary}
    >
      {children}
    </Section>
  )
}

export function EmptyState({
  icon = 'moon',
  title,
  hint,
  action,
}: {
  icon?: IconName
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div
      // PO POINT 5 — the marker `bun run empty` sweeps for. A block with a
      // heading and no content has to carry one of these; the gate cannot ask
      // "is this dignified", but it can ask "is there one here".
      data-empty-state=""
      className="flex animate-fade-in flex-col items-center gap-2 rounded-card border border-dashed
                 border-edge-subtle bg-surface-raised/40 px-6 py-12 text-center"
    >
      <span className="text-content-muted/50">
        <Icon name={icon} size={30} />
      </span>
      <p className="text-caption font-medium text-content-secondary">{title}</p>
      {hint && <p className="muted max-w-xs">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function KeyValue({
  label,
  value,
  ltr = false,
}: {
  label: string
  value: ReactNode
  ltr?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-edge-subtle/60 py-2 last:border-0">
      <dt className="muted shrink-0">{label}</dt>
      <dd
        className={`text-caption font-medium text-content-primary ${
          ltr ? 'ltr-nums' : ''
        } text-end`}
      >
        {value}
      </dd>
    </div>
  )
}

export function Stat({
  label,
  value,
  tone = 'default',
  icon,
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'alert' | 'good' | 'accent'
  icon?: IconName
}) {
  const toneClass = {
    default: 'text-content-primary',
    alert: 'text-status-danger-ink',
    good: 'text-status-success-ink',
    accent: 'text-accent-ink',
  }[tone]

  return (
    <div className="card card-pad flex items-center gap-3">
      {/* W3.1c — the icon alone, bigger and thin: no disc behind it. */}
      {icon && <Icon name={icon} size={26} strokeWidth={1.4} className={`shrink-0 ${toneClass}`} />}
      <div className="min-w-0">
        <p className="muted truncate">{label}</p>
        <p className={`numeric mt-1 text-title ${toneClass}`}>{value}</p>
      </div>
    </div>
  )
}

/**
 * G14d — A KPI CARD THAT *IS* THE FILTER. The number cards above the big
 * rosters used to be decoration repeating what pills below them already did;
 * now the card is the control: click filters the list, the active card takes
 * the accent ring, and the redundant pills are gone. Shared by volunteers,
 * drivers and farms so the three screens stay one gesture.
 */
export function KpiFilter({
  label,
  value,
  icon,
  dot,
  hint,
  tone = 'default',
  active,
  onClick,
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'alert' | 'good' | 'accent'
  icon?: IconName
  /** Status dot shown before the label (the farm cards). */
  dot?: ReactNode
  /** Small second line under the label — e.g. the status's dunam total. */
  hint?: ReactNode
  active: boolean
  onClick: () => void
}) {
  const toneClass = {
    default: 'text-content-primary',
    alert: 'text-status-danger-ink',
    good: 'text-status-success-ink',
    accent: 'text-accent-ink',
  }[tone]

  /** X7.3 — the same wash as `KpiChip`; see the note there. */
  const wash = {
    default: 'kpi-tone-default',
    alert: 'kpi-tone-alert',
    good: 'kpi-tone-good',
    accent: 'kpi-tone-accent',
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`card-interactive flex min-w-0 items-center gap-2.5 p-3 text-start ${wash} ${
        active ? 'ring-2 ring-accent' : ''
      }`}
    >
      {icon && (
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-surface-raised/80 ${toneClass}`}
        >
          <Icon name={icon} size={24} strokeWidth={1.4} />
        </span>
      )}
      <span className="min-w-0">
        <span className={`numeric block text-title ${toneClass}`}>{value}</span>
        <span className="muted flex items-center gap-1.5 truncate leading-tight">
          {dot}
          {label}
        </span>
        {hint && (
          <span className="block truncate text-micro leading-tight text-content-muted/80">
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * U2 (2026-09-02) — THE COMPACT KPI-FILTER, for the one swipable row above a
 * list. Same contract as `KpiFilter` (the card IS the filter), a quarter of
 * the height: figure and label on one line, the hint under the label, 44 px
 * tall so a thumb can hit it on a moving vehicle.
 */
export function KpiChip({
  label,
  value,
  icon,
  dot,
  hint,
  tone = 'default',
  active,
  onClick,
  testId,
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'alert' | 'good' | 'accent'
  icon?: IconName
  dot?: ReactNode
  hint?: ReactNode
  active: boolean
  onClick: () => void
  testId?: string
}) {
  const toneClass = {
    default: 'text-content-primary',
    alert: 'text-status-danger-ink',
    good: 'text-status-success-ink',
    accent: 'text-accent-ink',
  }[tone]

  /**
   * ★ X7.3 (2026-09-04) — THE SORT CARDS WEAR THE SHEET'S COLORIMETRY.
   *
   * The band cards on an entity's sheet are the reading the product owner
   * signed off on: a 12 % wash of the tone, the icon on a raised disc in the
   * tone's ink, the figure in the page's own ink. These chips were a flat
   * `--surface-raised` with a coloured glyph, so the same "good" green meant
   * one thing on a farm's sheet and another above a roster. `.kpi-tone-*`
   * (index.css) is that recipe at chip scale.
   */
  const wash = {
    default: 'kpi-tone-default',
    alert: 'kpi-tone-alert',
    good: 'kpi-tone-good',
    accent: 'kpi-tone-accent',
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`tile-interactive flex min-h-11 items-center gap-2 px-3 py-1 text-start ${wash} ${
        active ? 'ring-2 ring-accent' : ''
      }`}
    >
      {dot}
      {icon && (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-surface-raised/80 ${toneClass}`}
        >
          <Icon name={icon} size={16} />
        </span>
      )}
      <span className={`numeric text-heading font-bold leading-none ${toneClass}`}>
        {value}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="whitespace-nowrap text-caption text-content-secondary">
          {label}
        </span>
        {hint && (
          <span className="whitespace-nowrap text-micro text-content-muted/80">
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * U2 → X1 (2026-09-04) — THE STICKY TOP OF EVERY LIST, ONE GABARIT, NO
 * EXCEPTIONS.
 *
 * ★ THE TITLE HAS ONE SIZE IN THE WHOLE APP, AND IT IS THE DASHBOARD'S.
 *   "לוח בקרה" was `text-title` (24 px) and "חוות" / "מתנדבים" were
 *   `text-heading` (18 px), because the rosters' top was written to be
 *   compact and the dashboard's was not. The product owner reads that as two
 *   different applications, and he is right: the size of a page's name is not
 *   a place to save four pixels. `PageHeader`, `ListTop` and the dashboard's
 *   own header all render `text-title` now, and nothing scales it down by
 *   content.
 *
 * ★ THE COUNTER LEFT THE TITLE LINE. "20 מתוך 20" was a muted span baselined
 *   with the title, which made the title look like a sentence and cost the
 *   search box its room. It is a small discreet pill at the head of the
 *   FILTER row now, aligned with the KPI chips it qualifies — beside the
 *   numbers it is about, not beside the name of the screen.
 *
 * ★ THE ROW IS ALWAYS [title] [search] [⋯]. One line, the same three things
 *   in the same three places on every list; whatever the screen can do lives
 *   in the "⋯" (see `OverflowMenu`), so the line never changes width class
 *   from one roster to the next.
 *
 * `-mx-4 px-4` / `lg:-mx-5 lg:px-5` — the block paints out to the panel's
 * own padding so the rows never show at the sides while it is pinned.
 */
export function ListTop({
  title,
  count,
  actions,
  menu,
  search,
  onSearch,
  searchPlaceholder,
  kpis,
  filters,
  children,
  testId,
}: {
  title: ReactNode
  /** X1 — the "n of m" pill, rendered at the head of the KPI row. */
  count?: ReactNode
  /** Rare inline control that must stay visible; prefer `menu`. */
  actions?: ReactNode
  /** X2 — the screen's own actions, folded into the "⋯". */
  menu?: ReactNode
  search?: string
  onSearch?: (v: string) => void
  searchPlaceholder?: string
  /** The KPI chips — rendered in the swipable row. */
  kpis?: ReactNode
  /** The filter pills row (a `FilterRow`), below the KPIs. */
  filters?: ReactNode
  /** Column headers, closing the block. */
  children?: ReactNode
  testId?: string
}) {
  return (
    <div
      data-list-top=""
      data-testid={testId}
      className="sticky z-20 -mx-4 mb-2 bg-surface-base/95 px-4 pb-1 backdrop-blur lg:-mx-5 lg:px-5"
      style={{ top: 'var(--shell-top, 0px)' }}
    >
      {/* X1.3 — [title] [search] [⋯], one line, every list. `flex-wrap` is
          the 390 px escape hatch: the search box drops to its own line rather
          than squeezing the title to three characters or widening the page. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pb-2">
        <h1
          data-page-title=""
          className="min-w-0 flex-1 truncate text-title text-content-primary"
        >
          {title}
        </h1>
        {onSearch && (
          <div className="relative order-last w-full shrink-0 sm:order-none sm:w-52 lg:w-60">
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-content-muted">
              <Icon name="search" size={15} />
            </span>
            <input
              type="search"
              className="input min-h-11 py-1.5 ps-8"
              value={search ?? ''}
              placeholder={searchPlaceholder}
              onChange={(e) => onSearch(e.target.value)}
              data-testid="list-search"
            />
          </div>
        )}
        {actions}
        {menu}
      </div>
      {(count || kpis) && (
        <div className="flex items-stretch gap-2">
          {count && (
            <span
              data-list-count=""
              className="numeric flex shrink-0 items-center self-center whitespace-nowrap rounded-pill
                         bg-surface-high px-2.5 py-1 text-micro text-content-muted"
            >
              {count}
            </span>
          )}
          {kpis && (
            <div className="scroll-row min-w-0 flex-1" data-testid="kpi-strip">
              {kpis}
            </div>
          )}
        </div>
      )}
      {filters && <div className="mt-1.5">{filters}</div>}
      {children}
    </div>
  )
}

/** List row that navigates. Chevron follows the writing direction. */
export function RowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-field px-3 py-3 transition-colors duration-fast ease-out hover:bg-surface-high"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <span className="shrink-0 text-content-muted/60">
        <ChevronForward />
      </span>
    </Link>
  )
}

// --- Filter bar (R3) -------------------------------------------------------

/**
 * The single horizontal filter bar used above every list screen — farms,
 * volunteers, missions, incidents. Replaces the Lot 0 side panels so the
 * content gets the full width, and so the four screens behave identically.
 */
export function FilterBar({
  search,
  onSearch,
  searchPlaceholder,
  children,
  trailing,
}: {
  search?: string
  onSearch?: (v: string) => void
  searchPlaceholder?: string
  /** Filter pill groups. */
  children?: ReactNode
  /** Right-aligned actions (create, import, view toggle…). */
  trailing?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card bg-surface-raised/70 p-2.5 shadow-card backdrop-blur">
      {onSearch && (
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-content-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            className="input py-2 ps-9"
            value={search ?? ''}
            placeholder={searchPlaceholder}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      )}
      <div className="scroll-x flex min-w-0 flex-1 items-center gap-2 py-0.5">
        {children}
      </div>
      {trailing && (
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      )}
    </div>
  )
}

/**
 * A single toggleable pill inside a FilterRow.
 *
 * D7.3 — the count is part of the pill, not a separate legend. "פעילה 4" tells
 * the coordinator both what the filter is and whether pressing it is worth the
 * tap; a pill that reveals an empty list on click is a wasted interaction.
 */
export function FilterPill({
  active,
  onClick,
  children,
  dot,
  count,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  dot?: ReactNode
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`filter-pill ${active ? 'filter-pill-active' : ''}`}
    >
      {dot}
      {children}
      {count !== undefined && <span className="filter-count">{count}</span>}
    </button>
  )
}

/**
 * D7.3 — ONE discreet filter row, shared by every list screen.
 *
 * Replaces the per-screen ad-hoc pill rows, which had drifted into different
 * heights, different spacings and — on the incident log — a twelve-pill farm
 * selector that was longer than the list it filtered.
 *
 * The clear button appears only when something is actually filtered. A
 * permanently visible "clear" implies there is always something to clear, and
 * costs a tap target on a 390 px row for no reason.
 */
export function FilterRow({
  children,
  active,
  onClear,
  trailing,
  nowrap = false,
}: {
  children: ReactNode
  /** True when at least one filter is on. */
  active: boolean
  onClear: () => void
  trailing?: ReactNode
  /** U2 — one swipable line instead of a wrapping block. */
  nowrap?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      className={`items-center gap-1.5 ${
        nowrap ? 'scroll-row mb-2' : 'mb-4 flex flex-wrap'
      }`}
    >
      {children}
      {active && (
        <button
          type="button"
          onClick={onClear}
          className="filter-pill border-edge-strong text-content-primary hover:border-status-danger"
        >
          <Icon name="close" size={11} />
          {t('common.clear')}
        </button>
      )}
      {trailing && (
        <div className="ms-auto flex items-center gap-1.5">{trailing}</div>
      )}
    </div>
  )
}

/**
 * F5.5 — the foot of a progressively-rendered list.
 *
 * Prints the count BEFORE the button, because "מוצגים 20 מתוך 137" is the
 * information; the button is only useful once you know that. Renders nothing at
 * all when everything is on screen — a permanent "show more" that does nothing
 * teaches people to ignore it.
 */
export function LoadMore({
  shown,
  total,
  onMore,
}: {
  shown: number
  total: number
  onMore: () => void
}) {
  const { t } = useTranslation()
  if (shown >= total) return null
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="numeric text-micro text-content-muted">
        {t('common.showingOf', { shown, total })}
      </span>
      <button type="button" onClick={onMore} className="btn-secondary py-1.5 text-micro">
        <Icon name="chevronDown" size={14} />
        {t('common.showMore')}
      </button>
    </div>
  )
}

// --- Interaction -----------------------------------------------------------

export function CopyButton({
  value,
  label,
  className = 'btn-secondary',
}: {
  value: string
  label?: string
  className?: string
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard API is unavailable over plain http on some devices; the
      // textarea beside this button stays selectable as a fallback.
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button type="button" onClick={copy} className={className}>
      <Icon name={copied ? 'check' : 'copy'} size={15} />
      {copied ? t('common.copied') : (label ?? t('common.copy'))}
    </button>
  )
}

export function Toggle({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex rounded-field border border-edge-subtle bg-surface-field p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-field px-3 py-1.5 text-caption font-medium transition-all duration-fast ease-out ${
            o.value === value
              ? 'bg-accent text-content-on-accent'
              : 'text-content-muted hover:text-content-primary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-content-muted">
        <Icon name="search" size={17} />
      </span>
      <input
        type="search"
        className="input ps-10"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="muted shrink-0">{label}</span>
      <select
        className="input py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    // `data-overlay` — PO POINT 2. A modal's whole job is to cover the shell,
    // so the layout sweep's "no pinned element covers another" rule has to be
    // told this one is deliberate. The attribute says so on the element rather
    // than in a class list the gate would have to pattern-match.
    <div
      data-overlay=""
      className="fixed inset-0 z-50 flex items-end justify-center bg-surface-sunken/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // P0bis.3 — `panel-scope`: a modal's form lays itself out against the
        // DIALOG's width, not the window's. A `md:grid-cols-2` inside a 32 rem
        // dialog gave two 15 rem columns on any desktop, which is the reading
        // the breakpoint existed to prevent.
        className={`panel-scope max-h-[90dvh] w-full animate-fade-in overflow-y-auto rounded-t-card
                    bg-surface-overlay p-5 shadow-lift sm:rounded-card ${
                      wide ? 'max-w-3xl' : 'max-w-lg'
                    }`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-heading text-content-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-field p-1.5 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
            aria-label={t('common.close')}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Inline banner for alerts, mismatches and emphasis. */
export function Callout({
  tone = 'warn',
  icon = 'alert',
  title,
  children,
}: {
  tone?: 'warn' | 'danger' | 'info' | 'success'
  icon?: IconName
  title: string
  children?: ReactNode
}) {
  /* G17: a callout is marked by its 4 px inline-start bar plus a tint — the
     same language as .card-critical — not by a full contour. */
  const tones = {
    warn: 'border-s-status-warn bg-status-warn/10 text-status-warn-ink',
    danger: 'border-s-status-danger bg-status-danger/10 text-status-danger-ink',
    info: 'border-s-status-info bg-status-info/10 text-status-info-ink',
    success: 'border-s-status-success bg-status-success/10 text-status-success-ink',
  }
  return (
    <div className={`rounded-card border-s-4 p-4 ${tones[tone]}`}>
      <p className="flex items-center gap-2 text-caption font-semibold">
        <Icon name={icon} size={16} />
        {title}
      </p>
      {children && (
        <div className="mt-1.5 text-caption text-content-secondary">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * ORDRE DE NUIT 2026-09-02 (N1) — what a detail screen shows while the real
 * app's snapshot has not arrived yet. See `useHydrated`: before it, five
 * screens answered that first empty frame with a redirect to their list.
 */
export function LoadingState() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      data-testid="loading-state"
      className="flex animate-fade-in flex-col items-center gap-3 px-6 py-16 text-center"
    >
      <Skeleton className="h-2 w-40" />
      <p className="muted">{t('data.loading')}</p>
    </div>
  )
}

/** Skeleton block used while a lazy chunk (the map) is still arriving. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton rounded-card ${className}`} aria-hidden="true" />
  )
}
