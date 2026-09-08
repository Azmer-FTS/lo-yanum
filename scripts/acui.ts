import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A100 · A106 — LES DEUX QUESTIONS QUI NE SE POSENT QU'À UN NAVIGATEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run acui
 *
 *   A100  the sheet the wizard reads is « רשימה » and never « מקרא ». His
 *         workbook OPENS on its legend tab, so a reader that takes
 *         `SheetNames[0]` reads the instructions page and reports 0 rows —
 *         the defect AA4 met once already, re-asked because the workbook has
 *         changed shape since and now has THREE tabs.
 *   A106  the חוות screen sorts and filters by nights received and by how
 *         long ago the last one was, and the mark on a forgotten farm is
 *         drawn where a coordinator scanning the list will see it.
 *
 * ⚠️ EVERY PROBE IS A REAL FUNCTION passed to `page.evaluate`, never a
 *    template literal. Three passes lost an afternoon each to a backslash that
 *    became a letter and a back-quote inside a comment that ended the string.
 */

const PORT = Number(process.env.ACUI_PORT ?? 5213)
const OUT_DIR = 'dist-acpass'
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
console.log('  A100 · A106 — AC2 · AC4 IN A REAL BROWSER')
console.log('  =========================================')

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

/** Bounce through the dashboard: a `goto` to the current hash is not a nav. */
async function open(page: Page, hash: string): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
}

let browser: Browser | undefined

try {
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'he-IL' })
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)

  // -------------------------------------------------------------------------
  section('A100 — l’onglet lu est רשימה, jamais מקרא')
  // -------------------------------------------------------------------------

  /**
   * ★ ASKED OF THE FILE FIRST. The claim only means something if his workbook
   *   really does open somewhere else — so the tab order is read out of the
   *   file, in the browser, through the same SheetJS the wizard loads.
   */
  await open(page, '#/coordinator/import/prospection')
  await page.locator('[data-testid="sheet-file"]').setInputFiles('docs/samples/prospection-sud.xlsx')
  await page.waitForTimeout(3000)

  const headers = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="mapping-grid"] [data-header]')].map(
      (el) => (el as HTMLElement).dataset.header ?? '',
    ),
  )
  check(
    'A100 · the wizard read a sheet whose headers are the רשימה ones',
    headers.length === 32 && headers[0].trim() === "מס'",
    `${headers.length} headers · first=[${headers[0] ?? ''}]`,
  )
  /**
   * ⚠️ AND THE NEGATIVE HALF, WHICH IS THE ONE THAT WOULD HAVE CAUGHT AA4's
   *    DEFECT: not one of the legend sheet's own sentences is among the
   *    headers. « קובץ איתור חוות ומשקים » is A1 of מקרא, and a reader that
   *    took the first tab would show it as a column name.
   */
  check(
    'A100 · and not one מקרא sentence became a column',
    headers.every((h) => !h.includes('קובץ איתור') && !h.includes('מבנה הקובץ')),
    headers.filter((h) => h.includes('קובץ') || h.includes('מבנה')).join(' · ') || 'none',
  )

  await page.locator('[data-testid="mapping-next"]').click()
  await page.waitForTimeout(2000)
  const created = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="count-create"] .numeric')
    return Number((el?.textContent ?? '').replace(/\D/g, ''))
  })
  check(
    'A100 · 198 rows read — a מקרא read would have reported none',
    created === 198,
    `${created} to create`,
  )

  await page.locator('[data-testid="sheet-confirm"]').click()
  await page.waitForTimeout(2500)

  // -------------------------------------------------------------------------
  section('A106 — trier et filtrer par gardes reçues, sur l’écran חוות')
  // -------------------------------------------------------------------------

  await open(page, '#/coordinator/farms')

  /** The order of the sort picker's options, read off the real `<select>`. */
  const options = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="farms-sort"] select')
    if (!el) return [] as string[]
    return [...(el as HTMLSelectElement).options].map((o) => o.value)
  })
  check(
    'A106 · the sort offers the three equity orders',
    ['guardsAsc', 'guardsDesc', 'lastGuardOldest'].every((v) => options.includes(v)),
    options.join(' · ') || 'no sort control',
  )

  /**
   * ★ THE ORDER IS READ OFF THE ROWS, NOT OFF THE STATE. `data-guards` is on
   *   the table's own cell, so what is asserted is what a coordinator sees.
   *   The table reading is the one CONTENU PLEIN shows (Y4), which is why the
   *   map mode is set before the rows are counted.
   */
  /* ⚠️ BOTH KEYS. `mapMode.ts` writes `…:farms` when the layout is `free` and
     `…:__all__` when it is `synced`, and which of the two is in force is a
     setting; writing one of them is a gate that passes on half the machines. */
  await page.evaluate(() => {
    localStorage.setItem('lo-yanum:map-mode:farms', 'hidden')
    localStorage.setItem('lo-yanum:map-mode:__all__', 'hidden')
  })
  await open(page, '#/coordinator/farms')

  const pick = async (value: string) => {
    await page.selectOption('[data-testid="farms-sort"] select', value)
    await page.waitForTimeout(1200)
  }
  const guardsColumn = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-guards]')]
        .map((el) => Number((el as HTMLElement).dataset.guards ?? '0'))
        .slice(0, 12),
    )

  await pick('guardsAsc')
  const asc = await guardsColumn()
  check(
    'A106 · « le moins servi d’abord » really is ascending',
    asc.length > 1 && asc.every((n, i) => i === 0 || asc[i - 1] <= n),
    asc.join(','),
  )

  await pick('guardsDesc')
  const desc = await guardsColumn()
  check(
    'A106 · and the other way round puts the best-served first',
    desc.length > 1 && desc.every((n, i) => i === 0 || desc[i - 1] >= n),
    desc.join(','),
  )
  check(
    'A106 · the two orders are not the same list',
    asc.join(',') !== desc.join(','),
    `${asc[0]} vs ${desc[0]}`,
  )

  await pick('lastGuardOldest')
  const oldestFirst = await page.evaluate(() => {
    const first = document.querySelector('[data-guards]') as HTMLElement | null
    return Number(first?.dataset.guards ?? '-1')
  })
  check(
    'A106 · « la plus ancienne d’abord » starts with a farm nobody has been to',
    oldestFirst === 0,
    `first row has ${oldestFirst} guards`,
  )

  /**
   * ★ AC4.5 — THE MARK, AND THE FILTER THAT IS MADE OF IT.
   *
   * ⚠️ THE PILL IS ONLY DRAWN WHEN IT HAS SOMETHING TO SAY. The 198 rows just
   *    imported are leads and none of them is flagged, which is the rule
   *    working; the fixture's own signed farms are what the count comes from.
   *    So this reads the count rather than demanding a fixed number.
   */
  await open(page, '#/coordinator/farms')
  const neglect = await page.evaluate(() => {
    const pill = document.querySelector('[data-testid="farms-neglected"]') as HTMLElement | null
    const marks = document.querySelectorAll('[data-testid="farm-neglect"]').length
    return {
      hasPill: pill !== null,
      count: Number((pill?.querySelector('.filter-count')?.textContent ?? '0').replace(/\D/g, '')),
      title: pill?.getAttribute('title') ?? '',
      marks,
    }
  })
  if (neglect.hasPill) {
    check(
      'A106 · the « נשכחו » pill names its threshold on hover',
      /\d/.test(neglect.title),
      neglect.title,
    )
    await page.locator('[data-testid="farms-neglected"]').click()
    await page.waitForTimeout(1200)
    const shown = await page.evaluate(
      () => document.querySelectorAll('[data-guards]').length,
    )
    check(
      'A106 · and switching it on narrows the roster to exactly its count',
      shown === neglect.count && shown > 0,
      `${shown} rows for a count of ${neglect.count}`,
    )
    const marked = await page.evaluate(
      () => document.querySelectorAll('[data-testid="farm-neglect"]').length,
    )
    check(
      'A106 · every row it leaves carries the mark, and the mark says why',
      marked === shown,
      `${marked} marks on ${shown} rows`,
    )
  } else {
    check(
      'A106 · with nothing forgotten the pill is absent rather than empty',
      neglect.count === 0 && neglect.marks === 0,
      'no pill, no marks',
    )
  }

  await context.close()
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
