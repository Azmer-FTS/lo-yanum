import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { mkdirSync } from 'node:fs'

import { SYNCED_SETTING_KEYS } from '../src/ui/settings/sync'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ A185 · A186 — L'ÉCRAN DES RÉGLAGES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aisettings            (SKIP_BUILD=1 pour réutiliser dist-aipass)
 *
 * A185 — la barre des sections reste épinglée en haut, À L'ÉCRAN et au
 *   toucher, après un défilement jusqu'en bas, aux trois viewports ; elle
 *   indique la section en cours au DÉFILEMENT (pas seulement au clic) ; un
 *   appui y mène.
 * A186 — toutes les sections dépliées, aucun titre de section, aucun champ
 *   (`id`, `data-testid` de contrôle) et aucun libellé n'apparaît deux fois ;
 *   et ce qu'AI7 a retiré est bien absent.
 */
const OUT = process.env.OUT ?? 'dist-aipass'
const PORT = Number(process.env.PORT ?? 5343)
const SHOTS = 'docs/screenshots/aipass/local'
mkdirSync(SHOTS, { recursive: true })

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
const REMOTE = (process.env.BASE_URL ?? '').replace(/\/$/, '')
if (!REMOTE && process.env.SKIP_BUILD !== '1') {
  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], { env, stdout: 'ignore', stderr: 'pipe' })
  if ((await build.exited) !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error('vite build failed')
  }
}
const serve = REMOTE
  ? null
  : Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], {
      env,
      stdout: 'ignore',
      stderr: 'ignore',
    })
const base = REMOTE || `http://localhost:${PORT}`
if (!REMOTE) {
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

const VIEWPORTS = [
  ['iphone', { width: 402, height: 874 }],
  ['ipad', { width: 1032, height: 1376 }],
  ['ipad-ls', { width: 1376, height: 1032 }],
] as const

const GROUPS = ['profile', 'target', 'thresholds', 'templates', 'map', 'display', 'data']

/** Fait défiler le conteneur réel de la page (la fenêtre, ou la colonne). */
async function scrollTo(page: Page, where: 'bottom' | 'top' | number): Promise<void> {
  await page.evaluate((w) => {
    const nav = document.querySelector('[data-testid="settings-toc"]') as HTMLElement
    let node: HTMLElement | null = nav.parentElement
    let scroller: HTMLElement | null = null
    while (node && node !== document.body) {
      const s = getComputedStyle(node)
      if (/(auto|scroll)/.test(s.overflowY) && node.scrollHeight > node.clientHeight) {
        scroller = node
        break
      }
      node = node.parentElement
    }
    const target = w === 'bottom' ? 1e9 : w === 'top' ? 0 : w
    if (scroller) scroller.scrollTop = target
    else window.scrollTo(0, target)
  }, where)
  await page.waitForTimeout(450)
}

const browser = await chromium.launch()
try {
  console.log('')
  console.log('  A185 — la barre des sections, épinglée, section en cours')
  console.log('  ========================================================')
  for (const [name, viewport] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport })
    const page = await ctx.newPage()
    await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="settings-toc"]', { timeout: 20_000 })
    await page.waitForTimeout(1500)

    await scrollTo(page, 'bottom')
    const pinned = await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="settings-toc"]') as HTMLElement
      const r = nav.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), onTop: hit !== null && nav.contains(hit), vh: innerHeight }
    })
    check(
      `A185 · ${name} · en bas de page, la barre est toujours en haut de l’écran, et au toucher`,
      pinned.top >= 0 && pinned.top <= 140 && pinned.onTop,
      `top ${pinned.top}, bottom ${pinned.bottom}, touchable ${pinned.onTop}`,
    )
    const atEnd = await page.getAttribute('[data-testid="settings-toc"]', 'data-active')
    check(`A185 · ${name} · en bas de page, la section en cours est « data »`, atEnd === 'data', String(atEnd))

    await scrollTo(page, 'top')
    const atTop = await page.getAttribute('[data-testid="settings-toc"]', 'data-active')
    check(`A185 · ${name} · en haut, la section en cours est « profile »`, atTop === 'profile', String(atTop))

    /* Au défilement, sans toucher la barre : on amène l'en-tête « map » juste
       sous la barre, à la main. */
    await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="settings-toc"]') as HTMLElement
      const heading = document.getElementById('settings-group-map') as HTMLElement
      heading.scrollIntoView({ block: 'start' })
      void nav
    })
    await page.waitForTimeout(500)
    const byScroll = await page.getAttribute('[data-testid="settings-toc"]', 'data-active')
    check(`A185 · ${name} · au DÉFILEMENT seul, la barre suit (« map »)`, byScroll === 'map', String(byScroll))

    await page.locator('[data-testid="settings-toc-thresholds"]').click()
    await page.waitForTimeout(1200)
    const byClick = await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="settings-toc"]') as HTMLElement
      const h = document.getElementById('settings-group-thresholds') as HTMLElement
      return {
        active: nav.getAttribute('data-active'),
        current: nav.querySelector('[aria-current="true"]')?.getAttribute('data-testid'),
        headingTop: Math.round(h.getBoundingClientRect().top),
        navBottom: Math.round(nav.getBoundingClientRect().bottom),
      }
    })
    check(
      `A185 · ${name} · un appui mène à la section, SOUS la barre, et la marque`,
      byClick.active === 'thresholds' &&
        byClick.current === 'settings-toc-thresholds' &&
        byClick.headingTop >= byClick.navBottom - 2 &&
        byClick.headingTop <= byClick.navBottom + 60,
      JSON.stringify(byClick),
    )
    if (name === 'iphone') await page.screenshot({ path: `${SHOTS}/a185-reglages-epingles-${name}.png` })
    await ctx.close()
  }

  console.log('')
  console.log('  A186 — aucun réglage en double')
  console.log('  ==============================')
  {
    const ctx = await browser.newContext({ viewport: { width: 1032, height: 1376 } })
    const page = await ctx.newPage()
    await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="settings-toc"]', { timeout: 20_000 })
    await page.waitForTimeout(1500)
    // Tout déplier.
    for (let pass = 0; pass < 3; pass++) {
      const folded = page.locator('main [data-open="0"] > div > [data-testid^="block-"], [data-open="0"] [data-testid^="block-settings-"]')
      const n = await folded.count()
      for (let i = n - 1; i >= 0; i--) await folded.nth(i).click().catch(() => undefined)
      await page.waitForTimeout(400)
    }
    const inventory = await page.evaluate((groups) => {
      const root = document.querySelector('[data-testid="settings-toc"]')?.parentElement as HTMLElement
      const sections = [...root.querySelectorAll('section[data-block]')] as HTMLElement[]
      const titles = sections.map((s) => (s.querySelector('[data-testid^="block-"]')?.textContent ?? '').replace(/\s+/g, ' ').trim().split(' · ')[0])
      const blocks = sections.map((s) => s.getAttribute('data-block') ?? '')
      const controls = [...root.querySelectorAll('input, select, textarea, [role="group"][data-testid]')]
        .map((el) => el.getAttribute('data-testid') ?? el.id)
        .filter(Boolean)
      const labels = [...root.querySelectorAll('label')].map((l) => (l.textContent ?? '').trim()).filter(Boolean)
      const groupOf: Record<string, string> = {}
      let group = ''
      for (const node of root.querySelectorAll('[data-settings-group], section[data-block]')) {
        const g = node.getAttribute('data-settings-group')
        if (g) group = g
        else groupOf[node.getAttribute('data-block') ?? ''] = group
      }
      return { titles, blocks, controls, labels, groupOf, groups }
    }, GROUPS)
    const dups = (list: string[]) => [...new Set(list.filter((v, i) => list.indexOf(v) !== i))]
    console.log(`         ${inventory.blocks.length} sections, ${inventory.controls.length} contrôles, ${inventory.labels.length} libellés`)
    for (const g of GROUPS) {
      const inG = Object.entries(inventory.groupOf).filter(([, v]) => v === g).map(([k]) => k)
      console.log(`         ${g.padEnd(11)} ${inG.join(' · ')}`)
    }
    check('A186 · aucun titre de section en double', dups(inventory.titles).length === 0, dups(inventory.titles).join(' | '))
    check('A186 · aucune section en double', dups(inventory.blocks).length === 0, dups(inventory.blocks).join(' | '))
    check('A186 · aucun champ en double', dups(inventory.controls).length === 0, dups(inventory.controls).join(' | '))
    check('A186 · aucun libellé de champ en double', dups(inventory.labels).length === 0, dups(inventory.labels).join(' | '))
    check('A186 · le thème n’est réglable qu’à un endroit', (await page.locator('[data-testid="settings-theme"]').count()) === 1)

    // Ce qu'AI7 et AI8 ont retiré.
    const gone = ['settings-connection', 'settings-demo', 'settings-test-data']
    for (const b of gone) {
      check(`A186 · retiré : la section « ${b} »`, !inventory.blocks.includes(b))
    }
    check('A186 · l’état du réseau vit dans « חיבור וסנכרון »', (await page.locator('[data-block="settings-sync"] [data-testid="settings-connection"]').count()) === 1)
    check('A186 · l’adresse des rapports est rangée dans le profil', inventory.groupOf['settings-report'] === 'profile', inventory.groupOf['settings-report'])
    check('A186 · retirée de la synchro : la clé morte `lo-yanum:reminders`', !SYNCED_SETTING_KEYS.includes('lo-yanum:reminders'))
    await page.screenshot({ path: `${SHOTS}/a186-reglages-deplies.png`, fullPage: true })
    await ctx.close()
  }
} finally {
  await browser.close()
  serve?.kill()
}

console.log('')
console.log(`  ${passed} PASS · ${failed} FAIL`)
console.log('')
process.exit(failed === 0 ? 0 : 1)
