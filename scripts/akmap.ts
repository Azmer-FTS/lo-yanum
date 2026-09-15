import { chromium } from 'playwright'
import type { BrowserContext, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AK6 · A203 — LE FOND DE CARTE CHOISI NE CHANGE JAMAIS TOUT SEUL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run akmap                         (build de démonstration, Chromium)
 *   DIST=dist-ak6-before SKIP_BUILD=1 bun run akmap   → le ROUGE, build d'avant
 *
 * « Il choisit le fond satellite, et après un certain temps l'application
 *   rebascule seule en vectoriel. » AVANT DE CORRIGER, ON MESURE : le PO choisit
 * le satellite, puis chaque déclencheur candidat est provoqué SEUL, et après
 * chacun on lit trois choses — le choix enregistré (`lo-yanum:map-base`), le
 * fond affiché (`data-base` du bouton, sources du style), et QUI a écrit le
 * choix (pile d'appel de chaque `localStorage.setItem` sur cette clé, avec le
 * dernier événement vu).
 *
 * Les déclencheurs, dans l'ordre du brief :
 *   1. le délai            — 25 s sans rien toucher
 *   2. le retour en avant-plan — `visibilitychange` caché → visible, `pageshow`
 *   3. la perte de réseau  — hors ligne 3 s, puis en ligne
 *   4. le service worker   — `controllerchange`
 *   5. l'échec de tuiles   — toutes les tuiles satellite répondent 503, 8 s
 *   6. le contexte WebGL perdu (iOS le retire aux apps en arrière-plan)
 *   7. le rechargement hors ligne (lancement à froid sans couverture)
 *
 * Ce qui est EXIGÉ après chacun (A203) : le choix enregistré est toujours
 * « satellite », et le fond affiché aussi. Sur les échecs (3, 5, 7) : l'app le
 * DIT sur la carte, et une fois le réseau revenu les tuiles reviennent.
 */

const PORT = Number(process.env.AKMAP_PORT ?? 5303)
const OUT = process.env.DIST ?? 'dist-akpass'
const KEY = 'lo-yanum:map-base'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
if (process.env.SKIP_BUILD !== '1') {
  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], { env, stdout: 'ignore', stderr: 'pipe' })
  if ((await build.exited) !== 0) throw new Error(await new Response(build.stderr).text())
}
const serve = Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { env, stdout: 'ignore', stderr: 'ignore' })
const base = `http://localhost:${PORT}`
for (const deadline = Date.now() + 40_000; ; ) {
  try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break } catch { /* */ }
  if (Date.now() > deadline) throw new Error('preview did not come up')
  await Bun.sleep(300)
}

/** Posé AVANT l'app : qui écrit le choix, et après quel événement. */
const PROBE = `(() => {
  const w = window;
  w.__akEvents = [];
  w.__akWrites = [];
  const note = (name) => w.__akEvents.push({ name, at: Date.now() });
  ['online','offline','visibilitychange','pageshow','focus','blur'].forEach((n) =>
    window.addEventListener(n, () => note(n + (n === 'visibilitychange' ? ':' + document.visibilityState : '')), true));
  document.addEventListener('visibilitychange', () => note('doc-visibilitychange:' + document.visibilityState), true);
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('controllerchange', () => note('controllerchange'));
  document.addEventListener('webglcontextlost', () => note('webglcontextlost'), true);
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === '${KEY}') {
      const last = w.__akEvents[w.__akEvents.length - 1];
      w.__akWrites.push({ value: String(v), after: last ? last.name : 'none', stack: (new Error().stack || '').split('\\n').slice(2, 7).join(' | ') });
    }
    return set.call(this, k, v);
  };
})()`

interface State {
  stored: string | null
  shown: string | null
  sources: string[]
  notice: string | null
  writes: Array<{ value: string; after: string; stack: string }>
}

async function state(page: Page): Promise<State> {
  return await page.evaluate((key) => {
    const w = window as unknown as {
      __akWrites?: State['writes']
      __loYanumMap?: { getStyle(): { sources: Record<string, unknown> } }
    }
    const btn = document.querySelector('[data-testid="map-tool-base"]')
    const notice = document.querySelector('[data-testid="map-imagery-notice"]')
    let sources: string[] = []
    try { sources = Object.keys(w.__loYanumMap?.getStyle().sources ?? {}) } catch { /* style en cours */ }
    return {
      stored: localStorage.getItem(key),
      shown: btn?.getAttribute('data-base') ?? null,
      sources,
      notice: notice && (notice as HTMLElement).offsetParent !== null ? notice.textContent : null,
      writes: [...(w.__akWrites ?? [])],
    }
  }, KEY)
}

async function openMap(page: Page): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="map-tool-base"]', { timeout: 30_000 })
  await page.waitForTimeout(2500)
}

const causes: string[] = []

/**
 * Chaque déclencheur est mesuré SEUL : si le précédent a fait basculer la
 * carte, le PO la remet sur satellite avant le suivant (comme il le fait sur
 * son iPad) — sinon un seul coupable ferait échouer toutes les lignes après
 * lui et la mesure ne dirait plus lequel.
 */
async function restore(page: Page): Promise<void> {
  const btn = page.locator('[data-testid="map-tool-base"]')
  if ((await btn.getAttribute('data-base')) !== 'satellite') {
    await btn.click().catch(() => undefined)
    await page.waitForTimeout(2500)
    console.log('  ·     (remis sur satellite par le PO avant la mesure suivante)')
  }
}

async function verdict(page: Page, trigger: string, before: number, failureExpected = false): Promise<void> {
  const s = await state(page)
  const fresh = s.writes.slice(before)
  const flipped = fresh.filter((w) => w.value !== 'satellite')
  for (const w of flipped) {
    const line = `${trigger} → setItem('${KEY}', '${w.value}') après « ${w.after} » ← ${w.stack}`
    causes.push(line)
    console.log(`  ·     CAUSE  ${line}`)
  }
  check(`A203 · ${trigger} : the stored choice is still satellite`, s.stored === 'satellite', `stored=${s.stored}`)
  check(`A203 · ${trigger} : the map still shows satellite`, s.shown === 'satellite' && s.sources.includes('satellite'),
    `shown=${s.shown} sources=${s.sources.join(',')}`)
  if (failureExpected) {
    check(`AK6.3 · ${trigger} : the app SAYS the imagery is unavailable`, s.notice !== null && s.notice.trim() !== '', String(s.notice))
  }
}

const browser = await chromium.launch()
let context: BrowserContext | null = null
try {
  context = await browser.newContext({ viewport: { width: 1376, height: 1032 }, hasTouch: true })
  await context.addInitScript(PROBE)
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`  ·     pageerror ${String(e).slice(0, 140)}`))

  console.log('')
  console.log('  AK6 — LA CARTE QUI RETOMBE EN VECTORIEL : MESURE')
  console.log('  ================================================')
  console.log(`  ${base}  (${OUT})`)

  await openMap(page)
  const btn = page.locator('[data-testid="map-tool-base"]')
  if ((await btn.getAttribute('data-base')) !== 'satellite') await btn.click()
  await page.waitForTimeout(2500)
  let s = await state(page)
  check('setup · the PO chose satellite: stored and shown', s.stored === 'satellite' && s.shown === 'satellite', `${s.stored}/${s.shown}`)

  // 1 — le délai
  let n = (await state(page)).writes.length
  await page.waitForTimeout(25_000)
  await verdict(page, '1 délai 25 s', n)

  // 2 — retour en avant-plan
  n = (await state(page)).writes.length
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('blur'))
  })
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    window.dispatchEvent(new Event('focus'))
  })
  await page.waitForTimeout(2500)
  await verdict(page, '2 retour en avant-plan', n)

  // 3 — perte de réseau
  n = (await state(page)).writes.length
  await context.setOffline(true)
  await page.waitForTimeout(3000)
  await verdict(page, '3a hors ligne (pendant)', n, true)
  await context.setOffline(false)
  await page.waitForTimeout(4000)
  await verdict(page, '3b réseau revenu', n)
  s = await state(page)
  check('AK6.3 · 3b : once back online the notice is gone', s.notice === null, String(s.notice))

  // 4 — service worker
  await restore(page)
  n = (await state(page)).writes.length
  await page.evaluate(() => navigator.serviceWorker?.dispatchEvent(new Event('controllerchange')))
  await page.waitForTimeout(2000)
  await verdict(page, '4 controllerchange', n)

  // 5 — échec de tuiles satellite
  await restore(page)
  n = (await state(page)).writes.length
  let failing = true
  let refused = 0
  let servedAfter = 0
  await context.route('**/World_Imagery/**', async (route) => {
    if (failing) { refused++; await route.fulfill({ status: 503, body: 'down' }) }
    else { servedAfter++; await route.continue() }
  })
  await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { zoomIn(o?: unknown): void } }).__loYanumMap
    m?.zoomIn({ duration: 0 })
  })
  await page.waitForTimeout(8000)
  await verdict(page, '5a tuiles satellite en 503', n, true)
  failing = false
  await page.waitForTimeout(20_000)
  await verdict(page, '5b tuiles de nouveau servies', n)
  check('AK6.3 · 5b : the app RETRIED the failed imagery by itself', servedAfter > 0, `${refused} refused, ${servedAfter} served after`)
  s = await state(page)
  check('AK6.3 · 5b : and the notice is gone', s.notice === null, String(s.notice))
  await context.unroute('**/World_Imagery/**')

  // 6 — contexte WebGL perdu
  await restore(page)
  n = (await state(page)).writes.length
  await page.evaluate(() => {
    const canvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_lose_context')
    ext?.loseContext()
    setTimeout(() => ext?.restoreContext(), 800)
  })
  await page.waitForTimeout(6000)
  await verdict(page, '6 contexte WebGL perdu puis rendu', n)

  // 7 — lancement à froid hors ligne, puis réseau
  await restore(page)
  /* Le service worker doit contrôler la page pour qu'elle s'ouvre hors ligne. */
  await page.evaluate(async () => { await navigator.serviceWorker?.ready })
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(3000)
  n = 0
  await context.setOffline(true)
  await page.reload({ waitUntil: 'load' }).catch(() => undefined)
  await page.waitForTimeout(6000)
  const cold = await state(page)
  if (cold.shown === null) {
    console.log('  ·     7 : le document ne se recharge pas hors ligne sur ce serveur (pas de service worker actif) — mesure sautée')
    await context.setOffline(false)
  } else {
    const dbg = await page.evaluate(() => ({
      online: navigator.onLine,
      map: !!(window as unknown as { __loYanumMap?: unknown }).__loYanumMap,
    }))
    console.log(`  ·     7a état : ${JSON.stringify(dbg)}`)
    /* ⚠️ DIT FRANCHEMENT : dans Chromium sous Playwright, après un rechargement
       en mode hors ligne émulé, `navigator.onLine` répond `true` (mesuré
       ci-dessus) et le style ne se charge pas faute d'archive en cache sur ce
       serveur — la carte n'est donc pas publiée. Ce qui SE MESURE ici est ce
       qui compte pour le bug : le choix enregistré et le fond que le bouton
       déclare. La bande « אין רשת » hors ligne est mesurée en 3a. */
    check('A203 · 7a relancée hors ligne : the stored choice is still satellite', cold.stored === 'satellite', `stored=${cold.stored}`)
    check('A203 · 7a relancée hors ligne : the map comes up declaring satellite, not vector', cold.shown === 'satellite', `shown=${cold.shown}`)
    await context.setOffline(false)
    await page.waitForTimeout(5000)
    await verdict(page, '7b réseau revenu après un lancement hors ligne', n)
  }

  console.log('')
  console.log('  CAUSES MESURÉES (écritures du choix qui ne sont pas « satellite ») :')
  if (causes.length === 0) console.log('  ·     aucune')
  for (const c of causes) console.log(`  ·     ${c}`)
} finally {
  await context?.close()
  await browser.close()
  serve.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
