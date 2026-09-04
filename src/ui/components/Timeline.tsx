import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDateTime, formatTime } from '@core/index'

import { Icon } from './Icon'
import type { IconName } from './Icon'
import { useLocale } from '../hooks/useLocale'

/**
 * D6 — the one vertical timeline, used by incidents, missions and farms.
 *
 * Three states, and the distinction between them is the whole component:
 *
 *   done     — it happened, and there is a real timestamp to prove it.
 *   current  — this is the step everyone is waiting on RIGHT NOW. It gets the
 *              accent ring and a pulsing node; on a night-guard screen at 02:00
 *              "where are we up to" must be answerable without reading.
 *   pending  — not reached. Shown with a dashed node and an em dash, never
 *              hidden: an empty slot in a sequence is information ("nobody has
 *              confirmed the pick-up"), and collapsing it destroys that.
 *
 * The rail is drawn per entry rather than as one absolutely-positioned line, so
 * it stops naturally at the last node instead of dangling past it, and so a
 * completed prefix can be coloured differently from the pending tail.
 */

export type TimelineState = 'done' | 'current' | 'pending'

export interface TimelineEntry {
  id: string
  label: string
  /** ISO datetime, or null when the step has not been reached. */
  at: string | null
  /** Who recorded it — an action log needs an author. */
  author?: string
  detail?: ReactNode
  icon?: IconName
  state: TimelineState
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'accent'
}

const NODE_TONE: Record<NonNullable<TimelineEntry['tone']>, string> = {
  default: 'bg-status-info/15 text-status-info-ink ring-status-info/30',
  success: 'bg-status-success/15 text-status-success-ink ring-status-success/30',
  warn: 'bg-status-warn/15 text-status-warn-ink ring-status-warn/30',
  danger: 'bg-status-danger/15 text-status-danger-ink ring-status-danger/30',
  accent: 'bg-accent/15 text-accent-ink ring-accent/30',
}

export function Timeline({
  entries,
  /** Show the date as well as the clock time — for logs that span days. */
  withDate = false,
}: {
  entries: TimelineEntry[]
  withDate?: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()

  return (
    <ol className="stagger flex flex-col">
      {entries.map((entry, i) => {
        const last = i === entries.length - 1
        const pending = entry.state === 'pending'
        const current = entry.state === 'current'
        const tone = NODE_TONE[entry.tone ?? 'default']

        return (
          <li key={entry.id} className="flex gap-3">
            {/* Node + rail. The rail belongs to the node column so it tracks
                the node's own vertical rhythm rather than a magic offset. */}
            <div className="flex shrink-0 flex-col items-center">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-pill ring-1 transition-all duration-base ${
                  pending
                    ? 'bg-surface-high text-content-muted ring-edge-subtle'
                    : tone
                } ${current ? 'shadow-glow ring-2' : ''}`}
              >
                <Icon
                  name={entry.icon ?? (pending ? 'clock' : 'check')}
                  size={15}
                />
              </span>
              {!last && (
                <span
                  className={`w-px flex-1 ${
                    pending ? 'bg-edge-subtle' : 'bg-edge-strong'
                  }`}
                  style={{ minHeight: '0.75rem' }}
                />
              )}
            </div>

            {/* ★ X9.1 (2026-09-04) — THE TIMESTAMP IS ON ITS OWN LINE, UNDER
                THE STEP.
                It used to be `ms-auto` on the title's row, which put a Hebrew
                label and an LTR date at the two ends of a narrow column with a
                stretch of nothing between them — and on a step whose label
                wrapped, the date landed level with the second line and read as
                belonging to the wrong entry. Under the title it is where a
                date is in every log the coordinator has ever read, and the
                title gets the whole width back. */}
            <div className={`min-w-0 flex-1 ${last ? 'pb-0' : 'pb-4'}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p
                  className={`text-caption font-semibold ${
                    pending ? 'text-content-muted' : 'text-content-primary'
                  }`}
                >
                  {entry.label}
                </p>
                {current && (
                  <span className="chip bg-accent/15 text-accent-ink">
                    <span className="live-dot" />
                    {t('timeline.now')}
                  </span>
                )}
              </div>
              <p className="ltr-nums mt-0.5 text-start text-micro text-content-muted">
                {entry.at
                  ? withDate
                    ? formatDateTime(entry.at, locale)
                    : formatTime(entry.at, locale)
                  : '—'}
              </p>

              {entry.detail && (
                <div className="mt-0.5 text-caption text-content-secondary">
                  {entry.detail}
                </div>
              )}
              {entry.author && (
                <p className="muted mt-0.5">{entry.author}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
