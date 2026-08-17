import { useEffect, useState } from 'react'

/**
 * F5.5 — PROGRESSIVE RENDERING FOR ANY LIST THAT CAN PASS ~20 ROWS.
 *
 * The volunteers table has been virtualised since Lot 0 because 300 rows are
 * obviously 300 rows. The lists this hook is for are the ones that LOOK short in
 * the fixtures and are not bounded by anything: guards, incidents, farms, an
 * import preview. Twelve today, four hundred after a season, and the failure is
 * not a slow frame — it is a page whose sticky footer is three thousand pixels
 * below the fold.
 *
 * A hook rather than the virtualiser because these rows are not a fixed height:
 * a guard card grows with its team, an incident with its description. Measuring
 * them costs more than simply not rendering the ones nobody has scrolled to yet,
 * and "show more" is legible in a way a scroll spinner is not — the count says
 * how much is left, which the coordinator asked for by opening the screen.
 *
 * The reset is keyed on the LENGTH: applying a filter should return to the top
 * of a fresh list rather than leave 200 rows expanded from the previous query.
 */
export function useProgressive<T>(items: T[], page = 20) {
  const [shown, setShown] = useState(page)

  useEffect(() => {
    setShown(page)
  }, [items.length, page])

  const visible = items.slice(0, shown)
  return {
    visible,
    hasMore: shown < items.length,
    shown: visible.length,
    total: items.length,
    more: () => setShown((s) => s + page),
  }
}
