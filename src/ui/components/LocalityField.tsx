import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  LOCALITY_COUNT,
  LOCALITY_KIND_LABEL,
  nearestLocalities,
  normalizeLocality,
  rankLocalities,
} from '@core/index'
import type { LatLng, Locality } from '@core/index'

import { Field } from './fields'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AM1 (2026-09-16) — LE CHAMP « יישוב », ET CE QU'IL MONTRE AVANT LA FRAPPE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO touchait le champ et voyait huit lignes : אבו גוש, אבו סנאן, אבטין…
 * toujours les mêmes, parce que la liste rendait les huit premières de
 * l'alphabet et s'arrêtait là. Il a conclu, à juste titre au vu de l'écran,
 * que la liste « ne contenait que huit entrées ».
 *
 * ★ À CHAMP VIDE, PLUS D'ALPHABET. Une épingle posée → les localités les plus
 *   PROCHES, avec leur distance, parce que c'est la seule liste courte qui ait
 *   un sens. Pas d'épingle → une ligne qui DIT combien le pays en compte et
 *   qu'il suffit de taper.
 * ★ EN TAPANT, TRENTE propositions qui défilent, tolérantes aux fautes, sur le
 *   nom, les autres graphies (למ״ס, classeur de prospection) et le nom latin.
 * ★ LE TEXTE LIBRE RESTE PERMIS (G2.3) : un nom absent de la liste n'est pas
 *   refusé, et le champ n'est pas obligatoire (AM1.2).
 */
export function LocalityField({
  label,
  value,
  onChange,
  onPick,
  near,
  hint,
  error,
  testId,
  required,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  /** Une ligne de la liste a été choisie (et non tapée). */
  onPick?: (locality: Locality) => void
  /** L'épingle, quand il y en a une : la liste à champ vide part d'elle. */
  near?: LatLng | null
  hint?: string
  error?: string
  testId?: string
  required?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const query = value.trim()

  const rows = useMemo(() => {
    if (query === '') {
      if (!near) return []
      return nearestLocalities(near, 8).map((n) => ({ locality: n.locality, km: n.km }))
    }
    return rankLocalities(query).map((l) => ({ locality: l, km: null as number | null }))
  }, [query, near])

  const exact = rows.length > 0 && normalizeLocality(rows[0].locality.name) === normalizeLocality(query)
  const list = exact && rows.length === 1 ? [] : rows
  const showList = open && list.length > 0
  const showCount = open && query === '' && !near

  const pick = (l: Locality) => {
    onChange(l.name)
    onPick?.(l)
    setOpen(false)
  }

  return (
    <Field label={label} error={error} hint={hint} required={required} className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        data-kind="text"
        data-testid={testId}
        autoComplete="off"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-invalid={error ? true : undefined}
        className={`input ${error ? 'border-status-danger' : ''}`}
        value={value}
        placeholder={t('locality.placeholder', { count: LOCALITY_COUNT })}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!showList) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(h + 1, list.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(list[Math.min(highlight, list.length - 1)].locality)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {showCount && (
        <p
          className="absolute inset-x-0 top-full z-20 mt-1 rounded-field border border-edge-subtle bg-surface-overlay px-3.5 py-2.5 text-caption text-content-secondary shadow-card"
          data-testid="locality-count"
        >
          {t('locality.typeToSearch', { count: LOCALITY_COUNT })}
        </p>
      )}
      {showList && (
        <ul
          role="listbox"
          data-testid="locality-list"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-field border border-edge-subtle bg-surface-overlay shadow-card"
        >
          {query === '' && near && (
            <li className="px-3.5 pb-1 pt-2 text-micro font-semibold text-content-muted" aria-hidden="true">
              {t('locality.nearPin')}
            </li>
          )}
          {list.map(({ locality, km }, i) => (
            <li key={`${locality.name}-${locality.code ?? i}`} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                data-testid="locality-option"
                className={`flex min-h-[2.75rem] w-full items-center justify-between gap-3 px-3.5 py-2 text-start text-body transition-colors duration-fast ${
                  i === highlight
                    ? 'bg-accent/10 text-content-primary'
                    : 'text-content-secondary hover:bg-surface-high'
                }`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(locality)
                }}
              >
                <span className="min-w-0 truncate">{locality.name}</span>
                <span className="shrink-0 text-micro text-content-muted">
                  {km !== null ? (
                    <span className="ltr-nums">{t('locality.km', { km: km.toFixed(1) })}</span>
                  ) : (
                    LOCALITY_KIND_LABEL[locality.kind]
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  )
}
