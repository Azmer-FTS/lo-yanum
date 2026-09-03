import { chromium, webkit } from 'playwright'
import type { Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * A24 + A30 — systematic 390 px sweep.
 *
 * Walks every screen at phone width and asserts three things that a human
 * eyeballing screenshots reliably misses:
 *
 *   1. NO HORIZONTAL OVERFLOW, AT EVERY SPLITTER RATIO. `scrollWidth >
 *      innerWidth` means something is wider than the screen — the single most
 *      common cause of "the layout is broken on my phone". Since the product
 *      owner's return of 2026-08-31 this is checked at THREE positions of the
 *      map/content seam rather than one, because the seam is a control the
 *      coordinator drags all day and a layout that only holds at its default
 *      ratio is a layout that breaks in use. See `RATIO_STOPS` below.
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
 * ★ PO POINT 2 (2026-08-31) — `ENGINE=webkit` RUNS THE WHOLE SWEEP IN SAFARI'S
 *   ENGINE, AND THAT IS THE HALF THAT WAS MISSING.
 *
 *   The product owner's instrument is an iPad. Every browser on iOS is WebKit,
 *   including the installed PWA — and this sweep has run in Chromium since the
 *   day it was written. His question 7bis ("the page moves left and right, and
 *   up and down, on the farm form") was never reproduced here, and a
 *   layout-engine difference is the first place to look for a symptom that one
 *   engine has and the other does not: WebKit and Blink disagree about
 *   `100dvh` inside a flex column, about `position: sticky` in an
 *   `overflow: hidden` ancestor, and about whether a `container-type` element
 *   contains an absolutely positioned child.
 *
 *   `ENGINE=webkit bun run layout` — same routes, same assertions, Safari's
 *   engine. Playwright's WebKit build is already on this machine.
 */
const ENGINE = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'

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
/**
 * ★ PO POINT 2 — `touch: true` ON ALL FOUR, and it is not a detail.
 *
 * Every viewport in this table is a real touch device — two iPhones and an
 * iPad in both orientations — and until now the sweep drove all four with a
 * mouse pointer. `(pointer: coarse)` therefore never matched, so a rule
 * written FOR those devices was invisible to the gate that is supposed to
 * cover them. The 16 px field rule (`index.css`, PO point 2) is exactly such a
 * rule, and so is anything that follows it.
 */
const VIEWPORTS = {
  phone: { width: 390, height: 844, maxScreenfuls: 6, statusInset: 47, bottomInset: 34 },
  iphone: { width: 402, height: 874, maxScreenfuls: 6, statusInset: 59, bottomInset: 34 },
  ipad: { width: 1032, height: 1376, maxScreenfuls: 5, statusInset: 24, bottomInset: 20 },
  'ipad-ls': { width: 1376, height: 1032, maxScreenfuls: 6, statusInset: 24, bottomInset: 20 },
} as const

/**
 * P3.4 (PO RETURN 7) — `STANDALONE=1` RUNS THE WHOLE SWEEP AS THE INSTALLED
 * APP.
 *
 * ★ THE INSTALLED APP IS A DIFFERENT LAYOUT AND NOTHING WAS EVER MEASURING IT.
 *   Added to the home screen there is no browser toolbar: the page runs to the
 *   top edge of the display and the system draws the clock, the battery and
 *   the signal bars on the app's own pixels. Every sticky bar in the shell has
 *   to start below that zone or its buttons are under glyphs iOS reserves the
 *   taps for — and none of it is visible in a browser tab, which is the only
 *   place this sweep has ever run.
 *
 * ★ IT IS SIMULABLE BECAUSE THE INSETS ARE TOKENS, NOT `env()` CALLS.
 *   Playwright can emulate a viewport, a locale, a colour scheme and a
 *   position; it cannot emulate a notch, and there is no flag that will make
 *   it. So `tokens.css` reads `env(safe-area-inset-*)` ONCE into
 *   `--status-inset` / `--safe-bottom` and every rule in the app reads those —
 *   which turns "does the installed app's chrome clear the status bar" from a
 *   claim only a physical iPad can settle into two custom properties and an
 *   attribute. The numbers above are the real devices': 59 px on an iPhone 16
 *   Pro, 47 px on the 390-class phones, 24 px on an iPad Pro, and the
 *   home-indicator insets under them.
 *
 * What it asserts, on every screen, on top of everything the ordinary sweep
 * already does:
 *   · the status-bar gradient exists and is the height it is meant to be —
 *     `--status-inset × 1.25`, so it collapses to nothing where there is no
 *     bar to sit under;
 *   · NO CONTROL IS UNDER THE CLOCK. Every viewport-pinned bar's buttons,
 *     links and fields start at or below the inset. Content is allowed to
 *     SCROLL under the system zone — that is what the gradient is for — but
 *     nothing may come to REST there, because iOS takes the taps.
 */
/**
 * ⚠️ PO POINT 1 (2026-08-31) — `STANDALONE=1` IS A SIMULATION OF OPTION B, AND
 * IT TOOK A REAL iPAD TO NOTICE.
 *
 * The block above is true and was never the whole truth. The insets it stamps
 * are the ones a real iPad reports **only when the app is laid out under the
 * system bar** — which on iOS happens only with
 * `apple-mobile-web-app-status-bar-style: black-translucent`, a tag this app
 * deliberately does not carry (§12bis.7). Without it iOS puts the web view
 * BELOW the bar, there is no unsafe area at the top, and
 * `env(safe-area-inset-top)` is **0**. Every rule that scales by
 * `--status-inset` then collapses — including the gradient, which is why the
 * product owner installed the app and saw no gradient at all.
 *
 * So there are two installed configurations and the gate now runs both:
 *
 *   `STANDALONE=1`    — option B's geometry: the device's real top inset.
 *   `STANDALONE=ios`  — option A: `data-standalone` stamped, top inset **0**,
 *                       home-indicator inset real. The bottom inset is NOT
 *                       zeroed, because the status-bar tag has nothing to do
 *                       with the home indicator — iOS reports that one either
 *                       way, and it is the half that produced the band at the
 *                       foot.
 *
 * `STATUSBAR=translucent` additionally stamps `data-statusbar='translucent'`,
 * which is what switches the gradient to option B's dark scrim. It exists so
 * the captures the product owner arbitrated on are of the real rule rather
 * than of a mock-up.
 *
 * ★★ WHICH OF THE TWO SHIPS CHANGED ON 2026-09-01, AND THIS COMMENT IS THE
 *    PLACE THAT WOULD OTHERWISE GO STALE (ETAT §23.3). The product owner chose
 *    OPTION B: `index.html` now carries
 *    `apple-mobile-web-app-status-bar-style: black-translucent` as a live tag.
 *
 *    · **`STANDALONE=1` IS NOW THE SHIPPING CONFIGURATION** — installed, the
 *      device's real top inset, the scrim over the shell.
 *    · **`STANDALONE=ios` IS KEPT AS THE HISTORICAL OPTION-A GEOMETRY.** It
 *      still runs and still passes, and it is still worth running: it is the
 *      only configuration in which `--status-inset` is 0, which is the case
 *      every rule that scales by it has to survive.
 *    · **`STATUSBAR=translucent` IS NOW LARGELY REDUNDANT.** `standalone.ts`
 *      reads the decision off the meta tag, so the app stamps
 *      `data-statusbar='translucent'` by itself in every browser, this one
 *      included. The env var is left in place because it is what the
 *      arbitration captures were taken with and because it is the one way to
 *      ask for the scrim if the tag is ever commented out again.
 */
const STANDALONE = process.env.STANDALONE === '1' || process.env.STANDALONE === 'ios'
/** Option A's geometry — historical since 2026-09-01: installed, top inset 0. */
const REAL_IOS = process.env.STANDALONE === 'ios'
/** Option B's scrim. The app now stamps it itself; see the note above. */
const TRANSLUCENT = process.env.STATUSBAR === 'translucent'
const STANDALONE_MODE = REAL_IOS ? 'ios' : TRANSLUCENT ? 'translucent' : 'simulated'

type ViewportName = keyof typeof VIEWPORTS

const REQUESTED = (process.env.VIEWPORT ?? 'phone') as ViewportName | 'all'
const RUNS: ViewportName[] =
  REQUESTED === 'all'
    ? (Object.keys(VIEWPORTS) as ViewportName[])
    : [REQUESTED in VIEWPORTS ? (REQUESTED as ViewportName) : 'phone']

/**
 * PO RETURN 5 (2026-08-31) — THE SEAM IS A DIMENSION OF THE SWEEP.
 *
 * ★ THE RULE, AND IT IS ABSOLUTE: **no screen may scroll horizontally AT THE
 *   PAGE LEVEL, at any width and at any position of the splitter.** A wide
 *   table scrolling INSIDE its own `.table-scroll` box is legitimate and is
 *   not what this measures; the whole document sliding left and right is not,
 *   ever. The product owner hit it on his iPad — "notably when the splitter
 *   gives more room to the map, and also in a very narrow window" — and a
 *   defect that depends on where a draggable control happens to be sitting is
 *   a defect a one-position sweep cannot see.
 *
 * ★ THE THREE STOPS ARE REACHED BY DRIVING THE REAL CONTROL, NOT BY SEEDING
 *   `localStorage`. `PanelSplitter` is a `role="separator"` with `End` →
 *   `RATIO_MIN` (25 %), `Home` → `RATIO_MAX` (75 %); the screen starts at its
 *   own default, which is the third stop. That buys two things a seeded
 *   `lo-yanum:map-ratio:*` key does not: it costs ONE page load per screen
 *   instead of three — the sweep's whole runtime is page loads — and it tests
 *   the ratio the app actually applies rather than the number a test wrote
 *   into storage and hoped was read.
 *
 * ★ AND IT IS SKIPPED WHERE THERE IS NO SEAM, out loud. Below the `lg`/`xl`
 *   breakpoint the splitter is `display:none` and the two panels are stacked,
 *   and several screens have no map at all. Those measure once and print
 *   `(no splitter)` — a dimension that silently collapses to one is how a
 *   sweep reports coverage it does not have.
 */
const RATIO_STOPS = [
  { label: 'default', key: null },
  { label: '25%', key: 'End' },
  { label: '75%', key: 'Home' },
] as const

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
  /**
   * ★ PO POINT 2 — A SCREEN THAT IS NOT A URL.
   *
   * The product owner asked for the form screens to join the permanent sweep,
   * and half of them are not routes: the volunteer and driver forms are
   * MODALS, and steps 2–4 of the guard wizard are states of one route. A sweep
   * that can only reach what has a hash is a sweep that will always be missing
   * exactly the screens where a stray `min-width` hurts most, because a form
   * is the one place a coordinator's thumb is already busy.
   *
   * So a route may carry a function that puts the app in the state it means.
   * It runs after the navigation and before the audit, and it must SETTLE —
   * an audit taken mid-transition measures an element that is still animating.
   */
  open?: (page: Page) => Promise<void>
  /** Printed instead of a result when `open` could not reach the state. */
  reached?: boolean
}> = [
  { name: 'dashboard', hash: '#/coordinator' },
  { name: 'agenda', hash: '#/coordinator/agenda' },
  { name: 'farms', hash: '#/coordinator/farms' },
  { name: 'farm-detail', hash: '#/coordinator/farms/farm-01' },
  { name: 'farm-form', hash: '#/coordinator/farms/farm-01/edit' },
  // PO POINT 2 — CREATION AND EDITION ARE DIFFERENT SCREENS in the way that
  // matters here: the empty form has no zones drawn, so its map column is a
  // different height and its content column a different length.
  { name: 'farm-form-new', hash: '#/coordinator/farms/new' },
  { name: 'anchor-sheet', hash: '#/coordinator/farms/farm-01/anchors/anchor-01' },
  { name: 'anchor-form', hash: '#/coordinator/farms/farm-01/anchors/anchor-01/edit' },
  { name: 'anchor-form-new', hash: '#/coordinator/farms/farm-01/anchors/new' },
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
  {
    name: 'volunteer-modal',
    hash: '#/coordinator/volunteers',
    // The roster is still underneath, and it is the SAME exemption as the
    // `volunteers` route above — opening a modal over a screen does not change
    // why that screen is long.
    tallOnPurpose:
      'G7 window-virtualised table underneath — the page is the scroll surface',
    open: async (page) => {
      // ★ `:visible`, AND IT IS NOT A DETAIL. These screens render BOTH a
      //   desktop table row and a mobile card for every record, and CSS hides
      //   one of the two. `.first()` picks the first in DOM ORDER — the
      //   desktop one — which at 390 px is `display:none`, and clicking a
      //   hidden element waits sixty seconds and then fails. It failed on both
      //   phone viewports and passed on both iPad ones, which is exactly the
      //   shape of this mistake.
      // W4 — creating is the shell's unified "+" now, so the roster's own
      // header no longer carries the button: open the menu, then pick it.
      await page.locator('[data-testid="action-fab-toggle"]').click()
      await page.waitForTimeout(200)
      await page.locator('[data-testid="volunteer-new"]:visible').first().click()
      await page.waitForSelector('[role="dialog"]', { timeout: 10_000 })
      await page.waitForTimeout(600)
    },
  },
  {
    name: 'driver-modal',
    hash: '#/coordinator/drivers',
    open: async (page) => {
      await page.locator('[data-testid="driver-edit"]:visible').first().click()
      await page.waitForSelector('[role="dialog"]', { timeout: 10_000 })
      await page.waitForTimeout(600)
    },
  },
  { name: 'import', hash: '#/coordinator/volunteers/import' },
  { name: 'missions', hash: '#/coordinator/missions' },
  { name: 'mission-wizard', hash: '#/coordinator/missions/new' },
  /**
   * ★ STEPS 2, 3 AND 4 WITHOUT DRIVING THE MAP, and the shortcut is the app's
   *   own rather than a test-only door: `?resume=<missionId>` is what "המשך
   *   גיוס" on a mission detail links to (`MissionDetailScreen`), and it lands
   *   the wizard on step 2 with a real mission's farm, window, shortlist,
   *   responses and drivers already in it. From there `הבא` is simply enabled.
   *   `bun run wizard` still plays step 1 by hand — that gate is about the
   *   scoring, this one is about the geometry.
   */
  {
    name: 'wizard-step-2',
    hash: '#/coordinator/missions/new?resume=mission-01',
    open: async (page) => {
      await page.waitForTimeout(900)
    },
  },
  {
    name: 'wizard-step-3',
    hash: '#/coordinator/missions/new?resume=mission-01',
    open: async (page) => {
      await page.waitForTimeout(900)
      await page.locator('[data-testid="wizard-next"]:visible').first().click()
      await page.waitForTimeout(900)
    },
  },
  {
    name: 'wizard-step-4',
    hash: '#/coordinator/missions/new?resume=mission-01',
    open: async (page) => {
      await page.waitForTimeout(900)
      for (let i = 0; i < 2; i++) {
        await page.locator('[data-testid="wizard-next"]:visible').first().click()
        await page.waitForTimeout(900)
      }
    },
  },
  { name: 'mission-detail', hash: '#/coordinator/missions/mission-01' },
  { name: 'incidents', hash: '#/coordinator/incidents' },
  { name: 'incident-detail', hash: '#/coordinator/incidents/inc-01' },
  // P2.5a — הגדרות. A screen added without being added here is a screen this
  // sweep silently stops covering, which is the failure mode a hard-coded list
  // has.
  { name: 'settings', hash: '#/coordinator/settings' },
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
  /** W2 — figures wider than their card (`[data-figure]`), at every seam stop. */
  escapedFigures: Array<{ tag: string; text: string }>
  /**
   * PO return 5 — HOW FAR THE DOCUMENT CAN ACTUALLY BE SLID, measured by
   * trying to slide it. `scrollWidth` is the usual instrument and it is not
   * enough here: this app is RTL, so its overflow goes LEFT, into negative
   * `scrollLeft` — and "the page moves sideways under my thumb" is a claim
   * about scrolling, so the honest way to test it is to scroll. Zero on a
   * healthy screen in both directions.
   */
  scrollRange: number
  wide: Array<{ tag: string; cls: string; width: number   /**
   * U7 (2026-09-02) — text cut off with NO way to read it: an element whose
   * ellipsis or line-clamp is actually clipping, and which carries no
   * `title` of its own or from an ancestor.
   */
  truncated: Array<{ tag: string; text: string }>
}>
  collisions: Array<{ a: string; b: string }>
  /**
   * ★ X5 (2026-09-04) — THE ROSTERS' TWO FAILURE MODES, MEASURED.
   *
   * `crushed`: a `.roster-row` cell that is on screen, has content, and is
   * under 24 px wide — the shape of "les colonnes sont écrasées". A grid track
   * can be squeezed to its min-content, and a flex row of icon buttons has a
   * min-content of nearly nothing, which is how five actions ended up inside
   * 36 px on top of each other at 25 % of the seam.
   *
   * `deformedPills`: a `.chip` whose own content does not fit it, or which has
   * been pulled to more than two lines' worth of height by its cell's stretch.
   * "Les pilules de statut se déforment", exactly, and both directions of it.
   *
   * Both are judged at EVERY seam stop, because the seam is what creates them.
   */
  crushed: Array<{ tag: string; width: number }>
  deformedPills: Array<{ text: string; w: number; h: number }>
  /** A30 — page height as a multiple of the viewport. */
  heightRatio: number
  /** A30 — long tables/lists with no bounded scroll container above them. */
  uncontained: Array<{ tag: string; rows: number }>
  /**
   * ★ PO POINT 2 — focusable form controls whose font is under 16 px, which is
   * the exact condition under which iOS zooms the WHOLE PAGE on focus and
   * leaves it panning in both axes. See `index.css`.
   */
  smallFields: Array<{ tag: string; size: number }>
  coarsePointer: boolean
  /** P3.4 — null unless the page is stamped as the installed app. */
  standalone: null | {
    inset: number
    gradientHeight: number
    /** Controls inside a viewport-pinned bar that sit in the system zone. */
    underTheClock: Array<{ tag: string; top: number }>
    /**
     * PO POINT 1 — the band at the FOOT. `--shell-foot` is what every
     * `100dvh` column subtracts, so it has to equal what is really occupied
     * down there. See `footBand` in the audit for why this is the invariant.
     */
    shellFoot: number
    shellFootDefault: number
    footOccupied: number
    footOccupant: string
  }
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

  // PO return 5 — ask the document to move, put it back, and report how far it
  // went. Synchronous and within one frame, so nothing the user could see.
  const de = document.documentElement
  const restore = de.scrollLeft
  de.scrollLeft = -99999
  const minScroll = de.scrollLeft
  de.scrollLeft = 99999
  const maxScroll = de.scrollLeft
  de.scrollLeft = restore
  const scrollRange = Math.abs(maxScroll - minScroll)

  /**
   * ★ X6 (2026-09-04) — "WIDER THAN THE VIEWPORT" WAS ONLY HALF THE QUESTION.
   *
   * The other half is an element of ORDINARY width that STICKS OUT: a 40 px
   * button at x = 1010 on a 1032 px screen adds 18 px of scrollWidth and is
   * not wide by any measure. This gate reported "scrollWidth 1047 vs 1032"
   * and then listed nothing, which is the worst possible result — a real
   * defect with no name on it. An element that ends past the viewport (or
   * starts before it, which is where an RTL overflow goes) is now named too.
   *
   * `position: fixed` is excluded: it does not contribute to `scrollWidth`,
   * so a fixed rail deliberately bled to the edge is not this defect.
   */
  /**
   * ⚠️ AND IT ONLY COUNTS IF NOTHING ABOVE IT CLIPS. A map marker sits at the
   *    coordinates it sits at; `getBoundingClientRect` reports where it WOULD
   *    be even when an `overflow: hidden` ancestor is already cutting it off,
   *    and a clipped box contributes nothing to `scrollWidth`. Without this
   *    walk the gate names every pin near a panel's edge and the real culprit
   *    is the seventh line down.
   */
  const clipped = (el: Element): boolean => {
    let p = el.parentElement
    while (p && p !== document.documentElement) {
      const o = getComputedStyle(p).overflowX
      if (o !== 'visible') return true
      p = p.parentElement
    }
    return false
  }

  const wide = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      if (r.height <= 0) return false
      if (getComputedStyle(el).position === 'fixed') return false
      // 1 px of slack absorbs sub-pixel rounding on fractional layouts.
      const out = r.width > vw + 1 || r.right > vw + 1 || r.left < -1
      return out && !clipped(el)
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
      // PO POINT 2 — a modal overlay covering the shell is the POINT of a
      // modal, not a defect. `data-overlay` is set by `primitives.tsx`'s
      // `Modal` and by nothing else, so this exempts exactly the deliberate
      // case and still catches two bars that found each other by accident.
      if (
        a.hasAttribute('data-overlay') ||
        b.hasAttribute('data-overlay') ||
        a.closest('[data-overlay]') !== null ||
        b.closest('[data-overlay]') !== null
      ) {
        continue
      }
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
  /**
   * U7 — NO TEXT CUT WITHOUT RECOURSE, at EVERY seam position. An ellipsis
   * is allowed; a value nobody can recover is not. The app's root observer
   * (`useTruncationTitles`) gives every overflowing `.truncate` /
   * `line-clamp-*` element its full text as a `title`; this asks the DOM
   * whether any clipped text is still without one, which is what a new
   * component that truncates by hand would produce.
   */
  const truncated = [...document.querySelectorAll<HTMLElement>('body *')]
    .filter((el) => {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') return false
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return false
      const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none'
      const ellipsis = cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible'
      if (!clamp && !ellipsis) return false
      const overflows = clamp
        ? el.scrollHeight > el.clientHeight + 1
        : el.scrollWidth > el.clientWidth + 1
      if (!overflows) return false
      if (!(el.textContent ?? '').trim()) return false
      return el.closest('[title]') === null
    })
    .map((el) => ({
      tag: label(el),
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
    }))
    .slice(0, 8)

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

  /**
   * P3.4 — the installed app's top zone, measured only when the page says it
   * is the installed app. `pinned` above is already "viewport-pinned and not
   * merely sticky inside a scroll box", which is exactly the set of bars whose
   * position does not change when the page scrolls — so a control inside one
   * of them that is in the system zone is in the system zone permanently.
   */
  const de2 = document.documentElement
  let standalone: Report['standalone'] = null
  if (de2.hasAttribute('data-standalone')) {
    const cs2 = getComputedStyle(de2)
    const inset = parseFloat(cs2.getPropertyValue('--status-inset') || '0')
    const before = getComputedStyle(document.body, '::before')
    const gradientHeight = parseFloat(before.height || '0')

    /**
     * ★ EVERY CONTROL AT REST IN THE ZONE, NOT JUST THE ONES IN PINNED BARS.
     *
     * The first draft asked only about viewport-pinned bars and passed — and
     * the very first capture showed the map's own zoom buttons sitting in the
     * top 24 px. They are `absolute` inside a map panel that reaches the top
     * of the display, which is not a pinned bar and is just as unreachable:
     * iOS takes taps in the status-bar strip whatever drew the pixels under
     * them.
     *
     * "At rest" is the whole qualification. The page is at the top of its
     * scroll when this runs, so what this finds is what a coordinator ARRIVING
     * on the screen cannot press. Content he scrolls up there afterwards is
     * his own doing and is exactly what the gradient exists for.
     */
    const underTheClock: Array<{ tag: string; top: number }> = []
    for (const el of document.querySelectorAll(
      'button, a[href], input, select, textarea, [role="separator"], [role="button"]',
    )) {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      if (r.top < inset - 0.5 && r.bottom > 0) {
        underTheClock.push({ tag: label(el), top: Math.round(r.top) })
      }
    }

    /**
     * ★ PO POINT 1 — THE BAND AT THE FOOT, AS AN INVARIANT RATHER THAN AS A
     *   PIXEL COMPARISON.
     *
     *   `--shell-foot` is subtracted by every full-`dvh` column in the app, so
     *   it is a CLAIM: "this many pixels at the bottom of the display are
     *   already taken". If nothing is actually down there the claim is false
     *   and the difference is painted in the shell's own `--surface-base` —
     *   which is the residual band the product owner reported at the foot of
     *   the installed app, and which PO return 6 half-fixed by replacing a
     *   hard-coded `2.75rem` with `var(--safe-bottom)`: still a number, still
     *   nothing there.
     *
     *   So: what is REALLY occupied at the bottom is the tallest
     *   viewport-pinned element whose bottom edge is at the bottom of the
     *   viewport, and `--shell-foot` must equal it. Zero in a real build,
     *   `DevToolbar`'s measured height in demo. The home-indicator inset is
     *   deliberately NOT part of this — the indicator is a translucent pill
     *   drawn OVER the app and iOS's own convention is that content runs under
     *   it; clearing it is `--shell-bottom`'s job, and that is the check above.
     */
    const shellFoot = parseFloat(cs2.getPropertyValue('--shell-foot') || '0') || 0

    /**
     * ★★ AND THE ONE THAT ACTUALLY CATCHES THE PRODUCT OWNER'S BUG, because
     *    the invariant above CANNOT — the sweep runs in DEMO mode, where
     *    `DevToolbar` really is pinned at the foot and really does publish its
     *    height, so the claim and the occupant agree and the check passes.
     *    His iPad runs a REAL build, where `DevToolbar` returns `null` (P2.3)
     *    and `--shell-foot` falls back to its TOKEN DEFAULT with nothing down
     *    there at all. That default is the whole defect: it used to be
     *    `2.75rem` (PO return 6), then `var(--safe-bottom)`, and both are a
     *    number of pixels reserved for something that is not there.
     *
     *    So the default is measured directly: drop the inline override for one
     *    frame, read what `tokens.css` alone would give, and put it back. That
     *    is precisely what a real build computes, obtained without building
     *    one — and it must be ZERO, because a shell with nothing pinned at its
     *    foot owes nothing. Synchronous, within one frame, nothing paints.
     */
    const inlineFoot = de2.style.getPropertyValue('--shell-foot')
    de2.style.removeProperty('--shell-foot')
    const shellFootDefault =
      parseFloat(getComputedStyle(de2).getPropertyValue('--shell-foot') || '0') || 0
    if (inlineFoot) de2.style.setProperty('--shell-foot', inlineFoot)

    let footOccupied = 0
    let footOccupant = 'nothing'
    for (const el of pinned) {
      const r = el.getBoundingClientRect()
      if (r.height <= 0 || r.width <= 0) continue
      if (Math.abs(r.bottom - window.innerHeight) > 1.5) continue
      // ★ A MODAL OVERLAY IS NOT "OCCUPIED FOOT", and the first run of this
      //   invariant said it was — `div.fixed.inset-0` reaches the bottom of the
      //   viewport by definition, so every modal screen reported the whole
      //   window height as taken. It covers the shell on purpose (see
      //   `data-overlay` in primitives.tsx) and the shell underneath is laid
      //   out exactly as it was; what this measures is what the SHELL reserves.
      if (el.hasAttribute('data-overlay') || el.closest('[data-overlay]') !== null) {
        continue
      }
      if (r.height > footOccupied) {
        footOccupied = r.height
        footOccupant = label(el)
      }
    }

    standalone = {
      inset,
      gradientHeight,
      underTheClock: underTheClock.slice(0, 6),
      shellFoot,
      shellFootDefault,
      footOccupied,
      footOccupant,
    }
  }

  /**
   * ★ PO POINT 2 — THE CONDITION FOR iOS'S FOCUS ZOOM, WHICH IS THE ONE THING
   *   ABOUT IT A GATE CAN ACTUALLY CHECK.
   *
   *   iOS scales the entire document when a focused field's font is below
   *   16 px; the zoomed document is then wider than the visual viewport and
   *   pans left-right and up-down under the thumb. No desktop engine does
   *   this, so the SYMPTOM is unreachable from here and the CONDITION is
   *   exact. Checked only where a coarse pointer really is in play, because
   *   the rule that fixes it is scoped to those pointers and the desktop
   *   density is deliberate (P0bis.3).
   *
   *   `type=hidden`, checkboxes and radios are excluded: iOS does not zoom for
   *   a control it cannot type into, and a checkbox has no text at all.
   */
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const smallFields: Array<{ tag: string; size: number }> = []
  if (coarsePointer) {
    for (const el of document.querySelectorAll('input, select, textarea')) {
      const type = (el as HTMLInputElement).type
      if (type === 'hidden' || type === 'checkbox' || type === 'radio') continue
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      const size = parseFloat(getComputedStyle(el).fontSize || '16')
      if (size < 15.99) smallFields.push({ tag: label(el), size: Math.round(size * 10) / 10 })
    }
  }

  // W2 (2026-09-02, passe finale) — A FIGURE THAT ESCAPES ITS CARD. The big
  // numbers were leaving their KPI cards and widening the page; every figure
  // now carries `data-figure`, and one whose content is wider than its box
  // fails the screen at every seam position.
  const escapedFigures = [...document.querySelectorAll<HTMLElement>('[data-figure]')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      if (r.width <= 0) return false
      const card = el.closest<HTMLElement>('.figure-card, .card, .card-interactive, .tile')
      return (
        el.scrollWidth > el.clientWidth + 1 ||
        (card !== null && r.right > card.getBoundingClientRect().right + 1) ||
        (card !== null && r.left < card.getBoundingClientRect().left - 1)
      )
    })
    .map((el) => ({ tag: label(el), text: (el.textContent ?? '').trim().slice(0, 20) }))
    .slice(0, 8)

  // X5 — crushed roster cells and deformed status pills.
  const crushed: Array<{ tag: string; width: number }> = []
  for (const row of document.querySelectorAll<HTMLElement>('.roster-row')) {
    for (const cell of row.children) {
      const el = cell as HTMLElement
      const st = getComputedStyle(el)
      if (st.display === 'none' || st.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      const hasContent = (el.textContent ?? '').trim().length > 0 || el.children.length > 0
      if (hasContent && r.width < 24) {
        crushed.push({ tag: label(el), width: Math.round(r.width) })
      }
    }
  }

  const deformedPills: Array<{ text: string; w: number; h: number }> = []
  for (const el of document.querySelectorAll<HTMLElement>('.chip')) {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    const squashed = el.scrollWidth > el.clientWidth + 1
    // A chip is one line of `micro` plus padding: ~24 px. Past 40 it has been
    // stretched by a cell rather than sized by its own content.
    const stretched = r.height > 40
    if (squashed || stretched) {
      deformedPills.push({
        text: (el.textContent ?? '').trim().slice(0, 16),
        w: Math.round(r.width),
        h: Math.round(r.height),
      })
    }
  }

  return {
    smallFields: smallFields.slice(0, 6),
    coarsePointer,
    escapedFigures,
    crushed: crushed.slice(0, 6),
    deformedPills: deformedPills.slice(0, 6),
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: vw,
    scrollRange,
    standalone,
    wide,
    collisions,
    heightRatio:
      document.documentElement.scrollHeight / Math.max(1, window.innerHeight),
    uncontained,
    truncated,
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
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch()

let failures = 0

for (const name of RUNS) {
  const vp = VIEWPORTS[name]
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    // PO POINT 2 — see VIEWPORTS. All four are touch devices.
    hasTouch: true,
    isMobile: ENGINE === 'chromium' ? vp.width < 768 : undefined,
    locale: 'he-IL',
    permissions: ['geolocation'],
    geolocation: { latitude: 31.0611, longitude: 34.6552 },
  })
  // P3.4 — stamp the installed-app facts BEFORE the app's own boot script, so
  // the first paint is already the standalone layout. `addInitScript` runs on
  // every document, which is what makes it survive the sweep's re-navigations.
  if (STANDALONE) {
    await context.addInitScript(
      ([top, bottom, translucent]: [number, number, boolean]) => {
        const set = () => {
          const de = document.documentElement
          // ★ AND IT IS NULL ON THE FIRST CALL, which is how the first draft of
          //   this silently measured a browser tab and reported it as an
          //   installed app. `addInitScript` runs at DOCUMENT CREATION — before
          //   the parser has produced an `<html>` element — so the immediate
          //   pass is the OPTIONAL one and the listener is the load-bearing
          //   one. It failed loudly (every screen FAILED on a missing
          //   gradient) only because the assertion was written to treat an
          //   absent gradient as a defect rather than as "not applicable",
          //   which is the difference between a gate and a decoration.
          if (!de) return false
          de.setAttribute('data-standalone', '')
          if (translucent) de.setAttribute('data-statusbar', 'translucent')
          de.style.setProperty('--status-inset', `${top}px`)
          de.style.setProperty('--safe-bottom', `${bottom}px`)
          return true
        }
        if (!set()) {
          document.addEventListener('readystatechange', set, { once: false })
          document.addEventListener('DOMContentLoaded', set, { once: true })
        }
      },
      // PO POINT 1 — option A reports NO top inset, and the home indicator is
      // reported either way.
      [REAL_IOS ? 0 : vp.statusInset, vp.bottomInset, TRANSLUCENT] as [
        number,
        number,
        boolean,
      ],
    )
  }

  const page = await context.newPage()
  page.setDefaultNavigationTimeout(120_000)
  page.setDefaultTimeout(60_000)

  console.log('')
  console.log(
    `Layout sweep at ${vp.width}×${vp.height} (${name}) — ${ROUTES.length} screens${
      STANDALONE
        ? ` — INSTALLED APP [${STANDALONE_MODE}] (status inset ${
            REAL_IOS ? 0 : vp.statusInset
          }px, home indicator ${vp.bottomInset}px)`
        : ''
    }`,
  )
  console.log(
    `  ${'screen'.padEnd(20)} ${'seam'.padEnd(8)} ${'scrollW'.padStart(8)} ${'screens'.padStart(8)}  result`,
  )
  console.log(`  ${'-'.repeat(72)}`)

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

    /**
     * PO POINT 2 — put the app in the state the route MEANS, when that state is
     * not a URL: open a modal, walk the wizard forward.
     *
     * ★ IT FAILS THE SCREEN RATHER THAN SKIPPING IT. A setup step that throws
     *   means the control it was looking for is gone or renamed, and a sweep
     *   that quietly stops covering the volunteer form the day its button gets
     *   a new testid is worse than no coverage at all, because the run still
     *   says PASS.
     */
    if (route.open) {
      try {
        await route.open(page)
      } catch (err) {
        failures++
        console.log(
          `  ${route.name.padEnd(20)} ${'—'.padEnd(8)} ${'—'.padStart(8)} ${'—'.padStart(8)}  FAIL`,
        )
        console.log(
          `      PO POINT 2 could not reach the state: ${String(err).slice(0, 120)}`,
        )
        continue
      }
    }

    /**
     * PO return 5 — the seam, if this screen has one AT THIS WIDTH. Below the
     * breakpoint it is `display:none`, so `isVisible` and not `count`: a
     * splitter in the tree that nobody can see is a splitter nobody can drag.
     */
    const seam = page.locator('[data-panel-splitter]').first()
    const hasSeam = (await seam.count()) > 0 && (await seam.isVisible())
    const stops = hasSeam ? RATIO_STOPS : [RATIO_STOPS[0]]

    for (const stop of stops) {
      if (stop.key !== null) {
        await seam.focus()
        await seam.press(stop.key)
        // The width is a CSS variable on the shell, so the reflow is one
        // frame — but the map canvas resizes off a ResizeObserver, and it is
        // the canvas that has been the wide element before.
        await page.waitForTimeout(700)
      }

      const report = (await page.evaluate(audit)) as Report
      // Two instruments for one claim, because neither alone is enough here:
      // `scrollWidth` is the conventional one, and the scroll range is what
      // catches RTL overflow, which goes left into negative `scrollLeft`.
      const overflow =
        report.scrollWidth > report.innerWidth + 1 || report.scrollRange > 1
      // The A30/A24 structural checks are a property of the SCREEN, not of
      // where the seam happens to be, and re-reporting them three times would
      // turn one defect into three lines. They are judged at the default stop;
      // the other two stops are the horizontal rule the product owner asked
      // for, and only that.
      const first = stop === RATIO_STOPS[0]
      const tooTall =
        first && report.heightRatio > vp.maxScreenfuls && !route.tallOnPurpose
      // P3.4 — the installed app's two extra rules, judged at the default
      // stop like every other structural check.
      const sa = report.standalone
      const gradientWrong =
        first &&
        STANDALONE &&
        (sa === null || Math.abs(sa.gradientHeight - sa.inset * 1.25) > 1)
      const clockCovered = first && STANDALONE && (sa?.underTheClock.length ?? 0) > 0
      // ★ PO POINT 2 — the condition for iOS's focus zoom. Judged at the
      // default stop: it is a property of the screen's CSS, not of the seam.
      const zoomOnFocus = first && report.smallFields.length > 0
      // PO POINT 1 — `--shell-foot` claims pixels at the bottom of the display
      // are taken. If nothing is down there the claim is false and the gap is
      // painted in `--surface-base`: the residual band on his iPad.
      const footBand =
        first &&
        STANDALONE &&
        sa !== null &&
        (Math.abs(sa.shellFoot - sa.footOccupied) > 1.5 || sa.shellFootDefault > 0.5)

      // U7 — judged at EVERY stop: the seam is what makes a column narrow.
      const cutOff = report.truncated.length > 0
      // W2 — judged at EVERY stop, like the overflow it used to cause.
      const escaped = report.escapedFigures.length > 0
      // X5 — the seam is what crushes a column and deforms a pill, so both are
      // judged at every stop rather than at the default one.
      const crushedCols = report.crushed.length > 0
      const deformed = report.deformedPills.length > 0
      const ok =
        !overflow &&
        !cutOff &&
        !escaped &&
        !crushedCols &&
        !deformed &&
        !tooTall &&
        !gradientWrong &&
        !clockCovered &&
        !footBand &&
        !zoomOnFocus &&
        (!first ||
          (report.wide.length === 0 &&
            report.collisions.length === 0 &&
            report.uncontained.length === 0))
      if (!ok) failures++

      const seamLabel = hasSeam ? stop.label : 'no seam'
      console.log(
        `  ${(first ? route.name : '').padEnd(20)} ${seamLabel.padEnd(8)} ${String(
          report.scrollWidth,
        ).padStart(8)} ${(first ? report.heightRatio.toFixed(1) : '').padStart(8)}  ${
          ok ? 'PASS' : 'FAIL'
        }`,
      )
      if (overflow) {
        console.log(
          `      HORIZONTAL SCROLL: scrollWidth ${report.scrollWidth} vs window ${report.innerWidth}, slid ${report.scrollRange}px`,
        )
        // X6 — NAME THE CULPRIT AT EVERY SEAM STOP, not only at the default
        // one. An overflow that appears only at 75 % is exactly the kind this
        // gate exists for, and "scrollWidth is 15px too big" with no element
        // named is a morning of bisecting.
        for (const w of report.wide) {
          console.log(`      → wider than viewport: ${w.tag} (${w.width}px)`)
        }
      }
      for (const c of report.truncated) {
        console.log(`      U7 text cut with no recourse: ${c.tag} "${c.text}"`)
      }
      for (const f of report.escapedFigures) {
        console.log(`      W2 figure escapes its card: ${f.tag} "${f.text}"`)
      }
      for (const c of report.crushed) {
        console.log(`      X5 roster column crushed to ${c.width}px: ${c.tag}`)
      }
      for (const p of report.deformedPills) {
        console.log(`      X5 status pill deformed (${p.w}×${p.h}): "${p.text}"`)
      }
      if (!first) continue
      for (const w of report.wide) {
        console.log(`      wider than viewport: ${w.tag} (${w.width}px)`)
      }
      for (const c of report.collisions) {
        console.log(`      pinned overlap: ${c.a}  ×  ${c.b}`)
      }
      for (const u of report.uncontained) {
        console.log(`      A30 uncontained list: ${u.tag} (${u.rows} rows)`)
      }
      for (const f of report.smallFields) {
        console.log(
          `      PO POINT 2 field at ${f.size}px — iOS will ZOOM THE PAGE on focus: ${f.tag}`,
        )
      }
      if (tooTall) {
        console.log(
          `      A30 page is ${report.heightRatio.toFixed(1)} screenfuls (max ${vp.maxScreenfuls})`,
        )
      }
      if (route.tallOnPurpose && report.heightRatio > vp.maxScreenfuls) {
        console.log(`      A30 exempt: ${route.tallOnPurpose}`)
      }
      if (gradientWrong) {
        console.log(
          sa === null
            ? '      P3.4 the page was never stamped as the installed app'
            : `      P3.4 status gradient is ${sa.gradientHeight}px, expected ${sa.inset * 1.25}px`,
        )
      }
      for (const c of sa?.underTheClock ?? []) {
        console.log(`      P3.4 control under the status bar: ${c.tag} at y=${c.top}`)
      }
      if (footBand && sa !== null) {
        console.log(
          `      PO POINT 1 band at the foot: --shell-foot claims ${sa.shellFoot}px, ` +
            `${sa.footOccupant} occupies ${sa.footOccupied}px` +
            (sa.shellFootDefault > 0.5
              ? `; and its TOKEN DEFAULT is ${sa.shellFootDefault}px, which is what a REAL build gets with nothing pinned down there`
              : ''),
        )
      }
    }
  }

  /**
   * P3.4 — AND THE CAPTURES THE PRODUCT OWNER ASKED FOR, in both themes.
   * Assertions say a bar clears the clock; only a picture says whether the
   * gradient reads as a wash or as a band.
   */
  if (STANDALONE) {
    const shotDir = path.resolve(
      REAL_IOS || TRANSLUCENT
        ? 'docs/screenshots/statusbar'
        : 'docs/screenshots/standalone',
    )
    fs.mkdirSync(shotDir, { recursive: true })
    for (const theme of ['light', 'dark'] as const) {
      // Back to the coordinator FIRST. The sweep leaves the session on
      // whatever the last route needed — `driver:drv-03` — and a driver's role
      // default is the dark palette, so a capture taken without this is the
      // wrong screen in the wrong theme, which is what the first one was.
      await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
      await page.waitForSelector('select', { state: 'attached' })
      await page.selectOption('select', 'coordinator')
      await page.waitForTimeout(400)
      await page.evaluate((h) => {
        window.location.hash = h
      }, '#/coordinator/farms')
      await page.waitForTimeout(3500)
      await page.evaluate((value) => {
        document.documentElement.setAttribute('data-theme', value)
      }, theme)

      /**
       * A SIMULATED STATUS BAR, DRAWN ONLY FOR THE CAPTURE, AND LABELLED.
       *
       * The assertions above already say the gradient is the right height and
       * that no control rests under it. The one thing they cannot say is
       * whether a clock is READABLE on top of it, which is the entire reason
       * the product owner asked for this — and a screenshot of an empty 24 px
       * strip answers that question with nothing. So the glyphs are drawn in
       * the colour iOS will actually use: the system picks them against
       * `theme-color`, which theme.tsx keeps equal to the resolved
       * `--surface-base`, so they are DARK on the light palette and LIGHT on
       * the dark one. That is the design being checked, not a decoration.
       *
       * The page is also scrolled first, so there is real content passing
       * under the zone rather than the top of a screen that happens to be
       * empty there.
       */
      await page.evaluate(({ mode, translucent }: { mode: string; translucent: boolean }) => {
        window.scrollTo(0, 260)
        document.querySelectorAll('[data-mock-statusbar]').forEach((el) => el.remove())
        const inset = parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--status-inset'),
        )
        const bar = document.createElement('div')
        bar.setAttribute('data-mock-statusbar', '')
        bar.style.cssText = [
          'position:fixed', 'top:0', 'left:0', 'right:0',
          `height:${inset}px`, 'z-index:2147483647', 'pointer-events:none',
          'display:flex', 'align-items:center', 'justify-content:space-between',
          'padding:0 18px', 'font:600 13px/1 -apple-system,system-ui,sans-serif',
          'letter-spacing:.02em',
          // ★ OPTION B TAKES THE CHOICE AWAY. `black-translucent` forces the
          //   clock and the battery to WHITE whatever the theme, which is the
          //   single fact the arbitration turns on — so the capture draws
          //   white glyphs in BOTH themes rather than the flattering ones.
          `color:${translucent ? '#fff' : mode === 'light' ? '#000' : '#fff'}`,
        ].join(';')
        bar.innerHTML = '<span>02:14</span><span>■■□ ⌁ 78%</span>'
        document.body.appendChild(bar)
      }, { mode: theme, translucent: TRANSLUCENT })
      await page.waitForTimeout(600)

      const file = path.join(
        shotDir,
        `${name}-${theme}${STANDALONE_MODE === 'simulated' ? '' : `-${STANDALONE_MODE}`}.png`,
      )
      await page.screenshot({ path: file })
      console.log(`  captured ${path.relative(process.cwd(), file)}`)
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
  '  No horizontal scroll at any splitter ratio, no pinned-element overlap,',
)
console.log('  no uncontained list (A24 + A30 + PO return 5).')
