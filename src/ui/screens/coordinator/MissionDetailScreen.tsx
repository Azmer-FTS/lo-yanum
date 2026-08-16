import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import {
  formatDate,
  formatDateTime,
  formatTime,
  formatWeekday,
  getMissionView,
} from '@core/index'
import { getPresenceRows } from '@core/index'
import type { MissionLeg, MissionView } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { ContactActions, ContactButtons } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import {
  ConfirmationChip,
  MissionStatusChip,
  PhoneTypeChip,
  readToken,
} from '../../components/badges'
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
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-pill ${
          done
            ? 'bg-status-success/15 text-status-success'
            : 'border border-dashed border-edge-strong text-content-muted'
        }`}
      >
        <Icon name={done ? 'check' : 'clock'} size={15} />
      </span>
      <div>
        <p className="text-caption font-medium">{label}</p>
        <p className="ltr-nums muted">
          {at ? formatDateTime(at, locale) : t('missions.awaiting')}
        </p>
      </div>
    </li>
  )
}

function TeamList({ view }: { view: MissionView }) {
  const { t } = useTranslation()

  return (
    <ul className="divide-y divide-edge-subtle">
      {view.volunteers.map(({ volunteer, isGroupPhone }) => (
        <li key={volunteer.id}>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Avatar
              photo={volunteer.photo}
              name={volunteer.name}
              size="sm"
              ring={isGroupPhone}
            />
            <span className="text-caption font-medium">{volunteer.name}</span>
            <PhoneTypeChip type={volunteer.phoneType} />
            {isGroupPhone && (
              <span className="chip bg-accent text-content-on-accent">
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

/**
 * R6 — the coordinator's reconciliation view: what the driver said and what the
 * group holder said, per person, side by side, for both legs. A disagreement
 * shows as an amber `mismatch` chip rather than being resolved silently.
 */
function PresenceMatrix({ view }: { view: MissionView }) {
  const { t } = useTranslation()
  const legs: MissionLeg[] = ['outbound', 'inbound']

  return (
    <div className="flex flex-col gap-4">
      {legs.map((leg) => {
        const rows = getPresenceRows(view.mission, leg)
        return (
          <div key={leg}>
            <p className="section-title mb-2">{t(`presence.${leg}`)}</p>
            <div className="scroll-x">
              <table className="w-full min-w-[22rem] border-collapse text-caption">
                <thead>
                  <tr className="text-micro uppercase tracking-wide text-content-muted">
                    <th className="p-2 text-start font-semibold">
                      {t('volunteers.colName')}
                    </th>
                    <th className="p-2 text-start font-semibold">
                      {t('presence.driverSays')}
                    </th>
                    <th className="p-2 text-start font-semibold">
                      {t('presence.groupSays')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.volunteer.id}
                      className={`border-t border-edge-subtle ${
                        row.state === 'mismatch' ? 'bg-status-warn/10' : ''
                      }`}
                    >
                      <td className="p-2">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-content-primary">
                            {row.volunteer.name}
                          </span>
                          {row.isGroupPhone && (
                            <Icon name="phone" size={11} className="text-accent-ink" />
                          )}
                          {row.state === 'mismatch' && (
                            <ConfirmationChip state="mismatch" />
                          )}
                        </span>
                      </td>
                      <td className="p-2">
                        <ConfirmationChip state={row.leg.driver ?? 'pending'} />
                      </td>
                      <td className="p-2">
                        <ConfirmationChip state={row.leg.group ?? 'pending'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
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
        className="mb-3 inline-flex items-center gap-1.5 text-caption text-content-muted hover:text-content-primary"
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

          <Section title={t('presence.rosterTitle')}>
            <PresenceMatrix view={view} />
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
                  color: readToken('--accent'),
                  emphasis: true,
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
