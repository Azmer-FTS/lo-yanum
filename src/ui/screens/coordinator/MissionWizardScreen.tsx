import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  COORDINATOR,
  atTimeOn,
  buildInvitationMessage,
  buildKosherMessage,
  buildSmartphoneMessage,
  createAnchorPoint,
  createMission,
  deleteAnchorPoint,
  formatDate,
  formatTime,
  fromDayKey,
  getAnchorPointsForFarm,
  getFarmZonesForFarm,
  getVisibleFarms,
  getVisibleMissions,
  getDrivers,
  getVolunteers,
  localDayKey,
  now,
  patchAnchorPoint,
  createFarmZone,
  updateFarmZoneRing,
  deleteFarmZone,
  rankCandidates,
  rankDrivers,
  shortlistSize,
  smsHref,
  telHref,
  whatsappHref,
} from '@core/index'
import type {
  AnchorPoint,
  CandidateScore,
  DriverScore,
  LatLng,
  SolicitationState,
  Volunteer,
} from '@core/index'

import { AnchorMap } from '../../components/AnchorMap'
import { MeetPointsEditor } from '../../components/meet'
import type { MeetPoints } from '../../components/meet'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { PhoneTypeChip } from '../../components/badges'
import { SelectField, TextArea, TextField } from '../../components/fields'
import {
  Callout,
  CopyButton,
  EmptyState,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

/**
 * D5 — THE GUARD-STAFFING WIZARD. The core act of the whole programme.
 *
 * Five steps: what → who (scored proposal) → the phone round → the driver →
 * the summary. Everything is mock in the sense that no message is actually
 * sent, but the FLOW is real and playable end to end, and the ranking is real:
 * it comes from @core/dispatch, is deterministic, and is verified by
 * `bun run dispatch`.
 *
 * The design point that matters is the phone round. A coordinator does not
 * "assign" volunteers, they call them, and roughly one in three says no. So the
 * shortlist is longer than the requirement, each candidate carries its own
 * state, and a refusal does not leave a hole: it drops the candidate and pulls
 * the next-best name up automatically. The gauge counts CONFIRMED people only —
 * a shortlist of six with two confirmations is two, not six.
 *
 * ── LOT 0.9 ─────────────────────────────────────────────────────────────────
 *
 * F1/F2 — STEP 1 IS MAP-FIRST, AND THE MAP IS THE INSTRUMENT.
 *
 * The bug that forced this: picking a farm with no anchor point rendered the
 * required "נקודת עיגון" select EMPTY, with no way to create one without
 * abandoning the half-filled wizard. A mandatory field that cannot be satisfied
 * is not validation, it is a wall — and the general rule it produced now holds
 * everywhere in the app: WHEN A REQUIRED VALUE IS MISSING, THE UI OFFERS THE
 * WAY TO CREATE IT ON THE SPOT.
 *
 * So the step adopts the app's map-first gabarit — geography on the physical
 * left, the form on the right — a click on the map drops an anchor point, pins
 * are draggable until the guard is committed, and several points can be checked
 * for one night because a group of four routinely covers two positions. The
 * select survives as a shortcut for picking the RENDEZVOUS among the points
 * already chosen, which is a real job; it is no longer the only door.
 *
 * F5.3/F5.4 — the stepper is sticky at the top and the actions are sticky at
 * the foot, so only the middle scrolls; and the candidate lists lost their
 * enclosing card, because rows the same colour as the card they sit in do not
 * read as rows.
 *
 * All solicitation state is local to this component on purpose. Until the guard
 * is created, nothing about it belongs in the store: a coordinator who backs out
 * halfway through should leave no trace behind. ANCHOR POINTS ARE THE ONE
 * EXCEPTION and are written immediately — they belong to the farm, not to this
 * guard, and a point mapped during a phone call is worth keeping even if the
 * call ends with "not this week".
 */

type Step = 1 | 2 | 3 | 4 | 5

const STEP_KEYS: Record<Step, string> = {
  1: 'wizard.stepWhat',
  2: 'wizard.stepProposal',
  3: 'wizard.stepSolicit',
  4: 'wizard.stepDriver',
  5: 'wizard.stepRecap',
}

const STATE_CLASS: Record<SolicitationState, string> = {
  idle: 'bg-content-muted/15 text-content-muted',
  pending: 'bg-status-warn/15 text-status-warn-ink',
  confirmed: 'bg-status-success/15 text-status-success-ink',
  declined: 'bg-status-danger/15 text-status-danger-ink',
}

/** The score, broken out so the coordinator can see WHY this name is first. */
function ScoreBar({ candidate }: { candidate: CandidateScore }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="chip bg-accent/15 text-accent-ink">
        <span className="numeric">{Math.round(candidate.score)}</span>
      </span>
      <span className="chip bg-status-info/15 text-status-info-ink">
        <Icon name="pin" size={10} />
        <span className="ltr-nums">
          {candidate.distanceKm === null
            ? '—'
            : `${candidate.distanceKm.toFixed(0)} ${t('common.km')}`}
        </span>
      </span>
      <span className="chip bg-surface-high text-content-secondary">
        <Icon name="shield" size={10} />
        <span className="numeric">{candidate.volunteer.guardsCount}</span>
      </span>
      {candidate.sameYeshivaAsChosen && (
        <span className="chip bg-status-violet/15 text-status-violet-ink">
          <Icon name="users" size={10} />
          {t('wizard.pairBonus')}
        </span>
      )}
    </div>
  )
}

function CandidateRow({
  candidate,
  action,
  children,
}: {
  candidate: CandidateScore
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  const { volunteer } = candidate
  return (
    <li className="tile-interactive p-3">
      <div className="flex items-start gap-3">
        <Avatar photo={volunteer.photo} name={volunteer.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption font-semibold text-content-primary">
              {volunteer.name}
            </span>
            <PhoneTypeChip type={volunteer.phoneType} />
          </div>
          <p className="muted mt-0.5 truncate">
            {volunteer.yeshiva} · {volunteer.locality}
          </p>
          <div className="mt-2">
            <ScoreBar candidate={candidate} />
          </div>
          {children}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </li>
  )
}

/**
 * F2 — the mini-record for the point the coordinator just dropped.
 *
 * It writes straight through to the store on every keystroke rather than
 * collecting a draft and saving it: the point already exists (the click created
 * it), so there is no unsaved state to lose, and the pin's label on the map
 * updates as the name is typed — which is what makes the panel and the map read
 * as one object rather than two.
 *
 * `accessDescription` is REQUIRED on the standalone anchor form and deliberately
 * optional here — a coordinator on the phone should not have to compose driving
 * directions before they can staff a night. The debt is made visible instead:
 * the recap warns that the kosher-phone message is incomplete until it is
 * written, because that message is the only thing a volunteer without a map
 * will ever see.
 */
function AnchorEditor({
  anchor,
  onClose,
  onDelete,
  blockedNote,
}: {
  anchor: AnchorPoint
  onClose: () => void
  onDelete: () => void
  blockedNote: string | null
}) {
  const { t } = useTranslation()

  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-heading text-content-primary">
          {t('anchor.pointDetails')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="rounded-field p-1.5 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
        >
          <Icon name="close" size={17} />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <TextField
          label={t('form.anchorName')}
          value={anchor.name}
          required
          onChange={(name) => patchAnchorPoint(anchor.id, { name })}
        />
        <TextArea
          label={t('form.instructions')}
          rows={3}
          value={anchor.instructions.join('\n')}
          hint={t('form.instructionsHint')}
          onChange={(v) =>
            patchAnchorPoint(anchor.id, {
              instructions: v
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean),
            })
          }
        />
        <TextArea
          label={`${t('form.accessDescription')} · ${t('common.optional')}`}
          rows={3}
          value={anchor.accessDescription}
          hint={t('anchor.accessLater')}
          onChange={(accessDescription) =>
            patchAnchorPoint(anchor.id, { accessDescription })
          }
        />

        <p className="muted flex items-center gap-1.5">
          <Icon name="pin" size={13} />
          {t('anchor.positionOnMap')}
        </p>

        {blockedNote && <Callout tone="warn" title={blockedNote} />}

        <button
          type="button"
          onClick={onDelete}
          className="btn-ghost self-start py-1.5 text-micro text-status-danger-ink hover:bg-status-danger/10"
        >
          <Icon name="close" size={13} />
          {t('anchor.deletePoint')}
        </button>
      </div>
    </div>
  )
}

export function MissionWizardScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const farms = useCoreValue(getVisibleFarms)
  const volunteers = useCoreValue(getVolunteers)
  const drivers = useCoreValue(getDrivers)
  const missions = useCoreValue(getVisibleMissions)

  const [step, setStep] = useState<Step>(1)

  // --- Step 1 state --------------------------------------------------------
  const [farmId, setFarmId] = useState(farms[0]?.id ?? '')
  const anchors = useCoreValue(() => getAnchorPointsForFarm(farmId))
  const zones = useCoreValue(() => getFarmZonesForFarm(farmId))

  /**
   * The anchor points this guard covers, IN ORDER. The first is the rendezvous
   * the driver is sent to and the one every generated message names; the rest
   * are positions the group moves between during the night.
   */
  const [anchorIds, setAnchorIds] = useState<string[]>([])
  const [openAnchorId, setOpenAnchorId] = useState<string | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null)

  const [dayKey, setDayKey] = useState(params.get('date') ?? localDayKey(now()))
  const [startHour, setStartHour] = useState('21:00')
  const [endHour, setEndHour] = useState('05:00')
  const [required, setRequired] = useState(2)

  const farm = farms.find((f) => f.id === farmId) ?? null

  /**
   * Changing the farm re-seeds the selection with that farm's first point.
   *
   * Keyed on the FARM, not on the anchor list: re-seeding whenever `anchors`
   * changed would fight the coordinator every time they dropped a second pin,
   * silently snapping the choice back to point 1.
   */
  useEffect(() => {
    setAnchorIds(anchors.length > 0 ? [anchors[0].id] : [])
    setOpenAnchorId(null)
    setDeleteBlocked(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId])

  const chosenAnchors = anchorIds.flatMap((id) => {
    const a = anchors.find((x) => x.id === id)
    return a ? [a] : []
  })
  const anchor = chosenAnchors[0] ?? null
  const openAnchor = anchors.find((a) => a.id === openAnchorId) ?? null

  /** F2 — a click on the map creates the point, selects it, and opens it. */
  const createAnchorAt = (position: LatLng) => {
    if (!farm) return
    const created = createAnchorPoint({
      farmId: farm.id,
      name: t('anchor.defaultName', { n: anchors.length + 1 }),
      position,
      instructions: [],
      accessDescription: '',
    })
    setAnchorIds((prev) => [...prev, created.id])
    setOpenAnchorId(created.id)
    setDeleteBlocked(null)
  }

  const toggleAnchor = (id: string) =>
    setAnchorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const removeAnchor = (id: string) => {
    if (!deleteAnchorPoint(id)) {
      setDeleteBlocked(t('anchor.deleteBlocked'))
      return
    }
    setAnchorIds((prev) => prev.filter((x) => x !== id))
    setOpenAnchorId(null)
    setDeleteBlocked(null)
  }

  /** Promote a point to rendezvous: it becomes first, the rest keep their order. */
  const setRendezvous = (id: string) =>
    setAnchorIds((prev) => [id, ...prev.filter((x) => x !== id)])

  const { startAt, endAt } = useMemo(() => {
    const day = fromDayKey(dayKey)
    const [sh, sm] = startHour.split(':').map(Number)
    const [eh, em] = endHour.split(':').map(Number)
    const start = atTimeOn(day, sh || 0, sm || 0)
    // A guard that ends earlier in the day than it starts ends TOMORROW — which
    // is the normal case: 21:00 → 05:00.
    const endDay =
      (eh || 0) * 60 + (em || 0) <= (sh || 0) * 60 + (sm || 0)
        ? new Date(day.getTime() + 24 * 60 * 60 * 1000)
        : day
    return { startAt: start, endAt: atTimeOn(endDay, eh || 0, em || 0) }
  }, [dayKey, startHour, endHour])

  // --- Steps 2–3 state -----------------------------------------------------
  const [shortlist, setShortlist] = useState<string[]>([])
  const [responses, setResponses] = useState<Record<string, SolicitationState>>(
    {},
  )
  const [declined, setDeclined] = useState<string[]>([])

  // --- Step 4 state --------------------------------------------------------
  const [driverId, setDriverId] = useState<string | null>(null)
  // G8 — the transport's meeting points, edited beside the driver choice.
  const [meet, setMeet] = useState<MeetPoints>({
    pickupPoint: null,
    dropoffPoint: null,
    returnPickupPoint: null,
    returnDropoffPoint: null,
  })
  const [driverState, setDriverState] = useState<SolicitationState>('idle')
  const [declinedDrivers, setDeclinedDrivers] = useState<string[]>([])

  const [createdMissionId, setCreatedMissionId] = useState<string | null>(null)

  const destination = anchor?.position ?? farm?.position ?? null

  /**
   * The live ranking. Recomputed from the shortlist, so adding someone
   * immediately re-scores everyone else through the yeshiva bonus — which is
   * the behaviour that makes the pairing rule visible rather than theoretical.
   */
  const ranking: CandidateScore[] = useMemo(() => {
    if (!destination) return []
    return rankCandidates({
      volunteers,
      destination,
      startAt,
      endAt,
      missions,
      chosenIds: shortlist,
      excludedIds: declined,
    })
  }, [volunteers, destination, startAt, endAt, missions, shortlist, declined])

  const driverRanking: DriverScore[] = useMemo(() => {
    if (!destination) return []
    return rankDrivers({
      drivers,
      destination,
      startAt,
      endAt,
      missions,
      groupSize: shortlist.length || required,
      excludedIds: declinedDrivers,
    })
  }, [
    drivers,
    destination,
    startAt,
    endAt,
    missions,
    shortlist.length,
    required,
    declinedDrivers,
  ])

  const byId = useMemo(
    () => new Map(volunteers.map((v) => [v.id, v])),
    [volunteers],
  )
  const shortlisted = shortlist.flatMap((id) => {
    const v = byId.get(id)
    return v ? [v] : []
  })
  const confirmed = shortlisted.filter((v) => responses[v.id] === 'confirmed')
  const target = shortlistSize(required)

  const addCandidate = (id: string) =>
    setShortlist((prev) => (prev.includes(id) ? prev : [...prev, id]))

  const autoFill = () => {
    // Take from the CURRENT ranking rather than re-ranking per pick: the
    // pairing bonus would otherwise cascade the whole yeshiva onto the list.
    const missing = target - shortlist.length
    if (missing <= 0) return
    setShortlist((prev) => [
      ...prev,
      ...ranking
        .filter((c) => !prev.includes(c.volunteer.id))
        .slice(0, missing)
        .map((c) => c.volunteer.id),
    ])
  }

  /**
   * A refusal is not a deletion. The candidate leaves the shortlist, joins the
   * exclusion set so the ranking never offers them again for this guard, and
   * the best remaining name takes the freed slot straight away — the
   * coordinator keeps dialling instead of going back to browse.
   */
  const decline = (id: string) => {
    setDeclined((prev) => [...prev, id])
    setShortlist((prev) => {
      const without = prev.filter((x) => x !== id)
      const replacement = ranking.find(
        (c) => !without.includes(c.volunteer.id) && c.volunteer.id !== id,
      )
      return replacement && without.length < target
        ? [...without, replacement.volunteer.id]
        : without
    })
    setResponses((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const setResponse = (id: string, state: SolicitationState) => {
    if (state === 'declined') {
      decline(id)
      return
    }
    setResponses((prev) => ({ ...prev, [id]: state }))
  }

  const invitationFor = (volunteer: Volunteer): string => {
    if (!farm || !anchor) return ''
    return buildInvitationMessage(
      {
        volunteerName: volunteer.name,
        farm,
        anchorPoint: anchor,
        startAt,
        endAt,
        coordinatorName: COORDINATOR.name,
        coordinatorPhone: COORDINATOR.phone,
        locale,
      },
      {
        title: t('wizard.inviteTitle'),
        greeting: t('wizard.inviteGreeting'),
        farm: t('anchor.labelFarm'),
        date: t('missions.date'),
        time: t('wizard.inviteTime'),
        meeting: t('anchor.labelAnchor'),
        ask: t('wizard.inviteAsk'),
        signature: t('wizard.inviteSignature'),
      },
    )
  }

  const canLeaveStep1 = farm !== null && anchor !== null && required > 0
  const canLeaveStep2 = shortlist.length > 0
  const canLeaveStep3 = confirmed.length >= required

  const finish = () => {
    if (!farm || !anchor) return
    const mission = createMission({
      farmId: farm.id,
      anchorPointId: anchor.id,
      additionalAnchorPointIds: anchorIds.slice(1),
      startAt,
      endAt,
      volunteerIds: confirmed.map((v) => v.id),
      driverId: driverState === 'confirmed' ? driverId : null,
      ...meet,
    })
    setCreatedMissionId(mission.id)
    setStep(5)
  }

  // --- Recap messages ------------------------------------------------------

  const recap = useMemo(() => {
    if (!farm || !anchor) return null
    const driver = drivers.find((d) => d.id === driverId) ?? null
    const input = {
      farm,
      anchorPoint: anchor,
      // A throw-away Mission shaped just enough for the message builders,
      // which only read farm, anchor point and `startAt`. Building it here
      // rather than reading the created row back means the recap preview is
      // identical before and after the guard is saved.
      mission: {
        id: createdMissionId ?? 'draft',
        farmId: farm.id,
        anchorPointId: anchor.id,
        additionalAnchorPointIds: anchorIds.slice(1),
        ...meet,
        startAt,
        endAt,
        status: 'planned' as const,
        assignments: [],
        driverId,
        arrivalConfirmedAt: null,
        endConfirmedAt: null,
        createdAt: startAt,
        droppedOffAt: null,
        pickedUpAt: null,
        completedAt: null,
      },
      driver: driverState === 'confirmed' ? driver : null,
      farmerContact: farm.contacts.find((c) => c.isPrimary) ?? null,
      coordinatorName: COORDINATOR.name,
      coordinatorPhone: COORDINATOR.phone,
      locale,
    }
    const labels = {
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
    return {
      smartphone: buildSmartphoneMessage(input, labels),
      kosher: buildKosherMessage(input, labels),
    }
  }, [
    farm,
    anchor,
    anchorIds,
    meet,
    drivers,
    driverId,
    driverState,
    startAt,
    endAt,
    createdMissionId,
    locale,
    t,
  ])

  // --- Render --------------------------------------------------------------

  return (
    <>
      <Link
        to="/coordinator/missions"
        className="mb-3 inline-flex items-center gap-1.5 text-caption text-content-muted hover:text-content-primary"
      >
        <Icon name="chevron" size={15} className="ltr:-scale-x-100" />
        {t('missions.title')}
      </Link>

      <header className="mb-4">
        <h1 className="text-title text-content-primary">{t('wizard.title')}</h1>
        <p className="muted mt-1">{t('wizard.subtitle')}</p>
      </header>

      {/* F5.4 — the stepper is STICKY. It answers "where am I and how much is
          left", which is a question that arrives halfway down a long list of
          candidates — i.e. exactly where the old static one had scrolled away.
          `--shell-top` is the phone header's MEASURED height and is 0 on
          desktop, where the shell has no top bar at all, so this needs no
          breakpoint of its own.
          Below `sm` only the current label is spelled out — five Hebrew labels
          on a 390 px row is unreadable at any font size. */}
      <ol className="sticky top-[var(--shell-top)] z-30 -mx-4 mb-4 flex items-center gap-1 overflow-x-auto border-b border-edge-subtle bg-surface-base/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
        {([1, 2, 3, 4, 5] as Step[]).map((s, i) => {
          const done = s < step
          const current = s === step
          return (
            <li key={s} className="flex shrink-0 items-center gap-1">
              <span
                className={`flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-semibold transition-all duration-base ${
                  current
                    ? 'bg-gradient-accent text-content-on-accent shadow-accent'
                    : done
                      ? 'bg-status-success/15 text-status-success-ink'
                      : 'bg-surface-high text-content-muted'
                }`}
              >
                {done ? (
                  <Icon name="check" size={11} />
                ) : (
                  <span className="numeric">{s}</span>
                )}
                <span className={current ? '' : 'hidden sm:inline'}>
                  {t(STEP_KEYS[s])}
                </span>
              </span>
              {i < 4 && (
                <span
                  className={`block h-px w-3 ${done ? 'bg-status-success' : 'bg-edge-subtle'}`}
                />
              )}
            </li>
          )
        })}
      </ol>

      {/* ---------------------------------------------------------------- 1 */}
      {step === 1 &&
        (farm === null ? (
          /* F1 — the outermost dead end of all: no farms at all. Even here the
             screen offers the way forward instead of an empty select. */
          <div className="card card-pad">
            <EmptyState
              icon="farm"
              title={t('wizard.noFarms')}
              hint={t('wizard.noFarmsHint')}
              action={
                <Link to="/coordinator/farms/new" className="btn-primary">
                  <Icon name="plus" size={15} />
                  {t('farms.createFirst')}
                </Link>
              }
            />
          </div>
        ) : (
          /* F2 — the map-first gabarit, as on every other major screen: the map
             is on the PHYSICAL left in both writing directions (decision 34).
             The DOM order is form-then-map so a screen reader hears the
             decisions first; RTL + `row` and LTR + `row-reverse` both then put
             the map on the left. */
          <div className="flex flex-col gap-4 lg:h-[calc(100dvh-var(--shell-top)-var(--shell-bottom)-18rem)] lg:min-h-[24rem] lg:flex-row-reverse lg:rtl:flex-row">
            <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-none lg:w-[42%] lg:overflow-y-auto lg:pe-1">
              <Section title={t('wizard.whenSection')} flush>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label={t('missions.farm')}
                    value={farmId}
                    onChange={setFarmId}
                    required
                    className="sm:col-span-2"
                    options={farms.map((f) => ({
                      value: f.id,
                      label: `${f.name} · ${f.locality}`,
                    }))}
                  />
                  <label className="block">
                    <span className="label">{t('missions.date')}</span>
                    <input
                      type="date"
                      className="input ltr-nums text-start"
                      value={dayKey}
                      onChange={(e) => setDayKey(e.target.value)}
                    />
                  </label>
                  <TextField
                    label={t('wizard.required')}
                    type="number"
                    ltr
                    value={String(required)}
                    onChange={(v) =>
                      setRequired(Math.max(1, Math.min(12, Number(v) || 1)))
                    }
                    hint={t('wizard.requiredHint', {
                      count: shortlistSize(required),
                    })}
                  />
                  <label className="block">
                    <span className="label">{t('missions.startAt')}</span>
                    <input
                      type="time"
                      className="input ltr-nums text-start"
                      value={startHour}
                      onChange={(e) => setStartHour(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="label">{t('missions.endAt')}</span>
                    <input
                      type="time"
                      className="input ltr-nums text-start"
                      value={endHour}
                      onChange={(e) => setEndHour(e.target.value)}
                    />
                  </label>
                </div>
              </Section>

              <Section title={t('wizard.anchorSection')}>
                {anchors.length === 0 ? (
                  /* F1 — THE DEAD END, REPLACED. No select at all when there is
                     nothing to select: an empty dropdown reads as a loading bug,
                     while this says what to do and points at the thing that does
                     it. The chevron is flipped in BOTH directions because it
                     points at the map, which is physically left either way. */
                  <Callout tone="info" icon="pin" title={t('anchor.noneYet')}>
                    <span className="flex items-center gap-2 font-semibold text-accent-ink">
                      <Icon name="chevron" size={15} className="-scale-x-100" />
                      {t('anchor.createOnMap')}
                    </span>
                  </Callout>
                ) : (
                  <>
                    <p className="muted mb-2.5">
                      {t('wizard.anchorChooseHint')}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {anchors.map((a) => {
                        const rank = anchorIds.indexOf(a.id)
                        return (
                          <li
                            key={a.id}
                            className={`flex items-center gap-2.5 rounded-field border px-3 py-2 transition-colors duration-fast ${
                              rank >= 0
                                ? 'border-accent bg-accent/10'
                                : 'border-edge-subtle hover:border-edge-strong'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="check"
                              checked={rank >= 0}
                              onChange={() => toggleAnchor(a.id)}
                              aria-label={a.name}
                            />
                            <button
                              type="button"
                              onClick={() => setOpenAnchorId(a.id)}
                              className="min-w-0 flex-1 text-start"
                            >
                              <span className="block truncate text-caption font-medium text-content-primary">
                                {a.name}
                              </span>
                              {rank === 0 && (
                                <span className="muted block">
                                  {t('anchor.rendezvous')}
                                </span>
                              )}
                            </button>
                            {rank >= 0 && (
                              <span className="chip bg-accent text-content-on-accent">
                                <span className="numeric">{rank + 1}</span>
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setOpenAnchorId(a.id)}
                              aria-label={t('anchor.edit')}
                              className="shrink-0 rounded-field p-1.5 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
                            >
                              <Icon name="edit" size={15} />
                            </button>
                          </li>
                        )
                      })}
                    </ul>

                    {/* The select survives, with a job it can actually do:
                        WHICH of the chosen points the driver is sent to. It
                        only appears once that is a real question. */}
                    {chosenAnchors.length > 1 && (
                      <div className="mt-3">
                        <SelectField
                          label={t('anchor.rendezvous')}
                          value={anchorIds[0] ?? ''}
                          onChange={setRendezvous}
                          required
                          options={chosenAnchors.map((a) => ({
                            value: a.id,
                            label: a.name,
                          }))}
                        />
                      </div>
                    )}
                  </>
                )}
              </Section>

              {openAnchor && (
                <AnchorEditor
                  anchor={openAnchor}
                  blockedNote={deleteBlocked}
                  onClose={() => {
                    setOpenAnchorId(null)
                    setDeleteBlocked(null)
                  }}
                  onDelete={() => removeAnchor(openAnchor.id)}
                />
              )}
            </div>

            <div className="order-1 h-[42dvh] min-w-0 lg:order-none lg:h-full lg:flex-1">
              <AnchorMap
                farm={farm}
                anchors={anchors}
                chosenIds={anchorIds}
                selectedId={openAnchorId}
                onSelect={setOpenAnchorId}
                onCreate={createAnchorAt}
                onMove={(id, position) => patchAnchorPoint(id, { position })}
                zones={zones}
                onZoneCreate={(kind, ring) =>
                  farm && createFarmZone({ farmId: farm.id, kind, ring })
                }
                onZoneRingChange={updateFarmZoneRing}
                onZoneDelete={deleteFarmZone}
              />
            </div>
          </div>
        ))}

      {/* ---------------------------------------------------------------- 2 */}
      {step === 2 && (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Section
              title={t('wizard.stepProposal')}
              bare
              flush
              action={
                <button
                  type="button"
                  className="btn-ghost py-1.5"
                  onClick={autoFill}
                >
                  <Icon name="sparkle" size={14} />
                  {t('wizard.autoFill')}
                </button>
              }
            >
              <p className="muted mb-2.5">{t('wizard.proposalHint')}</p>
              {ranking.length === 0 ? (
                <EmptyState icon="users" title={t('volunteers.empty')} />
              ) : (
                /* F5.5 — twelve rows today and unbounded tomorrow, so the list
                   scrolls inside itself rather than stretching the page past
                   its own sticky footer. */
                <ul
                  className="stagger list-scroll flex flex-col gap-2 pe-1"
                  style={{ '--list-max': '32rem' } as React.CSSProperties}
                >
                  {ranking.slice(0, 12).map((candidate) => (
                    <CandidateRow
                      key={candidate.volunteer.id}
                      candidate={candidate}
                      action={
                        <button
                          type="button"
                          className="btn-secondary py-1.5 text-micro"
                          onClick={() => addCandidate(candidate.volunteer.id)}
                        >
                          <Icon name="plus" size={13} />
                          {t('wizard.add')}
                        </button>
                      }
                    />
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title={t('wizard.shortlist')} flush>
            <p className="muted mb-2">
              {t('wizard.shortlistCount', {
                count: shortlist.length,
                target,
              })}
            </p>
            {shortlisted.length === 0 ? (
              <EmptyState icon="users" title={t('wizard.shortlistEmpty')} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {shortlisted.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-2 rounded-field bg-surface-high px-2 py-1.5"
                  >
                    <Avatar photo={v.photo} name={v.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-caption text-content-primary">
                      {v.name}
                    </span>
                    <button
                      type="button"
                      aria-label={t('common.remove')}
                      onClick={() =>
                        setShortlist((prev) => prev.filter((x) => x !== v.id))
                      }
                      className="rounded-field p-1 text-content-muted hover:text-status-danger-ink"
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {/* ---------------------------------------------------------------- 3 */}
      {step === 3 && (
        <>
          <GaugeBar
            confirmed={confirmed.length}
            required={required}
            label={t('wizard.gauge')}
          />
          <Section title={t('wizard.stepSolicit')} bare flush>
            <p className="muted mb-2.5">{t('wizard.solicitHint')}</p>
            <ul className="stagger flex flex-col gap-2">
              {shortlisted.map((volunteer) => {
                const candidate =
                  ranking.find((c) => c.volunteer.id === volunteer.id) ?? null
                const state = responses[volunteer.id] ?? 'idle'
                const message = invitationFor(volunteer)

                return (
                  <li
                    key={volunteer.id}
                    className={`tile p-3 transition-all duration-fast ${
                      state === 'confirmed'
                        ? 'border-status-success/50 bg-status-success/5'
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar
                        photo={volunteer.photo}
                        name={volunteer.name}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-caption font-semibold text-content-primary">
                            {volunteer.name}
                          </span>
                          <PhoneTypeChip type={volunteer.phoneType} />
                          <span className={`chip ${STATE_CLASS[state]}`}>
                            {state === 'pending' && (
                              <span className="live-dot" />
                            )}
                            {t(`wizard.state_${state}`)}
                          </span>
                        </div>
                        <p className="muted mt-0.5 truncate">
                          {volunteer.yeshiva} · {volunteer.locality} ·{' '}
                          <span className="ltr-nums">{volunteer.phone}</span>
                        </p>

                        {/* Reach out. WhatsApp only for smartphone holders —
                            a kosher phone has no app to open it. */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <a
                            href={telHref(volunteer.phone)}
                            onClick={() => setResponse(volunteer.id, 'pending')}
                            className="btn-secondary py-1.5 text-micro"
                          >
                            <Icon name="phone" size={13} />
                            {t('common.call')}
                          </a>
                          <a
                            href={
                              volunteer.phoneType === 'smartphone'
                                ? whatsappHref(volunteer.phone, message)
                                : smsHref(volunteer.phone, message)
                            }
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setResponse(volunteer.id, 'pending')}
                            className="btn-secondary py-1.5 text-micro"
                          >
                            <Icon
                              name={
                                volunteer.phoneType === 'smartphone'
                                  ? 'whatsapp'
                                  : 'message'
                              }
                              size={13}
                            />
                            {t('wizard.sendMessage')}
                          </a>
                          <CopyButton
                            value={message}
                            label={t('anchor.copyMessage')}
                            className="btn-ghost py-1.5 text-micro"
                          />
                        </div>

                        {/* Record what they said. */}
                        <div className="mt-2 flex flex-wrap gap-2 border-t border-edge-subtle pt-2">
                          <button
                            type="button"
                            onClick={() =>
                              setResponse(volunteer.id, 'confirmed')
                            }
                            className={`btn py-1.5 text-micro ${
                              state === 'confirmed'
                                ? 'bg-status-success text-content-on-accent'
                                : 'border border-status-success/40 text-status-success-ink hover:bg-status-success/10'
                            }`}
                          >
                            <Icon name="check" size={13} />
                            {t('wizard.state_confirmed')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setResponse(volunteer.id, 'declined')}
                            className="btn border border-status-danger/40 py-1.5 text-micro text-status-danger-ink hover:bg-status-danger/10"
                          >
                            <Icon name="close" size={13} />
                            {t('wizard.state_declined')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setResponse(volunteer.id, 'pending')}
                            className="btn-ghost py-1.5 text-micro"
                          >
                            <Icon name="clock" size={13} />
                            {t('wizard.state_pending')}
                          </button>
                        </div>

                        {candidate && (
                          <div className="mt-2">
                            <ScoreBar candidate={candidate} />
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            {declined.length > 0 && (
              <p className="muted mt-2.5">
                {t('wizard.declinedCount', { count: declined.length })}
              </p>
            )}
          </Section>
        </>
      )}

      {/* ---------------------------------------------------------------- 4 */}
      {step === 4 && (
        <Section title={t('wizard.stepDriver')} bare flush>
          <p className="muted mb-2.5">{t('wizard.driverHint')}</p>
          <ul className="stagger flex flex-col gap-2">
            {driverRanking.map(({ driver, distanceKm, tooFewSeats }) => {
              const chosen = driverId === driver.id
              return (
                <li
                  key={driver.id}
                  className={`tile p-3 ${
                    chosen && driverState === 'confirmed'
                      ? 'border-status-success/50 bg-status-success/5'
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar photo={driver.photo} name={driver.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-caption font-semibold text-content-primary">
                          {driver.name}
                        </span>
                        <span className="chip bg-status-info/15 text-status-info-ink">
                          <Icon name="pin" size={10} />
                          <span className="ltr-nums">
                            {distanceKm === null
                              ? '—'
                              : `${distanceKm.toFixed(0)} ${t('common.km')}`}
                          </span>
                        </span>
                        <span
                          className={`chip ${
                            tooFewSeats
                              ? 'bg-status-warn/15 text-status-warn-ink'
                              : 'bg-surface-high text-content-secondary'
                          }`}
                        >
                          <Icon name="car" size={10} />
                          <span className="numeric">{driver.seats}</span>
                          {t('driver.seats')}
                        </span>
                        {chosen && (
                          <span className={`chip ${STATE_CLASS[driverState]}`}>
                            {driverState === 'pending' && (
                              <span className="live-dot" />
                            )}
                            {t(`wizard.state_${driverState}`)}
                          </span>
                        )}
                      </div>
                      <p className="muted mt-0.5 truncate">
                        {driver.vehicle} · {driver.locality} ·{' '}
                        <span className="ltr-nums">{driver.phone}</span>
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <a
                          href={telHref(driver.phone)}
                          onClick={() => {
                            setDriverId(driver.id)
                            setDriverState('pending')
                          }}
                          className="btn-secondary py-1.5 text-micro"
                        >
                          <Icon name="phone" size={13} />
                          {t('common.call')}
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setDriverId(driver.id)
                            setDriverState('confirmed')
                          }}
                          className={`btn py-1.5 text-micro ${
                            chosen && driverState === 'confirmed'
                              ? 'bg-status-success text-content-on-accent'
                              : 'border border-status-success/40 text-status-success-ink hover:bg-status-success/10'
                          }`}
                        >
                          <Icon name="check" size={13} />
                          {t('wizard.state_confirmed')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeclinedDrivers((prev) => [...prev, driver.id])
                            if (driverId === driver.id) {
                              setDriverId(null)
                              setDriverState('idle')
                            }
                          }}
                          className="btn border border-status-danger/40 py-1.5 text-micro text-status-danger-ink hover:bg-status-danger/10"
                        >
                          <Icon name="close" size={13} />
                          {t('wizard.state_declined')}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="muted mt-2.5">{t('wizard.driverOptional')}</p>
        </Section>
      )}

      {/* G8 — where the car meets the group, and where it stops at the farm.
          Lives on the driver step because it is the DRIVER'S geography; the
          guard's own is settled in step 1. */}
      {step === 4 && farm && (
        <Section
          title={t('meet.sectionTitle')}
          className="mt-4"
        >
          <p className="muted mb-3">{t('meet.sectionHint')}</p>
          <MeetPointsEditor
            farm={farm}
            anchors={chosenAnchors}
            value={meet}
            onChange={setMeet}
          />
        </Section>
      )}

      {/* ---------------------------------------------------------------- 5 */}
      {step === 5 && farm && anchor && (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="card-hero card-pad">
              <p className="flex items-center gap-2 text-caption font-semibold text-status-success-ink">
                <Icon name="check" size={16} />
                {t('wizard.created')}
              </p>
              <h2 className="mt-1 text-heading text-content-primary">
                {farm.name} · {anchor.name}
              </h2>
              <p className="ltr-nums muted mt-1">
                {formatDate(startAt, locale)} · {formatTime(startAt, locale)}–
                {formatTime(endAt, locale)}
              </p>
              {chosenAnchors.length > 1 && (
                <p className="muted mt-1">
                  {t('anchor.additionalPositions')}:{' '}
                  {chosenAnchors
                    .slice(1)
                    .map((a) => a.name)
                    .join(' · ')}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {createdMissionId && (
                  <Link
                    to={`/coordinator/missions/${createdMissionId}`}
                    className="btn-primary"
                  >
                    {t('missions.openMission')}
                  </Link>
                )}
                <Link to="/coordinator/agenda" className="btn-secondary">
                  {t('agenda.title')}
                </Link>
              </div>
            </div>

            {/* F2 — the debt taken on when a point was dropped mid-call. The
                kosher message is the only thing a volunteer without a map ever
                sees, so an empty access description is worth saying out loud
                here rather than discovering at 21:00. */}
            {chosenAnchors.some((a) => a.accessDescription.trim() === '') && (
              <Callout tone="warn" icon="alert" title={t('anchor.accessLater')}>
                <Link
                  to={`/coordinator/farms/${farm.id}/anchors/${anchor.id}/edit`}
                  className="font-semibold text-accent-ink hover:underline"
                >
                  {t('anchor.edit')}
                </Link>
              </Callout>
            )}

            <Section title={t('missions.team')}>
              <ul className="flex flex-col gap-1.5">
                {confirmed.map((v) => (
                  <li key={v.id} className="flex items-center gap-2">
                    <Avatar photo={v.photo} name={v.name} size="xs" />
                    <span className="text-caption text-content-primary">
                      {v.name}
                    </span>
                    <PhoneTypeChip type={v.phoneType} />
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <div className="flex flex-col gap-4">
            {recap && (
              <>
                <Section
                  title={t('anchor.smartphoneMessage')}
                  action={<CopyButton value={recap.smartphone} />}
                >
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-field bg-surface-high p-3 text-micro text-content-secondary">
                    {recap.smartphone}
                  </pre>
                </Section>
                <Section
                  title={t('anchor.kosherMessage')}
                  action={<CopyButton value={recap.kosher} />}
                >
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-field bg-surface-high p-3 text-micro text-content-secondary">
                    {recap.kosher}
                  </pre>
                </Section>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sticky footer navigation, offset above the sticky demo toolbar. */}
      {step < 5 && (
        <div className="sticky bottom-[var(--shell-bottom)] z-30 -mx-4 mt-5 flex items-center gap-2 border-t border-edge-subtle bg-surface-overlay/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              step === 1
                ? navigate('/coordinator/missions')
                : setStep((s) => (s - 1) as Step)
            }
          >
            {t(step === 1 ? 'common.cancel' : 'common.previous')}
          </button>

          <span className="muted ms-auto hidden sm:block">
            {t('common.step', { current: step, total: 5 })}
          </span>

          {step === 4 ? (
            /* F4 — the one irreversible commit in the app takes the charter
               orange. Everything before it is undone by pressing "back"; this
               creates a guard, and volunteers start being told about it. */
            <button type="button" className="btn-critical" onClick={finish}>
              <Icon name="check" size={15} />
              {t('wizard.finish')}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={
                (step === 1 && !canLeaveStep1) ||
                (step === 2 && !canLeaveStep2) ||
                (step === 3 && !canLeaveStep3)
              }
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              {t('common.next')}
              <Icon name="chevron" size={15} className="rtl:-scale-x-100" />
            </button>
          )}
        </div>
      )}
    </>
  )
}

/** Confirmations against the requirement. Counts CONFIRMED, never shortlisted. */
function GaugeBar({
  confirmed,
  required,
  label,
}: {
  confirmed: number
  required: number
  label: string
}) {
  const full = confirmed >= required
  const pct = Math.min(
    100,
    Math.round((confirmed / Math.max(1, required)) * 100),
  )

  return (
    <div className="card card-pad mb-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption font-semibold text-content-primary">
          {label}
        </p>
        <p
          className={`numeric text-heading ${
            full ? 'text-status-success-ink' : 'text-content-primary'
          }`}
        >
          <span className="ltr-nums">
            {confirmed} / {required}
          </span>
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-sunken">
        <div
          className={`h-full rounded-pill transition-all duration-slow ease-out ${
            full ? 'bg-status-success' : 'bg-gradient-accent'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
