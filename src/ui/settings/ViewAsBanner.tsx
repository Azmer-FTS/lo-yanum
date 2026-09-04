import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Icon } from '../components/Icon'
import { stopViewAs, useViewAs } from './viewAs'

/**
 * ★★ Y13 (2026-09-04) — "BANDEAU DISCRET RAPPELANT LE RÔLE SIMULÉ."
 *
 * Rendered by the FIELD shell, so it is on every screen the simulated role
 * has, and nowhere else — a coordinator looking at his own dashboard is not
 * simulating anything and must not be told he is.
 *
 * ★ THE WAY BACK IS ON THE BANNER, and that is the whole reason the banner is
 *   in the shell rather than a card on one screen. A simulated farmer has no
 *   הגדרות to return from: three tabs, none of them settings. If the exit
 *   lived only in the section that opened the door, stepping into a farmer's
 *   screen would be a one-way trip ending in clearing site data.
 *
 * ⚠️ AND IT LIVES INSIDE THE STICKY HEADER, WHICH THE FIRST VERSION DID NOT.
 *   It was a sibling below the header on the reasoning that a second pinned
 *   strip costs a phone a second slice of its screen — true, and beside the
 *   point: the first capture showed it scrolled out of sight on a farmer's
 *   screen, i.e. the way back gone. Twenty-eight pixels, only while a
 *   simulation is running, is the right price for the exit always being one
 *   tap away.
 */
export function ViewAsBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const active = useViewAs()
  if (!active) return null

  return (
    <div
      data-testid="view-as-banner"
      className="border-b border-accent/30 bg-accent/10"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-1.5">
        <Icon name="users" size={13} className="shrink-0 text-accent-ink" />
        <span className="min-w-0 flex-1 truncate text-micro text-accent-ink">
          {t('viewAs.banner', {
            role: t(`roles.${active.role}`),
            name: active.name,
          })}
        </span>
        <button
          type="button"
          onClick={() => {
            stopViewAs()
            navigate('/coordinator')
          }}
          data-testid="view-as-banner-stop"
          className="shrink-0 rounded-field px-2 py-1 text-micro font-semibold text-accent-ink
                     transition-colors duration-fast hover:bg-accent/15"
        >
          {t('viewAs.back')}
        </button>
      </div>
    </div>
  )
}
