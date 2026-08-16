import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  COORDINATOR,
  atTimeOn,
  buildInvitationMessage,
  buildKosherMessage,
  buildSmartphoneMessage,
  createMission,
  formatDate,
  formatTime,
  fromDayKey,
  getAnchorPointsForFarm,
  getVisibleFarms,
  getVisibleMissions,
  getDrivers,
  getVolunteers,
  localDayKey,
  now,
  rankCandidates,
  rankDrivers,
  shortlistSize,
  smsHref,
  telHref,
  whatsappHref,
} from '@core/index'
import type {
  CandidateScore,
  DriverScore,
  SolicitationState,
  Volunteer,
} from '@core/index'

import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { PhoneTypeChip, readToken } from '../../components/badges'
import { SelectField, TextField } from '../../components/fields'
import { CopyButton, EmptyState, Section } from '../../components/primitives'
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
 * All solicitation state is local to this component on purpose. Until the guard
 * is created, nothing about it belongs in the store: a coordinator who backs out
 * halfway through should leave no trace behind.
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
    <li className="rounded-md border border-edge-subtle bg-surface-raised p-3 transition-all duration-fast hover:border-edge-strong">
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
  const [anchorId, setAnchorId] = useState('')
  const [dayKey, setDayKey] = useState(
    params.get('date') ?? localDayKey(now()),
  )
  const [startHour, setStartHour] = useState('21:00')
  const [endHour, setEndHour] = useState('05:00')
  const [required, setRequired] = useState(2)

  const farm = farms.find((f) => f.id === farmId) ?? null
  // Falling back to the farm's first anchor keeps step 1 answerable with two
  // clicks on the common path, while still letting it be changed.
  const anchor =
    anchors.find((a) => a.id === anchorId) ?? anchors[0] ?? null

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
  const confirmed = shortlisted.filter(
    (v) => responses[v.id] === 'confirmed',
  )
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
      startAt,
      endAt,
      volunteerIds: confirmed.map((v) => v.id),
      driverId: driverState === 'confirmed' ? driverId : null,
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
    }
    return {
      smartphone: buildSmartphoneMessage(input, labels),
      kosher: buildKosherMessage(input, labels),
    }
  }, [
    farm,
    anchor,
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

      <header className="mb-5">
        <h1 className="text-title text-content-primary">
          {t('wizard.title')}
        </h1>
        <p className="muted mt-1">{t('wizard.subtitle')}</p>
      </header>

      {/* Stepper. Below `sm` only the current label is spelled out — five
          Hebrew labels on a 390 px row is unreadable at any font size. */}
      <ol className="mb-5 flex items-center gap-1 overflow-x-auto pb-1">
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
      {step === 1 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Section title={t('wizard.stepWhat')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label={t('missions.farm')}
                  value={farmId}
                  onChange={(v) => {
                    setFarmId(v)
                    setAnchorId('')
                  }}
                  required
                  options={farms.map((f) => ({
                    value: f.id,
                    label: `${f.name} · ${f.locality}`,
                  }))}
                />
                <SelectField
                  label={t('missions.anchorPoint')}
                  value={anchor?.id ?? ''}
                  onChange={setAnchorId}
                  required
                  hint={anchors.length === 0 ? t('farms.noAnchorPoints') : undefined}
                  options={anchors.map((a) => ({ value: a.id, label: a.name }))}
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
                <div className="grid grid-cols-2 gap-3">
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
                <TextField
                  label={t('wizard.required')}
                  type="number"
                  ltr
                  value={String(required)}
                  onChange={(v) =>
                    setRequired(Math.max(1, Math.min(12, Number(v) || 1)))
                  }
                  hint={t('wizard.requiredHint', { count: shortlistSize(required) })}
                />
              </div>
            </Section>
          </div>

          <Section title={t('map.title')} padded={false}>
            {destination ? (
              <MapView
                ariaLabel={t('a11y.map')}
                className="h-64 w-full lg:h-80"
                interactive={false}
                center={destination}
                zoom={11}
                markers={[
                  {
                    id: 'target',
                    position: destination,
                    color: readToken('--accent'),
                    title: anchor?.name ?? farm?.name ?? '',
                    emphasis: true,
                  },
                ]}
              />
            ) : (
              <div className="p-4">
                <EmptyState icon="pin" title={t('farms.noAnchorPoints')} />
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ---------------------------------------------------------------- 2 */}
      {step === 2 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Section
              title={t('wizard.stepProposal')}
              padded={false}
              action={
                <button type="button" className="btn-ghost py-1.5" onClick={autoFill}>
                  <Icon name="sparkle" size={14} />
                  {t('wizard.autoFill')}
                </button>
              }
            >
              <p className="muted px-4 pt-4">{t('wizard.proposalHint')}</p>
              {ranking.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon="users" title={t('volunteers.empty')} />
                </div>
              ) : (
                <ul className="stagger flex flex-col gap-2 p-3">
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

          <Section title={t('wizard.shortlist')}>
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
                    className="flex items-center gap-2 rounded-md bg-surface-high px-2 py-1.5"
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
                      className="rounded-sm p-1 text-content-muted hover:text-status-danger-ink"
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
          <Section title={t('wizard.stepSolicit')} padded={false}>
            <p className="muted px-4 pt-4">{t('wizard.solicitHint')}</p>
            <ul className="stagger flex flex-col gap-2 p-3">
              {shortlisted.map((volunteer) => {
                const candidate =
                  ranking.find((c) => c.volunteer.id === volunteer.id) ?? null
                const state = responses[volunteer.id] ?? 'idle'
                const message = invitationFor(volunteer)

                return (
                  <li
                    key={volunteer.id}
                    className={`rounded-md border p-3 transition-all duration-fast ${
                      state === 'confirmed'
                        ? 'border-status-success/50 bg-status-success/5'
                        : 'border-edge-subtle bg-surface-raised'
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
                            {state === 'pending' && <span className="live-dot" />}
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
                            onClick={() => setResponse(volunteer.id, 'confirmed')}
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
              <p className="muted border-t border-edge-subtle px-4 py-3">
                {t('wizard.declinedCount', { count: declined.length })}
              </p>
            )}
          </Section>
        </>
      )}

      {/* ---------------------------------------------------------------- 4 */}
      {step === 4 && (
        <Section title={t('wizard.stepDriver')} padded={false}>
          <p className="muted px-4 pt-4">{t('wizard.driverHint')}</p>
          <ul className="stagger flex flex-col gap-2 p-3">
            {driverRanking.map(({ driver, distanceKm, tooFewSeats }) => {
              const chosen = driverId === driver.id
              return (
                <li
                  key={driver.id}
                  className={`rounded-md border p-3 ${
                    chosen && driverState === 'confirmed'
                      ? 'border-status-success/50 bg-status-success/5'
                      : 'border-edge-subtle bg-surface-raised'
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
          <p className="muted border-t border-edge-subtle px-4 py-3">
            {t('wizard.driverOptional')}
          </p>
        </Section>
      )}

      {/* ---------------------------------------------------------------- 5 */}
      {step === 5 && farm && anchor && (
        <div className="grid gap-4 lg:grid-cols-3">
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
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-sunken p-3 text-micro text-content-secondary">
                    {recap.smartphone}
                  </pre>
                </Section>
                <Section
                  title={t('anchor.kosherMessage')}
                  action={<CopyButton value={recap.kosher} />}
                >
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-sunken p-3 text-micro text-content-secondary">
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
            <button type="button" className="btn-primary" onClick={finish}>
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
  const pct = Math.min(100, Math.round((confirmed / Math.max(1, required)) * 100))

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
