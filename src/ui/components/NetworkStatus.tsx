import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'
import { useDataState } from '../hooks/useDataState'
import { useOnline } from '../offline'

/**
 * PO POINT 3 (2026-08-31) — ONE NETWORK PILL, ON EVERY SCREEN.
 *
 * ★★ WHY THE PRODUCT OWNER NEVER SAW THE BADGE THAT ALREADY EXISTED, and it is
 *    a layout fact rather than a mystery. `OfflineBadge` and `SyncBadge` were
 *    rendered in TWO places: the mobile top bar — which is `lg:hidden`, so it
 *    does not exist on his iPad at all — and **the foot of the desktop rail**.
 *    The rail defaults to COLLAPSED (`useState(false)`, 4.5 rem wide), and a
 *    collapsed rail renders both badges `compact`: **a 6 px coloured dot, with
 *    no text, below the navigation, at the bottom of a 1376 px column.** It was
 *    on screen and it was unfindable.
 *
 * ★ SO THIS IS VIEWPORT-PINNED AND SHELL-INDEPENDENT. It is mounted once, at
 *   the root, and it does not care which layout is underneath — coordinator
 *   rail, field tab bar, the login door. "On every screen" has to mean every
 *   screen, including the ones nobody remembered when a new shell was added.
 *
 * ★ AND IT SAYS NOTHING WHEN THERE IS NOTHING TO SAY. No "connected" tick, no
 *   permanent chip. A green dot that is green ninety-nine times in a hundred is
 *   read as decoration by the hundredth time, which is the one time it changed
 *   — the same rule the two badges it replaces were written under, kept.
 *
 * ★ IT IS `pointer-events-none`. The product owner's word was "never
 *   blocking", and a pill floating over the top of a map is exactly the thing
 *   that would eat a tap on a zone he is trying to draw. It is a read-out.
 */

type Phase = 'quiet' | 'offline' | 'pending' | 'syncing' | 'done'

export function NetworkStatus() {
  const { t } = useTranslation()
  const online = useOnline()
  const data = useDataState()
  const pending = data?.pending ?? 0
  const status = data?.status ?? 'idle'

  /**
   * ★ THE GREEN TICK IS A TRANSITION, NOT A STATE, so it is held in a ref-driven
   *   timer rather than derived. "N waiting" going to zero is the only moment
   *   worth celebrating, and it is invisible unless something remembers that it
   *   just happened.
   */
  const [justSynced, setJustSynced] = useState(false)
  const previousPending = useRef(pending)
  const wasOffline = useRef(!online)

  useEffect(() => {
    const cameBack = wasOffline.current && online
    const drained = previousPending.current > 0 && pending === 0
    previousPending.current = pending
    wasOffline.current = !online
    if (!cameBack && !drained) return

    setJustSynced(true)
    const timer = setTimeout(() => setJustSynced(false), 2000)
    return () => clearTimeout(timer)
  }, [online, pending])

  let phase: Phase = 'quiet'
  if (!online) phase = 'offline'
  else if (status === 'loading') phase = 'syncing'
  else if (pending > 0) phase = 'pending'
  else if (justSynced) phase = 'done'

  if (phase === 'quiet') return null

  const skin = {
    offline: 'bg-status-warn/15 text-status-warn-ink',
    pending: 'bg-status-info/15 text-status-info-ink',
    syncing: 'bg-status-info/15 text-status-info-ink',
    done: 'bg-status-success/15 text-status-success-ink',
  }[phase]

  const label = {
    offline: t('settings.connection.badge'),
    pending: t('data.sync.badge', { count: pending }),
    syncing: t('data.sync.syncing'),
    done: t('data.sync.done'),
  }[phase]

  return (
    <div
      /**
       * ★ `--shell-top` AND NOT `--status-inset`, so it clears the SHELL's own
       *   sticky header where there is one and the system clock where there is
       *   not. `--shell-top` is the header's measured height and already
       *   includes the inset (index.css) — one variable, both cases.
       */
      /**
       * ⚠️ `inset-inline-0` IS NOT A TAILWIND UTILITY and silently produced
       *   nothing — the pill rendered pinned to the inline start instead of
       *   spanning the viewport, which is why the first capture had it in the
       *   corner over the rail. `start-0 end-0` is the pair that exists.
       */
      className="pointer-events-none fixed start-0 end-0 z-40 flex justify-center"
      style={{ insetBlockStart: 'calc(var(--shell-top) + 0.5rem)' }}
      data-testid={phase === 'offline' ? 'offline-badge' : 'network-status'}
      /**
       * ★ THE TESTID IS `offline-badge` WHEN IT IS OFFLINE, and that is the
       *   UNIFICATION rather than a test convenience. `bun run offline`
       *   asserts EXACTLY ONE offline badge is visible — a claim that used to
       *   be about the rail's dot and the mobile bar's chip fighting over
       *   which shell was showing. There is ONE indicator in the app now, so
       *   the assertion is about the same thing and still counts one.
       */
      data-phase={phase}
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-micro
                    font-semibold shadow-card backdrop-blur ${skin}`}
      >
        {phase === 'done' ? (
          <Icon name="check" size={13} />
        ) : (
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-pill ${
              phase === 'offline' ? 'bg-status-warn' : 'bg-status-info'
            } ${phase === 'syncing' ? 'animate-pulse' : ''}`}
          />
        )}
        {label}
      </span>
    </div>
  )
}
