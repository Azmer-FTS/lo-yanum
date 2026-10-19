import { mkdirSync } from 'node:fs'

import type { CDPSession, Page } from 'playwright'

import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import type { Opened } from './ayharness'
import { FakeDb } from './fake-supabase'
import { REGIONS } from '../src/core/regions'
import { landDunams } from '../src/core/topology'
import type { LatLng } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BM — CHANTIER 2 AU RENDU : LA BARRE TIENT EN DEUX LIGNES, SOUS UN SEUL FOND.
 *                                                              A636 … A641
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bmui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bmui    # le DÉPLOYÉ
 *
 *   « Je me retrouve avec quatre lignes au-dessus de la carte. Il y a moyen de
 *     réduire tout ça à deux lignes max. Et de mettre tout ça sous le même
 *     fond, les outils et les noms des sections, pour que ça fasse un seul
 *     bloc. »                                                         — le PO
 *
 * Quatre tailles : l'ordinateur (1 440), l'iPad plein écran (1 032, au doigt),
 * l'iPad en écran partagé (678 et 507, au doigt).
 *
 *   A636  ★ DEUX LIGNES au-dessus de la carte, pas trois : tout ce qui se voit
 *         au-dessus de la carte (retour, titre, pastilles, chevauchements,
 *         outils, actions, mentions) est sur l'une des deux lignes du bloc ;
 *         rien d'autre entre le haut de l'écran et la carte ; rien ne déborde
 *         de l'écran, la page ne défile pas de côté — sans région ouverte
 *         comme avec une région ouverte, et à la même hauteur
 *   A637  ★ UN SEUL FOND : les pastilles et les outils sont dans le MÊME bloc,
 *         qui seul porte un fond ; ses deux lignes n'en portent pas
 *   A638  ★ plus de redondance : l'outil actif n'est plus écrit ; la surface
 *         de la région n'est écrite qu'UNE fois (sa pastille, ou le sélecteur)
 *   A639  ★ les mentions condensées sur la ligne 2 : la mer, l'aimant, la
 *         forme d'origine, les voisines poussées et le vide à combler, TOUTES
 *         actives à la fois — toujours deux lignes, la même hauteur ; le vide
 *         se comble de la ligne 2 ; un toucher les déplie en entier, SOUS la
 *         barre, sans la grandir ; à l'étroit (507), elles se replient en une
 *         pastille (icône + compte), le bouton du vide passe dans le dépli
 *   A640  ★ rien n'est retiré : en écran partagé, « ביצוע מחדש », la forme
 *         d'origine et les boutons du point passent dans « ⋯ » et y
 *         FONCTIONNENT ; à 1 032, ils sont sur la ligne 2
 *   A641  le sélecteur de région (écran partagé) : la région ouverte et sa
 *         surface, les treize dépliées sous la barre, un toucher ouvre
 */

const OUT = process.env.DIST ?? 'dist-bmui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5551), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bm/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

type Device = { name: string; w: number; h: number; touch: boolean }
const SIZES: Device[] = [
  { name: 'ordinateur-1440', w: 1440, h: 900, touch: false },
  { name: 'ipad-1032', w: 1032, h: 1376, touch: true },
  { name: 'partage-678', w: 678, h: 1366, touch: true },
  { name: 'partage-507', w: 507, h: 1366, touch: true },
]
const RING = (id: string): LatLng[] => REGIONS.find((r) => r.id === id)!.ring.map(([lng, lat]) => ({ lat, lng }))
const SHARON_1 = RING('sharon')[1]
const PUSH_TO = { lat: 32.08, lng: 35.0 }
const BACK_TO = { lat: 32.26, lng: 35.04 }

interface Hand {
  page: Page
  tap(x: number, y: number): Promise<void>
  drag(x0: number, y0: number, x1: number, y1: number, steps?: number): Promise<void>
}
async function hand(o: Opened, dev: Device): Promise<Hand> {
  const page = o.page
  const cdp: CDPSession | null = dev.touch ? await o.ctx.newCDPSession(page) : null
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Array<{ x: number; y: number }>) =>
    cdp!.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts.map((p, id) => ({ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 })) })
  return {
    page,
    async tap(x, y) {
      if (cdp) {
        await touch('touchStart', [{ x, y }])
        await page.waitForTimeout(40)
        await touch('touchEnd', [])
      } else await page.mouse.click(x, y)
      await page.waitForTimeout(400)
    },
    async drag(x0, y0, x1, y1, steps = 14) {
      if (cdp) {
        await touch('touchStart', [{ x: x0, y: y0 }])
        for (let i = 1; i <= steps; i++) {
          await touch('touchMove', [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }])
          await page.waitForTimeout(16)
        }
        await touch('touchEnd', [])
      } else {
        await page.mouse.move(x0, y0)
        await page.mouse.down()
        await page.mouse.move(x1, y1, { steps })
        await page.mouse.up()
      }
      await page.waitForTimeout(600)
    },
  }
}
const centreOf = async (page: Page, sel: string) => {
  const b = await page.locator(sel).first().boundingBox()
  if (!b) throw new Error(`absent : ${sel}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
const project = (page: Page, p: LatLng) =>
  page.evaluate((q) => {
    const m = (window as unknown as { __loYanumMap: { project(a: [number, number]): { x: number; y: number }; getContainer(): HTMLElement } }).__loYanumMap
    const r = m.getContainer().getBoundingClientRect()
    const s = m.project([q.lng, q.lat])
    return { x: r.left + s.x, y: r.top + s.y }
  }, p)
async function frame(page: Page, c: LatLng, zoom: number): Promise<void> {
  await page.evaluate(({ c: q, z }) => (window as unknown as { __loYanumMap: { jumpTo(o: unknown): void } }).__loYanumMap.jumpTo({ center: [q.lng, q.lat], zoom: z }), { c, z: zoom })
  await page.waitForTimeout(900)
}
async function openRegions(dev: Device): Promise<{ o: Opened; h: Hand }> {
  const db = new FakeDb()
  seed(db)
  const o = await open(dev.w, { db, height: dev.h, touch: dev.touch })
  await go(o.page, APP, '/coordinator/settings/regions', 6000)
  await o.page.waitForFunction(() => !!(window as unknown as { __loYanumMap?: unknown }).__loYanumMap, null, { timeout: 30_000 })
  return { o, h: await hand(o, dev) }
}
async function pickRegion(h: Hand, id: string): Promise<void> {
  if ((await h.page.locator('[data-testid="region-picker"]').count()) > 0 && (await h.page.locator('[data-testid="region-picker-list"]').count()) === 0) {
    const pk = await centreOf(h.page, '[data-testid="region-picker"]')
    await h.tap(pk.x, pk.y)
  }
  await h.page.locator(`[data-testid="region-pick-${id}"]`).scrollIntoViewIfNeeded()
  await h.page.waitForTimeout(300)
  const c = await centreOf(h.page, `[data-testid="region-pick-${id}"]`)
  await h.tap(c.x, c.y)
  await h.page.waitForTimeout(1200)
}
const BLOCK = '[data-testid="shape-editor"], [data-testid="shape-editor-idle"]'

/** La géométrie de ce qui est AU-DESSUS de la carte : le bloc, ses deux lignes, et tout ce qui se voit. */
function layout(page: Page) {
  return page.evaluate((blockSel) => {
    const m = (window as unknown as { __loYanumMap: { getContainer(): HTMLElement } }).__loYanumMap.getContainer().getBoundingClientRect()
    const block = document.querySelector(blockSel) as HTMLElement
    const b = block.getBoundingClientRect()
    const lines = [...block.querySelectorAll<HTMLElement>('[data-testid="editor-line-1"], [data-testid="editor-line-2"]')].map((l) => l.getBoundingClientRect())
    /* Tout ce qui se voit au-dessus de la carte : boutons, titres, textes. */
    const seen: Array<{ what: string; top: number; bottom: number; left: number; right: number; inBlock: boolean }> = []
    /* Le rectangle VU : coupé par chaque ancêtre qui rogne (une rangée qui défile, une pastille tronquée). */
    const seenRect = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      let { left, right, top, bottom } = r
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a)
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
        const c = a.getBoundingClientRect()
        left = Math.max(left, c.left); right = Math.min(right, c.right); top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom)
      }
      return { left, right, top, bottom, width: right - left, height: bottom - top }
    }
    for (const el of document.querySelectorAll<HTMLElement>('button, h1, [role="status"], [data-testid^="editor-"], [data-testid^="region-"]')) {
      /* Les conteneurs du bloc ne sont pas « au-dessus de la carte » à côté de lui : ils le portent. */
      if (el.contains(block)) continue
      /* La rangée des pastilles réserve 12 px pour leur ombre (et ses chevrons la couvrent) : on juge les pastilles. */
      if (el.dataset.testid === 'region-chooser' || (el.dataset.testid ?? '').startsWith('scroll-nudge')) continue
      const r = seenRect(el)
      if (r.width < 1 || r.height < 1 || r.bottom > m.top + 0.5) continue
      /* Au-dessus de la CARTE : la colonne de navigation de l'application, à côté, n'en est pas. */
      if (r.right <= m.left + 0.5 || r.left >= m.right - 0.5) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      if (el.closest('.sr-only')) continue
      if (el.closest('[role="menu"], [data-testid="editor-status-panel"], [data-testid="region-picker-list"]')) continue
      seen.push({ what: el.dataset.testid ?? el.tagName.toLowerCase(), top: r.top, bottom: r.bottom, left: r.left, right: r.right, inBlock: block.contains(el) })
    }
    const rowOf = (s: { top: number; bottom: number }) => lines.findIndex((l) => s.top >= l.top - 1 && s.bottom <= l.bottom + 1)
    return {
      mapTop: m.top,
      block: { top: b.top, bottom: b.bottom, height: b.height },
      lines: lines.map((l) => Math.round(l.height)),
      outside: seen.filter((s) => !s.inBlock).map((s) => s.what),
      offLine: seen.filter((s) => s.inBlock && rowOf(s) < 0).map((s) => `${s.what}@${Math.round(s.top)}`),
      offScreen: seen.filter((s) => s.left < -0.5 || s.right > innerWidth + 0.5).map((s) => s.what),
      pageScroll: document.documentElement.scrollWidth - innerWidth,
    }
  }, BLOCK)
}

// ===========================================================================
for (const dev of SIZES) {
  const D = dev.name
  await guard(`A636-${D}`, async () => {
    section(`A636–A638 (${D}) — ★ deux lignes, un seul fond, sans redondance`)
    const { o, h } = await openRegions(dev)
    const idle = await layout(o.page)
    check(`A636 (${D}) sans région ouverte : DEUX lignes (${idle.lines.join(' + ')} px), le bloc fait ${Math.round(idle.block.height)} px`, idle.lines.length === 2 && idle.lines.every((x) => x <= 52) && idle.block.height <= 120)
    await pickRegion(h, 'jordan-valley')
    const L = await layout(o.page)
    check(`A636 (${D}) ★ une région ouverte : toujours DEUX lignes (${L.lines.join(' + ')} px), le bloc fait ${Math.round(L.block.height)} px (avant BM : 4 lignes)`, L.lines.length === 2 && L.lines.every((x) => x <= 52) && L.block.height <= 120)
    check(`A636 (${D}) ★ tout ce qui se voit au-dessus de la carte est sur l’une des deux lignes`, L.offLine.length === 0, L.offLine.join(', '))
    check(`A636 (${D}) ★ rien d’autre au-dessus de la carte que le bloc`, L.outside.length === 0, L.outside.join(', '))
    check(`A636 (${D}) la carte commence juste sous le bloc (${Math.round(L.mapTop - L.block.bottom)} px d’écart ; haut du bloc ${Math.round(L.block.top)} px)`, L.mapTop - L.block.bottom <= 16 && L.block.top <= 32)
    check(`A636 (${D}) ouvrir une région ne change pas la hauteur du bloc (${Math.round(idle.block.height)} → ${Math.round(L.block.height)})`, Math.abs(idle.block.height - L.block.height) < 1)
    check(`A636 (${D}) rien ne sort de l’écran, la page ne défile pas de côté`, L.offScreen.length === 0 && L.pageScroll <= 0, `${L.offScreen.join(', ')} ; ${L.pageScroll}`)

    const bg = await o.page.evaluate((blockSel) => {
      const block = document.querySelector(blockSel) as HTMLElement
      const tr = (c: string) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent'
      const has = (sel: string) => !!block.querySelector(sel)
      const painted: string[] = []
      /* Autour du bloc, un fond n'est une « bande » que s'il diffère de celui de la page (le haut collant peint le fond de la page). */
      const page = [document.body, document.documentElement].map((e) => getComputedStyle(e).backgroundColor).find((c) => !tr(c)) ?? ''
      for (let el: HTMLElement | null = block.parentElement; el && el !== document.body; el = el.parentElement) {
        const c = getComputedStyle(el).backgroundColor
        if (!tr(c) && c !== page && el.getBoundingClientRect().height < 400) painted.push(`${el.className.slice(0, 40)} ${c} ≠ ${page}`)
      }
      return {
        own: getComputedStyle(block).backgroundColor,
        lines: [...block.querySelectorAll<HTMLElement>('[data-testid^="editor-line-"]')].map((l) => getComputedStyle(l).backgroundColor),
        chips: has('[data-testid="region-chooser"], [data-testid="region-picker"]'),
        tools: has('[data-testid="editor-tools"]'),
        title: has('h1'),
        painted,
      }
    }, BLOCK)
    check(`A637 (${D}) ★ les pastilles, le titre ET les outils sont dans le MÊME bloc`, bg.chips && bg.tools && bg.title)
    check(`A637 (${D}) ★ un seul fond : le bloc en porte un (${bg.own}), ses lignes aucun, ni rien autour`, !/rgba\(0, 0, 0, 0\)/.test(bg.own) && bg.lines.every((c) => c === 'rgba(0, 0, 0, 0)') && bg.painted.length === 0, `${bg.lines.join(' / ')} ${bg.painted.join(' | ')}`)

    const text = await o.page.locator(BLOCK).first().innerText()
    const area = Math.round(landDunams(RING('jordan-valley'))).toLocaleString('he-IL')
    const times = text.split(area).length - 1
    check(`A638 (${D}) ★ l’outil actif n’est plus écrit (l’icône pleine suffit)`, (await o.page.locator('[data-testid="editor-active-tool"]').count()) === 0 && !/בחירה/.test(text))
    check(`A638 (${D}) ★ la surface de la région n’est écrite qu’UNE fois (${area} : ${times} fois)`, times === 1 && (await o.page.locator('[data-testid="editor-summary"]').count()) === 0)
    await o.page.screenshot({ path: `${SHOTS}/a636-${D}.png`, clip: { x: 0, y: 0, width: dev.w, height: Math.round(L.mapTop + 160) } })
    await o.ctx.close()
  })
}

// ===========================================================================
for (const dev of [SIZES[0], SIZES[1], SIZES[3]]) {
  const D = dev.name
  await guard(`A639-${D}`, async () => {
    section(`A639 (${D}) — ★ cinq mentions à la fois, toujours deux lignes`)
    const { o, h } = await openRegions(dev)
    await pickRegion(h, 'sharon')
    const h0 = (await layout(o.page)).block.height
    await frame(o.page, { lat: 32.2, lng: 34.95 }, 9.6)
    /* Le poussage : on avance sur la voisine, puis on recule (un VIDE) ; puis l'aimant. */
    const n1 = await project(o.page, SHARON_1)
    const to = await project(o.page, PUSH_TO)
    await h.drag(n1.x, n1.y, to.x, to.y)
    const p1 = await project(o.page, PUSH_TO)
    const back = await project(o.page, BACK_TO)
    await h.drag(p1.x, p1.y, back.x, back.y)
    const sn = await centreOf(o.page, '[data-testid="editor-snap"]')
    await h.tap(sn.x, sn.y)
    const want = ['region-sea-note', 'editor-snap-status', 'editor-ghost-note', 'editor-pushed', 'editor-gap-note-coastal-plain']
    const present = [] as string[]
    for (const id of want) if ((await o.page.locator(`[data-testid="${id}"]`).count()) === 1) present.push(id)
    check(`A639 (${D}) ★ toutes actives à la fois : ${present.length}/${want.length} (${present.join(', ')})`, present.length === want.length)
    const L = await layout(o.page)
    check(`A639 (${D}) ★ et toujours DEUX lignes (${L.lines.join(' + ')} px), la même hauteur (${Math.round(h0)} → ${Math.round(L.block.height)})`, L.lines.length === 2 && L.lines.every((x) => x <= 52) && Math.abs(L.block.height - h0) < 1 && L.offLine.length === 0, L.offLine.join(', '))
    const onLine2 = await o.page.evaluate((ids) => {
      const l2 = document.querySelector('[data-testid="editor-line-2"]')!
      return ids.every((id) => l2.contains(document.querySelector(`[data-testid="${id}"]`)))
    }, want)
    check(`A639 (${D}) ★ elles PARTAGENT la ligne 2 (aucune n’en crée une troisième)`, onLine2)
    check(`A639 (${D}) leurs textes restent entiers pour qui les lit (la mer, le vide)`, /בים/.test(await o.page.locator('[data-testid="region-sea-note"]').innerText()) && /רווח/.test(await o.page.locator('[data-testid="editor-gap-note-coastal-plain"]').innerText()))
    await o.page.screenshot({ path: `${SHOTS}/a639-${D}-mentions.png`, clip: { x: 0, y: 0, width: dev.w, height: Math.round(L.mapTop + 200) } })
    const folded = (await o.page.locator('[data-testid="editor-status"]').getAttribute('data-collapsed')) === '1'
    check(`A639 (${D}) ${folded ? 'à l’étroit, elles se REPLIENT en une pastille (icône + compte)' : 'elles tiennent côte à côte'}`, folded ? (await o.page.locator('[data-testid="editor-status-folded"]').innerText()).includes('5') : true)
    /* Un toucher : tout, en entier, SOUS la barre — la barre ne grandit pas. */
    const st = await centreOf(o.page, folded ? '[data-testid="editor-status-folded"]' : '[data-testid="region-sea-note"]')
    await h.tap(st.x, st.y)
    const panel = o.page.locator('[data-testid="editor-status-panel"]')
    const pb = await panel.boundingBox()
    const L2 = await layout(o.page)
    check(`A639 (${D}) ★ un toucher les DÉPLIE en entier (${(await panel.innerText().catch(() => '')).split('\n').length} lignes), sous la barre`, !!pb && pb.y >= L2.block.bottom - 0.5 && /קו החוף/.test(await panel.innerText()) && /רווח/.test(await panel.innerText()))
    check(`A639 (${D}) … sans grandir la barre (${Math.round(L2.block.height)} px)`, Math.abs(L2.block.height - h0) < 1)
    await o.page.screenshot({ path: `${SHOTS}/a639-${D}-deplie.png`, clip: { x: 0, y: 0, width: dev.w, height: Math.round(L.mapTop + 320) } })
    /* Le vide se comble DE LA LIGNE 2 — ou, repliées, du dépli. */
    if (!folded) await o.page.locator('[data-testid="editor-status-panel"] button').last().click()
    const fill = await centreOf(o.page, '[data-testid="editor-fill-gap-coastal-plain"]')
    await h.tap(fill.x, fill.y)
    check(`A639 (${D}) ★ « מילוי הרווח », ${folded ? 'dans le dépli' : 'sur la ligne 2'} : le vide disparaît`, (await o.page.locator('[data-testid="editor-gap-coastal-plain"]').count()) === 0 && (await o.page.locator('[data-testid="editor-gap-note-coastal-plain"]').count()) === 0)
    await o.ctx.close()
  })
}

// ===========================================================================
await guard('A640', async () => {
  section('A640 — ★ rien n’est retiré : ce qui manque de place passe dans « ⋯ »')
  for (const dev of [SIZES[1], SIZES[3], SIZES[2]]) {
    const D = dev.name
    const { o, h } = await openRegions(dev)
    await pickRegion(h, 'negev')
    await frame(o.page, { lat: 30.8, lng: 34.8 }, 7.4)
    const n = await centreOf(o.page, '[data-testid="editor-node-1"]')
    await h.drag(n.x, n.y, n.x - 30, n.y - 20)
    const undo = await centreOf(o.page, '[data-testid="editor-undo"]')
    await h.tap(undo.x, undo.y)
    const n2 = await centreOf(o.page, '[data-testid="editor-node-2"]')
    await h.tap(n2.x, n2.y)
    const inLine2 = async (id: string) => o.page.evaluate((x) => !!document.querySelector('[data-testid="editor-line-2"]')?.contains(document.querySelector(`[data-testid="${x}"]`)), id)
    const where: Record<string, string> = {}
    for (const id of ['editor-redo', 'editor-ghost-toggle', 'editor-node-delete']) where[id] = (await inLine2(id)) ? 'ligne 2' : 'menu'
    if (dev.w >= 1000) {
      check(`A640 (${D}) ★ à pleine largeur, tout est sur la ligne 2 (${JSON.stringify(where)})`, Object.values(where).every((x) => x === 'ligne 2'))
      await o.ctx.close()
      continue
    }
    const menu = await centreOf(o.page, '[data-testid="editor-menu"]')
    await h.tap(menu.x, menu.y)
    const inMenu = async (id: string) => (await o.page.locator(`[data-testid="editor-menu-panel"] [data-testid="${id}"]`).count()) === 1
    const moved = Object.entries(where).filter(([, w]) => w === 'menu').map(([id]) => id)
    let all = true
    for (const id of moved) all = all && (await inMenu(id))
    /* À 507, la ligne 2 ne peut pas tout montrer (mesuré : 473 px) ; à 678, elle le peut, sans séparateurs. */
    check(`A640 (${D}) ★ chacun est sur la ligne 2 OU dans « ⋯ », jamais nulle part (dans « ⋯ » : ${moved.join(', ') || 'rien'})`, all && (dev.w > 600 || moved.length > 0), JSON.stringify(where))
    if (moved.includes('editor-redo')) {
      const r0 = Number((await o.page.locator('[data-testid="shape-editor"]').getAttribute('data-redo')) ?? -1)
      await o.page.locator('[data-testid="editor-menu-panel"] [data-testid="editor-redo"]').click()
      await o.page.waitForTimeout(400)
      check(`A640 (${D}) ★ « ביצוע מחדש » depuis « ⋯ » REFAIT le geste (${r0} → ${await o.page.locator('[data-testid="shape-editor"]').getAttribute('data-redo')})`, r0 === 1 && (await o.page.locator('[data-testid="shape-editor"]').getAttribute('data-redo')) === '0')
      await h.tap(menu.x, menu.y)
    }
    if (moved.includes('editor-node-delete')) {
      const before = Number(await o.page.locator('[data-testid="shape-editor"]').getAttribute('data-nodes'))
      const sel = await o.page.locator('[data-testid="shape-editor"]').getAttribute('data-selected-node')
      if (sel === '') {
        await h.tap(menu.x, menu.y)
        const n2b = await centreOf(o.page, '[data-testid="editor-node-2"]')
        await h.tap(n2b.x, n2b.y)
        await h.tap(menu.x, menu.y)
      }
      await o.page.locator('[data-testid="editor-menu-panel"] [data-testid="editor-node-delete"]').click()
      await o.page.waitForTimeout(400)
      check(`A640 (${D}) ★ supprimer le point depuis « ⋯ » le supprime (${before} → ${await o.page.locator('[data-testid="shape-editor"]').getAttribute('data-nodes')})`, Number(await o.page.locator('[data-testid="shape-editor"]').getAttribute('data-nodes')) === before - 1)
    }
    const tools = await o.page.locator('[data-testid="editor-tools"] [data-testid^="editor-tool-"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => Math.min(b.width, b.height)))
    check(`A640 (${D}) les sept outils restent sur la ligne 2, à 44 px`, tools.length === 7 && tools.every((x) => x >= 44))
    await o.ctx.close()
  }
})

// ===========================================================================
await guard('A641', async () => {
  section('A641 — le sélecteur de région, en écran partagé')
  const dev = SIZES[3]
  const { o, h } = await openRegions(dev)
  check('A641 étroit : un sélecteur, pas une rangée qui passerait à la ligne', (await o.page.locator('[data-testid="region-picker"]').count()) === 1 && (await o.page.locator('[data-testid="region-chooser"]').count()) === 0)
  const pk = await centreOf(o.page, '[data-testid="region-picker"]')
  await h.tap(pk.x, pk.y)
  const list = o.page.locator('[data-testid="region-picker-list"]')
  const lb = await list.boundingBox()
  const L = await layout(o.page)
  check(`A641 ★ un toucher déplie les treize, SOUS la barre (${await list.locator('[data-testid^="region-pick-"]').count()})`, (await list.locator('[data-testid^="region-pick-"]').count()) === 13 && !!lb && lb.y >= L.block.bottom - 0.5)
  check('A641 … sans grandir la barre', L.lines.length === 2 && L.block.height <= 120)
  const c = await centreOf(o.page, '[data-testid="region-pick-galilee"]')
  await h.tap(c.x, c.y)
  await o.page.waitForTimeout(1000)
  const txt = await o.page.locator('[data-testid="region-picker"]').innerText()
  const area = Math.round(landDunams(RING('galilee'))).toLocaleString('he-IL')
  check(`A641 ★ la région ouverte et sa surface (« ${txt.replace(/\s+/g, ' ').trim()} »)`, txt.includes(REGIONS.find((r) => r.id === 'galilee')!.name) && txt.includes(area) && (await o.page.locator('[data-testid="shape-editor"]').getAttribute('data-shape')) === 'galilee')
  check('A641 le dépli s’est refermé', (await list.count()) === 0)
  await o.ctx.close()
})

await finish()
