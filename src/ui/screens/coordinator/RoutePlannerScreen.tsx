import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  HOME_BASE,
  estimateDriveMinutes,
  getVisibleFarms,
  googleMapsRouteUrl,
  planRoute,
  routePolyline,
  wazeStepLinks,
} from '@core/index'

import { Icon } from '../../components/Icon'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { FarmStatusDot, readStatusColor, readToken } from '../../components/badges'
import { EmptyState } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

const km = (v: number) => v.toFixed(1)

/**
 * C1.2 — route planner, map-first with a LIVE trace.
 *
 * Ticking a farm redraws the polyline immediately: origin → ordered stops →
 * back to Jerusalem, with the step number rendered inside each marker. The
 * ordering itself is nearest-neighbour and lives in @core/routing.
 */
export function RoutePlannerScreen() {
  const { t } = useTranslation()
  const farms = useCoreValue(getVisibleFarms)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const chosen = useMemo(
    () => farms.filter((f) => selected.has(f.id)),
    [farms, selected],
  )

  const route = useMemo(() => planRoute(chosen, HOME_BASE), [chosen])
  const line = useMemo(() => routePolyline(route), [route])
  const mapsUrl = useMemo(() => googleMapsRouteUrl(route), [route])
  const wazeSteps = useMemo(() => wazeStepLinks(route), [route])

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
            kind: 'farm',
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
          kind: 'farm',
          badge: String(stop.order),
        },
        { hoveredId, selectedId: null },
        { onHover: setHoveredId, onSelect: () => toggle(stop.farm.id) },
      ),
    )

    return [origin, ...rest, ...stops]
  }, [route, farms, selected, hoveredId, t])

  return (
    <MapPanel
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
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 transition-colors duration-fast ${
                    hoveredId === farm.id ? 'bg-accent/10' : 'hover:bg-surface-high'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(farm.id)}
                    onChange={() => toggle(farm.id)}
                    className="h-4 w-4 shrink-0 accent-accent"
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
                {route.stops.map((stop) => (
                  <li
                    key={stop.farm.id}
                    onMouseEnter={() => setHoveredId(stop.farm.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors duration-fast ${
                      hoveredId === stop.farm.id ? 'bg-accent/10' : ''
                    }`}
                  >
                    <span className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-accent text-micro font-bold text-content-on-accent">
                      {stop.order}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-caption text-content-primary">
                      {stop.farm.name}
                    </span>
                    <span className="ltr-nums shrink-0 text-micro text-content-muted">
                      {km(stop.legKm)} {t('common.km')}
                    </span>
                  </li>
                ))}
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

      {/* Navigation hand-off: BOTH apps, because coverage and routing quality
          differ by area in the Negev and neither wins everywhere. */}
      {route.stops.length > 0 && (
        <section className="mb-6">
          <h2 className="pb-2.5 text-section text-content-primary">
            {t('common.navigate')}
          </h2>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={wazeSteps[0]?.url}
              target="_blank"
              rel="noreferrer"
              className="btn-primary btn-big justify-center"
            >
              <Icon name="pin" size={18} />
              {t('route.openInWaze')}
            </a>
            <a
              href={mapsUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-big justify-center"
            >
              <Icon name="external" size={18} />
              {t('route.openInGoogleMaps')}
            </a>
          </div>

          <div className="card card-pad mt-3">
            <p className="muted mb-2">{t('route.wazeStepByStep')}</p>
            <ul className="flex flex-col gap-1.5">
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
                    className="flex items-center gap-2.5 rounded-md border border-edge-subtle px-3 py-2
                               transition-all duration-fast hover:border-accent/50 hover:bg-surface-high"
                  >
                    <span className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-surface-high text-micro font-bold text-content-primary">
                      {step.order}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-caption text-content-primary">
                      {step.farmName}
                    </span>
                    <Icon
                      name="external"
                      size={14}
                      className="shrink-0 text-content-muted"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </MapPanel>
  )
}
