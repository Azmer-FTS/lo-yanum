import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getVisibleFarms, readCoordinator } from '@core/index'

import { IncidentReportForm } from './IncidentReportForm'
import { Modal } from './primitives'
import { useCoreValue } from '../hooks/useCore'

/**
 * ★★ AB1.1 (2026-09-08) — אירועים GAINS ITS OWN CREATION, BECAUSE THE PRODUCT
 *    OWNER'S LIST SAYS IT HAS ONE AND IT DID NOT.
 *
 *   « אירועים → nouvel événement »
 *
 * Until now an incident could only be filed by a FARMER or a VOLUNTEER, from
 * their own screens, because that is who is standing in the field at 2 AM. The
 * coordinator's log was therefore read-only: a call that comes in on his own
 * telephone — the police rang, a neighbour saw a vehicle — had nowhere to go,
 * and the map that is supposed to show "what is happening tonight" could not
 * be told about the half of it he hears about first.
 *
 * ★ IT IS THE SAME FORM THE FIELD USES, and deliberately so. `IncidentReportForm`
 *   is R7's one-hand-in-the-dark flow: three full-width severity buttons, a
 *   description, then the call screen for an urgent one. A second, "desk"
 *   version of the same record would be a second set of severities to keep in
 *   step and a second thing to test.
 *
 * ⚠️ TWO THINGS DIFFER FROM THE FIELD, AND BOTH ARE FACTS RATHER THAN TASTE:
 *    the coordinator is NOT at the incident, so his device's position would be
 *    a lie — `capturePosition` is false and the farm's own point is what the
 *    report carries; and the farm is not implied by his session, so it is the
 *    first thing the modal asks. `source: 'coordinator'` is already one of the
 *    three the model knows, and the detail screen already prints it.
 */
export function CoordinatorIncidentModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const farms = useCoreValue(getVisibleFarms)
  const [farmId, setFarmId] = useState<string>(() => farms[0]?.id ?? '')

  const farm = farms.find((f) => f.id === farmId) ?? null
  /* The one contact who may sign in as farmer — whose number the urgent
     confirmation screen offers to call. */
  const primary = farm?.contacts.find((c) => c.isPrimary) ?? farm?.contacts[0]
  const me = readCoordinator()

  return (
    <Modal title={t('incidents.new')} onClose={onClose}>
      <p className="muted mb-3">{t('incidents.newHint')}</p>

      <label className="label" htmlFor="incident-farm">
        {t('incidents.pickFarm')}
      </label>
      <select
        id="incident-farm"
        className="input w-full"
        data-testid="incident-farm"
        value={farmId}
        onChange={(e) => setFarmId(e.target.value)}
      >
        {farms.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      {farm && (
        <div className="mt-4">
          <IncidentReportForm
            /* ⚠️ A `key` ON THE FARM, so changing the farm restarts the flow
               rather than carrying a half-typed description onto a different
               place. The severity step is one tap; the description is not. */
            key={farm.id}
            context={{
              farmId: farm.id,
              missionId: null,
              source: 'coordinator',
              reporterId: null,
              reporterName: me.name,
              capturePosition: false,
              fallbackPosition: farm.position,
              coordinatorName: me.name,
              coordinatorPhone: me.phone,
              farmerName: primary?.name,
              farmerPhone: primary?.phone,
            }}
          />
        </div>
      )}
    </Modal>
  )
}
