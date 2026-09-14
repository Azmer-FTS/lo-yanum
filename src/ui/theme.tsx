import { useSyncExternalStore } from 'react'

import {
  defaultThemeFor,
  getSession,
  isThemeChoice,
  resolveTheme,
  subscribe as subscribeCore,
  themeStorageKey,
} from '@core/index'
import type { Role, ThemeChoice } from '@core/index'

/**
 * Theme application — the DOM half of the theme system.
 *
 * `src/core/theme.ts` decides what the theme should be; this file reads
 * localStorage, listens to the OS preference, and stamps `data-theme` on the
 * document. Keeping the split means /src/core never touches a Web API.
 *
 * The attribute is the ONLY switch: `tokens.css` swaps values under
 * `[data-theme='dark']`, and no component ever branches on the theme.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AI6 (2026-09-14) — « LE THÈME SYSTÈME NE SUIT TOUJOURS PAS », ET Z5.2
 *    AVAIT RAISON SUR LA DÉTECTION ET TORT SUR LA CONCLUSION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mesuré sur le DÉPLOYÉ avant correction (`bun run aitheme` rejoue la même
 * séquence) : appareil SOMBRE, réglage du coordinateur `system`, et l'écran
 * peint `243 244 246` — le clair. `prefers-color-scheme` répondait `true`.
 *
 * ⚠️★★ LA CAUSE N'ÉTAIT PAS LA DÉTECTION, C'ÉTAIT QUI APPLIQUE. Le thème était
 *    appliqué par un HOOK, `useTheme`, et seuls deux composants le montaient :
 *    le sélecteur du shell de TERRAIN et la section « תצוגה » des réglages.
 *    Aucun écran du coordinateur. Donc :
 *
 *    1. « voir comme » un volontaire monte le shell de terrain, qui estampille
 *       le choix du VOLONTAIRE (`dark` par défaut, `light` si on l'a pressé) ;
 *    2. le retour au rôle de rekaz démonte ce shell… et rien ne réapplique le
 *       choix du coordinateur. L'attribut du rôle visité reste collé sur
 *       `<html>` jusqu'au prochain lancement ou à la prochaine ouverture des
 *       réglages ;
 *    3. un attribut explicite GAGNE sur la requête média — c'est voulu, c'est
 *       ce qui permet « clair sur un iPad sombre » — donc au coucher du
 *       soleil, l'appareil bascule et l'app ne bouge pas.
 *
 *    Et une application installée sur un iPad n'est presque jamais relancée :
 *    elle revient d'arrière-plan. Le « prochain lancement » n'arrive pas.
 *
 * ★★ LE CORRECTIF EST STRUCTUREL : UN SEUL CONTRÔLEUR, INSTALLÉ AU DÉMARRAGE
 *    (`startThemeController`, appelé par main.tsx), ET PLUS AUCUN COMPOSANT
 *    N'APPLIQUE QUOI QUE CE SOIT. Il réapplique :
 *    · quand le RÔLE de la session change (abonné au magasin, pas à un écran) ;
 *    · quand l'appareil change de préférence (`change` sur la requête média) ;
 *    · au RETOUR D'ARRIÈRE-PLAN (`visibilitychange`, `pageshow`, `focus`) —
 *      ceinture et bretelles pour une vue web installée dont l'événement
 *      `change` a pu tomber pendant qu'elle dormait ;
 *    · quand un autre onglet modifie le choix (`storage`).
 *
 * ★ ET LE CHOIX EST UNE SEULE VALEUR PARTAGÉE. Chaque `useTheme` gardait son
 *   propre `useState` : le sélecteur du shell pouvait croire « system » quand
 *   les réglages venaient d'enregistrer « light », et réappliquer « system »
 *   au premier changement de l'appareil. Tous lisent désormais le même
 *   instantané (`useSyncExternalStore`).
 */

const MEDIA = '(prefers-color-scheme: dark)'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(MEDIA).matches
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
  /* ★ AI6 — le CHOIX est publié à côté, pour qu'une mesure (la porte, ou la
     ligne de diagnostic des réglages) puisse lire les trois valeurs sans
     déduire l'une des autres. Aucun style ne s'y accroche. */
  root.setAttribute('data-theme-choice', choice)

  // Keep the PWA / browser chrome colour in step with the palette. READ the
  // token rather than restating it: Lot 0.8 found the two literals that used to
  // live here still holding Lot 0.7's navy, because nothing fails when a meta
  // tag drifts. The attribute above is already set, so the computed value is the
  // resolved theme's `--surface-base`; only the boot value in index.html is a
  // literal now, and being one frame stale there is invisible.
  // `:not([media])` — PO point 1. index.html now carries two media-scoped
  // `theme-color` tags for the installed app's status bar, which iOS reads at
  // launch, plus this unscoped one for anything that honours a live change.
  // Selecting the first `theme-color` would overwrite the light-scheme tag and
  // put the dark navy back behind the clock in the light theme.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])')
  if (meta) {
    const base = getComputedStyle(root).getPropertyValue('--surface-base').trim()
    if (base) meta.setAttribute('content', `rgb(${base})`)
  }
}

/* ── L'instantané partagé ─────────────────────────────────────────────── */

interface Snapshot {
  role: Role
  choice: ThemeChoice
  systemDark: boolean
}

let snapshot: Snapshot = { role: 'coordinator', choice: 'system', systemDark: false }
const listeners = new Set<() => void>()

function publish(next: Snapshot): void {
  if (
    next.role === snapshot.role &&
    next.choice === snapshot.choice &&
    next.systemDark === snapshot.systemDark
  ) {
    return
  }
  snapshot = next
  for (const fn of listeners) fn()
}

/**
 * Relit TOUT (rôle, choix enregistré, appareil) et applique. Idempotent : c'est
 * la seule fonction que chaque déclencheur appelle, de sorte qu'aucun ne peut
 * appliquer autre chose que l'état réel.
 */
function sync(): void {
  const role = getSession().role
  const choice = readStored(role)
  applyToDocument(choice)
  publish({ role, choice, systemDark: systemPrefersDark() })
}

let started = false

/**
 * Applies the stored theme before first paint, so the app never flashes the
 * wrong palette, AND keeps it applied for the life of the page. Called once
 * from main.tsx, before React mounts.
 */
export function startThemeController(): void {
  sync()
  if (started || typeof window === 'undefined') return
  started = true

  subscribeCore(() => {
    if (getSession().role !== snapshot.role) sync()
  })
  window.matchMedia?.(MEDIA).addEventListener?.('change', sync)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync()
  })
  window.addEventListener('pageshow', sync)
  window.addEventListener('focus', sync)
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key.startsWith('lo-yanum:theme:')) sync()
  })
}

export interface ThemeState {
  choice: ThemeChoice
  resolved: 'light' | 'dark'
  systemDark: boolean
  setChoice: (next: ThemeChoice) => void
}

function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const getSnapshot = (): Snapshot => snapshot

function setChoice(next: ThemeChoice): void {
  const role = getSession().role
  try {
    localStorage.setItem(themeStorageKey(role), next)
  } catch {
    // Storage unavailable — the choice still applies for this session.
    applyToDocument(next)
    publish({ role, choice: next, systemDark: systemPrefersDark() })
    return
  }
  sync()
}

/**
 * The current role's choice, shared by every caller. Applying is NOT this
 * hook's job any more — see the AI6 note at the top of the file.
 */
export function useTheme(): ThemeState {
  const s = useSyncExternalStore(subscribeTheme, getSnapshot, getSnapshot)
  return {
    choice: s.choice,
    systemDark: s.systemDark,
    resolved: resolveTheme(s.choice, s.systemDark),
    setChoice,
  }
}
