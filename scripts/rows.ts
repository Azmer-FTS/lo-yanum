import { chromium, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'

import { ROSTER_ROW_HEIGHT } from '../src/ui/components/roster'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Y9 — THE TABLES. THE HEADER, THE HEIGHT, AND THE SIDE EVERYTHING IS ON.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run rows
 *   ENGINE=webkit bun run rows
 *
 *   1  "En-tête de tableau solidaire du tableau, sticky, opaque, aligné sur
 *       les colonnes, avec le même rythme d'espacement que le reste."
 *   2  "Densité des lignes revue à la hausse en hauteur ; colonnes lisibles
 *       en conduite."
 *   3  "Vérifier le RTL de toutes les colonnes, en particulier les icônes
 *       d'action."
 *
 * ★ "ALIGNÉ SUR LES COLONNES" IS THE ONE THAT NEEDS A MEASUREMENT, and it is
 *   the one this app has already got wrong once: the header and the rows are
 *   TWO GRIDS by construction (the header lives in the sticky top, the rows in
 *   the card below), so nothing but the shared `--roster-cols` keeps their
 *   tracks together — and `index.css` carries a long note about the day an
 *   `auto` last track put every column 98 px apart. So this gate compares the
 *   START EDGE of every header cell with the start edge of the cell under it,
 *   on the served build, at three panel widths.
 *
 * ★ AND THE HEIGHT IS CHECKED IN BOTH LANGUAGES. The virtualiser needs a
 *   NUMBER and the CSS needs a LENGTH, so the row height is declared twice —
 *   `ROSTER_ROW_HEIGHT` here, `--roster-row-h` in `tokens.css`. Two
 *   declarations of one fact is exactly the shape of a defect that appears six
 *   months later as rows that overlap their own separators, so the two are
 *   compared rather than trusted.
 */

const PORT = Number(process.env.ROWS_PORT ?? 5211)
const OUT_DIR = 'dist-rows'
const SHOTS = 'docs/screenshots/rows'
const ENGINE = process.env.ENGINE === 'webkit' ? webkit : chromium
const ENGINE_NAME = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
  { name: 'desktop', width: 1680, height: 1050 },
] as const

/** The five lists that switch to a dense table in `hidden`. */
const LISTS = [
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
console.log(`  Y9 — THE TABLES (${ENGINE_NAME})`)
console.log('  ==================================')

// ---------------------------------------------------------------------------
section('A — THE TWO DECLARATIONS OF ONE HEIGHT')
// ---------------------------------------------------------------------------
{
  const css = await Bun.file('src/styles/tokens.css').text()
  const m = /--roster-row-h:\s*([0-9.]+)rem/.exec(css)
  const fromCss = m ? Number(m[1]) * 16 : NaN
  check(
    '★ --roster-row-h and ROSTER_ROW_HEIGHT are the same number',
    fromCss === ROSTER_ROW_HEIGHT,
    `css ${fromCss}px, ts ${ROSTER_ROW_HEIGHT}px`,
  )
  check(
    '★ and it is taller than the 56 px it replaces, with room for a 44 px target',
    ROSTER_ROW_HEIGHT >= 60,
    `${ROSTER_ROW_HEIGHT}px`,
  )
  const screens = await Bun.$`grep -rl "^const [A-Z_]*ROW_HEIGHT = 56" src/ui`.nothrow().quiet()
  check(
    '★ and no screen carries a copy of it any more',
    screens.stdout.toString().trim() === '',
    screens.stdout.toString().trim() || 'none',
  )
}

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

/**
 * The header's cells and the first row's cells, as start edges, plus the
 * header's own surface and height.
 */
const TABLE = `(() => {
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
  const startOf = (r) => (rtl ? Math.round(r.right) : Math.round(r.left));
  const rows = [...document.querySelectorAll('.roster-row')];
  if (rows.length < 2) return null;
  /* ⚠️ THE HEAD IS MARKED, and the first version of this looked for a row
     containing [data-col] instead — which every BODY row also carries, because
     that attribute is the tier system that decides which columns survive a
     narrow panel. It found a body row as the "head" and then filtered every
     row out, reporting "no roster rows" on five tables that were on screen. */
  const head = rows.find((r) => r.hasAttribute('data-roster-head'));
  if (!head) return null;
  const body = rows.filter((r) => r !== head && !r.hasAttribute('data-roster-head'));
  if (body.length === 0) return null;
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const cells = (row) => [...row.children].filter(visible).map((c) => startOf(c.getBoundingClientRect()));
  const bg = getComputedStyle(head).backgroundColor;
  const alpha = /rgba?\\(([^)]+)\\)/.exec(bg);
  const parts = alpha ? alpha[1].split(',').map((v) => parseFloat(v)) : [];
  return {
    rtl,
    headCells: cells(head),
    bodyCells: cells(body[0]),
    headOpaque: parts.length < 4 || parts[3] >= 0.999,
    headBg: bg,
    headHeight: Math.round(head.getBoundingClientRect().height),
    rowHeight: Math.round(body[0].getBoundingClientRect().height),
    /* The actions cell is at the END of the row, whichever way the writing
       runs — that is what "les icônes d'action au bon côté" means, and the
       physical answer differs between the two directions. */
    actionsAtEnd: (() => {
      const row = body[0];
      const actions = row.querySelector('[data-actions]');
      if (!actions) return null;
      const r = actions.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      return rtl ? Math.round(r.left - rr.left) <= 24 : Math.round(rr.right - r.right) <= 24;
    })(),
    /* And nothing in a row may reach past the row's own box on either side. */
    overflow: (() => {
      const row = body[0];
      const rr = row.getBoundingClientRect();
      let worst = 0;
      for (const c of row.querySelectorAll('*')) {
        const r = c.getBoundingClientRect();
        if (r.width === 0) continue;
        worst = Math.max(worst, Math.round(rr.left - r.left), Math.round(r.right - rr.right));
      }
      return worst;
    })(),
  };
})()`

let browser: Browser | null = null
try {
  browser = await ENGINE.launch()
  await Bun.$`mkdir -p ${SHOTS}`.quiet()

  for (const vp of VIEWPORTS) {
    section(`${vp.name} ${vp.width}×${vp.height} — mode contenu plein`)
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'he-IL',
      hasTouch: true,
    })
    const page: Page = await context.newPage()
    page.setDefaultTimeout(30_000)

    for (const list of LISTS) {
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
      await page.evaluate(
        (k) => localStorage.setItem(`lo-yanum:map-mode:${k}`, 'hidden'),
        list.key,
      )
      await page.goto(`${base}/${list.hash}`, { waitUntil: 'load' })
      await page.waitForTimeout(2600)

      const table = (await page.evaluate(TABLE)) as {
        rtl: boolean
        headCells: number[]
        bodyCells: number[]
        headOpaque: boolean
        headBg: string
        headHeight: number
        rowHeight: number
        actionsAtEnd: boolean | null
        overflow: number
      } | null

      if (!table) {
        check(`${list.name}: a dense table is drawn in contenu plein`, false, 'no roster rows')
        continue
      }

      check(
        `Y9.1 · ${list.name}: the column header is opaque`,
        table.headOpaque,
        table.headBg,
      )

      /**
       * ★ THE ALIGNMENT. Header cell i and body cell i are two grids sharing
       *   one `--roster-cols`; a difference of more than a pixel means they
       *   are not sharing it any more.
       */
      const pairs = Math.min(table.headCells.length, table.bodyCells.length)
      const drift = Array.from({ length: pairs }, (_, i) =>
        Math.abs(table.headCells[i] - table.bodyCells[i]),
      )
      check(
        `Y9.1 · ${list.name}: and every column of it sits over its own column`,
        pairs > 0 && drift.every((d) => d <= 1),
        `${pairs} columns, worst drift ${Math.max(0, ...drift)}px`,
      )

      check(
        `Y9.2 · ${list.name}: a row is ${ROSTER_ROW_HEIGHT} px tall`,
        Math.abs(table.rowHeight - ROSTER_ROW_HEIGHT) <= 1,
        `${table.rowHeight}px`,
      )
      check(
        `Y9.1 · ${list.name}: and the header is on the same rhythm, not a caption`,
        table.headHeight >= ROSTER_ROW_HEIGHT * 0.5,
        `header ${table.headHeight}px against rows of ${table.rowHeight}px`,
      )

      check(
        `Y9.3 · ${list.name}: RTL — nothing reaches past the row`,
        table.overflow <= 1,
        `${table.overflow}px past the edge`,
      )
      if (table.actionsAtEnd !== null) {
        check(
          `Y9.3 · ${list.name}: RTL — the action icons are at the row's end`,
          table.actionsAtEnd,
          table.rtl ? 'expected physically left' : 'expected physically right',
        )
      }

      await page.screenshot({
        path: `${SHOTS}/${vp.name}-${list.key}-${ENGINE_NAME}.png`,
      })
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
