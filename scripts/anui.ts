import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AN — LOGIQUE D'INTERFACE, CONTRADICTIONS, RÉGRESSIONS. Dans un navigateur.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run anui                                          # build local (démo)
 *   DIST=dist-an-before SKIP_BUILD=1 bun run anui         # le ROUGE (build de 1dacc2c)
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run anui   # le DÉPLOYÉ
 *
 * ⚠️ CE QUE CETTE PORTE NE PROUVE PAS, ET QUI EST PROUVÉ AILLEURS.
 *    Le clavier qu'un iPad OUVRE ne se lit dans aucun navigateur de test : il
 *    a été vu sur le simulateur iPad (ETAT.md, AN1.2). Cette porte mesure ce
 *    qui en découle et qu'un navigateur peut constater : sur un agent iPad,
 *    le champ numérique touché passe en `inputmode=none` et le pavé de l'app
 *    s'ouvre, les chiffres entrent, la mise en forme suit ; sur un iPhone,
 *    rien de tout cela.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const PORT = Number(process.env.ANUI_PORT ?? 5351)
const OUT = process.env.DIST ?? 'dist-anpass'
const SHOTS = process.env.SHOTS ?? 'docs/screenshots/anpass/local'
const IPAD = { width: 1032, height: 1376 }
const PHONE = { width: 402, height: 874 }
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
mkdirSync(SHOTS, { recursive: true })
const NEGEV_LAT = 31.27
const NEGEV_LNG = 34.79

const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
const wants = (id: string) => only.length === 0 || only.includes(id)

let passed = 0
let failed = 0
export function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

const serves: Array<ReturnType<typeof Bun.spawn>> = []
async function serveBuild(out: string, port: number): Promise<string> {
  const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
  if (process.env.SKIP_BUILD !== '1') {
    const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', out], { env, stdout: 'ignore', stderr: 'pipe' })
    if ((await build.exited) !== 0) {
      console.error(await new Response(build.stderr).text())
      throw new Error(`vite build failed (${out})`)
    }
  }
  serves.push(
    Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', out, '--port', String(port), '--strictPort'], {
      env,
      stdout: 'ignore',
      stderr: 'ignore',
    }),
  )
  const base = `http://localhost:${port}`
  const deadline = Date.now() + 40_000
  for (;;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* pas encore */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
  return base
}

const demo = REMOTE ? `${REMOTE}/demo` : await serveBuild(OUT, PORT)
console.log(`  démo : ${demo}`)

async function open(page: Page, hash: string, settle = 2600): Promise<void> {
  await page.goto(`${demo}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  await page.goto(`${demo}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

async function context(
  browser: Browser,
  opts: { viewport?: { width: number; height: number }; ua?: string; dark?: boolean; storage?: Record<string, string> } = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? IPAD,
    hasTouch: true,
    locale: 'he-IL',
    userAgent: opts.ua,
    colorScheme: opts.dark ? 'dark' : 'light',
    permissions: ['geolocation'],
    geolocation: { latitude: 31.0611, longitude: 34.6552 },
  })
  if (opts.storage) {
    await ctx.addInitScript((entries: Record<string, string>) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v)
    }, opts.storage)
  }
  ctx.setDefaultTimeout(8000)
  return ctx
}

async function guard(run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    check('section interrompue', false, (e as Error).message.split('\n')[0])
  }
}

const chrome = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const safari = await webkit.launch()

try {
  if (wants('A222')) {
    // =======================================================================
    section('A222 — thème « לפי המכשיר » : l\'appareil bascule, l\'app suit sans rechargement')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(safari)
      const page = await ctx.newPage()
      await open(page, '#/coordinator/farms')
      const bg = () =>
        page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim())
      const light = await bg()
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.waitForTimeout(600)
      const dark = await bg()
      await page.emulateMedia({ colorScheme: 'light' })
      await page.waitForTimeout(600)
      const back = await bg()
      check('clair → sombre sans rechargement', light === '243 244 246' && dark === '11 17 25', `${light} → ${dark}`)
      check('sombre → clair sans rechargement', back === '243 244 246', back)
      const src = await page.evaluate(() => document.documentElement.getAttribute('data-theme-choice'))
      check('le choix du coordinateur est « system » par défaut', src === 'system', String(src))
      await ctx.close()
    })
  }

  if (wants('A223')) {
    // =======================================================================
    section('A223 — iPad : le champ numérique ouvre le pavé de l\'app, pas le clavier complet')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(safari, { ua: IPAD_UA })
      const page = await ctx.newPage()
      await open(page, '#/coordinator/farms/farm-07/edit')
      /* ★ AN10 — l'agriculteur est en résumé : « עריכה » ouvre ses champs. */
      await page.locator('[data-testid="person-farmer-edit"]').click()
      const tz = page.locator('[data-testid="farm-farmer-id"]')
      await tz.scrollIntoViewIfNeeded()
      await tz.tap()
      await page.waitForTimeout(500)
      const mode = await tz.getAttribute('inputmode')
      check('ת״ז touché → inputmode=none (le système n\'ouvre pas son clavier)', mode === 'none', String(mode))
      const pad = page.locator('[data-testid="numpad"]')
      check('le pavé de l\'app est ouvert', await pad.isVisible())
      await tz.fill('')
      await tz.tap()
      for (const k of ['0', '2', '1', '9', '8', '5', '1', '8', '9']) {
        await page.locator(`[data-numpad-key="${k}"]`).click()
      }
      await page.waitForTimeout(200)
      check('les chiffres entrent, zéro de tête compris', (await tz.inputValue()) === '021985189', await tz.inputValue())
      await page.screenshot({ path: `${SHOTS}/a223-ipad-tz-pave.png` })

      const phone = page.locator('[data-testid="farm-form-farmerPhone"]')
      await phone.tap()
      await page.waitForTimeout(300)
      for (let i = 0; i < 12; i++) await page.locator('[data-numpad-key="back"]').click()
      for (const k of '0501234567') await page.locator(`[data-numpad-key="${k}"]`).click()
      await page.waitForTimeout(200)
      check('portable : la mise en forme suit le pavé', (await phone.inputValue()) === '(050) 123-4567', await phone.inputValue())

      await page.locator('[data-numpad-key="done"]').click()
      await page.waitForTimeout(300)
      check('« סיום » ferme le pavé', !(await pad.isVisible()))

      // Tous les champs numériques de l'écran passent par le pavé.
      const numeric = page.locator('input[inputmode="numeric"], input[inputmode="decimal"], input[inputmode="tel"], input[type="tel"], input[inputmode="none"]')
      const n = await numeric.count()
      let viaPad = 0
      for (let i = 0; i < n; i++) {
        const el = numeric.nth(i)
        if (!(await el.isVisible()) || (await el.getAttribute('readonly')) !== null) {
          viaPad++
          continue
        }
        await el.scrollIntoViewIfNeeded()
        await el.tap()
        await page.waitForTimeout(150)
        if ((await el.getAttribute('inputmode')) === 'none' && (await pad.isVisible())) viaPad++
      }
      check(`les ${n} champs numériques de l'édition de ferme ouvrent le pavé`, n > 0 && viaPad === n, `${viaPad}/${n}`)
      await ctx.close()

      const phoneCtx = await context(safari, { ua: IPHONE_UA, viewport: PHONE })
      const p2 = await phoneCtx.newPage()
      await open(p2, '#/coordinator/farms/farm-07/edit')
      await p2.locator('[data-testid="person-farmer-edit"]').click()
      const tz2 = p2.locator('[data-testid="farm-farmer-id"]')
      await tz2.scrollIntoViewIfNeeded()
      await tz2.tap()
      await p2.waitForTimeout(400)
      check('iPhone : le pavé du système suffit — inputmode=numeric, pas de pavé de l\'app',
        (await tz2.getAttribute('inputmode')) === 'numeric' && (await p2.locator('[data-testid="numpad"]').count()) === 0)
      await phoneCtx.close()
    })
  }

  if (wants('A224')) {
    // =======================================================================
    section('A224 — un téléphone saisi n\'est jamais remplacé ; aucun numéro générique')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(chrome, { storage: { 'lo-yanum:block:settings-profile': '1' } })
      const page = await ctx.newPage()
      await open(page, '#/coordinator/settings')
      const field = page.locator('[data-testid="coordinator-phone"]')
      await field.scrollIntoViewIfNeeded()
      const initial = await field.inputValue()
      /* ⚠️ Sur les CHIFFRES : la première version cherchait « 0000049 » dans la
         valeur AFFICHÉE, « (052) 000-0049 », et passait au vert sur le build
         d'avant. Vue rouge-qui-ment sur dist-an-before, corrigée. */
      check('aucun numéro par défaut dans la carte du coordinateur', initial.replace(/\D/g, '') === '', JSON.stringify(initial))
      await field.fill('0529876543')
      await page.waitForTimeout(200)
      // Il QUITTE l'écran sans toucher « שמירה ».
      await open(page, '#/coordinator/farms', 1200)
      await open(page, '#/coordinator/settings')
      const kept = await page.locator('[data-testid="coordinator-phone"]').inputValue()
      check('tapé, écran quitté sans « שמירה », rouvert : le numéro est là', kept === '(052) 987-6543', kept)
      await page.locator('[data-testid="coordinator-phone"]').fill('')
      await open(page, '#/coordinator/farms', 1200)
      await open(page, '#/coordinator/settings')
      const cleared = await page.locator('[data-testid="coordinator-phone"]').inputValue()
      check('vidé : il reste vide, aucun numéro ne revient', cleared === '', JSON.stringify(cleared))
      await ctx.close()
    })
    if (!REMOTE) {
      const dir = `${OUT}/assets`
      const hits = readdirSync(dir)
        .filter((f) => f.endsWith('.js'))
        .filter((f) => /052-0000049|08-0000050/.test(readFileSync(`${dir}/${f}`, 'utf8')))
      check('le bundle ne contient plus 052-0000049 ni 08-0000050', hits.length === 0, hits.join(', '))
    }
  }

  /* Les tracés de la source `route` de la carte, par style. */
  const routeStyles = (page: Page) =>
    page.evaluate(() => {
      const m = (window as unknown as { __loYanumMap?: { getSource: (id: string) => { serialize: () => { data: { features?: Array<{ properties: { style?: string }; geometry: { coordinates: number[][] } }> } } } | undefined } }).__loYanumMap
      const out: Record<string, number> = {}
      const coords: number[][] = []
      try {
        for (const f of m?.getSource('route')?.serialize().data.features ?? []) {
          const k = f.properties.style ?? 'legacy'
          out[k] = (out[k] ?? 0) + 1
          coords.push(...f.geometry.coordinates)
        }
      } catch {
        /* pas de carte */
      }
      return { out, coords }
    })
  /* Les DEUX points de repli : Jérusalem (`HOME_BASE`, celui des fiches
     importées, donc de משק שלם en production) et le centre du Néguev
     (`NEGEV_CENTER`, celui d'une fiche créée sans épingle). ⚠️ La première
     version ne cherchait que Jérusalem et passait sur le build d'avant. */
  const nearFallback = (c: number[]) =>
    [[31.7683, 35.2137], [NEGEV_LAT, NEGEV_LNG]].some(([lat, lng]) => Math.abs(c[1] - lat) < 0.01 && Math.abs(c[0] - lng) < 0.01)
  const markerLabels = (page: Page) =>
    page.locator('.maplibregl-marker').evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).style.visibility !== 'hidden').map((e) => e.getAttribute('aria-label') ?? ''),
    )
  const MISSING = 'משק שלם (בדיקה)'
  async function createMissing(page: Page): Promise<void> {
    await open(page, '#/coordinator/farms/new')
    await page.locator('[data-testid="farm-form-name"]').fill(MISSING)
    await page.locator('[data-testid="form-actions"] .btn-primary').click()
    await page.waitForTimeout(1500)
  }

  if (wants('A225')) {
    // =======================================================================
    section('A225 — une fiche sans position n\'apparaît sur AUCUNE carte (jamais à Jérusalem)')
    // =======================================================================
    await guard(async () => {
      /* Le DÉPART par défaut du planificateur est Jérusalem (réglage « נקודת
         מוצא ») : pour voir si une ferme y est posée, on part de Kiryat Gat
         (ni Jérusalem, ni le centre du Néguev, autre point de repli). */
      const ctx = await context(chrome, {
        storage: { 'lo-yanum:origin': JSON.stringify({ label: 'קריית גת', position: { lat: 31.61, lng: 34.7642 } }) },
      })
      const page = await ctx.newPage()
      await createMissing(page)
      for (const [label, hash] of [
        ['tableau de bord', '#/coordinator'],
        ['liste des fermes', '#/coordinator/farms'],
        ['agenda', '#/coordinator/agenda'],
      ] as const) {
        await open(page, hash, 4000)
        const labels = await markerLabels(page)
        check(`${label} : aucun repère « ${MISSING} »`, !labels.some((l) => l.includes(MISSING)), `${labels.length} repères`)
      }
      await open(page, '#/coordinator/route', 4000)
      const card = page.locator('[data-testid="route-pick"]', { hasText: MISSING })
      check('planificateur : la ferme sans position est sélectionnable', (await card.count()) === 1)
      check('… et signalée « מיקום חסר » sur sa carte', (await card.locator('[data-testid="route-pick-missing"]').count()) === 1)
      if ((await card.getAttribute('aria-pressed')) !== 'true') await card.click()
      /* ⚠️ La première version cochait « nth(0) » — la carte qu'elle venait de
         cocher, donc la décochait : le rouge était celui de la porte. */
      const others = page.locator('[data-testid="route-pick"][aria-pressed="false"]')
      for (let k = 0; k < 2; k++) await others.first().click()
      await page.waitForTimeout(5000)
      check('… elle est listée à part, hors du tracé', (await page.locator('[data-testid="route-unplaced-farm"]', { hasText: MISSING }).count()) === 1)
      /* Vu sur capture du déployé : le nom réduit à une lettre dans la colonne. */
      const nameCut = await page.locator('[data-testid="route-unplaced-name"]').evaluateAll((els) =>
        els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().width < 60).length,
      )
      check('… son nom se lit en entier', nameCut === 0, `${nameCut} nom(s) coupé(s)`)
      const labels = await markerLabels(page)
      check('… aucun repère sur la carte du planificateur', !labels.some((l) => l.includes(MISSING)), labels.filter((l) => /^\d/.test(l)).join(' | '))
      const { coords } = await routeStyles(page)
      check('… le tracé ne passe par aucun point de repli (Jérusalem, centre du Néguev)', coords.length > 0 && !coords.some(nearFallback), `${coords.length} points`)
      await page.screenshot({ path: `${SHOTS}/a225-planificateur-sans-position.png` })
      await ctx.close()
    })
  }

  if (wants('A226')) {
    // =======================================================================
    section('A226 — repères superposés : un disque avec leur nombre, jamais des chiffres empilés')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(chrome)
      const page = await ctx.newPage()
      await open(page, '#/coordinator', 5000)
      const clusters = await page.locator('[data-marker-kind="cluster"]').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.count)))
      check('à l\'échelle nationale, les repères qui se recouvrent sont regroupés', clusters.length > 0 && clusters.every((n) => n >= 2), JSON.stringify(clusters))
      const overlaps = async () =>
        page.locator('.maplibregl-marker').evaluateAll((els) => {
          const kinds = ['farm', 'moshav', 'mission', 'pin', 'incident', 'anchor', 'car']
          const pts = els
            .filter((e) => (e as HTMLElement).style.visibility !== 'hidden' && kinds.includes((e as HTMLElement).dataset.markerKind ?? ''))
            .map((e) => {
              const r = e.getBoundingClientRect()
              return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: e.getAttribute('aria-label') ?? '' }
            })
          const bad: string[] = []
          for (let i = 0; i < pts.length; i++)
            for (let j = i + 1; j < pts.length; j++)
              if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 20) bad.push(`${pts[i].label} / ${pts[j].label}`)
          return bad
        })
      const bad = await overlaps()
      check('tableau de bord : aucun couple de dessins de repères à moins de 20 px (centre à centre)', bad.length === 0, bad.slice(0, 3).join(' ; '))
      await page.locator('[data-marker-kind="cluster"]').first().click()
      await page.waitForTimeout(1200)
      const after = await page.locator('[data-marker-kind="cluster"]').count()
      check('toucher un regroupement zoome (ou liste ses membres)', after < clusters.length || (await page.locator('[data-cluster-member]').count()) > 0, `${clusters.length} → ${after}`)
      await open(page, '#/coordinator/route', 4000)
      const free = page.locator('[data-testid="route-pick"][aria-pressed="false"]')
      for (let i = 0; i < 6; i++) await free.first().click()
      await page.waitForTimeout(3000)
      const bad2 = await overlaps()
      check('planificateur, six fermes : aucun numéro empilé', bad2.length === 0, bad2.slice(0, 3).join(' ; '))
      await page.screenshot({ path: `${SHOTS}/a226-planificateur-regroupes.png` })
      await ctx.close()
    })
  }

  if (wants('A227')) {
    // =======================================================================
    section('A227 — le tracé sur route partout où un trajet s\'affiche')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(chrome)
      const page = await ctx.newPage()
      await open(page, '#/coordinator/route', 4000)
      const unpicked = page.locator('[data-testid="route-pick"][aria-pressed="false"]')
      for (let i = 0; i < 3; i++) await unpicked.first().click()
      let styles = (await routeStyles(page)).out
      for (let t = 0; t < 60 && !styles.road; t++) {
        await page.waitForTimeout(500)
        styles = (await routeStyles(page)).out
      }
      check('planificateur : le trajet est tracé sur route', (styles.road ?? 0) > 0, JSON.stringify(styles))
      /* ⚠️ Vu passer À VIDE sur le build d'avant (`{}`) : l'absence de trait
         droit ne vaut que s'il y a un trajet. */
      check('planificateur : aucun trait à vol d\'oiseau d\'avant AN3', Object.keys(styles).length > 0 && !styles.legacy, JSON.stringify(styles))

      await open(page, '#/coordinator/route/free', 3000)
      const field = page.locator('[data-testid="position-link"]').first()
      for (const p of ['31.56414, 34.84146', '31.61226, 34.89577']) {
        await field.fill(p)
        await field.press('Enter')
      }
      for (let t = 0; t < 60; t++) {
        if (((await routeStyles(page)).out.road ?? 0) >= 3) break
        await page.waitForTimeout(500)
      }
      const before = (await routeStyles(page)).out.road ?? 0
      /* Une étape LOIN et jamais calculée (Mitzpe Ramon) : le calcul dure, et
         c'est pendant ce temps que l'ancien écran remplaçait tout le tracé par
         un trait droit. ⚠️ La première version ajoutait une étape voisine, déjà
         en cache, et passait sur le build d'avant. Échantillons sans pause. */
      await field.fill('30.6103, 34.8015')
      await field.press('Enter')
      let minRoad = Infinity
      let legacy = 0
      const until = Date.now() + 4000
      while (Date.now() < until) {
        const o = (await routeStyles(page)).out
        minRoad = Math.min(minRoad, o.road ?? 0)
        legacy += o.legacy ?? 0
      }
      check('itinéraire libre : une étape ajoutée n\'efface pas les routes déjà tracées', before >= 3 && minRoad >= 2, `avant ${before}, minimum pendant le calcul ${minRoad}`)
      check('itinéraire libre : jamais le trait droit global pendant le calcul', before >= 3 && legacy === 0, `${legacy} échantillons en trait droit`)
      await ctx.close()
    })
  }

  if (wants('A228')) {
    // =======================================================================
    section('A228 — aucune bordure parasite : quatre modes, trois largeurs')
    // =======================================================================
    for (const [w, h] of [[402, 874], [1032, 1376], [1376, 1032]] as const) {
      await guard(async () => {
        const ctx = await context(chrome, { viewport: { width: w, height: h } })
        const page = await ctx.newPage()
        const probe = () =>
          page.evaluate(() => {
            const c = document.querySelector('.maplibregl-canvas') as HTMLElement | null
            if (!c || c.getBoundingClientRect().width === 0) return null
            const r = c.getBoundingClientRect()
            const box = c.closest('[role="application"]') as HTMLElement
            const b = box.getBoundingClientRect()
            const cs = getComputedStyle(box)
            const mapBox = box.closest('[data-map-panel]')?.lastElementChild as HTMLElement | null
            return {
              offset: [Math.round(r.left - b.left), Math.round(r.top - b.top), Math.round(b.right - r.right), Math.round(b.bottom - r.bottom)],
              position: cs.position,
              vw: window.innerWidth,
              vh: window.innerHeight,
              /* ⚠️ Les marges de la TOILE : celles du cadre étaient égales sur le build d'avant aussi. */
              frame: [Math.round(r.left), Math.round(r.top), Math.round(window.innerWidth - r.right), Math.round(window.innerHeight - r.bottom)],
              mapBoxBorderRight: mapBox ? getComputedStyle(mapBox).borderRightWidth : '0px',
            }
          })
        await open(page, '#/coordinator/farms', 4000)
        for (const mode of ['split', 'full', 'hidden'] as const) {
          await page.locator(`[data-testid="map-mode-${mode}"]`).first().click()
          await page.waitForTimeout(1500)
          const pr = await probe()
          if (mode === 'hidden') {
            check(`${w} px · masquée : aucune carte dessinée`, pr === null)
            continue
          }
          check(`${w} px · ${mode} : la toile remplit son cadre (0 px d'écart sur les quatre côtés)`, !!pr && pr.offset.every((v) => Math.abs(v) <= 1) && pr.position === 'relative', JSON.stringify(pr))
          if (mode === 'full' && w >= 1024) {
            check(`${w} px · plein : pas de bordure de séparation sans liste à séparer`, pr?.mapBoxBorderRight === '0px', String(pr?.mapBoxBorderRight))
          }
        }
        await page.locator('[data-testid="map-mode-split"]').first().click()
        await open(page, '#/coordinator/farms/farm-07', 5000)
        await page.locator('[data-testid="map-tool-fullscreen"]:visible').first().click()
        await page.waitForTimeout(1800)
        const fs = await probe()
        check(`${w} px · plein écran de l'outil : la toile reste dans son cadre`, !!fs && fs.offset.every((v) => Math.abs(v) <= 1) && fs.position === 'relative', JSON.stringify(fs))
        check(`${w} px · plein écran de l'outil : marge égale à droite et à gauche, en haut et en bas`, !!fs && Math.abs(fs.frame[0] - fs.frame[2]) <= 1 && Math.abs(fs.frame[1] - fs.frame[3]) <= 1, JSON.stringify(fs?.frame))
        await page.screenshot({ path: `${SHOTS}/a228-${w}-outil-plein-ecran.png` })
        await ctx.close()
      })
    }
  }

  if (wants('A229')) {
    // =======================================================================
    section('A229 — signature : un geste, nom et date inscrits et modifiables, le texte lisible à l\'ouverture')
    // =======================================================================
    for (const [w, h] of [[402, 874], [1032, 1376], [1376, 1032]] as const) {
      for (const where of ['fiche', 'édition'] as const) {
        await guard(async () => {
          const ctx = await context(chrome, { viewport: { width: w, height: h } })
          const page = await ctx.newPage()
          await open(page, where === 'fiche' ? '#/coordinator/farms/farm-07' : '#/coordinator/farms/farm-07/edit', 3500)
          const buttons = await page.locator(where === 'fiche' ? '[data-testid="farm-open-assoc-form"]:visible, [data-testid="farm-sign"]:visible' : '[data-testid="farm-sign"]:visible').count()
          check(`${w} px · ${where} : UN bouton de signature, à l'écran sans rien ouvrir`, buttons === 1, String(buttons))
          await page.locator(where === 'fiche' ? '[data-testid="farm-open-assoc-form"]' : '[data-testid="farm-sign"]').first().click()
          await page.locator('[data-testid="assoc-form"]').waitFor()
          await page.waitForTimeout(800)
          const m = await page.evaluate(() => {
            const vh = window.innerHeight
            const r = (sel: string) => (document.querySelector(sel) as HTMLElement).getBoundingClientRect()
            const decl = document.querySelector('[data-testid="assoc-declaration"]') as HTMLElement
            const line = decl.querySelector('[data-testid="assoc-declaration-line"]') as HTMLElement
            return {
              vh,
              dialogH: Math.round(r('[data-testid="assoc-form"]').height),
              declInView: r('[data-testid="assoc-declaration"]').top >= 0 && r('[data-testid="assoc-declaration"]').bottom <= vh,
              declScrolls: decl.scrollHeight > decl.clientHeight + 2,
              bodyPx: parseFloat(getComputedStyle(line).fontSize),
              padInView: r('[data-testid="assoc-signature"] canvas').bottom <= vh,
              saveInView: r('[data-testid="assoc-save"]').bottom <= vh && r('[data-testid="assoc-save"]').top >= 0,
              name: (document.querySelector('[data-testid="assoc-field-farmerName"]') as HTMLInputElement).value,
              date: (document.querySelector('[data-testid="assoc-field-date"]') as HTMLInputElement).value,
              nameEditable: !(document.querySelector('[data-testid="assoc-field-farmerName"]') as HTMLInputElement).readOnly,
            }
          })
          check(`${w} px · ${where} : la fenêtre prend la hauteur disponible`, m.dialogH >= m.vh - 60, `${m.dialogH} / ${m.vh}`)
          check(`${w} px · ${where} : le texte du document est entier à l'écran, sans défilement`, m.declInView && !m.declScrolls, JSON.stringify({ inView: m.declInView, scrolls: m.declScrolls }))
          check(`${w} px · ${where} : lisible (corps ${m.bodyPx} px ≥ 16)`, m.bodyPx >= 16)
          check(`${w} px · ${where} : zone de signature et « שמירה » à l'écran`, m.padInView && m.saveInView)
          check(`${w} px · ${where} : l'agriculteur est inscrit, modifiable sur place`, m.name === 'עמית דרור' && m.nameEditable, m.name)
          const today = await page.evaluate(() => {
            const d = new Date()
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          })
          check(`${w} px · ${where} : la date du jour est inscrite`, m.date === today, `${m.date} / ${today}`)
          await page.screenshot({ path: `${SHOTS}/a229-${where === 'fiche' ? 'fiche' : 'edition'}-${w}-ouverture.png` })

          if (w === 1032 && where === 'fiche') {
            await page.locator('[data-testid="assoc-field-farmerName"]').fill('רות דרור')
            const idField = page.locator('[data-testid="assoc-field-farmerId"]')
            if ((await idField.inputValue()) === '') await idField.fill('021985189')
            const pad = page.locator('[data-testid="assoc-signature"] canvas')
            const bb = (await pad.boundingBox())!
            await page.mouse.move(bb.x + 40, bb.y + 40)
            await page.mouse.down()
            await page.mouse.move(bb.x + 160, bb.y + 80, { steps: 8 })
            await page.mouse.move(bb.x + 260, bb.y + 50, { steps: 8 })
            await page.mouse.up()
            await page.locator('[data-testid="assoc-save"]').click()
            await page.waitForTimeout(900)
            const state = (await page.locator('[data-testid="farm-paper-state"]').textContent()) ?? ''
            check('signé depuis la fiche : l\'accord porte le nom corrigé sur place', state.includes('רות דרור'), state)
          }
          if (where === 'édition') {
            await page.locator('[data-testid="modal-close"]').click()
            const inputs = await page.locator('[data-testid="farm-block-agreements"] input[type="date"]').count()
            check(`${w} px · édition : plus aucun champ « date de signature » dans le formulaire`, inputs === 0, String(inputs))
          }
          await ctx.close()
        })
      }
    }
  }

  if (wants('A230')) {
    // =======================================================================
    section('A230 — en-tête épinglé pendant l\'édition : photo, ferme, agriculteur')
    // =======================================================================
    for (const [w, h] of [[402, 874], [1032, 1376], [1376, 1032]] as const) {
      await guard(async () => {
        const ctx = await context(chrome, { viewport: { width: w, height: h } })
        const page = await ctx.newPage()
        await open(page, '#/coordinator/farms/farm-07/edit', 3500)
        // Descendre jusqu'au dernier bloc, par le contenu qui défile réellement.
        await page.locator('[data-testid="farm-block-notes"]').scrollIntoViewIfNeeded()
        await page.waitForTimeout(500)
        const m = await page.evaluate(() => {
          const bar = document.querySelector('[data-testid="farm-edit-sticky"]') as HTMLElement
          const r = bar.getBoundingClientRect()
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          const notes = (document.querySelector('[data-testid="farm-block-notes"]') as HTMLElement).getBoundingClientRect()
          const scrolled = notes.top < window.innerHeight
          return {
            top: Math.round(r.top),
            height: Math.round(r.height),
            onTop: !!top && bar.contains(top),
            scrolled,
            name: (document.querySelector('[data-testid="farm-edit-sticky-name"]') as HTMLElement).textContent,
            farmer: (document.querySelector('[data-testid="farm-edit-sticky-farmer"]') as HTMLElement).textContent,
            photo: !!bar.querySelector('img, [data-avatar], span'),
          }
        })
        check(`${w} px : au bas du formulaire, l'en-tête est à l'écran et rien ne le recouvre`, m.scrolled && m.onTop && m.top >= 0 && m.top < 140, JSON.stringify({ top: m.top, onTop: m.onTop }))
        check(`${w} px : compact (≤ 72 px)`, m.height <= 72, `${m.height} px`)
        check(`${w} px : photo, ferme et agriculteur`, m.photo && m.name === 'חוות שיזפון' && m.farmer === 'עמית דרור', `${m.name} / ${m.farmer}`)
        await page.screenshot({ path: `${SHOTS}/a230-${w}-bas-du-formulaire.png` })
        // L'en-tête suit la frappe : c'est ce qui est à l'écran, pas la fiche enregistrée.
        await page.locator('[data-testid="farm-form-name"]').fill('חוות שיזפון החדשה')
        await page.waitForTimeout(200)
        check(`${w} px : le nom de l'en-tête suit la frappe`, (await page.locator('[data-testid="farm-edit-sticky-name"]').textContent()) === 'חוות שיזפון החדשה')
        await ctx.close()
      })
    }
  }

  if (wants('A231') || wants('A232')) {
    // =======================================================================
    section('A231 · A232 — un seul champ par vérité ; מועצה et אזור déduits de l\'adresse')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(chrome, { viewport: { width: 1032, height: 1376 } })
      const page = await ctx.newPage()
      await open(page, '#/coordinator/farms/new', 3500)
      const labels = async () =>
        page.locator('[data-farm-form] span.label').evaluateAll((els) =>
          els.map((e) => (e.textContent ?? '').trim()).filter((x) => x !== ''),
        )
      const all = await labels()
      const count = (re: RegExp) => all.filter((l) => re.test(l)).length
      check('A231 · « סוג יישות » et « סוג הישות המשפטית » ne sont plus deux champs', count(/סוג יישות|סוג הישות המשפטית/) === 0 && count(/^סוג המקום/) === 1, all.filter((l) => /סוג/.test(l)).join(' | '))
      check('A231 · « אזור סטנדרטי » n\'existe plus à côté de « אזור »', count(/אזור סטנדרטי/) === 0 && count(/^אזור$/) === 1, all.filter((l) => /אזור/.test(l)).join(' | '))
      check('A231 · « מועצה אזורית » est une liste', (await page.locator('select[data-testid="farm-form-council"]').count()) === 1)
      const opts = await page.locator('select[data-testid="farm-form-council"] option').count()
      check('A231 · la liste des conseils est complète (54 du למ״ס + « לא נבחר » + « אחר »)', opts === 56, String(opts))
      check('A231 · « אחר » ouvre la saisie libre, et SEULEMENT lui', (await page.locator('[data-testid="farm-form-council-free"]').count()) === 0)
      await page.locator('select[data-testid="farm-form-council"]').selectOption('__other')
      check('A231 · … « אחר » choisi : le champ libre apparaît', (await page.locator('[data-testid="farm-form-council-free"]').count()) === 1)
      await page.locator('select[data-testid="farm-form-council"]').selectOption('')
      const regionOpts = await page.locator('select[data-testid="farm-form-region"] option').count()
      check('A231 · la liste des régions : 13 + « déduite » + « אחר »', regionOpts === 15, String(regionOpts))

      // A232 — depuis le יישוב : choisir נבטים dans la liste remplit la מועצה.
      await page.locator('[data-testid="farm-form-name"]').fill('חוות בדיקה')
      const loc = page.locator('[data-testid="farm-form-locality"]')
      /* ⚠️ Un nom tapé EN ENTIER ne montre pas de liste (il est « déjà
         choisi ») : c'est ce chemin, le plus court, qui ne remplissait rien. */
      await loc.click()
      await loc.pressSequentially('נבטים', { delay: 30 })
      await page.waitForTimeout(500)
      await page.waitForTimeout(400)
      const councilAfterPick = await page.locator('select[data-testid="farm-form-council"]').inputValue()
      check('A232 · יישוב choisi → sa מועצה אזורית est remplie', councilAfterPick === 'בני שמעון', councilAfterPick)
      const regionLabel = await page.locator('select[data-testid="farm-form-region"] option').first().textContent()
      check('A232 · … et la région que l\'adresse désigne est dite', /הנגב/.test(regionLabel ?? ''), String(regionLabel))
      await page.screenshot({ path: `${SHOTS}/a232-yishuv-moatsa.png` })

      // A232 — depuis l'épingle seule : une ferme hors localité près de נבטים.
      await open(page, '#/coordinator/farms/new', 3500)
      await page.locator('[data-testid="farm-form-name"]').fill('חוות בודדת')
      const link = page.locator('[data-testid="position-link"]').first()
      await link.fill('31.2150, 34.8700')
      await link.press('Enter')
      await page.waitForTimeout(800)
      const sug = page.locator('[data-testid="farm-council-suggestion"]')
      check('A232 · épingle seule → la מועצה est PROPOSÉE', (await sug.count()) === 1, (await sug.textContent().catch(() => '')) ?? '')
      check('A232 · … rien n\'est écrit sans le geste', (await page.locator('select[data-testid="farm-form-council"]').inputValue()) === '')
      await page.locator('[data-testid="farm-council-adopt"]').click()
      check('A232 · … un toucher l\'accepte', (await page.locator('select[data-testid="farm-form-council"]').inputValue()) !== '')
      await ctx.close()
    })
  }

  if (wants('A233')) {
    // =======================================================================
    section('A233 — dévoilement progressif : un champ dépendant après sa condition ; les dates se voient')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(chrome, { viewport: { width: 1032, height: 1376 } })
      const page = await ctx.newPage()
      await open(page, '#/coordinator/farms/new', 3500)
      check('A233 · « תוקף ההסכם » absent tant que le type d\'accord n\'est pas choisi', (await page.locator('[data-testid="farm-form-land-until"]').count()) === 0)
      const landSelect = page.locator('[data-testid="farm-block-details"] select').filter({ has: page.locator('option', { hasText: 'חוזה חכירה לדורות' }) })
      await landSelect.selectOption({ index: 1 })
      await page.waitForTimeout(300)
      check('A233 · … il apparaît une fois le type choisi', (await page.locator('[data-testid="farm-form-land-until"]').count()) === 1)
      const empty = page.locator('[data-testid="farm-form-land-until-empty"]')
      check('A233 · une date vide se lit « בחירת תאריך », avec le calendrier', (await empty.count()) === 1 && /בחירת תאריך/.test((await empty.textContent()) ?? '') && (await empty.locator('svg').count()) === 1)
      await page.locator('[data-testid="farm-form-land-until"]').fill('2027-03-01')
      await page.waitForTimeout(200)
      check('A233 · … et disparaît quand la date est posée', (await empty.count()) === 0)
      await page.locator('[data-testid="farm-form-land-until"]').scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${SHOTS}/a233-date-et-dependance.png` })

      await open(page, '#/coordinator/farms/farm-07/edit', 3500)
      const blocks = await page.locator('[data-farm-form] section[data-block-title]').evaluateAll((els) =>
        els.map((e) => ({
          title: e.getAttribute('data-block-title'),
          collapsible: !!e.querySelector(':scope > div > button[aria-expanded]'),
          open: e.querySelector(':scope > div > button[aria-expanded]')?.getAttribute('aria-expanded'),
        })),
      )
      const notCollapsible = blocks.filter((b) => !b.collapsible).map((b) => b.title)
      check('A233 · tous les blocs se replient, sauf l\'en-tête (photo, nom)', notCollapsible.length === 1, notCollapsible.join(' | '))
      const details = blocks.find((b) => /פרטים/.test(b.title ?? ''))
      check('A233 · en édition, « פרטים » est replié…', details?.open === 'false', JSON.stringify(details))
      const summary = await page.locator('[data-testid="summary-details"]').textContent()
      check('A233 · … avec le résumé de son contenu sur la ligne', !!summary && summary.trim().length > 0 && summary !== 'אין', String(summary))

      // Un bloc replié qui contient un champ en faute s'ouvre au refus d'enregistrer.
      await page.locator('[data-testid="person-farmer-edit"]').click()
      await page.locator('[data-testid="farm-form-farmerPhone"]').fill('12')
      await page.locator('[data-testid="section-farm-form-people:farm-07"]').click()
      await page.waitForTimeout(300)
      check('A233 · (bloc « אנשים » replié à la main)', (await page.locator('[data-testid="farm-form-farmerPhone"]').count()) === 0)
      await page.locator('[data-testid="form-actions"] .btn-primary').click()
      await page.waitForTimeout(900)
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
      check('A233 · enregistrer refusé : le bloc s\'ouvre et le champ fautif a le focus', focused === 'farm-form-farmerPhone', String(focused))
      await ctx.close()
    })
  }

  if (wants('A234') || wants('A235')) {
    // =======================================================================
    section('A234 · A235 — un bouton photo ; une photo par personne ; l\'agriculteur contact par défaut, en résumé')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(chrome, { viewport: { width: 1032, height: 1376 } })
      const page = await ctx.newPage()
      await open(page, '#/coordinator/farms/farm-07/edit', 3500)
      const identity = page.locator('[data-testid="farm-block-identity"]')
      const inputs = await identity.locator('input[type="file"]').evaluateAll((els) =>
        els.map((e) => ({ capture: e.getAttribute('capture'), accept: e.getAttribute('accept') })),
      )
      check('A234 · photo de la ferme : UN champ fichier, sans « capture » (iOS propose alors les trois sources)', inputs.length === 1 && inputs[0].capture === null && inputs[0].accept === 'image/*', JSON.stringify(inputs))
      const buttons = await identity.locator('button').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()).filter(Boolean))
      check('A234 · … et UN bouton (plus « צילום עכשיו » + « העלאת קובץ »)', !buttons.some((b) => /צילום עכשיו|העלאת קובץ/.test(b)) && buttons.filter((b) => /תמונה/.test(b)).length === 1, buttons.join(' | '))
      const pos = await page.evaluate(() => {
        const thumb = document.querySelector('[data-testid="photo-field-thumb"]')!.getBoundingClientRect()
        const btn = document.querySelector('[data-testid="photo-field-choose"]')!.getBoundingClientRect()
        return { sameRow: Math.abs(thumb.top + thumb.height / 2 - (btn.top + btn.height / 2)) < 12 }
      })
      check('A234 · le bouton est À CÔTÉ de la vignette, sur sa ligne', pos.sameRow)

      const farmer = page.locator('[data-testid="person-farmer"]')
      check('A234 · une personne : plus de second cercle photo dans sa carte', (await farmer.locator('[data-testid="photo-field"]').count()) === 0 && (await farmer.locator('input[type="file"]').count()) === 1)
      check('A234 · … l\'avatar en tête ouvre le choix de photo', (await farmer.locator('[data-testid="person-farmer-photo"]').count()) === 1)
      const chooser = page.waitForEvent('filechooser', { timeout: 3000 }).then(() => true).catch(() => false)
      await page.locator('[data-testid="person-farmer-photo"]').click()
      check('A234 · … et le toucher ouvre bien le sélecteur', await chooser)

      check('A235 · l\'agriculteur est le contact principal', (await farmer.locator('[data-testid="person-farmer-primary"]').count()) === 1)
      const summary = (await farmer.locator('[data-testid="person-farmer-summary"]').textContent().catch(() => '')) ?? ''
      check('A235 · … affiché en résumé : nom et portable', /עמית דרור/.test(summary) && /\(052\) 000-0010/.test(summary), summary)
      check('A235 · … sans ses champs répétés dessous', (await farmer.locator('input[data-kind]').count()) === 0)
      for (const vw of [402, 1032]) {
        await page.setViewportSize({ width: vw, height: 874 })
        await page.waitForTimeout(400)
        const phoneCut = await farmer.locator('[data-testid="person-farmer-summary"] bdi').evaluate((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > (e.closest('[data-testid="person-farmer"]') as HTMLElement).getBoundingClientRect().right)
        check(`A235 · ${vw} px : le portable du résumé n'est pas coupé`, !phoneCut)
      }
      await page.setViewportSize({ width: 1032, height: 1376 })
      await page.waitForTimeout(400)
      const order = await page.evaluate(() => {
        const r = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().top
        return { farmer: r('person-farmer'), add: r('person-add'), liaison: r('person-liaison') }
      })
      check('A235 · « הוספת איש קשר נוסף » juste SOUS le résumé', order.farmer < order.add && order.add < order.liaison, JSON.stringify(order))
      await page.locator('[data-testid="farm-block-people"]').screenshot({ path: `${SHOTS}/a235-contact-resume.png` })

      // Quelqu'un d'autre devient le contact : c'est lui qui passe en résumé.
      await page.locator('[data-testid="person-add"]').click()
      await page.locator('[data-testid="person-contact-0-name"]').fill('שרה כהן')
      await page.locator('[data-testid="person-contact-0-phone"]').fill('0541112233')
      await page.locator('[data-testid="person-contact-0-make-primary"]').click()
      await page.waitForTimeout(300)
      const other = page.locator('[data-testid="person-contact-0"]')
      check('A235 · un autre contact choisi : il passe en résumé', (await other.getAttribute('data-summary')) === '' && /שרה כהן/.test((await other.textContent()) ?? ''))
      check('A235 · … et l\'agriculteur n\'est plus résumé comme principal', (await farmer.locator('[data-testid="person-farmer-primary"]').count()) === 0)
      await ctx.close()
    })
  }

  if (wants('A236')) {
    // =======================================================================
    section('A236 — un seul motif d\'ouverture : toute création, toute édition est une PAGE')
    // =======================================================================
    await guard(async () => {
      const ctx = await context(chrome, { viewport: { width: 1032, height: 1376 } })
      const page = await ctx.newPage()
      const entries: Array<[string, () => Promise<void>]> = [
        ['ferme (+)', async () => open(page, '#/coordinator/farms/new', 2500)],
        ['moshav (+)', async () => open(page, '#/coordinator/farms/new?kind=moshav', 2500)],
        ['ferme (édition)', async () => open(page, '#/coordinator/farms/farm-07/edit', 2500)],
        ['volontaire (+)', async () => { await open(page, '#/coordinator/volunteers', 2500); await page.locator('[data-testid="action-fab-toggle"]').click() }],
        ['conducteur (tuile)', async () => { await open(page, '#/coordinator/drivers', 2500); await page.locator('[data-testid="driver-tile-open"]:visible').first().click() }],
        ['garde (+)', async () => open(page, '#/coordinator/missions/new', 2500)],
        ['rendez-vous (menu +)', async () => open(page, '#/coordinator/agenda?new=visit', 2500)],
        ['événement (menu +)', async () => open(page, '#/coordinator/agenda?new=meeting', 2500)],
        ['rendez-vous (fiche)', async () => { await open(page, '#/coordinator/farms/farm-07', 2500); await page.getByText('תכנון ביקור').first().click() }],
      ]
      for (const [name, go] of entries) {
        await go()
        await page.waitForTimeout(1500)
        const m = await page.evaluate(() => ({
          hash: location.hash,
          dialog: document.querySelectorAll('[role="dialog"]').length,
          back: !!document.querySelector('[data-testid="page-back"]'),
          title: !!document.querySelector('[data-page-title], h1'),
        }))
        check(`A236 · ${name} : une page (adresse, flèche retour), aucune fenêtre`, m.dialog === 0 && m.back && m.title && !/[?&]new=/.test(m.hash), JSON.stringify(m))
      }
      await page.locator('[data-testid="page-back"]').click()
      await page.waitForTimeout(800)
      check('A236 · la flèche retour ramène d\'où l\'on vient', /farms\/farm-07$/.test(await page.evaluate(() => location.hash)), await page.evaluate(() => location.hash))
      await ctx.close()
    })
  }

  if (wants('A237')) {
    // =======================================================================
    section('A237 — la position n\'est pas redemandée après avoir été donnée')
    // =======================================================================
    /* ⚠️ Un navigateur de test ne montre pas l'invite d'iOS : elle a été VUE
       sur le simulateur iPad (ETAT.md, AN12). Ce qui se mesure ici, c'est ce
       que l'app DEMANDE à l'appareil : chaque appel réel à la localisation est
       compté. */
    await guard(async () => {
      const ctx = await context(chrome, { storage: { 'lo-yanum:block:settings-origin': '1' } })
      await ctx.addInitScript(() => {
        const w = window as unknown as { __geoCalls: number }
        w.__geoCalls = 0
        const real = navigator.geolocation
        const wrap = {
          getCurrentPosition: (ok: PositionCallback, err?: PositionErrorCallback | null, o?: PositionOptions) => {
            w.__geoCalls++
            real.getCurrentPosition(ok, err ?? undefined, o)
          },
          watchPosition: (ok: PositionCallback, err?: PositionErrorCallback | null, o?: PositionOptions) => {
            w.__geoCalls++
            return real.watchPosition(ok, err ?? undefined, o)
          },
          clearWatch: (id: number) => real.clearWatch(id),
        }
        Object.defineProperty(navigator, 'geolocation', { value: wrap, configurable: true })
      })
      const page = await ctx.newPage()
      await open(page, '#/coordinator/settings')
      const calls = () => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)
      check('A237 · ouvrir les réglages ne demande rien', (await calls()) === 0, String(await calls()))
      const here = page.locator('[data-testid="origin-here"]')
      await here.scrollIntoViewIfNeeded()
      await here.click()
      await page.waitForTimeout(2500)
      const first = await calls()
      check('A237 · « המיקום שלי » : une demande', first === 1, String(first))
      await here.click()
      await page.waitForTimeout(1500)
      check('A237 · touché une seconde fois : aucune nouvelle demande', (await calls()) === first, String(await calls()))
      const fixAge = await page.evaluate(() => {
        const raw = localStorage.getItem('lo-yanum:last-fix')
        return raw ? Math.round((Date.now() - Number(JSON.parse(raw).at)) / 1000) : null
      })
      /* ⚠️ `goto` vers la même page avec un autre « # » ne RECHARGE pas le
         document : le compteur ne repartait pas de zéro et comptait deux fois
         le premier appel (vu, puis corrigé). Un vrai rechargement. */
      await open(page, '#/coordinator/farms', 1500)
      await page.reload({ waitUntil: 'load' })
      await page.waitForTimeout(1500)
      await open(page, '#/coordinator/settings')
      await page.reload({ waitUntil: 'load' })
      await page.waitForTimeout(2500)
      const beforeClick = await calls()
      await page.locator('[data-testid="origin-here"]').click()
      await page.waitForTimeout(1500)
      console.log(`  NOTE  appels avant le toucher : ${beforeClick}`)
      check('A237 · écran quitté, app rechargée, retouché : aucune nouvelle demande', (await calls()) === 0, `${await calls()} appel(s) ; relevé mémorisé il y a ${fixAge} s`)
      check('A237 · la ligne dit quoi choisir pour qu\'iOS ne redemande pas', /Allow While Using App/.test((await page.locator('[data-testid="origin-permission-hint"]').textContent()) ?? ''))
      await ctx.close()
    })
  }
} finally {
  await chrome.close()
  await safari.close()
  for (const s of serves) s.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
