import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { formatTime, getDayPlan, saveTour } from '@core/index'
import type { AgendaEvent, DayPlanItem, TourSuggestion } from '@core/index'

import { Icon } from './Icon'
import type { IconName } from './Icon'
import { EmptyState } from './primitives'
import { useCoreValue } from '../hooks/useCore'
import { useLocale } from '../hooks/useLocale'

/**
 * G9 — "היום שלי": one day as the coordinator will actually drive it.
 *
 * Rendered on the dashboard (today) and on the agenda's day view (any day —
 * G7bis.4's button opens the planner parameterised on that date, and this
 * block is what the saved result looks like). One engine behind both:
 * `getDayPlan`, with the date as the only parameter.
 *
 * The chronology mixes three kinds of row on purpose — drive-computed stops,
 * fixed-hour events, the return leg — because the whole point of the bridge is
 * that neither half of the day exists without the other: the meeting at 11:00
 * is WHY the second farm is reached at 12:10.
 */

const EVENT_ICON: Record<AgendaEvent['kind'], IconName> = {
  mission: 'shield',
  visit: 'pin',
  meeting: 'users',
}

const km = (v: number) => v.toFixed(1)

function ItemRow({ item }: { item: DayPlanItem }) {
  const { t } = useTranslation()
  const locale = useLocale()

  if (item.kind === 'return') {
    return (
      <li className="flex items-center gap-2.5 px-2 py-1.5">
        <span className="ltr-nums numeric w-11 shrink-0 text-micro text-content-muted">
          {formatTime(item.at, locale)}
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-field bg-surface-high text-content-muted">
          <Icon name="home" size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-caption text-content-secondary">
          {t('myday.return')}
        </span>
      </li>
    )
  }

  if (item.kind === 'event' && item.event) {
    const event = item.event
    return (
      <li className="flex items-center gap-2.5 px-2 py-1.5">
        <span className="ltr-nums numeric w-11 shrink-0 text-micro font-semibold text-content-primary">
          {formatTime(event.at, locale)}
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-field bg-farm-visited/15 text-farm-visited-ink">
          <Icon name={EVENT_ICON[event.kind]} size={13} />
        </span>
        <Link
          to={event.href}
          className="min-w-0 flex-1 truncate text-caption text-content-primary hover:underline"
        >
          {event.title}
        </Link>
        {/* The chip is the contract: this hour is immovable, the stops flow
            around it. A guard mission carries no chip — it is on the day, but
            it is not a slot in the coordinator's drive (see tours.ts). */}
        {event.kind !== 'mission' && (
          <span className="chip shrink-0 bg-surface-high text-content-secondary">
            <Icon name="clock" size={11} />
            {t('myday.fixedChip')}
          </span>
        )}
      </li>
    )
  }

  const stop = item.stop
  if (!stop) return null
  return (
    <li className="flex items-center gap-2.5 rounded-field px-2 py-1.5 transition-colors duration-fast hover:bg-surface-high">
      <span className="ltr-nums numeric w-11 shrink-0 text-micro font-semibold text-content-primary">
        {formatTime(stop.arriveAt, locale)}
      </span>
      <span className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-accent text-micro font-bold text-content-on-accent">
        {stop.order}
      </span>
      <span className="min-w-0 flex-1">
        <Link
          to={`/coordinator/farms/${stop.farm.id}`}
          className="block truncate text-caption font-medium text-content-primary hover:underline"
        >
          {stop.farm.name}
        </Link>
        <span className="muted ltr-nums block truncate">
          {t('myday.driveLeg', {
            km: km(stop.legKm),
            minutes: stop.driveMinutes,
          })}
        </span>
      </span>
      {stop.waitMinutes > 0 && (
        <span className="chip shrink-0 bg-status-warn/15 text-status-warn-ink">
          {t('myday.waitChip', { count: stop.waitMinutes })}
        </span>
      )}
      {stop.visitEvent && (
        <span className="chip shrink-0 bg-status-violet/15 text-status-violet-ink">
          <Icon name="pin" size={11} />
          {t('route.visitPlanned')}
          <span className="ltr-nums">
            {formatTime(stop.visitEvent.at, locale)}
          </span>
        </span>
      )}
      <a
        href={stop.wazeUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={t('myday.openInWaze')}
        className="shrink-0 rounded-field p-1.5 text-content-muted transition-colors duration-fast hover:bg-accent/10 hover:text-accent-ink"
      >
        <Icon name="external" size={14} />
      </a>
    </li>
  )
}

function SuggestionChip({
  suggestion,
  onAdd,
}: {
  suggestion: TourSuggestion
  onAdd: (s: TourSuggestion) => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => onAdd(suggestion)}
      title={t('myday.addToRoute')}
      className="inline-flex items-center gap-1.5 rounded-pill bg-surface-high px-3 py-1.5 text-micro
                 font-medium text-content-primary transition-all duration-fast ease-out
                 hover:bg-gradient-accent hover:text-content-on-accent active:scale-95"
    >
      <Icon name="plus" size={12} />
      <span className="max-w-36 truncate">{suggestion.farm.name}</span>
      <span className="ltr-nums opacity-70">
        {t('myday.detourKm', { km: km(suggestion.detourKm) })}
      </span>
    </button>
  )
}

export function MyDayBlock({ dayKey }: { dayKey: string }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const plan = useCoreValue(() => getDayPlan(dayKey))

  const plannerHref = `/coordinator/route?date=${dayKey}`

  // A50 / G7bis.4 — no saved tour: the block is the CTA. The day's fixed
  // events already show in the agenda around it; what is missing is a route.
  if (plan.tour === null) {
    return (
      <div className="card card-pad">
        <EmptyState
          icon="route"
          title={t('myday.empty')}
          hint={t('myday.emptyHint')}
          action={
            <Link to={plannerHref} className="btn-primary">
              <Icon name="route" size={15} />
              {t('myday.createRoute')}
            </Link>
          }
        />
      </div>
    )
  }

  const addSuggestion = (s: TourSuggestion) => {
    const tour = plan.tour
    if (!tour) return
    const farmIds = [...tour.farmIds]
    farmIds.splice(s.insertAt, 0, s.farm.id)
    saveTour({ dayKey: tour.dayKey, departAt: tour.departAt, farmIds })
  }

  return (
    <div className="card card-pad">
      {/* Header line: departure + the day's arithmetic. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2">
        <span className="flex items-center gap-1.5 text-caption font-semibold text-content-primary">
          <Icon name="route" size={15} className="text-accent-ink" />
          {t('myday.departure')}
          <span className="ltr-nums numeric">
            {formatTime(plan.tour.departAt, locale)}
          </span>
        </span>
        <span className="muted ltr-nums ms-auto">
          {t('myday.stopsCount', { count: plan.stops.length })} ·{' '}
          {km(plan.totalKm)} {t('common.km')} · {plan.driveMinutes}{' '}
          {t('common.minutesShort')}
        </span>
      </div>

      <ol className="flex flex-col divide-y divide-edge-subtle">
        {plan.items.map((item) => (
          <ItemRow
            key={
              item.kind === 'stop'
                ? `stop-${item.stop?.farm.id}`
                : item.kind === 'event'
                  ? `event-${item.event?.id}`
                  : 'return'
            }
            item={item}
          />
        ))}
      </ol>

      {plan.suggestions.length > 0 && (
        <div className="mt-3 border-t border-edge-subtle pt-3">
          <p className="text-micro font-semibold text-content-secondary">
            {t('myday.suggestions')}
          </p>
          <p className="muted mt-0.5">{t('myday.suggestionsHint')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {plan.suggestions.map((s) => (
              <SuggestionChip
                key={s.farm.id}
                suggestion={s}
                onAdd={addSuggestion}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge-subtle pt-3">
        {plan.mapsUrl && (
          <a
            href={plan.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            <Icon name="external" size={15} />
            {t('route.openInGoogleMaps')}
          </a>
        )}
        <Link to={plannerHref} className="btn-ghost ms-auto">
          <Icon name="edit" size={14} />
          {t('myday.editRoute')}
        </Link>
      </div>
    </div>
  )
}
