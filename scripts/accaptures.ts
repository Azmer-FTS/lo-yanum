import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AC5 (2026-09-08) — LES CAPTURES DE CETTE PASSE, ET LA SEULE VÉRIFICATION
 *    QU'UNE SONDE NE PEUT PAS FAIRE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run accaptures
 *   BASE_URL=http://localhost:5214 bun run accaptures   (dry run, local build)
 *
 * ★ ON THE DEPLOYED TWIN. The standing rule since §29: nothing is delivered
 *   until it is shown on a URL the product owner can open himself.
 *   `/lo-yanum/demo/` is the same commit and the same bundle as the real app,
 *   without the login door (see `deploy.yml`).
 *
 * ★★ AND IT MEASURES WHILE IT PHOTOGRAPHS — AA6.2, WHICH IS THE Z1bis LESSON.
 *
 *    Z1bis was found on a CAPTURE and by nothing else: on the phone, the
 *    pinned list header covered the first farm by sixty-three pixels at rest.
 *    A58 could not see it, and the reason is worth restating every time this
 *    file is opened: it probes with `elementFromPoint` INSIDE the header's own
 *    rectangle, and an OPAQUE header answers « me » whatever is behind it. The
 *    only question that can be asked of two opaque boxes is a question about
 *    two RECTANGLES.
 *
 *    So every frame is also a geometric reading, on the deployed page, at
 *    rest: the bottom of each pinned header against the top of the first thing
 *    under it. It fails the run rather than only printing, because a capture
 *    nobody re-reads is a capture that proves nothing.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(/\/$/, '')
const OUT = 'docs/screenshots/acpass'

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
] as const

const THEMES = ['light', 'dark'] as const

interface Shot {
  name: string
  hash: string
  mode?: { key: string; value: 'split' | 'hidden' | 'full' }
  wait?: number
  act?: (page: Page) => Promise<void>
  /** Skip the overlap reading — a screen with no pinned list header. */
  noRest?: boolean
}

const SHOTS: Shot[] = [
  /* AC4 — the roster in its three readings: beside the map, as a table (where
     the שמירות column lives), and with the filters unfolded. */
  { name: 'fermes', hash: '#/coordinator/farms', mode: { key: 'farms', value: 'split' }, wait: 6500 },
  {
    /* ★★ AC4.4 — CONTENU PLEIN is where the equity columns are, so this is the
       frame the whole pass is judged on: nights received and the date of the
       last one, beside the weighted total they are NOT to be confused with. */
    name: 'fermes-tableau',
    hash: '#/coordinator/farms',
    mode: { key: 'farms', value: 'hidden' },
    wait: 6000,
  },
  {
    /* ★ AC4.4 — the sort picker open on the three equity orders. */
    name: 'fermes-tri',
    hash: '#/coordinator/farms',
    mode: { key: 'farms', value: 'hidden' },
    wait: 6000,
    act: async (page) => {
      const select = page.locator('[data-testid="farms-sort"] select')
      if (await select.count()) {
        await select.selectOption('guardsAsc')
        await page.waitForTimeout(1200)
      }
    },
  },
  {
    /* ★ AC4.5 — « נשכחו », switched on, with the mark on every row it leaves. */
    name: 'fermes-nsheh',
    hash: '#/coordinator/farms',
    mode: { key: 'farms', value: 'hidden' },
    wait: 6000,
    act: async (page) => {
      const pill = page.locator('[data-testid="farms-neglected"]')
      if (await pill.count()) {
        await pill.click()
        await page.waitForTimeout(1200)
      }
    },
  },
  {
    name: 'fermes-filtres',
    hash: '#/coordinator/farms',
    mode: { key: 'farms', value: 'split' },
    wait: 6000,
    act: async (page) => {
      const button = page.locator('[data-testid="filter-dropdown"]')
      if (await button.count()) {
        await button.click()
        await page.waitForTimeout(700)
      }
    },
  },
  /* AC3 · AC4.1 · AC4.2 — the guarded-area card, and the coverage block. */
  { name: 'fiche-ferme', hash: '#/coordinator/farms/farm-01', wait: 6500, noRest: true },
  {
    name: 'fiche-ferme-pariza',
    hash: '#/coordinator/farms/farm-01',
    wait: 6500,
    noRest: true,
    act: async (page) => {
      const block = page.locator('[data-testid="farm-coverage"]')
      if (await block.count()) await block.scrollIntoViewIfNeeded()
      await page.waitForTimeout(900)
    },
  },
  /* AC1 · AC2 · AC3 — שם החווה, ארגון מאגד, מייל חקלאי and the guarded field. */
  { name: 'formulaire-ferme', hash: '#/coordinator/farms/farm-01/edit', wait: 6500, noRest: true },
  /* AC2 — the wizard, on the workbook that is now 32 columns wide. */
  { name: 'import-prospection', hash: '#/coordinator/import/prospection', wait: 4500, noRest: true },
  { name: 'import-association', hash: '#/coordinator/import/association', wait: 4500, noRest: true },
  /* AC3.3 · AC4.6 · AC4.7 — the export, its report and the definitions. */
  { name: 'export', hash: '#/coordinator/export', wait: 5000, noRest: true },
  /* AC4.5 — the threshold, in הגדרות, under the target. */
  { name: 'reglages', hash: '#/coordinator/settings', wait: 5000, noRest: true },
  /* The screens the pass did not touch, kept so a regression shows up here. */
  { name: 'tableau-de-bord', hash: '#/coordinator', wait: 6000 },
  { name: 'agenda', hash: '#/coordinator/agenda', mode: { key: 'agenda', value: 'split' }, wait: 6500, noRest: true },
  { name: 'volontaires', hash: '#/coordinator/volunteers', mode: { key: 'volunteers', value: 'split' }, wait: 6500 },
  { name: 'gardes', hash: '#/coordinator/missions', mode: { key: 'missions', value: 'split' }, wait: 6500 },
]

/**
 * AA6.2 — the Z1bis reading. TWO RECTANGLES, at rest, and nothing else.
 *
 * ⚠️ IT ASKS ABOUT THE FIRST THING UNDER THE HEADER, not about a grid of
 *    points inside it. `elementFromPoint` is blind here by construction; the
 *    bottom edge of the pinned box against the top edge of the first row is
 *    not.
 */
function restingOverlap(): Array<{ what: string; by: number }> {
  const out: Array<{ what: string; by: number }> = []
  const bars = document.querySelectorAll('[data-list-top]')
  bars.forEach((bar, i) => {
    const head = bar.getBoundingClientRect()
    if (head.height < 8) return
    /* The first piece of CONTENT after the header, in document order. */
    let scroller: Element | null = bar.parentElement
    while (scroller) {
      const s = getComputedStyle(scroller)
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') break
      scroller = scroller.parentElement
    }
    const root = scroller ?? document.body
    const items = [...root.querySelectorAll('[data-tile], .roster-row, article, li')].filter(
      (el) => !bar.contains(el) && el.getBoundingClientRect().height > 8,
    )
    const first = items[0]
    if (!first) return
    const box = first.getBoundingClientRect()
    /* Only the row that STARTS above the header's foot is covered. A row that
       begins below it is simply the next row. */
    if (box.top < head.bottom - 1 && box.bottom > head.top) {
      out.push({ what: `list ${i + 1}`, by: Math.round(head.bottom - box.top) })
    }
  })
  return out
}

console.log('')
console.log(`  AC5 — CAPTURES CLAIR + SOMBRE, ET LA LECTURE AU REPOS : ${BASE}`)
console.log('  ================================================================')

let browser: Browser | null = null
let taken = 0
let failed = 0

try {
  browser = await chromium.launch()
  await Bun.$`mkdir -p ${OUT}`.quiet()

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'he-IL',
        hasTouch: true,
        colorScheme: theme,
      })
      const page = await context.newPage()
      page.setDefaultTimeout(60_000)

      for (const shot of SHOTS) {
        await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
        await page.evaluate(
          (t) => {
            for (const key of Object.keys(localStorage)) {
              if (key.startsWith('lo-yanum:map-mode:') || key === 'lo-yanum:view-as') {
                localStorage.removeItem(key)
              }
            }
            localStorage.setItem('lo-yanum:theme:coordinator', t as string)
          },
          theme as string,
        )
        if (shot.mode) {
          await page.evaluate(
            ([k, v]) => localStorage.setItem(`lo-yanum:map-mode:${k}`, v as string),
            [shot.mode.key, shot.mode.value] as [string, string],
          )
        }
        await page.goto(`${BASE}/${shot.hash}`, { waitUntil: 'load' })
        await page.waitForTimeout(shot.wait ?? 4000)
        if (shot.act) await shot.act(page)

        const file = `${OUT}/${vp.name}-${theme}-${shot.name}.png`
        await page.screenshot({ path: file })
        taken++

        let verdict = ''
        if (!shot.noRest) {
          const covered = (await page.evaluate(restingOverlap)) as Array<{
            what: string
            by: number
          }>
          if (covered.length > 0) {
            failed++
            verdict = `  FAIL — ${covered.map((c) => `${c.what} hidden by ${c.by}px`).join(', ')}`
          } else {
            verdict = '  at rest: clear'
          }
        }
        console.log(`  ${vp.name.padEnd(8)} ${theme.padEnd(5)} ${shot.name.padEnd(22)}${verdict}`)
      }
      await context.close()
    }
  }
} finally {
  await browser?.close()
}

console.log('')
console.log(`  ${taken} captures dans ${OUT}/ — ${failed} recouvrement(s) au repos`)
console.log('')
if (failed > 0) process.exit(1)
