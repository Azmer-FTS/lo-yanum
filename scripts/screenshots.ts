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
}

const SHOTS: Shot[] = [
  { name: '1-dashboard', session: 'coordinator', hash: '#/coordinator' },
  { name: '2-global-map', session: 'coordinator', hash: '#/coordinator/map', settleMs: 3500 },
  { name: '3-volunteers-table', session: 'coordinator', hash: '#/coordinator/volunteers' },
  { name: '4-farm-form', session: 'coordinator', hash: '#/coordinator/farms/farm-01/edit' },
  { name: '5-volunteer-my-guard', session: 'volunteer:vol-001', hash: '#/volunteer', settleMs: 3000 },
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

      // Then pick the identity through the toolbar, exactly as a user would.
      await page.selectOption('select', shot.session)
      await page.waitForTimeout(400)

      await page.evaluate((h) => {
        window.location.hash = h
      }, shot.hash)
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
