import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import {
  COORDINATOR,
  buildKosherMessage,
  buildSmartphoneMessage,
  formatCoords,
  getAnchorPoint,
  getFarm,
  getUpcomingMissionViews,
  smsHref,
  wazeUrl,
  whatsappHref,
} from '@core/index'
import type { AnchorMessageInput, AnchorMessageLabels } from '@core/index'

import { Icon } from '../../components/Icon'
import { MapSplit } from '../../components/MapSplit'
import { MapView } from '../../components/MapView'
import { readToken } from '../../components/badges'
import { CopyButton, PageHeader, Section } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

function MessageCard({
  title,
  hint,
  body,
  phone,
  channel,
}: {
  title: string
  hint: string
  body: string
  phone: string | null
  channel: 'whatsapp' | 'sms'
}) {
  const { t } = useTranslation()

  return (
    <div className="rounded-card bg-surface-raised/40 p-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-caption font-semibold">{title}</h3>
          <p className="muted mt-0.5">{hint}</p>
        </div>
        <CopyButton value={body} label={t('anchor.copyMessage')} />
      </div>

      {/* Read-only textarea: selectable everywhere, including where the
          Clipboard API is blocked (plain http on a phone). */}
      <textarea
        readOnly
        value={body}
        rows={Math.min(18, body.split('\n').length + 1)}
        dir="rtl"
        className="w-full resize-y rounded-field border border-edge-strong bg-surface-raised p-3 font-sans text-caption leading-relaxed text-content-primary"
      />

      {phone && (
        <a
          href={
            channel === 'whatsapp'
              ? whatsappHref(phone, body)
              : smsHref(phone, body)
          }
          target={channel === 'whatsapp' ? '_blank' : undefined}
          rel="noreferrer"
          className="btn-secondary mt-2.5 w-full sm:w-auto"
        >
          <Icon name={channel === 'whatsapp' ? 'whatsapp' : 'message'} size={16} />
          {t(channel === 'whatsapp' ? 'anchor.sendWhatsapp' : 'anchor.sendSms')}
        </a>
      )}
    </div>
  )
}

export function AnchorSheetScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { farmId = '', anchorId = '' } = useParams()

  const farm = useCoreValue(() => getFarm(farmId))
  const anchor = useCoreValue(() => getAnchorPoint(anchorId))

  // The next guard planned at this anchor point supplies the arrival time and
  // the driver's number; without one the message still generates, minus those.
  const nextMission = useCoreValue(
    () =>
      getUpcomingMissionViews().find(
        (v) => v.mission.anchorPointId === anchorId,
      ) ?? null,
  )

  if (!farm || !anchor || anchor.farmId !== farm.id) {
    return <Navigate to="/coordinator/farms" replace />
  }

  const labels: AnchorMessageLabels = {
    title: t('anchor.messageTitle'),
    farm: t('anchor.labelFarm'),
    anchorPoint: t('anchor.labelAnchor'),
    arrival: t('anchor.labelArrival'),
    navigation: t('anchor.labelNavigation'),
    access: t('anchor.labelAccess'),
    coordinates: t('anchor.labelCoordinates'),
    instructions: t('anchor.labelInstructions'),
    phones: t('anchor.labelPhones'),
    farmer: t('anchor.labelFarmer'),
    driver: t('anchor.labelDriver'),
    coordinator: t('anchor.labelCoordinator'),
    pickup: t('meet.labelPickup'),
  }

  const input: AnchorMessageInput = {
    farm,
    anchorPoint: anchor,
    mission: nextMission?.mission ?? null,
    driver: nextMission?.driver ?? null,
    farmerContact: farm.contacts.find((c) => c.isPrimary) ?? null,
    coordinatorName: COORDINATOR.name,
    coordinatorPhone: COORDINATOR.phone,
    locale,
  }

  const smartphoneBody = buildSmartphoneMessage(input, labels)
  const kosherBody = buildKosherMessage(input, labels)

  // Prefill the send buttons with whoever holds the group phone, when known.
  const groupPhoneHolder =
    nextMission?.volunteers.find((v) => v.isGroupPhone)?.volunteer ?? null
  const kosherRecipient =
    nextMission?.volunteers.find((v) => v.volunteer.phoneType === 'kosher')
      ?.volunteer ?? null

  /* P0bis.1 — the anchor sheet joins the gabarit: the post on the physical
     LEFT, the two messages that will be sent about it on the right. This is
     the screen a coordinator reads WHILE on the phone, so the geography and
     the text he is dictating belong side by side rather than one under the
     other. */
  const mapBody = (
    <>
      <MapView
        ariaLabel={t('a11y.map')}
        className="h-full w-full rounded-none"
        center={anchor.position}
        zoom={13}
        markers={[
          {
            id: anchor.id,
            position: anchor.position,
            color: readToken('--accent'),
            emphasis: true,
            title: anchor.name,
          },
        ]}
      />
      <p className="ltr-nums pointer-events-none absolute bottom-3 start-3 z-10 rounded-card bg-surface-overlay/95 px-3 py-1.5 text-micro text-content-secondary shadow-card backdrop-blur">
        {formatCoords(anchor.position)}
      </p>
    </>
  )

  return (
    <MapSplit
      screenKey="anchor-sheet"
      ariaLabel={t('map.title')}
      breakpoint="xl"
      contentPercent={58}
      splitHeight="h-[38dvh]"
      map={() => mapBody}
    >
      {() => (
        <>
      <Link
        to={`/coordinator/farms/${farm.id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-caption text-content-muted hover:text-content-primary"
      >
        <Icon name="chevron" size={15} className="ltr:-scale-x-100" />
        {farm.name}
      </Link>

      <PageHeader
        title={anchor.name}
        subtitle={`${t('anchor.title')} · ${farm.name}`}
        actions={
          <a
            href={wazeUrl(anchor.position)}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            <Icon name="pin" size={16} />
            {t('common.openInWaze')}
          </a>
        }
      />

      <div className="flex flex-col gap-4">
          <Section title={t('anchor.messages')}>
            <div className="flex flex-col gap-4">
              <MessageCard
                title={t('anchor.smartphoneMessage')}
                hint={t('anchor.smartphoneHint')}
                body={smartphoneBody}
                phone={groupPhoneHolder?.phone ?? null}
                channel="whatsapp"
              />
              <MessageCard
                title={t('anchor.kosherMessage')}
                hint={t('anchor.kosherHint')}
                body={kosherBody}
                phone={kosherRecipient?.phone ?? null}
                channel="sms"
              />
            </div>
          </Section>

          <Section title={t('anchor.access')}>
            <p className="text-caption leading-relaxed text-content-secondary">
              {anchor.accessDescription}
            </p>
          </Section>

          <Section title={t('anchor.instructions')}>
            <ul className="flex flex-col gap-2">
              {anchor.instructions.map((line, i) => (
                <li key={i} className="flex gap-2.5 text-caption text-content-secondary">
                  <span className="mt-0.5 shrink-0 text-accent-ink">
                    <Icon name="check" size={15} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </Section>
      </div>
        </>
      )}
    </MapSplit>
  )
}
