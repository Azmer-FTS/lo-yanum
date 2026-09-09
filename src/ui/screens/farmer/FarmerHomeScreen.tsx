import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  documentChecklist,
  formatDate,
  formatTime,
  formatWeekday,
  getCancelledMissionViews,
  getMyContactName,
  getMyFarm,
  getPastMissionViews,
  getUpcomingMissionViews,
  missingDocumentCount,
  readCoordinator,
  renewalStatus,
  dayKeyOf,
  now,
  resolveConfirmation,
} from '@core/index'
import type { MissionView } from '@core/index'

import { CallRow } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MissionStatusChip } from '../../components/badges'
import { Callout, EmptyState, PageHeader, Section } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'
import { useRenewalWindow } from '../../settings/renewal'
import { readOnlyProps, useReadOnly } from '../../settings/viewAs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG3.2 (2026-09-09) — L'ACCUEIL DE L'AGRICULTEUR, ET L'ORDRE EST LA
 *    DEMANDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Ce n'est PAS un guichet administratif ouvert trois fois par an. C'est
 *     SON application, ouverte à chaque garde. Les gardes passent en premier.
 *     SES GARDES · SA FICHE · SES DOCUMENTS. »
 *
 * ★★ L'ORDRE N'EST PAS UNE PRÉFÉRENCE ESTHÉTIQUE, C'EST UNE FRÉQUENCE. Il
 *    ouvre cet écran quinze fois par saison pour savoir qui vient ce soir, et
 *    deux fois par an pour un papier. Un écran qui met l'administratif en tête
 *    fait défiler quinze fois quelque chose qu'on ne veut pas, pour trouver la
 *    seule chose qu'on veut.
 *
 * ★★ ET LA GARDE ANNULÉE EST EN TÊTE DE TOUT, AVANT MÊME LES GARDES À VENIR.
 *    « Un agriculteur qui attend quelqu'un qui ne viendra pas est plus mal
 *    loti que sans garde. » C'est la seule phrase de cet écran qui coûte une
 *    nuit si elle arrive trop bas : il faut qu'elle soit lue par quelqu'un qui
 *    a ouvert l'application pour autre chose.
 */
export function FarmerHomeScreen() {
  const { t } = useTranslation()
  const locale = useLocale()

  const farm = useCoreValue(getMyFarm)
  const name = useCoreValue(getMyContactName)
  const upcoming = useCoreValue(getUpcomingMissionViews)
  const past = useCoreValue(getPastMissionViews)
  const cancelled = useCoreValue(getCancelledMissionViews)
  const coordinator = readCoordinator()
  const readOnly = useReadOnly()
  const window_ = useRenewalWindow()

  if (!farm) return null

  const todayKey = dayKeyOf(now())
  const renewal = renewalStatus(farm, todayKey, window_)
  const missing = missingDocumentCount(farm)
  const checklist = documentChecklist(farm)

  /**
   * ⚠️ « ANNULÉE » EST FILTRÉE SUR L'AVENIR, ET C'EST CE QUI LA REND UTILE.
   *    `getCancelledMissionViews` rend tout l'historique — utile au
   *    coordinateur qui compte ses nuits perdues, inutile ici : une nuit
   *    annulée il y a trois mois n'est pas une nouvelle, c'est un souvenir.
   *
   * ⚠️★★ ET LA BORNE EST `endAt`, PAS `startAt` — CORRIGÉ APRÈS MESURE. Avec
   *    `startAt`, une garde annulée À 23 H POUR LA NUIT DE 22 H À 6 H
   *    disparaissait de cet écran : son début était passé. C'est exactement le
   *    cas que la phrase du brief décrit — « un agriculteur qui attend
   *    quelqu'un qui ne viendra pas » — et c'est celui où il attend le plus
   *    fort, puisqu'il a déjà commencé à attendre. `endAt` est aussi la borne
   *    que `getUpcomingMissionViews` emploie, donc les deux listes se
   *    complètent au lieu de laisser un trou entre elles.
   */
  const nowMs = now().getTime()
  const cancelledAhead = cancelled.filter(
    (v) => new Date(v.mission.endAt).getTime() >= nowMs,
  )

  return (
    <>
      <PageHeader title={t('farmerSpace.title')} subtitle={farm.name} />

      {/* ------------------------------------------------------------------ */}
      {/* 0 — CE QUI N'AURA PAS LIEU                                          */}
      {/* ------------------------------------------------------------------ */}
      {cancelledAhead.map((view) => (
        <Callout
          key={view.mission.id}
          tone="danger"
          title={t('farmerSpace.cancelledTitle', {
            date: formatDate(view.mission.startAt, locale),
          })}
        >
          <span data-testid="farmer-cancelled">
            {view.mission.cancelReason
              ? t(`cancelReason.${view.mission.cancelReason}`)
              : t('farmerSpace.cancelledNoReason')}
          </span>
        </Callout>
      ))}

      {/* ------------------------------------------------------------------ */}
      {/* 1 — SES GARDES                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Section title={t('farmerSpace.upcoming')} collapseKey="farmer-space-upcoming">
        {upcoming.length === 0 ? (
          <EmptyState icon="moon" title={t('farmer.noUpcoming')} />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="farmer-upcoming">
            {upcoming.map((view) => (
              <GuardBlock key={view.mission.id} view={view} />
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('farmer.past')} collapseKey="farmer-space-past">
        {past.length === 0 ? (
          <EmptyState icon="shield" title={t('farmer.noPast')} />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="farmer-past">
            {past.slice(0, 8).map((view) => (
              <li key={view.mission.id} className="tile px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ltr-nums text-caption font-medium">
                    {formatDate(view.mission.startAt, locale)}
                  </span>
                  <span className="muted">
                    {formatWeekday(view.mission.startAt, locale)}
                  </span>
                  <MissionStatusChip status={view.mission.status} />
                </div>
                <p className="muted mt-0.5">
                  {view.volunteers.map((v) => v.volunteer.name).join(', ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 2 — SA FICHE                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Section title={t('farmerSpace.card')} collapseKey="farmer-space-card">
        <dl className="flex flex-col gap-2" data-testid="farmer-card">
          <Line label={t('agreement.fieldFarmerName')} value={farm.farmerName || name || ''} />
          <Line label={t('agreement.fieldFarmerId')} value={farm.farmerId ?? ''} />
          <Line label={t('agreement.fieldPhone')} value={farm.farmerPhone ?? ''} />
          {/* ⚠️ LES CLÉS SONT CELLES DES ÉCRANS QUI EXISTENT DÉJÀ (`form.*`,
              `import.*`), pas des clés neuves : trois libellés de plus pour
              dire « יישוב » et « סוג » seraient trois libellés à traduire deux
              fois, et c'est celui qu'on oublie qui finit en clé brute à
              l'écran. */}
          <Line label={t('import.fieldFarmName')} value={farm.farmName || farm.name} />
          <Line label={t('form.locality')} value={farm.locality} />
          <Line label={t('form.type')} value={t(`farmType.${farm.type}`)} />
        </dl>
        {/**
          * ★ AG3.2 — « ce qu'il peut corriger ». Il ne modifie pas la fiche
          *   directement : il la corrige EN SIGNANT, ce qui laisse une trace
          *   datée au lieu d'une modification anonyme. Voir `FarmerSignScreen`.
          *
          * ⚠️★★ ET EN MODE « VOIR COMME » CE N'EST PLUS UN LIEN, C'EST UN
          *    BOUTON GRIS — ce qui est un défaut qu'A140 a trouvé et qu'aucune
          *    relecture n'aurait vu. Le raisonnement fautif était : « ce lien
          *    ne fait que NAVIGUER, l'action est bloquée à l'arrivée, donc il
          *    n'y a rien à désactiver ». C'est vrai du magasin et faux de
          *    l'écran : le brief demande que « toute action soit désactivée
          *    VISIBLEMENT, pas seulement ignorée », et un coordinateur qui suit
          *    un lien vivant pour trouver un formulaire mort a appris deux
          *    fois la mauvaise chose — que le lien marche, puis que l'app est
          *    cassée. Le refus doit être là où le geste commence.
          *
          * ★ LES DOCUMENTS, EUX, RESTENT ATTEIGNABLES : cet écran-là est une
          *   LECTURE (ce qui est fourni, ce qui manque) et c'est précisément
          *   ce que le PO veut voir. Ses deux champs de dépôt y sont gris.
          */}
        {readOnly ? (
          <button
            type="button"
            data-testid="farmer-fix"
            className="btn-secondary mt-3 w-full"
            {...readOnlyProps(readOnly, t('viewAs.blocked'))}
          >
            <Icon name="edit" size={16} />
            {t('farmerSpace.fix')}
          </button>
        ) : (
          <Link to="/farmer/sign" className="btn-secondary mt-3 w-full" data-testid="farmer-fix">
            <Icon name="edit" size={16} />
            {t('farmerSpace.fix')}
          </Link>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 3 — SES DOCUMENTS                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title={t('farmerSpace.documents')}
        collapseKey="farmer-space-documents"
        summary={missing > 0 ? String(missing) : undefined}
      >
        {renewal.state === 'due' && (
          <Callout tone="warn" title={t('renewal.dueTitle')}>
            <span data-testid="farmer-renewal">
              {t('renewal.dueBody', { days: renewal.daysLeft, date: renewal.until })}
            </span>
          </Callout>
        )}
        <ul className="mt-2 flex flex-col gap-2" data-testid="farmer-documents">
          {checklist.map((line) => (
            <li
              key={line.id}
              className="flex items-center gap-2.5 rounded-field bg-surface-high px-3.5 py-3 shadow-card"
            >
              <span
                className={
                  line.provided ? 'text-status-success-ink' : 'text-content-muted'
                }
              >
                <Icon name={line.provided ? 'check' : 'upload'} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption font-medium">
                  {t(`documents.${line.id}`)}
                </span>
                <span className="muted block truncate">
                  {line.provided
                    ? t('documents.providedOn', {
                        date: formatDate(line.provided.providedAt, locale),
                      })
                    : t('documents.missing')}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <Link
          to="/farmer/documents"
          className="btn-primary mt-3 w-full"
          data-testid="farmer-documents-open"
        >
          <Icon name="upload" size={16} />
          {t('documents.open')}
        </Link>
      </Section>

      <Section title={t('anchor.labelCoordinator')} collapseKey="farmer-space-coordinator">
        <CallRow
          name={coordinator.name}
          phone={coordinator.phone}
          label={coordinator.role}
        />
      </Section>
    </>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-edge-subtle pb-1.5 last:border-0">
      <dt className="muted shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-caption text-content-primary">
        {value.trim() === '' ? <span className="muted">—</span> : value}
      </dd>
    </div>
  )
}

/**
 * ★★ AG3.3 — « IL VOIT QUI A ACCEPTÉ DE VENIR ET QUI N'A PAS RÉPONDU. »
 *
 * ★ LA SOURCE EST `resolveConfirmation` ET NON UN NOUVEAU CHAMP. Les trois
 *   canaux de confirmation existent depuis R6 — le conducteur, le porteur du
 *   téléphone du groupe, la personne elle-même — et « pending » y est déjà
 *   l'absence de réponse. Ajouter un booléen « a accepté » sur l'affectation
 *   aurait créé une seconde vérité, et c'est celle-là qui aurait été fausse.
 *
 * ⚠️ ET « PAS ENCORE RÉPONDU » N'EST PAS ÉCRIT EN ROUGE. Un volontaire qui n'a
 *    pas confirmé à 16:00 est un volontaire qui travaille, pas un volontaire
 *    qui se défile. Le rouge est réservé à `absent`, qui est une réponse.
 */
function GuardBlock({ view }: { view: MissionView }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { mission, anchorPoint, volunteers, driver } = view

  return (
    <li className="tile px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ltr-nums text-caption font-semibold">
          {formatDate(mission.startAt, locale)}
        </span>
        <span className="muted">{formatWeekday(mission.startAt, locale)}</span>
        <span className="ltr-nums muted">
          {formatTime(mission.startAt, locale)}–{formatTime(mission.endAt, locale)}
        </span>
        <MissionStatusChip status={mission.status} />
      </div>
      <p className="muted mt-1">{anchorPoint.name}</p>

      <ul className="mt-2 flex flex-col gap-1.5">
        {volunteers.map(({ volunteer }) => {
          const assignment = mission.assignments.find(
            (a) => a.volunteerId === volunteer.id,
          )
          const state = assignment
            ? resolveConfirmation(assignment.outbound)
            : 'pending'
          return (
            <li key={volunteer.id} className="flex flex-wrap items-center gap-2">
              <span
                data-testid={`farmer-answer-${state}`}
                className={`chip ${
                  state === 'present'
                    ? 'bg-status-success/15 text-status-success-ink'
                    : state === 'absent'
                      ? 'bg-status-danger/15 text-status-danger-ink'
                      : 'bg-content-muted/15 text-content-muted'
                }`}
              >
                {/**
                  * ⚠️★★ LES LIBELLÉS SONT CEUX DE L'AGRICULTEUR, PAS CEUX DU
                  *    RAMASSAGE, ET LA CAPTURE DU DÉPLOYÉ A MONTRÉ POURQUOI.
                  *
                  *    La première version rendait `confirm.*`, le vocabulaire
                  *    de R6 : « נאסף » (ramassé), « לא הגיע », « ממתין »,
                  *    « אי־התאמה ». Ce sont les mots du CONDUCTEUR, qui coche
                  *    des gens dans un minibus. À l'agriculteur, « נאסף » ne
                  *    répond pas à la question qu'il pose — « qui vient chez
                  *    moi ce soir ? » — et « אי־התאמה » ne veut strictement
                  *    rien dire pour lui.
                  *
                  * ★ LA DONNÉE NE CHANGE PAS, SEULE LA PHRASE. C'est la même
                  *   `resolveConfirmation(outbound)` : quelqu'un de confirmé
                  *   sur le trajet aller EST quelqu'un qui vient, et
                  *   « pending » EST « n'a pas répondu », qui sont les deux
                  *   mots exacts du brief. Traduire une donnée pour son
                  *   lecteur n'est pas la déformer ; lui montrer le journal
                  *   d'un autre métier, si.
                  */}
                {t(`farmerSpace.answer${state.charAt(0).toUpperCase()}${state.slice(1)}`)}
              </span>
              <div className="min-w-0 flex-1">
                <CallRow
                  name={volunteer.name}
                  phone={volunteer.phone}
                  photo={volunteer.photo}
                  whatsapp={volunteer.phoneType === 'smartphone'}
                  label={t('roles.volunteer')}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {driver && (
        <div className="mt-2">
          <CallRow
            name={driver.name}
            phone={driver.phone}
            photo={driver.photo}
            label={driver.vehicle}
          />
        </div>
      )}
    </li>
  )
}
