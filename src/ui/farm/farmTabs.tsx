import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AS5 (2026-10-07) — LA FICHE EN ONGLETS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Aujourd'hui tout est sur une page qu'il faut dérouler entièrement. »
 *
 * ★ LE DÉCOUPAGE PART DE CE QUE LE PO CONSULTE, PAS DE CE QUE LE CODE CONTIENT :
 *   - החווה   : l'état du papier, les chiffres, les faits (« où en est-elle ») —
 *               ce qu'il regarde en ouvrant, donc l'onglet par défaut ;
 *   - אנשים   : qui appeler, et la nuit, quel numéro et quel portail (תיק אתר) ;
 *   - שמירות  : la couverture, l'historique des gardes, les incidents ;
 *   - שטח     : les postes, les zones, les menaces — ce qui se dessine ;
 *   - מסמכים  : engagements, lien de l'agriculteur et ses pièces, accords et
 *               signature, contrats de terre (AS1.5) ;
 *   - יומן    : notes, visites, activité — ce qui s'est passé.
 * ★ L'ORDRE EST CELUI DE L'ÉDITION (AM3) : סטטוס ושטחים · פרטים | אנשים · חירום |
 *   התחייבויות · הסכמים | הערות. L'édition porte la MÊME rangée (sans שמירות ni
 *   שטח, qui ne se saisissent pas), aux MÊMES intitulés.
 * ★ LES PANNEAUX RESTENT DANS LE DOM (`hidden`) : A217 compare toujours les
 *   intitulés des deux écrans, et un bloc replié garde son état.
 * ★ L'ONGLET OUVERT SE RETIENT PAR FICHE (`lo-yanum:farm-tab:<id>`, local :
 *   c'est une disposition d'écran) ; `?tab=` l'emporte et s'écrit.
 */
export const FARM_TABS = ['farm', 'people', 'guards', 'terrain', 'docs', 'log'] as const
export type FarmTab = (typeof FARM_TABS)[number]
/** Les onglets qui ont des blocs SAISIS, dans l'édition. */
export const FARM_FORM_TABS: readonly FarmTab[] = ['farm', 'people', 'docs', 'log']

const key = (farmId: string) => `lo-yanum:farm-tab:${farmId}`
const isTab = (v: string | null): v is FarmTab => v !== null && (FARM_TABS as readonly string[]).includes(v)

export function readFarmTab(farmId: string): FarmTab {
  try {
    const v = localStorage.getItem(key(farmId))
    return isTab(v) ? v : 'farm'
  } catch {
    return 'farm'
  }
}

export function useFarmTab(farmId: string): [FarmTab, (t: FarmTab) => void] {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('tab')
  const [tab, setTabState] = useState<FarmTab>(() => (isTab(fromUrl) ? fromUrl : readFarmTab(farmId)))
  useEffect(() => {
    setTabState(isTab(fromUrl) ? fromUrl : readFarmTab(farmId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId])
  useEffect(() => {
    if (isTab(fromUrl) && fromUrl !== tab) setTabState(fromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl])
  const setTab = (t: FarmTab): void => {
    setTabState(t)
    try {
      localStorage.setItem(key(farmId), t)
    } catch {
      /* navigation privée */
    }
    if (params.has('tab')) {
      const next = new URLSearchParams(params)
      next.set('tab', t)
      setParams(next, { replace: true })
    }
  }
  return [tab, setTab]
}

/**
 * La rangée. Des ONGLETS (role=tablist), pas un menu : défilable à
 * l'horizontale au doigt, 44 px de haut, l'actif marqué et ramené dans la vue.
 */
export function FarmTabRow({
  tabs,
  active,
  onSelect,
  idPrefix,
  counts,
}: {
  tabs: readonly FarmTab[]
  active: FarmTab | null
  onSelect: (t: FarmTab) => void
  idPrefix: string
  counts?: Partial<Record<FarmTab, number>>
}) {
  const { t } = useTranslation()
  const row = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])
  return (
    <div
      ref={row}
      role="tablist"
      aria-label={t('farmTabs.label')}
      data-testid={`${idPrefix}-tabs`}
      className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((id) => {
        const on = id === active
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${id}`}
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${id}`}
            data-testid={`${idPrefix}-tab-${id}`}
            onClick={() => onSelect(id)}
            className={`filter-pill min-h-[2.75rem] shrink-0 snap-start px-4 ${on ? 'filter-pill-active' : ''}`}
          >
            {t(`farmTabs.${id}`)}
            {counts?.[id] ? <span className="filter-count">{counts[id]}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
