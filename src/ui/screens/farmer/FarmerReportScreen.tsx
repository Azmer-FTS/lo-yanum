import { useTranslation } from 'react-i18next'

import {
  getMyContactName,
  getMyFarm,
  getSession,
  getTonightMissionViews,
} from '@core/index'

import { IncidentReportForm } from '../../components/IncidentReportForm'
import { PageHeader } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

export function FarmerReportScreen() {
  const { t } = useTranslation()

  const farm = useCoreValue(getMyFarm)
  const name = useCoreValue(getMyContactName)
  const session = useCoreValue(getSession)
  const tonight = useCoreValue(getTonightMissionViews)

  if (!farm) return null

  return (
    <>
      <PageHeader title={t('report.title')} subtitle={t('report.subtitle')} />

      <IncidentReportForm
        context={{
          farmId: farm.id,
          // Attach the report to tonight's guard when there is one, so the
          // coordinator sees it in the mission's context.
          missionId: tonight[0]?.mission.id ?? null,
          source: 'farmer',
          reporterId: session.entityId,
          reporterName: name ?? '',
          capturePosition: false,
          fallbackPosition: farm.position,
        }}
      />
    </>
  )
}
