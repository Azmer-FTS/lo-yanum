import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'
import { MapAttribution } from './MapAttribution'
import { MAP_LAYERS, useMapLayers } from './mapLayers'
import { readBlockOpen, writeBlockOpen } from './primitives'

/**
 * U4.2 / U4.3 (2026-09-02) — ONE LEGEND, FOLDABLE, WITH THE LAYER SWITCHES.
 *
 * Every map used to float its own stack of legend chips over the canvas,
 * always open. Now there is one frosted panel with a title row that folds
 * it (remembered, globally — `lo-yanum:block:map-legend`, the same memory
 * as the content blocks), and INSIDE it, above the swatches, the seven
 * layer checkboxes the product owner needs to show one layer at a time.
 *
 * ★ W5 (2026-09-02) — THE SAME SEVEN BOXES ON EVERY SCREEN, ALWAYS.
 *   U4 offered only the layers a given map happened to be drawing, which
 *   sounded tidy and was not: the product owner opened the farms map and
 *   counted three boxes, opened a farm and counted five, and had to work out
 *   each time whether a layer was OFF or merely absent. A layer set that is
 *   ONE remembered value for the whole app has to be shown whole in every
 *   place it can be edited, or the list is lying about what it controls.
 *   A box for a layer this map has nothing to draw simply changes nothing
 *   here — and it still changes the next map he opens, which is the point.
 */
export function MapLegend({
  children,
  className = '',
  defaultOpen = false,
}: {
  /** The swatches — whatever the screen wants to explain. */
  children?: ReactNode
  className?: string
  defaultOpen?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => readBlockOpen('map-legend', defaultOpen))
  const [visible, setLayer] = useMapLayers()
  const offered = MAP_LAYERS

  const toggle = () =>
    setOpen((v) => {
      writeBlockOpen('map-legend', !v)
      return !v
    })

  return (
    /* ★ X3.4 — THE LEGEND AND THE "i" ARE ONE ROW, bottom-aligned. The licence
       button used to be MapLibre's own control at the map's physical
       bottom-right, i.e. under this panel; beside it, and anchored to the same
       baseline, it is visible whether the legend is folded or unfolded without
       a single z-index. See `MapAttribution`. */
    <div className={`pointer-events-auto flex min-w-0 flex-wrap-reverse items-end gap-1.5 ${className}`}>
    <div
      data-testid="map-legend"
      data-open={open ? '1' : '0'}
      className="glass max-w-[15rem] rounded-card"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={t('map.legendToggle')}
        data-testid="map-legend-toggle"
        className="flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-start"
      >
        <span
          className={`text-content-muted transition-transform duration-fast ${
            open ? '' : 'ltr:-rotate-90 rtl:rotate-90'
          }`}
        >
          <Icon name="chevronDown" size={14} />
        </span>
        <span className="text-caption font-semibold text-content-primary">{t('map.legend')}</span>
        {!open && offered.length > 0 && (
          <span className="numeric ms-auto text-micro text-content-muted">
            {offered.filter((k) => visible[k]).length}/{offered.length}
          </span>
        )}
      </button>

      {open && (
        <div className="max-h-[42dvh] overflow-y-auto px-3 pb-2.5 lg:max-h-[60dvh]">
          {offered.length > 0 && (
            <ul className="mb-2 flex flex-col gap-0.5 border-b border-edge-subtle pb-2" data-testid="map-layers">
              {offered.map((key) => (
                <li key={key}>
                  <label className="flex min-h-8 cursor-pointer items-center gap-2 text-caption text-content-secondary">
                    <input
                      type="checkbox"
                      className="check"
                      checked={visible[key]}
                      onChange={(e) => setLayer(key, e.target.checked)}
                      data-testid={`layer-${key}`}
                    />
                    {t(`map.layers.${key}`)}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {/* The screens' legend chips carry their own frosted box each;
              inside this panel they are flattened to plain rows. */}
          <div className="flex flex-col gap-1 [&>div]:!border-0 [&>div]:!bg-transparent [&>div]:!px-0 [&>div]:!py-0 [&>div]:!shadow-none [&>div]:!backdrop-blur-0 [&>ul]:gap-1">
            {children}
          </div>
        </div>
      )}
    </div>
      <MapAttribution />
    </div>
  )
}
