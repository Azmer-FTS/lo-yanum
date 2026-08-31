import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

import {
  FARM_PIPELINE,
  createAnchorPoint,
  createFarmZone,
  createThreatVector,
  createThreatZone,
  deleteFarm,
  deleteFarmZoneChecked,
  getThreatsForFarm,
  formatDate,
  formatDateTime,
  formatRelative,
  getAnchorPointsForFarm,
  getFarm,
  getFarmZonesForFarm,
  updateFarmZoneRing,
  getFarmVisitsForFarm,
  getVisibleIncidentViews,
  getVisibleMissionViews,
  entityKindOf,
  googleMapsPointUrl,
  now,
  patchAnchorPoint,
  ringAreaDunams,
  totalHeads,
} from '@core/index'
import type {
  Agreement,
  CommitmentKind,
  Farm,
  FarmStatus,
  LatLng,
} from '@core/index'

import { Avatar } from '../../components/Avatar'
import { useConfirmDelete } from '../../components/ConfirmDelete'
import { ContactActions } from '../../components/ContactActions'
import { FarmVisitModal } from '../../components/FarmVisitModal'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { AnchorMap } from '../../components/AnchorMap'
import { MapSplit } from '../../components/MapSplit'
import { ThreatPanel } from '../../components/ThreatPanel'
import { zoneColor, zoneLabelKey } from '../../components/zones'
import { Timeline } from '../../components/Timeline'
import type { TimelineEntry } from '../../components/Timeline'
import {
  FarmStatusChip,
  MissionStatusChip,
  SeverityChip,
  readStatusColor,
} from '../../components/badges'
import {
  CollapsibleSection,
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

/**
 * The pipeline as a row of pills.
 *
 * The current step is a TINT plus a dot, not a solid fill with near-black text.
 * Three of the seven pipeline hues cannot legibly carry 11px text on a solid
 * fill (see the `text-on-accent on solid <hue>` checks in `bun run contrast`),
 * and a stepper where two of the steps are readable and five are not is worse
 * than one that is uniformly quiet.
 */
function StatusStepper({ status }: { status: FarmStatus }) {
  const { t } = useTranslation()

  if (status === 'declined') {
    return (
      <div className="rounded-field border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-caption font-semibold text-status-danger-ink">
        {t('farmStatus.declined')}
      </div>
    )
  }

  const currentIndex = FARM_PIPELINE.indexOf(status)

  return (
    // G14c — `p-1 -m-1` gives the current pill's ring (a box-shadow) room to
    // paint inside the scroll container: flush against the clip edge it was
    // shaved off and the pill read as truncated. `whitespace-nowrap` keeps a
    // two-word status on one line instead of clipping mid-word.
    <ol className="scroll-x -m-1 flex items-center gap-1 p-1">
      {FARM_PIPELINE.map((step, i) => {
        const done = i < currentIndex
        const current = i === currentIndex
        return (
          <li key={step} className="flex shrink-0 items-center gap-1">
            <div
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1.5 text-micro font-semibold
                          transition-all duration-base ${
                            current
                              ? 'text-content-primary ring-1'
                              : done
                                ? 'bg-surface-high text-content-secondary'
                                : 'bg-surface-sunken text-content-muted'
                          }`}
              style={
                current
                  ? {
                      backgroundColor: `color-mix(in srgb, ${readStatusColor(step)} 18%, transparent)`,
                      // Ring colour is inline because it is data-driven; the
                      // token itself still comes from tokens.css.
                      boxShadow: `0 0 0 1px ${readStatusColor(step)}`,
                    }
                  : undefined
              }
            >
              {done && <Icon name="check" size={12} />}
              {current && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-pill"
                  style={{ backgroundColor: readStatusColor(step) }}
                />
              )}
              {t(`farmStatus.${step}`)}
            </div>
            {i < FARM_PIPELINE.length - 1 && (
              <span
                className={`block h-px w-4 ${
                  done ? 'bg-edge-strong' : 'bg-edge-subtle'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** D7.4 — the facts left over once the key-numbers band (G14c) took the big
 *  ones: type, locality, last visit. Dunams and the next visit live in the
 *  band now — repeating them here would be two sources for one number. */
function FarmFacts({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const locale = useLocale()

  return (
    <dl className="auto-cols gap-x-5 [--col-min:13rem]">
      <KeyValue label={t('farms.filterType')} value={t(`farmType.${farm.type}`)} />
      <KeyValue label={t('volunteers.locality')} value={farm.locality} />
      <KeyValue
        label={t('farms.lastVisit')}
        value={
          farm.lastVisitAt
            ? formatDate(farm.lastVisitAt, locale)
            : t('farms.noVisitYet')
        }
        ltr={farm.lastVisitAt !== null}
      />
    </dl>
  )
}

/**
 * G14c — THE KEY-NUMBERS BAND. The first thing in the content column: the
 * two dunam figures big (the PO reads acreage the way a treasurer reads a
 * balance), then status, next visit and last activity as the three facts a
 * phone call about this farm actually needs.
 */
function KeyNumbers({
  farm,
  lastActivityAt,
}: {
  farm: Farm
  lastActivityAt: string | null
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const heads = totalHeads(farm)

  return (
    <div className="card card-pad metric-band" data-testid="farm-key-numbers">
      <div className="min-w-0">
        <p className="numeric text-metric text-content-primary">
          {farm.farmDunams.toLocaleString(locale)}
        </p>
        <p className="muted mt-0.5 leading-tight">
          {t(
            entityKindOf(farm) === 'moshav'
              ? 'farms.farmAreaMoshav'
              : 'farms.farmArea',
          )}
          {/* G15 — the override is a VISIBLE fact, not a hidden flag. */}
          {farm.farmDunamsManual && (
            <span className="chip ms-1.5 bg-status-warn/15 text-status-warn-ink">
              {t('zone.manualOverride')}
            </span>
          )}
        </p>
      </div>
      <div className="min-w-0">
        <p className="numeric text-metric text-content-primary">
          {farm.grazingDunams.toLocaleString(locale)}
        </p>
        <p className="muted mt-0.5 leading-tight">
          {t('farms.grazingArea')}
          {farm.grazingDunamsManual && (
            <span className="chip ms-1.5 bg-status-warn/15 text-status-warn-ink">
              {t('zone.manualOverride')}
            </span>
          )}
        </p>
      </div>
      {/* ★ PO POINT 6 — THE HEAD COUNT SITS WITH THE DUNAMS BECAUSE IT
          ANSWERS THE SAME QUESTION: how much is under guard here. It is
          rendered ONLY when somebody has actually been asked — `totalHeads`
          returns null for an entity with no rows, and a "0 ראשים" tile would
          state a fact nobody has established, on a number the funding is
          built out of. */}
      {heads !== null && (
        <div className="min-w-0">
          <p className="numeric text-metric text-content-primary">
            {heads.toLocaleString(locale)}
          </p>
          <p className="muted mt-0.5 leading-tight">
            {t('livestock.total')}
            <span className="block text-micro">
              {(farm.livestock ?? [])
                .map(
                  (l) =>
                    `${l.kind === 'other' && l.label ? l.label : t(`livestock.kinds.${l.kind}`)} ${l.heads.toLocaleString(locale)}`,
                )
                .join(' · ')}
            </span>
          </p>
        </div>
      )}
      <div className="min-w-0">
        <FarmStatusChip status={farm.status} />
        <p className="muted mt-1 leading-tight">{t('farms.statusLabel')}</p>
      </div>
      <div className="min-w-0">
        <p className="ltr-nums truncate text-heading font-semibold text-content-primary">
          {farm.nextVisitAt
            ? formatDate(farm.nextVisitAt, locale)
            : t('common.none')}
        </p>
        <p className="muted mt-0.5 leading-tight">{t('farms.nextVisit')}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-heading font-semibold text-content-primary">
          {lastActivityAt
            ? formatRelative(lastActivityAt, locale)
            : t('common.none')}
        </p>
        <p className="muted mt-0.5 leading-tight">{t('farms.lastActivity')}</p>
      </div>
    </div>
  )
}

/**
 * G14c — the signed agreement becomes a document you can OPEN, not a line of
 * metadata: view, download, share. The file is the repo's mock PDF — Lot 3
 * brings real signed documents; the three actions are the flow being proven.
 * Share prefers the Web Share API (the coordinator is on a phone half the
 * time) and falls back to a WhatsApp text with the link.
 */
function AgreementActions({
  agreement,
  farmName,
}: {
  agreement: Agreement
  farmName: string
}) {
  const { t } = useTranslation()
  const url = new URL(
    `${import.meta.env.BASE_URL}mock-agreement.pdf`,
    window.location.href,
  ).toString()

  const share = () => {
    if (navigator.share) {
      navigator
        .share({ title: agreement.fileName, url })
        .catch(() => {/* user dismissed the sheet — nothing to do */})
    } else {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(
          `${farmName} — ${agreement.fileName}\n${url}`,
        )}`,
        '_blank',
        'noreferrer',
      )
    }
  }

  const iconBtn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-field text-content-muted ' +
    'transition-colors duration-fast hover:bg-surface-high hover:text-content-primary'

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={t('farms.agreementView')}
        aria-label={t('farms.agreementView')}
        className={iconBtn}
      >
        <Icon name="eye" size={17} />
      </a>
      <a
        href={url}
        download={agreement.fileName}
        title={t('farms.agreementDownload')}
        aria-label={t('farms.agreementDownload')}
        className={iconBtn}
      >
        <Icon name="download" size={17} />
      </a>
      <button
        type="button"
        onClick={share}
        title={t('farms.agreementShare')}
        aria-label={t('farms.agreementShare')}
        className={iconBtn}
      >
        <Icon name="send" size={17} />
      </button>
    </div>
  )
}

/**
 * G7bis.3 / G14c — the identity card: where the farm stands in the pipeline,
 * then the leftover facts.
 */
function FarmIdentity({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  return (
    <Section title={t('common.details')} flush>
      <div className="mb-3 border-b border-edge-subtle pb-3">
        <StatusStepper status={farm.status} />
      </div>
      <FarmFacts farm={farm} />
    </Section>
  )
}

export function FarmDetailScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const { farmId = '' } = useParams()
  // PO POINT 8 — one dialog for every deletion this screen offers.
  const del = useConfirmDelete()

  const farm = useCoreValue(() => getFarm(farmId))
  const anchors = useCoreValue(() => getAnchorPointsForFarm(farmId))
  const zones = useCoreValue(() => getFarmZonesForFarm(farmId))
  // G18 — attached to THIS farm plus everything free at map level. A threat
  // between two holdings is the one a coordinator most needs to see while
  // looking at either of them (see getThreatsForFarm).
  const threats = useCoreValue(() => getThreatsForFarm(farmId))
  const visits = useCoreValue(() => getFarmVisitsForFarm(farmId))
  const incidents = useCoreValue(() =>
    getVisibleIncidentViews().filter((v) => v.incident.farmId === farmId),
  )
  const missions = useCoreValue(() =>
    getVisibleMissionViews().filter((v) => v.mission.farmId === farmId),
  )

  const [newVisit, setNewVisit] = useState(false)
  const [editVisitId, setEditVisitId] = useState<string | null>(null)
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null)
  // G15 — zone selection lives HERE so the list's "ערוך" buttons and the
  // map's own clicks drive the same state.
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [selectedThreatId, setSelectedThreatId] = useState<string | null>(null)

  // G7bis.3 — the secondary blocks open by default only where two columns
  // exist to absorb them; on one narrow column they start folded. Read once:
  // resizing mid-visit should not re-fold what the user arranged.
  const [wideDefault] = useState(() =>
    window.matchMedia('(min-width: 1280px)').matches,
  )

  if (!farm) return <Navigate to="/coordinator/farms" replace />

  /**
   * D6.3 — the farm's recent life in one strip: last guard, last incident, last
   * visit, next visit. Four heterogeneous records merged and sorted by time,
   * because "what has been going on at this farm" is a chronological question
   * and answering it from three separate cards means reading three dates and
   * doing the sort in your head.
   */
  const nowMs = now().getTime()
  const activity: TimelineEntry[] = [
    ...missions.slice(0, 2).map((v) => ({
      id: `m-${v.mission.id}`,
      label: t('timeline.lastGuard'),
      at: v.mission.startAt,
      detail: `${v.anchorPoint.name} · ${v.volunteers.length}`,
      icon: 'shield' as const,
      state: 'done' as const,
      tone: 'default' as const,
    })),
    ...incidents.slice(0, 2).map(({ incident }) => ({
      id: `i-${incident.id}`,
      label: t('timeline.lastIncident'),
      at: incident.reportedAt,
      detail: incident.description,
      icon: 'alert' as const,
      state: 'done' as const,
      tone: (incident.severity === 'urgent' ? 'danger' : 'warn') as
        | 'danger'
        | 'warn',
    })),
    ...visits.map((visit) => {
      const future = new Date(visit.at).getTime() > nowMs
      return {
        id: `v-${visit.id}`,
        label: t(future ? 'timeline.nextVisit' : 'timeline.lastVisit'),
        at: visit.at,
        detail: visit.note,
        icon: 'pin' as const,
        state: (future ? 'current' : 'done') as 'current' | 'done',
        tone: 'accent' as const,
      }
    }),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6)

  // G14c — "last activity" is the newest PAST entry; the sort above puts a
  // planned future visit first, and "next Tuesday" is not an activity yet.
  const lastActivityAt =
    activity.find((e) => e.at !== null && new Date(e.at).getTime() <= nowMs)
      ?.at ?? null

  /* P0bis.1 — the editable map, hoisted so the shell below reads as what it
     is: content and map, in that DOM order, with MapSplit putting the map on
     the physical left. F6.1/G7bis — the same surface as before: a click drops
     a guard post, zones draw and edit, fullscreen is one button away. */
  const mapBody = (
    <AnchorMap
      flush
      farm={farm}
      threatZones={threats.zones}
      threatVectors={threats.vectors}
      selectedThreatId={selectedThreatId}
      // A shape drawn from a farm's own screen is ATTACHED to it. The
      // free ones are drawn from the global map, where "which farm?"
      // has no answer.
      onThreatZoneCreate={(ring) => {
        const created = createThreatZone({
          farmId: farm.id,
          ring,
          intensity: 'medium',
          note: '',
        })
        setSelectedThreatId(created.id)
      }}
      onThreatVectorCreate={(origin, target) => {
        const created = createThreatVector({
          farmId: farm.id,
          origin,
          target,
          intensity: 'medium',
          note: '',
        })
        setSelectedThreatId(created.id)
      }}
      anchors={anchors}
      selectedZoneId={selectedZoneId}
      onZoneSelectionChange={setSelectedZoneId}
      selectedId={selectedAnchorId}
      onSelect={setSelectedAnchorId}
      onCreate={(position: LatLng) => {
        const created = createAnchorPoint({
          farmId: farm.id,
          name: t('anchor.defaultName', { n: anchors.length + 1 }),
          position,
          instructions: [],
          accessDescription: '',
        })
        setSelectedAnchorId(created.id)
      }}
      onMove={(id, position) => patchAnchorPoint(id, { position })}
      zones={zones}
      onZoneCreate={(kind, ring) =>
        createFarmZone({ farmId: farm.id, kind, ring })
      }
      onZoneRingChange={updateFarmZoneRing}
      onZoneDelete={(id) => del.ask('farmZone', id, () => deleteFarmZoneChecked(id))}
    />
  )

  return (
    <>
      {/* G14c/P0bis.1 — THE FARM DETAIL IS MAP-FIRST like every other screen
          that carries a map: map physically LEFT at full column height,
          content on the right, only the content scrolls. It breaks at `xl`
          rather than `lg` because the content column here is a form-dense
          reading and an iPad PORTRAIT is 1032 (A49). */}
      <MapSplit
        screenKey="farm-detail"
        ariaLabel={t('map.title')}
        breakpoint="xl"
        contentPercent={42}
        splitHeight="h-[45dvh]"
        map={() => mapBody}
      >
        {({ mode: mapMode, setMode: setMapMode }) => (
          <>
          <PageHeader
            title={farm.name}
            subtitle={`${farm.locality} · ${farm.region}`}
            back={{ to: '/coordinator/farms', label: t('farms.title') }}
            actions={
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setNewVisit(true)}
                >
                  <Icon name="calendar" size={15} />
                  {t('agenda.planVisit')}
                </button>
                <Link
                  to={`/coordinator/farms/${farm.id}/edit`}
                  className="btn-secondary"
                >
                  <Icon name="edit" size={15} />
                  {t('common.edit')}
                </Link>
                {/* PO POINT 8 — the way back from a farm entered twice. It is
                    a `btn-ghost` in the danger ink rather than a red button:
                    the action has to EXIST, and it must not be the loudest
                    thing on a screen whose job is the farm. */}
                <button
                  type="button"
                  data-testid="delete-entity"
                  className="btn-ghost text-status-danger-ink hover:bg-status-danger/10"
                  onClick={() =>
                    del.ask('entity', farm.id, () => deleteFarm(farm.id), {
                      after: () => navigate('/coordinator/farms'),
                    })
                  }
                >
                  <Icon name="trash" size={15} />
                  {t('deletion.action')}
                </button>
              </>
            }
          />

          <div className="flex flex-col gap-4">
            {/* G14c — the numbers first, big; the long reading below. */}
            <KeyNumbers farm={farm} lastActivityAt={lastActivityAt} />

            <FarmIdentity farm={farm} />

            {/* G14c — the recent-activity strip moved up from the fold: "what
                has been going on here" is the second question after the
                numbers, not an appendix. */}
            <Section title={t('timeline.farmActivity')}>
              {activity.length === 0 ? (
                <EmptyState icon="history" title={t('timeline.noActivity')} />
              ) : (
                <Timeline withDate entries={activity} />
              )}
            </Section>

            <Section
            title={t('farms.anchorPoints')}
            action={
              <a
                href={googleMapsPointUrl(farm.position)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-micro font-semibold text-accent-ink hover:underline"
              >
                <Icon name="external" size={13} />
                {t('common.openInMaps')}
              </a>
            }
          >
            {anchors.length === 0 ? (
              /* F1 — no anchor point is not an empty list, it is a missing
                 thing with a way to make it. The map above this is that way. */
              <EmptyState
                icon="pin"
                title={t('farms.noAnchorPoints')}
                hint={t('anchor.mapHintCreate')}
              />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {anchors.map((anchor) => (
                  <li
                    key={anchor.id}
                    className={`flex items-center gap-1 rounded-field border px-1 transition-colors duration-fast ${
                      anchor.id === selectedAnchorId
                        ? 'border-accent bg-accent/10'
                        : 'border-transparent'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedAnchorId(anchor.id)}
                      className="min-w-0 flex-1 px-2 py-2 text-start"
                    >
                      <span className="block truncate text-caption font-medium text-content-primary">
                        {anchor.name}
                      </span>
                      {/* `line-clamp-1` supplies its own `display:-webkit-box`;
                          adding `block` next to it silently un-clamps the line
                          and a four-line access description shoves the list. */}
                      <span className="muted mt-0.5 line-clamp-1">
                        {anchor.accessDescription || t('anchor.accessLater')}
                      </span>
                    </button>
                    <Link
                      to={`/coordinator/farms/${farm.id}/anchors/${anchor.id}`}
                      aria-label={t('common.details')}
                      title={t('common.details')}
                      className="shrink-0 rounded-field p-2 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
                    >
                      <Icon name="document" size={16} />
                    </Link>
                    <Link
                      to={`/coordinator/farms/${farm.id}/anchors/${anchor.id}/edit`}
                      aria-label={t('anchor.edit')}
                      title={t('anchor.edit')}
                      className="shrink-0 rounded-field p-2 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
                    >
                      <Icon name="edit" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* G15 — the ground list: every drawn zone with its live area, and
              an "ערוך" that selects it on the map with its handles up. */}
          <Section title={t('zone.zonesTitle')}>
            {zones.length === 0 ? (
              <EmptyState icon="map" title={t('zone.noZones')} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {zones.map((z) => (
                  <li
                    key={z.id}
                    className={`flex items-center gap-2.5 rounded-field border px-3 py-2 transition-colors duration-fast ${
                      z.id === selectedZoneId
                        ? 'border-accent bg-accent/10'
                        : 'border-edge-subtle'
                    }`}
                  >
                    <span
                      className="inline-block h-2.5 w-4 shrink-0 border"
                      style={{
                        borderColor: zoneColor(z.kind, entityKindOf(farm)),
                        backgroundColor: `color-mix(in srgb, ${zoneColor(z.kind, entityKindOf(farm))} 18%, transparent)`,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-caption font-medium text-content-primary">
                        {t(zoneLabelKey(z.kind, entityKindOf(farm)))}
                      </span>
                      <span className="muted numeric block">
                        {t('zone.areaDunams', {
                          n: Math.round(ringAreaDunams(z.ring)).toLocaleString(
                            locale,
                          ),
                        })}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedZoneId(
                          z.id === selectedZoneId ? null : z.id,
                        )
                        // Editing a zone is a map action; a hidden map would
                        // swallow the click silently.
                        if (mapMode === 'hidden') setMapMode('split')
                      }}
                      className="btn-secondary shrink-0 py-1.5 text-micro"
                    >
                      <Icon name="edit" size={13} />
                      {t('zone.edit')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* G18 — directly under the ground it overlays, so the two read as
              what they are: the terrain, then the assessment about it. */}
          <ThreatPanel
            zones={threats.zones}
            vectors={threats.vectors}
            selectedId={selectedThreatId}
            onSelect={(id) => {
              setSelectedThreatId(id)
              if (id !== null && mapMode === 'hidden') setMapMode('split')
            }}
            farmName={farm.name}
            currentFarmId={farm.id}
          />

          {/* P0bis.3b — THE LOWER HALF PAIRS UP. Guard history, incidents,
              contacts, commitments, the agreement and the visits are each a
              short list; stacked they turn the panel into five screenfuls of
              mostly-empty column. They go two per row as soon as the panel can
              hold two, which — the panel being draggable now — is a question
              only the panel can answer. */}
          <div className="panel-scope">
            <div className="pair-grid">
          <Section title={t('farms.guardHistory')}>
            {missions.length === 0 ? (
              <EmptyState icon="shield" title={t('missions.empty')} />
            ) : (
              <ul className="divide-y divide-edge-subtle">
                {missions.map((view) => (
                  <li key={view.mission.id}>
                    <RowLink to={`/coordinator/missions/${view.mission.id}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="ltr-nums text-caption font-medium text-content-primary">
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

          <Section title={t('farms.recentIncidents')}>
            {incidents.length === 0 ? (
              <EmptyState icon="alert" title={t('incidents.empty')} />
            ) : (
              <ul className="divide-y divide-edge-subtle">
                {incidents.slice(0, 4).map(({ incident }) => (
                  <li key={incident.id}>
                    <RowLink to={`/coordinator/incidents/${incident.id}`}>
                      <div className="flex items-center gap-2">
                        <SeverityChip severity={incident.severity} />
                        <span className="ltr-nums text-micro text-content-muted">
                          {formatDateTime(incident.reportedAt, locale)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-caption text-content-secondary">
                        {incident.description}
                      </p>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('farms.contacts')}>
            <ul className="auto-cols gap-x-5 [--col-min:15rem]">
              {farm.contacts.map((contact) => (
                <li key={contact.id} className="flex items-center gap-3 py-1.5">
                  <Avatar photo={contact.photo} name={contact.name} size="md" />
                  <ContactActions
                    className="flex-1"
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

          <CollapsibleSection
            storageKey="farm-detail:commitments"
            title={t('commitment.title')}
            defaultOpen={wideDefault}
          >
            {farm.commitments.length === 0 ? (
              <EmptyState title={t('common.none')} />
            ) : (
              <ul className="grid gap-2">
                {farm.commitments.map((c, i) => (
                  <li
                    key={`${c.kind}-${i}`}
                    className="flex items-start gap-3 rounded-field border border-edge-subtle px-3 py-2.5"
                  >
                    <span
                      className={`mt-0.5 ${
                        c.fulfilled
                          ? 'text-status-success-ink'
                          : 'text-status-warn-ink'
                      }`}
                    >
                      <Icon name={COMMITMENT_ICON[c.kind]} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-caption font-medium text-content-primary">
                        {t(`commitment.${c.kind}`)}
                      </p>
                      <p className="muted mt-0.5">{c.detail}</p>
                    </div>
                    <span
                      className={`chip shrink-0 ${
                        c.fulfilled
                          ? 'bg-status-success/15 text-status-success-ink'
                          : 'bg-status-warn/15 text-status-warn-ink'
                      }`}
                    >
                      {t(
                        c.fulfilled ? 'commitment.fulfilled' : 'commitment.pending',
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="farm-detail:agreements"
            title={t('farms.agreements')}
            defaultOpen={wideDefault}
          >
            {farm.agreements.length === 0 ? (
              <EmptyState icon="document" title={t('farms.noAgreements')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {farm.agreements.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-field border border-edge-subtle px-3.5 py-3"
                  >
                    <span className="text-accent-ink">
                      <Icon name="document" size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-caption font-medium text-content-primary">
                        {a.fileName}
                      </p>
                      <p className="muted">
                        {t('farms.signedBy')} {a.signedBy} ·{' '}
                        <span className="ltr-nums">
                          {formatDate(a.signedAt, locale)}
                        </span>
                      </p>
                    </div>
                    {/* G14c — view / download / share, right on the row. */}
                    <AgreementActions agreement={a} farmName={farm.name} />
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="farm-detail:notes"
            title={t('common.notes')}
            defaultOpen={wideDefault}
          >
            <p className="whitespace-pre-line text-caption leading-relaxed text-content-secondary">
              {farm.notes || t('common.none')}
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            storageKey="farm-detail:visits"
            title={t('agenda.visits')}
            defaultOpen={wideDefault}
            action={
              <button
                type="button"
                onClick={() => setNewVisit(true)}
                className="btn-ghost py-1.5"
              >
                <Icon name="plus" size={14} />
                {t('agenda.planVisit')}
              </button>
            }
          >
            {visits.length === 0 ? (
              <EmptyState icon="calendar" title={t('agenda.noVisits')} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {visits.map((visit) => (
                  <li key={visit.id}>
                    <button
                      type="button"
                      onClick={() => setEditVisitId(visit.id)}
                      className="flex w-full items-start gap-2.5 rounded-field border border-edge-subtle px-3 py-2 text-start
                                 transition-all duration-fast hover:border-accent/50 hover:bg-surface-high"
                    >
                      <span
                        className={`mt-0.5 ${
                          visit.done
                            ? 'text-status-success-ink'
                            : 'text-status-violet-ink'
                        }`}
                      >
                        <Icon name={visit.done ? 'check' : 'calendar'} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="ltr-nums block text-caption font-medium text-content-primary">
                          {formatDateTime(visit.at, locale)}
                        </span>
                        {visit.note && (
                          <span className="muted mt-0.5 block line-clamp-2">
                            {visit.note}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
          </div>
          </div>
          </div>
          </>
        )}
      </MapSplit>

      {newVisit && (
        <FarmVisitModal
          defaultFarmId={farm.id}
          onClose={() => setNewVisit(false)}
        />
      )}
      {editVisitId && (
        <FarmVisitModal
          visitId={editVisitId}
          onClose={() => setEditVisitId(null)}
        />
      )}
      {del.dialog}
    </>
  )
}
