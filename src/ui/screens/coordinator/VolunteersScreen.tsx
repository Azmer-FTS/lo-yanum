import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  archiveVolunteer,
  comparableInstitutionName,
  deleteDriver,
  deleteVolunteer,
  formatDate,
  getDrivers,
  getInstitutions,
  getTonightBookedDriverIds,
  getVolunteerStats,
  getVolunteers,
  isTestId,
  looseMatch,
  mailtoHref,
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
  /** ★★ AZ4 — le courriel (celui du volontaire, sinon celui de la ligne conducteur). */
  email: string
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
  const booked = useCoreValue(getTonightBookedDriverIds)
  const del = useConfirmDelete()

  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [onlyDrivers, setOnlyDriversState] = useState(params.get('drivers') === '1')
  /* ★★ AZ4 — `?drivers=1` suit le bouton : retiré quand on le relâche, sinon
     un rechargement rallumait un filtre éteint. */
  const setOnlyDrivers = (f: (v: boolean) => boolean) => {
    const next = f(onlyDrivers)
    setOnlyDriversState(next)
    const ps = new URLSearchParams(params)
    if (next) ps.set('drivers', '1')
    else ps.delete('drivers')
    setParams(ps, { replace: true })
  }
  /* ★★ AZ4 — les filtres d'avant AY, remis : סמארטפון, רישיון + רכב, et pour
     les conducteurs « פנויים הלילה » et « 7+ מקומות ». */
  const [smartphone, setSmartphone] = useState(false)
  const [licenseCar, setLicenseCar] = useState(false)
  const [freeTonight, setFreeTonight] = useState(false)
  const [sevenPlus, setSevenPlus] = useState(false)
  /* ★★ AZ4 — « קיבוץ לפי ישיבה », remis (gardé sur l'appareil). */
  const [grouped, setGroupedState] = useState(() => {
    try {
      return localStorage.getItem('lo-yanum:people-grouped') === '1'
    } catch {
      return false
    }
  })
  const setGrouped = (v: boolean) => {
    setGroupedState(v)
    try {
      localStorage.setItem('lo-yanum:people-grouped', v ? '1' : '0')
    } catch {
      /* navigation privée */
    }
  }
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
    /* ★★ AZ4 — l'institution par son id, SINON par le nom de la ישיבה (la même
       règle que la fiche de l'institution, `peopleOf`) : un volontaire importé
       avant AW n'a que le nom, et il doit se filtrer comme les autres. */
    const instOf = (v: Volunteer) => {
      if (v.institutionId) return institutions.find((i) => i.id === v.institutionId) ?? null
      if (!v.yeshiva) return null
      const name = comparableInstitutionName(v.yeshiva)
      return institutions.find((i) => comparableInstitutionName(i.name) === name) ?? null
    }
    const out: Person[] = volunteers.map((v) => {
      const car = drivers.find((d) => d.volunteerId === v.id) ?? null
      const inst = instOf(v)
      return { key: v.id, name: v.name, phone: v.phone, photo: v.photo, locality: v.locality, volunteer: v, car, drives: v.canDrive, institution: inst, institutionName: inst?.name ?? v.yeshiva, email: v.email || car?.email || '' }
    })
    for (const d of drivers) {
      if (d.volunteerId) continue
      out.push({ key: d.id, name: d.name, phone: d.phone, photo: d.photo, locality: d.locality, volunteer: null, car: d, drives: true, institution: null, institutionName: '', email: d.email })
    }
    return out
  }, [volunteers, drivers, institutions])

  /* ★★ AY11 — le jeu d'essai se VOIT (marqué) mais ne COMPTE pas. */
  const counted = people.filter((p) => !isTestId(p.key))
  const driverCount = counted.filter((p) => p.drives).length
  const bookedSet = new Set(booked)
  const cars = counted.filter((p) => p.drives && p.car)
  const driverFigures = {
    seats: cars.reduce((n, p) => n + (p.car?.seats ?? 0), 0),
    sevenPlus: cars.filter((p) => (p.car?.seats ?? 0) >= 7).length,
    freeTonight: cars.filter((p) => p.car && !bookedSet.has(p.car.id)).length,
  }
  const q = query.trim().toLowerCase()
  const beforeLocality = people.filter((p) => {
    if (onlyDrivers && !p.drives) return false
    if (status !== null && (p.volunteer?.status ?? 'active') !== status) return false
    if (kosher && p.volunteer?.phoneType !== 'kosher') return false
    if (smartphone && p.volunteer?.phoneType !== 'smartphone') return false
    if (licenseCar && !(p.volunteer?.hasLicense && p.volunteer?.hasCar)) return false
    if (freeTonight && !(p.car && !bookedSet.has(p.car.id))) return false
    if (sevenPlus && !((p.car?.seats ?? 0) >= 7)) return false
    if (neverGuarded && (p.volunteer?.guardsCount ?? 0) !== 0) return false
    if (institutionId !== null && p.institution?.id !== institutionId) return false
    if (region !== null && regionOfLocality(p.locality) !== region) return false
    if (!q) return true
    const digits = q.replace(/\D/g, '')
    if (digits !== '' && p.phone.replace(/\D/g, '').includes(digits)) return true
    /* ★★ AZ4 — le véhicule se cherche, comme sur l'ancien écran des conducteurs. */
    const vehicle = p.car?.vehicle ?? ''
    return matches(p.name, q) || matches(p.institutionName, q) || matches(p.locality, q) || (vehicle !== '' && matches(vehicle, q)) || looseMatch(q, [p.name, p.institutionName, p.locality, vehicle])
  })
  const visible = locality === null ? beforeLocality : beforeLocality.filter((p) => p.locality === locality)

  const activityLabel = (v: Volunteer | null) => (v?.lastActivityAt ? formatDate(v.lastActivityAt, locale) : t('volunteers.neverActive'))
  const carLine = (p: Person) => (p.drives ? t('people.carLine', { vehicle: p.car?.vehicle || t('institutionPeople.privateCar'), seats: p.car?.seats ?? 4 }) : '')
  /* ★★ AZ4 — « בכל זמן » quand tout est coché, « — » quand rien (d'avant AY). */
  const availabilityOf = (v: Volunteer | null) => {
    if (!v) return ''
    const a = v.availability
    if (a.nights && a.days && a.weekends) return t('volunteers.availabilityAlways')
    const parts = [a.nights ? t('form.availNights') : null, a.days ? t('form.availDays') : null, a.weekends ? t('form.availWeekends') : null].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : '—'
  }
  const licenseCarLine = (v: Volunteer | null) => (v ? [v.hasLicense ? t('form.hasLicense') : null, v.hasCar ? t('form.hasCar') : null].filter(Boolean).join(' · ') : '')

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
            {/* ★★ AZ4 — כשר ou סמארטפון, d'un coup d'œil (d'avant AY). */}
            {p.volunteer && (
              <span title={t(`phoneType.${p.volunteer.phoneType}`)} aria-label={t(`phoneType.${p.volunteer.phoneType}`)} className={`shrink-0 ${p.volunteer.phoneType === 'kosher' ? 'text-accent-ink' : 'text-status-info-ink'}`} data-phone-type={p.volunteer.phoneType}>
                <Icon name={p.volunteer.phoneType === 'kosher' ? 'phoneBasic' : 'phone'} size={13} />
              </span>
            )}
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
    /* ★★ AZ4 — les colonnes d'avant AY, remises : elles cèdent les premières
       quand la place manque, et passent alors sous le nom. */
    {
      key: 'licenseCar',
      label: `${t('form.hasLicense')} / ${t('form.hasCar')}`,
      sort: (p) => (p.volunteer?.hasLicense ? 0 : 1) + (p.volunteer?.hasCar ? 0 : 1),
      sub: (p) => licenseCarLine(p.volunteer),
      minWidth: 1180,
      className: 'w-[6rem]',
      render: (p) =>
        p.volunteer ? (
          <span className="flex items-center gap-2.5" data-license={p.volunteer.hasLicense ? '1' : '0'} data-car={p.volunteer.hasCar ? '1' : '0'}>
            <span title={t('form.hasLicense')} aria-label={t('form.hasLicense')} className={p.volunteer.hasLicense ? 'text-status-success-ink' : 'text-content-muted/30'}>
              <Icon name="document" size={14} />
            </span>
            <span title={t('form.hasCar')} aria-label={t('form.hasCar')} className={p.volunteer.hasCar ? 'text-status-success-ink' : 'text-content-muted/30'}>
              <Icon name="car" size={14} />
            </span>
          </span>
        ) : (
          <span className="text-content-muted">—</span>
        ),
    },
    { key: 'age', label: t('form.age'), sort: (p) => p.volunteer?.age ?? 0, sub: (p) => (p.volunteer?.age ? `${t('form.age')} ${p.volunteer.age}` : ''), minWidth: 1260, className: 'w-[4rem]', render: (p) => <span className="numeric text-content-secondary">{p.volunteer?.age || '—'}</span> },
    { key: 'availability', label: t('volunteers.colAvailability'), sub: (p) => (p.volunteer ? availabilityOf(p.volunteer) : p.car?.availabilityNote ?? ''), minWidth: 1340, className: 'w-[8rem]', title: (p) => (p.volunteer ? availabilityOf(p.volunteer) : p.car?.availabilityNote), render: (p) => <span className="text-micro text-content-secondary">{p.volunteer ? availabilityOf(p.volunteer) : p.car?.availabilityNote || '—'}</span> },
    {
      key: 'email',
      label: t('people.email'),
      sort: (p) => p.email,
      interactive: true,
      minWidth: 1420,
      className: 'w-[10rem]',
      title: (p) => p.email || undefined,
      render: (p) =>
        p.email ? (
          <a href={mailtoHref(p.email)} dir="ltr" className="ltr-nums block truncate text-micro text-content-secondary hover:text-accent-ink hover:underline">
            {p.email}
          </a>
        ) : (
          <span className="text-micro text-content-muted/50">—</span>
        ),
    },
    { key: 'guards', label: t('volunteers.colGuards'), sort: (p) => p.volunteer?.guardsCount ?? 0, minWidth: 900, className: 'w-[5rem]', render: (p) => <span className="numeric text-content-secondary">{p.volunteer?.guardsCount ?? '—'}</span> },
    { key: 'status', label: t('volunteers.colStatus'), sort: (p) => p.volunteer?.status ?? 'active', minWidth: 560, className: 'w-[7rem]', render: (p) => (p.volunteer ? <VolunteerStatusChip status={p.volunteer.status} /> : <span className="chip bg-status-info/15 text-status-info-ink">{t('institutionPeople.driver')}</span>) },
    { key: 'activity', label: t('volunteers.colLastActivity'), sort: (p) => p.volunteer?.lastActivityAt ?? '', minWidth: 980, className: 'w-[7rem]', render: (p) => <span className="ltr-nums text-micro text-content-muted">{activityLabel(p.volunteer)}</span> },
  ]

  const groupName = (p: Person) => p.institutionName || t('people.noInstitution')
  const sorted = (() => {
    const col = sort.key === 'name' ? { sort: (p: Person) => p.name } : columns.find((c) => c.key === sort.key)
    const get = col?.sort
    const sign = sort.dir === 'asc' ? 1 : -1
    const byGroup = (a: Person, b: Person) => (grouped ? groupName(a).localeCompare(groupName(b), 'he') : 0)
    if (!get) return grouped ? [...visible].sort(byGroup) : visible
    return [...visible].sort((a, b) => {
      const g = byGroup(a, b)
      if (g !== 0) return g
      /* ★★ AZ4 — les « jamais actifs » restent EN BAS, dans les deux sens (d'avant AY). */
      if (sort.key === 'activity') {
        const ea = !a.volunteer?.lastActivityAt
        const eb = !b.volunteer?.lastActivityAt
        if (ea !== eb) return ea ? 1 : -1
      }
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
      /* ★★ AZ4 — ✉, comme sur l'ancien écran des conducteurs. */
      ...(p.email ? [{ key: 'email', icon: 'mail' as const, label: t('common.email'), onClick: () => window.open(mailtoHref(p.email), '_self'), testId: `person-email-${p.key}` }] : []),
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
  const activeFilters = (onlyDrivers ? 1 : 0) + (status ? 1 : 0) + (kosher ? 1 : 0) + (smartphone ? 1 : 0) + (licenseCar ? 1 : 0) + (freeTonight ? 1 : 0) + (sevenPlus ? 1 : 0) + (neverGuarded ? 1 : 0) + (institutionId ? 1 : 0) + (locality ? 1 : 0) + (region ? 1 : 0)
  const clear = () => {
    setOnlyDrivers(() => false)
    setSmartphone(false)
    setLicenseCar(false)
    setFreeTonight(false)
    setSevenPlus(false)
    setStatus(null)
    setKosher(false)
    setNeverGuarded(false)
    setInstitutionId(null)
    setLocality(null)
    setRegion(null)
  }
  const usedInstitutions = institutions.filter((i) => people.some((p) => p.institution?.id === i.id))
  const perInstitution = (id: string) => counted.filter((p) => p.institution?.id === id).length
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
        {({ mode }) => (
          <>
            <ListTop
              testId="volunteers-top"
              title={t('people.title')}
              info={<p>{t('people.info')}</p>}
              shown={visible.filter((p) => !isTestId(p.key)).length}
              total={counted.length}
              /* ★★ AZ4 — conducteurs isolés : le total des places (« N מקומות », d'avant AY). */
              stat={onlyDrivers ? `${driverFigures.seats.toLocaleString(locale)} ${t('driver.statsSeats')}` : undefined}
              menu={
                <OverflowMenu
                  testId="volunteers-menu"
                  items={[
                    { key: 'import', label: t('volunteers.import'), icon: 'upload', to: onlyDrivers ? '/coordinator/import?kind=drivers&from=volunteers' : '/coordinator/import?kind=volunteers&from=volunteers', testId: 'volunteers-import' },
                    { key: 'newDriver', label: t('people.newDriver'), icon: 'steering', to: `${formRoutes.newVolunteer()}?driver=1`, testId: 'people-new-driver' },
                    { key: 'group', label: grouped ? t('people.ungroup') : t('volunteers.groupToggle'), icon: 'layers', onClick: () => setGrouped(!grouped), testId: 'volunteers-group' },
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
                  <FilterPill active={smartphone} onClick={() => setSmartphone((v) => !v)} count={stats.smartphone} testId="people-filter-smartphone">
                    {t('volunteers.statsSmartphone')}
                  </FilterPill>
                  <FilterPill active={licenseCar} onClick={() => setLicenseCar((v) => !v)} count={stats.licenseCar} testId="people-filter-license-car">
                    {t('volunteers.statsLicenseCar')}
                  </FilterPill>
                  {onlyDrivers && (
                    <>
                      <FilterPill active={freeTonight} onClick={() => setFreeTonight((v) => !v)} count={driverFigures.freeTonight} testId="people-filter-free-tonight">
                        {t('driver.statsFreeTonight')}
                      </FilterPill>
                      <FilterPill active={sevenPlus} onClick={() => setSevenPlus((v) => !v)} count={driverFigures.sevenPlus} testId="people-filter-seven-plus">
                        {t('driver.statsSevenPlus')}
                      </FilterPill>
                    </>
                  )}
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
                          {i.name} ({perInstitution(i.id)})
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
              tiles={mode !== 'hidden'}
              /* ★★ AZ4 — un conducteur se situe par SA VOITURE (véhicule · places), comme sur l'ancienne vignette. */
              where={(p) => [p.drives ? carLine(p) : p.institutionName, p.locality].filter(Boolean).join(' · ')}
              /* ★★ AZ4 — appeler, d'un toucher, depuis la vignette (l'ancienne vignette portait le numéro). */
              tileAction={(p) =>
                p.phone ? (
                  <a href={telHref(p.phone)} className="flex h-11 w-11 items-center justify-center rounded-pill bg-surface-high text-content-primary" aria-label={`${t('people.call')} · ${p.name} · ${p.phone}`} title={p.phone} data-testid={`person-tile-call-${p.key}`}>
                    <Icon name="phone" size={16} />
                  </a>
                ) : null
              }
              groupOf={grouped ? groupName : undefined}
              hidden={mode !== 'hidden' && !!selectedPerson}
            />
            {selectedPerson && <PersonPreview person={selectedPerson} people={people} onClose={() => setSelected(null)} docked={mode !== 'hidden'} />}
          </>
        )}
      </MapSplit>
      {del.dialog}
      {archiving && <ArchiveDialog volunteer={archiving} onClose={() => setArchiving(null)} />}
      {history && <HistoryDialog volunteer={history} onClose={() => setHistory(null)} />}
    </>
  )
}

/** ★★ AY3.3 — l'aperçu d'une personne : qui, sa maison, sa voiture, avec qui elle part. */
function PersonPreview({ person: p, people, onClose, docked }: { person: Person; people: Person[]; onClose: () => void; docked?: boolean }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const v = p.volunteer
  const a = v?.availability
  const ridesWith = v?.rideWith ? people.find((x) => x.key === v.rideWith) : undefined
  const passengers = people.filter((x) => x.volunteer?.rideWith === p.key)
  return (
    <PreviewPanel
      docked={docked}
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
        <PreviewRow label={t('volunteers.colPhone')}>
          {p.phone ? (
            <span>
              <span dir="ltr" className="ltr-nums">{p.phone}</span>
              {v && <span className="muted ms-2 text-micro" data-testid="person-preview-phone-type">{t(`phoneType.${v.phoneType}`)}</span>}
            </span>
          ) : (
            ''
          )}
        </PreviewRow>
        {/* ★★ AZ4 — le courriel, cliquable (d'avant AY). */}
        <PreviewRow label={t('people.email')} testId="person-preview-email">
          {p.email ? (
            <a href={mailtoHref(p.email)} dir="ltr" className="ltr-nums text-accent-ink hover:underline">
              {p.email}
            </a>
          ) : (
            ''
          )}
        </PreviewRow>
        <PreviewRow label={`${t('form.hasLicense')} · ${t('form.hasCar')}`} testId="person-preview-license">
          {v ? [v.hasLicense ? `✓ ${t('form.hasLicense')}` : `✗ ${t('form.hasLicense')}`, v.hasCar ? `✓ ${t('form.hasCar')}` : `✗ ${t('form.hasCar')}`].join(' · ') : ''}
        </PreviewRow>
        <PreviewRow label={t('volunteers.colLocality')}>{p.locality}</PreviewRow>
        <PreviewRow label={t('form.age')}>{v?.age || ''}</PreviewRow>
        <PreviewRow label={t('volunteers.colGuards')}>{v ? String(v.guardsCount) : ''}</PreviewRow>
        <PreviewRow label={t('volunteers.colLastActivity')}>{v?.lastActivityAt ? formatDate(v.lastActivityAt, locale) : ''}</PreviewRow>
        <PreviewRow label={t('people.availability')}>
          {a ? (a.nights && a.days && a.weekends ? t('volunteers.availabilityAlways') : [a.nights ? t('form.availNights') : null, a.days ? t('form.availDays') : null, a.weekends ? t('form.availWeekends') : null].filter(Boolean).join(' · ') || '—') : ''}
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
      {/* ★★ AZ4 — les notes de la ligne conducteur aussi (un conducteur sans fiche volontaire n'avait plus que son nom). */}
      {(v?.notes || p.car?.notes) && (
        <PreviewSection title={t('form.notes')}>
          {v?.notes && <p className="whitespace-pre-wrap py-2 text-caption" dir="auto">{v.notes}</p>}
          {p.car?.notes && p.car.notes !== v?.notes && <p className="whitespace-pre-wrap py-2 text-caption" dir="auto" data-testid="person-preview-car-notes">{p.car.notes}</p>}
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
