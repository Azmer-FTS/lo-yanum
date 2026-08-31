import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SUPABASE_CONFIGURED } from '../../data/config'
import { Icon } from './Icon'
import { useOnline } from '../offline'

/**
 * PO POINT 4b (2026-08-31) — PULL TO REFRESH, ON THE CONTENT PANEL AND NOWHERE
 * ELSE.
 *
 * ★★ THE WHOLE REQUIREMENT IS "AND THE MAP STAYS STILL". A page-level
 *    pull-to-refresh on a map-first app drags the canvas down with it, which is
 *    both wrong and alarming: the one thing a coordinator is orienting himself
 *    by slides off the screen. So the native one is off at the page level
 *    (`index.css`, point 4a) and this is armed ONLY on the panel that scrolls
 *    text.
 *
 * ★ POINTER EVENTS, WHICH IS POINT 9 AND NOT AN INCIDENTAL CHOICE. The product
 *   owner drags with an Apple Pencil as often as with a thumb. `touchstart`
 *   would work for the finger and be dead under the stylus on the one gesture
 *   he uses most; `pointerdown` sees `pen`, `touch` and `mouse` alike. Mouse is
 *   deliberately EXCLUDED below — a desktop has a reload button and an
 *   accidental drag-to-refresh on a trackpad is a bug, not a feature.
 *
 * ★ IT ONLY ARMS AT THE TOP OF THE SCROLL. `scrollTop <= 0` at pointer-down,
 *   re-checked on the first move. Arming anywhere else turns every downward
 *   swipe in a long roster into a fight between the list and the gesture.
 *
 * ★ AND IT REFUSES HONESTLY WITH NO NETWORK. The product owner's own words:
 *   "אין חיבור — הנתונים מהמטמון". Pulling offline is not an error and must not
 *   look like one — the app is working exactly as designed, off the cache, and
 *   the message says so and disappears.
 */

const THRESHOLD = 72
const MAX = 110

export function PullToRefresh({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const online = useOnline()
  const ref = useRef<HTMLDivElement | null>(null)
  const start = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  /**
   * ★ THE SCROLL CONTAINER IS FOUND, NOT ASSUMED, and that is what lets this
   *   component be dropped in two very different places. On a map-first screen
   *   the CONTENT COLUMN is its own `overflow-y-auto` box (`MapSplit`'s
   *   `contentPanel`); on every other screen the PAGE scrolls. Asking for the
   *   nearest scrolling ancestor answers both without a prop somebody has to
   *   remember to pass — and a prop passed wrongly here means the gesture arms
   *   halfway down a roster.
   */
  const scroller = (from: HTMLElement | null): { top: number } | null => {
    let el: HTMLElement | null = from
    while (el) {
      const overflow = getComputedStyle(el).overflowY
      if (overflow === 'auto' || overflow === 'scroll') return { top: el.scrollTop }
      el = el.parentElement
    }
    return { top: document.documentElement.scrollTop || document.body.scrollTop }
  }

  const armed = (el: HTMLElement) => (scroller(el)?.top ?? 0) <= 0

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (busy) return
    // A mouse has a reload button; an accidental drag must not refetch 300
    // volunteers because somebody swept the cursor across a list.
    if (e.pointerType === 'mouse') return
    const el = ref.current
    if (!el || !armed(el)) return
    start.current = e.clientY
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current === null || busy) return
    const el = ref.current
    if (!el || !armed(el)) {
      start.current = null
      setPull(0)
      return
    }
    const delta = e.clientY - start.current
    if (delta <= 0) {
      setPull(0)
      return
    }
    // Resistance: the pull follows the finger at first and stiffens, which is
    // the platform's own feel and is what tells a thumb it has reached the end.
    setPull(Math.min(MAX, delta * 0.55))
  }

  const finish = async () => {
    const reached = pull >= THRESHOLD
    start.current = null
    setPull(0)
    if (!reached) return

    if (!online) {
      setMessage(t('data.refresh.offline'))
      setTimeout(() => setMessage(null), 2600)
      return
    }

    setBusy(true)
    setMessage(t('data.refresh.busy'))
    try {
      /**
       * ★ THE DATA LAYER IS IMPORTED LAZILY, AND IT IS THE SAME REASON
       *   `useDataState` does it: a static import here reaches the row mapper
       *   and through it the Supabase client chunk, which would land in the
       *   INITIAL bundle of a DEMO build — /poc, `bun run dev`, and every
       *   browser gate — for a feature none of them has. In demo mode the
       *   flag is false, nothing is fetched, and the spinner still turns for a
       *   beat so the gesture reads as "I asked".
       */
      if (SUPABASE_CONFIGURED) {
        const m = await import('../../data/store')
        await m.refreshData()
      } else {
        await new Promise((r) => setTimeout(r, 450))
      }
    } finally {
      setBusy(false)
      setMessage(null)
    }
  }

  const height = busy ? THRESHOLD : pull

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => void finish()}
      onPointerCancel={() => {
        start.current = null
        setPull(0)
      }}
      data-testid="pull-to-refresh"
      data-pull={Math.round(pull)}
      // `contain` and not `none`: the panel keeps its own end-of-list bounce,
      // it just stops handing the gesture up to the page. See index.css.
      style={{ overscrollBehaviorY: 'contain' }}
      className={className}
    >
      {/* The indicator takes real height so the content moves with the pull
          rather than the pill floating over the top of it. */}
      <div
        className="flex items-end justify-center overflow-hidden transition-[height] duration-fast ease-out"
        style={{ height: `${height}px` }}
        aria-hidden={height === 0}
      >
        {height > 8 && (
          <span
            data-testid="pull-indicator"
            className="mb-2 inline-flex items-center gap-1.5 rounded-pill bg-surface-high px-3 py-1.5 text-micro font-semibold text-content-secondary"
          >
            <Icon
              name="history"
              size={13}
              className={busy ? 'animate-spin' : ''}
            />
            {busy
              ? t('data.refresh.busy')
              : pull >= THRESHOLD
                ? t('data.refresh.release')
                : t('data.refresh.pull')}
          </span>
        )}
      </div>

      {message && !busy && (
        <p
          data-testid="pull-message"
          className="mb-2 text-center text-micro text-content-muted"
        >
          {message}
        </p>
      )}

      {children}
    </div>
  )
}
