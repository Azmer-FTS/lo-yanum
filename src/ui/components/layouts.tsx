import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { COORDINATOR, getMyDisplayName, getSession } from '@core/index'

import { useCoreValue } from '../hooks/useCore'
import { CreateGuardFab } from './CreateGuardFab'
import { DevToolbar } from './DevToolbar'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { ThemeToggle } from './ThemeToggle'

interface NavItem {
  to: string
  icon: IconName
  labelKey: string
  end?: boolean
}

const COORDINATOR_NAV: NavItem[] = [
  { to: '/coordinator', icon: 'dashboard', labelKey: 'nav.dashboard', end: true },
  { to: '/coordinator/agenda', icon: 'calendar', labelKey: 'nav.agenda' },
  { to: '/coordinator/farms', icon: 'farm', labelKey: 'nav.farms' },
  { to: '/coordinator/route', icon: 'route', labelKey: 'nav.route' },
  { to: '/coordinator/volunteers', icon: 'users', labelKey: 'nav.volunteers' },
  { to: '/coordinator/missions', icon: 'shield', labelKey: 'nav.missions' },
  { to: '/coordinator/incidents', icon: 'alert', labelKey: 'nav.incidents' },
]

/**
 * Routes that manage their own full-bleed canvas and must not be padded.
 * Every map-first screen, plus the dashboard since D3 made it one.
 */
const BLEED_ROUTES = [
  '/coordinator',
  '/coordinator/farms',
  '/coordinator/route',
  '/coordinator/missions',
  '/coordinator/incidents',
]

function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent-ink ring-1 ring-accent/25">
        <Icon name="shield" size={19} />
      </span>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-heading text-content-primary">
            {t('app.name')}
          </p>
          <p className="truncate text-micro text-content-muted">
            {t('app.tagline')}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * COORDINATOR SHELL — full-bleed on desktop (R3).
 *
 * No max-width container: at ≥1280px the content uses the whole screen, which
 * is the point of a back-office. The sidebar is a slim icon rail that expands
 * on demand (and remembers the choice for the session); below `lg` it becomes
 * a slide-over.
 */
export function CoordinatorLayout() {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { pathname } = useLocation()

  const bleed = BLEED_ROUTES.some((r) => pathname === r)

  // Close the mobile slide-over whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname])

  const navLink = (item: NavItem, showLabel: boolean) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      title={showLabel ? undefined : t(item.labelKey)}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-caption font-medium
         transition-all duration-fast ease-out ${
           isActive
             ? 'bg-accent/15 text-accent-ink'
             : 'text-content-secondary hover:bg-surface-high hover:text-content-primary'
         } ${showLabel ? '' : 'justify-center px-0'}`
      }
    >
      {({ isActive }) => (
        <>
          {/* Active marker on the inline-start edge — flips with direction. */}
          <span
            className={`absolute inset-y-1.5 start-0 w-0.5 rounded-pill bg-accent transition-opacity duration-fast ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <Icon name={item.icon} size={19} />
          {showLabel && <span className="truncate">{t(item.labelKey)}</span>}
        </>
      )}
    </NavLink>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-surface-base">
      <div className="flex flex-1">
        {/* Desktop rail — full-bleed: no max-width wrapper anywhere. */}
        <aside
          className={`sticky top-0 hidden h-[calc(100dvh-var(--shell-bottom))] shrink-0 flex-col gap-4
                      overflow-y-auto border-e border-edge-subtle bg-surface-raised px-3 py-4
                      transition-[width] duration-base ease-out lg:flex ${
                        expanded ? 'w-60' : 'w-[4.5rem]'
                      }`}
        >
          <div className={expanded ? '' : 'flex justify-center'}>
            <Brand compact={!expanded} />
          </div>

          {/* D7.1 — the collapse control belongs directly under the logo.
              At the foot of the rail it read as part of the user block and was
              routinely missed; it is a property of the rail, so it sits with
              the rail's own header. */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={t(expanded ? 'nav.collapse' : 'nav.expand')}
            className={`-mt-2 flex items-center gap-2 rounded-md border border-edge-subtle px-3 py-1.5
                        text-content-muted transition-all duration-fast
                        hover:border-edge-strong hover:bg-surface-high hover:text-content-primary ${
                          expanded ? '' : 'justify-center px-0'
                        }`}
          >
            <Icon name={expanded ? 'collapse' : 'expand'} size={16} />
            {expanded && (
              <span className="text-caption">{t('nav.collapse')}</span>
            )}
          </button>

          <nav className="flex flex-col gap-1">
            {COORDINATOR_NAV.map((item) => navLink(item, expanded))}
          </nav>

          <div className="mt-auto flex flex-col gap-2">
            <div className={expanded ? '' : 'flex justify-center'}>
              <ThemeToggle compact={!expanded} vertical={!expanded} />
            </div>

            <div
              className={`rounded-md bg-surface-high p-2.5 ${expanded ? '' : 'text-center'}`}
            >
              {expanded ? (
                <>
                  <p className="truncate text-caption font-medium text-content-primary">
                    {COORDINATOR.name}
                  </p>
                  <p className="truncate text-micro text-content-muted">
                    {COORDINATOR.role}
                  </p>
                </>
              ) : (
                <span className="text-caption font-semibold text-accent-ink">
                  {COORDINATOR.name.slice(0, 1)}
                </span>
              )}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile / tablet top bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-edge-subtle bg-surface-overlay/95 px-4 py-3 backdrop-blur lg:hidden">
            <Brand />
            <div className="flex items-center gap-2">
              <ThemeToggle compact />
              <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t('a11y.openMenu')}
              className="rounded-md p-2 text-content-secondary transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
            >
              <Icon name="menu" />
              </button>
            </div>
          </header>

          <main
            className={
              bleed
                ? 'flex-1'
                : 'flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:pb-6 2xl:px-8'
            }
          >
            <Outlet />
          </main>
        </div>

        {/* D3.4 — persistent on the dashboard, the guard list and the agenda. */}
        <CreateGuardFab />
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('a11y.closeMenu')}
            className="absolute inset-0 bg-surface-sunken/80 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 start-0 flex w-72 max-w-[85%] animate-fade-in flex-col gap-5 border-e border-edge-strong bg-surface-raised px-3 py-4 shadow-lift">
            <div className="flex items-center justify-between px-1">
              <Brand />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t('a11y.closeMenu')}
                className="rounded-sm p-1.5 text-content-muted hover:bg-surface-high hover:text-content-primary"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {COORDINATOR_NAV.map((item) => navLink(item, true))}
            </nav>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 z-40">
        <DevToolbar />
      </div>
    </div>
  )
}

/**
 * FIELD SHELL — farmer / volunteer / driver.
 *
 * One narrow column with a bottom tab bar. These screens live on a phone, in
 * the dark, one-handed. The tab bar and the dev toolbar share a single sticky
 * footer so they stack rather than fight over `bottom-0`.
 */
export function FieldLayout({ items }: { items: NavItem[] }) {
  const { t } = useTranslation()
  const session = useCoreValue(getSession)
  const name = useCoreValue(getMyDisplayName)

  return (
    <div className="flex min-h-dvh flex-col bg-surface-base">
      <header className="sticky top-0 z-30 border-b border-edge-subtle bg-surface-overlay/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Brand />
          <div className="flex items-center gap-3">
            <ThemeToggle compact />
            <div className="min-w-0 text-end leading-tight">
              <p className="truncate text-caption font-medium text-content-primary">
                {name}
              </p>
              <p className="text-micro text-content-muted">
                {t(`roles.${session.role}`)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        <Outlet />
      </main>

      <div className="sticky bottom-0 z-30">
        <nav className="border-t border-edge-subtle bg-surface-overlay/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-micro font-medium
                   transition-colors duration-fast ease-out ${
                     isActive
                       ? 'text-accent-ink'
                       : 'text-content-muted hover:text-content-secondary'
                   }`
                }
              >
                <Icon name={item.icon} size={21} />
                {t(item.labelKey)}
              </NavLink>
            ))}
          </div>
        </nav>
        <DevToolbar />
      </div>
    </div>
  )
}

export const FARMER_NAV: NavItem[] = [
  { to: '/farmer', icon: 'moon', labelKey: 'nav.tonight', end: true },
  { to: '/farmer/guards', icon: 'shield', labelKey: 'nav.myGuards' },
  { to: '/farmer/report', icon: 'alert', labelKey: 'nav.report' },
]

export const VOLUNTEER_NAV: NavItem[] = [
  { to: '/volunteer', icon: 'shield', labelKey: 'nav.myGuard', end: true },
  { to: '/volunteer/roster', icon: 'users', labelKey: 'nav.groupRoster' },
  { to: '/volunteer/report', icon: 'alert', labelKey: 'nav.report' },
]

export const DRIVER_NAV: NavItem[] = [
  { to: '/driver', icon: 'car', labelKey: 'nav.myTrip', end: true },
]
