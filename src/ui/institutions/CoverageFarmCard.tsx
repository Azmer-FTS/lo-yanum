import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { effectiveAreas, linkMinutes, primaryContactOf, telHref } from '@core/index'
import type { Farm, Institution } from '@core/index'
import type { PairRoad } from '@core/roadMesh'

import { FarmStatusDot } from '../components/badges'
import { ChevronForward, Icon } from '../components/Icon'
import { useLocale } from '../hooks/useLocale'
import { readSetting, writeSetting } from '../../storage/local'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BG (2026-10-14) — LA FICHE COMPACTE D'UNE FERME, SUR LA CARTE DE
 *    COUVERTURE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Le pop-up est trop large et trop haut, il masque la carte. » Il faisait
 * 20 rem (28 dès `lg`), photo et six chiffres. Il fait désormais 17 rem et,
 * REPLIÉ, ne dit que l'essentiel : le nom, la localité, l'agriculteur, la
 * pastille du statut, et — une institution étant sélectionnée — la distance
 * et les minutes depuis elle, CÔTE À CÔTE sur une ligne.
 *
 * ★ LA NUIT. Son pourcentage se lit SUR LA LIGNE DES MINUTES (« 🌙 +15% », la
 *   seule chose qui explique qu'une durée soit plus longue que la route) ; le
 *   CALCUL entier (route × marge × nuit) est dans la partie dépliée. Choix dit
 *   au rapport : la ligne repliée reste lisible d'un coup d'œil, le calcul
 *   reste à un toucher.
 *
 * ★ La flèche déplie le reste (téléphone, branche, surfaces, notes, actions) ;
 *   l'état est MÉMORISÉ d'une ouverture à l'autre (`lo-yanum:coverage-farm-card`,
 *   un état d'écran de CET appareil). Toutes les cibles font 44 px.
 *
 * ⚠️ Elle est rangée au COIN de la carte (`MapPanel.detail` sans `detailAt`) :
 *    une bulle ancrée sur l'épingle déplace la caméra quand l'épingle est près
 *    du bord — et ouvrir une ferme dans un maillage ne doit RIEN bouger (BG 1).
 */

export const FARM_CARD_KEY = 'lo-yanum:coverage-farm-card'

function readOpen(): boolean {
  try {
    return readSetting(FARM_CARD_KEY) === 'open'
  } catch {
    return false
  }
}

export function CoverageFarmCard({
  farm,
  inst,
  road,
  factor,
  margin,
  nightPct,
  linkedNames,
  link,
  onClose,
}: {
  farm: Farm
  /** L'institution sélectionnée : la distance et les minutes se lisent depuis elle. */
  inst: Institution | null
  road: PairRoad | undefined
  /** route × marge × nuit. */
  factor: number
  margin: number
  nightPct: number
  /** Les institutions auxquelles la ferme est liée (5.4 : plus d'une se signale). */
  linkedNames: string[]
  /** Le chaînon vers l'institution sélectionnée (partie dépliée). */
  link?: React.ReactNode
  onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [open, setOpenState] = useState(readOpen)
  const setOpen = (v: boolean) => {
    setOpenState(v)
    try {
      writeSetting(FARM_CARD_KEY, v ? 'open' : 'closed')
    } catch {
      /* un état d'écran perdu n'est qu'un retour au repli */
    }
  }
  const farmer = primaryContactOf(farm.contacts)
  const measured = road && road.kind !== 'none' ? road : null
  const minutes = measured ? linkMinutes(measured.seconds, factor) : null
  const baseMinutes = measured ? Math.max(1, Math.round(measured.seconds / 60)) : null
  const areas = effectiveAreas(farm)

  return (
    <div
      className="w-[min(17rem,calc(100vw-2rem))] animate-fade-in rounded-card bg-surface-overlay/95 p-2.5 shadow-lift backdrop-blur"
      data-testid="coverage-farm-card"
      data-farm={farm.id}
      data-expanded={open ? 'true' : 'false'}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 ps-1 pt-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <FarmStatusDot status={farm.status} />
            <span className="truncate text-label font-bold text-content-primary" title={farm.name} data-testid="coverage-farm-card-name">
              {farm.name}
            </span>
          </p>
          <p className="truncate text-micro text-content-secondary" data-testid="coverage-farm-card-who">
            {[farm.locality, farmer?.name].filter(Boolean).join(' · ') || t('farms.noPosition')}
            <span className="sr-only"> · {t(`farmStatus.${farm.status}`)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? t('coverage.farmCard.less') : t('coverage.farmCard.more')}
          title={open ? t('coverage.farmCard.less') : t('coverage.farmCard.more')}
          data-testid="coverage-farm-card-toggle"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-content-secondary hover:bg-surface-high hover:text-content-primary"
        >
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
          data-testid="coverage-farm-card-close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-content-muted hover:bg-surface-high hover:text-content-primary"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {inst && (
        <p className="ltr-nums mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-field bg-surface-raised px-2 py-1.5 text-caption" data-testid="coverage-farm-card-figures">
          {measured ? (
            <>
              <span className="font-bold text-content-primary" data-testid="coverage-farm-card-km">
                {t('coverage.farmCard.km', { km: measured.km.toFixed(measured.km < 10 ? 1 : 0) })}
              </span>
              <span className="font-bold text-content-primary" data-testid="coverage-farm-card-min">
                {t('coverage.farmCard.min', { min: minutes })}
              </span>
              {nightPct > 0 && (
                <span className="inline-flex items-center gap-1 text-content-secondary" data-testid="coverage-farm-card-night" title={t('coverage.farmCard.calc', { base: baseMinutes, margin, night: nightPct, min: minutes })}>
                  <Icon name="moon" size={13} />
                  {t('coverage.farmCard.night', { night: nightPct })}
                </span>
              )}
            </>
          ) : (
            <span className="text-content-muted">{road?.kind === 'none' ? t('coverage.noRoadShort') : t('coverage.measuringOne')}</span>
          )}
          <span className="basis-full truncate text-micro text-content-muted">{t('coverage.farmCard.from', { name: inst.name })}</span>
        </p>
      )}

      {linkedNames.length > 1 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-micro font-semibold text-status-warn-ink" data-testid="coverage-farm-card-multi">
          <Icon name="link" size={13} />
          <span className="min-w-0 truncate">{t('sponsor.multi', { count: linkedNames.length, names: linkedNames.join(' · ') })}</span>
        </p>
      )}

      {open && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-edge-subtle pt-2 text-caption" data-testid="coverage-farm-card-more">
          {farmer?.phone && (
            <a href={telHref(farmer.phone)} className="ltr-nums flex min-h-11 items-center gap-2 rounded-field px-1 font-semibold text-accent-ink hover:bg-surface-high" dir="ltr" data-testid="coverage-farm-card-phone">
              <Icon name="phone" size={15} />
              {farmer.phone}
            </a>
          )}
          {(farm.branches ?? []).length > 0 && (
            <p className="text-content-secondary">
              <span className="text-content-muted">{t('coverage.farmCard.branch')} </span>
              {(farm.branches ?? []).map((b) => t(`branches.kind.${b.kind}`)).join(' · ')}
            </p>
          )}
          <p className="ltr-nums text-content-secondary">
            <span className="text-content-muted">{t('coverage.farmCard.areas')} </span>
            {t('farms.kpiDunams', { n: areas.cultivated.toLocaleString(locale) })} · {t('farms.kpiDunams', { n: farm.grazingDunams.toLocaleString(locale) })}
          </p>
          {measured && (
            <p className="ltr-nums text-micro text-content-muted" data-testid="coverage-farm-card-calc">
              {t('coverage.farmCard.calc', { base: baseMinutes, margin, night: nightPct, min: minutes })}
            </p>
          )}
          {farm.notes.trim() && <p className="line-clamp-3 text-micro text-content-secondary" dir="auto">{farm.notes}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {link}
            <Link to={`/coordinator/farms/${farm.id}`} className="btn-secondary min-h-11 flex-1" data-testid="coverage-farm-card-open">
              {t('map.openFarm')}
              <ChevronForward size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
