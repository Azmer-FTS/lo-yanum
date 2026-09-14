import { chromium, webkit } from 'playwright'
import type { BrowserContext, Page } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ PASSE AI — L'ITINÉRAIRE LIBRE DANS LE NAVIGATEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run airoute
 *
 * A180 le champ se vide, Entrée valide, le curseur reste · A181 un bloc de
 * liens · A182 le texte non lu reste, avec son motif · A183 deux décimales ·
 * A173 le tracé suit les routes · A174 distances et durées du tracé ·
 * A175 hors réseau · A176 aucun chemin · A177 le temps, froid, chaud et
 * incrémental, Chromium ET WebKit · A178 réseau coupé, archive téléchargée
 * par le bouton des réglages, et réseau coupé SANS archive · A179 le trafic
 * de toute la porte, observé · A188 le glisser-déposer d'AH9.
 *
 * Le build est celui du jumeau (aucune base) : l'itinéraire libre ne lit
 * aucune donnée du programme, et le service worker est celui de production.
 */
const OUT = process.env.OUT ?? 'dist-aipass'
const PORT = Number(process.env.PORT ?? 5341)
const SHOTS = 'docs/screenshots/aipass/local'
mkdirSync(SHOTS, { recursive: true })

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
  console.log(`  ${'='.repeat(title.length)}`)
}

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
if (process.env.SKIP_BUILD !== '1') {
  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], { env, stdout: 'ignore', stderr: 'pipe' })
  if ((await build.exited) !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error('vite build failed')
  }
}
const serve = Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], {
  env,
  stdout: 'ignore',
  stderr: 'ignore',
})
const base = `http://localhost:${PORT}`
{
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
}

/** Huit localités réelles de la zone Adoulam–Lakhish, dans les formes que le PO reçoit. */
const STOPS = [
  'https://waze.com/ul?ll=31.56414%2C34.84146',
  'https://www.google.com/maps/@31.61226,34.89577,15z',
  '31.62991, 34.9551',
  'https://maps.google.com/?q=31.53344,34.91357',
  '31.68681 34.88674',
  'https://waze.com/ul?ll=31.67041%2C34.94772',
  '31.512, 34.93505',
  'https://www.google.com/maps/@31.69687,34.91279,14z',
]
/** Ce qui ne doit JAMAIS apparaître dans une URL sortante (A179). */
const COORD_FRAGMENTS = ['31.564', '31.612', '31.629', '31.533', '31.686', '31.670', '31.512', '31.696', '31.524']
const ROUTING_HOSTS = /google|mapbox|osrm|graphhopper|openrouteservice|here\.com|tomtom|project-osrm|valhalla|routing/i

const requests: string[] = []
function watch(ctx: BrowserContext): void {
  ctx.on('request', (r) => requests.push(r.url()))
}

const field = (page: Page) => page.locator('[data-testid="position-link"]').first()
const stops = (page: Page) => page.locator('[data-testid="free-route-stop"]')

async function openFreeRoute(page: Page): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await page.goto(`${base}/#/coordinator/route/free`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="position-link"]', { timeout: 20_000 })
  await page.waitForTimeout(600)
}

async function waitRouted(page: Page, timeout = 60_000): Promise<{ state: string; ms: number; tiles: number }> {
  await page.waitForSelector(
    '[data-testid="free-route-road-status"][data-state="routed"], [data-testid="free-route-road-status"][data-state="unavailable"]',
    { timeout },
  )
  return page.locator('[data-testid="free-route-road-status"]').evaluate((e) => ({
    state: e.getAttribute('data-state') ?? '',
    ms: Number(e.getAttribute('data-ms') ?? 'NaN'),
    tiles: Number(e.getAttribute('data-tiles') ?? 'NaN'),
  }))
}

/** Les entités de la source `route` de la carte, par style. */
async function routeFeatures(page: Page): Promise<Record<string, { count: number; coords: number }>> {
  return page.evaluate(() => {
    const m = (window as unknown as {
      __loYanumMap?: { getSource: (id: string) => { serialize: () => { data: { features?: Array<{ properties: { style: string }; geometry: { coordinates: unknown[] } }> } } } | undefined }
    }).__loYanumMap
    const out: Record<string, { count: number; coords: number }> = {}
    let data: { features?: Array<{ properties: { style: string }; geometry: { coordinates: unknown[] } }> } | undefined
    try {
      data = m?.getSource('route')?.serialize().data
    } catch {
      /* carte sans style (réseau coupé sans archive) : rien à lire */
      return out
    }
    for (const f of data?.features ?? []) {
      const k = f.properties.style
      out[k] = out[k] ?? { count: 0, coords: 0 }
      out[k].count += 1
      out[k].coords += f.geometry.coordinates.length
    }
    return out
  })
}

async function newRoute(page: Page): Promise<void> {
  await page.locator('[data-testid="free-route-new"]').click()
  await page.waitForTimeout(400)
}

try {
  // =========================================================================
  section('A180 · A182 · A183 — la saisie des points')
  // =========================================================================
  {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 1032, height: 1376 } })
    watch(ctx)
    const page = await ctx.newPage()
    await openFreeRoute(page)

    await field(page).click()
    await field(page).fill(STOPS[0])
    await field(page).press('Enter')
    await page.waitForTimeout(400)
    check('A180 · Entrée valide : le point rejoint la liste', (await stops(page).count()) === 1)
    check('A180 · le champ se vide', (await field(page).inputValue()) === '', JSON.stringify(await field(page).inputValue()))
    check(
      'A180 · le curseur reste dedans',
      (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'position-link',
    )

    await field(page).fill(STOPS[1])
    await page.locator('[data-testid="position-link-apply"]').first().click()
    await page.waitForTimeout(400)
    check('A180 · le bouton fait la même chose', (await stops(page).count()) === 2 && (await field(page).inputValue()) === '')
    check(
      'A180 · et le curseur reste dans le champ après le bouton aussi',
      (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'position-link',
    )
    const done = page.locator('[data-testid="position-link-done"]').first()
    check('A180 · confirmation brève, non bloquante', (await done.count()) === 1 && (await page.locator('[role="dialog"]').count()) === 0, (await done.innerText().catch(() => '')).trim())

    await field(page).fill('31.25, 34.79')
    await field(page).press('Enter')
    await page.waitForTimeout(400)
    check('A183 · « 31.25, 34.79 » (deux décimales) devient un point', (await stops(page).count()) === 3)

    await field(page).fill('https://maps.app.goo.gl/AbCdEf123')
    await field(page).press('Enter')
    await page.waitForTimeout(400)
    check('A182 · lien raccourci : le texte est CONSERVÉ', (await field(page).inputValue()) === 'https://maps.app.goo.gl/AbCdEf123')
    check('A182 · et le motif est dit', (await page.locator('[data-testid="position-link-shortened"]').count()) === 1)
    check('A182 · aucun point fantôme', (await stops(page).count()) === 3)

    await field(page).fill('בית הכנסת של דוד')
    await field(page).press('Enter')
    await page.waitForTimeout(400)
    check(
      'A182 · texte sans position : conservé, motif affiché',
      (await field(page).inputValue()) === 'בית הכנסת של דוד' && (await page.locator('[data-testid="position-link-bad"]').count()) === 1,
    )

    await field(page).fill('31.30, 34.80\nhttps://maps.app.goo.gl/Zz')
    await field(page).press('Enter')
    await page.waitForTimeout(400)
    check(
      'A182 · bloc mêlé : le lisible part, SEUL le non-lu reste',
      (await stops(page).count()) === 4 && (await field(page).inputValue()) === 'https://maps.app.goo.gl/Zz',
      JSON.stringify(await field(page).inputValue()),
    )

    // Supprimer un point en un geste (AI5.6).
    await page.locator('[data-testid="free-route-remove"]').first().click()
    await page.waitForTimeout(300)
    check('AI5.6 · supprimer un point : un seul geste', (await stops(page).count()) === 3)
    await browser.close()
  }

  // =========================================================================
  section('A181 · A173 · A174 · A177 — huit étapes collées d’un coup, deux moteurs')
  // =========================================================================
  for (const [engineName, engine] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ] as const) {
    const browser = await engine.launch()
    const ctx = await browser.newContext({ viewport: { width: 1032, height: 1376 } })
    watch(ctx)
    const page = await ctx.newPage()
    await openFreeRoute(page)

    await field(page).fill(STOPS.join('\n'))
    await field(page).press('Enter')
    const t0 = Date.now()
    check(`A181 · ${engineName} · huit liens collés : huit points`, (await stops(page).count()) === 8, String(await stops(page).count()))
    const cold = await waitRouted(page)
    const wall = Date.now() - t0
    const breakdown = await page.evaluate(() => (window as unknown as { __loYanumLastRoad?: unknown }).__loYanumLastRoad)
    console.log(`         ${engineName} · FROID : ${cold.ms} ms calculés (${wall} ms à l’écran), ${cold.tiles} tuiles lues`)
    console.log(`         ${JSON.stringify(breakdown)}`)
    check(`A173 · ${engineName} · le tracé est calculé`, cold.state === 'routed', cold.state)
    await page.waitForTimeout(1200)

    const modes = await stops(page).evaluateAll((els) =>
      els.map((e) => ({
        mode: e.getAttribute('data-mode'),
        km: Number(e.getAttribute('data-leg-km')),
        air: Number(e.getAttribute('data-air-km')),
      })),
    )
    check(`A173 · ${engineName} · les huit étapes sont sur route`, modes.every((m) => m.mode === 'road'), modes.map((m) => m.mode).join(' '))
    check(
      `A174 · ${engineName} · distance de chaque étape = tracé, ≥ vol d’oiseau`,
      modes.every((m) => m.km >= m.air && m.km > 0),
      modes.map((m) => `${m.km.toFixed(1)}/${m.air.toFixed(1)}`).join(' '),
    )
    const feats = await routeFeatures(page)
    check(
      `A173 · ${engineName} · la carte dessine des tracés SUR ROUTE, pas des segments`,
      (feats.road?.count ?? 0) === 9 && (feats.road?.coords ?? 0) > 9 * 20 && !feats.legacy,
      JSON.stringify(feats),
    )
    const legText = await page.locator('[data-testid="free-route-leg"]').first().innerText()
    check(`AI3.1 · ${engineName} · la durée porte « כ־ »`, legText.includes('כ־'), legText)
    const status = await page.locator('[data-testid="free-route-road-status"]').innerText()
    check(`AI3.2 · ${engineName} · la marge est dite`, /15%/.test(status), status)

    // Chaud : un réordonnancement ne relit rien.
    await page.locator('[data-testid="free-route-down"]').first().click()
    await page.waitForSelector('[data-testid="free-route-road-status"][data-state="routing"]', { timeout: 2000 }).catch(() => null)
    const warm = await waitRouted(page)
    console.log(`         ${engineName} · CHAUD (réordonnancement) : ${warm.ms} ms, ${warm.tiles} tuile lue`)
    check(`A177 · ${engineName} · graphe construit : huit étapes en moins d’une seconde`, warm.ms < 1000 && warm.tiles === 0, `${warm.ms} ms`)

    // Incrémental : une étape de plus, collée comme le PO le fait.
    await field(page).fill('31.60999, 34.80866')
    await field(page).press('Enter')
    await page.waitForSelector('[data-testid="free-route-road-status"][data-state="routing"]', { timeout: 2000 }).catch(() => null)
    const more = await waitRouted(page)
    console.log(`         ${engineName} · INCRÉMENTAL (9e étape) : ${more.ms} ms, ${more.tiles} tuiles lues`)
    check(`A177 · ${engineName} · une étape ajoutée : moins d’une seconde`, more.ms < 1000, `${more.ms} ms`)

    if (engineName === 'chromium') {
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${SHOTS}/a173-huit-etapes-sur-route.png` })
    }

    // =======================================================================
    if (engineName === 'chromium') {
      section('A188 — ce qu’AH9 a livré ne régresse pas (glisser-déposer)')
      const labels = async () => page.locator('[data-testid="free-route-stop-label"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
      const before = await labels()
      /* ⚠️ LES ÉVÉNEMENTS HTML5 EUX-MÊMES, et non la souris simulée. Deux essais
         de `dragTo` (depuis le centre, puis depuis la pastille) n'ont initié
         AUCUN glisser natif dans Chromium sans tête — la ligne ne bougeait
         pas, et la porte aurait accusé l'écran. Ce qui est vérifié ici est ce
         qu'AH9 a livré : dragstart sur une ligne, dragover et drop sur une
         autre, dans les gestionnaires de l'écran. */
      /* ⚠️ ET PAS DANS LE MÊME TIC : l'écran retient la ligne saisie dans son
         état, qu'un vrai doigt laisse le temps de poser. Envoyer dragstart et
         drop d'une traite rendait `dragIndex` encore vide au lâcher. */
      await page.evaluate(() => {
        const rows = document.querySelectorAll('[data-testid="free-route-stop"]')
        ;(window as unknown as { __dt?: DataTransfer }).__dt = new DataTransfer()
        rows[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: (window as unknown as { __dt: DataTransfer }).__dt }))
      })
      await page.waitForTimeout(150)
      await page.evaluate(() => {
        const rows = document.querySelectorAll('[data-testid="free-route-stop"]')
        const dt = (window as unknown as { __dt: DataTransfer }).__dt
        rows[2].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
        rows[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
      })
      await page.waitForTimeout(500)
      const after = await labels()
      check(
        'A188 · le glisser-déposer déplace la PREMIÈRE étape à la troisième place',
        after[2] === before[0] && after[0] === before[1] && after[1] === before[2],
        `${before.slice(0, 3).join(',')} → ${after.slice(0, 3).join(',')}`,
      )
      const arrive = await page.locator('[data-testid="free-route-arrive"]').allInnerTexts()
      check('A188 · chaque étape a son heure d’arrivée', arrive.length === 9 && arrive.every((a) => /\d{2}:\d{2}/.test(a)))
      await page.locator('[data-testid="free-route-stop"] input[type="tel"]').first().fill('050-1234567')
      await page.waitForTimeout(300)
      const sms = decodeURIComponent((await page.locator('[data-testid="free-route-sms"]').first().getAttribute('href')) ?? '')
      check('A188 · AI3.3 · le message garde « בסביבות »', sms.includes('בסביבות'), sms.slice(0, 80))
      const toFarm = page.locator('[data-testid="free-route-to-farm"]').first()
      await toFarm.click()
      await page.waitForTimeout(1500)
      check('A188 · la conversion en fiche ferme ouvre le formulaire avec la position', /farms\/new\?at=\d+\.\d{6},\d+\.\d{6}/.test(page.url()), page.url().split('#')[1])
    }
    await browser.close()
  }

  // =========================================================================
  section('A175 · A176 — hors réseau, et aucun chemin')
  // =========================================================================
  {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 1032, height: 1376 } })
    watch(ctx)
    const page = await ctx.newPage()
    await openFreeRoute(page)
    await field(page).fill('31.56414, 34.84146\n31.524, 34.768')
    await field(page).press('Enter')
    await waitRouted(page)
    await page.waitForTimeout(1500)
    const off = page.locator('[data-testid="free-route-offnetwork"]')
    check('A175 · la liste dit le point hors réseau, avec sa longueur', (await off.count()) >= 1, (await off.first().innerText().catch(() => '—')).trim())
    const feats = await routeFeatures(page)
    check('A175 · le dernier bout est dessiné à part (pointillé)', (feats.gap?.count ?? 0) >= 1, JSON.stringify(feats))
    check('A175 · et le reste suit la route', (feats.road?.count ?? 0) >= 2)
    await page.screenshot({ path: `${SHOTS}/a175-hors-reseau.png` })

    await newRoute(page)
    await field(page).fill('31.80, 34.65\n31.80, 34.30')
    await field(page).press('Enter')
    await waitRouted(page)
    await page.waitForTimeout(1500)
    const est = page.locator('[data-testid="free-route-estimate"]')
    check('A176 · aucun chemin : la mention d’estimation est à l’écran', (await est.count()) >= 1, (await est.first().innerText().catch(() => '—')).trim())
    const f2 = await routeFeatures(page)
    check('A176 · le repli est dessiné, et autrement qu’une route', (f2.estimate?.count ?? 0) >= 1, JSON.stringify(f2))
    const arrive = await page.locator('[data-testid="free-route-arrive"]').allInnerTexts()
    check('A176 · pas d’écran vide : une heure d’arrivée quand même', arrive.length === 2 && arrive.every((a) => /\d{2}:\d{2}/.test(a)))
    await page.screenshot({ path: `${SHOTS}/a176-aucun-chemin.png` })
    await browser.close()
  }

  // =========================================================================
  section('A178 — réseau coupé')
  // =========================================================================
  {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 1032, height: 1376 } })
    watch(ctx)
    const page = await ctx.newPage()
    await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 30_000 }).catch(() => null)
    await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const block = page.locator('[data-block="settings-offline"][data-open="0"] [data-testid="block-settings-offline"]')
    if ((await block.count()) === 1) await block.click()
    await page.locator('[data-testid="download-map"]').click()
    const downloaded = await page
      .waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="download-map"]')
          return el !== null && !/%/.test(el.textContent ?? '') && !(el as HTMLButtonElement).disabled
        },
        undefined,
        { timeout: 240_000 },
      )
      .then(() => true)
      .catch(() => false)
    check('A178 · l’archive est téléchargée par le bouton des réglages', downloaded)

    await ctx.setOffline(true)
    const failedRequests: string[] = []
    page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText ?? ''}`))
    await openFreeRoute(page)
    check('A178 · l’écran s’ouvre réseau coupé', (await field(page).count()) === 1)
    await field(page).fill(STOPS.join('\n'))
    await field(page).press('Enter')
    const offline = await waitRouted(page)
    console.log(`         HORS LIGNE (archive servie par le service worker) : ${offline.ms} ms, ${offline.tiles} tuiles`)
    check('A178 · le tracé est calculé SANS RÉSEAU', offline.state === 'routed', offline.state)
    const modes = await stops(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-mode')))
    check('A178 · et toutes les étapes sont sur route', modes.every((m) => m === 'road'), modes.join(' '))
    /* Une lecture ANNULÉE par la carte (la caméra a bougé) n'est pas un échec. */
    const archiveFailures = failedRequests.filter((u) => u.includes('pmtiles') && !u.includes('ERR_ABORTED'))
    check('A178 · aucune lecture d’archive n’a échoué', archiveFailures.length === 0, `${archiveFailures.length}`)
    await page.screenshot({ path: `${SHOTS}/a178-hors-ligne.png` })
    await browser.close()

    // Et réseau coupé SANS archive : le repli, dit.
    const b2 = await chromium.launch()
    const c2 = await b2.newContext({ viewport: { width: 1032, height: 1376 } })
    watch(c2)
    const p2 = await c2.newPage()
    await p2.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
    await p2.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 30_000 }).catch(() => null)
    await p2.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
    await p2.waitForTimeout(1500)
    await c2.setOffline(true)
    await openFreeRoute(p2)
    await field(p2).fill(STOPS.slice(0, 3).join('\n'))
    await field(p2).press('Enter')
    const none = await waitRouted(p2)
    check('A178 · sans archive ni réseau : l’écran le DIT au lieu d’échouer', none.state === 'unavailable', none.state)
    const m3 = await stops(p2).evaluateAll((els) => els.map((e) => e.getAttribute('data-mode')))
    const arr3 = await p2.locator('[data-testid="free-route-arrive"]').allInnerTexts()
    check(
      'A178 · et chaque étape garde une estimation et une heure, marquées « à vol d’oiseau »',
      m3.length === 3 && m3.every((m) => m === 'straight') && arr3.every((a) => /\d{2}:\d{2}/.test(a)),
      `${m3.join(' ')} · ${JSON.stringify(await routeFeatures(p2))}`,
    )
    await b2.close()
  }

  // =========================================================================
  section('A179 — aucune requête vers un calculateur d’itinéraire (trafic observé)')
  // =========================================================================
  {
    const hosts = [...new Set(requests.map((u) => { try { return new URL(u).host } catch { return u.slice(0, 20) } }))]
    const external = hosts.filter((h) => h !== '' && h !== `localhost:${PORT}`)
    check('A179 · toute la porte : aucune requête hors de l’origine', external.length === 0, `${requests.length} requêtes, hôtes : ${hosts.join(', ')}`)
    check('A179 · aucun hôte de calcul d’itinéraire', !requests.some((u) => ROUTING_HOSTS.test(new URL(u).host)))
    const leaking = requests.filter((u) => COORD_FRAGMENTS.some((c) => u.includes(c)))
    check('A179 · aucune coordonnée collée dans une URL', leaking.length === 0, leaking.slice(0, 2).join(' | '))
  }
} finally {
  serve.kill()
}

console.log('')
console.log(`  ${passed} PASS · ${failed} FAIL`)
console.log('')
process.exit(failed === 0 ? 0 : 1)
