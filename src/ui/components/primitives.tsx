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
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-night-950 sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Section({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card card-pad ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
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
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-sand-300 bg-sand-50/60 px-6 py-10 text-center">
      <span className="text-night-950/25">
        <Icon name={icon} size={28} />
      </span>
      <p className="text-sm font-medium text-night-950/70">{title}</p>
      {hint && <p className="muted max-w-xs">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
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
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="muted shrink-0">{label}</dt>
      <dd
        className={`text-sm font-medium text-night-950 ${
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
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'alert' | 'good'
}) {
  const toneClass =
    tone === 'alert'
      ? 'text-rose-700'
      : tone === 'good'
        ? 'text-emerald-700'
        : 'text-night-900'
  return (
    <div className="card card-pad">
      <p className="muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  )
}

/** List row that navigates. Chevron follows the writing direction. */
export function RowLink({
  to,
  children,
}: {
  to: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-sand-100"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <span className="shrink-0 text-night-950/30">
        <ChevronForward />
      </span>
    </Link>
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
      // textarea below stays selectable so the text can still be copied.
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button type="button" onClick={copy} className={className}>
      <Icon name={copied ? 'check' : 'copy'} size={16} />
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
    <div className="inline-flex rounded-xl border border-sand-300 bg-white p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            o.value === value
              ? 'bg-night-800 text-white'
              : 'text-night-950/60 hover:text-night-900'
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
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-night-950/35">
        <Icon name="search" size={18} />
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
}: {
  title: string
  onClose: () => void
  children: ReactNode
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/40 p-0 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-lift sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-night-950/50 hover:bg-sand-100"
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

/** Small inline banner used for alerts and mismatch warnings. */
export function Callout({
  tone = 'warn',
  icon = 'alert',
  title,
  children,
}: {
  tone?: 'warn' | 'danger' | 'info'
  icon?: IconName
  title: string
  children?: ReactNode
}) {
  const tones = {
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    danger: 'border-rose-300 bg-rose-50 text-rose-900',
    info: 'border-sky-300 bg-sky-50 text-sky-900',
  }
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon name={icon} size={17} />
        {title}
      </p>
      {children && <div className="mt-1.5 text-sm">{children}</div>}
    </div>
  )
}
