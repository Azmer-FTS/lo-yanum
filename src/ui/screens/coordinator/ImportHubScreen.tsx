import { Suspense, lazy } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { PageHeader } from '../../components/primitives'
import { InstitutionsImportScreen } from './InstitutionsImportScreen'
import { PortalImportScreen } from './PortalImportScreen'

const ImportWizardScreen = lazy(() => import('./ImportWizardScreen').then((m) => ({ default: m.ImportWizardScreen })))
const SheetImportScreen = lazy(() => import('./SheetImportScreen').then((m) => ({ default: m.SheetImportScreen })))

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AY12.1 (2026-10-11) — UN SEUL ÉCRAN D'IMPORT, AU LIEU DE SEPT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'inventaire d'AX (D11) comptait huit portes d'import, chacune son
 * adresse, reliées par une barre d'onglets de six fichiers qui ne disait pas
 * à quoi servait chacun. Ici : ① CE QU'ON IMPORTE (des cartes groupées par ce
 * que le fichier contient — des gens, des institutions, des fermes — avec une
 * ligne qui dit d'où vient le fichier), ② l'importeur de ce fichier, en
 * place. Les anciennes adresses mènent ici, le fichier déjà choisi.
 */
export type HubKind = 'volunteers' | 'drivers' | 'institutions' | 'farms' | 'prospection' | 'signatures' | 'association' | 'portal'

const GROUPS: Array<{ key: string; kinds: Array<{ kind: HubKind; icon: IconName }> }> = [
  { key: 'people', kinds: [{ kind: 'volunteers', icon: 'users' }, { kind: 'drivers', icon: 'steering' }] },
  { key: 'institutions', kinds: [{ kind: 'institutions', icon: 'school' }] },
  {
    key: 'farms',
    kinds: [
      { kind: 'farms', icon: 'farm' },
      { kind: 'portal', icon: 'download' },
      { kind: 'prospection', icon: 'table' },
      { kind: 'signatures', icon: 'edit' },
      { kind: 'association', icon: 'document' },
    ],
  },
]
export const HUB_KINDS: readonly HubKind[] = GROUPS.flatMap((g) => g.kinds.map((k) => k.kind))

export function ImportHubScreen() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const raw = params.get('kind')
  const kind = (HUB_KINDS as readonly string[]).includes(raw ?? '') ? (raw as HubKind) : null
  const choose = (k: HubKind | null) => {
    const next = new URLSearchParams(params)
    if (k) next.set('kind', k)
    else next.delete('kind')
    setParams(next)
  }

  return (
    <div className="mx-auto max-w-5xl" data-testid="import-hub" data-kind={kind ?? ''}>
      {!kind ? (
        <>
          <PageHeader title={t('importHub.title')} info={<p>{t('importHub.info')}</p>} back={{ to: '/coordinator', label: t('nav.dashboard') }} />
          <p className="mt-2 text-body font-semibold text-content-primary">① {t('importHub.what')}</p>
          {GROUPS.map((g) => (
            <section key={g.key} className="mt-4" data-testid={`import-group-${g.key}`}>
              <h2 className="mb-2 text-section text-content-secondary">{t(`importHub.group.${g.key}`)}</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.kinds.map(({ kind: k, icon }) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => choose(k)}
                    className="flex min-h-[4.5rem] items-start gap-3 rounded-card bg-surface-raised p-3 text-start shadow-card hover:bg-surface-high"
                    data-testid={`import-choose-${k}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-accent/15 text-accent-ink">
                      <Icon name={icon} size={20} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-caption font-semibold text-content-primary">{t(`importHub.kind.${k}.title`)}</span>
                      <span className="block text-micro text-content-muted">{t(`importHub.kind.${k}.hint`)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      ) : (
        <>
          {/* ① reste lisible en une ligne, et se change d'un toucher. */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-card bg-surface-raised px-3 py-2 shadow-card" data-testid="import-chosen">
            <span className="text-caption text-content-muted">① {t('importHub.chosen')}</span>
            <span className="text-caption font-semibold text-content-primary">{t(`importHub.kind.${kind}.title`)}</span>
            <button type="button" className="btn-ghost ms-auto min-h-11" onClick={() => choose(null)} data-testid="import-change">
              <Icon name="switch" size={15} />
              {t('importHub.change')}
            </button>
          </div>
          <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
            {kind === 'institutions' ? (
              <InstitutionsImportScreen />
            ) : kind === 'portal' ? (
              <PortalImportScreen />
            ) : kind === 'prospection' || kind === 'signatures' || kind === 'association' ? (
              <SheetImportScreen key={kind} kind={kind} />
            ) : (
              <ImportWizardScreen key={kind} kind={kind} />
            )}
          </Suspense>
        </>
      )}
    </div>
  )
}
