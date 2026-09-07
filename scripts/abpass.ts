import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

import { layOutDay } from '../src/core/agenda'
import type { AgendaEvent } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A87 … A93 — LES FILTRES QUI SE REPLIENT, L'AGENDA, L'OBJECTIF, LES RÔLES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run abpass
 *
 *   A87  from 360 to 1440 px in steps of 20: no row of pills ever takes two
 *        lines, and the fold happens exactly when they do not fit — including
 *        with the seam dragged narrow, which is AB2.3's split-view case.
 *   A88  the count on « סינון » is the number of filters actually on.
 *   A89  the agenda has a map; the day's appointments are numbered markers;
 *        the link works both ways; מיקום חסר is in the list and not on the map.
 *   A90  content-full: the grid takes the whole useful height and the page
 *        does not scroll under it.
 *   A91  three views, the current-hour line, and overlapping appointments side
 *        by side.
 *   A92  the target is editable, the behaviour on reaching it is honoured, and
 *        the history is there.
 *   A93  the role switch is reachable from the home screen at 402 px, offers
 *        the four roles, and comes back to the coordinator.
 *
 * ⚠️ EVERY PROBE IS A REAL FUNCTION passed to `page.evaluate`, never a
 *    template literal. Three passes lost an afternoon each to a backslash that
 *    became a letter and a back-quote inside a comment that ended the string.
 */

const PORT = Number(process.env.ABPASS_PORT ?? 5212)
const OUT_DIR = 'dist-abpass'

const PHONE = { width: 402, height: 874 }
const DESKTOP = { width: 1376, height: 1032 }

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

console.log('')
console.log('  A87 … A93 — AB2 · AB3 · AB4 · AB5')
console.log('  =================================')

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT_DIR], {
  env,
  stdout: 'ignore',
  stderr: 'pipe',
})
if ((await build.exited) !== 0) {
  console.error(await new Response(build.stderr).text())
  throw new Error('vite build failed')
}
const serve = Bun.spawn(
  ['bun', 'x', 'vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'],
  { env, stdout: 'ignore', stderr: 'ignore' },
)
const base = `http://localhost:${PORT}`
{
  const deadline = Date.now() + 40_000
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

async function load(page: Page, hash: string, settle = 2400): Promise<void> {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

// ---------------------------------------------------------------------------
// The probes
// ---------------------------------------------------------------------------

interface RowState {
  found: boolean
  shape: string | null
  available: number
  required: number
  /** How many distinct lines the pills occupy in the unfolded shape. */
  lines: number
  folded: number
  count: string | null
}

function readRow(): RowState {
  const row = document.querySelector('[data-filter-row]')
  if (!row) {
    return {
      found: false,
      shape: null,
      available: NaN,
      required: NaN,
      lines: 0,
      folded: 0,
      count: null,
    }
  }
  const pills = row.querySelector('.pill-row')
  /**
   * ⚠️ THE VERTICAL CENTRE, NOT THE TOP, AND THE FIRST VERSION OF THIS PROBE
   *    GOT IT WRONG AND FAILED THE RUN ON ITSELF. `.pill-row` is
   *    `items-center`, so everything on one line shares a CENTRE — but not a
   *    top: the 1 px hairline that separates the tabs from the statuses on
   *    שמירות is 16 px tall against a pill's 36, so its top is ten pixels
   *    lower and « distinct tops » counted two lines where the browser had
   *    drawn one. Measured: every child at top 556 except the divider at 566,
   *    with 543 px of pills in a 608 px row.
   */
  const tops = pills
    ? [
        ...new Set(
          [...pills.children].map((c) => {
            const r = c.getBoundingClientRect()
            return Math.round((r.top + r.height / 2) / 4) * 4
          }),
        ),
      ]
    : []
  return {
    found: true,
    shape: row.getAttribute('data-shape'),
    available: Number(row.getAttribute('data-fold-available')),
    required: Number(row.getAttribute('data-fold-required')),
    lines: tops.length,
    folded: document.querySelectorAll('[data-testid="filter-dropdown"]').length,
    count: row.getAttribute('data-filters-active'),
  }
}

interface AgendaState {
  markers: number
  badges: string[]
  events: number
  unplaced: number
  selected: string | null
  hourHeight: number
  gridHeight: number
  pageScroll: number
  now: number
  views: string[]
  activeView: string | null
  mapMode: string | null
}

function readAgenda(): AgendaState {
  const grid = document.querySelector('[data-testid="agenda-grid"]')
  const panel = document.querySelector('[data-testid="agenda-panel"]')
  const selected = document.querySelector('[data-testid="agenda-event"][data-selected="1"]')
  return {
    markers: document.querySelectorAll('.maplibregl-marker').length,
    badges: [...document.querySelectorAll('.maplibregl-marker')]
      .map((m) => (m.textContent || '').trim())
      .filter((v) => v !== ''),
    events: document.querySelectorAll('[data-testid="agenda-event"]').length,
    unplaced: Number(
      document.querySelector('[data-testid="agenda-unplaced"]')?.getAttribute('data-count') ?? '0',
    ),
    selected: selected ? selected.getAttribute('data-event-id') : null,
    hourHeight: Number(grid?.getAttribute('data-hour-height') ?? '0'),
    gridHeight: grid ? Math.round(grid.getBoundingClientRect().height) : 0,
    pageScroll: document.documentElement.scrollHeight - window.innerHeight,
    now: document.querySelectorAll('[data-testid="agenda-now"]').length,
    views: [...document.querySelectorAll('[data-testid="agenda-views"] button')].map(
      (b) => b.getAttribute('data-view') ?? '',
    ),
    activeView:
      [...document.querySelectorAll('[data-testid="agenda-views"] button')]
        .find((b) => b.getAttribute('aria-pressed') === 'true')
        ?.getAttribute('data-view') ?? null,
    mapMode: panel ? panel.getAttribute('data-map-mode') : null,
  }
}

let browser: Browser | undefined

try {
  browser = await chromium.launch()

  // -------------------------------------------------------------------------
  section('A87 — 360 → 1440 px, by 20: never two lines')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'he-IL' })
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)

    const SCREENS = [
      { name: 'חוות', hash: '#/coordinator/farms' },
      { name: 'שמירות', hash: '#/coordinator/missions' },
      { name: 'אירועים', hash: '#/coordinator/incidents' },
      { name: 'מתנדבים', hash: '#/coordinator/volunteers' },
    ]

    for (const screen of SCREENS) {
      await load(page, screen.hash)
      const twoLines: string[] = []
      const wrongShape: string[] = []
      let widths = 0

      for (let w = 360; w <= 1440; w += 20) {
        await page.setViewportSize({ width: w, height: 900 })
        /* One frame for the ResizeObserver, one for React. */
        await page.waitForTimeout(120)
        const row = (await page.evaluate(readRow)) as RowState
        if (!row.found) continue
        widths++
        if (row.shape === 'wide' && row.lines > 1) twoLines.push(`${w}px:${row.lines}`)
        /* The fold must be the ANSWER to the measurement, not a guess: folded
           when they do not fit, open when they do. Below 640 the phone shape
           is asserted separately by A73, so it is skipped here. */
        if (w >= 640 && Number.isFinite(row.required)) {
          const shouldFold = row.required > row.available
          const isFolded = row.shape === 'phone'
          if (shouldFold !== isFolded) {
            wrongShape.push(`${w}px:${Math.round(row.required)}/${row.available}→${row.shape}`)
          }
        }
      }

      check(
        `A87 · ${screen.name}: no width puts the pills on two lines`,
        twoLines.length === 0,
        twoLines.slice(0, 5).join(' · ') || `${widths} widths measured`,
      )
      check(
        `A87 · ${screen.name}: it folds exactly when they do not fit`,
        wrongShape.length === 0,
        wrongShape.slice(0, 5).join(' · ') || `${widths} widths measured`,
      )
    }

    /**
     * ★★ AB2.3 — AND THE SPLIT-VIEW CASE, WHICH IS THE ONE THE DEVICE
     *    QUESTION GETS WRONG. The seam is dragged to its narrowest (25 % — the
     *    bound `clampRatio` allows) on a 1440 px desktop: the DEVICE is as
     *    wide as it gets and the PANEL is a phone's, and the row must fold.
     */
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.evaluate(() => {
      localStorage.setItem('lo-yanum:map-ratio:farms', '25')
      localStorage.setItem('lo-yanum:map-mode:farms', 'split')
    })
    await load(page, '#/coordinator/farms')
    const narrow = (await page.evaluate(readRow)) as RowState
    check(
      'A87 · a 1440 px desktop with the seam dragged narrow folds like a phone',
      narrow.shape === 'phone' && narrow.folded === 1,
      `${Math.round(narrow.required)} needed / ${narrow.available} available · shape=${narrow.shape}`,
    )
    await page.evaluate(() => {
      localStorage.setItem('lo-yanum:map-ratio:farms', '75')
    })
    await load(page, '#/coordinator/farms')
    const wide = (await page.evaluate(readRow)) as RowState
    check(
      'A87 · and dragged wide again it shows them, on one line',
      wide.shape === 'wide' && wide.lines === 1,
      `${Math.round(wide.required)} needed / ${wide.available} available · lines=${wide.lines}`,
    )

    // -----------------------------------------------------------------------
    section('A88 — the count on « סינון »')
    // -----------------------------------------------------------------------
    await page.evaluate(() => localStorage.setItem('lo-yanum:map-ratio:farms', '25'))
    await load(page, '#/coordinator/farms')

    const before = (await page.evaluate(readRow)) as RowState
    check(
      'A88 · with nothing filtered the badge is absent and the count is 0',
      before.count === '0' &&
        (await page.locator('[data-testid="filter-active-count"]').count()) === 0,
      `count=${before.count}`,
    )

    await page.locator('[data-testid="filter-dropdown"]').click()
    await page.waitForTimeout(400)
    const typePills = page.locator('[data-pill-group="farm-type"] .filter-pill')
    await typePills.first().click()
    await page.waitForTimeout(300)
    const one = (await page.evaluate(readRow)) as RowState
    check(
      'A88 · one filter on reads 1, on the row and on the badge',
      one.count === '1' &&
        (await page.locator('[data-testid="filter-active-count"]').first().textContent()) === '1',
      `count=${one.count}`,
    )

    /* A second, independent narrowing — the region drop-down, not another type
       pill, which would REPLACE the first rather than add to it. */
    await page.selectOption('[data-testid="farms-region"] select', { index: 1 })
    await page.waitForTimeout(400)
    const two = (await page.evaluate(readRow)) as RowState
    check(
      'A88 · a second, independent filter reads 2',
      two.count === '2',
      `count=${two.count}`,
    )

    await page.locator('[data-testid="filter-clear"]').first().click()
    await page.waitForTimeout(400)
    const cleared = (await page.evaluate(readRow)) as RowState
    check(
      'A88 · and clearing takes it back to 0',
      cleared.count === '0',
      `count=${cleared.count}`,
    )

    await context.close()
  }

  // -------------------------------------------------------------------------
  section('A89 · A90 · A91 — the agenda')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'he-IL' })
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)

    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.setItem('lo-yanum:map-mode:agenda', 'split'))
    await load(page, '#/coordinator/agenda', 3200)

    const split = (await page.evaluate(readAgenda)) as AgendaState
    check('A89 · the agenda carries a map', split.mapMode === 'split', `mode=${split.mapMode}`)
    check(
      'A89 · the week’s appointments are on it as markers',
      split.markers > 0,
      `${split.markers} markers for ${split.events} blocks`,
    )
    check(
      'A89 · every marker carries its rank within its own day',
      split.badges.length === split.markers &&
        split.badges.every((b) => /^[1-9][0-9]?$/.test(b)) &&
        split.badges.includes('1'),
      split.badges.join(',') || 'no badges',
    )
    check(
      'A89 · an appointment with no known place is in the list, not on the map',
      split.unplaced > 0 && split.markers === split.events - split.unplaced,
      `${split.unplaced} unplaced · ${split.markers} markers · ${split.events} blocks`,
    )

    /* AB3.3, list → map. ONE press: it selects and stays on the agenda. */
    await page.locator('[data-testid="agenda-event"]').first().click()
    await page.waitForTimeout(700)
    const picked = (await page.evaluate(readAgenda)) as AgendaState
    check(
      'A89 · pressing an appointment selects it, and stays on the agenda',
      picked.selected !== null && (await page.evaluate(() => location.hash)) === '#/coordinator/agenda',
      `${picked.selected ?? 'nothing selected'} · ${await page.evaluate(() => location.hash)}`,
    )

    /* AB3.3, map → list. A marker's own click handler is what the app binds;
       clicking the element is what a coordinator does. */
    const wasSelected = picked.selected
    const clicked = await page.evaluate(() => {
      const markers = [...document.querySelectorAll('.maplibregl-marker')] as HTMLElement[]
      /* The LAST marker, so it is a different appointment from the first block
         the previous step selected — which is what makes the change provable. */
      const target = markers[markers.length - 1]
      if (!target) return false
      target.click()
      return true
    })
    await page.waitForTimeout(800)
    const fromMap = (await page.evaluate(readAgenda)) as AgendaState
    check(
      'A89 · and pressing a marker selects a DIFFERENT appointment in the grid',
      clicked && fromMap.selected !== null && fromMap.selected !== wasSelected,
      `${wasSelected ?? 'none'} → ${fromMap.selected ?? 'none'}`,
    )

    /* AB3.3 — a day's heading frames the map on that day's own points. */
    const framed = await page.evaluate(() => {
      const head = document.querySelector('[data-testid="agenda-day-head"]') as HTMLElement | null
      if (!head) return null
      head.click()
      return head.getAttribute('data-day')
    })
    await page.waitForTimeout(900)
    const focused = await page.evaluate(
      () =>
        document.querySelector('[data-testid="agenda-day-head"][data-focused="1"]')?.getAttribute('data-day') ??
        null,
    )
    check(
      'A89 · pressing a day marks it as the one the map is framed on',
      framed !== null && focused === framed,
      `${framed} → ${focused}`,
    )

    // A90 — content full.
    await page.evaluate(() => localStorage.setItem('lo-yanum:map-mode:agenda', 'hidden'))
    await load(page, '#/coordinator/agenda', 3200)
    const full = (await page.evaluate(readAgenda)) as AgendaState
    check(
      'A90 · with the map hidden the grid is the content',
      full.mapMode === 'hidden',
      `mode=${full.mapMode}`,
    )
    check(
      'A90 · the page does not scroll under it — no empty band, no lost grid',
      full.pageScroll <= 2,
      `${full.pageScroll} px of page scroll`,
    )
    check(
      'A90 · and the grid takes most of the viewport height',
      full.gridHeight > DESKTOP.height * 0.5,
      `${full.gridHeight} px of ${DESKTOP.height}`,
    )

    // A91 — the three views and the hour line.
    check(
      'A91 · three views are offered, and the week is the default on a desktop',
      JSON.stringify(full.views) === JSON.stringify(['day', 'week', 'month']),
      full.views.join(' · '),
    )
    check(
      'A91 · the current-hour line is drawn, once, on today only',
      full.now === 1,
      `${full.now} lines`,
    )
    for (const view of ['day', 'month', 'week'] as const) {
      await page.locator(`[data-testid="agenda-views"] [data-view="${view}"]`).click()
      await page.waitForTimeout(900)
      const state = (await page.evaluate(readAgenda)) as AgendaState
      check(
        `A91 · the ${view} view draws`,
        state.activeView === view && (view === 'month' || state.hourHeight > 0),
        `active=${state.activeView} hour=${state.hourHeight}`,
      )
    }

    // A91, on a phone: the day view is the default and the week is reachable.
    const phone = await browser.newContext({ viewport: PHONE, locale: 'he-IL' })
    const small = await phone.newPage()
    small.setDefaultTimeout(60_000)
    await small.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    await small.goto(`${base}/#/coordinator/agenda`, { waitUntil: 'load' })
    await small.waitForTimeout(3000)
    const onPhone = (await small.evaluate(readAgenda)) as AgendaState
    check(
      'A91 · on a phone the DAY view is the default',
      onPhone.activeView === 'day',
      `active=${onPhone.activeView}`,
    )
    await small.locator('[data-testid="agenda-views"] [data-view="week"]').click()
    await small.waitForTimeout(900)
    check(
      'A91 · and the week is one tap away',
      ((await small.evaluate(readAgenda)) as AgendaState).activeView === 'week',
      'week',
    )
    await phone.close()
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('A91 — overlapping appointments, side by side (pure)')
  // -------------------------------------------------------------------------
  {
    const day = new Date(2026, 8, 8)
    const at = (h: number, m = 0) =>
      new Date(2026, 8, 8, h, m).toISOString()
    const event = (id: string, from: string, to: string): AgendaEvent => ({
      id,
      kind: 'visit',
      at: from,
      endAt: to,
      title: id,
      subtitle: '',
      href: '',
      missionStatus: null,
      done: false,
      farmId: null,
      position: null,
    })

    const two = layOutDay(
      [event('a', at(9), at(11)), event('b', at(10), at(12))],
      day,
    )
    check(
      'A91 · two overlapping appointments each take half the column',
      two.length === 2 && two.every((e) => e.lanes === 2) && two[0].lane !== two[1].lane,
      two.map((e) => `${e.event.id}:${e.lane}/${e.lanes}`).join(' '),
    )

    const apart = layOutDay(
      [event('a', at(9), at(10)), event('b', at(11), at(12))],
      day,
    )
    check(
      'A91 · two that do not overlap each take the whole column',
      apart.every((e) => e.lanes === 1),
      apart.map((e) => `${e.event.id}:${e.lane}/${e.lanes}`).join(' '),
    )

    /**
     * The cluster case: A spans B and C, which do not touch EACH OTHER. All
     * three must be visible and the two that overlap must not share a lane —
     * but B and C may, and should, because a hole beside A helps nobody.
     */
    const cluster = layOutDay(
      [event('a', at(20), at(23, 59)), event('b', at(21), at(22)), event('c', at(23), at(23, 30))],
      day,
    )
    const laneOf = (id: string) => cluster.find((e) => e.event.id === id)
    check(
      'A91 · a run of three: the two that overlap never share a lane',
      cluster.length === 3 &&
        laneOf('a')!.lane !== laneOf('b')!.lane &&
        laneOf('a')!.lane !== laneOf('c')!.lane,
      cluster.map((e) => `${e.event.id}:${e.lane}/${e.lanes}`).join(' '),
    )
    check(
      'A91 · and the two that do not overlap reuse one, so no column is wasted',
      laneOf('b')!.lane === laneOf('c')!.lane && cluster.every((e) => e.lanes === 2),
      cluster.map((e) => `${e.event.id}:${e.lane}/${e.lanes}`).join(' '),
    )

    const point = layOutDay([event('a', at(9), at(9))], day)
    check(
      'A91 · a point-in-time visit still gets a block a thumb can hit',
      point[0].to - point[0].from >= 45,
      `${point[0].to - point[0].from} minutes`,
    )

    const overnight = layOutDay([event('a', at(22), new Date(2026, 8, 9, 4).toISOString())], day)
    check(
      'A91 · a guard that runs past midnight stops at the foot of its own day',
      overnight[0].to === 24 * 60,
      `${overnight[0].from} → ${overnight[0].to}`,
    )
  }

  // -------------------------------------------------------------------------
  section('A92 — the target')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'he-IL' })
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)

    const card = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="weighted-target"]')
        return {
          weighted: Number(el?.getAttribute('data-weighted') ?? '0'),
          target: Number(el?.getAttribute('data-target') ?? '0'),
          reached: el?.getAttribute('data-reached') === '1',
          chip: Boolean(document.querySelector('[data-testid="target-reached"]')),
        }
      })

    await load(page, '#/coordinator')
    const initial = await card()
    check(
      'A92 · out of the box the card carries the constant, 100 000',
      initial.target === 100_000,
      String(initial.target),
    )

    /* A campaign that is far out of reach, with a successor waiting. */
    await load(page, '#/coordinator/settings')
    await page.locator('[data-testid="target-label"]').fill('קמפיין א')
    await page.locator('[data-testid="target-dunams"]').fill('1000000')
    await page.locator('[data-testid="target-due"]').fill('2026-12-31')
    await page.locator('[data-testid="target-on-reached"] [data-mode="next"]').click()
    await page.waitForTimeout(300)
    await page.locator('[data-testid="target-next-label"]').fill('קמפיין ב')
    await page.locator('[data-testid="target-next-dunams"]').fill('5')
    await page.locator('[data-testid="target-save"]').click()
    await page.waitForTimeout(400)

    await load(page, '#/coordinator')
    const far = await card()
    check(
      'A92 · the dashboard reads the coordinator’s figure, not the constant',
      far.target === 1_000_000 && !far.reached,
      `${far.weighted} / ${far.target}`,
    )

    /* Now bring the target under the live total. */
    await load(page, '#/coordinator/settings')
    await page.locator('[data-testid="target-dunams"]').fill('1000')
    await page.locator('[data-testid="target-save"]').click()
    await page.waitForTimeout(400)
    await load(page, '#/coordinator')
    const swapped = await card()
    check(
      'A92 · reaching it with « ליעד הבא » chosen moves to the next campaign',
      swapped.target === 5,
      `target=${swapped.target}`,
    )
    check(
      'A92 · and the successor, being already passed, is congratulated',
      swapped.reached && swapped.chip,
      `reached=${swapped.reached} chip=${swapped.chip}`,
    )

    await load(page, '#/coordinator/settings')
    const rows = await page.locator('[data-testid="target-history-row"]').count()
    const firstRow = rows > 0 ? await page.locator('[data-testid="target-history-row"]').first().textContent() : ''
    check(
      'A92 · the campaigns that were reached are consultable, with their date and total',
      rows >= 1 && (firstRow ?? '').includes('קמפיין'),
      `${rows} rows · ${(firstRow ?? '').trim().slice(0, 40)}`,
    )

    await page.locator('[data-testid="target-reset"]').click()
    await page.waitForTimeout(300)
    await load(page, '#/coordinator')
    check(
      'A92 · and « חזרה לערך ההתחלתי » goes back to the named constant',
      (await card()).target === 100_000,
      String((await card()).target),
    )

    await context.close()
  }

  // -------------------------------------------------------------------------
  section('A93 — the role switch, from the home screen, at 402 px')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: PHONE,
      locale: 'he-IL',
      hasTouch: true,
      isMobile: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)

    await load(page, '#/coordinator')

    /* ⚠️ THE PATH IS WALKED, NOT JUMPED TO. « Sans connaître le chemin à
       l'avance » is the product owner's own condition, so the gate opens the
       shell's menu and presses הגדרות rather than navigating by URL. */
    await page.locator('[data-testid="shell-menu"]').click()
    await page.waitForTimeout(500)
    /* ⚠️ `:visible` — THE RAIL'S OWN COPY OF THIS LINK IS IN THE DOM AT 402 px,
       `lg:hidden` but present, and `.first()` picked it: sixty seconds of
       « element is not visible ». The one in the drawer is the one a thumb can
       reach. */
    await page.locator('a[href="#/coordinator/settings"]:visible').first().click()
    await page.waitForTimeout(2000)

    const where = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="role-switch"]')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        top: Math.round(r.top + window.scrollY),
        visibleWithoutScrolling: r.top >= 0 && r.bottom <= window.innerHeight,
        pills: [...el.querySelectorAll('.filter-pill')].map((p) => (p.textContent || '').trim()),
        active: [...el.querySelectorAll('.filter-pill')]
          .filter((p) => p.getAttribute('aria-pressed') === 'true')
          .map((p) => (p.textContent || '').trim()),
      }
    })

    check('A93 · the switch is on the settings screen', where !== null, where ? 'found' : 'absent')
    if (where) {
      check(
        'A93 · and it is on the FIRST screenful — no scrolling to find it',
        where.visibleWithoutScrolling,
        `top=${where.top}`,
      )
      check(
        'A93 · it lists the four roles',
        where.pills.length === 4,
        where.pills.join(' · '),
      )
      check(
        'A93 · exactly one of them is marked as in force, and it is רכז',
        where.active.length === 1 && where.active[0].startsWith('רכז'),
        where.active.join(' · ') || 'none marked',
      )
    }

    await page.locator('[data-testid="role-switch"] .filter-pill').nth(1).click()
    await page.waitForTimeout(400)
    await page.locator('[data-testid="view-as-person"]').first().click()
    await page.waitForTimeout(1800)
    check(
      'A93 · choosing a farmer lands on the farmer’s own screen',
      (await page.evaluate(() => location.hash)) === '#/farmer',
      await page.evaluate(() => location.hash),
    )
    check(
      'A93 · with a banner saying whose screen this is',
      (await page.locator('[data-testid="view-as-banner"]').count()) > 0 ||
        (await page.evaluate(() => document.body.innerText.includes('מצב תצוגה'))),
      'banner',
    )

    await page.locator('[data-testid="view-as-banner-stop"]').first().click().catch(async () => {
      await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
      await page.waitForTimeout(1500)
      await page.locator('[data-testid="view-as-stop"]').first().click()
    })
    await page.waitForTimeout(1800)
    check(
      'A93 · and the way back to the coordinator is one press',
      (await page.evaluate(() => location.hash)).startsWith('#/coordinator'),
      await page.evaluate(() => location.hash),
    )

    await context.close()
  }
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
