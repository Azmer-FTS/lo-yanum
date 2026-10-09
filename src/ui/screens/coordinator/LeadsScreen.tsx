import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  HOME_BASE,
  LEAD_SORTS,
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
  sortLeads,
  updateLead,
  whatsappHref,
} from '@core/index'
import type { Lead, LeadSort, LeadStatus, RegionId } from '@core/index'
import { formRoutes } from './FormPages'
import { Icon } from '../../components/Icon'
import { MapSplit } from '../../components/MapSplit'
import { MapView } from '../../components/MapView'
import type { MapMarker } from '../../components/MapView'
import { OverflowMenu } from '../../components/OverflowMenu'
import { TabBar } from '../../components/TabBar'
import { readToken } from '../../components/badges'
import { Modal, PageHeader } from '../../components/primitives'
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

type Filter = 'open' | LeadStatus
const FILTERS: readonly Filter[] = ['open', 'not_called', 'no_answer', 'call_back', 'meeting_set']
const SORT_KEY = 'lo-yanum:leads-sort'

function readSort(): LeadSort {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return (LEAD_SORTS as readonly string[]).includes(v ?? '') ? (v as LeadSort) : 'newest'
  } catch {
    return 'newest'
  }
}

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
  const [sort, setSortState] = useState<LeadSort>(() => readSort())
  const [selected, setSelected] = useState<string | null>(null)
  const [flyKey, setFlyKey] = useState(0)
  const [showClosed, setShowClosed] = useState(false)
  const [showConverted, setShowConverted] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'convert' | 'delete' | 'revert'; lead: Lead } | null>(null)
  const [toast, setToast] = useState<Undo | null>(null)
  const toastTimer = useRef<number | null>(null)

  const counts = useMemo(() => leadCounts(leads), [leads])
  const regionName = (id: RegionId) => regionById(id)?.name ?? ''
  const sorted = useMemo(() => sortLeads(leads, sort, regionName), [leads, sort])
  const visible = sorted.filter((l) =>
    kept.has(l.id) ? true : filter === 'open' ? l.status !== 'not_now' : l.status === filter,
  )
  const closed = sorted.filter((l) => l.status === 'not_now' && !kept.has(l.id))
  const selectedLead = leads.find((l) => l.id === selected) ?? null

  const setFilter = (f: Filter) => {
    setFilterState(f)
    setKept(new Set())
  }
  const setSort = (s: LeadSort) => {
    setSortState(s)
    try {
      localStorage.setItem(SORT_KEY, s)
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
    requestAnimationFrame(() => document.querySelector(`[data-lead-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }))
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

  const row = (lead: Lead) => (
    <LeadRow
      key={lead.id}
      lead={lead}
      selected={selected === lead.id}
      onSelect={() => select(lead.id, true)}
      onStatus={(s) => changeStatus(lead, s)}
      onMeeting={() => navigate(formRoutes.newMeeting({ lead: lead.id }))}
      onConvert={() => setConfirm({ kind: 'convert', lead })}
      onDelete={() => setConfirm({ kind: 'delete', lead })}
    />
  )

  return (
    <MapSplit screenKey="leads" ariaLabel={t('leads.mapLabel')} breakpoint="xl" contentPercent={58} splitHeight="h-[35dvh]" map={() => mapBody}>
      {() => (
        <>
          <PageHeader
            title={t('leads.title')}
            subtitle={t('leads.subtitle', { count: counts.open })}
            actions={
              /* ★★ AW2 — l'ajout (saisie, fiches .vcf, collage) a son écran, le
                 type « חווה » déjà choisi : le collage n'est plus un panneau
                 caché ici. */
              <Link to="/coordinator/add?type=farm" className="btn-primary min-h-[2.75rem] whitespace-nowrap" data-testid="leads-add">
                <Icon name="plus" size={16} />
                {t('add.entry')}
              </Link>
            }
          />

          <TabBar
            items={FILTERS.map((f) => ({
              key: f,
              label: f === 'open' ? t('leads.filterAll') : t(`leads.short.${f}`),
              title: f === 'open' ? t('leads.filterAll') : t(`leads.status.${f}`),
              count: f === 'open' ? counts.open : counts[f],
            }))}
            active={filter}
            onSelect={setFilter}
            label={t('leads.filterLabel')}
            idPrefix="leads"
            testId="leads-tabs"
            size="sm"
          />

          <div className="my-3 flex flex-nowrap items-center gap-2">
            <label className="flex min-w-0 items-center gap-2">
              <span className="muted shrink-0">{t('leads.sortLabel')}</span>
              <select
                className="input min-h-[2.75rem] min-w-0 py-2"
                value={sort}
                data-testid="leads-sort"
                onChange={(e) => setSort(e.target.value as LeadSort)}
              >
                {LEAD_SORTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`leads.sort.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted ms-auto hidden truncate sm:block" data-testid="leads-not-counted">
              {t('leads.notCounted')}
            </span>
          </div>

          <div id={`leads-panel-${filter}`} role="tabpanel" aria-labelledby={`leads-tab-${filter}`} data-testid="leads-list" className="flex flex-col gap-2">
            {visible.length === 0 && <p className="muted px-1 py-6 text-center">{t('leads.empty')}</p>}
            {visible.map(row)}
          </div>

          {closed.length > 0 && (
            <section className="mt-6" data-testid="leads-closed">
              <button
                type="button"
                className="flex min-h-[2.75rem] w-full items-center gap-2 border-b border-edge-subtle text-start font-semibold text-content-secondary"
                aria-expanded={showClosed}
                onClick={() => setShowClosed((v) => !v)}
                data-testid="leads-closed-toggle"
              >
                <Icon name="chevron" size={16} className={showClosed ? 'rotate-90' : 'rtl:-scale-x-100'} />
                {t('leads.closedTitle', { count: closed.length })}
              </button>
              {showClosed && <div className="mt-2 flex flex-col gap-2">{closed.map(row)}</div>}
            </section>
          )}

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
// Une ligne
// ---------------------------------------------------------------------------

function LeadRow({
  lead,
  selected,
  onSelect,
  onStatus,
  onMeeting,
  onConvert,
  onDelete,
}: {
  lead: Lead
  selected: boolean
  onSelect: () => void
  onStatus: (s: LeadStatus) => void
  onMeeting: () => void
  onConvert: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const region = leadRegionId(lead)
  const closed = lead.status === 'not_now'
  const sub = [lead.contactName !== lead.name ? lead.contactName : '', lead.phone].filter(Boolean).join(' · ')
  const where = [lead.place, region ? regionById(region)?.name : ''].filter(Boolean).join(' · ')

  return (
    <article
      data-lead-id={lead.id}
      data-testid={`lead-${lead.id}`}
      data-status={lead.status}
      aria-current={selected || undefined}
      className={`card flex flex-col gap-2 p-3 ${selected ? 'ring-2 ring-accent' : ''} ${closed ? 'opacity-80' : ''}`}
    >
      <div className="flex flex-nowrap items-start gap-1">
        <button type="button" className="min-w-0 flex-1 text-start" onClick={onSelect} data-testid={`lead-open-${lead.id}`} aria-expanded={selected}>
          <p className="truncate font-semibold text-content-primary">{lead.name || lead.contactName || lead.phone}</p>
          {sub && <p className="muted truncate" dir="auto">{sub}</p>}
          <p className="muted truncate">{where || t('leads.noPlace')}</p>
        </button>
        {lead.phone && (
          <>
            <a
              className="btn-ghost h-11 w-11 min-w-[2.75rem] shrink-0 justify-center p-0"
              href={`tel:${lead.phone.replace(/\D/gu, '')}`}
              aria-label={t('leads.call')}
              title={t('leads.call')}
              data-testid={`lead-call-${lead.id}`}
            >
              <Icon name="phone" size={18} />
            </a>
            <a
              className="btn-ghost h-11 w-11 min-w-[2.75rem] shrink-0 justify-center p-0"
              href={whatsappHref(lead.phone)}
              target="_blank"
              rel="noreferrer"
              aria-label="WhatsApp"
              title="WhatsApp"
              data-testid={`lead-whatsapp-${lead.id}`}
            >
              <Icon name="whatsapp" size={18} />
            </a>
          </>
        )}
        <OverflowMenu
          testId={`lead-menu-${lead.id}`}
          items={[
            { key: 'meeting', icon: 'calendar', label: t('leads.meeting'), onClick: onMeeting, testId: `lead-meeting-${lead.id}` },
            { key: 'convert', icon: 'farm', label: t('leads.convertAsk'), onClick: onConvert, testId: `lead-convert-${lead.id}` },
            { key: 'delete', icon: 'trash', label: t('leads.deleteAsk'), onClick: onDelete, danger: true, testId: `lead-delete-${lead.id}` },
          ]}
        />
      </div>

      {lead.notes && !selected && <p className="line-clamp-2 text-caption text-content-secondary">{lead.notes}</p>}

      <StatusSegments value={lead.status} onChange={onStatus} testId={`lead-status-${lead.id}`} />

      {selected && <LeadDetails lead={lead} />}
    </article>
  )
}

/**
 * ★★ AT2.4 — LE GESTE : CINQ CASES TOUJOURS VISIBLES, L'ACTUELLE COLORÉE. Un
 *    groupe radio (clavier, lecteur d'écran), 44 px de haut, sans retour à la
 *    ligne : les libellés sont les courts (« ממתין »), l'infobulle et l'aria
 *    portent le long (« ממתין לתשובה »).
 */
function StatusSegments({ value, onChange, testId }: { value: LeadStatus; onChange: (s: LeadStatus) => void; testId: string }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('leads.statusLabel')} data-testid={testId} className="flex flex-nowrap gap-1">
      {LEAD_STATUSES.map((s) => {
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

/** Le détail, sous la ligne choisie : la note et la région, éditables sur place. */
function LeadDetails({ lead }: { lead: Lead }) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState(lead.notes)
  useEffect(() => setNotes(lead.notes), [lead.notes])
  return (
    <div className="flex flex-col gap-2 border-t border-edge-subtle pt-2" data-testid={`lead-details-${lead.id}`}>
      <label className="flex flex-col gap-1">
        <span className="text-caption font-semibold text-content-secondary">{t('leads.notes')}</span>
        <textarea
          className="input min-h-[4.5rem]"
          dir="auto"
          value={notes}
          data-testid={`lead-notes-${lead.id}`}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== lead.notes && updateLead(lead.id, { notes })}
        />
      </label>
      {!lead.position && (
        <label className="flex flex-nowrap items-center gap-2">
          <span className="text-caption font-semibold text-content-secondary">{t('leads.region')}</span>
          <select
            className="input min-h-[2.75rem] min-w-0 flex-1 py-2"
            value={(lead.regionId ?? '') as string}
            data-testid={`lead-region-${lead.id}`}
            onChange={(e) => updateLead(lead.id, { regionId: (e.target.value || null) as RegionId | null })}
          >
            <option value="">{t('leads.pickRegion')}</option>
            {regions().map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {lead.email && (
        <a className="flex min-h-[2.75rem] items-center gap-2 text-caption font-semibold text-accent-ink" href={`mailto:${lead.email}`} dir="ltr" data-testid={`lead-email-${lead.id}`}>
          <Icon name="message" size={15} />
          {lead.email}
        </a>
      )}
      {lead.raw && (
        <p className="muted whitespace-pre-wrap text-micro" dir="auto">
          {t('leads.raw')}: {lead.raw}
        </p>
      )}
    </div>
  )
}


