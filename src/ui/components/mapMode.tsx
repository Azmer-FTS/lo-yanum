import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'

/**
 * P0.1 — THE MAP IS MODULAR ON EVERY MAP-FIRST SCREEN.
 *
 * The product owner works one-handed on an iPad in a truck. Sometimes the
 * geography IS the question ("who is near this incident") and the list is in
 * the way; sometimes he is reading a roster and the map is stealing 60 % of a
 * 1032 px portrait screen for nothing. Lot 0.9's answer was a collapse button
 * that only existed below `lg`, which is precisely the width where it was
 * least needed.
 *
 * Three states, switchable by visible buttons, on every map-first screen:
 *
 *   · `hidden` (מוסתר) — no map; the content takes the whole shell.
 *   · `split`  (מפוצל) — the Lot 0.9 reading, and still the default.
 *   · `full`   (מלא)   — no content; the map takes the whole shell.
 *
 * Deliberately NOT the same thing as `useMapFullscreen`. That one is a
 * viewport-takeover OVERLAY armed from inside the map's own toolbar, for the
 * minutes of precise clicking a zone costs; this is the screen's own layout,
 * it survives navigation, and it is what the coordinator sets once for the
 * way he happens to be working today. The two compose: `full` + the overlay
 * is simply the biggest the map gets.
 *
 * WHY THE MAP STAYS MOUNTED IN `hidden`
 * -------------------------------------
 * The wrapper is `display:none`, not unmounted. Unmounting tears down the
 * WebGL context and the camera with it, so a coordinator who hides the map to
 * read a list and brings it back lands on the fitted default instead of the
 * corner of the Negev he had panned to. MapCanvas's ResizeObserver already
 * fires on the 0 → size transition and calls `map.resize()`, which is the
 * whole cost of coming back.
 *
 * The state is per SCREEN and persisted in localStorage (sessionStorage would
 * lose it every time iPadOS reaps the tab, which is most of the day).
 */
export type MapMode = 'hidden' | 'split' | 'full'

const MODES: readonly MapMode[] = ['hidden', 'split', 'full'] as const

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ Y4 (2026-09-06) — "סנכרון פריסה". ONE LAYOUT, OR ONE PER SCREEN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Aujourd'hui chaque écran garde sa propre répartition carte/contenu. Le PO
 *  veut pouvoir choisir… synchronisé : la disposition choisie s'applique
 *  IMMÉDIATEMENT à tous les écrans concernés ; libre : comportement actuel."
 *
 * ★ IT IS A CHANGE OF KEY AND NOTHING ELSE, which is why it is here rather
 *   than in every screen. `free` reads and writes `…:map-mode:farms`; `synced`
 *   reads and writes `…:map-mode:__all__`. Every screen goes on calling
 *   `useMapMode(screenKey)` and knows nothing about the setting, so there is
 *   no screen that can forget to honour it.
 *
 * ★ AND THE RATIO TRAVELS WITH IT (brief point 3): dragging the seam in
 *   `synced` moves it everywhere, because the seam writes the same shared key.
 *
 * ★ DEFAULT `free` — the behaviour that exists (brief point 2). A device that
 *   has never seen this setting behaves exactly as it did.
 *
 * ⚠️ THE SWITCH IS LIVE, hence the listener set. Nothing else in this app
 *    needs it — only one map screen is mounted at a time — but a setting that
 *    silently needs a reload is the kind of thing that is discovered on an
 *    iPad in a truck.
 */
export type LayoutSync = 'free' | 'synced'

const SYNC_KEY = 'lo-yanum:layout-sync'
/** The screen key every screen shares while the layouts are synchronised. */
const SHARED = '__all__'
/**
 * ★★ Z5.3 (2026-09-07) — WHICH LAYOUT "THE LAYOUT" IS.
 *
 * The last map screen this device was on. See `writeLayoutSync`: turning
 * synchronisation ON has to spread a layout, and the only honest candidate is
 * the one the coordinator was last looking at — הגדרות has no map of its own
 * to read the answer from.
 */
const LAST_KEY = 'lo-yanum:map-last'

const syncListeners = new Set<() => void>()

export function readLayoutSync(): LayoutSync {
  try {
    return localStorage.getItem(SYNC_KEY) === 'synced' ? 'synced' : 'free'
  } catch {
    return 'free'
  }
}

/**
 * ★★ Z5.3 (2026-09-07) — "ELLE DOIT S'APPLIQUER IMMÉDIATEMENT À TOUS LES
 *    ÉCRANS, SANS RECHARGER" — AND THE RELOAD WAS NOT THE MECHANISM.
 *
 * Driven on both engines before changing anything: farms set to `hidden`,
 * `synced` pressed in הגדרות, then farms opened again — the map came back,
 * with no reload. The switch has been live since Y4 and still is.
 *
 * What it did NOT do is spread anything. `__all__` had never been written, so
 * turning synchronisation on sent every screen to the DEFAULT `split` at
 * whatever the default ratio is — the coordinator's own arrangement replaced
 * by the factory one, on every screen at once. Read from his seat that is
 * "the setting did nothing / did the wrong thing", and setting one screen by
 * hand afterwards makes it look as though a reload was what fixed it.
 *
 * Switching ON now SEEDS the shared scope from the last map screen this device
 * was on, which is what "la disposition choisie s'applique à tous les écrans"
 * says. Switching back to `free` touches nothing: every screen's own key is
 * still where it was, so the two states are reversible.
 */
export function writeLayoutSync(next: LayoutSync): void {
  try {
    if (next === 'free') {
      localStorage.removeItem(SYNC_KEY)
    } else {
      const from = localStorage.getItem(LAST_KEY)
      if (from) {
        const mode = localStorage.getItem(storageKey(from))
        if (mode !== null) localStorage.setItem(storageKey(SHARED), mode)
        const ratio = localStorage.getItem(ratioKey(from))
        if (ratio !== null) localStorage.setItem(ratioKey(SHARED), ratio)
      }
      localStorage.setItem(SYNC_KEY, 'synced')
    }
  } catch {
    // Persistence is a convenience; the switch still takes effect this session.
  }
  for (const fn of syncListeners) fn()
}

function subscribeSync(listener: () => void): () => void {
  syncListeners.add(listener)
  return () => {
    syncListeners.delete(listener)
  }
}

export function useLayoutSync(): LayoutSync {
  return useSyncExternalStore(subscribeSync, readLayoutSync, () => 'free' as LayoutSync)
}

const storageKey = (screenKey: string) => `lo-yanum:map-mode:${screenKey}`

function readMode(screenKey: string): MapMode {
  try {
    const raw = localStorage.getItem(storageKey(screenKey))
    return MODES.includes(raw as MapMode) ? (raw as MapMode) : 'split'
  } catch {
    // Private mode, or storage disabled. The default is a working screen.
    return 'split'
  }
}

export interface MapModeState {
  mode: MapMode
  setMode: (mode: MapMode) => void
}

/**
 * P0bis.2 — THE SEAM IS DRAGGABLE, AND THE RATIO IS REMEMBERED PER SCREEN.
 *
 * The three states answer "do I want geography at all"; the ratio answers "how
 * much", and the honest answer changes by screen and by task. A fixed 2/3 map
 * is right on the incidents map and wrong on a 300-row roster, and the product
 * owner is the only one who knows which he is doing today.
 *
 * The value stored is the CONTENT column's percentage of the row, bounded to
 * 25–75: past either end one of the two panels stops being usable and starts
 * being a stripe, and a splitter that can be dragged into a dead end is a
 * splitter that gets dragged into one on a moving vehicle.
 *
 * Same key space and same failure mode as the mode itself: persistence is a
 * convenience, and losing it must not break the screen.
 */
export const RATIO_MIN = 25
export const RATIO_MAX = 75

const ratioKey = (screenKey: string) => `lo-yanum:map-ratio:${screenKey}`

export const clampRatio = (value: number) =>
  Math.min(RATIO_MAX, Math.max(RATIO_MIN, value))

function readRatio(screenKey: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(ratioKey(screenKey))
    if (raw === null) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? clampRatio(n) : fallback
  } catch {
    return fallback
  }
}

export interface MapRatioState {
  /** Percentage of the row taken by the CONTENT column. */
  ratio: number
  setRatio: (ratio: number) => void
  /** Back to the screen's own default — the double-tap gesture. */
  reset: () => void
}

export function useMapRatio(screenKey: string, fallback: number): MapRatioState {
  const sync = useLayoutSync()
  const scope = sync === 'synced' ? SHARED : screenKey
  const [ratio, setRatioState] = useState<number>(() => readRatio(scope, fallback))

  // The switch flipped while this screen was on: re-read under the new scope.
  useEffect(() => {
    setRatioState(readRatio(scope, fallback))
  }, [scope, fallback])

  const setRatio = useCallback(
    (next: number) => {
      const clamped = clampRatio(next)
      setRatioState(clamped)
      try {
        localStorage.setItem(ratioKey(scope), String(Math.round(clamped * 10) / 10))
      } catch {
        // See useMapMode: persistence is a convenience.
      }
    },
    [scope],
  )

  const reset = useCallback(() => {
    setRatioState(fallback)
    try {
      localStorage.removeItem(ratioKey(scope))
    } catch {
      // Same.
    }
  }, [scope, fallback])

  return { ratio, setRatio, reset }
}

export function useMapMode(screenKey: string): MapModeState {
  const sync = useLayoutSync()
  const scope = sync === 'synced' ? SHARED : screenKey
  const [mode, setModeState] = useState<MapMode>(() => readMode(scope))

  /* Z5.3 — remember which map screen this device was last on, so הגדרות has
     a layout to spread when synchronisation is switched on. */
  useEffect(() => {
    try {
      localStorage.setItem(LAST_KEY, screenKey)
    } catch {
      // Same as every other write here: a convenience, never a requirement.
    }
  }, [screenKey])

  useEffect(() => {
    setModeState(readMode(scope))
  }, [scope])

  const setMode = useCallback(
    (next: MapMode) => {
      setModeState(next)
      try {
        localStorage.setItem(storageKey(scope), next)
      } catch {
        // Persistence is a convenience; losing it must not break the screen.
      }
    },
    [scope],
  )

  return { mode, setMode }
}

const MODE_ICON: Record<MapMode, 'menu' | 'columns' | 'map'> = {
  hidden: 'menu',
  split: 'columns',
  full: 'map',
}

/*
 * ★ W5 (2026-09-02) — `MapModeSwitch`, THE ROW OF THREE LABELLED PILLS, IS
 *   DELETED. It existed twice on every map-first screen (once at the top of
 *   the content in `hidden`, once in the map's own bar) and the product
 *   owner used neither: the fixed pill below never moves between the three
 *   modes, which is the whole reason it was built. Two controls saying the
 *   same thing, one of them eating the first line of every roster.
 */

/**
 * U4.4 (2026-09-02) — THE FLOATING MODE PILL. Three icon buttons in one
 * frosted pill, fixed to the viewport's bottom, the same spot in every mode.
 * Labels on `title` / `aria-label`; the active mode is filled.
 *
 * ★★ Y3.3 (2026-09-04) — HORIZONTAL, AND BESIDE THE "+" RATHER THAN ABOVE IT.
 *
 *    "Les trois boutons de mode passent EN BAS, à l'HORIZONTALE, à côté du
 *    bouton '+', dans le même langage visuel."
 *
 *    W4 stacked this pill ON TOP of the "+" because both wanted the same
 *    corner, which made a column four buttons tall standing in the map — and
 *    a tower of floating controls is the thing the product owner has been
 *    reporting since W5 under three different names. On one line they read as
 *    what they are: one bottom bar of map controls, the "+" at the end of it.
 *
 *  ⚠️ THE OFFSET IS THE "+"'S OWN, DERIVED. `--map-rail` is where the "+"
 *     starts and `--map-rail-w` is how wide it is, so this pill begins one
 *     rail-gap past its far edge. Typing a number here is how the two ended up
 *     on different vertical lines before X3.1.
 *
 *  ⚠️ AND PHYSICAL `left`, NOT LOGICAL `start`, because `ActionFab` is pinned
 *     with `end-[var(--map-rail)]` — which in this Hebrew app IS the physical
 *     left. Beside it means physically to its right, in both directions.
 */
export function MapModePill({
  mode,
  onChange,
  className = '',
}: {
  mode: MapMode
  onChange: (mode: MapMode) => void
  /** The breakpoint gate: `hidden lg:flex` / `hidden xl:flex`. */
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      role="group"
      aria-label={t('map.modeLabel')}
      data-testid="map-mode-pill"
      data-mode={mode}
      data-overlay=""
      /* AA1.2 — see `[data-bottom-rail]` in `index.css`. */
      data-bottom-rail=""
      className={`glass fixed bottom-[calc(var(--shell-bottom)+1.25rem)]
                  left-[calc(var(--map-rail)+var(--map-rail-w)+var(--map-rail))] z-30
                  h-[var(--map-rail-w)] flex-row items-center gap-0.5 rounded-card p-1 ${className || 'flex'}`}
    >
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          aria-label={t(`map.mode.${m}`)}
          title={t(`map.mode.${m}`)}
          data-testid={`map-mode-${m}`}
          className={`flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-fast ${
            mode === m
              ? 'bg-accent text-content-on-accent shadow-accent'
              : 'text-content-secondary hover:bg-surface-high hover:text-content-primary'
          }`}
        >
          <Icon name={MODE_ICON[m]} size={18} />
        </button>
      ))}
    </div>
  )
}
