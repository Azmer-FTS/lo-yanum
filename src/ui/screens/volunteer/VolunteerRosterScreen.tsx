import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  getMyActiveMissionView,
  getMyVolunteer,
  getPresenceRows,
  isGroupPhoneHolder,
} from '@core/index'
import type { MissionLeg } from '@core/index'

import { PresenceRoster } from '../../components/PresenceRoster'
import {
  Callout,
  EmptyState,
  PageHeader,
  Section,
  Toggle,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

/**
 * R6 — the group side of the double confirmation.
 *
 * The smartphone holder confirms nominatively for every member of his group,
 * because the kosher-phone volunteers beside him have no app to confirm in.
 * That is the whole reason this screen exists rather than a single "we are all
 * here" button.
 */
export function VolunteerRosterScreen() {
  const { t } = useTranslation()
  const view = useCoreValue(getMyActiveMissionView)
  const me = useCoreValue(getMyVolunteer)
  const isHolder = useCoreValue(() =>
    view ? isGroupPhoneHolder(view.mission) : false,
  )
  const [leg, setLeg] = useState<MissionLeg>('outbound')
  const rows = useCoreValue(() =>
    view ? getPresenceRows(view.mission, leg) : [],
  )

  if (!view) {
    return (
      <>
        <PageHeader title={t('presence.rosterTitle')} />
        <EmptyState
          icon="moon"
          title={t('volunteer.noMission')}
          hint={t('volunteer.noMissionHint')}
        />
      </>
    )
  }

  const holder = rows.find((r) => r.isGroupPhone)?.volunteer

  return (
    <>
      <PageHeader
        title={t('presence.rosterTitle')}
        subtitle={`${view.farm.name} · ${view.anchorPoint.name}`}
      />

      {!isHolder && (
        <div className="mb-4">
          <Callout
            tone="info"
            icon="phone"
            title={t('volunteer.notGroupPhoneNote', {
              name: holder?.name ?? '',
            })}
          />
        </div>
      )}

      <Section
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
          missionId={view.mission.id}
          leg={leg}
          source="group"
          rows={rows}
          driverName={view.driver?.name}
          me={me}
        />
      </Section>
    </>
  )
}
