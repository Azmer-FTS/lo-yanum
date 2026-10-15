import { SETTINGS, ACCOUNT_KEYS } from '../../storage/registry'
import {
  isSettingsSyncing,
  lastRemoteSetting,
  lastSettingsSyncAt,
  lastSettingsSyncReport,
  settingStamp,
  subscribeSettingsSync,
  syncAccountSettings,
} from '../../storage/account'
import type { SyncReport, SyncTrigger } from '../../storage/account'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ BJ (2026-10-15) — CE FICHIER N'EST PLUS QU'UNE FAÇADE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Il portait depuis AH11.2 la liste ÉCRITE À LA MAIN de ce qui voyageait
 * (`SYNCED_SETTING_KEYS`), celle de ce qui restait (`LOCAL_ONLY_KEYS`), et
 * une synchronisation qui ENVELOPPAIT `localStorage.setItem` pour horodater
 * chaque écriture à l'horloge de l'APPAREIL. Trois pannes (BC, AU1, BI) sont
 * venues d'une clé oubliée de la première liste.
 *
 * Depuis BJ :
 *   · la liste est TIRÉE du registre (`storage/registry.ts`) : tout réglage y
 *     est déclaré, et le défaut est « compte » ;
 *   · le moteur est `storage/account.ts` : une ligne par réglage, horodatée
 *     par le SERVEUR, envoyée sur-le-champ, mise en file hors ligne ;
 *   · plus aucune enveloppe autour de `localStorage` : `writeSetting` prévient
 *     le moteur directement.
 *
 * ⚠️ « CHOISIE SEULEMENT » (AY1.3 · BC · BI) N'EXISTE PLUS. Ces règles
 *    protégeaient un appareil d'un choix d'un autre quand les instants étaient
 *    ceux des appareils. La règle du PO est désormais : le compte gagne (à la
 *    migration), puis chaque choix voyage. `STAMPED_ONLY_KEYS` est vide.
 */
export const THEME_SYNC_KEY = 'lo-yanum:theme:coordinator'
export const MAP_LAYERS_SYNC_KEY = 'lo-yanum:map-layers'
/** Vide depuis BJ (voir l'en-tête). Gardé pour les portes d'AY/BC/BI qui le nomment. */
export const STAMPED_ONLY_KEYS: ReadonlySet<string> = new Set<string>()

/** Les réglages de compte aux clés EXACTES (les familles sont dans le registre). */
export const SYNCED_SETTING_KEYS: readonly string[] = ACCOUNT_KEYS

/** Ce qui reste sur l'appareil, et pourquoi — tiré du registre. */
export const LOCAL_ONLY_KEYS: ReadonlyArray<{ key: string; why: string }> = SETTINGS.filter((d) => d.scope === 'device').map((d) => ({
  key: d.family ? `${d.key}<…>` : d.key,
  why: d.why ?? '',
}))

export type { SyncReport, SyncTrigger }
export { isSettingsSyncing, lastRemoteSetting, lastSettingsSyncAt, lastSettingsSyncReport, settingStamp, subscribeSettingsSync }

/** Une synchronisation des réglages, maintenant. */
export function syncSettings(trigger: SyncTrigger = 'manual'): Promise<SyncReport | null> {
  return syncAccountSettings(trigger)
}

/**
 * ★★ BC → BJ — D'OÙ VIENT LE THÈME APPLIQUÉ, en une phrase que le PO lit dans
 * הגדרות › תצוגה (PURE ; `bcpass` la rejoue) :
 *   · `synced` — clair ou sombre choisi : il suit le compte, sur tous les appareils ;
 *   · `device` — « לפי המכשיר » : chaque appareil suit son propre système
 *                (le CHOIX « selon l'appareil » voyage, lui aussi) ;
 *   · `local`  — build sans compte (jumeau) : rien ne voyage, par construction.
 * `legacy` (un choix d'avant AY1.3 sans instant) n'existe plus depuis BJ : la
 * migration a tranché pour le compte. `accountDiffers` : le compte porte un
 * autre choix que celui de l'appareil (une modification encore en file).
 */
export type ThemeSource = 'synced' | 'device' | 'legacy' | 'local'
export function themeSourceOf(input: { stored: string | null; stamp: number; remote: string | null; connected: boolean }): { source: ThemeSource; accountDiffers: boolean } {
  const explicit = input.stored === 'light' || input.stored === 'dark'
  const remoteExplicit = input.remote === 'light' || input.remote === 'dark' || input.remote === 'system'
  const effective = input.stored ?? 'system'
  const accountDiffers = input.connected && remoteExplicit && input.remote !== effective
  if (!input.connected) return { source: explicit ? 'local' : 'device', accountDiffers: false }
  return { source: explicit ? 'synced' : 'device', accountDiffers }
}
