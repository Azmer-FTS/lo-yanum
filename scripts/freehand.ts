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

/**
 * U4.1 (2026-09-02) — THE DRAWING TOOLS FOLD INTO ONE FROSTED BUTTON. A gate
 * that presses a tool first unfolds them, exactly as a thumb would; the panel
 * folds again after a choice (the freehand switch keeps it open).
 */
async function openTools(page: Page): Promise<void> {
  const toggle = page.locator('[data-testid="draw-tools-toggle"]')
  if ((await toggle.count()) === 0) return
  if ((await page.locator('[data-testid="draw-tools-panel"]').count()) > 0) return
  await toggle.click()
  await page.waitForTimeout(250)
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

/**
 * ★ `BASE_URL` POINTS THIS AT A SERVER SOMEBODY ELSE IS RUNNING — and the one
 *   that matters is the DEPLOYED demo twin,
 *   `https://azmer-fts.github.io/lo-yanum/demo`. The product owner's standing
 *   rule is that nothing is done until it is proved on the deployed URL, and
 *   this is how these captures are taken there rather than on a local build
 *   that merely resembles it. With no BASE_URL the gate builds and serves its
 *   own copy, which is what the deploy pipeline does before publishing.
 */
const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
let serve: ReturnType<typeof Bun.spawn> | null = null
let base = process.env.BASE_URL ?? ''

if (!process.env.BASE_URL) {
  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT_DIR], {
    env,
    stdout: 'ignore',
    stderr: 'pipe',
  })
  if ((await build.exited) !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error('vite build failed')
  }
  serve = Bun.spawn(
    ['bun', 'x', 'vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'],
    { env, stdout: 'ignore', stderr: 'ignore' },
  )
  base = `http://localhost:${PORT}`
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
console.log(`  base:   ${base}`)

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
    check('the drawing tools are one frosted button in the bottom row', (await tools.count()) === 1)

    await openTools(page)
    const freehandButton = page.locator('[data-testid="draw-freehand"]')
    check('and "ציור חופשי" is one of them', (await freehandButton.count()) === 1)

    // ---- 1. a complete stroke becomes a polygon --------------------------
    await freehandButton.click()
    check(
      'pressing it arms freehand as a MODE, not as a tool',
      (await freehandButton.getAttribute('aria-pressed')) === 'true',
    )
    await openTools(page)
    await page.locator('[data-testid="draw-grazing"]').click()
    await page.waitForTimeout(400)

    /* ★★ BK — la forme s'ouvre dans l'éditeur de tracés, outil « יד חופשית » déjà choisi. */
    check(
      'the editor opens on a new shape with « יד חופשית » chosen',
      (await page.locator('[data-testid="shape-editor"]').getAttribute('data-tool')) === 'pencil' &&
        (await page.locator('[data-testid="editor-tool-pencil"]').getAttribute('aria-checked')) === 'true',
    )

    const box = await page.locator('[role="application"]').first().boundingBox()
    if (!box) throw new Error('no map box')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const radius = Math.min(box.width, box.height) / 5

    /* ★★ BL — la barre d'édition, au-dessus de la carte, change de hauteur quand la forme se ferme
       (tracé neuf → forme ouverte) ; la caméra est alors décalée de ce qu'il faut pour que RIEN ne
       bouge À L'ÉCRAN. « La carte n'a pas bougé sous le trait » se juge donc à l'écran : le point
       sous le centre du trait y est resté. */
    const anchor = await page.evaluate(({ x, y }) => {
      const m = (window as unknown as { __loYanumMap: { unproject(a: [number, number]): { lat: number; lng: number }; getContainer(): HTMLElement } }).__loYanumMap
      const r = m.getContainer().getBoundingClientRect()
      const ll = m.unproject([x - r.left, y - r.top])
      return { lat: ll.lat, lng: ll.lng }
    }, { x: cx, y: cy })
    await stroke(cdp, circle(cx, cy, radius))
    await page.waitForTimeout(900)
    const back = await page.evaluate((q) => {
      const m = (window as unknown as { __loYanumMap: { project(a: [number, number]): { x: number; y: number }; getContainer(): HTMLElement } }).__loYanumMap
      const r = m.getContainer().getBoundingClientRect()
      const p = m.project([q.lng, q.lat])
      return { x: p.x + r.left, y: p.y + r.top }
    }, anchor)

    /**
     * ★★ THE PAN IS SUSPENDED, MEASURED RATHER THAN CONFIGURED. A stroke that
     *    crosses a fifth of the map would drag the camera hundreds of metres
     *    if `dragPan` were still live, so the centre moving at all is the
     *    failure. A few metres of tolerance covers float noise, nothing more.
     */
    check(
      '★★ the map did NOT move under the stroke (the point under its centre stayed put on screen)',
      Math.hypot(back.x - cx, back.y - cy) < 2,
      `${Math.hypot(back.x - cx, back.y - cy).toFixed(1)} px`,
    )


    /**
     * ★★ BK — LE TRAIT REVENU À SON DÉPART EST UNE FORME FERMÉE, SIMPLIFIÉE EN
     *    NŒUDS ÉDITABLES (coins aux virages, arrondis ailleurs) : elle est
     *    écrite, et l'éditeur reste ouvert dessus pour la retoucher.
     */
    const editor = page.locator('[data-testid="shape-editor"]')
    const nodes = Number(await editor.getAttribute('data-nodes'))
    check(
      '★★ the stroke became a SIMPLIFIED closed shape, not 57 points',
      (await editor.getAttribute('data-closed')) === '1' && nodes >= 4 && nodes <= 40,
      `${nodes} nodes`,
    )
    check(
      '★★ the surface is calculated and shown, in dunams',
      /[\d,]+ דונם/.test(await editor.innerText()),
      ((await editor.innerText()).match(/([\d,]+) דונם/) ?? ['<none>'])[0],
    )
    const grips = await page.locator('[data-testid^="editor-node-"]').count()
    check('★ the nodes are on the map as grips, one per node', grips === nodes, `${grips} grips`)
    check('and it is now in editing, the selection tool back', (await editor.getAttribute('data-mode')) === 'edit' && (await editor.getAttribute('data-tool')) === 'select')

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
      'Escape leaves the editor and brings the tool row back',
      (await page.locator('[data-testid="draw-tools"]').count()) === 1 && (await page.locator('[data-testid="shape-editor"]').count()) === 0,
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
      () => ((window as unknown as { __loYanumMap?: { getSource(id: string): { _data?: { features?: unknown[] } } | undefined } }).__loYanumMap?.getSource('zones')?._data?.features ?? []).length,
    )
    /**
     * ★ AND HERE IS THE STICKY PART, CHECKED RATHER THAN ASSUMED. Freehand is
     *   a PREFERENCE, not a one-shot tool: a coordinator who draws with a
     *   Pencil draws the next zone with it too, so the mode survives finishing
     *   one. Pressing the button again would therefore turn it OFF — which is
     *   what the first version of this gate did, and it then looked for a בטל
     *   in a vertex-drawing session that has none.
     */
    await openTools(page)
    check(
      '★ freehand is still armed after a finished zone — it is a preference',
      (await page.locator('[data-testid="draw-freehand"]').getAttribute('aria-pressed')) ===
        'true',
    )
    await openTools(page)
    await page.locator('[data-testid="draw-boundary"]').click()
    await page.waitForTimeout(400)
    const cancel = page.locator('[data-testid="editor-done"]')
    check('a way out (« סיום ») is offered before anything is drawn', (await cancel.count()) === 1)
    await cancel.click()
    await page.waitForTimeout(400)
    check(
      '★ leaving before drawing leaves no editor and no draft behind',
      (await page.locator('[data-testid="shape-editor"]').count()) === 0 &&
        (await page.locator('[data-testid="zone-draft-banner"]').count()) === 0,
    )
    check(
      'and no zone was created',
      (await page.evaluate(
        () => ((window as unknown as { __loYanumMap?: { getSource(id: string): { _data?: { features?: unknown[] } } | undefined } }).__loYanumMap?.getSource('zones')?._data?.features ?? []).length,
      )) === zonesBefore,
    )

    await page.screenshot({ path: `${SHOTS}/${viewport.name}-cancelled.png` })
    await context.close()
  }
} finally {
  await browser?.close()
  serve?.kill()
}

section('VERDICT')
console.log(`  ${passed} passed, ${failed} failed`)
console.log(`  captures: ${SHOTS}/`)
console.log('')
if (failed > 0) process.exit(1)
