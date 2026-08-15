import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  formatDate,
  formatTime,
  formatWeekday,
  getPastMissionViews,
  getUpcomingMissionViews,
} from '@core/index'
import type { MissionView } from '@core/index'

import { Icon } from '../../components/Icon'
import { MissionStatusChip } from '../../components/badges'
import {
  EmptyState,
  PageHeader,
  RowLink,
  Toggle,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

export function MissionRow({ view }: { view: MissionView }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { mission, farm, anchorPoint, driver, volunteers } = view

  const assigned = volunteers.length
  const dropped = mission.dropoffConfirmedCount
  const mismatch = dropped !== null && dropped !== assigned

  return (
    <RowLink to={`/coordinator/missions/${mission.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{farm.name}</span>
        <MissionStatusChip status={mission.status} />
        {mismatch && (
          <span className="chip bg-rose-100 text-rose-800">
            <Icon name="alert" size={12} />
            {t('missions.countMismatch')}
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
        actions={
          <Toggle
            value={tab}
            onChange={(v) => setTab(v as 'upcoming' | 'past')}
            options={[
              { value: 'upcoming', label: t('missions.upcoming') },
              { value: 'past', label: t('missions.past') },
            ]}
          />
        }
      />

      {list.length === 0 ? (
        <EmptyState icon="shield" title={t('missions.empty')} />
      ) : (
        <ul className="card divide-y divide-sand-200 p-1.5">
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
