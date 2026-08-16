import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { FARM_PIPELINE, getVisibleFarms } from '@core/index'
import type { FarmStatus, FarmType } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { ChevronForward, Icon } from '../../components/Icon'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import {
  FarmStatusChip,
  FarmStatusDot,
  readStatusColor,
} from '../../components/badges'
import { EmptyState, FilterPill, FilterRow } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

const STATUSES: FarmStatus[] = [...FARM_PIPELINE, 'declined']
const TYPES: FarmType[] = ['agriculture', 'livestock', 'mixed']

/**
 * C1.1 — farms, map-first.
 *
 * The map carries the 12 farms coloured by status; the right-hand panel holds
 * search, filter pills and the list. Hover is synchronised in both directions:
 * hovering a row grows its marker, hovering a marker highlights its row.
 */
export function FarmsListScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const farms = useCoreValue(getVisibleFarms)

  // The dashboard links here with ?status=… — keep it in the URL so a filtered
  // list stays shareable and survives a refresh.
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as FarmStatus | null) ?? null
  const [type, setType] = useState<FarmType | null>(null)
  const [query, setQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const setStatus = (value: FarmStatus | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete('status')
    else next.set('status', value)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return farms.filter((farm) => {
      if (status !== null && farm.status !== status) return false
      if (type !== null && farm.type !== type) return false
      if (!q) return true
      return (
        farm.name.toLowerCase().includes(q) ||
        farm.locality.toLowerCase().includes(q) ||
        farm.region.toLowerCase().includes(q) ||
        farm.contacts.some((c) => c.name.toLowerCase().includes(q))
      )
    })
  }, [farms, status, type, query])

  const markers: MapMarker[] = useMemo(
    () =>
      filtered.map((farm) =>
        withInteraction(
          {
            id: farm.id,
            position: farm.position,
            color: readStatusColor(farm.status),
            title: farm.name,
            subtitle: farm.locality,
            kind: 'farm',
          },
          { hoveredId, selectedId },
          { onHover: setHoveredId, onSelect: setSelectedId },
        ),
      ),
    [filtered, hoveredId, selectedId],
  )

  const selected = filtered.find((f) => f.id === selectedId) ?? null

  return (
    <MapPanel
      ariaLabel={t('map.farmsMap')}
      markers={markers}
      legend={
        <ul className="flex flex-col gap-1.5">
          {STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <FarmStatusDot status={s} />
              <span className="text-caption text-content-secondary">
                {t(`farmStatus.${s}`)}
              </span>
              <span className="numeric ms-auto ps-3 text-caption text-content-muted">
                {farms.filter((f) => f.status === s).length}
              </span>
            </li>
          ))}
        </ul>
      }
      detail={
        selected && (
          <div className="animate-fade-in rounded-lg border border-edge-strong bg-surface-overlay/95 p-4 shadow-lift backdrop-blur">
            <div className="flex items-start gap-3">
              <Avatar
                photo={selected.photo}
                name={selected.name}
                size="md"
                shape="square"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-heading text-content-primary">
                  {selected.name}
                </p>
                <p className="muted mt-0.5">
                  {selected.locality} · {selected.region}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label={t('common.close')}
                className="shrink-0 rounded-sm p-1 text-content-muted hover:bg-surface-high hover:text-content-primary"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <FarmStatusChip status={selected.status} />
              <span className="chip bg-surface-high text-content-secondary">
                {t(`farmType.${selected.type}`)}
              </span>
            </div>
            <Link
              to={`/coordinator/farms/${selected.id}`}
              className="btn-primary mt-3 w-full"
            >
              {t('map.openFarm')}
              <ChevronForward size={16} />
            </Link>
          </div>
        )
      }
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title text-content-primary">{t('farms.title')}</h1>
          <p className="muted mt-1">
            {t('common.showingOf', {
              shown: filtered.length,
              total: farms.length,
            })}
          </p>
        </div>
        <Link to="/coordinator/farms/new" className="btn-primary">
          <Icon name="plus" size={15} />
          {t('farms.new')}
        </Link>
      </header>

      <div className="mb-3">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-content-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            className="input py-2 ps-9"
            value={query}
            placeholder={t('farms.searchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* D7.3 — one row. Statuses that no farm is in are dropped rather than
          shown at zero: an unpressable pill is noise, and the legend on the map
          already accounts for the full pipeline. */}
      <FilterRow
        active={status !== null || type !== null}
        onClear={() => {
          setStatus(null)
          setType(null)
        }}
      >
        {STATUSES.map((s) => {
          const count = farms.filter((f) => f.status === s).length
          if (count === 0) return null
          return (
            <FilterPill
              key={s}
              active={status === s}
              onClick={() => setStatus(status === s ? null : s)}
              dot={<FarmStatusDot status={s} />}
              count={count}
            >
              {t(`farmStatus.${s}`)}
            </FilterPill>
          )
        })}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-edge-subtle" />
        {TYPES.map((ft) => (
          <FilterPill
            key={ft}
            active={type === ft}
            onClick={() => setType(type === ft ? null : ft)}
            count={farms.filter((f) => f.type === ft).length}
          >
            {t(`farmType.${ft}`)}
          </FilterPill>
        ))}
      </FilterRow>

      {filtered.length === 0 ? (
        <EmptyState icon="farm" title={t('farms.empty')} />
      ) : (
        <ul className="stagger flex flex-col gap-1.5">
          {filtered.map((farm) => {
            const active = farm.id === hoveredId || farm.id === selectedId
            return (
              <li key={farm.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHoveredId(farm.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(farm.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => navigate(`/coordinator/farms/${farm.id}`)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-start
                              transition-all duration-fast ease-out ${
                                active
                                  ? 'border-accent/60 bg-accent/10'
                                  : 'border-transparent hover:bg-surface-high'
                              }`}
                >
                  <Avatar
                    photo={farm.photo}
                    name={farm.name}
                    size="sm"
                    shape="square"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <FarmStatusDot status={farm.status} />
                      <span className="truncate text-caption font-medium text-content-primary">
                        {farm.name}
                      </span>
                    </span>
                    <span className="muted mt-0.5 block truncate">
                      {farm.locality} · {t(`farmType.${farm.type}`)}
                    </span>
                  </span>
                  <span className="shrink-0 text-content-muted">
                    <ChevronForward size={15} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </MapPanel>
  )
}
