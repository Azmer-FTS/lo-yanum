import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  FARM_PIPELINE,
  entityKindOf,
  farmRegion,
  formatDate,
  getAllVisibleAnchorPoints,
  getAllVisibleFarmZones,
  getVisibleFarms,
  getVisibleThreatVectors,
  getVisibleThreatZones,
  totalHeads,
} from '@core/index'
import type { Farm, FarmStatus, FarmType, RegionId } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { EntityQuickCard, useQuickPreview } from '../../components/EntityQuickCard'
import { ChevronForward, Icon } from '../../components/Icon'
import { ListTile } from '../../components/ListTile'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import { OverflowMenu } from '../../components/OverflowMenu'
import { RegionFilter } from '../../components/RegionFilter'
import { RosterHead } from '../../components/roster'
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
  /*
   * ★ X2 (2026-09-04) — THE THREAT LAYER'S OWN BUTTON IS GONE. It was a pill
   *   in this header AND two checkboxes in the map legend, i.e. two controls
   *   over one remembered value, and the product owner asked for the legend
   *   to be the only place a map layer is switched. The shapes are handed to
   *   the map unconditionally now; `MapCanvas` filters them by
   *   `mapLayers.ts`, which is where every other layer has been governed
   *   since W5. The threat layers default to OFF there, as this pill did.
   */

  // The dashboard links here with ?status=… — keep it in the URL so a filtered
  // list stays shareable and survives a refresh.
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as FarmStatus | null) ?? null
  const [type, setType] = useState<FarmType | null>(null)
  // G16 — the moshav KPI-filter: entity kind joins the list's filters.
  const [moshavOnly, setMoshavOnly] = useState(false)
  // X12.4 — the standard region, as a filter. `null` is "every region".
  const [region, setRegion] = useState<RegionId | null>(null)
  const [query, setQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * ★ X4.3 (2026-09-04) — THE PHOTO SITUATES, IT DOES NOT ZOOM.
   *
   * U8 made the tile's photo a `flyTo`, and `flyTo` lifts the camera to at
   * least z13 — so from the national frame a tap threw away exactly the
   * context the product owner tapped it to get. It now SELECTS the entity and
   * opens its card ANCHORED to its own pin, tip and all, with the camera left
   * where it was (`MapCanvas.anchored` pans only if the pin is off screen).
   * The tight frame stays the OTHER gesture's: opening the sheet.
   */
  const [previewKey, setPreviewKey] = useState(0)
  /** A new key is a new request to (re)anchor — and to pan only if off screen. */
  const select = (id: string | null) => {
    setSelectedId(id)
    setPreviewKey((k) => k + 1)
  }
  const anchors = useCoreValue(getAllVisibleAnchorPoints)
  const postsOf = (farmId: string) => anchors.filter((a) => a.farmId === farmId).length
  const quick = useQuickPreview<Farm>()
  const centerOn = (farm: Farm) => select(farm.id)
  /**
   * G7 — two readings of the same roster. The MAP stays the default (A18:
   * geography first), but a farm file imported at scale needs columns to
   * scan down, and a table crammed into the map shell's one-third panel is
   * not a table.
   *
   * ★★ Y4 — WHICH READING IS SHOWN IS THE MAP MODE, not a switch of this
   *    screen's own. See the "⋯" note below: `hidden` — the coordinator has
   *    asked for the content to fill the screen — IS the table, on this
   *    screen and on the four others.
   */

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
      if (region !== null && farmRegion(farm) !== region) return false
      if (!q) return true
      return (
        farm.name.toLowerCase().includes(q) ||
        farm.locality.toLowerCase().includes(q) ||
        farm.region.toLowerCase().includes(q) ||
        farm.contacts.some((c) => c.name.toLowerCase().includes(q))
      )
    })
  }, [farms, status, type, moshavOnly, region, query])

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
          { onHover: setHoveredId, onSelect: select },
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

  /** X12.4 — how many entities each region holds, for the picker's labels. */
  const regionCounts = useMemo(() => {
    const out: Partial<Record<RegionId, number>> = {}
    for (const f of farms) {
      const id = farmRegion(f)
      if (id) out[id] = (out[id] ?? 0) + 1
    }
    return out
  }, [farms])

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

  /**
   * X2 — WHAT THIS SCREEN CAN DO, IN ONE "⋯".
   *
   * ★★ Y4 (2026-09-04) — AND THE MAP/TABLE PAIR IS NO LONGER ONE OF THEM.
   *    This screen carried a `view` of its own — two rows in this menu — on
   *    top of the three-mode pill every map screen already has, so the
   *    coordinator had FOUR states to think about on one screen and three on
   *    every other. His rule collapses them: the table IS the content-full
   *    mode. Choosing "contenu plein" is choosing the table, and there is one
   *    control for both because they were always one idea.
   */
  const menu = (
    <OverflowMenu
      testId="farms-menu"
      items={[
        {
          key: 'import',
          label: t('volunteers.import'),
          icon: 'upload',
          to: '/coordinator/import/farms',
          testId: 'farms-import',
        },
      ]}
    />
  )

  const filterRow = (
    <FilterRow
      nowrap
      active={status !== null || type !== null || moshavOnly || region !== null}
      onClear={() => {
        setStatus(null)
        setType(null)
        setMoshavOnly(false)
        setRegion(null)
      }}
    >
      <RegionFilter value={region} onChange={setRegion} counts={regionCounts} testId="farms-region" />
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
      count={t('common.showingOf', { shown: filtered.length, total: farms.length })}
      menu={menu}
      search={query}
      onSearch={setQuery}
      searchPlaceholder={t('farms.searchPlaceholder')}
      kpis={kpiChips}
      filters={filterRow}
    >
      {extra}
    </ListTop>
  )

  return (
    <MapPanel
      screenKey="farms"
      ariaLabel={t('map.farmsMap')}
      markers={markers}
      polygons={zonePolygons(zones, farms)}
      threatZones={threatZoneShapes(threatZones)}
      threatVectors={threatVectorShapes(threatVectors)}
      legend={
        <>
        <ThreatLegend zones={threatZones} vectors={threatVectors} className="mb-2" />
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
      detailAt={selected ? { position: selected.position, key: previewKey } : undefined}
      detail={
        selected && (
          <EntityQuickCard
            farm={selected}
            posts={postsOf(selected.id)}
            onClose={() => select(null)}
          />
        )
      }
    >
      {({ mode }) =>
        /**
         * ★★ Y4 — THE MODE CHOOSES THE READING, and the same three lines are
         *    written on all five lists. `full` never reaches here: `MapSplit`
         *    hides this column itself.
         */
        mode === 'hidden' ? (
          <>
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
          </>
        ) : (
          <>
            {top()}

            {filtered.length === 0 ? (
              <EmptyState icon="farm" title={t('farms.empty')} />
            ) : (
              // P0bis.3b — two farm cards per row as soon as the panel can hold
              // two. In the map reading the panel is a third of the screen, so
              // this is normally one column; it earns its keep the moment the
              // seam is dragged, which is exactly when a stretched row looks
              // emptiest.
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
          </>
        )
      }
    </MapPanel>
  )
}

/**
 * U8 (2026-09-02) — THE LIVING TILE. The photo takes the tile's whole height,
 * edge to edge, and it is the tile's second click zone: "centre on the map",
 * with a pin badge in its corner saying so. The text zone opens the file.
 * Hover (mouse) or a long press (touch) opens the quick card beside the tile.
 *
 * ★★ Y4 (2026-09-04) — THE SHAPE IS `ListTile` NOW, SHARED WITH THE FOUR
 *    OTHER LISTS, and the photo has moved to the PHYSICAL RIGHT with it. U8
 *    put it on the physical left and said so in as many words; the product
 *    owner has asked four times for the other side, which is where a Hebrew
 *    reader's eye starts. See `ListTile` for why that is a matter of child
 *    ORDER rather than of a direction-specific class.
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
    <ListTile
      testId="farm-tile"
      photo={farm.photo}
      name={farm.name}
      active={active}
      onOpen={onOpen}
      onCentre={onCenter}
      centreLabel={t('farms.centerOnMap')}
      openLabel={t('farms.openFile')}
      hoverProps={{
        ...previewProps,
        onMouseEnter: () => onHover(farm.id),
        onMouseLeave: () => onHover(null),
      }}
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
    </ListTile>
  )
}

const TABLE_ROW_HEIGHT = 56

/**
 * G7 → X5 — the roster reading of the farms: one row per farm, window-
 * virtualised, with a sticky header. The columns are the shared roster grid
 * (`.roster` / `.roster-farms` in index.css), so header and rows cannot drift
 * and the tiers are asked of the TABLE's own width rather than the window's.
 */
function FarmsTableHead() {
  const { t } = useTranslation()
  return (
    <div className="roster roster-farms">
      <div
        className="roster-row rounded-t-card border-b border-edge-subtle
                   bg-surface-overlay/95 px-4 py-1.5 backdrop-blur"
      >
        <RosterHead label={t('missions.farm')} />
        <RosterHead label={t('volunteers.colLocality')} tier="lg" />
        <RosterHead label={t('farms.colRegion')} tier="xl" />
        <RosterHead label={t('farms.colType')} tier="lg" />
        <RosterHead label={t('farms.colStatus')} tier="md" />
        <RosterHead label={t('farms.colDunams')} tier="xl" />
        <RosterHead label={t('farms.colContacts')} tier="xl" />
        <RosterHead label={t('farms.nextVisit')} tier="md" />
        <RosterHead label="" className="text-end" />
      </div>
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
    <div className="roster roster-farms card lg:rounded-t-none">
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
              className="roster-row border-b border-edge-subtle/50 px-4 text-start
                         transition-colors duration-fast hover:bg-surface-high/60"
            >
              {/* 1 — name, with whatever has lost its column merged under it. */}
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar photo={farm.photo} name={farm.name} size="xs" shape="square" />
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span data-merge="md" style={{ ['--col-display' as string]: 'inline-block' }}>
                      <FarmStatusDot status={farm.status} />
                    </span>
                    <span className="truncate text-caption font-medium text-content-primary">
                      {farm.name}
                    </span>
                  </span>
                  <span
                    className="muted block truncate"
                    title={`${farm.locality} · ${farm.region} · ${t(`farmType.${farm.type}`)}`}
                  >
                    <span data-merge="lg" style={{ ['--col-display' as string]: 'inline' }}>
                      {farm.locality} · {t(`farmType.${farm.type}`)}
                    </span>
                    <span data-merge="xl" style={{ ['--col-display' as string]: 'inline' }}>
                      {' '}· {farm.region}
                    </span>
                  </span>
                </span>
              </span>

              {/* 2 — locality */}
              <span data-col="lg" className="truncate text-caption text-content-secondary">
                {farm.locality}
              </span>

              {/* 3 — region */}
              <span data-col="xl" className="truncate text-caption text-content-secondary">
                {farm.region}
              </span>

              {/* 4 — type */}
              <span data-col="lg" className="truncate text-caption text-content-secondary">
                {t(`farmType.${farm.type}`)}
              </span>

              {/* 5 — status */}
              <span data-col="md">
                <FarmStatusChip status={farm.status} />
              </span>

              {/* 6 — dunams */}
              <span data-col="xl" className="ltr-nums numeric truncate text-caption text-content-secondary">
                {dunams(farm.farmDunams)} / {dunams(farm.grazingDunams)}
              </span>

              {/* 7 — contacts */}
              <span data-col="xl" className="numeric truncate text-caption text-content-secondary">
                {farm.contacts.length}
              </span>

              {/* 8 — next visit */}
              <span data-col="md" className="ltr-nums truncate text-micro text-content-muted">
                {farm.nextVisitAt
                  ? formatDate(farm.nextVisitAt, locale)
                  : t('farms.noVisitYet')}
              </span>

              {/* 9 — the way in */}
              <span data-actions="" className="flex items-center justify-end text-content-muted/60">
                <ChevronForward size={14} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
