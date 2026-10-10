import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  HOME_BASE,
  INSTITUTION_ENGAGEMENTS,
  comparableInstitutionName,
  getInstitutions,
  getVolunteers,
  isInstitutionToConfirm,
  updateInstitution,
} from '@core/index'
import type { Institution, InstitutionEngagement, Volunteer } from '@core/index'

import { readToken } from '../../components/badges'
import { DataTable, readSortState, sortRows } from '../../components/DataTable'
import type { Column, SortState } from '../../components/DataTable'
import { Icon } from '../../components/Icon'
import { MapSplit } from '../../components/MapSplit'
import { MapView } from '../../components/MapView'
import type { MapMarker } from '../../components/MapView'
import { OverflowMenu } from '../../components/OverflowMenu'
import { FilterPill, FilterRow, ListTop } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { ENGAGEMENT_ON, InstitutionEditor } from '../../institutions/institutionUi'

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

type Filter = 'all' | 'toConfirm' | InstitutionEngagement
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
  const [filter, setFilter] = useState<Filter>('all')
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
    const out: Record<Filter, number> = { all: institutions.length, toConfirm: 0, not_contacted: 0, contacted: 0, interested: 0, signed: 0, not_relevant: 0 }
    for (const i of institutions) {
      out[i.engagement] += 1
      if (isInstitutionToConfirm(i)) out.toConfirm += 1
    }
    return out
  }, [institutions])
  const volunteerCount = useMemo(() => new Map(institutions.map((i) => [i.id, volunteersOf(i, volunteers)])), [institutions, volunteers])

  const q = query.trim()
  const visible = institutions
    .filter((i) => filter === 'all' || (filter === 'toConfirm' ? isInstitutionToConfirm(i) : i.engagement === filter))
    .filter((i) => !q || `${i.name} ${i.locality} ${i.network} ${i.contactName} ${i.aliases}`.includes(q))

  const columns: Column<Institution>[] = [
    { key: 'name', label: t('institutionsScreen.col.name'), sort: (i) => i.name, title: (i) => i.name, className: 'w-[24%] min-w-[9rem]', render: (i) => <span className="font-semibold text-content-primary">{i.name}</span> },
    { key: 'locality', label: t('institutionsScreen.col.locality'), sort: (i) => i.locality, title: (i) => i.locality, className: 'w-[12%]', minWidth: 560, render: (i) => <span className="text-content-secondary">{i.locality || '—'}</span> },
    { key: 'kind', label: t('institutionsScreen.col.kind'), sort: (i) => t(`institutions.kind.${i.kind}`), className: 'w-[10%]', minWidth: 860, render: (i) => <span className="text-content-secondary">{t(`institutions.kind.${i.kind}`)}</span> },
    {
      key: 'engagement',
      label: t('institutionsScreen.col.engagement'),
      sort: (i) => INSTITUTION_ENGAGEMENTS.indexOf(i.engagement),
      interactive: true,
      className: 'w-[13.5rem]',
      render: (i) => (
        <span className="flex flex-nowrap items-center gap-1.5">
          <span className={`chip border ${ENGAGEMENT_ON[i.engagement]}`}>{t(`institutions.engagementShort.${i.engagement}`)}</span>
          {isInstitutionToConfirm(i) && (
            /* ★★ AV1 — confirmer : UN toucher, sans ouvrir la fiche. */
            <button
              type="button"
              onClick={() => updateInstitution(i.id, { engagementConfirmed: true })}
              data-testid={`institution-confirm-${i.id}`}
              aria-label={t('institutions.confirmAria', { name: i.name, status: t(`institutions.engagement.${i.engagement}`) })}
              className="btn-secondary min-h-[2.5rem] shrink-0 px-2.5 py-1"
            >
              <Icon name="check" size={14} />
              {t('institutions.confirm')}
            </button>
          )}
        </span>
      ),
    },
    { key: 'contact', label: t('institutionsScreen.col.contact'), sort: (i) => i.contactName, title: (i) => i.contactName, className: 'w-[13%]', minWidth: 980, render: (i) => <span className="text-content-secondary">{i.contactName || '—'}</span> },
    {
      key: 'phone',
      label: t('institutionsScreen.col.phone'),
      sort: (i) => i.contactPhone,
      interactive: true,
      className: 'w-[9.5rem]',
      minWidth: 700,
      render: (i) =>
        i.contactPhone ? (
          <a className="ltr-nums inline-flex min-h-[2.5rem] items-center gap-1 text-content-secondary hover:text-accent-ink" href={`tel:${i.contactPhone.replace(/[^\d+]/g, '')}`} dir="ltr">
            <Icon name="phone" size={14} />
            {i.contactPhone}
          </a>
        ) : (
          <span className="text-content-muted">—</span>
        ),
    },
    { key: 'volunteers', label: t('institutionsScreen.col.volunteers'), sort: (i) => volunteerCount.get(i.id) ?? 0, className: 'w-[6.5rem]', minWidth: 760, render: (i) => <span className="numeric text-content-secondary">{volunteerCount.get(i.id) ?? 0}</span> },
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
  const rows = sortRows(visible, columns, sort)

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

  const FILTERS: Filter[] = ['all', ...(counts.toConfirm > 0 ? (['toConfirm'] as const) : []), ...INSTITUTION_ENGAGEMENTS]

  return (
    <MapSplit
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
      {() => (
        <>
          <ListTop
            title={t('nav.institutions')}
            info={<p>{t('institutionsScreen.info')}</p>}
            shown={visible.length}
            total={institutions.length}
            search={query}
            onSearch={setQuery}
            searchPlaceholder={t('institutions.search')}
            testId="institutions-top"
            menu={
              <OverflowMenu
                testId="institutions-menu"
                items={[
                  { key: 'import', icon: 'upload', label: t('institutions.import.title'), to: '/coordinator/import/institutions', testId: 'institutions-import' },
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
                    title={f === 'all' ? undefined : f === 'toConfirm' ? t('institutions.toConfirm') : t(`institutions.engagement.${f}`)}
                    testId={`institutions-filter-${f}`}
                  >
                    {f === 'all' ? t('institutions.all') : f === 'toConfirm' ? t('institutions.toConfirmTab') : t(`institutions.engagementShort.${f}`)}
                  </FilterPill>
                ))}
              </FilterRow>
            }
          />
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(i) => i.id}
            sort={sort}
            onSort={setSort}
            onOpen={(i) => {
              setOpen((cur) => (cur === i.id ? null : i.id))
              setFlyKey((k) => k + 1)
            }}
            openKey={open}
            renderOpen={(i) => (
              <div className="flex flex-col gap-3">
                <InstitutionEditor inst={i} />
                <Link to={`/coordinator/coverage?inst=${i.id}`} className="btn-ghost self-start" data-testid={`institution-coverage-${i.id}`}>
                  <Icon name="map" size={16} />
                  {t('institutionsScreen.seeReach')}
                </Link>
              </div>
            )}
            openLabel={t('table.open')}
            rowAttrs={(i) => ({ 'data-testid': `institution-row-${i.id}`, 'data-to-confirm': isInstitutionToConfirm(i) ? '' : undefined })}
            empty={institutions.length === 0 ? t('institutionsScreen.empty') : t('table.empty')}
            label={t('nav.institutions')}
            testId="institutions-table"
          />
        </>
      )}
    </MapSplit>
  )
}
