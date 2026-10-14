import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  addDays,
  buildSearchDocs,
  contactRoleKey,
  formatDate,
  formatDateTime,
  getCalendarEvents,
  getInstitutions,
  getTaskLists,
  getTasks,
  getTours,
  getVisibleFarms,
  groupHits,
  now,
  pushRecent,
  recentKeyOf,
  searchDocs,
} from '@core/index'
import type { SearchDoc, SearchHit, SearchKind } from '@core/index'

import { FarmStatusDot } from '../components/badges'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { useCoreValue } from '../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BF (2026-10-14) — LA RECHERCHE GLOBALE, COMME SPOTLIGHT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⌘K / Ctrl+K partout (même depuis un champ), ou la loupe de l'en-tête (le
 * rail sur ordinateur). Une fenêtre PAR-DESSUS l'écran : le voile et la
 * surface des fenêtres de l'application (`Modal` : `bg-surface-sunken/80`,
 * `bg-surface-overlay`, `rounded-card`, `shadow-lift`) — aucune surface
 * flottante de plus. Rien ne bouge derrière.
 *
 * Trois sorties : Échap, un toucher hors de la fenêtre, le bouton retour
 * d'Android (une entrée d'historique est posée à l'ouverture). Le focus
 * revient où il était.
 *
 * La correspondance est `core/search.ts` (pur) ; ici, l'affichage, le clavier,
 * et la navigation — comme si la fiche avait été ouverte depuis sa liste.
 */

const RECENT_KEY = 'lo-yanum:search:recent'
const OPEN_EVENT = 'lo-yanum:search-open'
const DEBOUNCE_MS = 120
const PER_GROUP = 5

const KIND_ICON: Record<SearchKind, IconName> = {
  farm: 'farm',
  institution: 'school',
  contact: 'user',
  tour: 'route',
  task: 'checklist',
  event: 'calendar',
  locality: 'pin',
}

/** La loupe de l'en-tête et du rail : ouvre la recherche. */
export function openGlobalSearch(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}
function writeRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    /* navigation privée : la liste vit le temps de la page */
  }
}

/** Le bouton loupe : 44 px, partout où il est posé. */
export function SearchButton({ withLabel = false, className = '' }: { withLabel?: boolean; className?: string }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={openGlobalSearch}
      aria-label={t('search.open')}
      title={`${t('search.open')} (${t('search.shortcut')})`}
      data-testid="global-search-button"
      className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-field text-content-secondary transition-colors duration-fast hover:bg-surface-high hover:text-content-primary ${className}`}
    >
      <Icon name="search" size={withLabel ? 17 : 20} />
      {withLabel && (
        <>
          <span className="text-caption">{t('search.open')}</span>
          <kbd className="ms-auto rounded-field border border-edge-subtle px-1.5 text-micro text-content-muted" dir="ltr">
            {t('search.shortcut')}
          </kbd>
        </>
      )}
    </button>
  )
}

/**
 * Monté UNE fois, dans la coquille du coordinateur. Écoute le raccourci et la
 * loupe ; rend la fenêtre quand elle est ouverte.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const show = (): void => {
      /* Une fenêtre bloquante déjà ouverte garde la main. */
      if (document.querySelector('[aria-modal="true"]')) return
      openerRef.current = document.activeElement as HTMLElement | null
      setOpen(true)
    }
    const onKey = (e: KeyboardEvent): void => {
      /* `code`, et pas seulement `key` : sur un clavier hébreu, K écrit « ל ». */
      const k = e.code === 'KeyK' || e.key.toLowerCase() === 'k'
      if (!k || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      e.preventDefault()
      e.stopPropagation()
      show()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener(OPEN_EVENT, show)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener(OPEN_EVENT, show)
    }
  }, [])

  if (!open) return null
  return (
    <SearchOverlay
      onClose={(restoreFocus) => {
        setOpen(false)
        const opener = openerRef.current
        openerRef.current = null
        if (restoreFocus && opener && document.contains(opener)) opener.focus({ preventScroll: true })
      }}
    />
  )
}

/** Les documents, à partir de ce que l'application a DÉJÀ en mémoire. */
function useSearchDocs(): SearchDoc[] {
  const { t, i18n } = useTranslation()
  const farms = useCoreValue(getVisibleFarms)
  const institutions = useCoreValue(getInstitutions)
  const tours = useCoreValue(getTours)
  const tasks = useCoreValue(getTasks)
  const taskLists = useCoreValue(getTaskLists)
  const events = useCoreValue(() => {
    const today = now()
    return getCalendarEvents(addDays(today, -120), addDays(today, 365))
  })
  const lang = i18n.language
  return useMemo(
    () =>
      buildSearchDocs(
        { farms, institutions, tours, tasks, taskLists, events },
        {
          date: (iso) => formatDateTime(iso, lang),
          day: (key) => formatDate(`${key}T12:00:00`, lang),
          institutionRole: (inst, role, secretariat) =>
            secretariat ? t('search.secretariat') : t(`institutions.role.${contactRoleKey(inst, role)}`),
          farmContact: t('search.farmContact'),
          stops: (count) => t('search.stops', { count }),
          localityCounts: (f, i) =>
            [f > 0 ? t('search.farms', { count: f }) : '', i > 0 ? t('search.institutions', { count: i }) : ''].filter(Boolean).join(' · '),
        },
      ),
    // `events` est recalculé à chaque version du magasin : sa longueur et ses
    // identifiants suffisent à savoir s'il a changé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [farms, institutions, tours, tasks, taskLists, events.map((e) => `${e.kind}:${e.id}:${e.at}`).join('|'), lang, t],
  )
}

/** Le texte, la portion trouvée en gras souligné. */
function Highlight({ text, range }: { text: string; range: [number, number] | null }) {
  if (!range || range[1] <= range[0]) return <>{text}</>
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="rounded-[3px] bg-accent/20 px-px text-inherit underline decoration-accent decoration-2 underline-offset-2" data-search-mark="">
        {text.slice(range[0], range[1])}
      </mark>
      {text.slice(range[1])}
    </>
  )
}

type Row = { type: 'hit'; hit: SearchHit; id: string } | { type: 'more'; kind: SearchKind; count: number; id: string }

function SearchOverlay({ onClose }: { onClose: (restoreFocus: boolean) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const docs = useSearchDocs()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>(readRecent)
  const [expanded, setExpanded] = useState<Set<SearchKind>>(new Set())
  const [active, setActive] = useState(0)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  /** L'entrée d'historique posée à l'ouverture (le bouton retour d'Android). */
  const pushed = useRef(false)

  /* Les résultats au fil de la frappe, 120 ms après la dernière touche. */
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQuery(text)
      setExpanded(new Set())
      setActive(0)
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [text])

  /* Le champ a le focus à l'ouverture ; le retour d'Android ferme. */
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
    window.history.pushState(window.history.state, '')
    pushed.current = true
    const onPop = (): void => {
      if (!pushed.current) return
      pushed.current = false
      closeRef.current(true)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const close = (): void => {
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    }
    onClose(true)
  }

  const trimmed = query.trim()
  const hits = useMemo(() => (trimmed === '' ? [] : searchDocs(trimmed, docs, { recent })), [trimmed, docs, recent])
  const groups = useMemo(() => groupHits(hits), [hits])
  const recentHits: SearchHit[] = useMemo(() => {
    if (trimmed !== '') return []
    const byKey = new Map(docs.map((d) => [recentKeyOf(d), d]))
    return recent.map((k) => byKey.get(k)).filter((d): d is SearchDoc => !!d).map((doc) => ({ doc, score: 0, field: 0, range: null }))
  }, [trimmed, docs, recent])

  /* Les lignes, dans l'ordre où ↑ ↓ les parcourent (à travers les groupes). */
  const sections: Array<{ key: string; title: string; rows: Row[] }> =
    trimmed === ''
      ? recentHits.length > 0
        ? [{ key: 'recent', title: t('search.recent'), rows: recentHits.map((hit) => ({ type: 'hit' as const, hit, id: `gs-${recentKeyOf(hit.doc)}` })) }]
        : []
      : groups.map((g) => {
          const shown = expanded.has(g.kind) ? g.hits : g.hits.slice(0, PER_GROUP)
          const rows: Row[] = shown.map((hit) => ({ type: 'hit', hit, id: `gs-${recentKeyOf(hit.doc)}` }))
          if (shown.length < g.hits.length) rows.push({ type: 'more', kind: g.kind, count: g.hits.length - shown.length, id: `gs-more-${g.kind}` })
          return { key: g.kind, title: `${t(`search.group.${g.kind}`)} (${g.hits.length})`, rows }
        })
  const flat = sections.flatMap((s) => s.rows)
  const activeIndex = flat.length === 0 ? -1 : Math.min(active, flat.length - 1)
  const activeId = activeIndex >= 0 ? flat[activeIndex].id : undefined

  /* La ligne active est toujours à l'écran. */
  useEffect(() => {
    if (!activeId) return
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const choose = (row: Row): void => {
    if (row.type === 'more') {
      setExpanded((s) => new Set(s).add(row.kind))
      return
    }
    const doc = row.hit.doc
    const next = pushRecent(recent, recentKeyOf(doc))
    writeRecent(next)
    setRecent(next)
    /* Une institution s'ouvre sur son écran DÉJÀ monté peut-être : `at` en fait
       une nouvelle demande (la carte y va, la main lui est rendue). */
    const href = doc.kind === 'institution' || (doc.kind === 'contact' && doc.href.includes('/institutions?')) ? `${doc.href}&at=${Date.now()}` : doc.href
    /* L'entrée posée à l'ouverture DEVIENT la fiche : « retour » revient à
       l'écran d'où l'on a cherché, pas à une fenêtre fermée. */
    const replace = pushed.current
    pushed.current = false
    onClose(false)
    navigate(href, { replace })
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (flat.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + step + flat.length) % flat.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0) choose(flat[activeIndex])
    }
  }

  const rowView = (row: Row, index: number): ReactNode => {
    const isActive = index === activeIndex
    if (row.type === 'more') {
      return (
        <div
          key={row.id}
          id={row.id}
          role="option"
          aria-selected={isActive}
          data-testid="global-search-more"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(row)}
          onMouseMove={() => setActive(index)}
          className={`flex min-h-12 cursor-pointer items-center px-4 text-caption font-semibold text-accent-ink ${isActive ? 'bg-surface-high' : ''}`}
        >
          {t('search.more', { count: row.count })}
        </div>
      )
    }
    const { doc, field, range } = row.hit
    const inTitle = doc.fields[field]?.text === doc.title
    return (
      <div
        key={row.id}
        id={row.id}
        role="option"
        aria-selected={isActive}
        data-testid="global-search-row"
        data-kind={doc.kind}
        data-doc={doc.id}
        data-href={doc.href}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(row)}
        onMouseMove={() => setActive(index)}
        className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 ${isActive ? 'bg-surface-high' : ''}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-content-secondary" aria-hidden="true">
          <Icon name={KIND_ICON[doc.kind]} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            {doc.status && <FarmStatusDot status={doc.status} />}
            <span className="truncate font-bold text-content-primary" dir="auto">
              {inTitle ? <Highlight text={doc.title} range={range} /> : doc.title}
            </span>
          </span>
          <span className="block truncate text-caption text-content-secondary" dir="auto">
            {!inTitle && range && doc.fields[field] ? <Highlight text={doc.fields[field].text} range={range} /> : doc.context}
            {!inTitle && range && doc.fields[field] && doc.context ? <span className="text-content-muted"> · {doc.context}</span> : null}
          </span>
        </span>
        <span className="chip shrink-0 bg-surface-sunken text-micro text-content-secondary">{t(`search.kind.${doc.kind}`)}</span>
      </div>
    )
  }

  let index = -1
  return (
    <div
      data-overlay=""
      data-testid="global-search"
      className="fixed inset-0 z-[60] flex items-start justify-center bg-surface-sunken/80 px-4 pt-[calc(var(--status-inset)+1rem)] backdrop-blur-sm sm:pt-[12dvh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.label')}
        className="flex max-h-[min(36rem,calc(100dvh-var(--status-inset)-2rem))] w-full max-w-xl animate-fade-in flex-col overflow-hidden rounded-card bg-surface-overlay shadow-lift sm:max-h-[70dvh]"
        onKeyDown={onKeyDown}
      >
        {/* Le champ EST l'en-tête : son focus se lit au trait d'accent dessous,
            pas à un contour coupé par la fenêtre. */}
        <div className="flex shrink-0 items-center gap-2 border-b-2 border-edge-subtle ps-4 pe-1 focus-within:border-accent">
          <Icon name="search" size={19} className="shrink-0 text-content-muted" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="global-search-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={t('search.label')}
            data-testid="global-search-input"
            dir="auto"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={t('search.placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-14 min-w-0 flex-1 bg-transparent text-body text-content-primary outline-none placeholder:text-content-muted focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <button
            type="button"
            onClick={close}
            aria-label={t('search.close')}
            data-testid="global-search-close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-content-muted hover:bg-surface-high hover:text-content-primary"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div ref={listRef} id="global-search-list" role="listbox" aria-label={t('search.label')} className="min-h-0 overflow-y-auto overscroll-contain pb-2">
          {trimmed !== '' && flat.length === 0 && (
            <p className="px-4 py-6 text-center text-caption text-content-secondary" data-testid="global-search-none" dir="auto">
              {t('search.none', { query: trimmed })}
            </p>
          )}
          {sections.map((s) => (
            <div key={s.key} role="group" aria-labelledby={`gs-head-${s.key}`} data-testid="global-search-group" data-kind={s.key}>
              <p id={`gs-head-${s.key}`} role="presentation" className="px-4 pb-1 pt-3 text-caption font-semibold text-content-muted" data-testid="global-search-heading">
                {s.title}
              </p>
              {s.rows.map((row) => {
                index += 1
                return rowView(row, index)
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
