import { useCallback, useEffect, useState } from 'react'

import {
  defaultThemeFor,
  getSession,
  isThemeChoice,
  resolveTheme,
  themeStorageKey,
} from '@core/index'
import type { Role, ThemeChoice } from '@core/index'

import { useCoreValue } from './hooks/useCore'

/**
 * Theme application — the DOM half of the theme system.
 *
 * `src/core/theme.ts` decides what the theme should be; this file reads
 * localStorage, listens to the OS preference, and stamps `data-theme` on the
 * document. Keeping the split means /src/core never touches a Web API.
 *
 * The attribute is the ONLY switch: `tokens.css` swaps values under
 * `[data-theme='dark']`, and no component ever branches on the theme.
 */

const MEDIA = '(prefers-color-scheme: dark)'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MEDIA).matches
}

function readStored(role: Role): ThemeChoice {
  try {
    const raw = localStorage.getItem(themeStorageKey(role))
    if (isThemeChoice(raw)) return raw
  } catch {
    // Private browsing / disabled storage: fall through to the role default.
  }
  return defaultThemeFor(role)
}

/**
 * "system" sets NO attribute, letting the media query in tokens.css decide.
 * An explicit choice stamps the attribute, and the `:not([data-theme='light'])`
 * guard in the media query means explicit light still wins on a dark OS.
 */
function applyToDocument(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)

  // Keep the PWA / browser chrome colour in step with the palette.
  const resolved = resolveTheme(choice, systemPrefersDark())
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    // The two `--surface-base` values. Duplicated as literals because the meta
    // tag needs a colour before any stylesheet has necessarily applied; keep
    // them in step with tokens.css by hand.
    meta.setAttribute('content', resolved === 'dark' ? '#0C1220' : '#F2F4F8')
  }
}

export interface ThemeState {
  choice: ThemeChoice
  resolved: 'light' | 'dark'
  setChoice: (next: ThemeChoice) => void
}

/**
 * Reads the current role from the core session, so switching identity in the
 * dev toolbar also switches to that role's theme — which is exactly what a
 * demo needs to show "coordinator = light, field = dark".
 */
export function useTheme(): ThemeState {
  const session = useCoreValue(getSession)
  const role = session.role

  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStored(role))
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Re-read when the role changes: each role remembers its own preference.
  useEffect(() => {
    const stored = readStored(role)
    setChoiceState(stored)
    applyToDocument(stored)
  }, [role])

  // Follow the OS while the choice is "system".
  useEffect(() => {
    const mq = window.matchMedia(MEDIA)
    const onChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches)
      if (choice === 'system') applyToDocument('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [choice])

  const setChoice = useCallback(
    (next: ThemeChoice) => {
      setChoiceState(next)
      applyToDocument(next)
      try {
        localStorage.setItem(themeStorageKey(role), next)
      } catch {
        // Storage unavailable — the choice still applies for this session.
      }
    },
    [role],
  )

  return { choice, resolved: resolveTheme(choice, systemDark), setChoice }
}

/**
 * Applies the stored theme before first paint, so the app never flashes the
 * wrong palette. Called from main.tsx with the session's initial role.
 */
export function initTheme(role: Role): void {
  applyToDocument(readStored(role))
}
