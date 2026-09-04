import { chromium, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ★★ Y5 + Y6 — ONE STAT TILE IN THE WHOLE APP, AND THE ROWS THEY SIT IN REACH
 *    THE EDGE.
 *
 *      bun run band
 *      ENGINE=webkit bun run band
 *
 * Y5 is the product owner's THIRD request for this, and the reason the first
 * two did not land is that both were checked by eye. X7.3 gave the list chips
 * the entity sheet's COLORIMETRY, so a screenshot of a green chip beside a
 * green band card looks like a match — while the chip was 44 px tall with a
 * 28 px disc and the card was 84 px tall with a 44 px one. Colour is what a
 * capture shows; size is what it hides.
 *
 * So this gate MEASURES, on every screen that draws a row of figures:
 *
 *   · the card's height,
 *   · the icon disc's box,
 *   · the glyph inside it,
 *
 * and fails if any two disagree by more than a pixel. The reference is the
 * FICHE D'ENTITÉ — the product owner named it as the model — so the numbers
 * are taken from a farm's sheet at run time rather than typed here: if the
 * sheet's band changes, everything else has to follow it, which is the rule
 * he actually stated.
 *
 * Y6 is the row those cards sit in:
 *
 *   · it reaches its scroll container's inline edges — "les rangées swipables
 *     ne vont pas jusqu'au bord",
 *   · and it has room inside for the shadow — "l'ombre des vignettes est
 *     coupée à gauche et à droite (marge du conteneur qui rogne)". A card's
 *     `--shadow-card` is `0 4px 14px`; the padding at each end has to hold it.
 */

const PORT = Number(process.env.BAND_PORT ?? 5200)
const OUT_DIR = 'dist-band'
const SHOTS = 'docs/screenshots/band'
const ENGINE = process.env.ENGINE === 'webkit' ? webkit : chromium
const ENGINE_NAME = process.env.ENGINE === 'webkit' ? 'webkit' : 'chromium'

/** The blur radius of `--shadow-card`, which is what the padding must hold. */
const SHADOW_ROOM = 14

const VIEWPORTS = [
  { name: 'iphone', width: 402, height: 874 },
  { name: 'ipad', width: 1032, height: 1376 },
] as const

/** Every screen the product owner named, plus the sheet that is the model. */
const SCREENS = [
  { name: 'fiche de ferme (le modèle)', hash: '#/coordinator/farms/farm-01', reference: true },
  { name: 'tableau de bord', hash: '#/coordinator' },
  { name: 'fermes', hash: '#/coordinator/farms' },
  { name: 'volontaires', hash: '#/coordinator/volunteers' },
  { name: 'conducteurs', hash: '#/coordinator/drivers' },
  { name: 'détail de garde', hash: '#/coordinator/missions/mission-01' },
  { name: 'incidents', hash: '#/coordinator/incidents' },
] as const

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

console.log('')
console.log(`  Y5/Y6 — ONE STAT TILE, AND ROWS THAT REACH THE EDGE (${ENGINE_NAME})`)
console.log('  =====================================================================')

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

interface Geometry {
  cards: number
  heights: number[]
  discs: number[]
  glyphs: number[]
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('.band-card')].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const heights: number[] = []
    const discs: number[] = []
    const glyphs: number[] = []
    for (const card of cards) {
      heights.push(Math.round(card.getBoundingClientRect().height))
      const disc = card.firstElementChild as HTMLElement | null
      if (disc) {
        const d = disc.getBoundingClientRect()
        discs.push(Math.round(d.height))
        const svg = disc.querySelector('svg')
        if (svg) glyphs.push(Math.round(svg.getBoundingClientRect().height))
      }
    }
    return { cards: cards.length, heights, discs, glyphs }
  })
}

const uniq = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b)

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

    /** The model's numbers, read from the sheet rather than typed here. */
    let model: { h: number; disc: number; glyph: number } | null = null
    const seen: Array<{ screen: string; h: number[]; disc: number[]; glyph: number[] }> = []

    for (const screen of SCREENS) {
      await page.goto(`${base}/${screen.hash}`, { waitUntil: 'load' })
      await page.waitForTimeout(3000)

      const g = await geometry(page)
      if (g.cards === 0) {
        /**
         * ⚠️ SAID OUT LOUD RATHER THAN PASSED QUIETLY. The incidents screen has
         *    no band of figures: its counts live on the filter pills (Y7), and
         *    Y5's list of screens names it because the product owner was
         *    listing where he sees numbers, not asserting a band exists there.
         *    A check that passes because there was nothing to check is the
         *    kind that hides a band being deleted by accident, so this branch
         *    reports and does not count.
         */
        console.log(`  ----  ${screen.name}: no band of figures on this screen (its counts are on the filter pills)`)
        if (screen.reference) {
          check(`${screen.name}: the MODEL has a band to be the model of`, false, 'no .band-card found')
        }
        continue
      }

      const h = uniq(g.heights)
      const disc = uniq(g.discs)
      const glyph = uniq(g.glyphs)
      seen.push({ screen: screen.name, h, disc, glyph })

      check(
        `${screen.name}: its own ${g.cards} cards agree with each other`,
        h.length === 1 && disc.length === 1,
        `heights ${h.join('/')}, discs ${disc.join('/')}`,
      )

      if (screen.reference) {
        model = { h: h[0], disc: disc[0], glyph: glyph[0] ?? 0 }
        console.log(
          `        the model: ${model.h}px card, ${model.disc}px disc, ${model.glyph}px glyph`,
        )
        continue
      }
      if (!model) continue
      check(
        `${screen.name}: the SAME height as the entity sheet`,
        Math.abs(h[0] - model.h) <= 1,
        `${h[0]}px vs the model's ${model.h}px`,
      )
      check(
        `${screen.name}: the SAME icon disc and glyph`,
        Math.abs(disc[0] - model.disc) <= 1 &&
          (glyph.length === 0 || Math.abs(glyph[0] - model.glyph) <= 1),
        `disc ${disc[0]}px vs ${model.disc}px, glyph ${glyph[0] ?? '—'}px vs ${model.glyph}px`,
      )

      // ---- Y6: the row reaches the edge and holds its shadow ---------------
      const rows = await page.evaluate(
        (room) =>
          [...document.querySelectorAll<HTMLElement>('.scroll-row, .carousel-2')]
            .filter((el) => {
              const r = el.getBoundingClientRect()
              return r.width > 0 && r.height > 0 && el.children.length > 0
            })
            .map((el) => {
              const r = el.getBoundingClientRect()
              const host = el.parentElement as HTMLElement
              const hr = host.getBoundingClientRect()
              const cs = getComputedStyle(el)
              const padStart = parseFloat(cs.paddingInlineStart) || 0
              const padEnd = parseFloat(cs.paddingInlineEnd) || 0
              return {
                tag: (el.className || '').toString().split(/\s+/)[0],
                // How far the row's box stops short of its host's box.
                shortBy: Math.round(Math.max(hr.left - r.left, r.right - hr.right) * -1),
                padStart: Math.round(padStart),
                padEnd: Math.round(padEnd),
                room,
              }
            }),
        SHADOW_ROOM,
      )
      for (const row of rows) {
        check(
          `${screen.name}: the swipable "${row.tag}" reaches its container's edges`,
          row.shortBy <= 1,
          row.shortBy > 0
            ? `stops ${row.shortBy}px short of them`
            : `bleeds ${-row.shortBy}px past them, which is the point`,
        )
        check(
          `${screen.name}: and holds a ${SHADOW_ROOM}px shadow at both ends`,
          row.padStart >= SHADOW_ROOM && row.padEnd >= SHADOW_ROOM,
          `padding ${row.padStart}px / ${row.padEnd}px`,
        )
      }

      if (vp.name === 'ipad') {
        await page.screenshot({
          path: `${SHOTS}/${screen.name.replace(/[^\p{L}\d]+/gu, '-')}.png`,
        })
      }
    }

    if (vp.name === 'ipad') {
      console.log('')
      console.log('        card / disc / glyph, screen by screen:')
      for (const s of seen) {
        console.log(
          `          ${s.screen.padEnd(28)} ${s.h.join('/')}px  ${s.disc.join('/')}px  ${s.glyph.join('/') || '—'}px`,
        )
      }
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
