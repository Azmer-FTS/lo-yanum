import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { COORDINATOR, getMyDisplayName, getSession } from '@core/index'

import { signOut } from '../../data/auth'
import { SUPABASE_CONFIGURED } from '../../data/config'
import { useDataState } from '../hooks/useDataState'
import { useOnline } from '../offline'
import { useAuth } from '../hooks/useAuth'
import { useCoreValue } from '../hooks/useCore'
import { usePublishedHeight } from '../hooks/useShellMetrics'
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
  { to: '/coordinator/drivers', icon: 'steering', labelKey: 'nav.drivers' },
  { to: '/coordinator/missions', icon: 'shield', labelKey: 'nav.missions' },
  { to: '/coordinator/incidents', icon: 'alert', labelKey: 'nav.incidents' },
  // P2.5a — last in the rail on purpose: it is consulted, not worked in.
  { to: '/coordinator/settings', icon: 'switch', labelKey: 'nav.settings' },
]

/**
 * Routes that manage their own full-bleed canvas and must not be padded.
 *
 * P0bis.1 — this is now simply "every screen that carries a map". The frozen
 * rule put the map-first gabarit on the two rosters, the mission and incident
 * details, the anchor sheet and both map-carrying forms, and a map-first
 * screen supplies its own padding inside `MapSplit`'s content column. The one
 * screen NOT on the list that has a map is the guard wizard, whose step 1 is
 * map-first inside its own stepper shell (Lot 0.9 F2) — the shell's padding is
 * what keeps the stepper aligned with steps 2–4.
 */
const BLEED_ROUTES = [
  '/coordinator',
  '/coordinator/farms',
  '/coordinator/route',
  '/coordinator/volunteers',
  '/coordinator/drivers',
  '/coordinator/missions',
  '/coordinator/incidents',
]

/**
 * The map-first sub-routes: farm detail AND the farm form (`new` / `edit`),
 * the anchor sheet and the anchor form, the mission detail — but NOT
 * `missions/new`, which is the wizard — and the incident detail.
 */
const BLEED_PATTERNS = [
  /^\/coordinator\/farms\/[^/]+$/,
  /^\/coordinator\/farms\/[^/]+\/edit$/,
  /^\/coordinator\/farms\/[^/]+\/anchors\/.+$/,
  /^\/coordinator\/incidents\/[^/]+$/,
]

const isBleedPath = (pathname: string) =>
  BLEED_ROUTES.some((r) => pathname === r) ||
  BLEED_PATTERNS.some((r) => r.test(pathname)) ||
  (/^\/coordinator\/missions\/[^/]+$/.test(pathname) &&
    pathname !== '/coordinator/missions/new')

function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <div
      // `flex-1` only when expanded; on the COLLAPSED rail it would defeat
      // the wrapper's `justify-center` and shove the shield to the inline start.
      className={`flex min-w-0 items-center gap-2.5 ${compact ? '' : 'flex-1'}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-accent/15 text-accent-ink ring-1 ring-accent/25">
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
/**
 * P2.5a — THE ONE PIECE OF SHELL CHROME THAT IS ONLY EVER THERE WHEN IT MATTERS.
 *
 * There is no "online" indicator, deliberately. A green dot that is green
 * ninety-nine times out of a hundred is read as decoration by the hundredth
 * time, which is the one time it changes. This renders NOTHING while there is
 * a network and is unmissable when there is not — which, on the way to a farm
 * in the northern Negev, is a state the coordinator enters and leaves several
 * times an hour and must never have to guess at.
 */
function OfflineBadge({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const online = useOnline()
  if (online) return null

  return (
    <span
      data-testid="offline-badge"
      title={t('settings.connection.offline')}
      className={`inline-flex items-center gap-1.5 rounded-pill bg-status-warn/15 px-2.5 py-1
                  text-micro font-semibold text-status-warn-ink ${compact ? 'px-1.5' : ''}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-status-warn" />
      {!compact && t('settings.connection.badge')}
    </span>
  )
}

/**
 * P2.5b — "N ממתינים לסנכרון", AND IT IS THE ONLY THING THE OFFLINE DATA LAYER
 * SAYS OUT LOUD.
 *
 * Same rule as `OfflineBadge` above and for the same reason: nothing is
 * rendered while there is nothing waiting. A permanent "synced ✓" would be
 * read as decoration by the time it mattered.
 *
 * ★ WHAT IT COUNTS IS AGGREGATES, NOT ACTIONS. Editing the same guard six
 *   times on a farm track leaves ONE entry in the outbox — it is keyed by
 *   `collection/id` and coalesces — so this says 1, which is also the number
 *   of things that are actually different from the server. A count of six
 *   would be true about the coordinator's afternoon and false about his data.
 */
function SyncBadge({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const data = useDataState()
  const count = data?.pending ?? 0
  if (count === 0) return null

  return (
    <span
      data-testid="sync-badge"
      title={t('data.sync.title', { count })}
      className={`inline-flex items-center gap-1.5 rounded-pill bg-status-info/15 px-2.5 py-1
                  text-micro font-semibold text-status-info-ink ${compact ? 'px-1.5' : ''}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-status-info" />
      {compact ? count : t('data.sync.badge', { count })}
    </span>
  )
}

/**
 * P2.3 — WHO AM I, AND HOW DO I LEAVE.
 *
 * In demo mode this is what it always was: the coordinator's name on a tile,
 * because there is nothing to leave. In a real build it also carries the
 * signed-in address and the way out — and the way out belongs HERE, at the
 * foot of the rail with the identity it ends, rather than buried in a settings
 * screen this app does not have.
 *
 * The address is `dir="ltr"`: an email in an RTL paragraph renders its domain
 * before its mailbox, which is not a cosmetic problem when the whole point of
 * the line is to let someone check WHICH account he is in.
 */
function AccountBlock({ expanded }: { expanded: boolean }) {
  const { t } = useTranslation()
  const auth = useAuth()
  const signedIn = auth.status === 'signed-in'

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`rounded-field bg-surface-high p-2.5 ${expanded ? '' : 'text-center'}`}
      >
        {expanded ? (
          <>
            <p className="truncate text-caption font-medium text-content-primary">
              {COORDINATOR.name}
            </p>
            {signedIn ? (
              <p
                dir="ltr"
                title={auth.email ?? undefined}
                className="truncate text-start text-micro text-content-muted"
              >
                {auth.email}
              </p>
            ) : (
              <p className="truncate text-micro text-content-muted">
                {COORDINATOR.role}
              </p>
            )}
          </>
        ) : (
          <span className="text-caption font-semibold text-accent-ink">
            {COORDINATOR.name.slice(0, 1)}
          </span>
        )}
      </div>

      {signedIn && (
        <button
          type="button"
          onClick={() => void signOut()}
          title={expanded ? undefined : t('auth.signOut')}
          data-testid="sign-out"
          className={`flex items-center gap-2 rounded-field px-3 py-2 text-caption text-content-muted
                      transition-colors duration-fast hover:bg-surface-high hover:text-content-primary ${
                        expanded ? '' : 'justify-center px-0'
                      }`}
        >
          <Icon name="logout" size={17} className="rtl:-scale-x-100" />
          {expanded && <span>{t('auth.signOut')}</span>}
        </button>
      )}
    </div>
  )
}

export function CoordinatorLayout() {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { pathname } = useLocation()
  // F5.4 — the wizard's sticky stepper offsets by this bar's real height.
  const topBarRef = useRef<HTMLElement | null>(null)
  usePublishedHeight(topBarRef, '--shell-top')

  const bleed = isBleedPath(pathname)

  // Close the mobile slide-over whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname])

  const navLink = (item: NavItem, showLabel: boolean) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      title={showLabel ? undefined : t(item.labelKey)}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-field px-3 py-2.5 text-caption font-medium
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
          // P3.4 — in the installed app the rail runs to the top edge of the
          // display, so its own surface is what the clock is drawn on, and the
          // shield below it has to start UNDER the clock rather than behind it.
          // The inset is ADDED to the rail's own `py-4`, which is why the top
          // padding is written out rather than left to `py-4` (see index.css).
          className={`sticky top-0 hidden h-[calc(100dvh-var(--shell-bottom))] shrink-0 flex-col gap-4
                      overflow-y-auto border-e border-edge-subtle bg-surface-raised px-3 pb-4
                      pt-[calc(var(--status-inset)+1rem)]
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
            className={`-mt-2 flex items-center gap-2 rounded-field border border-edge-subtle px-3 py-1.5
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
              <OfflineBadge compact={!expanded} />
              <SyncBadge compact={!expanded} />
            </div>
            <div className={expanded ? '' : 'flex justify-center'}>
              <ThemeToggle compact={!expanded} vertical={!expanded} />
            </div>

            <AccountBlock expanded={expanded} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile / tablet top bar */}
          <header
            ref={topBarRef}
            className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-edge-subtle bg-surface-overlay/95 px-4 pb-3 pt-[calc(var(--status-inset)+0.75rem)] backdrop-blur lg:hidden"
          >
            <Brand />
            <div className="flex items-center gap-2">
              <OfflineBadge />
              <SyncBadge />
              <ThemeToggle compact />
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label={t('a11y.openMenu')}
                className="rounded-field p-2 text-content-secondary transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
              >
                <Icon name="menu" />
              </button>
            </div>
          </header>

          {/* P3.4 — `lg:pt-[…status-inset…]` AND ONLY AT `lg`.
              Below it this column sits under the sticky header, which already
              carries the inset; past it there IS no header — the rail is
              beside the content, not above it — so the first card of every
              screen would start at y=0, under the installed app's clock. The
              content still SCROLLS under the system zone, which is what the
              gradient is for; it just does not START there. */}
          <main
            className={
              bleed
                ? 'flex-1'
                : 'flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:pb-6 lg:pt-[calc(var(--status-inset)+1.5rem)] 2xl:px-8'
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
          <div className="absolute inset-y-0 start-0 flex w-72 max-w-[85%] animate-fade-in flex-col gap-5 border-e border-edge-strong bg-surface-raised px-3 pb-4 pt-[calc(var(--status-inset)+1rem)] shadow-lift">
            <div className="flex items-center justify-between px-1">
              <Brand />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t('a11y.closeMenu')}
                className="rounded-field p-1.5 text-content-muted hover:bg-surface-high hover:text-content-primary"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {COORDINATOR_NAV.map((item) => navLink(item, true))}
            </nav>

            {/* The rail's account block is desktop-only, and a phone is where
                a shared laptop's coordinator most needs to be able to get out. */}
            <div className="mt-auto">
              <AccountBlock expanded />
            </div>
          </div>
        </div>
      )}

      {/* PO RETURN 6 — THE WRAPPER GOES TOO, NOT JUST THE BAR.
          `DevToolbar` has returned `null` in a real build since P2.3, which
          left this `sticky bottom-0` container rendering as an empty box. It
          was not the grey band the product owner saw — that was the
          `--shell-bottom` token (see tokens.css) — but "the bar is removed and
          its container is still in the tree" is how a second band gets added
          back by the next person to put something in it. In a real build there
          is nothing pinned to the foot of this shell, and nothing here to
          say so. */}
      {!SUPABASE_CONFIGURED && (
        <div className="sticky bottom-0 z-40">
          <DevToolbar />
        </div>
      )}
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
      <header className="sticky top-0 z-30 border-b border-edge-subtle bg-surface-overlay/95 px-4 pb-3 pt-[calc(var(--status-inset)+0.75rem)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Brand />
          <div className="flex items-center gap-3">
            <OfflineBadge />
            <SyncBadge />
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
        {/* PO return 6 — in DEMO mode `DevToolbar` sits below this bar and
            carries the home-indicator inset itself; in a real build this IS the
            bottom-most element, so it takes the inset on. Exactly one of the
            two ever pads, which is why this is a condition and not a class on
            both. */}
        <nav
          className={`border-t border-edge-subtle bg-surface-overlay/95 backdrop-blur ${
            SUPABASE_CONFIGURED ? 'pb-[var(--safe-bottom)]' : ''
          }`}
        >
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
