import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'
import { useDataState } from '../hooks/useDataState'
import { useOnline } from '../offline'
import { useStackBelow } from '../hooks/useStackBelow'

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
  /**
   * ★★ AM6.2 (2026-09-16) — « מסונכרן » NE SE DIT QUE SUR UN CHANGEMENT D'ÉTAT.
   *
   * Il s'affichait après CHAQUE enregistrement : une modification part dans la
   * file (1), la file se vide (0), et la pastille célébrait un envoi qui avait
   * duré quarante millisecondes. Le PO le voyait revenir « périodiquement »,
   * au rythme de ses propres gestes. Une confirmation de routine qui revient à
   * chaque geste n'est plus lue — ni le jour où elle compte.
   *
   * ★ Elle ne se dit donc plus que dans les deux cas où l'état a CHANGÉ :
   *   · le réseau revient après une coupure ;
   *   · la file se vide alors qu'elle s'était remplie HORS LIGNE (du travail
   *     que le PO sait non envoyé, et dont il attend la nouvelle).
   * ★ Et « N ממתינים » attend 1,5 s avant de s'afficher en ligne : un envoi
   *   ordinaire est parti avant.
   * L'état permanent se lit dans הגדרות › « חיבור וסנכרון » (AI7).
   */
  const offlineWork = useRef(false)
  const [pendingShown, setPendingShown] = useState(false)

  useEffect(() => {
    if (!online && pending > 0) offlineWork.current = true
    const cameBack = wasOffline.current && online
    const drained = previousPending.current > 0 && pending === 0 && offlineWork.current
    previousPending.current = pending
    wasOffline.current = !online
    if (pending === 0 && online) offlineWork.current = false
    if (!cameBack && !drained) return

    setJustSynced(true)
    const timer = setTimeout(() => setJustSynced(false), 2500)
    return () => clearTimeout(timer)
  }, [online, pending])

  useEffect(() => {
    if (pending === 0) {
      setPendingShown(false)
      return
    }
    if (!online) {
      setPendingShown(true)
      return
    }
    const timer = setTimeout(() => setPendingShown(true), 1500)
    return () => clearTimeout(timer)
  }, [pending, online])

  let phase: Phase = 'quiet'
  if (!online) phase = 'offline'
  else if (status === 'loading') phase = 'syncing'
  else if (pending > 0 && pendingShown) phase = 'pending'
  else if (justSynced) phase = 'done'

  const stripRef = useRef<HTMLDivElement | null>(null)
  const below = useStackBelow(
    stripRef,
    phase !== 'quiet',
    'network',
    '[data-top-banner], [data-top-banner-float]',
  )

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
      ref={stripRef}
      className="pointer-events-none fixed start-0 end-0 z-40 flex justify-center"
      /* ★ AM6.1 — sous tout bandeau déjà posé en haut (`useStackBelow`). */
      style={{ insetBlockStart: `calc(var(--shell-top) + 0.5rem + ${below}px)` }}
      // N7.1 (2026-09-02) — `data-overlay`: this strip FLOATS over the header
      // on purpose (a toast, not a bar), so the layout sweep's "no pinned
      // element covers another" rule exempts it the way it exempts a modal.
      // It is pointer-events-none and the pill inside is the only paint.
      data-overlay=""

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
