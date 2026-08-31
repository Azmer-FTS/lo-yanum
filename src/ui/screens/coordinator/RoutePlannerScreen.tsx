import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import {
  HOME_BASE,
  addDays,
  atTimeOn,
  buildDayPlan,
  deleteTour,
  estimateDriveMinutes,
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
import type { AgendaEvent, Farm } from '@core/index'

import { useConfirmDelete } from '../../components/ConfirmDelete'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { FarmVisitModal } from '../../components/FarmVisitModal'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { FarmStatusDot, readStatusColor,
  entityMarkerKind, readToken } from '../../components/badges'
import { EmptyState } from '../../components/primitives'
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

  const route = useMemo(() => planRoute(chosen, HOME_BASE), [chosen])
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
    const origin: MapMarker = {
      id: 'origin',
      position: HOME_BASE,
      color: readToken('--accent'),
      title: t('route.originName'),
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

    return [origin, ...rest, ...stops]
  }, [route, farms, selected, hoveredId, t])

  const contactOf = (farm: Farm) =>
    farm.contacts.find((c) => c.isPrimary) ?? farm.contacts[0] ?? null

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

      {/* P0bis.3b — the planner's four panels — pick the farms, read the
          order, book the meetings, hand the route to Waze — are each a short
          list. Two per row as soon as the panel can hold two, which stops the
          screen being four screenfuls of half-empty column on the one screen
          whose whole job is to be read while driving is being planned. */}
      <div className="panel-scope">
        <div className="pair-grid">
      <section className="mb-4">
        <div className="flex items-end justify-between gap-3 pb-2.5">
          <h2 className="text-section text-content-primary">
            {t('route.selectFarms')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setSelected(
                  new Set(
                    farms.filter((f) => f.nextVisitAt !== null).map((f) => f.id),
                  ),
                )
              }
              className="text-micro font-medium text-accent-ink hover:underline"
            >
              {t('route.suggestPending')}
            </button>
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
        </div>

        <div className="card p-1.5">
          <ul className="max-h-64 overflow-y-auto">
            {farms.map((farm) => (
              <li key={farm.id}>
                <label
                  onMouseEnter={() => setHoveredId(farm.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-field px-2 py-2 transition-colors duration-fast ${
                    hoveredId === farm.id ? 'bg-accent/10' : 'hover:bg-surface-high'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(farm.id)}
                    onChange={() => toggle(farm.id)}
                    className="check"
                  />
                  <FarmStatusDot status={farm.status} />
                  <span className="min-w-0 flex-1 truncate text-caption text-content-primary">
                    {farm.name}
                  </span>
                  <span className="muted shrink-0 truncate">{farm.locality}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mb-4">
        <h2 className="pb-2.5 text-section text-content-primary">
          {t('route.order')}
        </h2>
        <div className="card card-pad">
          {route.stops.length === 0 ? (
            <EmptyState icon="route" title={t('route.emptySelection')} />
          ) : (
            <>
              <ol className="flex flex-col">
                {route.stops.map((stop, i) => {
                  const planStop = plan.stops[i]
                  return (
                    <li
                      key={stop.farm.id}
                      onMouseEnter={() => setHoveredId(stop.farm.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`flex items-center gap-2.5 rounded-field px-1.5 py-1.5 transition-colors duration-fast ${
                        hoveredId === stop.farm.id ? 'bg-accent/10' : ''
                      }`}
                    >
                      <span className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-accent text-micro font-bold text-content-on-accent">
                        {stop.order}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-caption text-content-primary">
                        {stop.farm.name}
                      </span>
                      {/* G9 — when the drive is simulated from a departure
                          time, every stop has an expected arrival. */}
                      {planStop && (
                        <span className="ltr-nums numeric shrink-0 text-micro font-semibold text-accent-ink">
                          {formatTime(planStop.arriveAt, locale)}
                        </span>
                      )}
                      <span className="ltr-nums shrink-0 text-micro text-content-muted">
                        {km(stop.legKm)} {t('common.km')}
                      </span>
                    </li>
                  )
                })}
              </ol>

              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-edge-subtle pt-3">
                <div>
                  <dt className="muted">{t('route.roundTrip')}</dt>
                  <dd className="ltr-nums numeric text-heading text-content-primary">
                    {km(route.roundTripKm)} {t('common.km')}
                  </dd>
                </div>
                <div>
                  <dt className="muted">{t('route.estimatedDrive')}</dt>
                  <dd className="ltr-nums numeric text-heading text-content-primary">
                    {estimateDriveMinutes(route.roundTripKm)}{' '}
                    {t('common.minutesShort')}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      </section>

      {/* G9.2 — "קביעת פגישות": book the day's humans against the computed
          drive. One row per stop: call the farm's contact, or open a visit
          pre-filled with THIS stop's expected arrival on THIS date. */}
      {plan.stops.length > 0 && (
        <section className="mb-4">
          <h2 className="pb-1 text-section text-content-primary">
            {t('route.meetingsPanel')}
          </h2>
          <p className="muted pb-2.5">{t('route.meetingsPanelHint')}</p>
          <div className="card card-pad">
            <ul className="flex flex-col">
              {plan.stops.map((stop) => {
                const contact = contactOf(stop.farm)
                return (
                  <li
                    key={stop.farm.id}
                    className="flex flex-wrap items-center gap-2 rounded-field px-1.5 py-2"
                  >
                    <span className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-accent text-micro font-bold text-content-on-accent">
                      {stop.order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-caption font-medium text-content-primary">
                        {stop.farm.name}
                      </span>
                      <span className="muted ltr-nums block">
                        {t('route.arriveAt')} ·{' '}
                        {formatTime(stop.arriveAt, locale)}
                      </span>
                    </span>
                    {contact ? (
                      <a
                        href={telHref(contact.phone)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-surface-high px-3 py-1.5
                                   text-micro font-semibold text-content-primary transition-all duration-fast ease-out
                                   hover:bg-gradient-accent hover:text-content-on-accent active:scale-95"
                      >
                        <Icon name="phone" size={13} />
                        <span className="max-w-28 truncate">{contact.name}</span>
                      </a>
                    ) : (
                      <span className="muted shrink-0">
                        {t('route.noContact')}
                      </span>
                    )}
                    {stop.visitEvent ? (
                      <button
                        type="button"
                        onClick={() =>
                          setEditVisitId(stop.visitEvent?.id ?? null)
                        }
                        className="chip shrink-0 bg-status-violet/15 text-status-violet-ink transition-all duration-fast hover:brightness-95"
                      >
                        <Icon name="pin" size={11} />
                        {t('route.visitPlanned')}
                        <span className="ltr-nums">
                          {formatTime(stop.visitEvent.at, locale)}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setMeetingFor({
                            farmId: stop.farm.id,
                            at: stop.arriveAt,
                          })
                        }
                        className="btn-secondary shrink-0"
                      >
                        <Icon name="calendar" size={14} />
                        {t('route.scheduleMeeting')}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      {/* D7.2 — NAVIGATION HAND-OFF, ASYMMETRIC ON PURPOSE.
          The two apps are not two equivalent buttons, because they do not offer
          the same thing: Google Maps takes the whole route in ONE link, Waze
          needs one link per stop. Presenting them as a matched pair of buttons
          implied a parity that does not exist and hid the step list underneath.
          Now Waze is a single titled block holding its numbered list, and the
          Google Maps action sits beside that block as one line. */}
      {route.stops.length > 0 && (
        <section className="mb-6">
          <h2 className="pb-2.5 text-section text-content-primary">
            {t('common.navigate')}
          </h2>

          <div className="card card-pad">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-field bg-accent/15 text-accent-ink">
                <Icon name="pin" size={15} />
              </span>
              <p className="text-caption font-semibold text-content-primary">
                {t('route.wazeBlockTitle')}
              </p>
            </div>
            <p className="muted mb-2.5">{t('route.wazeStepByStep')}</p>

            <ol className="flex flex-col gap-1">
              {wazeSteps.map((step) => (
                <li key={step.order}>
                  <a
                    href={step.url}
                    target="_blank"
                    rel="noreferrer"
                    onMouseEnter={() =>
                      setHoveredId(route.stops[step.order - 1]?.farm.id ?? null)
                    }
                    onMouseLeave={() => setHoveredId(null)}
                    className="flex items-center gap-2.5 rounded-field px-2 py-1.5
                               transition-all duration-fast hover:bg-surface-high"
                  >
                    <span className="numeric flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-gradient-accent text-micro font-bold text-content-on-accent">
                      {step.order}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-caption text-content-primary">
                      {step.farmName}
                    </span>
                    <Icon
                      name="external"
                      size={13}
                      className="shrink-0 text-content-muted"
                    />
                  </a>
                </li>
              ))}
            </ol>
          </div>

          <a
            href={mapsUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary mt-2 w-full justify-center"
          >
            <Icon name="external" size={16} />
            {t('route.openInGoogleMaps')}
          </a>
        </section>
      )}
        </div>
      </div>

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
