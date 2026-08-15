import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import {
  FARM_PIPELINE,
  formatDate,
  formatDateTime,
  getAnchorPointsForFarm,
  getFarm,
  getVisibleIncidentViews,
  getVisibleMissionViews,
  googleMapsPointUrl,
} from '@core/index'
import type { CommitmentKind, Farm, FarmStatus } from '@core/index'

import { ContactActions } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import {
  FARM_STATUS_COLOR,
  FarmStatusChip,
  MissionStatusChip,
  SeverityChip,
} from '../../components/badges'
import {
  EmptyState,
  KeyValue,
  PageHeader,
  RowLink,
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

function StatusStepper({ status }: { status: FarmStatus }) {
  const { t } = useTranslation()

  if (status === 'declined') {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
        {t('farmStatus.declined')}
      </div>
    )
  }

  const currentIndex = FARM_PIPELINE.indexOf(status)

  return (
    <ol className="scroll-x flex items-center gap-1">
      {FARM_PIPELINE.map((step, i) => {
        const done = i < currentIndex
        const current = i === currentIndex
        return (
          <li key={step} className="flex shrink-0 items-center gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                current
                  ? 'text-white'
                  : done
                    ? 'bg-sand-200 text-night-900'
                    : 'bg-sand-100 text-night-950/40'
              }`}
              style={
                current ? { backgroundColor: FARM_STATUS_COLOR[step] } : undefined
              }
            >
              {done && <Icon name="check" size={12} />}
              {t(`farmStatus.${step}`)}
            </div>
            {i < FARM_PIPELINE.length - 1 && (
              <span
                className={`block h-px w-4 ${
                  done ? 'bg-sand-400' : 'bg-sand-200'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function FarmInfo({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const locale = useLocale()

  return (
    <dl>
      <KeyValue label={t('farms.filterType')} value={t(`farmType.${farm.type}`)} />
      <KeyValue label={t('volunteers.locality')} value={farm.locality} />
      <KeyValue
        label={t('farms.farmArea')}
        value={`${farm.farmHectares} ${t('farms.hectares')}`}
        ltr
      />
      <KeyValue
        label={t('farms.grazingArea')}
        value={`${farm.grazingHectares} ${t('farms.hectares')}`}
        ltr
      />
      <KeyValue
        label={t('farms.lastVisit')}
        value={
          farm.lastVisitAt
            ? formatDate(farm.lastVisitAt, locale)
            : t('farms.noVisitYet')
        }
        ltr={farm.lastVisitAt !== null}
      />
      <KeyValue
        label={t('farms.nextVisit')}
        value={
          farm.nextVisitAt
            ? formatDate(farm.nextVisitAt, locale)
            : t('common.none')
        }
        ltr={farm.nextVisitAt !== null}
      />
    </dl>
  )
}

export function FarmDetailScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { farmId = '' } = useParams()

  const farm = useCoreValue(() => getFarm(farmId))
  const anchors = useCoreValue(() => getAnchorPointsForFarm(farmId))
  const incidents = useCoreValue(() =>
    getVisibleIncidentViews().filter((v) => v.incident.farmId === farmId),
  )
  const missions = useCoreValue(() =>
    getVisibleMissionViews().filter((v) => v.mission.farmId === farmId),
  )

  if (!farm) return <Navigate to="/coordinator/farms" replace />

  return (
    <>
      <Link
        to="/coordinator/farms"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-night-950/55 hover:text-night-900"
      >
        <Icon name="chevron" size={15} className="ltr:-scale-x-100" />
        {t('farms.title')}
      </Link>

      <PageHeader
        title={farm.name}
        subtitle={`${farm.locality} · ${farm.region}`}
        actions={<FarmStatusChip status={farm.status} />}
      />

      <Section title={t('farms.pipeline')} className="mb-4">
        <StatusStepper status={farm.status} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Section title={t('common.details')}>
            <FarmInfo farm={farm} />
          </Section>

          <Section title={t('farms.contacts')}>
            <ul className="divide-y divide-sand-200">
              {farm.contacts.map((contact) => (
                <li key={contact.id}>
                  <ContactActions
                    name={contact.name}
                    phone={contact.phone}
                    role={
                      contact.isPrimary
                        ? `${contact.role} · ${t('farms.primaryContact')}`
                        : contact.role
                    }
                  />
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t('commitment.title')}>
            {farm.commitments.length === 0 ? (
              <EmptyState title={t('common.none')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {farm.commitments.map((c, i) => (
                  <li
                    key={`${c.kind}-${i}`}
                    className="flex items-start gap-3 rounded-xl border border-sand-200 px-3.5 py-3"
                  >
                    <span
                      className={`mt-0.5 ${
                        c.fulfilled ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      <Icon name={COMMITMENT_ICON[c.kind]} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {t(`commitment.${c.kind}`)}
                      </p>
                      <p className="muted mt-0.5">{c.detail}</p>
                    </div>
                    <span
                      className={`chip shrink-0 ${
                        c.fulfilled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t(c.fulfilled ? 'commitment.fulfilled' : 'commitment.pending')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('farms.anchorPoints')}>
            {anchors.length === 0 ? (
              <EmptyState icon="pin" title={t('farms.noAnchorPoints')} />
            ) : (
              <ul className="divide-y divide-sand-200">
                {anchors.map((anchor) => (
                  <li key={anchor.id}>
                    <RowLink
                      to={`/coordinator/farms/${farm.id}/anchors/${anchor.id}`}
                    >
                      <p className="text-sm font-medium">{anchor.name}</p>
                      <p className="muted mt-0.5 line-clamp-1">
                        {anchor.accessDescription}
                      </p>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('farms.guardHistory')}>
            {missions.length === 0 ? (
              <EmptyState icon="shield" title={t('missions.empty')} />
            ) : (
              <ul className="divide-y divide-sand-200">
                {missions.map((view) => (
                  <li key={view.mission.id}>
                    <RowLink to={`/coordinator/missions/${view.mission.id}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="ltr-nums text-sm font-medium">
                          {formatDate(view.mission.startAt, locale)}
                        </span>
                        <MissionStatusChip status={view.mission.status} />
                      </div>
                      <p className="muted mt-0.5">
                        {view.anchorPoint.name} ·{' '}
                        {view.volunteers.map((v) => v.volunteer.name).join(', ')}
                      </p>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section
            title={t('farms.location')}
            action={
              <a
                href={googleMapsPointUrl(farm.position)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-night-700 hover:underline"
              >
                <Icon name="external" size={13} />
                {t('common.openInMaps')}
              </a>
            }
          >
            <MapView
              ariaLabel={t('a11y.map')}
              className="h-56 w-full"
              interactive={false}
              center={farm.position}
              zoom={11}
              markers={[
                {
                  id: farm.id,
                  position: farm.position,
                  color: FARM_STATUS_COLOR[farm.status],
                  title: farm.name,
                },
                ...anchors.map((a) => ({
                  id: a.id,
                  position: a.position,
                  color: '#1c2038',
                  title: a.name,
                })),
              ]}
            />
          </Section>

          <Section title={t('farms.agreements')}>
            {farm.agreements.length === 0 ? (
              <EmptyState icon="document" title={t('farms.noAgreements')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {farm.agreements.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl border border-sand-200 px-3.5 py-3"
                  >
                    <span className="text-night-700">
                      <Icon name="document" size={19} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {a.fileName}
                      </p>
                      <p className="muted">
                        {t('farms.signedBy')} {a.signedBy} ·{' '}
                        <span className="ltr-nums">
                          {formatDate(a.signedAt, locale)}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('common.notes')}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-night-950/75">
              {farm.notes || t('common.none')}
            </p>
          </Section>

          <Section title={t('farms.recentIncidents')}>
            {incidents.length === 0 ? (
              <EmptyState icon="alert" title={t('incidents.empty')} />
            ) : (
              <ul className="divide-y divide-sand-200">
                {incidents.slice(0, 4).map(({ incident }) => (
                  <li key={incident.id}>
                    <RowLink to={`/coordinator/incidents/${incident.id}`}>
                      <div className="flex items-center gap-2">
                        <SeverityChip severity={incident.severity} />
                        <span className="ltr-nums text-xs text-night-950/45">
                          {formatDateTime(incident.reportedAt, locale)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-night-950/75">
                        {incident.description}
                      </p>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  )
}
