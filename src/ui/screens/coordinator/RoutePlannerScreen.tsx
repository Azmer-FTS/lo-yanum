import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { formRoutes } from './FormPages'

import {
  addDays,
  atTimeOn,
  buildDayPlan,
  estimateDriveMinutes,
  farmRegion,
  splitDuration,
  formatTime,
  fromDayKey,
  getAgendaEvents,
  getTourForDay,
  getTours,
  deleteTourById,
  renameTour,
  getVisibleFarms,
  googleMapsRouteUrl,
  localDayKey,
  now,
  planRoute,
  saveTour,
  telHref,
  wazeStepLinks,
} from '@core/index'
import type { AgendaEvent, Farm, FarmStatus, RegionId, Tour } from '@core/index'

import { originLabel, originPosition } from '../../settings/origin'
import { useConfirmDelete } from '../../components/ConfirmDelete'
import { TitleWithInfo } from '../../components/InfoTip'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { useRoadRoute } from '../../routing/useRoadRoute'
import { useRouteMargin } from '../../settings/routeMargin'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { FarmStatusDot, readStatusColor,
  entityMarkerKind, readToken } from '../../components/badges'
import {
  EmptyState,
  FilterPill,
  FilterRow,
  Section,
  writeBlockOpen,
} from '../../components/primitives'
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
  /* ★★ AX8 — la tournée ouverte : `?tour=` (depuis la liste), sinon la
     première du jour demandé (`?date=`, depuis l'agenda), sinon une neuve. */
  const [initialTour] = useState(() => {
    const id = params.get('tour')
    if (id) return getTours().find((x) => x.id === id) ?? null
    return getTourForDay(params.get('date') ?? todayKey)
  })
  const [editingId, setEditingId] = useState<string | null>(initialTour?.id ?? null)
  const [tourName, setTourName] = useState(initialTour?.name ?? '')
  const [dayKey, setDayKey] = useState(() => initialTour?.dayKey ?? params.get('date') ?? todayKey)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialTour?.farmIds ?? []))
  const [departTime, setDepartTime] = useState(() => (initialTour ? toTimeInput(initialTour.departAt) : '08:30'))
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  /* ★ AN11 — le rendez-vous s'ouvre en PAGE (FormPages.tsx). */
  const navigateTo = useNavigate()
  const setMeetingFor = (m: { farmId: string; at: string } | null) =>
    m && navigateTo(formRoutes.newVisit({ farm: m.farmId, at: m.at }))
  const setEditVisitId = (id: string | null) => id && navigateTo(formRoutes.editVisit(id))

  /**
   * ★★ AB1.1 · AB1.2 — `?new=step`: מסלול CREATES A STOP, NOT A FARM.
   *
   * The old menu offered « חווה חדשה » here, on the reading that a planner
   * without farms needs farms. It is the wrong answer to « je suis sur le
   * planificateur et je veux ajouter une étape »: a stop is a farm ALREADY IN
   * THE PROGRAMME being put on today's drive, and the block that does that is
   * « בחירת חוות », one screen down and — because U1 remembers a fold for
   * ever — quite possibly closed.
   *
   * ⚠️ SO THE PARAMETER FORCES IT OPEN AND REMOUNTS IT. `Section` reads its
   *    remembered state ONCE, at mount; writing the flag without the remount
   *    would store "open" and leave a shut block on screen until the next
   *    navigation. The counter in the `key` is what makes the fold obey now.
   */
  const [pickerNonce, setPickerNonce] = useState(0)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (params.get('new') !== 'step') return
    writeBlockOpen('route-select', true)
    setPickerNonce((n) => n + 1)
    const next = new URLSearchParams(params)
    next.delete('new')
    setParams(next, { replace: true })
    // One frame, so the reopened block has a box to scroll to.
    requestAnimationFrame(() =>
      pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }, [params, setParams])

  const farms = useCoreValue(getVisibleFarms)
  const allTours = useCoreValue(getTours)
  const savedTour = editingId ? (allTours.find((x) => x.id === editingId) ?? null) : null

  /**
   * ★★ AX8 — CHANGER LA DATE NE CHARGE PLUS « LA » TOURNÉE DU JOUR : elle
   * déplace la tournée ouverte. C'était là que tout se perdait — une date
   * touchée remplaçait la sélection par celle du jour, et un « שמירה » écrasait.
   */
  const changeDay = (key: string) => {
    if (!key) return
    setDayKey(key)
  }
  const openTour = (tour: Tour) => {
    setEditingId(tour.id)
    setTourName(tour.name ?? '')
    setDayKey(tour.dayKey)
    setSelected(new Set(tour.farmIds))
    setDepartTime(toTimeInput(tour.departAt))
    setParams({ tour: tour.id }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const newTour = () => {
    setEditingId(null)
    setTourName('')
    setSelected(new Set())
    setParams({ date: dayKey }, { replace: true })
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
  /* ★★ AN3 — le trajet du planificateur suit la ROUTE, comme l'itinéraire
     libre (il traçait `routePolyline`, un trait droit de ferme en ferme). */
  const roadPoints = useMemo(
    () => (route.stops.length === 0 ? [] : [route.origin, ...route.stops.map((s) => s.farm.position), route.origin]),
    [route],
  )
  const road = useRoadRoute(roadPoints)
  const margin = useRouteMargin()
  const mapsUrl = useMemo(() => googleMapsRouteUrl(route), [route])
  const wazeSteps = useMemo(() => wazeStepLinks(route), [route])

  const departAt = useMemo(() => {
    const [h, m] = departTime.split(':').map(Number)
    return atTimeOn(fromDayKey(dayKey), h || 0, m || 0)
  }, [dayKey, departTime])

  /* ★ AN2 — une ferme sans position reste DANS la tournée enregistrée, après
     les étapes placées : elle est choisie, elle n'est simplement pas tracée. */
  const draftFarmIds = useMemo(
    () => [...route.stops.map((s) => s.farm.id), ...route.unplaced.map((f) => f.id)],
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
      tour: { id: 'draft', name: '', dayKey, departAt, farmIds: draftFarmIds },
      farms: getVisibleFarms(),
      events: getAgendaEvents(day, addDays(day, 1)),
    })
  })

  const isSaved =
    savedTour !== null &&
    savedTour.departAt === departAt &&
    savedTour.dayKey === dayKey &&
    (savedTour.name ?? '') === tourName.trim() &&
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
      // ★ AN2 — une ferme sans position n'a pas de repère (jamais le point de repli).
      .filter((f) => !selected.has(f.id) && !f.positionMissing)
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
      routeLines={road.routeLines}
      legend={
        <p className="max-w-48 text-caption text-content-secondary">
          {t('route.liveRoute')}
        </p>
      }
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <TitleWithInfo as="span" info={t('route.subtitle')} className="text-title text-content-primary">
            <h1>{t('route.title')}</h1>
          </TitleWithInfo>
        </div>
        {/* ★★ AH9 — LA PORTE DE L'ITINÉRAIRE LIBRE, ICI ET NULLE PART AILLEURS.
            C'est la même question — « dans quel ordre je roule demain » — et
            un écran qu'on atteint depuis le menu principal serait un second
            planificateur ; posé ici, il est l'autre réponse à la question
            qu'on est déjà en train de se poser. */}
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link to="/coordinator/route/free" className="btn-secondary shrink-0" data-testid="open-free-route">
            <Icon name="pin" size={16} />
            {t('freeRoute.title')}
          </Link>
          {/* ★★ AU4.8 — la carte de couverture : « où aller cette saison ». */}
          <Link to="/coordinator/coverage" className="btn-secondary shrink-0" data-testid="open-coverage">
            <Icon name="map" size={16} />
            {t('coverage.title')}
          </Link>
        </div>
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
            {/* ★★ AX8 — le nom : on retrouve une tournée par lui. */}
            <label className="min-w-[10rem] flex-1">
              <span className="label">{t('route.tourName')}</span>
              <input
                className="input"
                value={tourName}
                placeholder={t('route.tourNamePlaceholder')}
                onChange={(e) => setTourName(e.target.value)}
                data-testid="tour-name"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="tour-actions" data-editing={editingId ?? ''} data-saved={isSaved ? 'true' : 'false'}>
            {isSaved ? (
              <span className="chip bg-status-success/15 text-status-success-ink" data-testid="tour-saved-chip">
                <Icon name="check" size={12} />
                {t('route.tourSaved')}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={draftFarmIds.length === 0}
                  data-testid="tour-save"
                  onClick={() => {
                    const saved = saveTour({ id: savedTour?.id, name: tourName.trim(), dayKey, departAt, farmIds: draftFarmIds })
                    setEditingId(saved.id)
                    setParams({ tour: saved.id }, { replace: true })
                  }}
                >
                  <Icon name="calendar" size={15} />
                  {savedTour ? t('route.saveChanges') : t('route.saveTour')}
                </button>
                {savedTour && draftFarmIds.length > 0 && (
                  /* ★★ AX8 — l'autre geste qu'on croyait faire : une SECONDE tournée. */
                  <button
                    type="button"
                    className="btn-secondary"
                    data-testid="tour-save-as-new"
                    onClick={() => {
                      const saved = saveTour({ name: tourName.trim() || t('route.copyName', { name: savedTour.name || dayKey }), dayKey, departAt, farmIds: draftFarmIds })
                      setEditingId(saved.id)
                      setTourName(saved.name ?? '')
                      setParams({ tour: saved.id }, { replace: true })
                    }}
                  >
                    <Icon name="plus" size={15} />
                    {t('route.saveAsNew')}
                  </button>
                )}
                {savedTour && <span className="text-micro font-semibold text-status-warn-ink" data-testid="tour-dirty">{t('route.unsaved')}</span>}
              </>
            )}
            <span className="ms-auto flex items-center gap-2">
              {(savedTour || selected.size > 0) && (
                <button type="button" className="btn-ghost" onClick={newTour} data-testid="tour-new">
                  <Icon name="plus" size={14} />
                  {t('route.newTour')}
                </button>
              )}
              {savedTour && (
                <button
                  type="button"
                  className="btn-ghost text-status-danger-ink hover:bg-status-danger/10"
                  data-testid="tour-delete"
                  onClick={() => del.ask('tour', savedTour.id, () => deleteTourById(savedTour.id), { after: newTour })}
                >
                  <Icon name="trash" size={14} />
                  {t('route.deleteTour')}
                </button>
              )}
            </span>
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
      {/* ★★ AX8 — LES TOURNÉES ENREGISTRÉES SE RETROUVENT : elles sont ici,
          toutes, avec leur nom et leur jour ; on les ouvre, les renomme, les
          supprime. Décocher des fermes ne touche à aucune d'elles. */}
      {allTours.length > 0 && (
        <Section title={t('route.savedTours', { count: allTours.length })} collapseKey="route-saved" className="mb-4">
          <ul className="flex flex-col gap-1.5" data-testid="tour-list">
            {allTours.map((tour) => (
              <SavedTourRow
                key={tour.id}
                tour={tour}
                current={tour.id === editingId}
                onOpen={() => openTour(tour)}
                onRename={(name) => {
                  renameTour(tour.id, name)
                  if (tour.id === editingId) setTourName(name.trim())
                }}
                onDelete={() => del.ask('tour', tour.id, () => deleteTourById(tour.id), { after: () => tour.id === editingId && newTour() })}
              />
            ))}
          </ul>
        </Section>
      )}

      <div ref={pickerRef} data-testid="route-step-picker">
      <Section
        key={`route-select-${pickerNonce}`}
        title={t('route.selectFarms')}
        collapseKey="route-select"
        summary={t('route.selectedCount', { count: selected.size })}
        action={
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                /* AL5 — un mot de 21 × 16 px était une cible de 21 × 16 px.
                   Le texte ne change pas ; la boîte atteint 44. */
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-micro font-medium text-content-muted hover:underline"
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
        {/* Z1/Z2 — the row and the grid under it are two blocks, and the
            room between them is the app's one rhythm. */}
        <div className="filters-gap">
        <FilterRow
          activeCount={
            (pickDay ? 1 : 0) +
            (pickStatus !== null ? 1 : 0) +
            (pickRegion !== null ? 1 : 0)
          }
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
        </div>

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
          /**
           * ★★ Z2 (2026-09-07) — "C'EST LA CATASTROPHE, SUPER COLLE EN BAS."
           *
           * The product owner's worst screen, and the three complaints are
           * three numbers, all of them measured on his own device:
           *
           *   · the filters sat on the grid — 4 px, and the fix is Z1's
           *     `.filters-gap` wrapper above;
           *   · "les fermes sont tres collees les unes aux autres" — the
           *     gutter was **6 px** (`gap-1.5`) between cards 121 px wide on
           *     the iPad and 131 px in full screen. Six pixels between two
           *     photographs is not a gutter, it is a seam;
           *   · "le nom et le lieu ne touchent pas les bords" — the label
           *     block carried 8 px at the sides and 6 px top and bottom, and
           *     the locality line is the one that rides the edge.
           *
           * ★ AND THE MINIMUM CARD GREW WITH THE GUTTER, WHICH IS Z2.4.
           *   "En plein ecran, la grille s'elargit au lieu de se tasser: plus
           *   de colonnes, pas des vignettes plus serrees." `auto-fill` adds a
           *   column the instant another minimum fits, so a 7.5 rem minimum
           *   pinned every card at 121–131 px however wide the panel got —
           *   nine columns of the smallest card the rule allows. At 8.5 rem
           *   with a 12 px gutter the same 1224 px panel draws eight columns
           *   of 141 px: fewer, larger, and still more than the four a split
           *   panel gets.
           */
          <ul
            data-testid="route-picker"
            className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr))]"
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
                    <span data-pick-label="" className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
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
                      {/* ★ AN2 — sélectionnable, et signalée. */}
                      {farm.positionMissing && (
                        <span className="chip self-start bg-status-warn/15 text-status-warn-ink" data-testid="route-pick-missing">
                          <Icon name="pin" size={10} />
                          {t('route.missingPosition')}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
      </div>

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
          {route.unplaced.length > 0 && (
            /* ★ AN2 — choisies, hors du tracé : dites en tête du bloc. */
            <ul className="mb-3 flex flex-col gap-1.5" data-testid="route-unplaced">
              {route.unplaced.map((farm) => (
                <li key={farm.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-field bg-status-warn/10 px-2.5 py-2" data-testid="route-unplaced-farm">
                  <Icon name="pin" size={14} className="text-status-warn-ink" />
                  {/* Le nom sur sa ligne : dans une colonne étroite, la pastille et le
                      bouton le réduisaient à une lettre (vu sur capture du déployé). */}
                  <span className="min-w-[8rem] flex-1 text-caption font-medium text-content-primary" data-testid="route-unplaced-name">{farm.name}</span>
                  <span className="chip bg-status-warn/15 text-status-warn-ink">{t('route.missingPosition')}</span>
                  <Link to={`/coordinator/farms/${farm.id}/edit`} className="btn-ghost py-1 text-micro">
                    {t('route.addPosition')}
                  </Link>
                </li>
              ))}
              <li className="muted text-micro">{t('route.missingPositionHint')}</li>
            </ul>
          )}
          {route.stops.length === 0 ? (
            <EmptyState icon="route" title={t('route.emptySelection')} />
          ) : (
            <>
              <ol className="line-scope flex flex-col divide-y divide-edge-subtle/60" data-testid="route-stops">
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
                  /* ★★ AX6 — la distance ET la durée de l'étape, par la ROUTE
                     quand le tracé est là (marge comprise), sinon l'estimation. */
                  const legIdx = route.stops.findIndex((r) => r.farm.id === stop.farm.id)
                  const leg = legIdx >= 0 ? road.legs[legIdx] : null
                  const legKm = leg ? leg.meters / 1000 : stop.legKm
                  const legMin = leg ? Math.max(1, Math.round((leg.seconds / 60) * (1 + margin / 100))) : estimateDriveMinutes(stop.legKm)
                  return (
                    <li
                      key={stop.farm.id}
                      data-testid="route-stop"
                      onMouseEnter={() => setHoveredId(stop.farm.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      /* ★★ AX6 — UNE ligne : n° · nom · heure · km · durée · gestes.
                         Pliée en deux seulement dans un panneau étroit (`.line-row`). */
                      className={`line-row rounded-field px-1.5 py-2
                                  transition-colors duration-fast ${
                                    hoveredId === stop.farm.id ? 'bg-accent/10' : ''
                                  }`}
                    >
                      <span data-area="lead" className="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-accent text-micro font-bold text-content-on-accent">
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
                        <span
                          data-area="name"
                          className="block truncate text-caption font-medium text-content-primary"
                          title={stop.farm.name}
                        >
                          {stop.farm.name}
                        </span>
                        <span data-area="meta" className="muted line-figs leading-tight" data-testid="route-stop-figs">
                          {/* G9 — with a departure time every stop has an
                              expected arrival; without one, only the leg. */}
                          <span
                            data-fig="time"
                            className={`ltr-nums numeric font-semibold ${
                              planStop?.fixed ? 'text-status-violet-ink' : 'text-accent-ink'
                            }`}
                          >
                            {planStop ? formatTime(planStop.arriveAt, locale) : '—'}
                          </span>
                          <span data-fig="km" className="ltr-nums" style={{ ['--fig-w' as string]: '3.5rem' }}>
                            {km(legKm)} {t('common.km')}
                          </span>
                          <span data-fig="min" className="ltr-nums" style={{ ['--fig-w' as string]: '3.5rem' }}>
                            {t('common.durationM', { m: legMin })}
                          </span>
                        </span>

                      <span data-area="act" className="flex shrink-0 items-center gap-1">
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
              {/* ★★ AX6 — les deux totaux sur UNE ligne, côte à côte. */}
              <dl className="mt-3 flex flex-nowrap items-baseline gap-x-2 overflow-hidden whitespace-nowrap border-t border-edge-subtle pt-3" data-testid="route-totals">
                <dt className="muted">{t('route.roundTrip')}</dt>
                <dd className="ltr-nums numeric me-3 text-body font-semibold text-content-primary">
                  {km(route.roundTripKm)} {t('common.km')}
                </dd>
                <dt className="muted">{t('route.estimatedDrive')}</dt>
                <dd
                  data-testid="route-drive-time"
                  className="numeric text-body font-semibold text-content-primary"
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

      {del.dialog}
    </MapPanel>
  )
}

/** ★★ AX8 — une tournée enregistrée, sur UNE ligne : nom · jour · étapes · gestes. */
function SavedTourRow({ tour, current, onOpen, onRename, onDelete }: { tour: Tour; current: boolean; onOpen: () => void; onRename: (name: string) => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tour.name ?? '')
  const [y, m, d] = tour.dayKey.split('-')
  return (
    <li
      className={`flex flex-nowrap items-center gap-2 rounded-field border px-3 py-1.5 ${current ? 'border-accent bg-accent/10' : 'border-edge-subtle'}`}
      data-testid={`tour-row-${tour.id}`}
      data-tour-name={tour.name ?? ''}
    >
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onRename(draft)
            setEditing(false)
          }}
        >
          <input className="input min-h-[2.5rem] min-w-0 flex-1 py-1" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} data-testid={`tour-rename-input-${tour.id}`} />
          <button type="submit" className="btn-primary min-h-[2.5rem] px-3 py-1" data-testid={`tour-rename-ok-${tour.id}`}>
            <Icon name="check" size={14} />
          </button>
        </form>
      ) : (
        <button type="button" onClick={onOpen} className="flex min-h-11 min-w-0 flex-1 flex-nowrap items-center gap-3 text-start" data-testid={`tour-open-${tour.id}`}>
          <span className="min-w-0 flex-1 truncate font-semibold text-content-primary">{tour.name || t('route.unnamed')}</span>
          <span className="ltr-nums shrink-0 text-caption text-content-secondary">{`${d}.${m}.${y}`}</span>
          <span className="shrink-0 whitespace-nowrap text-caption text-content-muted">{t('route.stopsCount', { count: tour.farmIds.length })}</span>
        </button>
      )}
      {!editing && (
        <button type="button" className="btn-ghost h-10 w-10 shrink-0 justify-center p-0" aria-label={t('route.rename')} title={t('route.rename')} onClick={() => { setDraft(tour.name ?? ''); setEditing(true) }} data-testid={`tour-rename-${tour.id}`}>
          <Icon name="edit" size={15} />
        </button>
      )}
      <button type="button" className="btn-ghost h-10 w-10 shrink-0 justify-center p-0 text-status-danger-ink" aria-label={t('route.deleteTour')} title={t('route.deleteTour')} onClick={onDelete} data-testid={`tour-row-delete-${tour.id}`}>
        <Icon name="trash" size={15} />
      </button>
    </li>
  )
}
