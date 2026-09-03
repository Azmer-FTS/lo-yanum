import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * W4 (2026-09-02, passe finale) — ONE "+" FOR THE WHOLE COORDINATOR SHELL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ WHAT WAS WRONG. "Create" was five different affordances in five places:
 *   a floating circle on three routes below `lg`, a `btn-primary` in the
 *   farms header, another in the volunteers header, another in the drivers
 *   header, a fourth on the dashboard and a fifth on the agenda — each with
 *   its own icon, its own size and its own breakpoint rule. The product
 *   owner has to learn a different gesture per screen for the same idea.
 *
 * ★ SO THERE IS ONE. A single floating "+" in one place on every coordinator
 *   screen, at every width, that opens a macOS-style contextual menu: the
 *   action the CURRENT screen is about comes first and is highlighted, the
 *   rest of the creations follow under a hairline. Nothing else creates.
 *
 * ⚠️ WHY THE PHYSICAL LEFT AND NOT THE RAIL'S SIDE. `end-4` is the inline
 *    end, which in this Hebrew app is the physical LEFT; the icon rail is at
 *    the inline START, i.e. the physical right. A fixed corner on the rail's
 *    side sits on the rail past `lg`. The map's mode pill shares this corner
 *    and is RAISED above the button (see `MapModePill.raised`), which is the
 *    same stacking the phone routes already used.
 *
 * ⚠️ AND `--shell-bottom` RATHER THAN A NUMBER: it is the real height of
 *    whatever is pinned to the foot of the shell (the demo toolbar, or a bare
 *    home-indicator inset in a real build). A hard-coded `bottom-16` is how
 *    the previous button ended up sitting ON the toolbar.
 */

interface FabAction {
  key: string
  /** Where it goes. `?new=1` opens the roster's own modal (see below). */
  to: string
  labelKey: string
  icon: IconName
  /** The routes this action is the natural one for. */
  home: string[]
  testId?: string
}

/**
 * ⚠️ THE TWO ROSTERS CREATE IN A MODAL THEY OWN, so the menu cannot call
 *    their setter from out here. It asks through the URL — `?new=1` — which
 *    the screen reads and clears. That works from ANY route, which a shared
 *    React state would not without a store nobody else needs.
 */
const ACTIONS: FabAction[] = [
  {
    key: 'mission',
    to: '/coordinator/missions/new',
    labelKey: 'missions.create',
    icon: 'shield',
    home: ['/coordinator', '/coordinator/missions', '/coordinator/agenda'],
    testId: 'fab-mission-new',
  },
  {
    key: 'farm',
    to: '/coordinator/farms/new',
    labelKey: 'farms.new',
    icon: 'farm',
    home: ['/coordinator/farms', '/coordinator/route'],
    testId: 'fab-farm-new',
  },
  {
    key: 'volunteer',
    to: '/coordinator/volunteers?new=1',
    labelKey: 'volunteers.new',
    icon: 'userPlus',
    home: ['/coordinator/volunteers'],
    testId: 'volunteer-new',
  },
  {
    key: 'driver',
    to: '/coordinator/drivers?new=1',
    labelKey: 'driver.addDriver',
    icon: 'steering',
    home: ['/coordinator/drivers'],
    testId: 'driver-new',
  },
]

/** Where the button belongs. Elsewhere (forms, wizards) it would be noise. */
export const FAB_ROUTES = [
  '/coordinator',
  '/coordinator/agenda',
  '/coordinator/farms',
  '/coordinator/route',
  '/coordinator/volunteers',
  '/coordinator/drivers',
  '/coordinator/missions',
  '/coordinator/incidents',
]

export function ActionFab() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

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

  if (!FAB_ROUTES.includes(pathname)) return null

  // The screen's own action first, then the rest in their declared order.
  const contextual = ACTIONS.filter((a) => a.home.includes(pathname))
  const rest = ACTIONS.filter((a) => !a.home.includes(pathname))
  const ordered = [...contextual, ...rest]

  const item = (action: FabAction, primary: boolean) => (
    <button
      key={action.key}
      type="button"
      data-testid={action.testId}
      onClick={() => {
        setOpen(false)
        navigate(action.to)
      }}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-start text-caption
                  transition-colors duration-fast ${
                    primary
                      ? 'bg-accent font-semibold text-content-on-accent shadow-accent'
                      : 'text-content-primary hover:bg-surface-high'
                  }`}
    >
      <Icon name={action.icon} size={17} />
      <span className="truncate">{t(action.labelKey)}</span>
    </button>
  )

  return (
    <div
      ref={ref}
      data-testid="action-fab"
      data-open={open ? '1' : '0'}
      /* ⚠️ `data-overlay` — THE SAME DECLARATION THE MODE PILL CARRIES, and
         for the same reason. The `layout` gate forbids two pinned elements
         from overlapping, because two bars that found each other by accident
         is a defect; a floating action button is over the panel underneath
         BY CONSTRUCTION, and it is also not "occupied foot" the shell has to
         reserve room for. The old button escaped the rule only by being
         `lg:hidden` — i.e. by not existing at the width the gate measures. */
      data-overlay=""
      /* X3.1 — THE SAME AXIS AS THE MAP RAIL. `end-4` + a 56 px button put
         this one object 4 px outside the line the tools stack, the mode pill
         and the pencil all sit on; the product owner read that as the "+"
         sticking out. `--map-rail` / `--map-rail-w` (index.css) are the one
         offset and the one width now. */
      className="fixed bottom-[calc(var(--shell-bottom)+1.25rem)] end-[var(--map-rail)] z-40 flex flex-col items-end"
    >
      {open && (
        <div
          role="menu"
          aria-label={t('fab.menu')}
          data-testid="action-fab-menu"
          className="glass mb-2 flex w-60 animate-fade-in flex-col gap-0.5 rounded-card p-1.5 shadow-lift"
        >
          <span className="px-2.5 pb-1 pt-1 text-micro font-semibold text-content-muted">
            {t('fab.menu')}
          </span>
          {ordered.map((action, i) => (
            <div key={action.key} className="contents">
              {item(action, i === 0 && contextual.length > 0)}
              {i === 0 && contextual.length > 0 && (
                <span className="my-1 h-px bg-edge-subtle" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t(open ? 'fab.close' : 'fab.open')}
        title={t('fab.open')}
        data-testid="action-fab-toggle"
        className={`flex h-[var(--map-rail-w)] w-[var(--map-rail-w)] items-center justify-center rounded-pill shadow-accent
                    transition-all duration-base ease-out active:scale-95 ${
                      open
                        ? 'bg-surface-overlay text-content-primary'
                        : 'bg-gradient-accent text-content-on-accent'
                    }`}
      >
        <Icon name={open ? 'close' : 'plus'} size={23} />
      </button>
    </div>
  )
}
