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
  /**
   * ★★ Y3.2 — WHETHER THIS DEVICE HAS A FINGER OR A MOUSE, AND IT IS THE
   *    DECIDING FACT OF THE ZOOM CHECK BELOW.
   *
   *    The product owner asked for the zoom pair to go from "tablette et
   *    téléphone" and to stay on "desktop avec souris". An iPad in landscape
   *    is 1376 CSS px wide — WIDER than most laptops — so a width test alone
   *    keeps the buttons on exactly the device he asked to have them removed
   *    from, and a gate that only varies the width would prove the rule on
   *    the two cases it is not about.
   *
   *    `hasTouch` sets `pointer: coarse` in Chromium AND WebKit (measured),
   *    which is the media query the app actually branches on. So the sweep
   *    now carries a real fourth case: wide, and touched.
   */
  touch: boolean
}

/**
 * The four the product owner named, and they are the four `bun run layout`
 * already sweeps — same numbers, so a regression reported here is reported in
 * the same words there.
 */
const VIEWPORTS: Viewport[] = [
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'iphone', width: 402, height: 874, touch: true },
  { name: 'ipad', width: 1032, height: 1376, touch: true },
  { name: 'ipad-ls', width: 1376, height: 1032, touch: true },
  /** The one case the zoom pair is meant to survive on. */
  { name: 'desktop', width: 1440, height: 900, touch: false },
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
          /**
           * ⚠️ Y3.2 — A BUTTON THAT IS NOT DRAWN IS NOT A SMALL BUTTON. The
           *    zoom pair is `display: none` on a coarse pointer (the product
           *    owner's iPad and phone, where pinch is the gesture), so it
           *    measures 0×0 there — and the first run after that change
           *    reported nine screens as having a 0×0 tap target, which is a
           *    gate describing the absence of a control as a defect of it.
           *    Whether the pair is present at all is `zoomShown` below; this
           *    check is about the size of what IS on the rail.
           */
          if (r.width === 0 && r.height === 0) continue
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

    /**
     * ★ X3.1 (2026-09-04) — THE FLOATS ARE MEASURED, NOT TRUSTED.
     *
     * The product owner's report was "the + sticks out to the right", and it
     * was true to the pixel: MapLibre's control margin is 10 px, the mode
     * pill was at 12 px and the "+" at 16 px with a 56 px button against the
     * others' 52 px. Nothing in the app said those three numbers had to
     * agree, so they drifted. `--map-rail` / `--map-rail-w` (index.css) are
     * the single offset and the single width now, and this is what stops the
     * next float from inventing a fourth.
     *
     * ★★ Y3.3 (2026-09-04) — AND THERE ARE TWO GEOMETRIES NOW, NOT ONE.
     *
     *    "Les trois boutons de mode passent EN BAS, à l'HORIZONTALE, à côté
     *    du bouton '+', dans le même langage visuel."
     *
     *    So the mode pill has LEFT the vertical rail on purpose, and a gate
     *    that goes on asserting one axis for all three would fail the change
     *    the product owner asked for — which is worse than not checking, as it
     *    teaches the next person to delete the check. The invariant X3.1 was
     *    protecting is not "one axis"; it is "nothing here is a number
     *    somebody typed". That splits cleanly in two:
     *
     *      rail    the vertical stack — the map tools and the "+" — still
     *              share one physical left edge and one width.
     *      bottom  the horizontal band — the "+" and the mode pill — share one
     *              bottom edge and one height, and the pill starts exactly one
     *              `--map-rail` past the "+"'s far edge, which is the same gap
     *              the rail keeps from every other edge.
     */
    const box = (id: string): { name: string; left: number; right: number; width: number; bottom: number; height: number } | null => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      if (r.width === 0) return null
      return {
        name: id,
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
      }
    }

    const rail = ['map-tools', 'action-fab-toggle']
      .map(box)
      .filter((b): b is NonNullable<typeof b> => b !== null)
    const bottom = ['action-fab-toggle', 'map-mode-pill']
      .map(box)
      .filter((b): b is NonNullable<typeof b> => b !== null)
    /**
     * ⚠️ MEASURED, NOT PARSED. `--map-rail` is declared in `rem`, and
     *    `parseFloat('0.75rem')` is 0.75 — which this check duly compared
     *    against a 12 px gap and failed, on a layout that was correct. A
     *    custom property is a STRING until something lays it out, so the gap
     *    is read off an element the browser has actually laid out with it.
     */
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--map-rail)'
    document.body.append(probe)
    const railGap = Math.round(probe.getBoundingClientRect().width)
    probe.remove()

    /**
     * ★★ Y3.2 — IS THE ZOOM PAIR ON THE RAIL, AND SHOULD IT BE?
     *
     *    "SUPPRIMER les boutons zoom +/− sur tablette et téléphone (le
     *    pincement suffit). Les conserver uniquement sur desktop avec souris."
     *
     *    Reported as two facts rather than one verdict, so a failure says
     *    which half is wrong: what the browser IS, and what the rail SHOWS.
     */
    const zoomShown = ['map-tool-zoom-in', 'map-tool-zoom-out'].every((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const finePointer = window.matchMedia('(pointer: fine)').matches
    const wideWindow = window.matchMedia('(min-width: 64rem)').matches

    return {
      maps: maps.length,
      controls: counted,
      collisions,
      small,
      stack,
      rail,
      bottom,
      railGap,
      zoomShown,
      finePointer,
      wideWindow,
    }
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
    console.log(
      `  ${viewport.name} — ${viewport.width}×${viewport.height}, ${viewport.touch ? 'touch' : 'mouse'}`,
    )
    console.log(`  ${'-'.repeat(viewport.name.length + 14)}`)

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: 'he-IL',
      hasTouch: viewport.touch,
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

      if (report.rail.length > 1) {
        const lefts = new Set(report.rail.map((r) => r.left))
        const widths = new Set(report.rail.map((r) => r.width))
        check(
          `${route.name}: the vertical rail is one axis, one width`,
          lefts.size === 1 && widths.size === 1,
          report.rail.map((r) => `${r.name} @${r.left} w${r.width}`).join(' | '),
        )
      }

      /**
       * ★★ Y3.2 — the zoom pair, exactly where the product owner asked for it
       *    and nowhere else.
       */
      if (report.stack) {
        const shouldShow = report.finePointer && report.wideWindow
        check(
          `${route.name}: the zoom pair is ${shouldShow ? 'ON the rail (mouse, wide window)' : 'OFF the rail (touch or narrow)'}`,
          report.zoomShown === shouldShow,
          `pointer ${report.finePointer ? 'fine' : 'coarse'}, window ${report.wideWindow ? '≥64rem' : '<64rem'}, drawn ${report.zoomShown}`,
        )
      }

      /**
       * ★★ Y3.3 — the bottom band: one line, one height, one gap. The gap is
       *    read from `--map-rail` rather than typed here, for the same reason
       *    X3.1 stopped typing the offset.
       */
      if (report.bottom.length > 1) {
        const [fab, pill] = report.bottom
        const sameLine = Math.abs(fab.bottom - pill.bottom) <= 1
        const sameHeight = Math.abs(fab.height - pill.height) <= 1
        const gap = pill.left - fab.right
        check(
          `${route.name}: the mode pill sits BESIDE the "+", on its line`,
          sameLine && sameHeight && Math.abs(gap - report.railGap) <= 1,
          `+ bottom ${fab.bottom} h${fab.height} right ${fab.right} | pill bottom ${pill.bottom} h${pill.height} left ${pill.left} — gap ${gap}px, rail gap ${report.railGap}px`,
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
