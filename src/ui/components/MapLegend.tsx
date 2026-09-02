import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'
import { MAP_LAYERS, useMapLayers } from './mapLayers'
import type { MapLayerKey } from './mapLayers'
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
 * Only the layers this map actually carries are offered: a switch for
 * pickup points on a map that has none is a switch that does nothing.
 */
export function MapLegend({
  children,
  layers,
  className = '',
  defaultOpen = true,
}: {
  /** The swatches — whatever the screen wants to explain. */
  children?: ReactNode
  /** The layer switches this map should offer. */
  layers?: readonly MapLayerKey[]
  className?: string
  defaultOpen?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => readBlockOpen('map-legend', defaultOpen))
  const [visible, setLayer] = useMapLayers()
  const offered = MAP_LAYERS.filter((k) => layers?.includes(k))

  const toggle = () =>
    setOpen((v) => {
      writeBlockOpen('map-legend', !v)
      return !v
    })

  if (!children && offered.length === 0) return null

  return (
    <div
      data-testid="map-legend"
      data-open={open ? '1' : '0'}
      className={`glass pointer-events-auto max-w-[15rem] rounded-card ${className}`}
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
  )
}
