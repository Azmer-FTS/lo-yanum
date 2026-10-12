import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AY2 — A358 : AUCUN DÉFILEMENT HORIZONTAL À 402 px, SUR AUCUN ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aymobile                                                    # jumeau local (dist-aydemo)
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run aymobile  # le jumeau DÉPLOYÉ
 *   DIST=<dossier> SKIP_BUILD=1 … · OUT=docs/ay/ay2-mobile-<x>.json · SHOTS=1
 *
 * Sur le JUMEAU (données factices complètes : gardes, incidents, points,
 * conducteurs — la porte de l'app réelle ne laisse entrer aucun robot).
 * Pour chaque écran, à 402 × 874, tactile, clair :
 *   - la page déborde-t-elle (`scrollWidth > largeur`) ?
 *   - quels conteneurs défilent de gauche à droite (`overflow-x` + contenu
 *     plus large) ? La carte est exclue (on la déplace au doigt, c'est son rôle).
 *   - quels éléments visibles sortent de l'écran (texte coupé à droite ou à
 *     gauche) sans être dans un conteneur qui les rogne ?
 *   - combien de `<table>` visibles ?
 * La porte est rouge au premier écran qui défile de côté.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const DIST = process.env.DIST ?? 'dist-aydemo'
const PORT = Number(process.env.PORT ?? 5420)
const OUT = process.env.OUT ?? `docs/ay/ay2-mobile-${REMOTE ? 'deploye' : 'local'}.json`
const SHOTS = process.env.SHOTS === '1' ? `docs/screenshots/aypass/${REMOTE ? 'deployed' : 'local'}/mobile` : null
const WIDTH = Number(process.env.WIDTH ?? 402)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let serve: ReturnType<typeof Bun.spawn> | null = null
async function base(): Promise<string> {
  if (REMOTE) return REMOTE
  if (process.env.SKIP_BUILD !== '1') {
    const b = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', DIST], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }, stdout: 'ignore', stderr: 'pipe' })
    if ((await b.exited) !== 0) throw new Error(await new Response(b.stderr).text())
  }
  serve = Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { stdout: 'ignore', stderr: 'ignore' })
  const url = `http://localhost:${PORT}`
  const deadline = Date.now() + 40_000
  for (;;) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* pas encore */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
  return url
}

/** Tous les écrans : la carte d'AX (37 du coordinateur) + les rôles de terrain + les états ouverts qui comptent. */
export const SCREENS: Array<{ name: string; hash: string; act?: string }> = [
  { name: 'tableau-de-bord', hash: '/coordinator' },
  { name: 'ajout', hash: '/coordinator/add' },
  { name: 'ajout-institution', hash: '/coordinator/add?type=institution' },
  { name: 'agenda', hash: '/coordinator/agenda' },
  { name: 'agenda-reunion', hash: '/coordinator/agenda/meeting/new' },
  { name: 'agenda-visite', hash: '/coordinator/agenda/visit/new' },
  { name: 'couverture', hash: '/coordinator/coverage' },
  { name: 'conducteurs', hash: '/coordinator/drivers' },
  { name: 'conducteur-edition', hash: '/coordinator/drivers/drv-01/edit' },
  { name: 'conducteur-nouveau', hash: '/coordinator/drivers/new' },
  { name: 'export', hash: '/coordinator/export' },
  { name: 'fermes', hash: '/coordinator/farms' },
  { name: 'fermes-liste', hash: '/coordinator/farms', act: 'list' },
  { name: 'ferme', hash: '/coordinator/farms/farm-01' },
  { name: 'ferme-point', hash: '/coordinator/farms/farm-01/anchors/anchor-01' },
  { name: 'ferme-point-edition', hash: '/coordinator/farms/farm-01/anchors/anchor-01/edit' },
  { name: 'ferme-edition', hash: '/coordinator/farms/farm-11/edit' },
  { name: 'ferme-nouvelle', hash: '/coordinator/farms/new' },
  { name: 'import-conducteurs', hash: '/coordinator/import/drivers' },
  { name: 'import-fermes', hash: '/coordinator/import/farms' },
  { name: 'import-institutions', hash: '/coordinator/import/institutions' },
  { name: 'import-portail', hash: '/coordinator/import/portal' },
  { name: 'import-prospection', hash: '/coordinator/import/prospection' },
  { name: 'import-signatures', hash: '/coordinator/import/signatures' },
  { name: 'import-volontaires', hash: '/coordinator/import/volunteers' },
  { name: 'incidents', hash: '/coordinator/incidents' },
  { name: 'incident', hash: '/coordinator/incidents/inc-01' },
  { name: 'institutions', hash: '/coordinator/institutions' },
  { name: 'contacts', hash: '/coordinator/leads' },
  { name: 'gardes', hash: '/coordinator/missions' },
  { name: 'garde', hash: '/coordinator/missions/mission-01' },
  { name: 'garde-nouvelle', hash: '/coordinator/missions/new' },
  { name: 'tournee', hash: '/coordinator/route' },
  { name: 'itineraire-libre', hash: '/coordinator/route/free' },
  { name: 'reglages', hash: '/coordinator/settings' },
  { name: 'regions', hash: '/coordinator/settings/regions' },
  { name: 'volontaires', hash: '/coordinator/volunteers' },
  { name: 'volontaire-edition', hash: '/coordinator/volunteers/vol-055/edit' },
  { name: 'volontaire-nouveau', hash: '/coordinator/volunteers/new' },
  { name: 'agriculteur', hash: '/farmer' },
  { name: 'agriculteur-gardes', hash: '/farmer/guards' },
  { name: 'agriculteur-documents', hash: '/farmer/documents' },
  { name: 'agriculteur-signer', hash: '/farmer/sign' },
  { name: 'agriculteur-signaler', hash: '/farmer/report' },
  { name: 'volontaire-terrain', hash: '/volunteer' },
  { name: 'volontaire-equipe', hash: '/volunteer/roster' },
  { name: 'volontaire-signaler', hash: '/volunteer/report' },
  { name: 'conducteur-terrain', hash: '/driver' },
]

const LABEL: Record<string, string> = { farmer: 'חקלאי', volunteer: 'מתנדב', driver: 'נהג' }
const ROLE_OF = (hash: string) => (hash.startsWith('/farmer') ? 'farmer' : hash.startsWith('/volunteer') ? 'volunteer' : hash.startsWith('/driver') ? 'driver' : 'coordinator')

export interface MobileMeasure {
  name: string
  hash: string
  landed: string
  docOverflow: number
  scrollers: string[]
  outside: string[]
  tables: number
}

export async function measure(page: Page): Promise<Omit<MobileMeasure, 'name' | 'hash' | 'landed'>> {
  return page.evaluate(() => {
    const W = window.innerWidth
    const desc = (e: Element) => {
      const h = e as HTMLElement
      const id = h.getAttribute('data-testid') || h.getAttribute('aria-label') || h.id
      const txt = (h.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)
      return `${h.tagName.toLowerCase()}${id ? `[${id}]` : ''}${txt ? ` « ${txt} »` : ''}`
    }
    const visible = (e: Element) => {
      const s = getComputedStyle(e)
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
      const b = e.getBoundingClientRect()
      return b.width > 0 && b.height > 0
    }
    const inMap = (e: Element) => !!e.closest('.maplibregl-map, [data-map-canvas], canvas')
    const scrollers: string[] = []
    const all = [...document.querySelectorAll('body *')]
    for (const e of all) {
      if (inMap(e) || !visible(e)) continue
      const s = getComputedStyle(e)
      if (!['auto', 'scroll'].includes(s.overflowX)) continue
      /* ★★ BC (2026-10-12) — L'EXCEPTION DE BA EST RETIRÉE. Les rangées
         `.one-line-row` (filtres et statuts des fermes) ne s'affichent plus
         sous 48 rem : la forme compacte (feuille de filtres, déclencheur des
         statuts) les remplace. La porte est revenue à sa forme stricte : AUCUN
         conteneur ne défile de côté. */
      if (e.scrollWidth > e.clientWidth + 2) scrollers.push(`${desc(e)} (${e.scrollWidth}/${e.clientWidth})`)
    }
    const outside: string[] = []
    for (const e of all) {
      if (inMap(e) || !visible(e)) continue
      if (e.children.length > 0 && !(e as HTMLElement).innerText) continue
      const b = e.getBoundingClientRect()
      if (b.right <= W + 1 && b.left >= -1) continue
      // Rogné par un ancêtre (overflow hidden/clip/auto) ? Alors ce n'est pas l'écran qui déborde.
      let p = e.parentElement
      let clipped = false
      while (p && p !== document.body) {
        const ps = getComputedStyle(p)
        if (ps.overflowX !== 'visible') {
          const pb = p.getBoundingClientRect()
          if (pb.right <= W + 1 && pb.left >= -1) {
            clipped = true
            break
          }
        }
        if (ps.position === 'fixed' && (ps.transform !== 'none' || p.getAttribute('aria-hidden') === 'true')) {
          clipped = true // tiroir hors écran
          break
        }
        p = p.parentElement
      }
      if (clipped) continue
      const s = getComputedStyle(e)
      if (s.position === 'fixed' && s.transform !== 'none') continue
      if ((e as HTMLElement).innerText?.trim() || e.tagName === 'INPUT' || e.tagName === 'BUTTON') outside.push(`${desc(e)} [${Math.round(b.left)}…${Math.round(b.right)}]`)
    }
    const tables = [...document.querySelectorAll('table')].filter(visible).length
    return {
      docOverflow: Math.max(0, document.documentElement.scrollWidth - W),
      scrollers: [...new Set(scrollers)].slice(0, 12),
      outside: [...new Set(outside)].slice(0, 12),
      tables,
    }
  })
}

const APP = await base()
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const results: MobileMeasure[] = []
let failed = 0
for (const s of SCREENS) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 874 }, hasTouch: true, isMobile: false, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  try {
    const role = ROLE_OF(s.hash)
    if (role !== 'coordinator') {
      // Le jumeau : on entre sous le rôle de l'écran par le sélecteur d'identité.
      await page.goto(`${APP}/?ay=${Date.now()}#/`, { waitUntil: 'load' })
      await page.waitForTimeout(1200)
      await page.locator('.card').filter({ hasText: LABEL[role] }).locator('button').first().click()
      await page.waitForTimeout(800)
      await page.evaluate((h) => {
        window.location.hash = `#${h}`
      }, s.hash)
    } else await page.goto(`${APP}/?ay=${Date.now()}#${s.hash}`, { waitUntil: 'load' })
    await page.waitForTimeout(2600)
    if (s.act === 'list') await page.locator('[data-testid="map-mode-hidden"]').click().catch(() => undefined)
    await page.waitForTimeout(600)
    const landed = await page.evaluate(() => window.location.hash.replace(/^#/, '').split('?')[0])
    const m = await measure(page)
    results.push({ name: s.name, hash: s.hash, landed, ...m })
    const bad = m.docOverflow > 0 || m.scrollers.length > 0 || m.outside.length > 0
    if (bad) failed++
    console.log(`  ${bad ? 'FAIL' : 'PASS'}  A358 ${s.name.padEnd(24)} ${s.hash}${landed !== s.hash.split('?')[0] ? ` → ${landed}` : ''}  déborde ${m.docOverflow}px · défile ${m.scrollers.length} · hors écran ${m.outside.length} · tableaux ${m.tables}`)
    for (const x of m.scrollers) console.log(`          ↔ ${x}`)
    for (const x of m.outside) console.log(`          ⇥ ${x}`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${s.name}-${WIDTH}.png`, fullPage: false })
  } catch (e) {
    failed++
    console.log(`  FAIL  A358 ${s.name} — ${(e as Error).message.split('\n')[0]}`)
  }
  await ctx.close()
}
writeFileSync(OUT, JSON.stringify({ app: APP, width: WIDTH, at: new Date().toISOString(), results }, null, 2))
await browser.close()
serve?.kill()
console.log(`\n  ${results.length - failed} PASS, ${failed} FAIL  (${SCREENS.length} écrans à ${WIDTH} px) → ${OUT}`)
process.exit(failed === 0 ? 0 : 1)
