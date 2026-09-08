import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

import { encodeGuardToken, guardTokenFor, resetStore } from '../src/core/index'
import { _raw } from '../src/core/store'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE5 (2026-09-08) — LES CAPTURES DE LA PASSE DE SÉCURITÉ, ET A124 REPOSÉE
 *    SUR LE DÉPLOYÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aecaptures
 *   BASE_URL=http://localhost:5221 bun run aecaptures   (à blanc, build local)
 *
 * ★ SUR LE JUMEAU DÉPLOYÉ. Règle permanente depuis §29 : rien n'est livré tant
 *   que ce n'est pas montré sur une URL que le PO peut ouvrir lui-même.
 *
 * ★★ ET A124 EST REPOSÉE ICI, APRÈS L'AVOIR ÉTÉ DANS `bun run aeui`, PARCE QUE
 *    C'EST LA LEÇON QUE CE DÉPÔT A PAYÉE TROIS FOIS.
 *
 *    AC a posé « נשכחו » en neuvième position ; `bun run acui` l'a trouvée
 *    parfaitement — il interroge le DOM, et le DOM l'avait — et la capture du
 *    déployé a montré qu'elle était hors écran sur l'iPad du PO. Une porte qui
 *    tourne sur un aperçu local prouve que le code est juste ; elle ne prouve
 *    pas que le PO peut appuyer sur le bouton. Ici, la chose qui pourrait être
 *    couverte est un numéro d'urgence.
 *
 * ⚠️ ET LA QUESTION DU RECOUVREMENT EST POSÉE À UN POINT VISIBLE, cible par
 *    cible, APRÈS l'avoir amenée à l'écran. `elementFromPoint` rend `null`
 *    partout hors de la fenêtre, et la liste des numéros dépasse la hauteur
 *    d'un téléphone : la première version de cette sonde comptait « couvert »
 *    ce qui n'était que « plus bas » — deux faux positifs à 402 px et aucun à
 *    1376, la signature exacte de cette erreur.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(
  /\/$/,
  '',
)
const OUT = 'docs/screenshots/aepass'

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
] as const

const THEMES = ['light', 'dark'] as const

/* Les jetons sont fabriqués par @core, exactement comme le fera le SMS d'AE4.
   Les identifiants de garde sont stables dans les fixtures ; seules les heures
   se régénèrent au chargement de la page, ce qui ne change pas la validité. */
resetStore()
const live = _raw().missions.find((m) => m.status === 'in_progress')!
const liveDriver = _raw().drivers.find((d) => d.id === live.drivers[0]?.driverId)
const volunteerToken = encodeGuardToken(
  guardTokenFor(live, 'volunteer', live.assignments[0].volunteerId),
)
const driverToken = liveDriver
  ? encodeGuardToken(guardTokenFor(live, 'driver', liveDriver.id))
  : null
const expiredToken = encodeGuardToken({
  ...guardTokenFor(live, 'volunteer', live.assignments[0].volunteerId),
  expiresAt: Date.now() - 3_600_000,
})

interface Shot {
  name: string
  hash: string
  wait?: number
  /** Comment on devient cette personne avant d'ouvrir `hash`. */
  become?: 'coordinator' | 'volunteer' | 'driver' | 'farmer'
  /** Poser A124 sur cette capture — les écrans qui portent des numéros. */
  measure?: boolean
  act?: (page: Page) => Promise<void>
}

const SHOTS: Shot[] = [
  /* ★★ AE2 — L'ÉCRAN D'URGENCE DANS LES QUATRE RÔLES. C'est ce que le brief
     demande explicitement, et c'est la seule preuve que « un seul écran pour
     tout le monde » est vrai plutôt qu'espéré : les quatre captures doivent se
     ressembler, et ce qui diffère entre elles doit être les NUMÉROS du lieu. */
  { name: 'urgence-coordinateur', hash: '#/sos', become: 'coordinator', measure: true },
  { name: 'urgence-volontaire', hash: '#/sos', become: 'volunteer', measure: true },
  { name: 'urgence-conducteur', hash: '#/sos', become: 'driver', measure: true },
  { name: 'urgence-agriculteur', hash: '#/sos', become: 'farmer', measure: true },

  /* ★ AE2c — תיק אתר sur la garde en cours, et le point de contrôle d'AE3.3. */
  { name: 'garde-volontaire', hash: '#/volunteer', become: 'volunteer', wait: 6000 },

  /* ★ AE1.5 — l'écran d'un lien qui ne vaut plus, avec ses numéros. */
  { name: 'lien-expire', hash: `#/g/${expiredToken}`, measure: true, wait: 3500 },

  /**
   * ★ AE3 — LES SILENCES SUR LE TABLEAU DE BORD, ET LA CAPTURE DESCEND
   *   JUSQU'À EUX.
   *
   * ⚠️ La première version cadrait le haut de l'écran et le bloc d'alertes est
   *    sous les KPI : une capture nommée « silences » qui ne montre pas un
   *    silence est une preuve qui ne prouve pas son nom, ce qui est la seule
   *    espèce de preuve pire que pas de preuve. Elle OUVRE aussi la première
   *    alerte, parce que le détail — « depuis N heures » — et les boutons
   *    d'appel sont ce qu'AE3 produit.
   */
  {
    name: 'silences',
    hash: '#/coordinator',
    become: 'coordinator',
    wait: 7000,
    act: async (page) => {
      const chip = page.locator('[data-testid="alert-chip"]').first()
      if (await chip.count()) {
        await chip.scrollIntoViewIfNeeded()
        await page.waitForTimeout(500)
        await chip.click().catch(() => undefined)
        await page.waitForTimeout(900)
        const detail = page.locator('[data-testid="alert-detail"]').first()
        if (await detail.count()) await detail.scrollIntoViewIfNeeded()
      }
      await page.waitForTimeout(800)
    },
  },

  /* ★ AE3.2 · AE4 — les trois délais et le gabarit, dans les réglages. */
  {
    name: 'reglages',
    hash: '#/coordinator/settings',
    become: 'coordinator',
    wait: 5000,
    act: async (page) => {
      const field = page.locator('[data-testid="vigil-arrival"]')
      if (await field.count()) await field.scrollIntoViewIfNeeded()
      await page.waitForTimeout(700)
    },
  },

  /* ★ AE2b · AE2c — les six champs neufs sur la fiche ferme. */
  {
    name: 'fiche-ferme',
    hash: '#/coordinator/farms/farm-01/edit',
    become: 'coordinator',
    wait: 7000,
    act: async (page) => {
      await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('span.label'))
        const target = labels.find((l) => (l.textContent ?? '').includes('כיתת כוננות'))
        target?.scrollIntoView({ block: 'center' })
      })
      await page.waitForTimeout(900)
    },
  },

  /* ★ AE4 — le bouton de convocation, sur la garde. */
  {
    name: 'convocation',
    hash: `#/coordinator/missions/${live.id}`,
    become: 'coordinator',
    wait: 7000,
    act: async (page) => {
      const btn = page.locator('[data-testid^="summons-"]').first()
      if (await btn.count()) await btn.scrollIntoViewIfNeeded()
      await page.waitForTimeout(700)
    },
  },
]

console.log('')
console.log(`  AE5 — CAPTURES CLAIR + SOMBRE, ET A124 SUR LE DÉPLOYÉ : ${BASE}`)
console.log('  ==================================================================')

let browser: Browser | null = null
let taken = 0
let failed = 0
let a124 = 0
let retried = 0

/**
 * ★★ UNE COUPURE DE LA LIAISON DE CETTE MACHINE N'EST PAS UN DÉFAUT DU
 *    DÉPLOYÉ, ET LA PORTE DOIT SAVOIR FAIRE LA DIFFÉRENCE.
 *
 *    Deux exécutions de suite se sont arrêtées sur `ERR_INTERNET_DISCONNECTED`
 *    après vingt captures parfaites — le wifi du poste, pas Pages. Une porte
 *    qui abandonne à la première coupure ne peut tout simplement pas prouver un
 *    site distant depuis un portable ; une porte qui la MASQUE ne prouve rien
 *    du tout.
 *
 *    Alors on réessaie trois fois, en attendant que la liaison revienne, et le
 *    total des reprises est IMPRIMÉ à la fin : si le chiffre est élevé, c'est
 *    la ligne qui est mauvaise, et le lecteur doit le savoir plutôt que de lire
 *    un « 60 captures » qui a coûté une heure. Un échec qui SURVIT aux trois
 *    reprises est jeté, comme avant.
 */
async function goto(page: Page, url: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: attempt === 1 ? 'load' : 'domcontentloaded' })
      return
    } catch (error) {
      if (attempt >= 3) throw error
      retried++
      /* La liaison revient rarement dans la seconde ; on lui laisse le temps
         qu'un rechargement humain lui laisserait. */
      await new Promise((r) => setTimeout(r, 8000 * attempt))
    }
  }
}

/** Devenir quelqu'un, par le chemin réel de chaque rôle. */
async function become(page: Page, who: NonNullable<Shot['become']>): Promise<void> {
  if (who === 'volunteer') {
    await goto(page, `${BASE}/#/g/${volunteerToken}`)
    await page.waitForTimeout(3500)
    return
  }
  if (who === 'driver' && driverToken) {
    await goto(page, `${BASE}/#/g/${driverToken}`)
    await page.waitForTimeout(3500)
    return
  }
  await goto(page, `${BASE}/#/coordinator`)
  await page.waitForTimeout(3000)
  if (who === 'coordinator') return
  /* L'agriculteur n'a pas de lien (AE1.6 : il garde son accès existant), donc
     il passe par le sélecteur du jumeau — le seul moyen de poser une session,
     puisqu'elle n'est délibérément pas persistée (`backend.ts`). */
  const toggle = page.locator('[data-testid="devbar-toggle"]')
  if ((await toggle.count()) > 0) {
    await toggle.click()
    await page.waitForTimeout(500)
  }
  const value = await page.evaluate((want: string) => {
    const select = document.querySelector('select[aria-label]') as HTMLSelectElement | null
    if (!select) return null
    const option = Array.from(select.options).find((o) => o.value.startsWith(`${want}:`))
    return option ? option.value : null
  }, who)
  if (value) {
    await page.selectOption('select[aria-label]', value)
    await page.waitForTimeout(3000)
  }
}

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
        /* AE2a — la position est demandée à l'ouverture de l'écran ; sans
           autorisation, le navigateur pose une invite qui recouvrirait la
           capture qu'on est en train de prendre. */
        permissions: ['geolocation'],
        geolocation: { latitude: 31.0611, longitude: 34.6602 },
      })
      const page = await context.newPage()
      page.setDefaultTimeout(60_000)

      for (const shot of SHOTS) {
        await goto(page, `${BASE}/`)
        await page.evaluate((t) => {
          for (const key of Object.keys(localStorage)) {
            if (key.startsWith('lo-yanum:map-mode:') || key === 'lo-yanum:view-as') {
              localStorage.removeItem(key)
            }
          }
          /**
           * ⚠️ LE THÈME EST POSÉ POUR LES **QUATRE** RÔLES, ET LA PREMIÈRE
           *    VERSION NE POSAIT QUE CELUI DU COORDINATEUR.
           *
           *    Les rôles de terrain ont `dark` pour DÉFAUT, délibérément
           *    (core/theme.ts : « un écran clair ruine la vision nocturne et
           *    annonce une position »). Une capture nommée « light » prise sur
           *    l'écran d'un volontaire sortait donc sombre — c'est-à-dire une
           *    preuve qui ne prouvait pas ce que son nom disait, sur la moitié
           *    des captures de cette passe. Le défaut du produit est le bon ;
           *    c'est la porte qui devait le savoir.
           */
          for (const role of ['coordinator', 'volunteer', 'driver', 'farmer']) {
            localStorage.setItem(`lo-yanum:theme:${role}`, t as string)
          }
        }, theme as string)

        if (shot.become) await become(page, shot.become)
        await goto(page, `${BASE}/${shot.hash}`)
        await page.waitForTimeout(shot.wait ?? 4000)
        if (shot.act) await shot.act(page)

        const file = `${OUT}/${vp.name}-${theme}-${shot.name}.png`
        await page.screenshot({ path: file })
        taken++

        let verdict = ''
        if (shot.measure) {
          /**
           * ═══════════════════════════════════════════════════════════════
           * A124, SUR LES OCTETS RÉELLEMENT SERVIS. DEUX QUESTIONS, ET PAS
           * UNE — c'est la règle d'AA6.2 et d'A116.
           *
           *   · les RECTANGLES : chaque cible fait-elle 44 px, et l'écart
           *     entre deux d'entre elles fait-il 8 px ;
           *   · le POINT : qui répond à un clic au centre de chacune.
           *
           * Aucune ne suffit seule. Une cible de 64 px peut être entièrement
           * couverte ; un point qui répond « moi » peut appartenir à une
           * cible à moitié hors du cadre.
           * ═══════════════════════════════════════════════════════════════
           */
          const geometry = await page.evaluate(() => {
            const targets = Array.from(
              document.querySelectorAll(
                '[data-emergency-target], [data-testid="distress-button"]',
              ),
            ) as HTMLElement[]
            /* ⚠️ EN COORDONNÉES DE DOCUMENT : la passe de recouvrement fait
               défiler la page, et des rectangles relevés en coordonnées de
               fenêtre décriraient deux états différents. */
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
            let tightest = Number.POSITIVE_INFINITY
            for (let i = 0; i < boxes.length; i++) {
              for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i]
                const b = boxes[j]
                const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
                const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h))
                /* Si les deux projections se recouvrent, les boîtes se
                   recouvrent : c'est le défaut A86 vu par les nombres. */
                const gap = dx >= 0 || dy >= 0 ? Math.max(dx, dy) : -1
                if (gap < tightest) tightest = gap
              }
            }
            return {
              count: boxes.length,
              smallest: boxes.length
                ? Math.round(Math.min(...boxes.map((b) => Math.min(b.w, b.h))))
                : 0,
              tightest: Number.isFinite(tightest) ? Math.round(tightest) : 999,
              /* Le « + » flottant n'a rien à faire ici : c'est le défaut A86,
                 dans le seul écran où il coûte une intervention. */
              fab:
                document.querySelector('[data-testid="action-fab"], [data-bottom-rail]') !==
                null,
            }
          })

          let covered = 0
          for (let i = 0; i < geometry.count; i++) {
            const answer = await page.evaluate((index: number) => {
              const targets = Array.from(
                document.querySelectorAll(
                  '[data-emergency-target], [data-testid="distress-button"]',
                ),
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

          const bad =
            geometry.count === 0 ||
            geometry.smallest < 44 ||
            geometry.tightest < 8 ||
            covered > 0 ||
            geometry.fab
          if (bad) {
            failed++
            a124++
          }
          verdict =
            `  A124 ${bad ? 'FAIL' : 'OK'} — ${geometry.count} targets, ` +
            `smallest ${geometry.smallest}px, tightest gap ${geometry.tightest}px, ` +
            `${covered} covered, floating «+» ${geometry.fab ? 'PRESENT' : 'absent'}`
        }

        console.log(`  ${vp.name.padEnd(8)} ${theme.padEnd(5)} ${shot.name.padEnd(22)}${verdict}`)
      }
      await context.close()
    }
  }
} finally {
  await browser?.close()
}

console.log('')
console.log(
  `  ${taken} captures dans ${OUT}/ — ${failed} problème(s), dont ${a124} sur A124` +
    (retried > 0
      ? `, et ${retried} navigation(s) reprises après une coupure de CETTE machine`
      : ''),
)
console.log('')
if (failed > 0) process.exit(1)
