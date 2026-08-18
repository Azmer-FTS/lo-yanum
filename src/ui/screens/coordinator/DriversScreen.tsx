import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  getDrivers,
  getDriverStats,
  getTonightBookedDriverIds,
  telHref,
  whatsappHref,
} from '@core/index'
import type { Driver } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import {
  EmptyState,
  KpiFilter,
  PageHeader,
  SearchInput,
  Stat,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
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
  const [editing, setEditing] = useState<Driver | null>(null)
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
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

  const anyFilter = sevenPlus || freeTonight

  const { listRef, virtualizer, margin } = useWindowTable(
    filtered.length,
    () => ROW_HEIGHT,
  )

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

  return (
    <>
      {/* G14d/A51 — the whole top rides the page from lg, exactly like the
          volunteers roster: title, KPI-filters, search, column headers. */}
      <div
        className="-mx-4 bg-surface-base px-4 sm:-mx-6 sm:px-6 2xl:-mx-8 2xl:px-8 lg:sticky lg:z-20"
        style={{ top: 'var(--shell-top, 0px)' }}
      >
        <PageHeader
          title={
            <span className="flex items-center gap-2.5">
              <span className="text-accent-ink">
                <Icon name="steering" size={26} />
              </span>
              {t('driver.volunteerDrivers')}
            </span>
          }
          subtitle={t('driver.rosterSubtitle')}
          actions={
            <button
              type="button"
              className="btn-primary"
              onClick={() => setCreating(true)}
            >
              <Icon name="userPlus" size={15} />
              {t('driver.addDriver')}
            </button>
          }
        />

        {/* G14d — the cards are the filters. "Total" clears; the seat sum is
            a reading, not a filter, so it stays a plain Stat. */}
        <div className="mb-3 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <KpiFilter
            label={t('driver.statsTotal')}
            value={stats.total}
            icon="steering"
            active={!anyFilter}
            onClick={() => {
              setSevenPlus(false)
              setFreeTonight(false)
            }}
          />
          <Stat
            label={t('driver.statsSeats')}
            value={stats.totalSeats}
            tone="accent"
            icon="users"
          />
          <KpiFilter
            label={t('driver.statsSevenPlus')}
            value={stats.sevenPlusSeats}
            icon="car"
            active={sevenPlus}
            onClick={() => setSevenPlus((v) => !v)}
          />
          <KpiFilter
            label={t('driver.statsFreeTonight')}
            value={stats.freeTonight}
            tone="good"
            icon="moon"
            active={freeTonight}
            onClick={() => setFreeTonight((v) => !v)}
          />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-80">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={t('common.search')}
            />
          </div>
          <p className="muted">{t('driver.count', { count: filtered.length })}</p>
          {anyFilter && (
            <button
              type="button"
              onClick={() => {
                setSevenPlus(false)
                setFreeTonight(false)
              }}
              className="filter-pill border-edge-strong text-content-primary hover:border-status-danger"
            >
              <Icon name="close" size={11} />
              {t('common.clear')}
            </button>
          )}
        </div>

        {filtered.length > 0 && (
          <div
            className="hidden items-center gap-3 rounded-t-card border-b border-edge-subtle
                       bg-surface-overlay/95 px-4 py-2.5 backdrop-blur lg:flex"
          >
            <HeaderCell label={t('volunteers.colName')} className="w-56" />
            <HeaderCell label={t('driver.vehicle')} className="w-52" />
            <HeaderCell label={t('driver.seats')} className="w-16" />
            <HeaderCell label={t('volunteers.colLocality')} className="w-32" />
            <HeaderCell label={t('volunteers.colPhone')} className="w-36" />
            <HeaderCell
              label={t('driver.availabilityNote')}
              className="hidden flex-1 xl:block"
            />
            <HeaderCell
              label={t('volunteers.colActions')}
              className="ms-auto"
            />
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="car" title={t('driver.empty')} />
      ) : (
        <div className="card lg:rounded-t-none">
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
                  className="flex items-center border-b border-edge-subtle/50 px-4
                             transition-colors duration-fast hover:bg-surface-high/60"
                >
                  {/* Desktop: dense table row */}
                  <div className="hidden w-full items-center gap-3 lg:flex">
                    <div className="flex w-56 min-w-0 items-center gap-2.5">
                      <Avatar photo={d.photo} name={d.name} size="xs" />
                      <p className="min-w-0 flex-1 truncate text-caption font-medium text-content-primary">
                        {d.name}
                      </p>
                      {d.volunteerId && (
                        <span
                          className="shrink-0 text-status-violet-ink"
                          title={t('driver.alsoVolunteer')}
                          aria-label={t('driver.alsoVolunteer')}
                        >
                          <Icon name="shield" size={13} />
                        </span>
                      )}
                    </div>
                    <span className="w-52 truncate text-caption text-content-secondary">
                      {d.vehicle || t('driver.privateCar')}
                    </span>
                    <span className="numeric w-16 text-caption text-content-primary">
                      {d.seats}
                    </span>
                    <span className="w-32 truncate text-caption text-content-secondary">
                      {d.locality}
                    </span>
                    <span className="ltr-nums w-36 whitespace-nowrap text-micro text-content-secondary">
                      {d.phone}
                    </span>
                    <span className="hidden min-w-0 flex-1 truncate text-micro text-content-muted xl:block">
                      {d.availabilityNote || '—'}
                    </span>
                    <span className="ms-auto flex shrink-0 items-center gap-1">
                      <a
                        href={telHref(d.phone)}
                        aria-label={t('common.call')}
                        title={t('common.call')}
                        className="rounded-field p-1.5 text-content-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-content-primary"
                      >
                        <Icon name="phone" size={16} />
                      </a>
                      <a
                        href={whatsappHref(d.phone)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t('common.whatsapp')}
                        title={t('common.whatsapp')}
                        className="rounded-field p-1.5 text-content-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-content-primary"
                      >
                        <Icon name="whatsapp" size={16} />
                      </a>
                      <button
                        type="button"
                        onClick={() => setEditing(d)}
                        aria-label={t('common.edit')}
                        title={t('common.edit')}
                        className="rounded-field p-1.5 text-content-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-content-primary"
                      >
                        <Icon name="edit" size={16} />
                      </button>
                    </span>
                  </div>

                  {/* Mobile: compact card row */}
                  <div className="flex w-full items-center gap-3 lg:hidden">
                    <Avatar photo={d.photo} name={d.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-caption font-medium text-content-primary">
                          {d.name}
                        </p>
                        {d.volunteerId && (
                          <span className="shrink-0 text-status-violet-ink">
                            <Icon name="shield" size={12} />
                          </span>
                        )}
                      </div>
                      <p className="truncate text-micro text-content-muted">
                        {d.vehicle || t('driver.privateCar')} ·{' '}
                        <span className="numeric">{d.seats}</span>{' '}
                        {t('driver.seats')} · {d.locality}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      <a
                        href={telHref(d.phone)}
                        aria-label={t('common.call')}
                        className="rounded-field p-2 text-content-muted hover:bg-surface-high hover:text-content-primary"
                      >
                        <Icon name="phone" size={16} />
                      </a>
                      <button
                        type="button"
                        onClick={() => setEditing(d)}
                        aria-label={t('common.edit')}
                        className="rounded-field p-2 text-content-muted hover:bg-surface-high hover:text-content-primary"
                      >
                        <Icon name="edit" size={16} />
                      </button>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {creating && <DriverFormModal driver={null} onClose={() => setCreating(false)} />}
      {editing && (
        <DriverFormModal driver={editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}
