import type { Role } from './types'

/**
 * Theme policy — PURE. No DOM, no localStorage: this file only decides *what*
 * the theme should be. Reading storage and stamping the document is the UI
 * layer's job (src/ui/theme.tsx), which keeps /src/core portable.
 */

export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_CHOICES: ThemeChoice[] = ['light', 'dark', 'system']

/**
 * Defaults differ by role because the work differs.
 *
 * ★★ Z5.2 (2026-09-07) — THE COORDINATOR ASKS THE DEVICE, AND THE DETECTION
 *    WAS NEVER BROKEN.
 *
 * "Thème selon l'appareil : le PO est en mode sombre sur son iPad et l'app
 *  reste en clair. Corriger la détection (prefers-color-scheme)."
 *
 * Measured before changing anything, on both engines, with the choice stored
 * as `system`: a dark context resolves `--surface-base` to `11 17 25`, a light
 * one to `243 244 246`, and flipping the OS preference on a loaded page moves
 * it live. `prefers-color-scheme` works. What did not work is that nobody was
 * asking it — the coordinator's default was the literal `light`, so an iPad in
 * dark mode opening this app for the first time got a light one and no
 * indication that a question had been answered on its behalf.
 *
 * The default is the device now. It is a DEFAULT: the three pills in הגדרות
 * still hold, and a coordinator who wants light on a dark iPad says so once.
 *
 * ⚠️ THE FIELD ROLES KEEP `dark`, AND THAT IS NOT AN OVERSIGHT. A volunteer
 *    opens this at 21:00 in a desert with no light pollution: a bright screen
 *    ruins night vision and announces a position. That default protects
 *    somebody in the dark from their own phone's daytime setting, which is
 *    the one case where following the device is the wrong answer. They can
 *    still choose "לפי המכשיר" — the switch is in their shell, and the
 *    product owner validated it there.
 */
export function defaultThemeFor(role: Role): ThemeChoice {
  return role === 'coordinator' ? 'system' : 'dark'
}

/**
 * Persisted per role, not globally: the same physical person is a coordinator
 * at a desk and a volunteer in a field, and those want opposite themes.
 */
export function themeStorageKey(role: Role): string {
  return `lo-yanum:theme:${role}`
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** Resolve a choice to the palette actually rendered. */
export function resolveTheme(
  choice: ThemeChoice,
  systemPrefersDark: boolean,
): 'light' | 'dark' {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light'
  return choice
}
