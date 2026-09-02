import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  FARM_PIPELINE,
  entityKindOf,
  formatDate,
  getAllVisibleAnchorPoints,
  getAllVisibleFarmZones,
  getVisibleFarms,
  getVisibleThreatVectors,
  getVisibleThreatZones,
  totalHeads,
} from '@core/index'
import type { Farm, FarmStatus, FarmType, LatLng } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { EntityQuickCard, useQuickPreview } from '../../components/EntityQuickCard'
import { ChevronForward, Icon } from '../../components/Icon'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import {
  ThreatLegend,
  threatVectorShapes,
  threatZoneShapes,
} from '../../components/threats'
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
  KpiChip,
  ListTop,
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
  // G18 — coordinator-only by construction: `access.ts` returns [] for every
  // other role, so no condition here decides who sees the layer.
  const threatZones = useCoreValue(getVisibleThreatZones)
  const threatVectors = useCoreValue(getVisibleThreatVectors)
  /**
   * The layer is OFF by default and its state is remembered.
   *
   * Off because the global map's job is "where are my farms and how are they
   * doing", and a hatched overlay across half the Negev competes with that;
   * remembered because a coordinator working a threat brief this week should
   * not re-arm it on every navigation. Same key space as P0.1's map mode.
   */
  const [threatLayer, setThreatLayer] = useState(() => {
    try {
      return localStorage.getItem('lo-yanum:threat-layer') === '1'
    } catch {
      return false
    }
  })
  const toggleThreatLayer = () =>
    setThreatLayer((on) => {
      try {
        localStorage.setItem('lo-yanum:threat-layer', on ? '0' : '1')
      } catch {
        // A remembered toggle is a convenience, not a requirement.
      }
      return !on
    })

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
  // U8 — the tile's second click zone: centre the map on this entity.
  const [flyTo, setFlyTo] = useState<{ position: LatLng; key: number } | null>(null)
  const anchors = useCoreValue(getAllVisibleAnchorPoints)
  const postsOf = (farmId: string) => anchors.filter((a) => a.farmId === farmId).length
  const quick = useQuickPreview<Farm>()
  const centerOn = (farm: Farm) => {
    setSelectedId(farm.id)
    setFlyTo((f) => ({ position: farm.position, key: (f?.key ?? 0) + 1 }))
  }
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

  /**
   * U2 (2026-09-02) — THE TOP IS ONE STICKY, COMPACT BLOCK. The product owner
   * saw four farms under a bandeau that took three quarters of the panel:
   * the KPI cards were a grid, the search a row, the pills another. Now the
   * status KPIs are chips in ONE swipable row beside the search box, the
   * type pills are one line under it, and the whole thing is pinned at every
   * width — so eight to ten entities are on screen on an iPad in landscape.
   */
  const kpiChips = (
    <>
      {statusKpis.map((k) => (
        <KpiChip
          key={k.status}
          label={t(`farmStatus.${k.status}`)}
          value={k.count}
          dot={<FarmStatusDot status={k.status} />}
          hint={t('farms.kpiDunams', { n: k.dunams.toLocaleString(locale) })}
          active={status === k.status}
          onClick={() => setStatus(status === k.status ? null : k.status)}
          testId={`kpi-${k.status}`}
        />
      ))}
      {/* G16 — the entity-kind chip: how many of these records are moshavim,
          weighted like the status chips, and the chip is the filter. */}
      {moshavim.length > 0 && (
        <KpiChip
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
          testId="kpi-moshavim"
        />
      )}
    </>
  )

  const actions = (
    <>
      <div className="hidden items-center gap-1 lg:flex">
        {(['map', 'table'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            title={t(v === 'map' ? 'farms.viewMap' : 'farms.viewTable')}
            className={`filter-pill min-h-9 ${view === v ? 'filter-pill-active' : ''}`}
          >
            <Icon name={v === 'map' ? 'map' : 'menu'} size={13} />
            {t(v === 'map' ? 'farms.viewMap' : 'farms.viewTable')}
          </button>
        ))}
      </div>
      {/* G18 — the threat layer's switch lives with the view controls,
          because it IS a view control: it changes what the map is about,
          not what the list contains. Coordinator-only by construction —
          with nothing to show, there is nothing to toggle. */}
      {(threatZones.length > 0 || threatVectors.length > 0) && (
        <button
          type="button"
          onClick={toggleThreatLayer}
          aria-pressed={threatLayer}
          className={`filter-pill min-h-9 ${threatLayer ? 'filter-pill-active' : ''}`}
        >
          <Icon name="alert" size={13} />
          {t('threat.layer')}
        </button>
      )}
      {/* G10 — the farms roster gets the same import affordance the
          volunteers one has had since R5.4, pointed at its own template. */}
      <Link
        to="/coordinator/import/farms"
        className="btn-secondary py-1.5 text-micro"
        title={t('volunteers.import')}
      >
        <Icon name="upload" size={14} />
        <span className="hidden sm:inline">{t('volunteers.import')}</span>
      </Link>
      <Link to="/coordinator/farms/new" className="btn-primary py-1.5 text-micro">
        <Icon name="plus" size={14} />
        {t('farms.new')}
      </Link>
    </>
  )

  const filterRow = (
    <FilterRow
      nowrap
      active={status !== null || type !== null || moshavOnly}
      onClear={() => {
        setStatus(null)
        setType(null)
        setMoshavOnly(false)
      }}
    >
      {/* G14d — the status pills are gone: the KPI chips above carry status
          filtering now. Only the type pills remain, they have no chip. */}
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

  const top = (extra?: React.ReactNode) => (
    <ListTop
      testId="farms-top"
      title={t('farms.title')}
      subtitle={t('common.showingOf', { shown: filtered.length, total: farms.length })}
      actions={actions}
      search={query}
      onSearch={setQuery}
      searchPlaceholder={t('farms.searchPlaceholder')}
      kpis={kpiChips}
      filters={filterRow}
    >
      {extra}
    </ListTop>
  )

  // G7 — the full-page table reading, outside the map shell entirely.
  if (view === 'table') {
    return (
      <div className="px-4 pb-24 pt-5 sm:px-6 lg:pb-6">
        {/* G14d/A51 — the whole top rides the page from lg, column headers
            included, same construction as the volunteers roster. */}
        {top(filtered.length > 0 && <FarmsTableHead />)}
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
      threatZones={threatLayer ? threatZoneShapes(threatZones) : []}
      threatVectors={threatLayer ? threatVectorShapes(threatVectors) : []}
      legend={
        <>
        {threatLayer && (
          <ThreatLegend
            zones={threatZones}
            vectors={threatVectors}
            className="mb-2"
          />
        )}
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
      flyTo={flyTo ?? undefined}
      detail={
        selected && (
          <EntityQuickCard
            farm={selected}
            posts={postsOf(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        )
      }
    >
      {top()}

      {filtered.length === 0 ? (
        <EmptyState icon="farm" title={t('farms.empty')} />
      ) : (
        // P0bis.3b — two farm cards per row as soon as the panel can hold
        // two. In the map reading the panel is a third of the screen, so this
        // is normally one column; it earns its keep the moment the seam is
        // dragged, which is exactly when a stretched row looks emptiest.
        <div className="panel-scope">
          <ul className="stagger pair-grid gap-1.5">
          {page.visible.map((farm) => (
            <li key={farm.id}>
              <FarmTile
                farm={farm}
                active={farm.id === hoveredId || farm.id === selectedId}
                heads={totalHeads(farm)}
                onHover={setHoveredId}
                onOpen={() => navigate(`/coordinator/farms/${farm.id}`)}
                onCenter={() => centerOn(farm)}
                previewProps={quick.bind(farm)}
              />
            </li>
          ))}
          </ul>
        </div>
      )}
      {quick.portal((farm) => (
        <EntityQuickCard farm={farm} posts={postsOf(farm.id)} compact />
      ))}
      <LoadMore shown={page.shown} total={page.total} onMore={page.more} />
    </MapPanel>
  )
}

/**
 * U8 (2026-09-02) — THE LIVING TILE. The photo takes the tile's whole height,
 * edge to edge, on the PHYSICAL LEFT (last flex child in this RTL row), and
 * it is the tile's second click zone: "centre on the map", with a pin badge
 * in its corner saying so. The text zone opens the file. Hover (mouse) or a
 * long press (touch) opens the quick card beside the tile.
 */
function FarmTile({
  farm,
  active,
  heads,
  onHover,
  onOpen,
  onCenter,
  previewProps,
}: {
  farm: Farm
  active: boolean
  heads: number | null
  onHover: (id: string | null) => void
  onOpen: () => void
  onCenter: () => void
  previewProps: Record<string, unknown>
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  return (
    <div
      data-testid="farm-tile"
      className={`tile-interactive flex h-[4.75rem] overflow-hidden ${
        active ? 'bg-accent/10 ring-2 ring-accent/60' : ''
      }`}
      onMouseEnter={() => onHover(farm.id)}
      onMouseLeave={() => onHover(null)}
      {...previewProps}
    >
      <button
        type="button"
        onFocus={() => onHover(farm.id)}
        onBlur={() => onHover(null)}
        onClick={onOpen}
        title={t('farms.openFile')}
        className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2 text-start"
      >
        <span className="flex min-w-0 items-center gap-2">
          <FarmStatusDot status={farm.status} />
          <span className="truncate text-caption font-semibold text-content-primary" title={farm.name}>
            {farm.name}
          </span>
        </span>
        <span className="muted block truncate" title={`${farm.locality} · ${t(`farmType.${farm.type}`)}`}>
          {farm.locality} · {t(`farmType.${farm.type}`)}
        </span>
        <span className="flex flex-wrap items-center gap-x-2.5 text-micro text-content-muted">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Icon name="landPlot" size={11} />
            <span className="numeric">{(farm.farmDunams + farm.grazingDunams).toLocaleString(locale)}</span>
            {t('farms.dunams')}
          </span>
          {heads !== null && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Icon name="pawPrint" size={11} />
              <span className="numeric">{heads.toLocaleString(locale)}</span>
            </span>
          )}
          {farm.nextVisitAt && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Icon name="calendar" size={11} />
              <span className="ltr-nums">{formatDate(farm.nextVisitAt, locale)}</span>
            </span>
          )}
        </span>
      </button>
      <span className="flex shrink-0 items-center pe-1 text-content-muted/60">
        <ChevronForward size={14} />
      </span>
      <button
        type="button"
        onClick={onCenter}
        aria-label={t('farms.centerOnMap')}
        title={t('farms.centerOnMap')}
        data-testid="farm-tile-center"
        className="group relative h-full w-[4.75rem] shrink-0 overflow-hidden bg-surface-high"
      >
        <TilePhoto photo={farm.photo} name={farm.name} />
        <span
          className="absolute bottom-1 start-1 flex h-6 w-6 items-center justify-center rounded-pill bg-surface-overlay/90 text-accent-ink shadow-card
                     transition-transform duration-fast group-hover:scale-110 group-active:scale-95"
        >
          <Icon name="pin" size={13} />
        </span>
      </button>
    </div>
  )
}

/** The tile's full-bleed photo, or the initials on the name's colour. */
function TilePhoto({ photo, name }: { photo: string | null; name: string }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center [&>*]:h-full [&>*]:w-full [&>*]:rounded-none [&>*]:ring-0 [&>span]:text-heading">
      <Avatar photo={photo} name={name} size="lg" shape="square" />
    </span>
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
                 bg-surface-overlay/95 px-4 py-1.5 backdrop-blur lg:flex"
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
