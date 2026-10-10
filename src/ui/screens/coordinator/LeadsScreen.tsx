import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  HOME_BASE,
  LEAD_OPEN_STATUSES,
  LEAD_STATUSES,
  convertLeadToFarm,
  createLeads,
  deleteLead,
  getConvertedLeads,
  getVisibleLeads,
  leadCounts,
  leadRegionId,
  regionById,
  regions,
  revertLeadConversion,
  setLeadStatus,
  updateLead,
  whatsappHref,
} from '@core/index'
import type { Lead, LeadStatus, RegionId } from '@core/index'
import { formRoutes } from './FormPages'
import { Icon } from '../../components/Icon'
import { MapSplit } from '../../components/MapSplit'
import { MapView } from '../../components/MapView'
import type { MapMarker } from '../../components/MapView'
import { OverflowMenu } from '../../components/OverflowMenu'
import { readToken } from '../../components/badges'
import { DataTable, readSortState } from '../../components/DataTable'
import type { Column, SortState } from '../../components/DataTable'
import { FilterPill, FilterRow, ListTop, Modal } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AT2 (2026-10-07) — LA SALLE D'ATTENTE, REPENSÉE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Ça ne va pas du tout. » Les colonnes d'AS6 étaient l'idée du PO, prise
 *   au pied de la lettre : sept colonnes, il fallait défiler dans les deux sens
 *   et il perdait l'ensemble de vue ; les flèches ne disaient pas où elles
 *   menaient ; une icône touchée « pour voir » a fait de « גד״ש דביר » une
 *   ferme, sans confirmation ni retour.
 *
 * ★★ CE QU'IL FAIT VRAIMENT : il reçoit, il appelle, il NOTE LE RÉSULTAT, il
 *    rappelle, parfois il convertit. Le geste le plus fréquent est le
 *    changement de statut. D'où la forme :
 *
 *   1. UNE LISTE, VERTICALE. Un seul sens de défilement, sur téléphone comme
 *      sur iPad ; la carte à côté quand la largeur le permet.
 *   2. LE STATUT SE CHANGE D'UN TOUCHER, SUR LA LIGNE : les cinq choix sont
 *      TOUJOURS visibles (sélecteur segmenté), l'actuel est coloré. Rien à
 *      ouvrir, rien à deviner, rien à glisser — et la ligne NE BOUGE PAS (le
 *      tri ne lit pas le statut). Ce qui bouge, c'est le compte de l'onglet
 *      visé, en haut : c'est là qu'on voit « où elle est partie ».
 *   3. L'ENSEMBLE DE VUE, C'EST LA RANGÉE D'ONGLETS : הכול · חדש · ממתין ·
 *      לחזור · פגישה, chacun avec son nombre. Toucher un onglet filtre ; une
 *      ligne dont on change le statut DANS un filtre y reste jusqu'au prochain
 *      choix d'onglet (elle ne s'évapore pas sous le doigt).
 *   4. CE QUI EST FERMÉ SE RANGE EN BAS, replié : « לא רלוונטי » et les pistes
 *      devenues fermes (avec le chemin du retour).
 *   5. CE QUI EST IRRÉVERSIBLE DEMANDE CONFIRMATION, ET S'ANNULE : convertir,
 *      supprimer. Un changement de statut, réversible d'un toucher, ne
 *      confirme pas — il propose « ביטול » quelques secondes.
 *   6. CE QUI SE FAIT D'UN GESTE LE RESTE (le PO l'a dit) : appeler, WhatsApp.
 *      Le reste — rendez-vous, convertir, supprimer — est dans « ⋯ ».
 *
 * ⛔ AUCUN COMPTEUR NE VOIT CES PISTES (A296).
 */

const STATUS_TOKEN: Record<LeadStatus, string> = {
  not_called: '--status-info',
  no_answer: '--status-warn',
  message_sent: '--status-warn',
  call_back: '--accent',
  meeting_set: '--status-success',
  not_now: '--text-muted',
  not_interested: '--text-muted',
}

/** La teinte d'un segment ACTIF — fond léger, encre lisible (contrastes d'AN). */
const STATUS_ON: Record<LeadStatus, string> = {
  not_called: 'border-status-info bg-status-info/15 text-status-info-ink',
  no_answer: 'border-status-warn bg-status-warn/15 text-status-warn-ink',
  message_sent: 'border-status-warn bg-status-warn/15 text-status-warn-ink',
  call_back: 'border-accent bg-accent/15 text-accent-ink',
  meeting_set: 'border-status-success bg-status-success/15 text-status-success-ink',
  not_now: 'border-edge-strong bg-surface-high text-content-primary',
  not_interested: 'border-edge-strong bg-surface-high text-content-primary',
}

/**
 * ★★ AX5 — LES STATUTS SONT DES FILTRES, PAS DES ONGLETS : ce sont les mêmes
 * contacts, moins nombreux. « לא רלוונטי » en est un aussi (c'était une
 * section repliée en bas : une deuxième façon de restreindre la même liste).
 */
type Filter = 'open' | LeadStatus
const FILTERS: readonly Filter[] = ['open', 'not_called', 'no_answer', 'call_back', 'meeting_set', 'not_now']
const SORT_KEY = 'lo-yanum:leads-sort'
/** L'ancien tri (une liste déroulante, AS6) devient une colonne. */
const LEGACY_SORT: Record<string, SortState> = {
  newest: { key: 'created', dir: 'desc' },
  updated: { key: 'updated', dir: 'desc' },
  name: { key: 'name', dir: 'asc' },
  region: { key: 'region', dir: 'asc' },
}
function readSort(): SortState {
  try {
    const legacy = LEGACY_SORT[localStorage.getItem(SORT_KEY) ?? '']
    if (legacy) return legacy
  } catch {
    /* navigation privée */
  }
  return readSortState(SORT_KEY, { key: 'created', dir: 'desc' })
}
const STATUS_ORDER: Record<LeadStatus, number> = { not_called: 0, no_answer: 1, message_sent: 1, call_back: 2, meeting_set: 3, not_now: 4, not_interested: 4 }

interface Undo {
  id: number
  text: string
  action?: { label: string; run: () => void }
  undo?: () => void
}

export function LeadsScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const leads = useCoreValue(() => getVisibleLeads())
  const converted = useCoreValue(() => getConvertedLeads())
  const [filter, setFilterState] = useState<Filter>('open')
  /* Les lignes touchées DANS le filtre courant y restent jusqu'au prochain onglet. */
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [sort, setSortState] = useState<SortState>(() => readSort())
  const [selected, setSelected] = useState<string | null>(null)
  const [flyKey, setFlyKey] = useState(0)
  const [showConverted, setShowConverted] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'convert' | 'delete' | 'revert'; lead: Lead } | null>(null)
  const [toast, setToast] = useState<Undo | null>(null)
  const toastTimer = useRef<number | null>(null)

  const counts = useMemo(() => leadCounts(leads), [leads])
  const regionName = (id: RegionId) => regionById(id)?.name ?? ''
  const [query, setQuery] = useState('')
  const q = query.trim()
  const visible = leads.filter((l) =>
    (kept.has(l.id) ? true : filter === 'open' ? l.status !== 'not_now' : l.status === filter) &&
    (!q || `${l.name} ${l.contactName} ${l.phone} ${l.place} ${l.notes}`.includes(q)),
  )
  const selectedLead = leads.find((l) => l.id === selected) ?? null

  const setFilter = (f: Filter) => {
    setFilterState(f)
    setKept(new Set())
  }
  const setSort = (s: SortState) => {
    setSortState(s)
    try {
      localStorage.setItem(SORT_KEY, JSON.stringify(s))
    } catch {
      /* navigation privée */
    }
  }

  const say = (u: Omit<Undo, 'id'>) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    const id = Date.now()
    setToast({ ...u, id })
    toastTimer.current = window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), 8000)
  }
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
  }, [])

  const label = (l: Lead) => l.name || l.contactName || l.phone

  const changeStatus = (lead: Lead, status: LeadStatus) => {
    const before = setLeadStatus(lead.id, status)
    if (before === null) return
    setKept((k) => new Set(k).add(lead.id))
    say({
      text: t('leads.statusChanged', { name: label(lead), status: t(`leads.status.${status}`) }),
      undo: () => setLeadStatus(lead.id, before),
    })
  }

  const doConvert = (lead: Lead) => {
    const farm = convertLeadToFarm(lead.id, HOME_BASE)
    setConfirm(null)
    if (!farm) return
    say({
      text: t('leads.converted', { name: label(lead) }),
      action: { label: t('leads.openFarm'), run: () => navigate(`/coordinator/farms/${farm.id}`) },
      undo: () => {
        const r = revertLeadConversion(lead.id)
        if (r !== 'ok') say({ text: t('leads.revertBlocked', { name: label(lead) }) })
      },
    })
  }

  const doRevert = (lead: Lead) => {
    setConfirm(null)
    const r = revertLeadConversion(lead.id)
    say({ text: r === 'ok' ? t('leads.reverted', { name: label(lead) }) : t('leads.revertBlocked', { name: label(lead) }) })
  }

  const doDelete = (lead: Lead) => {
    setConfirm(null)
    const copy = { ...lead }
    deleteLead(lead.id)
    say({
      text: t('leads.deleted', { name: label(lead) }),
      undo: () => {
        createLeads([
          {
            name: copy.name,
            contactName: copy.contactName,
            phone: copy.phone,
            place: copy.place,
            position: copy.position,
            regionId: copy.regionId,
            notes: copy.notes,
            source: copy.source,
            raw: copy.raw,
            status: copy.status,
            email: copy.email,
          },
        ])
      },
    })
  }

  const markers: MapMarker[] = leads
    .filter((l) => l.position)
    .map((l) => ({
      id: l.id,
      position: l.position!,
      color: readToken(STATUS_TOKEN[l.status]),
      title: l.name,
      subtitle: t(`leads.status.${l.status}`),
      emphasis: l.id === selected,
      onSelect: () => select(l.id, false),
    }))

  function select(id: string, fly: boolean): void {
    setSelected((cur) => (cur === id && fly ? null : id))
    if (fly) setFlyKey((k) => k + 1)
  }

  const mapBody = (
    <MapView
      ariaLabel={t('leads.mapLabel')}
      className="h-full w-full rounded-none"
      markers={markers}
      center={HOME_BASE}
      zoom={8}
      fit={markers.length > 0}
      flyTo={selectedLead?.position ? { position: selectedLead.position, key: flyKey, zoom: 12 } : undefined}
    />
  )

  const columns = useLeadColumns({
    regionName,
    onStatus: changeStatus,
    onMeeting: (lead) => navigate(formRoutes.newMeeting({ lead: lead.id })),
    onConvert: (lead) => setConfirm({ kind: 'convert', lead }),
    onDelete: (lead) => setConfirm({ kind: 'delete', lead }),
  })
  const rows = sortRowsBy(visible, columns, sort)

  return (
    <MapSplit screenKey="leads" ariaLabel={t('leads.mapLabel')} breakpoint="xl" contentPercent={66} splitHeight="h-[35dvh]" map={() => mapBody}>
      {() => (
        <>
          <ListTop
            title={t('leads.title')}
            info={
              <>
                <p>{t('leads.info')}</p>
                <p className="mt-1">{t('leads.notCounted')}</p>
              </>
            }
            shown={visible.length}
            total={counts.open + counts.not_now}
            search={query}
            onSearch={setQuery}
            searchPlaceholder={t('leads.search')}
            testId="leads-top"
            filters={
              <FilterRow activeCount={filter === 'open' ? 0 : 1} onClear={() => setFilter('open')}>
                <span role="group" aria-label={t('leads.filterLabel')} data-testid="leads-filters" className="contents">
                  {FILTERS.map((f) => (
                    <FilterPill
                      key={f}
                      active={filter === f}
                      onClick={() => setFilter(f)}
                      count={f === 'open' ? counts.open : counts[f]}
                      title={f === 'open' ? t('leads.filterAllLong') : t(`leads.status.${f}`)}
                      testId={`leads-filter-${f}`}
                    >
                      {f === 'open' ? t('leads.filterAll') : t(`leads.short.${f}`)}
                    </FilterPill>
                  ))}
                </span>
              </FilterRow>
            }
          />

          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(l) => l.id}
            sort={sort}
            onSort={setSort}
            onOpen={(l) => select(l.id, true)}
            openKey={selected}
            renderOpen={(l) => <LeadDetails lead={l} />}
            openLabel={t('leads.openRow')}
            rowAttrs={(l) => ({ 'data-lead-id': l.id, 'data-testid': `lead-${l.id}`, 'data-status': l.status })}
            empty={t('leads.empty')}
            label={t('leads.title')}
            testId="leads-table"
          />

          {converted.length > 0 && (
            <section className="mt-4" data-testid="leads-converted">
              <button
                type="button"
                className="flex min-h-[2.75rem] w-full items-center gap-2 border-b border-edge-subtle text-start font-semibold text-content-secondary"
                aria-expanded={showConverted}
                onClick={() => setShowConverted((v) => !v)}
                data-testid="leads-converted-toggle"
              >
                <Icon name="chevron" size={16} className={showConverted ? 'rotate-90' : 'rtl:-scale-x-100'} />
                {t('leads.convertedTitle', { count: converted.length })}
              </button>
              {showConverted && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {converted.map((l) => (
                    <li key={l.id} className="card flex flex-nowrap items-center gap-2 p-2" data-testid={`lead-converted-${l.id}`}>
                      <button type="button" className="min-w-0 flex-1 truncate text-start font-semibold text-content-primary" onClick={() => navigate(`/coordinator/farms/${l.convertedFarmId}`)}>
                        {label(l)}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary min-h-[2.75rem] shrink-0 whitespace-nowrap"
                        data-testid={`lead-revert-${l.id}`}
                        onClick={() => setConfirm({ kind: 'revert', lead: l })}
                      >
                        <Icon name="undo" size={16} />
                        {t('leads.revert')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {confirm && (
            <Modal title={t(`leads.confirm.${confirm.kind}.title`, { name: label(confirm.lead) })} onClose={() => setConfirm(null)} testId="leads-confirm">
              <p className="text-body text-content-secondary">{t(`leads.confirm.${confirm.kind}.body`, { name: label(confirm.lead) })}</p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-secondary min-h-[2.75rem]" onClick={() => setConfirm(null)} data-testid="leads-confirm-cancel">
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className={`${confirm.kind === 'delete' ? 'btn-danger' : 'btn-primary'} min-h-[2.75rem]`}
                  data-testid="leads-confirm-ok"
                  onClick={() =>
                    confirm.kind === 'convert' ? doConvert(confirm.lead) : confirm.kind === 'delete' ? doDelete(confirm.lead) : doRevert(confirm.lead)
                  }
                >
                  {t(`leads.confirm.${confirm.kind}.ok`)}
                </button>
              </div>
            </Modal>
          )}

          {toast && (
            <div
              role="status"
              data-testid="leads-toast"
              className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-xl flex-nowrap items-center gap-2 rounded-card bg-surface-overlay p-2 ps-4 shadow-lift"
            >
              <span className="min-w-0 flex-1 text-caption text-content-primary">{toast.text}</span>
              {toast.action && (
                <button type="button" className="btn-ghost min-h-[2.75rem] shrink-0 whitespace-nowrap" onClick={() => { toast.action!.run(); setToast(null) }}>
                  {toast.action.label}
                </button>
              )}
              {toast.undo && (
                <button
                  type="button"
                  className="btn-secondary min-h-[2.75rem] shrink-0 whitespace-nowrap"
                  data-testid="leads-undo"
                  onClick={() => {
                    toast.undo!()
                    setToast(null)
                  }}
                >
                  <Icon name="undo" size={16} />
                  {t('leads.undo')}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </MapSplit>
  )
}

// ---------------------------------------------------------------------------
// ★★ AX5 — les colonnes
// ---------------------------------------------------------------------------

function sortRowsBy(rows: readonly Lead[], columns: readonly Column<Lead>[], sort: SortState): Lead[] {
  const col = columns.find((c) => c.key === sort.key)
  const get = col?.sort
  if (!get) return [...rows]
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    const ea = va === null || va === ''
    const eb = vb === null || vb === ''
    if (ea !== eb) return ea ? 1 : -1
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'he', { numeric: true })
    return c * sign || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  })
}

const leadLabel = (l: Lead) => (l.name || l.contactName || l.phone).trim()
const dayMonth = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

function useLeadColumns({
  regionName,
  onStatus,
  onMeeting,
  onConvert,
  onDelete,
}: {
  regionName: (id: RegionId) => string
  onStatus: (lead: Lead, s: LeadStatus) => void
  onMeeting: (lead: Lead) => void
  onConvert: (lead: Lead) => void
  onDelete: (lead: Lead) => void
}): Column<Lead>[] {
  const { t } = useTranslation()
  const region = (l: Lead) => {
    const id = leadRegionId(l)
    return id ? regionName(id) : ''
  }
  return [
    {
      key: 'name',
      label: t('leads.col.name'),
      sort: leadLabel,
      title: leadLabel,
      className: 'w-[22%] min-w-[9rem]',
      render: (l) => <span className="font-semibold text-content-primary">{leadLabel(l)}</span>,
    },
    {
      key: 'contact',
      label: t('leads.col.contact'),
      sort: (l) => (l.contactName !== l.name ? l.contactName : ''),
      title: (l) => l.contactName,
      minWidth: 1000,
      className: 'w-[14%]',
      render: (l) => <span className="text-content-secondary" dir="auto">{l.contactName !== l.name ? l.contactName : ''}</span>,
    },
    {
      key: 'phone',
      label: t('leads.col.phone'),
      sort: (l) => l.phone,
      interactive: true,
      className: 'w-[11.5rem]',
      render: (l) =>
        l.phone ? (
          <span className="flex flex-nowrap items-center gap-0.5">
            <span className="ltr-nums min-w-0 truncate text-content-secondary" dir="ltr">{l.phone}</span>
            <a className="btn-ghost h-10 w-9 min-w-0 shrink-0 justify-center p-0" href={`tel:${l.phone.replace(/\D/gu, '')}`} aria-label={t('leads.call')} title={t('leads.call')} data-testid={`lead-call-${l.id}`}>
              <Icon name="phone" size={16} />
            </a>
            <a className="btn-ghost h-10 w-9 min-w-0 shrink-0 justify-center p-0" href={whatsappHref(l.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp" data-testid={`lead-whatsapp-${l.id}`}>
              <Icon name="whatsapp" size={16} />
            </a>
          </span>
        ) : (
          <span className="text-content-muted">{t('leads.noPhone')}</span>
        ),
    },
    {
      key: 'place',
      label: t('leads.col.place'),
      sort: (l) => l.place,
      title: (l) => l.place,
      minWidth: 640,
      className: 'w-[12%]',
      render: (l) => <span className="text-content-secondary">{l.place || '—'}</span>,
    },
    {
      key: 'region',
      label: t('leads.col.region'),
      sort: region,
      minWidth: 900,
      className: 'w-[9%]',
      render: (l) => <span className="text-content-secondary">{region(l) || '—'}</span>,
    },
    {
      key: 'status',
      label: t('leads.col.status'),
      sort: (l) => STATUS_ORDER[l.status],
      interactive: true,
      className: 'w-[16.5rem]',
      render: (l, { width }) => <StatusCell lead={l} wide={width === 0 || width >= 760} onChange={(s) => onStatus(l, s)} />,
    },
    {
      key: 'notes',
      label: t('leads.col.notes'),
      sort: (l) => l.notes,
      title: (l) => l.notes || undefined,
      minWidth: 1100,
      className: 'w-[16%]',
      render: (l) =>
        l.notes ? (
          <span className="text-content-secondary" dir="auto">{l.notes}</span>
        ) : (
          /* ★★ AX5.3 — rien ne disait qu'on pouvait écrire ici : la case vide le dit. */
          <span className="inline-flex items-center gap-1 text-content-muted group-hover:text-accent-ink">
            <Icon name="edit" size={13} />
            {t('leads.addNote')}
          </span>
        ),
    },
    {
      key: 'updated',
      label: t('leads.col.updated'),
      sort: (l) => l.updatedAt,
      minWidth: 1180,
      className: 'w-[4.5rem]',
      render: (l) => <span className="ltr-nums text-content-muted">{dayMonth(l.updatedAt)}</span>,
    },
    {
      key: 'created',
      label: t('leads.col.created'),
      sort: (l) => l.createdAt,
      minWidth: 1260,
      className: 'w-[4.5rem]',
      render: (l) => <span className="ltr-nums text-content-muted">{dayMonth(l.createdAt)}</span>,
    },
    {
      key: 'menu',
      label: '',
      interactive: true,
      className: 'w-12',
      render: (l) => (
        <OverflowMenu
          testId={`lead-menu-${l.id}`}
          items={[
            { key: 'meeting', icon: 'calendar', label: t('leads.meeting'), onClick: () => onMeeting(l), testId: `lead-meeting-${l.id}` },
            /* ★★ AX5 — en grand écran, la colonne montre les QUATRE statuts ouverts ;
               « לא רלוונטי » (qui retire la ligne de la vue) est ici, à un geste. */
            ...(l.status !== 'not_now'
              ? [{ key: 'notNow', icon: 'eyeOff' as const, label: t('leads.status.not_now'), onClick: () => onStatus(l, 'not_now'), testId: `lead-notnow-${l.id}` }]
              : []),
            { key: 'convert', icon: 'farm', label: t('leads.convertAsk'), onClick: () => onConvert(l), testId: `lead-convert-${l.id}` },
            { key: 'delete', icon: 'trash', label: t('leads.deleteAsk'), onClick: () => onDelete(l), danger: true, testId: `lead-delete-${l.id}` },
          ]}
        />
      ),
    },
  ]
}

/**
 * ★★ AX5 — LE STATUT, DANS SA COLONNE. Large : les cases d'AT2.4, un toucher
 * (les quatre ouverts ; « לא רלוונטי » est dans la liste déroulante et le
 * ⋯ n'en a pas besoin). Étroit : une liste déroulante, de la couleur du statut.
 */
function StatusCell({ lead, wide, onChange }: { lead: Lead; wide: boolean; onChange: (s: LeadStatus) => void }) {
  const { t } = useTranslation()
  if (wide && lead.status !== 'not_now') return <StatusSegments value={lead.status} onChange={onChange} testId={`lead-status-${lead.id}`} statuses={LEAD_OPEN_STATUSES} />
  return (
    <select
      className={`input min-h-[2.5rem] w-full max-w-[12rem] border py-1 text-caption font-semibold ${STATUS_ON[lead.status]}`}
      value={lead.status}
      aria-label={t('leads.statusLabel')}
      data-testid={`lead-status-${lead.id}`}
      data-value={lead.status}
      onChange={(e) => onChange(e.target.value as LeadStatus)}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s} data-testid={`lead-status-${lead.id}-${s}`}>
          {t(`leads.status.${s}`)}
        </option>
      ))}
    </select>
  )
}

/**
 * ★★ AT2.4 — LE GESTE : CINQ CASES TOUJOURS VISIBLES, L'ACTUELLE COLORÉE. Un
 *    groupe radio (clavier, lecteur d'écran), 44 px de haut, sans retour à la
 *    ligne : les libellés sont les courts (« ממתין »), l'infobulle et l'aria
 *    portent le long (« ממתין לתשובה »).
 */
function StatusSegments({ value, onChange, testId, statuses = LEAD_STATUSES }: { value: LeadStatus; onChange: (s: LeadStatus) => void; testId: string; statuses?: readonly LeadStatus[] }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('leads.statusLabel')} data-testid={testId} data-value={value} className="flex flex-nowrap gap-1">
      {statuses.map((s) => {
        const on = s === value
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={t(`leads.status.${s}`)}
            title={t(`leads.status.${s}`)}
            data-testid={`${testId}-${s}`}
            onClick={() => onChange(s)}
            className={`flex min-h-[2.75rem] flex-auto items-center justify-center whitespace-nowrap rounded-field border px-1.5 text-caption font-semibold transition-colors duration-fast ${
              on ? STATUS_ON[s] : 'border-edge-subtle text-content-secondary hover:bg-surface-high'
            }`}
          >
            {t(`leads.short.${s}`)}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Le détail, sous la ligne choisie : la note et le secteur (la région),
 * éditables sur place. ★★ AX5.3 — et ce que les colonnes repliées cachent
 * sur un écran étroit (le contact, le lieu), pour qu'ouvrir une ligne montre
 * TOUTE la fiche.
 */
function LeadDetails({ lead }: { lead: Lead }) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState(lead.notes)
  useEffect(() => setNotes(lead.notes), [lead.notes])
  /* La région qu'on DÉDUIT (point, sinon lieu dit) : la même que la colonne. */
  const auto = leadRegionId({ ...lead, regionId: null })
  const facts = [lead.contactName !== lead.name ? lead.contactName : '', lead.place].filter(Boolean).join(' · ')
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-testid={`lead-details-${lead.id}`}>
      <label className="flex flex-col gap-1">
        <span className="text-caption font-semibold text-content-secondary">{t('leads.notes')}</span>
        <textarea
          className="input min-h-[4.5rem]"
          dir="auto"
          value={notes}
          placeholder={t('leads.notesPlaceholder')}
          data-testid={`lead-notes-${lead.id}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== lead.notes && updateLead(lead.id, { notes })}
        />
      </label>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-content-secondary">{t('leads.region')}</span>
          <select
            className="input min-h-[2.75rem] py-2"
            value={(lead.regionId ?? '') as string}
            data-testid={`lead-region-${lead.id}`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateLead(lead.id, { regionId: (e.target.value || null) as RegionId | null })}
          >
            <option value="">{auto ? t('leads.regionAuto', { name: regionById(auto)?.name ?? '' }) : t('leads.pickRegion')}</option>
            {regions().map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {facts && <p className="text-caption text-content-secondary" dir="auto">{facts}</p>}
        {lead.email && (
          <a className="flex min-h-[2.75rem] items-center gap-2 text-caption font-semibold text-accent-ink" href={`mailto:${lead.email}`} dir="ltr" data-testid={`lead-email-${lead.id}`}>
            <Icon name="message" size={15} />
            {lead.email}
          </a>
        )}
      </div>
      {lead.raw && (
        <p className="muted whitespace-pre-wrap text-micro lg:col-span-2" dir="auto">
          {t('leads.raw')}: {lead.raw}
        </p>
      )}
    </div>
  )
}
