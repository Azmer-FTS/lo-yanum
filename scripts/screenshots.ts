import { chromium } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Capture the five key screens at both target viewports (R8).
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
  /** Route planner: tick the pending farms so the live trace is drawn. */
  selectRoute?: boolean
}

/** Every map screen needs real settle time: WebGL init + OSM tiles + fitBounds. */
const MAP_SETTLE = 6000

const SHOTS: Shot[] = [
  { name: '1-dashboard-light', session: 'coordinator', hash: '#/coordinator', theme: 'light', settleMs: MAP_SETTLE },
  { name: '2-dashboard-dark', session: 'coordinator', hash: '#/coordinator', theme: 'dark', settleMs: MAP_SETTLE },
  { name: '3-farms-map-first', session: 'coordinator', hash: '#/coordinator/farms', settleMs: MAP_SETTLE },
  { name: '4-route-planner', session: 'coordinator', hash: '#/coordinator/route', settleMs: MAP_SETTLE, selectRoute: true },
  { name: '5-incidents-map-first', session: 'coordinator', hash: '#/coordinator/incidents', settleMs: MAP_SETTLE },
  { name: '6-driver-roster', session: 'driver:drv-03', hash: '#/driver', settleMs: 3500 },
  { name: '7-volunteers-table', session: 'coordinator', hash: '#/coordinator/volunteers', settleMs: 1500 },
]

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

    for (const shot of SHOTS) {
      // Land on the coordinator shell first: that is where the dev toolbar
      // lives (the landing screen has no toolbar), and the default session is
      // already the coordinator, so RequireRole lets us straight in.
      await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'networkidle' })
      await page.waitForSelector('select', { state: 'attached' })

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

      if (shot.selectRoute) {
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((b) =>
            b.textContent?.includes('בחירה מהירה'),
          )
          ;(btn as HTMLButtonElement | undefined)?.click()
        })
      }

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
