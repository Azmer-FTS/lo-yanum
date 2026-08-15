import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'

import { COORDINATOR, getMyDisplayName, getSession } from '@core/index'

import { useCoreValue } from '../hooks/useCore'
import { DevToolbar } from './DevToolbar'
import { Icon } from './Icon'
import type { IconName } from './Icon'

interface NavItem {
  to: string
  icon: IconName
  labelKey: string
  end?: boolean
}

const COORDINATOR_NAV: NavItem[] = [
  { to: '/coordinator', icon: 'dashboard', labelKey: 'nav.dashboard', end: true },
  { to: '/coordinator/farms', icon: 'farm', labelKey: 'nav.farms' },
  { to: '/coordinator/map', icon: 'map', labelKey: 'nav.map' },
  { to: '/coordinator/route', icon: 'route', labelKey: 'nav.route' },
  { to: '/coordinator/volunteers', icon: 'users', labelKey: 'nav.volunteers' },
  { to: '/coordinator/missions', icon: 'shield', labelKey: 'nav.missions' },
  { to: '/coordinator/incidents', icon: 'alert', labelKey: 'nav.incidents' },
]

function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-night-900 text-sand-300">
        <Icon name="shield" size={19} />
      </span>
      <div className="leading-tight">
        <p className="text-base font-semibold text-night-950">{t('app.name')}</p>
        {!compact && (
          <p className="text-[11px] text-night-950/45">{t('app.tagline')}</p>
        )}
      </div>
    </div>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-night-900 text-white'
      : 'text-night-950/65 hover:bg-sand-100 hover:text-night-950'
  }`

/**
 * Coordinator shell: a real sidebar on desktop, a slide-over on tablet and
 * phone. The coordinator is the only role that works from a laptop.
 */
export function CoordinatorLayout() {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  const nav = (
    <nav className="flex flex-col gap-1">
      {COORDINATOR_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={navClass}
          onClick={() => setMenuOpen(false)}
        >
          <Icon name={item.icon} size={18} />
          {t(item.labelKey)}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-sand-50">
      <div className="flex flex-1 lg:mx-auto lg:w-full lg:max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-e border-sand-200 bg-white px-4 py-5 lg:flex">
          <Brand />
          {nav}
          <div className="mt-auto rounded-xl bg-sand-100 p-3">
            <p className="text-xs font-medium text-night-950/70">
              {COORDINATOR.name}
            </p>
            <p className="text-[11px] text-night-950/45">{COORDINATOR.role}</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile / tablet top bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sand-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
            <Brand compact />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t('a11y.openMenu')}
              className="rounded-xl p-2 text-night-900 hover:bg-sand-100"
            >
              <Icon name="menu" />
            </button>
          </header>

          <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
            <Outlet />
          </main>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('a11y.closeMenu')}
            className="absolute inset-0 bg-night-950/40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 start-0 flex w-72 max-w-[85%] flex-col gap-6 bg-white px-4 py-5 shadow-lift">
            <div className="flex items-center justify-between">
              <Brand compact />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t('a11y.closeMenu')}
                className="rounded-lg p-1.5 text-night-950/50 hover:bg-sand-100"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            {nav}
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
 * Field shell for farmer / volunteer / driver: a single narrow column with a
 * bottom tab bar. These screens live on a phone, in the dark, one-handed.
 */
export function FieldLayout({ items }: { items: NavItem[] }) {
  const { t } = useTranslation()
  const session = useCoreValue(getSession)
  const name = useCoreValue(getMyDisplayName)

  return (
    <div className="flex min-h-dvh flex-col bg-sand-50">
      <header className="sticky top-0 z-30 border-b border-sand-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Brand compact />
          <div className="text-end leading-tight">
            <p className="text-sm font-medium text-night-950">{name}</p>
            <p className="text-[11px] text-night-950/45">
              {t(`roles.${session.role}`)}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        <Outlet />
      </main>

      {/* Tab bar and dev toolbar share one sticky footer so they stack instead
          of overlapping at `bottom-0`. */}
      <div className="sticky bottom-0 z-30">
        <nav className="border-t border-sand-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-0.5 px-2 py-2.5 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-night-900' : 'text-night-950/45'
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
  { to: '/volunteer/report', icon: 'alert', labelKey: 'nav.report' },
]

export const DRIVER_NAV: NavItem[] = [
  { to: '/driver', icon: 'car', labelKey: 'nav.myTrip', end: true },
]
