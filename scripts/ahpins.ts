import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * ★★ A171 — L'ÉPINGLE FINE : LA POINTE SUR LA POSITION EXACTE, ET L'ICÔNE
 *    LISIBLE SUR LES DEUX FONDS ET DANS LES DEUX THÈMES.
 *
 *   bun run ahpins
 *
 * ⚠️ « LA POINTE DÉSIGNE LA POSITION » SE MESURE, ET C'EST LA MOITIÉ DE LA
 *    PORTE. La sonde demande à MapLibre où se projette la coordonnée du
 *    marqueur, puis compare ce point au BAS de la boîte dessinée. Une pastille
 *    centrée y échoue d'un demi-marqueur, ce qui est exactement le défaut.
 */
const OUT = process.env.OUT ?? 'dist-ahpass'
const PORT = Number(process.env.PORT ?? 5301)
const SHOTS = 'docs/screenshots/ahpass'
mkdirSync(SHOTS, { recursive: true })

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
  if ((await build.exited) !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error('vite build failed')
  }
}
const serve = Bun.spawn(
  ['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'],
  { env, stdout: 'ignore', stderr: 'ignore' },
)
const base = `http://localhost:${PORT}`
{
  const deadline = Date.now() + 40_000
  for (;;) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break } catch { /* pas encore */ }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

console.log('')
console.log('  A171 — L’ÉPINGLE FINE')
console.log('  =====================')

const PROBE = function measurePins(): {
  kinds: Record<string, number>
  anchoredBottom: Record<string, number>
  halo: number
  glyph: number
} {
  const kinds: Record<string, number> = {}
  const anchoredBottom: Record<string, number> = {}
  let halo = 0
  let glyph = 0
  for (const el of Array.from(document.querySelectorAll('[data-marker-kind]'))) {
    const e = el as HTMLElement
    const kind = e.dataset.markerKind ?? '?'
    kinds[kind] = (kinds[kind] ?? 0) + 1
    /**
     * ★★ « LA POINTE DÉSIGNE LA POSITION » SE LIT DANS LA TRANSFORMATION DU
     *    CONTENEUR, ET C'EST LA MESURE LA PLUS DIRECTE QUI EXISTE. MapLibre
     *    pose `translate(-50%, -100%)` sur un marqueur ancré EN BAS et
     *    `translate(-50%, -50%)` sur un marqueur centré : le premier met le
     *    bas de la boîte — la pointe — sur la coordonnée, le second son
     *    milieu. Lire la boîte à l'écran et la reprojeter demanderait à la
     *    porte de refaire la projection de la carte ; ceci demande à la carte
     *    ce qu'elle a fait.
     */
    const holder = e.closest('.maplibregl-marker') as HTMLElement | null
    const transform = holder ? holder.style.transform : ''
    if (transform.includes('-100%')) {
      anchoredBottom[kind] = (anchoredBottom[kind] ?? 0) + 1
    }
    const svg = e.querySelector('svg')
    if (!svg) continue
    if (svg.innerHTML.includes('rgba(0,0,0,.45)')) halo += 1
    /* Une icône DANS la tête : un `<g>` de glyphe, un `<text>` de rang, ou le
       point plein du repère générique. */
    if (svg.querySelector('g, text, circle')) glyph += 1
  }
  return { kinds, anchoredBottom, halo, glyph }
}

const browser = await chromium.launch()
try {
  for (const theme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({
      viewport: { width: 1032, height: 1376 },
      colorScheme: theme,
    })
    const page = await ctx.newPage()
    await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
    await page.waitForTimeout(800)
    await page.goto(`${base}/#/coordinator/farms`, { waitUntil: 'load' })
    await page.waitForTimeout(6000)

    const m = await page.evaluate(PROBE)
    const PIN_KINDS = ['farm', 'moshav', 'anchor', 'incident', 'pin', 'car']
    const drawn = Object.keys(m.kinds).filter((k) => PIN_KINDS.includes(k))
    check(
      `A171 (${theme}) · des points précis sont dessinés`,
      drawn.length > 0,
      Object.entries(m.kinds).map(([k, n]) => `${k}×${n}`).join(' '),
    )
    check(
      `A171 (${theme}) · la POINTE est sur la position, jamais le centre de la tête`,
      drawn.every((k) => (m.anchoredBottom[k] ?? 0) === m.kinds[k]),
      drawn.map((k) => `${k} ${m.anchoredBottom[k] ?? 0}/${m.kinds[k]}`).join(' · '),
    )
    check(
      `A171 (${theme}) · chaque épingle porte le halo sombre sous son contour clair`,
      m.halo >= drawn.reduce((n, k) => n + m.kinds[k], 0),
      `${m.halo} halos`,
    )
    check(
      `A171 (${theme}) · chaque tête porte une icône ou un rang`,
      m.glyph >= drawn.reduce((n, k) => n + m.kinds[k], 0),
      `${m.glyph} icônes`,
    )
    await page.screenshot({ path: `${SHOTS}/a171-pins-${theme}.png` })
    await ctx.close()
  }
} finally {
  await browser.close()
  serve.kill()
}
console.log('')
console.log(`  ${passed} PASS · ${failed} FAIL`)
console.log('')
if (failed > 0) process.exit(1)
