import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  COORDINATOR,
  formatDateTime,
  formatTime,
  getMyActiveMissionView,
  getMyDriver,
  getPresenceRows,
  wazeUrl,
} from '@core/index'
import type { MissionLeg } from '@core/index'

import { CallRow } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { PresenceRoster } from '../../components/PresenceRoster'
import { MissionStatusChip, readToken } from '../../components/badges'
import {
  EmptyState,
  PageHeader,
  Section,
  Toggle,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

export function DriverTripScreen() {
  const { t } = useTranslation()
  const locale = useLocale()

  const driver = useCoreValue(getMyDriver)
  const view = useCoreValue(getMyActiveMissionView)
  const [leg, setLeg] = useState<MissionLeg>('outbound')

  const rows = useCoreValue(() =>
    view ? getPresenceRows(view.mission, leg) : [],
  )

  if (!view || !driver) {
    return (
      <>
        <PageHeader title={t('driver.title')} />
        <EmptyState
          icon="car"
          title={t('driver.noTrip')}
          hint={t('driver.noTripHint')}
        />
      </>
    )
  }

  const { mission, farm, anchorPoint } = view
  const groupHolder = rows.find((r) => r.isGroupPhone)?.volunteer

  return (
    <>
      <PageHeader
        title={t('driver.title')}
        subtitle={`${farm.name} · ${formatTime(mission.startAt, locale)}`}
        actions={<MissionStatusChip status={mission.status} />}
      />

      <div className="flex flex-col gap-4">
        {/* The roster comes first: it is what the driver opens the app to do. */}
        <Section
          title={t('presence.rosterTitle')}
          action={
            <Toggle
              value={leg}
              onChange={(v) => setLeg(v as MissionLeg)}
              options={[
                { value: 'outbound', label: t('presence.outbound') },
                { value: 'inbound', label: t('presence.inbound') },
              ]}
            />
          }
        >
          <PresenceRoster
            missionId={mission.id}
            leg={leg}
            source="driver"
            rows={rows}
            groupHolderName={groupHolder?.name}
          />
        </Section>

        <Section
          title={t('driver.destination')}
          action={
            <a
              href={wazeUrl(anchorPoint.position)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-caption font-medium text-accent-ink hover:underline"
            >
              <Icon name="pin" size={13} />
              {t('common.openInWaze')}
            </a>
          }
        >
          <p className="text-caption font-medium text-content-primary">
            {anchorPoint.name}
          </p>
          <p className="muted mt-0.5">
            {farm.name} · {farm.locality}
          </p>
          <MapView
            ariaLabel={t('a11y.map')}
            className="mt-3 h-64 w-full"
            cooperative
            center={anchorPoint.position}
            zoom={12}
            markers={[
              {
                id: anchorPoint.id,
                position: anchorPoint.position,
                color: readToken('--accent'),
                title: anchorPoint.name,
                emphasis: true,
              },
            ]}
          />
          <p className="mt-3 text-caption leading-relaxed text-content-secondary">
            {anchorPoint.accessDescription}
          </p>
        </Section>

        <Section title={t('driver.vehicle')}>
          <p className="text-caption text-content-secondary">
            {driver.vehicle} ·{' '}
            <span className="ltr-nums">
              {rows.length} / {driver.seats}
            </span>{' '}
            {t('driver.seats')}
          </p>
        </Section>

        <Section title={t('anchor.labelCoordinator')}>
          <CallRow
            name={COORDINATOR.name}
            phone={COORDINATOR.phone}
            label={COORDINATOR.role}
          />
        </Section>
      </div>

      <p className="ltr-nums muted mt-4 text-center">
        {t('driver.morningPickup')} · {formatDateTime(mission.endAt, locale)}
      </p>
    </>
  )
}
