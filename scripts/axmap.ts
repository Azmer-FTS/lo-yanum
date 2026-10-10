import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AX — LA CARTE DE CE QUI EST ATTEIGNABLE (A344, A354).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   DIST=dist-ax-before-demo OUT=docs/ax/atteignable-avant.json bun run scripts/axmap.ts
 *   DIST=dist-axdemo         OUT=docs/ax/atteignable-apres.json bun run scripts/axmap.ts
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum/demo OUT=… bun run scripts/axmap.ts
 *
 * Sur le JUMEAU DE DÉMONSTRATION (données factices complètes : fermes,
 * gardes, volontaires, pistes, institutions) — la porte de connexion de
 * l'app réelle ne laisse entrer aucun robot.
 *
 * Pour chaque écran du coordinateur, à 1440 px : les liens internes, les
 * boutons visibles, et le contenu des menus (« ⋯ » et « + ») ouverts un par
 * un. Puis la FERMETURE depuis le tableau de bord : ce qu'on atteint en
 * suivant les liens. `axpass` compare l'avant et l'après.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const DIST = process.env.DIST ?? 'dist-ax-before-demo'
const OUT = process.env.OUT ?? 'docs/ax/atteignable-avant.json'
const PORT = Number(process.env.PORT ?? 5402)

let serve: ReturnType<typeof Bun.spawn> | null = null
async function base(): Promise<string> {
  if (REMOTE) return REMOTE
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

const APP = await base()
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
const page = await ctx.newPage()

/** Une route concrète → sa forme (« farms/f-12 » → « farms/:id »). */
export function shape(hash: string): string {
  const [path] = hash.replace(/^#/, '').split('?')
  return path
    .split('/')
    .map((seg, i, all) => {
      if (i < 2) return seg
      if (['new', 'edit', 'free', 'import', 'regions', 'visit', 'meeting', 'anchors'].includes(seg)) return seg
      const prev = all[i - 1]
      if (prev === 'import') return seg
      return /[0-9]/.test(seg) || seg.length > 14 ? ':id' : seg
    })
    .join('/')
    .replace(/\/$/, '')
}

interface ScreenMap {
  links: string[]
  buttons: string[]
  menus: Record<string, string[]>
}

async function visible(page: Page): Promise<ScreenMap> {
  return page.evaluate(() => {
    const isShown = (e: Element) => {
      const r = (e as HTMLElement).getBoundingClientRect()
      const s = getComputedStyle(e as HTMLElement)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'
    }
    const links = [...document.querySelectorAll('a[href^="#/"]')].filter(isShown).map((a) => a.getAttribute('href') ?? '')
    const buttons = [...document.querySelectorAll('button, [role="tab"], select')]
      .filter(isShown)
      .map((b) => ((b as HTMLElement).getAttribute('aria-label') || (b as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0 && t.length < 60)
    return { links: [...new Set(links)], buttons: [...new Set(buttons)], menus: {} }
  })
}

async function menuItems(page: Page): Promise<Array<{ text: string; href: string | null }>> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] a, [role="menu"] button')]
      .map((m) => ({ text: ((m as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim(), href: m.getAttribute('href') }))
      .filter((m) => m.text.length > 0),
  )
}

async function go(hash: string): Promise<void> {
  await page.goto(`${APP}/?ax=${Date.now()}#${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(2200)
}

// Le jumeau s'ouvre sur le choix d'identité : la session par défaut est celle du coordinateur.
await go('/coordinator')

/** Écrans de liste dont les rangées s'ouvrent par un clic, pas par un lien. */
const PROBES: Record<string, string[]> = {
  '/coordinator/incidents': ['[data-testid="incident-tile-open"]'],
  '/coordinator/missions': ['[data-testid="mission-tile-open"]'],
  '/coordinator/volunteers': ['[data-testid="volunteer-tile-open"]'],
  '/coordinator/drivers': ['[data-testid="driver-tile-open"]'],
}

const seeds = ['/coordinator']
const seen = new Set<string>()
const screens: Record<string, ScreenMap & { route: string }> = {}
const queue = [...seeds]
const LIMIT = 80

while (queue.length && Object.keys(screens).length < LIMIT) {
  const hash = queue.shift()!
  const key = shape(hash)
  if (seen.has(key)) continue
  seen.add(key)
  if (!key.startsWith('/coordinator')) continue
  await go(hash)
  const landed = shape(new URL(page.url()).hash)
  const map = await visible(page)
  // Les menus : « ⋯ » de la page et « + ».
  const toggles = page.locator('[aria-haspopup="menu"]')
  const n = await toggles.count()
  for (let i = 0; i < n; i++) {
    const tg = toggles.nth(i)
    if (!(await tg.isVisible().catch(() => false))) continue
    const label = ((await tg.getAttribute('aria-label')) || (await tg.innerText().catch(() => '')) || `menu-${i}`).replace(/\s+/g, ' ').trim()
    await tg.click({ timeout: 2000 }).catch(() => undefined)
    await page.waitForTimeout(350)
    const items = await menuItems(page)
    await page.keyboard.press('Escape').catch(() => undefined)
    await page.waitForTimeout(200)
    const out: string[] = []
    // Chaque entrée est CLIQUÉE (la plupart naviguent par `navigate`, pas par un lien).
    for (let k = 0; k < items.length; k++) {
      const m = items[k]
      if (m.href?.startsWith('#/')) {
        out.push(`${m.text} → ${m.href}`)
        map.links.push(m.href)
        continue
      }
      await go(hash)
      const again = page.locator('[aria-haspopup="menu"]').nth(i)
      await again.click({ timeout: 2000 }).catch(() => undefined)
      await page.waitForTimeout(350)
      const item = page.locator('[role="menu"] [role="menuitem"], [role="menu"] a, [role="menu"] button').filter({ hasText: m.text }).first()
      const before = page.url()
      await item.click({ timeout: 2000 }).catch(() => undefined)
      await page.waitForTimeout(700)
      const after = page.url()
      if (after !== before) {
        const h = new URL(after).hash
        out.push(`${m.text} → ${h}`)
        map.links.push(h)
      } else out.push(`${m.text} (sur place)`)
    }
    map.menus[label] = out
    await go(hash)
  }
  // Les rangées qui ouvrent une fiche par un clic (tuiles, lignes de tableau).
  for (const sel of PROBES[key] ?? []) {
    await go(hash)
    const el = page.locator(sel).first()
    if (!(await el.isVisible().catch(() => false))) continue
    const before = page.url()
    await el.click({ timeout: 2000 }).catch(() => undefined)
    await page.waitForTimeout(800)
    if (page.url() !== before) map.links.push(new URL(page.url()).hash)
  }
  /* ★★ AX10 — l'écran d'ajout mène aux formulaires PAR ÉTAPES (un nom, puis
     le type) : la sonde les parcourt, sinon elle ne verrait pas qu'ils restent
     atteignables. Inerte sur le build d'avant (pas de `add-name`). */
  if (key === '/coordinator/add' && (await page.locator('[data-testid="add-name"]').count()) > 0) {
    const flows: Array<{ type: string; go: string; pick?: boolean }> = [
      { type: 'farmFile', go: '[data-testid="add-farm-go"]' },
      { type: 'driver', go: '[data-testid="add-driver-go"]' },
      { type: 'volunteer', go: '[data-testid="add-volunteer-full"]', pick: true },
    ]
    for (const f of flows) {
      await go('/coordinator/add')
      await page.locator('[data-testid="add-name"]').fill('בדיקת סונדה')
      await page.locator(`[data-testid="add-kind-${f.type}"]`).click({ timeout: 2000 }).catch(() => undefined)
      if (f.pick) {
        const sel = page.locator('[data-testid="add-institution-select"]')
        const v = await sel.locator('option').nth(1).getAttribute('value').catch(() => null)
        if (v) await sel.selectOption(v)
      }
      await page.waitForTimeout(300)
      const before = page.url()
      await page.locator(f.go).first().click({ timeout: 2000 }).catch(() => undefined)
      await page.waitForTimeout(800)
      if (page.url() !== before) map.links.push(new URL(page.url()).hash)
      else map.links.push(`(échec : ${f.type})`)
    }
  }
  screens[key] = { route: landed, ...map }
  for (const l of map.links) {
    const s = shape(l)
    if (!seen.has(s) && s.startsWith('/coordinator')) queue.push(l.replace(/^#/, ''))
  }
  console.log(`  ${key.padEnd(48)} → ${landed.padEnd(40)} ${map.links.length} liens · ${map.buttons.length} boutons · ${Object.keys(map.menus).length} menus`)
}

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(OUT, JSON.stringify({ app: APP, at: new Date().toISOString(), reachable: Object.keys(screens).sort(), screens }, null, 2))
console.log(`\n  ${Object.keys(screens).length} écrans atteignables depuis le tableau de bord → ${OUT}`)
await browser.close()
serve?.kill()
