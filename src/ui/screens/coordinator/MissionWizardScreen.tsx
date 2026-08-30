import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  COORDINATOR,
  atTimeOn,
  buildInvitationMessage,
  buildDriverMessage,
  buildKosherMessage,
  buildSmartphoneMessage,
  createAnchorPoint,
  createMission,
  getMission,
  updateMissionStaffing,
  deleteAnchorPoint,
  formatDate,
  formatTime,
  fromDayKey,
  getAnchorPointsForFarm,
  getFarmZonesForFarm,
  getThreatsForFarm,
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
  MissionDriver,
  SolicitationState,
  Volunteer,
} from '@core/index'

import { AnchorMap } from '../../components/AnchorMap'
import { PanelSplitter } from '../../components/splitter'
import { useMapRatio } from '../../components/mapMode'
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
  Modal,
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
      {/* G3.4 — stated preferences. Quiet when they merely exist; warn when
          THIS night runs against one (the soft filter made visible). */}
      {(
        [
          ['nights', 'avail.noNights'],
          ['days', 'avail.noDays'],
          ['weekends', 'avail.noWeekends'],
        ] as const
      ).map(([key, labelKey]) =>
        candidate.volunteer.availability?.[key] === false ? (
          <span
            key={key}
            className={`chip ${
              candidate.availabilityMismatches.includes(key)
                ? 'bg-status-warn/15 text-status-warn-ink'
                : 'bg-surface-high text-content-muted'
            }`}
          >
            <Icon name="clock" size={10} />
            {t(labelKey)}
          </span>
        ) : null,
      )}
      {candidate.availabilityMismatches.includes('date') && (
        <span className="chip bg-status-warn/15 text-status-warn-ink">
          <Icon name="clock" size={10} />
          {t('avail.excludedDate')}
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
  // P0bis.2 — step 1's own map/form seam, remembered under the same key space
  // as every other screen's. 42 % form is the Lot 0.9 reading and the default
  // a double-tap on the handle returns to.
  const stepOneRef = useRef<HTMLDivElement | null>(null)
  const stepOneRatio = useMapRatio('mission-wizard', 42)

  // --- Step 1 state --------------------------------------------------------
  const [farmId, setFarmId] = useState(farms[0]?.id ?? '')
  const anchors = useCoreValue(() => getAnchorPointsForFarm(farmId))
  const zones = useCoreValue(() => getFarmZonesForFarm(farmId))
  const threats = useCoreValue(() => getThreatsForFarm(farmId))

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
    if (skipReseedRef.current) {
      skipReseedRef.current = false
      return
    }
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
  // G3.2 — search + organisation filter over the candidate list.
  const [searchQ, setSearchQ] = useState('')
  const [filterYeshiva, setFilterYeshiva] = useState('')
  // G3.1 — the pre-composition runs once per wizard, not on every visit to
  // step 2: coming back from step 3 must not overwrite manual edits.
  const preComposedRef = useRef(false)
  const [responses, setResponses] = useState<Record<string, SolicitationState>>(
    {},
  )
  const [declined, setDeclined] = useState<string[]>([])

  // --- Step 4 state --------------------------------------------------------
  // G5.3 — several cars can serve one night: the selection is a map of
  // driverId → solicitation state, not a single id.
  const [driverSel, setDriverSel] = useState<Record<string, SolicitationState>>(
    {},
  )
  // G8 — the transport's meeting points, edited beside the driver choice.
  const [meet, setMeet] = useState<MeetPoints>({
    pickupPoint: null,
    dropoffPoint: null,
    returnPickupPoint: null,
    returnDropoffPoint: null,
  })
  const [declinedDrivers, setDeclinedDrivers] = useState<string[]>([])

  const [createdMissionId, setCreatedMissionId] = useState<string | null>(null)
  // G4.1 — the 3-of-5 dialog.
  const [showPartialDialog, setShowPartialDialog] = useState(false)
  // G4.2 — reopening a recruiting mission pre-fills the whole wizard.
  const resumeMissionId = params.get('resume')
  const skipReseedRef = useRef(false)

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

  /**
   * G3.1 — PRE-COMPOSITION. The wizard proposes a COMPLETE team of the
   * requested size, already checked, the moment step 2 opens. Picked
   * iteratively — choose the best candidate, re-rank, choose again — so the
   * pairing bonus can pull a yeshiva together, which one-shot top-N cannot.
   */
  const preCompose = () => {
    if (!destination) return
    const picked: string[] = []
    for (let i = 0; i < required; i++) {
      const r = rankCandidates({
        volunteers,
        destination,
        startAt,
        endAt,
        missions,
        chosenIds: picked,
        excludedIds: declined,
      })
      if (r.length === 0) break
      picked.push(r[0].volunteer.id)
    }
    setShortlist(picked)
  }

  useEffect(() => {
    if (step !== 2 || preComposedRef.current) return
    preComposedRef.current = true
    if (shortlist.length === 0) preCompose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // G3.2 — the search and the organisation filter narrow the RANKED list;
  // the ranking itself is untouched, so order still means score.
  const allYeshivot = useMemo(
    () => [...new Set(volunteers.map((v) => v.yeshiva))].sort(),
    [volunteers],
  )
  const visibleRanking = useMemo(() => {
    const q = searchQ.trim()
    return ranking.filter(
      (c) =>
        (q === '' ||
          c.volunteer.name.includes(q) ||
          c.volunteer.yeshiva.includes(q) ||
          c.volunteer.locality.includes(q)) &&
        (filterYeshiva === '' || c.volunteer.yeshiva === filterYeshiva),
    )
  }, [ranking, searchQ, filterYeshiva])

  const candidateScrollRef = useRef<HTMLDivElement | null>(null)
  const candidateVirtualizer = useVirtualizer({
    count: visibleRanking.length,
    getScrollElement: () => candidateScrollRef.current,
    // Measured after render (chips wrap unpredictably); this is the guess.
    estimateSize: () => 116,
    overscan: 8,
  })

  const startOver = () => {
    setShortlist([])
    setResponses({})
  }

  const shortlisted = shortlist.flatMap((id) => {
    const v = byId.get(id)
    return v ? [v] : []
  })
  const confirmed = shortlisted.filter((v) => responses[v.id] === 'confirmed')

  /**
   * G5.3 — CAPACITY IS THE SORT KEY. Drivers whose car covers the whole group
   * come first (in dispatch-score order); the rest follow, biggest car first,
   * because their only use is in a two-car combination.
   */
  const neededSeats = confirmed.length || shortlist.length || required
  const sortedDrivers = useMemo(() => {
    const covering = driverRanking.filter((d) => d.driver.seats >= neededSeats)
    const partial = driverRanking
      .filter((d) => d.driver.seats < neededSeats)
      .sort((a, b) => b.driver.seats - a.driver.seats)
    return [...covering, ...partial]
  }, [driverRanking, neededSeats])
  const noSingleCar =
    driverRanking.length > 0 &&
    driverRanking.every((d) => d.driver.seats < neededSeats)

  const confirmedDriverIds = Object.entries(driverSel)
    .filter(([, st]) => st === 'confirmed')
    .map(([id]) => id)
  // Keep ranking order — the split below assigns passengers car by car.
  const confirmedDrivers = sortedDrivers
    .filter((d) => confirmedDriverIds.includes(d.driver.id))
    .map((d) => d.driver)
  const seatsCovered = confirmedDrivers.reduce((sum, d) => sum + d.seats, 0)

  /**
   * G5.3 — each driver carries HIS OWN list: passengers are dealt greedily
   * into the confirmed cars in seat order, so the wizard, the recap message
   * and the mission row all agree on who rides with whom.
   */
  const missionDrivers: MissionDriver[] = useMemo(() => {
    const passengerIds = confirmed.map((v) => v.id)
    let cursor = 0
    return confirmedDrivers.map((driver) => {
      const take = passengerIds.slice(cursor, cursor + driver.seats)
      cursor += take.length
      return {
        driverId: driver.id,
        passengerVolunteerIds: take,
        confirmed: true,
      }
    })
  }, [confirmedDrivers, confirmed])
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

  const finish = () => {
    if (!farm || !anchor) return
    if (resumeMissionId) {
      // G4.2 — completing a draft: the mission already exists, its team is
      // replaced (marks kept) and the amber status clears.
      updateMissionStaffing(
        resumeMissionId,
        confirmed.map((v) => v.id),
        missionDrivers,
        'planned',
        required,
      )
      setCreatedMissionId(resumeMissionId)
      setStep(5)
      return
    }
    const mission = createMission({
      farmId: farm.id,
      anchorPointId: anchor.id,
      additionalAnchorPointIds: anchorIds.slice(1),
      startAt,
      endAt,
      volunteerIds: confirmed.map((v) => v.id),
      drivers: missionDrivers,
      requiredVolunteers: required,
      ...meet,
    })
    setCreatedMissionId(mission.id)
    setStep(5)
  }

  /**
   * G4.1a — "המשך להמתין": the guard is SAVED as it stands, amber, and the
   * coordinator is free to go do something else. Recruitment continues from
   * anywhere the mission shows.
   */
  const finishAsRecruiting = () => {
    if (!farm || !anchor) return
    if (resumeMissionId) {
      updateMissionStaffing(
        resumeMissionId,
        confirmed.map((v) => v.id),
        missionDrivers,
        'recruiting',
        required,
      )
    } else {
      createMission({
        farmId: farm.id,
        anchorPointId: anchor.id,
        additionalAnchorPointIds: anchorIds.slice(1),
        startAt,
        endAt,
        volunteerIds: confirmed.map((v) => v.id),
        drivers: missionDrivers,
        requiredVolunteers: required,
        status: 'recruiting',
        ...meet,
      })
    }
    navigate('/coordinator/missions')
  }

  // G4.2 — pre-fill everything from the mission being resumed. Runs once.
  useEffect(() => {
    if (!resumeMissionId) return
    const m = getMission(resumeMissionId)
    if (!m) return
    skipReseedRef.current = true
    preComposedRef.current = true
    setFarmId(m.farmId)
    setAnchorIds([m.anchorPointId, ...m.additionalAnchorPointIds])
    const start = new Date(m.startAt)
    const end = new Date(m.endAt)
    setDayKey(localDayKey(start))
    setStartHour(
      `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
    )
    setEndHour(
      `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
    )
    setRequired(m.requiredVolunteers)
    setShortlist(m.assignments.map((a) => a.volunteerId))
    setResponses(
      Object.fromEntries(
        m.assignments.map((a) => [a.volunteerId, 'confirmed' as const]),
      ),
    )
    setMeet({
      pickupPoint: m.pickupPoint,
      dropoffPoint: m.dropoffPoint,
      returnPickupPoint: m.returnPickupPoint,
      returnDropoffPoint: m.returnDropoffPoint,
    })
    setDriverSel(
      Object.fromEntries(m.drivers.map((d) => [d.driverId, 'confirmed' as const])),
    )
    setStep(2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeMissionId])

  // --- Recap messages ------------------------------------------------------

  const recap = useMemo(() => {
    if (!farm || !anchor) return null
    const driver = confirmedDrivers[0] ?? null
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
        requiredVolunteers: required,
        assignments: [],
        drivers: missionDrivers,
        arrivalConfirmedAt: null,
        endConfirmedAt: null,
        createdAt: startAt,
        droppedOffAt: null,
        pickedUpAt: null,
        completedAt: null,
        cancelledAt: null,
        cancelReason: null,
        cancelNote: '',
        cancelNotices: [],
        reactivatedAt: null,
      },
      driver,
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
    // G8/G5 — one driver briefing PER CAR, each listing its own passengers.
    const driverMessages = missionDrivers.flatMap((entry) => {
      const d = confirmedDrivers.find((x) => x.id === entry.driverId)
      if (!d) return []
      return [
        {
          driver: d,
          body: buildDriverMessage(
            {
              ...input,
              driver: d,
              passengerNames: entry.passengerVolunteerIds.map(
                (id) => byId.get(id)?.name ?? id,
              ),
            },
            {
              title: t('meet.driverMessageTitle'),
              farm: t('anchor.labelFarm'),
              pickup: t('meet.labelPickup'),
              dropoff: t('meet.labelDropoff'),
              arrival: t('anchor.labelArrival'),
              navigation: t('anchor.labelNavigation'),
              passengers: t('meet.passengers'),
              phones: t('anchor.labelPhones'),
              farmer: t('anchor.labelFarmer'),
              coordinator: t('anchor.labelCoordinator'),
            },
          ),
        },
      ]
    })

    return {
      smartphone: buildSmartphoneMessage(input, labels),
      kosher: buildKosherMessage(input, labels),
      driverMessages,
    }
  }, [
    farm,
    anchor,
    anchorIds,
    meet,
    confirmedDrivers,
    missionDrivers,
    byId,
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
          <div
            ref={stepOneRef}
            data-map-shell="mission-wizard"
            style={{ ['--content-w' as string]: `${stepOneRatio.ratio}%` }}
            className="flex flex-col gap-4 lg:h-[calc(100dvh-var(--shell-top)-var(--shell-bottom)-18rem)] lg:min-h-[24rem] lg:flex-row-reverse lg:rtl:flex-row"
          >
            <div
              data-map-content=""
              className="order-2 flex min-w-0 flex-col gap-4 lg:order-none lg:w-[var(--content-w)] lg:flex-none lg:overflow-y-auto lg:pe-1"
            >
              <Section title={t('wizard.whenSection')} flush>
                <div className="auto-cols gap-3 [--col-min:13rem]">
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

            {/* P0bis.2 — the wizard's step 1 is map-first too (F2), so it gets
                the same draggable seam as every other map-first screen. It is
                not a `MapSplit` because it lives inside the stepper's own
                height budget, which is why the splitter had to be its own
                component rather than a MapSplit detail. */}
            <PanelSplitter
              {...stepOneRatio}
              shellRef={stepOneRef}
              className="hidden lg:flex"
            />

            <div
              data-map-panel=""
              className="order-1 h-[42dvh] min-w-0 lg:order-none lg:h-full lg:flex-1"
            >
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
                // G18 — the layer's whole point on this screen: a guard post
                // is placed FACING the approach, and the coordinator cannot
                // do that from memory. Read-only here — the wizard is not
                // where an assessment is revised.
                threatZones={threats.zones}
                threatVectors={threats.vectors}
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
                <div className="flex items-center gap-2">
                  {/* G3.1 — the team arrives pre-composed; this is the way back
                      to an empty slate. */}
                  <button
                    type="button"
                    className="btn-ghost py-1.5"
                    onClick={startOver}
                  >
                    <Icon name="close" size={14} />
                    {t('wizard.startOver')}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost py-1.5"
                    onClick={autoFill}
                  >
                    <Icon name="sparkle" size={14} />
                    {t('wizard.autoFill')}
                  </button>
                </div>
              }
            >
              <p className="muted mb-2.5">{t('wizard.proposalHint')}</p>

              {/* G3.2 — search + organisation filter, above the candidates. */}
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-content-muted">
                    <Icon name="search" size={14} />
                  </span>
                  <input
                    type="search"
                    className="input ps-9"
                    placeholder={t('wizard.searchPlaceholder')}
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                  />
                </div>
                <select
                  className="input w-auto"
                  value={filterYeshiva}
                  onChange={(e) => setFilterYeshiva(e.target.value)}
                  aria-label={t('wizard.filterOrg')}
                >
                  <option value="">{t('wizard.allOrgs')}</option>
                  {allYeshivot.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {visibleRanking.length === 0 ? (
                <EmptyState icon="users" title={t('volunteers.empty')} />
              ) : (
                /* G3.3 — the WHOLE ranked roster is reachable: virtualised
                   inside its own scroll box, so the 300th candidate is a
                   scroll away and the DOM stays a couple dozen rows. */
                <div
                  ref={candidateScrollRef}
                  className="list-scroll pe-1"
                  style={{ '--list-max': '32rem' } as React.CSSProperties}
                >
                  <div
                    className="relative"
                    style={{ height: candidateVirtualizer.getTotalSize() }}
                  >
                    {candidateVirtualizer.getVirtualItems().map((item) => {
                      const candidate = visibleRanking[item.index]
                      return (
                        <div
                          key={candidate.volunteer.id}
                          data-index={item.index}
                          ref={candidateVirtualizer.measureElement}
                          style={{
                            position: 'absolute',
                            insetInlineStart: 0,
                            insetInlineEnd: 0,
                            top: 0,
                            transform: `translateY(${item.start}px)`,
                            paddingBottom: '0.5rem',
                          }}
                        >
                          <CandidateRow
                            candidate={candidate}
                            action={
                              <button
                                type="button"
                                className="btn-secondary py-1.5 text-micro"
                                onClick={() =>
                                  addCandidate(candidate.volunteer.id)
                                }
                              >
                                <Icon name="plus" size={13} />
                                {t('wizard.add')}
                              </button>
                            }
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </Section>
          </div>

          <Section title={t('wizard.shortlist')} flush>
            <p className="muted mb-2">
              {t('wizard.shortlistCount', {
                count: shortlist.length,
                target: required,
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
                    {/* G4.1b — after a phone round, who answered is visible
                        right here, so "replace candidates" lands on a marked
                        list rather than a memory test. */}
                    {responses[v.id] === 'confirmed' ? (
                      <span className="chip bg-status-success/15 text-status-success-ink">
                        <Icon name="check" size={10} />
                      </span>
                    ) : responses[v.id] === 'pending' ? (
                      <span className="chip bg-status-warn/15 text-status-warn-ink">
                        {t('wizard.noAnswerYet')}
                      </span>
                    ) : null}
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
            {/* P0bis.3b — the candidate cards go TWO PER ROW on a wide
                screen. The wizard runs full-page, so a one-column list of
                twelve short cards spends most of an iPad on nothing while the
                coordinator scrolls past the twelfth name he is ringing. */}
            <div className="panel-scope">
              <ul className="stagger pair-grid gap-2">
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
            </div>

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
        <Section
          title={t('driver.volunteerDrivers')}
          bare
          flush
          action={
            <span className="text-accent-ink">
              <Icon name="steering" size={22} />
            </span>
          }
        >
          <p className="muted mb-2.5">{t('wizard.driverHint')}</p>

          {/* G5.3 — the seat gauge and, when no car is big enough, the
              two-car call-out. */}
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span
              className={`chip ${
                seatsCovered >= neededSeats && confirmedDrivers.length > 0
                  ? 'bg-status-success/15 text-status-success-ink'
                  : 'bg-surface-high text-content-secondary'
              }`}
            >
              <Icon name="car" size={11} />
              {t('driver.seatsGauge', {
                covered: seatsCovered,
                needed: neededSeats,
              })}
            </span>
            {noSingleCar && (
              <span className="chip bg-status-warn/15 text-status-warn-ink">
                <Icon name="alert" size={11} />
                {t('driver.twoNeeded')}
              </span>
            )}
          </div>

            {/* P0bis.3b — the candidate cards go TWO PER ROW on a wide
                screen. The wizard runs full-page, so a one-column list of
                twelve short cards spends most of an iPad on nothing while the
                coordinator scrolls past the twelfth name he is ringing. */}
            <div className="panel-scope">
              <ul className="stagger pair-grid gap-2">
            {sortedDrivers.map(({ driver, distanceKm }) => {
              const state = driverSel[driver.id] ?? 'idle'
              const chosen = state === 'confirmed'
              const covers = driver.seats >= neededSeats
              const carEntry = missionDrivers.find(
                (d) => d.driverId === driver.id,
              )
              return (
                <li
                  key={driver.id}
                  className={`tile p-3 ${
                    chosen ? 'border-status-success/50 bg-status-success/5' : ''
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
                        {covers ? (
                          <span className="chip bg-status-success/15 text-status-success-ink">
                            <Icon name="car" size={10} />
                            {t('driver.coversAll', { seats: driver.seats })}
                          </span>
                        ) : (
                          <span className="chip bg-status-warn/15 text-status-warn-ink">
                            <Icon name="car" size={10} />
                            <span className="numeric">{driver.seats}</span>
                            {t('driver.seats')}
                          </span>
                        )}
                        {driver.volunteerId && (
                          <span className="chip bg-status-violet/15 text-status-violet-ink">
                            <Icon name="shield" size={10} />
                            {t('driver.alsoVolunteer')}
                          </span>
                        )}
                        {state !== 'idle' && (
                          <span className={`chip ${STATE_CLASS[state]}`}>
                            {state === 'pending' && <span className="live-dot" />}
                            {t(`wizard.state_${state}`)}
                          </span>
                        )}
                      </div>
                      <p className="muted mt-0.5 truncate">
                        {driver.vehicle || t('driver.privateCar')} ·{' '}
                        {driver.locality} ·{' '}
                        <span className="ltr-nums">{driver.phone}</span>
                      </p>

                      {/* G5.3 — HIS passengers, so "who rides with whom" is
                          settled here, not in the parking lot. */}
                      {chosen && carEntry && carEntry.passengerVolunteerIds.length > 0 && (
                        <p className="muted mt-1.5">
                          {t('driver.hisPassengers')}:{' '}
                          {carEntry.passengerVolunteerIds
                            .map((id) => byId.get(id)?.name ?? id)
                            .join(', ')}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        <a
                          href={telHref(driver.phone)}
                          onClick={() =>
                            setDriverSel((prev) => ({
                              ...prev,
                              [driver.id]:
                                prev[driver.id] === 'confirmed'
                                  ? 'confirmed'
                                  : 'pending',
                            }))
                          }
                          className="btn-secondary py-1.5 text-micro"
                        >
                          <Icon name="phone" size={13} />
                          {t('common.call')}
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setDriverSel((prev) => ({
                              ...prev,
                              [driver.id]:
                                prev[driver.id] === 'confirmed'
                                  ? 'idle'
                                  : 'confirmed',
                            }))
                          }
                          className={`btn py-1.5 text-micro ${
                            chosen
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
                            setDriverSel((prev) => {
                              const next = { ...prev }
                              delete next[driver.id]
                              return next
                            })
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
            </div>
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
                {recap.driverMessages.map(({ driver: d, body }) => (
                  <Section
                    key={d.id}
                    title={`${t('meet.copyDriverMessage')} — ${d.name}`}
                    action={<CopyButton value={body} />}
                  >
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-field bg-surface-high p-3 text-micro text-content-secondary">
                      {body}
                    </pre>
                  </Section>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* G4.1 — the 3-of-5 choice. Three doors, none of them a wall. */}
      {showPartialDialog && (
        <Modal
          title={t('wizard.partialTitle', {
            confirmed: confirmed.length,
            required,
          })}
          onClose={() => setShowPartialDialog(false)}
        >
          <p className="muted mb-4">{t('wizard.partialBody')}</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn-secondary justify-start"
              onClick={finishAsRecruiting}
            >
              <Icon name="clock" size={15} />
              <span className="text-start">
                {t('wizard.partialWait')}
                <span className="block text-micro font-normal text-content-muted">
                  {t('wizard.partialWaitHint')}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="btn-secondary justify-start"
              onClick={() => {
                setShowPartialDialog(false)
                setStep(2)
              }}
            >
              <Icon name="users" size={15} />
              <span className="text-start">
                {t('wizard.partialReplace')}
                <span className="block text-micro font-normal text-content-muted">
                  {t('wizard.partialReplaceHint')}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="btn-primary justify-start"
              onClick={() => {
                setShowPartialDialog(false)
                setStep(4)
              }}
            >
              <Icon name="check" size={15} />
              <span className="text-start">
                {t('wizard.partialProceed')}
                <span className="block text-micro font-normal text-content-muted">
                  {t('wizard.partialProceedHint', {
                    confirmed: confirmed.length,
                  })}
                </span>
              </span>
            </button>
          </div>
        </Modal>
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
                (step === 2 && !canLeaveStep2)
              }
              onClick={() => {
                // G4.1 — "next" is ALWAYS active on the phone-round step. An
                // incomplete gauge opens a choice, not a wall.
                if (step === 3 && confirmed.length < required) {
                  setShowPartialDialog(true)
                  return
                }
                setStep((s) => (s + 1) as Step)
              }}
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
