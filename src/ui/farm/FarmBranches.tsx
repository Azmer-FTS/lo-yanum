import { useTranslation } from 'react-i18next'

import { FARM_BRANCHES, branchesOf, branchesToConfirm, confirmBranches, toggleBranch } from '@core/index'
import type { FarmBranch, FarmBranchKind } from '@core/index'

import { Icon } from '../components/Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BC (2026-10-12) — LA NATURE DE L'EXPLOITATION, À L'ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `BranchChips` — la lecture (tableau, aperçu, vignette) : une pastille par
 * nature ; une valeur « à confirmer » a un contour pointillé et un « ? ».
 * `BranchEditor` — l'édition (fiche de la ferme, contact à traiter) : les neuf
 * natures en pastilles de 44 px ; toucher une absente l'ajoute (validée),
 * toucher une « à confirmer » la VALIDE, toucher une validée la retire ;
 * « אישור הכל » quand il en reste à confirmer.
 */

export function branchLabel(t: (k: string) => string, kind: FarmBranchKind): string {
  return t(`branches.kind.${kind}`)
}

/** « בקר · צאן? » — la forme texte (sous le nom quand la colonne a cédé, export). */
export function branchText(t: (k: string) => string, e: { branches?: readonly FarmBranch[] }): string {
  return branchesOf(e)
    .map((b) => `${branchLabel(t, b.kind)}${b.toConfirm ? '?' : ''}`)
    .join(' · ')
}

export function BranchChips({ entity, testId }: { entity: { branches?: readonly FarmBranch[] }; testId?: string }) {
  const { t } = useTranslation()
  const list = branchesOf(entity)
  if (list.length === 0) return <span className="text-content-muted">—</span>
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1" data-testid={testId} data-branches={list.map((b) => `${b.kind}${b.toConfirm ? '?' : ''}`).join(',')}>
      {list.map((b) => (
        <span
          key={b.kind}
          title={b.toConfirm ? t('branches.toConfirm') : undefined}
          className={`chip text-micro ${b.toConfirm ? 'border border-dashed border-status-warn-ink/60 bg-transparent text-content-secondary' : 'bg-surface-high text-content-primary'}`}
        >
          {branchLabel(t, b.kind)}
          {b.toConfirm && <span aria-label={t('branches.toConfirm')}>?</span>}
        </span>
      ))}
    </span>
  )
}

export function BranchEditor({
  value,
  onChange,
  testId = 'branch-editor',
}: {
  value: readonly FarmBranch[] | undefined
  onChange: (next: FarmBranch[]) => void
  testId?: string
}) {
  const { t } = useTranslation()
  const list = branchesOf({ branches: value ? [...value] : [] })
  const pending = branchesToConfirm({ branches: list })
  return (
    <div className="flex flex-col gap-2" data-testid={testId} data-to-confirm={pending.length}>
      <div role="group" aria-label={t('branches.title')} className="pill-row">
        {FARM_BRANCHES.map((kind) => {
          const own = list.find((b) => b.kind === kind)
          const state = !own ? 'off' : own.toConfirm ? 'confirm' : 'on'
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={state !== 'off'}
              onClick={() => onChange(toggleBranch(list, kind))}
              data-testid={`${testId}-${kind}`}
              data-state={state}
              className={`filter-pill min-h-11 px-3 text-caption ${
                state === 'on' ? 'filter-pill-active' : state === 'confirm' ? '!border-dashed !border-status-warn-ink/70 !bg-status-warn/10 text-content-primary' : ''
              }`}
            >
              {state === 'on' && <Icon name="check" size={12} />}
              {branchLabel(t, kind)}
              {state === 'confirm' && <span className="text-micro font-semibold text-status-warn-ink">· {t('branches.toConfirm')}</span>}
            </button>
          )
        })}
      </div>
      {pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="muted min-w-0 flex-1 text-caption">{t('branches.hint')}</p>
          <button type="button" className="btn-secondary min-h-11" onClick={() => onChange(confirmBranches(list))} data-testid={`${testId}-confirm-all`}>
            <Icon name="check" size={14} />
            {t('branches.confirmAll')}
          </button>
        </div>
      )}
    </div>
  )
}
