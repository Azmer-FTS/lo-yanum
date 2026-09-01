import { chromium, webkit } from 'playwright'
import type { Browser, BrowserType, Page } from 'playwright'

/**
 * A86 — NO MAP CONTROL COVERS ANOTHER ONE.
 *
 *   bun run overlap
 *   ENGINE=webkit bun run overlap        (Safari's engine — every browser on his iPad)
 *   VIEWPORT=ipad bun run overlap
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY `bun run layout` DID NOT CATCH THIS, AND THAT IS THE POINT OF THE FILE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A24/A30 sweeps 32 routes at four viewports and refuses two pinned bars that
 * cover each other. It passed the whole time the product owner was looking at
 * a fullscreen button sitting on top of the ground switch, and it was right
 * to: its collision test is deliberately restricted to **viewport-pinned**
 * elements, because those are the only ones the page cannot scroll apart.
 *
 * The map's controls are not viewport-pinned. They are absolutely positioned
 * inside the map container — four independent owners of one corner:
 * MapLibre's navigation control, the ground switch, a floating "מסך מלא"
 * button whose `self-end` resolves to the PHYSICAL LEFT in this RTL document,
 * and a wrapping row of five drawing buttons. Nothing in the suite had
 * standing to look at them.
 *
 * ★ SO THIS GATE'S FRAME OF REFERENCE IS THE MAP, NOT THE VIEWPORT. It finds
 *   every interactive element inside every `role="application"` map container,
 *   and fails on any pair whose rectangles intersect by more than 2 px. It
 *   also enforces the 44 px floor on the control stack, because a stack of
 *   29 px buttons is the other way this corner goes wrong.
 *
 * ⚠️ ANCESTORS AND DESCENDANTS ARE NOT COLLISIONS, obviously, and neither are
 *    two children of the same wrapping row — a `flex-wrap` row's own children
 *    cannot overlap by construction, and treating a button's 2 px of
 *    sub-pixel neighbour contact as a fault would make this gate noise. The
 *    test is between elements in DIFFERENT overlay groups, which is exactly
 *    the failure that was shipped.
 */

const BASE_ENV = process.env.BASE_URL
const PORT = Number(process.env.OVERLAP_PORT ?? 5195)
const OUT_DIR = 'dist-overlap'
const SHOTS = 'docs/screenshots/overlap'

interface Viewport {
  name: string
  width: number
  height: number
}

/**
 * The four the product owner named, and they are the four `bun run layout`
 * already sweeps — same numbers, so a regression reported here is reported in
 * the same words there.
 */
const VIEWPORTS: Viewport[] = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'iphone', width: 402, height: 874 },
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
]

/** Every screen that carries a real, driven map. */
const ROUTES: { name: string; hash: string; wait?: number }[] = [
  { name: 'farms', hash: '#/coordinator/farms' },
  { name: 'farm-detail', hash: '#/coordinator/farms/farm-01' },
  { name: 'farm-form-new', hash: '#/coordinator/farms/new' },
  { name: 'anchor-form', hash: '#/coordinator/farms/farm-01/anchors/anchor-01/edit' },
  { name: 'route-planner', hash: '#/coordinator/route' },
  { name: 'missions', hash: '#/coordinator/missions' },
  { name: 'mission-detail', hash: '#/coordinator/missions/mission-01' },
  { name: 'incidents', hash: '#/coordinator/incidents' },
  { name: 'dashboard', hash: '#/coordinator' },
]

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

interface Collision {
  a: string
  b: string
  x: number
  y: number
}

interface Report {
  maps: number
  controls: number
  collisions: Collision[]
  /** Buttons in the control stack under the 44 px floor. */
  small: string[]
  stack: boolean
}

async function audit(page: Page): Promise<Report> {
  return page.evaluate(() => {
    /** A short, human name for an element, for the failure line. */
    const label = (el: Element): string => {
      const id = (el as HTMLElement).dataset?.testid
      if (id) return `[${id}]`
      const aria = el.getAttribute('aria-label')
      if (aria) return `"${aria}"`
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)
      return text ? `${el.tagName.toLowerCase()}:${text}` : el.tagName.toLowerCase()
    }

    const maps = [...document.querySelectorAll('[role="application"]')]
    const collisions: { a: string; b: string; x: number; y: number }[] = []
    const small: string[] = []
    let counted = 0
    let stack = false

    for (const map of maps) {
      const box = map.getBoundingClientRect()
      if (box.width < 120 || box.height < 120) continue

      /**
       * ★ EVERYTHING INTERACTIVE THAT IS DRAWN OVER THIS MAP, wherever it
       *   lives in the tree. The controls are inside the container; the
       *   screen's own overlays and the bottom bar are SIBLINGS of it, drawn
       *   on top. Both can collide with the stack, so both are collected — by
       *   geometry rather than by ancestry, which is the only way to catch an
       *   overlay that was never meant to be near the map at all.
       */
      const scope = map.parentElement ?? document.body
      const candidates = [...scope.querySelectorAll('button, a[href], [role="slider"]')]
      const over: { el: Element; rect: DOMRect; group: Element | null }[] = []

      for (const el of candidates) {
        /**
         * ⚠️ MAP MARKERS ARE CONTENT, NOT CONTROLS, AND THE DISTINCTION IS THE
         *    ONLY REASON THIS GATE CAN BE A HARD ONE. A pin is positioned by
         *    its coordinates: it slides under any overlay the moment the
         *    operator pans, and it will always be possible to place one under
         *    a bar. Demanding that no control ever covers a pin would demand a
         *    map with no overlays at all.
         *
         *    What the product owner reported is a different thing entirely —
         *    controls laid on top of each other, permanently, at a fixed
         *    corner, where no gesture moves them apart. That is what is
         *    checked, and it is checked without mercy.
         */
        if (el.closest('.maplibregl-marker')) continue
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        if (style.pointerEvents === 'none') continue
        // Only what is actually ON the map.
        const insideX = rect.left >= box.left - 4 && rect.right <= box.right + 4
        const insideY = rect.top >= box.top - 4 && rect.bottom <= box.bottom + 4
        if (!insideX || !insideY) continue

        /**
         * The GROUP is the nearest positioned ancestor that is an overlay: two
         * buttons in the same row are laid out by that row and cannot overlap;
         * two buttons in different rows are two owners of the same space,
         * which is the thing being tested.
         */
        let group: Element | null = el.parentElement
        while (
          group &&
          group !== scope &&
          getComputedStyle(group).position === 'static'
        ) {
          group = group.parentElement
        }
        over.push({ el, rect, group })
        counted++
      }

      const toolStack = map.querySelector('[data-testid="map-tools"]')
      if (toolStack) {
        stack = true
        for (const button of toolStack.querySelectorAll('button')) {
          const r = button.getBoundingClientRect()
          if (r.width < 43.5 || r.height < 43.5) {
            small.push(`${label(button)} ${Math.round(r.width)}×${Math.round(r.height)}`)
          }
        }
      }

      for (let i = 0; i < over.length; i++) {
        for (let j = i + 1; j < over.length; j++) {
          const a = over[i]
          const b = over[j]
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue
          if (a.group !== null && a.group === b.group) continue
          const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
          const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
          if (x > 2 && y > 2) {
            collisions.push({
              a: label(a.el),
              b: label(b.el),
              x: Math.round(x),
              y: Math.round(y),
            })
          }
        }
      }
    }

    return { maps: maps.length, controls: counted, collisions, small, stack }
  })
}

const engineName = (process.env.ENGINE ?? 'chromium').toLowerCase()
const engine: BrowserType = engineName === 'webkit' ? webkit : chromium

console.log('')
console.log('  A86 — NO MAP CONTROL COVERS ANOTHER ONE')
console.log('  =======================================')
console.log(`  engine: ${engineName}`)

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
let serve: ReturnType<typeof Bun.spawn> | null = null
let base = BASE_ENV ?? ''

if (!BASE_ENV) {
  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT_DIR], {
    env,
    stdout: 'ignore',
    stderr: 'pipe',
  })
  if ((await build.exited) !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error('vite build failed')
  }
  serve = Bun.spawn(
    ['bun', 'x', 'vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'],
    { env, stdout: 'ignore', stderr: 'ignore' },
  )
  base = `http://localhost:${PORT}`
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

const wanted = process.env.VIEWPORT
const viewports =
  wanted && wanted !== 'all'
    ? VIEWPORTS.filter((v) => v.name === wanted)
    : VIEWPORTS

let browser: Browser | null = null
try {
  browser = await engine.launch()
  await Bun.$`mkdir -p ${SHOTS}`.quiet()

  for (const viewport of viewports) {
    console.log('')
    console.log(`  ${viewport.name} — ${viewport.width}×${viewport.height}`)
    console.log(`  ${'-'.repeat(viewport.name.length + 14)}`)

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: 'he-IL',
    })
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)

    for (const route of ROUTES) {
      await page.goto(`${base}/${route.hash}`, { waitUntil: 'load' })
      // The map is lazily imported and MapLibre needs a frame or two to lay
      // its controls out; auditing before that measures an empty corner.
      await page.waitForTimeout(route.wait ?? 3500)

      const report = await audit(page)
      if (report.maps === 0) {
        check(`${route.name}: has a map to audit`, false, 'no [role="application"] found')
        continue
      }

      check(
        `${route.name}: no control covers another (${report.controls} on the map)`,
        report.collisions.length === 0,
        report.collisions
          .slice(0, 4)
          .map((c) => `${c.a} × ${c.b} (${c.x}×${c.y}px)`)
          .join(' | '),
      )

      if (report.stack) {
        check(
          `${route.name}: every control-stack button is at least 44 px`,
          report.small.length === 0,
          report.small.join(', '),
        )
      }

      if (report.collisions.length > 0) {
        await page.screenshot({
          path: `${SHOTS}/${viewport.name}-${route.name}-collision.png`,
        })
      }
    }

    // One capture per viewport of the screen the report was about.
    await page.goto(`${base}/#/coordinator/farms/farm-01`, { waitUntil: 'load' })
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `${SHOTS}/${viewport.name}-farm-detail.png` })
    await context.close()
  }
} finally {
  await browser?.close()
  serve?.kill()
}

console.log('')
console.log('  VERDICT')
console.log('  -------')
console.log(`  ${passed} passed, ${failed} failed`)
console.log(`  captures: ${SHOTS}/`)
console.log('')
if (failed > 0) process.exit(1)
