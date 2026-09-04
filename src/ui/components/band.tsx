import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * X9.2 (2026-09-04) — THE SUMMARY BAND, ONE COMPONENT, TWO SCREENS.
 * ★★ Y5 (2026-09-04) — ONE COMPONENT, EVERY SCREEN THAT SHOWS A ROW OF
 *    NUMBERS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * W6 built this for the entity sheet and the product owner signed it off. The
 * GUARD detail had a different band a metre away — five bare `<div>`s in a
 * `metric-band` grid, no icons, no wash, and a fifth cell whose two-line
 * label made it taller than the other four. His words for it were "c'est le
 * bordel", and he is describing exactly that: two bands, one app.
 *
 * X9.2 made those two one. Y5 is the third time he has asked, and it names
 * the rest:
 *
 *   "Le modèle de référence est celui de la FICHE D'ENTITÉ (taille, couleurs,
 *    icônes, espacement) — validé par le PO. L'appliquer À L'IDENTIQUE sur
 *    tous les écrans qui affichent un bandeau de chiffres (dashboard, listes,
 *    détail de garde, incidents). Même hauteur, même style, mêmes proportions
 *    d'icônes."
 *
 * There were FOUR geometries left, and X7.3 is why the first two survived two
 * rounds of this request: it gave the list chips the sheet's COLORIMETRY, and
 * a screenshot of a coloured chip beside a coloured band card looks like a
 * match until the two are measured.
 *
 *     entity sheet / guard detail   84 px tall, 44 px disc, 24 px glyph
 *     list KPI chips                44 px tall, 28 px disc, 16 px glyph
 *     dashboard KPI row             no disc at all, bare 24 px glyph
 *     dashboard hero pair           no disc, 34 px glyph, 76 px figure
 *
 * Same colours, four sizes. So the geometry lives HERE now and nothing else
 * declares it: `KpiChip` and `KpiFilter` (primitives.tsx) and the dashboard's
 * `Kpi` and `HeroCard` all render this file. `bun run band` measures the four
 * numbers on every screen that draws one and fails on a single pixel of
 * disagreement, because a comparison by eye is what let this survive twice.
 */

/**
 * ★ W6 (2026-09-02) — THE BAND HAS ONE HEIGHT, ON EVERY ENTITY.
 *
 * `align-items: stretch` made the cards of ONE band equal to each other and
 * nothing more: the tallest card set the height, and the tallest card was
 * whichever one happened to carry extra content — the livestock breakdown on
 * a farm with five kinds of animal, the «מוזן ידנית» chip that wrapped its
 * label to a second line. So the band was 76 px on one farm and 148 px on the
 * next, and the whole sheet below it moved. It is 5.25 rem everywhere now:
 * three text lines (figure, label, note) beside a 44 px disc, and content
 * that does not fit is truncated rather than allowed to push.
 */
export const BAND_H = 'h-[5.25rem]'

/** The disc's box and its glyph — the two numbers Y5 is about. */
const DISC = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-surface-raised/80'
const GLYPH = 24

/**
 * U6 (2026-09-02) — THE SUMMARY BAND, RESTRUCTURED. The product owner's
 * reading of the old band: "the information is all over the place, you
 * cannot tell what belongs to what". So: ONE fact per card, cards visibly
 * separate, the STATUS first and loudest (a coloured pastille on its own
 * tinted card, in the top corner the eye lands on), icons twice the size
 * they were and breathing in a tinted disc, a vivid tint per card inside
 * the charter's palette, and the row SWIPES sideways when the column is
 * too narrow instead of wrapping or truncating.
 *
 * ★★ Y5 — AND IT IS A CARD, A LINK OR A BUTTON, depending on what it is for.
 *    The shape does not change with the role: a dashboard figure that
 *    navigates and a roster chip that filters are the same object with the
 *    same 44 px disc and the same 84 px box. Giving each role its own
 *    component is exactly how four geometries grew.
 */
export function BandCard({
  icon,
  tint,
  ink,
  figure,
  label,
  note,
  testId,
  style,
  to,
  onClick,
  active = false,
  dot,
}: {
  icon?: IconName
  /** Tailwind background class for the card's wash. */
  tint: string
  /** Tailwind text class for the icon disc. */
  ink: string
  figure: ReactNode
  label: ReactNode
  /**
   * ★ W6 — THE THIRD LINE, AND «מוזן ידנית» IS WHY IT EXISTS. The override
   *   chip used to be appended INSIDE the label, on the same line as
   *   "שטח החווה" — so on a 9.5 rem card the label it qualifies was the part
   *   that got truncated away, and the band's height changed from farm to
   *   farm depending on whether it was there. It is a line of its own now,
   *   always reserved (see BAND_H), never wrapping.
   */
  note?: ReactNode
  testId?: string
  style?: CSSProperties
  /** Y5 — where this figure leads (the dashboard's row). */
  to?: string
  /** Y5 — what pressing it filters (the rosters' rows). */
  onClick?: () => void
  active?: boolean
  /**
   * ★★ Y5 — A STATUS PASTILLE INSTEAD OF A GLYPH, IN THE SAME DISC.
   *
   * The rosters' KPI chips are STATUS filters — פעילה, נוצר קשר, חתמה — and
   * they never had an icon, because there is no glyph for "signed" that is
   * not an invention. The first version of this merge defaulted them to a
   * generic dashboard glyph so that every card would have a disc, and the
   * result was six identical meaningless icons in a row.
   *
   * The disc is what the geometry is about, not what is inside it. So the
   * disc is always there, always 44 px, and it carries the pastille where
   * there is no glyph — same height, same spacing, same rhythm, nothing
   * invented.
   */
  dot?: ReactNode
}) {
  const className = `band-card figure-card !flex-[1_0_9.5rem] ${BAND_H} flex items-center gap-3 rounded-card p-3 shadow-card ${tint} ${
    active ? 'ring-2 ring-accent' : ''
  } ${to || onClick ? 'card-interactive' : ''}`

  /**
   * ★★ Y5 — W2'S AUTO-FITTING FIGURE, FOR THE FIGURES IT IS FOR.
   *
   * The dashboard's cards had it and the band's did not, because the band was
   * only ever shown a farm's dunams and the dashboard is shown "17,251". The
   * first version of this merge dropped it, and the very first capture came
   * back with a five-digit head count rendered as "32…" — a truncated NUMBER,
   * which is worse than a small one and is exactly what W2 exists to prevent.
   *
   * ⚠️ AND THE SECOND VERSION APPLIED IT TO EVERYTHING, WHICH IS WORSE. W2's
   *    arithmetic is "the width, less what else is on the line, divided by the
   *    digit count times 0.66 em" — it is about TABULAR DIGITS. `bun run
   *    layout` caught both ways it fails on anything else, at three viewports:
   *
   *      a figure passed as a NODE   `13.09.2026` inside a `<span>`, so there
   *                                  was no string to count: `--digits` fell
   *                                  back to 1, the formula allowed 32 px, and
   *                                  a 181 px date escaped a 72 px box.
   *      a figure that is a PHRASE   "לפני 36 דקות" is twelve characters, so
   *                                  the same formula sized it at 6 px.
   *
   *    So the auto-fit is used where its assumption holds — a short, plainly
   *    numeric string — and everything else keeps the entity sheet's original
   *    behaviour: the metric size, truncated, with its full text on `title`
   *    so U7's rule is satisfied. `data-figure` goes on ONLY in the first
   *    case, because that attribute is what W2's gate reads as "this element
   *    promises to fit".
   */
  const text = typeof figure === 'string' || typeof figure === 'number' ? String(figure) : ''
  /**
   * ⚠️ THE TEST IS "IS IT NUMERIC", NOT "IS IT SHORT". The first version also
   *    capped the length at eight, to keep a phrase from being shrunk to
   *    nothing — and that cap is what left `13.09.2026` at the 32 px ceiling,
   *    clipped to "13.0…". A date is ten tabular characters and W2's
   *    arithmetic sizes it perfectly well; a PHRASE is what the formula cannot
   *    do, and a phrase is excluded by the character class, not by a length.
   */
  const autoFits = text.length > 0 && /^[\d.,:%+\-/\s]+$/.test(text)
  const figureStyle = autoFits
    ? ({
        '--digits': String(text.length),
        '--figure-max': 'var(--text-metric-size)',
        '--figure-reserve': '5rem',
      } as CSSProperties)
    : undefined

  const inner = (
    <>
      <span className={`${DISC} ${ink}`}>
        {icon ? <Icon name={icon} size={GLYPH} strokeWidth={1.4} /> : dot}
      </span>
      <span className="min-w-0 flex-1">
        <span
          /**
           * ⚠️ A FIGURE THAT IS A PHRASE IS SET AT `text-heading`, NOT AT THE
           *    METRIC SIZE. "לפני 36 דקות" — the sheet's last-activity card —
           *    at 32 px is 106 px of text in a 72 px box, i.e. "לפני 36 …".
           *    The metric size is for a number; a phrase in the figure slot
           *    keeps the card's geometry and gives up the ceiling, and its
           *    full text is on `title` for U7.
           */
          className={`numeric block text-content-primary ${
            autoFits ? 'figure' : 'truncate text-heading font-bold'
          }`}
          style={figureStyle}
          title={text || undefined}
          {...(autoFits ? { 'data-figure': '' } : {})}
        >
          {/* ⚠️ Y10 — THE ISOLATION IS ON THIS SPAN, NOT ON THE BLOCK ABOVE.
              `.ltr-nums` sets `direction: ltr`, and `direction` is what
              `text-align: start` resolves against — so on the block it put the
              figure at the physical LEFT of its slot while the label under it
              stayed at the right. See the same note in `Timeline`. */}
          <span className="ltr-nums">{figure}</span>
        </span>
        <span className="muted block truncate leading-tight">{label}</span>
        {/* The line is RESERVED whether or not it is filled: that is what
            makes the band one height on every entity. */}
        <span className="block truncate text-micro leading-tight text-content-muted">
          {note ?? '\u00a0'}
        </span>
      </span>
    </>
  )

  if (to) {
    return (
      <Link to={to} data-testid={testId} style={style} className={className}>
        {inner}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        data-testid={testId}
        style={style}
        className={`${className} text-start`}
      >
        {inner}
      </button>
    )
  }
  return (
    <div data-testid={testId} style={style} className={className}>
      {inner}
    </div>
  )
}
