import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  readCoordinator,
  checkpointState,
  confirmArrival,
  confirmGuardEnd,
  formatDateTime,
  formatTime,
  getFarmZonesForFarm,
  getMyActiveMissionView,
  isGroupPhoneHolder,
  recordCheckpoint,
  wazeUrl,
} from '@core/index'

import { Avatar } from '../../components/Avatar'
import { CallRow } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import {
  MissionStatusChip,
  PhoneTypeChip,
  readToken,
} from '../../components/badges'
import {
  Callout,
  EmptyState,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'
import { useNowTick } from '../../hooks/useEmergency'
import { useGuardPass } from '../../guardPass'
import { useVigil } from '../../settings/vigil'
import { SiteFile } from '../EmergencyScreen'

export function VolunteerGuardScreen() {
  const { t } = useTranslation()
  const locale = useLocale()

  const view = useCoreValue(getMyActiveMissionView)
  const isHolder = useCoreValue(() =>
    view ? isGroupPhoneHolder(view.mission) : false,
  )
  const pass = useGuardPass()
  const thresholds = useVigil()
  /* AE3.3 — l'échéance se lit sur l'horloge, donc l'écran doit se repeindre
     sans qu'aucune donnée n'ait changé. Trente secondes : assez fin pour que
     « il reste dix minutes » soit vrai, assez lâche pour ne pas réveiller un
     téléphone en veille. */
  const tick = useNowTick(30_000)
  const zones = useCoreValue(() =>
    view ? getFarmZonesForFarm(view.farm.id) : [],
  )
  const cp = view ? checkpointState(view.mission, thresholds, tick) : null

  if (!view) {
    /**
     * ★★ AE1.3 — LE LAISSEZ-PASSER EST LE REPLI, ET C'EST LE CAS DE TROIS
     *    HEURES DU MATIN.
     *
     * Le volontaire a ouvert son lien à 19:00 chez lui ; dans le champ, sans
     * données, le magasin ne connaît aucune garde. Ce que l'appareil porte est
     * exactement ce qu'AE1.3 autorise — la garde, la fiche du site, les
     * numéros — et c'est assez pour tenir la nuit. Écrire « aucune garde » à
     * quelqu'un qui EST sur sa garde serait le pire mensonge de cet écran.
     */
    if (pass) {
      return (
        <>
          <PageHeader
            title={pass.farm.name}
            subtitle={`${pass.anchor?.name ?? pass.farm.locality} · ${formatTime(
              pass.mission.startAt,
              locale,
            )}`}
          />
          <SiteFile
            farm={{
              name: pass.farm.name,
              locality: pass.farm.locality,
              position: pass.farm.position,
              siteAccess: pass.farm.siteAccess,
              gateCode: pass.farm.gateCode,
              parking: pass.farm.parking,
              terrainNotes: pass.farm.terrain,
            }}
            outline={pass.farm.outline}
          />
          <Section title={t('volunteer.contactsTitle')} className="mt-4">
            <div className="flex flex-col gap-2">
              {pass.numbers.map((n) => (
                <CallRow
                  key={`${n.labelKey}-${n.phone}`}
                  name={n.name || t(n.labelKey)}
                  phone={n.phone}
                  label={t(n.labelKey)}
                />
              ))}
            </div>
          </Section>
        </>
      )
    }
    return (
      <>
        <PageHeader title={t('volunteer.title')} />
        <EmptyState
          icon="moon"
          title={t('volunteer.noMission')}
          hint={t('volunteer.noMissionHint')}
        />
      </>
    )
  }

  const { mission, farm, anchorPoint, driver, volunteers } = view
  const holder = volunteers.find((v) => v.isGroupPhone)?.volunteer
  const farmerContact = farm.contacts.find((c) => c.isPrimary)

  return (
    <>
      <PageHeader
        title={farm.name}
        subtitle={`${anchorPoint.name} · ${formatTime(mission.startAt, locale)}`}
        actions={<MissionStatusChip status={mission.status} />}
      />

      {/* The confirmation buttons come first: in the dark, at 21:00, this is
          the only thing the group phone holder needs to reach. */}
      <div className="mb-4 flex flex-col gap-2">
        {mission.arrivalConfirmedAt ? (
          <div className="flex items-center justify-between gap-3 rounded-card bg-status-success/10 px-4 py-3.5">
            <span className="flex items-center gap-2 text-caption font-semibold text-status-success-ink">
              <Icon name="check" size={18} />
              {t('volunteer.arrivalDone')}
            </span>
            <span className="ltr-nums text-micro text-status-success-ink/70">
              {formatTime(mission.arrivalConfirmedAt, locale)}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => confirmArrival(mission.id)}
            disabled={!isHolder}
            className="btn-primary btn-big"
          >
            <Icon name="pin" size={19} />
            {t('volunteer.confirmArrival')}
          </button>
        )}

        {mission.endConfirmedAt ? (
          <div className="flex items-center justify-between gap-3 rounded-card bg-surface-high px-4 py-3.5 shadow-card">
            <span className="flex items-center gap-2 text-caption font-semibold">
              <Icon name="check" size={18} />
              {t('volunteer.endDone')}
            </span>
            <span className="ltr-nums text-micro text-content-muted">
              {formatTime(mission.endConfirmedAt, locale)}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => confirmGuardEnd(mission.id)}
            disabled={!isHolder || mission.arrivalConfirmedAt === null}
            className="btn-secondary btn-big"
          >
            <Icon name="shield" size={19} />
            {t('volunteer.confirmEnd')}
          </button>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            ★★ AE3.3 — LE POINT DE CONTRÔLE, EN UN GESTE.

            ⚠️ IL NE SE DESSINE QU'ENTRE L'ARRIVÉE ET LA FIN, ce qui est le
               seul intervalle où « tout va bien » veut dire quelque chose. Un
               bouton présent avant l'arrivée inviterait à donner un signe de
               vie depuis le minibus.

            ⚠️ ET LA RELANCE EST UN CHANGEMENT D'ÉTAT DU BOUTON, PAS UNE
               NOTIFICATION. Dix minutes avant l'échéance il devient plein et
               le dit ; c'est ce que le brief appelle « avec relance avant de
               déclencher quoi que ce soit », et ça ne demande ni permission
               système ni serveur de push — donc ça marche cette nuit.
            ═══════════════════════════════════════════════════════════════ */}
        {cp !== null && cp.lastAt !== null && (
          <button
            type="button"
            data-testid="checkpoint"
            onClick={() => recordCheckpoint(mission.id)}
            disabled={!isHolder}
            className={
              cp.reminding || cp.overdue
                ? 'btn-primary btn-big'
                : 'btn-secondary btn-big'
            }
          >
            <Icon name="check" size={19} />
            <span className="flex flex-col items-start leading-tight">
              <span>{t('volunteer.checkpoint')}</span>
              <span className="text-micro font-normal opacity-80">
                {cp.reminding || cp.overdue
                  ? t('volunteer.checkpointDue')
                  : t('volunteer.checkpointHint', { minutes: cp.silentMinutes })}
              </span>
            </span>
          </button>
        )}

        <p className="muted px-1 text-center">
          {isHolder
            ? t('volunteer.groupPhoneNote')
            : t('volunteer.notGroupPhoneNote', { name: holder?.name ?? '' })}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Section
          title={t('volunteer.anchorTitle')}
          collapseKey="volunteer-anchor"
          action={
            <a
              href={wazeUrl(anchorPoint.position)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-micro font-medium text-accent-ink hover:underline"
            >
              <Icon name="pin" size={13} />
              {t('common.openInWaze')}
            </a>
          }
        >
          <p className="mb-2 text-caption font-medium">{anchorPoint.name}</p>
          <MapView
            ariaLabel={t('a11y.map')}
            className="h-64 w-full"
            cooperative
            center={anchorPoint.position}
            zoom={13}
            markers={[
              {
                id: anchorPoint.id,
                position: anchorPoint.position,
                color: readToken('--accent'),
                  emphasis: true,
                title: anchorPoint.name,
              },
            ]}
          />
          <p className="mt-2 text-caption leading-relaxed text-content-secondary">
            {anchorPoint.accessDescription}
          </p>
        </Section>

        <Section title={t('volunteer.instructions')}
          collapseKey="volunteer-instructions">
          <ul className="flex flex-col gap-2">
            {anchorPoint.instructions.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-caption text-content-secondary">
                <span className="mt-0.5 shrink-0 text-accent-ink">
                  <Icon name="check" size={15} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('volunteer.contactsTitle')}
          collapseKey="volunteer-contacts">
          <div className="flex flex-col gap-2">
            {farmerContact && (
              <CallRow
                name={farmerContact.name}
                phone={farmerContact.phone}
                photo={farmerContact.photo}
                label={t('anchor.labelFarmer')}
              />
            )}
            {driver && (
              <CallRow
                name={driver.name}
                phone={driver.phone}
                photo={driver.photo}
                label={t('anchor.labelDriver')}
              />
            )}
            <CallRow
              name={readCoordinator().name}
              phone={readCoordinator().phone}
              label={t('anchor.labelCoordinator')}
            />
          </div>
        </Section>

        <Section title={t('volunteer.team')}
          collapseKey="volunteer-team">
          <ul className="divide-y divide-edge-subtle">
            {volunteers.map(({ volunteer, isGroupPhone }) => (
              <li key={volunteer.id} className="flex items-center gap-3 py-2.5">
                <Avatar
                  photo={volunteer.photo}
                  name={volunteer.name}
                  size="sm"
                  ring={isGroupPhone}
                />
                <span className="text-caption font-medium">{volunteer.name}</span>
                <PhoneTypeChip type={volunteer.phoneType} />
                {isGroupPhone && (
                  <span className="chip bg-accent text-content-on-accent">
                    <Icon name="phone" size={11} />
                    {t('volunteers.groupPhoneHolder')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>

        {mission.status === 'return_not_confirmed' && (
          <Callout tone="warn" title={t('alerts.return_not_confirmed')}>
            {t('alerts.returnDetail')}
          </Callout>
        )}
      </div>

      {/* ★★ AE2c — תיק אתר, SUR LA GARDE EN COURS ET PAS SEULEMENT EN
          URGENCE. « La meilleure idée de la référence fournie par le PO, et
          utile toutes les nuits. » Le même composant que l'écran d'urgence :
          deux copies auraient divergé le jour où un champ s'ajoute, et le
          champ manquant aurait été le code du portail. */}
      <div className="mt-4">
        <SiteFile farm={farm} outline={zones.map((z) => z.ring)} />
      </div>

      <Link to="/volunteer/report" className="btn-primary btn-big mt-4">
        <Icon name="alert" size={18} />
        {t('volunteer.reportCta')}
      </Link>

      <p className="ltr-nums muted mt-3 text-center">
        {formatDateTime(mission.startAt, locale)}
      </p>
    </>
  )
}
