import { chromium } from 'playwright'

/**
 * A64 — THE EXHAUSTIVE "MAP ON THE LEFT" AUDIT.
 *
 * The product owner froze one rule: **every screen and sub-screen that carries
 * a map uses the map-first gabarit — map on the VISUAL left, content on the
 * right — without exception.** Before P0bis.1 five screens obeyed it and eight
 * others put the map on top of the content, which is the same information in
 * two different places depending on the route you arrived by.
 *
 * A rule that is checked by looking at screenshots is a rule that comes back.
 * This walks EVERY route in the app at a wide viewport and asserts three
 * things per screen:
 *
 *   1. WHETHER IT CARRIES A MAP AT ALL — printed either way, so the audit is
 *      exhaustive rather than a list of the screens somebody remembered.
 *   2. IF IT DOES: the map's centre is strictly LEFT of the viewport's centre
 *      and its left edge is flush with the content area. In RTL the rail is on
 *      the right, so "flush left" is `left ≈ 0`; the check runs in Hebrew,
 *      which is the writing direction the app ships in and the one where
 *      getting this wrong is easy (decision 34).
 *   3. IF IT DOES: the content column really is to the RIGHT of the map — not
 *      merely that the map is left of centre, which a full-width map would
 *      also satisfy.
 *
 * Two kinds of screen are exempt, and BOTH print their reason so neither can
 * become a silent hole:
 *
 *   · The FIELD screens (farmer / volunteer / driver). Their shell is a
 *     `max-w-2xl` phone column at every width — that IS the narrow responsive
 *     form the rule explicitly allows, and a 672 px column split in two would
 *     be worse on the phone these screens exist for.
 *   · The screens with NO map. Two are named: the agenda, because a calendar is
 *     read like text and is deliberately not flipped (decision 34), and
 *     הגדרות, which is a form about the device rather than about the ground.
 *
 * Run against a live dev server:
 *   BASE_URL=http://localhost:5173 bun run mapfirst
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'

/** iPad Pro 13" LANDSCAPE — the widest thing the coordinator actually holds. */
const VIEWPORT = { width: 1376, height: 1032 }

interface Route {
  name: string
  hash: string
  session?: string
  /** Printed when the screen is expected to have no map at all. */
  expectNoMap?: string
  /** Printed when the vertical stack is the legitimate form for this screen. */
  stackedOnPurpose?: string
  /** Clicked before auditing (the wizard's step 1 needs a farm chosen). */
  setup?: (page: import('playwright').Page) => Promise<void>
}

const ROUTES: Route[] = [
  { name: 'dashboard', hash: '#/coordinator' },
  {
    name: 'agenda',
    hash: '#/coordinator/agenda',
    expectNoMap: 'a calendar is read like text — deliberately not map-first',
  },
  { name: 'farms', hash: '#/coordinator/farms' },
  { name: 'farm-detail', hash: '#/coordinator/farms/farm-01' },
  { name: 'farm-form-edit', hash: '#/coordinator/farms/farm-01/edit' },
  { name: 'farm-form-new', hash: '#/coordinator/farms/new' },
  { name: 'anchor-sheet', hash: '#/coordinator/farms/farm-01/anchors/anchor-01' },
  {
    name: 'anchor-form',
    hash: '#/coordinator/farms/farm-01/anchors/anchor-01/edit',
  },
  { name: 'anchor-form-new', hash: '#/coordinator/farms/farm-01/anchors/new' },
  { name: 'route-planner', hash: '#/coordinator/route' },
  { name: 'volunteers', hash: '#/coordinator/volunteers' },
  { name: 'drivers', hash: '#/coordinator/drivers' },
  {
    name: 'import',
    hash: '#/coordinator/import/volunteers',
    expectNoMap: 'a file wizard — the map arrives with the imported rows',
  },
  { name: 'missions', hash: '#/coordinator/missions' },
  { name: 'mission-detail', hash: '#/coordinator/missions/mission-01' },
  { name: 'incidents', hash: '#/coordinator/incidents' },
  { name: 'incident-detail', hash: '#/coordinator/incidents/inc-01' },
  {
    name: 'settings',
    hash: '#/coordinator/settings',
    expectNoMap:
      'P2.5a — הגדרות is read like a form: connection, held ground, account',
  },
  {
    name: 'mission-wizard',
    hash: '#/coordinator/missions/new',
    // Step 1 is map-first already (Lot 0.9 F2): a click on the map creates the
    // anchor point the wizard needs. It lives inside the stepper shell rather
    // than in MapSplit, so it is audited here on its own terms.
    setup: async (page) => {
      await page.waitForTimeout(500)
      const farm = page.locator('button:has-text("חוות רתם")').first()
      if (await farm.count()) await farm.click()
      await page.waitForTimeout(1500)
    },
  },
  {
    name: 'styleguide',
    hash: '#/styleguide',
    expectNoMap: 'a token catalogue',
  },
  {
    name: 'farmer-tonight',
    hash: '#/farmer',
    session: 'farmer:contact-01a',
    stackedOnPurpose:
      'FIELD shell — a max-w-2xl phone column at every width; the stack IS the narrow responsive form',
  },
  {
    name: 'farmer-guards',
    hash: '#/farmer/guards',
    session: 'farmer:contact-01a',
    expectNoMap: 'a list of the farm’s own guards',
  },
  {
    name: 'farmer-report',
    hash: '#/farmer/report',
    session: 'farmer:contact-01a',
    expectNoMap: 'a report form',
  },
  {
    name: 'volunteer-guard',
    hash: '#/volunteer',
    session: 'volunteer:vol-001',
    stackedOnPurpose: 'FIELD shell — see farmer-tonight',
  },
  {
    name: 'volunteer-roster',
    hash: '#/volunteer/roster',
    session: 'volunteer:vol-001',
    expectNoMap: 'the group roster',
  },
  {
    name: 'volunteer-report',
    hash: '#/volunteer/report',
    session: 'volunteer:vol-001',
    expectNoMap: 'a report form',
  },
  {
    name: 'driver-trip',
    hash: '#/driver',
    session: 'driver:drv-03',
    stackedOnPurpose: 'FIELD shell — see farmer-tonight',
  },
]

interface Probe {
  hasMap: boolean
  /** The map PANEL (the column), not the canvas — the canvas can be inset. */
  panel: { left: number; right: number } | null
  content: { left: number; right: number } | null
  shell: { left: number; right: number } | null
  canvas: { left: number; right: number; width: number; height: number } | null
  viewport: number
}

/**
 * The audit reads the SHELL's own landmarks rather than guessing which block
 * is the content: `MapSplit` marks its three parts (`data-map-shell`,
 * `data-map-content`, `data-map-panel`) and the guard wizard's step 1, which
 * predates the shell and keeps its own, marks the same three. Guessing from
 * geometry is what produced two false failures on the first run — a floating
 * legend inside the map counts as "content to the right of the map" to any
 * heuristic naive enough to be worth writing.
 */
const probe = (): Probe => {
  const vw = window.innerWidth
  const rect = (el: Element | null) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right }
  }

  const canvasEl = [...document.querySelectorAll('.maplibregl-map')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 40 && r.height > 40
    })
    .sort((a, b) => {
      const ra = a.getBoundingClientRect()
      const rb = b.getBoundingClientRect()
      return rb.width * rb.height - ra.width * ra.height
    })[0]

  const c = canvasEl ? canvasEl.getBoundingClientRect() : null

  return {
    hasMap: Boolean(canvasEl),
    panel: rect(document.querySelector('[data-map-panel]')),
    content: rect(document.querySelector('[data-map-content]')),
    shell: rect(document.querySelector('[data-map-shell]')),
    canvas: c
      ? { left: c.left, right: c.right, width: c.width, height: c.height }
      : null,
    viewport: vw,
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: VIEWPORT,
  locale: 'he-IL',
  permissions: ['geolocation'],
  geolocation: { latitude: 31.0611, longitude: 34.6552 },
})
const page = await context.newPage()
page.setDefaultNavigationTimeout(120_000)
page.setDefaultTimeout(60_000)

let failures = 0
let checks = 0

console.log('')
console.log(
  `A64 — map-first audit at ${VIEWPORT.width}×${VIEWPORT.height} (iPad landscape, he-IL) — ${ROUTES.length} screens`,
)
console.log(
  `  ${'screen'.padEnd(20)} ${'map'.padStart(5)} ${'left'.padStart(6)} ${'right'.padStart(6)}  result`,
)
console.log(`  ${'-'.repeat(72)}`)

for (const route of ROUTES) {
  await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForSelector('select', { state: 'attached' })
  await page.selectOption('select', route.session ?? 'coordinator')
  // Every screen starts from the DEFAULT map mode: a remembered `full` from a
  // previous route would hide the very content column this audit compares to.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('lo-yanum:map-mode:')) localStorage.removeItem(k)
    }
  })
  await page.waitForTimeout(200)

  await page.evaluate((h) => {
    window.location.hash = h
  }, route.hash)
  await page.waitForTimeout(1200)
  if (route.setup) await route.setup(page)
  // A map that has not finished laying out has no rectangle to audit, and a
  // flat timeout is a race the CI machine loses first.
  if (!route.expectNoMap) {
    await page
      .waitForSelector('.maplibregl-map', { state: 'attached', timeout: 20_000 })
      .catch(() => undefined)
  }
  await page.waitForTimeout(2500)

  const r = (await page.evaluate(probe)) as Probe
  checks++

  const problems: string[] = []

  if (!r.hasMap) {
    if (!route.expectNoMap) {
      problems.push('no map found — expected one, or declare `expectNoMap`')
    }
  } else if (route.expectNoMap) {
    problems.push(`a map appeared on a screen declared map-less (${route.expectNoMap})`)
  } else if (!route.stackedOnPurpose) {
    const panel = r.panel
    const content = r.content
    const shell = r.shell
    if (!panel || !content || !shell) {
      problems.push(
        'the screen has a map but not the map-first landmarks (data-map-shell / -content / -panel)',
      )
    } else {
      // 1. The map column starts at the shell's own start edge.
      if (panel.left - shell.left > 8) {
        problems.push(
          `map panel starts ${Math.round(panel.left - shell.left)}px inside the shell — it is not the left column`,
        )
      }
      // 2. Its centre is left of the shell's centre.
      const centre = (panel.left + panel.right) / 2
      const shellCentre = (shell.left + shell.right) / 2
      if (centre >= shellCentre) {
        problems.push(
          `map centre ${Math.round(centre)}px is not left of the shell centre ${Math.round(shellCentre)}px`,
        )
      }
      // 3. The content column really is to its RIGHT — the half a "map is left
      //    of centre" check misses when the map is full width.
      if (content.left < panel.right - 8) {
        problems.push(
          `content starts at ${Math.round(content.left)}px, inside the map panel (ends ${Math.round(panel.right)}px)`,
        )
      }
    }
  }

  const ok = problems.length === 0
  if (!ok) failures++

  console.log(
    `  ${route.name.padEnd(20)} ${(r.hasMap ? 'yes' : 'no').padStart(5)} ${(r.panel
      ? String(Math.round(r.panel.left))
      : '—'
    ).padStart(6)} ${(r.panel ? String(Math.round(r.panel.right)) : '—').padStart(6)}  ${
      ok ? 'PASS' : 'FAIL'
    }`,
  )
  if (route.expectNoMap && ok) console.log(`      no map by design: ${route.expectNoMap}`)
  if (route.stackedOnPurpose && ok) console.log(`      stacked by design: ${route.stackedOnPurpose}`)
  for (const p of problems) console.log(`      ${p}`)
}

await context.close()
await browser.close()

console.log('')
if (failures === 0) {
  console.log(
    `  All ${checks} screens audited: every map is on the physical LEFT, or its exemption is printed above.`,
  )
} else {
  console.log(`  ${failures} of ${checks} screens FAILED the map-first rule.`)
  process.exit(1)
}
