import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  FARM_PIPELINE,
  entityKindOf,
  formatDate,
  getAllVisibleFarmZones,
  getVisibleFarms,
} from '@core/index'
import type { Farm, FarmStatus, FarmType } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { ChevronForward, Icon } from '../../components/Icon'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import {
  FarmStatusChip,
  FarmStatusDot,
  entityMarkerKind,
  readStatusColor,
} from '../../components/badges'
import {
  EmptyState,
  FilterPill,
  FilterRow,
  KpiFilter,
  LoadMore,
} from '../../components/primitives'
import { ZoneLegend, zonePolygons } from '../../components/zones'
import { useProgressive } from '../../hooks/useProgressive'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'
import { useWindowTable } from '../../hooks/useWindowTable'

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
  const locale = useLocale()
  const navigate = useNavigate()
  const farms = useCoreValue(getVisibleFarms)
  const zones = useCoreValue(getAllVisibleFarmZones)

  // The dashboard links here with ?status=… — keep it in the URL so a filtered
  // list stays shareable and survives a refresh.
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as FarmStatus | null) ?? null
  const [type, setType] = useState<FarmType | null>(null)
  // G16 — the moshav KPI-filter: entity kind joins the list's filters.
  const [moshavOnly, setMoshavOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * G7 — two readings of the same roster. The MAP stays the default (A18:
   * geography first), but a farm file imported at scale needs columns to
   * scan down, and a table crammed into the map shell's one-third panel is
   * not a table. The toggle swaps the whole shell: map-first, or a full-page
   * window-virtualised table like the volunteers'.
   */
  const [view, setView] = useState<'map' | 'table'>('map')

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
      if (moshavOnly && entityKindOf(farm) !== 'moshav') return false
      if (!q) return true
      return (
        farm.name.toLowerCase().includes(q) ||
        farm.locality.toLowerCase().includes(q) ||
        farm.region.toLowerCase().includes(q) ||
        farm.contacts.some((c) => c.name.toLowerCase().includes(q))
      )
    })
  }, [farms, status, type, moshavOnly, query])

  const page = useProgressive(filtered)

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
            kind: entityMarkerKind(farm),
          },
          { hoveredId, selectedId },
          { onHover: setHoveredId, onSelect: setSelectedId },
        ),
      ),
    [filtered, hoveredId, selectedId],
  )

  const selected = filtered.find((f) => f.id === selectedId) ?? null

  /**
   * G14d — one KPI card per status IN USE, count big and the status's dunam
   * total underneath ("how much ground is at this stage"), and the card IS
   * the filter: it replaces the status pills. Statuses at zero are dropped,
   * same rule as the pills they replace.
   */
  const statusKpis = STATUSES.map((s) => {
    const inStatus = farms.filter((f) => f.status === s)
    return {
      status: s,
      count: inStatus.length,
      dunams: inStatus.reduce((sum, f) => sum + f.farmDunams + f.grazingDunams, 0),
    }
  }).filter((k) => k.count > 0)

  const moshavim = farms.filter((f) => entityKindOf(f) === 'moshav')

  const kpiGrid = (
    <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-3">
      {statusKpis.map((k) => (
        <KpiFilter
          key={k.status}
          label={t(`farmStatus.${k.status}`)}
          value={k.count}
          dot={<FarmStatusDot status={k.status} />}
          hint={t('farms.kpiDunams', { n: k.dunams.toLocaleString(locale) })}
          active={status === k.status}
          onClick={() => setStatus(status === k.status ? null : k.status)}
        />
      ))}
      {/* G16 — the entity-kind card: how many of these records are moshavim,
          weighted like the status cards, and the card is the filter. */}
      {moshavim.length > 0 && (
        <KpiFilter
          label={t('farms.kpiMoshavim')}
          value={moshavim.length}
          icon="home"
          tone="accent"
          hint={t('farms.kpiDunams', {
            n: moshavim
              .reduce((sum, f) => sum + f.farmDunams + f.grazingDunams, 0)
              .toLocaleString(locale),
          })}
          active={moshavOnly}
          onClick={() => setMoshavOnly((v) => !v)}
        />
      )}
    </div>
  )

  const header = (
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
      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden items-center gap-1.5 lg:flex">
          {(['map', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`filter-pill ${view === v ? 'filter-pill-active' : ''}`}
            >
              <Icon name={v === 'map' ? 'map' : 'menu'} size={13} />
              {t(v === 'map' ? 'farms.viewMap' : 'farms.viewTable')}
            </button>
          ))}
        </div>
        <Link to="/coordinator/farms/new" className="btn-primary">
          <Icon name="plus" size={15} />
          {t('farms.new')}
        </Link>
      </div>
    </header>
  )

  const searchBox = (
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
  )

  const filterRow = (
    <FilterRow
      active={status !== null || type !== null || moshavOnly}
      onClear={() => {
        setStatus(null)
        setType(null)
        setMoshavOnly(false)
      }}
    >
      {/* G14d — the status pills are gone: the KPI cards above carry status
          filtering now. Only the type pills remain, they have no card. */}
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
  )

  // G7 — the full-page table reading, outside the map shell entirely.
  if (view === 'table') {
    return (
      <div className="px-4 pb-24 pt-5 sm:px-6 lg:pb-6">
        {/* G14d/A51 — the whole top rides the page from lg, column headers
            included, same construction as the volunteers roster. */}
        <div
          className="-mx-4 bg-surface-base px-4 sm:-mx-6 sm:px-6 lg:sticky lg:z-20"
          style={{ top: 'var(--shell-top, 0px)' }}
        >
          {header}
          {kpiGrid}
          {searchBox}
          {filterRow}
          {filtered.length > 0 && <FarmsTableHead />}
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="farm" title={t('farms.empty')} />
        ) : (
          <FarmsTable
            farms={filtered}
            onOpen={(id) => navigate(`/coordinator/farms/${id}`)}
          />
        )}
      </div>
    )
  }

  return (
    <MapPanel
      screenKey="farms"
      ariaLabel={t('map.farmsMap')}
      markers={markers}
      polygons={zonePolygons(zones, farms)}
      legend={
        <>
        <ZoneLegend zones={zones} farms={farms} className="mb-2" />
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
        </>
      }
      detail={
        selected && (
          <div className="animate-fade-in rounded-card bg-surface-overlay/95 p-4 shadow-lift backdrop-blur">
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
                className="shrink-0 rounded-field p-1 text-content-muted hover:bg-surface-high hover:text-content-primary"
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
      {/* G14d — title, KPI-filters and search ride the panel's own scroll
          from lg, so the controls survive a long filtered list. */}
      <div
        className="-mx-4 bg-surface-base px-4 lg:sticky lg:-mx-5 lg:z-20 lg:px-5"
        style={{ top: 'var(--shell-top, 0px)' }}
      >
        {header}
        {kpiGrid}
        {searchBox}
        {filterRow}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="farm" title={t('farms.empty')} />
      ) : (
        <ul className="stagger flex flex-col gap-1.5">
          {page.visible.map((farm) => {
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
                  /* F5.3 — a farm row is a card. A transparent border on the
                     page surface gave the list no edges at all. */
                  className={`tile-interactive flex w-full items-center gap-3 px-3 py-2.5 text-start ${
                    active ? 'border-accent/60 bg-accent/10' : ''
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
      <LoadMore shown={page.shown} total={page.total} onMore={page.more} />
    </MapPanel>
  )
}

const TABLE_ROW_HEIGHT = 56

/**
 * G7 — the roster reading of the farms: one row per farm, fixed columns,
 * window-virtualised with a sticky header. Same construction as the
 * volunteers table; 12 fixture farms do not need it, the hundreds a real
 * import brings do, and the table must not change shape when they arrive.
 */
const HeaderCell = ({
  label,
  className = '',
}: {
  label: string
  className?: string
}) => (
  <span
    className={`text-micro font-semibold uppercase tracking-wide text-content-muted ${className}`}
  >
    {label}
  </span>
)

/** G14d — the column header row, rendered inside the parent's sticky block
 *  so title, KPI-filters, search and columns pin as ONE unit (A51). */
function FarmsTableHead() {
  const { t } = useTranslation()
  return (
    <div
      className="hidden items-center gap-3 rounded-t-card border-b border-edge-subtle
                 bg-surface-overlay/95 px-4 py-2.5 backdrop-blur lg:flex"
    >
      <HeaderCell label={t('missions.farm')} className="w-56" />
      <HeaderCell label={t('volunteers.colLocality')} className="w-32" />
      <HeaderCell label={t('farms.colRegion')} className="w-32" />
      <HeaderCell label={t('farms.colType')} className="w-24" />
      <HeaderCell label={t('farms.colStatus')} className="w-32" />
      <HeaderCell
        label={t('farms.colDunams')}
        className="hidden w-36 xl:block"
      />
      <HeaderCell
        label={t('farms.colContacts')}
        className="hidden w-20 xl:block"
      />
      <HeaderCell label={t('farms.nextVisit')} className="w-28" />
    </div>
  )
}

function FarmsTable({
  farms,
  onOpen,
}: {
  farms: Farm[]
  onOpen: (farmId: string) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()

  const { listRef, virtualizer, margin } = useWindowTable(
    farms.length,
    () => TABLE_ROW_HEIGHT,
  )

  const dunams = (n: number) => n.toLocaleString(locale)

  return (
    <div className="card lg:rounded-t-none">
      <div
        ref={listRef}
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const farm = farms[item.index]
          return (
            <button
              key={farm.id}
              type="button"
              onClick={() => onOpen(farm.id)}
              style={{
                position: 'absolute',
                insetInlineStart: 0,
                insetInlineEnd: 0,
                top: 0,
                height: item.size,
                transform: `translateY(${item.start - margin}px)`,
              }}
              className="flex items-center border-b border-edge-subtle/50 px-4 text-start
                         transition-colors duration-fast hover:bg-surface-high/60"
            >
              {/* Desktop: dense table row */}
              <span className="hidden w-full items-center gap-3 lg:flex">
                <span className="flex w-56 min-w-0 items-center gap-2.5">
                  <Avatar
                    photo={farm.photo}
                    name={farm.name}
                    size="xs"
                    shape="square"
                  />
                  <span className="truncate text-caption font-medium text-content-primary">
                    {farm.name}
                  </span>
                </span>
                <span className="w-32 truncate text-caption text-content-secondary">
                  {farm.locality}
                </span>
                <span className="w-32 truncate text-caption text-content-secondary">
                  {farm.region}
                </span>
                <span className="w-24 truncate text-caption text-content-secondary">
                  {t(`farmType.${farm.type}`)}
                </span>
                <span className="w-32">
                  <FarmStatusChip status={farm.status} />
                </span>
                <span className="ltr-nums numeric hidden w-36 text-caption text-content-secondary xl:block">
                  {dunams(farm.farmDunams)} / {dunams(farm.grazingDunams)}
                </span>
                <span className="numeric hidden w-20 text-caption text-content-secondary xl:block">
                  {farm.contacts.length}
                </span>
                <span className="ltr-nums w-28 text-micro text-content-muted">
                  {farm.nextVisitAt
                    ? formatDate(farm.nextVisitAt, locale)
                    : t('farms.noVisitYet')}
                </span>
                <ChevronForward size={14} />
              </span>

              {/* Mobile: the tile shape the map view uses. */}
              <span className="flex w-full items-center gap-3 lg:hidden">
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
                <ChevronForward size={15} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
