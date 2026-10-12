import { useMemo, useState } from 'react'
import { TestDataBadge } from '../../components/TestDataBadge'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  HOME_BASE,
  INSTITUTION_ENGAGEMENTS,
  comparableInstitutionName,
  getInstitutions,
  getVolunteers,
  headRoleKey,
  institutionHead,
  institutionMatchesQuery,
  isInstitutionHeadMissing,
  needsPriorCoordination,
  isInstitutionToConfirm,
  updateInstitution,
  isTestId,
} from '@core/index'
import type { Institution, InstitutionEngagement, Volunteer } from '@core/index'

import { readToken } from '../../components/badges'
import { readSortState, sortRows } from '../../components/DataTable'
import type { SortState } from '../../components/DataTable'
import { EntityTable } from '../../components/EntityTable'
import type { EntityColumn, RowAction } from '../../components/EntityTable'
import { PreviewPanel, PreviewRow, PreviewSection } from '../../components/PreviewPanel'
import { Icon } from '../../components/Icon'
import { MapSplit } from '../../components/MapSplit'
import { MapView } from '../../components/MapView'
import type { MapMarker } from '../../components/MapView'
import { OverflowMenu } from '../../components/OverflowMenu'
import { FilterPill, FilterRow, ListTop, PageHeader } from '../../components/primitives'
import { sortFamily } from '../../components/ListFilters'
import type { CompactFilters } from '../../components/ListFilters'
import { useCoreValue } from '../../hooks/useCore'
import { CallRestrictionChip, CoordinationBanner, CoordinationChip, ENGAGEMENT_ON, HeadMissingChip, InstitutionContactsList, InstitutionEditor, InstitutionPeople, MinorsChip, RelatedInstitutions, callNotices, callTone, confirmCall, guardCall, isCallGuarded, telOf } from '../../institutions/institutionUi'
import { runUndoable } from '../../components/UndoToast'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AX1 (2026-10-10) — LES INSTITUTIONS ONT LEUR ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * C'est l'ÉTAPE 1 du métier du PO : démarcher les yeshivot, mékhinot,
 * midrashot, qui donnent un ACCORD DE PRINCIPE, oral (elles ne signent rien).
 * L'inventaire (docs/ax/ax2-inventaire.md) l'a trouvée enfouie au fond de la
 * carte de couverture, dans une liste MASQUÉE en mode « פגישה » et filtrée par
 * des onglets. Elle reste là-bas (on y apparie) ; elle VIT ici.
 *
 * Même gabarit que les autres listes du temps « גיוס » : une carte, un tableau
 * lu en ligne, UNE rangée de filtres (l'engagement, « à confirmer »), le tri par
 * les colonnes, la fiche qui se déplie sous la ligne. Et ses volontaires, qu'on
 * voit enfin rattachés à elle (étape 3).
 */

type Filter = 'all' | 'toConfirm' | 'headMissing' | 'coordination' | InstitutionEngagement
const SORT_KEY = 'lo-yanum:institutions-sort'

const ENGAGEMENT_TOKEN: Record<InstitutionEngagement, string> = {
  not_contacted: '--status-info',
  contacted: '--status-warn',
  interested: '--accent',
  signed: '--status-violet',
  not_relevant: '--text-muted',
}

/** Les volontaires d'une institution : rattachés par `institutionId`, ou (anciens) par le nom. */
export function volunteersOf(inst: Institution, volunteers: readonly Volunteer[]): number {
  const name = comparableInstitutionName(inst.name)
  return volunteers.filter((v) => v.institutionId === inst.id || (!v.institutionId && v.yeshiva && comparableInstitutionName(v.yeshiva) === name)).length
}

export function InstitutionsScreen() {
  const { t } = useTranslation()
  const institutions = useCoreValue(() => getInstitutions())
  const volunteers = useCoreValue(() => getVolunteers())
  /* ★ AY6 — la carte de couverture renvoie ici « à confirmer » (`?filter=toConfirm`). */
  /* ★★ AZ5 — et « חסר ראש » (`?filter=headMissing`) : les fiches à relancer. */
  const [filter, setFilter] = useState<Filter>(() => {
    const f = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('filter')
    /* ★★ BB — et « תיאום מוקדם » (`?filter=coordination`). */
    return f === 'toConfirm' || f === 'headMissing' || f === 'coordination' ? f : 'all'
  })
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [flyKey, setFlyKey] = useState(0)
  const [sort, setSortState] = useState<SortState>(() => readSortState(SORT_KEY, { key: 'name', dir: 'asc' }))
  const setSort = (s: SortState) => {
    setSortState(s)
    try {
      localStorage.setItem(SORT_KEY, JSON.stringify(s))
    } catch {
      /* navigation privée */
    }
  }

  const counts = useMemo(() => {
    /* ★★ AZ3.4 — le jeu d'essai se voit, marqué, mais ne compte pas. */
    const counted = institutions.filter((i) => !isTestId(i.id))
    const out: Record<Filter, number> = { all: counted.length, toConfirm: 0, headMissing: 0, coordination: 0, not_contacted: 0, contacted: 0, interested: 0, signed: 0, not_relevant: 0 }
    for (const i of counted) {
      out[i.engagement] += 1
      if (isInstitutionToConfirm(i)) out.toConfirm += 1
      if (isInstitutionHeadMissing(i)) out.headMissing += 1
      if (needsPriorCoordination(i)) out.coordination += 1
    }
    return out
  }, [institutions])
  const volunteerCount = useMemo(() => new Map(institutions.map((i) => [i.id, volunteersOf(i, volunteers)])), [institutions, volunteers])

  const q = query.trim()
  const visible = institutions
    .filter((i) => filter === 'all' || (filter === 'toConfirm' ? isInstitutionToConfirm(i) : filter === 'headMissing' ? isInstitutionHeadMissing(i) : filter === 'coordination' ? needsPriorCoordination(i) : i.engagement === filter))
    /* ★★ BB — nom, alias, localité, réseau, contacts et numéros, normalisés. */
    .filter((i) => institutionMatchesQuery(i, q))

  /* ★★ AV1 — confirmer : UN toucher, sans ouvrir la fiche. Dans la colonne
     du tableau, et sur la vignette (★★ AZ4 — il ne doit pas disparaître quand
     la carte est visible). */
  const confirmButton = (i: Institution) =>
    isInstitutionToConfirm(i) && (
      <button
        type="button"
        onClick={() => runUndoable(t('undo.confirmed', { name: i.name }), () => updateInstitution(i.id, { engagementConfirmed: true }))}
        data-testid={`institution-confirm-${i.id}`}
        aria-label={t('institutions.confirmAria', { name: i.name, status: t(`institutions.engagement.${i.engagement}`) })}
        className="btn-secondary min-h-[2.5rem] shrink-0 px-2.5 py-1"
      >
        <Icon name="check" size={14} />
        {t('institutions.confirm')}
      </button>
    )

  const columns: EntityColumn<Institution>[] = [
    { key: 'locality', sub: (i) => i.locality, label: t('institutionsScreen.col.locality'), sort: (i) => i.locality, title: (i) => i.locality, className: 'w-[12%]', minWidth: 560, render: (i) => <span className="text-content-secondary">{i.locality || '—'}</span> },
    { key: 'kind', sub: (i) => t(`institutions.kind.${i.kind}`), label: t('institutionsScreen.col.kind'), sort: (i) => t(`institutions.kind.${i.kind}`), className: 'w-[10%]', minWidth: 860, render: (i) => <span className="text-content-secondary">{t(`institutions.kind.${i.kind}`)}</span> },
    {
      key: 'engagement',
      label: t('institutionsScreen.col.engagement'),
      sort: (i) => INSTITUTION_ENGAGEMENTS.indexOf(i.engagement),
      interactive: true,
      minWidth: 560,
      className: 'w-[13.5rem]',
      render: (i) => (
        <span className="flex flex-nowrap items-center gap-1.5">
          <span className={`chip border ${ENGAGEMENT_ON[i.engagement]}`}>{t(`institutions.engagementShort.${i.engagement}`)}</span>
          {confirmButton(i)}
        </span>
      ),
    },
    /* ★★ AZ5 — « le contact » = le rang 1 (ראש ישיבה / מנהל), et lui seul. Sans
       lui : « חסר ראש ישיבה », jamais un ר״מ ou un רכז à sa place. */
    {
      key: 'contact',
      sub: (i) => i.contactName || t(`institutions.headMissing.${headRoleKey(i)}`),
      label: t('institutionsScreen.col.contact'),
      sort: (i) => i.contactName,
      title: (i) => i.contactName,
      className: 'w-[13%]',
      minWidth: 980,
      render: (i) => (i.contactName ? <span className="text-content-secondary">{i.contactName}</span> : <HeadMissingChip inst={i} />),
    },
    {
      key: 'phone',
      sub: (i) => i.contactPhone,
      label: t('institutionsScreen.col.phone'),
      sort: (i) => i.contactPhone,
      interactive: true,
      className: 'w-[9.5rem]',
      minWidth: 700,
      /* ★★ BB — le numéro du contact de tête (jamais la מזכירות) ; avec le
         marqueur « נדרש תיאום מוקדם », le texte l'accompagne et l'appel
         demande de le relire. */
      /* ★★ BC — et un contact de tête dont la note restreint l'usage de son
         téléphone : le même garde, dans la LISTE comme sur la fiche. */
      render: (i) =>
        i.contactPhone ? (
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <a
              className={`ltr-nums inline-flex min-h-[2.75rem] items-center gap-1 hover:text-accent-ink ${isCallGuarded(i, institutionHead(i)) ? 'font-semibold text-status-warn-ink' : 'text-content-secondary'}`}
              href={telOf(i.contactPhone)}
              onClick={guardCall(i, t, institutionHead(i))}
              dir="ltr"
              data-testid={`institution-call-${i.id}`}
              data-guarded={isCallGuarded(i, institutionHead(i)) ? '' : undefined}
              title={isCallGuarded(i, institutionHead(i)) ? callNotices(i, institutionHead(i), t).join(' · ') : undefined}
            >
              <Icon name={isCallGuarded(i, institutionHead(i)) ? 'alert' : 'phone'} size={14} />
              {i.contactPhone}
            </a>
            <CoordinationChip inst={i} />
            <CallRestrictionChip contact={institutionHead(i)} />
          </span>
        ) : needsPriorCoordination(i) ? (
          <CoordinationChip inst={i} />
        ) : (
          <span className="text-content-muted">—</span>
        ),
    },
    { key: 'volunteers', sub: (i) => t('institutionsScreen.volunteersSub', { count: volunteerCount.get(i.id) ?? 0 }), label: t('institutionsScreen.col.volunteers'), sort: (i) => volunteerCount.get(i.id) ?? 0, className: 'w-[6.5rem]', minWidth: 760, render: (i) => <span className="numeric text-content-secondary">{volunteerCount.get(i.id) ?? 0}</span> },
    {
      key: 'place',
      label: t('institutionsScreen.col.place'),
      sort: (i) => (!i.position ? 2 : i.positionUncertain ? 1 : 0),
      className: 'w-[7rem]',
      minWidth: 1120,
      render: (i) =>
        !i.position ? (
          <span className="chip bg-surface-high text-content-muted">{t('institutions.noPoint')}</span>
        ) : i.positionUncertain ? (
          <span className="chip bg-status-warn/15 text-status-warn-ink">{t('institutions.uncertainShort')}</span>
        ) : (
          <span className="text-content-muted">✓</span>
        ),
    },
  ]
  const rows = sortRows(visible, [{ key: 'name', label: '', sort: (i: Institution) => i.name, render: () => null }, ...columns], sort)
  const instActions = (i: Institution): RowAction[] => [
    { key: 'view', icon: 'eye', label: t('table.view'), inline: true, onClick: () => setOpen(i.id), testId: `institution-view-${i.id}` },
    { key: 'edit', icon: 'edit', label: t('table.edit'), inline: true, to: `/coordinator/institutions/${i.id}`, testId: `institution-edit-${i.id}` },
    /* ★★ BB — avec le marqueur, l'article dit le texte et l'appel le fait relire. */
    ...(i.contactPhone
      ? [
          isCallGuarded(i, institutionHead(i))
            ? { key: 'call', icon: 'alert' as const, label: callNotices(i, institutionHead(i), t).join(' · '), danger: true, testId: `institution-call-guarded-${i.id}`, onClick: () => { if (confirmCall(i, institutionHead(i), t)) window.open(telOf(i.contactPhone), '_self') } }
            : { key: 'call', icon: 'phone' as const, label: t('institutions.call'), testId: `institution-call-menu-${i.id}`, onClick: () => window.open(telOf(i.contactPhone), '_self') },
        ]
      : []),
    { key: 'coverage', icon: 'map', label: t('institutionsScreen.seeReach'), to: `/coordinator/coverage?inst=${i.id}`, testId: `institution-coverage-${i.id}` },
    { key: 'volunteer', icon: 'userPlus', label: t('institutionPeople.add'), to: `/coordinator/volunteers/new?institution=${i.id}` },
  ]

  const FILTERS: Filter[] = ['all', ...(counts.toConfirm > 0 ? (['toConfirm'] as const) : []), ...(counts.headMissing > 0 ? (['headMissing'] as const) : []), ...(counts.coordination > 0 ? (['coordination'] as const) : []), ...INSTITUTION_ENGAGEMENTS]
  /* ★★ BC — la forme compacte : l'engagement a son déclencheur (le statut d'une
     institution) ; « לבדיקה » (à confirmer, sans rang 1, coordination) et le tri
     vivent dans la feuille. Un seul choix à la fois, comme la rangée de pastilles. */
  const engagementKeys = FILTERS.filter((f) => f !== 'all' && f !== 'toConfirm' && f !== 'headMissing' && f !== 'coordination')
  const flagKeys = (['toConfirm', 'headMissing', 'coordination'] as const).filter((f) => FILTERS.includes(f))
  const compactFilters: CompactFilters = {
    status: {
      key: 'status',
      title: t('filters.family.status'),
      single: true,
      testId: 'institutions-status-family',
      options: engagementKeys.map((f) => ({
        key: f,
        label: t(`institutions.engagementShort.${f}`),
        count: counts[f],
        active: filter === f,
        onToggle: () => setFilter(filter === f ? 'all' : f),
        dot: <span className="h-2.5 w-2.5 shrink-0 rounded-pill" style={{ backgroundColor: readToken(ENGAGEMENT_TOKEN[f as InstitutionEngagement]) }} aria-hidden />,
        testId: `institutions-filter-${f}`,
      })),
    },
    statusAll: { label: t('institutions.all'), count: counts.all },
    families: [
      {
        key: 'flags',
        title: t('filters.family.flags'),
        single: true,
        options: flagKeys.map((f) => ({
          key: f,
          label: f === 'toConfirm' ? t('institutions.toConfirmTab') : f === 'headMissing' ? t('institutions.headMissingTab') : t('institutions.coordinationTab'),
          count: counts[f],
          active: filter === f,
          onToggle: () => setFilter(filter === f ? 'all' : f),
          hint: f === 'toConfirm' ? t('institutions.toConfirm') : f === 'headMissing' ? t('institutions.headMissingTitle') : t('institutions.coordinationTitle'),
          testId: `institutions-filter-${f}`,
        })),
      },
      sortFamily(t, [{ key: 'name', label: t('institutionsScreen.col.name') }, ...columns.filter((c) => c.sort).map((c) => ({ key: c.key, label: c.label }))], sort, setSort, 'institutions'),
    ],
    activeCount: (flagKeys as readonly string[]).includes(filter) ? 1 : 0,
    onClear: () => setFilter('all'),
    results: visible.filter((i) => !isTestId(i.id)).length,
  }

  const markers: MapMarker[] = institutions
    .filter((i) => i.position)
    .map((i) => ({
      id: i.id,
      position: i.position!,
      color: readToken(ENGAGEMENT_TOKEN[i.engagement]),
      title: i.name,
      subtitle: t(`institutions.engagement.${i.engagement}`),
      emphasis: i.id === open,
      onSelect: () => setOpen(i.id),
    }))
  const openInst = institutions.find((i) => i.id === open) ?? null


  return (
    <MapSplit
      /* ★★ BC — écran de liste : liste ↔ carte au téléphone, carte à côté en tablette. */
      list
      screenKey="institutions"
      ariaLabel={t('institutionsScreen.mapLabel')}
      breakpoint="xl"
      contentPercent={66}
      splitHeight="h-[35dvh]"
      map={() => (
        <MapView
          ariaLabel={t('institutionsScreen.mapLabel')}
          className="h-full w-full rounded-none"
          markers={markers}
          center={HOME_BASE}
          zoom={8}
          fit={markers.length > 0}
          flyTo={openInst?.position ? { position: openInst.position, key: flyKey, zoom: 12 } : undefined}
        />
      )}
    >
      {({ mode }) => (
        <>
          <ListTop
            compactFilters={compactFilters}
            title={t('nav.institutions')}
            info={<p>{t('institutionsScreen.info')}</p>}
            shown={visible.filter((i) => !isTestId(i.id)).length}
            total={counts.all}
            search={query}
            onSearch={setQuery}
            searchPlaceholder={t('institutions.search')}
            testId="institutions-top"
            menu={
              <OverflowMenu
                testId="institutions-menu"
                items={[
                  { key: 'import', icon: 'upload', label: t('institutions.import.title'), to: '/coordinator/import?kind=institutions&from=institutions', testId: 'institutions-import' },
                  { key: 'coverage', icon: 'map', label: t('institutionsScreen.toCoverage'), to: '/coordinator/coverage', testId: 'institutions-coverage' },
                ]}
              />
            }
            filters={
              <FilterRow activeCount={filter === 'all' ? 0 : 1} onClear={() => setFilter('all')}>
                {FILTERS.map((f) => (
                  <FilterPill
                    key={f}
                    active={filter === f}
                    onClick={() => setFilter(f)}
                    count={counts[f]}
                    title={f === 'all' ? undefined : f === 'toConfirm' ? t('institutions.toConfirm') : f === 'headMissing' ? t('institutions.headMissingTitle') : f === 'coordination' ? t('institutions.coordinationTitle') : t(`institutions.engagement.${f}`)}
                    testId={`institutions-filter-${f}`}
                  >
                    {f === 'all' ? t('institutions.all') : f === 'toConfirm' ? t('institutions.toConfirmTab') : f === 'headMissing' ? t('institutions.headMissingTab') : f === 'coordination' ? t('institutions.coordinationTab') : t(`institutions.engagementShort.${f}`)}
                  </FilterPill>
                ))}
              </FilterRow>
            }
          />
          {/* ★★ AY3 — la forme commune : photo · nom, colonnes, gestes au bout. */}
          <EntityTable
            rows={rows}
            rowKey={(i) => i.id}
            lead={(i) => ({ title: i.name, shape: 'square', dot: <span className="h-2.5 w-2.5 shrink-0 rounded-pill" style={{ backgroundColor: readToken(ENGAGEMENT_TOKEN[i.engagement]) }} aria-hidden />, marks: (
                <>
                  <TestDataBadge id={i.id} />
                  <CoordinationChip inst={i} />
                  <MinorsChip inst={i} />
                </>
              ) })}
            leadLabel={t('institutionsScreen.col.name')}
            leadSort={(i) => i.name}
            columns={columns}
            sort={sort}
            onSort={setSort}
            onPreview={(i) => {
              setOpen(i.id)
              setFlyKey((k) => k + 1)
            }}
            activeKey={open}
            actions={(i) => instActions(i)}
            phoneEnd={(i) => <span className={`chip border text-micro ${ENGAGEMENT_ON[i.engagement]}`}>{t(`institutions.engagementShort.${i.engagement}`)}</span>}
            rowAttrs={(i) => ({ 'data-testid': `institution-row-${i.id}`, 'data-to-confirm': isInstitutionToConfirm(i) ? '' : undefined, 'data-coordination': needsPriorCoordination(i) ? '' : undefined })}
            empty={institutions.length === 0 ? t('institutionsScreen.empty') : t('table.empty')}
            label={t('nav.institutions')}
            testId="institutions-table"
            tiles={mode !== 'hidden'}
            hidden={mode !== 'hidden' && !!openInst}
            tileAction={confirmButton}
          />
          {openInst && <InstitutionPreview inst={openInst} onClose={() => setOpen(null)} docked={mode !== 'hidden'} />}
        </>
      )}
    </MapSplit>
  )
}

/**
 * ★★ AY3.3 · AY4.3 — L'APERÇU D'UNE INSTITUTION : la carte, le statut, et SES
 * volontaires et SES conducteurs (combien, qui part avec qui). L'édition
 * complète est sur sa page.
 */
function InstitutionPreview({ inst, onClose, docked }: { inst: Institution; onClose: () => void; docked?: boolean }) {
  const { t } = useTranslation()
  return (
    <PreviewPanel
      docked={docked}
      title={inst.name}
      subtitle={[inst.locality, t(`institutions.kind.${inst.kind}`), inst.network].filter(Boolean).join(' · ')}
      shape="square"
      position={inst.position}
      editTo={`/coordinator/institutions/${inst.id}`}
      onClose={onClose}
      testId="institution-preview"
      chips={
        <>
          <span className={`chip border text-micro ${ENGAGEMENT_ON[inst.engagement]}`}>{t(`institutions.engagement.${inst.engagement}`)}</span>
          <MinorsChip inst={inst} />
          <CoordinationChip inst={inst} full />
        </>
      }
      quick={
        <>
          {inst.contactPhone && (
            <a className={`${callTone(inst, 'btn-primary', institutionHead(inst))} min-h-11`} href={telOf(inst.contactPhone)} onClick={guardCall(inst, t, institutionHead(inst))} data-testid="institution-preview-call" data-guarded={isCallGuarded(inst, institutionHead(inst)) ? '' : undefined}>
              <Icon name={isCallGuarded(inst, institutionHead(inst)) ? 'alert' : 'phone'} size={16} />
              {t('institutions.call')}
            </a>
          )}
          <Link to={`/coordinator/coverage?inst=${inst.id}`} className="btn-secondary min-h-11" data-testid="institution-preview-coverage">
            <Icon name="map" size={16} />
            {t('institutionsScreen.seeReach')}
          </Link>
        </>
      }
    >
      {/* ★★ BB — le marqueur de coordination, avant les contacts et leurs numéros. */}
      {needsPriorCoordination(inst) && (
        <div className="py-2">
          <CoordinationBanner inst={inst} />
        </div>
      )}
      {/* ★★ AZ5 — les contacts, rangés par rôle ; le rang 1 en tête. */}
      <PreviewSection title={t('institutions.contacts')}>
        <InstitutionContactsList inst={inst} />
      </PreviewSection>
      <div className="py-2">
        <RelatedInstitutions inst={inst} />
      </div>
      <PreviewSection title={t('institutionPeople.title')}>
        <div className="py-2">
          <InstitutionPeople inst={inst} />
        </div>
      </PreviewSection>
      <PreviewSection title={t('preview.details')}>
        <PreviewRow label={t('institutions.audienceLabel')}>{t(`institutions.audience.${inst.audience}`)}</PreviewRow>
        <PreviewRow label={t('institutions.students')}>{inst.students ?? ''}</PreviewRow>
        <PreviewRow label={t('institutions.metOn')}>{inst.metOn ? inst.metOn.split('-').reverse().join('.') : ''}</PreviewRow>
        <PreviewRow label={t('institutions.positionSource')}>{inst.positionSource}</PreviewRow>
      </PreviewSection>
      {inst.notes && (
        <PreviewSection title={t('institutions.notes')}>
          <p className="whitespace-pre-wrap py-2 text-caption" dir="auto">{inst.notes}</p>
        </PreviewSection>
      )}
    </PreviewPanel>
  )
}

/** ★★ AY3.3 — la page d'édition d'une institution (fiche + ses gens). */
export function InstitutionEditScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { institutionId } = useParams()
  const inst = useCoreValue(() => getInstitutions().find((i) => i.id === institutionId) ?? null)
  return (
    <div className="mx-auto max-w-3xl px-4 py-6" data-testid="institution-edit">
      <PageHeader title={inst?.name ?? t('nav.institutions')} back={{ to: '/coordinator/institutions', label: t('nav.institutions') }} />
      {!inst ? (
        <p className="muted mt-4">{t('table.empty')}</p>
      ) : (
        <>
          <div className="mt-4">
            <InstitutionEditor inst={inst} />
          </div>
          <h2 className="mb-2 mt-8 text-heading text-content-primary">{t('institutionPeople.title')}</h2>
          <InstitutionPeople inst={inst} />
          <div className="mt-6 flex justify-end">
            <button type="button" className="btn-primary min-h-11" onClick={() => navigate('/coordinator/institutions')}>
              {t('common.done')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
