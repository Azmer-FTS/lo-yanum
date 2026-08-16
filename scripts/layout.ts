import { chromium } from 'playwright'

/**
 * A24 — systematic 390 px overlap sweep.
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
const ROUTES: Array<{ name: string; hash: string; session?: string }> = [
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
  { name: 'styleguide', hash: '#/styleguide' },
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

  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: vw,
    wide,
    collisions,
  }
}

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
console.log(`  ${'screen'.padEnd(20)} ${'scrollW'.padStart(8)}  result`)
console.log(`  ${'-'.repeat(62)}`)

let failures = 0

await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'networkidle' })

for (const route of ROUTES) {
  // Pick the identity through the dev toolbar, exactly as a user would.
  await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'networkidle' })
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
  const ok = !overflow && report.wide.length === 0 && report.collisions.length === 0
  if (!ok) failures++

  console.log(
    `  ${route.name.padEnd(20)} ${String(report.scrollWidth).padStart(8)}  ${
      ok ? 'PASS' : 'FAIL'
    }`,
  )
  for (const w of report.wide) {
    console.log(`      wider than viewport: ${w.tag} (${w.width}px)`)
  }
  for (const c of report.collisions) {
    console.log(`      pinned overlap: ${c.a}  ×  ${c.b}`)
  }
}

await browser.close()

console.log('')
if (failures > 0) {
  console.log(`  ${failures} screen(s) FAILED.`)
  process.exit(1)
}
console.log('  No overflow and no pinned-element overlap on any screen.')
