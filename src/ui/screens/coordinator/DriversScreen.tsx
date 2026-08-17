import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getDrivers, telHref, whatsappHref } from '@core/index'
import type { Driver } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { EmptyState, PageHeader } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { DriverFormModal } from './DriverFormModal'

/**
 * G5.1 — the volunteer-driver roster.
 *
 * Its header is deliberately DISTINCTIVE (the steering wheel, the "נהגים
 * מתנדבים" title): drivers are volunteers too, and the programme's habit of
 * treating them as an afterthought of the guard wizard is what this screen
 * exists to end. Dual hats (a volunteer marked "can drive") appear here with
 * their own chip — same human, both rosters.
 */
export function DriversScreen() {
  const { t } = useTranslation()
  const drivers = useCoreValue(getDrivers)

  const [editing, setEditing] = useState<Driver | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="text-accent-ink">
              <Icon name="steering" size={26} />
            </span>
            {t('driver.volunteerDrivers')}
          </span>
        }
        subtitle={t('driver.rosterSubtitle')}
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setCreating(true)}
          >
            <Icon name="userPlus" size={15} />
            {t('driver.addDriver')}
          </button>
        }
      />

      <p className="muted mb-3">{t('driver.count', { count: drivers.length })}</p>

      {drivers.length === 0 ? (
        <EmptyState icon="car" title={t('driver.empty')} />
      ) : (
        <ul className="stagger flex flex-col gap-2">
          {drivers.map((driver) => (
            <li key={driver.id} className="tile-interactive p-3">
              <div className="flex items-start gap-3">
                <Avatar photo={driver.photo} name={driver.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-caption font-semibold text-content-primary">
                      {driver.name}
                    </span>
                    <span className="chip bg-surface-high text-content-secondary">
                      <Icon name="car" size={10} />
                      <span className="numeric">{driver.seats}</span>
                      {t('driver.seats')}
                    </span>
                    {driver.volunteerId && (
                      <span className="chip bg-status-violet/15 text-status-violet-ink">
                        <Icon name="shield" size={10} />
                        {t('driver.alsoVolunteer')}
                      </span>
                    )}
                  </div>
                  <p className="muted mt-0.5 truncate">
                    {driver.vehicle || t('driver.privateCar')} · {driver.locality}{' '}
                    · <span className="ltr-nums">{driver.phone}</span>
                  </p>
                  {driver.availabilityNote && (
                    <p className="muted mt-0.5 flex items-center gap-1.5">
                      <Icon name="clock" size={12} />
                      {driver.availabilityNote}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={telHref(driver.phone)}
                    aria-label={t('common.call')}
                    title={t('common.call')}
                    className="rounded-field p-2 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
                  >
                    <Icon name="phone" size={16} />
                  </a>
                  <a
                    href={whatsappHref(driver.phone)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('common.whatsapp')}
                    title={t('common.whatsapp')}
                    className="rounded-field p-2 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
                  >
                    <Icon name="whatsapp" size={16} />
                  </a>
                  <button
                    type="button"
                    onClick={() => setEditing(driver)}
                    aria-label={t('common.edit')}
                    title={t('common.edit')}
                    className="rounded-field p-2 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
                  >
                    <Icon name="edit" size={16} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && <DriverFormModal driver={null} onClose={() => setCreating(false)} />}
      {editing && (
        <DriverFormModal driver={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
