import { mkdirSync } from 'node:fs'

import type { Page } from 'playwright'

import { REMOTE, check, finish, go, guard, open, section, serveBuild } from './ayharness'
import { BE_MEETING, beDb } from './befixture'
import type { FakeDb } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BE — AU RENDU.   A445 · A446 · A447 · A448 · A449
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run beui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run beui    # le DÉPLOYÉ
 *
 * Build réel (ou bundle déployé) + base FACTICE aux noms INVENTÉS
 * (`scripts/befixture.ts`). Rien n'est écrit sur `lo-yanum-prod`. Le doigt est
 * un VRAI doigt : des `touchStart / touchMove / touchEnd` envoyés au moteur
 * (CDP), qui en fait des événements de pointeur — c'est-à-dire que
 * `touch-action`, le défilement et `preventDefault` jouent comme sur un
 * téléphone.
 *
 *   A445  L'AGENDA À 390 PX : ouvrir un rendez-vous garde le calendrier
 *         visible ; modifier ne change pas de contenant ; toucher un créneau
 *         vide crée un rendez-vous (le curseur dans le titre) ; le
 *         glisser-déposer au doigt, au quart d'heure ; le bord inférieur
 *         allonge ; un reflet ne se déplace pas et mène à sa source
 *   A446  L'AGENDA À 1440 PX : le panneau À CÔTÉ du calendrier, la
 *         modification dans le même panneau ; la souris déplace sans appui long
 *   A447  LES TÂCHES À 390 PX : plier / déplier, tout d'un coup ; réordonner
 *         au doigt (ordre gardé en base) ; cocher → un instant → les archives,
 *         « ביטול » ; créer d'un geste (champ de dictée) ; cibles à 44 px
 *   A448  L'AIDE-MÉMOIRE À 390 PX : l'hébreu lisible à bout de bras, la
 *         recherche filtre les trois banques, une ligne devient une tâche
 *   A449  DEPUIS UNE FICHE : une tâche déjà reliée d'un geste, un rendez-vous
 *         déjà relié dans l'agenda ; rien ne défile de côté à 390 px
 */

const OUT = process.env.DIST ?? 'dist-beui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5463), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/be/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

const row = (d: FakeDb, table: string, id: string) => d.rows(table).find((r) => r.id === id) as Record<string, unknown> | undefined
const waitFor = async (page: Page, ok: () => boolean, ms = 6000): Promise<boolean> => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (ok()) return true
    await page.waitForTimeout(150)
  }
  return ok()
}
const minutesOf = (iso: unknown): number => {
  const d = new Date(String(iso))
  return d.getHours() * 60 + d.getMinutes()
}

/** Un vrai doigt : appui (tenu `hold` ms), glissement en `steps` pas, relâché. */
async function finger(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold = 0, steps = 10): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  if (hold) await page.waitForTimeout(hold)
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }] })
    await page.waitForTimeout(24)
  }
  await page.waitForTimeout(80)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

const center = async (page: Page, selector: string): Promise<{ x: number; y: number }> => {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`introuvable : ${selector}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** Amène un élément de la grille au milieu de sa fenêtre (jamais sous l'en-tête collé). */
async function reveal(page: Page, selector: string, offset = 180): Promise<void> {
  await page.evaluate(
    ([sel, off]) => {
      const grid = document.querySelector<HTMLElement>('[data-testid="agenda-grid"]')
      const el = document.querySelector<HTMLElement>(sel as string)
      if (!grid || !el) return
      grid.scrollTop += el.getBoundingClientRect().top - grid.getBoundingClientRect().top - (off as number)
    },
    [selector, offset] as const,
  )
  await page.waitForTimeout(250)
}

/** Ouvre l'agenda au téléphone, sur le volet de l'agenda, au jour du rendez-vous du banc. */
async function phoneAgenda(d: FakeDb): Promise<Page> {
  const o = await open(390, { db: d, height: 844, touch: true, init: { 'lo-yanum:map-mode:agenda': 'full' } })
  await go(o.page, APP, '/coordinator/agenda', 4000)
  // Le rendez-vous du banc est DEMAIN : un jour plus loin (« הבא », 3e bouton de la barre).
  await o.page.locator('[data-testid="agenda-controls"] button').nth(2).click()
  await o.page.waitForTimeout(600)
  return o.page
}

// ---------------------------------------------------------------------------
await guard('A445', async () => {
  section('A445 — l’agenda à 390 px')
  const d = beDb()
  const page = await phoneAgenda(d)
  const block = `[data-testid="agenda-event"][data-event-id="${BE_MEETING.id}"]`
  check('A445 le volet de l’agenda est à l’écran (la pilule l’a retenu)', (await page.locator('[data-testid="agenda-grid"]').isVisible()) && (await page.locator(block).count()) === 1)
  await reveal(page, block, 330)

  // Ouvrir : la feuille, le calendrier derrière.
  await page.locator(block).tap()
  await page.waitForTimeout(700)
  const shape = await page.evaluate((sel) => {
    const sheet = document.querySelector('[data-docked-sheet]')?.getBoundingClientRect()
    const grid = document.querySelector('[data-testid="agenda-grid"]')?.getBoundingClientRect()
    const ev = document.querySelector(sel)?.getBoundingClientRect()
    return { sheetTop: sheet?.top ?? 0, gridTop: grid?.top ?? 0, gridShown: sheet && grid ? Math.min(sheet.top, grid.bottom) - grid.top : 0, evTop: ev?.top ?? -1, evBottom: ev?.bottom ?? -1, url: location.hash }
  }, block)
  check('A445 ouvrir un rendez-vous NE QUITTE PAS l’agenda (même adresse)', /\/coordinator\/agenda/.test(shape.url) && (await page.locator('[data-testid="event-panel"][data-state="view"]').count()) === 1, shape.url)
  check('A445 … le calendrier reste VISIBLE au-dessus de la feuille', shape.gridShown > 60, `${Math.round(shape.gridShown)} px de grille visibles`)
  check('A445 … et le rendez-vous ouvert y est à l’écran', shape.evTop >= shape.gridTop - 2 && shape.evTop < shape.sheetTop, JSON.stringify(shape))
  await page.screenshot({ path: `${SHOTS}/a445-consulter-390.png` })
  const sheetBefore = await page.locator('[data-docked-sheet]').elementHandle()
  await page.locator('[data-testid="event-edit"]').tap()
  await page.waitForTimeout(500)
  const same = await page.evaluate((el) => el === document.querySelector('[data-docked-sheet]'), sheetBefore)
  check('A445 modifier NE CHANGE PAS DE CONTENANT (la même feuille se remplit de champs)', same && (await page.locator('[data-docked-sheet] [data-testid="event-panel"][data-state="edit"]').count()) === 1)
  const fields = await page.locator('[data-docked-sheet] textarea[data-dictation]').count()
  check('A445 … les champs de texte sont des champs de dictée (textarea)', fields >= 4 && (await page.locator('[data-docked-sheet] input[type="text"]').count()) <= 1, `${fields} textarea`)
  await page.screenshot({ path: `${SHOTS}/a445-modifier-390.png` })
  await page.locator('[data-testid="meeting-editor-cancel"]').tap()
  await page.locator('[data-testid="agenda-sheet-close"]').tap()
  await page.waitForTimeout(400)

  // Toucher un créneau vide : un rendez-vous, le curseur dans le titre.
  const slot = page.locator('[data-testid="agenda-slot"][data-hour="10"]').first()
  await reveal(page, '[data-testid="agenda-slot"][data-hour="10"]')
  const sb = await slot.boundingBox()
  await page.touchscreen.tap(sb!.x + sb!.width / 2, sb!.y + sb!.height * 0.55)
  await page.waitForTimeout(900)
  const focus = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
  check('A445 toucher un créneau vide ouvre le panneau, le curseur DANS LE TITRE', focus === 'meeting-editor-title' && (await page.locator('[data-testid="event-panel"][data-state="new"]').count()) === 1, String(focus))
  check('A445 … le créneau est marqué dans la grille (en pointillé), à 10:30', /10:30/.test((await page.locator('[data-testid="agenda-draft"]').innerText().catch(() => '')) ?? ''))
  await page.keyboard.type('פגישה מהגריד')
  await page.locator('[data-testid="meeting-editor-save"]').tap()
  const created = await waitFor(page, () => d.rows('general_meetings').some((r) => r.title === 'פגישה מהגריד'))
  const made = d.rows('general_meetings').find((r) => r.title === 'פגישה מהגריד')
  check('A445 … un seul champ obligatoire : le titre, et le rendez-vous existe (en base, 10:30–11:30)', created && minutesOf(made?.at) === 630 && minutesOf(made?.end_at) === 690, `${made?.at} → ${made?.end_at}`)
  check('A445 … le panneau passe à la consultation du rendez-vous créé (même feuille)', (await page.locator('[data-docked-sheet] [data-testid="event-panel"][data-state="view"]').count()) === 1)
  await page.screenshot({ path: `${SHOTS}/a445-cree-390.png` })
  await page.locator('[data-testid="agenda-sheet-close"]').tap()
  await page.waitForTimeout(400)

  // Le glisser-déposer AU DOIGT : appui tenu, une heure plus bas, au quart d'heure.
  await reveal(page, block, 120)
  const hour = Number(await page.locator('[data-testid="agenda-grid"]').getAttribute('data-hour-height'))
  const before = minutesOf(row(d, 'general_meetings', BE_MEETING.id)?.at)
  const from = await center(page, block)
  const cdpMid = { x: from.x, y: from.y - 8 }
  // Pendant le geste, on regarde ce que le bloc annonce.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [cdpMid] })
  await page.waitForTimeout(420)
  const target = hour + 6
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cdpMid.x, y: cdpMid.y + (target * i) / 10 }] })
    await page.waitForTimeout(24)
  }
  await page.waitForTimeout(120)
  const live = await page.evaluate(() => ({
    dragging: !!document.querySelector('[data-testid="agenda-event"][data-dragging="1"]'),
    ghost: !!document.querySelector('[data-testid="agenda-ghost"]'),
    label: document.querySelector('[data-testid="agenda-drag-time"]')?.textContent ?? '',
  }))
  await page.screenshot({ path: `${SHOTS}/a445-glisser-390.png` })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  check('A445 au doigt : l’appui tenu ARME le bloc (il se soulève, son ancienne place en pointillé)', live.dragging && live.ghost, JSON.stringify(live))
  check('A445 … il annonce sa nouvelle heure pendant le geste (« 15:30–17:00 »)', live.label.replace(/\s/g, '') === '15:30–17:00', live.label)
  const moved = await waitFor(page, () => minutesOf(row(d, 'general_meetings', BE_MEETING.id)?.at) !== before)
  const after = row(d, 'general_meetings', BE_MEETING.id)
  check('A445 … relâché : déplacé d’UNE HEURE, au quart d’heure, la durée gardée (en base)', moved && minutesOf(after?.at) === before + 60 && minutesOf(after?.end_at) - minutesOf(after?.at) === 90, `${before} → ${minutesOf(after?.at)}`)
  check('A445 … et « ביטול » est offert', (await page.locator('[data-testid="undo-toast-undo"]').count()) === 1)
  check('A445 … le relâcher n’a PAS ouvert le rendez-vous', (await page.locator('[data-docked-sheet]').count()) === 0)

  // Le bord inférieur : il allonge, au doigt, sans appui long.
  await page.waitForTimeout(400)
  const handle = `${block} [data-testid="agenda-resize"]`
  const hb = await center(page, handle)
  await finger(page, hb, { x: hb.x, y: hb.y + hour / 2 + 3 }, 0, 8)
  const longer = await waitFor(page, () => minutesOf(row(d, 'general_meetings', BE_MEETING.id)?.end_at) === minutesOf(after?.end_at) + 30)
  check('A445 le BORD INFÉRIEUR allonge la durée d’une demi-heure, au doigt', longer, `${minutesOf(after?.end_at)} → ${minutesOf(row(d, 'general_meetings', BE_MEETING.id)?.end_at)}`)

  // Le défilement de la grille reste au doigt (un glissement rapide n'arme rien).
  const scroller = page.locator('[data-testid="agenda-grid"]')
  const top0 = await scroller.evaluate((el) => el.scrollTop)
  const start = await center(page, block)
  await finger(page, start, { x: start.x, y: start.y - 160 }, 0, 6)
  const top1 = await scroller.evaluate((el) => el.scrollTop)
  check('A445 un glissement SANS appui tenu fait défiler la grille, et ne déplace rien', top1 !== top0 && minutesOf(row(d, 'general_meetings', BE_MEETING.id)?.at) === minutesOf(after?.at), `${top0} → ${top1}`)

  // Un reflet : il ne bouge pas, il mène à sa source.
  await page.locator('[data-testid="agenda-controls"] button').nth(1).tap() // « היום »
  await page.waitForTimeout(500)
  const tourBlock = '[data-testid="agenda-event"][data-kind="tour"]'
  await reveal(page, tourBlock, 120)
  const reflection = await page.locator(tourBlock).evaluate((el) => ({ reflection: el.getAttribute('data-reflection'), movable: el.getAttribute('data-movable'), dashed: getComputedStyle(el).borderStyle.includes('dashed'), hatch: getComputedStyle(el).backgroundImage.includes('gradient') }))
  check('A445 un itinéraire est dans l’agenda, et se DISTINGUE (hachuré, bord en tirets)', reflection.reflection === '1' && reflection.dashed && reflection.hatch, JSON.stringify(reflection))
  const depart0 = String(row(d, 'tours', 'tour-be-1')?.depart_at)
  const tb = await center(page, tourBlock)
  await finger(page, tb, { x: tb.x, y: tb.y + hour * 2 }, 420, 8)
  await page.waitForTimeout(600)
  check('A445 un REFLET ne se déplace pas depuis l’agenda (au doigt, rien n’est écrit)', reflection.movable === null && String(row(d, 'tours', 'tour-be-1')?.depart_at) === depart0)
  await page.locator(tourBlock).tap()
  await page.waitForTimeout(600)
  check('A445 … l’ouvrir montre ses étapes et ne propose PAS « עריכה »', (await page.locator('[data-testid="event-steps"] li').count()) === 3 && (await page.locator('[data-testid="event-edit"]').count()) === 0)
  await page.screenshot({ path: `${SHOTS}/a445-reflet-390.png` })
  await page.locator('[data-testid="event-open-source"]').tap()
  await page.waitForTimeout(1200)
  check('A445 … et mène à son écran d’origine EN UN GESTE (le planificateur, cette tournée)', await page.evaluate(() => /\/coordinator\/route/.test(location.hash)))
  const xs = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)
  check('A445 rien ne défile de côté', xs <= 1, `${xs}`)
})

// ---------------------------------------------------------------------------
await guard('A446', async () => {
  section('A446 — l’agenda à 1440 px')
  const d = beDb()
  const o = await open(1440, { db: d, height: 900, touch: false, init: { 'lo-yanum:map-mode:agenda': 'split' } })
  await go(o.page, APP, '/coordinator/agenda', 4000)
  const block = `[data-testid="agenda-event"][data-event-id="${BE_MEETING.id}"]`
  /* Demain est peut-être dans la semaine suivante (le banc tourne n'importe quel jour). */
  if ((await o.page.locator(block).count()) === 0) {
    await o.page.locator('[data-testid="agenda-controls"] button').nth(2).click()
    await o.page.waitForTimeout(500)
  }
  await o.page.locator(block).click()
  await o.page.waitForTimeout(500)
  const geo = await o.page.evaluate(() => {
    const grid = document.querySelector('[data-testid="agenda-grid"]')?.getBoundingClientRect()
    const panel = document.querySelector('[data-testid="agenda-side-panel"]')?.getBoundingClientRect()
    return { grid: grid ? Math.round(grid.width) : 0, panel: panel ? Math.round(panel.width) : 0, overlap: grid && panel ? Math.max(0, Math.min(grid.right, panel.right) - Math.max(grid.left, panel.left)) : -1 }
  })
  check('A446 le rendez-vous s’ouvre dans un panneau À CÔTÉ du calendrier (aucun recouvrement)', geo.grid > 700 && geo.panel > 300 && geo.overlap === 0, JSON.stringify(geo))
  const panelEl = await o.page.locator('[data-testid="agenda-side-panel"]').elementHandle()
  await o.page.locator('[data-testid="event-edit"]').click()
  await o.page.waitForTimeout(300)
  check('A446 modifier : le MÊME panneau se remplit de champs, le calendrier reste', (await o.page.evaluate((el) => el === document.querySelector('[data-testid="agenda-side-panel"]'), panelEl)) && (await o.page.locator('[data-testid="agenda-side-panel"] [data-state="edit"]').count()) === 1 && (await o.page.locator('[data-testid="agenda-grid"]').isVisible()))
  await o.page.screenshot({ path: `${SHOTS}/a446-panneau-1440.png` })
  await o.page.locator('[data-testid="meeting-editor-cancel"]').click()
  await o.page.locator('[data-testid="event-panel-close"]').click()
  check('A446 fermé : les tâches reviennent à leur place', (await o.page.locator('[data-testid="tasks-pane"]').count()) === 1)
  // La souris : pas d'appui long, un glissement suffit ; une demi-heure plus tôt.
  const hour = Number(await o.page.locator('[data-testid="agenda-grid"]').getAttribute('data-hour-height'))
  const before = minutesOf(row(d, 'general_meetings', BE_MEETING.id)?.at)
  const c = await center(o.page, block)
  await o.page.mouse.move(c.x, c.y)
  await o.page.mouse.down()
  for (let i = 1; i <= 8; i++) await o.page.mouse.move(c.x, c.y - ((hour / 2) * i) / 8)
  await o.page.mouse.up()
  const ok = await waitFor(o.page, () => minutesOf(row(d, 'general_meetings', BE_MEETING.id)?.at) === before - 30)
  check('A446 à la souris, le bloc se déplace sans appui long (une demi-heure plus tôt)', ok, `${before} → ${minutesOf(row(d, 'general_meetings', BE_MEETING.id)?.at)}`)
  check('A446 le panneau d’un reflet propose sa source, pas « עריכה »', await (async () => {
    await o.page.locator('[data-testid="agenda-controls"] button').nth(1).click()
    await o.page.waitForTimeout(400)
    await o.page.locator('[data-testid="agenda-event"][data-kind="tour"]').click()
    await o.page.waitForTimeout(400)
    return (await o.page.locator('[data-testid="event-open-source"]').count()) === 1 && (await o.page.locator('[data-testid="event-edit"]').count()) === 0
  })())
})

// ---------------------------------------------------------------------------
await guard('A447', async () => {
  section('A447 — les tâches à 390 px')
  const d = beDb()
  const o = await open(390, { db: d, height: 844, touch: true, init: { 'lo-yanum:map-mode:agenda': 'hidden', 'lo-yanum:tasks:tab': 'tl-be-1' } })
  const page = o.page
  await go(page, APP, '/coordinator/agenda', 4000)
  check('A447 au téléphone, le volet des tâches est seul, la pilule à deux crans', (await page.locator('[data-testid="tasks-pane"]').isVisible()) && !(await page.locator('[data-testid="agenda-grid"]').isVisible()) && (await page.locator('[data-testid="map-mode-pill"] button').count()) === 2)
  const rows = page.locator('[data-testid="task-row"]')
  const n = await rows.count()
  check('A447 une tâche montre son TITRE SEUL par défaut', n === 5 && (await page.locator('[data-testid="task-details"]').count()) === 0, `${n} tâches`)
  await rows.first().locator('[data-testid="task-title"]').tap()
  check('A447 … un toucher la déplie (note, lien, gestes)', (await page.locator('[data-testid="task-details"]').count()) === 1 && /רכז/.test(await page.locator('[data-testid="task-note"]').first().innerText()))
  await page.locator('[data-testid="tasks-toggle-all"]').tap()
  check('A447 UN geste déplie TOUT', (await page.locator('[data-testid="task-details"]').count()) === n)
  await page.screenshot({ path: `${SHOTS}/a447-deplie-390.png` })
  await page.locator('[data-testid="tasks-toggle-all"]').tap()
  check('A447 … et le même replie tout (pour réordonner des lignes courtes)', (await page.locator('[data-testid="task-details"]').count()) === 0)

  // Les cibles à 44 px.
  const small = await page.evaluate(() => {
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-testid="tasks-pane"] button, [data-testid="tasks-pane"] [role="tab"]'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.width < 43.5 || r.height < 43.5) out.push(`${el.getAttribute('data-testid') ?? el.textContent?.slice(0, 12)} ${Math.round(r.width)}×${Math.round(r.height)}`)
    }
    return out
  })
  check('A447 toutes les cibles du volet font 44 px au moins', small.length === 0, small.slice(0, 6).join(' | '))

  // Réordonner AU DOIGT, par la poignée : la 4e en tête.
  const order0 = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))
  const g4 = await (async () => {
    const b = await rows.nth(3).locator('[data-testid="task-grip"]').boundingBox()
    return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 }
  })()
  const g1 = await (async () => {
    const b = await rows.nth(0).locator('[data-testid="task-grip"]').boundingBox()
    return { x: b!.x + b!.width / 2, y: b!.y + 4 }
  })()
  await finger(page, g4, g1, 0, 12)
  await page.waitForTimeout(500)
  const order1 = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))
  check('A447 RÉORDONNER AU DOIGT : la 4e tâche, glissée par sa poignée, passe en tête', order1[0] === order0[3] && order1.length === order0.length, `${order0.join(',')} → ${order1.join(',')}`)
  const kept = await waitFor(page, () => {
    const list = d.rows('tasks').filter((r) => r.list_id === 'tl-be-1' && r.done_at == null).sort((a, b) => Number(a.rank) - Number(b.rank))
    return list.map((r) => r.id).join(',') === order1.join(',')
  })
  check('A447 … et l’ORDRE EST GARDÉ (en base, dans le même ordre)', kept)
  await page.reload()
  await page.waitForTimeout(3500)
  const order2 = await page.locator('[data-testid="task-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))
  check('A447 … y compris après un rechargement', order2.join(',') === order1.join(','), order2.join(','))

  // Cocher : visible un instant, puis les archives ; « ביטול ».
  const victim = order2[1] as string
  await page.locator(`[data-task-id="${victim}"] [data-testid="task-check"]`).tap()
  await page.waitForTimeout(400)
  check('A447 cochée : elle reste VISIBLE un instant, barrée', (await page.locator(`[data-testid="task-row"][data-task-id="${victim}"][data-done="1"]`).count()) === 1)
  check('A447 … en base, faite', await waitFor(page, () => row(d, 'tasks', victim)?.done_at != null))
  await page.waitForTimeout(3600)
  check('A447 … puis elle rejoint les ARCHIVES', (await page.locator(`[data-testid="task-row"][data-task-id="${victim}"]`).count()) === 0 && (await page.locator('[data-testid="tasks-archive"]').getAttribute('data-count')) === '1')
  await page.locator('[data-testid="tasks-archive-toggle"]').tap()
  await page.locator(`[data-testid="task-archived"][data-task-id="${victim}"] [data-testid="task-restore"]`).tap()
  await page.waitForTimeout(400)
  check('A447 … les archives se rouvrent : la tâche revient à sa place', (await page.locator(`[data-testid="task-row"][data-task-id="${victim}"]`).count()) === 1 && (await waitFor(page, () => row(d, 'tasks', victim)?.done_at == null)))

  // Créer d'un geste, au champ de dictée.
  await page.locator('[data-testid="tasks-add"]').tap()
  await page.waitForTimeout(400)
  const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.getAttribute('data-testid'), dictation: document.activeElement?.hasAttribute('data-dictation') }))
  check('A447 « + משימה » : le champ s’ouvre, le curseur dedans, un champ de DICTÉE (textarea)', focus.tag === 'TEXTAREA' && focus.dictation === true, JSON.stringify(focus))
  await page.keyboard.type('משימה חדשה\nבשתי שורות')
  await page.locator('[data-testid="tasks-composer-save"]').tap()
  const createdOk = await waitFor(page, () => d.rows('tasks').some((r) => r.title === 'משימה חדשה\nבשתי שורות'))
  check('A447 … sur plusieurs lignes, enregistrée, posée EN TÊTE', createdOk && (await page.locator('[data-testid="task-row"]').first().innerText()).includes('בשתי שורות'))
  await page.screenshot({ path: `${SHOTS}/a447-taches-390.png` })
  const xs = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)
  check('A447 rien ne défile de côté', xs <= 1, `${xs}`)
})

// ---------------------------------------------------------------------------
await guard('A448', async () => {
  section('A448 — l’aide-mémoire à 390 px')
  const d = beDb()
  const o = await open(390, { db: d, height: 844, touch: true, init: { 'lo-yanum:map-mode:agenda': 'hidden', 'lo-yanum:tasks:tab': 'memo', 'lo-yanum:tasks:list': 'tl-be-2' } })
  const page = o.page
  await go(page, APP, '/coordinator/agenda', 4000)
  check('A448 l’onglet « עזר לשיחה » est à côté des listes', (await page.locator('[data-testid="tasks-tabs"] [data-testid="tasks-tab-memo"]').count()) === 1 && (await page.locator('[data-testid="memo-pane"]').isVisible()))
  const sizes = await page.evaluate(() => {
    const he = document.querySelector<HTMLElement>('[data-testid="memo-he"]')
    const fr = document.querySelector<HTMLElement>('[data-testid="memo-fr"]')
    return { he: he ? parseFloat(getComputedStyle(he).fontSize) : 0, fr: fr ? parseFloat(getComputedStyle(fr).fontSize) : 0, weight: he ? Number(getComputedStyle(he).fontWeight) : 0 }
  })
  check('A448 l’HÉBREU EN GRAND, lisible à bout de bras (≥ 20 px, gras), le français en petit', sizes.he >= 20 && sizes.weight >= 600 && sizes.fr < sizes.he * 0.75, JSON.stringify(sizes))
  check('A448 les trois banques sont là', (await page.locator('[data-testid="memo-bank"]').count()) === 3)
  await page.screenshot({ path: `${SHOTS}/a448-aide-memoire-390.png` })
  await page.locator('[data-testid="memo-search"]').fill('nuit')
  await page.waitForTimeout(300)
  const found = await page.locator('[data-testid="memo-bank"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-bank')}:${e.getAttribute('data-count')}`))
  check('A448 la recherche filtre les TROIS banques à la fois (« nuit » : institutions et volontaires)', found.join(',') === 'institutions:1,volunteers:1', found.join(','))
  await page.locator('[data-testid="memo-search"]').fill('שער')
  await page.waitForTimeout(300)
  const he = await page.locator('[data-testid="memo-bank"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-bank')))
  check('A448 … en hébreu aussi (« שער » : les agriculteurs)', he.join(',') === 'farmers', he.join(','))
  await page.screenshot({ path: `${SHOTS}/a448-recherche-390.png` })
  // Une ligne devient une tâche, d'un geste.
  const before = d.rows('tasks').length
  await page.locator('[data-testid="memo-line-text"]').first().tap()
  await page.locator('[data-testid="memo-to-task"]').tap()
  const made = await waitFor(page, () => d.rows('tasks').length === before + 1)
  const task = d.rows('tasks').find((r) => r.title === 'איפה נוח לחנות ליד השער?')
  check('A448 une ligne devient une TÂCHE d’un geste (son hébreu pour titre, dans la dernière liste)', made && task?.list_id === 'tl-be-2', String(task?.list_id))
  check('A448 … « ביטול » est offert', (await page.locator('[data-testid="undo-toast-undo"]').count()) === 1)
  // Sa propre ligne.
  await page.locator('[data-testid="memo-search-clear"]').tap()
  await page.locator('[data-testid="memo-bank"][data-bank="volunteers"] [data-testid="memo-add"]').first().tap()
  await page.waitForTimeout(300)
  await page.keyboard.type('שורה שלי')
  await page.locator('[data-testid="memo-editor-save"]').tap()
  check('A448 le PO ajoute SA ligne (son carnet)', await waitFor(page, () => d.rows('memo_lines').some((r) => r.he === 'שורה שלי' && r.bank === 'volunteers')))
})

// ---------------------------------------------------------------------------
await guard('A449', async () => {
  section('A449 — depuis une fiche')
  const d = beDb()
  const inst = String(d.rows('institutions')[0].id)
  const o = await open(390, { db: d, height: 844, touch: true })
  const page = o.page
  await go(page, APP, `/coordinator/institutions/${inst}`, 4000)
  await page.locator('[data-testid="linked-agenda"]').scrollIntoViewIfNeeded()
  check('A449 la fiche d’une institution porte ses rendez-vous et ses tâches', (await page.locator('[data-testid="linked-agenda"]').count()) === 1)
  await page.locator('[data-testid="linked-add-task"]').tap()
  await page.waitForTimeout(600)
  const focus = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
  check('A449 « + משימה » : la feuille, le curseur dans le titre, le lien DÉJÀ posé', focus === 'task-sheet-form-title' && (await page.locator('[data-testid="task-sheet-form-link"]').count()) === 1, String(focus))
  await page.keyboard.type('להתקשר מחר')
  await page.locator('[data-testid="task-sheet-form-save"]').tap()
  const ok = await waitFor(page, () => d.rows('tasks').some((r) => r.title === 'להתקשר מחר' && r.link_kind === 'institution' && r.link_id === inst))
  check('A449 … la tâche est reliée à la fiche, sans retaper un nom (en base)', ok)
  check('A449 … et la fiche la montre', await waitFor(page, () => true, 400).then(async () => (await page.locator('[data-testid="linked-task"]').count()) === 1))
  await page.locator('[data-testid="linked-add-meeting"]').tap()
  await page.waitForTimeout(1500)
  check('A449 « + פגישה » : l’agenda, le panneau ouvert, le lien DÉJÀ posé', /\/coordinator\/agenda/.test(await page.evaluate(() => location.hash)) && (await page.locator('[data-testid="meeting-editor-link"][data-linked="1"]').count()) === 1)
  await page.screenshot({ path: `${SHOTS}/a449-depuis-fiche-390.png` })
  const xs = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)
  check('A449 rien ne défile de côté', xs <= 1, `${xs}`)
})

await finish()
