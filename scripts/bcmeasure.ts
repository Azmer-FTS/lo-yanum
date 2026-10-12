import type { Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BC — CE QUE L'EN-TÊTE MANGE, MESURÉ (pas estimé sur une capture).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Partagé par `bcmobile` (la porte au rendu) et `bcbefore` (le même relevé sur
 * le déployé d'avant BC). Pour une liste, à une largeur donnée :
 *
 *   · `rest`     — au repos (défilement 0) : la hauteur, depuis le haut de
 *                  l'écran, de tout ce qui précède la PREMIÈRE ligne de données
 *                  visible. Mesurée par `elementFromPoint` en descendant la
 *                  colonne du milieu : un en-tête opaque répond « moi » tant
 *                  qu'on est dessus, la première ligne de données répond
 *                  « ligne » — c'est exactement ce que l'œil voit.
 *   · `scrolled` — après avoir fait défiler la liste : même mesure. C'est
 *                  l'en-tête qui reste collé.
 *   · `share`    — la part de l'écran laissée aux données au repos.
 *
 * Une « ligne de données » : une ligne ou une vignette d'`EntityTable`
 * (`[data-row-key]`), une ligne de roster (gardes), une carte d'incident.
 */

export const LIST_SCREENS: Array<{ name: string; hash: string; key: string }> = [
  { name: 'fermes', hash: '/coordinator/farms', key: 'farms' },
  { name: 'institutions', hash: '/coordinator/institutions', key: 'institutions' },
  { name: 'contacts', hash: '/coordinator/leads', key: 'leads' },
  { name: 'volontaires', hash: '/coordinator/volunteers', key: 'volunteers' },
  { name: 'gardes', hash: '/coordinator/missions', key: 'missions' },
  { name: 'incidents', hash: '/coordinator/incidents', key: 'incidents' },
]

export const ROW_SELECTOR =
  '[data-row-key], .roster-row:not([data-roster-head]), [data-incident-row], [data-testid^="incident-card"], .pair-grid > li'

export interface HeaderMeasure {
  rest: number | null
  scrolled: number | null
  share: number | null
  viewport: number
}

/** Descend la colonne du milieu jusqu'à la première ligne de données. */
export async function firstDataY(page: Page): Promise<number | null> {
  return page.evaluate((sel) => {
    const H = window.innerHeight
    /* Les x de la COLONNE DE LISTE (à côté d'une carte, elle n'occupe qu'une
       partie de la largeur) : son milieu, et un peu de part et d'autre. */
    const col = (document.querySelector('[data-map-content]') ?? document.querySelector('main')) as HTMLElement | null
    const r = col ? col.getBoundingClientRect() : { left: 0, width: window.innerWidth }
    const xs = [0.5, 0.35, 0.65].map((f) => Math.round(r.left + r.width * f))
    let best: number | null = null
    for (const x of xs) {
      for (let y = 0; y < H; y += 2) {
        const el = document.elementFromPoint(x, y)
        if (el && el.closest(sel)) {
          best = best === null ? y : Math.min(best, y)
          break
        }
      }
    }
    return best
  }, ROW_SELECTOR)
}

export async function measureHeader(page: Page): Promise<HeaderMeasure> {
  const viewport = await page.evaluate(() => window.innerHeight)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(350)
  const rest = await firstDataY(page)
  /* Faire défiler : la page (téléphone, tableau) ou la colonne qui défile (panneau). */
  await page.evaluate(() => {
    const col = document.querySelector('[data-map-content]') as HTMLElement | null
    const scrollable = col && col.scrollHeight > col.clientHeight + 8 && getComputedStyle(col).overflowY !== 'visible' ? col : null
    if (scrollable) scrollable.scrollTop = Math.min(900, scrollable.scrollHeight)
    else window.scrollTo(0, Math.min(900, document.documentElement.scrollHeight))
    window.dispatchEvent(new Event('scroll'))
  })
  await page.waitForTimeout(500)
  const scrolled = await firstDataY(page)
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    const col = document.querySelector('[data-map-content]') as HTMLElement | null
    if (col) col.scrollTop = 0
  })
  await page.waitForTimeout(250)
  return { rest, scrolled, share: rest === null ? null : Math.round(((viewport - rest) / viewport) * 100), viewport }
}
