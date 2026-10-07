import { notifyCoordinatorChanged, notifyDerivedChange } from '@core/index'
import { onSettingsApplied } from './applied'
import { loadRegionEdits } from './regionEdits'

/**
 * ★ AS4 — les deux réglages dont le module n'est pas dans `ui/settings/` avec
 * un cache à lui : les régions (posées dans `@core` par `setRegionRings`) et
 * la carte du coordinateur (`core/profile.ts`, lue à chaque appel mais dont
 * les écrans n'apprennent le changement que par son abonnement).
 */
let installed = false
export function installSettingsAppliedHooks(): void {
  if (installed) return
  installed = true
  onSettingsApplied(['lo-yanum:region-rings'], () => {
    loadRegionEdits()
    notifyDerivedChange()
  })
  onSettingsApplied(['lo-yanum:coordinator'], () => notifyCoordinatorChanged())
}
