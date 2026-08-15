import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  HOME_BASE,
  estimateDriveMinutes,
  getVisibleFarms,
  googleMapsRouteUrl,
  planRoute,
} from '@core/index'

import { ChevronForward, Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import type { MapMarker } from '../../components/MapView'
import { FARM_STATUS_COLOR, FarmStatusChip } from '../../components/badges'
import { EmptyState, PageHeader, Section } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

const km = (v: number) => v.toFixed(1)

export function RoutePlannerScreen() {
  const { t } = useTranslation()
  const farms = useCoreValue(getVisibleFarms)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const chosen = useMemo(
    () => farms.filter((f) => selected.has(f.id)),
    [farms, selected],
  )

  // Nearest-neighbour ordering from Jerusalem — the real logic lives in
  // @core/routing so it can be unit-tested and reused off-device.
  const route = useMemo(() => planRoute(chosen, HOME_BASE), [chosen])
  const mapsUrl = useMemo(() => googleMapsRouteUrl(route), [route])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectPending = () => {
    setSelected(
      new Set(farms.filter((f) => f.nextVisitAt !== null).map((f) => f.id)),
    )
  }

  const markers: MapMarker[] = useMemo(
    () => [
      {
        id: 'origin',
        position: HOME_BASE,
        color: '#1c2038',
        title: t('route.originName'),
      },
      ...route.stops.map((stop) => ({
        id: stop.farm.id,
        position: stop.farm.position,
        color: FARM_STATUS_COLOR[stop.farm.status],
        title: `${stop.order}. ${stop.farm.name}`,
        subtitle: stop.farm.locality,
      })),
    ],
    [route, t],
  )

  return (
    <>
      <PageHeader title={t('route.title')} subtitle={t('route.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Section
            title={t('route.selectFarms')}
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectPending}
                  className="text-xs font-medium text-night-700 hover:underline"
                >
                  {t('route.suggestPending')}
                </button>
                {selected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-xs font-medium text-night-950/45 hover:underline"
                  >
                    {t('common.clear')}
                  </button>
                )}
              </div>
            }
          >
            <p className="muted mb-2">
              {t('route.selected', { count: selected.size })}
            </p>
            <ul className="max-h-[26rem] overflow-y-auto">
              {farms.map((farm) => (
                <li key={farm.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-sand-100">
                    <input
                      type="checkbox"
                      checked={selected.has(farm.id)}
                      onChange={() => toggle(farm.id)}
                      className="h-4 w-4 shrink-0 rounded border-sand-400 text-night-800 focus:ring-night-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {farm.name}
                      </span>
                      <span className="muted block truncate">
                        {farm.locality}
                      </span>
                    </span>
                    <FarmStatusChip status={farm.status} />
                  </label>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-3">
          <Section
            title={t('route.order')}
            action={
              mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary py-2 text-xs"
                >
                  <Icon name="external" size={14} />
                  {t('route.openInGoogleMaps')}
                </a>
              )
            }
          >
            {route.stops.length === 0 ? (
              <EmptyState icon="route" title={t('route.emptySelection')} />
            ) : (
              <>
                <ol className="relative flex flex-col">
                  <li className="flex items-start gap-3 pb-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-night-900 text-white">
                      <Icon name="pin" size={15} />
                    </span>
                    <div className="pt-0.5">
                      <p className="text-sm font-medium">
                        {t('route.originName')}
                      </p>
                      <p className="muted">{t('route.origin')}</p>
                    </div>
                  </li>

                  {route.stops.map((stop) => (
                    <li key={stop.farm.id} className="flex items-start gap-3 pb-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sand-200 text-xs font-semibold tabular-nums text-night-900">
                        {stop.order}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <Link
                          to={`/coordinator/farms/${stop.farm.id}`}
                          className="flex items-center gap-1.5 text-sm font-medium hover:underline"
                        >
                          {stop.farm.name}
                          <ChevronForward size={14} />
                        </Link>
                        <p className="muted mt-0.5">
                          {stop.farm.locality} · {t('route.leg')}{' '}
                          <span className="ltr-nums">
                            {km(stop.legKm)} {t('common.km')}
                          </span>
                        </p>
                      </div>
                      <span className="ltr-nums shrink-0 text-xs text-night-950/45">
                        {km(stop.cumulativeKm)} {t('common.km')}
                      </span>
                    </li>
                  ))}

                  <li className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-sand-400 text-night-950/40">
                      <Icon name="home" size={15} />
                    </span>
                    <div className="pt-0.5">
                      <p className="text-sm font-medium">
                        {t('route.returnLeg')}
                      </p>
                      <p className="ltr-nums muted">
                        {km(route.returnKm)} {t('common.km')}
                      </p>
                    </div>
                  </li>
                </ol>

                <dl className="mt-2 grid gap-3 border-t border-sand-200 pt-4 sm:grid-cols-3">
                  <div>
                    <dt className="muted">{t('route.totalDistance')}</dt>
                    <dd className="ltr-nums text-lg font-semibold">
                      {km(route.totalKm)} {t('common.km')}
                    </dd>
                  </div>
                  <div>
                    <dt className="muted">{t('route.roundTrip')}</dt>
                    <dd className="ltr-nums text-lg font-semibold">
                      {km(route.roundTripKm)} {t('common.km')}
                    </dd>
                  </div>
                  <div>
                    <dt className="muted">{t('route.estimatedDrive')}</dt>
                    <dd className="ltr-nums text-lg font-semibold">
                      {estimateDriveMinutes(route.roundTripKm)}{' '}
                      {t('common.minutesShort')}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </Section>

          <MapView
            ariaLabel={t('a11y.map')}
            className="h-72 w-full"
            markers={markers}
            fit
          />
        </div>
      </div>
    </>
  )
}
