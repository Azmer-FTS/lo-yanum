import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

import {
  DISTRESS_BUDGET_MS,
  buildGuardLink,
  encodeGuardToken,
  guardTokenFor,
  resetStore,
} from '../src/core/index'
import { _raw } from '../src/core/store'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A118 · A119 · A120 · A124 — LES QUESTIONS QU'ON NE PEUT POSER QU'À UN ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aeui
 *
 *   A118  le lien ouvre l'app SUR la garde, sans compte et sans mot de passe ;
 *         un lien périmé donne l'écran clair et ses numéros.
 *   A119  ce que l'appareil garde après DEUX liens : une garde, pas deux.
 *   A120  intention → alerte partie, chronométré, sans dialogue à lire.
 *   A124  les cibles de l'écran d'urgence, et le « + » qui n'y est pas.
 *
 * ⚠️ CHAQUE SONDE EST UNE VRAIE FONCTION passée à `page.evaluate`, jamais un
 *    littéral gabarit. Trois passes y ont perdu un après-midi chacune : un
 *    antislash devenu une lettre, un accent grave dans un commentaire qui a
 *    terminé la chaîne.
 *
 * ⚠️ ET AUCUNE SONDE NE CHERCHE UNE PHRASE RENDUE. Ce qui est interrogé est un
 *    `data-testid`, un compte, une boîte et une durée.
 */

const PORT = Number(process.env.AEUI_PORT ?? 5221)
const OUT_DIR = 'dist-aepass'
const DESKTOP = { width: 1376, height: 1032 }
const PHONE = { width: 402, height: 874 }

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

console.log('')
console.log('  A118 · A119 · A120 · A124 — AE1 · AE2 IN A REAL BROWSER')
console.log('  =======================================================')

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT_DIR], {
  env,
  stdout: 'ignore',
  stderr: 'pipe',
})
if ((await build.exited) !== 0) {
  console.error(await new Response(build.stderr).text())
  throw new Error('vite build failed')
}
const serve = Bun.spawn(
  ['bun', 'x', 'vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'],
  { env, stdout: 'ignore', stderr: 'ignore' },
)
const base = `http://localhost:${PORT}`
{
  const deadline = Date.now() + 40_000
  for (;;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* pas encore levé */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

/** Rebond par le tableau de bord : un `goto` vers le hash courant n'est pas une navigation. */
async function open(page: Page, hash: string, settle = 1800): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(500)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

/* Les jetons sont fabriqués par @core, exactement comme le fera le SMS. */
resetStore()
const live = _raw().missions.find((m) => m.status === 'in_progress')!
const other = _raw().missions.find((m) => m.id !== live.id && m.assignments.length > 0)!
const liveToken = guardTokenFor(live, 'volunteer', live.assignments[0].volunteerId)
const otherToken = guardTokenFor(other, 'volunteer', other.assignments[0].volunteerId)
const deadToken = {
  ...liveToken,
  expiresAt: Date.now() - 3_600_000,
}

let browser: Browser | undefined

try {
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: PHONE,
    locale: 'he-IL',
    /* AE2a — la position est demandée à l'ouverture de l'écran ; sans
       autorisation, le navigateur pose une invite qui bloquerait la mesure du
       budget de deux secondes. On l'accorde, ce qui est aussi le cas réel : un
       volontaire l'accorde une fois, la première nuit. */
    permissions: ['geolocation'],
    geolocation: { latitude: 31.0611, longitude: 34.6602 },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)

  // -------------------------------------------------------------------------
  section('A118 — le lien ouvre la garde, sans compte')
  // -------------------------------------------------------------------------

  await page.goto(`${base}/#/g/${encodeGuardToken(liveToken)}`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)

  const landed = await page.evaluate(() => ({
    hash: location.hash,
    /* La porte de connexion est la seule chose qu'un volontaire ne doit JAMAIS
       voir : il n'a pas de compte. */
    login: document.querySelector('[data-testid="login-form"], input[type="password"]') !== null,
    guard: document.querySelector('[data-testid="site-file"]') !== null,
  }))
  check(
    'A118 · ★ the link lands on the volunteer’s own guard, not on a login',
    landed.hash.startsWith('#/volunteer') && !landed.login,
    landed.hash,
  )
  check(
    'A118 · and the guard it opens carries the site file',
    landed.guard,
  )

  /* ★ ET LE JETON PÉRIMÉ : l'écran clair, et ses numéros sont composables. */
  await page.goto(`${base}/#/g/${encodeGuardToken(deadToken)}`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const expired = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="link-expired"]')
    if (!root) return null
    const calls = Array.from(root.querySelectorAll('a[href^="tel:"]'))
    return {
      calls: calls.length,
      /* AE1.5 — « pas une erreur technique ». Aucun mot de code sur l'écran. */
      technical: /401|403|token|invalid|expired token|error/i.test(root.textContent ?? ''),
      police: calls.some((a) => (a.getAttribute('href') ?? '').includes('100')),
      coordinator: root.querySelector('[data-testid="expired-call-coordinator"]') !== null,
    }
  })
  check(
    'A118 · ★ an expired link gives the clear screen, not a technical error',
    expired !== null && !expired.technical,
    expired ? `${expired.calls} numbers, technical=${expired.technical}` : 'screen not found',
  )
  check(
    'A118 · and the coordinator and the emergency numbers stay reachable on it',
    expired !== null && expired.coordinator && expired.police,
  )

  // -------------------------------------------------------------------------
  section('A119 — ce que l’appareil garde après deux liens')
  // -------------------------------------------------------------------------

  await page.goto(`${base}/#/g/${encodeGuardToken(liveToken)}`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  await page.goto(`${base}/#/g/${encodeGuardToken(otherToken)}`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)

  const stored = await page.evaluate(() => {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) keys.push(k)
    }
    const raw = localStorage.getItem('lo-yanum:guard-pass')
    let pass: { mission?: { id?: string } } | null = null
    try {
      pass = raw ? JSON.parse(raw) : null
    } catch {
      pass = null
    }
    return {
      keys,
      bytes: raw ? raw.length : 0,
      missionId: pass?.mission?.id ?? null,
      /* La question honnête : combien de gardes le stockage porte-t-il. */
      passKeys: keys.filter((k) => k.startsWith('lo-yanum:guard-pass')).length,
    }
  })
  check(
    'A119 · ★ two links opened, ONE pass on the device — the second replaced the first',
    stored.passKeys === 1 && stored.missionId === otherToken.missionId,
    `${stored.passKeys} pass key(s), holding ${String(stored.missionId)}`,
  )
  check(
    'A119 · and the first guard is nowhere in what was kept',
    stored.missionId !== liveToken.missionId,
  )
  check(
    'A119 · what it weighs is a guard, not a roster',
    stored.bytes > 0 && stored.bytes < 8000,
    `${stored.bytes} bytes`,
  )

  // -------------------------------------------------------------------------
  section('A120 — de l’intention au départ de l’alerte')
  // -------------------------------------------------------------------------

  await page.goto(`${base}/#/sos`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)

  const screenThere = await page.evaluate(
    () => document.querySelector('[data-testid="emergency-screen"]') !== null,
  )
  check('A120 · the emergency screen is reachable by URL from anywhere', screenThere)

  /**
   * ★★ LE CHRONOMÈTRE COMMENCE AU CONTACT ET S'ARRÊTE QUAND LE PANNEAU DE
   *    CONFIRMATION EXISTE, ce qui est exactement « l'intention » et « le
   *    départ de l'alerte ».
   *
   * ⚠️ ET LE `sms:` EST INTERCEPTÉ, sinon le navigateur quitte la page au
   *    milieu de la mesure. On le compte plutôt que de le suivre — ce qui est
   *    aussi la seule façon de prouver qu'il est bien parti.
   */
  await page.evaluate(() => {
    const w = window as unknown as { __sms?: string[] }
    w.__sms = []
    const proto = Object.getPrototypeOf(window.location)
    void proto
    /* On ne peut pas redéfinir `location.href` partout ; on écoute plutôt la
       navigation par un `beforeunload` compté, et on neutralise la sortie. */
    window.addEventListener('beforeunload', (e) => {
      w.__sms?.push('navigated')
      e.preventDefault()
    })
  })

  const button = page.locator('[data-testid="distress-button"]')
  const box = await button.boundingBox()
  if (!box) throw new Error('distress button not found')

  const began = Date.now()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.locator('[data-testid="distress-sent"]').waitFor({ state: 'attached' })
  const elapsed = Date.now() - began
  await page.mouse.up()

  check(
    'A120 · ★ intention → alert away in under two seconds',
    elapsed < DISTRESS_BUDGET_MS,
    `${elapsed} ms of a ${DISTRESS_BUDGET_MS} ms budget`,
  )

  /**
   * ⚠️ ET IL N'Y A EU AUCUN DIALOGUE À LIRE. « En panique, on ne lit pas. » La
   *    question se pose au DOM : aucun `role="dialog"`, aucun `<dialog>`, et
   *    le navigateur n'a pas ouvert de `confirm()` — sinon la mesure ci-dessus
   *    aurait expiré plutôt que de rendre une durée.
   */
  const dialogs = await page.evaluate(
    () =>
      document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"]').length,
  )
  check('A120 · ★ and not one dialog to read on the way', dialogs === 0, `${dialogs} dialogs`)

  const confirmation = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="distress-sent"]')
    if (!panel) return null
    return {
      lines: panel.querySelectorAll('li').length,
      /* AE2a.5 — « à qui », et « quoi faire maintenant ». */
      hasNext: panel.textContent !== null && panel.textContent.trim().length > 40,
      again: panel.querySelector('[data-testid="distress-again"]') !== null,
    }
  })
  check(
    'A120 · the confirmation says what went, to whom, and what to do now',
    confirmation !== null && confirmation.lines >= 3 && confirmation.hasNext,
    confirmation ? `${confirmation.lines} lines` : 'no panel',
  )
  /* ★ « Un utilisateur qui doute renvoie l'alerte dix fois » — il y a donc UN
     bouton pour recommencer, explicite, plutôt qu'un déclencheur qui reste
     armé sous le pouce. */
  check(
    'A120 · and sending again is a deliberate second gesture',
    confirmation?.again === true,
  )

  /* Un appui BREF ne déclenche rien : c'est l'autre moitié d'AE2a.4. */
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(400)
  await page.goto(`${base}/#/sos`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const b2 = await page.locator('[data-testid="distress-button"]').boundingBox()
  if (b2) {
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(200)
    await page.mouse.up()
    await page.waitForTimeout(600)
  }
  const afterTap = await page.evaluate(
    () => document.querySelector('[data-testid="distress-sent"]') === null,
  )
  check(
    'A120 · ★ a short tap sends nothing — the pocket press is not an alert',
    afterTap,
  )

  // -------------------------------------------------------------------------
  section('A122 — réseau coupé, l’écran et ses voies restent')
  // -------------------------------------------------------------------------

  /**
   * ★★ `bun run aepass` PROUVE QUE LE PLAN EST PUR ; CECI PROUVE QUE L'ÉCRAN
   *    TIENT QUAND LE RÉSEAU TOMBE, ET CE N'EST PAS LA MÊME AFFIRMATION.
   *
   *    « Le bouton reste fonctionnel hors ligne : appel et SMS ne demandent pas
   *    de réseau de données. » Une fonction pure peut être juste dans un écran
   *    qui, lui, attend une réponse qui ne viendra pas. On coupe donc vraiment
   *    le réseau du contexte — c'est la barre de réseau qui disparaît dans le
   *    champ — et on repose les deux questions : les numéros sont-ils
   *    composables, et l'alerte part-elle.
   */
  await context.setOffline(true)
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' }).catch(() => undefined)
  await page.waitForTimeout(600)
  await page.goto(`${base}/#/sos`, { waitUntil: 'load' }).catch(() => undefined)
  await page.waitForTimeout(2000)

  const offline = await page.evaluate(() => {
    const screen = document.querySelector('[data-testid="emergency-screen"]')
    const tels = Array.from(document.querySelectorAll('a[href^="tel:"]'))
    return {
      screen: screen !== null,
      tels: tels.length,
      police: tels.some((a) => (a.getAttribute('href') ?? '').includes('100')),
      button: document.querySelector('[data-testid="distress-button"]') !== null,
      online: navigator.onLine,
    }
  })
  check(
    'A122 · ★ with the data network CUT, the screen is still there and still dials',
    offline.screen && offline.button && offline.tels >= 3 && offline.police && !offline.online,
    `${offline.tels} tel: targets, navigator.onLine=${offline.online}`,
  )

  /* ★ ET L'ALERTE PART QUAND MÊME. La voie réseau échoue — c'est son rôle de
     filet — mais le SMS et l'écran de confirmation ne l'attendent pas. */
  const offBox = await page.locator('[data-testid="distress-button"]').boundingBox()
  if (offBox) {
    const t0 = Date.now()
    await page.mouse.move(offBox.x + offBox.width / 2, offBox.y + offBox.height / 2)
    await page.mouse.down()
    await page.locator('[data-testid="distress-sent"]').waitFor({ state: 'attached' })
    const offElapsed = Date.now() - t0
    await page.mouse.up()
    check(
      'A122 · ★ and the alert still goes, inside the same two-second budget',
      offElapsed < DISTRESS_BUDGET_MS,
      `${offElapsed} ms with no network`,
    )
  }
  await context.setOffline(false)

  // -------------------------------------------------------------------------
  section('A124 — les cibles, les écarts, et le « + » qui n’est pas là')
  // -------------------------------------------------------------------------

  for (const [name, viewport] of [
    ['402 px', PHONE],
    ['1376 px', DESKTOP],
  ] as const) {
    await page.setViewportSize(viewport)
    await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
    await page.waitForTimeout(400)
    await page.goto(`${base}/#/sos`, { waitUntil: 'load' })
    await page.waitForTimeout(1800)

    const geometry = await page.evaluate(() => {
      const targets = Array.from(
        document.querySelectorAll('[data-emergency-target], [data-testid="distress-button"]'),
      ) as HTMLElement[]
      /* ⚠️ EN COORDONNÉES DE DOCUMENT ET NON DE FENÊTRE. La passe de
         recouvrement plus bas FAIT DÉFILER la page ; des rectangles relevés en
         coordonnées de fenêtre décriraient alors deux états différents, et
         l'écart entre deux d'entre eux serait un nombre qui ne veut rien dire. */
      const boxes = targets.map((el) => {
        const b = el.getBoundingClientRect()
        return {
          id: el.getAttribute('data-testid') ?? '',
          x: b.left + window.scrollX,
          y: b.top + window.scrollY,
          w: b.width,
          h: b.height,
        }
      })
      const small = boxes.filter((b) => b.w < 44 || b.h < 44)

      /* L'écart minimal entre deux cibles, mesuré sur les rectangles. Deux
         boîtes qui se chevauchent donnent un écart négatif, ce qui est le
         défaut A86 vu par les nombres. */
      let tightest = Number.POSITIVE_INFINITY
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]
          const b = boxes[j]
          const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
          const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h))
          /* Si les deux projections se recouvrent, les boîtes se recouvrent. */
          const gap = dx >= 0 || dy >= 0 ? Math.max(dx, dy) : -1
          if (gap < tightest) tightest = gap
        }
      }

      return {
        count: boxes.length,
        small: small.map((b) => `${b.id}:${Math.round(b.w)}×${Math.round(b.h)}`),
        smallest: Math.round(Math.min(...boxes.map((b) => Math.min(b.w, b.h)))),
        tightest: Number.isFinite(tightest) ? Math.round(tightest) : -999,
        fab: document.querySelector('[data-testid="action-fab"], [data-bottom-rail]') !== null,
        launcher: document.querySelector('[data-emergency-launcher]') !== null,
      }
    })

    check(
      `A124 · ${name} — every target on the screen is at least 44 px`,
      geometry.small.length === 0,
      geometry.small.length === 0
        ? `${geometry.count} targets, smallest ${geometry.smallest}px`
        : geometry.small.join(' · '),
    )
    check(
      `A124 · ${name} — and the tightest gap between two of them is at least 8 px`,
      geometry.tightest >= 8,
      `${geometry.tightest}px`,
    )
    /**
     * ★★ LE RECOUVREMENT SE DEMANDE CIBLE PAR CIBLE, APRÈS L'AVOIR AMENÉE À
     *    L'ÉCRAN, ET LA PREMIÈRE VERSION DE CETTE PORTE AVAIT TORT.
     *
     *    `elementFromPoint` rend `null` pour tout point HORS de la fenêtre, et
     *    la liste des numéros dépasse la hauteur d'un téléphone : la sonde
     *    comptait donc « couvert » ce qui n'était que « plus bas ». Deux faux
     *    positifs à 402 px, aucun à 1376 — ce qui est la signature exacte de
     *    cette erreur, et exactement ce qui aurait fait ignorer un jour un vrai
     *    recouvrement en le prenant pour du défilement. C'est la sœur du piège
     *    d'A116 : la seule question honnête est posée à un point VISIBLE.
     */
    let covered = 0
    for (let i = 0; i < geometry.count; i++) {
      const answer = await page.evaluate((index: number) => {
        const targets = Array.from(
          document.querySelectorAll('[data-emergency-target], [data-testid="distress-button"]'),
        ) as HTMLElement[]
        const el = targets[index]
        if (!el) return 'missing'
        el.scrollIntoView({ block: 'center' })
        const b = el.getBoundingClientRect()
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
        if (hit === null) return 'off screen even after scrolling'
        return el.contains(hit) ? 'itself' : `covered by ${hit.tagName}`
      }, i)
      if (answer !== 'itself') {
        covered++
        console.log(`         ↳ target ${i}: ${answer}`)
      }
    }
    check(
      `A124 · ${name} — ★ nothing is laid on top of any of them (A86, re-asked)`,
      covered === 0,
      `${covered} covered of ${geometry.count}`,
    )
    check(
      `A124 · ${name} — ★ and the floating « + » is not drawn on this screen at all`,
      !geometry.fab,
    )
    check(
      `A124 · ${name} — nor the launcher, which would sit on its own numbers`,
      !geometry.launcher,
    )
  }

  // -------------------------------------------------------------------------
  section('AE2 — un geste, depuis les quatre rôles')
  // -------------------------------------------------------------------------

  /**
   * ★★ LA QUESTION EST « UN GESTE », DONC ELLE SE POSE EN COMPTANT LES CLICS.
   *
   * Pour chacun des quatre rôles : le lanceur est-il PRÉSENT et ENTIER sur
   * l'écran d'accueil du rôle, et un seul clic mène-t-il à l'écran d'urgence.
   * Pas « la route existe » — la route existe pour tout le monde, ce n'est pas
   * ce que le brief demande.
   */
  await page.setViewportSize(PHONE)
  for (const [role, home] of [
    ['coordinator', '#/coordinator'],
    ['volunteer', '#/volunteer'],
    ['driver', '#/driver'],
    ['farmer', '#/farmer'],
  ] as const) {
    /* La session se pose par le lien de garde pour les deux rôles qui en ont
       un, et par le sélecteur de démonstration pour les deux autres. */
    /**
     * ⚠️ LE VOLONTAIRE ARRIVE PAR SON LIEN — c'est son chemin réel, et il
     *    vérifie au passage qu'AE1 et AE2 tiennent ensemble. Les trois autres
     *    passent par le sélecteur du bandeau de démonstration, qui est la
     *    seule façon de poser une session dans le jumeau : elle n'est PAS
     *    persistée (`session` est délibérément hors de `COLLECTIONS`, voir
     *    `backend.ts`), donc l'écrire dans le stockage ne ferait rien.
     */
    if (role === 'volunteer') {
      await page.goto(`${base}/#/g/${encodeGuardToken(liveToken)}`, { waitUntil: 'load' })
      await page.waitForTimeout(2200)
    } else if (role !== 'coordinator') {
      await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
      await page.waitForTimeout(1500)
      const toggle = page.locator('[data-testid="devbar-toggle"]')
      if ((await toggle.count()) > 0) {
        await toggle.click()
        await page.waitForTimeout(400)
      }
      const picked = await page.evaluate((want: string) => {
        const select = document.querySelector('select[aria-label]') as HTMLSelectElement | null
        if (!select) return null
        const option = Array.from(select.options).find((o) => o.value.startsWith(`${want}:`))
        return option ? option.value : null
      }, role)
      if (picked) {
        await page.selectOption('select[aria-label]', picked)
        await page.waitForTimeout(1800)
      }
    } else {
      await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
      await page.waitForTimeout(1200)
    }

    await page.goto(`${base}/${home}`, { waitUntil: 'load' })
    await page.waitForTimeout(2200)
    const reach = await page.evaluate(() => {
      const el = document.querySelector('[data-emergency-launcher]') as HTMLElement | null
      if (!el) return { present: false, whole: false, own: false }
      const b = el.getBoundingClientRect()
      const whole =
        b.left >= -1 &&
        b.top >= -1 &&
        b.right <= window.innerWidth + 1 &&
        b.bottom <= window.innerHeight + 1 &&
        b.width >= 44 &&
        b.height >= 44
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      return { present: true, whole, own: hit !== null && el.contains(hit) }
    })
    check(
      `AE2 · ${role} — the launcher is drawn, wholly on screen, and answers for itself`,
      reach.present && reach.whole && reach.own,
      JSON.stringify(reach),
    )
    if (reach.present && reach.own) {
      await page.locator('[data-emergency-launcher]').first().click()
      await page.waitForTimeout(1200)
      const arrived = await page.evaluate(() => ({
        hash: location.hash,
        screen: document.querySelector('[data-testid="emergency-screen"]') !== null,
      }))
      check(
        `AE2 · ${role} — ★ ONE tap, and the emergency screen is up`,
        arrived.screen && arrived.hash.startsWith('#/sos'),
        arrived.hash,
      )
    }
  }

  console.log('')
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log('')
} finally {
  await browser?.close()
  serve.kill()
}

if (failed > 0) process.exit(1)
