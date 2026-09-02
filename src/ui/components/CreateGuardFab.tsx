import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

import { Icon } from './Icon'

/**
 * D3.4 — the persistent "staff a guard" action.
 *
 * Rendered by the coordinator shell, so it is in the same place on the
 * dashboard, the guard list and the agenda. Staffing a guard is the single most
 * frequent thing this role does; it should never require finding the right page
 * first.
 *
 * BELOW `lg` ONLY. On desktop the same action is a primary button in each of
 * those three screens' own headers, because a viewport-fixed element cannot
 * avoid the icon rail: the rail sits at the inline START, which is the RIGHT in
 * Hebrew and the LEFT in English, so any fixed corner collides with either the
 * rail or the map in one of the two directions. On a phone there is no rail and
 * the content is full width, so the floating circle is unambiguous.
 */

/** Routes the action belongs to. Elsewhere it would just be clutter. */
export const FAB_ROUTES = [
  '/coordinator',
  '/coordinator/missions',
  '/coordinator/agenda',
]

export function CreateGuardFab() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  if (!FAB_ROUTES.includes(pathname)) return null

  return (
    <Link
      to="/coordinator/missions/new"
      aria-label={t('missions.create')}
      title={t('missions.create')}
      // PO return 6 / P3.4 — CLEARS WHATEVER IS AT THE FOOT OF THE SHELL, BY
      // MEASUREMENT. This was `bottom-16`, a hard-coded 4 rem chosen to clear
      // the demo toolbar — the same anti-pattern as the `--shell-bottom` token
      // default that produced the grey band, and it failed the same way the
      // moment the toolbar grew by an iPhone's home-indicator inset: the
      // standalone sweep caught the button sitting ON the bar. `--shell-bottom`
      // is the bar's real height (or the bare home-indicator inset in a real
      // build, where there is no bar), so the gap above it is the only number
      // left to choose.
      className="fixed bottom-[calc(var(--shell-bottom)+1.25rem)] end-4 z-40 flex h-14 w-14 items-center justify-center rounded-pill
                 bg-gradient-accent text-content-on-accent shadow-accent
                 transition-all duration-base ease-out active:scale-95 lg:hidden"
    >
      <Icon name="plus" size={24} />
    </Link>
  )
}

/**
 * The desktop counterpart: the same action as a normal header button. Kept in
 * this file so the two never drift apart in label or destination.
 */
export function CreateGuardButton({ className = 'btn-primary' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <Link to="/coordinator/missions/new" className={className}>
      <Icon name="plus" size={15} />
      {t('missions.create')}
    </Link>
  )
}
