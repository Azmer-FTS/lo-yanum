import { useTranslation } from 'react-i18next'

import {
  formatDate,
  formatTime,
  formatWeekday,
  getMyFarm,
  getPastMissionViews,
  getUpcomingMissionViews,
} from '@core/index'
import type { CommitmentKind, MissionView } from '@core/index'

import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { MissionStatusChip } from '../../components/badges'
import {
  EmptyState,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

const COMMITMENT_ICON: Record<CommitmentKind, IconName> = {
  shelter: 'home',
  water: 'water',
  food: 'food',
  other: 'plus',
}

function GuardCard({ view }: { view: MissionView }) {
  const locale = useLocale()
  const { mission, anchorPoint, volunteers, driver } = view

  return (
    /* F5.3 — floats above the page instead of melting into it (dark). */
    <li className="tile px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ltr-nums text-caption font-medium">
          {formatDate(mission.startAt, locale)}
        </span>
        <span className="muted">{formatWeekday(mission.startAt, locale)}</span>
        <MissionStatusChip status={mission.status} />
      </div>
      <p className="muted mt-1">
        {anchorPoint.name} ·{' '}
        <span className="ltr-nums">
          {formatTime(mission.startAt, locale)}–
          {formatTime(mission.endAt, locale)}
        </span>
      </p>
      <p className="muted mt-0.5">
        {volunteers.map((v) => v.volunteer.name).join(', ')}
        {driver && ` · ${driver.name}`}
      </p>
    </li>
  )
}

export function FarmerGuardsScreen() {
  const { t } = useTranslation()
  const farm = useCoreValue(getMyFarm)
  const upcoming = useCoreValue(getUpcomingMissionViews)
  const past = useCoreValue(getPastMissionViews)

  if (!farm) return null

  return (
    <>
      <PageHeader title={t('farmer.myGuardsTitle')} subtitle={farm.name} />

      {/* P0bis.3b — "coming" and "past" side by side once the column can hold
          two. The field shell is a phone column, so on the phone this is the
          same single stack it always was; on the iPad the farmer stops
          scrolling past his whole future to reach last week. */}
      <div className="panel-scope">
        <div className="pair-grid">
        <Section title={t('farmer.upcoming')}
          collapseKey="farmer-upcoming">
          {upcoming.length === 0 ? (
            <EmptyState icon="moon" title={t('farmer.noUpcoming')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((view) => (
                <GuardCard key={view.mission.id} view={view} />
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('farmer.past')}
          collapseKey="farmer-past">
          {past.length === 0 ? (
            <EmptyState icon="shield" title={t('farmer.noPast')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {past.map((view) => (
                <GuardCard key={view.mission.id} view={view} />
              ))}
            </ul>
          )}
        </Section>
        </div>

        <div className="mt-4" />

        {/* Discreet, not accusatory: a reminder of what was agreed. */}
        {farm.commitments.length > 0 && (
          <section className="rounded-card bg-surface-high/70 p-4 shadow-card">
            <h2 className="text-caption font-semibold text-content-primary">
              {t('commitment.reminderTitle')}
            </h2>
            <ul className="mt-2.5 flex flex-col gap-2">
              {farm.commitments.map((c, i) => (
                <li
                  key={`${c.kind}-${i}`}
                  className="flex items-start gap-2.5 text-caption"
                >
                  <span className="mt-0.5 shrink-0 text-accent-ink">
                    <Icon name={COMMITMENT_ICON[c.kind]} size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">
                      {t(`commitment.${c.kind}`)}
                    </span>
                    <span className="muted block">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-micro leading-relaxed text-content-muted">
              {t('commitment.reminderNote')}
            </p>
          </section>
        )}
      </div>
    </>
  )
}
