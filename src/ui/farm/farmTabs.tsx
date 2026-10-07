import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { TabBar } from '../components/TabBar'

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
 * La rangée. ★★ AT4 — DE VRAIS ONGLETS (`TabBar`) : pleine largeur, posés sur
 * un trait, l'actif souligné ; plus de `filter-pill`. L'onglet des GARDES est
 * d'une couleur à lui, plus vive, et porte un point rouge quand une alerte de
 * cette ferme attend (incident urgent ouvert, présence contredite, retour non
 * confirmé — la liste du tableau de bord, `getAlerts`).
 */
export function FarmTabRow({
  tabs,
  active,
  onSelect,
  idPrefix,
  counts,
  guardsAlert,
}: {
  tabs: readonly FarmTab[]
  active: FarmTab | null
  onSelect: (t: FarmTab) => void
  idPrefix: string
  counts?: Partial<Record<FarmTab, number>>
  /** Texte de l'alerte qui attend dans l'onglet des gardes, ou rien. */
  guardsAlert?: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className="pt-2">
      <TabBar
        items={tabs.map((id) => ({
          key: id,
          label: t(`farmTabs.${id}`),
          count: counts?.[id],
          tone: id === 'guards' ? ('vivid' as const) : undefined,
          alert: id === 'guards' ? (guardsAlert ?? null) : null,
        }))}
        active={active}
        onSelect={onSelect}
        label={t('farmTabs.label')}
        idPrefix={idPrefix}
        testId={`${idPrefix}-tabs`}
      />
    </div>
  )
}
