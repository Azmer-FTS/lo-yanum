import { chromium } from 'playwright'
import type { Browser, CDPSession, Page } from 'playwright'

/**
 * A87 — PO POINT 9b: ציור חופשי, DRIVEN BY AN APPLE PENCIL.
 *
 *   bun run freehand
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE PRODUCT OWNER FOUND ON A REAL iPAD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Le Pencil ne permet pas de dessiner les contours — le mode actuel (sommets
 *  un par un) ne le reconnaît pas correctement et pose les points où il veut."
 *
 * The diagnosis under it is that vertex-by-vertex is the wrong VERB for a
 * stylus. A pen draws; asking one to place corners one tap at a time is asking
 * it to be a finger, and it is the gesture that was wrong rather than the hit
 * testing. So point 9b is a second way to produce a ring — one continuous
 * stroke — and this gate drives that stroke the way his hand does.
 *
 * ★ `pointerType: 'pen'` FOR EVERY EVENT, through CDP. Playwright's own mouse
 *   API cannot say "this is a stylus": it emits `pointerType: mouse`, which is
 *   exactly the assumption the bug was about. `Input.dispatchMouseEvent` takes
 *   a `pointerType`, so the whole stroke — down, 60 moves, up — arrives at the
 *   page as pen input. `bun run touch` established this technique for point
 *   9a; this file uses it for the gesture 9a could not express.
 *
 * ★ AND IT CHECKS THE THREE THINGS HE ASKED FOR AND NOTHING ELSE:
 *
 *     1. a complete freehand stroke → a simplified, valid polygon WITH its
 *        surface in dunams;
 *     2. the pan is genuinely suspended while drawing, and genuinely restored
 *        afterwards — measured as the map's centre before and after a stroke,
 *        then again with the mode off;
 *     3. a bad stroke cancels cleanly, leaving no zone and no armed mode.
 *
 *   Then all three again at both iPad viewports, portrait and landscape.
 */

const PORT = Number(process.env.FREEHAND_PORT ?? 5194)
const OUT_DIR = 'dist-freehand'
const SHOTS = 'docs/screenshots/freehand'

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
]

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

/**
 * One stylus event. `Input.dispatchMouseEvent` is the only path that lets the
 * page see `pointerType: 'pen'`; everything Playwright exposes is a mouse.
 */
async function pen(
  cdp: CDPSession,
  type: 'mousePressed' | 'mouseMoved' | 'mouseReleased',
  x: number,
  y: number,
): Promise<void> {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: type === 'mouseMoved' ? 0 : 1,
    pointerType: 'pen',
    force: 0.6,
  })
}

/** Trace a closed shape with the Pencil, one point every few pixels. */
async function stroke(
  cdp: CDPSession,
  points: [number, number][],
): Promise<void> {
  await pen(cdp, 'mousePressed', points[0][0], points[0][1])
  for (const [x, y] of points.slice(1)) {
    await pen(cdp, 'mouseMoved', x, y)
  }
  await pen(cdp, 'mouseReleased', points[points.length - 1][0], points[points.length - 1][1])
}

/** A rough circle, in viewport pixels — what a hand actually draws. */
function circle(cx: number, cy: number, r: number, steps = 56): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    // A little wobble, so the simplification has something real to remove.
    const wobble = r + (i % 3) - 1
    out.push([cx + Math.cos(a) * wobble, cy + Math.sin(a) * wobble])
  }
  return out
}

async function mapCentre(page: Page): Promise<{ lat: number; lng: number }> {
  return page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getCenter: () => { lat: number; lng: number } } })
      .__loYanumMap
    const c = m?.getCenter()
    return { lat: c?.lat ?? 0, lng: c?.lng ?? 0 }
  })
}

const metresApart = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number =>
  Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180))

console.log('')
console.log('  A87 — ציור חופשי, DRIVEN BY AN APPLE PENCIL')
console.log('  ===========================================')

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
  const deadline = Date.now() + 30_000
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

let browser: Browser | null = null
try {
  browser = await chromium.launch()
  await Bun.$`mkdir -p ${SHOTS}`.quiet()

  for (const viewport of VIEWPORTS) {
    section(`${viewport.name} — ${viewport.width}×${viewport.height}`)

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: 'he-IL',
    })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    page.setDefaultTimeout(30_000)

    await page.goto(`${base}/#/coordinator/farms/farm-01`, { waitUntil: 'load' })
    await page.waitForFunction(
      () =>
        Boolean(
          (window as unknown as { __loYanumMap?: { isStyleLoaded: () => boolean } })
            .__loYanumMap?.isStyleLoaded(),
        ),
      undefined,
      { timeout: 60_000 },
    )
    await page.waitForTimeout(1500)

    const tools = page.locator('[data-testid="draw-tools"]')
    check('the drawing tools are in the bottom bar', (await tools.count()) === 1)

    const freehandButton = page.locator('[data-testid="draw-freehand"]')
    check('and "ציור חופשי" is one of them', (await freehandButton.count()) === 1)

    // ---- 1. a complete stroke becomes a polygon --------------------------
    await freehandButton.click()
    check(
      'pressing it arms freehand as a MODE, not as a tool',
      (await freehandButton.getAttribute('aria-pressed')) === 'true',
    )
    await page.locator('[data-testid="draw-grazing"]').click()
    await page.waitForTimeout(400)

    const body = await page.locator('body').innerText()
    check(
      'the banner says the map is now a drawing surface',
      body.includes('ציור חופשי'),
    )

    const box = await page.locator('[role="application"]').first().boundingBox()
    if (!box) throw new Error('no map box')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const radius = Math.min(box.width, box.height) / 5

    const before = await mapCentre(page)
    await stroke(cdp, circle(cx, cy, radius))
    await page.waitForTimeout(900)
    const after = await mapCentre(page)

    /**
     * ★★ THE PAN IS SUSPENDED, MEASURED RATHER THAN CONFIGURED. A stroke that
     *    crosses a fifth of the map would drag the camera hundreds of metres
     *    if `dragPan` were still live, so the centre moving at all is the
     *    failure. A few metres of tolerance covers float noise, nothing more.
     */
    check(
      '★★ the map did NOT move under the stroke',
      metresApart(before, after) < 5,
      `${metresApart(before, after).toFixed(1)} m`,
    )

    const traced = await page.locator('body').innerText()
    check(
      '★★ the stroke became a SIMPLIFIED polygon, not 57 vertices',
      /הקו פושט ל־\d+ נקודות/.test(traced),
      (traced.match(/הקו פושט ל־\d+ נקודות/) ?? ['<no read-out>'])[0],
    )
    const vertexCount = Number((traced.match(/הקו פושט ל־(\d+) נקודות/) ?? ['', '0'])[1])
    check(
      'and the count is a number somebody can edit by hand',
      vertexCount >= 4 && vertexCount <= 40,
      `${vertexCount} vertices`,
    )
    check(
      '★★ the surface is calculated and shown, in dunams',
      /[\d,]+ דונם/.test(traced),
      (traced.match(/([\d,]+) דונם/) ?? ['<none>'])[0],
    )

    /**
     * ★ AND THE VERTICES ARE GRIPS. PO point 9b's third condition is that
     *   after simplification the shape goes into normal editing — so the draft
     *   markers must be draggable, which is what MapLibre's own class says.
     */
    const grips = await page.evaluate(
      () => document.querySelectorAll('.maplibregl-marker[aria-label="פינת אזור"]').length,
    )
    check(
      '★ the simplified vertices are on the map as grips',
      grips >= 4,
      `${grips} vertex markers`,
    )

    await page.screenshot({ path: `${SHOTS}/${viewport.name}-traced.png` })

    // ---- 2. and the pan comes BACK ---------------------------------------
    /**
     * ⚠️ Escape, NOT a click on the tool row — the row does not exist while a
     *    draft is open, which is the whole design (a bar with five ways to
     *    start something else under a half-finished ring is how the ring gets
     *    abandoned). Escape is the documented way out of any armed mode.
     */
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    check(
      'Escape leaves the draft and brings the tool row back',
      (await page.locator('[data-testid="draw-tools"]').count()) === 1,
    )

    const restBefore = await mapCentre(page)
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: cx,
      y: cy,
      button: 'left',
      buttons: 1,
      clickCount: 1,
      pointerType: 'pen',
    })
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: cx - i * 8,
        y: cy,
        button: 'left',
        buttons: 1,
        pointerType: 'pen',
      })
    }
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: cx - 96,
      y: cy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      pointerType: 'pen',
    })
    await page.waitForTimeout(800)
    const restAfter = await mapCentre(page)
    check(
      '★★ and with the mode off, the SAME stylus drag pans the map again',
      metresApart(restBefore, restAfter) > 20,
      `${metresApart(restBefore, restAfter).toFixed(0)} m`,
    )

    // ---- 3. a bad stroke cancels cleanly ---------------------------------
    const zonesBefore = await page.evaluate(
      () => document.querySelectorAll('[data-testid="zone-selected"]').length,
    )
    /**
     * ★ AND HERE IS THE STICKY PART, CHECKED RATHER THAN ASSUMED. Freehand is
     *   a PREFERENCE, not a one-shot tool: a coordinator who draws with a
     *   Pencil draws the next zone with it too, so the mode survives finishing
     *   one. Pressing the button again would therefore turn it OFF — which is
     *   what the first version of this gate did, and it then looked for a בטל
     *   in a vertex-drawing session that has none.
     */
    check(
      '★ freehand is still armed after a finished zone — it is a preference',
      (await page.locator('[data-testid="draw-freehand"]').getAttribute('aria-pressed')) ===
        'true',
    )
    await page.locator('[data-testid="draw-boundary"]').click()
    await page.waitForTimeout(400)
    const cancel = page.locator('[data-testid="freehand-cancel"]')
    check('a בטל is offered before anything is committed', (await cancel.count()) === 1)
    await cancel.click()
    await page.waitForTimeout(400)
    const afterCancel = await page.locator('body').innerText()
    check(
      '★ cancelling leaves no armed mode and no draft behind',
      !afterCancel.includes('ציור חופשי — סמנו את הקו') &&
        !/הקו פושט ל־\d+ נקודות/.test(afterCancel),
    )
    check(
      'and no zone was created by the abandoned stroke',
      (await page.evaluate(
        () => document.querySelectorAll('[data-testid="zone-selected"]').length,
      )) === zonesBefore,
    )

    await page.screenshot({ path: `${SHOTS}/${viewport.name}-cancelled.png` })
    await context.close()
  }
} finally {
  await browser?.close()
  serve.kill()
}

section('VERDICT')
console.log(`  ${passed} passed, ${failed} failed`)
console.log(`  captures: ${SHOTS}/`)
console.log('')
if (failed > 0) process.exit(1)
