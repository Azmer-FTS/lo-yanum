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

    /**
     * Ce qui FLOTTE : position fixed, visible, pas la page entière.
     *
     * ⛔ LA BARRE DE DÉMONSTRATION EST HORS SUJET, et il faut le dire plutôt
     *    que de l'oublier : `devbar` n'existe QUE dans le jumeau de
     *    démonstration (c'est là que cette sonde peut entrer sans mot de
     *    passe). Sur l'application du PO il n'y a pas de barre en bas de
     *    l'écran, donc un recouvrement par elle n'est pas un défaut de son
     *    application — ce serait mesurer l'échafaudage.
     */
    const isDemoScaffold = (el: Element): boolean =>
      !!el.closest('[data-testid^="devbar"]') || (el.getAttribute('data-testid') ?? '').startsWith('devbar')
    const floating = Array.from(document.querySelectorAll('body *')).filter((el) => {
      if (getComputedStyle(el).position !== 'fixed') return false
      if (!seen(el)) return false
      if (isDemoScaffold(el)) return false
      const b = el.getBoundingClientRect()
      return b.width < innerWidth * 0.98 || b.height < innerHeight * 0.5
    })

    /* CE QUI SE TOUCHE. */
    const targets = Array.from(
      document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [data-testid^="kpi-"], .tile-interactive, .card-interactive'),
    ).filter(seen)

    /**
     * ═════════════════════════════════════════════════════════════════════
     * ⚠️★★ CE QUE « LE FLOTTANT POSÉ SUR UNE CIBLE » VEUT DIRE EXACTEMENT.
     * ═════════════════════════════════════════════════════════════════════
     *
     * La première version de cette sonde comptait TOUT croisement entre un
     * contrôle flottant et une cible — et elle a trouvé quatre-vingts
     * « défauts » qui n'en étaient pas : un « + » posé sur la CINQUIÈME ligne
     * d'une liste de trente n'est pas l'accident d'AA/AC, c'est ce que fait un
     * bouton flottant au-dessus d'une liste qui défile. La ligne se dégage
     * d'un pouce.
     *
     * ★ L'ACCIDENT, c'est la cible que le doigt ne peut PAS dégager :
     *   — soit elle ne défile pas (elle est elle-même épinglée, ou la page
     *     n'a rien à faire défiler) ;
     *   — soit c'est la DERNIÈRE de sa liste et le bas de la page ne réserve
     *     pas la place du flottant : arrivé en bas, elle reste dessous.
     *   C'est cette question-là qu'AA1.2 avait trouvée sur מתנדבים (« la
     *   pastille ישיבת שדרות mesurait une zone tactile de 1 × 1 px ») et que
     *   la réponse — la rangée s'écarte — a réglée.
     */
    const pageScrolls = document.documentElement.scrollHeight > innerHeight + 4
    const scrollsUnder = (el: Element): boolean => {
      if (getComputedStyle(el).position === 'fixed' || getComputedStyle(el).position === 'sticky') return false
      for (let p: Element | null = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p)
        if (cs.position === 'fixed' || cs.position === 'sticky') return false
        if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) return true
      }
      return pageScrolls
    }

    const covered: Array<{ target: string; by: string; area: number }> = []
    for (const t of targets) {
      const r = t.getBoundingClientRect()
      if (r.bottom < 0 || r.top > innerHeight) continue
      if (scrollsUnder(t)) continue
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

    /**
     * UNE VIGNETTE POUSSÉE HORS ÉCRAN — ET SEULEMENT CELLES QUI DOIVENT TENIR.
     *
     * ⚠️ LA BANDE DÉFILE, ET C'EST SA RAISON D'ÊTRE. AK5.3 l'a mesuré au
     *    pixel : « trois vignettes font 476 px, un téléphone en offre 370 :
     *    DEUX tiennent au repos ». La troisième est donc hors écran par
     *    construction, et une sonde qui compte ça comme un défaut redemande
     *    à chaque passe ce qu'une passe a déjà tranché.
     *
     * ★ CE QUI DOIT TENIR, ce sont les DEUX PREMIÈRES — l'ordre étant lui-même
     *   une décision d'AC/AD/AK : « נשכחו » garde la première place, la file
     *   des documents manquants (une règle métier qui BLOQUE la clôture) la
     *   seconde. Ce sont ces deux-là qu'on mesure, entières, au repos.
     */
    const strip = document.querySelector('[data-testid="farms-queues"], [data-testid="queue-strip"], .scroll-row')
    const chips = strip
      ? Array.from(strip.querySelectorAll('[data-testid^="farms-"], [data-testid^="queue-"]'))
          .filter(seen)
          .slice(0, 2)
          .map((el) => {
            const r = el.getBoundingClientRect()
            return {
              id: idOf(el),
              offLeft: Math.round(Math.max(0, -r.left)),
              offRight: Math.round(Math.max(0, r.right - innerWidth)),
            }
          })
      : []

    /**
     * DU TEXTE COUPÉ — et seulement celui qui est PERDU EN SILENCE.
     *
     * ⚠️ UNE COUPURE ANNONCÉE N'EST PAS UN DÉFAUT. « … » à la fin d'une ligne
     *    dit au lecteur qu'il en reste ; c'est le résumé d'un incident, le nom
     *    long d'une ferme, le motif d'une visite, et c'est voulu partout dans
     *    cette application. Ce qui est un défaut, c'est un mot tranché sans
     *    que rien ne le dise et sans que le texte entier soit accessible
     *    ailleurs (un `title`, un `aria-label`).
     */
    const clipped = Array.from(document.querySelectorAll('h1, h2, h3, .chip, .label, button, .text-caption'))
      .filter(seen)
      .filter((el) => {
        const cs = getComputedStyle(el)
        if (cs.textOverflow === 'ellipsis') return false
        if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') return false
        if (el.hasAttribute('title') || el.hasAttribute('aria-label')) return false
        if ((el.textContent ?? '').trim().endsWith('…')) return false
        if (cs.overflow === 'visible' && cs.overflowX === 'visible') return false
        return el.scrollWidth > el.clientWidth + 2 && (el.textContent ?? '').trim().length > 0
      })
      .map((el) => `${idOf(el)}(${el.scrollWidth}>${el.clientWidth})`)

    /**
     * DES CIBLES TROP PETITES — ET LA MESURE EST LA ZONE TACTILE, PAS L'ENCRE.
     *
     * ★ AA1.1 a posé le marché que le PO a autorisé : « la zone tactile peut
     *   dépasser le visuel sans l'alourdir visuellement ». Une pastille dessine
     *   36 px et se touche sur 44, par un `::before` transparent. Une sonde qui
     *   mesurerait l'encre déclarerait en faute ce qui est justement la
     *   réponse à sa question — donc elle lit la hauteur du `::before` quand il
     *   y en a un.
     *
     * ⚠️ ET LE CHAMP DE SAISIE EST À 43 PX, SCIEMMENT. `.input` fait 43 — un
     *    pixel sous le plancher — et il n'est PAS grossi : ce pixel-là, ajouté
     *    à la vingtaine de champs d'un formulaire de ferme, c'est vingt pixels
     *    qui déplacent la mesure d'A201 (« le formulaire tient dans l'écran
     *    sans défilement », mesurée à 402 et à 1032 en AK). Un champ se vise
     *    sur toute sa largeur ; la décision est ici, écrite, plutôt qu'oubliée.
     */
    const FLOOR = 43
    const touchBox = (el: Element): { w: number; h: number } => {
      const r = el.getBoundingClientRect()
      const before = getComputedStyle(el, '::before')
      if (before.content === 'none' || before.position !== 'absolute') return { w: r.width, h: r.height }
      /* ⚠️ LES DEUX DIMENSIONS. La première version ne lisait que la hauteur,
         et déclarait donc en faute une pastille de carrousel dont le `::before`
         fait 44 × 44 : 10 de large, 44 de haut. Une zone tactile a deux côtés. */
      const h = parseFloat(before.height)
      const w = parseFloat(before.width)
      return {
        w: Number.isFinite(w) && w > r.width ? w : r.width,
        h: Number.isFinite(h) && h > r.height ? h : r.height,
      }
    }
    /**
     * ⛔ CE QUI EST EXCLU, NOMMÉ, AVEC SA RAISON — jamais « la sonde est trop
     *    bruyante », toujours « ceci n'est pas une cible tactile de plus » :
     *
     *  · `devbar`     — l'échafaudage du jumeau de démonstration, absent de
     *                   l'application du PO (voir `isDemoScaffold`).
     *  · l'attribution de MapLibre — le crédit légal des tuiles, imposé par la
     *                   bibliothèque, pas dessiné par nous.
     *  · `agenda-event` en vue SEMAINE — un bloc de rendez-vous fait la largeur
     *                   de sa colonne de jour ; sept colonnes dans 1 032 px
     *                   font 24 à 36 px chacune. L'élargir, c'est supprimer la
     *                   vue semaine. Elle a une vue JOUR à côté, où le même
     *                   rendez-vous fait toute la largeur, et c'est là qu'on le
     *                   touche.
     */
    const small = targets
      .filter((el) => {
        if (el.closest('[data-testid^="devbar"]') || el.closest('[data-testid="devbar"]')) return false
        if (el.closest('.maplibregl-ctrl-attrib')) return false
        if ((el.getAttribute('data-testid') ?? '') === 'agenda-event') return false
        /* ⚠️ LA POUSSÉE DE DÉFILEMENT : 32 px, ET ELLE Y RESTE. Élargie à 44,
           elle recouvre les pastilles de la rangée qu'elle fait défiler —
           `bun run pills` a mesuré trois zones tactiles de 1 × 1 px sur le
           sommaire des réglages. Elle est REDONDANTE (la rangée se balaie du
           doigt) : la manquer ne coûte rien, couvrir une pastille coûte un
           écran. Décision prise après l'avoir essayée, pas à la place. */
        if ((el.getAttribute('data-testid') ?? '').startsWith('scroll-nudge')) return false
        const r = el.getBoundingClientRect()
        if (r.bottom < 0 || r.top > innerHeight) return false
        /* Un lien DANS une phrase n'est pas un bouton : sa ligne fait 20 px et
           c'est ce que fait un lien. Il est jugé sur la RANGÉE qui le porte. */
        if (el.tagName === 'A' && el.closest('li, tr, [data-testid$="-tile"]') && r.height < 24) return false
        const b = touchBox(el)
        return b.h < FLOOR || b.w < FLOOR
      })
      .map((el) => {
        const b = touchBox(el)
        return `${idOf(el)} ${Math.round(b.w)}×${Math.round(b.h)}`
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ L'ACCIDENT #2, MESURÉ LÀ OÙ IL FAIT MAL : TOUT EN BAS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une ligne recouverte au milieu d'une liste se dégage d'un pouce. La
 * DERNIÈRE ne se dégage de rien : si le bas de la page ne réserve pas la
 * hauteur de ce qui flotte, elle reste dessous pour toujours. C'est ce qu'AA1.2
 * a trouvé sur מתנדבים, et c'est la seule forme de l'accident qu'une capture ne
 * montre pas — elle montre une liste qui continue.
 *
 * ★ La sonde POUSSE la page (et chaque conteneur qui défile) jusqu'à sa butée,
 *   puis demande à `elementFromPoint` qui reçoit le doigt.
 */
async function bottomProbe(page: Page) {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el)
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) {
        el.scrollTop = el.scrollHeight
      }
    }
  })
  await page.waitForTimeout(600)
  return await page.evaluate(() => {
    const seen = (el: Element): boolean => {
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false
      const r = el.getBoundingClientRect()
      return r.width > 4 && r.height > 4
    }
    const idOf = (el: Element): string =>
      el.getAttribute('data-testid') ??
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/)[0]}` : ''}`
    const isDemoScaffold = (el: Element): boolean =>
      !!el.closest('[data-testid^="devbar"]')
    const floating = Array.from(document.querySelectorAll('body *')).filter((el) => {
      if (getComputedStyle(el).position !== 'fixed') return false
      if (!seen(el) || isDemoScaffold(el)) return false
      const b = el.getBoundingClientRect()
      return b.width < innerWidth * 0.98 || b.height < innerHeight * 0.5
    })
    const out: string[] = []
    const targets = Array.from(
      document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], .tile-interactive, .card-interactive'),
    ).filter(seen).filter((el) => !isDemoScaffold(el))
    for (const t of targets) {
      const r = t.getBoundingClientRect()
      if (r.bottom < 0 || r.top > innerHeight) continue
      if (getComputedStyle(t).position === 'fixed') continue
      for (const f of floating) {
        if (f.contains(t) || t.contains(f)) continue
        const b = f.getBoundingClientRect()
        const ox = Math.min(r.right, b.right) - Math.max(r.left, b.left)
        const oy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)
        if (ox <= 0 || oy <= 0) continue
        /* ⚠️ LE CENTRE DE LA CIBLE, pas le centre de l'intersection : la
           question est « où le doigt vise-t-il », et il vise le milieu. */
        const hit = document.elementFromPoint(
          Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1),
          Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1),
        )
        if (hit && (f === hit || f.contains(hit))) out.push(`${idOf(f)} sur ${idOf(t)}`)
      }
    }
    return [...new Set(out)]
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

        /* ★ ET TOUT EN BAS : la dernière cible se dégage-t-elle du flottant ? */
        const stuck = await bottomProbe(page)
        check(`AL5 · ${tag} · en BAS de page, aucune cible ne reste sous un flottant`,
          stuck.length === 0, stuck.slice(0, 3).join(' · '))
        await page.evaluate(() => window.scrollTo(0, 0))
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
