import type { ReactNode } from 'react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Avatar } from './Avatar'
import type { Column, SortState } from './DataTable'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { ListTile } from './ListTile'
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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AZ1 · AZ2 (2026-10-11) — LA FORME D'AVANT, RENDUE AU TABLEAU ; ET LE
 *    MODE DE CARTE, PAS LA LARGEUR, CHOISIT LA LECTURE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AY3 avait réuni les listes en reprenant le CONTENU du tableau des fermes et
 * pas sa FORME. Ce qui faisait la qualité de la grille « roster » (X5 · Y9,
 * jusqu'à 905158c), et qui revient ici :
 *
 *  - **UN FOND PROPRE** : le tableau est une carte (`surface-raised`) posée
 *    sur la page (`surface-base`) — en sombre, #1E2836 sur #0B1119. AY posait
 *    les lignes à même la page : « fond sur fond ».
 *  - **UN EN-TÊTE TEINTÉ ET COLLÉ** : `surface-overlay`, petites capitales
 *    espacées, et `position: sticky` juste sous le bandeau de la liste
 *    (`ListTop`, collant lui aussi), dont la hauteur est mesurée. Le PO ne
 *    perd plus le nom des colonnes en défilant.
 *  - **DES LIGNES QUI SE DÉTACHENT** : 64 px (`ROSTER_ROW_HEIGHT`), un filet
 *    entre chaque, une ligne sur deux très légèrement teintée pour suivre une
 *    ligne du regard d'un bout à l'autre, et le repère au survol.
 *  - **DE LA RESPIRATION** : 1 rem aux deux bords de la carte.
 *
 * ★ ET LA RÈGLE DU PO, MOT POUR MOT : « carte visible → vignettes ; tableau
 *   seul → le tableau ». `tiles` vient du mode de carte de l'écran (`split`
 *   ou `full` → vignettes, `hidden` → tableau). Au téléphone, carte masquée,
 *   c'est donc le TABLEAU : les colonnes cèdent sous le nom comme partout et
 *   les gestes se replient dans « ⋯ ».
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
  /**
   * ★★ BA (2026-10-12) — LA PERSONNE, juste sous le nom (texte secondaire),
   * dans le tableau ET la vignette : pour une ferme, l'agriculteur de rang 1.
   * Le PO cherchait un agriculteur par son nom et ne le trouvait pas : l'écran ne montrait
   * que le nom de l'exploitation.
   */
  person?: string
  /** ★★ BA — le téléphone de cette personne : sa photo, à défaut d'une photo propre. */
  phone?: string
  /** L'identifiant de la ligne `always` sur la vignette (« בקשה נכנסת »…). */
  alwaysTestId?: string
}

/** La vignette à retrouver quand l'aperçu ancré se referme, par liste. */
const returnTo = new Map<string, string>()

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
  tiles = false,
  where,
  hidden = false,
  tileAction,
  tileFoot,
  tileTestId,
  tileTone,
  groupOf,
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
  /** ★★ AZ2 — la carte de l'écran est visible : la liste se lit en VIGNETTES. */
  tiles?: boolean
  /** ★★ AZ2 — ce qui situe la fiche sur la vignette (lieu, région…). */
  where?: (row: T) => string | null | undefined
  /** ★★ AZ2.2 — l'aperçu ancré occupe la colonne : la liste se retire. */
  hidden?: boolean
  /**
   * ★★ AZ4 — le geste d'une colonne « interactive » (confirmer…) qui, sur
   * une vignette, n'a plus de colonne : il se pose à côté de « ⋯ ».
   */
  tileAction?: (row: T) => ReactNode
  /**
   * ★★ AZ4 — un geste trop large pour la place d'à côté (les statuts d'un
   * contact) : il se pose SOUS la vignette, dans la même carte.
   */
  tileFoot?: (row: T) => ReactNode
  /** L'identifiant des vignettes (« farm-tile » : celui des portes d'avant AY). */
  tileTestId?: string
  /** La teinte d'une vignette mise en avant (la ligne du tableau a `rowTone`). */
  tileTone?: (row: T) => string | undefined
  /**
   * ★★ AZ4 — le regroupement (« קיבוץ לפי ישיבה » des volontaires, d'avant
   * AY) : les lignes, déjà triées par groupe, reçoivent un en-tête repliable
   * avec leur compte, en tableau comme en vignettes.
   */
  groupOf?: (row: T) => string
}) {
  const { t } = useTranslation()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [headTop, setHeadTop] = useState(0)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    /* ★★ AZ1.2 — l'en-tête se colle SOUS le bandeau de la liste, qui est
       collant lui aussi : on mesure sa hauteur (elle change avec les filtres
       repliés, la recherche ouverte, la largeur). */
    let top: HTMLElement | null = null
    for (let n: HTMLElement | null = el.parentElement; n && !top; n = n.parentElement) {
      top = n.querySelector<HTMLElement>(':scope > [data-list-top]')
    }
    const measure = () => setHeadTop(top ? top.offsetHeight : 0)
    measure()
    if (top) ro.observe(top)
    const ro2 = new ResizeObserver(measure)
    if (top) ro2.observe(top)
    return () => {
      ro.disconnect()
      ro2.disconnect()
    }
  }, [])
  /* ★★ AZ2.2 — en refermant l'aperçu ancré, on retrouve la vignette touchée.
     ⚠️ La mémoire est HORS du composant : un écran peut remonter sa liste à
     la fermeture (les fermes le font), et une `useRef` repartirait de zéro. */
  if (hidden && activeKey) returnTo.set(testId ?? label, activeKey)
  useEffect(() => {
    if (hidden) return
    const k = returnTo.get(testId ?? label)
    if (!k) return
    returnTo.delete(testId ?? label)
    wrapRef.current?.querySelector(`[data-row-key="${CSS.escape(k)}"]`)?.scrollIntoView({ block: 'center' })
  }, [hidden, testId, label])
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(new Set())
  const groupCount = new Map<string, number>()
  if (groupOf) for (const r of rows) groupCount.set(groupOf(r), (groupCount.get(groupOf(r)) ?? 0) + 1)
  const toggleGroup = (g: string) =>
    setClosedGroups((cur) => {
      const next = new Set(cur)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  /** L'en-tête d'un groupe, avant sa première ligne ; et si la ligne est repliée. */
  const groupStep = (r: T, i: number): { head: string | null; hidden: boolean } => {
    if (!groupOf) return { head: null, hidden: false }
    const g = groupOf(r)
    const head = i === 0 || groupOf(rows[i - 1]) !== g ? g : null
    return { head, hidden: closedGroups.has(g) }
  }
  const groupButton = (g: string) => (
    <button
      type="button"
      onClick={() => toggleGroup(g)}
      aria-expanded={!closedGroups.has(g)}
      data-testid={testId ? `${testId}-group` : undefined}
      data-group={g}
      className="flex min-h-11 w-full items-center gap-2 px-3 text-start text-caption font-semibold text-content-primary"
    >
      <Icon name="chevronDown" size={14} className={`shrink-0 transition-transform duration-fast ${closedGroups.has(g) ? '-rotate-90 rtl:rotate-90' : ''}`} />
      <span className="truncate">{g || '—'}</span>
      <span className="numeric rounded-pill bg-surface-raised px-2 text-micro text-content-secondary">{groupCount.get(g) ?? 0}</span>
    </button>
  )
  const stacked = width > 0 && width < STACK_BELOW
  /* ★ LE NOM D'ABORD : il garde toujours ses 15 rem. Les colonnes qui ne
     tiennent pas à côté de lui cèdent, la moins prioritaire (le seuil le plus
     haut) en premier, et passent sous le nom. Mesuré sur la largeur du
     TABLEAU (un panneau à côté d'une carte n'a pas celle de la fenêtre). */
  /* Au téléphone (tableau étroit), les gestes se replient dans « ⋯ » : le nom
     garde sa place. */
  const foldActions = stacked
  const inlineCountAll = foldActions ? 0 : rows.length > 0 ? (actions?.(rows[0]) ?? []).filter((a) => a.inline).length : 0
  const menuAll = rows.some((r) => (actions?.(r) ?? []).some((a) => foldActions || !a.inline))
  const actionsPx = (inlineCountAll * 2.5 + (menuAll ? 2.75 : 0) + 0.75) * 16
  const colPx = (c: EntityColumn<T>): number => {
    const m = /w-\[(\d+(?:\.\d+)?)(rem|%)\]/.exec(c.className ?? '')
    if (!m) return 110
    return m[2] === 'rem' ? Number(m[1]) * 16 : (Number(m[1]) / 100) * width
  }
  let shown = columns.filter((c) => !c.minWidth || width === 0 || width >= c.minWidth)
  if (width > 0) {
    const budget = width - (stacked ? LEAD_MIN_PX * 0.6 : LEAD_MIN_PX) - actionsPx - 32
    while (shown.length > 0 && shown.reduce((n, c) => n + colPx(c), 0) > budget) {
      const drop = [...shown].sort((a, b) => (b.minWidth ?? 0) - (a.minWidth ?? 0))[0]
      shown = shown.filter((c) => c !== drop)
    }
  }
  const folded = columns.filter((c) => !shown.includes(c))

  const subOf = (r: T): string => {
    const l = lead(r)
    const parts = [...(l.always ?? []), ...folded.map((c) => c.sub?.(r) ?? '').filter(Boolean)]
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
        <Avatar photo={l.photo} phone={l.phone} name={l.title} size={big ? 'sm' : 'xs'} shape={l.shape ?? 'circle'} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            {l.dot}
            <span className="truncate text-caption font-semibold text-content-primary" data-entity-title="">
              {l.title}
            </span>
            {l.marks}
          </span>
          {l.person && (
            <span className="block truncate text-micro text-content-secondary" title={l.person} data-entity-person="">
              {l.person}
            </span>
          )}
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

  /* ★★ AZ2.1 — LA VIGNETTE : lisible d'un coup d'œil, à bonne distance. Le
     nom en 18 px (il était à 13,5 px dans les lignes à deux étages d'AY), ce
     qui situe la fiche en 16 px, l'état en pastille, et la photo sur toute la
     hauteur de la tuile (`ListTile`, la tuile commune des cinq listes depuis
     Y4). Mesuré par `azui` A372. */
  const whereOf = (r: T): string => {
    const own = where?.(r)
    if (own) return own
    return columns
      .map((c) => c.sub?.(r) ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join(' · ')
  }

  if (tiles) {
    return (
      <div
        ref={wrapRef}
        className="entity-tiles w-full"
        hidden={hidden}
        data-testid={testId}
        data-entity-table=""
        data-tiles=""
        data-table-width={Math.round(width)}
      >
        {rows.length === 0 ? (
          <p className="px-2 py-8 text-center text-body text-content-muted">{empty ?? t('table.empty')}</p>
        ) : (
          <ul aria-label={label} className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const k = rowKey(r)
              const l = lead(r)
              const w = whereOf(r)
              const step = groupStep(r, i)
              const head = step.head !== null && (
                <li key={`group-${step.head}`} className="mt-2 rounded-field bg-surface-high" data-group-head="">
                  {groupButton(step.head)}
                </li>
              )
              if (step.hidden) return head || null
              const more = (l.always ?? []).filter(Boolean).join(' · ')
              const foot = tileFoot?.(r)
              return (
                <Fragment key={k}>
                {head}
                <li
                  key={k}
                  data-row-key={k}
                  data-open={activeKey === k ? '' : undefined}
                  {...(rowAttrs?.(r) ?? {})}
                  className={foot ? 'overflow-hidden rounded-card bg-surface-raised shadow-card' : undefined}
                >
                  <ListTile
                    testId={tileTestId ?? (testId ? `${testId}-tile` : 'entity-tile')}
                    photo={l.photo ?? null}
                    phone={l.phone}
                    name={l.title}
                    active={activeKey === k}
                    onOpen={() => onPreview?.(r)}
                    openLabel={t('table.view')}
                    className={`entity-tile ${foot ? '!rounded-none !shadow-none' : ''} ${tileTone ? (tileTone(r) ?? '') : (rowTone?.(r) ?? '')}`}
                    action={
                      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {tileAction?.(r)}
                        {menu(r, true)}
                      </span>
                    }
                  >
                    <span className="flex min-w-0 items-center gap-2" data-row-open="">
                      {l.dot}
                      <span className="truncate text-heading font-semibold text-content-primary" data-entity-title="" title={l.title}>
                        {l.title}
                      </span>
                      {l.marks}
                    </span>
                    {l.person && (
                      <span className="truncate text-body text-content-secondary" data-entity-person="" title={l.person}>
                        {l.person}
                      </span>
                    )}
                    <span className="flex min-w-0 items-center gap-2">
                      {phoneEnd && <span className="shrink-0">{phoneEnd(r)}</span>}
                      {w && (
                        <span className="truncate text-body text-content-secondary" data-entity-where="" title={w}>
                          {w}
                        </span>
                      )}
                    </span>
                    {more && (
                      <span className="truncate text-caption text-content-muted" title={more} data-testid={l.alwaysTestId}>
                        {more}
                      </span>
                    )}
                  </ListTile>
                  {foot && (
                    <div className="border-t border-edge-subtle/70 px-3 py-2" data-tile-foot="">
                      {foot}
                    </div>
                  )}
                </li>
                </Fragment>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  const thBase =
    'sticky z-10 bg-surface-high border-b border-edge-subtle py-2 text-start align-middle text-micro font-semibold uppercase tracking-wide text-content-muted'
  const headStyle = { top: `calc(var(--shell-top, 0px) + ${headTop}px)` }
  const tdBase = 'h-16 border-b border-edge-subtle/70 align-middle'

  return (
    <div
      ref={wrapRef}
      className="entity-table card w-full"
      hidden={hidden}
      data-testid={testId}
      data-entity-table=""
      data-stacked={stacked ? '' : undefined}
      data-table-width={Math.round(width)}
      data-columns={['lead', ...shown.map((c) => c.key)].join(',')}
    >
      <table className="w-full table-fixed border-separate border-spacing-0 text-caption" aria-label={label}>
        <thead>
          <tr data-entity-head="">
            <th
              scope="col"
              aria-sort={leadSort ? (sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
              className={`${thBase} rounded-ss-card ps-4 pe-2`}
              style={headStyle}
            >
              {sortButton('name', leadLabel, !!leadSort)}
            </th>
            {shown.map((c) => {
              const active = sort.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={c.sort ? (active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  className={`${thBase} px-2`}
                  style={{ ...headStyle, width: `${Math.round(colPx(c))}px` }}
                >
                  {sortButton(c.key, c.label, !!c.sort)}
                </th>
              )
            })}
            <th scope="col" className={`${thBase} rounded-se-card pe-3 ps-1`} style={{ ...headStyle, width: actionsWidth }}>
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
          {rows.map((r, i) => {
            const k = rowKey(r)
            const active = activeKey === k
            const step = groupStep(r, i)
            const head = step.head !== null && (
              <tr key={`group-${step.head}`} data-group-head="">
                <td colSpan={shown.length + 2} className="border-b border-edge-subtle bg-surface-high/80 p-0">
                  {groupButton(step.head)}
                </td>
              </tr>
            )
            if (step.hidden) return head || null
            return (
              <Fragment key={k}>
              {head}
              <tr
                key={k}
                data-row-key={k}
                data-open={active ? '' : undefined}
                {...(rowAttrs?.(r) ?? {})}
                onClick={onPreview ? () => onPreview(r) : undefined}
                className={`entity-row group transition-colors duration-fast ${onPreview ? 'cursor-pointer' : ''} ${active ? 'bg-accent/10' : ''} ${rowTone?.(r) ?? ''}`}
              >
                <td className={`${tdBase} overflow-hidden ps-4 pe-2`}>
                  <span
                    className="flex min-w-0 items-center gap-2"
                    data-row-open={onPreview ? '' : undefined}
                    data-testid={onPreview && testId ? `${testId}-open-${k}` : undefined}
                  >
                    <span className="min-w-0 flex-1">{leadCell(r, stacked)}</span>
                    {/* Au téléphone, l'état se lit au bout du nom quand sa colonne a cédé. */}
                    {stacked && phoneEnd && !shown.some((c) => c.key === 'status') && <span className="shrink-0">{phoneEnd(r)}</span>}
                  </span>
                </td>
                {shown.map((c) => (
                  <td
                    key={c.key}
                    onClick={c.interactive ? (e) => e.stopPropagation() : undefined}
                    title={c.title?.(r)}
                    className={`relative ${tdBase} whitespace-nowrap px-2 ${c.interactive ? 'overflow-visible' : 'overflow-hidden text-ellipsis'} ${c.className ?? ''}`}
                  >
                    {c.render(r, { width })}
                  </td>
                ))}
                <td className={`${tdBase} pe-3 ps-1`} onClick={(e) => e.stopPropagation()} data-row-actions="">
                  <span className="flex flex-nowrap items-center justify-end gap-0.5">
                    {!foldActions && inlineActions(r)}
                    {menu(r, foldActions)}
                  </span>
                </td>
              </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
