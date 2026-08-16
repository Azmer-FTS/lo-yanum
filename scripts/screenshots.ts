import { chromium } from 'playwright'
import type { Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Capture the reference screens at both target viewports.
 *
 * Run against a live dev server:  bun run screenshots
 * Output lands in docs/screenshots/ and is referenced from ETAT.md.
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve('docs/screenshots')

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
]

interface Shot {
  name: string
  /** Session preset id to select in the dev toolbar before capturing. */
  session: string
  hash: string
  /** Extra settle time for lazy chunks (the map) and tile loads. */
  settleMs?: number
  /**
   * Viewport-only by default. `fullPage` is avoided because Playwright renders
   * position:sticky elements at their document position rather than pinned,
   * which makes the sticky form actions and dev toolbar look like they float
   * in the middle of the page.
   */
  fullPage?: boolean
  /** Force a theme rather than using the role default. */
  theme?: 'light' | 'dark' | 'system'
  /**
   * Interaction to run after the route has settled — for screens whose
   * interesting state is two clicks in (the wizard's candidate list, the
   * planner's live trace).
   */
  drive?: (page: Page) => Promise<void>
}

/** Every map screen needs real settle time: WebGL init + OSM tiles + fitBounds. */
const MAP_SETTLE = 6000

/** Click a button by its visible Hebrew label. */
const clickText = async (page: Page, text: string) => {
  await page.evaluate((label) => {
    const btn = [...document.querySelectorAll('button, a')].find((b) =>
      b.textContent?.includes(label),
    )
    ;(btn as HTMLElement | undefined)?.click()
  }, text)
  await page.waitForTimeout(700)
}

const SHOTS: Shot[] = [
  // D3 — the control room, in both palettes.
  { name: '1-dashboard-light', session: 'coordinator', hash: '#/coordinator', theme: 'light', settleMs: MAP_SETTLE },
  { name: '2-dashboard-dark', session: 'coordinator', hash: '#/coordinator', theme: 'dark', settleMs: MAP_SETTLE },

  // D5 — the wizard, stopped on the scored proposal.
  {
    name: '3-guard-wizard-light',
    session: 'coordinator',
    hash: '#/coordinator/missions/new',
    theme: 'light',
    settleMs: 2500,
    drive: async (page) => {
      await clickText(page, 'הבא')
      await clickText(page, 'מילוי אוטומטי')
    },
  },
  {
    name: '4-guard-wizard-dark',
    session: 'coordinator',
    hash: '#/coordinator/missions/new',
    theme: 'dark',
    settleMs: 2500,
    drive: async (page) => {
      await clickText(page, 'הבא')
      await clickText(page, 'מילוי אוטומטי')
    },
  },

  // D4 — the agenda, week view.
  { name: '5-agenda-week-light', session: 'coordinator', hash: '#/coordinator/agenda', theme: 'light', settleMs: 1800 },
  { name: '6-agenda-week-dark', session: 'coordinator', hash: '#/coordinator/agenda', theme: 'dark', settleMs: 1800 },

  // D6.2 — the night as a sequence.
  { name: '7-mission-timeline-light', session: 'coordinator', hash: '#/coordinator/missions/mission-01', theme: 'light', settleMs: 3500 },
  { name: '8-mission-timeline-dark', session: 'coordinator', hash: '#/coordinator/missions/mission-01', theme: 'dark', settleMs: 3500 },

  // D1 — the token demonstration page.
  { name: '9-styleguide-light', session: 'coordinator', hash: '#/styleguide', theme: 'light', settleMs: 1500, fullPage: true },
  { name: '10-styleguide-dark', session: 'coordinator', hash: '#/styleguide', theme: 'dark', settleMs: 1500, fullPage: true },

  // D2 — the map on the physical left, on the remaining map-first screens.
  { name: '11-farms-map-first', session: 'coordinator', hash: '#/coordinator/farms', settleMs: MAP_SETTLE },
  {
    name: '12-route-planner',
    session: 'coordinator',
    hash: '#/coordinator/route',
    settleMs: MAP_SETTLE,
    drive: async (page) => clickText(page, 'בחירה מהירה'),
  },
  { name: '13-incidents-map-first', session: 'coordinator', hash: '#/coordinator/incidents', settleMs: MAP_SETTLE },
  { name: '14-missions-map-first', session: 'coordinator', hash: '#/coordinator/missions', settleMs: MAP_SETTLE },

  // D6.3 / D7.4 — the rebalanced farm card with its activity timeline.
  { name: '15-farm-detail', session: 'coordinator', hash: '#/coordinator/farms/farm-01', settleMs: MAP_SETTLE, fullPage: true },

  // Field roles, unchanged in scope but re-verified against the new palette.
  { name: '16-driver-roster', session: 'driver:drv-03', hash: '#/driver', settleMs: 3500 },
  { name: '17-volunteers-table', session: 'coordinator', hash: '#/coordinator/volunteers', settleMs: 1500 },
]

/** Navigate to the shell and wait for the dev toolbar, retrying once. */
async function gotoShell(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'networkidle' })
      await page.waitForSelector('select', { state: 'attached' })
      return
    } catch (error) {
      if (attempt === 1) throw error
      console.log('  (shell navigation timed out, retrying)')
    }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      locale: 'he-IL',
      // Deterministic: geolocation is granted and pinned so the report screens
      // never sit on a "locating…" state during capture.
      permissions: ['geolocation'],
      geolocation: { latitude: 31.0611, longitude: 34.6552 },
    })
    const page = await context.newPage()
    page.setDefaultNavigationTimeout(120_000)
    page.setDefaultTimeout(60_000)

    for (const shot of SHOTS) {
      // Land on the coordinator shell first: that is where the dev toolbar
      // lives (the landing screen has no toolbar), and the default session is
      // already the coordinator, so RequireRole lets us straight in.
      //
      // Retried once: a 40-shot run on a loaded machine will occasionally miss
      // the `networkidle` window, and losing the whole capture set to one slow
      // navigation is not worth the strictness.
      await gotoShell(page)

      if (shot.theme) {
        await page.evaluate((th) => {
          for (const role of ['coordinator', 'farmer', 'volunteer', 'driver']) {
            localStorage.setItem(`lo-yanum:theme:${role}`, th)
          }
        }, shot.theme)
        await page.reload({ waitUntil: 'networkidle' })
        await page.waitForSelector('select', { state: 'attached' })
      } else {
        await page.evaluate(() => {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('lo-yanum:theme'))
            .forEach((k) => localStorage.removeItem(k))
        })
      }

      // Then pick the identity through the toolbar, exactly as a user would.
      await page.selectOption('select', shot.session)
      await page.waitForTimeout(400)

      if (shot.theme) {
        await page.evaluate((th) => {
          localStorage.setItem('lo-yanum:theme:coordinator', th)
          localStorage.setItem('lo-yanum:theme:driver', th)
          localStorage.setItem('lo-yanum:theme:volunteer', th)
        }, shot.theme)
      }

      await page.evaluate((h) => {
        window.location.hash = h
      }, shot.hash)
      await page.waitForTimeout(1200)

      if (shot.drive) await shot.drive(page)

      await page.waitForTimeout(shot.settleMs ?? 1200)

      const file = path.join(OUT, `${shot.name}-${vp.name}.png`)
      await page.screenshot({ path: file, fullPage: shot.fullPage ?? false })
      console.log(`  ${path.relative(process.cwd(), file)}`)
    }

    await context.close()
  }

  await browser.close()
}

await main()
