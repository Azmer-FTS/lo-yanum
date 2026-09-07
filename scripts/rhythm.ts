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
  /* ★ Z1 (2026-09-07) — "de partout" means the two screens whose filter row is
     NOT inside a `ListTop` as well: the planner's farm picker and the agenda's
     control bar. A60 finds the row by what it IS rather than by where it
     lives, so both join the sweep. */
  { name: 'מסלול', key: 'route', hash: '#/coordinator/route' },
  { name: 'יומן', key: 'agenda', hash: '#/coordinator/agenda' },
] as const

interface FadeRow {
  what: string
  phase: string
  slack: number
  moreStart: boolean
  moreEnd: boolean
  fadeStart: boolean
  fadeEnd: boolean
  chevStart: boolean
  chevEnd: boolean
  attr: string | null
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
      /* ★ Z1 — A ROW INSIDE A CARD IS ON THE CARD'S MARGIN, NOT THE PAGE'S.
         The planner's filter row lives inside a Section, whose padding is
         exactly the 20 px A57 reported as a defect. The claim A57 makes is
         about rows in the content column; a row in a block of its own is
         reported and not asserted. */
      inCard: !!row.closest('.card, .card-pad, [data-block]'),
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

/**
 * ★★ Z1 (2026-09-07) — A60. THE FILTER ROW, FOUND BY WHAT IT IS.
 *
 * The Y6 probe above can only speak about a screen that has a `[data-list-top]`
 * — which the planner and the agenda do not, and they are two of the nine the
 * product owner named. This one looks for a row of filter controls anywhere on
 * the page: the pills, the drop-down button that replaces them in a narrow
 * panel, or the `.filters-gap` marker a screen wears when it owns its own row.
 *
 * The gap is measured from the row's last PAINTED descendant — a row box
 * reaches past its pills by the room a shadow needs — to the top of the first
 * painted thing under it, whichever comes first.
 */
const FILTER_GAP = `(() => {
  const rows = [];
  const push = (el) => { if (el && !rows.includes(el)) rows.push(el); };
  const top = document.querySelector('[data-list-top]');
  if (top) {
    const inHeader = Array.from(top.querySelectorAll('.scroll-row')).filter(
      (r) => r.getAttribute('data-testid') !== 'kpi-strip',
    );
    push(inHeader[inHeader.length - 1] || null);
    const dd = top.querySelector('[data-testid="filter-dropdown"]');
    if (dd) push(dd.parentElement);
  }
  document.querySelectorAll('.filters-gap').forEach(push);
  /* A screen that owns its filter bar and gives it a background — the agenda's
     control card — is found by the pills it holds rather than by a marker. */
  document.querySelectorAll('.filter-pill').forEach((pill) => {
    const holder = pill.parentElement && pill.parentElement.parentElement;
    if (holder && !rows.some((r) => r.contains(pill))) push(holder);
  });
  const out = [];
  rows.forEach((row) => {
    const rr = row.getBoundingClientRect();
    if (rr.height < 4 || rr.width < 4) return;
    /* The last thing the row actually PAINTS. */
    /* ⚠️ A ROW THAT PAINTS ITS OWN BACKGROUND ENDS AT ITS EDGE, not at its
       last pill. The agenda's control bar is a card with 8 px of padding: read from
       the pill inside it the gap reads 24 px and the row looks wrong, while
       what the eye sees below the card is the 16 px this is about. Asked of
       the computed background so a class name cannot lie about it. */
    const bg = getComputedStyle(row).backgroundColor;
    const alpha = /rgba?\\(([^)]+)\\)/.exec(bg);
    const parts = alpha ? alpha[1].split(',').map((v) => parseFloat(v)) : [];
    const painted = parts.length >= 3 && (parts.length < 4 || parts[3] > 0.05);
    let fb = -Infinity;
    if (painted) fb = rr.bottom;
    else {
      /**
       * ⚠️ AND "THE BOTTOM OF THE ROW" IS WHERE IT LAST PAINTS SOMETHING.
       *
       * Counting every descendant's rectangle counts the wrappers too, and a
       * row of pills has four of them — the bar, the nav, the veil and the
       * scroller — each of which reaches 12 px past the pills because that is
       * the room a card's shadow needs. Measured that way a correct 16 px gap
       * reports as 3. So an element counts when it PAINTS: a background, a
       * border, or text of its own. A pill has a background and stops where
       * the eye says it stops; a wrapper has neither.
       */
      const paints = (el) => {
        const cs = getComputedStyle(el);
        if (cs.position === 'absolute' || cs.position === 'fixed') return false;
        const bg = cs.backgroundColor || '';
        const m = /rgba?\\(([^)]+)\\)/.exec(bg);
        const parts = m ? m[1].split(',').map((v) => parseFloat(v)) : [];
        if (parts.length >= 3 && (parts.length < 4 || parts[3] > 0.05)) return true;
        if (parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderTopWidth) > 0) return true;
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
        if (el.tagName === 'IMG' || el.tagName === 'SVG' || el.tagName === 'svg') return true;
        return el.children.length === 0 && (el.textContent || '').trim() !== '';
      };
      const walk = (el) => {
        Array.from(el.children).forEach((c) => {
          const r = c.getBoundingClientRect();
          if (r.height >= 4 && r.width >= 4 && r.bottom > fb && paints(c)) fb = r.bottom;
          walk(c);
        });
      };
      walk(row);
      if (fb === -Infinity) fb = rr.bottom;
    }
    /**
     * ★ AND THE THING BELOW IS FOUND BY LOOKING, NOT BY WALKING THE TREE.
     *
     * The first version of this asked the DOM: siblings, then ancestors, then
     * every list item on the page. It reported 56 px on חוות at 402 px and
     * 128 px on שמירות, because a virtualised roster positions its rows
     * ABSOLUTELY inside a spacer — so the row that is visibly 16 px under the
     * filters is not a sibling of anything, and the first one the tree walk
     * could reach was somewhere else entirely. The claim is visual, so the
     * question is asked visually: step down the middle of the row, pixel by
     * pixel, and stop at the first thing that is CONTENT.
     */
    const xs = [rr.left + rr.width * 0.25, rr.left + rr.width * 0.5, rr.left + rr.width * 0.75];
    let bestTop = Infinity;
    let what = null;
    for (let y = Math.round(fb) + 1; y <= Math.round(fb) + 60 && bestTop === Infinity; y++) {
      for (const x of xs) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || row.contains(hit) || hit.contains(row)) continue;
        const item = hit.closest('[data-tile], [data-row], .card, .roster, article, li, table, img, [data-testid="route-pick"]');
        if (!item || item.contains(row)) continue;
        bestTop = y;
        what = item.tagName + '.' + String(item.className).slice(0, 30);
        break;
      }
    }
    out.push({
      what: row.getAttribute('data-testid') || String(row.className).split(' ')[0] || row.tagName,
      gap: bestTop === Infinity ? null : Math.round(bestTop - fb),
      next: what,
    });
  });
  return out;
})()`

/**
 * ★★ Z3 (2026-09-07) — A62 · A63. ONE COUNTER, SHORT, AND NO NUMBER TWICE.
 *
 *   "Le compteur devient COURT: 14/14. Version longue autorisee UNIQUEMENT en
 *    vue tableau pleine page. Supprimer tous les doublons — נהגים מתנדבים
 *    affiche le nombre de conducteurs TROIS fois. Un seul reste."
 *
 * ★ THE DUPLICATE IS FOUND BY THE NUMBER, NOT BY THE SENTENCE. Y6 counted the
 *   string "מוצגים X מתוך Y" and reported ONE on נהגים, on a screen printing
 *   nine three times: the KPI chip said "9", the pill said "9 נהגים" and only
 *   the third said the sentence. So this reads every leaf of the pinned header
 *   and asks whether the counter's own two numbers are written anywhere else
 *   in it.
 *
 * ★ AND A63 IS A GEOMETRY, NOT A CLASS NAME. "LIGNE 1: compteur court + bouton
 *   סינון, face a face. LIGNE 2: la rangee de filtres, SEULE." Two boxes are
 *   on one line when their tops agree; the counter faces the button when one
 *   is at the reading start of that line and the other at its end.
 */
const COUNTER = `(() => {
  const top = document.querySelector('[data-list-top]');
  if (!top) return null;
  const pills = Array.from(top.querySelectorAll('[data-list-count]'));
  const long = [];
  const leaves = [];
  top.querySelectorAll('span, p, div, li, button, h1, h2').forEach((el) => {
    if (el.children.length) return;
    const text = (el.textContent || '').trim();
    if (!text) return;
    leaves.push({
      text: text,
      inCount: pills.some((p) => p === el || p.contains(el)),
      inFilterCount: !!el.closest('.filter-count'),
    });
    if (/מוצגים/.test(text)) long.push(text);
  });
  const pill = pills[0] || null;
  const text = pill ? (pill.textContent || '').trim() : null;
  /* ⚠️ NO REGEX HERE, AND THAT IS DELIBERATE. This probe is a TEMPLATE
     LITERAL: a backslash-slash inside one is just a slash, so the obvious
     /^[0-9]+\\/[0-9]+$/ arrives at the browser as an unterminated regex and
     the whole evaluate dies with "Unexpected token". Same family as the
     backslash-s trap Y6 documents two probes up. */
  const halves = text ? text.split('/') : [];
  const short = text
    ? halves.length === 2 && halves.every((h) => h.trim() !== '' && String(Number(h.trim())) === h.trim())
    : null;
  let echoes = [];
  if (text) {
    const numbers = text.match(/[0-9]+/g) || [];
    /* ⚠️ A FILTER'S OWN COUNT IS NOT A COPY OF THE LIST'S COUNT. "מתוכננת 4"
       says how many that pill would show; it is about the pill, and that it
       happens to equal the total on a four-guard week is arithmetic, not a
       duplicate. Excluded by the class the count wears, not by its value.
       The chip this check was written for — the drivers' total — is a KPI, and
       KPI figures do not wear the filter-count class. */
    leaves.forEach((leaf) => {
      if (leaf.inCount || leaf.inFilterCount) return;
      if (numbers.some((n) => leaf.text === n)) echoes.push(leaf.text);
    });
  }
  /* A63 — the counter and the filter button, and whether they share a line. */
  const dd = top.querySelector('[data-testid="filter-dropdown"]');
  let face = null;
  if (pill && dd) {
    const a = pill.getBoundingClientRect();
    const b = dd.getBoundingClientRect();
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    const line = Math.abs(a.top - b.top) < 10;
    /* In RTL the reading start is the RIGHT edge. */
    const countFirst = rtl ? a.right > b.right : a.left < b.left;
    face = { line: line, countFirst: countFirst, apart: Math.round(Math.abs((rtl ? a.left - b.right : b.left - a.right))) };
  }
  /* And the filters themselves: are they on a line of their own under it. */
  let panelAlone = null;
  const panel = top.querySelector('[data-testid="filter-dropdown-panel"]');
  if (panel && pill) {
    const pr = panel.getBoundingClientRect();
    const cr = pill.getBoundingClientRect();
    /* ⚠️ "TOUTE LA LARGEUR" IS THE HEADER'S CONTENT BOX, NOT ITS BORDER BOX.
       The pinned header bleeds out to the panel's own padding and puts the
       same amount back inside (px-4 / lg:px-5), so comparing against its
       rectangle asks the panel to be 32 px wider than the column it lives in
       and fails a layout that is right. */
    const cs = getComputedStyle(top);
    const rowWidth = top.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    panelAlone = { below: pr.top >= cr.bottom - 1, full: pr.width >= rowWidth - 4 };
  }
  return { pills: pills.length, text: text, short: short, longCount: long.length, echoes: echoes.slice(0, 4), face: face, panelAlone: panelAlone };
})()`

/**
 * ★★ Z4 (2026-09-07) — A64. THE FADE AND THE CHEVRON, ON THE SIDE THAT HAS
 *    MORE, AND ON NO OTHER.
 *
 *   "Le degrade de bord est present DES QU'IL RESTE du contenu au-dela, de ce
 *    cote-la. Il disparait uniquement quand on est au bout. Il ne depend
 *    JAMAIS du fait qu'un defilement soit en cours ou non."
 *
 * ★ AND THE SIDE IS DERIVED FROM THE COMPUTED MASK, NOT FROM A CLASS. The bug
 *   this replaces was a gradient pointing the right way with its stops the
 *   wrong way round, which no selector-based check can see: `to left` puts 0 %
 *   at the RIGHT edge, so where the transparent stop SITS is the whole
 *   question. This reads the resolved `mask-image`, works out which physical
 *   edge goes transparent, and compares it with the edge that actually has
 *   more content. The first attempt at the fix failed this check, from the
 *   other side, which is why it is written this way.
 */
const FADES = `((phase) => {
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
  const out = [];
  document.querySelectorAll('.scroll-nav').forEach((nav) => {
    const row = nav.querySelector('.scroll-row, .carousel-2');
    if (!row) return;
    const r = row.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const slack = row.scrollWidth - row.clientWidth;
    const travelled = Math.abs(row.scrollLeft);
    const moreStart = slack > 2 && travelled > 2;
    const moreEnd = slack > 2 && travelled < slack - 2;
    const veil = nav.querySelector('.scroll-veil');
    const cs = veil ? getComputedStyle(veil) : null;
    const mask = cs ? (cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage) : 'none';
    /* Which PHYSICAL edges the mask makes transparent. */
    let fadeLeft = false;
    let fadeRight = false;
    if (mask && mask !== 'none') {
      const toLeft = mask.indexOf('to left') >= 0;
      /* A stop list is read along the gradient line: 0 % at the far side of
         the arrow, 100 % at the side it points to. */
      const firstTransparent = mask.indexOf('rgba(0, 0, 0, 0) 0px') >= 0 || mask.indexOf('transparent 0px') >= 0;
      const lastTransparent = mask.indexOf('rgba(0, 0, 0, 0) 100%') >= 0 || mask.indexOf('transparent 100%') >= 0;
      if (toLeft) {
        if (firstTransparent) fadeRight = true;
        if (lastTransparent) fadeLeft = true;
      } else {
        if (firstTransparent) fadeLeft = true;
        if (lastTransparent) fadeRight = true;
      }
    }
    const fadeStart = rtl ? fadeRight : fadeLeft;
    const fadeEnd = rtl ? fadeLeft : fadeRight;
    const chevStart = !!nav.querySelector('[data-testid="scroll-nudge-start"]');
    const chevEnd = !!nav.querySelector('[data-testid="scroll-nudge-end"]');
    out.push({
      what: row.getAttribute('data-testid') || String(row.className).split(' ')[0],
      phase: phase,
      slack: Math.round(slack),
      moreStart: moreStart,
      moreEnd: moreEnd,
      fadeStart: fadeStart,
      fadeEnd: fadeEnd,
      chevStart: chevStart,
      chevEnd: chevEnd,
      attr: nav.getAttribute('data-overflow'),
    });
  });
  return out;
})`

/**
 * ★★ Z1bis (2026-09-07) — WHAT IS BEHIND THE PINNED TOP WHILE NOTHING HAS
 *    BEEN SCROLLED.
 *
 * ⚠️ AND IT CANNOT BE ASKED WITH `elementFromPoint`, WHICH IS THE WHOLE
 *    REASON A58 NEVER SAW THIS. A58's probe hit-tests inside the header's own
 *    rectangle, and the header is OPAQUE and on top — so the browser answers
 *    "the header", every time, whether there is a card under it or nothing at
 *    all. Two rectangles is the only question that can be asked here.
 *
 * At rest a pinned header sits at its own place in the flow and covers
 * nothing. If it covers something, its `top` offset is larger than the room
 * its scrollport gives it — which is exactly what `top: var(--shell-top)`
 * does inside a panel that is not the page.
 */
const BEHIND_STICKY = `(() => {
  const out = [];
  document.querySelectorAll('[data-list-top], header[class*="sticky"], .sticky-top').forEach((bar) => {
    const r = bar.getBoundingClientRect();
    if (r.height < 8 || r.width < 8) return;
    const covered = [];
    document.querySelectorAll('[data-tile], [data-row], .card, .roster, article, li').forEach((item) => {
      if (bar.contains(item) || item.contains(bar)) return;
      const ir = item.getBoundingClientRect();
      if (ir.height < 6 || ir.width < 6) return;
      const overlapY = Math.min(ir.bottom, r.bottom) - Math.max(ir.top, r.top);
      const overlapX = Math.min(ir.right, r.right) - Math.max(ir.left, r.left);
      if (overlapY > 2 && overlapX > 2) {
        covered.push(item.tagName + '.' + String(item.className).slice(0, 24) + ' by ' + Math.round(overlapY) + 'px');
      }
    });
    out.push({
      what: bar.getAttribute('data-testid') || bar.tagName,
      top: Math.round(r.top),
      covered: covered.slice(0, 3),
      count: covered.length,
    });
  });
  return out;
})()`

/**
 * ★★ Z2 (2026-09-07) — A61. "בחירת חוות" BREATHES.
 *
 * "C'est la catastrophe, super collé en bas, les filtres sont collés aux
 *  vignettes des fermes et les fermes sont très collées les unes aux autres —
 *  même en plein écran."
 *
 * Three numbers, and all three were measured on the product owner's own
 * device before anything moved: a **6 px** gutter between cards 121 px wide,
 * a label block with 8 px at the sides and 6 px top and bottom, and — the one
 * that makes "même en plein écran" true — `auto-fill` at a 7.5 rem minimum,
 * which adds a column the instant another minimum fits and therefore pins
 * every card at its smallest whatever the panel's width.
 */
const PICKER = `(() => {
  const ul = document.querySelector('[data-testid="route-picker"]');
  if (!ul) return null;
  const cs = getComputedStyle(ul);
  const items = Array.from(ul.children);
  if (!items.length) return null;
  const first = items[0];
  const card = first.querySelector('[data-testid="route-pick"]') || first;
  /* ⚠️ BY A MARKER, NOT BY POSITION. A last-child selector matched a nested
     span with no padding of its own and reported 0/0 — a check that fails a
     correct layout, which is the same class of mistake as one that passes a
     broken one. */
  const label = card.querySelector('[data-pick-label]');
  const lcs = label ? getComputedStyle(label) : null;
  const rows = new Set(items.map((i) => Math.round(i.getBoundingClientRect().top)));
  const cols = new Set(items.map((i) => Math.round(i.getBoundingClientRect().left)));
  return {
    gapRow: Math.round(parseFloat(cs.rowGap) || 0),
    gapCol: Math.round(parseFloat(cs.columnGap) || 0),
    cardW: Math.round(card.getBoundingClientRect().width),
    padX: lcs ? Math.round(parseFloat(lcs.paddingLeft)) : 0,
    padY: lcs ? Math.round(parseFloat(lcs.paddingTop)) : 0,
    rows: rows.size,
    cols: cols.size,
    width: Math.round(ul.getBoundingClientRect().width),
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
          inCard: boolean
          overflow: boolean
          resting: number
          fromTitle: number
          bleed: number
          fade: string | null
        }[]
        if (rows.length) {
          const off = rows.filter((r) => !r.inCard && Math.abs(r.fromTitle) > 2)
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
        /* ⚠️ Z1 — BACK TO THE TOP FIRST. A58 above leaves the list scrolled by
           700 px, and A60 asks where the CONTENT begins under the filter row:
           read at an arbitrary scroll offset it measures whichever card
           happens to be passing, which is not a layout fact at all. The first
           version of A60 reported 49 / 52 / 76 px in split for exactly that
           reason. */
        await page.evaluate(`${SCROLL}(0)`)
        await page.waitForTimeout(350)

        /**
         * ★★ Z1 (2026-09-07) — A60. THE ROOM UNDER THE FILTER ROW IS THE ROOM
         *    ABOVE IT.
         *
         * "La rangee de filtres doit avoir le MEME espace au-dessus et EN
         *  DESSOUS. Le contenu ne commence jamais colle aux filtres."
         *
         * Measured on the iPad before the fix: **4 px** under the row on
         * מתנדבים and נהגים, **12 px** on חוות (the same row, a different
         * shape), and **0 px** in table mode on all five, where the column
         * heads sat flat on the pills. Franc: at least 12 px. Identique:
         * within 4 px of the 16 the two gaps above it already keep.
         */
        /**
         * ★★ Z1bis (2026-09-07) — AND NOTHING IS HIDDEN BEHIND THE PINNED TOP
         *    WHILE NOTHING HAS BEEN SCROLLED.
         *
         * A58 above asks this question after a 700 px scroll, where a card
         * under the header is what a sticky header is FOR. Asked at rest it is
         * a different claim, and it was false: on a phone in split mode the
         * pinned top sat 62 px INSIDE the list and covered the first farm.
         * Found on a capture of the deployed page, not by a gate — the fade
         * lesson of Y1, again.
         */
        const atRest = (await page.evaluate(BEHIND_STICKY)) as {
          what: string
          top: number
          covered: string[]
          count: number
        }[]
        const hiding = atRest.filter((b) => b.count > 0)
        check(
          `A60 · ${screen.name}: at rest, the pinned top covers no content`,
          hiding.length === 0,
          hiding.map((b) => `${b.what} hides ${b.covered.join(', ')}`).join(' — ') ||
            `${atRest.length} bars, nothing behind them`,
        )

        // ---------------------------------------------------------------- A61
        if (screen.key === 'route') {
          const picker = (await page.evaluate(PICKER)) as {
            gapRow: number
            gapCol: number
            cardW: number
            padX: number
            padY: number
            rows: number
            cols: number
            width: number
          } | null
          if (picker) {
            check(
              `A61 · ${mode}: a frank gutter between the farm cards, both ways`,
              picker.gapRow >= 10 && picker.gapCol >= 10,
              `${picker.gapCol}px across, ${picker.gapRow}px down`,
            )
            check(
              `A61 · ${mode}: the name and the place do not touch the card's edges`,
              picker.padX >= 10 && picker.padY >= 7,
              `${picker.padX}px at the sides, ${picker.padY}px top and bottom`,
            )
            /* "La grille s'élargit au lieu de se tasser": with a 12 px gutter
               and an 8.5 rem minimum, a full-screen panel draws cards larger
               than the minimum rather than one more column of the smallest. */
            check(
              `A61 · ${mode}: the cards are comfortable, not squeezed to the minimum`,
              picker.cardW >= 132,
              `${picker.cardW}px wide, ${picker.cols} columns over ${picker.width}px`,
            )
          }
        }

        const filterRows = (await page.evaluate(FILTER_GAP)) as {
          what: string
          gap: number | null
          next: string | null
        }[]
        for (const row of filterRows) {
          if (row.gap === null) continue
          check(
            `A60 · ${screen.name}: content does not start glued to the filters (${row.what})`,
            row.gap >= 12 && Math.abs(row.gap - 16) <= 4,
            `${row.gap}px to ${row.next}`,
          )
        }

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

        // ---------------------------------------------------------------- A64
        /**
         * Three readings of the same rule, and the third is the one the report
         * is really about: at rest at the start, at rest at the end, and
         * WITHOUT WAITING after a scroll has been asked for — "il ne depend
         * jamais du fait qu'un defilement soit en cours ou non".
         */
        const phases: { name: string; rows: FadeRow[] }[] = []
        phases.push({ name: 'at rest', rows: (await page.evaluate(`${FADES}('rest')`)) as FadeRow[] })
        await page.evaluate(`(() => {
          document.querySelectorAll('.scroll-nav .scroll-row, .scroll-nav .carousel-2').forEach((el) => {
            const slack = el.scrollWidth - el.clientWidth;
            if (slack > 2) el.scrollLeft = (el.scrollLeft < 0 ? -1 : 1) * Math.round(slack / 2);
          });
        })()`)
        phases.push({ name: 'mid-scroll, not settled', rows: (await page.evaluate(`${FADES}('mid')`)) as FadeRow[] })
        await page.waitForTimeout(500)
        phases.push({ name: 'stopped in the middle', rows: (await page.evaluate(`${FADES}('stopped')`)) as FadeRow[] })
        await page.evaluate(`(() => {
          document.querySelectorAll('.scroll-nav .scroll-row, .scroll-nav .carousel-2').forEach((el) => {
            const slack = el.scrollWidth - el.clientWidth;
            if (slack > 2) el.scrollLeft = (el.scrollLeft < 0 ? -1 : 1) * slack;
          });
        })()`)
        await page.waitForTimeout(400)
        phases.push({ name: 'at the far end', rows: (await page.evaluate(`${FADES}('end')`)) as FadeRow[] })

        for (const phase of phases) {
          const scrolling = phase.rows.filter((r) => r.slack > 2)
          if (!scrolling.length) continue
          const wrongFade = scrolling.filter(
            (r) => r.fadeStart !== r.moreStart || r.fadeEnd !== r.moreEnd,
          )
          check(
            `A64 · ${screen.name} (${phase.name}): the fade is on the side that has more, and only there`,
            wrongFade.length === 0,
            wrongFade
              .map(
                (r) =>
                  `${r.what}: more[start=${r.moreStart} end=${r.moreEnd}] fade[start=${r.fadeStart} end=${r.fadeEnd}]`,
              )
              .join(' — ') || `${scrolling.length} rows`,
          )
          const wrongChevron = scrolling.filter(
            (r) => r.chevStart !== r.moreStart || r.chevEnd !== r.moreEnd,
          )
          check(
            `A64 · ${screen.name} (${phase.name}): and the chevron follows the same rule`,
            wrongChevron.length === 0,
            wrongChevron
              .map(
                (r) =>
                  `${r.what}: more[${r.moreStart}/${r.moreEnd}] chevron[${r.chevStart}/${r.chevEnd}]`,
              )
              .join(' — ') || `${scrolling.length} rows`,
          )
        }
        /* Back where the other checks expect to find it. */
        await page.evaluate(`(() => {
          document.querySelectorAll('.scroll-nav .scroll-row, .scroll-nav .carousel-2').forEach((el) => { el.scrollLeft = 0; });
        })()`)
        await page.waitForTimeout(300)

        // ------------------------------------------------------------ A62·A63
        const counter = (await page.evaluate(COUNTER)) as {
          pills: number
          text: string | null
          short: boolean | null
          longCount: number
          echoes: string[]
          face: { line: boolean; countFirst: boolean; apart: number } | null
          panelAlone: { below: boolean; full: boolean } | null
        } | null
        if (counter && counter.pills > 0) {
          check(
            `A62 · ${screen.name}: one counter, and only one`,
            counter.pills === 1 && counter.longCount <= 1,
            `${counter.pills} pills, ${counter.longCount} long sentences — "${counter.text}"`,
          )
          /**
           * Short everywhere the room is not there. The long sentence is
           * allowed on a full-page table only, which is `mode === 'hidden'` on
           * the two wide viewports; a phone is never a full page in this
           * sense and a split panel never is either.
           */
          const mayBeLong = mode === 'hidden' && vp.name !== 'iphone'
          check(
            `A62 · ${screen.name}: the counter is short${mayBeLong ? ' or the full sentence (full-page table)' : ''}`,
            mayBeLong ? true : counter.short === true,
            `"${counter.text}"`,
          )
          check(
            `A62 · ${screen.name}: no number of the counter is written twice in the header`,
            counter.echoes.length === 0,
            counter.echoes.length ? `also as ${counter.echoes.join(', ')}` : 'no echo',
          )
          if (counter.face) {
            check(
              `A63 · ${screen.name}: counter and סינון face each other on one line`,
              counter.face.line && counter.face.countFirst,
              `line=${counter.face.line} countFirst=${counter.face.countFirst} apart=${counter.face.apart}px`,
            )
          }
        }

        // ---------------------------------------------------------------- A59
        const dropdown = page.locator('[data-testid="filter-dropdown"]')
        if (await dropdown.count()) {
          await dropdown.first().click()
          await page.waitForTimeout(350)
          const alone = (await page.evaluate(COUNTER)) as { panelAlone: { below: boolean; full: boolean } | null } | null
          if (alone && alone.panelAlone) {
            check(
              `A63 · ${screen.name}: the filters open on a line of their own, full width`,
              alone.panelAlone.below && alone.panelAlone.full,
              `below=${alone.panelAlone.below} full=${alone.panelAlone.full}`,
            )
          }
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
