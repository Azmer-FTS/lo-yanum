import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  archiveVolunteer,
  deleteDriver,
  deleteVolunteer,
  formatDate,
  getDrivers,
  getInstitutions,
  getVolunteerStats,
  getVolunteers,
  isTestId,
  looseMatch,
  normalizeLocality,
  reactivateVolunteer,
  regionOfLocality,
  telHref,
  whatsappHref,
} from '@core/index'
import type { Driver, Institution, RegionId, Volunteer } from '@core/index'

import { useConfirmDelete } from '../../components/ConfirmDelete'
import { readSortState } from '../../components/DataTable'
import type { SortState } from '../../components/DataTable'
import { EntityTable } from '../../components/EntityTable'
import type { EntityColumn, RowAction } from '../../components/EntityTable'
import { Icon } from '../../components/Icon'
import { MapSplit } from '../../components/MapSplit'
import { OverflowMenu } from '../../components/OverflowMenu'
import { PeopleMap } from '../../components/PeopleMap'
import { PreviewPanel, PreviewRow, PreviewSection } from '../../components/PreviewPanel'
import { RegionFilter } from '../../components/RegionFilter'
import { TestDataBadge } from '../../components/TestDataBadge'
import { VolunteerStatusChip } from '../../components/badges'
import { EmptyState, FilterPill, FilterRow, ListTop, Modal } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'
import { formRoutes } from './FormPages'
import { runUndoable } from '../../components/UndoToast'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AY4 (2026-10-11) — VOLONTAIRES ET CONDUCTEURS NE FONT QU'UN ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Un conducteur est un volontaire qui conduit. » Deux écrans (מתנדבים,
 * נהגים) montraient deux fois les mêmes gens — G5.2 avait déjà fait d'un
 * volontaire qui conduit UNE personne avec deux lignes —, et l'institution,
 * qui est ce qui rend une garde possible (« chaque institution a SES
 * conducteurs »), n'était un filtre dans aucun des deux.
 *
 *  - UNE liste de personnes : les volontaires, et les conducteurs « de
 *    métier » d'avant AY (une ligne `drivers` sans volontaire) ;
 *  - le bouton « נהגים » en TÊTE de la rangée de filtres, toujours visible,
 *    avec son compte : il isole ceux qui conduisent (et leur voiture, leurs
 *    places, en colonne) ;
 *  - l'INSTITUTION en colonne et en filtre (`?institution=` : c'est ainsi
 *    que la fiche d'une institution ouvre « tous ses volontaires ») ;
 *  - `/coordinator/drivers` mène ici, conducteurs isolés.
 * La correspondance volontaire ↔ conducteur se fait DEPUIS LA FICHE de
 * l'institution (`InstitutionPeople`), là où les deux listes sont courtes et
 * de la même maison.
 */

interface Person {
  key: string
  name: string
  phone: string
  photo: string | null
  locality: string
  volunteer: Volunteer | null
  /** La voiture : la ligne `drivers` liée, ou le conducteur de métier lui-même. */
  car: Driver | null
  drives: boolean
  institution: Institution | null
  institutionName: string
}

/**
 * Fuzzy-ish subsequence match: "ארכה" finds "אריאל כהן".
 * Cheap enough to run over 300 rows on every keystroke without debouncing.
 *
 * ★ AF2.2 (2026-09-09) — LES DEUX CÔTÉS SONT NORMALISÉS. `ק״ש` et `ק"ש` sont
 *   deux chaînes pour `includes` et un seul endroit pour un humain ; c'est le
 *   même défaut que dans les deux autres listes, et le même remède
 *   (`normalizeLocality`, N4). La sous-séquence est CONSERVÉE au-dessus de la
 *   tolérance aux fautes : elle rend les initiales, ce qu'aucune distance
 *   d'édition ne fait.
 */
function matches(haystack: string, needle: string): boolean {
  const h = normalizeLocality(haystack)
  const n = normalizeLocality(needle)
  if (h.includes(n)) return true
  let i = 0
  for (const ch of h) {
    if (ch === n[i]) i++
    if (i === n.length) return true
  }
  return false
}



export function VolunteersScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const volunteers = useCoreValue(getVolunteers)
  const drivers = useCoreValue(getDrivers)
  const institutions = useCoreValue(() => getInstitutions())
  const stats = useCoreValue(getVolunteerStats)
  const del = useConfirmDelete()

  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [onlyDrivers, setOnlyDrivers] = useState(params.get('drivers') === '1')
  const [status, setStatus] = useState<'active' | 'inactive' | null>(null)
  const [kosher, setKosher] = useState(false)
  const [neverGuarded, setNeverGuarded] = useState(false)
  const [institutionId, setInstitutionId] = useState<string | null>(params.get('institution'))
  const [locality, setLocality] = useState<string | null>(null)
  const [region, setRegion] = useState<RegionId | null>(null)
  const [sort, setSortState] = useState<SortState>(() => readSortState('lo-yanum:people-sort', { key: 'name', dir: 'asc' }))
  const [selected, setSelected] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<Volunteer | null>(null)
  const [history, setHistory] = useState<Volunteer | null>(null)
  const setSort = (s: SortState) => {
    setSortState(s)
    try {
      localStorage.setItem('lo-yanum:people-sort', JSON.stringify(s))
    } catch {
      /* navigation privée */
    }
  }

  /* W4 — « + » d'ailleurs : `?new=1` ouvre le formulaire, puis sort de l'adresse. */
  useEffect(() => {
    if (params.get('new') !== '1') return
    const next = new URLSearchParams(params)
    next.delete('new')
    setParams(next, { replace: true })
    navigate(formRoutes.newVolunteer())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const people: Person[] = useMemo(() => {
    const instOf = (v: Volunteer) => (v.institutionId ? (institutions.find((i) => i.id === v.institutionId) ?? null) : null)
    const out: Person[] = volunteers.map((v) => {
      const car = drivers.find((d) => d.volunteerId === v.id) ?? null
      const inst = instOf(v)
      return { key: v.id, name: v.name, phone: v.phone, photo: v.photo, locality: v.locality, volunteer: v, car, drives: v.canDrive, institution: inst, institutionName: inst?.name ?? v.yeshiva }
    })
    for (const d of drivers) {
      if (d.volunteerId) continue
      out.push({ key: d.id, name: d.name, phone: d.phone, photo: d.photo, locality: d.locality, volunteer: null, car: d, drives: true, institution: null, institutionName: '' })
    }
    return out
  }, [volunteers, drivers, institutions])

  /* ★★ AY11 — le jeu d'essai se VOIT (marqué) mais ne COMPTE pas. */
  const counted = people.filter((p) => !isTestId(p.key))
  const driverCount = counted.filter((p) => p.drives).length
  const q = query.trim().toLowerCase()
  const beforeLocality = people.filter((p) => {
    if (onlyDrivers && !p.drives) return false
    if (status !== null && (p.volunteer?.status ?? 'active') !== status) return false
    if (kosher && p.volunteer?.phoneType !== 'kosher') return false
    if (neverGuarded && (p.volunteer?.guardsCount ?? 0) !== 0) return false
    if (institutionId !== null && p.institution?.id !== institutionId) return false
    if (region !== null && regionOfLocality(p.locality) !== region) return false
    if (!q) return true
    const digits = q.replace(/\D/g, '')
    if (digits !== '' && p.phone.replace(/\D/g, '').includes(digits)) return true
    return matches(p.name, q) || matches(p.institutionName, q) || matches(p.locality, q) || looseMatch(q, [p.name, p.institutionName, p.locality])
  })
  const visible = locality === null ? beforeLocality : beforeLocality.filter((p) => p.locality === locality)

  const activityLabel = (v: Volunteer | null) => (v?.lastActivityAt ? formatDate(v.lastActivityAt, locale) : t('volunteers.neverActive'))
  const carLine = (p: Person) => (p.drives ? t('people.carLine', { vehicle: p.car?.vehicle || t('institutionPeople.privateCar'), seats: p.car?.seats ?? 4 }) : '')

  const columns: EntityColumn<Person>[] = [
    { key: 'institution', label: t('people.col.institution'), sort: (p) => p.institutionName, title: (p) => p.institutionName, sub: (p) => p.institutionName, minWidth: 600, className: 'w-[10rem]', render: (p) => <span className="text-content-secondary">{p.institutionName || '—'}</span> },
    {
      key: 'phone',
      label: t('volunteers.colPhone'),
      sort: (p) => p.phone,
      interactive: true,
      sub: (p) => p.phone,
      minWidth: 760,
      className: 'w-[11.5rem]',
      render: (p) =>
        p.phone ? (
          <span className="flex flex-nowrap items-center gap-0.5">
            <span className="ltr-nums min-w-0 truncate text-content-secondary" dir="ltr">{p.phone}</span>
            <a className="btn-ghost h-10 w-9 min-w-0 shrink-0 justify-center p-0" href={telHref(p.phone)} aria-label={t('people.call')} title={t('people.call')}>
              <Icon name="phone" size={16} />
            </a>
            <a className="btn-ghost h-10 w-9 min-w-0 shrink-0 justify-center p-0" href={whatsappHref(p.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp">
              <Icon name="whatsapp" size={16} />
            </a>
          </span>
        ) : (
          <span className="text-content-muted">—</span>
        ),
    },
    { key: 'locality', label: t('volunteers.colLocality'), sort: (p) => p.locality, sub: (p) => p.locality, minWidth: 760, className: 'w-[7rem]', render: (p) => <span className="text-content-secondary">{p.locality || '—'}</span> },
    {
      key: 'drives',
      label: t('people.col.drives'),
      sort: (p) => (p.drives ? 0 : 1),
      sub: carLine,
      minWidth: 680,
      className: 'w-[11rem]',
      render: (p) =>
        p.drives ? (
          <span className="inline-flex min-w-0 items-center gap-1 text-content-secondary">
            <Icon name="steering" size={14} className="shrink-0 text-status-info-ink" />
            <span className="truncate">{carLine(p)}</span>
          </span>
        ) : (
          <span className="text-content-muted">—</span>
        ),
    },
    { key: 'guards', label: t('volunteers.colGuards'), sort: (p) => p.volunteer?.guardsCount ?? 0, minWidth: 900, className: 'w-[5rem]', render: (p) => <span className="numeric text-content-secondary">{p.volunteer?.guardsCount ?? '—'}</span> },
    { key: 'status', label: t('volunteers.colStatus'), sort: (p) => p.volunteer?.status ?? 'active', minWidth: 560, className: 'w-[7rem]', render: (p) => (p.volunteer ? <VolunteerStatusChip status={p.volunteer.status} /> : <span className="chip bg-status-info/15 text-status-info-ink">{t('institutionPeople.driver')}</span>) },
    { key: 'activity', label: t('volunteers.colLastActivity'), sort: (p) => p.volunteer?.lastActivityAt ?? '', minWidth: 980, className: 'w-[7rem]', render: (p) => <span className="ltr-nums text-micro text-content-muted">{activityLabel(p.volunteer)}</span> },
  ]

  const sorted = (() => {
    const col = sort.key === 'name' ? { sort: (p: Person) => p.name } : columns.find((c) => c.key === sort.key)
    const get = col?.sort
    if (!get) return visible
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...visible].sort((a, b) => {
      const x = get(a)
      const y = get(b)
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign
      return String(x ?? '').localeCompare(String(y ?? ''), 'he', { numeric: true }) * sign
    })
  })()

  const actionsOf = (p: Person): RowAction[] => {
    const v = p.volunteer
    const edit = v ? formRoutes.editVolunteer(v.id) : formRoutes.editDriver(p.key)
    return [
      { key: 'view', icon: 'eye', label: t('table.view'), inline: true, onClick: () => setSelected(p.key), testId: `person-view-${p.key}` },
      { key: 'edit', icon: 'edit', label: t('table.edit'), inline: true, to: edit, testId: `person-edit-${p.key}` },
      ...(p.phone
        ? [
            { key: 'call', icon: 'phone' as const, label: t('people.call'), onClick: () => window.open(telHref(p.phone), '_self') },
            { key: 'whatsapp', icon: 'whatsapp' as const, label: 'WhatsApp', onClick: () => window.open(whatsappHref(p.phone), '_blank') },
          ]
        : []),
      ...(v
        ? [
            { key: 'history', icon: 'history' as const, label: t('volunteers.history'), onClick: () => setHistory(v) },
            v.status === 'active'
              ? { key: 'archive', icon: 'moon' as const, label: t('volunteers.archive'), onClick: () => setArchiving(v), testId: `person-archive-${p.key}` }
              : { key: 'reactivate', icon: 'undo' as const, label: t('volunteers.reactivate'), onClick: () => runUndoable(t('undo.volunteerReactivated', { name: v.name }), () => reactivateVolunteer(v.id)) },
            { key: 'delete', icon: 'trash' as const, label: t('common.delete'), danger: true, onClick: () => del.ask('volunteer', v.id, () => deleteVolunteer(v.id)), testId: `person-delete-${p.key}` },
          ]
        : [{ key: 'delete', icon: 'trash' as const, label: t('common.delete'), danger: true, onClick: () => del.ask('driver', p.key, () => deleteDriver(p.key)), testId: `person-delete-${p.key}` }]),
    ]
  }

  const regionCounts = useMemo(() => {
    const out: Partial<Record<RegionId, number>> = {}
    for (const p of people) {
      const id = regionOfLocality(p.locality)
      if (id) out[id] = (out[id] ?? 0) + 1
    }
    return out
  }, [people])
  const activeFilters = (onlyDrivers ? 1 : 0) + (status ? 1 : 0) + (kosher ? 1 : 0) + (neverGuarded ? 1 : 0) + (institutionId ? 1 : 0) + (locality ? 1 : 0) + (region ? 1 : 0)
  const clear = () => {
    setOnlyDrivers(false)
    setStatus(null)
    setKosher(false)
    setNeverGuarded(false)
    setInstitutionId(null)
    setLocality(null)
    setRegion(null)
  }
  const usedInstitutions = institutions.filter((i) => people.some((p) => p.institution?.id === i.id))
  const selectedPerson = people.find((p) => p.key === selected) ?? null

  return (
    <>
      <MapSplit
        screenKey="volunteers"
        ariaLabel={t('people.mapVolunteers')}
        scroll="page"
        contentInFull="unmount"
        contentPercent={62}
        splitHeight="h-[38dvh] min-h-64"
        map={() => <PeopleMap localities={beforeLocality.map((p) => p.locality)} selected={locality} onSelect={setLocality} ariaLabel={t('people.mapVolunteers')} tone="volunteers" />}
      >
        {() => (
          <>
            <ListTop
              testId="volunteers-top"
              title={t('people.title')}
              info={<p>{t('people.info')}</p>}
              shown={visible.length}
              total={counted.length}
              menu={
                <OverflowMenu
                  testId="volunteers-menu"
                  items={[
                    { key: 'import', label: t('volunteers.import'), icon: 'upload', to: '/coordinator/import?kind=volunteers', testId: 'volunteers-import' },
                    { key: 'newDriver', label: t('people.newDriver'), icon: 'steering', to: `${formRoutes.newVolunteer()}?driver=1`, testId: 'people-new-driver' },
                  ]}
                />
              }
              search={query}
              onSearch={setQuery}
              searchPlaceholder={t('volunteers.searchPlaceholder')}
              /* ★★ AY4.2 — LE bouton qui isole les conducteurs : dans la zone qui
                 ne se replie JAMAIS (avec peu de lignes, la rangée de filtres se
                 range derrière « סינון » — le bouton y disparaissait). */
              kpis={
                <FilterPill active={onlyDrivers} onClick={() => setOnlyDrivers((v) => !v)} count={driverCount} testId="people-filter-drivers">
                  <Icon name="steering" size={12} />
                  {t('people.drivers')}
                </FilterPill>
              }
              filters={
                <FilterRow activeCount={activeFilters - (onlyDrivers ? 1 : 0)} onClear={clear}>
                  <FilterPill active={status === 'active'} onClick={() => setStatus(status === 'active' ? null : 'active')} count={stats.active} testId="people-filter-active">
                    {t('volunteerStatus.active')}
                  </FilterPill>
                  <FilterPill active={status === 'inactive'} onClick={() => setStatus(status === 'inactive' ? null : 'inactive')} count={stats.inactive} testId="people-filter-inactive">
                    {t('volunteerStatus.inactive')}
                  </FilterPill>
                  <FilterPill active={kosher} onClick={() => setKosher((v) => !v)} count={stats.kosher} testId="people-filter-kosher">
                    {t('volunteers.statsKosher')}
                  </FilterPill>
                  <FilterPill active={neverGuarded} onClick={() => setNeverGuarded((v) => !v)} count={stats.neverGuarded} testId="people-filter-never">
                    {t('volunteers.statsNeverGuarded')}
                  </FilterPill>
                  {usedInstitutions.length > 0 && (
                    <select
                      className="input min-h-[2.75rem] w-auto max-w-[14rem] py-1 text-caption"
                      value={institutionId ?? ''}
                      onChange={(e) => setInstitutionId(e.target.value || null)}
                      aria-label={t('people.col.institution')}
                      data-testid="people-filter-institution"
                    >
                      <option value="">{t('people.allInstitutions')}</option>
                      {usedInstitutions.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <RegionFilter value={region} onChange={setRegion} counts={regionCounts} testId="volunteers-region" />
                  {locality !== null && (
                    <FilterPill active onClick={() => setLocality(null)}>
                      <Icon name="pin" size={11} />
                      {locality}
                    </FilterPill>
                  )}
                </FilterRow>
              }
            />
            <EntityTable
              rows={sorted}
              rowKey={(p) => p.key}
              lead={(p) => ({
                title: p.name,
                photo: p.photo,
                marks: (
                  <>
                    {p.drives && <Icon name="steering" size={13} className="shrink-0 text-status-info-ink" aria-label={t('institutionPeople.driver')} />}
                    <TestDataBadge id={p.key} />
                  </>
                ),
              })}
              leadLabel={t('volunteers.colName')}
              leadSort={(p) => p.name}
              columns={columns}
              sort={sort}
              onSort={setSort}
              onPreview={(p) => setSelected(p.key)}
              activeKey={selected}
              actions={actionsOf}
              phoneEnd={(p) => (p.volunteer && p.volunteer.status !== 'active' ? <VolunteerStatusChip status={p.volunteer.status} /> : null)}
              rowAttrs={(p) => ({ 'data-testid': `person-${p.key}`, 'data-drives': p.drives ? '' : undefined })}
              empty={people.length === 0 ? t('people.empty') : t('table.empty')}
              label={t('people.title')}
              testId="people-table"
            />
          </>
        )}
      </MapSplit>
      {selectedPerson && <PersonPreview person={selectedPerson} people={people} onClose={() => setSelected(null)} />}
      {del.dialog}
      {archiving && <ArchiveDialog volunteer={archiving} onClose={() => setArchiving(null)} />}
      {history && <HistoryDialog volunteer={history} onClose={() => setHistory(null)} />}
    </>
  )
}

/** ★★ AY3.3 — l'aperçu d'une personne : qui, sa maison, sa voiture, avec qui elle part. */
function PersonPreview({ person: p, people, onClose }: { person: Person; people: Person[]; onClose: () => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const v = p.volunteer
  const a = v?.availability
  const ridesWith = v?.rideWith ? people.find((x) => x.key === v.rideWith) : undefined
  const passengers = people.filter((x) => x.volunteer?.rideWith === p.key)
  return (
    <PreviewPanel
      title={p.name}
      subtitle={[p.institutionName, p.locality].filter(Boolean).join(' · ')}
      photo={p.photo}
      position={p.institution?.position ?? null}
      editTo={v ? formRoutes.editVolunteer(v.id) : formRoutes.editDriver(p.key)}
      onClose={onClose}
      testId="person-preview"
      chips={
        <>
          {v && <VolunteerStatusChip status={v.status} />}
          {p.drives && (
            <span className="chip bg-status-info/15 text-micro text-status-info-ink">
              <Icon name="steering" size={12} />
              {t('institutionPeople.driver')}
            </span>
          )}
        </>
      }
      quick={
        p.phone ? (
          <>
            <a className="btn-primary min-h-11" href={telHref(p.phone)}>
              <Icon name="phone" size={16} />
              {t('people.call')}
            </a>
            <a className="btn-secondary min-h-11" href={whatsappHref(p.phone)} target="_blank" rel="noreferrer">
              <Icon name="whatsapp" size={16} />
              WhatsApp
            </a>
          </>
        ) : undefined
      }
    >
      <PreviewSection title={t('preview.details')}>
        <PreviewRow label={t('people.col.institution')}>{p.institutionName}</PreviewRow>
        <PreviewRow label={t('volunteers.colPhone')}>{p.phone ? <span dir="ltr" className="ltr-nums">{p.phone}</span> : ''}</PreviewRow>
        <PreviewRow label={t('volunteers.colLocality')}>{p.locality}</PreviewRow>
        <PreviewRow label={t('form.age')}>{v?.age || ''}</PreviewRow>
        <PreviewRow label={t('volunteers.colGuards')}>{v ? String(v.guardsCount) : ''}</PreviewRow>
        <PreviewRow label={t('volunteers.colLastActivity')}>{v?.lastActivityAt ? formatDate(v.lastActivityAt, locale) : ''}</PreviewRow>
        <PreviewRow label={t('people.availability')}>
          {a ? [a.nights ? t('form.availNights') : null, a.days ? t('form.availDays') : null, a.weekends ? t('form.availWeekends') : null].filter(Boolean).join(' · ') : ''}
        </PreviewRow>
      </PreviewSection>
      {p.drives && (
        <PreviewSection title={t('people.driving')}>
          <PreviewRow label={t('driver.vehicle')}>{p.car?.vehicle || t('institutionPeople.privateCar')}</PreviewRow>
          <PreviewRow label={t('driver.seats')}>{String(p.car?.seats ?? 4)}</PreviewRow>
          <PreviewRow label={t('driver.availabilityNote')}>{p.car?.availabilityNote}</PreviewRow>
          <PreviewRow label={t('people.passengers')}>{passengers.map((x) => x.name).join(', ')}</PreviewRow>
        </PreviewSection>
      )}
      {ridesWith && (
        <PreviewSection title={t('institutionPeople.ridesWith')}>
          <p className="py-2 text-caption">{ridesWith.name}</p>
        </PreviewSection>
      )}
      {v?.notes && (
        <PreviewSection title={t('form.notes')}>
          <p className="whitespace-pre-wrap py-2 text-caption" dir="auto">{v.notes}</p>
        </PreviewSection>
      )}
    </PreviewPanel>
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
            runUndoable(t('undo.volunteerArchived', { name: volunteer.name }), () => archiveVolunteer(volunteer.id, reason.trim()))
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
