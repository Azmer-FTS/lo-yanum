import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SUPABASE_CONFIGURED } from '../../data/config'

import type { DataState } from '../../data/store'

/**
 * P2.6b — THE ONE THING THE DATA SWAP HAD TO ADD TO THE SHELL.
 *
 * P2.6's rule is "no screen changes", and this is not one: no screen renders
 * differently, and in demo mode this component returns null before it has
 * loaded a line of code. It exists because the real implementation has two
 * failure modes that are INVISIBLE without it, and the first one is the worse:
 *
 *   · SIGNED IN, BUT NOBODY. `app_users` is where a login becomes a
 *     coordinator. An account with no row there passes authentication and
 *     fails every policy, so the app looks exactly like a database nobody has
 *     imported into yet — twenty-six empty screens and not one error. Silence
 *     is the wrong answer to "I am logged in and my farms are gone".
 *   · THE FETCH FAILED. Usually the network, which on a farm track is a state
 *     rather than a fault. P2.5b makes this a non-event by answering from the
 *     cache; until then it must at least say so, because an empty dashboard
 *     and an unreachable database look identical too.
 *
 * ★ THE MODULE IS LOADED LAZILY, AND FROM THIS FILE RATHER THAN FROM `App`.
 *   `../../data/store` reaches the row mapper and the Supabase client chunk. A
 *   static import here would put both into the initial bundle of a DEMO build,
 *   which is the one number this app is not allowed to grow.
 */
export function DataBanner() {
  const { t } = useTranslation()
  const [state, setState] = useState<DataState | null>(null)

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return
    let unsubscribe: (() => void) | null = null
    let live = true

    void import('../../data/store').then((m) => {
      if (!live) return
      const read = () => {
        setState(m.getDataState())
      }
      read()
      unsubscribe = m.subscribeData(read)
    })

    return () => {
      live = false
      unsubscribe?.()
    }
  }, [])

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
