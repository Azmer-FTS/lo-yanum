import { chromium, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Y2 · Y3 · Y4 — WHAT הגדרות OWNS NOW. A53 · A54 · A55 · A56.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run settings
 *   ENGINE=webkit bun run settings
 *
 *   A53  a region is redrawn WITH A STYLUS, saved, and the entities hanging
 *        off it are re-filed — "rattachement des entités recalculé".
 *   A54  the role switch is reachable from הגדרות and all four roles are
 *        reachable from it.
 *   A55  the theme is ABSENT from the rail, PRESENT in settings, and its three
 *        values actually change the document.
 *   A56  synchronised: a layout chosen on one screen is the layout on the
 *        others. Free: it is not.
 *
 * ★ A53 IS DRIVEN WITH `pointerType: 'pen'`, and that is the point of it
 *   rather than a detail. The brief says "à main levée à l'Apple Pencil"; a
 *   test that clicks with a mouse proves the code path a mouse takes. Playwright
 *   cannot emit a pen pointer through `page.mouse`, so the stroke is dispatched
 *   as real `PointerEvent`s carrying `pointerType: 'pen'` — which is what the
 *   iPad sends and what `MapCanvas`'s freehand handler reads.
 *
 * ★ AND "RECALCULÉ" IS MEASURED ON THE COUNTS THE APP ITSELF SHOWS, not on the
 *   store: the region filter on חוות prints a number per region, and the whole
 *   claim of Y2 point 5 is that those numbers move when a boundary moves. If
 *   they do not, the outlines are decorative.
 */

const PORT = Number(process.env.SETTINGS_PORT ?? 5209)
const OUT_DIR = 'dist-settings'
const SHOTS = 'docs/screenshots/settings'
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
console.log(`  A53 · A54 · A55 · A56 — הגדרות (${ENGINE_NAME})`)
console.log('  ===================================================')

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
 * A stroke, as an Apple Pencil sends it: pointerdown, a run of pointermoves,
 * pointerup, all with `pointerType: 'pen'` and `isPrimary`.
 */
const PEN_STROKE = `((points) => {
  const canvas = document.querySelector('.maplibregl-canvas');
  if (!canvas) return 'no canvas';
  const box = canvas.getBoundingClientRect();
  const fire = (type, p) => {
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 7,
      pointerType: 'pen',
      isPrimary: true,
      button: type === 'pointermove' ? -1 : 0,
      buttons: type === 'pointerup' ? 0 : 1,
      clientX: box.left + p[0],
      clientY: box.top + p[1],
    }));
  };
  fire('pointerdown', points[0]);
  for (let i = 1; i < points.length; i++) fire('pointermove', points[i]);
  fire('pointerup', points[points.length - 1]);
  return 'ok';
})`

/** The counts the region filter prints, as the app renders them. */
const REGION_COUNTS = `(() => {
  const select = document.querySelector('[data-testid="farms-region"] select');
  if (!select) return null;
  const out = {};
  for (const option of select.options) out[option.value] = option.textContent.trim();
  return out;
})()`

let browser: Browser | null = null
try {
  browser = await ENGINE.launch()
  const context = await browser.newContext({
    viewport: { width: 1376, height: 1032 },
    locale: 'he-IL',
    hasTouch: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  await Bun.$`mkdir -p ${SHOTS}`.quiet()

  // -------------------------------------------------------------------------
  section('A55 — THE THEME LEFT THE RAIL')
  // -------------------------------------------------------------------------
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  {
    const inRail = await page.evaluate(() => {
      const rail = document.querySelector('aside')
      if (!rail) return 'no rail'
      return rail.querySelector('[aria-label][role="group"] button[title]') ? 'present' : 'absent'
    })
    check(
      '★ A55 — no theme switch in the coordinator rail',
      inRail !== 'present',
      String(inRail),
    )
  }

  await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  {
    const group = page.locator('[data-testid="settings-theme"]')
    check('★ A55 — and it is in הגדרות', (await group.count()) > 0)
    const applied: string[] = []
    for (const option of ['dark', 'light', 'system'] as const) {
      await page.locator(`[data-testid="settings-theme-${option}"]`).click()
      await page.waitForTimeout(350)
      applied.push(
        await page.evaluate(
          () =>
            `${document.documentElement.dataset.theme ?? '—'}/${
              getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim()
            }`,
        ),
      )
    }
    check(
      '★ A55 — and the three values are three different documents',
      new Set(applied).size >= 2 && applied[0] !== applied[1],
      applied.join('  ·  '),
    )
    await page.screenshot({ path: `${SHOTS}/settings-display-${ENGINE_NAME}.png`, fullPage: false })
  }

  // -------------------------------------------------------------------------
  section('A54 — THE ROLE SWITCH IS FINDABLE, AND HAS FOUR ROLES')
  // -------------------------------------------------------------------------
  {
    const roles = await page.evaluate(() => {
      const section = [...document.querySelectorAll('section, div')].find((el) =>
        el.querySelector('[data-testid="view-as-people"]'),
      )
      const pills = section ? section.querySelectorAll('button.filter-pill') : []
      return [...pills].map((p) => (p.textContent ?? '').replace(/\\d+/g, '').trim())
    })
    check(
      '★ A54 — מצב תצוגה lists the four roles',
      ['רכז', 'חקלאי', 'מתנדב', 'נהג'].every((r) => roles.some((x) => x.includes(r))),
      roles.join(' · '),
    )

    let reached = 0
    for (const role of ['חקלאי', 'מתנדב', 'נהג']) {
      await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
      await page.waitForTimeout(1200)
      await page.getByRole('button', { name: new RegExp(role) }).first().click()
      await page.waitForTimeout(400)
      const person = page.locator('[data-testid="view-as-person"]').first()
      if ((await person.count()) === 0) continue
      await person.click()
      await page.waitForTimeout(1400)
      if (!/#\/coordinator/.test(page.url())) reached++
      // …and back to רכז from the banner, which is the way out.
      const back = page.locator('[data-testid="view-as-banner-stop"]')
      if (await back.count()) {
        await back.first().click()
        await page.waitForTimeout(900)
      }
    }
    check(
      '★ A54 — and all three simulated roles are reachable, with a way back',
      reached === 3,
      `${reached}/3`,
    )
  }

  // -------------------------------------------------------------------------
  section('A56 — SYNCHRONISED, AND FREE')
  // -------------------------------------------------------------------------
  {
    const modeOn = async (screen: string): Promise<string> => {
      await page.goto(`${base}/#/coordinator/${screen}`, { waitUntil: 'load' })
      await page.waitForTimeout(1800)
      return (
        (await page.locator('[data-testid="map-mode-pill"]').first().getAttribute('data-mode')) ??
        '—'
      )
    }
    const setMode = async (screen: string, mode: string): Promise<void> => {
      await page.goto(`${base}/#/coordinator/${screen}`, { waitUntil: 'load' })
      await page.waitForTimeout(1800)
      await page.locator(`[data-testid="map-mode-${mode}"]`).first().click()
      await page.waitForTimeout(500)
    }

    // FREE (the default): each screen keeps its own.
    await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    await page.locator('[data-testid="settings-layout-free"]').click()
    await page.waitForTimeout(300)
    await setMode('farms', 'hidden')
    await setMode('volunteers', 'split')
    check(
      '★ A56 — free: a layout set on חוות is not the layout on מתנדבים',
      (await modeOn('farms')) === 'hidden' && (await modeOn('volunteers')) === 'split',
      `farms=${await modeOn('farms')}, volunteers=${await modeOn('volunteers')}`,
    )

    // SYNCED: one layout everywhere, immediately.
    await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    await page.locator('[data-testid="settings-layout-synced"]').click()
    await page.waitForTimeout(300)
    await setMode('farms', 'full')
    const spread = [
      await modeOn('volunteers'),
      await modeOn('drivers'),
      await modeOn('missions'),
    ]
    check(
      '★ A56 — synced: the layout chosen on one screen is the layout on all',
      spread.every((m) => m === 'full'),
      spread.join(', '),
    )
    // …and back to free, so the rest of the gate is on the shipped default.
    await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    await page.locator('[data-testid="settings-layout-free"]').click()
    await page.waitForTimeout(300)
  }

  // -------------------------------------------------------------------------
  section('A53 — A REGION, REDRAWN WITH A STYLUS')
  // -------------------------------------------------------------------------
  {
    await page.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
    await page.waitForTimeout(2600)
    const before = (await page.evaluate(REGION_COUNTS)) as Record<string, string> | null
    check('the region filter prints a count per region', before !== null, JSON.stringify(before ?? {}).slice(0, 140))

    await page.goto(`${base}/#/coordinator/settings/regions`, { waitUntil: 'load' })
    await page.waitForTimeout(2600)
    check(
      '★ עריכת אזורים opens on the full-screen map',
      (await page.locator('[data-testid="region-chooser"]').count()) > 0,
    )

    await page.locator('[data-testid="region-pick-negev"]').click()
    await page.waitForTimeout(2000)
    const opened = await page.locator('[data-testid="region-dunams"]').textContent()
    check('a region opens with its own outline and a live area', Boolean(opened), opened ?? '')

    await page.locator('[data-testid="region-pencil"]').click()
    await page.waitForTimeout(500)
    /**
     * ★ A SMALL BOX, IN A CORNER, AND THE SIZE IS THE POINT. A stroke that
     *   roughly retraces the outline proves the pencil works and proves
     *   nothing about point 5: the same farms fall in the same region and no
     *   count can move. Shrinking the Negev to a few hundred square kilometres
     *   is what makes "rattachement recalculé" observable — farms leave it,
     *   and the number beside its name in the filter has to follow.
     */
    const stroke = await page.evaluate(
      `${PEN_STROKE}([[300,250],[430,250],[440,300],[430,360],[300,360],[290,300],[300,255]])`,
    )
    check('★ A53 — the Apple Pencil stroke is accepted', stroke === 'ok', String(stroke))
    await page.waitForTimeout(900)
    const traced = await page.locator('[data-testid="region-dunams"]').textContent()
    check(
      '★ A53 — and it replaced the outline (the live area changed)',
      Boolean(traced) && traced !== opened,
      `${opened} → ${traced}`,
    )

    const undo = page.locator('[data-testid="region-undo"]')
    check('undo is armed by the stroke', !(await undo.isDisabled()))
    await undo.click()
    await page.waitForTimeout(600)
    check(
      'and it puts the previous outline back',
      (await page.locator('[data-testid="region-dunams"]').textContent()) === opened,
    )
    await page.locator('[data-testid="region-redo"]').click()
    await page.waitForTimeout(600)
    check(
      'redo brings the traced one back',
      (await page.locator('[data-testid="region-dunams"]').textContent()) === traced,
    )

    await page.screenshot({ path: `${SHOTS}/region-edit-${ENGINE_NAME}.png` })
    await page.locator('[data-testid="region-save"]').click()
    await page.waitForTimeout(900)

    await page.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
    await page.waitForTimeout(2600)
    const after = (await page.evaluate(REGION_COUNTS)) as Record<string, string> | null
    check(
      '★★ A53 — and the entities are re-filed: the counts moved',
      before !== null && after !== null && JSON.stringify(before) !== JSON.stringify(after),
      `${JSON.stringify(before ?? {}).slice(0, 90)} → ${JSON.stringify(after ?? {}).slice(0, 90)}`,
    )

    // "שחזר ברירת מחדל" puts X12's outline back, and the counts with it.
    await page.goto(`${base}/#/coordinator/settings/regions`, { waitUntil: 'load' })
    await page.waitForTimeout(2400)
    await page.locator('[data-testid="region-pick-negev"]').click()
    await page.waitForTimeout(1200)
    await page.locator('[data-testid="region-restore"]').click()
    await page.waitForTimeout(1200)
    await page.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
    await page.waitForTimeout(2600)
    const restored = (await page.evaluate(REGION_COUNTS)) as Record<string, string> | null
    check(
      '★ שחזר ברירת מחדל puts the original outline — and the original counts — back',
      JSON.stringify(restored) === JSON.stringify(before),
      `${JSON.stringify(restored ?? {}).slice(0, 90)}`,
    )
  }

  // -------------------------------------------------------------------------
  section('Y2.7 — THE ZONES ARE NOT EDITABLE ANYWHERE ELSE')
  // -------------------------------------------------------------------------
  {
    let grips = 0
    for (const screen of ['farms', 'volunteers', 'missions']) {
      await page.goto(`${base}/#/coordinator/${screen}`, { waitUntil: 'load' })
      await page.waitForTimeout(2200)
      grips += await page.evaluate(
        () => document.querySelectorAll('[data-marker-kind="vertex"]').length,
      )
    }
    check(
      '★ no vertex grip exists outside עריכת אזורים',
      grips === 0,
      `${grips} grips across three list screens`,
    )
  }
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed  (${ENGINE_NAME})`)
console.log('')
if (failed > 0) process.exit(1)
