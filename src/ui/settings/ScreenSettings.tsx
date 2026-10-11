import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../components/Icon'
import { TitleWithInfo } from '../components/InfoTip'
import { Modal } from '../components/primitives'
import { AgreementDocSection } from './AgreementDocSection'
import { AgreementTemplateSection } from './AgreementTemplateSection'
import { AreaGapSection } from './AreaGapSection'
import { CoverageSection } from './CoverageSection'
import { RemindersSection } from './RemindersSection'
import { RenewalSection } from './RenewalSection'
import { SummonsSection } from './SummonsSection'
import { VigilSection } from './VigilSection'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AY12.3 (2026-10-11) — LES RÉGLAGES MÉTIER REJOIGNENT LEUR ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'inventaire d'AX l'avait relevé : le seuil d'oubli d'une ferme, l'écart de
 * surface, le délai de renouvellement et le document de signature se
 * réglaient dans הגדרות, loin des fermes ; les délais de silence et le SMS de
 * convocation, loin des gardes. Ils se règlent désormais LÀ où ils agissent
 * (חוות › ⋯ › « הגדרות החוות », שמירות › ⋯ › « הגדרות השמירות »). הגדרות
 * garde l'appareil, le compte, la carte et les données — et un renvoi vers
 * ces deux fenêtres, pour qui les y cherche encore.
 *
 * Les sections sont les MÊMES composants (rien n'est recopié) : un réglage
 * ne peut pas dire deux choses à deux endroits.
 */
export type SettingsScope = 'farms' | 'missions'

export function ScreenSettingsDialog({ scope, onClose }: { scope: SettingsScope; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal title={t(`screenSettings.${scope}.title`)} onClose={onClose} wide testId={`screen-settings-${scope}`}>
      <p className="muted -mt-1 mb-2 text-caption">{t(`screenSettings.${scope}.hint`)}</p>
      {scope === 'farms' ? (
        <>
          <CoverageSection />
          <AreaGapSection />
          <RenewalSection />
          <AgreementDocSection />
          <AgreementTemplateSection />
        </>
      ) : (
        <>
          <VigilSection />
          <RemindersSection />
          <SummonsSection />
        </>
      )}
    </Modal>
  )
}

/** L'entrée d'un menu ⋯ et sa fenêtre : `const s = useScreenSettings('farms')`. */
export function useScreenSettings(scope: SettingsScope) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return {
    item: { key: `settings-${scope}`, icon: 'switch' as const, label: t(`screenSettings.${scope}.title`), onClick: () => setOpen(true), testId: `open-screen-settings-${scope}` },
    dialog: open ? <ScreenSettingsDialog scope={scope} onClose={() => setOpen(false)} /> : null,
  }
}

/** Dans הגדרות : le renvoi vers les deux fenêtres (et elles s'ouvrent ici aussi). */
export function MovedSettingsNotice() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<SettingsScope | null>(null)
  return (
    <section className="mt-6 rounded-card bg-surface-raised p-4 shadow-card" data-testid="settings-moved">
      <TitleWithInfo as="p" info={t('screenSettings.moved.hint')} className="text-caption font-semibold text-content-primary" testId="settings-moved-info">
        {t('screenSettings.moved.title')}
      </TitleWithInfo>
      <div className="mt-3 flex flex-wrap gap-2">
        {(['farms', 'missions'] as const).map((s) => (
          <button key={s} type="button" className="btn-secondary min-h-11" onClick={() => setOpen(s)} data-testid={`settings-moved-${s}`}>
            <Icon name={s === 'farms' ? 'farm' : 'shield'} size={16} />
            {t(`screenSettings.${s}.title`)}
          </button>
        ))}
      </div>
      {open && <ScreenSettingsDialog scope={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
