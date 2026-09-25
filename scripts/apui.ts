import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page, Response, Route } from 'playwright'

import {
  APPOINTMENT_HORIZON_DAYS,
  jerusalemInstant,
} from '../src/core/availability'
import { MAX_PICKED_BYTES } from '../src/core/request'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AP — LA PAGE PUBLIQUE DANS UN VRAI NAVIGATEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run apui                                          # un build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum/bakasha bun run apui
 *   SKIP_BUILD=1 bun run apui                             # réutilise dist-bakasha
 *
 *   A249  parcours complet SUR TÉLÉPHONE, de l'accueil à la confirmation,
 *         sans blocage — et les cibles de 44 px, les écarts de 8 px, aucun
 *         texte sous 16 px, aucun débordement horizontal.
 *   A250  les documents demandés suivent le choix de l'étape 2, à l'écran.
 *   A251  l'étape des documents se passe, et la demande PART quand même.
 *   A252  le zéro initial du ת״ז traverse le formulaire et l'envoi.
 *   A253  sans נייד le bouton refuse ; sans mail il accepte.
 *   A254  les claviers, mesurés par CE QUE LE NAVIGATEUR DÉCIDE.
 *   A256  un fichier interdit est refusé PROPREMENT : la page le dit, la
 *         demande continue.
 *   A257  la page s'ouvre sans compte, depuis une session vierge.
 *   A258  aucun créneau un vendredi, un samedi, ni sur une heure déjà prise.
 *   A259  le créneau choisi part bien dans la demande.
 *
 * ⚠️ LE SERVEUR EST INTERCEPTÉ, PAS APPELÉ. Les trois RPC sont servies par
 *    cette porte : elle décide de ce qu'est « l'agenda du PO » pour pouvoir
 *    PROUVER qu'un créneau occupé disparaît — ce qu'on ne peut pas faire
 *    contre un agenda réel qu'on ne contrôle pas. Ce qui arrive VRAIMENT en
 *    base est mesuré ailleurs, contre `lo-yanum-prod` : A255 · A259 dans
 *    `docs/ap/ap-bout-en-bout.md`.
 *
 * ⚠️ ET ELLE TOURNE SUR CHROMIUM **ET** WEBKIT. Le lecteur type est sur un
 *    téléphone ; la moitié des téléphones d'Israël sont des iPhone, et
 *    `inputmode`, `aspect-ratio` et `dvh` ne se comportent pas pareil dans les
 *    deux moteurs.
 */

/**
 * ⚠️ LA BARRE FINALE EST GARDÉE, ET ELLE COMPTE. `…/bakasha` (sans barre) est
 *    une REDIRECTION 301 chez GitHub Pages : trente contextes neufs, c'est
 *    trente redirections en rafale depuis la même adresse, et le CDN finit par
 *    freiner. `…/bakasha/` est servi directement.
 */
const REMOTE = process.env.BASE_URL ?? ''

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ QUELS MOTEURS, ET POURQUOI LE DÉPLOYÉ SE MESURE SUR CHROMIUM ICI.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * En LOCAL, les deux : `chromium,webkit`, 136/136. C'est la règle, et elle ne
 * bouge pas — la moitié des téléphones d'Israël sont des iPhone.
 *
 * ⚠️ CONTRE LE DÉPLOYÉ, SUR CETTE MACHINE, WEBKIT NE TIENT PAS, ET CE N'EST
 *    PAS LA PAGE. Passé quelques contextes, il cesse d'ouvrir la moindre
 *    connexion : `page.goto` rend, le module n'arrive jamais, `getByTestId`
 *    expire, le processus ne consomme rien et `lsof` ne montre AUCUNE socket
 *    vers l'hôte. Quatre remèdes essayés et mesurés, aucun ne suffit —
 *    `networkidle` → `load`, la barre finale pour éviter une 301 par
 *    navigation, trois reprises de `goto`, et le navigateur relancé
 *    périodiquement (à 6 puis à 1, ce dernier étant PIRE).
 *
 * ★ CE QUI EST PROUVÉ MALGRÉ TOUT, ET C'EST SUFFISANT POUR LE DIRE :
 *   · Chromium fait les DIX sections sur le DÉPLOYÉ, tout au vert ;
 *   · WebKit fait les DIX sections sur le build LOCAL du même source, tout au
 *     vert — et le bundle déployé est ce build, produit par le même Vite ;
 *   · et sur le déployé, WebKit a passé A257, le parcours des sept écrans en
 *     entier et une partie d'A250 avant de caler, sans jamais rendre un FAIL.
 *
 * ⛔ CE QUI N'EST PAS FAIT : masquer l'échec. Le moteur se CHOISIT, la valeur
 *    employée est écrite dans le rapport, et la ligne ci-dessus dit pourquoi.
 *    Sur une machine qui tient WebKit à distance, `AP_ENGINES=chromium,webkit`
 *    rend la mesure complète sans toucher à ce fichier.
 */
const ENGINES = (process.env.AP_ENGINES ?? 'chromium,webkit')
  .split(',')
  .map((e) => e.trim())
  .filter((e) => e !== '')
const PORT = Number(process.env.AP_PORT ?? 5361)
const OUT = process.env.DIST ?? 'dist-bakasha'

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

// ---------------------------------------------------------------------------
// Le build, et le serveur
// ---------------------------------------------------------------------------

const serves: Array<ReturnType<typeof Bun.spawn>> = []

async function serveBuild(): Promise<string> {
  if (process.env.SKIP_BUILD !== '1') {
    /* ⚠️ LA PAIRE EST FABRIQUÉE, ET ELLE DOIT ÊTRE PRÉSENTE. Sans elle,
       `CONFIGURED` est faux et la page ne fait AUCUNE requête : la porte
       mesurerait une page qui ne parle à personne, ce qui est précisément ce
       qu'il ne faut pas livrer (règle 12 de PROJECT_STATE.md, le jumeau
       `/demo`). L'adresse est fausse — c'est l'interception qui répond. */
    const build = Bun.spawn(
      ['bun', 'x', 'vite', 'build', '--config', 'vite.bakasha.config.ts', '--outDir', OUT],
      {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://fake.supabase.co',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_gate_0000000000000000',
        },
        stdout: 'ignore',
        stderr: 'pipe',
      },
    )
    if ((await build.exited) !== 0) {
      console.error(await new Response(build.stderr).text())
      throw new Error('vite build failed (bakasha)')
    }
  }
  serves.push(
    Bun.spawn(
      ['bun', 'x', 'vite', 'preview', '--config', 'vite.bakasha.config.ts', '--outDir', OUT, '--port', String(PORT), '--strictPort'],
      { stdout: 'ignore', stderr: 'ignore' },
    ),
  )
  const base = `http://localhost:${PORT}`
  const deadline = Date.now() + 40_000
  for (;;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* pas encore */
    }
    if (Date.now() > deadline) throw new Error('vite preview (bakasha) did not come up')
    await Bun.sleep(300)
  }
  return base
}

const BASE = REMOTE !== '' ? REMOTE : await serveBuild()
console.log(`  page    : ${BASE}`)
console.log(`  moteurs : ${ENGINES.join(' · ')}`)

/**
 * ⚠️ `'load'` ET NON `'networkidle'`, ET C'EST UNE LEÇON PRISE SUR LE DÉPLOYÉ.
 *
 * `networkidle` attend 500 ms sans plus de deux connexions ouvertes. Contre un
 * serveur local c'est instantané ; contre GitHub Pages, qui garde ses
 * connexions vivantes, la condition finit par ne plus arriver — mesuré : les
 * vingt-huit premiers contextes passent, le vingt-neuvième rend
 * « goto: Timeout 30000ms exceeded, waiting until networkidle » alors que
 * **toutes les assertions faites jusque-là étaient vertes**.
 *
 * ★ ET RIEN DE CE QUE CETTE PORTE AFFIRME NE DÉPEND DU SILENCE DU RÉSEAU. Ce
 *   qu'elle veut, c'est que la page soit là : chaque section attend ensuite
 *   l'élément dont elle a besoin (`getByTestId(...).waitFor()`), ce qui est la
 *   condition vraie et non une heuristique. `networkidle` était une façon
 *   commode de ne pas l'écrire, et une porte rouge pour une raison qui n'est
 *   pas le produit est pire qu'une porte lente.
 */
const READY = { waitUntil: 'load' as const, timeout: 45_000 }

/**
 * Ouvrir la page — avec DEUX reprises quand elle est distante.
 *
 * ⚠️ UNE REPRISE N'EST PAS UNE INDULGENCE ENVERS LE PRODUIT : ce qui échoue
 *    ici est une NAVIGATION vers un hôte tiers, pas une assertion. Mesuré
 *    contre GitHub Pages : les vingt-huit premiers contextes s'ouvrent, puis
 *    un `goto` reste en attente au-delà de la minute — et tout ce qui avait
 *    été affirmé jusque-là était vert. Un rouge dont la cause est le CDN de
 *    quelqu'un d'autre apprend à ne plus lire la porte.
 *
 * ⛔ CE QUI N'EST PAS REPRIS : tout le reste. Un clic, une attente d'élément,
 *    une mesure — aucun n'a droit à une seconde chance.
 */
async function open(page: Page): Promise<Response | null> {
  let last: unknown = null
  for (let attempt = 0; attempt < (REMOTE === '' ? 1 : 3); attempt += 1) {
    try {
      return await page.goto(BASE, READY)
    } catch (e) {
      last = e
      await page.waitForTimeout(2_000 * (attempt + 1))
    }
  }
  throw last
}

// ---------------------------------------------------------------------------
// L'agenda fabriqué, et ce que la page envoie
// ---------------------------------------------------------------------------

/**
 * ★ UNE JOURNÉE ENTIÈREMENT OCCUPÉE, CHOISIE LOIN DU DÉLAI DE 24 H pour que
 *   la porte n'en dépende pas. `freeSlots` doit la faire disparaître en
 *   entier ; toute autre journée ouverte reste intacte.
 */
function busyDayKey(): string {
  const d = new Date()
  const at = new Date(d.getTime() + 8 * 24 * 3600_000)
  /* Un jour ouvert : on avance jusqu'au premier qui n'est ni vendredi ni samedi. */
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(at.getTime() + i * 24 * 3600_000)
    const key = day.toISOString().slice(0, 10)
    const dow = new Date(`${key}T12:00:00Z`).getUTCDay()
    if (dow !== 5 && dow !== 6) return key
  }
  throw new Error('no open day found')
}

const BUSY_DAY = busyDayKey()

const AGREEMENT_OVERRIDE = '## הסכם התנדבות- ארצנו\n\nשם החקלאי: {{שם_החקלאי}}\n\n## סעיף שהוסף לצורך הבדיקה\n\nזהו טקסט שנקרא מן ההגדרות.'

interface Sent {
  payload: Record<string, unknown>
}

/** Intercepte les trois RPC ; conserve ce que la page a envoyé. */
async function installRpc(ctx: BrowserContext, sent: Sent[]): Promise<void> {
  await ctx.route('**/rest/v1/rpc/**', async (route: Route) => {
    const url = route.request().url()
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (url.includes('public_busy_intervals')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            starts_at: jerusalemInstant(BUSY_DAY, 6).toISOString(),
            ends_at: jerusalemInstant(BUSY_DAY, 23).toISOString(),
          },
        ]),
      })
      return
    }
    if (url.includes('public_agreement_template')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(AGREEMENT_OVERRIDE),
      })
      return
    }
    if (url.includes('submit_aid_request')) {
      sent.push({ payload: (body.payload ?? {}) as Record<string, unknown> })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, reference: 'AP1234' }),
      })
      return
    }
    await route.fulfill({ status: 404, body: '{}' })
  })
}

// ---------------------------------------------------------------------------
// Les mesures partagées
// ---------------------------------------------------------------------------

/**
 * Ce que le navigateur a DÉCIDÉ pour chaque champ VISIBLE.
 *
 * ⚠️ `.az-sr` EST EXCLU, ET C'EST LA PREMIÈRE CHOSE QUE CETTE PORTE A
 *    TROUVÉE — SUR ELLE-MÊME. Les deux `<input type="file">` de chaque
 *    document sont délibérément hors écran (le bouton visible les déclenche) ;
 *    mesurés comme des champs, ils rendaient « 11 px » et faisaient échouer la
 *    règle des 16 px. Un champ qu'aucun doigt ne touche n'ouvre aucun clavier
 *    et ne fait zoomer personne : la question ne se pose pas pour lui.
 */
async function keyboards(page: Page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll('input')]
      .filter((el) => !el.classList.contains('az-sr') && el.getBoundingClientRect().width > 0)
      .map((el) => ({
        id: el.dataset.testid ?? '',
        kind: el.getAttribute('data-kind') ?? '',
        type: el.type,
        inputMode: el.inputMode,
        pattern: el.getAttribute('pattern') ?? '',
        /* ⚠️ LA TAILLE EST CELLE QUE LE NAVIGATEUR CALCULE, pas celle que la
           feuille déclare : sous 16 px, iOS zoome à la frappe (AM4). */
        fontSize: Number.parseFloat(getComputedStyle(el).fontSize),
      })),
  )
}

/** Toute cible tactile de l'écran, avec sa boîte. */
async function targets(page: Page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll('button, a, input, [role="button"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return (
          r.width > 0 &&
          r.height > 0 &&
          cs.visibility !== 'hidden' &&
          cs.display !== 'none' &&
          /* Un `<input type=file>` est délibérément hors écran (`az-sr`) : le
             bouton visible est ce qu'on touche. */
          !el.classList.contains('az-sr')
        )
      })
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          tag: el.tagName,
          id: (el as HTMLElement).dataset.testid ?? '',
          text: (el.textContent ?? '').trim().slice(0, 24),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        }
      }),
  )
}

const PHONE = { width: 390, height: 844 }

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ LE NAVIGATEUR EST RELANCÉ TOUS LES SIX CONTEXTES QUAND LA PAGE EST
 *    DISTANTE,
 *    ET C'EST UNE LIMITE DE L'OUTIL, PAS DU PRODUIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mesuré contre `https://azmer-fts.github.io/lo-yanum/bakasha/` : passé une
 * trentaine de contextes, **WebKit cesse d'ouvrir la moindre connexion** —
 * `page.goto` reste en attente indéfiniment, le processus ne consomme rien, et
 * `lsof` ne montre **aucune** socket vers l'hôte. Ce n'est pas un délai réseau
 * (il n'y a pas de requête), et ce n'est pas la page (les trente contextes
 * précédents l'ont ouverte et mesurée, tout au vert, sur les deux moteurs).
 * C'est la réserve de processus de WebKit qui sature sur cette machine.
 *
 * ⚠️ TROIS CHOSES ONT ÉTÉ ESSAYÉES AVANT CELLE-CI, ET AUCUNE NE SUFFIT :
 *    `networkidle` → `load` (vrai défaut par ailleurs, corrigé plus haut),
 *    la barre finale pour éviter une 301 par navigation, et trois reprises de
 *    `goto`. La porte allait à chaque fois un peu plus loin et calait au même
 *    endroit : ce qui sature n'est pas la navigation, c'est le navigateur.
 *
 * ★ EN LOCAL, RIEN NE CHANGE : un seul navigateur pour toute la passe, comme
 *   avant. Relancer coûte une à deux secondes, ce qui est acceptable contre un
 *   hôte distant et inutile contre `localhost`.
 *
 * ⚠️ SIX SUFFIT À CHROMIUM ET NE SUFFIT PAS À WEBKIT — voir `ENGINES`
 *    ci-dessous. Descendre à UN a rendu les choses PIRES (WebKit calait dès sa
 *    première section) : ce n'est donc pas une question de nombre.
 */
const CONTEXTS_PER_BROWSER = REMOTE === '' ? Number.POSITIVE_INFINITY : 6

class Engine {
  private browser: Browser | null = null
  private used = 0

  constructor(private readonly type: typeof chromium) {}

  get name(): string {
    return this.type.name()
  }

  async get(): Promise<Browser> {
    if (this.browser !== null && this.used >= CONTEXTS_PER_BROWSER) {
      await this.browser.close()
      this.browser = null
      this.used = 0
    }
    this.browser ??= await this.type.launch()
    this.used += 1
    return this.browser
  }

  async close(): Promise<void> {
    await this.browser?.close()
    this.browser = null
  }
}

async function newPage(engine: Engine, sent: Sent[], opts: { dark?: boolean } = {}) {
  const browser = await engine.get()
  const ctx = await browser.newContext({
    viewport: PHONE,
    hasTouch: true,
    isMobile: browser.browserType().name() === 'chromium',
    locale: 'he-IL',
    colorScheme: opts.dark ? 'dark' : 'light',
    /* ⚠️ LE FUSEAU EST CELUI DU LECTEUR, PAS CELUI DE LA MACHINE. Une porte
       qui tourne en UTC verrait « vendredi » commencer un jeudi soir. */
    timeZoneId: 'Asia/Jerusalem',
  })
  await installRpc(ctx, sent)
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return { ctx, page, errors }
}

/** Le parcours, jusqu'à l'étape nommée. */
async function walkTo(page: Page, step: string, opts: { withEmail?: boolean } = {}) {
  await page.getByTestId('start').click()
  await page.getByTestId('need-both').click()
  if (step === 'need') return
  await page.getByTestId('next').click()
  await page.getByTestId('land-both').click()
  if (step === 'land') return
  await page.getByTestId('next').click()
  await page.getByTestId('farmName').fill('חוות הבדיקה')
  await page.getByTestId('fullName').fill('ישראל ישראלי')
  await page.getByTestId('idNumber').fill('021985189')
  await page.getByTestId('phone').fill('0525274774')
  if (opts.withEmail === true) await page.getByTestId('email').fill('dov@example.com')
  await page.getByTestId('locality').fill('מיצד')
  if (step === 'who') return
  await page.getByTestId('next').click()
  await page.getByTestId('documents-step').waitFor()
  if (step === 'documents') return
  await page.getByTestId('skip').click()
  await page.getByTestId('agreement').waitFor()
  if (step === 'agreement') return
  await page.getByTestId('next').click()
  await page.waitForSelector('[data-step="appointment"]')
}

// ---------------------------------------------------------------------------

const TYPES = { chromium, webkit } as const

for (const key of ENGINES) {
  const browserType = TYPES[key as keyof typeof TYPES]
  if (!browserType) throw new Error(`moteur inconnu : ${key}`)
  const engine = new Engine(browserType)
  const name = engine.name

  // -------------------------------------------------------------------------
  section(`A249 · A257 — ${name} : l'accueil s'ouvre sans compte, sur un téléphone`)
  // -------------------------------------------------------------------------
  {
    const sent: Sent[] = []
    const { ctx, page, errors } = await newPage(engine, sent)
    /**
     * ⚠️ SESSION VIERGE ET NON « DÉCONNECTÉE ». Un contexte neuf de Playwright
     *    n'a ni cookie, ni `localStorage`, ni service worker — c'est
     *    exactement l'état d'un agriculteur qui touche un lien reçu par
     *    WhatsApp, et rien d'autre ne prouve A257.
     */
    const res = await open(page)
    check(`A257 · ${name} · la page répond 200 sans le moindre jeton`,
      (res?.status() ?? 0) === 200, String(res?.status()))
    const storage = await ctx.storageState()
    check(`A257 · ${name} · aucun cookie, aucun stockage n'a été exigé`,
      storage.cookies.length === 0 && storage.origins.length === 0,
      `${storage.cookies.length} cookies · ${storage.origins.length} origines`)
    await page.getByTestId('landing').waitFor()
    check(`A257 · ${name} · aucun écran de connexion ne s'interpose`,
      (await page.locator('input[type="password"]').count()) === 0)
    check(`A257 · ${name} · et aucun service worker n'est posé`,
      (await page.evaluate(() => navigator.serviceWorker?.controller !== undefined &&
        navigator.serviceWorker.controller !== null)) === false)

    /* AP2 — ce que porte l'accueil, et ce qu'il ne porte PAS. */
    check(`A249 · ${name} · la photo des volontaires est en tête`,
      await page.getByTestId('hero').isVisible())
    const heroBox = await page.getByTestId('hero').boundingBox()
    check(`A249 · ${name} · elle est en GRAND (au moins un cinquième de l'écran)`,
      (heroBox?.height ?? 0) >= PHONE.height * 0.2, `${Math.round(heroBox?.height ?? 0)} px`)
    check(`A249 · ${name} · UN SEUL bouton, large, sur l'accueil`,
      (await page.locator('[data-testid="landing"] button').count()) === 1)
    const cta = await page.getByTestId('start').boundingBox()
    check(`A249 · ${name} · il fait au moins 56 px de haut et la largeur de l'écran`,
      (cta?.height ?? 0) >= 56 && (cta?.width ?? 0) >= PHONE.width * 0.8,
      `${Math.round(cta?.width ?? 0)} × ${Math.round(cta?.height ?? 0)}`)
    check(`A249 · ${name} · et AUCUN lien qui fasse sortir de la page (AP2.4)`,
      (await page.locator('[data-testid="landing"] a').count()) === 0)
    /* Le brief demande un menu absent, pas un menu replié. */
    check(`A249 · ${name} · aucun menu`,
      (await page.locator('nav, [role="navigation"]').count()) === 0)
    check(`A249 · ${name} · aucune erreur de page sur l'accueil`,
      errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  }

  // -------------------------------------------------------------------------
  section(`A249 — ${name} : le parcours entier, écran par écran`)
  // -------------------------------------------------------------------------
  {
    const sent: Sent[] = []
    const { ctx, page, errors } = await newPage(engine, sent)
    await open(page)

    const seen: string[] = []
    const problems: string[] = []
    await page.getByTestId('start').click()

    /** Ce qu'on mesure à CHAQUE écran, sans exception. */
    async function auditScreen(label: string) {
      seen.push(label)
      const t = await targets(page)
      /* 44 px minimum. `--az-touch` vaut 48 ; la règle du brief est 44. */
      const small = t.filter((b) => b.h < 44 || b.w < 44)
      if (small.length > 0)
        problems.push(`${label}: cibles < 44 px → ${small.map((s) => `${s.id || s.text} ${s.w}×${s.h}`).join(', ')}`)
      /* 8 px d'écart entre deux cibles qui se suivent verticalement. */
      const sorted = [...t].sort((a, b) => a.y - b.y)
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1]
        const cur = sorted[i]
        const sameColumn = cur.x < prev.x + prev.w && prev.x < cur.x + cur.w
        const gap = cur.y - (prev.y + prev.h)
        if (sameColumn && gap >= 0 && gap < 8)
          problems.push(`${label}: ${prev.id || prev.text} / ${cur.id || cur.text} écart ${gap} px`)
      }
      /* Aucun texte sous 16 px dans un champ de saisie. */
      const k = await keyboards(page)
      const tiny = k.filter((f) => f.fontSize < 16)
      if (tiny.length > 0)
        problems.push(`${label}: champs sous 16 px → ${tiny.map((f) => `${f.id} ${f.fontSize}`).join(', ')}`)
      /* Aucun débordement horizontal : sur un téléphone, il se lit comme une
         page cassée et il cache toujours quelque chose. */
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      if (overflow > 1) problems.push(`${label}: débordement horizontal de ${overflow} px`)
    }

    await page.getByTestId('need-both').click()
    await auditScreen('1 · מה אתם מחפשים')
    await page.getByTestId('next').click()
    await page.getByTestId('land-both').click()
    await auditScreen('2 · מה יש לכם בשטח')
    await page.getByTestId('next').click()
    await page.getByTestId('farmName').fill('חוות הבדיקה')
    await page.getByTestId('fullName').fill('ישראל ישראלי')
    await page.getByTestId('idNumber').fill('021985189')
    await page.getByTestId('phone').fill('0525274774')
    await page.getByTestId('locality').fill('מיצד')
    await auditScreen('3 · מי אתם')
    await page.getByTestId('next').click()
    await page.getByTestId('documents-step').waitFor()
    await auditScreen('4 · מסמכים')
    await page.getByTestId('skip').click()
    await page.getByTestId('agreement').waitFor()
    await auditScreen('5 · הסכם')
    await page.getByTestId('next').click()
    await page.waitForSelector('[data-step="appointment"]')
    await page.getByTestId('slots').waitFor()
    await auditScreen('6 · מועד')
    await page.getByTestId('slot').first().click()
    await page.getByTestId('send').click()
    await page.getByTestId('done').waitFor()
    await auditScreen('7 · אישור')

    check(`A249 · ${name} · les sept écrans se sont enchaînés sans blocage`,
      seen.length === 7, seen.join(' → '))
    check(`A249 · ${name} · toutes les cibles font 44 px, se tiennent à 8 px, et rien ne déborde`,
      problems.length === 0, problems.slice(0, 3).join(' | '))
    check(`A249 · ${name} · la confirmation porte la référence`,
      (await page.getByTestId('reference').textContent())?.trim() === 'AP1234')
    check(`A249 · ${name} · et les coordonnées du PO`,
      (await page.getByTestId('po-phone').getAttribute('href')) === 'tel:052-5274774' &&
        (await page.getByTestId('po-email').getAttribute('href')) === 'mailto:dovbensoussan@gmail.com')
    check(`A249 · ${name} · aucune erreur de page sur tout le parcours`,
      errors.length === 0, errors.slice(0, 2).join(' | '))

    /* A252 · A259 — CE QUI EST PARTI. */
    const payload = sent[0]?.payload ?? {}
    check(`A252 · ${name} · le zéro initial du ת״ז est dans ce qui part`,
      payload.idNumber === '021985189', String(payload.idNumber))
    check(`A253 · ${name} · le mail parti est vide, et la demande est passée`,
      payload.email === '', JSON.stringify(payload.email))
    check(`A259 · ${name} · le créneau choisi est parti avec son début ET sa fin`,
      typeof payload.appointmentAt === 'string' &&
        typeof payload.appointmentEndAt === 'string' &&
        new Date(String(payload.appointmentEndAt)) > new Date(String(payload.appointmentAt)),
      `${payload.appointmentAt} → ${payload.appointmentEndAt}`)
    check(`A251 · ${name} · aucun document, et la demande est partie quand même`,
      Array.isArray(payload.documents) && (payload.documents as unknown[]).length === 0)
    await ctx.close()
  }

  // -------------------------------------------------------------------------
  section(`A250 — ${name} : les documents demandés suivent l'étape 2`)
  // -------------------------------------------------------------------------
  {
    for (const [land, expected] of [
      ['crops', ['crops']],
      ['grazing', ['grazing']],
      ['both', ['crops', 'grazing']],
    ] as const) {
      const sent: Sent[] = []
      const { ctx, page } = await newPage(engine, sent)
      await open(page)
      await page.getByTestId('start').click()
      await page.getByTestId('need-guarding').click()
      await page.getByTestId('next').click()
      await page.getByTestId(`land-${land}`).click()
      await page.getByTestId('next').click()
      await page.getByTestId('farmName').fill('א')
      await page.getByTestId('fullName').fill('ב')
      await page.getByTestId('phone').fill('0525274774')
      await page.getByTestId('next').click()
      await page.getByTestId('documents-step').waitFor()
      const cards = await page.locator('[data-testid^="doc-"][data-provided]').evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset.testid?.replace('doc-', '') ?? ''),
      )
      check(`A250 · ${name} · ${land} → ${expected.length} document(s) à l'écran`,
        JSON.stringify(cards) === JSON.stringify([...expected]), cards.join(' · '))
      await ctx.close()
    }
  }

  // -------------------------------------------------------------------------
  section(`A254 — ${name} : les claviers, tels que le navigateur les décide`)
  // -------------------------------------------------------------------------
  {
    const sent: Sent[] = []
    const { ctx, page } = await newPage(engine, sent)
    await open(page)
    await walkTo(page, 'who')
    const fields = await keyboards(page)
    const by = (id: string) => fields.find((f) => f.id === id)
    check(`A254 · ${name} · les six champs portent tous un \`kind\``,
      fields.length === 6 && fields.every((f) => f.kind !== ''),
      fields.map((f) => `${f.id}:${f.kind}`).join(' · '))
    /* ⚠️ `type` ET `inputMode` LUS SUR LA PROPRIÉTÉ DE L'ÉLÉMENT, pas sur
       l'attribut : c'est ce que le navigateur a retenu, et c'est lui qui
       ouvre le clavier. Un `inputmode` inconnu retombe silencieusement sur
       `text`, ce qu'un `getAttribute` ne verrait jamais. */
    check(`A254 · ת״ז — ${name} · pavé numérique, et TEXTE (le zéro tient)`,
      by('idNumber')?.type === 'text' && by('idNumber')?.inputMode === 'numeric',
      `${by('idNumber')?.type} / ${by('idNumber')?.inputMode}`)
    check(`A254 · נייד — ${name} · pavé numérique`,
      by('phone')?.type === 'text' && by('phone')?.inputMode === 'numeric',
      `${by('phone')?.type} / ${by('phone')?.inputMode}`)
    check(`A254 · מייל — ${name} · clavier courriel`,
      by('email')?.inputMode === 'email', String(by('email')?.inputMode))
    check(`A254 · שם / יישוב — ${name} · clavier texte, jamais numérique`,
      by('fullName')?.inputMode !== 'numeric' && by('locality')?.inputMode !== 'numeric')
    check(`A254 · ${name} · AUCUN \`type="number"\` nulle part`,
      fields.every((f) => f.type !== 'number'))
    check(`A254 · ${name} · et aucun champ sous 16 px (iOS zoomerait à la frappe)`,
      fields.every((f) => f.fontSize >= 16),
      fields.map((f) => `${f.id}:${f.fontSize}`).join(' · '))

    /* Le נייד se met en forme à la frappe, et le ת״ז NON. */
    await page.getByTestId('phone').fill('')
    await page.getByTestId('phone').type('0525274774', { delay: 10 })
    check(`A254 · ${name} · le נייד se met en forme sous le doigt`,
      (await page.getByTestId('phone').inputValue()) === '(052) 527-4774',
      await page.getByTestId('phone').inputValue())
    await page.getByTestId('idNumber').fill('')
    await page.getByTestId('idNumber').type('021985189', { delay: 10 })
    check(`A252 · ${name} · et le ת״ז garde son zéro à la frappe`,
      (await page.getByTestId('idNumber').inputValue()) === '021985189',
      await page.getByTestId('idNumber').inputValue())
    await ctx.close()
  }

  // -------------------------------------------------------------------------
  section(`A253 — ${name} : le refus est nommé, et il ne bloque que ce qu'il doit`)
  // -------------------------------------------------------------------------
  {
    const sent: Sent[] = []
    const { ctx, page } = await newPage(engine, sent)
    await open(page)
    await page.getByTestId('start').click()
    await page.getByTestId('need-both').click()
    await page.getByTestId('next').click()
    await page.getByTestId('land-crops').click()
    await page.getByTestId('next').click()
    /* Rien de rempli : « המשך » ne doit pas avancer, et il doit DIRE pourquoi. */
    await page.getByTestId('next').click()
    await page.waitForTimeout(150)
    check(`A253 · ${name} · sans rien, la page reste sur l'étape et nomme ce qui manque`,
      (await page.getAttribute('[data-step]', 'data-step')) === 'who' &&
        (await page.locator('.az-error').count()) >= 3,
      `${await page.locator('.az-error').count()} reproches`)
    await page.getByTestId('farmName').fill('חוות')
    await page.getByTestId('fullName').fill('ישראל')
    await page.getByTestId('next').click()
    await page.waitForTimeout(150)
    check(`A253 · ${name} · le נייד reste le dernier obstacle`,
      (await page.getAttribute('[data-step]', 'data-step')) === 'who' &&
        (await page.getByTestId('phone').getAttribute('aria-invalid')) === 'true')
    await page.getByTestId('phone').fill('0525274774')
    await page.getByTestId('email').fill('michel@')
    await page.getByTestId('next').click()
    await page.waitForTimeout(150)
    check(`A253 · ${name} · un mail TAPÉ mais impossible bloque à son tour`,
      (await page.getAttribute('[data-step]', 'data-step')) === 'who' &&
        (await page.getByTestId('email').getAttribute('aria-invalid')) === 'true')
    await page.getByTestId('email').fill('')
    await page.getByTestId('next').click()
    await page.getByTestId('documents-step').waitFor()
    check(`A253 · ${name} · vidé, il ne bloque plus — le mail est bien FACULTATIF`,
      (await page.getAttribute('[data-step]', 'data-step')) === 'documents')
    await ctx.close()
  }

  // -------------------------------------------------------------------------
  section(`A256 — ${name} : un fichier refusé l'est PROPREMENT`)
  // -------------------------------------------------------------------------
  {
    const sent: Sent[] = []
    const { ctx, page, errors } = await newPage(engine, sent)
    await open(page)
    await walkTo(page, 'documents')

    /* Un type interdit. */
    await page.setInputFiles('[data-testid="doc-crops-pdf"]', {
      name: 'virus.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ'),
    })
    await page.waitForTimeout(300)
    check(`A256 · ${name} · un exécutable est refusé, et la page le DIT en hébreu`,
      (await page.locator('[data-testid="doc-crops"] .az-error').count()) === 1,
      (await page.locator('[data-testid="doc-crops"] .az-error').textContent()) ?? '')
    check(`A256 · ${name} · la fiche reste « pas encore joint », pas à demi remplie`,
      (await page.getAttribute('[data-testid="doc-crops"]', 'data-provided')) === 'no')

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * Un fichier TROP GROS — et ce cas-ci ne tourne QUE sur un build local.
     * ═══════════════════════════════════════════════════════════════════════
     *
     * ⚠️ CE QUI EST LENT N'EST PAS LA PAGE, C'EST LE TUYAU DE LA PORTE. Le
     *    refus se déclenche sur `size > MAX_PICKED_BYTES` : il faut donc
     *    transporter douze mégaoctets **du script vers le navigateur**, par le
     *    protocole de débogage, encodés en base64. Sur cette machine, contre
     *    le déployé — où le navigateur est relancé toutes les six sections et
     *    repart donc froid — ce transfert dépasse trois minutes et rend
     *    « Timeout » sur une opération qui n'a rien à voir avec le réseau ni
     *    avec le produit.
     *
     * ★ ET LE DÉPLOYÉ N'APPREND RIEN DE PLUS ICI. `refusePick` est du code de
     *   bundle, identique dans les deux builds ; ce qu'un navigateur ajoute,
     *   c'est « le refus s'affiche et ne coince pas », et le cas du TYPE
     *   interdit juste au-dessus le prouve déjà, sur les deux moteurs et sur
     *   les deux URLs. La règle de taille elle-même est prouvée trois fois
     *   ailleurs : `appass` A256 sur la fonction pure, et `apreal` sur le SQL,
     *   qui est le seul endroit où elle PROTÈGE vraiment.
     */
    if (REMOTE === '') {
      await page.setInputFiles(
        '[data-testid="doc-crops-pdf"]',
        {
          name: 'enorme.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.alloc(MAX_PICKED_BYTES + 1, 0x20),
        },
        { timeout: 180_000 },
      )
      await page.waitForTimeout(500)
      check(`A256 · ${name} · un fichier trop gros est refusé, et la page le DIT`,
        (await page.locator('[data-testid="doc-crops"] .az-error').count()) === 1)
    } else {
      console.log(
        `  SKIP  A256 · ${name} · le fichier trop gros — 12 Mio par le protocole de débogage, ` +
          'mesuré en local (le refus de TYPE ci-dessus couvre le chemin d\'affichage)',
      )
    }

    /* ⚠️ ET APRÈS DEUX REFUS, LE PARCOURS CONTINUE. « Une demande sans
       document vaut mieux que pas de demande » : un refus qui laisse la page
       coincée est pire que le fichier refusé. */
    await page.getByTestId('skip').click()
    await page.getByTestId('agreement').waitFor()
    check(`A256 · ${name} · et après deux refus, la demande continue`,
      (await page.getAttribute('[data-step]', 'data-step')) === 'agreement')
    check(`A256 · ${name} · aucune erreur de page pendant les refus`,
      errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  }

  // -------------------------------------------------------------------------
  section(`A251 — ${name} : un PDF déposé, lui, part avec la demande`)
  // -------------------------------------------------------------------------
  {
    const sent: Sent[] = []
    const { ctx, page } = await newPage(engine, sent)
    await open(page)
    await walkTo(page, 'documents')
    await page.setInputFiles('[data-testid="doc-crops-pdf"]', {
      name: 'זכות-בקרקע.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% gate\n'),
    })
    await page.waitForFunction(
      () => document.querySelector('[data-testid="doc-crops"]')?.getAttribute('data-provided') === 'yes',
    )
    check(`A251 · ${name} · le document déposé s'affiche comme joint`,
      (await page.getAttribute('[data-testid="doc-crops"]', 'data-provided')) === 'yes')
    check(`A251 · ${name} · et celui du pâturage reste vide, sans bloquer`,
      (await page.getAttribute('[data-testid="doc-grazing"]', 'data-provided')) === 'no')
    await page.getByTestId('next').click()
    await page.getByTestId('agreement').waitFor()
    await page.getByTestId('next').click()
    await page.waitForSelector('[data-step="appointment"]')
    await page.getByTestId('skip').click()
    await page.getByTestId('done').waitFor()
    const docs = (sent[0]?.payload.documents ?? []) as Array<Record<string, unknown>>
    check(`A251 · ${name} · UN seul document part, celui qui a été déposé`,
      docs.length === 1 && docs[0].id === 'crops', JSON.stringify(docs.map((d) => d.id)))
    check(`A251 · ${name} · et c'est un PDF, pas autre chose`,
      String(docs[0]?.file ?? '').startsWith('data:application/pdf;base64,'))
    check(`A251 · ${name} · passer le rendez-vous envoie la demande sans créneau`,
      sent[0]?.payload.appointmentAt === null, String(sent[0]?.payload.appointmentAt))
    await ctx.close()
  }

  // -------------------------------------------------------------------------
  section(`A258 — ${name} : aucun créneau fermé, aucun créneau déjà pris`)
  // -------------------------------------------------------------------------
  {
    const sent: Sent[] = []
    const { ctx, page } = await newPage(engine, sent)
    await open(page)
    await walkTo(page, 'appointment')
    await page.getByTestId('slots').waitFor()
    const days = await page.locator('[data-day]').evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).dataset.day ?? ''),
    )
    const weekend = days.filter((d) => {
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
      return dow === 5 || dow === 6
    })
    check(`A258 · ${name} · aucun vendredi, aucun samedi dans les jours proposés`,
      weekend.length === 0, weekend.join(' · '))
    check(`A258 · ${name} · la journée occupée par l'agenda a DISPARU en entier`,
      !days.includes(BUSY_DAY), `${BUSY_DAY} — ${days.length} jours proposés`)
    check(`A258 · ${name} · et les autres jours sont restés`,
      days.length > 10, `${days.length} jours`)
    check(`A258 · ${name} · rien au-delà de l'horizon annoncé`,
      days.every((d) => d <= new Date(Date.now() + (APPOINTMENT_HORIZON_DAYS + 1) * 86_400_000).toISOString().slice(0, 10)),
      days[days.length - 1])
    /* ⚠️ ET LA PAGE N'A APPRIS DE L'AGENDA QUE DES DATES. Une page publique
       qui afficherait « בוקר אצל חוות X » livrerait l'emploi du temps du PO. */
    const text = await page.locator('[data-testid="slots"]').innerText()
    check(`A258 · ${name} · aucun nom de ferme, aucun titre de rendez-vous à l'écran`,
      !/חוות|פגישה|ביקור/.test(text))
    await ctx.close()
  }

  // -------------------------------------------------------------------------
  section(`AP3.5 — ${name} : l'accord vient du gabarit des réglages`)
  // -------------------------------------------------------------------------
  {
    const sent: Sent[] = []
    const { ctx, page } = await newPage(engine, sent)
    await open(page)
    await walkTo(page, 'agreement')
    await page.waitForFunction(() =>
      (document.querySelector('[data-testid="agreement"]')?.textContent ?? '').includes('הבדיקה'),
    )
    const shown = await page.getByTestId('agreement').innerText()
    check(`AP3.5 · ${name} · le texte affiché est CELUI DES RÉGLAGES, pas le livré`,
      shown.includes('סעיף שהוסף לצורך הבדיקה'))
    check(`AP3.5 · ${name} · et ses variables sont remplies avec ce qui a été saisi`,
      shown.includes('ישראל ישראלי'))
    /* La signature au doigt. */
    const pad = await page.getByTestId('signature').boundingBox()
    check(`AP3.5 · ${name} · le pavé de signature est visible sans défiler`,
      pad !== null && pad.y + 40 < PHONE.height,
      `y=${Math.round(pad?.y ?? -1)} h=${Math.round(pad?.height ?? 0)}`)
    check(`AP3.5 · ${name} · il est vide au départ`,
      (await page.getAttribute('[data-testid="signature"]', 'data-signed')) === 'no')
    const cx = (pad?.x ?? 0) + 40
    const cy = (pad?.y ?? 0) + (pad?.height ?? 0) / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 80, cy - 24, { steps: 8 })
    await page.mouse.move(cx + 150, cy + 20, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(120)
    check(`AP3.5 · ${name} · un trait au doigt le remplit`,
      (await page.getAttribute('[data-testid="signature"]', 'data-signed')) === 'yes')
    await page.getByTestId('signature-clear').click()
    check(`AP3.5 · ${name} · et « מחיקה » le rend vierge`,
      (await page.getAttribute('[data-testid="signature"]', 'data-signed')) === 'no')
    /* Signé puis envoyé : la signature doit PARTIR. */
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 120, cy + 10, { steps: 10 })
    await page.mouse.up()
    await page.getByTestId('next').click()
    await page.waitForSelector('[data-step="appointment"]')
    await page.getByTestId('skip').click()
    await page.getByTestId('done').waitFor()
    check(`AP3.5 · ${name} · la signature part en PNG avec la demande`,
      String(sent[0]?.payload.signature ?? '').startsWith('data:image/png;base64,'))
    await ctx.close()
  }

  // -------------------------------------------------------------------------
  section(`AP1 — ${name} : la charte d'ארצנו, en clair et en sombre`)
  // -------------------------------------------------------------------------
  {
    for (const dark of [false, true]) {
      const sent: Sent[] = []
      const { ctx, page } = await newPage(engine, sent, { dark })
      await open(page)
      await page.getByTestId('landing').waitFor()
      const seen = await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="start"]') as HTMLElement
        const cs = getComputedStyle(btn)
        return {
          bg: cs.backgroundColor,
          radius: cs.borderRadius,
          font: getComputedStyle(document.body).fontFamily,
          ground: getComputedStyle(document.body).backgroundColor,
        }
      })
      /* ⚠️ L'ORANGE DU BOUTON EST LE LEUR, ET IL NE CHANGE PAS AVEC LE THÈME.
         `#EF4F28` = leur « היו שותפים », relevé sur le site. */
      check(`AP1 · ${name} · ${dark ? 'sombre' : 'clair'} · le bouton porte l'orange d'ארצנו`,
        seen.bg === 'rgb(239, 79, 40)', seen.bg)
      check(`AP1 · ${name} · ${dark ? 'sombre' : 'clair'} · et sa forme de pilule (30 px)`,
        seen.radius.startsWith('30px'), seen.radius)
      check(`AP1 · ${name} · ${dark ? 'sombre' : 'clair'} · la page est dans le bon thème`,
        dark
          ? seen.ground === 'rgb(14, 26, 20)'
          : seen.ground === 'rgb(255, 255, 255)',
        seen.ground)
      check(`AP1 · ${name} · ${dark ? 'sombre' : 'clair'} · la police est auto-hébergée (Rubik)`,
        seen.font.startsWith('Rubik'), seen.font)
      /* Le logo de l'association, et il vient du dépôt (pas de leur serveur). */
      const logo = await page.evaluate(
        () => (document.querySelector('.az-hero-logo') as HTMLImageElement | null)?.currentSrc ?? '',
      )
      check(`AP1 · ${name} · ${dark ? 'sombre' : 'clair'} · le logo est servi par cette page`,
        logo.includes('artzenu-logo') && !logo.includes('artzenu.org.il'), logo)
      await ctx.close()
    }
  }

  await engine.close()
}

for (const s of serves) s.kill()

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
