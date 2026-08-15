import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import {
  formatDate,
  formatDateTime,
  formatTime,
  formatWeekday,
  getMissionView,
} from '@core/index'
import type { MissionView } from '@core/index'

import { ContactActions, ContactButtons } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { MissionStatusChip, PhoneTypeChip } from '../../components/badges'
import {
  Callout,
  KeyValue,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

function TimelineStep({
  label,
  at,
  done,
  locale,
}: {
  label: string
  at: string | null
  done: boolean
  locale: string
}) {
  const { t } = useTranslation()

  return (
    <li className="flex items-start gap-3 pb-4 last:pb-0">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          done
            ? 'bg-emerald-100 text-emerald-700'
            : 'border border-dashed border-sand-400 text-night-950/30'
        }`}
      >
        <Icon name={done ? 'check' : 'clock'} size={15} />
      </span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="ltr-nums muted">
          {at ? formatDateTime(at, locale) : t('missions.awaiting')}
        </p>
      </div>
    </li>
  )
}

function CountRow({
  label,
  actual,
  expected,
}: {
  label: string
  actual: number | null
  expected: number
}) {
  const { t } = useTranslation()
  const mismatch = actual !== null && actual !== expected

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 px-3.5 py-3">
      <span className="text-sm font-medium">{label}</span>
      {actual === null ? (
        <span className="chip bg-sand-100 text-night-950/60">
          {t('missions.awaiting')}
        </span>
      ) : (
        <span
          className={`chip ${
            mismatch
              ? 'bg-rose-100 text-rose-800'
              : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          <span className="ltr-nums tabular-nums">
            {actual} / {expected}
          </span>
        </span>
      )}
    </div>
  )
}

function TeamList({ view }: { view: MissionView }) {
  const { t } = useTranslation()

  return (
    <ul className="divide-y divide-sand-200">
      {view.volunteers.map(({ volunteer, isGroupPhone }) => (
        <li key={volunteer.id}>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-sm font-medium">{volunteer.name}</span>
            <PhoneTypeChip type={volunteer.phoneType} />
            {isGroupPhone && (
              <span className="chip bg-night-900 text-white">
                <Icon name="phone" size={11} />
                {t('volunteers.groupPhoneHolder')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 pb-2">
            <ContactButtons name={volunteer.name} phone={volunteer.phone} />
            <p className="muted min-w-0 truncate">
              {volunteer.yeshiva} · {volunteer.locality} ·{' '}
              <span className="ltr-nums">{volunteer.phone}</span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function MissionDetailScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { missionId = '' } = useParams()
  const view = useCoreValue(() => getMissionView(missionId))

  if (!view) return <Navigate to="/coordinator/missions" replace />

  const { mission, farm, anchorPoint, driver, volunteers } = view
  const assigned = volunteers.length

  return (
    <>
      <Link
        to="/coordinator/missions"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-night-950/55 hover:text-night-900"
      >
        <Icon name="chevron" size={15} className="ltr:-scale-x-100" />
        {t('missions.title')}
      </Link>

      <PageHeader
        title={farm.name}
        subtitle={`${formatWeekday(mission.startAt, locale)} · ${formatDate(
          mission.startAt,
          locale,
        )}`}
        actions={<MissionStatusChip status={mission.status} />}
      />

      {mission.status === 'return_not_confirmed' && (
        <div className="mb-4">
          <Callout tone="danger" title={t('alerts.return_not_confirmed')}>
            {t('alerts.returnDetail')}
          </Callout>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Section title={t('common.details')}>
            <dl>
              <KeyValue
                label={t('missions.farm')}
                value={
                  <Link
                    to={`/coordinator/farms/${farm.id}`}
                    className="hover:underline"
                  >
                    {farm.name}
                  </Link>
                }
              />
              <KeyValue
                label={t('missions.anchorPoint')}
                value={
                  <Link
                    to={`/coordinator/farms/${farm.id}/anchors/${anchorPoint.id}`}
                    className="hover:underline"
                  >
                    {anchorPoint.name}
                  </Link>
                }
              />
              <KeyValue
                label={t('missions.startAt')}
                value={formatTime(mission.startAt, locale)}
                ltr
              />
              <KeyValue
                label={t('missions.endAt')}
                value={formatTime(mission.endAt, locale)}
                ltr
              />
              <KeyValue label={t('missions.team')} value={assigned} ltr />
            </dl>
          </Section>

          <Section title={t('missions.team')}>
            <TeamList view={view} />
          </Section>

          <Section title={t('missions.driver')}>
            {driver ? (
              <>
                <p className="muted mb-1">
                  {driver.vehicle} · {driver.seats} {t('driver.seats')} ·{' '}
                  {driver.locality}
                </p>
                <ContactActions name={driver.name} phone={driver.phone} />
              </>
            ) : (
              <p className="muted">{t('missions.noDriver')}</p>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title={t('missions.timeline')}>
            <ol>
              <TimelineStep
                label={t('missions.startAt')}
                at={mission.startAt}
                done
                locale={locale}
              />
              <TimelineStep
                label={t('missions.arrivalConfirmed')}
                at={mission.arrivalConfirmedAt}
                done={mission.arrivalConfirmedAt !== null}
                locale={locale}
              />
              <TimelineStep
                label={t('missions.endConfirmed')}
                at={mission.endConfirmedAt}
                done={mission.endConfirmedAt !== null}
                locale={locale}
              />
            </ol>
          </Section>

          <Section title={`${t('missions.dropoff')} / ${t('missions.pickup')}`}>
            <div className="flex flex-col gap-2">
              <CountRow
                label={t('missions.dropoff')}
                actual={mission.dropoffConfirmedCount}
                expected={assigned}
              />
              <CountRow
                label={t('missions.pickup')}
                actual={mission.pickupConfirmedCount}
                expected={assigned}
              />
            </div>
          </Section>

          <Section title={t('map.title')}>
            <MapView
              ariaLabel={t('a11y.map')}
              className="h-48 w-full"
              interactive={false}
              center={anchorPoint.position}
              zoom={12}
              markers={[
                {
                  id: anchorPoint.id,
                  position: anchorPoint.position,
                  color: '#1c2038',
                  title: anchorPoint.name,
                },
              ]}
            />
          </Section>
        </div>
      </div>
    </>
  )
}
