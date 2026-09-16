import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AL5 — LA REVUE DE FINITION : NEUF ÉCRANS, TROIS LARGEURS, CLAIR ET SOMBRE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run alcaptures
 *   BASE_URL=http://localhost:5311 bun run alcaptures
 *
 * ★★ DEUX CHOSES À LA FOIS, ET LA SECONDE EST LA RAISON DE LA PREMIÈRE.
 *
 *    1. LES IMAGES. Cinquante-quatre captures du DÉPLOYÉ, que je regarde
 *       ensuite une par une : densité, RTL, texte coupé, recouvrement.
 *    2. LA SONDE. Les trois accidents que ce projet répète — une vignette
 *       poussée hors écran (AC, AD), le « + » flottant posé sur une cible
 *       (AA, AC), un en-tête épinglé recouvrant du contenu AU REPOS (Z1bis) —
 *       ne se voient pas dans une capture quand ils sont d'un pixel. Ils se
 *       mesurent en RECTANGLES, ce qui est la seule question qu'on puisse
 *       poser à deux boîtes opaques (AA6.2).
 *
 * ⚠️ ET LA SONDE NE REMPLACE PAS L'ŒIL. Elle ne voit pas une couleur au mauvais
 *    endroit, une phrase qui se coupe, un rythme cassé. Les deux, ou rien.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(/\/$/, '')
const OUT = process.env.OUT ?? 'docs/screenshots/alpass/deployed'

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
] as const
const THEMES = ['light', 'dark'] as const

/** Les neuf écrans du PO, ceux que `pills` recense depuis AA1. */
const SCREENS = [
  { name: 'dashboard', hash: '#/coordinator' },
  { name: 'farms', hash: '#/coordinator/farms' },
  { name: 'volunteers', hash: '#/coordinator/volunteers' },
  { name: 'drivers', hash: '#/coordinator/drivers' },
  { name: 'missions', hash: '#/coordinator/missions' },
  { name: 'incidents', hash: '#/coordinator/incidents' },
  { name: 'route', hash: '#/coordinator/route' },
  { name: 'agenda', hash: '#/coordinator/agenda' },
  { name: 'settings', hash: '#/coordinator/settings' },
] as const

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

async function goto(page: Page, url: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: attempt === 1 ? 'load' : 'domcontentloaded' })
      return
    } catch (error) {
      if (attempt >= 3) throw error
      await new Promise((r) => setTimeout(r, 6000 * attempt))
    }
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA SONDE DES TROIS ACCIDENTS, AU REPOS (page en haut, rien de touché).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ « AU REPOS » est la moitié de la mesure. Z1bis : un en-tête épinglé qui
 *   recouvre du contenu APRÈS un défilement le fait exprès ; celui qui le
 *   recouvre à l'arrêt est un défaut.
 *
 * ★ « UNE CIBLE » est un élément que le doigt peut atteindre — un bouton, un
 *   lien, un champ, une vignette cliquable — et pas n'importe quel pixel.
 *   Un flottant posé sur un paragraphe n'est pas l'accident d'AA/AC.
 */
async function restProbe(page: Page) {
  return await page.evaluate(() => {
    const seen = (el: Element): boolean => {
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') return false
      if (Number(cs.opacity) === 0) return false
      const r = el.getBoundingClientRect()
      return r.width > 4 && r.height > 4
    }
    const idOf = (el: Element): string =>
      el.getAttribute('data-testid') ??
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/)[0]}` : ''}`

    /* Ce qui FLOTTE : position fixed, visible, pas la page entière. */
    const floating = Array.from(document.querySelectorAll('body *')).filter((el) => {
      if (getComputedStyle(el).position !== 'fixed') return false
      if (!seen(el)) return false
      const b = el.getBoundingClientRect()
      return b.width < innerWidth * 0.98 || b.height < innerHeight * 0.5
    })

    /* CE QUI SE TOUCHE. */
    const targets = Array.from(
      document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [data-testid^="kpi-"], .tile-interactive, .card-interactive'),
    ).filter(seen)

    const covered: Array<{ target: string; by: string; area: number }> = []
    for (const t of targets) {
      const r = t.getBoundingClientRect()
      if (r.bottom < 0 || r.top > innerHeight) continue
      for (const f of floating) {
        if (f.contains(t) || t.contains(f)) continue
        const b = f.getBoundingClientRect()
        const ox = Math.min(r.right, b.right) - Math.max(r.left, b.left)
        const oy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)
        if (ox <= 0 || oy <= 0) continue
        /**
         * ⚠️ LE POINT DÉCIDE, PAS LE RECTANGLE. Deux boîtes qui se croisent ne
         *    se recouvrent pas forcément : le flottant peut être SOUS la cible
         *    dans l'ordre de peinture. `elementFromPoint` au centre de la
         *    surface commune dit qui reçoit le doigt — c'est la question.
         */
        const cx = (Math.max(r.left, b.left) + Math.min(r.right, b.right)) / 2
        const cy = (Math.max(r.top, b.top) + Math.min(r.bottom, b.bottom)) / 2
        const hit = document.elementFromPoint(cx, cy)
        if (hit && (f === hit || f.contains(hit))) {
          covered.push({ target: idOf(t), by: idOf(f), area: Math.round(ox * oy) })
        }
      }
    }

    /* UNE VIGNETTE POUSSÉE HORS ÉCRAN : la bande des files, au repos. */
    const strip = document.querySelector('[data-testid="farms-queues"], [data-testid="queue-strip"], .scroll-row')
    const chips = strip
      ? Array.from(strip.querySelectorAll('[data-testid^="farms-"], [data-testid^="queue-"]'))
          .filter(seen)
          .map((el) => {
            const r = el.getBoundingClientRect()
            return {
              id: idOf(el),
              offLeft: Math.round(Math.max(0, -r.left)),
              offRight: Math.round(Math.max(0, r.right - innerWidth)),
            }
          })
      : []

    /* DU TEXTE COUPÉ : un élément dont le contenu déborde de sa propre boîte. */
    const clipped = Array.from(document.querySelectorAll('h1, h2, h3, .chip, .label, button, .text-caption'))
      .filter(seen)
      .filter((el) => {
        const cs = getComputedStyle(el)
        if (cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis') return false
        return el.scrollWidth > el.clientWidth + 2 && (el.textContent ?? '').trim().length > 0
      })
      .map((el) => `${idOf(el)}(${el.scrollWidth}>${el.clientWidth})`)

    /* DES CIBLES TROP PETITES : moins de 44 px dans l'une ou l'autre direction. */
    const small = targets
      .filter((el) => {
        if (el.closest('[data-testid="devbar"], [data-testid="devbar-panel"]')) return false
        const r = el.getBoundingClientRect()
        if (r.bottom < 0 || r.top > innerHeight) return false
        /* La zone tactile peut dépasser le dessin : `::before` compte. */
        const before = getComputedStyle(el, '::before')
        const grow = before.content !== 'none' && before.position === 'absolute' ? 12 : 0
        return r.height + grow < 43.5 || r.width + grow < 43.5
      })
      .map((el) => {
        const r = el.getBoundingClientRect()
        return `${idOf(el)} ${Math.round(r.width)}×${Math.round(r.height)}`
      })

    return {
      docScrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      covered,
      chips,
      clipped,
      small,
    }
  })
}

let browser: Browser | null = null
let taken = 0

console.log('')
console.log('  AL5 — LA REVUE DE FINITION SUR LE DÉPLOYÉ')
console.log('  =========================================')
console.log(`  ${BASE}`)

try {
  browser = await chromium.launch()
  await Bun.$`mkdir -p ${OUT}`.quiet()

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'he-IL',
        hasTouch: true,
        colorScheme: theme,
      })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (e) => { if (!String(e).includes('ResizeObserver loop')) errors.push(String(e)) })

      await goto(page, `${BASE}/#/coordinator`)
      await page.waitForTimeout(6000)

      for (const screen of SCREENS) {
        await goto(page, `${BASE}/${screen.hash}`)
        await page.waitForTimeout(screen.name === 'route' || screen.name === 'farms' ? 6000 : 4000)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(500)

        const file = `${OUT}/${screen.name}-${vp.name}-${theme}.png`
        await page.screenshot({ path: file })
        taken++

        const probe = await restProbe(page)
        const tag = `${screen.name} · ${vp.name} · ${theme}`
        check(`AL5 · ${tag} · aucun défilement horizontal de la page`,
          probe.docScrollW <= probe.clientW + 1, `${probe.docScrollW} vs ${probe.clientW}`)
        check(`AL5 · ${tag} · rien de flottant ne prend le doigt d'une cible AU REPOS`,
          probe.covered.length === 0,
          probe.covered.map((c) => `${c.by} sur ${c.target} (${c.area}px²)`).slice(0, 3).join(' · '))
        check(`AL5 · ${tag} · aucune vignette poussée hors de l'écran`,
          probe.chips.every((c) => c.offLeft === 0 && c.offRight === 0),
          probe.chips.filter((c) => c.offLeft || c.offRight).map((c) => `${c.id} ←${c.offLeft} →${c.offRight}`).join(' · '))
        check(`AL5 · ${tag} · aucun texte coupé dans sa propre boîte`,
          probe.clipped.length === 0, probe.clipped.slice(0, 3).join(' · '))
        check(`AL5 · ${tag} · aucune cible sous 44 px`,
          probe.small.length === 0, probe.small.slice(0, 4).join(' · '))
      }
      check(`AL5 · ${vp.name} · ${theme} · aucune erreur de page`, errors.length === 0, errors.slice(0, 2).join(' | '))
      await context.close()
    }
  }
} finally {
  await browser?.close()
}

console.log('')
console.log(`  ${taken} captures dans ${OUT}`)
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
