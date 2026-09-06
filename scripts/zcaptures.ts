import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ★★ Y11 — THE CAPTURES OF THIS PASS, ON THE URL THE PRODUCT OWNER OPENS.
 *
 *   bun run zcaptures
 *   BASE_URL=http://localhost:5210 bun run zcaptures    (dry run, local build)
 *
 * "Captures Playwright clair + sombre sur iPad Pro 13\" (1032×1376 et
 *  1376×1032) et iPhone (402×874) : dashboard, חוות, מתנדבים, נהגים מתנדבים,
 *  שמירות, édition de région, réglages."
 *
 * Seven screens × three viewports × two themes = 42 frames.
 *
 * ★ THE DEPLOYED DEMO TWIN, NOT A LOCAL BUILD. The standing rule since §29 is
 *   that nothing is delivered until it is shown on the URL he can open, and
 *   `/lo-yanum/demo/` is the same commit and the same bundle as the real app
 *   without the login door (see `deploy.yml`).
 *
 * ⚠️ THE THEME IS SET THE WAY THE APP STORES IT, then loaded fresh, for the
 *    same reason the map mode is: clicking the switch would also be testing
 *    the switch, and these are captures of what each theme DRAWS. The key is
 *    the one `ui/theme.tsx` writes.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(/\/$/, '')
const OUT = 'docs/screenshots/zpass'

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
] as const

const THEMES = ['light', 'dark'] as const

interface Shot {
  name: string
  hash: string
  mode?: { key: string; value: 'split' | 'hidden' | 'full' }
  wait?: number
  act?: (page: Page) => Promise<void>
}

const SHOTS: Shot[] = [
  { name: 'dashboard', hash: '#/coordinator', wait: 6000 },
  { name: 'fermes', hash: '#/coordinator/farms', mode: { key: 'farms', value: 'split' }, wait: 6500 },
  { name: 'fermes-tableau', hash: '#/coordinator/farms', mode: { key: 'farms', value: 'hidden' }, wait: 5000 },
  { name: 'volontaires', hash: '#/coordinator/volunteers', mode: { key: 'volunteers', value: 'split' }, wait: 6500 },
  { name: 'conducteurs', hash: '#/coordinator/drivers', mode: { key: 'drivers', value: 'split' }, wait: 6500 },
  { name: 'gardes', hash: '#/coordinator/missions', mode: { key: 'missions', value: 'split' }, wait: 6500 },
  { name: 'reglages', hash: '#/coordinator/settings', wait: 4500 },
  {
    name: 'edition-region',
    hash: '#/coordinator/settings/regions',
    wait: 7000,
    act: async (page) => {
      const pick = page.locator('[data-testid="region-pick-negev"]')
      if (await pick.count()) {
        await pick.click()
        await page.waitForTimeout(3500)
      }
    },
  },
]

console.log('')
console.log(`  Y11 — CAPTURES CLAIR + SOMBRE : ${BASE}`)
console.log('  ================================================================')

let browser: Browser | null = null
let taken = 0
try {
  browser = await chromium.launch()
  await Bun.$`mkdir -p ${OUT}`.quiet()

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'he-IL',
        hasTouch: true,
        colorScheme: theme,
      })
      const page = await context.newPage()
      page.setDefaultTimeout(60_000)

      for (const shot of SHOTS) {
        await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
        /**
         * ⚠️ THE STATE IS CLEARED BETWEEN SHOTS. The frames share one context,
         *    so a screen left in `full` by the previous shot is the state the
         *    next one is photographed in — a capture run has to start each
         *    frame from what the product owner would find.
         */
        await page.evaluate(
          (t) => {
            for (const key of Object.keys(localStorage)) {
              if (key.startsWith('lo-yanum:map-mode:') || key === 'lo-yanum:view-as') {
                localStorage.removeItem(key)
              }
            }
            /* ⚠️ THE KEY IS PER ROLE (`core/theme.ts`), because a farmer's
               night screen and a coordinator's are different decisions. These
               captures are the coordinator's, so it is his key that is
               stamped — and `colorScheme` on the context is set to match, so
               "system" would land on the same answer either way. */
            localStorage.setItem('lo-yanum:theme:coordinator', t as string)
          },
          theme as string,
        )
        if (shot.mode) {
          await page.evaluate(
            ([k, v]) => localStorage.setItem(`lo-yanum:map-mode:${k}`, v as string),
            [shot.mode.key, shot.mode.value] as [string, string],
          )
        }
        await page.goto(`${BASE}/${shot.hash}`, { waitUntil: 'load' })
        await page.waitForTimeout(shot.wait ?? 4000)
        if (shot.act) await shot.act(page)

        const file = `${OUT}/${vp.name}-${theme}-${shot.name}.png`
        await page.screenshot({ path: file })
        taken++
        console.log(`  ${vp.name.padEnd(8)} ${theme.padEnd(5)} ${shot.name}`)
      }
      await context.close()
    }
  }
} finally {
  await browser?.close()
}

console.log('')
console.log(`  ${taken} captures dans ${OUT}/`)
