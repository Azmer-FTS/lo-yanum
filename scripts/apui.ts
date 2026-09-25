import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page, Route } from 'playwright'

import {
  APPOINTMENT_HORIZON_DAYS,
  jerusalemInstant,
} from '../src/core/availability'
import { MAX_DOCUMENT_BYTES } from '../src/core/request'

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

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? ''
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
console.log(`  page : ${BASE}`)

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

async function newPage(browser: Browser, sent: Sent[], opts: { dark?: boolean } = {}) {
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

for (const browserType of [chromium, webkit]) {
  const name = browserType.name()
  const browser = await browserType.launch()

  // -------------------------------------------------------------------------
  section(`A249 · A257 — ${name} : l'accueil s'ouvre sans compte, sur un téléphone`)
  // -------------------------------------------------------------------------
  {
    const sent: Sent[] = []
    const { ctx, page, errors } = await newPage(browser, sent)
    /**
     * ⚠️ SESSION VIERGE ET NON « DÉCONNECTÉE ». Un contexte neuf de Playwright
     *    n'a ni cookie, ni `localStorage`, ni service worker — c'est
     *    exactement l'état d'un agriculteur qui touche un lien reçu par
     *    WhatsApp, et rien d'autre ne prouve A257.
     */
    const res = await page.goto(BASE, { waitUntil: 'networkidle' })
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
    const { ctx, page, errors } = await newPage(browser, sent)
    await page.goto(BASE, { waitUntil: 'networkidle' })

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
      const { ctx, page } = await newPage(browser, sent)
      await page.goto(BASE, { waitUntil: 'networkidle' })
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
    const { ctx, page } = await newPage(browser, sent)
    await page.goto(BASE, { waitUntil: 'networkidle' })
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
    const { ctx, page } = await newPage(browser, sent)
    await page.goto(BASE, { waitUntil: 'networkidle' })
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
    const { ctx, page, errors } = await newPage(browser, sent)
    await page.goto(BASE, { waitUntil: 'networkidle' })
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

    /* Un fichier trop gros. */
    await page.setInputFiles('[data-testid="doc-crops-pdf"]', {
      name: 'enorme.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(MAX_DOCUMENT_BYTES + 5_000_000, 0x20),
    })
    await page.waitForTimeout(500)
    check(`A256 · ${name} · un fichier trop gros est refusé, et la page le DIT`,
      (await page.locator('[data-testid="doc-crops"] .az-error').count()) === 1)

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
    const { ctx, page } = await newPage(browser, sent)
    await page.goto(BASE, { waitUntil: 'networkidle' })
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
    const { ctx, page } = await newPage(browser, sent)
    await page.goto(BASE, { waitUntil: 'networkidle' })
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
    const { ctx, page } = await newPage(browser, sent)
    await page.goto(BASE, { waitUntil: 'networkidle' })
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
      const { ctx, page } = await newPage(browser, sent, { dark })
      await page.goto(BASE, { waitUntil: 'networkidle' })
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

  await browser.close()
}

for (const s of serves) s.kill()

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
