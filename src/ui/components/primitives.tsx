import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { ChevronForward, Icon } from './Icon'
import type { IconName } from './Icon'

// --- Layout blocks ---------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode
  subtitle?: string
  actions?: ReactNode
  /** Breadcrumb link back to the parent list. */
  back?: { to: string; label: string }
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link
          to={back.to}
          className="mb-2 inline-flex items-center gap-1.5 text-caption text-content-muted
                     transition-colors duration-fast hover:text-content-primary"
        >
          <Icon name="chevron" size={14} className="ltr:-scale-x-100" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title text-content-primary">{title}</h1>
          {subtitle && <p className="muted mt-1">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  )
}

/**
 * C3 — the section heading lives ABOVE the card, not inside it.
 *
 * Burying a 13px uppercase label inside the card made every block look the
 * same weight, so the page had no scannable structure. The heading now sits
 * outside at the `section` scale, with generous space above it and tight space
 * below, so it visually belongs to the card it introduces. The card itself
 * holds content only.
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
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  flush?: boolean
  bare?: boolean
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div
          className={`flex items-end justify-between gap-3 pb-2.5 ${
            flush ? '' : 'pt-1'
          }`}
        >
          {title && (
            <h2 className="text-section text-content-primary">{title}</h2>
          )}
          {action}
        </div>
      )}
      {bare ? (
        children
      ) : (
        <div className={`card ${padded ? 'card-pad' : ''}`}>{children}</div>
      )}
    </section>
  )
}

/**
 * G7bis.3 — a Section whose heading is also its switch.
 *
 * The farm detail's secondary blocks (commitments, agreements, notes, visits)
 * are reference material: consulted sometimes, in the way always — worst on an
 * iPad portrait column where four half-empty cards push the incidents below
 * three screenfuls. Collapsed they cost one line each. The state is remembered
 * PER SESSION (sessionStorage), so reopening the same farm mid-shift keeps the
 * coordinator's arrangement without persisting a stale layout into next month.
 *
 * The chevron sits ON the heading, and the whole heading is the hit area —
 * a 14 px chevron alone is not a target a thumb can be asked to hit (G11).
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
}: {
  /** sessionStorage key; also what makes the memory per-block. */
  storageKey: string
  title: string
  /** First-visit state — callers pass "am I on a wide viewport". */
  defaultOpen: boolean
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  bare?: boolean
}) {
  const [open, setOpen] = useState<boolean>(() => {
    const stored = sessionStorage.getItem(storageKey)
    return stored !== null ? stored === '1' : defaultOpen
  })

  const toggle = () =>
    setOpen((v) => {
      sessionStorage.setItem(storageKey, v ? '0' : '1')
      return !v
    })

  return (
    <section className={className}>
      <div className="flex items-end justify-between gap-3 pb-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="group flex min-w-0 items-center gap-1.5 text-start"
        >
          <span
            className={`text-content-muted transition-transform duration-fast group-hover:text-content-primary ${
              open ? '' : 'ltr:-rotate-90 rtl:rotate-90'
            }`}
          >
            <Icon name="chevronDown" size={15} />
          </span>
          <h2 className="truncate text-section text-content-primary">{title}</h2>
        </button>
        {action}
      </div>
      {open &&
        (bare ? (
          children
        ) : (
          <div className={`card ${padded ? 'card-pad' : ''}`}>{children}</div>
        ))}
    </section>
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
      {icon && (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-surface-high ${toneClass}`}
        >
          <Icon name={icon} size={19} />
        </span>
      )}
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

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`card-interactive flex min-w-0 items-center gap-2.5 p-3 text-start ${
        active ? 'bg-accent/10 ring-2 ring-accent' : ''
      }`}
    >
      {icon && (
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-surface-high ${toneClass}`}
        >
          <Icon name={icon} size={17} />
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
}: {
  children: ReactNode
  /** True when at least one filter is on. */
  active: boolean
  onClear: () => void
  trailing?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-surface-sunken/80 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90dvh] w-full animate-fade-in overflow-y-auto rounded-t-card
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

/** Skeleton block used while a lazy chunk (the map) is still arriving. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton rounded-card ${className}`} aria-hidden="true" />
  )
}
