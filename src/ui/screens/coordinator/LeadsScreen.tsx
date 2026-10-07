import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  HOME_BASE,
  LEAD_STATUSES,
  convertLeadToFarm,
  createLeads,
  getVisibleFarms,
  getVisibleLeads,
  leadColumns,
  leadRegionId,
  moveLead,
  parseLeadBlock,
  regionById,
  regions,
  updateLead,
  whatsappHref,
} from '@core/index'
import type { Lead, LeadGrouping, LeadStatus, ParsedLead, RegionId } from '@core/index'
import { formRoutes } from './FormPages'
import { Icon } from '../../components/Icon'
import { MapSplit } from '../../components/MapSplit'
import { MapView } from '../../components/MapView'
import type { MapMarker } from '../../components/MapView'
import { readToken } from '../../components/badges'
import { FilterPill, PageHeader, PillSelect } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AS6 (2026-10-07) — « אנשי קשר לטיפול », LA SALLE D'ATTENTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ COLONNES PAR STATUT PAR DÉFAUT, PAR RÉGION SUR UN GESTE. Le statut est
 *   la question du jour (« qui dois-je rappeler ? ») ; la région est celle de
 *   la tournée (« qui est près de là où je vais ? »). Le premier est le
 *   travail quotidien sur vingt contacts reçus d'un coup, le second sert la
 *   veille d'un déplacement. Une carte À CÔTÉ situe les pistes qui ont un lieu ;
 *   celles qui n'en ont pas reçoivent une région à la main.
 *
 * ★★ DEUX FAÇONS DE DÉPLACER UNE CARTE, PARCE QU'EN AH9 LE GLISSER NATIF NE
 *    MARCHAIT PAS AU DOIGT SUR iPadOS :
 *   - le GLISSER par la poignée, en événements de POINTEUR (souris, doigt,
 *     crayon : un seul code), `touch-action: none` sur la poignée ;
 *   - deux FLÈCHES de 44 px, colonne précédente / suivante ;
 *   - et le statut lui-même, en un geste, dans la pilule de la carte.
 *
 * ⛔ AUCUN COMPTEUR NE VOIT CES PISTES : elles vivent dans `leads`, et ni
 *    l'objectif, ni les dounams, ni le compte rendu, ni le rapport d'activité
 *    ne lisent cette collection (`aspass`, A296).
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

export function LeadsScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const leads = useCoreValue(() => getVisibleLeads())
  const farms = useCoreValue(() => getVisibleFarms())
  const [grouping, setGrouping] = useState<LeadGrouping>('status')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [flyKey, setFlyKey] = useState(0)
  const regionOrder = useMemo(() => regions().map((r) => r.id), [])
  const columns = useMemo(() => leadColumns(leads, grouping, regionOrder), [leads, grouping, regionOrder])
  const selectedLead = leads.find((l) => l.id === selected) ?? null

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
    setSelected(id)
    if (fly) setFlyKey((k) => k + 1)
    requestAnimationFrame(() => document.querySelector(`[data-lead-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  }

  const neighbour = (col: number, dir: -1 | 1) => columns[col + dir]
  const moveTo = (lead: Lead, colKey: string, before: string | null = null): void => {
    const col = columns.find((c) => c.key === colKey)
    if (!col) return
    if (col.status) moveLead(lead.id, { status: col.status, before })
    else moveLead(lead.id, { regionId: col.regionId === 'none' ? null : (col.regionId as RegionId), before })
  }

  const convert = (lead: Lead): void => {
    const farm = convertLeadToFarm(lead.id, HOME_BASE)
    if (farm) navigate(`/coordinator/farms/${farm.id}`)
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

  return (
    <MapSplit screenKey="leads" ariaLabel={t('leads.mapLabel')} breakpoint="xl" contentPercent={58} splitHeight="h-[35dvh]" map={() => mapBody}>
      {() => (
        <>
          <PageHeader
            title={t('leads.title')}
            subtitle={t('leads.subtitle', { count: leads.length })}
            actions={
              <button type="button" className="btn-primary min-h-[2.75rem]" data-testid="leads-paste-open" onClick={() => setPasteOpen((v) => !v)}>
                <Icon name="plus" size={16} />
                {t('leads.paste')}
              </button>
            }
          />

          {pasteOpen && (
            <PastePanel
              onClose={() => setPasteOpen(false)}
              existingLeads={leads}
              farms={farms}
              onCreated={(ids) => {
                setPasteOpen(false)
                if (ids[0]) select(ids[0], true)
              }}
            />
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={t('leads.groupBy')}>
            <span className="muted">{t('leads.groupBy')}</span>
            <FilterPill active={grouping === 'status'} onClick={() => setGrouping('status')} testId="leads-by-status">
              {t('leads.byStatus')}
            </FilterPill>
            <FilterPill active={grouping === 'region'} onClick={() => setGrouping('region')} testId="leads-by-region">
              {t('leads.byRegion')}
            </FilterPill>
            <span className="muted ms-auto" data-testid="leads-not-counted">
              {t('leads.notCounted')}
            </span>
          </div>

          <Board
            columns={columns}
            grouping={grouping}
            selected={selected}
            onSelect={(id) => select(id, true)}
            onMove={moveTo}
            neighbour={neighbour}
            onMeeting={(lead) => navigate(formRoutes.newMeeting({ lead: lead.id }))}
            onConvert={convert}
          />

        </>
      )}
    </MapSplit>
  )
}

// ---------------------------------------------------------------------------
// Le tableau
// ---------------------------------------------------------------------------

function Board({
  columns,
  grouping,
  selected,
  onSelect,
  onMove,
  neighbour,
  onMeeting,
  onConvert,
}: {
  columns: ReturnType<typeof leadColumns>
  grouping: LeadGrouping
  selected: string | null
  onSelect: (id: string) => void
  onMove: (lead: Lead, colKey: string, before?: string | null) => void
  neighbour: (col: number, dir: -1 | 1) => ReturnType<typeof leadColumns>[number] | undefined
  onMeeting: (lead: Lead) => void
  onConvert: (lead: Lead) => void
}) {
  const { t } = useTranslation()
  const board = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; dx: number; dy: number; over: string | null; before: string | null } | null>(null)

  const columnTitle = (c: (typeof columns)[number]): string =>
    c.status ? t(`leads.status.${c.status}`) : c.regionId === 'none' ? t('leads.noRegion') : (regionById(c.regionId as RegionId)?.name ?? '')

  /* ★★ LE GLISSER EN ÉVÉNEMENTS DE POINTEUR — doigt, souris, crayon. */
  const startDrag = (e: ReactPointerEvent<HTMLElement>, lead: Lead): void => {
    const card = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-lead-id]')
    if (!card) return
    const r = card.getBoundingClientRect()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ id: lead.id, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, over: null, before: null })
  }
  const moveDrag = (e: ReactPointerEvent<HTMLElement>): void => {
    if (!drag) return
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => !(n as HTMLElement).closest?.('[data-dragging]')) as HTMLElement | undefined
    const col = el?.closest<HTMLElement>('[data-lead-col]')?.dataset.leadCol ?? null
    const beforeCard = el?.closest<HTMLElement>('[data-lead-id]')?.dataset.leadId ?? null
    /* Bord de la rangée : elle défile toute seule vers la colonne visée. */
    const b = board.current?.getBoundingClientRect()
    if (b && board.current) {
      if (e.clientX < b.left + 40) board.current.scrollLeft -= 18
      if (e.clientX > b.right - 40) board.current.scrollLeft += 18
    }
    setDrag({ ...drag, x: e.clientX, y: e.clientY, over: col, before: beforeCard === drag.id ? null : beforeCard })
  }
  const endDrag = (lead: Lead): void => {
    if (drag?.over) onMove(lead, drag.over, drag.before)
    setDrag(null)
  }

  return (
    <div
      ref={board}
      data-testid="leads-board"
      data-grouping={grouping}
      className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-4"
    >
      {columns.map((col, ci) => (
        <section
          key={col.key}
          data-lead-col={col.key}
          data-testid={`leads-col-${col.key}`}
          aria-label={columnTitle(col)}
          className={`flex w-[min(84vw,19.5rem)] shrink-0 snap-start flex-col gap-2 rounded-card bg-surface-sunken p-2 ${
            drag?.over === col.key ? 'ring-2 ring-accent' : ''
          }`}
        >
          <h2 className="flex items-center justify-between px-1 pt-1 text-caption font-semibold text-content-primary">
            <span>{columnTitle(col)}</span>
            <span className="filter-count" data-testid={`leads-col-count-${col.key}`}>
              {col.leads.length}
            </span>
          </h2>
          {col.leads.length === 0 && <p className="muted px-1 pb-2">{t('leads.emptyColumn')}</p>}
          {col.leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              selected={selected === lead.id}
              dragging={drag?.id === lead.id ? drag : null}
              onSelect={() => onSelect(lead.id)}
              onPrev={neighbour(ci, -1) ? () => onMove(lead, neighbour(ci, -1)!.key) : undefined}
              onNext={neighbour(ci, 1) ? () => onMove(lead, neighbour(ci, 1)!.key) : undefined}
              prevLabel={neighbour(ci, -1) ? columnTitle(neighbour(ci, -1)!) : ''}
              nextLabel={neighbour(ci, 1) ? columnTitle(neighbour(ci, 1)!) : ''}
              onDragStart={(e) => startDrag(e, lead)}
              onDragMove={moveDrag}
              onDragEnd={() => endDrag(lead)}
              onMeeting={() => onMeeting(lead)}
              onConvert={() => onConvert(lead)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

function LeadCard({
  lead,
  selected,
  dragging,
  onSelect,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  onDragStart,
  onDragMove,
  onDragEnd,
  onMeeting,
  onConvert,
}: {
  lead: Lead
  selected: boolean
  dragging: { x: number; y: number; dx: number; dy: number } | null
  onSelect: () => void
  onPrev?: () => void
  onNext?: () => void
  prevLabel: string
  nextLabel: string
  onDragStart: (e: ReactPointerEvent<HTMLElement>) => void
  onDragMove: (e: ReactPointerEvent<HTMLElement>) => void
  onDragEnd: () => void
  onMeeting: () => void
  onConvert: () => void
}) {
  const { t } = useTranslation()
  const closed = lead.status === 'not_interested' || lead.status === 'not_now'
  const region = leadRegionId(lead)
  const statusOptions = LEAD_STATUSES.map((s) => ({ value: s, label: t(`leads.status.${s}`) }))
  const regionOptions = [
    { value: '' as string, label: t('leads.pickRegion') },
    ...regions().map((r) => ({ value: r.id as string, label: r.name })),
  ]
  const style = dragging
    ? { position: 'fixed' as const, insetInlineStart: 'auto', left: dragging.x - dragging.dx, top: dragging.y - dragging.dy, width: '16rem', zIndex: 60, pointerEvents: 'none' as const }
    : undefined

  return (
    <article
      data-lead-id={lead.id}
      data-testid={`lead-${lead.id}`}
      data-status={lead.status}
      data-dragging={dragging ? '' : undefined}
      aria-current={selected || undefined}
      style={style}
      className={`card flex flex-col gap-2 p-3 ${selected ? 'ring-2 ring-accent' : ''} ${closed ? 'opacity-75' : ''} ${dragging ? 'shadow-card' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={t('leads.drag')}
          title={t('leads.drag')}
          data-testid={`lead-drag-${lead.id}`}
          className="-ms-1 flex h-11 w-8 shrink-0 cursor-grab items-center justify-center text-content-muted [touch-action:none]"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <Icon name="more" size={18} />
        </button>
        <button type="button" className="min-w-0 flex-1 text-start" onClick={onSelect} data-testid={`lead-open-${lead.id}`}>
          <p className="truncate text-caption font-semibold text-content-primary">{lead.name || lead.contactName || lead.phone}</p>
          <p className="muted truncate">
            {[lead.contactName !== lead.name ? lead.contactName : '', lead.phone].filter(Boolean).join(' · ') || '—'}
          </p>
          <p className="muted truncate">
            {[lead.place, region ? regionById(region)?.name : t('leads.noRegion')].filter(Boolean).join(' · ')}
            {!lead.position && lead.place === '' ? ` · ${t('leads.noPlace')}` : ''}
          </p>
        </button>
      </div>
      {closed && (
        <p className="text-caption font-semibold text-content-secondary" data-testid={`lead-closed-${lead.id}`}>
          {t(`leads.status.${lead.status}`)} · {t('leads.doorOpen')}
        </p>
      )}
      {lead.notes && <p className="line-clamp-2 text-caption text-content-secondary">{lead.notes}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        <PillSelect
          value={lead.status}
          onChange={(s) => moveLead(lead.id, { status: s })}
          options={statusOptions}
          label={t('leads.statusLabel')}
          testId={`lead-status-${lead.id}`}
          active
        />
        {!lead.position && (
          <PillSelect
            value={(lead.regionId ?? '') as string}
            onChange={(r) => updateLead(lead.id, { regionId: (r || null) as RegionId | null })}
            options={regionOptions}
            label={t('leads.pickRegion')}
            icon="region"
            testId={`lead-region-${lead.id}`}
          />
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="btn-ghost h-11 w-11 min-w-[2.75rem] shrink-0 justify-center p-0"
          aria-label={prevLabel ? t('leads.moveTo', { to: prevLabel }) : undefined}
          title={prevLabel ? t('leads.moveTo', { to: prevLabel }) : undefined}
          disabled={!onPrev}
          data-testid={`lead-prev-${lead.id}`}
          onClick={onPrev}
        >
          <Icon name="chevron" size={18} className="rtl:-scale-x-100" />
        </button>
        <button
          type="button"
          className="btn-ghost h-11 w-11 min-w-[2.75rem] shrink-0 justify-center p-0"
          aria-label={nextLabel ? t('leads.moveTo', { to: nextLabel }) : undefined}
          title={nextLabel ? t('leads.moveTo', { to: nextLabel }) : undefined}
          disabled={!onNext}
          data-testid={`lead-next-${lead.id}`}
          onClick={onNext}
        >
          <Icon name="chevron" size={18} className="ltr:-scale-x-100" />
        </button>
        <span className="flex-1" />
        {lead.phone && (
          <>
            <a className="btn-ghost h-11 w-11 min-w-[2.75rem] shrink-0 justify-center p-0" href={`tel:${lead.phone.replace(/\D/gu, '')}`} aria-label={t('leads.call')} title={t('leads.call')}>
              <Icon name="phone" size={17} />
            </a>
            <a className="btn-ghost h-11 w-11 min-w-[2.75rem] shrink-0 justify-center p-0" href={whatsappHref(lead.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp">
              <Icon name="whatsapp" size={17} />
            </a>
          </>
        )}
        <button type="button" className="btn-ghost h-11 w-11 min-w-[2.75rem] shrink-0 justify-center p-0" aria-label={t('leads.meeting')} title={t('leads.meeting')} data-testid={`lead-meeting-${lead.id}`} onClick={onMeeting}>
          <Icon name="calendar" size={17} />
        </button>
        <button type="button" className="btn-ghost h-11 w-11 min-w-[2.75rem] shrink-0 justify-center p-0" aria-label={t('leads.convert')} title={t('leads.convert')} data-testid={`lead-convert-${lead.id}`} onClick={onConvert}>
          <Icon name="farm" size={17} />
        </button>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// L'entrée en masse
// ---------------------------------------------------------------------------

function PastePanel({
  onClose,
  onCreated,
  existingLeads,
  farms,
}: {
  onClose: () => void
  onCreated: (ids: string[]) => void
  existingLeads: readonly Lead[]
  farms: ReadonlyArray<{ farmerPhone?: string; liaisonPhone?: string; name: string }>
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [off, setOff] = useState<Set<number>>(new Set())
  const parsed: ParsedLead[] = useMemo(() => parseLeadBlock(text, { leads: existingLeads, farms }), [text, existingLeads, farms])
  const defaultOff = (p: ParsedLead): boolean => p.noPhone || p.duplicateOf !== null
  const isOn = (i: number): boolean => (off.has(i) ? false : off.has(-i - 1) ? true : !defaultOff(parsed[i]))
  const toggle = (i: number): void => {
    const next = new Set(off)
    const on = isOn(i)
    next.delete(i)
    next.delete(-i - 1)
    if (on) next.add(i)
    else next.add(-i - 1)
    setOff(next)
  }
  const chosen = parsed.filter((_, i) => isOn(i))

  const create = (): void => {
    const made = createLeads(
      chosen.map((p) => ({
        name: p.name || p.contactName || p.phone,
        contactName: p.contactName,
        phone: p.phone,
        place: p.place,
        position: p.position,
        regionId: null,
        notes: p.notes,
        source: 'paste' as const,
        raw: p.raw,
      })),
    )
    onCreated(made.map((m) => m.id))
  }

  return (
    <div className="card card-pad mb-4 flex flex-col gap-3" data-testid="leads-paste">
      <label className="flex flex-col gap-1.5">
        <span className="text-caption font-semibold text-content-primary">{t('leads.pasteLabel')}</span>
        <textarea
          className="input min-h-[8rem]"
          dir="auto"
          value={text}
          placeholder={t('leads.pastePlaceholder')}
          data-testid="leads-paste-text"
          onChange={(e) => {
            setText(e.target.value)
            setOff(new Set())
          }}
        />
        <span className="muted">{t('leads.pasteHint')}</span>
      </label>
      {parsed.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="leads-paste-preview">
          {parsed.map((p, i) => (
            <li key={`${p.phone}-${i}`} className="flex items-center gap-2 text-caption">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={isOn(i)}
                onChange={() => toggle(i)}
                data-testid={`leads-paste-row-${i}`}
                aria-label={p.name || p.phone}
              />
              <span className="min-w-0 flex-1 truncate">
                <b>{p.name || '—'}</b>
                {p.contactName && p.contactName !== p.name ? ` · ${p.contactName}` : ''}
                {p.phone ? ` · ${p.phone}` : ''}
                {p.place ? ` · ${p.place}` : ''}
              </span>
              {p.duplicateOf && (
                <span className="text-status-warn-ink">{t(p.duplicateOf.kind === 'farm' ? 'leads.dupFarm' : 'leads.dupLead', { name: p.duplicateOf.name })}</span>
              )}
              {p.noPhone && <span className="muted">{t('leads.noPhone')}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary min-h-[2.75rem]" disabled={chosen.length === 0} onClick={create} data-testid="leads-paste-create">
          {t('leads.create', { count: chosen.length })}
        </button>
        <button type="button" className="btn-secondary min-h-[2.75rem]" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
