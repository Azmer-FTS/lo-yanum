import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'
import type { IconName } from './Icon'
import { Sheet } from './Sheet'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BC (2026-10-12) — LES FILTRES AU TÉLÉPHONE : UN BOUTON, UNE FEUILLE, DES
 *    PASTILLES. LE MOTIF D'AIRBNB, DE BOOKING ET DE GMAIL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Constat du PO : « les filtres sont dans un cadran minuscule où on ne voit même
 * pas un filtre en entier ; les statuts défilent latéralement dans une fente ».
 *
 * Désormais, quand la liste est étroite (téléphone ; tablette dont le panneau
 * est étroit — voir `ListTop`) :
 *
 *   · UN bouton « סינון » qui porte le nombre de filtres actifs ; il ouvre une
 *     feuille montante (trois quarts de l'écran) : TOUTES les familles, chacune
 *     avec ses valeurs ET leur compte, lisibles en entier, cochables au doigt
 *     (lignes de 48 px). En bas, « נקה הכל » et « הצג N תוצאות ».
 *   · Les STATUTS gardent leur propre déclencheur (le PO les veut séparés des
 *     filtres) : il dit le statut courant et son compte, et ouvre la même
 *     feuille sur leur section.
 *   · Sous la barre, les filtres actifs en pastilles, chacune avec sa croix.
 *     Rien d'autre. Elles passent à la ligne ; rien ne défile de côté.
 *
 * ★ UNE DÉCLARATION PAR ÉCRAN (`FilterFamily[]`), lue par la feuille, les
 *   pastilles et les comptes : la même source pour les trois.
 * ★ LES CHOIX S'APPLIQUENT AUSSITÔT (la liste derrière la feuille suit) ; « הצג
 *   N תוצאות » dit combien il en reste et referme. Aucun brouillon à valider.
 */

export interface FilterOption {
  key: string
  label: string
  count?: number
  active: boolean
  onToggle: () => void
  dot?: ReactNode
  icon?: IconName
  /** Une file de travail (« נשכחו »…) : sa teinte d'alerte. */
  tone?: 'alert' | 'accent'
  hint?: string
  testId?: string
  /** Une valeur sans aucune fiche : grisée, pas masquée (Y8.3). */
  disabled?: boolean
}

export interface FilterFamily {
  key: string
  title: string
  options: FilterOption[]
  /** Un seul choix à la fois (statut, région, onglet) : boutons radio. */
  single?: boolean
  /** Le tri : pas un filtre — ni compté sur le bouton, ni en pastille. */
  sort?: boolean
  /** Un onglet (à venir · passées) : un choix d'écran, pas un filtre — ni compté, ni en pastille. */
  tab?: boolean
  /** Une phrase sous la famille (la légende des marques, sous les statuts). */
  note?: ReactNode
  testId?: string
}

export interface CompactFilters {
  /** Les familles de la feuille, dans leur ordre. */
  families: FilterFamily[]
  /** Les statuts : leur propre déclencheur, et la première section de la feuille. */
  status?: FilterFamily
  /** Le libellé du déclencheur des statuts quand rien n'est choisi (« כל הסטטוסים »). */
  statusAll?: { label: string; count: number }
  activeCount: number
  onClear: () => void
  /** Combien de lignes restent : « הצג N תוצאות ». */
  results: number
}

/** Les pastilles actives : toute valeur cochée, hors tri et hors statuts. */
export function activeOptions(f: CompactFilters): Array<FilterOption & { family: string }> {
  return f.families.filter((fam) => !fam.sort && !fam.tab).flatMap((fam) => fam.options.filter((o) => o.active).map((o) => ({ ...o, family: fam.title })))
}

export function FilterButton({ count, onOpen, testId = 'filter-sheet-open' }: { count: number; onOpen: () => void; testId?: string }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      data-testid={testId}
      data-count={count}
      className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-caption font-semibold transition-colors duration-fast ${
        count > 0 ? 'border-accent bg-accent/15 text-accent-ink' : 'border-edge-subtle bg-surface-raised text-content-primary hover:bg-surface-high'
      }`}
    >
      <Icon name="filter" size={15} />
      {t('common.filters')}
      {count > 0 && (
        <span className="filter-count" data-testid="filter-active-count">
          {count}
        </span>
      )}
    </button>
  )
}

export function StatusTrigger({ family, all, onOpen }: { family: FilterFamily; all?: { label: string; count: number }; onOpen: () => void }) {
  const { t } = useTranslation()
  const current = family.options.find((o) => o.active)
  const label = current?.label ?? all?.label ?? t('farms.statusAll')
  const count = current ? current.count : all?.count
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      data-testid="status-sheet-open"
      data-status={current?.key ?? ''}
      className={`flex min-h-11 min-w-0 max-w-[11rem] items-center gap-1.5 rounded-pill border px-3 text-caption font-semibold transition-colors duration-fast ${
        current ? 'border-accent bg-accent/15 text-accent-ink' : 'border-edge-subtle bg-surface-raised text-content-primary hover:bg-surface-high'
      }`}
    >
      {current?.dot}
      <span className="min-w-0 truncate">{label}</span>
      {typeof count === 'number' && <span className="numeric shrink-0 text-content-muted">{count}</span>}
      <Icon name="chevronDown" size={13} className="shrink-0 opacity-70" />
    </button>
  )
}

export function ActiveChips({ filters }: { filters: CompactFilters }) {
  const { t } = useTranslation()
  const chips = activeOptions(filters)
  if (chips.length === 0) return null
  return (
    <ul className="flex flex-wrap items-center gap-2 pb-1" aria-label={t('filters.active')} data-testid="active-filter-chips">
      {chips.map((c) => (
        <li key={`${c.family}:${c.key}`}>
          <button
            type="button"
            onClick={c.onToggle}
            aria-label={t('filters.remove', { label: c.label })}
            data-testid={c.testId ? `${c.testId}-chip` : 'active-filter-chip'}
            className="flex min-h-11 items-center gap-1.5 rounded-pill border border-accent bg-accent/15 ps-3 pe-1.5 text-caption font-semibold text-accent-ink"
          >
            {c.dot}
            <span className="max-w-[12rem] truncate">{c.label}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-surface-raised/70">
              <Icon name="close" size={13} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Une valeur, en ligne entière : coche (ou rond), pastille, libellé, compte. */
function OptionRow({ option, single }: { option: FilterOption; single?: boolean }) {
  return (
    <li role="none">
      <button
        type="button"
        role={single ? 'menuitemradio' : 'menuitemcheckbox'}
        aria-checked={option.active}
        onClick={option.onToggle}
        disabled={option.disabled && !option.active}
        title={option.hint}
        data-testid={option.testId ? `${option.testId}-option` : undefined}
        data-active={option.active ? 'true' : 'false'}
        className={`flex min-h-12 w-full items-center gap-3 rounded-field px-2 text-start transition-colors duration-fast disabled:opacity-45 ${
          option.active ? 'bg-accent/10' : 'hover:bg-surface-high'
        }`}
      >
        <span
          aria-hidden
          className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 ${single ? 'rounded-pill' : 'rounded-[6px]'} ${
            option.active ? 'border-accent bg-accent text-content-on-accent' : 'border-edge-strong'
          }`}
        >
          {option.active && <Icon name="check" size={14} />}
        </span>
        {option.dot}
        {option.icon && <Icon name={option.icon} size={16} className={option.tone === 'alert' ? 'shrink-0 text-status-warn-ink' : 'shrink-0 text-content-secondary'} />}
        <span className="min-w-0 flex-1 text-body text-content-primary">{option.label}</span>
        {typeof option.count === 'number' && <span className="numeric shrink-0 rounded-pill bg-surface-high px-2 text-caption font-semibold text-content-secondary">{option.count}</span>}
      </button>
    </li>
  )
}

export function FilterSheet({
  open,
  onClose,
  filters,
  section,
}: {
  open: boolean
  onClose: () => void
  filters: CompactFilters
  /** La section à montrer en entrant (`status` depuis le déclencheur des statuts). */
  section?: string | null
}) {
  const { t } = useTranslation()
  const body = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open || !section) return
    const id = requestAnimationFrame(() => body.current?.querySelector(`[data-family="${section}"]`)?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(id)
  }, [open, section])
  const families = [...(filters.status ? [filters.status] : []), ...filters.families]
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('common.filters')}
      testId="filter-sheet"
      footer={
        <>
          <button type="button" className="btn-secondary min-h-12 flex-1" onClick={filters.onClear} disabled={filters.activeCount === 0 && !(filters.status?.options.some((o) => o.active))} data-testid="filter-sheet-clear">
            {t('filters.clearAll')}
          </button>
          <button type="button" className="btn-primary min-h-12 flex-[2]" onClick={onClose} data-testid="filter-sheet-show">
            {t('filters.showResults', { count: filters.results })}
          </button>
        </>
      }
    >
      <div ref={body} className="flex flex-col gap-4 pb-2">
        {families.map((fam) => (
          <section key={fam.key} data-family={fam.key} data-testid={fam.testId} aria-label={fam.title}>
            <h3 className="sticky top-0 z-[1] -mx-1 bg-surface-raised px-1 py-1.5 text-caption font-bold text-content-secondary">{fam.title}</h3>
            {/* Au moins 8 px entre deux lignes, deux cibles voisines ne se touchent
                jamais (AA1.2) : 10 px, parce qu'une feuille posée à une
                demi-coordonnée en montrait 7 au doigt (`pills` A72, qui marche
                pixel par pixel). */}
            <ul role="menu" aria-label={fam.title} className="flex flex-col gap-2.5">
              {fam.options.map((o) => (
                <OptionRow key={o.key} option={o} single={fam.single || fam.sort || fam.tab} />
              ))}
            </ul>
            {fam.note && <div className="mt-2">{fam.note}</div>}
          </section>
        ))}
      </div>
    </Sheet>
  )
}

/** L'état d'ouverture de la feuille et la section demandée, pour un écran. */
export function useFilterSheet(): { open: boolean; section: string | null; show: (section?: string) => void; close: () => void } {
  const [state, setState] = useState<{ open: boolean; section: string | null }>({ open: false, section: null })
  return {
    open: state.open,
    section: state.section,
    show: (section) => setState({ open: true, section: section ?? null }),
    close: () => setState({ open: false, section: null }),
  }
}

/**
 * ★★ BC — le tri d'un tableau, en famille de la feuille : au téléphone la
 * ligne d'en-têtes n'existe plus (elle mangeait 56 px), le tri vit ici. Un
 * toucher choisit la colonne ; un second toucher sur la même inverse le sens.
 */
export function sortFamily(
  t: (k: string) => string,
  columns: ReadonlyArray<{ key: string; label: string }>,
  sort: { key: string; dir: 'asc' | 'desc' },
  onSort: (next: { key: string; dir: 'asc' | 'desc' }) => void,
  testId: string,
): FilterFamily {
  return {
    key: 'sort',
    title: t('filters.family.sort'),
    sort: true,
    single: true,
    testId: `${testId}-sort-family`,
    options: columns.map((c) => ({
      key: c.key,
      label: sort.key === c.key ? `${c.label} ${sort.dir === 'asc' ? '↑' : '↓'}` : c.label,
      active: sort.key === c.key,
      onToggle: () => onSort({ key: c.key, dir: sort.key === c.key && sort.dir === 'asc' ? 'desc' : 'asc' }),
      testId: `${testId}-sort-${c.key}`,
    })),
  }
}
