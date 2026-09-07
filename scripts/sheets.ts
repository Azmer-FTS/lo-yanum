import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A75 · A81 · A83 — LES DEUX ASSISTANTS, DANS UN VRAI NAVIGATEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run sheets
 *   ENGINE=webkit bun run sheets
 *
 * `bun run prospection` and `bun run signatures` prove the RULES with no
 * browser at all, which is where they belong. Three claims cannot be made
 * there, and they are the three this gate makes:
 *
 *   A75  the product owner's own .xlsx, dropped on the real file input, walks
 *        the four steps and reports 198 created — which exercises SheetJS, the
 *        sheet chooser (his workbook opens on its מקרא tab, not on רשימה), the
 *        header guess and the store, in one line.
 *   A81  the imported signature is VISIBLE on the farm's own detail screen.
 *        A data URI that reaches the store and is never drawn is a feature
 *        nobody has.
 *   A83  the hand mapping is REMEMBERED — it lives in localStorage, so only a
 *        browser can answer whether the next import is pre-filled with it.
 */

const PORT = Number(process.env.SHEETS_PORT ?? 5211)
const OUT_DIR = 'dist-sheets'
const ENGINE = process.env.ENGINE === 'webkit' ? webkit : chromium
const ENGINE_NAME = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'

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
console.log(`  A75 · A81 · A83 — THE TWO SHEET WIZARDS (${ENGINE_NAME})`)
console.log('  ==================================================')

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

const scratch = mkdtempSync(join(tmpdir(), 'lo-yanum-sheets-'))

/** A one-pixel PNG — a real data URI, not a plausible-looking string. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * A consents file with SOMEBODY ELSE'S HEADERS — which is the case AA5.6 is
 * for. `Signature blob` and `Region council` are not aliases this app knows,
 * so the coordinator has to point at them by hand the first time.
 *
 * ⚠️ WRITTEN WITH A UTF-8 BOM. Excel on a Hebrew Windows machine renders a
 *    BOM-less UTF-8 CSV as mojibake, and so, more to the point here, does
 *    SheetJS's encoding sniff on a short file.
 */
const FOREIGN_CSV = `﻿Timestamp,Farm,Signed by,Mobile,Signature blob,Region council
2026-09-03 10:12,חוות הבדיקה,דוד עצוז,052-0000103,"${PNG}",רמת הנגב
`
const consentsPath = join(scratch, 'external-consents.csv')
writeFileSync(consentsPath, FOREIGN_CSV, 'utf8')

/**
 * ⚠️ VIA THE DASHBOARD, AND NEVER WITH A RELOAD.
 *
 * Two constraints meet here. The store is in memory in this build, so a real
 * page load would throw away the 198 records the previous section imported and
 * the whole run would test nothing. And a `goto` to a hash that is ALREADY the
 * current one is not a navigation at all — the wizard stayed on its « done »
 * step and the next section waited sixty seconds for a file input that was not
 * rendered. Bouncing through the dashboard is a hash change in both cases, so
 * the route remounts and the data survives.
 */
async function open(page: Page, hash: string): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(1800)
}

/** The four values the preview band prints. */
async function counts(page: Page): Promise<Record<string, number>> {
  return (await page.evaluate(() => {
    const out: Record<string, number> = {}
    for (const key of ['count-create', 'count-update', 'count-reject', 'count-attach']) {
      const el = document.querySelector(`[data-testid="${key}"] .numeric`)
      if (el) out[key] = Number((el.textContent ?? '').replace(/\D/g, ''))
    }
    return out
  })) as Record<string, number>
}

let browser: Browser | undefined

try {
  browser = await ENGINE.launch()
  const context = await browser.newContext({
    viewport: { width: 1376, height: 1032 },
    locale: 'he-IL',
    acceptDownloads: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)

  // -------------------------------------------------------------------------
  section('A75 — the product owner’s own workbook, through the wizard')
  // -------------------------------------------------------------------------

  await open(page, '#/coordinator/import/prospection')
  /* ★★ AB6.7 — SIX TABS, NOT FIVE: the association's own file, coming back,
     joined the three rosters and the two association imports. A format this
     app can write and cannot read is a one-way door. */
  check(
    'the prospection wizard is reachable and shows six tabs',
    (await page.locator('[data-testid="import-tabs"] .filter-pill').count()) === 6,
    `${await page.locator('[data-testid="import-tabs"] .filter-pill').count()} tabs`,
  )

  await page.locator('[data-testid="sheet-file"]').setInputFiles('docs/samples/prospection-sud.xlsx')
  await page.waitForTimeout(2500)

  /* ⚠️ SCOPED TO THE MAPPING GRID. A bare `document.querySelectorAll('select')`
     also catches the shell's own pickers — it reported 27 for a 26-column
     file, which is the kind of off-by-one that looks like a parsing bug. */
  const readMapping = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="mapping-grid"] select')].map(
        (s) => (s as HTMLSelectElement).value,
      ),
    )
  const mapped = await readMapping()
  check(
    'A75 · all 26 columns were recognised with no help',
    mapped.length === 26 && mapped.every((v) => v !== 'ignore'),
    `${mapped.length} columns, ${mapped.filter((v) => v === 'ignore').length} unrecognised`,
  )

  await page.locator('[data-testid="mapping-next"]').click()
  await page.waitForTimeout(1500)
  {
    const c = await counts(page)
    check(
      'A75 · the preview says 198 to create, 0 to update, 0 skipped',
      c['count-create'] === 198 && c['count-update'] === 0 && c['count-reject'] === 0,
      JSON.stringify(c),
    )
  }

  await page.locator('[data-testid="sheet-confirm"]').click()
  await page.waitForTimeout(2000)
  check(
    'A75 · the report names 198 created',
    (await page.evaluate(() => document.body.innerText)).includes('198'),
    'report shown',
  )

  await open(page, '#/coordinator/farms')
  const listed = await page.evaluate(() => {
    const el = document.querySelector('[data-list-count]')
    return el ? (el.textContent ?? '').trim() : ''
  })
  check(
    'A75 · the roster now holds them (14 fixtures + 198)',
    listed.includes('212'),
    `counter reads ${listed}`,
  )

  // -------------------------------------------------------------------------
  section('A76 — the same file again, in the browser')
  // -------------------------------------------------------------------------

  await open(page, '#/coordinator/import/prospection')
  await page.locator('[data-testid="sheet-file"]').setInputFiles('docs/samples/prospection-sud.xlsx')
  await page.waitForTimeout(2500)
  await page.locator('[data-testid="mapping-next"]').click()
  await page.waitForTimeout(1500)
  {
    const c = await counts(page)
    check(
      'A76 · 0 to create, 198 to update',
      c['count-create'] === 0 && c['count-update'] === 198,
      JSON.stringify(c),
    )
  }

  // -------------------------------------------------------------------------
  section('A83 — a foreign header file, mapped by hand and remembered')
  // -------------------------------------------------------------------------

  await open(page, '#/coordinator/import/signatures')
  await page.locator('[data-testid="sheet-file"]').setInputFiles(consentsPath)
  await page.waitForTimeout(2000)

  const guessed = await readMapping()
  check(
    'A83 · the two foreign columns are honestly reported as unrecognised',
    guessed.length === 6 && guessed[4] === 'ignore' && guessed[5] === 'ignore',
    guessed.join(','),
  )

  /* The coordinator points at them. Column 5 is the signature, 6 the council. */
  const selects = page.locator('[data-testid="mapping-grid"] select')
  await selects.nth(4).selectOption('signature')
  await selects.nth(5).selectOption('council')
  await page.waitForTimeout(300)

  await page.locator('[data-testid="mapping-next"]').click()
  await page.waitForTimeout(1200)
  {
    const c = await counts(page)
    check(
      'A83 · the row is now a creation, with nothing rejected',
      c['count-create'] === 1 && c['count-reject'] === 0,
      JSON.stringify(c),
    )
  }
  await page.locator('[data-testid="sheet-confirm"]').click()
  await page.waitForTimeout(1500)

  /* ★ AA5.6 — and the next import is pre-filled with what he chose. */
  await open(page, '#/coordinator/import/signatures')
  await page.locator('[data-testid="sheet-file"]').setInputFiles(consentsPath)
  await page.waitForTimeout(2000)
  const remembered = await readMapping()
  check(
    'A83 · the mapping was remembered and re-applied',
    remembered[4] === 'signature' && remembered[5] === 'council',
    remembered.join(','),
  )

  // -------------------------------------------------------------------------
  section('A81 — the imported signature, on the farm’s own screen')
  // -------------------------------------------------------------------------

  /* ★ THE TABLE READING, on purpose: at 1376 px the farms screen opens on the
     map, and a marker is not something this gate can read a signature off.
     Y4 folded the old view switch into the map mode, so « contenu plein » IS
     the table. */
  await page.evaluate(() => localStorage.setItem('lo-yanum:map-mode:farms', 'hidden'))
  await open(page, '#/coordinator/farms')
  /* Y12 — the search is a panel behind the magnifier, not a box in the header. */
  await page.locator('[data-testid="list-search-open"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="list-search"]').fill('חוות הבדיקה')
  await page.waitForTimeout(1000)
  await page.locator('[data-testid="list-search-done"]').click()
  await page.waitForTimeout(800)

  const opened = await page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll('a[href*="/coordinator/farms/"], .roster-row, [data-tile]'),
    ]
    const hit = rows.find((el) => (el.textContent ?? '').includes('חוות הבדיקה')) as
      | HTMLElement
      | undefined
    if (!hit) return false
    hit.click()
    return true
  })
  check('A81 · the imported farm is findable in the roster', opened, opened ? 'opened' : 'not found')
  await page.waitForTimeout(2000)

  /* Open the agreements block — it starts folded (U1). */
  await page.evaluate(() => {
    const heads = [...document.querySelectorAll('button, summary')]
    const head = heads.find((h) => (h.textContent ?? '').includes('הסכמים'))
    ;(head as HTMLElement | undefined)?.click()
  })
  await page.waitForTimeout(800)

  const shown = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="imported-signature"]')
    const img = document.querySelector('[data-testid="signature-image"]') as HTMLImageElement | null
    return {
      box: Boolean(box),
      src: img ? img.src.slice(0, 22) : '',
      w: img ? Math.round(img.getBoundingClientRect().width) : 0,
      h: img ? Math.round(img.getBoundingClientRect().height) : 0,
      text: box ? (box.textContent ?? '').slice(0, 80) : '',
    }
  })
  check(
    'A81 · the detail screen carries the imported-signature block',
    shown.box,
    shown.text || 'not found',
  )
  check(
    'A81 · and the signature itself is drawn, with a size on screen',
    shown.src.startsWith('data:image/') && shown.w > 20 && shown.h > 10,
    `${shown.src}… ${shown.w}×${shown.h}`,
  )
  check(
    'A81 · with the file it came from named on the card',
    shown.text.includes('external-consents.csv') || shown.text.includes('חתימה מיובאת'),
    shown.text,
  )

  // -------------------------------------------------------------------------
  section('A78 · A84 — the two exports actually download')
  // -------------------------------------------------------------------------

  for (const [kind, hash] of [
    ['prospection', '#/coordinator/import/prospection'],
    ['signatures', '#/coordinator/import/signatures'],
  ] as const) {
    await open(page, hash)
    const wait = page.waitForEvent('download', { timeout: 20_000 })
    await page.locator('[data-testid="sheet-export"]').click()
    try {
      const file = await wait
      const path = await file.path()
      check(
        `${kind}: the export downloads as an .xlsx`,
        file.suggestedFilename().endsWith('.xlsx') && Boolean(path),
        file.suggestedFilename(),
      )
    } catch {
      check(`${kind}: the export downloads as an .xlsx`, false, 'no download event')
    }
  }

  await context.close()
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed  (${ENGINE_NAME})`)
console.log('')
if (failed > 0) process.exit(1)
