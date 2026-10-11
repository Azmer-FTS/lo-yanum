import type { ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Avatar } from './Avatar'
import type { Column, SortState } from './DataTable'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { OverflowMenu } from './OverflowMenu'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AY3 (2026-10-11) — UNE SEULE FORME DE TABLEAU, PARTOUT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Le tableau des fermes est très réussi ; je veux le même partout. » Les
 * cinq listes (fermes, institutions, contacts, volontaires — conducteurs
 * compris depuis AY4) avaient deux formes : la grille « roster » (fermes,
 * volontaires, conducteurs) et le `DataTable` d'AX (contacts, institutions),
 * avec trois places différentes pour les gestes. Elles en ont une :
 *
 *  - **LES MÊMES COLONNES DE STRUCTURE** : la photo et le NOM d'abord (avec
 *    dessous ce qui a perdu sa colonne), puis les colonnes de l'écran, puis
 *    les GESTES, toujours au bout de la ligne.
 *  - **LES MÊMES GESTES** : toucher la ligne = l'APERÇU (panneau latéral en
 *    grand écran, feuille plein écran au téléphone) ; au bout de la ligne,
 *    👁 voir · ✎ modifier, puis ⋯ pour le reste (appeler, archiver…).
 *  - **LE TRI PAR LES EN-TÊTES** (un toucher trie, le second inverse).
 *  - **UNE LIGNE RESTE UNE LIGNE** ; quand la place manque, les colonnes
 *    secondaires cèdent et leur texte passe SOUS le nom (`sub`) : rien ne
 *    disparaît sans aller quelque part (la règle des « roster » de X5).
 *
 * ★★ ET AU TÉLÉPHONE CE N'EST PLUS UN TABLEAU (AY2.2). Sous 35 rem de
 *    largeur, un tableau ne peut montrer que deux colonnes coupées — c'est le
 *    « une moitié hors écran » du PO. La même liste devient des LIGNES À DEUX
 *    ÉTAGES : photo · nom · ce qui le situe, l'état à droite, et UN seul
 *    bouton ⋯ qui rassemble les gestes d'édition (AY2.4 : « un geste de
 *    plus, l'essentiel est que l'écran soit lisible »). Toucher la ligne
 *    ouvre l'aperçu, c'est-à-dire ce que le PO fait le plus au téléphone :
 *    CONSULTER.
 */

export interface EntityColumn<T> extends Column<T> {
  /** Ce que la colonne devient SOUS le nom quand elle n'a pas sa place. */
  sub?: (row: T) => string | null | undefined
}

export interface RowAction {
  key: string
  icon: IconName
  label: string
  onClick?: () => void
  to?: string
  danger?: boolean
  /** Montré en icône au bout de la ligne en grand écran (voir, modifier). */
  inline?: boolean
  testId?: string
}

export interface EntityLead {
  title: string
  photo?: string | null
  /** Carré pour un lieu (ferme, institution), rond pour une personne. */
  shape?: 'circle' | 'square'
  /** Une pastille avant le nom (couleur de statut). */
  dot?: ReactNode
  /** Des marques après le nom (négligée, écart de surface…). */
  marks?: ReactNode
  /** Toujours sous le nom, quelle que soit la largeur. */
  always?: string[]
}

/** Largeur (px) du conteneur sous laquelle la liste passe en lignes à deux étages. */
export const STACK_BELOW = 560
/** La place que le nom garde, toujours (photo + nom lisible). */
const LEAD_MIN_PX = 240

export function EntityTable<T>({
  rows,
  rowKey,
  lead,
  leadLabel,
  leadSort,
  columns,
  sort,
  onSort,
  onPreview,
  activeKey,
  actions,
  phoneEnd,
  rowAttrs,
  rowTone,
  empty,
  testId,
  label,
}: {
  rows: readonly T[]
  rowKey: (row: T) => string
  lead: (row: T) => EntityLead
  /** L'en-tête de la première colonne (« חווה », « שם »…). */
  leadLabel: string
  leadSort?: (row: T) => string | number | null
  columns: readonly EntityColumn<T>[]
  sort: SortState
  onSort: (s: SortState) => void
  /** Toucher la ligne : l'aperçu. */
  onPreview?: (row: T) => void
  /** La ligne dont l'aperçu est ouvert. */
  activeKey?: string | null
  actions?: (row: T) => RowAction[]
  /** Au téléphone, ce qui se lit au bout de la ligne (le statut). */
  phoneEnd?: (row: T) => ReactNode
  rowAttrs?: (row: T) => Record<string, string | undefined>
  /** Une ligne mise en avant (demande entrante). */
  rowTone?: (row: T) => string | undefined
  empty?: ReactNode
  testId?: string
  label: string
}) {
  const { t } = useTranslation()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const stacked = width > 0 && width < STACK_BELOW
  /* ★ LE NOM D'ABORD : il garde toujours ses 15 rem. Les colonnes qui ne
     tiennent pas à côté de lui cèdent, la moins prioritaire (le seuil le plus
     haut) en premier, et passent sous le nom. Mesuré sur la largeur du
     TABLEAU (un panneau à côté d'une carte n'a pas celle de la fenêtre). */
  const inlineCountAll = rows.length > 0 ? (actions?.(rows[0]) ?? []).filter((a) => a.inline).length : 0
  const menuAll = rows.some((r) => (actions?.(r) ?? []).some((a) => !a.inline))
  const actionsPx = (inlineCountAll * 2.5 + (menuAll ? 2.75 : 0) + 0.75) * 16
  const colPx = (c: EntityColumn<T>): number => {
    const m = /w-\[(\d+(?:\.\d+)?)(rem|%)\]/.exec(c.className ?? '')
    if (!m) return 110
    return m[2] === 'rem' ? Number(m[1]) * 16 : (Number(m[1]) / 100) * width
  }
  let shown = columns.filter((c) => !c.minWidth || width === 0 || width >= c.minWidth)
  if (width > 0) {
    const budget = width - LEAD_MIN_PX - actionsPx
    while (shown.length > 0 && shown.reduce((n, c) => n + colPx(c), 0) > budget) {
      const drop = [...shown].sort((a, b) => (b.minWidth ?? 0) - (a.minWidth ?? 0))[0]
      shown = shown.filter((c) => c !== drop)
    }
  }
  const hidden = stacked ? columns : columns.filter((c) => !shown.includes(c))

  const subOf = (r: T): string => {
    const l = lead(r)
    const parts = [...(l.always ?? []), ...hidden.map((c) => c.sub?.(r) ?? '').filter(Boolean)]
    return parts.filter(Boolean).join(' · ')
  }

  const menu = (r: T, all: boolean) => {
    const list = actions?.(r) ?? []
    const rest = all ? list : list.filter((a) => !a.inline)
    if (rest.length === 0) return null
    return (
      <OverflowMenu
        testId={testId ? `${testId}-menu-${rowKey(r)}` : undefined}
        items={rest.map((a) => ({ key: a.key, icon: a.icon, label: a.label, onClick: a.onClick, to: a.to, danger: a.danger, testId: a.testId }))}
      />
    )
  }

  const inlineActions = (r: T) =>
    (actions?.(r) ?? [])
      .filter((a) => a.inline)
      .map((a) =>
        a.to ? (
          <Link
            key={a.key}
            to={a.to}
            onClick={(e) => e.stopPropagation()}
            className="btn-ghost h-10 w-10 min-w-0 justify-center p-0"
            aria-label={a.label}
            title={a.label}
            data-testid={a.testId}
            data-row-action={a.key}
          >
            <Icon name={a.icon} size={17} />
          </Link>
        ) : (
          <button
            key={a.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              a.onClick?.()
            }}
            className="btn-ghost h-10 w-10 min-w-0 justify-center p-0"
            aria-label={a.label}
            title={a.label}
            data-testid={a.testId}
            data-row-action={a.key}
          >
            <Icon name={a.icon} size={17} />
          </button>
        ),
      )

  const leadCell = (r: T, big: boolean) => {
    const l = lead(r)
    const sub = subOf(r)
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        <Avatar photo={l.photo} name={l.title} size={big ? 'sm' : 'xs'} shape={l.shape ?? 'circle'} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            {l.dot}
            <span className="truncate text-caption font-semibold text-content-primary" data-entity-title="">
              {l.title}
            </span>
            {l.marks}
          </span>
          {sub && (
            <span className="muted block truncate text-micro" title={sub} data-entity-sub="">
              {sub}
            </span>
          )}
        </span>
      </span>
    )
  }

  const sortButton = (key: string, text: string, sortable: boolean) => {
    const active = sort.key === key
    if (!sortable) return <span className="inline-flex min-h-[2.75rem] items-center">{text}</span>
    return (
      <button
        type="button"
        onClick={() => onSort({ key, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
        data-testid={testId ? `${testId}-sort-${key}` : undefined}
        data-sort-active={active ? sort.dir : undefined}
        className={`-mx-1 inline-flex min-h-[2.75rem] max-w-full items-center gap-1 rounded-field px-1 hover:text-content-primary ${active ? 'text-content-primary' : ''}`}
      >
        <span className="truncate">{text}</span>
        <Icon name={active ? (sort.dir === 'asc' ? 'sortAsc' : 'sortDesc') : 'sort'} size={14} className={active ? '' : 'opacity-40'} />
      </button>
    )
  }

  const actionsWidth = `${Math.max(16, actionsPx)}px`

  return (
    <div
      ref={wrapRef}
      className="entity-table w-full"
      data-testid={testId}
      data-entity-table=""
      data-stacked={stacked ? '' : undefined}
      data-table-width={Math.round(width)}
      data-columns={stacked ? 'lead' : ['lead', ...shown.map((c) => c.key)].join(',')}
    >
      {stacked ? (
        <>
          <div className="flex items-center justify-between gap-2 border-b border-edge-subtle px-1 pb-1 text-micro text-content-muted">
            {sortButton('name', leadLabel, !!leadSort)}
            {columns.some((c) => c.sort) && (
              <label className="inline-flex items-center gap-1">
                <span className="sr-only">{t('table.sortBy')}</span>
                <select
                  className="input min-h-[2.5rem] w-auto py-1 text-micro"
                  value={sort.key}
                  onChange={(e) => onSort({ key: e.target.value, dir: sort.dir })}
                  data-testid={testId ? `${testId}-sort-select` : undefined}
                >
                  {leadSort && <option value="name">{leadLabel}</option>}
                  {columns
                    .filter((c) => c.sort)
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="px-2 py-8 text-center text-caption text-content-muted">{empty ?? t('table.empty')}</p>
          ) : (
            <ul aria-label={label} className="divide-y divide-edge-subtle">
              {rows.map((r) => {
                const k = rowKey(r)
                const active = activeKey === k
                return (
                  <li
                    key={k}
                    data-row-key={k}
                    data-open={active ? '' : undefined}
                    {...(rowAttrs?.(r) ?? {})}
                    className={`flex min-h-[3.75rem] items-center gap-1 ${active ? 'bg-accent/10' : ''} ${rowTone?.(r) ?? ''}`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 py-2 ps-1 text-start"
                      onClick={onPreview ? () => onPreview(r) : undefined}
                      data-row-open=""
                      data-testid={testId ? `${testId}-open-${k}` : undefined}
                    >
                      <span className="min-w-0 flex-1">{leadCell(r, true)}</span>
                      {phoneEnd && <span className="shrink-0">{phoneEnd(r)}</span>}
                    </button>
                    <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      {menu(r, true)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-0 text-caption" aria-label={label}>
          <thead>
            <tr>
              <th scope="col" aria-sort={leadSort ? (sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined} className="border-b border-edge-subtle px-2 py-1.5 text-start align-bottom font-semibold text-content-muted">
                {sortButton('name', leadLabel, !!leadSort)}
              </th>
              {shown.map((c) => {
                const active = sort.key === c.key
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={c.sort ? (active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                    className="border-b border-edge-subtle px-2 py-1.5 text-start align-bottom font-semibold text-content-muted"
                    style={{ width: `${Math.round(colPx(c))}px` }}
                  >
                    {sortButton(c.key, c.label, !!c.sort)}
                  </th>
                )
              })}
              <th scope="col" className="border-b border-edge-subtle px-1 py-1.5" style={{ width: actionsWidth }}>
                <span className="sr-only">{t('table.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={shown.length + 2} className="px-2 py-8 text-center text-content-muted">
                  {empty ?? t('table.empty')}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const k = rowKey(r)
              const active = activeKey === k
              return (
                <tr
                  key={k}
                  data-row-key={k}
                  data-open={active ? '' : undefined}
                  {...(rowAttrs?.(r) ?? {})}
                  onClick={onPreview ? () => onPreview(r) : undefined}
                  className={`group ${onPreview ? 'cursor-pointer' : ''} ${active ? 'bg-accent/10' : onPreview ? 'hover:bg-surface-high' : ''} ${rowTone?.(r) ?? ''}`}
                >
                  <td className="h-14 overflow-hidden border-b border-edge-subtle px-2 py-1 align-middle">{leadCell(r, false)}</td>
                  {shown.map((c) => (
                    <td
                      key={c.key}
                      onClick={c.interactive ? (e) => e.stopPropagation() : undefined}
                      title={c.title?.(r)}
                      className={`relative h-14 whitespace-nowrap border-b border-edge-subtle px-2 py-1 align-middle ${c.interactive ? 'overflow-visible' : 'overflow-hidden text-ellipsis'} ${c.className ?? ''}`}
                    >
                      {c.render(r, { width })}
                    </td>
                  ))}
                  <td className="h-14 border-b border-edge-subtle px-1 py-1 align-middle" onClick={(e) => e.stopPropagation()} data-row-actions="">
                    <span className="flex flex-nowrap items-center justify-end gap-0.5">
                      {inlineActions(r)}
                      {menu(r, false)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
