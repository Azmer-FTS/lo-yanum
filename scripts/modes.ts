import { chromium, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ★★ Y4 — THE THREE DISPLAY MODES BEHAVE THE SAME ON ALL FIVE LISTS.
 *
 *      bun run modes
 *      ENGINE=webkit bun run modes
 *
 * The product owner's report was that the modes "se comportent différemment
 * selon l'écran", and his rule is three sentences:
 *
 *   mode PARTAGÉ       carte + liste en cartes-vignettes (photo à DROITE)
 *   mode CONTENU PLEIN bascule automatique en TABLEAU dense
 *   mode CARTE PLEINE  carte seule
 *
 * "Plus aucune différence de comportement d'un écran à l'autre." So this gate
 * asks the SAME four questions of farms, volunteers, drivers, guards and
 * incidents, and a screen that answers any of them differently fails.
 *
 * ★★ "PHOTO À DROITE" IS MEASURED IN PIXELS, NOT READ FROM A CLASS NAME. It
 *    has been asked for four times and written into the code twice; a check
 *    that greps for `order-first` would have passed both of the versions he
 *    rejected. The photo's centre is compared with the tile's centre, and the
 *    tile is required to be wide enough for the answer to mean something.
 *
 * ⚠️ AND THE MODE IS SET THE WAY THE APP STORES IT, then loaded fresh —
 *    `lo-yanum:map-mode:<screen>`, which is what the pill writes. Clicking the
 *    pill would work too and would also be testing the pill; this gate is
 *    about what each mode DRAWS.
 */

const PORT = Number(process.env.MODES_PORT ?? 5199)
const OUT_DIR = 'dist-modes'
const SHOTS = 'docs/screenshots/modes'
const ENGINE = process.env.ENGINE === 'webkit' ? webkit : chromium
const ENGINE_NAME = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'

const VIEWPORTS = [
  { name: 'iphone', width: 402, height: 874 },
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
] as const

/** The five lists the rule names, and nothing else. */
const LISTS = [
  { name: 'fermes', key: 'farms', hash: '#/coordinator/farms', tile: 'farm-tile', roster: '.roster-farms' },
  { name: 'volontaires', key: 'volunteers', hash: '#/coordinator/volunteers', tile: 'volunteer-tile', roster: '.roster-volunteers' },
  { name: 'conducteurs', key: 'drivers', hash: '#/coordinator/drivers', tile: 'driver-tile', roster: '.roster-drivers' },
  { name: 'gardes', key: 'missions', hash: '#/coordinator/missions', tile: 'mission-tile', roster: '.roster-missions' },
  { name: 'incidents', key: 'incidents', hash: '#/coordinator/incidents', tile: 'incident-tile', roster: '.roster-incidents' },
] as const

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

console.log('')
console.log(`  Y4 — ONE BEHAVIOUR PER MODE, ON ALL FIVE LISTS (${ENGINE_NAME})`)
console.log('  ================================================================')

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

async function load(page: Page, hash: string, key: string, mode: string): Promise<void> {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ([k, m]) => localStorage.setItem(`lo-yanum:map-mode:${k}`, m as string),
    [key, mode] as [string, string],
  )
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(3200)
}

let browser: Browser | null = null
try {
  browser = await ENGINE.launch()
  await Bun.$`mkdir -p ${SHOTS}`.quiet()

  for (const vp of VIEWPORTS) {
    console.log('')
    console.log(`  ${vp.name} — ${vp.width}×${vp.height}`)
    console.log(`  ${'-'.repeat(vp.name.length + 14)}`)
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)

    for (const list of LISTS) {
      // ---- split: card-tiles, photo on the physical right -------------------
      await load(page, list.hash, list.key, 'split')
      const split = await page.evaluate((sel) => {
        const tiles = [...document.querySelectorAll<HTMLElement>(`[data-testid="${sel}"]`)]
        if (!tiles.length) return { tiles: 0, rightmost: 0, offCentre: 0, width: 0 }
        let rightmost = 0
        let worstOffset = Number.POSITIVE_INFINITY
        let width = 0
        for (const tile of tiles) {
          const photo = tile.querySelector<HTMLElement>(`[data-testid="${sel}-photo"]`)
          if (!photo) continue
          const t = tile.getBoundingClientRect()
          const p = photo.getBoundingClientRect()
          width = Math.round(t.width)
          // Positive when the photo's centre is to the RIGHT of the tile's.
          const offset = p.left + p.width / 2 - (t.left + t.width / 2)
          if (offset > 0) rightmost++
          if (offset < worstOffset) worstOffset = offset
        }
        return {
          tiles: tiles.length,
          rightmost,
          offCentre: Math.round(worstOffset),
          width,
        }
      }, list.tile)

      check(
        `${list.name} · PARTAGÉ draws card-tiles`,
        split.tiles > 0,
        `${split.tiles} tiles`,
      )
      if (split.tiles > 0) {
        check(
          `${list.name} · PARTAGÉ — the photo is on the PHYSICAL RIGHT of every tile`,
          split.rightmost === split.tiles && split.offCentre > 8,
          `${split.rightmost}/${split.tiles} tiles, thinnest offset +${split.offCentre}px in a ${split.width}px tile`,
        )
      }
      const rosterInSplit = await page.locator(`${list.roster} .roster-row`).count()
      check(
        `${list.name} · PARTAGÉ shows no dense table`,
        rosterInSplit === 0,
        rosterInSplit ? `${rosterInSplit} roster rows beside the map` : '',
      )
      if (vp.name === 'ipad') {
        await page.screenshot({ path: `${SHOTS}/${list.name}-split.png` })
      }

      // ---- hidden: the dense table -----------------------------------------
      await load(page, list.hash, list.key, 'hidden')
      const rosterRows = await page.locator(`${list.roster} .roster-row`).count()
      const tilesInTable = await page.locator(`[data-testid="${list.tile}"]`).count()
      check(
        `${list.name} · CONTENU PLEIN switches to a dense TABLE`,
        rosterRows > 0 && tilesInTable === 0,
        `${rosterRows} roster rows, ${tilesInTable} card-tiles`,
      )
      if (vp.name === 'ipad-ls') {
        await page.screenshot({ path: `${SHOTS}/${list.name}-table.png` })
      }

      // ---- full: the map alone ---------------------------------------------
      await load(page, list.hash, list.key, 'full')
      const full = await page.evaluate(() => {
        const content = document.querySelector<HTMLElement>('[data-map-content]')
        const map = document.querySelector<HTMLElement>('[data-map-panel]')
        const visible = (el: HTMLElement | null): boolean => {
          if (!el) return false
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        }
        return { content: visible(content), map: visible(map) }
      })
      check(
        `${list.name} · CARTE PLEINE is the map alone`,
        full.map && !full.content,
        `map ${full.map ? 'drawn' : 'MISSING'}, content column ${full.content ? 'STILL DRAWN' : 'gone'}`,
      )
    }
    await context.close()
  }
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log('  VERDICT')
console.log('  -------')
console.log(`  ${passed} passed, ${failed} failed`)
console.log(`  captures: ${SHOTS}/`)
process.exit(failed === 0 ? 0 : 1)
