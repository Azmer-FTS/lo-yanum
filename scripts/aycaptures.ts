import type { Page } from 'playwright'

import { REMOTE, TOUR, check, finish, go, open, section, serveBuild, shots } from './ayharness'

/**
 * AY13 — LES CAPTURES : tous les écrans touchés par AY, clair ET sombre,
 * 402 · 1032 · 1440 px (attention particulière au téléphone).
 *
 *   bun run aycaptures                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run aycaptures    # le DÉPLOYÉ
 *   WIDTHS=402 THEMES=light …                                           # une partie
 *
 * Build réel + base factice (vraies fermes, onze institutions réelles).
 * → docs/screenshots/aypass/<local|deployed>/captures/<écran>-<thème>-<largeur>.png
 */
const OUT = process.env.DIST ?? 'dist-ayui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5419), process.env.SKIP_BUILD !== '1'))
const SHOTS = shots('captures')
const WIDTHS = (process.env.WIDTHS ?? '402,1032,1440').split(',').map(Number)
const THEMES = (process.env.THEMES ?? 'light,dark').split(',')

const click = (sel: string) => async (p: Page) => void (await p.locator(sel).first().click({ timeout: 4000 }).catch(() => undefined))
const SCREENS: Array<[string, string, ((p: Page) => Promise<void>)?]> = [
  ['tableau-de-bord', '/coordinator'],
  ['contacts', '/coordinator/leads'],
  ['contacts-apercu', '/coordinator/leads', click('[data-testid="leads-table"] [data-row-open], [data-testid="leads-table"] tbody tr td')],
  ['contact-edition', '/coordinator/leads/lead-ay-1'],
  ['fermes', '/coordinator/farms'],
  ['fermes-tableau', '/coordinator/farms', click('[data-testid="map-mode-hidden"]')],
  ['fermes-apercu', '/coordinator/farms', async (p) => {
    await click('[data-testid="map-mode-hidden"]')(p)
    await p.waitForTimeout(500)
    await click('[data-testid="farms-table"] [data-row-open], [data-testid="farms-table"] tbody tr td')(p)
  }],
  ['fermes-reglages', '/coordinator/farms', async (p) => {
    await click('[data-testid="farms-menu-toggle"]')(p)
    await click('[data-testid="open-screen-settings-farms"]')(p)
  }],
  ['institutions', '/coordinator/institutions'],
  ['institutions-apercu', '/coordinator/institutions', click('[data-testid="institutions-table"] [data-row-open], [data-testid="institutions-table"] tbody tr td')],
  ['institution-edition', `/coordinator/institutions/${TOUR[0].id}`],
  ['volontaires', '/coordinator/volunteers'],
  ['volontaires-conducteurs', '/coordinator/volunteers?drivers=1'],
  ['volontaire-apercu', '/coordinator/volunteers', click('[data-testid="people-table"] [data-row-open], [data-testid="people-table"] tbody tr td')],
  ['volontaire-nouveau-conducteur', '/coordinator/volunteers/new?driver=1'],
  ['couverture', '/coordinator/coverage'],
  ['couverture-institution', `/coordinator/coverage?inst=${TOUR[0].id}`],
  ['planificateur', '/coordinator/route'],
  ['gardes', '/coordinator/missions'],
  ['garde-nouvelle', '/coordinator/missions/new'],
  ['import', '/coordinator/import'],
  ['import-volontaires', '/coordinator/import?kind=volunteers'],
  ['ajout', '/coordinator/add?type=volunteer&source=vcf'],
  ['reglages', '/coordinator/settings'],
]

section('AY13 — captures des écrans touchés')
let n = 0
for (const theme of THEMES) {
  for (const w of WIDTHS) {
    const o = await open(w, { dark: theme === 'dark', init: { 'lo-yanum:theme:coordinator': theme } })
    for (const [name, route, act] of SCREENS) {
      await go(o.page, APP, route, 3000)
      if (act) {
        await act(o.page)
        await o.page.waitForTimeout(1500)
      }
      await o.page.screenshot({ path: `${SHOTS}/${name}-${theme === 'dark' ? 'sombre' : 'clair'}-${w}.png` })
      n++
    }
    check(`captures ${theme === 'dark' ? 'sombres' : 'claires'} ${w} px : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
}
console.log(`  ${n} captures → ${SHOTS}`)
await finish()
