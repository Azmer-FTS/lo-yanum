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

/**
 * G11/G12 — THE SWEEP IS NOT PHONE-ONLY ANY MORE.
 *
 * 390 px is where a layout breaks most obviously, and it was the only width
 * this ran at for three lots. But the product owner's instrument is a 13" iPad
 * Pro, and its two orientations are the widths this app is actually used at:
 * 1032 portrait is the narrowest place the two-column gabarits still have to
 * work (which is why the farm detail's second column starts at `xl`/1280, not
 * at `lg`), and 1376 landscape is where a sticky block has the most room to
 * get pinned over something.
 *
 *   VIEWPORT=phone   390 × 844   — the original sweep, still the default
 *   VIEWPORT=ipad    1032 × 1376 — iPad Pro 13" PORTRAIT
 *   VIEWPORT=ipad-ls 1376 × 1032 — iPad Pro 13" LANDSCAPE
 *   VIEWPORT=iphone  402 × 874   — iPhone 16 Pro, the second device
 *   VIEWPORT=all     runs all four in sequence
 *
 * A30's screenful cap is width-dependent by nature — the same page is fewer
 * screenfuls on a taller viewport — so the limit travels with the viewport
 * rather than being one global number.
 */
const VIEWPORTS = {
  phone: { width: 390, height: 844, maxScreenfuls: 6 },
  iphone: { width: 402, height: 874, maxScreenfuls: 6 },
  ipad: { width: 1032, height: 1376, maxScreenfuls: 5 },
  'ipad-ls': { width: 1376, height: 1032, maxScreenfuls: 6 },
} as const

type ViewportName = keyof typeof VIEWPORTS

const REQUESTED = (process.env.VIEWPORT ?? 'phone') as ViewportName | 'all'
const RUNS: ViewportName[] =
  REQUESTED === 'all'
    ? (Object.keys(VIEWPORTS) as ViewportName[])
    : [REQUESTED in VIEWPORTS ? (REQUESTED as ViewportName) : 'phone']

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
  {
    name: 'volunteers',
    hash: '#/coordinator/volunteers',
    // G7 — the roster is a WINDOW-virtualised table: the page is the scroll
    // surface by design, and its height is the roster's 300 rows. The spirit
    // of A30 (no unbounded DOM) survives in the virtualiser: ~25 DOM rows
    // however long the list.
    tallOnPurpose:
      'G7 window-virtualised table — the page is the scroll surface; DOM rows stay bounded',
  },
  { name: 'drivers', hash: '#/coordinator/drivers' },
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

  /**
   * Only VIEWPORT-pinned elements can overlap without the page scrolling them
   * apart — and "sticky" alone does not mean viewport-pinned.
   *
   * A sticky `<th>` inside a `.table-scroll` box is pinned to THAT BOX: it
   * moves with the page like everything else, so scrolling separates it from
   * the demo toolbar exactly as it separates any two ordinary elements. The
   * iPad sweep caught this as a false positive on the mission detail, where
   * the presence matrix's own header happened to land under the toolbar at
   * 402×874 and nowhere else — a coincidence of one viewport height, not a
   * defect.
   *
   * So an element is only a candidate if NOTHING between it and the document
   * establishes a scroll container. That is the CSS rule itself — `sticky`
   * resolves against the nearest scrolling ancestor — and it is deliberately
   * NOT conditional on whether that ancestor currently overflows: a
   * `.table-scroll` holding three rows today holds thirty tomorrow, and a
   * layout gate whose verdict depends on how much data happens to be in the
   * fixtures is not a gate.
   *
   * The volunteers roster's column header stays in scope: G7 made the WINDOW
   * its scroll container, so it really is pinned to the viewport at
   * `--shell-top`. That is the case this check exists for.
   */
  const boxPinned = (el: Element): boolean => {
    let node = el.parentElement
    while (node && node !== document.body && node !== document.documentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return true
      node = node.parentElement
    }
    return false
  }

  const pinned = [...document.querySelectorAll('body *')].filter((el) => {
    const pos = getComputedStyle(el).position
    if (pos !== 'fixed' && pos !== 'sticky') return false
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    return pos === 'fixed' || !boxPinned(el)
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
 * The screenful cap lives on each VIEWPORT (see the table at the top), because
 * the same page is fewer screenfuls on a taller device and one global number
 * would either be slack on a phone or wrong on an iPad.
 *
 * It is generous on purpose — a detail screen legitimately runs long, and the
 * failure this catches is the other kind: a page whose length is a function of
 * how many rows happen to exist, where the screen's own sticky footer ends up
 * far below the fold. Before F5.5 the import preview rendered every row of the
 * file, so its height was whatever the coordinator happened to upload.
 */
const browser = await chromium.launch()

let failures = 0

for (const name of RUNS) {
  const vp = VIEWPORTS[name]
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: 'he-IL',
    permissions: ['geolocation'],
    geolocation: { latitude: 31.0611, longitude: 34.6552 },
  })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(120_000)
  page.setDefaultTimeout(60_000)

  console.log('')
  console.log(
    `Layout sweep at ${vp.width}×${vp.height} (${name}) — ${ROUTES.length} screens`,
  )
  console.log(
    `  ${'screen'.padEnd(20)} ${'scrollW'.padStart(8)} ${'screens'.padStart(8)}  result`,
  )
  console.log(`  ${'-'.repeat(62)}`)

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
      report.heightRatio > vp.maxScreenfuls && !route.tallOnPurpose
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
        `      A30 page is ${report.heightRatio.toFixed(1)} screenfuls (max ${vp.maxScreenfuls})`,
      )
    }
    if (route.tallOnPurpose && report.heightRatio > vp.maxScreenfuls) {
      console.log(`      A30 exempt: ${route.tallOnPurpose}`)
    }
  }

  await context.close()
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
