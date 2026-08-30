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

/**
 * F1/F2 — drive the wizard into the state the criterion is about: a farm with
 * no anchor point, and a point created by clicking the map.
 *
 * `farm-05` has none in the fixtures. Placement is an armed mode, so the button
 * comes first; the click is then placed at 42 %/40 % of the map so the pin lands
 * clear of both the zoom controls and the banner at the foot of the frame.
 */
const dropAnchorOnEmptyFarm = async (page: Page) => {
  await page.selectOption('main select', 'farm-05')
  await page.waitForTimeout(2500)
  await clickText(page, 'הוסף נקודה')
  await page.waitForTimeout(500)
  const box = await page.locator('[role="application"]').first().boundingBox()
  if (!box) return
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.4)
  await page.waitForTimeout(1200)
}

const ALL_SHOTS: Shot[] = [
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
  // Lot 0.8 pins the theme here: the day/night TILE FILTER changed with the
  // charter, and a capture that inherits the role default cannot show it.
  { name: '11-farms-map-first', session: 'coordinator', hash: '#/coordinator/farms', theme: 'light', settleMs: MAP_SETTLE },
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

  // --- LOT 0.8 — the charter pairs -------------------------------------------
  // The night tile filter, on the same screen as capture 11.
  { name: '18-farms-map-first-dark', session: 'coordinator', hash: '#/coordinator/farms', theme: 'dark', settleMs: MAP_SETTLE },

  // The volunteer's own guard: the field role that spends the night in the app.
  { name: '19-volunteer-guard-light', session: 'volunteer:vol-001', hash: '#/volunteer', theme: 'light', settleMs: 3500 },
  { name: '20-volunteer-guard-dark', session: 'volunteer:vol-001', hash: '#/volunteer', theme: 'dark', settleMs: 3500 },

  // The shop window: לא ינום and the verse on the plate (A60 — no mark). The plate
  // is deliberately IDENTICAL in both themes, and capturing both is how that
  // stays a decision rather than an accident.
  { name: '21-landing-light', session: 'coordinator', hash: '#/', theme: 'light', settleMs: 1500, fullPage: true },
  { name: '22-landing-dark', session: 'coordinator', hash: '#/', theme: 'dark', settleMs: 1500, fullPage: true },

  // --- LOT 0.9 — the finishing pass -----------------------------------------
  //
  // F1/F2 — the step that used to be a dead end. Driven all the way to the
  // interesting state: a farm with NO anchor point is selected and a pin is
  // dropped on the map, so the capture shows the fix rather than the fixture
  // that hid the bug.
  {
    name: '23-wizard-step1-map-light',
    session: 'coordinator',
    hash: '#/coordinator/missions/new',
    theme: 'light',
    settleMs: MAP_SETTLE,
    drive: dropAnchorOnEmptyFarm,
  },
  {
    name: '24-wizard-step1-map-dark',
    session: 'coordinator',
    hash: '#/coordinator/missions/new',
    theme: 'dark',
    settleMs: MAP_SETTLE,
    drive: dropAnchorOnEmptyFarm,
  },

  // F6.1 — the farm detail at the map-first gabarit, in both themes.
  { name: '25-farm-detail-dark', session: 'coordinator', hash: '#/coordinator/farms/farm-01', theme: 'dark', settleMs: MAP_SETTLE },

  // F3 — the lightened form: white fields, one hairline, 6 px corners.
  { name: '26-farm-form-light', session: 'coordinator', hash: '#/coordinator/farms/farm-01/edit', theme: 'light', settleMs: 1800 },
  { name: '27-farm-form-dark', session: 'coordinator', hash: '#/coordinator/farms/farm-01/edit', theme: 'dark', settleMs: 1800 },

  // --- LOT 0.10 / the final order of march ----------------------------------

  // A61 (P0.1) — the map's three states. Three captures of ONE screen,
  // because the criterion is that the same screen has three readings; a
  // single capture of the default would prove nothing that 11 does not.
  {
    name: '28-map-mode-hidden',
    session: 'coordinator',
    hash: '#/coordinator/farms',
    theme: 'light',
    settleMs: MAP_SETTLE,
    drive: (page) => clickText(page, 'מוסתר'),
  },
  {
    name: '29-map-mode-full',
    session: 'coordinator',
    hash: '#/coordinator/farms',
    theme: 'light',
    settleMs: MAP_SETTLE,
    drive: async (page) => {
      await clickText(page, 'מלא')
      // The map has to resize into the reclaimed column before the shutter.
      await page.waitForTimeout(2500)
    },
  },

  // A62 (P0.2) — the roster's locality bubbles, with one town TAPPED so the
  // capture shows the filter rather than just the decoration.
  {
    name: '30-roster-bubbles',
    session: 'coordinator',
    hash: '#/coordinator/volunteers',
    theme: 'light',
    settleMs: MAP_SETTLE,
    drive: async (page) => {
      const bubbles = page.locator('.maplibregl-marker')
      const count = await bubbles.count()
      if (count === 0) return
      // The biggest bubble is drawn last, so it is the one on top.
      await bubbles.nth(count - 1).click()
      await page.waitForTimeout(1500)
    },
  },

  // A44 (G10) — the farms import, stopped on the preview where the three
  // position outcomes are visible side by side.
  {
    name: '31-import-farms',
    session: 'coordinator',
    hash: '#/coordinator/import/farms',
    theme: 'light',
    settleMs: 2000,
  },

  // A59 (G18) — the threat layer on the global map, both themes. The toggle
  // is off by default, so the capture has to arm it.
  {
    name: '32-threat-layer-light',
    session: 'coordinator',
    hash: '#/coordinator/farms',
    theme: 'light',
    settleMs: MAP_SETTLE,
    drive: async (page) => {
      await clickText(page, 'שכבת איומים')
      await page.waitForTimeout(2500)
    },
  },
  {
    name: '33-threat-layer-dark',
    session: 'coordinator',
    hash: '#/coordinator/farms',
    theme: 'dark',
    settleMs: MAP_SETTLE,
    drive: async (page) => {
      await clickText(page, 'שכבת איומים')
      await page.waitForTimeout(2500)
    },
  },

  // A55 + A59 together — חוות רתם carries the hatched zone AND the vector,
  // and מושב רתמים adjoins its grazing, so one frame shows the four ground
  // tints and the overlay that must stay tellable from all of them.
  {
    name: '34-farm-detail-threats',
    session: 'coordinator',
    hash: '#/coordinator/farms/farm-01',
    theme: 'light',
    settleMs: MAP_SETTLE,
    drive: async (page) => {
      await page.evaluate(() => {
        const map = (window as unknown as { __loYanumMap?: { jumpTo: (o: unknown) => void } })
          .__loYanumMap
        map?.jumpTo({ center: [34.665, 31.056], zoom: 13.4 })
      })
      await page.waitForTimeout(3500)
    },
  },
]

/**
 * `SHOTS=23,24 bun run screenshots` re-captures a subset by leading number.
 * Added when one interaction changed and 54 files did not need to move; with
 * the variable unset the full set runs exactly as before.
 */
const ONLY = (process.env.SHOTS ?? '').split(',').filter(Boolean)
const SHOTS = ONLY.length
  ? ALL_SHOTS.filter((shot) => ONLY.some((n) => shot.name.startsWith(`${n}-`)))
  : ALL_SHOTS

/**
 * Navigate to the shell and wait for the dev toolbar, retrying once.
 *
 * `load` rather than `networkidle`, and the readiness signal is the toolbar's
 * own `<select>`. Two reasons `networkidle` was the wrong gate: Vite holds an
 * HMR websocket open for the life of the page, and every map screen streams
 * OSM tiles for as long as it is on screen — so "the network went quiet" is a
 * condition this app can legitimately never reach. A 40-shot run against a
 * loaded machine hit that and lost the whole desktop pass at shot 10.
 */
async function gotoShell(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
      await page.waitForSelector('select', { state: 'attached' })
      return
    } catch (error) {
      if (attempt === 2) throw error
      console.log('  (shell navigation timed out, retrying)')
    }
  }
}

/** Same reasoning as `gotoShell`: wait for the toolbar, not for silence. */
async function reloadShell(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.reload({ waitUntil: 'load' })
      await page.waitForSelector('select', { state: 'attached' })
      return
    } catch (error) {
      if (attempt === 2) throw error
      console.log('  (reload timed out, retrying)')
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
      // the readiness window, and losing the whole capture set to one slow
      // navigation is not worth the strictness.
      await gotoShell(page)

      /**
       * P0.1/G18 — RESET THE REMEMBERED VIEW STATE BEFORE EVERY SHOT.
       *
       * The map mode and the threat toggle are persisted per screen, which is
       * the whole point of them — and it means a driven shot leaks its state
       * into every later capture of the same route. It did: shot 29 left the
       * farms map on `full`, and 32 (the threat layer) came out as an empty
       * full-screen map with the toggle it was supposed to press hidden
       * behind the content column it had just closed.
       *
       * A capture set has to be order-independent or it is not a reference.
       */
      await page.evaluate(() => {
        Object.keys(localStorage)
          .filter(
            (k) =>
              k.startsWith('lo-yanum:map-mode') ||
              k === 'lo-yanum:threat-layer',
          )
          .forEach((k) => localStorage.removeItem(k))
        sessionStorage.clear()
      })
      await reloadShell(page)

      if (shot.theme) {
        await page.evaluate((th) => {
          for (const role of ['coordinator', 'farmer', 'volunteer', 'driver']) {
            localStorage.setItem(`lo-yanum:theme:${role}`, th)
          }
        }, shot.theme)
        await reloadShell(page)
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
