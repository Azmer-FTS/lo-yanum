import type { CSSProperties, ReactNode } from 'react'

import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * X9.2 (2026-09-04) — THE SUMMARY BAND, ONE COMPONENT, TWO SCREENS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * W6 built this for the entity sheet and the product owner signed it off. The
 * GUARD detail had a different band a metre away — five bare `<div>`s in a
 * `metric-band` grid, no icons, no wash, and a fifth cell whose two-line
 * label made it taller than the other four. His words for it were "c'est le
 * bordel", and he is describing exactly that: two bands, one app.
 *
 * So the band is a component now and both screens mount it. Everything below
 * is W6's, moved rather than rewritten.
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

/**
 * U6 (2026-09-02) — THE SUMMARY BAND, RESTRUCTURED. The product owner's
 * reading of the old band: "the information is all over the place, you
 * cannot tell what belongs to what". So: ONE fact per card, cards visibly
 * separate, the STATUS first and loudest (a coloured pastille on its own
 * tinted card, in the top corner the eye lands on), icons twice the size
 * they were and breathing in a tinted disc, a vivid tint per card inside
 * the charter's palette, and the row SWIPES sideways when the column is
 * too narrow instead of wrapping or truncating.
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
}: {
  icon: IconName
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
}) {
  return (
    <div
      data-testid={testId}
      style={style}
      className={`!flex-[1_0_9.5rem] ${BAND_H} flex items-center gap-3 rounded-card p-3 shadow-card ${tint}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-surface-raised/80 ${ink}`}>
        <Icon name={icon} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="numeric truncate text-metric text-content-primary">{figure}</div>
        <p className="muted truncate leading-tight">{label}</p>
        {/* The line is RESERVED whether or not it is filled: that is what
            makes the band one height on every entity. */}
        <p className="truncate text-micro leading-tight text-content-muted">
          {note ?? '\u00a0'}
        </p>
      </div>
    </div>
  )
}
