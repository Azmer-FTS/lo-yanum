import { mkdirSync } from 'node:fs'

import type { CDPSession, Page } from 'playwright'
import polygonClipping from 'polygon-clipping'

import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import type { Opened } from './ayharness'
import { FakeDb, USER_ID } from './fake-supabase'
import { REGIONS } from '../src/core/regions'
import { abroadDunams, landDunams, landOf, overlapsOf, planResolutions, seaDunams, shapeDunams, toPolygon } from '../src/core/topology'
import type { LatLng } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BL — CHANTIER 3 AU RENDU : LES RÉGIONS SE TIENNENT ENTRE ELLES.  A593 … A600
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bltopo                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bltopo    # le DÉPLOYÉ
 *
 * Sur les 13 régions LIVRÉES (X12) de la base factice — jamais celles du PO.
 *
 *   A593  ★ la mer (3.1) : les aplats s'arrêtent à la côte, les surfaces sont
 *         celles de la TERRE, la barre dit ce qui est en mer ; rien n'est écrit
 *   A594  ★ les recouvrements (3.3) : comptés, montrés un par un (les deux
 *         régions, la surface, à qui elle irait, ce que perd l'autre), la règle
 *         ÉCRITE, le terrain hachuré ; RIEN n'est écrit en les regardant
 *   A595  ★ refuser un partage, appliquer les autres : seuls les perdants
 *         acceptés sont écrits (appareil ET compte) ; le refusé reste ; plus
 *         que lui en conflit ; « ביטול הפתרון » remet tout comme avant
 *   A596  ★ le poussage en direct (souris ET doigt) : la voisine bouge PENDANT
 *         le geste ; après, plus de recouvrement ; elle perd ce que l'autre a
 *         gagné ; UNE annulation défait le geste ET le recoupage
 *   A597  ★ cas limite 1 — le recul : la voisine ne repousse pas, le VIDE se
 *         voit (hachuré, mesuré, nommé), un bouton le comble jusqu'à la
 *         nouvelle limite ; une annulation le rouvre
 *   A598  ★ cas limite 2 — la voisine serait coupée en deux : le poussage
 *         S'ARRÊTE à la limite, le point aussi, et la barre dit pourquoi
 *   A599  ★ rien n'est enregistré avant « שמור גבול » ; « בטל שינויים » rend
 *         tout ; « שמור גבול » écrit la région ET ses voisines poussées
 *   A600  ★ aucune perte : ouvrir chaque région sans geste n'écrit rien ; les
 *         formes d'une ferme (emboîtées) ne se poussent JAMAIS
 *   A602  ★ 3.2 OPTION A : la région s'arrête aux frontières retenues — sur
 *         l'écran des régions (pastille, barre, aplat, et la barre DIT ce qui
 *         est retiré et où) ET sur les autres cartes (la couche « אזורים ») ;
 *         rien n'est écrit
 */

const OUT = process.env.DIST ?? 'dist-bltopo'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5545), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bl/c3-${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

type Device = { name: 'souris' | 'doigt'; w: number; h: number; touch: boolean }
const DEVICES: Device[] = [
  { name: 'souris', w: 1440, h: 900, touch: false },
  { name: 'doigt', w: 1032, h: 1376, touch: true },
]
const only = process.env.ONLY_DEVICE
const devices = only ? DEVICES.filter((d) => d.name === only) : DEVICES

const RING = (id: string): LatLng[] => REGIONS.find((r) => r.id === id)!.ring.map(([lng, lat]) => ({ lat, lng }))
const NAME = (id: string) => REGIONS.find((r) => r.id === id)!.name
/** Le recouvrement SUR TERRE (la mer ne compte pas : 3.1). */
const overlapDunams = (a: LatLng[], b: LatLng[]) => shapeDunams(polygonClipping.intersection(landOf(a), landOf(b)))
/** Ce que la région a gagné depuis `start`, sur les terres de `neighbor`. */
const gainedOn = (start: LatLng[], now: LatLng[], neighbor: LatLng[]) => shapeDunams(polygonClipping.intersection(polygonClipping.difference(toPolygon(now), toPolygon(start)), landOf(neighbor)))
async function until(f: () => boolean | Promise<boolean>, ms = 4000): Promise<boolean> {
  for (let t = 0; t < ms; t += 100) {
    if (await f()) return true
    await Bun.sleep(100)
  }
  return f()
}

interface Hand {
  page: Page
  cdp: CDPSession | null
  tap(x: number, y: number): Promise<void>
  drag(x0: number, y0: number, x1: number, y1: number, steps?: number): Promise<void>
  hold(x0: number, y0: number, x1: number, y1: number, steps?: number): Promise<() => Promise<void>>
}
async function hand(o: Opened, dev: Device): Promise<Hand> {
  const page = o.page
  const cdp = dev.touch ? await o.ctx.newCDPSession(page) : null
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Array<{ x: number; y: number }>) => {
    await cdp!.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts.map((p, id) => ({ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 })) })
  }
  const press = async (x0: number, y0: number, x1: number, y1: number, steps: number) => {
    if (dev.touch) {
      await touch('touchStart', [{ x: x0, y: y0 }])
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }])
        await page.waitForTimeout(16)
      }
    } else {
      await page.mouse.move(x0, y0)
      await page.mouse.down()
      await page.mouse.move(x1, y1, { steps })
    }
  }
  const release = async () => {
    if (dev.touch) await touch('touchEnd', [])
    else await page.mouse.up()
    await page.waitForTimeout(500)
  }
  return {
    page,
    cdp,
    async tap(x, y) {
      if (dev.touch) {
        await touch('touchStart', [{ x, y }])
        await page.waitForTimeout(40)
        await touch('touchEnd', [])
      } else await page.mouse.click(x, y)
      await page.waitForTimeout(350)
    },
    async drag(x0, y0, x1, y1, steps = 14) {
      await press(x0, y0, x1, y1, steps)
      await release()
    },
    async hold(x0, y0, x1, y1, steps = 14) {
      await press(x0, y0, x1, y1, steps)
      await page.waitForTimeout(300)
      return release
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
const unproject = (page: Page, x: number, y: number) =>
  page.evaluate(
    ({ x, y }) => {
      const m = (window as unknown as { __loYanumMap: { unproject(a: [number, number]): { lat: number; lng: number }; getContainer(): HTMLElement } }).__loYanumMap
      const r = m.getContainer().getBoundingClientRect()
      const ll = m.unproject([x - r.left, y - r.top])
      return { lat: ll.lat, lng: ll.lng }
    },
    { x, y },
  )
async function frame(page: Page, c: LatLng, zoom: number): Promise<void> {
  await page.evaluate(({ c: q, z }) => (window as unknown as { __loYanumMap: { jumpTo(o: unknown): void } }).__loYanumMap.jumpTo({ center: [q.lng, q.lat], zoom: z }), { c, z: zoom })
  await page.waitForTimeout(900)
}
const ed = (page: Page) => page.locator('[data-testid="shape-editor"]').first()
const attr = async (page: Page, a: string) => (await ed(page).getAttribute(a, { timeout: 2000 }).catch(() => null)) ?? ''
const stored = async (page: Page): Promise<Record<string, Array<[number, number]>> | null> => {
  const raw = await page.evaluate(() => localStorage.getItem('lo-yanum:region-rings'))
  return raw ? (JSON.parse(raw) as Record<string, Array<[number, number]>>) : null
}
const asRing = (r: Array<[number, number]>): LatLng[] => r.map(([lng, lat]) => ({ lat, lng }))

async function openRegions(dev: Device): Promise<{ o: Opened; h: Hand; db: FakeDb }> {
  const db = new FakeDb()
  seed(db)
  const o = await open(dev.w, { db, height: dev.h, touch: dev.touch })
  await go(o.page, APP, '/coordinator/settings/regions', 6000)
  return { o, h: await hand(o, dev), db }
}
async function pickRegion(h: Hand, id: string): Promise<void> {
  await h.page.locator(`[data-testid="region-pick-${id}"]`).scrollIntoViewIfNeeded()
  await h.page.waitForTimeout(300)
  const pill = await centreOf(h.page, `[data-testid="region-pick-${id}"]`)
  await h.tap(pill.x, pill.y)
  await h.page.waitForTimeout(1200)
}
const neighborRing = async (page: Page, id: string) => Number((await page.locator(`[data-testid="editor-neighbor-${id}"]`).getAttribute('data-ring').catch(() => null)) ?? -1)

/* Le Sharon (5 sommets) est collé au מישור החוף par son bord 0–1 et à la Samarie par son bord 1–2. */
const SHARON_1 = RING('sharon')[1]
const PUSH_TO = { lat: 32.08, lng: 35.0 }
const BACK_TO = { lat: 32.26, lng: 35.04 }

// ===========================================================================
await guard('A593', async () => {
  section('A593 — ★ la mer : coupée d’office, dite, jamais réécrite')
  const { o, h } = await openRegions(DEVICES[0])
  const pill = Number((await o.page.locator('[data-testid="region-area-carmel-coast"]').innerText()).replace(/[^\d]/g, ''))
  const land = Math.round(landDunams(RING('carmel-coast')))
  check(`A593 ★ la pastille de « ${NAME('carmel-coast')} » dit sa surface SUR TERRE (${pill} = ${land} ; tracée : ${Math.round(landDunams(RING('carmel-coast')) + seaDunams(RING('carmel-coast')))})`, Math.abs(pill - land) <= 1)
  await pickRegion(h, 'carmel-coast')
  check('A593 la barre dit la même surface', Number(await attr(o.page, 'data-area')) === land)
  const note = o.page.locator('[data-testid="region-sea-note"]')
  check(`A593 ★ et elle dit ce qui est en mer (« ${(await note.innerText().catch(() => '')).trim()} »)`, (await note.count()) === 1 && /בים/.test(await note.innerText()))
  const wash = await o.page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap: { getSource(id: string): { _data?: { features?: Array<{ properties?: { id?: string }; geometry: { coordinates: number[][][] } }> } } | undefined } }).__loYanumMap
    const f = (m.getSource('zones')?._data?.features ?? []).filter((x) => String(x.properties?.id ?? '').startsWith('region-carmel-coast'))
    return f.map((x) => x.geometry.coordinates[0])
  })
  const washArea = wash.reduce((s, r) => s + landDunams(r.map(([lng, lat]) => ({ lat, lng }))), 0)
  check(`A593 ★ l’aplat s’arrête à la côte : sa surface est celle de la terre (${Math.round(washArea)} / ${land})`, wash.length >= 1 && Math.abs(washArea - land) / land < 0.002)
  check('A593 ★ rien n’est écrit (le tracé n’est pas réécrit : c’est un masque)', (await stored(o.page)) === null)
  await o.page.screenshot({ path: `${SHOTS}/a593-mer.png` })
  await o.ctx.close()
})

// ===========================================================================
await guard('A594', async () => {
  section('A594 — ★ les recouvrements : montrés, expliqués, jamais résolus seuls')
  const { o, h } = await openRegions(DEVICES[1])
  const regions = REGIONS.map((r) => ({ id: r.id, ring: RING(r.id), drawn: false }))
  const expected = overlapsOf(regions)
  const btn = o.page.locator('[data-testid="regions-overlaps"]')
  check(`A594 le bouton compte les conflits (${await btn.getAttribute('data-count')} ; attendu ${expected.length})`, Number(await btn.getAttribute('data-count')) === expected.length)
  check('A594 ★ rien n’est résolu au chargement (aucune écriture)', (await stored(o.page)) === null)
  const b = await centreOf(o.page, '[data-testid="regions-overlaps"]')
  await h.tap(b.x, b.y)
  const rows = o.page.locator('[data-testid^="overlap-focus-"]')
  check(`A594 ★ chaque conflit est listé (${await rows.count()})`, (await rows.count()) === expected.length)
  const rule = (await o.page.locator('[data-testid="overlaps-rule"]').innerText()).trim()
  check(`A594 ★ la règle est ÉCRITE, en une phrase (« ${rule} »)`, /ציירתם בעצמכם/.test(rule) && /הקטן/.test(rule) && rule.split(/[.!?]\s/).length === 1)
  const plan = planResolutions(regions)
  const shown = await o.page.locator('[data-testid^="overlap-"][data-winner]').evaluateAll((els) => els.map((e) => ({ key: (e as HTMLElement).dataset.testid!.replace('overlap-', ''), winner: (e as HTMLElement).dataset.winner, loser: (e as HTMLElement).dataset.loser, n: Number((e as HTMLElement).dataset.dunams), text: (e as HTMLElement).innerText })))
  const agree = plan.steps.every((s) => shown.some((x) => x.key === s.key && x.winner === s.winner && x.loser === s.loser && Math.abs(x.n - Math.round(s.dunams)) <= 1))
  check('A594 ★ chaque ligne : les deux régions, la surface en litige, à qui elle va (la règle), ce que perd l’autre', agree && shown.every((x) => /דונם במחלוקת/.test(x.text) && /יישאר אצל|אי אפשר/.test(x.text)))
  const jn = shown.find((x) => x.key === 'judea|negev')
  check(`A594 « יהודה ↔ הנגב » (le plus grand) : à יהודה, la plus petite (${jn?.n} ד׳)`, jn?.winner === 'judea' && jn?.loser === 'negev')
  check('A594 ★ le terrain disputé est HACHURÉ sur la carte, conflit par conflit', (await o.page.locator('[data-testid^="overlap-area-"]').count()) === expected.length)
  const f = await centreOf(o.page, '[data-testid="overlap-focus-judea|negev"]')
  await h.tap(f.x, f.y)
  await o.page.waitForTimeout(800)
  check('A594 toucher un conflit : la carte le cadre, et montre le nouveau bord du perdant', (await o.page.locator('[data-testid="overlap-result-judea|negev"]').count()) === 1)
  await o.page.screenshot({ path: `${SHOTS}/a594-recouvrements.png` })
  check('A594 ★ regarder n’écrit RIEN', (await stored(o.page)) === null)
  await o.ctx.close()
})

// ===========================================================================
await guard('A595', async () => {
  section('A595 — ★ refuser un partage, appliquer les autres, revenir en arrière')
  const { o, h, db } = await openRegions(DEVICES[0])
  await o.page.locator('[data-testid="regions-overlaps"]').click()
  await o.page.locator('[data-testid="overlap-toggle-judea|negev"]').click()
  check('A595 « אכריע בעצמי » sur יהודה ↔ הנגב', (await o.page.locator('[data-testid="overlap-judea|negev"]').getAttribute('data-refused')) === '1')
  check('A595 toujours rien d’écrit', (await stored(o.page)) === null)
  await o.page.locator('[data-testid="overlaps-apply"]').click()
  await o.page.waitForTimeout(1200)
  const s1 = await stored(o.page)
  const regions = REGIONS.map((r) => ({ id: r.id, ring: RING(r.id), drawn: false }))
  const plan = planResolutions(regions, new Set(['judea|negev']))
  const losers = [...new Set(plan.steps.filter((s) => s.result.ok && !s.refused).map((s) => s.loser))].sort()
  check(`A595 ★ seuls les PERDANTS acceptés sont écrits (${Object.keys(s1 ?? {}).sort().join(', ')})`, JSON.stringify(Object.keys(s1 ?? {}).sort()) === JSON.stringify(losers))
  const after = REGIONS.map((r) => ({ id: r.id, ring: s1?.[r.id] ? asRing(s1[r.id]) : RING(r.id), drawn: !!s1?.[r.id] }))
  const left = overlapsOf(after)
  check(`A595 ★ il ne reste QUE le conflit refusé (${left.map((x) => `${x.a}|${x.b}`).join(', ')})`, left.length === 1 && `${left[0].a}|${left[0].b}` === 'judea|negev')
  check(`A595 le bouton recompte : ${await o.page.locator('[data-testid="regions-overlaps"]').getAttribute('data-count')}`, Number(await o.page.locator('[data-testid="regions-overlaps"]').getAttribute('data-count')) === 1)
  await until(() => db.rows('user_setting_values').some((r) => r.key === 'lo-yanum:region-rings' && r.user_id === USER_ID))
  check('A595 … et c’est parti sur le COMPTE', db.rows('user_setting_values').some((r) => r.key === 'lo-yanum:region-rings' && r.user_id === USER_ID))
  check(`A595 la barre dit ce qui a été fait (« ${(await o.page.locator('[data-testid="overlaps-done"]').innerText().catch(() => '')).trim()} »)`, (await o.page.locator('[data-testid="overlaps-done"]').count()) === 1)
  await o.page.screenshot({ path: `${SHOTS}/a595-applique.png` })
  await o.page.locator('[data-testid="overlaps-revert"]').click()
  await o.page.waitForTimeout(1000)
  const s2 = await stored(o.page)
  check('A595 ★ « ביטול הפתרון » : les régions jamais redessinées redeviennent celles d’origine (plus rien d’écrit)', s2 === null || Object.keys(s2).length === 0)
  check(`A595 … et les ${regions.length > 0 ? overlapsOf(regions).length : 0} conflits sont revenus`, Number(await o.page.locator('[data-testid="regions-overlaps"]').getAttribute('data-count')) === overlapsOf(regions).length)
  await o.ctx.close()
})

// ===========================================================================
for (const dev of devices) {
  const D = dev.name
  await guard(`A596-${D}`, async () => {
    section(`A596 (${D}) — ★ le poussage en direct`)
    const { o, h } = await openRegions(dev)
    await pickRegion(h, 'sharon')
    await frame(o.page, { lat: 32.2, lng: 34.95 }, 9.6)
    const n1 = await project(o.page, SHARON_1)
    const to = await project(o.page, PUSH_TO)
    check(`A596 (${D}) avant : aucune voisine poussée`, (await o.page.locator('[data-testid^="editor-neighbor-"]').count()) === 0)
    const release = await h.hold(n1.x, n1.y, to.x, to.y)
    const liveIds = await o.page.locator('[data-testid^="editor-neighbor-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!.replace('editor-neighbor-', '')))
    check(`A596 (${D}) ★ PENDANT le geste, la voisine bouge déjà (${liveIds.join(', ')})`, liveIds.includes('coastal-plain') && (await neighborRing(o.page, 'coastal-plain')) > 0)
    await o.page.screenshot({ path: `${SHOTS}/a596-${D}-pendant.png` })
    await release()
    check(`A596 (${D}) lâché : la barre dit qui a bougé (« ${(await o.page.locator('[data-testid="editor-pushed"]').innerText().catch(() => '')).trim()} »)`, /מישור החוף/.test(await o.page.locator('[data-testid="editor-pushed"]').innerText().catch(() => '')))
    check(`A596 (${D}) rien n’est encore écrit`, (await stored(o.page)) === null)
    const sv = await centreOf(o.page, '[data-testid="region-save"]')
    await h.tap(sv.x, sv.y)
    await o.page.waitForTimeout(800)
    const s = await stored(o.page)
    const sharon = s?.sharon ? asRing(s.sharon) : []
    const coastal = s?.['coastal-plain'] ? asRing(s['coastal-plain']) : []
    check(`A596 (${D}) ★ enregistrés ENSEMBLE : la région et sa voisine (${Object.keys(s ?? {}).join(', ')})`, sharon.length >= 3 && coastal.length >= 3)
    check(`A596 (${D}) ★ plus AUCUN recouvrement entre elles (${overlapDunams(sharon, coastal).toFixed(2)} ד׳)`, overlapDunams(sharon, coastal) < 1)
    /* Chaque voisine perd EXACTEMENT ce que la région a gagné sur ses terres. */
    const per = ['coastal-plain', 'samaria'].map((id) => {
      const now = s?.[id] ? asRing(s[id]) : RING(id)
      return { id, lost: landDunams(RING(id)) - landDunams(now), gained: gainedOn(RING('sharon'), sharon, RING(id)) }
    })
    check(`A596 (${D}) ★ chaque voisine perd ce que la région a gagné SUR ELLE, à 1 % près (${per.map((x) => `${x.id} ${Math.round(x.lost)}/${Math.round(x.gained)}`).join(' · ')})`, per[0].gained > 1000 && per.every((x) => Math.abs(x.lost - x.gained) <= Math.max(5, x.gained * 0.01)))
    check(`A596 (${D}) … et aucune voisine ne recouvre plus la région (Samarie : ${s?.samaria ? overlapDunams(sharon, asRing(s.samaria)).toFixed(2) : '0'} ד׳)`, !s?.samaria || overlapDunams(sharon, asRing(s.samaria)) < 1)
    /* Un geste, une annulation : la forme ET la voisine. */
    const undo = await centreOf(o.page, '[data-testid="editor-undo"]')
    await h.tap(undo.x, undo.y)
    check(`A596 (${D}) ★ UNE annulation : la voisine poussée n’est plus poussée`, (await o.page.locator('[data-testid^="editor-neighbor-"]').count()) === 0 && (await attr(o.page, 'data-undo')) === '0')
    await h.tap(sv.x, sv.y)
    await o.page.waitForTimeout(800)
    const s2 = await stored(o.page)
    const back = (id: string) => (s2?.[id] ? JSON.stringify(asRing(s2[id])) === JSON.stringify(RING(id)) : true)
    check(`A596 (${D}) ★ … et enregistré : la région ET la voisine sont revenues EXACTEMENT (${Object.keys(s2 ?? {}).join(', ') || 'rien de redessiné'})`, back('sharon') && back('coastal-plain') && back('samaria'))
    await o.ctx.close()
  })

  await guard(`A597-${D}`, async () => {
    section(`A597 (${D}) — ★ cas limite 1 : le recul laisse un vide, qui se voit et se comble`)
    const { o, h } = await openRegions(dev)
    await pickRegion(h, 'sharon')
    await frame(o.page, { lat: 32.2, lng: 34.95 }, 9.6)
    const n1 = await project(o.page, SHARON_1)
    const to = await project(o.page, PUSH_TO)
    await h.drag(n1.x, n1.y, to.x, to.y)
    const p1 = await project(o.page, PUSH_TO)
    const back = await project(o.page, BACK_TO)
    await h.drag(p1.x, p1.y, back.x, back.y)
    const gap = o.page.locator('[data-testid="editor-gap-coastal-plain"]')
    check(`A597 (${D}) ★ reculé : la voisine NE repousse PAS — il reste un VIDE, hachuré (${await gap.first().getAttribute('data-dunams').catch(() => '?')} ד׳)`, (await gap.count()) >= 1 && Number(await gap.first().getAttribute('data-dunams')) > 1000)
    const note = o.page.locator('[data-testid="editor-gap-note-coastal-plain"]')
    check(`A597 (${D}) ★ la barre le nomme (« ${(await note.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()} »)`, /רווח/.test(await note.innerText().catch(() => '')) && /מישור החוף/.test(await note.innerText()))
    await o.page.screenshot({ path: `${SHOTS}/a597-${D}-vide.png` })
    const fill = await centreOf(o.page, '[data-testid="editor-fill-gap-coastal-plain"]')
    await h.tap(fill.x, fill.y)
    check(`A597 (${D}) ★ « מילוי הרווח » : le vide disparaît`, (await gap.count()) === 0)
    const sv = await centreOf(o.page, '[data-testid="region-save"]')
    await h.tap(sv.x, sv.y)
    await o.page.waitForTimeout(800)
    const s = await stored(o.page)
    const sharon = asRing(s!.sharon)
    const coastal = s?.['coastal-plain'] ? asRing(s['coastal-plain']) : RING('coastal-plain')
    check(`A597 (${D}) ★ la voisine s’étend JUSQU’À la nouvelle limite : ni recouvrement (${overlapDunams(sharon, coastal).toFixed(2)} ד׳)…`, overlapDunams(sharon, coastal) < 1)
    const untouched = landDunams(RING('coastal-plain')) - overlapDunams(RING('coastal-plain'), sharon)
    check(`A597 (${D}) … ni vide (${Math.round(landDunams(coastal))} / ${Math.round(untouched)} ד׳)`, Math.abs(landDunams(coastal) - untouched) / untouched < 0.002)
    const undo = await centreOf(o.page, '[data-testid="editor-undo"]')
    await h.tap(undo.x, undo.y)
    check(`A597 (${D}) une annulation rouvre le vide (le comblement était UN geste)`, (await gap.count()) >= 1)
    await o.ctx.close()
  })

  await guard(`A598-${D}`, async () => {
    section(`A598 (${D}) — ★ cas limite 2 : couper la voisine en deux, refusé`)
    const { o, h } = await openRegions(dev)
    await pickRegion(h, 'sharon')
    await frame(o.page, { lat: 31.85, lng: 34.95 }, 8.6)
    const n1 = await project(o.page, SHARON_1)
    /* Tirer le point à travers tout le מישור החוף, jusque dans le Néguev. */
    const deep = await project(o.page, { lat: 31.4, lng: 34.9 })
    await h.drag(n1.x, n1.y, deep.x, deep.y, 40)
    const notice = (await o.page.locator('[data-testid="editor-notice"]').innerText().catch(() => '')).trim()
    check(`A598 (${D}) ★ le poussage s’ARRÊTE, et c’est dit (« ${notice} »)`, /הדחיפה נעצרה/.test(notice) && /לשני חלקים/.test(notice))
    const now = await centreOf(o.page, '[data-testid="editor-node-1"]')
    const at = await unproject(o.page, now.x, now.y)
    check(`A598 (${D}) ★ le point s’est arrêté AVANT de couper (lat ${at.lat.toFixed(3)} > 31,5 : il n’est pas allé au doigt, 31,4)`, at.lat > 31.5 && Math.hypot(now.x - deep.x, now.y - deep.y) > 10)
    await o.page.screenshot({ path: `${SHOTS}/a598-${D}-arret.png` })
    const sv = await centreOf(o.page, '[data-testid="region-save"]')
    await h.tap(sv.x, sv.y)
    await o.page.waitForTimeout(800)
    const s = await stored(o.page)
    const coastal = s?.['coastal-plain'] ? asRing(s['coastal-plain']) : RING('coastal-plain')
    const pieces = polygonClipping.difference(toPolygon(RING('coastal-plain')), toPolygon(asRing(s!.sharon))).filter((p) => shapeDunams([p]) > 1)
    check(`A598 (${D}) ★ enregistré : la voisine est d’UN seul tenant (${pieces.length} morceau), et ne recouvre pas la région`, coastal.length >= 3 && overlapDunams(asRing(s!.sharon), coastal) < 1 && pieces.length === 1)
    await o.ctx.close()
  })
}

// ===========================================================================
await guard('A599', async () => {
  section('A599 — ★ rien n’est enregistré avant « שמור גבול »')
  const { o, h, db } = await openRegions(DEVICES[0])
  await pickRegion(h, 'sharon')
  await frame(o.page, { lat: 32.2, lng: 34.95 }, 9.6)
  const n1 = await project(o.page, SHARON_1)
  const to = await project(o.page, PUSH_TO)
  await h.drag(n1.x, n1.y, to.x, to.y)
  await o.page.waitForTimeout(1500)
  check('A599 ★ poussé, pas enregistré : rien sur l’appareil, rien sur le compte', (await stored(o.page)) === null && !db.rows('user_setting_values').some((r) => r.key === 'lo-yanum:region-rings'))
  await o.page.locator('[data-testid="region-discard"]').click()
  await o.page.waitForTimeout(800)
  check('A599 ★ « בטל שינויים » : la région ET la voisine reviennent, rien n’est écrit', (await stored(o.page)) === null && (await o.page.locator('[data-testid^="editor-neighbor-"]').count()) === 0)
  await o.ctx.close()
})

// ===========================================================================
await guard('A600', async () => {
  section('A600 — ★ aucune perte : ouvrir sans geste n’écrit rien ; les formes d’une ferme ne se poussent pas')
  const { o, h } = await openRegions(DEVICES[0])
  for (const r of REGIONS) {
    await pickRegion(h, r.id)
  }
  await o.page.locator('[data-testid="editor-done"]').click()
  await o.page.waitForTimeout(800)
  check('A600 ★ les 13 régions ouvertes l’une après l’autre, sans geste : rien n’est écrit', (await stored(o.page)) === null)
  await o.ctx.close()
  /* La ferme : sa limite est DANS son pâturage, et doit le rester. */
  const db = new FakeDb()
  seed(db)
  const FARM = 'farm-ak1-11'
  const f = db.rows('entities').find((x) => x.id === FARM)!
  const c = { lat: Number(f.lat), lng: Number(f.lng) }
  const ring = (n: number, rl: number, rg: number) => Array.from({ length: n }, (_, i) => ({ lat: c.lat + rl * Math.sin((i / n) * 2 * Math.PI), lng: c.lng + rg * Math.cos((i / n) * 2 * Math.PI) }))
  const put = (id: string, kind: string, r: LatLng[]) => {
    const at = new Date().toISOString()
    db.rows('zones').push({ id, entity_id: FARM, kind, created_at: at, updated_at: at })
    r.forEach((v, position) => db.rows('zone_vertices').push({ zone_id: id, position, lat: v.lat, lng: v.lng }))
  }
  put('zone-tp-b', 'farm_boundary', ring(10, 0.003, 0.004))
  put('zone-tp-g', 'grazing_area', ring(10, 0.012, 0.014))
  const g0 = JSON.stringify(db.rows('zone_vertices').filter((v) => v.zone_id === 'zone-tp-g'))
  const q = await open(1440, { db, height: 900, init: { 'lo-yanum:map-mode:farm-detail': 'full', [`lo-yanum:farm-tab:${FARM}`]: 'terrain' } })
  await go(q.page, APP, `/coordinator/farms/${FARM}`, 7000)
  await frame(q.page, c, 14.5)
  const inB = await project(q.page, { lat: c.lat - 0.0012, lng: c.lng + 0.0022 })
  await q.page.mouse.click(inB.x, inB.y)
  await q.page.waitForTimeout(600)
  if ((await q.page.locator('[data-testid="shape-pick-zone-tp-b"]').count()) > 0) await q.page.locator('[data-testid="shape-pick-zone-tp-b"]').click()
  await q.page.waitForTimeout(800)
  const n0 = await centreOf(q.page, '[data-testid="editor-node-0"]')
  await q.page.mouse.move(n0.x, n0.y)
  await q.page.mouse.down()
  await q.page.mouse.move(n0.x + 60, n0.y, { steps: 10 })
  await q.page.mouse.up()
  await q.page.waitForTimeout(1500)
  check('A600 ★ ferme : la limite déplacée, le pâturage qui l’entoure n’est PAS recoupé (formes emboîtées)', JSON.stringify(db.rows('zone_vertices').filter((v) => v.zone_id === 'zone-tp-g')) === g0 && (await q.page.locator('[data-testid^="editor-neighbor-"]').count()) === 0)
  await q.ctx.close()
})

// ===========================================================================
await guard('A602', async () => {
  section('A602 — ★ 3.2 option A : les frontières retenues coupent les régions, partout')
  const { o, h } = await openRegions(DEVICES[1])
  const jv = RING('jordan-valley')
  const land = Math.round(landDunams(jv))
  const pill = Number((await o.page.locator('[data-testid="region-area-jordan-valley"]').innerText()).replace(/[^\d]/g, ''))
  check(`A602 ★ « ${NAME('jordan-valley')} » : la pastille dit sa surface EN DEÇÀ du Jourdain (${pill} = ${land} ; au-delà : ${Math.round((abroadDunams(jv).jordan ?? 0) / 1000)} km²)`, Math.abs(pill - land) <= 1)
  await pickRegion(h, 'jordan-valley')
  check('A602 la barre dit la même surface', Number(await attr(o.page, 'data-area')) === land)
  const part = o.page.locator('[data-testid="region-abroad-part"]')
  check(`A602 ★ et elle DIT ce qui est retiré, et où (« ${(await part.innerText().catch(() => '')).trim()} »)`, (await part.getAttribute('data-zones').catch(() => '')) === 'jordan' && /ירדן/.test(await part.innerText().catch(() => '')))
  const wash = await o.page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap: { getSource(id: string): { _data?: { features?: Array<{ properties?: { id?: string }; geometry: { coordinates: number[][][] } }> } } | undefined } }).__loYanumMap
    return (m.getSource('zones')?._data?.features ?? []).filter((x) => String(x.properties?.id ?? '').startsWith('region-jordan-valley')).map((x) => x.geometry.coordinates[0])
  })
  const washArea = wash.reduce((sum, r) => sum + landDunams(r.map(([lng, lat]) => ({ lat, lng }))), 0)
  check(`A602 ★ l’aplat s’arrête au Jourdain (${Math.round(washArea)} / ${land})`, wash.length >= 1 && Math.abs(washArea - land) / land < 0.002)
  await pickRegion(h, 'judea')
  check('A602 ★ « יהודה » (Judée-Samarie gardée) : rien au-delà, aucune mention', (await part.count()) === 0)
  await o.page.screenshot({ path: `${SHOTS}/a602-frontiere.png` })
  check('A602 rien n’est écrit', (await stored(o.page)) === null)
  await o.ctx.close()

  /* Les autres cartes : la couche « אזורים » de la légende, allumée. */
  const db = new FakeDb()
  seed(db)
  const q = await open(1440, { db, height: 900, init: { 'lo-yanum:map-layers': JSON.stringify({ __v: 2, regions: true, regionColors: true, entities: true }) } })
  await go(q.page, APP, '/coordinator/farms', 6000)
  const layer = await q.page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getSource(id: string): { _data?: { features?: Array<{ properties?: { id?: string }; geometry: { type: string; coordinates: number[][][][] } }> } } | undefined } }).__loYanumMap
    const f = (m?.getSource('regions')?._data?.features ?? []).find((x) => x.properties?.id === 'golan')
    return f ? { type: f.geometry.type, polys: f.geometry.coordinates.map((p) => p[0]) } : null
  })
  const golanLand = landDunams(RING('golan'))
  const got = (layer?.polys ?? []).reduce((sum, r) => sum + landDunams(r.map(([lng, lat]) => ({ lat, lng }))), 0)
  check(`A602 ★ la couche « אזורים » des autres cartes : רמת הגולן s’arrête au cessez-le-feu (${Math.round(got / 1000)} / ${Math.round(golanLand / 1000)} km² ; tracée ${Math.round(landDunams(RING('golan')) / 1000 + (abroadDunams(RING('golan')).syria ?? 0) / 1000)})`, layer?.type === 'MultiPolygon' && Math.abs(got - golanLand) / golanLand < 0.002)
  await q.ctx.close()
})

await finish()
