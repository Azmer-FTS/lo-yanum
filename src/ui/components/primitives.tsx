import type { ReactNode } from 'react'
import * as React from 'react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useNarrow } from '../hooks/useNarrow'
import { BandCard } from './band'
import { ChevronForward, Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * ★★ Z3 (2026-09-07) — THE COUNTER IS ONE THING, AND THE FILTER ROW HOLDS IT.
 *
 * "Le compteur devient COURT : 14/14 au lieu de מוצגים 14 מתוך 14. Il est trop
 *  bavard et il mange la place. Version longue autorisee UNIQUEMENT en vue
 *  tableau pleine page, ou la place existe."
 *
 * And the reflow that goes with it, which is why this is a slot rather than a
 * pill `ListTop` draws itself:
 *
 *   "En largeur reduite: LIGNE 1 compteur court + bouton סינון, face a face,
 *    sur la meme ligne. LIGNE 2 la rangee de filtres, SEULE, sur toute la
 *    largeur. Aujourd'hui les trois partagent une ligne et les filtres sont
 *    ecrases."
 *
 * The shape of that bar depends on something only `FilterRow` knows — whether
 * the panel it is in has room for a row of pills or has folded them behind
 * one button. So `ListTop` decides WHAT the counter says (short, or the long
 * sentence when a full-page table has the room for it) and hands it down;
 * `FilterRow` decides WHERE it goes.
 */
const CounterSlot = createContext<ReactNode>(null)

// --- The horizontal rows ---------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ Y5 (2026-09-06) — EVERY SWIPABLE ROW STARTS ON THE CONTENT MARGIN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Reported on the dashboard (KPI and התראות פעילות), on חוות, מתנדבים and
 * נהגים מתנדבים, and on the farm sheet: "la première carte de chaque rangée
 * défilante est collée au bord droit du panneau, hors de l'alignement du
 * contenu".
 *
 * ★ MEASURED, AND IT IS EXACTLY ONE `--content-pad`. On an iPad at 1032 px
 *   the title's start edge is at x=940 and the first KPI card's is at x=960 —
 *   20 px out, which is `--content-pad` to the pixel, on every row of every
 *   screen listed above.
 *
 * ★ AND THE CAUSE IS THE SNAP, NOT THE PADDING. `.scroll-row` bleeds by a
 *   negative margin and takes the same amount back as padding, so the first
 *   child's box IS on the content margin — Y6 got that right. What moves it
 *   is `scroll-snap-align: start` on the children with no `scroll-padding` on
 *   the scroller: the browser snaps the child's edge to the SCROLLPORT's edge,
 *   which is 20 px further out, and the row comes to rest one padding out of
 *   alignment. `scrollLeft` reads −20 at load on all six rows. The fix is one
 *   declaration (`scroll-padding-inline`, in index.css) and this component is
 *   the other half of the request.
 *
 * ★ THE OTHER HALF IS Y5.4 — "indiquer visuellement qu'il y a du contenu
 *   au-delà, sans jamais de barre de défilement horizontale visible". A fade
 *   has to be on the side that HAS more, and only when there is more, or it
 *   shaves the last card of a row that fits. CSS cannot ask that question, so
 *   this component measures and publishes the answer as `data-overflow`, and
 *   `index.css` masks accordingly.
 */
export function ScrollRow({
  children,
  className = '',
  carousel = false,
  testId,
  onScroll,
  innerRef,
  ...rest
}: {
  children: ReactNode
  className?: string
  /** The dashboard's two-per-view alerts strip, which snaps mandatorily. */
  carousel?: boolean
  testId?: string
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void
  /**
   * A caller's own ref on the same node. Object refs (the alerts carousel
   * pages by scripting its scroller) and CALLBACK refs (`useNarrow` measures
   * the filter row) both arrive here, so this component keeps a ref of its own
   * for the measuring and forwards whatever it was given alongside it.
   */
  innerRef?: React.Ref<HTMLDivElement>
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onScroll' | 'className' | 'children' | 'ref'>) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement | null>(null)
  const [overflow, setOverflow] = useState<'start' | 'end' | 'both' | null>(null)
  const attach = (node: HTMLDivElement | null): void => {
    ref.current = node
    if (typeof innerRef === 'function') innerRef(node)
    else if (innerRef) (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    /**
     * Which ends have more. `scrollLeft` is negative-going in an RTL scroller
     * on Chromium and WebKit alike, so its ABSOLUTE value is the distance
     * travelled from the start whichever way the writing runs — which is the
     * only thing this needs to know.
     *
     * ★★ Z4.1 (2026-09-07) — AND IT DEPENDS ON NOTHING ELSE.
     *
     * "Le fondu disparait quand je scrolle, et quand je m'arrete ca coupe net;
     *  des fois ca marche, des fois non." The rule is one sentence and it is
     *  the one below: an edge fades WHEN THERE IS MORE CONTENT BEYOND IT, and
     *  stops when there is not. Whether a scroll is under way, has just
     *  finished, or was never started does not enter into it.
     */
    const publish = (): void => {
      const slack = el.scrollWidth - el.clientWidth
      // 2 px: a sub-pixel layout must not light a fade on a row that fits.
      if (slack <= 2) {
        el.removeAttribute('data-overflow')
        setOverflow(null)
        return
      }
      const travelled = Math.abs(el.scrollLeft)
      const atStart = travelled <= 2
      const atEnd = travelled >= slack - 2
      const state = atStart ? 'end' : atEnd ? 'start' : 'both'
      el.setAttribute('data-overflow', state)
      setOverflow(state)
    }
    publish()
    el.addEventListener('scroll', publish, { passive: true })
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => {
      el.removeEventListener('scroll', publish)
      observer.disconnect()
    }
  }, [children])

  /**
   * ★★ Z4.3 (2026-09-07) — AND A CHEVRON, BECAUSE A FADE IS NOT AN
   *    INSTRUCTION.
   *
   * "Moi je le sais, mais les gens ne le sauront pas forcement." A gradient
   * says "this is cut off"; it does not say "you can move it", and on a
   * device with no scrollbar and no hover there is nothing else that does.
   * The chevron is on the side that HAS more, disappears with the fade, and
   * moves the row by one card — the same unit the row snaps to, so a press
   * lands the next card on the margin rather than halfway.
   */
  const nudge = (towards: 'start' | 'end'): void => {
    const el = ref.current
    if (!el) return
    const card = el.firstElementChild as HTMLElement | null
    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0
    const step = card ? card.getBoundingClientRect().width + gap : el.clientWidth * 0.8
    const rtl = getComputedStyle(el).direction === 'rtl'
    /* Travelling towards the END raises the absolute scroll offset, and in an
       RTL scroller that offset runs negative. */
    const sign = (towards === 'end' ? 1 : -1) * (rtl ? -1 : 1)
    el.scrollBy({ left: sign * step, behavior: 'smooth' })
  }

  const chevron = (side: 'start' | 'end'): ReactNode => (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      data-testid={`scroll-nudge-${side}`}
      data-side={side}
      className="scroll-nudge"
      onClick={() => nudge(side)}
      title={side === 'end' ? t('common.scrollForward') : t('common.scrollBack')}
    >
      <span className="scroll-nudge-disc">
        <Icon
          name="chevron"
          size={14}
          className={side === 'start' ? 'ltr:-scale-x-100' : 'rtl:-scale-x-100'}
        />
      </span>
    </button>
  )

  const more = { start: overflow === 'start' || overflow === 'both', end: overflow === 'end' || overflow === 'both' }

  return (
    <div className="scroll-nav" data-overflow={overflow ?? undefined}>
      {/**
        * ★★ Z4 (2026-09-07) — THE MASK LEFT THE SCROLLER, AND THAT IS THE
        *    "DES FOIS CA MARCHE, DES FOIS NON".
        *
        * A `-webkit-mask-image` on an element that is being scrolled with
        * momentum is composited on the scrolling layer, and Safari drops or
        * lags it while that layer is moving — which is exactly "le fondu
        * disparait quand je scrolle". The veil does not scroll: it is a still
        * box the same size as the row, the row scrolls inside it, and the mask
        * has nothing to chase.
        */}
      <div className="scroll-veil">
        <div
          ref={attach}
          data-testid={testId}
          onScroll={onScroll}
          className={`${carousel ? 'carousel-2' : 'scroll-row'} ${className}`.trim()}
          {...rest}
        >
          {children}
        </div>
      </div>
      {more.start && chevron('start')}
      {more.end && chevron('end')}
    </div>
  )
}

// --- Layout blocks ---------------------------------------------------------

/**
 * ★ W6 (2026-09-02) — AN ARROW, NOT A BREADCRUMB.
 *
 * The way back was a line of its own above the title — "‹ חוות" in muted
 * 13 px — which cost a whole row at the top of every sheet to restate the
 * name of the list the coordinator had just come from, and was a 14 px hit
 * target on a device driven with a thumb. It is a 40 px round button BESIDE
 * the title now, where the back arrow is in every application he already
 * uses; the list's name lives on `title` / `aria-label`, where a name that
 * is only ever confirmation belongs.
 *
 * `ltr:-scale-x-100`: back is towards the inline START, which is the RIGHT
 * in Hebrew and the LEFT in English, so the glyph flips with the direction.
 */
/**
 * ★ X4.1 (2026-09-04) — THE SHEET SHOWS THE PLACE IT IS ABOUT.
 *
 * A farm's file opened on a name and two words of geography, and the product
 * owner's complaint was recognition: he taps a photo in the roster and lands
 * on a page that looks like every other page. `media` is a square thumbnail
 * beside the title — the same picture he tapped, at 64 px, which is a
 * confirmation rather than a banner. A full-width band was the other option
 * and it costs 140 px of a column that is already a long read; the square
 * costs nothing, because the header row was that tall anyway.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  media,
}: {
  title: ReactNode
  subtitle?: string
  actions?: ReactNode
  /** The parent list. Rendered as a round back arrow beside the title. */
  back?: { to: string; label: string }
  /** A square thumbnail of the record — its photo, or its initials. */
  media?: ReactNode
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {back && (
            <Link
              to={back.to}
              aria-label={back.label}
              title={back.label}
              data-testid="page-back"
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-pill
                         border border-edge-subtle bg-surface-raised text-content-secondary
                         shadow-card transition-colors duration-fast
                         hover:bg-surface-high hover:text-content-primary"
            >
              <Icon name="chevron" size={18} className="ltr:-scale-x-100" />
            </Link>
          )}
          {media && (
            <span data-page-media="" className="shrink-0">
              {media}
            </span>
          )}
          <div className="min-w-0">
            <h1 data-page-title="" className="text-title text-content-primary">
              {title}
            </h1>
            {subtitle && <p className="muted mt-1">{subtitle}</p>}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  )
}

/**
 * ★ W6 — THE SHEET'S ACTIONS ARE ONE PILL.
 *
 * A farm's header carried three separate buttons — תכנון ביקור, עריכה and a
 * ghost מחיקה in the danger ink — three different skins for three things
 * that are one idea: what can be done to this record. Wrapped, on an iPad in
 * portrait, they took two rows and the delete drifted under the edit.
 *
 * One segmented pill, hairlines between the segments, the destructive one
 * last and in its ink. It is a row of buttons rather than a menu because
 * three is exactly the number that still reads faster open than folded.
 */
export function ActionPill({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-testid="sheet-actions"
      className={`flex shrink-0 items-center overflow-hidden rounded-pill border border-edge-subtle
                  bg-surface-raised shadow-card divide-x divide-edge-subtle rtl:divide-x-reverse ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * One segment of an `ActionPill`. Renders a button, or a link when given `to`.
 *
 * ★ X4.2 (2026-09-04) — ICONS ONLY, AND THE LABEL MOVES TO `title`/`aria-label`.
 *   Three labelled segments made a pill about 22 rem wide sitting beside a
 *   title in a 42 % column, so on an iPad in portrait it wrapped under the
 *   name and the delete drifted. A bin, a pencil and a calendar are three
 *   glyphs nobody has to read, and at 48×44 px each the pill is 9 rem — with
 *   BIGGER targets than the labelled version had. Nothing is lost for a
 *   screen reader or a hover: the words are still on the element.
 */
export function ActionPillItem({
  icon,
  label,
  to,
  onClick,
  danger = false,
  testId,
}: {
  icon: IconName
  label: string
  to?: string
  onClick?: () => void
  danger?: boolean
  testId?: string
}) {
  const cls = `flex h-12 w-12 items-center justify-center
               transition-colors duration-fast ${
                 danger
                   ? 'text-status-danger-ink hover:bg-status-danger/10'
                   : 'text-content-secondary hover:bg-surface-high hover:text-content-primary'
               }`
  const body = <Icon name={icon} size={19} />
  return to ? (
    <Link to={to} data-testid={testId} className={cls} title={label} aria-label={label}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cls}
      title={label}
      aria-label={label}
    >
      {body}
    </button>
  )
}

/**
 * U1 (2026-09-02) — EVERY SIGNIFICANT BLOCK FOLDS, AND THE FOLD IS REMEMBERED
 * PER KIND OF BLOCK, NOT PER RECORD.
 *
 * The product owner's rule, verbatim: if he folds "שכבת איומים" on one farm,
 * it is folded on EVERY farm, and it stays folded tomorrow. So the memory is
 * keyed by the block's TYPE (`collapseKey`) in localStorage — never by the
 * record's id, and never in sessionStorage, which iPadOS empties every time
 * it reaps the tab.
 *
 * A folded block costs one line: its title, a chevron, and a one-line
 * summary/counter the caller supplies ("3 עמדות · 2 אזורים"). The whole
 * heading is the hit area (G11), not the 15 px chevron.
 */
const BLOCK_PREFIX = 'lo-yanum:block:'

export function readBlockOpen(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(BLOCK_PREFIX + key)
    return stored !== null ? stored === '1' : fallback
  } catch {
    return fallback
  }
}

export function writeBlockOpen(key: string, open: boolean): void {
  try {
    localStorage.setItem(BLOCK_PREFIX + key, open ? '1' : '0')
  } catch {
    // A remembered fold is a convenience, not a requirement.
  }
}

/**
 * C3 — the section heading lives ABOVE the card, not inside it.
 *
 * Burying a 13px uppercase label inside the card made every block look the
 * same weight, so the page had no scannable structure. The heading now sits
 * outside at the `section` scale, with generous space above it and tight space
 * below, so it visually belongs to the card it introduces. The card itself
 * holds content only.
 *
 * With `collapseKey` the heading is also the block's switch (U1 above).
 */
export function Section({
  title,
  action,
  children,
  className = '',
  padded = true,
  /** Suppress the top margin when the section opens a column. */
  flush = false,
  /**
   * F5.3 — drop the card, keep the heading.
   *
   * For a section whose CONTENT is already a set of cards. Nesting
   * `surface-raised` rows inside a `surface-raised` card is what made the guard
   * lists read as one grey slab: the rows and their container were the same
   * colour, so the only thing separating two guards was a 1 px line. With the
   * container gone the page shows through between the rows and they read as
   * separate objects — which is what they are.
   */
  bare = false,
  collapseKey,
  defaultOpen = true,
  summary,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  flush?: boolean
  bare?: boolean
  /** U1 — the block TYPE the fold is remembered under (global, persistent). */
  collapseKey?: string
  /** First-ever state, before the product owner has touched the block. */
  defaultOpen?: boolean
  /** One line shown beside the title while the block is folded. */
  summary?: ReactNode
}) {
  const [open, setOpen] = useState<boolean>(() =>
    collapseKey ? readBlockOpen(collapseKey, defaultOpen) : true,
  )
  const toggle = () => {
    if (!collapseKey) return
    setOpen((v) => {
      writeBlockOpen(collapseKey, !v)
      return !v
    })
  }
  const foldable = collapseKey !== undefined

  return (
    <section
      className={className}
      data-block={collapseKey}
      data-open={foldable ? (open ? '1' : '0') : undefined}
    >
      {(title || action) && (
        <div
          className={`flex items-center justify-between gap-3 pb-2 ${
            flush ? '' : 'pt-1'
          }`}
        >
          {foldable ? (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              data-testid={`block-${collapseKey}`}
              className="group flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-field text-start
                         transition-colors duration-fast hover:bg-surface-high/70 -ms-1.5 ps-1.5"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-surface-high text-content-secondary
                            transition-transform duration-fast group-hover:text-content-primary ${
                              open ? '' : 'ltr:-rotate-90 rtl:rotate-90'
                            }`}
              >
                <Icon name="chevronDown" size={14} />
              </span>
              {/* The title never gives way; the summary beside it does. */}
              <h2 className="shrink-0 text-section text-content-primary">{title}</h2>
              {!open && summary && (
                <span
                  className="min-w-0 truncate text-caption text-content-muted"
                  data-block-summary=""
                >
                  {summary}
                </span>
              )}
            </button>
          ) : (
            title && <h2 className="text-section text-content-primary">{title}</h2>
          )}
          {action}
        </div>
      )}
      {open &&
        (bare ? (
          children
        ) : (
          <div className={`card ${padded ? 'card-pad' : ''}`}>{children}</div>
        ))}
    </section>
  )
}

/**
 * G7bis.3 → U1 — kept as a name for the older call sites; it is `Section`
 * with a `collapseKey`. `storageKey` used to be a sessionStorage key per
 * screen; it is now the block TYPE and the memory is global.
 */
export function CollapsibleSection({
  storageKey,
  title,
  defaultOpen,
  action,
  children,
  className = '',
  padded = true,
  bare = false,
  summary,
}: {
  storageKey: string
  title: string
  defaultOpen: boolean
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  bare?: boolean
  summary?: ReactNode
}) {
  return (
    <Section
      collapseKey={storageKey}
      title={title}
      defaultOpen={defaultOpen}
      action={action}
      className={className}
      padded={padded}
      bare={bare}
      summary={summary}
    >
      {children}
    </Section>
  )
}

export function EmptyState({
  icon = 'moon',
  title,
  hint,
  action,
}: {
  icon?: IconName
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div
      // PO POINT 5 — the marker `bun run empty` sweeps for. A block with a
      // heading and no content has to carry one of these; the gate cannot ask
      // "is this dignified", but it can ask "is there one here".
      data-empty-state=""
      className="flex animate-fade-in flex-col items-center gap-2 rounded-card border border-dashed
                 border-edge-subtle bg-surface-raised/40 px-6 py-12 text-center"
    >
      <span className="text-content-muted/50">
        <Icon name={icon} size={30} />
      </span>
      <p className="text-caption font-medium text-content-secondary">{title}</p>
      {hint && <p className="muted max-w-xs">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function KeyValue({
  label,
  value,
  ltr = false,
}: {
  label: string
  value: ReactNode
  ltr?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-edge-subtle/60 py-2 last:border-0">
      <dt className="muted shrink-0">{label}</dt>
      <dd
        className={`text-caption font-medium text-content-primary ${
          ltr ? 'ltr-nums' : ''
        } text-end`}
      >
        {value}
      </dd>
    </div>
  )
}

export function Stat({
  label,
  value,
  tone = 'default',
  icon,
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'alert' | 'good' | 'accent'
  icon?: IconName
}) {
  const toneClass = {
    default: 'text-content-primary',
    alert: 'text-status-danger-ink',
    good: 'text-status-success-ink',
    accent: 'text-accent-ink',
  }[tone]

  return (
    <div className="card card-pad flex items-center gap-3">
      {/* W3.1c — the icon alone, bigger and thin: no disc behind it. */}
      {icon && <Icon name={icon} size={26} strokeWidth={1.4} className={`shrink-0 ${toneClass}`} />}
      <div className="min-w-0">
        <p className="muted truncate">{label}</p>
        <p className={`numeric mt-1 text-title ${toneClass}`}>{value}</p>
      </div>
    </div>
  )
}

/**
 * The four tones a stat tile can wear, as the wash + ink pair `BandCard`
 * takes. One table, so a "good" green means the same thing on a farm's sheet,
 * above a roster and on the dashboard.
 */
const TONES = {
  default: { tint: 'kpi-tone-default', ink: 'text-content-primary' },
  alert: { tint: 'kpi-tone-alert', ink: 'text-status-danger-ink' },
  good: { tint: 'kpi-tone-good', ink: 'text-status-success-ink' },
  accent: { tint: 'kpi-tone-accent', ink: 'text-accent-ink' },
} as const

export type KpiTone = keyof typeof TONES

/** ★★ Y5 — exported so the dashboard's cards read the same table. */
export function bandTone(tone: KpiTone): { tint: string; ink: string } {
  return TONES[tone]
}

/**
 * G14d — A KPI CARD THAT *IS* THE FILTER. The number cards above the big
 * rosters used to be decoration repeating what pills below them already did;
 * now the card is the control: click filters the list, the active card takes
 * the accent ring, and the redundant pills are gone. Shared by volunteers,
 * drivers and farms so the three screens stay one gesture.
 *
 * ★★ Y5 (2026-09-04) — AND IT IS `BandCard`, not a second drawing of it. See
 *    the table of four geometries at the top of `band.tsx`.
 */
export function KpiFilter({
  label,
  value,
  icon,
  dot,
  hint,
  tone = 'default',
  active,
  onClick,
  testId,
}: {
  label: string
  value: ReactNode
  tone?: KpiTone
  icon?: IconName
  /** Status dot shown before the label (the farm cards). */
  dot?: ReactNode
  /** Small second line under the label — e.g. the status's dunam total. */
  hint?: ReactNode
  active: boolean
  onClick: () => void
  testId?: string
}) {
  const { tint, ink } = TONES[tone]
  return (
    <BandCard
      icon={icon}
      tint={tint}
      ink={ink}
      figure={value}
      label={label}
      note={hint}
      dot={dot}
      active={active}
      onClick={onClick}
      testId={testId}
    />
  )
}

/**
 * U2 (2026-09-02) — THE COMPACT KPI-FILTER, for the one swipable row above a
 * list.
 *
 * ★★ Y5 (2026-09-04) — AND IT IS NOT COMPACT ANY MORE. It was a quarter of
 *    the band's height — 44 px, a 28 px disc, a 16 px glyph — which is the
 *    second of the four geometries `band.tsx` lists. The product owner has
 *    asked three times for the sheet's model "à l'identique" on every screen
 *    that shows a row of numbers, and this row is the one he sees most. It
 *    costs the top of a list about 40 px, which is what the swipable row and
 *    Y6's edge-to-edge treatment are for.
 *
 * ⚠️ THE NAME IS KEPT ON PURPOSE. Nineteen call sites across four screens
 *    import `KpiChip`; renaming it would be a diff nobody can read for a
 *    change that is entirely about geometry. It is a thin alias of
 *    `KpiFilter` now, and the two are the same card because they were always
 *    meant to be the same card.
 */
export function KpiChip(props: Parameters<typeof KpiFilter>[0]) {
  return <KpiFilter {...props} />
}

/**
 * ★★ Y12 (2026-09-04) — THE SEARCH PANEL. See the note at its call site in
 *    `ListTop` for why the field left the header.
 *
 * ⚠️ THE VALUE IS THE SCREEN'S, NOT THIS COMPONENT'S. There is no draft state
 *    here: typing calls `onChange` immediately, which is what makes the list
 *    narrow under the panel while it is open. A local draft committed on Enter
 *    would be a different feature — a search you cannot see the effect of
 *    until you press a key — and it is not the one that was asked for.
 */
function SearchOverlay({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)
  const field = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    // "le champ prend le focus (clavier)" — after the panel has been painted,
    // or iOS ignores the focus and no keyboard comes up.
    const id = requestAnimationFrame(() => field.current?.focus())
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={placeholder ?? t('common.search')}
        title={placeholder ?? t('common.search')}
        data-testid="list-search-open"
        className={`flex h-11 w-11 items-center justify-center rounded-field transition-colors duration-fast ${
          value
            ? 'bg-accent/15 text-accent-ink'
            : 'text-content-secondary hover:bg-surface-high hover:text-content-primary'
        }`}
      >
        <Icon name="search" size={18} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={placeholder ?? t('common.search')}
          data-testid="list-search-panel"
          className="glass absolute end-0 top-full z-40 mt-1.5 flex w-[min(22rem,80vw)] items-center gap-2 rounded-card p-2 shadow-lift"
        >
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-content-muted">
              <Icon name="search" size={15} />
            </span>
            <input
              ref={field}
              type="search"
              className="input min-h-11 py-1.5 ps-8"
              value={value}
              placeholder={placeholder}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setOpen(false)
                }
              }}
              data-testid="list-search"
            />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            data-testid="list-search-done"
            className="btn-primary shrink-0 py-2"
          >
            <Icon name="check" size={15} />
            {t('common.done')}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * U2 → X1 (2026-09-04) — THE STICKY TOP OF EVERY LIST, ONE GABARIT, NO
 * EXCEPTIONS.
 *
 * ★ THE TITLE HAS ONE SIZE IN THE WHOLE APP, AND IT IS THE DASHBOARD'S.
 *   "לוח בקרה" was `text-title` (24 px) and "חוות" / "מתנדבים" were
 *   `text-heading` (18 px), because the rosters' top was written to be
 *   compact and the dashboard's was not. The product owner reads that as two
 *   different applications, and he is right: the size of a page's name is not
 *   a place to save four pixels. `PageHeader`, `ListTop` and the dashboard's
 *   own header all render `text-title` now, and nothing scales it down by
 *   content.
 *
 * ★ THE COUNTER LEFT THE TITLE LINE. "20 מתוך 20" was a muted span baselined
 *   with the title, which made the title look like a sentence and cost the
 *   search box its room. It is a small discreet pill at the head of the
 *   FILTER row now, aligned with the KPI chips it qualifies — beside the
 *   numbers it is about, not beside the name of the screen.
 *
 * ★ THE ROW IS ALWAYS [title] [search] [⋯]. One line, the same three things
 *   in the same three places on every list; whatever the screen can do lives
 *   in the "⋯" (see `OverflowMenu`), so the line never changes width class
 *   from one roster to the next.
 *
 * `-mx-4 px-4` / `lg:-mx-5 lg:px-5` — the block paints out to the panel's
 * own padding so the rows never show at the sides while it is pinned.
 */
export function ListTop({
  title,
  shown,
  total,
  actions,
  menu,
  search,
  onSearch,
  searchPlaceholder,
  kpis,
  filters,
  children,
  testId,
}: {
  title: ReactNode
  /**
   * ★★ Z3 (2026-09-07) — TWO NUMBERS, NOT A SENTENCE.
   *
   * It was a `ReactNode` and every screen handed it
   * `t('common.showingOf', …)` — five call sites, three different sentences
   * (מוצגים X מתוך Y, N שמירות, N אירועים), and no way for this component to
   * shorten any of them. It takes the numbers now and decides how to say
   * them, which is the whole of Z3.1.
   */
  shown?: number
  total?: number
  /** Rare inline control that must stay visible; prefer `menu`. */
  actions?: ReactNode
  /** X2 — the screen's own actions, folded into the "⋯". */
  menu?: ReactNode
  search?: string
  onSearch?: (v: string) => void
  searchPlaceholder?: string
  /** The KPI chips — rendered in the swipable row. */
  kpis?: ReactNode
  /** The filter pills row (a `FilterRow`), below the KPIs. */
  filters?: ReactNode
  /** Column headers, closing the block. */
  children?: ReactNode
  testId?: string
}) {
  const { t } = useTranslation()
  /**
   * ★ Z3 — "OU LA PLACE EXISTE", ASKED OF THE HEADER RATHER THAN THE WINDOW.
   *
   * The long sentence is allowed in one place only: a table read on the whole
   * page. `children` is the table's column heads — a screen only draws them
   * in table mode — and 30 rem is the width below which this header has to
   * choose between the counter and everything else. A split panel on an iPad
   * measures 240–460 px here, so it never qualifies; a full-page table
   * measures 880–1224 and always does.
   */
  const { ref: widthRef, narrow } = useNarrow(30 * 16)
  const hasCount = typeof shown === 'number' && typeof total === 'number'
  const long = hasCount && !!children && narrow === false
  const counter = hasCount ? (
    <span
      data-list-count=""
      title={t('common.showingOf', { shown, total })}
      className="numeric flex shrink-0 items-center self-center whitespace-nowrap rounded-pill
                 bg-surface-high px-2.5 py-1 text-micro text-content-secondary"
    >
      {long ? t('common.showingOf', { shown, total }) : `${shown}/${total}`}
    </span>
  ) : null

  return (
    <div
      ref={widthRef}
      data-list-top=""
      data-testid={testId}
      className="sticky-top -mx-4 px-4 lg:-mx-5 lg:px-5"
      /**
       * ★★ Z1 (2026-09-07) — AND THE ROOM UNDER THE ROW IS THE ROOM ABOVE IT.
       *
       * "Ca respire en haut, ca ne respire pas en bas — de partout." Measured
       * on the iPad before this line changed: title→KPIs **16 px**,
       * KPIs→filters **16 px**, and filters→content **4 px** in split and
       * **0 px** in table mode, where the column heads sat flat on the pills.
       *
       * ★ THE SUBTRACTION WAS THE BUG, AND IT LOOKED LIKE A CORRECTION.
       *   `--list-rhythm - --row-shadow-room` reads as "take back the room the
       *   row reserves for its shadow", but `.scroll-row` ALREADY takes it
       *   back itself: its `padding-block: 0.75rem` is cancelled by
       *   `margin-block: -0.75rem`, so its margin box ends exactly on its last
       *   pill and the parent's padding is the gap the eye sees, whole. The
       *   subtraction was applied twice and 16 px became 4.
       *
       * ⚠️ AND IT IS CONDITIONAL, because the block that CLOSES this header on
       *    a table screen is the column heads, which belong to the table under
       *    them and must stay on it. Sixteen pixels there would float a
       *    table's head off its own body. The gap the report is about is the
       *    one between the filters and whatever follows, and that one is
       *    carried by `children`'s own margin below.
       */
      style={{
        top: 'var(--shell-top, 0px)',
        paddingBottom: children
          ? 'calc(var(--list-rhythm) - var(--row-shadow-room))'
          : 'var(--list-rhythm)',
      }}
    >
      {/* X1.3 — [title] [search] [⋯], one line, every list. `flex-wrap` is
          the 390 px escape hatch: the search box drops to its own line rather
          than squeezing the title to three characters or widening the page. */}
      <div data-title-row="" className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {/* ⚠️ `min-w-[6rem]` — A FLOOR, NOT A WIDTH, and it is what makes the
            row wrap instead of shaving the title. With `min-w-0` the title is
            the item that gives way, so at 25 % of the seam "מתנדבים" was
            rendered as "מ…" beside a search box at its full 13 rem. A floor
            turns the squeeze into a line break (the search drops below), which
            is the X6 rule applied to the one row every screen starts with.
            ⚠️ AND IT CANNOT BE A `sm:` BREAKPOINT: this row lives in a panel
            whose width the coordinator drags, and the viewport says nothing
            about it — the same lesson as X5's roster tracks. The floor is on
            the TITLE alone; the search keeps `shrink-0`, so the arithmetic is
            6 rem + 13 rem + 44 px + gaps ≈ 23 rem, and any panel narrower than
            that wraps the search onto its own line instead of eating the
            name. */}
        <h1
          data-page-title=""
          className="min-w-[6rem] flex-1 truncate text-title text-content-primary"
        >
          {title}
        </h1>
        {/**
          * ★★ Y12 (2026-09-04) — THE MAGNIFIER OPENS A PANEL; IT IS NOT A BOX
          *    THAT LIVES IN THE HEADER.
          *
          *    "La loupe ouvre un panneau de recherche en surcouche : le champ
          *     prend le focus (clavier), les résultats s'affinent en direct,
          *     validation par Entrée ou bouton, fermeture automatique après
          *     validation. Libère l'espace de l'en-tête le reste du temps."
          *
          * ★ AND THE HEADER'S ARITHMETIC IS WHY HE IS RIGHT. The note this
          *   replaces spent a paragraph measuring a box down from 15 rem to
          *   10 rem so that "6 rem title + this + 44 px + gaps" would fit a
          *   third of an iPad — which is a field small enough to be useless
          *   AND still the widest thing on a row whose other two items are a
          *   page title and one button. A 44 px target that opens a full-width
          *   field costs the header 44 px and gives the search the whole
          *   panel.
          *
          * ⚠️ THE FILTERING IS STILL LIVE. `onSearch` fires on every
          *    keystroke, exactly as it did — "les résultats s'affinent en
          *    direct" — so Enter and the button CLOSE the panel rather than
          *    submitting anything. Nothing about how a screen filters changed;
          *    only where the field lives.
          */}
        {onSearch && (
          <SearchOverlay
            value={search ?? ''}
            onChange={onSearch}
            placeholder={searchPlaceholder}
          />
        )}
        {actions}
        {menu}
      </div>
      {/**
        * ★★ Y6 (2026-09-04) — THE KPI ROW HAS ITS OWN LINE NOW, and the
        *    counter has moved down to the filters'.
        *
        *    X1 put the counter "en tête de la rangée de filtres" and it ended
        *    up as a flex SIBLING of the KPI strip instead — which was
        *    invisible until Y6 made the strip bleed out to the screen's edge,
        *    at which point the row's negative start margin slid the first card
        *    UNDER the pill. Two things wanted the same line; only one of them
        *    can also be edge-to-edge, and the one the product owner swipes is
        *    the row.
        *
        * ★★ Y6 (2026-09-06) — AND THE RHYTHM IS ONE VALUE, DECLARED ONCE.
        *
        *    "C'est très collé, ça ne respire pas — la rangée de filtres touche
        *     les KPI au-dessus et la liste en dessous." Measured on the iPad,
        *    title→KPIs and KPIs→filters: **4 px and −18 px**. The second one
        *    is NEGATIVE: the two rows OVERLAPPED by eighteen pixels, because
        *    `.scroll-row` pays for its shadow with `margin-block: -0.75rem`
        *    and the 6 px of `mt-1.5` beneath it never stood a chance. Both
        *    gaps are `--list-rhythm` now (see `tokens.css`), applied as
        *    padding on the row itself so the negative margin cannot eat it.
        */}
      {kpis && (
        <ScrollRow
          className="min-w-0"
          testId="kpi-strip"
          style={{ marginTop: 'calc(var(--list-rhythm) - var(--row-shadow-room))' }}
        >
          {kpis}
        </ScrollRow>
      )}
      {(counter || filters) && (
        <div style={{ marginTop: 'var(--list-rhythm)' }}>
          {/**
            * ★★ Z3 (2026-09-07) — THE FILTER ROW LAYS THE BAR OUT, COUNTER
            *    INCLUDED, AND THIS IS THE WHOLE OF Z3.2.
            *
            * Y5 put the counter at the far end of this line and it was right
            * for a wide panel. In a narrow one the same line held three
            * things — the counter, the סינון button and the pills — and the
            * pills were what gave way. Which of those two shapes is on screen
            * is a fact only `FilterRow` has (it measures its own box), so the
            * counter goes down as a slot and comes out wherever that shape
            * puts it.
            *
            * A screen with a counter and no filters keeps it at the end of
            * its own line, which is where it has always been.
            */}
          <CounterSlot.Provider value={counter}>
            {filters ?? <div className="flex items-center justify-end">{counter}</div>}
          </CounterSlot.Provider>
        </div>
      )}
      {/* Z1 — whatever closes the header starts on the rhythm, like every
          other block in it. On a table screen this is the column heads. */}
      {children && <div style={{ marginTop: 'var(--list-rhythm)' }}>{children}</div>}
    </div>
  )
}

/** List row that navigates. Chevron follows the writing direction. */
export function RowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-field px-3 py-3 transition-colors duration-fast ease-out hover:bg-surface-high"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <span className="shrink-0 text-content-muted/60">
        <ChevronForward />
      </span>
    </Link>
  )
}

// --- Filter bar (R3) -------------------------------------------------------

/**
 * The single horizontal filter bar used above every list screen — farms,
 * volunteers, missions, incidents. Replaces the Lot 0 side panels so the
 * content gets the full width, and so the four screens behave identically.
 */
export function FilterBar({
  search,
  onSearch,
  searchPlaceholder,
  children,
  trailing,
}: {
  search?: string
  onSearch?: (v: string) => void
  searchPlaceholder?: string
  /** Filter pill groups. */
  children?: ReactNode
  /** Right-aligned actions (create, import, view toggle…). */
  trailing?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card bg-surface-raised/70 p-2.5 shadow-card backdrop-blur">
      {onSearch && (
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-content-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            className="input py-2 ps-9"
            value={search ?? ''}
            placeholder={searchPlaceholder}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      )}
      <div className="scroll-x flex min-w-0 flex-1 items-center gap-2 py-0.5">
        {children}
      </div>
      {trailing && (
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      )}
    </div>
  )
}

/**
 * A single toggleable pill inside a FilterRow.
 *
 * D7.3 — the count is part of the pill, not a separate legend. "פעילה 4" tells
 * the coordinator both what the filter is and whether pressing it is worth the
 * tap; a pill that reveals an empty list on click is a wasted interaction.
 */
export function FilterPill({
  active,
  onClick,
  children,
  dot,
  count,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  dot?: ReactNode
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`filter-pill ${active ? 'filter-pill-active' : ''}`}
    >
      {dot}
      {children}
      {count !== undefined && <span className="filter-count">{count}</span>}
    </button>
  )
}

/**
 * D7.3 — ONE discreet filter row, shared by every list screen.
 *
 * Replaces the per-screen ad-hoc pill rows, which had drifted into different
 * heights, different spacings and — on the incident log — a twelve-pill farm
 * selector that was longer than the list it filtered.
 *
 * The clear button appears only when something is actually filtered. A
 * permanently visible "clear" implies there is always something to clear, and
 * costs a tap target on a 390 px row for no reason.
 */
export function FilterRow({
  children,
  active,
  onClear,
  trailing,
  nowrap = false,
}: {
  children: ReactNode
  /** True when at least one filter is on. */
  active: boolean
  onClear: () => void
  trailing?: ReactNode
  /** U2 — one swipable line instead of a wrapping block. */
  nowrap?: boolean
}) {
  const { t } = useTranslation()
  /**
   * ★★ Y7.3 (2026-09-04) — UNDER 26 REM THE ROW BECOMES A DROP-DOWN.
   *
   *   "Sur petit viewport, les filtres passent dans un DROP-DOWN (demandé
   *    précédemment, non fait) plutôt qu'en rangée écrasée."
   *
   * ★ 20 REM IS MEASURED, NOT PICKED, AND IT IS MEASURED ON THE RIGHT BOX.
   *   The first version used 26 rem and put the guards list into a drop-down
   *   on a 1440 px desktop — because Y6 moved this row in beside the counter
   *   pill, so what it is handed is the panel LESS about 7 rem, and a 456 px
   *   panel measured 344 px here. At 20 rem a desktop's third-panel (344 px)
   *   keeps its pills as a swipable row, and a phone (about 238 px once the
   *   counter and the padding are taken) gets the drop-down — which is where
   *   the row really is crushed rather than merely swipable.
   *
   * ★ AND THE QUESTION IS ASKED OF THE PANEL, not of the window: since
   *   P0bis.2 the list's width is something he DRAGS. See `useNarrow`.
   *
   * ⚠️ THE PILLS ARE THE SAME NODES IN BOTH SHAPES. They are `children`,
   *    moved into the panel rather than re-declared for it, so a screen
   *    cannot end up with a filter in one reading and not in the other —
   *    which is exactly what X5 spent a pass undoing on the rosters.
   */
  /**
   * ⚠️ Z3 (2026-09-07) — 24 REM, AND THE BOX IT IS ASKED OF MOVED.
   *
   * Y7.3 measured 20 rem against the row's own box, which sat INSIDE the
   * counter's flex line and so was the panel less about 7 rem. Z3 gives the
   * counter to this component, and the two shapes put it in two different
   * places — so measuring the row itself would measure a different box per
   * shape, and a panel between the two answers would flip between them for
   * ever. The ruler is the bar's full width now, in both shapes, and the
   * threshold carries the counter's own room: 20 rem of pills plus a short
   * "14/14" pill and its gap.
   */
  const { ref, narrow } = useNarrow(24 * 16)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)
  /** Z3 — the counter `ListTop` built, if this row is inside one. */
  const counter = useContext(CounterSlot)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const clearPill = active && (
    <button
      type="button"
      onClick={onClear}
      data-testid="filter-clear"
      className="filter-pill text-content-primary hover:text-status-danger"
    >
      <Icon name="close" size={11} />
      {t('common.clear')}
    </button>
  )

  /** The bar itself: one box, one width, whichever shape is drawn in it. */
  const bar = (inner: ReactNode): ReactNode => (
    <div ref={ref} className="relative">
      {inner}
    </div>
  )

  if (narrow) {
    return bar(
      /**
       * ★★ Y8 (2026-09-06) — THE PANEL PUSHES THE LIST, IT DOES NOT COVER IT.
       *
       * "Le sélecteur de région et le popover de filtres recouvrent
       *  aujourd'hui la première carte de la liste. Ils doivent s'ouvrir SOUS
       *  la rangée de filtres sans jamais masquer un élément de contenu, ou
       *  décaler la liste."
       *
       * It was `absolute inset-x-0 top-full`, which is a panel that floats
       * over whatever is under it — measured by `bun run rhythm` A59 as
       * covering the first card on חוות, שמירות and אירועים. It is in flow
       * now: it grows the sticky header, and the header pushes the list. The
       * second half of his sentence, which is also the honest one — a filter
       * panel that hides the rows it is filtering is a panel you have to
       * close to see what you did.
       */
      <div ref={box} className="flex flex-wrap items-center gap-1.5">
        {/**
          * ★★ Z3.2 (2026-09-07) — LINE 1 IS THE COUNTER AND THE BUTTON, FACE
          *    TO FACE; LINE 2 IS THE FILTERS, ALONE, AT FULL WIDTH.
          *
          * "Aujourd'hui les trois partagent une ligne et les filtres sont
          *  ecrases." They did: the counter took the end of this row, the
          *  סינון button and the ניקוי pill took the start, and the panel
          *  that holds the actual filters opened underneath at whatever was
          *  left. `me-auto` on the counter is the whole of "face a face" —
          *  in an RTL row it pins the count to the reading start and pushes
          *  everything else to the far end.
          */}
        {counter && <span className="me-auto flex items-center">{counter}</span>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-testid="filter-dropdown"
          className={`filter-pill ${active ? 'filter-pill-active' : ''}`}
        >
          <Icon name="filter" size={12} />
          {t('common.filters')}
        </button>
        {clearPill}
        {trailing && <div className="flex items-center gap-1.5">{trailing}</div>}
        {open && (
          <div
            role="dialog"
            aria-label={t('common.filters')}
            data-testid="filter-dropdown-panel"
            /* `basis-full` — in flow, on its own line under the row it belongs
               to, at the row's own width. No `absolute`, no `z-40`, nothing to
               land on top of. */
            className="mt-1.5 flex max-h-[60dvh] basis-full flex-wrap items-center gap-1.5
                       overflow-y-auto rounded-card bg-surface-high p-3"
          >
            {children}
          </div>
        )}
      </div>,
    )
  }

  const body = (
    <>
      {children}
      {clearPill}
      {trailing && (
        <div className="ms-auto flex items-center gap-1.5">{trailing}</div>
      )}
    </>
  )

  /**
   * ★ Y5 — the swipable variant is a `ScrollRow` like every other, so the
   *   filter row starts on the content margin and fades on the side that has
   *   more. The wrapping variant is a plain flex box and needs neither.
   */
  /**
   * ★★ Z1 (2026-09-07) — THE ROW CARRIES NO MARGIN OF ITS OWN ANY MORE.
   *
   * It had three — `mb-2`, `mb-4`, `mb-2`, one per shape — so the room under
   * the filters depended on which shape the panel's width had picked, and on
   * whether the screen passed a `FilterRow` or a bare `ScrollRow` (מתנדבים and
   * נהגים do). Measured: 12 px on חוות and 4 px on נהגים, for the same row in
   * the same place. Spacing between two blocks belongs to whatever holds them
   * both: `ListTop` pays it here, and `.filters-gap` pays it everywhere else.
   */
  /**
   * ★ Z3 — AND IN THE WIDE SHAPE THE COUNTER KEEPS THE END OF THE LINE.
   *
   * Y5 measured why it cannot be a flex sibling BEFORE the row: it pushed the
   * pills 104–116 px off the content margin on נהגים and מתנדבים. The row
   * keeps the start and stays swipable; the count sits at the far end, out of
   * the scroller so it cannot slide away, and the row's END bleed is
   * cancelled beside it (`me-0`) or 20 px of pills scroll underneath it.
   */
  const withCount = (row: ReactNode): ReactNode =>
    counter ? (
      <div className="flex items-center gap-2 [&_.scroll-veil]:me-0">
        <div className="min-w-0 flex-1">{row}</div>
        {counter}
      </div>
    ) : (
      row
    )

  return nowrap
    ? bar(withCount(<ScrollRow className="items-center gap-1.5">{body}</ScrollRow>))
    : bar(withCount(<div className="flex flex-wrap items-center gap-1.5">{body}</div>))
}

/**
 * F5.5 — the foot of a progressively-rendered list.
 *
 * ★★ Y6.4 (2026-09-06) — AND IT NO LONGER REPEATS THE COUNTER.
 *
 *    "Le compteur « מוצגים X מתוך Y » ne doit apparaître QU'UNE FOIS par
 *     écran." It printed the identical sentence that the pill at the top of
 *     the list prints — caught by `bun run rhythm` on מתנדבים, where the list
 *     is long enough for both to be on screen at once, as **2 counters**.
 *
 *    What is NOT a repetition is how many more there are, so that is what the
 *    button says now. Same information, none of it twice, and the button
 *    finally states its own consequence.
 *
 * Renders nothing at all when everything is on screen — a permanent "show
 * more" that does nothing teaches people to ignore it.
 */
export function LoadMore({
  shown,
  total,
  onMore,
}: {
  shown: number
  total: number
  onMore: () => void
}) {
  const { t } = useTranslation()
  if (shown >= total) return null
  return (
    <div className="flex items-center py-3">
      <button type="button" onClick={onMore} className="btn-secondary py-1.5 text-micro">
        <Icon name="chevronDown" size={14} />
        {t('common.showMoreCount', { count: total - shown })}
      </button>
    </div>
  )
}

// --- Interaction -----------------------------------------------------------

export function CopyButton({
  value,
  label,
  className = 'btn-secondary',
}: {
  value: string
  label?: string
  className?: string
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard API is unavailable over plain http on some devices; the
      // textarea beside this button stays selectable as a fallback.
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button type="button" onClick={copy} className={className}>
      <Icon name={copied ? 'check' : 'copy'} size={15} />
      {copied ? t('common.copied') : (label ?? t('common.copy'))}
    </button>
  )
}

export function Toggle({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex rounded-field border border-edge-subtle bg-surface-field p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-field px-3 py-1.5 text-caption font-medium transition-all duration-fast ease-out ${
            o.value === value
              ? 'bg-accent text-content-on-accent'
              : 'text-content-muted hover:text-content-primary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-content-muted">
        <Icon name="search" size={17} />
      </span>
      <input
        type="search"
        className="input ps-10"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="muted shrink-0">{label}</span>
      <select
        className="input py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    // `data-overlay` — PO POINT 2. A modal's whole job is to cover the shell,
    // so the layout sweep's "no pinned element covers another" rule has to be
    // told this one is deliberate. The attribute says so on the element rather
    // than in a class list the gate would have to pattern-match.
    <div
      data-overlay=""
      className="fixed inset-0 z-50 flex items-end justify-center bg-surface-sunken/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // P0bis.3 — `panel-scope`: a modal's form lays itself out against the
        // DIALOG's width, not the window's. A `md:grid-cols-2` inside a 32 rem
        // dialog gave two 15 rem columns on any desktop, which is the reading
        // the breakpoint existed to prevent.
        className={`panel-scope max-h-[90dvh] w-full animate-fade-in overflow-y-auto rounded-t-card
                    bg-surface-overlay p-5 shadow-lift sm:rounded-card ${
                      wide ? 'max-w-3xl' : 'max-w-lg'
                    }`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-heading text-content-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-field p-1.5 text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
            aria-label={t('common.close')}
            /* X11 — THE modal's one way out, and now the only one on the
               contract reader: the gates address it by name. */
            data-testid="modal-close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Inline banner for alerts, mismatches and emphasis. */
export function Callout({
  tone = 'warn',
  icon = 'alert',
  title,
  children,
}: {
  tone?: 'warn' | 'danger' | 'info' | 'success'
  icon?: IconName
  title: string
  children?: ReactNode
}) {
  /* G17: a callout is marked by its 4 px inline-start bar plus a tint — the
     same language as .card-critical — not by a full contour. */
  const tones = {
    warn: 'border-s-status-warn bg-status-warn/10 text-status-warn-ink',
    danger: 'border-s-status-danger bg-status-danger/10 text-status-danger-ink',
    info: 'border-s-status-info bg-status-info/10 text-status-info-ink',
    success: 'border-s-status-success bg-status-success/10 text-status-success-ink',
  }
  return (
    <div className={`rounded-card border-s-4 p-4 ${tones[tone]}`}>
      <p className="flex items-center gap-2 text-caption font-semibold">
        <Icon name={icon} size={16} />
        {title}
      </p>
      {children && (
        <div className="mt-1.5 text-caption text-content-secondary">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * ORDRE DE NUIT 2026-09-02 (N1) — what a detail screen shows while the real
 * app's snapshot has not arrived yet. See `useHydrated`: before it, five
 * screens answered that first empty frame with a redirect to their list.
 */
export function LoadingState() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      data-testid="loading-state"
      className="flex animate-fade-in flex-col items-center gap-3 px-6 py-16 text-center"
    >
      <Skeleton className="h-2 w-40" />
      <p className="muted">{t('data.loading')}</p>
    </div>
  )
}

/** Skeleton block used while a lazy chunk (the map) is still arriving. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton rounded-card ${className}`} aria-hidden="true" />
  )
}
