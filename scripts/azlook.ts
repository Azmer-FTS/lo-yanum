import { REMOTE, finish, go, open, serveBuild } from './ayharness'
import { mkdirSync } from 'node:fs'

/* AZ — regard rapide pendant le travail (captures de contrôle, non commitées). */
const OUT = process.env.DIST ?? 'dist-azui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5431), process.env.SKIP_BUILD !== '1'))
const DIR = process.env.LOOK_DIR ?? '/tmp/azlook'
mkdirSync(DIR, { recursive: true })
const LISTS = (process.env.LISTS ?? 'farms,institutions,leads,volunteers,missions').split(',')
const W = (process.env.WIDTHS ?? '1440').split(',').map(Number)
const THEME = process.env.THEME ?? 'dark'
for (const w of W) {
  const o = await open(w, { dark: THEME === 'dark', init: { 'lo-yanum:theme:coordinator': THEME } })
  for (const l of LISTS) {
    for (const mode of (process.env.MODES ?? 'hidden,split').split(',')) {
      await go(o.page, APP, `/coordinator/${l}`, 2500)
      await o.page.locator(`[data-testid="map-mode-${mode}"]`).first().click({ timeout: 3000 }).catch(() => undefined)
      await o.page.waitForTimeout(800)
      if (process.env.SCROLL) {
        await o.page.mouse.move(w * 0.6, 500)
        await o.page.mouse.wheel(0, Number(process.env.SCROLL))
        await o.page.waitForTimeout(600)
      }
      if (process.env.TAP) {
        await o.page.locator('[data-entity-table] [data-row-open], [data-testid="mission-tile-open"]').first().click({ timeout: 3000 }).catch(() => undefined)
        await o.page.waitForTimeout(1000)
      }
      await o.page.screenshot({ path: `${DIR}/${l}-${mode}-${w}.png` })
    }
  }
  console.log('errors', o.errors.slice(0, 3))
  await o.ctx.close()
}
await finish()
