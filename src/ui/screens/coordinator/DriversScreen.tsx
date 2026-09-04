import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import {
  deleteDriver,
  getDrivers,
  getDriverStats,
  getTonightBookedDriverIds,
  regionOfLocality,
  telHref,
  mailtoHref,
  whatsappHref,
} from '@core/index'
import type { Driver, RegionId } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { useConfirmDelete } from '../../components/ConfirmDelete'
import { Icon } from '../../components/Icon'
import { ListTile } from '../../components/ListTile'
import { OverflowMenu } from '../../components/OverflowMenu'
import { RegionFilter } from '../../components/RegionFilter'
import { RosterHead, RowAction } from '../../components/roster'
import {
  EmptyState,
  KpiChip,
  ListTop,
  LoadMore,
} from '../../components/primitives'
import { PeopleMap } from '../../components/PeopleMap'
import { MapSplit } from '../../components/MapSplit'
import { useCoreValue } from '../../hooks/useCore'
import { useProgressive } from '../../hooks/useProgressive'
import { useWindowTable } from '../../hooks/useWindowTable'
import { DriverFormModal } from './DriverFormModal'

const ROW_HEIGHT = 56

/**
 * G5.1 → G7 — the volunteer-driver roster, as a FULL-PAGE table.
 *
 * The Lot-0.10 card list was fine at six fixture drivers and wrong at the
 * hundred a real import brings: no columns to scan down, no sticky header,
 * the whole thing inside a centred max-w container. Same treatment as the
 * volunteers now — the window scrolls, the header rides it, and the row grid
 * puts vehicle / seats / locality / availability in fixed columns.
 *
 * The header keeps its identity (the steering wheel, the "נהגים מתנדבים"
 * title): drivers are volunteers too, and the programme's habit of treating
 * them as an afterthought of the guard wizard is what this screen ends.
 * Dual hats appear with their own chip — same human, both rosters.
 */
export function DriversScreen() {
  const { t } = useTranslation()
  const drivers = useCoreValue(getDrivers)
  const stats = useCoreValue(getDriverStats)
  const bookedTonight = useCoreValue(getTonightBookedDriverIds)

  const [query, setQuery] = useState('')
  // G14d — the two KPI-filters: big vehicles, free tonight.
  const [sevenPlus, setSevenPlus] = useState(false)
  const [freeTonight, setFreeTonight] = useState(false)
  // P0.2 — set by tapping a bubble on the roster map; composes with the KPIs.
  const [locality, setLocality] = useState<string | null>(null)
  // X12.4 — the standard region, as a filter.
  const [region, setRegion] = useState<RegionId | null>(null)
  const [editing, setEditing] = useState<Driver | null>(null)
  // PO POINT 8.
  const del = useConfirmDelete()
  const [creating, setCreating] = useState(false)

  /** W4 — same seam as the volunteers roster: `?new=1` opens this modal. */
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('new') !== '1') return
    setCreating(true)
    const next = new URLSearchParams(params)
    next.delete('new')
    setParams(next, { replace: true })
  }, [params, setParams])

  /** P0.2 — everything except the locality, so the bubbles keep the neighbours. */
  const beforeLocality = useMemo(() => {
    const q = query.trim().toLowerCase()
    const booked = new Set(bookedTonight)
    return drivers.filter((d) => {
      if (sevenPlus && d.seats < 7) return false
      if (freeTonight && booked.has(d.id)) return false
      if (!q) return true
      return (
        d.name.toLowerCase().includes(q) ||
        d.locality.toLowerCase().includes(q) ||
        d.vehicle.toLowerCase().includes(q) ||
        d.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || ' ')
      )
    })
  }, [drivers, query, sevenPlus, freeTonight, bookedTonight])

  const mapLocalities = useMemo(
    () => beforeLocality.map((d) => d.locality),
    [beforeLocality],
  )

  const filtered = useMemo(
    () =>
      beforeLocality.filter(
        (d) =>
          (locality === null || d.locality === locality) &&
          // X12.4 — a driver's region is his town's, like a volunteer's.
          (region === null || regionOfLocality(d.locality) === region),
      ),
    [beforeLocality, locality, region],
  )

  const anyFilter = sevenPlus || freeTonight || locality !== null || region !== null

  const clearFilters = () => {
    setSevenPlus(false)
    setFreeTonight(false)
    setLocality(null)
    setRegion(null)
  }

  /** X12.4 — per-region counts for the picker's labels. */
  const regionCounts = useMemo(() => {
    const out: Partial<Record<RegionId, number>> = {}
    for (const d of drivers) {
      const id = regionOfLocality(d.locality)
      if (id) out[id] = (out[id] ?? 0) + 1
    }
    return out
  }, [drivers])

  /** ★★ Y4 — the split reading's card column pages the way the others do. */
  const tilePage = useProgressive(filtered)

  const { listRef, virtualizer, margin } = useWindowTable(
    filtered.length,
    () => ROW_HEIGHT,
  )

  return (
    <>
      {/* G14d/A51 — the whole top rides the page from lg, exactly like the
          volunteers roster: title, KPI-filters, search, column headers. */}
      {/* P0bis.1 — the same map-first gabarit as the volunteers roster, in
          its own colour: bubbles physically LEFT, table right, the WINDOW
          still the scroll container so G7's virtualiser is untouched. */}
      <MapSplit
        screenKey="drivers"
        ariaLabel={t('people.mapDrivers')}
        scroll="page"
        contentInFull="unmount"
        contentPercent={62}
        splitHeight="h-[38dvh] min-h-64"
        map={() => (
          <PeopleMap
            localities={mapLocalities}
            selected={locality}
            onSelect={setLocality}
            ariaLabel={t('people.mapDrivers')}
            tone="drivers"
          />
        )}
      >
        {({ mode }) => (
          <>
      <ListTop
        testId="drivers-top"
        title={
          <span className="flex items-center gap-2">
            <span className="text-accent-ink">
              <Icon name="steering" size={20} />
            </span>
            {t('driver.volunteerDrivers')}
          </span>
        }
        count={t('common.showingOf', { shown: filtered.length, total: drivers.length })}
        menu={
          /* X2 — the import link is a row in the "⋯", like every other
             screen's own action. */
          <OverflowMenu
            testId="drivers-menu"
            items={[
              {
                key: 'import',
                label: t('volunteers.import'),
                icon: 'upload',
                to: '/coordinator/import/drivers',
                testId: 'drivers-import',
              },
            ]}
          />
        }
        search={query}
        onSearch={setQuery}
        searchPlaceholder={t('common.search')}
        kpis={
          <>

          <KpiChip
            label={t('driver.statsTotal')}
            value={stats.total}
            icon="steering"
            active={!anyFilter}
            onClick={clearFilters}
          />
          <KpiChip
            label={t('driver.statsSeats')}
            value={stats.totalSeats}
            tone="accent"
            icon="users"
            active={false}
            onClick={clearFilters}
          />
          <KpiChip
            label={t('driver.statsSevenPlus')}
            value={stats.sevenPlusSeats}
            icon="car"
            active={sevenPlus}
            onClick={() => setSevenPlus((v) => !v)}
          />
          <KpiChip
            label={t('driver.statsFreeTonight')}
            value={stats.freeTonight}
            tone="good"
            icon="moon"
            active={freeTonight}
            onClick={() => setFreeTonight((v) => !v)}
          />
        
          </>
        }
        filters={
          <div className="scroll-row items-center">
            <RegionFilter
              value={region}
              onChange={setRegion}
              counts={regionCounts}
              testId="drivers-region"
            />
<p className="muted">{t('driver.count', { count: filtered.length })}</p>
          {/* P0.2 — the tapped bubble reads back as a removable pill. */}
          {locality !== null && (
            <button
              type="button"
              onClick={() => setLocality(null)}
              className="filter-pill filter-pill-active"
            >
              <Icon name="pin" size={11} />
              {locality}
            </button>
          )}
          {anyFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="filter-pill border-edge-strong text-content-primary hover:border-status-danger"
            >
              <Icon name="close" size={11} />
              {t('common.clear')}
            </button>
          )}
        
          </div>
        }
      >
        {/* ★★ Y4 — the column headers belong to the table, so they are drawn
            when the table is. See the volunteers roster. */}
        {filtered.length > 0 && mode === 'hidden' && (
          /* X5 — one `--roster-cols`, worn by this header and by every row. */
          <div className="roster roster-drivers">
          <div
            className="roster-row rounded-t-card border-b border-edge-subtle
                       bg-surface-overlay/95 px-4 py-2.5 backdrop-blur"
          >
            <RosterHead label={t('volunteers.colName')} />
            <RosterHead label={t('driver.vehicle')} tier="lg" />
            <RosterHead label={t('driver.seats')} tier="md" />
            <RosterHead label={t('volunteers.colLocality')} tier="lg" />
            <RosterHead label={t('volunteers.colPhone')} tier="md" />
            {/* P0bis.5a — the address, on the widest reading only. */}
            <RosterHead label={t('form.email')} tier="xl" />
            <RosterHead label={t('driver.availabilityNote')} tier="xl" />
            <RosterHead label={t('volunteers.colActions')} className="text-end" />
          </div>
          </div>
        )}

      </ListTop>

      {/* See the volunteers roster: MapSplit UNMOUNTS this column in `full`
          rather than hiding it, or the window virtualiser measures a
          scrollMargin of 0 and draws its rows a page above themselves. */}
      {filtered.length === 0 ? (
        <EmptyState icon="car" title={t('driver.empty')} />
      ) : mode !== 'hidden' ? (
        /** ★★ Y4 — card-tiles in `split`, exactly as on the four other lists.
         *  See the long note on the volunteers roster for why. */
        <div className="panel-scope">
          <ul className="stagger pair-grid gap-1.5">
            {tilePage.visible.map((d) => (
              <li key={d.id}>
                <ListTile
                  testId="driver-tile"
                  photo={d.photo}
                  name={d.name}
                  onOpen={() => setEditing(d)}
                  openLabel={t('volunteers.colName')}
                >
                  <span className="truncate text-caption font-semibold text-content-primary" title={d.name}>
                    {d.name}
                  </span>
                  <span className="muted block truncate" title={`${d.vehicle ?? ''} · ${d.locality}`}>
                    {[d.vehicle, d.locality].filter(Boolean).join(' · ')}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2.5 text-micro text-content-muted">
                    <span className="ltr-nums whitespace-nowrap">{d.phone}</span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Icon name="users" size={11} />
                      <span className="numeric">{d.seats}</span>
                    </span>
                  </span>
                </ListTile>
              </li>
            ))}
          </ul>
          <LoadMore shown={tilePage.shown} total={tilePage.total} onMore={tilePage.more} />
        </div>
      ) : (
        <div className="roster roster-drivers card lg:rounded-t-none">
          <div
            ref={listRef}
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const d = filtered[item.index]
              return (
                <div
                  key={d.id}
                  style={{
                    position: 'absolute',
                    insetInlineStart: 0,
                    insetInlineEnd: 0,
                    top: 0,
                    height: item.size,
                    transform: `translateY(${item.start - margin}px)`,
                  }}
                  /* X5 — ONE row markup, tracks by container width; see the
                     volunteers roster for why the two-markup version drifted. */
                  className="roster-row border-b border-edge-subtle/50 px-4
                             transition-colors duration-fast hover:bg-surface-high/60"
                >
                  {/* 1 — name, with what has lost its column merged under it. */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar photo={d.photo} name={d.name} size="xs" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-caption font-medium text-content-primary">
                        <span className="truncate">{d.name}</span>
                        {d.volunteerId && (
                          <span
                            className="shrink-0 text-status-violet-ink"
                            title={t('driver.alsoVolunteer')}
                            aria-label={t('driver.alsoVolunteer')}
                          >
                            <Icon name="shield" size={13} />
                          </span>
                        )}
                      </p>
                      <p
                        className="truncate text-micro text-content-muted"
                        title={`${d.vehicle || t('driver.privateCar')} · ${d.seats} · ${d.locality} · ${d.phone}`}
                      >
                        <span data-merge="lg" style={{ ['--col-display' as string]: 'inline' }}>
                          {d.vehicle || t('driver.privateCar')} · {d.locality}
                        </span>
                        <span data-merge="md" style={{ ['--col-display' as string]: 'inline' }}>
                          {' '}· <span className="numeric">{d.seats}</span>{' '}
                          {t('driver.seats')} · <span className="ltr-nums">{d.phone}</span>
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* 2 — vehicle */}
                  <span data-col="lg" className="truncate text-caption text-content-secondary">
                    {d.vehicle || t('driver.privateCar')}
                  </span>

                  {/* 3 — seats */}
                  <span data-col="md" className="numeric truncate text-caption text-content-primary">
                    {d.seats}
                  </span>

                  {/* 4 — locality */}
                  <span data-col="lg" className="truncate text-caption text-content-secondary">
                    {d.locality}
                  </span>

                  {/* 5 — phone */}
                  <span data-col="md" className="ltr-nums truncate text-micro text-content-secondary">
                    {d.phone}
                  </span>

                  {/* 6 — email */}
                  <span data-col="xl" className="min-w-0">
                    {d.email ? (
                      <a
                        href={mailtoHref(d.email)}
                        dir="ltr"
                        title={d.email}
                        className="ltr-nums block truncate text-micro text-content-secondary hover:text-accent-ink hover:underline"
                      >
                        {d.email}
                      </a>
                    ) : (
                      <span className="text-micro text-content-muted/50">—</span>
                    )}
                  </span>

                  {/* 7 — availability note */}
                  <span
                    data-col="xl"
                    className="truncate text-micro text-content-muted"
                    title={d.availabilityNote || undefined}
                  >
                    {d.availabilityNote || '—'}
                  </span>

                  {/* 8 — actions */}
                  <span data-actions="" className="flex items-center justify-end gap-0.5">
                    <RowAction
                      icon="phone"
                      href={telHref(d.phone)}
                      label={t('common.call')}
                    />
                    <span data-col="md" style={{ ['--col-display' as string]: 'contents' }}>
                      <RowAction
                        icon="whatsapp"
                        href={whatsappHref(d.phone)}
                        external
                        label={t('common.whatsapp')}
                      />
                      {d.email && (
                        <RowAction
                          icon="mail"
                          href={mailtoHref(d.email)}
                          label={t('common.email')}
                        />
                      )}
                    </span>
                    <RowAction
                      icon="edit"
                      onClick={() => setEditing(d)}
                      testId="driver-edit"
                      label={t('common.edit')}
                    />
                    {/* PO POINT 8 — refused while he is driving anybody, and for
                        a DUAL HAT the alternative offered is to take the driver
                        hat off rather than to delete a volunteer. */}
                    <RowAction
                      icon="trash"
                      danger
                      onClick={() => del.ask('driver', d.id, () => deleteDriver(d.id))}
                      testId="driver-delete"
                      label={t('deletion.action')}
                    />
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
          </>
        )}
      </MapSplit>

      {creating && <DriverFormModal driver={null} onClose={() => setCreating(false)} />}
      {del.dialog}
      {editing && (
        <DriverFormModal driver={editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}
