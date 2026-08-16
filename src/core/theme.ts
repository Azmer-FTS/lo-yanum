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
 * The coordinator works a data-dense back-office in daylight, where a dark UI
 * costs legibility for no benefit. The field roles open the app at 21:00 in a
 * desert with no light pollution, where a bright screen ruins night vision and
 * announces your position. Either can override; only the starting point differs.
 */
export function defaultThemeFor(role: Role): ThemeChoice {
  return role === 'coordinator' ? 'light' : 'dark'
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
