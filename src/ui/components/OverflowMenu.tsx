import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * X2 (2026-09-04) — ONE "⋯" PER LIST, AND THE HEADER STOPS BEING A TOOLBAR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ WHAT WAS WRONG. Every roster's header carried a different SET of labelled
 *   text buttons — "ייבוא מקובץ" on three of them, "שכבת איומים" on one,
 *   a two-pill "טבלה / מפה" switch on another — so the one line that should
 *   have read [title][search] read [title][3 buttons of different widths] and
 *   pushed the search box down onto the tiles. Worse, none of the five screens
 *   had the same set, so the product owner had to re-read the header on every
 *   navigation to find out what this screen happened to offer.
 *
 * ★ SO THERE IS ONE CONTROL. A 40 px "⋯" at the end of the title row, on every
 *   list, always in the same place, that opens a floating frosted menu — the
 *   SAME visual language as the map's own pills and the "+" menu (`glass`),
 *   because it is the same kind of object: a translucent sheet over the
 *   content. What the screen offers is inside; what the header shows is a
 *   constant.
 *
 * ⚠️ THE VIEW SWITCH IS AN ITEM IN HERE, NOT A PAIR OF PILLS UP TOP. The
 *    product owner has now asked three times for the map/columns toggle to
 *    leave the top of the lists; the map's own fixed mode pill is the control
 *    he uses. What survives here is the FARMS screen's different question —
 *    "map shell or full-page table" — expressed as one checkable row.
 *
 * ⚠️ AND THE THREAT LAYER IS NOT HERE AT ALL. It is a map LAYER, and every map
 *    layer lives in the legend's checkboxes (`mapLayers.ts`). A second control
 *    for one of the seven is how the two got out of step in the first place.
 */
export interface OverflowItem {
  key: string
  labelKey?: string
  /** Pre-translated label, when the caller already has the string. */
  label?: string
  icon: IconName
  /** Navigate here. Exactly one of `to` / `onClick`. */
  to?: string
  onClick?: () => void
  /** Renders a tick at the end of the row — a toggle rather than a command. */
  checked?: boolean
  danger?: boolean
  testId?: string
}

export function OverflowMenu({
  items,
  label,
  testId = 'list-menu',
  children,
}: {
  items: OverflowItem[]
  /** Names the button; defaults to "פעולות". */
  label?: string
  testId?: string
  /** Extra rows appended under a hairline (rare — prefer `items`). */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
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

  if (items.length === 0 && !children) return null

  const name = label ?? t('common.actions')

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={name}
        title={name}
        data-testid={`${testId}-toggle`}
        className={`flex h-11 w-11 items-center justify-center rounded-pill border
                    transition-colors duration-fast ${
                      open
                        ? 'border-accent bg-accent/15 text-accent-ink'
                        : 'border-edge-subtle bg-surface-raised text-content-secondary hover:bg-surface-high hover:text-content-primary'
                    }`}
      >
        <Icon name="more" size={18} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={name}
          data-testid={testId}
          data-overlay=""
          /* `end-0` — the menu hangs from the button's own inline end, so in
             Hebrew it opens to the physical right of the "⋯" and never leaves
             the panel. `max-w-[calc(100vw-2rem)]` keeps it inside a 390 px
             screen, which is the width the sweep measures. */
          className="glass absolute end-0 top-[calc(100%+0.375rem)] z-40 flex w-60 max-w-[calc(100vw-2rem)]
                     animate-fade-in flex-col gap-0.5 rounded-card p-1.5 shadow-lift"
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              data-testid={it.testId}
              onClick={() => {
                setOpen(false)
                if (it.to) navigate(it.to)
                else it.onClick?.()
              }}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-start text-caption
                          transition-colors duration-fast ${
                            it.danger
                              ? 'text-status-danger-ink hover:bg-status-danger/10'
                              : 'text-content-primary hover:bg-surface-high'
                          }`}
            >
              <Icon name={it.icon} size={17} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {it.label ?? t(it.labelKey ?? '')}
              </span>
              {it.checked !== undefined && (
                <span
                  className={`shrink-0 ${it.checked ? 'text-accent-ink' : 'text-transparent'}`}
                  aria-hidden="true"
                >
                  <Icon name="check" size={15} />
                </span>
              )}
            </button>
          ))}
          {children}
        </div>
      )}
    </div>
  )
}
