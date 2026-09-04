import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'

import {
  addDays,
  atTimeOn,
  buildDayPlan,
  deleteTour,
  estimateDriveMinutes,
  farmRegion,
  splitDuration,
  formatTime,
  fromDayKey,
  getAgendaEvents,
  getTourForDay,
  getVisibleFarms,
  googleMapsRouteUrl,
  localDayKey,
  now,
  planRoute,
  routePolyline,
  saveTour,
  telHref,
  wazeStepLinks,
} from '@core/index'
import type { AgendaEvent, Farm, FarmStatus, RegionId } from '@core/index'

import { originLabel, originPosition } from '../../settings/origin'
import { useConfirmDelete } from '../../components/ConfirmDelete'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { FarmVisitModal } from '../../components/FarmVisitModal'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { FarmStatusDot, readStatusColor,
  entityMarkerKind, readToken } from '../../components/badges'
import { EmptyState, FilterPill, FilterRow, Section } from '../../components/primitives'
import { Avatar } from '../../components/Avatar'
import { RegionFilter } from '../../components/RegionFilter'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

const km = (v: number) => v.toFixed(1)

const EVENT_ICON: Record<AgendaEvent['kind'], IconName> = {
  mission: 'shield',
  visit: 'pin',
  meeting: 'users',
}

/** `HH:MM` (local wall clock) of an ISO instant — the time input's language. */
function toTimeInput(isoValue: string): string {
  const d = new Date(isoValue)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * C1.2 → G9 — the route planner, now the AGENDA'S working surface.
 *
 * The map and the nearest-neighbour ordering are unchanged since Lot 0.7; what
 * G9 adds is that the result is FOR a calendar day and survives navigation:
 * `?date=` parameterises the screen (the agenda's "צור מסלול ליום זה" lands
 * here), the day's fixed hours are shown and fold into the simulated drive as
 * constraints, and "שמירת המסלול" writes the Tour object the dashboard's and
 * the day view's "היום שלי" block replays.
 *
 * The "קביעת פגישות" panel closes the loop in the other direction: each stop
 * offers the farm's contact as a call and a visit pre-filled with the stop's
 * COMPUTED arrival time — plan the drive first, book the humans to it.
 */
/**
 * ★★ Y9.4 — the statuses a route is actually planned around. Not every status
 *    in the domain: a picker with eight pills is the crushed row Y7.3 exists
 *    to prevent.
 */
const PICK_STATUSES: FarmStatus[] = ['active', 'contacted', 'to_contact']

export function RoutePlannerScreen() {
  const { t } = useTranslation()
  // PO POINT 8 — a saved tour used to be deleted on the first tap.
  const del = useConfirmDelete()
  const locale = useLocale()
  const [params, setParams] = useSearchParams()

  const todayKey = localDayKey(now())
  const [dayKey, setDayKey] = useState(() => params.get('date') ?? todayKey)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(getTourForDay(params.get('date') ?? todayKey)?.farmIds ?? []),
  )
  const [departTime, setDepartTime] = useState(() => {
    const tour = getTourForDay(params.get('date') ?? todayKey)
    return tour ? toTimeInput(tour.departAt) : '08:30'
  })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [meetingFor, setMeetingFor] = useState<{
    farmId: string
    at: string
  } | null>(null)
  const [editVisitId, setEditVisitId] = useState<string | null>(null)

  const farms = useCoreValue(getVisibleFarms)
  const savedTour = useCoreValue(() => getTourForDay(dayKey))

  /** The selection follows the day: each date edits ITS tour, not a shared one. */
  const changeDay = (key: string) => {
    if (!key) return
    setDayKey(key)
    setParams({ date: key }, { replace: true })
    const tour = getTourForDay(key)
    setSelected(new Set(tour?.farmIds ?? []))
    setDepartTime(tour ? toTimeInput(tour.departAt) : '08:30')
  }

  const chosen = useMemo(
    () => farms.filter((f) => selected.has(f.id)),
    [farms, selected],
  )

  /**
   * ★★ Y9.4 (2026-09-04) — THE PICKER'S OWN FILTERS: by day, by status, by
   *    region. See the note beside the `FilterRow` below for why they NARROW
   *    rather than select.
   */
  const [pickDay, setPickDay] = useState(false)
  const [pickStatus, setPickStatus] = useState<FarmStatus | null>(null)
  const [pickRegion, setPickRegion] = useState<RegionId | null>(null)

  /** "Ce jour-là" = a visit already booked on the day being planned. */
  const isOnDay = (farm: Farm): boolean =>
    farm.nextVisitAt !== null && localDayKey(new Date(farm.nextVisitAt)) === dayKey

  const pickable = useMemo(
    () =>
      farms.filter(
        (f) =>
          (!pickDay || isOnDay(f)) &&
          (pickStatus === null || f.status === pickStatus) &&
          (pickRegion === null || farmRegion(f) === pickRegion),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [farms, pickDay, pickStatus, pickRegion, dayKey],
  )

  const pickRegionCounts = useMemo(() => {
    const out: Partial<Record<RegionId, number>> = {}
    for (const f of farms) {
      const id = farmRegion(f)
      if (id) out[id] = (out[id] ?? 0) + 1
    }
    return out
  }, [farms])

  /**
   * ★ PO RETURN 2026-09-02 — THE DAY STARTS WHERE HE SAYS IT DOES. This was
   *   `HOME_BASE`, a constant reading Jerusalem, so every distance and every
   *   arrival time on this screen was measured from a point nobody chose. It
   *   is now the הגדרות setting, with the same constant as its default.
   */
  const origin = originPosition()
  const originName = originLabel() || t('route.originName')

  const route = useMemo(
    () => planRoute(chosen, origin),
    // The origin is a stored preference, not React state: it changes only when
    // הגדרות is saved, which remounts this screen anyway. Keyed on its VALUE so
    // a returning coordinator gets the new plan rather than the cached one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen, origin.lat, origin.lng],
  )
  const line = useMemo(() => routePolyline(route), [route])
  const mapsUrl = useMemo(() => googleMapsRouteUrl(route), [route])
  const wazeSteps = useMemo(() => wazeStepLinks(route), [route])

  const departAt = useMemo(() => {
    const [h, m] = departTime.split(':').map(Number)
    return atTimeOn(fromDayKey(dayKey), h || 0, m || 0)
  }, [dayKey, departTime])

  const draftFarmIds = useMemo(
    () => route.stops.map((s) => s.farm.id),
    [route],
  )

  /**
   * The day plan over the DRAFT selection (not the saved tour): arrival times,
   * constraint folding and the meetings panel all track what is on screen.
   */
  const plan = useCoreValue(() => {
    const day = fromDayKey(dayKey)
    return buildDayPlan({
      dayKey,
      tour: { id: 'draft', dayKey, departAt, farmIds: draftFarmIds },
      farms: getVisibleFarms(),
      events: getAgendaEvents(day, addDays(day, 1)),
    })
  })

  const isSaved =
    savedTour !== null &&
    savedTour.departAt === departAt &&
    savedTour.farmIds.length === draftFarmIds.length &&
    savedTour.farmIds.every((id, i) => id === draftFarmIds[i])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const markers: MapMarker[] = useMemo(() => {
    const originMarker: MapMarker = {
      id: 'origin',
      position: origin,
      color: readToken('--accent'),
      title: originName,
      kind: 'origin',
      badge: '★',
    }

    // Unselected farms stay visible but muted, so the coordinator can see what
    // else is nearby while building the route.
    const rest = farms
      .filter((f) => !selected.has(f.id))
      .map((farm) =>
        withInteraction(
          {
            id: farm.id,
            position: farm.position,
            color: readToken('--text-muted'),
            title: farm.name,
            subtitle: farm.locality,
            kind: entityMarkerKind(farm),
          },
          { hoveredId, selectedId: null },
          { onHover: setHoveredId, onSelect: () => toggle(farm.id) },
        ),
      )

    const stops = route.stops.map((stop) =>
      withInteraction(
        {
          id: stop.farm.id,
          position: stop.farm.position,
          color: readStatusColor(stop.farm.status),
          title: `${stop.order}. ${stop.farm.name}`,
          subtitle: stop.farm.locality,
          kind: entityMarkerKind(stop.farm),
          badge: String(stop.order),
        },
        { hoveredId, selectedId: null },
        { onHover: setHoveredId, onSelect: () => toggle(stop.farm.id) },
      ),
    )

    return [originMarker, ...rest, ...stops]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, farms, selected, hoveredId, t, origin.lat, origin.lng, originName])

  const contactOf = (farm: Farm) =>
    farm.contacts.find((c) => c.isPrimary) ?? farm.contacts[0] ?? null

  /**
   * X8.4 — "3 שעות 47 דקות", never "307 דק'". The arithmetic is
   * `splitDuration` in core; the wording is the locale file's; this is the
   * one line that joins them.
   */
  const duration = (minutes: number) => {
    const { hours, minutes: mins } = splitDuration(minutes)
    if (hours === 0) return t('common.durationM', { m: mins })
    if (mins === 0) return t('common.durationH', { h: hours })
    return t('common.durationHm', { h: hours, m: mins })
  }

  return (
    <MapPanel
      screenKey="route"
      ariaLabel={t('map.routeMap')}
      markers={markers}
      line={line}
      legend={
        <p className="max-w-48 text-caption text-content-secondary">
          {t('route.liveRoute')}
        </p>
      }
    >
      <header className="mb-4">
        <h1 className="text-title text-content-primary">{t('route.title')}</h1>
        <p className="muted mt-1">{t('route.subtitle')}</p>
      </header>

      {/* G9.1 — the day this route belongs to, and its saved state. */}
      <section className="mb-4">
        <div className="card card-pad">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0">
              <span className="label">{t('route.forDay')}</span>
              <input
                type="date"
                className="input ltr-nums text-start"
                value={dayKey}
                onChange={(e) => changeDay(e.target.value)}
              />
            </label>
            <label className="min-w-0">
              <span className="label">{t('route.departAt')}</span>
              <input
                type="time"
                className="input ltr-nums text-start"
                value={departTime}
                onChange={(e) => setDepartTime(e.target.value)}
              />
            </label>
            <div className="ms-auto flex items-center gap-2">
              {savedTour && (
                <button
                  type="button"
                  className="btn-ghost text-status-danger-ink hover:bg-status-danger/10"
                  data-testid="tour-delete"
                  onClick={() =>
                    del.ask(
                      'tour',
                      savedTour.id,
                      () => {
                        deleteTour(dayKey)
                        return true
                      },
                      { after: () => setSelected(new Set()) },
                    )
                  }
                >
                  <Icon name="trash" size={14} />
                  {t('route.deleteTour')}
                </button>
              )}
              {isSaved ? (
                <span className="chip bg-status-success/15 text-status-success-ink">
                  <Icon name="check" size={12} />
                  {t('route.tourSaved')}
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={route.stops.length === 0}
                  onClick={() =>
                    saveTour({ dayKey, departAt, farmIds: draftFarmIds })
                  }
                >
                  <Icon name="calendar" size={15} />
                  {t('route.saveTour')}
                </button>
              )}
            </div>
          </div>

          {/* The day's fixed hours — the constraints the drive folds around.
              Guard missions are excluded on the same rule as the engine's:
              they are not slots in the coordinator's own day. */}
          <div className="mt-3 border-t border-edge-subtle pt-2.5">
            <p className="flex items-center gap-1.5 text-micro font-semibold text-content-secondary">
              <Icon name="clock" size={12} />
              {t('route.fixedEvents')}
            </p>
            {plan.fixedEvents.filter((e) => e.kind !== 'mission').length ===
            0 ? (
              <p className="muted mt-1">{t('route.noFixedEvents')}</p>
            ) : (
              <>
                <p className="muted mt-0.5">{t('route.fixedEventsHint')}</p>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {plan.fixedEvents
                    .filter((e) => e.kind !== 'mission')
                    .map((event) => (
                    <li
                      key={event.id}
                      className="flex items-center gap-2 rounded-field px-1.5 py-1"
                    >
                      <span className="ltr-nums numeric w-11 shrink-0 text-micro font-semibold text-content-primary">
                        {formatTime(event.at, locale)}
                      </span>
                      <Icon
                        name={EVENT_ICON[event.kind]}
                        size={12}
                        className="shrink-0 text-content-muted"
                      />
                      <span className="min-w-0 flex-1 truncate text-caption text-content-secondary">
                        {event.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>

      {/**
        * ★★ Y9.1 (2026-09-04) — THE BLOCKS STACK, ONE UNDER THE OTHER.
        *
        * "Les blocs passent les uns SOUS les autres (empilés verticalement),
        *  plus côte à côte."
        *
        * P0bis.3b put them two per row to stop the screen being "four
        * screenfuls of half-empty column". Y9.2 removes the reason: the farm
        * picker is a grid of cards that fills its width and folds away once
        * the choice is made, so the block beside it is no longer a short list
        * next to a short list. Read in a column, the planner reads as what it
        * is — choose, then read the day — instead of two things competing for
        * the same line.
        */}
      <Section
        title={t('route.selectFarms')}
        collapseKey="route-select"
        summary={t('route.selectedCount', { count: selected.size })}
        action={
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-micro font-medium text-content-muted hover:underline"
              >
                {t('common.clear')}
              </button>
            )}
          </div>
        }
      >
        {/**
          * ★★ Y9.4 (2026-09-04) — FILTERS THAT NARROW, RATHER THAN A
          *    "SELECT EVERYTHING" LINK.
          *
          * "Filtres de sélection plus intelligents : par jour, par statut, par
          *  région — pas 'tout sélectionner' par défaut."
          *
          * The block used to offer one shortcut — "the farms with a visit
          * pending" — which selects a set rather than narrowing the choice,
          * and left the coordinator scrolling a checkbox list of everything
          * else. These three pills narrow WHAT IS SHOWN; the choosing stays
          * his, one card at a time.
          */}
        <FilterRow
          nowrap
          active={pickDay || pickStatus !== null || pickRegion !== null}
          onClear={() => {
            setPickDay(false)
            setPickStatus(null)
            setPickRegion(null)
          }}
        >
          <RegionFilter
            value={pickRegion}
            onChange={setPickRegion}
            counts={pickRegionCounts}
            testId="route-region"
          />
          <FilterPill
            active={pickDay}
            onClick={() => setPickDay((v) => !v)}
            count={farms.filter((f) => isOnDay(f)).length}
          >
            {t('route.filterDay')}
          </FilterPill>
          {PICK_STATUSES.map((st) => (
            <FilterPill
              key={st}
              active={pickStatus === st}
              onClick={() => setPickStatus(pickStatus === st ? null : st)}
              dot={<FarmStatusDot status={st} />}
              count={farms.filter((f) => f.status === st).length}
            >
              {t(`farmStatus.${st}`)}
            </FilterPill>
          ))}
        </FilterRow>

        {/* ★ PO POINT 5 — the empty state carries the way OUT of it: this is
            the first screen of the real app on the first morning. */}
        {farms.length === 0 ? (
          <EmptyState
            icon="farm"
            title={t('farms.empty')}
            hint={t('route.emptyFarmsHint')}
            action={
              <Link to="/coordinator/farms/new" className="btn-primary">
                <Icon name="plus" size={15} />
                {t('farms.new')}
              </Link>
            }
          />
        ) : pickable.length === 0 ? (
          <EmptyState icon="farm" title={t('farms.empty')} />
        ) : (
          /**
           * ★★ Y9.2 — SMALL SELECTABLE CARDS, NOT CHECKBOXES.
           *
           * "remplacer les cases à cocher (trop petites au doigt) par une
           *  grille de PETITES CARTES sélectionnables (≈3 rangées × 6 colonnes
           *  sur large, s'adapte en étroit), chacune avec photo, nom, localité
           *  — tap = sélection, état visuel net."
           *
           * ⚠️ SIX COLUMNS IS A MINIMUM CARD WIDTH, NOT A COLUMN COUNT. The
           *    grid is `auto-fill` at 7.5 rem, which comes to six across the
           *    ~46 rem the planner's panel has when the seam is where he
           *    leaves it, and to two on a phone — "s'adapte en étroit"
           *    without a breakpoint that would be measuring the WINDOW while
           *    the panel is what changes.
           */
          <ul
            data-testid="route-picker"
            className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr))]"
          >
            {pickable.map((farm) => {
              const on = selected.has(farm.id)
              return (
                <li key={farm.id}>
                  <button
                    type="button"
                    onClick={() => toggle(farm.id)}
                    aria-pressed={on}
                    data-testid="route-pick"
                    onMouseEnter={() => setHoveredId(farm.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`group relative flex w-full flex-col overflow-hidden rounded-card text-start
                                transition-all duration-fast ${
                                  on
                                    ? 'ring-2 ring-accent bg-accent/10'
                                    : 'bg-surface-raised shadow-card hover:bg-surface-high'
                                }`}
                  >
                    <span className="relative block h-14 w-full overflow-hidden bg-surface-high">
                      <span className="absolute inset-0 flex items-center justify-center [&>*]:h-full [&>*]:w-full [&>*]:rounded-none [&>*]:ring-0">
                        <Avatar photo={farm.photo} name={farm.name} size="lg" shape="square" />
                      </span>
                      {/* The selected state is a mark, not only a ring: a ring
                          alone is invisible on a photograph. */}
                      {on && (
                        <span className="absolute end-1 top-1 flex h-6 w-6 items-center justify-center rounded-pill bg-accent text-content-on-accent shadow-card">
                          <Icon name="check" size={13} />
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FarmStatusDot status={farm.status} />
                        <span
                          className="truncate text-micro font-semibold text-content-primary"
                          title={farm.name}
                        >
                          {farm.name}
                        </span>
                      </span>
                      <span className="muted truncate" title={farm.locality}>
                        {farm.locality}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {/*
        ★ X8 (2026-09-04) — THE THREE BLOCKS WERE ONE BLOCK.
        =====================================================================
        "סדר הנסיעה", "קביעת פגישות" and "ניווט" each printed the same
        numbered list of the same farms in the same order — three times, one
        under the other, differing only in which two controls hung off the
        end of the row. The product owner scrolled past a screen and a half
        of repetition to reach the Google Maps link.

        ONE list now. A step is a step: its number, its farm, when he gets
        there, how far it was — and then the three things he can do about it,
        which is call the contact, book the visit, and start navigating. The
        Waze explanation drops to a note under the block, because it explains
        an icon rather than introducing a section, and the Google Maps link
        keeps the foot of the screen it has always had.
      */}
      <section className="mb-6">
        <h2 className="pb-2.5 text-section text-content-primary">
          {t('route.order')}
        </h2>
        <div className="card card-pad">
          {route.stops.length === 0 ? (
            <EmptyState icon="route" title={t('route.emptySelection')} />
          ) : (
            <>
              <ol className="flex flex-col divide-y divide-edge-subtle/60">
                {/**
                  * ★★ Y9.3 — THE LIST IS THE SCHEDULE, NOT THE SAVED ORDER.
                  *
                  * It used to render `route.stops` — the order the coordinator
                  * ticked the farms in — and pair each row with `plan.stops[i]`
                  * for its hour. Now that an appointment PINS its stop and the
                  * float is reordered around it, those two lists are different
                  * orders, and pairing them by index would print one farm's
                  * hour on another farm's row. The plan is the answer to "what
                  * is my day", so the plan is what is drawn.
                  */}
                {(plan.stops.length > 0 ? plan.stops : route.stops.map((s, i) => ({
                  ...s,
                  order: i + 1,
                  arriveAt: '',
                  fixed: false,
                  lateBy: 0,
                  visitEvent: null,
                  wazeUrl: '',
                }))).map((stop) => {
                  const planStop = plan.stops.find((ps) => ps.farm.id === stop.farm.id)
                  const contact = contactOf(stop.farm)
                  const waze = wazeSteps.find((w) => w.order === stop.order)
                  return (
                    <li
                      key={stop.farm.id}
                      data-testid="route-stop"
                      onMouseEnter={() => setHoveredId(stop.farm.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      /* X6 — `flex-wrap`: the action group drops to its own
                         line rather than pushing the row past the panel. */
                      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-field px-1.5 py-2
                                  transition-colors duration-fast ${
                                    hoveredId === stop.farm.id ? 'bg-accent/10' : ''
                                  }`}
                    >
                      <span className="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-accent text-micro font-bold text-content-on-accent">
                        {stop.order}
                      </span>

                      {/**
                        * ★★ Y9.5 (2026-09-04) — "ALIGNEMENT STRICT DES COLONNES
                        *    ET DES PILULES". The hour and the distance were
                        *    inline text in a wrapping row, so each line started
                        *    wherever the farm's name happened to end and the
                        *    column of times zig-zagged down the block. They are
                        *    TRACKS now: a fixed 3.5 rem for the hour and 4.5 rem
                        *    for the kilometres, both `tabular-nums`, so the
                        *    figures stack under each other whatever the names
                        *    do.
                        */}
                      <span className="min-w-[9rem] flex-1">
                        <span
                          className="block truncate text-caption font-medium text-content-primary"
                          title={stop.farm.name}
                        >
                          {stop.farm.name}
                        </span>
                        <span className="muted grid items-baseline gap-x-2 leading-tight [grid-template-columns:3.5rem_4.5rem_auto]">
                          {/* G9 — with a departure time every stop has an
                              expected arrival; without one, only the leg. */}
                          <span
                            className={`ltr-nums numeric font-semibold ${
                              planStop?.fixed ? 'text-status-violet-ink' : 'text-accent-ink'
                            }`}
                          >
                            {planStop ? formatTime(planStop.arriveAt, locale) : '—'}
                          </span>
                          <span className="ltr-nums">
                            {km(stop.legKm)} {t('common.km')}
                          </span>
                          {/* ★★ Y9.3 — a pinned hour says so, and an impossible
                              one says by how much. Neither is ever moved. */}
                          {planStop?.fixed && (
                            <span className="chip bg-status-violet/15 text-status-violet-ink">
                              <Icon name="clock" size={10} />
                              {t('route.fixedHour')}
                              {planStop.lateBy > 0 && (
                                <span className="ltr-nums">
                                  {t('route.lateBy', { m: planStop.lateBy })}
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-1">
                        {contact ? (
                          <a
                            href={telHref(contact.phone)}
                            title={`${t('common.call')} · ${contact.name}`}
                            aria-label={`${t('common.call')} · ${contact.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-pill bg-surface-high text-content-primary
                                       transition-all duration-fast ease-out hover:bg-gradient-accent hover:text-content-on-accent active:scale-95"
                          >
                            <Icon name="phone" size={15} />
                          </a>
                        ) : (
                          <span
                            title={t('route.noContact')}
                            className="flex h-9 w-9 items-center justify-center text-content-muted/40"
                          >
                            <Icon name="phone" size={15} />
                          </span>
                        )}

                        {planStop?.visitEvent ? (
                          <button
                            type="button"
                            onClick={() => setEditVisitId(planStop.visitEvent?.id ?? null)}
                            className="chip bg-status-violet/15 text-status-violet-ink transition-all duration-fast hover:brightness-95"
                          >
                            <Icon name="pin" size={11} />
                            {t('route.visitPlanned')}
                            <span className="ltr-nums">
                              {formatTime(planStop.visitEvent.at, locale)}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!planStop}
                            onClick={() =>
                              planStop &&
                              setMeetingFor({
                                farmId: stop.farm.id,
                                at: planStop.arriveAt,
                              })
                            }
                            className="btn-secondary py-1.5 text-micro disabled:opacity-40"
                          >
                            <Icon name="calendar" size={14} />
                            {t('route.scheduleMeeting')}
                          </button>
                        )}

                        {waze && (
                          <a
                            href={waze.url}
                            target="_blank"
                            rel="noreferrer"
                            title={t('common.openInWaze')}
                            aria-label={t('common.openInWaze')}
                            className="flex h-9 w-9 items-center justify-center rounded-pill bg-surface-high text-accent-ink
                                       transition-all duration-fast ease-out hover:bg-gradient-accent hover:text-content-on-accent active:scale-95"
                          >
                            <Icon name="navigation" size={15} />
                          </a>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ol>

              {/* ★ X8.5 — THE TOTALS ARE A TABLE, NOT TWO LOOSE PARAGRAPHS.
                  Same label scale, same figure scale, same baseline, one rule
                  above them; and the duration is hours and minutes (X8.4). */}
              <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-edge-subtle pt-3 [grid-template-columns:auto_1fr]">
                <dt className="muted self-baseline">{t('route.roundTrip')}</dt>
                <dd className="ltr-nums numeric self-baseline text-heading text-content-primary">
                  {km(route.roundTripKm)} {t('common.km')}
                </dd>
                <dt className="muted self-baseline">{t('route.estimatedDrive')}</dt>
                <dd
                  data-testid="route-drive-time"
                  className="numeric self-baseline text-heading text-content-primary"
                >
                  {duration(estimateDriveMinutes(route.roundTripKm))}
                </dd>
              </dl>
            </>
          )}
        </div>

        {route.stops.length > 0 && (
          <>
            {/* X8.2 — the Waze caveat is a footnote to the icon above, not a
                section of its own. */}
            <p className="muted mt-2 flex items-start gap-1.5">
              <Icon name="navigation" size={12} className="mt-0.5 shrink-0" />
              {t('route.wazeStepByStep')}
            </p>

            {/* X8.3 — and the whole-route hand-off stays at the foot. */}
            <a
              href={mapsUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary mt-2 w-full justify-center"
            >
              <Icon name="external" size={16} />
              {t('route.openInGoogleMaps')}
            </a>
          </>
        )}
      </section>

      {meetingFor && (
        <FarmVisitModal
          defaultFarmId={meetingFor.farmId}
          defaultAt={meetingFor.at}
          onClose={() => setMeetingFor(null)}
        />
      )}
      {editVisitId && (
        <FarmVisitModal
          visitId={editVisitId}
          onClose={() => setEditVisitId(null)}
        />
      )}
      {del.dialog}
    </MapPanel>
  )
}
