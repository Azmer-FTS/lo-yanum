import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ★★ Y — THE CAPTURES THE PRODUCT OWNER ASKED FOR, TAKEN ON THE URL HE OPENS.
 *
 *   bun run ycaptures
 *
 * "Captures comparatives des bandeaux (Y5) et des écrans corrigés, prises sur
 *  l'URL déployée, aux viewports iPad ET iPhone."
 *
 * ★ THE DEPLOYED DEMO TWIN, NOT A LOCAL BUILD. His standing rule since §29 is
 *   that nothing is delivered until it is shown on the URL he can open, and
 *   `/lo-yanum/demo/` is the same commit and the same bundle as the real app
 *   without the login door (see the workflow). `BASE_URL` overrides it for a
 *   dry run against a local preview.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(/\/$/, '')
const OUT = 'docs/screenshots/ypass'

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'iphone', width: 402, height: 874 },
] as const

interface Shot {
  name: string
  hash: string
  /** Map mode to stamp before loading, when the shot is about one. */
  mode?: { key: string; value: 'split' | 'hidden' | 'full' }
  /** Extra settling for a map screen. */
  wait?: number
  /** Drive the screen into the state the capture is about. */
  act?: (page: Page) => Promise<void>
}

const SHOTS: Shot[] = [
  // ---- Y5: the comparative band captures, the three screens side by side ----
  { name: 'y5-bandeau-fiche-entite', hash: '#/coordinator/farms/farm-01', wait: 5000 },
  { name: 'y5-bandeau-dashboard', hash: '#/coordinator', wait: 6000 },
  { name: 'y5-bandeau-liste-fermes', hash: '#/coordinator/farms', wait: 6000 },
  { name: 'y5-bandeau-detail-garde', hash: '#/coordinator/missions/mission-01', wait: 5000 },

  // ---- the corrected screens -------------------------------------------------
  { name: 'y2-y4-gardes-partage', hash: '#/coordinator/missions', mode: { key: 'missions', value: 'split' }, wait: 6000 },
  { name: 'y4-gardes-contenu-plein', hash: '#/coordinator/missions', mode: { key: 'missions', value: 'hidden' }, wait: 5000 },
  { name: 'y4-fermes-partage', hash: '#/coordinator/farms', mode: { key: 'farms', value: 'split' }, wait: 6000 },
  { name: 'y4-fermes-contenu-plein', hash: '#/coordinator/farms', mode: { key: 'farms', value: 'hidden' }, wait: 5000 },
  { name: 'y4-volontaires-partage', hash: '#/coordinator/volunteers', mode: { key: 'volunteers', value: 'split' }, wait: 6000 },
  { name: 'y4-incidents-partage', hash: '#/coordinator/incidents', mode: { key: 'incidents', value: 'split' }, wait: 6000 },
  { name: 'y3-carte-pleine', hash: '#/coordinator/farms', mode: { key: 'farms', value: 'full' }, wait: 7000 },
  { name: 'y9-planificateur', hash: '#/coordinator/route', wait: 7000 },
  { name: 'y10-timeline-incident', hash: '#/coordinator/incidents/inc-01', wait: 5000 },
  { name: 'y11-fiche-ferme', hash: '#/coordinator/farms/farm-01', wait: 6000 },

  {
    name: 'y8-regions',
    hash: '#/coordinator/farms',
    mode: { key: 'farms', value: 'full' },
    wait: 7000,
    act: async (page) => {
      const toggle = page.locator('[data-testid="map-legend-toggle"]')
      if (await toggle.count()) {
        await toggle.click()
        await page.waitForTimeout(500)
      }
      const box = page.locator('[data-testid="layer-regions"]')
      if (await box.count()) {
        await box.check({ force: true })
        await page.waitForTimeout(2500)
      }
      await page.evaluate(() => {
        const m = (window as unknown as { __loYanumMap?: { jumpTo: (o: unknown) => void } })
          .__loYanumMap
        m?.jumpTo({ center: [34.9, 31.6], zoom: 7 })
      })
      await page.waitForTimeout(4000)
    },
  },
  {
    name: 'y12-recherche-surcouche',
    hash: '#/coordinator/farms',
    wait: 6000,
    act: async (page) => {
      await page.locator('[data-testid="list-search-open"]').click()
      await page.waitForTimeout(500)
      await page.keyboard.type('רתם')
      await page.waitForTimeout(900)
    },
  },
  {
    name: 'y7-filtres-dropdown',
    hash: '#/coordinator/missions',
    wait: 6000,
    act: async (page) => {
      const dd = page.locator('[data-testid="filter-dropdown"]')
      if (await dd.count()) {
        await dd.click()
        await page.waitForTimeout(500)
      }
    },
  },
  {
    name: 'y13-mode-affichage',
    hash: '#/coordinator/settings',
    wait: 4000,
    act: async (page) => {
      const sec = page.locator('[data-block="settings-viewas"]')
      if (await sec.count()) {
        await sec.scrollIntoViewIfNeeded()
        await page.waitForTimeout(600)
      }
    },
  },
  {
    name: 'y13-bandeau-role-simule',
    hash: '#/coordinator/settings',
    wait: 4000,
    act: async (page) => {
      const sec = page.locator('[data-block="settings-viewas"]')
      if (!(await sec.count())) return
      await sec.scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      const person = page.locator('[data-testid="view-as-person"]').first()
      if (await person.count()) {
        await person.click()
        await page.waitForTimeout(3000)
      }
    },
  },
]

console.log('')
console.log(`  Y — CAPTURES SUR L'URL DÉPLOYÉE : ${BASE}`)
console.log('  ================================================================')

let browser: Browser | null = null
let taken = 0
try {
  browser = await chromium.launch()
  await Bun.$`mkdir -p ${OUT}`.quiet()

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)

    for (const shot of SHOTS) {
      /**
       * ⚠️ THE MODE IS STAMPED BEFORE THE SCREEN LOADS, on the app's own key.
       *    Clicking the pill would work and would also be testing the pill;
       *    these are captures of what each mode DRAWS.
       */
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
      /**
       * ⚠️ THE STATE IS CLEARED BETWEEN SHOTS, AND THE FIRST RUN IS WHY. The
       *    captures share one browser context, so `y3-carte-pleine` left the
       *    farms screen in `full` — and the next shot's search button was
       *    present, correct and INVISIBLE, because in `full` there is no
       *    content column. A capture run has to start each frame from the
       *    state the product owner would find, not from the previous frame's.
       */
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('lo-yanum:map-mode:') || key === 'lo-yanum:view-as') {
            localStorage.removeItem(key)
          }
        }
      })
      if (shot.mode) {
        await page.evaluate(
          ([k, v]) => localStorage.setItem(`lo-yanum:map-mode:${k}`, v as string),
          [shot.mode.key, shot.mode.value] as [string, string],
        )
      }
      await page.goto(`${BASE}/${shot.hash}`, { waitUntil: 'load' })
      await page.waitForTimeout(shot.wait ?? 4000)
      if (shot.act) await shot.act(page)

      const file = `${OUT}/${vp.name}-${shot.name}.png`
      await page.screenshot({ path: file })
      taken++
      console.log(`  ${vp.name.padEnd(7)} ${shot.name}`)
    }
    await context.close()
  }
} finally {
  await browser?.close()
}

console.log('')
console.log(`  ${taken} captures dans ${OUT}/`)
