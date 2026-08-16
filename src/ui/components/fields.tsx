import type { ReactNode } from 'react'

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
  type?: 'text' | 'tel' | 'number'
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

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  required,
  className = '',
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  hint?: string
  error?: string
  required?: boolean
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

/** Two-column responsive form section: stacks below `md`. */
export function FormSection({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="card card-pad">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
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
