import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { FARM_PIPELINE, getVisibleFarms } from '@core/index'
import type { Farm, FarmStatus } from '@core/index'

import { ChevronForward, Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import type { MapMarker } from '../../components/MapView'
import {
  FARM_STATUS_COLOR,
  FarmStatusChip,
  FarmStatusDot,
} from '../../components/badges'
import { PageHeader } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

const STATUSES: FarmStatus[] = [...FARM_PIPELINE, 'declined']

/** Mini card that appears over the map when a marker is tapped. */
function FarmMiniCard({ farm, onClose }: { farm: Farm; onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-white p-4 shadow-lift sm:inset-x-auto sm:end-3 sm:w-80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{farm.name}</p>
          <p className="muted mt-0.5">
            {farm.locality} · {farm.region}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="rounded-lg p-1 text-night-950/40 hover:bg-sand-100"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <FarmStatusChip status={farm.status} />
        <span className="chip bg-sand-100 text-night-950/70">
          {t(`farmType.${farm.type}`)}
        </span>
      </div>

      <Link
        to={`/coordinator/farms/${farm.id}`}
        className="btn-primary mt-3 w-full"
      >
        {t('map.openFarm')}
        <ChevronForward size={16} />
      </Link>
    </div>
  )
}

export function GlobalMapScreen() {
  const { t } = useTranslation()
  const farms = useCoreValue(getVisibleFarms)
  const [hidden, setHidden] = useState<Set<FarmStatus>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const visible = useMemo(
    () => farms.filter((f) => !hidden.has(f.status)),
    [farms, hidden],
  )

  const markers: MapMarker[] = useMemo(
    () =>
      visible.map((farm) => ({
        id: farm.id,
        position: farm.position,
        color: FARM_STATUS_COLOR[farm.status],
        title: farm.name,
        subtitle: farm.locality,
        onSelect: () => setSelectedId(farm.id),
      })),
    [visible],
  )

  const toggle = (status: FarmStatus) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const selected = visible.find((f) => f.id === selectedId) ?? null

  return (
    <>
      <PageHeader
        title={t('map.title')}
        subtitle={t('map.farmsShown', { count: visible.length })}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="relative lg:col-span-3">
          <MapView
            ariaLabel={t('a11y.map')}
            className="h-[60vh] min-h-80 w-full lg:h-[calc(100dvh-16rem)]"
            markers={markers}
            fit
          />
          {selected && (
            <FarmMiniCard farm={selected} onClose={() => setSelectedId(null)} />
          )}
        </div>

        <div className="card card-pad h-fit">
          <h2 className="section-title mb-3">{t('map.legend')}</h2>
          <ul className="flex flex-col gap-1">
            {STATUSES.map((status) => {
              const count = farms.filter((f) => f.status === status).length
              const off = hidden.has(status)
              return (
                <li key={status}>
                  <button
                    type="button"
                    onClick={() => toggle(status)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-sand-100 ${
                      off ? 'opacity-40' : ''
                    }`}
                  >
                    <FarmStatusDot status={status} />
                    <span className="flex-1 text-sm text-night-950/75">
                      {t(`farmStatus.${status}`)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {count}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </>
  )
}
