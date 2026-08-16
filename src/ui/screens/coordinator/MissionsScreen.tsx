import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  formatDate,
  formatTime,
  formatWeekday,
  getPastMissionViews,
  getUpcomingMissionViews,
  resolveConfirmation,
} from '@core/index'
import type { MissionView } from '@core/index'

import { Icon } from '../../components/Icon'
import { MissionStatusChip } from '../../components/badges'
import {
  EmptyState,
  FilterBar,
  FilterPill,
  PageHeader,
  RowLink,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

export function MissionRow({ view }: { view: MissionView }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { mission, farm, anchorPoint, driver, volunteers } = view

  // A driver-vs-group disagreement on any person, either leg, flags the row.
  const mismatch = mission.assignments.some(
    (a) =>
      resolveConfirmation(a.outbound) === 'mismatch' ||
      resolveConfirmation(a.inbound) === 'mismatch',
  )

  return (
    <RowLink to={`/coordinator/missions/${mission.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption font-medium">{farm.name}</span>
        <MissionStatusChip status={mission.status} />
        {mismatch && (
          <span className="chip bg-status-warn/15 text-status-warn">
            <Icon name="alert" size={12} />
            {t('alerts.presence_mismatch')}
          </span>
        )}
      </div>

      <p className="muted mt-0.5">
        <span className="ltr-nums">{formatDate(mission.startAt, locale)}</span>{' '}
        · {formatWeekday(mission.startAt, locale)} ·{' '}
        <span className="ltr-nums">
          {formatTime(mission.startAt, locale)}–{formatTime(mission.endAt, locale)}
        </span>
      </p>

      <p className="muted mt-0.5 truncate">
        {anchorPoint.name} · {volunteers.map((v) => v.volunteer.name).join(', ')}
        {driver ? ` · ${driver.name}` : ` · ${t('missions.noDriver')}`}
      </p>
    </RowLink>
  )
}

export function MissionsScreen() {
  const { t } = useTranslation()
  const upcoming = useCoreValue(getUpcomingMissionViews)
  const past = useCoreValue(getPastMissionViews)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  const list = useMemo(
    () => (tab === 'upcoming' ? upcoming : past),
    [tab, upcoming, past],
  )

  return (
    <>
      <PageHeader
        title={t('missions.title')}
        subtitle={t('missions.count', { count: list.length })}
      />

      <FilterBar>
        <FilterPill
          active={tab === 'upcoming'}
          onClick={() => setTab('upcoming')}
          count={upcoming.length}
        >
          {t('missions.upcoming')}
        </FilterPill>
        <FilterPill
          active={tab === 'past'}
          onClick={() => setTab('past')}
          count={past.length}
        >
          {t('missions.past')}
        </FilterPill>
      </FilterBar>

      {list.length === 0 ? (
        <EmptyState icon="shield" title={t('missions.empty')} />
      ) : (
        <ul className="card divide-y divide-edge-subtle p-1.5">
          {list.map((view) => (
            <li key={view.mission.id}>
              <MissionRow view={view} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
