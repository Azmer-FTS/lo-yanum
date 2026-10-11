import type { Page } from 'playwright'

import { FakeDb } from './fake-supabase'
import { CAPTURES, REMOTE, check, farms, finish, go, guard, open, section, seed, serveBuild, shots } from './ayharness'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AY1 — LES TROIS BUGS QUI BLOQUENT, AU RENDU.   A355 · A356 · A357
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run ayui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run ayui    # le DÉPLOYÉ
 *   DIST=dist-axui SKIP_BUILD=1 bun run ayui                      # le ROUGE (build d'AX)
 *
 * A355 : TOUS les champs chiffrés des écrans qui en ont, au CLAVIER (clic →
 *        valeur sélectionnée, la frappe remplace, ⌫ vide entièrement) ET au
 *        PAVÉ (même chose, puis fermeture sur un toucher ailleurs et au
 *        changement d'écran).
 * A356 : la carte de couverture avec la borne réelle du PO (3 minutes) dit
 *        qu'aucun lien ne tient et se rétablit d'un toucher ; le maillage
 *        revient (liens tracés).
 * A357 : deux appareils, une base : le sombre choisi sur l'un arrive et
 *        s'applique sur l'autre, sans recharger.
 */

const OUT = process.env.DIST ?? 'dist-ayui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5411), true))
console.log(`  app : ${APP}${REMOTE ? '  (DÉPLOYÉ)' : `  (build ${OUT})`}`)
const SHOTS = shots('ay1')

const FARM = farms.find((f) => !f.positionMissing) ?? farms[0]

/** Les écrans qui portent des champs chiffrés (relevés par `grep inputMode` et au rendu). */
const NUMERIC_SCREENS: Array<{ route: string; prep?: (p: Page) => Promise<void> }> = [
  { route: '/coordinator/coverage' },
  { route: '/coordinator/coverage', prep: async (p) => void (await p.locator('[data-testid="coverage-unit-min"]').click()) },
  { route: `/coordinator/farms/${FARM.id}/edit` },
  { route: '/coordinator/settings', prep: openAllBlocks },
  { route: '/coordinator/route/free' },
  { route: '/coordinator/volunteers/new' },
  { route: '/coordinator/drivers/new' },
]

async function openAllBlocks(p: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const closed = p.locator('main [data-testid^="block-"][aria-expanded="false"]')
    if ((await closed.count()) === 0) break
    await closed.first().click().catch(() => undefined)
    await p.waitForTimeout(80)
  }
}

/** Marque les champs chiffrés visibles ; rend leur nombre. */
async function markNumeric(p: Page): Promise<string[]> {
  return p.evaluate(() => {
    const out: string[] = []
    let n = 0
    document.querySelectorAll('[data-ay-num]').forEach((e) => e.removeAttribute('data-ay-num'))
    for (const el of document.querySelectorAll<HTMLInputElement>('main input, [role="dialog"] input')) {
      const mode = el.dataset.padMode ?? el.getAttribute('inputmode') ?? ''
      const numeric = ['numeric', 'decimal', 'tel'].includes(mode) || el.type === 'number' || el.type === 'tel'
      if (!numeric || el.readOnly || el.disabled) continue
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) continue
      el.setAttribute('data-ay-num', String(n++))
      out.push(el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.closest('label')?.querySelector('.label')?.textContent?.trim() || `#${n - 1}`)
    }
    return out
  })
}

const val = (p: Page, i: number) => p.locator(`[data-ay-num="${i}"]`).inputValue()

async function keyboardCase(p: Page, i: number, name: string, where: string): Promise<void> {
  const f = p.locator(`[data-ay-num="${i}"]`)
  // La première carte d'un contexte neuf charge lourdement : on attend le champ, puis on le montre.
  await f.waitFor({ state: 'attached', timeout: 15000 })
  await f.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const v0 = await f.inputValue()
  await f.click()
  await p.waitForTimeout(200)
  const sel = await f.evaluate((el: HTMLInputElement) => {
    try {
      return [el.selectionStart, el.selectionEnd, el.value.length]
    } catch {
      return [-1, -1, el.value.length]
    }
  })
  const selected = v0 === '' || (sel[0] === 0 && sel[1] === sel[2])
  await p.keyboard.type('7')
  await p.waitForTimeout(120)
  const typed = await val(p, i)
  await p.keyboard.press('Backspace')
  await p.waitForTimeout(80)
  await p.keyboard.press('Backspace')
  await p.waitForTimeout(120)
  const emptied = await val(p, i)
  check(
    `A355 clavier · ${where} · « ${name} » : clic = valeur sélectionnée, la frappe REMPLACE, ⌫ vide le champ`,
    selected && typed.replace(/\D/g, '') === '7' && emptied === '',
    `avant « ${v0} » · sélection ${sel.join('/')} · après « 7 » : « ${typed} » · après ⌫⌫ : « ${emptied} »`,
  )
  await p.keyboard.press('Tab')
}

async function padCase(p: Page, i: number, name: string, where: string): Promise<void> {
  const f = p.locator(`[data-ay-num="${i}"]`)
  // La première carte d'un contexte neuf charge lourdement : on attend le champ, puis on le montre.
  await f.waitFor({ state: 'attached', timeout: 15000 })
  await f.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const v0 = await f.inputValue()
  await f.click()
  await p.waitForTimeout(250)
  const pad = p.locator('[data-testid="numpad"]')
  const shown = (await pad.count()) === 1
  const key = (k: string) => p.locator(`[data-numpad-key="${k}"]`).click()
  if (!shown) {
    check(`A355 pavé · ${where} · « ${name} » : le pavé s'ouvre`, false)
    return
  }
  await key('4')
  await p.waitForTimeout(100)
  const replaced = await val(p, i)
  await key('back')
  await p.waitForTimeout(80)
  await key('back')
  await p.waitForTimeout(100)
  const emptied = await val(p, i)
  await key('2')
  await key('5')
  await p.waitForTimeout(100)
  const typed = await val(p, i)
  check(
    `A355 pavé · ${where} · « ${name} » : le premier chiffre REMPLACE, ⌫ vide entièrement, puis on retape`,
    replaced.replace(/\D/g, '') === '4' && emptied === '' && typed.replace(/\D/g, '') === '25',
    `avant « ${v0} » · « 4 » → « ${replaced} » · ⌫⌫ → « ${emptied} » · « 25 » → « ${typed} »`,
  )
}

// ===========================================================================
section('A355 — le pavé et le clavier, sur TOUS les champs chiffrés')
// ===========================================================================
await guard('A355', async () => {
  const seen: string[] = []
  const errors: string[] = []
  /* Un contexte NEUF par champ : taper dans l'un peut en masquer un autre (une
     surface « מעובד » fait passer la fiche en חקלאות), et vingt rechargements de
     carte dans un même onglet épuisent le rendu logiciel du navigateur de test. */
  const fresh = async (pad: boolean, s: (typeof NUMERIC_SCREENS)[number]) => {
    const o = pad ? await open(1032, { touch: true, numpad: true }) : await open(1440, { touch: false })
    await go(o.page, APP, s.route, 3000)
    if (s.prep) {
      await s.prep(o.page)
      await o.page.waitForTimeout(400)
    }
    const names = await markNumeric(o.page)
    return { o, names }
  }
  for (const pad of [false, true]) {
    for (const s of NUMERIC_SCREENS) {
      let { o, names } = await fresh(pad, s)
      if (!pad) seen.push(`${s.route}${s.prep ? ' (+)' : ''} : ${names.length} champ(s) — ${names.join(', ')}`)
      for (let i = 0; i < names.length; i++) {
        if (i > 0) {
          errors.push(...o.errors)
          await o.ctx.close()
          ;({ o } = await fresh(pad, s))
        }
        if (!pad) {
          await keyboardCase(o.page, i, names[i], s.route).catch((e) => check(`A355 clavier · ${s.route} · « ${names[i]} »`, false, (e as Error).message.split('\n')[0]))
        } else {
          await padCase(o.page, i, names[i], s.route).catch((e) => check(`A355 pavé · ${s.route} · « ${names[i]} »`, false, (e as Error).message.split('\n')[0]))
          // Fermer : un toucher sur le titre de l'écran (zone inerte).
          await o.page.locator('main h1').first().click({ force: true }).catch(() => undefined)
          await o.page.waitForTimeout(200)
          const closed = (await o.page.locator('[data-testid="numpad"]').count()) === 0
          check(`A355 pavé · ${s.route} · « ${names[i]} » : un toucher ailleurs ferme le pavé`, closed)
        }
      }
      errors.push(...o.errors)
      await o.ctx.close()
    }
  }
  check('A355 aucune erreur de page', errors.length === 0, errors.join(' | '))
  const t = await open(1032, { touch: true, numpad: true })
  // Fermer au changement d'écran.
  await go(t.page, APP, '/coordinator/coverage', 3000)
  await markNumeric(t.page)
  await t.page.locator('[data-ay-num="0"]').click()
  await t.page.waitForTimeout(250)
  const openBefore = (await t.page.locator('[data-testid="numpad"]').count()) === 1
  await t.page.evaluate(() => {
    window.location.hash = '#/coordinator/farms'
  })
  await t.page.waitForTimeout(1200)
  const goneAfter = (await t.page.locator('[data-testid="numpad"]').count()) === 0
  check('A355 pavé : quitter l’écran ferme le pavé', openBefore && goneAfter, `ouvert ${openBefore} · fermé après ${goneAfter}`)
  // « סיום » ferme.
  await go(t.page, APP, '/coordinator/coverage', 3000)
  await markNumeric(t.page)
  await t.page.locator('[data-ay-num="0"]').click()
  await t.page.waitForTimeout(250)
  await t.page.locator('[data-numpad-key="done"]').click()
  await t.page.waitForTimeout(200)
  check('A355 pavé : « סיום » ferme le pavé', (await t.page.locator('[data-testid="numpad"]').count()) === 0)
  await t.page.screenshot({ path: `${SHOTS}/a355-pave-ferme.png` })
  check('A355 aucune erreur de page (pavé)', t.errors.length === 0, t.errors.join(' | '))
  await t.ctx.close()
  console.log(`  écrans vérifiés :\n    ${seen.join('\n    ')}`)
})

// ===========================================================================
section('A356 — le maillage sur la carte de couverture (borne réelle du PO : 3 min)')
// ===========================================================================
await guard('A356', async () => {
  const PO_PREFS = JSON.stringify({ radiusKm: 35, minutes: 3, unit: 'min', nightPct: 0, visible: { signed: true, pipeline: true, leads: true, engaged: true, prospect: true } })
  const o = await open(1440, { init: { 'lo-yanum:coverage-map': PO_PREFS } })
  await go(o.page, APP, '/coordinator/coverage', 4000)
  const empty = o.page.locator('[data-testid="coverage-mesh-empty"]')
  await empty.waitFor({ timeout: 30_000 }).catch(() => undefined)
  const said = await empty.isVisible().catch(() => false)
  check('A356 une borne qui écarte TOUS les liens se dit (au lieu d’une carte muette)', said, said ? await empty.innerText() : 'aucun message')
  await o.page.screenshot({ path: `${SHOTS}/a356-borne-3-min.png` })
  await o.page.locator('[data-testid="coverage-mesh-reset"]').click({ timeout: 5000 }).catch(() => undefined)
  const linkCount = async () =>
    o.page.evaluate(() => {
      const map = (window as unknown as { __loYanumMap?: { getSource(id: string): unknown } }).__loYanumMap
      const src = map?.getSource('coverage-links') as { serialize?: () => { data?: { features?: unknown[] } } } | undefined
      return src?.serialize?.().data?.features?.length ?? 0
    })
  let n = 0
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    n = await linkCount()
    const pending = await o.page.locator('[data-testid="coverage-mesh"]').getAttribute('data-pending')
    if (n > 0 && pending === '0') break
    await o.page.waitForTimeout(2000)
  }
  const minutes = await o.page.locator('[data-testid="coverage-minutes-number"]').inputValue().catch(() => '?')
  check('A356 « חזרה ל־35 דק׳ » : le maillage revient sur la carte', n > 0, `${n} lien(s) tracé(s), borne ${minutes} min`)
  await o.page.screenshot({ path: `${SHOTS}/a356-maillage-revenu.png` })
  await o.ctx.close()
})

// ===========================================================================
section('A357 — le thème choisi sur l’ordinateur arrive sur le téléphone')
// ===========================================================================
await guard('A357', async () => {
  const db = new FakeDb()
  seed(db)
  const desk = await open(1440, { db })
  const phone = await open(402, { db })
  await go(desk.page, APP, '/coordinator/settings', 3500)
  await go(phone.page, APP, '/coordinator', 3500)
  const before = await phone.page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  // Le geste du PO : הגדרות › תצוגה › כהה (le sélecteur de thème).
  await openAllBlocks(desk.page)
  const dark = desk.page.locator('[data-testid="settings-theme-dark"]').first()
  if ((await dark.count()) === 0) throw new Error('bouton « כהה » introuvable')
  await dark.click()
  await desk.page.waitForTimeout(2600) // 1,2 s de regroupement + l'écriture
  const stored = await desk.page.evaluate(() => localStorage.getItem('lo-yanum:theme:coordinator'))
  // Le téléphone : retour en avant-plan (le battement de 30 s ferait de même).
  await phone.page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  let after: string | null = null
  for (let i = 0; i < 20; i++) {
    after = await phone.page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    if (after === 'dark') break
    await phone.page.waitForTimeout(500)
  }
  check('A357 l’ordinateur passe en sombre', stored === 'dark', String(stored))
  check('A357 le téléphone reçoit le sombre et l’applique, sans recharger', after === 'dark', `avant ${before} · après ${after}`)
  await phone.page.screenshot({ path: `${SHOTS}/a357-telephone-sombre.png` })
  // « selon l'appareil » voyage aussi, et suit alors CHAQUE appareil.
  await desk.page.locator('[data-testid="settings-theme-system"]').first().click()
  await desk.page.waitForTimeout(2600)
  // Le retour en avant-plan est limité à un toutes les 10 s : on attend le
  // suivant, ou le battement de 30 s (ce que fait un téléphone posé).
  let back: Array<string | null> = []
  for (let i = 0; i < 40; i++) {
    await phone.page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await phone.page.waitForTimeout(1000)
    back = await phone.page.evaluate(() => [localStorage.getItem('lo-yanum:theme:coordinator'), document.documentElement.getAttribute('data-theme')])
    if (back[0] === 'system') break
  }
  check('A357 « לפי המכשיר » voyage aussi : le téléphone suit de nouveau SON système', back[0] === 'system' && back[1] === null, back.join(' · '))
  await desk.ctx.close()
  await phone.ctx.close()
})

void CAPTURES
await finish()
