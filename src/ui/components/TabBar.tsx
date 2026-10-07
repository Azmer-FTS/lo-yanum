import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AT4 — DE VRAIS ONGLETS. PAS DES PILULES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « J'ai demandé des onglets, tu me refais des capsules. » (PO, 2026-10-07)
 *
 * ★ CE QU'EST UN ONGLET, ET CE QUE `filter-pill` N'ÉTAIT PAS :
 *   - une RANGÉE qui occupe toute la largeur, posée sur un trait (le bord du
 *     classeur) — pas des pastilles flottantes séparées par du vide ;
 *   - chaque onglet S'ÉLARGIT selon la place (`flex: 1 0 auto`) : sur un iPad
 *     les six se partagent la ligne, sur un téléphone aussi tant qu'ils tiennent ;
 *   - l'actif est SOULIGNÉ (3 px) et teinté ; aucun arrondi de capsule.
 * ★ UN LIBELLÉ NE PASSE JAMAIS À LA LIGNE (AT5) : `nowrap`. Si la rangée ne tient
 *   vraiment plus, elle défile à l'horizontale — elle ne double jamais de hauteur.
 * ★ UN ONGLET PEUT SE DISTINGUER (`tone: 'vivid'`) et porter un SIGNAL (`alert`) :
 *   c'est l'onglet des gardes, ce que le PO veut voir en premier (AT4.3).
 */
export interface TabItem<K extends string> {
  key: K
  label: ReactNode
  /** Nombre affiché après le libellé (0 et `undefined` : rien). */
  count?: number
  /** Couleur propre, plus vive (l'onglet des gardes). */
  tone?: 'vivid'
  /** Un signal qui attend : point rouge + texte pour les lecteurs d'écran. */
  alert?: string | null
  testId?: string
  /** Libellé complet (aria / infobulle) quand `label` est abrégé. */
  title?: string
}

export function TabBar<K extends string>({
  items,
  active,
  onSelect,
  label,
  idPrefix,
  testId,
  size = 'md',
}: {
  items: ReadonlyArray<TabItem<K>>
  active: K | null
  onSelect: (key: K) => void
  label: string
  idPrefix: string
  testId?: string
  size?: 'md' | 'sm'
}) {
  const row = useRef<HTMLDivElement | null>(null)
  /* L'onglet actif ramené dans la RANGÉE seulement (jamais la page : AS5/anui). */
  useEffect(() => {
    const box = row.current
    const el = box?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!box || !el || box.scrollWidth <= box.clientWidth) return
    const r = box.getBoundingClientRect()
    const e = el.getBoundingClientRect()
    if (e.left < r.left) box.scrollLeft -= r.left - e.left + 8
    else if (e.right > r.right) box.scrollLeft += e.right - r.right + 8
  }, [active])

  return (
    <div
      ref={row}
      role="tablist"
      aria-label={label}
      data-testid={testId}
      data-tabbar=""
      className="tabbar flex w-full flex-nowrap overflow-x-auto border-b border-edge-subtle [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((it) => {
        const on = it.key === active
        const vivid = it.tone === 'vivid'
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${it.key}`}
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${it.key}`}
            data-testid={it.testId ?? `${idPrefix}-tab-${it.key}`}
            data-tone={it.tone}
            data-alert={it.alert ? '1' : undefined}
            title={it.title}
            onClick={() => onSelect(it.key)}
            className={`tab relative -mb-px flex shrink-0 grow basis-auto items-center justify-center gap-1.5 whitespace-nowrap border-b-[3px] px-1.5 font-semibold sm:px-3 transition-colors duration-fast ${
              size === 'sm' ? 'min-h-[2.75rem] text-caption' : 'min-h-[3rem] text-caption sm:text-body'
            } ${
              on
                ? vivid
                  ? 'border-status-info bg-status-info/15 text-status-info-ink'
                  : 'border-accent bg-accent/10 text-accent-ink'
                : vivid
                  ? 'border-transparent bg-status-info/[0.07] text-status-info-ink hover:bg-status-info/15'
                  : 'border-transparent text-content-secondary hover:bg-surface-high hover:text-content-primary'
            }`}
          >
            <span className="truncate">{it.label}</span>
            {it.count ? (
              <span className={`tab-count tabular-nums ${on ? '' : 'text-content-muted'}`} data-testid={`${idPrefix}-count-${it.key}`}>
                {it.count}
              </span>
            ) : null}
            {it.alert ? (
              <span className="tab-alert flex h-2.5 w-2.5 shrink-0 rounded-pill bg-status-danger" role="img" aria-label={it.alert} title={it.alert} />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
