import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { alignDeclaredToOutline, areaGap, keepDeclaredArea } from '@core/index'
import type { Farm } from '@core/index'

import { useLocale } from '../hooks/useLocale'
import { useAreaGapThreshold } from '../settings/areaGap'
import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AD2 (2026-09-08) — LA NOTE D'ÉCART, ET LE SIGNAL QUI LA FAIT TROUVER.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Discrète, pas alarmante — ce n'est pas une erreur, c'est une divergence
 *     à trancher. »
 *
 * ★ ET LA FORMULATION EST LA RAISON MÉTIER, PAS UN RAPPEL DE TÂCHE (AD2.4).
 *   « pensez à mettre à jour » est une phrase qui ne dit pas ce qu'on risque.
 *   Ce qu'on risque est écrit : le chiffre qui va être SIGNÉ et REMIS À L'ÉTAT
 *   n'est pas celui que le contour mesure, et cela se tranche AVANT la remise
 *   du dossier. C'est un garde-fou sur une signature, pas une tâche ménagère.
 *
 * ★ DEUX GESTES, DEUX PHRASES, ET AUCUN DES DEUX N'EST « LE BON ». Le PO peut
 *   décider que le tracé fait foi (« יישור לפי התיחום ») ou que le contrat
 *   fait foi (« שמירת המספר המוצהר ») : l'app n'a pas d'opinion sur laquelle
 *   des deux surfaces est vraie, elle a seulement le devoir de dire qu'elles
 *   diffèrent. Voir `alignDeclaredToOutline` / `keepDeclaredArea`.
 */
export function AreaGapNote({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const threshold = useAreaGapThreshold()
  const [done, setDone] = useState<'aligned' | 'kept' | null>(null)
  const gap = areaGap(farm, threshold)
  if (!gap) {
    /* Le geste vient d'être fait : on le dit une fois, puis la note disparaît
       d'elle-même au rendu suivant que provoquera un autre changement. Sans ce
       mot, un bouton qui fait disparaître son propre bloc est indiscernable
       d'un bouton qui n'a rien fait. */
    if (!done) return null
    return (
      <p
        data-testid="farm-area-gap-done"
        className="mb-3 rounded-card bg-status-success/10 px-3 py-2 text-micro text-status-success-ink"
      >
        {t(done === 'aligned' ? 'farms.gapAligned' : 'farms.gapKept')}
      </p>
    )
  }
  const n = (v: number) => v.toLocaleString(locale)
  return (
    <div
      data-testid="farm-area-gap"
      data-direction={gap.direction}
      /* ⚠️ L'ENCRE D'AVERTISSEMENT, PAS CELLE DU DANGER, et un fond à 10 %
         plutôt qu'un cadre plein : c'est une question ouverte sur une fiche
         par ailleurs saine. Un bloc rouge ici mettrait la moitié d'un rôle de
         198 fiches en état d'alarme, et un tableau où tout crie ne dit rien. */
      className="mb-3 rounded-card bg-status-warn/10 p-3 ring-1 ring-status-warn/30"
    >
      <div className="flex items-start gap-2">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-status-warn-ink" />
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-content-primary">
            {t('farms.gapTitle')}
          </p>
          <p className="muted mt-0.5">
            {t('farms.gapBody', {
              declared: n(gap.declared.total),
              measured: n(gap.measured.total),
              delta: n(Math.abs(gap.deltaDunams)),
              percent: Math.round(gap.ratio * 100),
            })}
          </p>
          <p className="muted mt-1">
            {t(gap.direction === 'short' ? 'farms.gapWhyShort' : 'farms.gapWhyOver')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost py-1"
              data-testid="farm-area-gap-align"
              onClick={() => {
                alignDeclaredToOutline(farm.id)
                setDone('aligned')
              }}
            >
              {t('farms.gapAlign')}
            </button>
            <button
              type="button"
              className="btn-ghost py-1"
              data-testid="farm-area-gap-keep"
              onClick={() => {
                keepDeclaredArea(farm.id)
                setDone('kept')
              }}
            >
              {t('farms.gapKeep')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * AD2.5 — le signal discret de la liste et du tableau.
 *
 * ⚠️ MÊME GRAMMAIRE QUE `NeglectMark`, ET C'EST DÉLIBÉRÉ : un anneau de 8 px
 *    dans l'encre d'avertissement. Deux marques qui se ressemblent sur une
 *    rangée sont deux marques qu'on apprend en une fois ; deux inventions
 *    différentes sont deux choses à retenir. Celle-ci est PLEINE et carrée aux
 *    angles adoucis, la ferme oubliée est ronde — un coup d'œil suffit à les
 *    séparer sans avoir à les nommer.
 */
export function AreaGapMark({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const threshold = useAreaGapThreshold()
  const gap = areaGap(farm, threshold)
  if (!gap) return null
  const label = `${t('farms.gapMark')} — ${Math.round(gap.ratio * 100)}%`
  return (
    <span
      data-testid="farm-area-gap-mark"
      data-direction={gap.direction}
      title={label}
      aria-label={label}
      className="inline-block size-2 shrink-0 rounded-[2px] border border-status-warn-ink/70 bg-status-warn-ink/45"
    />
  )
}
