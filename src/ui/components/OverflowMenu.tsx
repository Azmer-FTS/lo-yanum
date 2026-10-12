import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
/**
 * ★★ BB (2026-10-12) — LE MENU SORT DE SON PARENT.
 *
 * Il était `absolute` dans un parent `relative`, et deux de ses hôtes portent
 * `overflow: hidden` (la tuile `.list-tile`, qui arrondit sa photo pleine
 * hauteur ; le `<li>` d'`EntityTable` quand la rangée a un pied) : le menu
 * s'ouvrait DANS la rangée et se trouvait coupé par ses bords. Ces
 * `overflow: hidden` restent — ils servent. Le menu, lui, se rend dans un
 * PORTAIL sur `document.body`, en `position: fixed`, placé d'après le
 * `getBoundingClientRect()` du bouton (même manière qu'`EntityQuickCard`) :
 *   · sous le bouton, ou AU-DESSUS quand la place manque en dessous ;
 *   · accroché au bord « fin » du bouton (la gauche en hébreu), puis ramené
 *     dans l'écran à 8 px près — 390 px et RTL compris ;
 *   · replacé à chaque défilement (de n'importe quel conteneur) et
 *     redimensionnement ; fermé si le bouton quitte l'écran ;
 *   · clic extérieur (bouton OU menu exclus), Échap, focus clavier
 *     (premier article à l'ouverture, ↑ ↓, retour au bouton), `aria-expanded`,
 *     `role="menu"` : inchangés.
 */
const GAP = 6
const EDGE = 8
const MENU_W = 240

function placeMenu(btn: DOMRect, menuH: number, rtl: boolean): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(MENU_W, vw - 2 * EDGE)
  const below = btn.bottom + GAP
  const above = btn.top - GAP - menuH
  const top = below + menuH <= vh - EDGE || above < EDGE ? Math.max(EDGE, Math.min(below, vh - EDGE - menuH)) : above
  const startX = rtl ? btn.left : btn.right - width
  const left = Math.min(Math.max(EDGE, startX), vw - width - EDGE)
  return { position: 'fixed', top, left, width, maxHeight: vh - 2 * EDGE, overflowY: 'auto', zIndex: 70 }
}

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
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties | null>(null)

  const close = useCallback((refocus = false) => {
    setOpen(false)
    setStyle(null)
    if (refocus) btnRef.current?.focus()
  }, [])

  const place = useCallback(() => {
    const b = btnRef.current
    if (!b) return
    const r = b.getBoundingClientRect()
    // Le bouton a quitté l'écran (défilement) : le menu n'a plus d'ancre.
    if (r.bottom < 0 || r.top > window.innerHeight || r.width === 0) {
      close()
      return
    }
    const rtl = getComputedStyle(b).direction === 'rtl'
    setStyle(placeMenu(r, menuRef.current?.offsetHeight ?? 0, rtl))
  }, [close])

  // Première pose avant la peinture, puis une seconde quand la hauteur réelle est connue.
  useLayoutEffect(() => {
    if (!open) return
    place()
    const id = requestAnimationFrame(place)
    return () => cancelAnimationFrame(id)
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const inside = (n: Node) => !!(ref.current?.contains(n) || menuRef.current?.contains(n))
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, close, place])

  // Le focus clavier entre dans le menu à l'ouverture (il vit au bout de <body>).
  useEffect(() => {
    if (!open || !style) return
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    if (first && !menuRef.current?.contains(document.activeElement)) first.focus({ preventScroll: true })
  }, [open, style])

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const its = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const at = its.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = its.length
      if (!n) return
      its[(at + (e.key === 'ArrowDown' ? 1 : -1) + n) % n].focus()
    } else if (e.key === 'Tab') {
      close(true)
    }
  }

  if (items.length === 0 && !children) return null

  const name = label ?? t('common.actions')

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        ref={btnRef}
        onClick={() => (open ? close() : setOpen(true))}
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

      {open &&
        createPortal(
        <div
          ref={menuRef}
          onKeyDown={onMenuKey}
          style={style ?? { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
          role="menu"
          aria-label={name}
          data-testid={testId}
          data-overlay=""
          /* ★ BB — portail `fixed` : placé par `placeMenu` (bord « fin » du
             bouton, ramené dans l'écran, au-dessus quand la place manque). */
          dir={btnRef.current ? getComputedStyle(btnRef.current).direction : undefined}
          className="glass flex animate-fade-in flex-col gap-0.5 rounded-card p-1.5 shadow-lift"
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              data-testid={it.testId}
              onClick={() => {
                close()
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
        </div>,
        document.body,
      )}
    </div>
  )
}
