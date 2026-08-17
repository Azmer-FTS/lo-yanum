import { chromium } from 'playwright'

/**
 * A24 + A30 — systematic 390 px sweep.
 *
 * Walks every screen at phone width and asserts three things that a human
 * eyeballing screenshots reliably misses:
 *
 *   1. NO HORIZONTAL OVERFLOW. `scrollWidth > innerWidth` means something is
 *      wider than the phone — the single most common cause of "the layout is
 *      broken on my phone".
 *   2. NO ELEMENT WIDER THAN THE VIEWPORT, reported by name, so an overflow is
 *      traceable to the component that caused it rather than to the page.
 *   3. NO STICKY/FIXED BAR COVERING ANOTHER. Two elements pinned to the bottom
 *      of the screen look fine in isolation and hide each other in place; this
 *      compares their rectangles directly.
 *
 * Run against a live dev server:
 *   BASE_URL=http://localhost:5173 bun run layout
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const WIDTH = 390
const HEIGHT = 844

/** Every screen a coordinator or a field user can reach. */
const ROUTES: Array<{
  name: string
  hash: string
  session?: string
  /**
   * A30 exemption, with its reason printed in the run so it can never be a
   * silent cap. Only one screen qualifies and only one ever should: a page
   * whose PURPOSE is to be an exhaustive catalogue is long because of what it
   * is, not because a list escaped its container. Every other screen is held to
   * the limit, including the ones that legitimately run to four screenfuls.
   */
  tallOnPurpose?: string
}> = [
  { name: 'dashboard', hash: '#/coordinator' },
  { name: 'agenda', hash: '#/coordinator/agenda' },
  { name: 'farms', hash: '#/coordinator/farms' },
  { name: 'farm-detail', hash: '#/coordinator/farms/farm-01' },
  { name: 'farm-form', hash: '#/coordinator/farms/farm-01/edit' },
  { name: 'anchor-sheet', hash: '#/coordinator/farms/farm-01/anchors/anchor-01' },
  { name: 'route-planner', hash: '#/coordinator/route' },
  { name: 'volunteers', hash: '#/coordinator/volunteers' },
  { name: 'import', hash: '#/coordinator/volunteers/import' },
  { name: 'missions', hash: '#/coordinator/missions' },
  { name: 'mission-wizard', hash: '#/coordinator/missions/new' },
  { name: 'mission-detail', hash: '#/coordinator/missions/mission-01' },
  { name: 'incidents', hash: '#/coordinator/incidents' },
  { name: 'incident-detail', hash: '#/coordinator/incidents/inc-01' },
  {
    name: 'styleguide',
    hash: '#/styleguide',
    tallOnPurpose: 'a token catalogue is meant to be scrolled end to end',
  },
  { name: 'farmer-tonight', hash: '#/farmer', session: 'farmer:contact-01a' },
  { name: 'farmer-guards', hash: '#/farmer/guards', session: 'farmer:contact-01a' },
  { name: 'farmer-report', hash: '#/farmer/report', session: 'farmer:contact-01a' },
  { name: 'volunteer-guard', hash: '#/volunteer', session: 'volunteer:vol-001' },
  { name: 'volunteer-roster', hash: '#/volunteer/roster', session: 'volunteer:vol-001' },
  { name: 'volunteer-report', hash: '#/volunteer/report', session: 'volunteer:vol-001' },
  { name: 'driver-trip', hash: '#/driver', session: 'driver:drv-03' },
]

interface Report {
  scrollWidth: number
  innerWidth: number
  wide: Array<{ tag: string; cls: string; width: number }>
  collisions: Array<{ a: string; b: string }>
  /** A30 — page height as a multiple of the viewport. */
  heightRatio: number
  /** A30 — long tables/lists with no bounded scroll container above them. */
  uncontained: Array<{ tag: string; rows: number }>
}

/**
 * Runs IN THE PAGE. Anything it needs must be inlined — it has no access to
 * this module's scope.
 */
function audit(): Report {
  const label = (el: Element): string =>
    `${el.tagName.toLowerCase()}.${(el.className || '')
      .toString()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join('.')}`

  const vw = window.innerWidth

  const wide = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      // 1 px of slack absorbs sub-pixel rounding on fractional layouts.
      return r.width > vw + 1 && r.height > 0
    })
    .map((el) => ({
      tag: label(el),
      cls: (el.className || '').toString().slice(0, 80),
      width: Math.round(el.getBoundingClientRect().width),
    }))
    .slice(0, 6)

  // Only PINNED elements can overlap without the page scrolling them apart.
  const pinned = [...document.querySelectorAll('body *')].filter((el) => {
    const pos = getComputedStyle(el).position
    if (pos !== 'fixed' && pos !== 'sticky') return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })

  const collisions: Array<{ a: string; b: string }> = []
  for (let i = 0; i < pinned.length; i++) {
    for (let j = i + 1; j < pinned.length; j++) {
      const a = pinned[i]
      const b = pinned[j]
      // A parent and its own pinned child are not a collision.
      if (a.contains(b) || b.contains(a)) continue
      const ra = a.getBoundingClientRect()
      const rb = b.getBoundingClientRect()
      const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
      const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (overlapX > 2 && overlapY > 2) {
        collisions.push({ a: label(a), b: label(b) })
      }
    }
  }

  /**
   * A30 — A TABLE OR LIST MUST NOT BE THE THING THAT SETS THE PAGE HEIGHT.
   *
   * Walks up from every table and every list past 20 rows looking for an
   * ancestor that actually scrolls — `overflow-y: auto|scroll` AND a content
   * height greater than its own box. The second half matters: a container with
   * `overflow-y:auto` and no height limit does not scroll, it grows, and it
   * would otherwise satisfy a naive check while the page still stretched.
   */
  const uncontained = [...document.querySelectorAll('table, ul, ol')]
    .filter((el) => {
      const rows =
        el.tagName === 'TABLE'
          ? el.querySelectorAll('tbody tr').length
          : el.children.length
      if (rows <= 20) return false
      let p: HTMLElement | null = el.parentElement
      while (p && p !== document.body) {
        const cs = getComputedStyle(p)
        const scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll'
        if (scrolls && p.scrollHeight > p.clientHeight + 4) return false
        p = p.parentElement
      }
      return true
    })
    .map((el) => ({
      tag: label(el),
      rows:
        el.tagName === 'TABLE'
          ? el.querySelectorAll('tbody tr').length
          : el.children.length,
    }))

  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: vw,
    wide,
    collisions,
    heightRatio:
      document.documentElement.scrollHeight / Math.max(1, window.innerHeight),
    uncontained,
  }
}

/**
 * How many screenfuls a page may be before it counts as "stretched".
 *
 * Six is generous on purpose — a detail screen legitimately runs long, and the
 * failure this catches is the other kind: a page whose length is a function of
 * how many rows happen to exist, where the screen's own sticky footer ends up
 * far below the fold. Before F5.5 the import preview rendered every row of the
 * file, so its height was whatever the coordinator happened to upload.
 */
const MAX_SCREENFULS = 6

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  locale: 'he-IL',
  permissions: ['geolocation'],
  geolocation: { latitude: 31.0611, longitude: 34.6552 },
})
const page = await context.newPage()
page.setDefaultNavigationTimeout(120_000)
page.setDefaultTimeout(60_000)

console.log(`Layout sweep at ${WIDTH} px — ${ROUTES.length} screens`)
console.log(
  `  ${'screen'.padEnd(20)} ${'scrollW'.padStart(8)} ${'screens'.padStart(8)}  result`,
)
console.log(`  ${'-'.repeat(62)}`)

let failures = 0

await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })

for (const route of ROUTES) {
  // Pick the identity through the dev toolbar, exactly as a user would.
  await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForSelector('select', { state: 'attached' })
  await page.selectOption('select', route.session ?? 'coordinator')
  await page.waitForTimeout(300)

  await page.evaluate((h) => {
    window.location.hash = h
  }, route.hash)
  // Map screens need real settle time before their canvas has a size.
  await page.waitForTimeout(3000)

  const report = (await page.evaluate(audit)) as Report
  const overflow = report.scrollWidth > report.innerWidth + 1
  const tooTall =
    report.heightRatio > MAX_SCREENFULS && !route.tallOnPurpose
  const ok =
    !overflow &&
    !tooTall &&
    report.wide.length === 0 &&
    report.collisions.length === 0 &&
    report.uncontained.length === 0
  if (!ok) failures++

  console.log(
    `  ${route.name.padEnd(20)} ${String(report.scrollWidth).padStart(8)} ${report.heightRatio
      .toFixed(1)
      .padStart(8)}  ${ok ? 'PASS' : 'FAIL'}`,
  )
  for (const w of report.wide) {
    console.log(`      wider than viewport: ${w.tag} (${w.width}px)`)
  }
  for (const c of report.collisions) {
    console.log(`      pinned overlap: ${c.a}  ×  ${c.b}`)
  }
  for (const u of report.uncontained) {
    console.log(`      A30 uncontained list: ${u.tag} (${u.rows} rows)`)
  }
  if (tooTall) {
    console.log(
      `      A30 page is ${report.heightRatio.toFixed(1)} screenfuls (max ${MAX_SCREENFULS})`,
    )
  }
  if (route.tallOnPurpose && report.heightRatio > MAX_SCREENFULS) {
    console.log(`      A30 exempt: ${route.tallOnPurpose}`)
  }
}

await browser.close()

console.log('')
if (failures > 0) {
  console.log(`  ${failures} screen(s) FAILED.`)
  process.exit(1)
}
console.log(
  '  No overflow, no pinned-element overlap, no uncontained list (A24 + A30).',
)
