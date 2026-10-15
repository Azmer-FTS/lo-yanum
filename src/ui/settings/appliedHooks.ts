import { notifyCoordinatorChanged, notifyDerivedChange } from '@core/index'
import { onSettingsApplied } from './applied'
import { loadRegionEdits } from './regionEdits'
import { MAP_LAYERS_KEY, reloadMapLayers } from '../components/mapLayers'
import { reloadStoredBase } from '../components/mapBase'
import { reloadLayoutSync } from '../components/mapMode'
import { reloadIntakeSeen } from '../intake/intakeState'
import { startThemeController } from '../theme'

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
  /* ★★ BI — les couches de la carte, choisies sur un autre appareil. */
  onSettingsApplied([MAP_LAYERS_KEY], () => reloadMapLayers())
  /* ★★★ BJ — les réglages devenus « compte » dont le module garde un cache.
     Les autres (plis, tris, onglets, largeurs) sont relus au prochain montage
     de leur écran — et toujours AVANT le premier rendu au démarrage. */
  onSettingsApplied(['lo-yanum:map-base'], () => reloadStoredBase())
  onSettingsApplied(['lo-yanum:layout-sync'], () => reloadLayoutSync())
  onSettingsApplied(['lo-yanum:intake:seen'], () => reloadIntakeSeen())
  onSettingsApplied(null, (keys) => {
    if (keys.some((k) => k.startsWith('lo-yanum:theme:'))) startThemeController()
  })
}
