import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { farmPoint, nearestLocalityName, nearestLocalityOf, setFarmNearestLocality } from '@core/index'
import type { Farm } from '@core/index'

import { Icon } from '../components/Icon'
import { LocalityField } from '../components/LocalityField'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BC (2026-10-12) — « CETTE FERME EST À CÔTÉ DE … ».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La localité de repère, sur la fiche : sa valeur, d'où elle vient (calculée
 * depuis le point, ou saisie), et le geste pour la corriger — le champ
 * `LocalityField` (les mêmes 1 330 localités, les plus proches de l'épingle à
 * champ vide). Une valeur saisie n'est jamais écrasée par un recalcul ;
 * « חזרה לחישוב » la rend au calcul.
 */
export function NearestLocalityEditor({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const current = nearestLocalityOf(farm)
  const [draft, setDraft] = useState<string | null>(null)
  const point = farmPoint(farm)
  const computed = point ? nearestLocalityName(point) : null
  return (
    <div className="flex flex-col gap-2" data-testid="nearest-locality" data-manual={current?.manual ? 'true' : 'false'} data-value={current?.name ?? ''}>
      <p className="flex flex-wrap items-center gap-2 text-caption">
        <Icon name="pin" size={14} className="shrink-0 text-content-muted" />
        <span className="font-semibold text-content-primary" data-testid="nearest-locality-value">
          {current ? t('farms.near', { place: current.name }) : t('nearest.none')}
        </span>
        {current && <span className="chip bg-surface-high text-micro text-content-secondary">{current.manual ? t('nearest.manual') : t('nearest.computed')}</span>}
      </p>
      {draft === null ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary min-h-11" onClick={() => setDraft(current?.name ?? '')} data-testid="nearest-locality-edit">
            <Icon name="edit" size={14} />
            {t('nearest.edit')}
          </button>
          {current?.manual && point && (
            <button type="button" className="btn-ghost min-h-11" onClick={() => setFarmNearestLocality(farm.id, null)} data-testid="nearest-locality-recompute">
              <Icon name="undo" size={14} />
              {t('nearest.recompute', { place: computed ?? '' })}
            </button>
          )}
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setFarmNearestLocality(farm.id, draft.trim() || null)
            setDraft(null)
          }}
        >
          <LocalityField label={t('nearest.title')} value={draft} onChange={setDraft} near={point} testId="nearest-locality-input" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary min-h-11" data-testid="nearest-locality-save">
              <Icon name="check" size={14} />
              {t('common.save')}
            </button>
            <button type="button" className="btn-ghost min-h-11" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
