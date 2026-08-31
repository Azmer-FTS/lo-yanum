import { useTranslation } from 'react-i18next'

import { useDataState } from '../hooks/useDataState'

/**
 * P2.5b — THE ONE THING THE DATA SWAP HAD TO ADD TO THE SHELL.
 *
 * P2.6's rule is "no screen changes", and this is not one: no screen renders
 * differently, and in demo mode `useDataState` returns null before a line of
 * the data layer has been fetched. It exists because the real implementation
 * has one failure mode that is INVISIBLE without it:
 *
 *   SIGNED IN, BUT NOBODY. `app_users` is where a login becomes a coordinator.
 *   An account with no row there passes authentication and fails every policy,
 *   so the app looks exactly like a database nobody has imported into yet —
 *   twenty-six empty screens and not one error. Silence is the wrong answer to
 *   "I am logged in and my farms are gone".
 *
 * ★ AND WHAT IT DELIBERATELY DOES **NOT** SHOW, since P2.5b: a failed fetch.
 *   Being unable to reach Frankfurt from a farm track is a STATE, not a fault,
 *   and the app now answers it from the cache. An alert banner every time a
 *   coordinator drives through a dead spot is an alert banner nobody reads by
 *   the end of the week — the quiet `SyncBadge` in the rail says it instead,
 *   and only says it when there is actually something waiting.
 */
export function DataBanner() {
  const { t } = useTranslation()
  const state = useDataState()

  if (state === null) return null
  if (state.status !== 'no-grant' && state.status !== 'error') return null

  const noGrant = state.status === 'no-grant'
  return (
    <div
      role="alert"
      data-testid={noGrant ? 'data-no-grant' : 'data-error'}
      className={`mx-4 mt-4 rounded-card px-4 py-3 text-body ${
        noGrant
          ? 'bg-status-danger/10 text-status-danger-ink'
          : 'bg-status-warn/15 text-status-warn-ink'
      }`}
    >
      <p className="font-semibold">
        {noGrant ? t('data.noGrant.title') : t('data.error.title')}
      </p>
      <p className="mt-1 opacity-90">
        {noGrant ? t('data.noGrant.body') : t('data.error.body')}
      </p>
    </div>
  )
}
