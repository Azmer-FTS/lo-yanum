import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

import { LIST_SCREENS, measureHeader } from './bcmeasure'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BC — LA PORTE AU RENDU : TÉLÉPHONE (390 px) ET TABLETTE (820 · 1180 px).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bcmobile                                                     # jumeau local (dist-bcdemo)
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run bcmobile  # le jumeau DÉPLOYÉ
 *   SKIP_BUILD=1 · ONLY=phone|tablet · SHOTS=0 (pas de captures)
 *
 * Sur le JUMEAU (données de démonstration complètes ; aucun nom réel).
 *
 *   A418  l'en-tête : au repos, au moins les TROIS QUARTS de l'écran restent
 *         aux données ; après défilement, il ne reste qu'une barre fine
 *   A419  les cibles : rien de touchable sous 44 × 44 px (zone tactile, `::before`
 *         compris), et au moins 8 px entre deux cibles voisines
 *   A420  aucun défilement de côté (page ni conteneur), sous 48 rem
 *   A421  la feuille de filtres : « סינון » porte le nombre de filtres actifs,
 *         ouvre une feuille aux trois quarts de l'écran, familles lisibles avec
 *         leurs comptes ; cocher applique, une pastille apparaît avec sa croix,
 *         la croix l'enlève ; « הצג N תוצאות » dit le vrai nombre et referme
 *   A422  le déclencheur des statuts dit le statut courant et ouvre la feuille
 *         sur leur section
 *   A423  contacts à traiter : une pastille de statut (plus de rangée de quatre
 *         boutons), un choix compact au toucher, le balayage ; deux étages de
 *         texte au plus, plus la photo
 *   A424  carte de couverture : au téléphone la bulle est une feuille ancrée en
 *         bas qu'on réduit / rouvre ; la réduire garde la sélection ; ‹ ›
 *         passent à l'institution voisine sans rouvrir la bulle ; en tablette
 *         la bulle est rangée au coin (plus jamais posée sur l'institution) ;
 *         toucher le fond de la carte désélectionne
 *   A426  les réglages : la phrase du thème (appliqué, et d'où vient la
 *         décision) et la version qui tourne, en petit sous le titre
 *   A425  au téléphone, la liste (le tableau étroit : carte masquée → tableau,
 *         règle AZ2 du PO ; la grille des gardes) garde la lisibilité des
 *         vignettes d'AZ2 : le nom ≥ 18 px, ce qui situe ≥ 16 px, la localité
 *         de repère ≥ 13,5 px
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const DIST = process.env.DIST ?? 'dist-bcdemo'
const PORT = Number(process.env.PORT ?? 5434)
const ONLY = process.env.ONLY ?? ''
const SHOTS = process.env.SHOTS !== '0'
const SHOT_DIR = `docs/screenshots/bc/${REMOTE ? 'deployed' : 'local'}`
const OUT = process.env.OUT ?? `docs/bc/bcmobile-${REMOTE ? 'deploye' : 'local'}.json`
mkdirSync(SHOT_DIR, { recursive: true })
mkdirSync('docs/bc', { recursive: true })

let passed = 0
let failed = 0
const report: Array<Record<string, unknown>> = []
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log(`\n  ${title}\n  ${'-'.repeat(title.length)}`)
}

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

const VIEWPORTS = [
  { tier: 'phone', label: '390', width: 390, height: 844 },
  { tier: 'tablet', label: '820', width: 820, height: 1180 },
  { tier: 'tablet', label: '1180', width: 1180, height: 820 },
].filter((v) => !ONLY || v.tier === ONLY)

async function open(browser: Browser, vp: (typeof VIEWPORTS)[number], hash: string, storage: Record<string, string> = {}): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: vp.width < 768, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await ctx.addInitScript((s) => {
    try {
      localStorage.setItem('lo-yanum:theme:coordinator', 'light')
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v)
    } catch {
      /* rien */
    }
  }, storage)
  const page = await ctx.newPage()
  page.setDefaultTimeout(9000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${APP}/?bc=${Date.now()}#${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  return { page, errors, close: () => ctx.close() }
}

/** Toutes les cibles visibles : leur zone tactile (`::before` compris). */
async function targets(page: Page): Promise<{ small: string[]; tight: string[]; count: number }> {
  return page.evaluate(() => {
    const SEL = 'a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=checkbox], [role^=menuitem], summary'
    const H = innerHeight
    const W = innerWidth
    const idOf = (el: Element) => {
      const t = el.getAttribute('data-testid') || el.getAttribute('aria-label') || (el as HTMLElement).innerText?.trim().slice(0, 24) || el.tagName.toLowerCase()
      return t.replace(/\s+/g, ' ')
    }
    const visible = (el: Element) => {
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0 || s.pointerEvents === 'none') return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W
    }
    /* Une case à cocher DANS son libellé se vise par le libellé entier (c'est
       le libellé qui fait 44 px, et c'est lui que le doigt touche). */
    const aimed = (el: Element): Element => {
      if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes((el as HTMLInputElement).type)) return el.closest('label') ?? el
      return el
    }
    const box = (el0: Element) => {
      const el = aimed(el0)
      const r = el.getBoundingClientRect()
      const b = getComputedStyle(el, '::before')
      let { left, right, top, bottom } = r
      if (b.content !== 'none' && b.position === 'absolute') {
        const h = parseFloat(b.height)
        const w = parseFloat(b.width)
        if (Number.isFinite(h) && h > r.height) {
          const cy = (r.top + r.bottom) / 2
          top = cy - h / 2
          bottom = cy + h / 2
        }
        if (Number.isFinite(w) && w > r.width) {
          const cx = (r.left + r.right) / 2
          left = cx - w / 2
          right = cx + w / 2
        }
      }
      return { left, right, top, bottom, w: right - left, h: bottom - top }
    }
    /* Exclus, nommés : l'échafaudage du jumeau, le crédit légal de MapLibre, les
       contrôles de la carte elle-même (déplacés au doigt, pas visés), un champ
       caché derrière un autre (pavé numérique). */
    const all = [...document.querySelectorAll(SEL)].filter((el) => {
      if (!visible(el)) return false
      if (el.closest('[data-testid^="devbar"], .maplibregl-ctrl-attrib, .maplibregl-canvas-container')) return false
      if (el.closest('[aria-hidden="true"]')) return false
      /* Un élément couvert (sous une feuille modale, sous la barre collante) n'est pas une cible. */
      const b = box(el)
      const cx = Math.min(W - 1, Math.max(0, (b.left + b.right) / 2))
      const cy = Math.min(H - 1, Math.max(0, (b.top + b.bottom) / 2))
      const hit = document.elementFromPoint(cx, cy)
      return !!hit && (hit === el || el.contains(hit) || hit.contains(el))
    })
    const small = all.filter((el) => {
      const b = box(el)
      return b.w < 43.5 || b.h < 43.5
    }).map((el) => `${idOf(el)} ${Math.round(box(el).w)}×${Math.round(box(el).h)}`)
    const tight: string[] = []
    /* ⛔ NOMMÉS, AVEC LEUR RAISON :
       · une RANGÉE pleine largeur (≥ 80 % de l'écran, ≥ 56 px de haut) — les
         lignes d'une liste se touchent dans toutes les applications (Mail,
         Réglages) : le doigt vise une ligne de 64 px, pas une cible voisine ;
       · deux COUCHES différentes — la pilule de mode et le « + » flottent
         au-dessus du contenu qui défile dessous : leur distance à une ligne
         change à chaque pixel de défilement, ce n'est pas un voisinage. */
    const isRow = (b: { w: number; h: number }) => b.w >= innerWidth * 0.8 && b.h >= 56
    const layerOf = (el: Element): Element | null => {
      for (let n: Element | null = el; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return n
      return null
    }
    const boxes = all.map((el) => ({ el, b: box(el), layer: layerOf(el) }))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const c = boxes[j]
        if (a.el.contains(c.el) || c.el.contains(a.el)) continue
        if (aimed(a.el) === aimed(c.el) || aimed(a.el).contains(c.el) || aimed(c.el).contains(a.el)) continue
        if (isRow(a.b) || isRow(c.b)) continue
        if (a.layer !== c.layer) continue
        const overlapY = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top)
        const overlapX = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left)
        let gap = Infinity
        if (overlapY > 4) gap = Math.max(a.b.left, c.b.left) - Math.min(a.b.right, c.b.right)
        else if (overlapX > 4) gap = Math.max(a.b.top, c.b.top) - Math.min(a.b.bottom, c.b.bottom)
        if (gap < 7.5) tight.push(`${idOf(a.el)} ↔ ${idOf(c.el)} ${gap === Infinity ? '∞' : Math.round(gap)}px`)
      }
    }
    return { small: [...new Set(small)].slice(0, 14), tight: [...new Set(tight)].slice(0, 14), count: all.length }
  })
}

async function sideways(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const W = innerWidth
    const out: string[] = []
    if (document.documentElement.scrollWidth > W + 1) out.push(`page ${document.documentElement.scrollWidth}/${W}`)
    for (const e of document.querySelectorAll('body *')) {
      if (e.closest('.maplibregl-map, canvas')) continue
      const s = getComputedStyle(e)
      if (!['auto', 'scroll'].includes(s.overflowX)) continue
      const r = e.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (e.scrollWidth > e.clientWidth + 2) out.push(`${e.getAttribute('data-testid') || e.className.toString().slice(0, 40)} ${e.scrollWidth}/${e.clientWidth}`)
    }
    return out.slice(0, 8)
  })
}

const APP = await base()
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
try {
  for (const vp of VIEWPORTS) {
    section(`${vp.tier === 'phone' ? 'TÉLÉPHONE' : 'TABLETTE'} ${vp.width} × ${vp.height}`)
    for (const s of LIST_SCREENS) {
      const { page, errors, close } = await open(browser, vp, s.hash)
      try {
        /* A418 — l'en-tête. */
        const m = await measureHeader(page)
        const quarter = Math.round(vp.height * 0.25)
        check(`A418 ${vp.label} ${s.name} : au repos ≥ 3/4 de l'écran aux données`, m.rest !== null && m.rest <= quarter, `en-tête ${m.rest} px / ${vp.height} (données ${m.share} %)`)
        check(`A418 ${vp.label} ${s.name} : après défilement, une barre fine`, m.scrolled !== null && m.rest !== null && m.scrolled <= m.rest && m.scrolled <= Math.round(vp.height * 0.18), `${m.scrolled} px`)
        report.push({ viewport: vp.label, screen: s.name, ...m })
        /* A419 — les cibles. */
        const tg = await targets(page)
        check(`A419 ${vp.label} ${s.name} : aucune cible sous 44 px (${tg.count} mesurées)`, tg.small.length === 0, tg.small.join(' · '))
        check(`A419 ${vp.label} ${s.name} : 8 px entre deux cibles voisines`, tg.tight.length === 0, tg.tight.join(' · '))
        /* A420 — de côté. */
        if (vp.tier === 'phone') {
          const sw = await sideways(page)
          check(`A420 ${vp.label} ${s.name} : rien ne défile de côté`, sw.length === 0, sw.join(' · '))
        }
        /* A425 — la lisibilité de la ligne, au téléphone (les gardes : leur grille ;
           les incidents n'étaient pas des cinq listes d'AZ2, leur vignette non plus). */
        if (vp.tier === 'phone' && s.name !== 'incidents') {
          const ty = await page.evaluate(() => {
            const row = document.querySelector('[data-entity-table] tbody tr[data-row-key], .roster-missions.card .roster-row')
            if (!row) return null
            const px = (sel: string) => {
              const el = row.querySelector(sel)
              return el ? parseFloat(getComputedStyle(el).fontSize) : null
            }
            return { title: px('[data-entity-title]'), person: px('[data-entity-person]'), near: px('[data-entity-near]'), sub: px('[data-entity-sub]') }
          })
          check(
            `A425 ${vp.label} ${s.name} : la ligne lisible (nom ≥ 18 px, ce qui situe ≥ 16 px, la localité ≥ 13,5 px)`,
            !!ty && (ty.title ?? 0) >= 18 && (ty.person === null || ty.person >= 16) && (ty.near === null || ty.near >= 13.5) && (ty.sub === null || ty.sub >= 16),
            JSON.stringify(ty),
          )
        }
        if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/a418-${s.name}-${vp.label}.png` })
        /* A421 — la feuille. */
        const btn = page.locator('[data-testid="filter-sheet-open"]').first()
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          const before = Number(await btn.getAttribute('data-count'))
          await btn.click()
          await page.waitForTimeout(450)
          const panel = page.locator('[data-sheet-panel]')
          const ph = (await panel.boundingBox())?.height ?? 0
          check(`A421 ${vp.label} ${s.name} : la feuille occupe les trois quarts de l'écran`, Math.abs(ph - vp.height * 0.75) <= vp.height * 0.03, `${Math.round(ph)} / ${Math.round(vp.height * 0.75)} px`)
          const fam = await page.evaluate(() =>
            [...document.querySelectorAll('[data-sheet-body] [data-family]')].map((sec) => ({
              key: sec.getAttribute('data-family'),
              title: sec.querySelector('h3')?.textContent?.trim() ?? '',
              options: [...sec.querySelectorAll('[role^=menuitem]')].map((b) => ({ text: (b as HTMLElement).innerText.trim(), clipped: (b as HTMLElement).scrollWidth > (b as HTMLElement).clientWidth + 1, disabled: (b as HTMLButtonElement).disabled })),
            })),
          )
          check(`A421 ${vp.label} ${s.name} : chaque famille a un titre et des valeurs lisibles en entier`, fam.length > 0 && fam.every((f) => f.title && f.options.length > 0 && f.options.every((o) => !o.clipped)), fam.map((f) => `${f.title}(${f.options.length})`).join(' · '))
          /* Une clé de traduction brute (« people.col.name ») se LIT, entière : elle
             passait la vérification d'au-dessus. Trouvé par `aykeys` en BC. */
          const raw = fam.flatMap((f) => [f.title, ...f.options.map((o) => o.text)]).filter((x) => /(^|\s)[a-z][a-zA-Z]*(\.[a-zA-Z_]+)+($|\s)/.test(x))
          check(`A421 ${vp.label} ${s.name} : aucune clé de traduction brute dans la feuille`, raw.length === 0, raw.join(' · '))
          /* Cocher la première valeur d'une famille qui filtre (pas le tri, pas un onglet). */
          const target = page.locator('[data-sheet-body] [data-family]:not([data-family="sort"]):not([data-family="time"]):not([data-family="status"]) [role=menuitemcheckbox]:not([disabled]), [data-sheet-body] [data-family="region"] [role=menuitemradio]:not([disabled]), [data-sheet-body] [data-family="severity"] [role=menuitemradio]:not([disabled])').first()
          if ((await target.count()) > 0) {
            await target.click()
            await page.waitForTimeout(350)
            const show = page.locator('[data-testid="filter-sheet-show"]')
            const label = (await show.innerText()).trim()
            await show.click()
            await page.waitForTimeout(450)
            const chips = page.locator('[data-testid="active-filter-chips"] button')
            const after = Number(await page.locator('[data-testid="filter-sheet-open"]').first().getAttribute('data-count'))
            /* ★★ BD 8b — une liste longue est FENÊTRÉE : son nombre de lignes est
               `data-rows` (le DOM n'en pose qu'une fenêtre). */
            const rows = await page.evaluate(() => {
              const v = document.querySelector<HTMLElement>('[data-entity-table][data-virtual]:not([hidden])')
              return v ? Number(v.dataset.rows) : document.querySelectorAll('[data-row-key], .roster-row:not([data-roster-head]), .pair-grid > li').length
            })
            const n = Number((label.match(/\d+/) ?? ['1'])[0])
            check(`A421 ${vp.label} ${s.name} : cocher applique — pastille, compte du bouton, « הצג N »`, (await chips.count()) >= 1 && after === before + 1 && (label.includes('אחת') ? rows === 1 : n === rows || rows >= 20), `pastilles ${await chips.count()} · bouton ${before}→${after} · « ${label} » · lignes ${rows}`)
            if (SHOTS && s.name === 'fermes') await page.screenshot({ path: `${SHOT_DIR}/a421-pastilles-${s.name}-${vp.label}.png` })
            await chips.first().click()
            await page.waitForTimeout(350)
            check(`A421 ${vp.label} ${s.name} : la croix enlève le filtre`, (await page.locator('[data-testid="active-filter-chips"] button').count()) === 0 && Number(await page.locator('[data-testid="filter-sheet-open"]').first().getAttribute('data-count')) === before)
          } else {
            await page.locator('[data-testid="filter-sheet-close"]').click()
            await page.waitForTimeout(300)
          }
          check(`A421 ${vp.label} ${s.name} : la feuille se referme`, (await page.locator('[data-sheet-panel]').count()) === 0)
        } else if (vp.tier === 'phone') {
          check(`A421 ${vp.label} ${s.name} : un bouton « סינון »`, false, 'absent')
        }
        /* A422 — le déclencheur des statuts. */
        const st = page.locator('[data-testid="status-sheet-open"]').first()
        if ((await st.count()) > 0) {
          const text = (await st.innerText()).trim()
          await st.click()
          await page.waitForTimeout(500)
          const visibleStatus = await page.evaluate(() => {
            const sec = document.querySelector('[data-sheet-body] [data-family="status"]')
            const body = document.querySelector('[data-sheet-body]')
            if (!sec || !body) return false
            const a = sec.getBoundingClientRect()
            const b = body.getBoundingClientRect()
            return a.top >= b.top - 2 && a.top < b.bottom - 40
          })
          check(`A422 ${vp.label} ${s.name} : « ${text} » ouvre la feuille sur les statuts`, visibleStatus)
          if (SHOTS && (s.name === 'fermes' || s.name === 'contacts')) await page.screenshot({ path: `${SHOT_DIR}/a422-statuts-${s.name}-${vp.label}.png` })
          await page.locator('[data-testid="filter-sheet-close"]').click()
          await page.waitForTimeout(300)
        }
        /* A423 — contacts à traiter. */
        if (s.name === 'contacts') {
          check(`A423 ${vp.label} : plus de rangée de quatre boutons sous les lignes`, (await page.locator('[data-tile-foot]').count()) === 0)
          const lines = await page.evaluate(() => {
            const row = document.querySelector('[data-lead-id]')
            if (!row) return -1
            const tops = new Set<number>()
            for (const el of row.querySelectorAll('[data-entity-title], [data-entity-person], [data-entity-near], [data-entity-sub]')) tops.add(Math.round(el.getBoundingClientRect().top / 4))
            return tops.size
          })
          check(`A423 ${vp.label} : une ligne de contact = deux étages de texte au plus`, lines >= 1 && lines <= 2, `${lines}`)
          const first = page.locator('[data-lead-id]').first()
          const id = await first.getAttribute('data-lead-id')
          const pill = page.locator(`[data-testid="lead-status-pill-${id}-toggle"]`)
          check(`A423 ${vp.label} : une pastille porte le statut`, (await pill.count()) === 1)
          await pill.click()
          await page.waitForTimeout(300)
          await page.locator(`[data-testid="lead-status-pill-${id}-call_back"]`).click()
          await page.waitForTimeout(450)
          check(`A423 ${vp.label} : le choix compact change le statut`, (await page.locator(`[data-lead-id="${id}"]`).getAttribute('data-status')) === 'call_back')
          if (vp.tier === 'phone') {
            const sw = page.locator(`[data-testid="leads-table-swipe-${id}"]`)
            const bb = await sw.boundingBox()
            if (bb) {
              await page.evaluate(([x, y]) => {
                const el = document.elementFromPoint(x, y) as HTMLElement
                const fire = (type: string, cx: number) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true }))
                fire('pointerdown', x)
                for (let i = 1; i <= 8; i++) fire('pointermove', x + i * 16)
                fire('pointerup', x + 128)
              }, [bb.x + bb.width * 0.4, bb.y + bb.height / 2])
              await page.waitForTimeout(500)
            }
            check(`A423 ${vp.label} : glisser vers la droite → « ממתין »`, (await page.locator(`[data-lead-id="${id}"]`).getAttribute('data-status')) === 'no_answer')
          }
        }
        check(`${vp.label} ${s.name} : aucune erreur de page`, errors.length === 0, errors.join(' | '))
      } catch (e) {
        check(`${vp.label} ${s.name} — section interrompue`, false, (e as Error).message.split('\n')[0])
      }
      await close()
    }

    /* A426 — les réglages : la phrase du thème (appliqué + d'où vient la
       décision) et la version qui tourne, en petit sous le titre. */
    if (vp.tier === 'phone') {
      const set = await open(browser, vp, '/coordinator/settings')
      try {
        const src = set.page.locator('[data-testid="theme-source"]')
        const said = ((await src.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ')
        check(`A426 ${vp.label} : la section du thème dit le thème appliqué ET d'où vient la décision`, (await src.count()) === 1 && (await src.getAttribute('data-applied')) === 'light' && said.includes('בהיר') && said.includes('—') && !!(await src.getAttribute('data-source')), said)
        const ver = set.page.locator('[data-testid="settings-version-line"]')
        const vinfo = await ver.evaluate((el) => ({ id: el.getAttribute('data-version') ?? '', px: parseFloat(getComputedStyle(el).fontSize), top: Math.round(el.getBoundingClientRect().top), text: (el.textContent ?? '').trim() })).catch(() => null)
        check(`A426 ${vp.label} : la version qui tourne, en petit, sous le titre`, !!vinfo && vinfo.id.length > 0 && vinfo.text.includes(vinfo.id) && vinfo.px <= 13.5 && vinfo.top < 260, JSON.stringify(vinfo))
        check(`A426 ${vp.label} : aucune erreur de page`, set.errors.length === 0, set.errors.join(' | '))
        if (SHOTS) await set.page.screenshot({ path: `${SHOT_DIR}/a426-reglages-${vp.label}.png` })
      } catch (e) {
        check(`A426 ${vp.label} — section interrompue`, false, (e as Error).message.split('\n')[0])
      }
      await set.close()
    }

    /* A424 — la carte de couverture. */
    /* ★★ BG 3 — la bulle (et la feuille du téléphone) ne s'ouvre que là où le
       panneau ne montre PAS déjà l'institution : on l'examine donc carte
       pleine. En mode partagé, c'est `bgui` A474 qui vérifie qu'elle se tait. */
    const cov = await open(browser, vp, '/coordinator/coverage?inst=inst-demo-02', { 'lo-yanum:map-mode:coverage': 'full' })
    try {
      const page = cov.page
      const recall = page.locator('[data-testid="coverage-recall"]').first()
      check(`A424 ${vp.label} : l'institution arrive sélectionnée, barre de rappel en une ligne`, (await recall.count()) === 1 && ((await recall.boundingBox())?.height ?? 99) <= 52)
      if (vp.tier === 'phone') {
        const sheet = page.locator('[data-testid="coverage-sheet"]')
        const bb = await sheet.boundingBox()
        check(`A424 ${vp.label} : la bulle est une feuille ANCRÉE en bas`, !!bb && Math.abs(bb.y + bb.height - vp.height) <= 2 && (await sheet.getAttribute('data-expanded')) === 'true', bb ? `bas ${Math.round(bb.y + bb.height)} / ${vp.height}` : 'absente')
        if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/a424-feuille-ouverte-${vp.label}.png` })
        await page.locator('[data-testid="coverage-sheet-handle"]').click()
        await page.waitForTimeout(400)
        check(`A424 ${vp.label} : réduire la feuille GARDE la sélection`, (await sheet.getAttribute('data-expanded')) === 'false' && (await recall.getAttribute('data-inst')) === 'inst-demo-02')
        await page.locator('[data-testid="coverage-recall-next"]').click()
        await page.waitForTimeout(500)
        const nextId = await page.locator('[data-testid="coverage-recall"]').first().getAttribute('data-inst')
        check(`A424 ${vp.label} : › passe à l'institution suivante, la feuille reste réduite`, !!nextId && nextId !== 'inst-demo-02' && (await sheet.getAttribute('data-expanded')) === 'false', `${nextId}`)
        await page.locator('[data-testid="coverage-sheet-handle"]').click()
        await page.waitForTimeout(400)
        check(`A424 ${vp.label} : un toucher sur la poignée la rouvre`, (await sheet.getAttribute('data-expanded')) === 'true')
        if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/a424-feuille-suivante-${vp.label}.png` })
      } else {
        check(`A424 ${vp.label} : la bulle est rangée au coin, pas ancrée sur l'institution`, (await page.locator('.lo-anchored [data-testid="coverage-institution-card"]').count()) === 0 && (await page.locator('[data-testid="coverage-institution-card"]').count()) === 1)
        if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/a424-bulle-coin-${vp.label}.png` })
        await page.locator('[data-testid="coverage-institution-card"] button[aria-label]').last().click()
        await page.waitForTimeout(400)
        check(`A424 ${vp.label} : fermer la bulle GARDE la sélection`, (await page.locator('[data-testid="coverage-institution-card"]').count()) === 0 && (await page.locator('[data-testid="coverage-recall"]').first().getAttribute('data-bubble')) === 'closed')
        await page.locator('[data-testid="coverage-recall-next"]').click()
        await page.waitForTimeout(500)
        const nextId = await page.locator('[data-testid="coverage-recall"]').first().getAttribute('data-inst')
        check(`A424 ${vp.label} : › passe à la suivante, la bulle reste fermée`, !!nextId && nextId !== 'inst-demo-02' && (await page.locator('[data-testid="coverage-institution-card"]').count()) === 0, `${nextId}`)
        await page.locator('[data-testid="coverage-recall-open"]').click()
        await page.waitForTimeout(300)
        check(`A424 ${vp.label} : « פרטים » rouvre la bulle`, (await page.locator('[data-testid="coverage-institution-card"]').count()) === 1)
      }
      /* Toucher le fond de la carte : désélectionne. Un point du canevas sans épingle. */
      /* ★★ BG — carte pleine, la feuille du téléphone couvre le bas du canevas :
         on vise un point où le CANEVAS est vraiment sous le doigt. */
      const free = await page.evaluate(() => {
        const c = document.querySelector('.maplibregl-canvas') as HTMLElement | null
        if (!c) return null
        const r = c.getBoundingClientRect()
        for (const fy of [0.92, 0.5, 0.35, 0.65, 0.2])
          for (const fx of [0.92, 0.08, 0.5, 0.75, 0.25]) {
            const x = r.left + r.width * fx
            const y = r.top + r.height * fy
            if (document.elementFromPoint(x, y) === c) return { x, y }
          }
        return null
      })
      if (free) {
        await page.mouse.click(free.x, free.y)
        await page.waitForTimeout(450)
      }
      check(`A424 ${vp.label} : toucher le fond de la carte désélectionne`, (await page.locator('[data-testid="coverage-recall"]').count()) === 0)
      const tg = await targets(page)
      check(`A424 ${vp.label} : cibles ≥ 44 px, 8 px entre voisines`, tg.small.length === 0 && tg.tight.length === 0, [...tg.small, ...tg.tight].join(' · '))
      check(`A424 ${vp.label} : aucune erreur de page`, cov.errors.length === 0, cov.errors.join(' | '))
    } catch (e) {
      check(`A424 ${vp.label} — section interrompue`, false, (e as Error).message.split('\n')[0])
    }
    await cov.close()
  }
} finally {
  await browser.close()
  serve?.kill()
}
writeFileSync(OUT, JSON.stringify({ app: APP, at: new Date().toISOString(), headers: report }, null, 2))
console.log(`\n  ${passed} PASS · ${failed} FAIL  → ${OUT}`)
process.exit(failed === 0 ? 0 : 1)
