import { useCallback, useState } from 'react'
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
  const [ratio, setRatioState] = useState<number>(() =>
    readRatio(screenKey, fallback),
  )

  const setRatio = useCallback(
    (next: number) => {
      const clamped = clampRatio(next)
      setRatioState(clamped)
      try {
        localStorage.setItem(ratioKey(screenKey), String(Math.round(clamped * 10) / 10))
      } catch {
        // See useMapMode: persistence is a convenience.
      }
    },
    [screenKey],
  )

  const reset = useCallback(() => {
    setRatioState(fallback)
    try {
      localStorage.removeItem(ratioKey(screenKey))
    } catch {
      // Same.
    }
  }, [screenKey, fallback])

  return { ratio, setRatio, reset }
}

export function useMapMode(screenKey: string): MapModeState {
  const [mode, setModeState] = useState<MapMode>(() => readMode(screenKey))

  const setMode = useCallback(
    (next: MapMode) => {
      setModeState(next)
      try {
        localStorage.setItem(storageKey(screenKey), next)
      } catch {
        // Persistence is a convenience; losing it must not break the screen.
      }
    },
    [screenKey],
  )

  return { mode, setMode }
}

const MODE_ICON: Record<MapMode, 'menu' | 'columns' | 'map'> = {
  hidden: 'menu',
  split: 'columns',
  full: 'map',
}

/**
 * The three-state switch. Touch-sized (44 px, P0.3) because it lives on
 * screens whose whole point is being usable with a thumb.
 */
export function MapModeSwitch({
  mode,
  onChange,
  className = '',
}: {
  mode: MapMode
  onChange: (mode: MapMode) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={`flex shrink-0 items-center gap-1 ${className}`}
      role="group"
      aria-label={t('map.modeLabel')}
    >
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          title={t(`map.mode.${m}`)}
          className={`filter-pill min-h-11 px-3 ${
            mode === m ? 'filter-pill-active' : ''
          }`}
        >
          <Icon name={MODE_ICON[m]} size={15} />
          {t(`map.mode.${m}`)}
        </button>
      ))}
    </div>
  )
}

/**
 * U4.4 (2026-09-02) — THE FLOATING MODE PILL. Three icon buttons in one
 * vertical frosted pill, fixed to the viewport's physical bottom-left, the
 * same spot in every mode. Labels on `title` / `aria-label`; the active mode
 * is filled.
 */
export function MapModePill({
  mode,
  onChange,
  raised = false,
}: {
  mode: MapMode
  onChange: (mode: MapMode) => void
  /** Step up above the guard FAB on the phone routes that carry it. */
  raised?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      role="group"
      aria-label={t('map.modeLabel')}
      data-testid="map-mode-pill"
      data-mode={mode}
      data-overlay=""
      className={`glass fixed left-3 z-30 flex flex-col gap-0.5 rounded-pill p-1 ${
        raised
          ? 'bottom-[calc(var(--shell-bottom)+5.5rem)] lg:bottom-[calc(var(--shell-bottom)+0.75rem)]'
          : 'bottom-[calc(var(--shell-bottom)+0.75rem)]'
      }`}
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
