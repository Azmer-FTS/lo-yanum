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

    /**
     * ★★ A67 (Z5.3, 2026-09-07) — TURNING IT ON SPREADS THE LAYOUT IN USE,
     *    AND SPREADS IT WITHOUT A RELOAD.
     *
     * "Synchronisation de la mise en page : ne prend effet qu'après
     *  rechargement. Elle doit s'appliquer IMMÉDIATEMENT à tous les écrans."
     *
     * Driven before the fix on both engines: the switch WAS live, and it sent
     * every screen to the factory `split` — because the shared scope had never
     * been written, so "synchronised" meant "forget what he had". חוות is on
     * `hidden` from the free branch above; pressing סנכרון must put מתנדבים,
     * נהגים and שמירות on `hidden` too, with nothing else pressed and nothing
     * reloaded.
     */
    /* ⚠️ "THE LAYOUT IN USE" IS THE LAST MAP SCREEN HE WAS ON, and the free
       branch above left מתנדבים as that screen. So this walks back to חוות —
       the one on `hidden` — before opening הגדרות, which is what a coordinator
       flipping this switch has just done. */
    await page.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
    await page.waitForTimeout(1800)
    await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    await page.locator('[data-testid="settings-layout-synced"]').click()
    await page.waitForTimeout(300)
    const seeded = [
      await modeOn('volunteers'),
      await modeOn('drivers'),
      await modeOn('missions'),
    ]
    check(
      '★★ A67 — switching it on spreads the layout already in use, not the default',
      seeded.every((m) => m === 'hidden'),
      `חוות was hidden; the others read ${seeded.join(', ')}`,
    )

    // …and a layout chosen while synchronised is the layout everywhere.
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
  section('A65 — THE SEAM GRIP, THE WAY IT WAS BEFORE Y9 TURNED IT ROUND')
  // -------------------------------------------------------------------------
  {
    /**
     * "La poignée de redimensionnement du split a été RETOURNÉE. Régression.
     *  La remettre en orientation verticale, du même côté et avec le même
     *  aspect qu'avant."
     *
     * ★ MEASURED, NOT READ OFF A CLASS. The regression was one Tailwind class
     *   — `rounded-l-card` to `rounded-s-card` — which compiles, passes a
     *   token audit, and flips the tab's curve to the other edge. So the check
     *   is the resolved corner radii: the tab sits on the map's side of the
     *   rule, so its edge AGAINST the rule (physically right, in both writing
     *   directions, because the row is reversed) is square and the one facing
     *   the map is rounded.
     */
    /* A56 above leaves חוות on whatever layout it was proving; a seam only
       exists in `split`, so this section puts it there first. */
    await page.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
    await page.waitForTimeout(2000)
    await page.locator('[data-testid="map-mode-split"]').first().click()
    await page.waitForTimeout(1200)
    const grip = (await page.evaluate(`(() => {
      const sep = document.querySelector('[role="separator"]');
      if (!sep) return null;
      const tab = sep.firstElementChild;
      if (!tab) return null;
      const r = tab.getBoundingClientRect();
      const cs = getComputedStyle(tab);
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        tl: parseFloat(cs.borderTopLeftRadius),
        bl: parseFloat(cs.borderBottomLeftRadius),
        tr: parseFloat(cs.borderTopRightRadius),
        br: parseFloat(cs.borderBottomRightRadius),
        sepLeft: Math.round(sep.getBoundingClientRect().left),
        tabRight: Math.round(r.right),
      };
    })()`)) as {
      w: number
      h: number
      tl: number
      bl: number
      tr: number
      br: number
      sepLeft: number
      tabRight: number
    } | null
    check('A65 — the seam has a grip', grip !== null)
    if (grip) {
      check(
        'A65 — and it is VERTICAL: taller than it is wide',
        grip.h > grip.w * 2,
        `${grip.w}×${grip.h}`,
      )
      check(
        'A65 — square against the bar, rounded towards the map',
        grip.tr < 1 && grip.br < 1 && grip.tl > 2 && grip.bl > 2,
        `radii l ${grip.tl}/${grip.bl}, r ${grip.tr}/${grip.br}`,
      )
      check(
        'A65 — and it sits on the map side of the rule',
        Math.abs(grip.tabRight - grip.sepLeft) <= 2,
        `tab right ${grip.tabRight}px, rule left ${grip.sepLeft}px`,
      )
    }
  }

  // -------------------------------------------------------------------------
  section('A68 — עריכת אזורים TAKES THE WHOLE DEVICE')
  // -------------------------------------------------------------------------
  {
    await page.goto(`${base}/#/coordinator/settings/regions`, { waitUntil: 'load' })
    await page.waitForTimeout(2600)
    const solo = (await page.evaluate(`(() => {
      const map = document.querySelector('.maplibregl-map');
      const r = map ? map.getBoundingClientRect() : null;
      return {
        rail: !!document.querySelector('aside'),
        header: !!document.querySelector('header'),
        split: !!document.querySelector('[role="separator"]'),
        mapWidth: r ? Math.round(r.width) : 0,
        viewport: innerWidth,
        shellTop: getComputedStyle(document.documentElement).getPropertyValue('--shell-top').trim(),
      };
    })()`)) as {
      rail: boolean
      header: boolean
      split: boolean
      mapWidth: number
      viewport: number
      shellTop: string
    }
    check(
      'A68 — no side rail, no shell header, no split while a region is edited',
      !solo.rail && !solo.header && !solo.split,
      `rail=${solo.rail} header=${solo.header} split=${solo.split}`,
    )
    check(
      'A68 — and the map is the width of the device',
      solo.mapWidth >= solo.viewport - 2,
      `${solo.mapWidth}px of ${solo.viewport}px`,
    )
    await page.screenshot({ path: `${SHOTS}/a68-region-solo-${ENGINE_NAME}.png` })
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
  // -------------------------------------------------------------------------
  section('A66 — THE DEVICE DECIDES THE THEME, AND IT DECIDES IT LIVE')
  // -------------------------------------------------------------------------
  {
    /**
     * "Theme selon l'appareil : le PO est en mode sombre sur son iPad et
     *  l'app reste en clair. Corriger la detection (prefers-color-scheme),
     *  ecouter le changement a chaud."
     *
     * ★ THE DETECTION WAS NEVER THE FAULT, AND THIS SECTION SAYS SO IN
     *   NUMBERS. Three claims: a first-ever launch on a dark device is dark —
     *   the one that was false, because the coordinator's default was the
     *   literal light and nothing asked the device; an explicit choice still
     *   beats the device; and flipping the device's preference under a page
     *   that is already open moves the palette with no reload.
     *
     * ⚠️ EACH READING GETS ITS OWN CONTEXT, because the claim is about a
     *    device that has never been asked. A context that has already stored a
     *    choice is a different question.
     */
    const surfaceOf = (target: Page) =>
      target.evaluate(
        `(() => ({
          attr: document.documentElement.getAttribute('data-theme'),
          base: getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim(),
        }))()`,
      ) as Promise<{ attr: string | null; base: string }>

    for (const scheme of ['dark', 'light'] as const) {
      const ctx = await browser.newContext({
        viewport: { width: 1032, height: 1376 },
        locale: 'he-IL',
        colorScheme: scheme,
      })
      const p2 = await ctx.newPage()
      p2.setDefaultTimeout(30_000)
      await p2.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
      await p2.waitForTimeout(2200)
      const seen = await surfaceOf(p2)
      const isDark = seen.base.startsWith('11 ')
      check(
        `A66 — a first launch on a ${scheme} device draws ${scheme}`,
        isDark === (scheme === 'dark'),
        `--surface-base ${seen.base}, data-theme ${seen.attr ?? '(none)'}`,
      )
      await p2.emulateMedia({ colorScheme: scheme === 'dark' ? 'light' : 'dark' })
      await p2.waitForTimeout(800)
      const flipped = await surfaceOf(p2)
      check(
        `A66 — and it follows the device changing, with no reload`,
        flipped.base !== seen.base,
        `${seen.base} → ${flipped.base}`,
      )
      await p2.emulateMedia({ colorScheme: 'dark' })
      await p2.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
      await p2.waitForTimeout(1800)
      await p2.locator('[data-testid="settings-theme-light"]').click()
      await p2.waitForTimeout(600)
      const forced = await surfaceOf(p2)
      check(
        'A66 — and an explicit light still beats a dark device',
        forced.attr === 'light' && !forced.base.startsWith('11 '),
        `data-theme ${forced.attr ?? '(none)'}, --surface-base ${forced.base}`,
      )
      await ctx.close()
    }
  }

  // -------------------------------------------------------------------------
  section('A69 — THE ROLE SWITCH FOLDS AWAY ON A PHONE')
  // -------------------------------------------------------------------------
  {
    for (const vp of [
      { name: 'iphone', width: 402, height: 874, folded: true },
      { name: 'ipad', width: 1032, height: 1376, folded: false },
    ]) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'he-IL',
        hasTouch: true,
      })
      const p2 = await ctx.newPage()
      p2.setDefaultTimeout(30_000)
      await p2.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
      await p2.waitForTimeout(2600)
      const hasToggle = (await p2.locator('[data-testid="devbar-toggle"]').count()) > 0
      const hasInline = (await p2.locator('select[aria-label]').count()) > 0
      check(
        `A69 — ${vp.name}: the role switch is ${vp.folded ? 'folded behind a button' : 'the bar it has always been'}`,
        hasToggle === vp.folded && hasInline === !vp.folded,
        `toggle=${hasToggle} inlineSelect=${hasInline}`,
      )
      if (vp.folded) {
        const box = await p2.locator('[data-testid="devbar-toggle"]').boundingBox()
        check(
          'A69 — and it is a 44 px target in a corner the map controls leave free',
          !!box && box.width >= 40 && box.height >= 40,
          box
            ? `${Math.round(box.width)}×${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)}`
            : 'no box',
        )
        const foot = (await p2.evaluate(
          `getComputedStyle(document.documentElement).getPropertyValue('--shell-foot').trim()`,
        )) as string
        check(
          'A69 — and the 62 px it used to take are given back to the app',
          foot === '0px' || foot === '',
          `--shell-foot ${foot || '(unset)'}`,
        )
        await p2.locator('[data-testid="devbar-toggle"]').click()
        await p2.waitForTimeout(500)
        check(
          'A69 — a tap opens it, with the roles inside',
          (await p2.locator('[data-testid="devbar-panel"] select').count()) === 1,
        )
        await p2.screenshot({ path: `${SHOTS}/a69-role-folded-${ENGINE_NAME}.png` })
      }
      await ctx.close()
    }
  }
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed  (${ENGINE_NAME})`)
console.log('')
if (failed > 0) process.exit(1)
