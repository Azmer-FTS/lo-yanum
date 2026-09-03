import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SATELLITE } from './basemap'
import { Icon } from './Icon'
import { useMapBase } from './mapBase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * X3.4 (2026-09-04) — THE "i" IS BESIDE THE LEGEND, AND WHAT IT OPENS IS SMALL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ WHY MAPLIBRE'S OWN CONTROL HAD TO GO RATHER THAN BE RESTYLED. It is
 *   added at `bottom-right`, which is a PHYSICAL corner — and in this Hebrew
 *   app the legend is anchored at the inline start, i.e. the same physical
 *   corner. W5 shrank the licence line into a round 28 px "i" and that fixed
 *   the width; it did not fix the collision, so the product owner found the
 *   button underneath the legend panel, or hidden by it once unfolded. No
 *   z-index fixes two owners of one corner — the lesson `MapTools` already
 *   learned about the other corner.
 *
 * ★ SO THE LICENCE IS A REACT BUTTON INSIDE THE LEGEND'S OWN ROW. It sits
 *   BESIDE the panel, bottom-aligned with it, so unfolding the legend grows
 *   the panel upward and the "i" stays exactly where it was — visible in both
 *   states by construction rather than by tuning.
 *
 * ★ AND WHAT IT OPENS IS AN INSET, NOT A PANEL. Tapping used to expand
 *   MapLibre's `<details>` into a full-width strip across the bottom of the
 *   map. It is a 15 rem card of two lines now, hanging above the button.
 *
 * ⚠️ THE OBLIGATION IS UNCHANGED AND IS STILL MET. OpenStreetMap's ODbL and
 *    the imagery provider's terms require the credit to be REACHABLE from the
 *    map, not printed over it; the button is on every map at every width, it
 *    is 40 px, and the line names the ground actually on screen (`useMapBase`)
 *    rather than both at once.
 */
export function MapAttribution({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const base = useMapBase()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={`pointer-events-auto relative shrink-0 ${className}`}>
      {open && (
        <div
          data-testid="map-attribution-panel"
          data-overlay=""
          /* Bottom-anchored above the button, and clamped so a 390 px screen
             cannot be widened by a licence string. */
          className="glass absolute bottom-[calc(100%+0.375rem)] start-0 z-30 w-60 max-w-[calc(100vw-3rem)]
                     animate-fade-in rounded-card p-2.5 text-micro leading-snug text-content-muted"
        >
          <p dir="ltr" className="text-start">
            © <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="text-content-secondary underline"
            >
              OpenStreetMap
            </a>{' '}
            contributors
          </p>
          {base === 'satellite' && (
            <p dir="ltr" className="mt-1 text-start">
              {SATELLITE.attribution.replace(/<[^>]+>/g, '')}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('map.attribution')}
        title={t('map.attribution')}
        data-testid="map-attribution"
        className={`glass flex h-10 w-10 items-center justify-center rounded-pill text-caption font-semibold
                    transition-colors duration-fast ${
                      open ? 'text-accent-ink' : 'text-content-secondary hover:text-content-primary'
                    }`}
      >
        <Icon name="info" size={17} />
      </button>
    </div>
  )
}
