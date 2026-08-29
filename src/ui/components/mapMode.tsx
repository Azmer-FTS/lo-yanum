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
