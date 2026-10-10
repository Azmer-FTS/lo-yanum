import type { ReactNode } from 'react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AX5 · AX6 (2026-10-10) — UN TABLEAU, ET IL SE LIT DE DROITE À GAUCHE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « 1, 2, 3, comme des tableaux. » Une ligne = un objet, une colonne = une
 * même information, à la même place sur chaque ligne. On ne la cherche plus
 * en haut, en bas, à droite : on la lit.
 *
 *  - **UNE LIGNE RESTE UNE LIGNE** : chaque cellule est sur une ligne
 *    (`whitespace-nowrap` + troncature, le texte entier en infobulle).
 *  - **LES COLONNES CÈDENT, PAS LES LIGNES** : quand la place manque, ce sont
 *    les colonnes secondaires qui disparaissent (`minWidth`, mesurée sur le
 *    tableau lui-même — un panneau à côté d'une carte n'a pas la largeur de
 *    la fenêtre) ; jamais une cellule qui passe à la ligne.
 *  - **LE TRI SE FAIT PAR LES COLONNES** : toucher un en-tête trie, le
 *    retoucher inverse ; `aria-sort` le dit au lecteur d'écran.
 *  - **OUVRIR UNE LIGNE SE VOIT** : la ligne entière se touche, et sa
 *    dernière cellule le DIT (« פרטים », chevron). Ce qui s'ouvre se déplie
 *    sous la ligne, dans le tableau : on ne quitte pas la liste.
 */
export interface Column<T> {
  key: string
  label: string
  /** La valeur de tri ; absente = colonne non triable. */
  sort?: (row: T) => string | number | null
  /** `width` = la largeur du tableau : une cellule peut choisir sa forme. */
  render: (row: T, ctx: { width: number }) => ReactNode
  /** Largeur du TABLEAU (px) à partir de laquelle la colonne est montrée. */
  minWidth?: number
  /** Classes de la cellule (largeur, alignement). */
  className?: string
  /** Une cellule qui porte ses propres contrôles : son toucher n'ouvre pas la ligne. */
  interactive?: boolean
  /** Le texte entier, en infobulle, quand la cellule est tronquée. */
  title?: (row: T) => string | undefined
}

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

export function readSortState(storageKey: string, fallback: SortState): SortState {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw && raw.startsWith('{')) {
      const v = JSON.parse(raw) as SortState
      if (v && typeof v.key === 'string' && (v.dir === 'asc' || v.dir === 'desc')) return v
    }
  } catch {
    /* stockage indisponible */
  }
  return fallback
}

export function sortRows<T>(rows: readonly T[], columns: readonly Column<T>[], sort: SortState): T[] {
  const col = columns.find((c) => c.key === sort.key)
  if (!col?.sort) return [...rows]
  const get = col.sort
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows]
    .map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      // Les vides en dernier, quel que soit le sens.
      const ea = a.v === null || a.v === ''
      const eb = b.v === null || b.v === ''
      if (ea !== eb) return ea ? 1 : -1
      if (ea && eb) return a.i - b.i
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'he', { numeric: true })
      return c !== 0 ? c * sign : a.i - b.i
    })
    .map((x) => x.r)
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  sort,
  onSort,
  onOpen,
  openKey,
  renderOpen,
  openLabel,
  rowAttrs,
  empty,
  testId,
  label,
}: {
  rows: readonly T[]
  columns: readonly Column<T>[]
  rowKey: (row: T) => string
  sort: SortState
  onSort: (s: SortState) => void
  /** Toucher une ligne. Absent = lignes inertes. */
  onOpen?: (row: T) => void
  /** La ligne ouverte (dépliée sous elle-même). */
  openKey?: string | null
  renderOpen?: (row: T) => ReactNode
  /** Le mot de la dernière colonne (« פרטים »). */
  openLabel?: string
  rowAttrs?: (row: T) => Record<string, string | undefined>
  empty?: ReactNode
  testId?: string
  label: string
}) {
  const { t } = useTranslation()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState<number>(0)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const shown = columns.filter((c) => !c.minWidth || width === 0 || width >= c.minWidth)
  const span = shown.length + (onOpen ? 1 : 0)

  // La ligne ouverte se rend visible (ouverte depuis la carte, par exemple).
  useEffect(() => {
    if (!openKey) return
    requestAnimationFrame(() => wrapRef.current?.querySelector(`[data-row-key="${CSS.escape(openKey)}"]`)?.scrollIntoView({ block: 'nearest' }))
  }, [openKey])

  return (
    <div ref={wrapRef} className="w-full" data-testid={testId} data-table-width={Math.round(width)} data-columns={shown.map((c) => c.key).join(',')}>
      <table className="w-full table-fixed border-separate border-spacing-0 text-caption" aria-label={label}>
        <thead>
          <tr>
            {shown.map((c) => {
              const active = sort.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={c.sort ? (active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  className={`border-b border-edge-subtle px-2 py-1.5 text-start align-bottom font-semibold text-content-muted ${c.className ?? ''}`}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort({ key: c.key, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
                      data-testid={testId ? `${testId}-sort-${c.key}` : undefined}
                      data-sort-active={active ? sort.dir : undefined}
                      className={`-mx-1 inline-flex min-h-[2.75rem] max-w-full items-center gap-1 rounded-field px-1 hover:text-content-primary ${active ? 'text-content-primary' : ''}`}
                    >
                      <span className="truncate">{c.label}</span>
                      <Icon name={active ? (sort.dir === 'asc' ? 'sortAsc' : 'sortDesc') : 'sort'} size={14} className={active ? '' : 'opacity-40'} />
                    </button>
                  ) : (
                    <span className="inline-flex min-h-[2.75rem] items-center">{c.label}</span>
                  )}
                </th>
              )
            })}
            {onOpen && (
              <th scope="col" className="w-[5.5rem] border-b border-edge-subtle px-2 py-1.5">
                <span className="sr-only">{openLabel ?? t('table.open')}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={span} className="px-2 py-8 text-center text-content-muted">
                {empty ?? t('table.empty')}
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const k = rowKey(r)
            const isOpen = openKey === k
            return (
              <Fragment key={k}>
                <tr
                  data-row-key={k}
                  data-open={isOpen ? '' : undefined}
                  {...(rowAttrs?.(r) ?? {})}
                  onClick={onOpen ? () => onOpen(r) : undefined}
                  className={`group ${onOpen ? 'cursor-pointer' : ''} ${isOpen ? 'bg-accent/10' : onOpen ? 'hover:bg-surface-high' : ''}`}
                >
                  {shown.map((c) => (
                    <td
                      key={c.key}
                      onClick={c.interactive ? (e) => e.stopPropagation() : undefined}
                      title={c.title?.(r)}
                      /* ⚠️ Une cellule à gestes ne coupe PAS ce qui dépasse : son menu
                         « ⋯ » s'ouvre par-dessus le tableau (vu par atui : coupé, invisible). */
                      className={`relative h-12 whitespace-nowrap border-b border-edge-subtle px-2 py-1 align-middle ${c.interactive ? 'overflow-visible' : 'overflow-hidden text-ellipsis'} ${c.className ?? ''}`}
                    >
                      {c.render(r, { width })}
                    </td>
                  ))}
                  {onOpen && (
                    <td className="h-12 border-b border-edge-subtle px-1 py-1 align-middle">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpen(r)
                        }}
                        aria-expanded={renderOpen ? isOpen : undefined}
                        data-row-open=""
                        data-testid={testId ? `${testId}-open-${k}` : undefined}
                        className={`inline-flex min-h-[2.75rem] w-full items-center justify-center gap-1 rounded-field px-1.5 text-micro font-semibold transition-colors duration-fast ${
                          isOpen ? 'text-accent-ink' : 'text-content-muted group-hover:text-accent-ink'
                        }`}
                      >
                        <span className="truncate">{openLabel ?? t('table.open')}</span>
                        <Icon name="chevronDown" size={14} className={`shrink-0 transition-transform duration-fast ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </td>
                  )}
                </tr>
                {isOpen && renderOpen && (
                  <tr data-row-detail={k}>
                    <td colSpan={span} className="border-b border-edge-subtle bg-accent/5 px-3 py-3">
                      {renderOpen(r)}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
