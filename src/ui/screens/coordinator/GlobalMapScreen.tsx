import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { FARM_PIPELINE, getVisibleFarms } from '@core/index'
import type { Farm, FarmStatus, FarmType } from '@core/index'

import { ChevronForward, Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import type { MapMarker } from '../../components/MapView'
import {
  FarmStatusChip,
  FarmStatusDot,
  readStatusColor,
} from '../../components/badges'
import { FilterPill } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

const STATUSES: FarmStatus[] = [...FARM_PIPELINE, 'declined']
const TYPES: FarmType[] = ['agriculture', 'livestock', 'mixed']

/** Floating card over the map when a marker is tapped. */
function FarmMiniCard({ farm, onClose }: { farm: Farm; onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <div
      className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 animate-fade-in rounded-lg border
                 border-edge-strong bg-surface-overlay/95 p-4 shadow-lift backdrop-blur
                 sm:inset-x-auto sm:end-4 sm:w-80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-heading text-content-primary">
            {farm.name}
          </p>
          <p className="muted mt-0.5">
            {farm.locality} · {farm.region}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="rounded-sm p-1 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FarmStatusChip status={farm.status} />
        <span className="chip bg-surface-high text-content-secondary">
          {t(`farmType.${farm.type}`)}
        </span>
        <span className="chip bg-surface-high text-content-secondary">
          <span className="ltr-nums">{farm.farmHectares}</span>{' '}
          {t('farms.hectares')}
        </span>
      </div>

      <Link to={`/coordinator/farms/${farm.id}`} className="btn-primary mt-3 w-full">
        {t('map.openFarm')}
        <ChevronForward size={16} />
      </Link>
    </div>
  )
}

/**
 * R3: the map IS the screen.
 *
 * Full viewport minus the sidebar — no page padding, no card wrapper. The
 * filter bar and legend float on top of the canvas rather than stealing width
 * from it, because on a map every pixel of geography counts.
 */
export function GlobalMapScreen() {
  const { t } = useTranslation()
  const farms = useCoreValue(getVisibleFarms)

  const [hiddenStatus, setHiddenStatus] = useState<Set<FarmStatus>>(new Set())
  const [type, setType] = useState<FarmType | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const visible = useMemo(
    () =>
      farms.filter(
        (f) => !hiddenStatus.has(f.status) && (type === null || f.type === type),
      ),
    [farms, hiddenStatus, type],
  )

  const markers: MapMarker[] = useMemo(
    () =>
      visible.map((farm) => ({
        id: farm.id,
        position: farm.position,
        color: readStatusColor(farm.status),
        title: farm.name,
        subtitle: farm.locality,
        emphasis: farm.id === selectedId,
        onSelect: () => setSelectedId(farm.id),
      })),
    [visible, selectedId],
  )

  const toggleStatus = (status: FarmStatus) => {
    setHiddenStatus((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const selected = visible.find((f) => f.id === selectedId) ?? null

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full lg:h-dvh">
      <MapView
        ariaLabel={t('a11y.map')}
        className="h-full w-full rounded-none"
        markers={markers}
        fit
      />

      {/* Floating horizontal filter bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-edge-strong bg-surface-overlay/90 p-2.5 shadow-lift backdrop-blur">
          <span className="ps-1 text-caption font-semibold text-content-primary">
            {t('map.title')}
          </span>
          <span className="muted numeric">
            {t('map.farmsShown', { count: visible.length })}
          </span>

          <span className="mx-1 h-5 w-px bg-edge-strong" />

          {STATUSES.map((status) => (
            <FilterPill
              key={status}
              active={!hiddenStatus.has(status)}
              onClick={() => toggleStatus(status)}
              dot={<FarmStatusDot status={status} />}
              count={farms.filter((f) => f.status === status).length}
            >
              {t(`farmStatus.${status}`)}
            </FilterPill>
          ))}

          <span className="mx-1 h-5 w-px bg-edge-strong" />

          {TYPES.map((ft) => (
            <FilterPill
              key={ft}
              active={type === ft}
              onClick={() => setType(type === ft ? null : ft)}
            >
              {t(`farmType.${ft}`)}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* Legend, bottom corner */}
      <div className="pointer-events-none absolute bottom-3 start-3 z-10 hidden lg:block">
        <div className="pointer-events-auto rounded-lg border border-edge-strong bg-surface-overlay/90 p-3 shadow-lift backdrop-blur">
          <p className="section-title mb-2">{t('map.legend')}</p>
          <ul className="flex flex-col gap-1.5">
            {STATUSES.map((status) => (
              <li key={status} className="flex items-center gap-2">
                <FarmStatusDot status={status} />
                <span className="text-caption text-content-secondary">
                  {t(`farmStatus.${status}`)}
                </span>
                <span className="numeric ms-auto ps-3 text-caption text-content-muted">
                  {farms.filter((f) => f.status === status).length}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {selected && (
        <FarmMiniCard farm={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
