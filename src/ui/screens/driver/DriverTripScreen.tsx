import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  COORDINATOR,
  confirmDropoff,
  confirmPickup,
  formatDateTime,
  formatTime,
  getMyActiveMissionView,
  getMyDriver,
  telHref,
  wazeUrl,
} from '@core/index'

import { CallRow } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { MissionStatusChip, PhoneTypeChip } from '../../components/badges'
import {
  Callout,
  EmptyState,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

/** Stepper for "how many did you actually carry?", defaulting to the roster. */
function CountConfirm({
  label,
  expected,
  confirmed,
  onConfirm,
}: {
  label: string
  expected: number
  confirmed: number | null
  onConfirm: (count: number) => void
}) {
  const { t } = useTranslation()
  const [count, setCount] = useState(expected)

  if (confirmed !== null) {
    const mismatch = confirmed !== expected
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 ${
          mismatch
            ? 'border-rose-300 bg-rose-50'
            : 'border-emerald-300 bg-emerald-50'
        }`}
      >
        <span
          className={`flex items-center gap-2 text-sm font-semibold ${
            mismatch ? 'text-rose-900' : 'text-emerald-900'
          }`}
        >
          <Icon name={mismatch ? 'alert' : 'check'} size={18} />
          {label}
        </span>
        <span className="ltr-nums text-sm font-semibold tabular-nums">
          {confirmed} / {expected}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-sand-300 bg-white p-4">
      <p className="text-sm font-semibold">{label}</p>
      <p className="muted mt-0.5">{t('driver.howMany')}</p>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setCount((c) => Math.max(0, c - 1))}
          aria-label="-"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-sand-300 text-lg font-semibold"
        >
          −
        </button>
        <span className="ltr-nums flex-1 text-center text-2xl font-semibold tabular-nums">
          {count}
        </span>
        <button
          type="button"
          onClick={() => setCount((c) => c + 1)}
          aria-label="+"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-sand-300 text-lg font-semibold"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={() => onConfirm(count)}
        className="btn-primary btn-big mt-3"
      >
        {t('common.confirm')}
      </button>
    </div>
  )
}

export function DriverTripScreen() {
  const { t } = useTranslation()
  const locale = useLocale()

  const driver = useCoreValue(getMyDriver)
  const view = useCoreValue(getMyActiveMissionView)

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

  const { mission, farm, anchorPoint, volunteers } = view
  const expected = volunteers.length
  const dropoffMismatch =
    mission.dropoffConfirmedCount !== null &&
    mission.dropoffConfirmedCount !== expected
  const pickupMismatch =
    mission.pickupConfirmedCount !== null &&
    mission.pickupConfirmedCount !== expected

  return (
    <>
      <PageHeader
        title={t('driver.title')}
        subtitle={`${farm.name} · ${formatTime(mission.startAt, locale)}`}
        actions={<MissionStatusChip status={mission.status} />}
      />

      {(dropoffMismatch || pickupMismatch) && (
        <div className="mb-4">
          <Callout tone="danger" title={t('driver.mismatchTitle')}>
            <p>
              {t('driver.mismatchBody', {
                expected,
                actual: dropoffMismatch
                  ? mission.dropoffConfirmedCount
                  : mission.pickupConfirmedCount,
              })}
            </p>
            <a
              href={telHref(COORDINATOR.phone)}
              className="btn-primary mt-2 w-full"
            >
              <Icon name="phone" size={16} />
              {t('driver.callCoordinator')}
            </a>
          </Callout>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Section
          title={t('driver.destination')}
          action={
            <a
              href={wazeUrl(anchorPoint.position)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-night-700 hover:underline"
            >
              <Icon name="pin" size={13} />
              {t('common.openInWaze')}
            </a>
          }
        >
          <p className="text-sm font-medium">{anchorPoint.name}</p>
          <p className="muted mt-0.5">
            {farm.name} · {farm.locality}
          </p>
          <MapView
            ariaLabel={t('a11y.map')}
            className="mt-2 h-44 w-full"
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
          <p className="mt-2 text-sm leading-relaxed text-night-950/70">
            {anchorPoint.accessDescription}
          </p>
        </Section>

        <Section
          title={t('driver.pickupList')}
          action={
            <span className="chip bg-sand-100 text-night-950/70">
              {/* One LTR run, or RTL reorders the ratio to "12 / 3". */}
              <span className="ltr-nums tabular-nums">
                {expected} / {driver.seats}
              </span>
            </span>
          }
        >
          <div className="flex flex-col gap-2">
            {volunteers.map(({ volunteer, isGroupPhone }) => (
              <div key={volunteer.id}>
                <CallRow
                  name={volunteer.name}
                  phone={volunteer.phone}
                  label={volunteer.locality}
                />
                <div className="mt-1 flex flex-wrap gap-1.5 px-1">
                  <PhoneTypeChip type={volunteer.phoneType} />
                  {isGroupPhone && (
                    <span className="chip bg-night-900 text-white">
                      <Icon name="phone" size={11} />
                      {t('volunteers.groupPhoneHolder')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <CountConfirm
          label={t('driver.confirmDropoff')}
          expected={expected}
          confirmed={mission.dropoffConfirmedCount}
          onConfirm={(count) => confirmDropoff(mission.id, count)}
        />

        <CountConfirm
          label={t('driver.confirmPickup')}
          expected={expected}
          confirmed={mission.pickupConfirmedCount}
          onConfirm={(count) => confirmPickup(mission.id, count)}
        />

        <Section title={t('anchor.labelCoordinator')}>
          <CallRow
            name={COORDINATOR.name}
            phone={COORDINATOR.phone}
            label={COORDINATOR.role}
          />
        </Section>
      </div>

      <p className="ltr-nums muted mt-3 text-center">
        {t('driver.morningPickup')} · {formatDateTime(mission.endAt, locale)}
      </p>
    </>
  )
}
