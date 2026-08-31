import { useState } from 'react'
import type { ReactNode } from 'react'

import { Icon } from './Icon'

/**
 * Form field primitives shared by every create/edit flow (R5).
 *
 * Each renders its own label, error slot and hint so a form is a list of
 * fields rather than a pile of divs, and so validation styling can never
 * drift between the farm form and the volunteer form.
 */

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className = '',
}: {
  label: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">
        {label}
        {required && <span className="text-status-danger-ink"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-micro text-status-danger-ink">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-micro text-content-muted">{hint}</span>
      )}
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  placeholder,
  type = 'text',
  ltr = false,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  required?: boolean
  placeholder?: string
  type?: 'text' | 'tel' | 'number' | 'email'
  ltr?: boolean
  className?: string
}) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      <input
        type={type}
        className={`input ${error ? 'border-status-danger' : ''} ${ltr ? 'ltr-nums text-start' : ''}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

/**
 * G2.3 — locality type-ahead over the gazetteer.
 *
 * Free text is TOLERATED on purpose: the gazetteer covers the towns the
 * fixtures know, and a roster will always contain one it does not. The field
 * therefore never blocks — it only makes the known spelling one keystroke
 * cheaper than a new one, which is the entire defence against six spellings of
 * the same town (the same reasoning as SelectOrCreateField, inverted: typing
 * is the primary mode and the list assists it).
 */
export function AutocompleteField({
  label,
  value,
  onChange,
  options,
  error,
  hint,
  required,
  placeholder,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  error?: string
  hint?: string
  required?: boolean
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const query = value.trim()
  const matches = (
    query === '' ? options : options.filter((o) => o.includes(query))
  ).slice(0, 8)
  // Exactly the typed value is not a suggestion, it is the state we are in.
  const suggestions = matches.filter((m) => m !== query)
  const showList = open && suggestions.length > 0

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={`relative ${className}`}
    >
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        className={`input ${error ? 'border-status-danger' : ''}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        // Delayed so a click on a suggestion wins over the blur that closes it.
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!showList) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(suggestions[Math.min(highlight, suggestions.length - 1)])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {showList && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-field border border-edge-subtle bg-surface-overlay shadow-card"
        >
          {suggestions.map((o, i) => (
            <li key={o} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`block w-full px-3.5 py-2 text-start text-caption transition-colors duration-fast ${
                  i === highlight
                    ? 'bg-accent/10 text-content-primary'
                    : 'text-content-secondary hover:bg-surface-high'
                }`}
                onMouseEnter={() => setHighlight(i)}
                // Mousedown, not click: it fires before the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(o)
                }}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  hint,
  error,
  required,
  placeholder,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  hint?: string
  error?: string
  required?: boolean
  placeholder?: string
  className?: string
}) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      <textarea
        className={`input ${error ? 'border-status-danger' : ''}`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

/**
 * F1 — A SELECT IS NEVER A DEAD END.
 *
 * The rule this component enforces, and the bug that produced it: a required
 * "anchor point" select rendered EMPTY for a farm that had none, so the step
 * could not be completed and nothing on the screen said how to fix it. An empty
 * `<select>` is the worst possible affordance — it looks like a control that
 * has not loaded yet, so the user waits.
 *
 * `emptyAction` is therefore not a nicety: when there is nothing to choose, the
 * select is REPLACED by the way to create something. Every required select in
 * the app either has an enum for options (which cannot be empty) or passes one.
 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  required,
  className = '',
  emptyAction,
  emptyLabel,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  hint?: string
  error?: string
  required?: boolean
  className?: string
  /** Rendered INSTEAD of the select when there is nothing to choose from. */
  emptyAction?: ReactNode
  emptyLabel?: string
}) {
  if (options.length === 0 && emptyAction) {
    return (
      <Field
        label={label}
        error={error}
        hint={hint}
        required={required}
        className={className}
      >
        <div className="flex flex-col items-start gap-2 rounded-field border border-dashed border-edge-strong px-3.5 py-3">
          {emptyLabel && (
            <p className="text-caption text-content-secondary">{emptyLabel}</p>
          )}
          {emptyAction}
        </div>
      </Field>
    )
  }

  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      <select
        className={`input ${error ? 'border-status-danger' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

/**
 * F1 — the other half of the rule: a list that is CORRECT but incomplete.
 *
 * The yeshiva field offers the yeshivot already in the roster, which is right
 * almost always and useless the first time a volunteer arrives from a new one —
 * and on an empty database it offers nothing at all. Rather than choosing
 * between a free-text field (which fragments the data into six spellings of the
 * same yeshiva) and a closed list (which cannot accept the seventh), this is
 * both: pick a known value, or switch to typing and add one.
 *
 * It opens in TYPING mode when the list is empty, so the first-run case needs no
 * extra click.
 */
export function SelectOrCreateField({
  label,
  value,
  options,
  onChange,
  createLabel,
  backLabel,
  hint,
  error,
  required,
  className = '',
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  createLabel: string
  backLabel: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
}) {
  const [typing, setTyping] = useState(
    options.length === 0 || (value !== '' && !options.includes(value)),
  )

  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      {typing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            className={`input ${error ? 'border-status-danger' : ''}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {options.length > 0 && (
            <button
              type="button"
              className="btn-ghost shrink-0 py-1.5 text-micro"
              onClick={() => {
                setTyping(false)
                onChange(options[0])
              }}
            >
              {backLabel}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select
            className={`input ${error ? 'border-status-danger' : ''}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-ghost shrink-0 py-1.5 text-micro"
            onClick={() => {
              setTyping(true)
              onChange('')
            }}
          >
            {createLabel}
          </button>
        </div>
      )}
    </Field>
  )
}

/**
 * Two-column form section — and P0bis.3: the two columns appear when THIS
 * SECTION is wide enough, not when the viewport is. The forms now live in a
 * panel whose width the coordinator drags (P0bis.2) and in modals capped at
 * 32 rem, so a `md:` breakpoint was answering a question about the window
 * that nothing on screen was asking. Children that must take the whole row
 * say `col-span-full`, which is inert in the one-column reading.
 */
/**
 * ★ PO POINT 6 ASKED FOR A COLLAPSIBLE SECTION, AND A30 INSISTED.
 *
 *   The livestock rows and the signature pads made the farm form **6.1
 *   screenfuls at 390 px** — over A30's cap of six, caught by `bun run layout`
 *   the first time it ran after both landed. A page that long on a phone is a
 *   page whose foot nobody reaches, which is what the cap is for.
 *
 * ★ AND COLLAPSED IS NOT HIDDEN, WHICH IS THE WHOLE OF THE DESIGN. A closed
 *   section carries its own SUMMARY in the heading — the head count, the number
 *   of contacts — so the fact is still on screen and only the editing is folded
 *   away. A collapsible section that says nothing when closed is a section the
 *   coordinator opens every time to check whether it was empty.
 *
 * `sessionStorage`, like `CollapsibleSection`: reopening the same farm mid-shift
 * keeps his arrangement without persisting a stale layout into next month.
 */
export function FormSection({
  title,
  children,
  action,
  storageKey,
  defaultOpen = true,
  summary,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
  /** Present = collapsible. Absent = the plain section it has always been. */
  storageKey?: string
  defaultOpen?: boolean
  /** Shown in the heading while CLOSED — the fact, without the editing. */
  summary?: ReactNode
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (!storageKey) return true
    try {
      const stored = sessionStorage.getItem(storageKey)
      return stored !== null ? stored === '1' : defaultOpen
    } catch {
      return defaultOpen
    }
  })

  const toggle = () =>
    setOpen((v) => {
      try {
        sessionStorage.setItem(storageKey ?? '', v ? '0' : '1')
      } catch {
        // Private browsing: the section still opens, it just does not remember.
      }
      return !v
    })

  return (
    <section className="panel-scope card card-pad">
      <div className="mb-4 flex items-center justify-between gap-3">
        {storageKey ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            data-testid={`section-${storageKey}`}
            className="group flex min-w-0 flex-1 items-center gap-1.5 text-start"
          >
            <span
              className={`text-content-muted transition-transform duration-fast group-hover:text-content-primary ${
                open ? '' : 'ltr:-rotate-90 rtl:rotate-90'
              }`}
            >
              <Icon name="chevronDown" size={16} />
            </span>
            <h2 className="section-title">{title}</h2>
            {!open && summary}
          </button>
        ) : (
          <h2 className="section-title">{title}</h2>
        )}
        {(!storageKey || open) && action}
      </div>
      {(!storageKey || open) && <div className="form-grid">{children}</div>}
    </section>
  )
}

/** Sticky action bar at the foot of a form. */
export function FormActions({
  onCancel,
  cancelLabel,
  submitLabel,
  disabled,
  onSubmit,
}: {
  onCancel: () => void
  cancelLabel: string
  submitLabel: string
  disabled?: boolean
  onSubmit: () => void
}) {
  return (
    // `bottom-[--shell-bottom]` clears the sticky demo toolbar. At plain
    // `bottom-0` the submit button sat underneath it at every viewport.
    <div className="sticky bottom-[var(--shell-bottom)] -mx-4 mt-2 flex justify-end gap-2 border-t border-edge-subtle bg-surface-base/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <button type="button" className="btn-secondary" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button
        type="button"
        className="btn-primary"
        disabled={disabled}
        onClick={onSubmit}
      >
        {submitLabel}
      </button>
    </div>
  )
}

/** Shared phone validation: Israeli 0XX-XXXXXXX, punctuation-tolerant. */
export function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  return /^0\d{8,9}$/.test(digits)
}
