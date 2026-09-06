import { chromium, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Y5 · Y6 · Y7 · Y8 — THE TOP OF A LIST. A57 · A58 · A59.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run rhythm
 *   ENGINE=webkit bun run rhythm
 *
 * Four reports, one region of the screen, and each one is a MEASUREMENT here
 * rather than a look at a capture — which is the whole reason the previous
 * pass could sign off on a header the product owner then found broken:
 *
 *   A57 (Y5)  every swipable row STARTS on the content margin — "la première
 *             carte est collée au bord droit du panneau, hors de l'alignement
 *             du contenu" — and no row is at an intermediate scroll position
 *             at rest.
 *   A58 (Y7)  nothing is painted over a sticky header, in split AND in full
 *             screen, on every list and every table — "les cartes défilent
 *             derrière l'en-tête sticky et restent visibles au-dessus de lui".
 *   A59 (Y8)  no floating panel covers a piece of content.
 *   Y6        the vertical rhythm is one rhythm: title, KPI row, filter row,
 *             content, with a frank and IDENTICAL gap, and no two blocks
 *             touching. And "מוצגים X מתוך Y" appears once per screen.
 *
 * ★ HOW A58 IS ASKED, because it is the one a screenshot cannot answer. The
 *   list is scrolled, and then `document.elementFromPoint` is called on a grid
 *   of points INSIDE the sticky header's own rectangle. Anything that comes
 *   back which is not a descendant of the header is, by definition, painted on
 *   top of it. Translucency is caught separately: the header's computed
 *   background must be fully opaque, because a 95 % surface over a moving list
 *   is exactly what he is looking at and `elementFromPoint` cannot see
 *   through it.
 */

const PORT = Number(process.env.RHYTHM_PORT ?? 5201)
const OUT_DIR = 'dist-rhythm'
const SHOTS = 'docs/screenshots/rhythm'
const ENGINE = process.env.ENGINE === 'webkit' ? webkit : chromium
const ENGINE_NAME = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'

const ALL_VIEWPORTS = [
  { name: 'iphone', width: 402, height: 874 },
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
] as const

/** `VIEWPORT=ipad bun run rhythm` — one reading, for iterating on a fix. */
const VIEWPORTS = process.env.VIEWPORT
  ? ALL_VIEWPORTS.filter((v) => v.name === process.env.VIEWPORT)
  : ALL_VIEWPORTS

/**
 * The screens the reports name, plus the dashboard (whose two rows are the
 * first two examples in Y5) and the farm sheet (the third).
 */
const SCREENS = [
  { name: 'לוח בקרה', key: null, hash: '#/coordinator' },
  { name: 'חוות', key: 'farms', hash: '#/coordinator/farms' },
  { name: 'מתנדבים', key: 'volunteers', hash: '#/coordinator/volunteers' },
  { name: 'נהגים', key: 'drivers', hash: '#/coordinator/drivers' },
  { name: 'שמירות', key: 'missions', hash: '#/coordinator/missions' },
  { name: 'אירועים', key: 'incidents', hash: '#/coordinator/incidents' },
] as const

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
console.log(`  A57 · A58 · A59 — THE TOP OF A LIST (${ENGINE_NAME})`)
console.log('  =====================================================')

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

async function load(page: Page, hash: string, key: string | null, mode: string): Promise<void> {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  if (key) {
    await page.evaluate(
      ([k, m]) => localStorage.setItem(`lo-yanum:map-mode:${k}`, m as string),
      [key, mode] as [string, string],
    )
  }
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(2600)
}

/** Scroll whatever actually scrolls on this screen, by `by` pixels. */
const SCROLL = `((by) => {
  const top = document.querySelector('[data-list-top]');
  let el = top ? top.parentElement : null;
  while (el) {
    const s = getComputedStyle(el);
    if (s.overflowY === 'auto' || s.overflowY === 'scroll') break;
    el = el.parentElement;
  }
  const target = el || document.scrollingElement;
  target.scrollTop = by;
  return target === document.scrollingElement ? 'page' : 'panel';
})`

/**
 * A58 — who is painted over the sticky header, and is it opaque.
 *
 * ⚠️ THE OPACITY IS READ FROM THE COMPUTED BACKGROUND rather than from a class
 *    name, because `bg-surface-base/95` and `bg-surface-base` are one character
 *    apart in the source and a whole defect apart on the screen.
 */
const OVER_STICKY = `(() => {
  const out = [];
  const bars = document.querySelectorAll('[data-list-top], header[class*="sticky"], .sticky-top');
  bars.forEach((bar) => {
    const r = bar.getBoundingClientRect();
    if (r.height < 8 || r.width < 8) return;
    const bg = getComputedStyle(bar).backgroundColor;
    const alpha = /rgba?\\(([^)]+)\\)/.exec(bg);
    const parts = alpha ? alpha[1].split(',').map((v) => parseFloat(v)) : [];
    const opaque = parts.length < 4 || parts[3] >= 0.999;
    const intruders = [];
    /* AND THE STRIP ABOVE IT, which is where the defect actually shows.
       A sticky element pins to its scrollport's PADDING box, and the content
       column carries pt-5 — so the header stops 20 px short of the top of
       the scroller and the cards scroll through the band above it. Probing
       only inside the header's own rectangle misses this completely, which is
       how a capture-based review signed it off. */
    let scroller = bar.parentElement;
    while (scroller) {
      const s2 = getComputedStyle(scroller);
      if (s2.overflowY === 'auto' || s2.overflowY === 'scroll') break;
      scroller = scroller.parentElement;
    }
    const portTop = scroller ? scroller.getBoundingClientRect().top : 0;
    for (let y = portTop + 2; y < r.top - 1; y += 6) {
      for (let x = r.left + 10; x < r.right - 10; x += 40) {
        const el = document.elementFromPoint(x, y);
        /* ★ WHAT COUNTS AS AN INTRUDER IS CONTENT, and the list is closed.
           The band above a pinned header is legitimately occupied by things
           that are not content and cannot be seen: the scroller itself, the
           pull-to-refresh wrapper, and — where the PAGE scrolls rather than a
           panel — the shell's own header, which is above this one by design.
           The defect being measured is a CARD visible above the header, so the
           question asked is whether the hit landed on one. */
        const item = el && el.closest('[data-tile], [data-row], .card, article, li, a[href], img');
        if (item && !bar.contains(item)) {
          intruders.push('ABOVE ' + (item.outerHTML || '').slice(0, 70));
        }
      }
    }
    for (let y = r.top + 4; y < r.bottom - 3; y += 10) {
      for (let x = r.left + 10; x < r.right - 10; x += 40) {
        const el = document.elementFromPoint(x, y);
        /* ★ THE SAME RULE AS THE BAND ABOVE: an intruder is CONTENT. WebKit
           answers this probe with the SCROLL CONTAINER at several points
           inside a sticky header — its hit-testing walks to the scroller
           rather than to the pinned child — which is not something anybody can
           see and is not what the report is about. A card over the header is.
           Chromium and WebKit agree on that question. */
        const item = el && el.closest('[data-tile], [data-row], .card, article, li, a[href], img');
        if (item && !bar.contains(item)) {
          intruders.push(item.tagName + '.' + String(item.className).slice(0, 40));
        }
      }
    }
    out.push({
      what: bar.getAttribute('data-testid') || bar.tagName,
      opaque,
      bg,
      intruders: intruders.slice(0, 4),
      count: intruders.length,
    });
  });
  return out;
})()`

/**
 * A57 — every swipable row, its resting scroll position, and where its first
 * child starts against the screen's own content margin.
 */
const ROWS = `(() => {
  const title = document.querySelector('[data-page-title]') || document.querySelector('h1');
  const tr = title ? title.getBoundingClientRect() : null;
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
  const out = [];
  document.querySelectorAll('.scroll-row, .carousel-2').forEach((row) => {
    const rr = row.getBoundingClientRect();
    const first = row.firstElementChild;
    if (!first || !tr) return;
    const fr = first.getBoundingClientRect();
    // The START edge, whichever way the writing runs.
    const rowStart = rtl ? rr.right : rr.left;
    const firstStart = rtl ? fr.right : fr.left;
    const titleStart = rtl ? tr.right : tr.left;
    out.push({
      what: row.getAttribute('data-testid') || String(row.className).split(' ')[0],
      overflow: row.scrollWidth - row.clientWidth > 2,
      resting: Math.round(Math.abs(row.scrollLeft)),
      fromTitle: Math.round(rtl ? titleStart - firstStart : firstStart - titleStart),
      bleed: Math.round(rtl ? rowStart - firstStart : firstStart - rowStart),
      fade: row.getAttribute('data-overflow'),
    });
  });
  return out;
})()`

/**
 * Y6 — the vertical rhythm inside the sticky top, and the single counter.
 *
 * ⚠️ IT MEASURES WHAT IS DRAWN, NOT THE BOXES. A `.scroll-row`'s box reaches
 *    0.75 rem past its cards at each end — that is the room a card's drop
 *    shadow needs — so comparing box edges reports a gap that is 24 px smaller
 *    than the one the eye sees, and would call a comfortable layout "touching".
 *    First and last CHILD, therefore.
 *
 * ⚠️ AND THE COUNTER IS COUNTED BY ITS TEXT. "Sur חוות il est affiché en
 *    pastille ET dans le popover de filtres" — two different elements with two
 *    different classes saying the same sentence, which a selector on
 *    `[data-list-count]` cannot see. The pattern is the sentence itself.
 */
const RHYTHM = `(() => {
  const top = document.querySelector('[data-list-top]');
  if (!top) return null;
  const title = top.querySelector('[data-title-row]');
  const kpis = top.querySelector('[data-testid="kpi-strip"]');
  const filters = top.querySelector('.scroll-row:not([data-testid="kpi-strip"]), [data-testid="filter-dropdown"]');
  const painted = (el, which) => {
    if (!el) return null;
    if (!el.classList || !el.classList.contains('scroll-row')) return el;
    return which === 'first' ? el.firstElementChild : el.lastElementChild;
  };
  const gap = (a, b) => {
    const x = painted(a, 'last');
    const y = painted(b, 'first');
    return x && y ? Math.round(y.getBoundingClientRect().top - x.getBoundingClientRect().bottom) : null;
  };
  /* ⚠️ THE ESCAPES ARE DOUBLED because this whole probe is a TEMPLATE
     LITERAL: a single backslash-s in one of those is the letter s, so the
     first version of this regex read /counters+d+/ and reported zero on every
     screen — a check that passed because it could not see its own subject.
     Same trap as a backtick inside one of these comments. */
  let counters = 0;
  document.querySelectorAll('span, p, div, li').forEach((el) => {
    if (el.children.length) return;
    if (/מוצגים\\s+\\d+\\s+מתוך\\s+\\d+/.test(el.textContent || '')) counters++;
  });
  return {
    titleToKpis: gap(title, kpis),
    kpisToFilters: gap(kpis, filters),
    counters,
    stickyBottom: Math.round(top.getBoundingClientRect().bottom),
  };
})()`

/** A59 — a floating panel that covers a piece of content. */
const FLOATERS = `(() => {
  const out = [];
  document.querySelectorAll('[data-testid="filter-dropdown-panel"], [data-region-panel]').forEach((panel) => {
    const pr = panel.getBoundingClientRect();
    if (pr.height < 4) return;
    let hidden = 0;
    /* ★ THE QUESTION IS "IS THIS ITEM STILL REACHABLE", not "do two rectangles
       intersect". A list item that is under the STICKY HEADER intersects
       anything drawn in the header and is supposed to — that is what a sticky
       header does. What must not happen is an item that the panel itself has
       put out of reach. So each item is asked at its own centre whether the
       browser would deliver a tap to it. */
    document.querySelectorAll('[data-tile], [data-row], .card').forEach((item) => {
      const ir = item.getBoundingClientRect();
      if (ir.height < 4 || ir.top < 0 || ir.bottom > innerHeight) return;
      const el = document.elementFromPoint((ir.left + ir.right) / 2, (ir.top + ir.bottom) / 2);
      if (el && panel.contains(el)) hidden++;
    });
    out.push({ what: panel.getAttribute('data-testid') || 'region-panel', hidden });
  });
  return out;
})()`

let browser: Browser | null = null
try {
  browser = await ENGINE.launch()
  await Bun.$`mkdir -p ${SHOTS}`.quiet()

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)

    // The two modes the report distinguishes: the split panel and the full
    // page. `hidden` is the map-less one, which is where the tables live.
    for (const mode of ['split', 'hidden'] as const) {
      section(`${vp.name} ${vp.width}×${vp.height} — mode ${mode}`)

      for (const screen of SCREENS) {
        if (screen.key === null && mode === 'hidden') continue
        await load(page, screen.hash, screen.key, mode)

        // ---------------------------------------------------------------- A57
        const rows = (await page.evaluate(ROWS)) as {
          what: string
          overflow: boolean
          resting: number
          fromTitle: number
          bleed: number
          fade: string | null
        }[]
        if (rows.length) {
          const off = rows.filter((r) => Math.abs(r.fromTitle) > 2)
          check(
            `A57 · ${screen.name}: every swipable row starts on the content margin`,
            off.length === 0,
            off.length
              ? off.map((r) => `${r.what} ${r.fromTitle > 0 ? '+' : ''}${r.fromTitle}px`).join(', ')
              : rows.map((r) => r.what).join(', '),
          )
          const scrolled = rows.filter((r) => r.resting > 2)
          check(
            `A57 · ${screen.name}: and none is at an intermediate scroll position at rest`,
            scrolled.length === 0,
            scrolled.map((r) => `${r.what} @${r.resting}`).join(', ') || `${rows.length} rows`,
          )
          const missingFade = rows.filter((r) => r.overflow && r.fade === null)
          check(
            `A57 · ${screen.name}: and a row with more beyond says so`,
            missingFade.length === 0,
            missingFade.map((r) => r.what).join(', ') ||
              rows.map((r) => `${r.what}:${r.fade ?? 'fits'}`).join(' '),
          )
        }

        // ---------------------------------------------------------------- A58
        await page.evaluate(`${SCROLL}(700)`)
        await page.waitForTimeout(450)
        const bars = (await page.evaluate(OVER_STICKY)) as {
          what: string
          opaque: boolean
          bg: string
          intruders: string[]
          count: number
        }[]
        const seeThrough = bars.filter((b) => !b.opaque)
        check(
          `A58 · ${screen.name}: every sticky bar is opaque`,
          seeThrough.length === 0,
          seeThrough.map((b) => `${b.what} ${b.bg}`).join(', ') || `${bars.length} bars`,
        )
        const covered = bars.filter((b) => b.count > 0)
        check(
          `A58 · ${screen.name}: and nothing is painted over one`,
          covered.length === 0,
          covered.map((b) => `${b.what}: ${b.intruders.join(' / ')}`).join(' — ') ||
            `${bars.length} bars, 0 intruders`,
        )

        // ------------------------------------------------------------------ Y6
        const rhythm = (await page.evaluate(RHYTHM)) as {
          titleToKpis: number | null
          kpisToFilters: number | null
          counters: number
          stickyBottom: number
        } | null
        if (rhythm) {
          const gaps = [rhythm.titleToKpis, rhythm.kpisToFilters].filter(
            (g): g is number => g !== null,
          )
          /**
           * "Un espacement franc et identique sur TOUS les écrans. Aucun bloc
           * ne doit se toucher." Franc: at least 12 px. Identique: within 3 px
           * of `--list-rhythm`'s 16, which is what makes it one rhythm rather
           * than three screens that each happen to look fine.
           */
          check(
            `Y6 · ${screen.name}: the header's blocks breathe, on one rhythm`,
            gaps.every((g) => g >= 12 && Math.abs(g - 16) <= 4),
            gaps.join(' / ') || 'no measurable gap',
          )
          check(
            `Y6 · ${screen.name}: "מוצגים X מתוך Y" appears once`,
            rhythm.counters <= 1,
            `${rhythm.counters} counters`,
          )
        }

        // ---------------------------------------------------------------- A59
        const dropdown = page.locator('[data-testid="filter-dropdown"]')
        if (await dropdown.count()) {
          await dropdown.first().click()
          await page.waitForTimeout(350)
          const floaters = (await page.evaluate(FLOATERS)) as { what: string; hidden: number }[]
          const masking = floaters.filter((f) => f.hidden > 0)
          check(
            `A59 · ${screen.name}: the filter panel covers no content`,
            masking.length === 0,
            masking.map((f) => `${f.what} hides ${f.hidden}`).join(', ') || 'nothing covered',
          )
          await page.keyboard.press('Escape')
          await page.waitForTimeout(200)
        }

        await page.screenshot({
          path: `${SHOTS}/${vp.name}-${mode}-${screen.key ?? 'dashboard'}-${ENGINE_NAME}.png`,
        })
      }
    }
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
