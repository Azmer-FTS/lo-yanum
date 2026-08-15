import { useTranslation } from 'react-i18next'

import { getMyActiveMissionView, getMyVolunteer } from '@core/index'

import { IncidentReportForm } from '../../components/IncidentReportForm'
import { EmptyState, PageHeader } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

export function VolunteerReportScreen() {
  const { t } = useTranslation()
  const view = useCoreValue(getMyActiveMissionView)
  const me = useCoreValue(getMyVolunteer)

  if (!view || !me) {
    return (
      <>
        <PageHeader title={t('report.title')} />
        <EmptyState
          icon="moon"
          title={t('volunteer.noMission')}
          hint={t('volunteer.noMissionHint')}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={t('report.title')}
        subtitle={`${view.farm.name} · ${view.anchorPoint.name}`}
      />

      <IncidentReportForm
        context={{
          farmId: view.farm.id,
          missionId: view.mission.id,
          source: 'volunteer',
          reporterId: me.id,
          reporterName: me.name,
          capturePosition: true,
          fallbackPosition: view.anchorPoint.position,
          showPhoto: true,
        }}
      />
    </>
  )
}
