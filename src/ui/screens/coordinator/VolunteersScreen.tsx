import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import {
  archiveVolunteer,
  formatDate,
  getVolunteerStats,
  getVolunteers,
  mailtoHref,
  deleteVolunteer,
  reactivateVolunteer,
} from '@core/index'
import type { PhoneType, Volunteer, VolunteerStatus } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { useConfirmDelete } from '../../components/ConfirmDelete'
import { ContactButtons } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { PhoneTypeChip, VolunteerStatusChip } from '../../components/badges'
import { PeopleMap } from '../../components/PeopleMap'
import { MapSplit } from '../../components/MapSplit'
import { OverflowMenu } from '../../components/OverflowMenu'
import {
  EmptyState,
  FilterPill,
  KpiChip,
  ListTop,
  Modal,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'
import { useWindowTable } from '../../hooks/useWindowTable'
import { VolunteerFormModal } from './VolunteerFormModal'

type SortKey =
  | 'name'
  | 'yeshiva'
  | 'locality'
  | 'guardsCount'
  | 'status'
  | 'lastActivityAt'

interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

/**
 * Fuzzy-ish subsequence match: "ארכה" finds "אריאל כהן".
 * Cheap enough to run over 300 rows on every keystroke without debouncing.
 */
function matches(haystack: string, needle: string): boolean {
  if (haystack.includes(needle)) return true
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return false
}

const ROW_HEIGHT = 56

export function VolunteersScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const volunteers = useCoreValue(getVolunteers)
  const stats = useCoreValue(getVolunteerStats)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<VolunteerStatus | null>(null)
  const [phoneType, setPhoneType] = useState<PhoneType | null>(null)
  // G14d — the two KPI-only filters: licence AND car, never guarded.
  const [licenseCar, setLicenseCar] = useState(false)
  const [neverGuarded, setNeverGuarded] = useState(false)
  const [yeshiva, setYeshiva] = useState<string | null>(null)
  // P0.2 — the locality filter is set by tapping a bubble on the map, and it
  // composes with every KPI-filter above it.
  const [locality, setLocality] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' })
  const [grouped, setGrouped] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const [archiving, setArchiving] = useState<Volunteer | null>(null)
  // PO POINT 8 — the delete the product owner had no way to perform.
  const del = useConfirmDelete()
  const [editing, setEditing] = useState<Volunteer | null | 'new'>(null)

  /**
   * W4 — THE UNIFIED "+" ASKS THROUGH THE URL. The floating button lives in
   * the shell and this modal's setter lives here, so `?new=1` is the seam:
   * the menu navigates to `…/volunteers?new=1` from ANY screen, this opens
   * the form and takes the flag straight back out of the address so a reload
   * or a back does not reopen it.
   */
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('new') !== '1') return
    setEditing('new')
    const next = new URLSearchParams(params)
    next.delete('new')
    setParams(next, { replace: true })
  }, [params, setParams])
  const [history, setHistory] = useState<Volunteer | null>(null)

  const yeshivot = useMemo(
    () => [...new Set(volunteers.map((v) => v.yeshiva))].sort(),
    [volunteers],
  )

  /**
   * P0.2 — everything EXCEPT the locality filter. The map's bubbles are
   * counted from this, so they keep showing the neighbouring towns after one
   * is picked; the table then applies the locality on top.
   */
  const beforeLocality = useMemo(() => {
    const q = query.trim().toLowerCase()
    return volunteers.filter((v) => {
      if (status !== null && v.status !== status) return false
      if (phoneType !== null && v.phoneType !== phoneType) return false
      if (licenseCar && !(v.hasLicense && v.hasCar)) return false
      if (neverGuarded && v.guardsCount !== 0) return false
      if (yeshiva !== null && v.yeshiva !== yeshiva) return false
      if (!q) return true
      return (
        matches(v.name.toLowerCase(), q) ||
        matches(v.yeshiva.toLowerCase(), q) ||
        matches(v.locality.toLowerCase(), q) ||
        v.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || ' ')
      )
    })
  }, [volunteers, query, status, phoneType, licenseCar, neverGuarded, yeshiva])

  const mapLocalities = useMemo(
    () => beforeLocality.map((v) => v.locality),
    [beforeLocality],
  )

  const filtered = useMemo(() => {
    const rows =
      locality === null
        ? beforeLocality
        : beforeLocality.filter((v) => v.locality === locality)

    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case 'guardsCount':
          return (a.guardsCount - b.guardsCount) * dir
        case 'lastActivityAt': {
          // Never-active volunteers always sink to the bottom, either way.
          const av = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : -1
          const bv = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : -1
          return (av - bv) * dir
        }
        default:
          return String(a[sort.key]).localeCompare(String(b[sort.key]), 'he') * dir
      }
    })
  }, [beforeLocality, locality, sort])

  /**
   * Flatten groups into a single virtualised list. Headers and rows share one
   * scroll container, so grouping costs nothing in scroll performance.
   */
  type Row =
    | { kind: 'header'; yeshiva: string; count: number }
    | { kind: 'row'; volunteer: Volunteer }

  const rows: Row[] = useMemo(() => {
    if (!grouped) {
      return filtered.map((volunteer) => ({ kind: 'row', volunteer }) as Row)
    }
    const byYeshiva = new Map<string, Volunteer[]>()
    for (const v of filtered) {
      const list = byYeshiva.get(v.yeshiva) ?? []
      list.push(v)
      byYeshiva.set(v.yeshiva, list)
    }
    const out: Row[] = []
    for (const [name, members] of [...byYeshiva.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'he'),
    )) {
      out.push({ kind: 'header', yeshiva: name, count: members.length })
      if (!collapsed.has(name)) {
        for (const volunteer of members) out.push({ kind: 'row', volunteer })
      }
    }
    return out
  }, [filtered, grouped, collapsed])

  /**
   * G7 — WINDOW virtualisation: the page scrolls, not a box inside it.
   *
   * The Lot-0 table lived in a `min(62vh, 40rem)` container, which was two
   * scrollbars on one screen and a table that used barely half of a 1376 px
   * iPad. The scroll element is now the window itself; the shared hook
   * measures where the list starts so the KPI strip and the filter bar above
   * it scroll away naturally, and ~300 rows still render as ~25 DOM nodes.
   */
  const { listRef, virtualizer, margin } = useWindowTable(rows.length, (i) =>
    rows[i].kind === 'header' ? 44 : ROW_HEIGHT,
  )

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )
  }

  const SortHeader = ({
    label,
    sortKey,
    className = '',
  }: {
    label: string
    sortKey: SortKey
    className?: string
  }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortKey)}
      aria-label={t('a11y.sortColumn', { column: label })}
      className={`flex items-center gap-1 text-start text-micro font-semibold uppercase tracking-wide
                  text-content-muted transition-colors duration-fast hover:text-content-primary ${className}`}
    >
      {label}
      <Icon
        name={
          sort.key !== sortKey ? 'sort' : sort.dir === 'asc' ? 'sortAsc' : 'sortDesc'
        }
        size={13}
        className={sort.key === sortKey ? 'text-accent-ink' : 'opacity-40'}
      />
    </button>
  )

  const activityLabel = (v: Volunteer) =>
    v.lastActivityAt ? formatDate(v.lastActivityAt, locale) : t('volunteers.neverActive')

  /**
   * G3.4's soft preferences, compressed to a cell. The default (everything
   * true) is the common case and prints as one word — a column of "בכל זמן"
   * with the exceptions standing out is the actually useful rendering.
   */
  const availabilitySummary = (v: Volunteer) => {
    const a = v.availability
    if (a.nights && a.days && a.weekends) return t('volunteers.availabilityAlways')
    const parts = [
      a.nights ? t('form.availNights') : null,
      a.days ? t('form.availDays') : null,
      a.weekends ? t('form.availWeekends') : null,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : '—'
  }

  const anyFilter =
    status !== null ||
    phoneType !== null ||
    yeshiva !== null ||
    locality !== null ||
    licenseCar ||
    neverGuarded

  const clearFilters = () => {
    setStatus(null)
    setPhoneType(null)
    setYeshiva(null)
    setLocality(null)
    setLicenseCar(false)
    setNeverGuarded(false)
  }

  return (
    <>
      {/* G14d/A51 — the WHOLE top is one sticky block from lg: title, the
          KPI-filters, the search bar and the column headers ride the page
          together, so at row 250 of 300 the coordinator still has every
          control. Below lg it scrolls away — a phone cannot afford a 300 px
          pin. `bg-surface-base` + the negative margins make it opaque out to
          the shell's own padding, or the rows would show at the sides. */}
      {/* P0bis.1 — the roster joins the map-first gabarit: bubbles on the
          physical LEFT, the table on the right. `scroll="page"` is what makes
          that possible without undoing G7 — the WINDOW stays the scroll
          container and the MAP column is the sticky one. */}
      <MapSplit
        screenKey="volunteers"
        ariaLabel={t('people.mapVolunteers')}
        scroll="page"
        contentInFull="unmount"
        contentPercent={62}
        splitHeight="h-[38dvh] min-h-64"
        map={() => (
          <PeopleMap
            localities={mapLocalities}
            selected={locality}
            onSelect={setLocality}
            ariaLabel={t('people.mapVolunteers')}
            tone="volunteers"
          />
        )}
      >
        {() => (
          <>
      <ListTop
        testId="volunteers-top"
        title={t('volunteers.title')}
        count={t('common.showingOf', {
          shown: filtered.length,
          total: volunteers.length,
        })}
        menu={
          <OverflowMenu
            testId="volunteers-menu"
            items={[
              {
                key: 'import',
                label: t('volunteers.import'),
                icon: 'upload',
                to: '/coordinator/import/volunteers',
                testId: 'volunteers-import',
              },
              {
                key: 'group',
                label: t('volunteers.groupToggle'),
                icon: 'layers',
                checked: grouped,
                onClick: () => setGrouped((g) => !g),
                testId: 'volunteers-group',
              },
            ]}
          />
        }
        search={query}
        onSearch={setQuery}
        searchPlaceholder={t('volunteers.searchPlaceholder')}
        kpis={
          <>

          <KpiChip
            label={t('volunteerStatus.active')}
            value={stats.active}
            tone="good"
            icon="users"
            active={status === 'active'}
            onClick={() => setStatus(status === 'active' ? null : 'active')}
          />
          <KpiChip
            label={t('volunteerStatus.inactive')}
            value={stats.inactive}
            icon="moon"
            active={status === 'inactive'}
            onClick={() => setStatus(status === 'inactive' ? null : 'inactive')}
          />
          <KpiChip
            label={t('volunteers.statsSmartphone')}
            value={stats.smartphone}
            icon="phone"
            active={phoneType === 'smartphone'}
            onClick={() =>
              setPhoneType(phoneType === 'smartphone' ? null : 'smartphone')
            }
          />
          <KpiChip
            label={t('volunteers.statsKosher')}
            value={stats.kosher}
            tone="accent"
            icon="phoneBasic"
            active={phoneType === 'kosher'}
            onClick={() =>
              setPhoneType(phoneType === 'kosher' ? null : 'kosher')
            }
          />
          <KpiChip
            label={t('volunteers.statsLicenseCar')}
            value={stats.licenseCar}
            icon="car"
            active={licenseCar}
            onClick={() => setLicenseCar((v) => !v)}
          />
          <KpiChip
            label={t('volunteers.statsNeverGuarded')}
            value={stats.neverGuarded}
            icon="history"
            active={neverGuarded}
            onClick={() => setNeverGuarded((v) => !v)}
          />
        
          </>
        }
        filters={
          <div className="scroll-row items-center">
          {/* G14d — only the yeshiva pills remain: they have no KPI card. The
              status and phone pills were the cards' redundant twins. */}
          {yeshivot.map((y) => (
            <FilterPill
              key={y}
              active={yeshiva === y}
              onClick={() => setYeshiva(yeshiva === y ? null : y)}
              count={stats.byYeshiva.find((b) => b.yeshiva === y)?.count}
            >
              {y}
            </FilterPill>
          ))}
          {/* P0.2 — the tapped bubble reads back as a removable pill, so a
              filter set on the map is visible once the map has scrolled off. */}
          {locality !== null && (
            <FilterPill active onClick={() => setLocality(null)}>
              <Icon name="pin" size={11} />
              {locality}
            </FilterPill>
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
        {filtered.length > 0 && (
          <div
            className="hidden items-center gap-3 rounded-t-card border-b border-edge-subtle
                       bg-surface-overlay/95 px-4 py-2.5 backdrop-blur lg:flex"
          >
            <SortHeader label={t('volunteers.colName')} sortKey="name" className="w-56" />
            <SortHeader
              label={t('volunteers.colYeshiva')}
              sortKey="yeshiva"
              className="w-44"
            />
            <SortHeader
              label={t('volunteers.colLocality')}
              sortKey="locality"
              className="w-32"
            />
            <span className="w-40 text-micro font-semibold uppercase tracking-wide text-content-muted">
              {t('volunteers.colPhone')}
            </span>
            {/* P0bis.5a — the address, at 2xl only. It is a column the
                coordinator scans rarely and a channel the sending centre uses
                constantly, so it earns a place on the widest reading and
                nowhere else; below that its absence is visible as a struck
                envelope in the actions. */}
            <span className="hidden w-48 text-micro font-semibold uppercase tracking-wide text-content-muted 2xl:block">
              {t('form.email')}
            </span>
            {/* G7 — the staffing columns: can he drive, when can he come.
                xl-only; at lg the row is already full and these answers live
                one click away in the form. */}
            <span className="hidden w-20 text-micro font-semibold uppercase tracking-wide text-content-muted xl:block">
              {t('volunteers.colLicenseCar')}
            </span>
            <span className="hidden w-36 text-micro font-semibold uppercase tracking-wide text-content-muted xl:block">
              {t('volunteers.colAvailability')}
            </span>
            <SortHeader
              label={t('volunteers.colGuards')}
              sortKey="guardsCount"
              className="w-20"
            />
            <SortHeader
              label={t('volunteers.colStatus')}
              sortKey="status"
              className="w-24"
            />
            <SortHeader
              label={t('volunteers.colLastActivity')}
              sortKey="lastActivityAt"
              className="w-28"
            />
            <span className="ms-auto text-micro font-semibold uppercase tracking-wide text-content-muted">
              {t('volunteers.colActions')}
            </span>
          </div>
        )}
      
      </ListTop>

      {/* MapSplit unmounts this whole column in `full` (`contentInFull`)
          rather than hiding it: a window-virtualised list whose container is
          `display:none` measures a scrollMargin of 0 and comes back drawing
          its rows a page above themselves. */}
      {filtered.length === 0 ? (
        <EmptyState icon="users" title={t('volunteers.empty')} />
      ) : (
        <div className="card lg:rounded-t-none">
          {/* The window is the scroll container (G7); this div only maps the
              virtual coordinate space. */}
          <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index]

                const style = {
                  position: 'absolute' as const,
                  insetInlineStart: 0,
                  insetInlineEnd: 0,
                  top: 0,
                  height: item.size,
                  transform: `translateY(${item.start - margin}px)`,
                }

                if (row.kind === 'header') {
                  const isCollapsed = collapsed.has(row.yeshiva)
                  return (
                    <div key={item.key} style={style} className="px-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev)
                            if (next.has(row.yeshiva)) next.delete(row.yeshiva)
                            else next.add(row.yeshiva)
                            return next
                          })
                        }
                        className="flex h-full w-full items-center gap-2 rounded-field bg-surface-high/70 px-3
                                   text-caption font-semibold text-content-primary
                                   transition-colors duration-fast hover:bg-surface-high"
                      >
                        <Icon
                          name="chevronDown"
                          size={15}
                          className={`transition-transform duration-fast ${
                            isCollapsed ? 'rtl:rotate-90 ltr:-rotate-90' : ''
                          }`}
                        />
                        {row.yeshiva}
                        <span className="numeric chip bg-accent/15 text-accent-ink">
                          {row.count}
                        </span>
                      </button>
                    </div>
                  )
                }

                const v = row.volunteer
                return (
                  <div
                    key={item.key}
                    style={style}
                    className="flex items-center border-b border-edge-subtle/50 px-4
                               transition-colors duration-fast hover:bg-surface-high/60"
                  >
                    {/* Desktop: dense table row */}
                    <div className="hidden w-full items-center gap-3 lg:flex">
                      <div className="flex w-56 min-w-0 items-center gap-2.5">
                        <Avatar photo={v.photo} name={v.name} size="xs" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate text-caption font-medium text-content-primary">
                            {v.name}
                            {/* G5.2 — the dual hat, visible in BOTH rosters. */}
                            {v.canDrive && (
                              <span
                                className="shrink-0 text-accent-ink"
                                title={t('form.canDrive')}
                                aria-label={t('form.canDrive')}
                              >
                                <Icon name="steering" size={13} />
                              </span>
                            )}
                          </p>
                          <p className="truncate text-micro text-content-muted">
                            {t('volunteers.age')}{' '}
                            <span className="ltr-nums">{v.age}</span>
                          </p>
                        </div>
                      </div>
                      <span className="w-44 truncate text-caption text-content-secondary">
                        {v.yeshiva}
                      </span>
                      <span className="w-32 truncate text-caption text-content-secondary">
                        {v.locality}
                      </span>
                      {/* Icon rather than the full chip: the label would wrap
                          the number onto a second line and break the row grid. */}
                      <span className="flex w-40 items-center gap-2">
                        <span
                          title={t(`phoneType.${v.phoneType}`)}
                          className={
                            v.phoneType === 'kosher'
                              ? 'text-accent-ink'
                              : 'text-status-info-ink'
                          }
                        >
                          <Icon
                            name={
                              v.phoneType === 'kosher' ? 'phoneBasic' : 'phone'
                            }
                            size={14}
                          />
                        </span>
                        <span className="ltr-nums whitespace-nowrap text-micro text-content-secondary">
                          {v.phone}
                        </span>
                      </span>
                      <span className="hidden w-48 items-center gap-1.5 2xl:flex">
                        {v.email ? (
                          <a
                            href={mailtoHref(v.email)}
                            dir="ltr"
                            title={v.email}
                            className="ltr-nums truncate text-micro text-content-secondary hover:text-accent-ink hover:underline"
                          >
                            {v.email}
                          </a>
                        ) : (
                          <span className="text-micro text-content-muted/50">—</span>
                        )}
                      </span>
                      {/* G7 — licence + car at a glance: green means "has it",
                          the faded icon means "does not", so a column of 300
                          scans without reading a word. */}
                      <span className="hidden w-20 items-center gap-2.5 xl:flex">
                        <span
                          title={t('form.hasLicense')}
                          aria-label={t('form.hasLicense')}
                          className={
                            v.hasLicense
                              ? 'text-status-success-ink'
                              : 'text-content-muted/30'
                          }
                        >
                          <Icon name="document" size={14} />
                        </span>
                        <span
                          title={t('form.hasCar')}
                          aria-label={t('form.hasCar')}
                          className={
                            v.hasCar
                              ? 'text-status-success-ink'
                              : 'text-content-muted/30'
                          }
                        >
                          <Icon name="car" size={14} />
                        </span>
                      </span>
                      <span className="hidden w-36 truncate text-micro text-content-secondary xl:block">
                        {availabilitySummary(v)}
                      </span>
                      <span className="numeric w-20 text-caption text-content-primary">
                        {v.guardsCount}
                      </span>
                      <span className="w-24">
                        <VolunteerStatusChip status={v.status} />
                      </span>
                      <span className="ltr-nums w-28 text-micro text-content-muted">
                        {activityLabel(v)}
                      </span>
                      <span className="ms-auto flex items-center gap-1">
                        <RowAction
                          icon="edit"
                          label={t('common.edit')}
                          onClick={() => setEditing(v)}
                        />
                        <RowAction
                          icon="history"
                          label={t('volunteers.history')}
                          onClick={() => setHistory(v)}
                        />
                        {v.status === 'active' ? (
                          <RowAction
                            icon="close"
                            label={t('volunteers.archive')}
                            onClick={() => setArchiving(v)}
                          />
                        ) : (
                          <RowAction
                            icon="check"
                            label={t('volunteers.reactivate')}
                            onClick={() => reactivateVolunteer(v.id)}
                          />
                        )}
                        {/* PO POINT 8 — DELETE IS NOT ARCHIVE, and until now
                            the archive action wore the bin icon, which is
                            exactly the confusion this row had to stop making.
                            Archiving keeps a volunteer's nights; deleting is
                            for the row that was typed by mistake, and it is
                            refused the moment he has a night. */}
                        <RowAction
                          icon="trash"
                          danger
                          testId="volunteer-delete"
                          label={t('deletion.action')}
                          onClick={() =>
                            del.ask('volunteer', v.id, () => deleteVolunteer(v.id))
                          }
                        />
                      </span>
                    </div>

                    {/* Mobile: compact card */}
                    <div className="flex w-full items-center gap-3 lg:hidden">
                      <Avatar photo={v.photo} name={v.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-caption font-medium text-content-primary">
                            {v.name}
                          </p>
                          <PhoneTypeChip type={v.phoneType} />
                        </div>
                        <p className="truncate text-micro text-content-muted">
                          {v.yeshiva} · {v.locality} ·{' '}
                          <span className="numeric">{v.guardsCount}</span>{' '}
                          {t('volunteers.colGuards')}
                        </p>
                      </div>
                      <ContactButtons name={v.name} phone={v.phone} />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}
          </>
        )}
      </MapSplit>

      {del.dialog}
      {archiving && (
        <ArchiveDialog volunteer={archiving} onClose={() => setArchiving(null)} />
      )}
      {editing !== null && (
        <VolunteerFormModal
          volunteer={editing === 'new' ? null : editing}
          yeshivot={yeshivot}
          onClose={() => setEditing(null)}
        />
      )}
      {history && (
        <HistoryDialog volunteer={history} onClose={() => setHistory(null)} />
      )}
    </>
  )
}

function RowAction({
  icon,
  label,
  onClick,
  testId,
  danger = false,
}: {
  icon: 'edit' | 'history' | 'trash' | 'check' | 'close'
  label: string
  onClick: () => void
  testId?: string
  /** PO POINT 8 — a delete is not the same weight as a history button. */
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      data-testid={testId}
      className={`rounded-field p-1.5 transition-colors duration-fast ${
        danger
          ? 'text-content-muted hover:bg-status-danger/10 hover:text-status-danger-ink'
          : 'text-content-muted hover:bg-surface-overlay hover:text-content-primary'
      }`}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

function ArchiveDialog({
  volunteer,
  onClose,
}: {
  volunteer: Volunteer
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')

  return (
    <Modal title={t('volunteers.archiveTitle')} onClose={onClose}>
      <p className="mb-3 text-caption text-content-secondary">{volunteer.name}</p>
      <label className="block">
        <span className="label">{t('volunteers.archiveReason')}</span>
        <textarea
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('volunteers.archiveReasonPlaceholder')}
        />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={reason.trim().length === 0}
          onClick={() => {
            archiveVolunteer(volunteer.id, reason.trim())
            onClose()
          }}
        >
          {t('volunteers.archive')}
        </button>
      </div>
    </Modal>
  )
}

function HistoryDialog({
  volunteer,
  onClose,
}: {
  volunteer: Volunteer
  onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()

  return (
    <Modal title={t('volunteers.history')} onClose={onClose}>
      <p className="text-caption font-medium text-content-primary">
        {volunteer.name}
      </p>
      <p className="muted mb-4">
        {volunteer.yeshiva} · {volunteer.locality}
      </p>

      <dl className="mb-4">
        <div className="flex items-baseline justify-between border-b border-edge-subtle py-2">
          <dt className="muted">{t('volunteers.colGuards')}</dt>
          <dd className="numeric text-caption font-medium">
            {volunteer.guardsCount}
          </dd>
        </div>
        <div className="flex items-baseline justify-between py-2">
          <dt className="muted">{t('volunteers.colLastActivity')}</dt>
          <dd className="ltr-nums text-caption font-medium">
            {volunteer.lastActivityAt
              ? formatDate(volunteer.lastActivityAt, locale)
              : t('volunteers.neverActive')}
          </dd>
        </div>
      </dl>

      {/* Per-guard history arrives with the backend in Lot 1; the roster only
          carries the aggregate counter today. */}
      <EmptyState icon="history" title={t('volunteers.noHistory')} />
    </Modal>
  )
}
