import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'

/**
 * G7bis.2 — THE FULLSCREEN WORKING MODE, on every interactive map.
 *
 * Drawing a grazing area is minutes of precise clicking, and the product owner
 * does it on an iPad where the embedded map — even a generous one — leaves the
 * polygon half off-screen. "מסך מלא" hands the map the whole viewport as an
 * overlay, WITH its floating tools (zone drawing, point placement, the meet
 * editor's buttons), so nothing has to be re-learned between the two modes:
 * the same surface, larger.
 *
 * Mechanically the mode is just a class swap on the element that already holds
 * the map and its floating tools — `fixed inset-0` instead of `relative` — so
 * the armed modes, banners and legends ride along untouched. MapLibre observes
 * its container and resizes itself.
 *
 * Escape leaves the mode, but ARMED MODES EAT THE KEY FIRST: while a zone is
 * being drawn, Esc must cancel the drawing (decision 55's contract), not dump
 * the user out of the room. Hosts pass `escapeGuard` for exactly that.
 */
export function useMapFullscreen(escapeGuard = false) {
  const [active, setActive] = useState(false)

  // The page behind the overlay must not scroll under a two-finger pan.
  useEffect(() => {
    if (!active) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [active])

  useEffect(() => {
    if (!active || escapeGuard) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, escapeGuard])

  return {
    active,
    toggle: () => setActive((v) => !v),
    exit: () => setActive(false),
  }
}

/**
 * The classes for the element holding the map and its floating tools.
 * `base` is what the element wears in its embedded life.
 */
export function fullscreenShell(active: boolean, base: string): string {
  return active
    ? 'fixed inset-0 z-50 bg-surface-base p-2 sm:p-3'
    : base
}

/** The "מסך מלא" toggle, floated over the map with the other tools. */
export function FullscreenToggle({
  active,
  onToggle,
  className = '',
}: {
  active: boolean
  onToggle: () => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`btn-secondary pointer-events-auto py-1.5 text-micro shadow-card ${className}`}
    >
      <Icon name={active ? 'collapse' : 'expand'} size={14} />
      {t(active ? 'map.exitFullscreen' : 'map.fullscreen')}
    </button>
  )
}
