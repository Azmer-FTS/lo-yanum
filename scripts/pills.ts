import { chromium, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AA1 — THE FILTER PILLS, UNDER A THUMB. A71 · A72 · A73 · A74.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run pills
 *   ENGINE=webkit bun run pills
 *
 * The product owner, on his iPhone: « les pilules n'ont pas la même taille,
 * des fois j'appuie sur une et ça appuie sur l'autre, je n'ai pas la place
 * pour mes doigts. »
 *
 * ★ THE TOUCH TARGET IS MEASURED, NOT READ OFF A CLASS NAME. A pill may
 *   legitimately carry a hit area LARGER than the ink it draws — that is the
 *   product owner's own permission ("la zone tactile peut dépasser le visuel
 *   sans l'alourdir visuellement") — so `getBoundingClientRect()` is the wrong
 *   ruler: it measures the ink and knows nothing about a `::before` that
 *   extends the button. What this gate does instead is WALK OUTWARD from the
 *   centre of each pill, one pixel at a time, asking `elementFromPoint` who
 *   owns that point, and stops when the answer stops being this pill. The
 *   rectangle that comes back is the real hit area, whatever drew it.
 *
 *   The same walk is what makes the OVERLAP question answerable: if two hit
 *   areas overlap, the walk from the first one stops early — because
 *   `elementFromPoint` returns the neighbour, which is exactly the defect the
 *   product owner is describing.
 *
 * ★ A71  a tap at the centre AND 4 px inside each edge of the hit area lands
 *        on the pill that was aimed at, on nine screens at 402 px.
 * ★ A72  every hit area is at least 44 × 44 px, and two neighbouring hit areas
 *        are at least 8 px apart.
 * ★ A73  on the phone the type pills are all the same width, in a grid, and
 *        the region selector is a drop-down of its own on its own line.
 * ★ A74  on iPad and desktop the pills are visible at rest WHEN THE PANEL HAS
 *        THE ROOM — see AB2, which replaced « is this a phone » with « do they
 *        fit here », and the note beside the check itself.
 * ★★ A85 (AB1) the "+" offers only what the CURRENT screen can create, and
 *        opens it directly when there is only one.
 * ★★ A86 (AB1.4) the "+" does not sit on any touch target — on all nine
 *        screens, not only on the one where it was found.
 */

const PORT = Number(process.env.PILLS_PORT ?? 5209)
const OUT_DIR = 'dist-pills'
const ENGINE = process.env.ENGINE === 'webkit' ? webkit : chromium
const ENGINE_NAME = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'

/** Apple's own floor, and the one the product owner's thumb is asking for. */
const MIN_TARGET = 44
/** « Écart minimal de 8 px entre deux cibles tactiles voisines. » */
const MIN_GAP = 8

const PHONE = { name: 'iphone', width: 402, height: 874 } as const
const WIDE = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'desktop', width: 1376, height: 1032 },
] as const

/** Nine screens that carry a filter row, at 402 px. */
const SCREENS = [
  { name: 'ייבוא', key: null, hash: '#/coordinator/import/farms' },
  { name: 'חוות', key: 'farms', hash: '#/coordinator/farms' },
  { name: 'מתנדבים', key: 'volunteers', hash: '#/coordinator/volunteers' },
  { name: 'נהגים', key: 'drivers', hash: '#/coordinator/drivers' },
  { name: 'שמירות', key: 'missions', hash: '#/coordinator/missions' },
  { name: 'אירועים', key: 'incidents', hash: '#/coordinator/incidents' },
  { name: 'מסלול', key: 'route', hash: '#/coordinator/route' },
  { name: 'יומן', key: 'agenda', hash: '#/coordinator/agenda' },
  { name: 'הגדרות', key: null, hash: '#/coordinator/settings' },
] as const

/**
 * ★★ A85 (AB1) — WHAT EACH SCREEN MAY CREATE, TRANSCRIBED FROM THE BRIEF AND
 *    NOT FROM `ActionFab`.
 *
 *   חוות / מושבים  → nouvelle ferme, nouveau moshav
 *   מתנדבים        → nouveau volontaire
 *   נהגים מתנדבים  → nouveau conducteur
 *   שמירות         → nouvelle garde
 *   אירועים        → nouvel événement
 *   יומן           → nouveau rendez-vous, nouvelle garde
 *   מסלול          → nouvelle étape
 *   לוח בקרה       → l'ensemble, c'est l'écran d'accueil
 *
 * `null` means the screen has no "+" at all — הגדרות and the import wizard
 * create nothing, and a button offering "a farm" there is the defect this
 * whole unit is about.
 */
const FAB_SCREENS = [
  {
    name: 'לוח בקרה',
    hash: '#/coordinator',
    expect: ['farm', 'moshav', 'volunteer', 'driver', 'mission', 'visit', 'meeting', 'incident'],
  },
  { name: 'חוות', hash: '#/coordinator/farms', expect: ['farm', 'moshav'] },
  { name: 'מתנדבים', hash: '#/coordinator/volunteers', expect: ['volunteer'] },
  { name: 'נהגים', hash: '#/coordinator/drivers', expect: ['driver'] },
  { name: 'שמירות', hash: '#/coordinator/missions', expect: ['mission'] },
  { name: 'אירועים', hash: '#/coordinator/incidents', expect: ['incident'] },
  { name: 'יומן', hash: '#/coordinator/agenda', expect: ['visit', 'meeting', 'mission'] },
  { name: 'מסלול', hash: '#/coordinator/route', expect: ['step'] },
  { name: 'הגדרות', hash: '#/coordinator/settings', expect: null },
  { name: 'ייבוא', hash: '#/coordinator/import/farms', expect: null },
] as const

interface FabState {
  count: number
  direct: string | null
}

/** ⚠️ A REAL FUNCTION, like every other probe here. See the note above. */
function readFab(): FabState | null {
  const root = document.querySelector('[data-testid="action-fab"]')
  if (!root) return null
  const toggle = document.querySelector('[data-testid="action-fab-toggle"]')
  return {
    count: Number(root.getAttribute('data-fab-count') ?? '0'),
    direct: toggle ? toggle.getAttribute('data-fab-direct') : null,
  }
}

/**
 * Which PINNED controls the "+" rectangle overlaps. See the note at the call
 * site for why the question is restricted to pinned things and to pills.
 */
function fabCollisions(): string[] {
  const fab = document.querySelector('[data-testid="action-fab"]')
  if (!fab) return []
  const f = fab.getBoundingClientRect()
  const hits: string[] = []

  const overlaps = (r: DOMRect): boolean =>
    r.width > 1 &&
    r.height > 1 &&
    r.left < f.right &&
    f.left < r.right &&
    r.top < f.bottom &&
    f.top < r.bottom

  const label = (el: Element): string => {
    const id = el.getAttribute('data-testid')
    if (id) return id
    const text = (el.textContent || '').trim().slice(0, 14)
    return text || el.tagName.toLowerCase()
  }

  const candidates = new Set<Element>()
  for (const el of document.querySelectorAll('.filter-pill')) candidates.add(el)
  for (const el of document.querySelectorAll(
    'button, a, select, input, [role="button"]',
  )) {
    if (fab.contains(el)) continue
    /* Pinned to the viewport, or inside something that is. */
    let node: Element | null = el
    while (node && node !== document.body) {
      const pos = getComputedStyle(node).position
      if (pos === 'fixed' || pos === 'sticky') {
        candidates.add(el)
        break
      }
      node = node.parentElement
    }
  }

  for (const el of candidates) {
    if (fab.contains(el)) continue
    /* The map's mode pill is RAISED above the button deliberately (U4.4) and
       declares itself an overlay, exactly as the button does. */
    if (el.closest('[data-overlay]') && !el.closest('[data-filter-row]')) continue
    if (overlaps(el.getBoundingClientRect())) hits.push(label(el))
  }
  return hits
}

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
console.log(`  A71 · A72 · A73 · A74 — THE FILTER PILLS UNDER A THUMB (${ENGINE_NAME})`)
console.log('  ==========================================================')

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

async function load(page: Page, hash: string): Promise<void> {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(2400)
}

/** Open the « סינון » panel when the row is in its folded shape. */
async function openFilters(page: Page): Promise<boolean> {
  const button = page.locator('[data-testid="filter-dropdown"]').first()
  if ((await button.count()) === 0) return false
  if ((await page.locator('[data-testid="filter-dropdown-panel"]').count()) > 0) return true
  await button.click()
  await page.waitForTimeout(350)
  return true
}

interface HitBox {
  id: number
  label: string
  /** The ink. */
  box: { x: number; y: number; w: number; h: number }
  /** The measured hit area — walked outward with `elementFromPoint`. */
  hit: { x: number; y: number; w: number; h: number }
  /** Centre + the four 4-px-inside-the-edge probes, each true when it lands. */
  taps: { centre: boolean; start: boolean; end: boolean; top: boolean; bottom: boolean }
}

/**
 * ⚠️ PASSED AS A FUNCTION, NOT AS A TEMPLATE LITERAL. The previous three
 *    passes lost an afternoon each to a probe written as a string: a
 *    backslash-s inside one becomes a plain "s", and a back-quote inside a
 *    COMMENT inside one ends the string. Playwright serialises a real function
 *    for us, so the source below is checked by the TypeScript compiler like
 *    any other code in this repository.
 */
function probePills(limit: number): HitBox[] {
  const pills = [...document.querySelectorAll('.filter-pill')].filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 4 && r.height > 4 && r.top > -1 && r.bottom < window.innerHeight + 1
  })

  const owner = (x: number, y: number): Element | null => {
    const el = document.elementFromPoint(x, y)
    return el ? el.closest('.filter-pill') : null
  }

  return pills.map((el, i) => {
    const r = el.getBoundingClientRect()
    const cx = Math.round(r.left + r.width / 2)
    const cy = Math.round(r.top + r.height / 2)

    /**
     * Walk one pixel at a time until this pill stops owning the point.
     *
     * ⚠️ THE CEILING IS RELATIVE TO THE INK, not a flat number. A flat 40 px
     *    reported an 81 px hit area for every pill wider than that, which made
     *    two wide neighbours look further apart than they are — a false PASS
     *    on exactly the question this gate exists to ask.
     */
    const reach = (dx: number, dy: number): number => {
      const ceiling =
        Math.ceil((dx !== 0 ? r.width : r.height) / 2) + limit
      let n = 0
      for (; n < ceiling; n++) {
        const x = cx + dx * (n + 1)
        const y = cy + dy * (n + 1)
        if (x < 1 || y < 1 || x > window.innerWidth - 2 || y > window.innerHeight - 2) break
        if (owner(x, y) !== el) break
      }
      return n
    }

    const left = reach(-1, 0)
    const right = reach(1, 0)
    const up = reach(0, -1)
    const down = reach(0, 1)

    const hit = {
      x: cx - left,
      y: cy - up,
      w: left + right + 1,
      h: up + down + 1,
    }

    /* 4 px INSIDE each edge of the hit area — a thumb landing on the rim of
       the target it aimed at, which is the case the product owner reports
       going to the neighbour. */
    const inset = 4
    const taps = {
      centre: owner(cx, cy) === el,
      start: owner(hit.x + inset, cy) === el,
      end: owner(hit.x + hit.w - 1 - inset, cy) === el,
      top: owner(cx, hit.y + inset) === el,
      bottom: owner(cx, hit.y + hit.h - 1 - inset) === el,
    }

    return {
      id: i,
      label: (el.textContent || '').trim().slice(0, 18) || `#${i + 1}`,
      box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      hit,
      taps,
    }
  })
}

/** Do two rectangles share any of the axis they are neighbours on? */
function overlaps(a: number, aLen: number, b: number, bLen: number): boolean {
  return a < b + bLen && b < a + aLen
}

let browser: Browser | undefined

try {
  browser = await ENGINE.launch()

  // -------------------------------------------------------------------------
  section('A71 · A72 — the thumb, on nine screens at 402 px')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: PHONE.width, height: PHONE.height },
      locale: 'he-IL',
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: ENGINE_NAME === 'chromium',
    })
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)

    for (const screen of SCREENS) {
      await load(page, screen.hash)
      await openFilters(page)
      const pills = (await page.evaluate(probePills, 40)) as HitBox[]

      if (pills.length === 0) {
        check(`A71 · ${screen.name}: at least one pill to aim at`, false, 'no pill found')
        continue
      }

      const missed = pills.filter(
        (p) => !p.taps.centre || !p.taps.start || !p.taps.end || !p.taps.top || !p.taps.bottom,
      )
      check(
        `A71 · ${screen.name}: ${pills.length} pills, centre + 4 px from each edge`,
        missed.length === 0,
        missed
          .map(
            (p) =>
              `${p.label} [${Object.entries(p.taps)
                .filter(([, ok]) => !ok)
                .map(([k]) => k)
                .join(',')}]`,
          )
          .join(' · ') || 'every tap landed on its own pill',
      )

      const small = pills.filter((p) => p.hit.w < MIN_TARGET || p.hit.h < MIN_TARGET)
      check(
        `A72 · ${screen.name}: every hit area ≥ ${MIN_TARGET}×${MIN_TARGET}`,
        small.length === 0,
        small.map((p) => `${p.label} ${p.hit.w}×${p.hit.h}`).join(' · ') ||
          `smallest ${Math.min(...pills.map((p) => Math.min(p.hit.w, p.hit.h)))}`,
      )

      const tight: string[] = []
      for (let i = 0; i < pills.length; i++) {
        for (let j = i + 1; j < pills.length; j++) {
          const a = pills[i].hit
          const b = pills[j].hit
          const sameRow = overlaps(a.y, a.h, b.y, b.h)
          const sameCol = overlaps(a.x, a.w, b.x, b.w)
          if (sameRow && sameCol) {
            tight.push(`${pills[i].label}/${pills[j].label} OVERLAP`)
            continue
          }
          const gap = sameRow
            ? Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))
            : sameCol
              ? Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))
              : Infinity
          if (gap < MIN_GAP) tight.push(`${pills[i].label}/${pills[j].label} ${gap}px`)
        }
      }
      check(
        `A72 · ${screen.name}: neighbouring hit areas ≥ ${MIN_GAP} px apart`,
        tight.length === 0,
        tight.slice(0, 6).join(' · ') || 'no two targets closer than 8 px',
      )
    }

    // -----------------------------------------------------------------------
    section('A73 — equal widths in a grid, and the region on its own line')
    // -----------------------------------------------------------------------
    await load(page, '#/coordinator/farms')
    await openFilters(page)

    const types = (await page.evaluate(() =>
      [...document.querySelectorAll('[data-pill-group="farm-type"] .filter-pill')].map((el) => {
        const r = el.getBoundingClientRect()
        return { label: (el.textContent || '').trim().slice(0, 14), w: Math.round(r.width), y: Math.round(r.top) }
      }),
    )) as { label: string; w: number; y: number }[]

    check(
      'A73 · חוות: the three type pills are on the phone',
      types.length === 3,
      types.map((t) => t.label).join(' · ') || 'group not found',
    )
    const widths = [...new Set(types.map((t) => t.w))]
    check(
      'A73 · חוות: the three type pills are the same width',
      types.length === 3 && widths.length === 1,
      types.map((t) => `${t.label}=${t.w}`).join(' · '),
    )

    const region = (await page.evaluate(() => {
      const el = document.querySelector('[data-testid="farms-region"]')
      if (!el) return null
      const r = el.getBoundingClientRect()
      const select = el.querySelector('select')
      /* The line it has to fill is the CONTENT box of whatever holds it — the
         drop-down panel carries 12 px of padding, and a control that filled
         the border box would be one that overflows it. */
      const parent = el.parentElement
      const cs = parent ? getComputedStyle(parent) : null
      const inner = parent
        ? parent.getBoundingClientRect().width -
          parseFloat(cs ? cs.paddingLeft : '0') -
          parseFloat(cs ? cs.paddingRight : '0')
        : r.width
      return {
        w: Math.round(r.width),
        rowW: Math.round(inner),
        block: el.getAttribute('data-shape'),
        hasSelect: Boolean(select),
        chevron: Boolean(el.querySelector('[data-chevron]')),
      }
    })) as {
      w: number
      rowW: number
      block: string | null
      hasSelect: boolean
      chevron: boolean
    } | null

    check(
      'A73 · חוות: the region selector is a drop-down on its own line',
      region !== null && region.block === 'block' && region.hasSelect && region.w >= region.rowW - 2,
      region ? `shape=${region.block} w=${region.w}/${region.rowW}` : 'not found',
    )
    check(
      'A73 · חוות: the region drop-down carries a downward chevron',
      region !== null && region.chevron,
      region ? String(region.chevron) : 'not found',
    )

    await context.close()
  }

  // -------------------------------------------------------------------------
  section('A85 · A86 — the "+", on the nine screens')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: PHONE.width, height: PHONE.height },
      locale: 'he-IL',
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: ENGINE_NAME === 'chromium',
    })
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)

    for (const screen of FAB_SCREENS) {
      await load(page, screen.hash)

      const state = (await page.evaluate(readFab)) as FabState | null
      if (screen.expect === null) {
        check(
          `A85 · ${screen.name}: no "+" — this screen creates nothing`,
          state === null,
          state ? `${state.count} actions offered` : 'absent',
        )
        continue
      }

      check(
        `A85 · ${screen.name}: the "+" offers exactly ${screen.expect.length}`,
        state !== null && state.count === screen.expect.length,
        state ? `${state.count}` : 'no "+" at all',
      )

      if (state === null) continue

      if (screen.expect.length === 1) {
        /* AB1.2 — « un menu à un seul choix est un clic perdu ». */
        check(
          `A85 · ${screen.name}: one creation, so the "+" IS it — no menu`,
          state.direct === screen.expect[0],
          `direct=${state.direct ?? 'null'}`,
        )
        await page.locator('[data-testid="action-fab-toggle"]').click()
        await page.waitForTimeout(900)
        /**
         * ⚠️ « OPENED » IS NOT ALWAYS « NAVIGATED », AND מסלול IS WHY. Four of
         *    the five single-action screens leave for a form or open a modal;
         *    the planner's ÉTAPE is a block on the screen you are already on,
         *    so its `?new=step` is read and CLEARED (see the note in
         *    `RoutePlannerScreen`) and the hash comes back to where it was. The
         *    proof there is the block: forced open, whatever the coordinator
         *    had folded it to.
         */
        const opened =
          screen.expect[0] === 'step'
            ? (await page.locator('[data-block="route-select"][data-open="1"]').count()) > 0
            : !(await page.evaluate(() => location.hash)).endsWith(screen.hash.slice(1)) ||
              (await page.locator('[role="dialog"]').count()) > 0
        check(
          `A85 · ${screen.name}: pressing it opens ${screen.expect[0]} straight away`,
          opened,
          await page.evaluate(() => location.hash),
        )
      } else {
        await page.locator('[data-testid="action-fab-toggle"]').click()
        await page.waitForTimeout(400)
        const items = (await page.evaluate(() =>
          [...document.querySelectorAll('[data-fab-item]')].map((el) =>
            el.getAttribute('data-fab-item'),
          ),
        )) as string[]
        check(
          `A85 · ${screen.name}: the menu is ${screen.expect.join(' · ')} and nothing else`,
          JSON.stringify(items) === JSON.stringify(screen.expect),
          items.join(' · ') || 'menu not found',
        )
        await page.keyboard.press('Escape')
        await page.waitForTimeout(250)
      }
    }

    /**
     * ★★ A86 — THE "+" COVERS NO TOUCH TARGET.
     *
     * AA1.5 found it on מתנדבים, where the button sat on the last filter pill
     * and reduced its hit area to 1 × 1 px. What is measured here is the
     * general form of that: the button's rectangle against every PINNED
     * control on the screen — the filter row, the shell's header, the map's
     * own rail, the mode pill — plus every filter pill wherever it is.
     *
     * ⚠️ IT IS RESTRICTED TO PINNED THINGS AND TO PILLS, AND THAT IS NOT A
     *    WEAKENING. A floating button is over the list underneath it BY
     *    CONSTRUCTION — that is what floating means, and `--float-reserve`
     *    already stops the last ROW from ending under it. What must never
     *    happen is that it lands on something that cannot be scrolled out
     *    from under it, because that control is then unreachable for ever.
     */
    for (const screen of SCREENS) {
      for (const withPanel of [false, true]) {
        await load(page, screen.hash)
        if (withPanel && !(await openFilters(page))) continue
        const hits = (await page.evaluate(fabCollisions)) as string[]
        check(
          `A86 · ${screen.name}${withPanel ? ' (filters open)' : ''}: the "+" is on nothing`,
          hits.length === 0,
          hits.slice(0, 4).join(' · ') || 'no pinned control under it',
        )
      }
    }

    await context.close()
  }

  // -------------------------------------------------------------------------
  section('A74 — on iPad and desktop the pills are visible when they fit')
  // -------------------------------------------------------------------------
  for (const vp of WIDE) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'he-IL',
      deviceScaleFactor: 2,
      hasTouch: vp.name === 'ipad',
    })
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)

    /**
     * ★★ A74, REWRITTEN BY AB2, AND THE MEASUREMENT IS WHY.
     *
     * AA1.5's rule was « on iPad and desktop the pills are visible, never
     * behind סינון », and it was enforced by asking the DEVICE. AB2 replaces
     * the question with « do they fit in the box they are in », because AB2.3
     * names the case the device question gets wrong: an iPad in split view has
     * a phone's panel and must fold like one.
     *
     * ⚠️ AND ON THIS APP'S OWN DEFAULT LAYOUT THAT IS NOT A THEORETICAL CASE.
     *    The content column is a THIRD of the row, so at 1376 px it is 395 px
     *    wide — measured — and שמירות needs 573 px of pills. So the honest
     *    assertion is no longer « never folded » but « folded exactly when
     *    they do not fit », and both halves are checked from the two numbers
     *    the row publishes (`data-fold-*`). A row that folds with room to
     *    spare is the AA1.5 regression and fails here.
     */
    for (const screen of SCREENS) {
      await load(page, screen.hash)
      const state = (await page.evaluate(() => {
        const row = document.querySelector('[data-filter-row]')
        return {
          found: Boolean(row),
          shape: row ? row.getAttribute('data-shape') : null,
          available: Number(row ? row.getAttribute('data-fold-available') : NaN),
          required: Number(row ? row.getAttribute('data-fold-required') : NaN),
          folded: document.querySelectorAll('[data-testid="filter-dropdown"]').length,
          pills: [...document.querySelectorAll('.filter-pill')].filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 4 && r.height > 4
          }).length,
        }
      })) as {
        found: boolean
        shape: string | null
        available: number
        required: number
        folded: number
        pills: number
      }

      if (!state.found) {
        check(
          `A74 · ${vp.name} · ${screen.name}: has a filter row`,
          state.pills > 0,
          `no [data-filter-row]; ${state.pills} pills`,
        )
        continue
      }

      const fits = Number.isFinite(state.required) && state.required <= state.available
      check(
        `A74 · ${vp.name} · ${screen.name}: ${fits ? 'they fit, so they are shown' : 'they do not fit, so they fold'}`,
        fits ? state.folded === 0 && state.pills > 0 : state.folded === 1,
        `${Math.round(state.required)} needed / ${state.available} available · shape=${state.shape}`,
      )
    }

    /* And the hit areas hold at these widths too — an iPad is a touch screen. */
    await load(page, '#/coordinator/farms')
    const wide = (await page.evaluate(probePills, 40)) as HitBox[]
    const small = wide.filter((p) => p.hit.w < MIN_TARGET || p.hit.h < MIN_TARGET)
    check(
      `A72 · ${vp.name} · חוות: every hit area ≥ ${MIN_TARGET}×${MIN_TARGET}`,
      small.length === 0,
      small.map((p) => `${p.label} ${p.hit.w}×${p.hit.h}`).join(' · ') || `${wide.length} pills`,
    )

    await context.close()
  }
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed  (${ENGINE_NAME})`)
console.log('')
if (failed > 0) process.exit(1)
