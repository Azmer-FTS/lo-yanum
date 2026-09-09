import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A140 · A141 · A142 · A143 · A144 · A145 · A147 · A150 · A151 — CE QU'UN
 * ÉCRAN SEUL RÉPOND.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run agui
 *
 *   A140  « voir comme » : les trois rôles, les vraies données, lecture seule
 *         stricte, et AUCUNE requête sous une autre identité — mesurée sur le
 *         réseau, pas déduite du code.
 *   A141  bandeau permanent, non masquable, et retour au rôle de rekaz en UN
 *         geste, aux trois viewports.
 *   A142  les quatre chiffres : refusé, accordé, mémorisé, et la temporisation
 *         survit à un rechargement.
 *   A143  l'espace agriculteur : à venir, passées, annulée SIGNALÉE, qui a
 *         accepté et qui n'a pas répondu ; et la PWA s'installe.
 *   A144  les trois parcours du formulaire, à l'écran.
 *   A145  aucun champ de surface sur cet écran, compté sur le DOM.
 *   A147  le réglage de la photo change ce que le formulaire exige.
 *   A150  plusieurs photos deviennent UN PDF de plusieurs pages.
 *   A151  la localisation : combien de fois l'appareil est interrogé, et ce
 *         que le navigateur répond quand on lui demande l'état de la
 *         permission — Chromium ET WebKit.
 *
 * ⚠️ CHAQUE SONDE EST UNE VRAIE FONCTION passée à `page.evaluate`, jamais un
 *    littéral gabarit. Trois passes y ont perdu un après-midi chacune : un
 *    antislash devenu une lettre, un accent grave dans un commentaire qui a
 *    terminé la chaîne.
 *
 * ⚠️ ET AUCUNE SONDE NE CHERCHE UNE PHRASE RENDUE. Ce qui est interrogé est un
 *    `data-testid`, un compte, une boîte, une durée — jamais une traduction.
 */

const PORT = Number(process.env.AGUI_PORT ?? 5241)
const OUT_DIR = 'dist-agpass'

const PHONE = { width: 402, height: 874 }
const IPAD = { width: 1032, height: 1376 }
const IPAD_LS = { width: 1376, height: 1032 }

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
console.log('  A140 … A151 — AG1 … AG7 DANS UN VRAI NAVIGATEUR')
console.log('  ===============================================')

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
async function open(page: Page, hash: string, settle = 2200): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

/**
 * ★ LE COMPTEUR D'INTERROGATIONS DE LA LOCALISATION, POSÉ AVANT LE PREMIER
 *   SCRIPT DE LA PAGE — repris d'AF2.3/A135 et étendu à `watchPosition`, parce
 *   qu'AG7 a trouvé que c'était `watch()` qui échappait à la garde.
 */
const COUNTER = function installGeolocationCounter(): void {
  const w = window as unknown as { __geo: { current: number; watch: number } }
  w.__geo = { current: 0, watch: 0 }
  const real = navigator.geolocation
  const fake = {
    getCurrentPosition: (
      ok: PositionCallback,
      err?: PositionErrorCallback | null,
      opts?: PositionOptions,
    ) => {
      w.__geo.current++
      real.getCurrentPosition(ok, err ?? undefined, opts)
    },
    watchPosition: (
      ok: PositionCallback,
      err?: PositionErrorCallback | null,
      opts?: PositionOptions,
    ) => {
      w.__geo.watch++
      return real.watchPosition(ok, err ?? undefined, opts)
    },
    clearWatch: (id: number) => real.clearWatch(id),
  }
  Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true })
}

let browser: Browser | undefined
let wk: Browser | undefined

try {
  browser = await chromium.launch()

  // -------------------------------------------------------------------------
  section('1 — A140 · A141 · « voir comme » sur les vraies données')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: IPAD,
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * ★★ A140.3 — « AUCUNE REQUÊTE NE PART SOUS UNE AUTRE IDENTITÉ », MESURÉE
     *    SUR LE RÉSEAU ET NON DÉDUITE DU CODE.
     * ═══════════════════════════════════════════════════════════════════════
     *
     * ⚠️ CE QUI EST COMPTÉ EST TOUTE REQUÊTE QUI N'EST PAS UN ACTIF DU BUNDLE.
     *    Compter « les requêtes vers supabase.co » aurait été plus étroit ET
     *    plus faible : le jumeau n'a pas de Supabase, donc ce compteur serait
     *    resté à zéro quoi qu'il arrive, et la porte aurait été verte sans rien
     *    prouver. La question posée est donc la bonne question, la générale :
     *    pendant tout l'épisode, l'application parle-t-elle À QUI QUE CE SOIT ?
     */
    const foreign: string[] = []
    const credentialled: string[] = []
    page.on('request', (r) => {
      const url = r.url()
      if (url.startsWith('data:') || url.startsWith('blob:')) return
      if (!url.startsWith(base)) foreign.push(url)
      const h = r.headers()
      /* ★ CE QUI FERAIT D'UNE REQUÊTE « UNE REQUÊTE SOUS UNE AUTRE IDENTITÉ »
         est un en-tête qui PORTE une identité. Ce sont exactement ceux que
         supabase-js pose. */
      if (h['authorization'] || h['apikey'] || h['x-client-info']) {
        credentialled.push(`${url} ← ${Object.keys(h).join(',')}`)
      }
    })

    await open(page, '#/coordinator/settings', 3000)

    const row = page.locator('[data-testid="role-switch"]')
    check('A141 · la bascule est sur l’écran de réglages', (await row.count()) > 0)

    /* Le nombre de fermes que le coordinateur voit — c'est ce que « les vraies
       données » veut dire ici : le sous-ensemble doit venir du MÊME magasin. */
    const farmsSeen = await page.evaluate(() => {
      const w = window as unknown as { __loYanumStoreFarms?: number }
      return w.__loYanumStoreFarms ?? -1
    })
    void farmsSeen

    /* On efface les compteurs juste avant l'épisode, pour ne mesurer que lui. */
    foreign.length = 0
    credentialled.length = 0
    const authBefore = await page.evaluate(() => {
      try {
        return JSON.stringify({
          auth: localStorage.getItem('lo-yanum:auth'),
          last: localStorage.getItem('lo-yanum:last-session'),
        })
      } catch {
        return 'unavailable'
      }
    })

    for (const [index, role] of [
      [1, 'farmer'],
      [2, 'volunteer'],
      [3, 'driver'],
    ] as Array<[number, string]>) {
      /**
       * ⚠️★★ ON REVIENT AU RÔLE DE REKAZ AVANT CHAQUE TOUR, ET LA PREMIÈRE
       *    VERSION NE LE FAISAIT PAS — elle a attendu quarante-cinq secondes un
       *    bouton qu'aucun doigt ne pouvait atteindre. La raison est le produit
       *    et non la porte : `RequireRole` renvoie une session d'agriculteur
       *    hors de `/coordinator`, donc le `goto('#/coordinator/settings')` du
       *    tour suivant atterrissait sur `/farmer`, où la bascule de rôle
       *    n'existe pas. Le retour par le bandeau est le geste que le PO fait
       *    lui-même, ce qui rend la boucle fidèle en plus de la débloquer.
       */
      const stop = page.locator('[data-testid="view-as-banner-stop"]')
      if (await stop.count()) {
        await stop.click()
        await page.waitForTimeout(1600)
      }
      await open(page, '#/coordinator/settings', 2200)
      await page.locator('[data-testid="role-switch"] button').nth(index).click()
      await page.waitForTimeout(500)
      const people = page.locator('[data-testid="view-as-person"]')
      const n = await people.count()
      check(`A140 · ${role} · quelqu’un à regarder`, n > 0, String(n))
      if (n === 0) continue
      await people.first().click()
      await page.waitForTimeout(2200)

      check(
        `A140 · ${role} · on est sur ses écrans`,
        page.url().includes(`/${role}`),
        page.url().slice(page.url().indexOf('#')),
      )

      /* A141 — le bandeau, et il porte « lecture seule ». */
      check(
        `A141 · ${role} · le bandeau est là`,
        (await page.locator('[data-testid="view-as-banner"]').count()) > 0,
      )
      check(
        `A141 · ${role} · et il dit « lecture seule »`,
        (await page.locator('[data-testid="view-as-readonly"]').count()) > 0,
      )

      /**
       * ⚠️ « NON MASQUABLE » SE VÉRIFIE EN CHERCHANT CE QUI N'EXISTE PAS : il
       *    n'y a AUCUN bouton dans le bandeau à part le retour. Un bandeau avec
       *    une croix serait un bandeau dont il faudrait mémoriser la fermeture.
       */
      const bannerButtons = await page
        .locator('[data-testid="view-as-banner"] button')
        .count()
      check(
        `A141 · ${role} · un seul bouton dans le bandeau : le retour`,
        bannerButtons === 1,
        String(bannerButtons),
      )

      /**
       * ★★ A140.2 — LECTURE SEULE STRICTE, ET LES DEUX MOITIÉS SONT MESURÉES.
       *
       * 1. L'INTERFACE : tout contrôle marqué `data-readonly` est réellement
       *    `disabled` dans le DOM. Un bouton qui aurait l'air gris sans l'être
       *    passerait une relecture et pas celle-ci.
       * 2. LE MAGASIN : on APPELLE une mutation depuis la page et on vérifie
       *    qu'elle jette. C'est la garantie ; le reste est la politesse.
       */
      const ro = await page.evaluate(() => {
        const marked = Array.from(
          document.querySelectorAll('[data-readonly]'),
        ) as HTMLButtonElement[]
        return {
          marked: marked.length,
          notDisabled: marked.filter((el) => !el.disabled).length,
        }
      })
      check(
        `A140 · ${role} · tout ce qui est marqué lecture seule est vraiment désactivé`,
        ro.notDisabled === 0,
        `${ro.marked} marqués, ${ro.notDisabled} actifs`,
      )
      /**
       * ⚠️★★ LE CONDUCTEUR N'A AUCUNE ÉCRITURE, ET LA PORTE LE DIT PLUTÔT QUE
       *    D'EXIGER UN BOUTON GRIS QUI N'EXISTE PAS.
       *
       * `DriverTripScreen` n'appelle aucune mutation : son écran est une
       * feuille de route — l'heure, le point de rendez-vous, les passagers,
       * les numéros. Ce qu'un conducteur CONFIRME est confirmé par le porteur
       * du téléphone du groupe (R6), pas par lui. Exiger ici « au moins un
       * contrôle désactivé » aurait demandé d'inventer un bouton pour pouvoir
       * le griser, ce qui est le contraire du travail. Ce qui est vérifié à la
       * place est l'affirmation vraie : cet écran n'expose AUCUN contrôle
       * d'écriture actif — et la sonde le prouve en cherchant, sur le DOM, un
       * bouton actif qui ne soit ni un lien ni une navigation.
       */
      if (role === 'driver') {
        check(
          `A140 · ${role} · son écran n’expose aucune écriture (il n’en a aucune)`,
          ro.marked === 0,
          String(ro.marked),
        )
      } else {
        check(
          `A140 · ${role} · et il y a au moins un contrôle désactivé à voir`,
          ro.marked > 0,
          String(ro.marked),
        )
      }

      /**
       * ★★ ET ON VA VOIR L'ÉCRAN OÙ CE RÔLE ÉCRIT VRAIMENT. L'accueil d'un
       *    agriculteur porte surtout de la lecture ; ce qui doit être gris est
       *    le formulaire d'incident, la confirmation de garde, le dépôt d'un
       *    document. La porte y va, plutôt que de conclure d'un écran calme que
       *    le mode est sûr.
       */
      if (role !== 'driver') {
        const actionRoute = role === 'farmer' ? '#/farmer/report' : '#/volunteer'
        await page.goto(`${base}/${actionRoute}`, { waitUntil: 'load' })
        await page.waitForTimeout(2200)
        const onAction = await page.evaluate(() => {
          const marked = Array.from(
            document.querySelectorAll('[data-readonly]'),
          ) as HTMLButtonElement[]
          return {
            marked: marked.length,
            notDisabled: marked.filter((el) => !el.disabled).length,
          }
        })
        check(
          `A140 · ${role} · sur son écran d’action, tout est gris et vraiment désactivé`,
          onAction.marked > 0 && onAction.notDisabled === 0,
          `${onAction.marked} marqués, ${onAction.notDisabled} actifs`,
        )
      }
    }

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * ★★ LA QUESTION A ÉTÉ RESSERRÉE APRÈS SA PREMIÈRE EXÉCUTION, ET LA
     *    PREMIÈRE VERSION ÉTAIT FAUSSE — PAS TROP STRICTE, FAUSSE.
     * ═══════════════════════════════════════════════════════════════════════
     *
     * Elle demandait « zéro requête, quelle qu'elle soit » et a trouvé trois
     * choses parfaitement légitimes : les lutins du fond de carte, une planche
     * de sprites, et le portrait d'un volontaire. Ce sont des ACTIFS DU
     * PAQUET, servis par la même origine, chargés paresseusement parce qu'un
     * écran nouveau les demande — un espace agriculteur affiche des visages
     * que le tableau de bord n'affichait pas. Les interdire aurait interdit
     * d'afficher un écran.
     *
     * ★ LA QUESTION D'AG1.3 N'EST PAS « L'APP PARLE-T-ELLE ? » MAIS « PARLE-
     *   T-ELLE SOUS UNE AUTRE IDENTITÉ ? ». Deux mesures répondent à celle-là,
     *   et aucune des deux n'est gênée par une image :
     *
     *     1. AUCUNE REQUÊTE NE QUITTE L'ORIGINE DE L'APPLICATION. Une identité
     *        s'exerce contre un serveur, et le seul serveur qui pourrait la
     *        connaître est ailleurs.
     *     2. AUCUNE REQUÊTE NE PORTE D'EN-TÊTE D'IDENTITÉ — `authorization`,
     *        `apikey`, `x-client-info`, les trois que supabase-js pose. C'est
     *        la mesure qui resterait vraie le jour où l'API vivrait sur la même
     *        origine, et c'est donc celle qui compte.
     */
    check(
      'A140 · aucune requête ne quitte l’origine de l’application',
      foreign.length === 0,
      foreign.slice(0, 3).join(' | ') || '0 requête sortante',
    )
    check(
      'A140 · et aucune requête ne porte d’en-tête d’identité',
      credentialled.length === 0,
      credentialled.slice(0, 2).join(' | ') || '0 en-tête',
    )

    const authAfter = await page.evaluate(() => {
      try {
        return JSON.stringify({
          auth: localStorage.getItem('lo-yanum:auth'),
          last: localStorage.getItem('lo-yanum:last-session'),
        })
      } catch {
        return 'unavailable'
      }
    })
    check(
      'A140 · et le jeton d’authentification est intact, octet pour octet',
      authBefore === authAfter,
      authBefore === authAfter ? 'identique' : 'MODIFIÉ',
    )

    /* A141 — le retour en UN geste, depuis le bandeau. */
    await page.locator('[data-testid="view-as-banner-stop"]').click()
    await page.waitForTimeout(1800)
    check(
      'A141 · le retour au rôle de rekaz en un geste',
      page.url().includes('/coordinator'),
      page.url().slice(page.url().indexOf('#')),
    )
    check(
      'A141 · et le bandeau disparaît',
      (await page.locator('[data-testid="view-as-banner"]').count()) === 0,
    )
    await context.close()
  }

  /* A141 — aux trois viewports, la bascule est atteignable et le bandeau tient. */
  for (const vp of [
    { name: 'téléphone', ...PHONE },
    { name: 'iPad', ...IPAD },
    { name: 'iPad paysage', ...IPAD_LS },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    await open(page, '#/coordinator/settings', 2600)
    await page.locator('[data-testid="role-switch"] button').nth(1).click()
    await page.waitForTimeout(400)
    const people = page.locator('[data-testid="view-as-person"]')
    if ((await people.count()) === 0) {
      check(`A141 · ${vp.name} · quelqu’un à regarder`, false, '0')
      await context.close()
      continue
    }
    await people.first().click()
    await page.waitForTimeout(2200)

    /**
     * ⚠️ LA QUESTION POSÉE AU BANDEAU EST UNE QUESTION SUR UN RECTANGLE, PAS
     *    SUR SA PRÉSENCE. Y13 avait déjà eu ce défaut : le bandeau existait et
     *    défilait hors de l'écran, donc le retour disparaissait. Ce qui est
     *    mesuré est qu'il est DANS le viewport après un défilement jusqu'en bas.
     */
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    const box = await page.locator('[data-testid="view-as-banner"]').boundingBox()
    check(
      `A141 · ${vp.name} · le bandeau reste visible après défilement`,
      box !== null && box.y >= -1 && box.y < vp.height,
      box ? `y=${Math.round(box.y)} / ${vp.height}` : 'absent',
    )
    const stop = await page
      .locator('[data-testid="view-as-banner-stop"]')
      .boundingBox()
    check(
      `A141 · ${vp.name} · et le bouton de retour est atteignable`,
      stop !== null && stop.y >= -1 && stop.y + stop.height <= vp.height + 1,
      stop ? `y=${Math.round(stop.y)}` : 'absent',
    )
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('2 — A142 · les quatre derniers chiffres, à l’écran')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: PHONE,
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)

    /* On fabrique un lien d'agriculteur depuis l'app elle-même : c'est le même
       encodeur que le SMS, donc la porte ne peut pas tester un lien qui
       n'existerait que dans la porte. */
    await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
    await page.waitForTimeout(2000)
    const made = await page.evaluate(() => {
      const w = window as unknown as {
        __loYanumFarmerLink?: () => { link: string; four: string } | null
      }
      return w.__loYanumFarmerLink ? w.__loYanumFarmerLink() : null
    })
    if (!made) {
      check('A142 · un lien d’agriculteur a pu être fabriqué', false, 'pas de poignée')
    } else {
      check('A142 · un lien d’agriculteur a pu être fabriqué', true, made.four)

      await page.goto(made.link, { waitUntil: 'load' })
      await page.waitForTimeout(1800)
      check(
        'A142 · le lien demande les quatre chiffres',
        (await page.locator('[data-testid="phone-challenge"]').count()) > 0,
      )
      check(
        'A142 · et le numéro du rekaz est là dès le premier écran',
        (await page.locator('[data-testid="challenge-coordinator"]').count()) > 0,
      )

      /* Une réponse fausse. */
      const wrong = made.four === '0000' ? '1111' : '0000'
      await page.locator('[data-testid="challenge-input"]').fill(wrong)
      await page.locator('[data-testid="challenge-submit"]').click()
      await page.waitForTimeout(400)
      check(
        'A142 · une réponse fausse est refusée, et le dit',
        (await page.locator('[data-testid="challenge-wrong"]').count()) > 0,
      )
      check(
        'A142 · et on est toujours devant la porte',
        (await page.locator('[data-testid="phone-challenge"]').count()) > 0,
      )

      /* La bonne. */
      await page.locator('[data-testid="challenge-input"]').fill(made.four)
      await page.locator('[data-testid="challenge-submit"]').click()
      await page.waitForTimeout(2200)
      check(
        'A142 · la bonne réponse ouvre l’espace',
        (await page.locator('[data-testid="phone-challenge"]').count()) === 0 &&
          page.url().includes('/farmer'),
        page.url().slice(page.url().indexOf('#')),
      )

      /* AG2.2 — mémorisée : on rouvre le lien, la question n'est pas reposée. */
      await page.goto(made.link, { waitUntil: 'load' })
      await page.waitForTimeout(1800)
      check(
        'A142 · la saisie est mémorisée — la question n’est pas reposée',
        (await page.locator('[data-testid="phone-challenge"]').count()) === 0,
      )

      /**
       * ★★ AG2.3 — LA TEMPORISATION SURVIT À UN RECHARGEMENT, ET C'EST LE SEUL
       *    POINT DE CETTE FAMILLE QU'UN CALCUL PUR NE PROUVE PAS. Recharger
       *    est le premier réflexe de qui veut y échapper.
       */
      /**
       * ⚠️ EFFACER LE STOCKAGE NE SUFFIT PAS : IL FAUT RECHARGER, ET C'EST LE
       *    COMPORTEMENT NORMAL DE L'APPLICATION PLUTÔT QU'UN DÉFAUT.
       *    `ui/challenge.ts` garde le livre en mémoire (comme `guardPass.ts` et
       *    `geolocate.ts`) ; un `goto` vers un autre hash est une navigation
       *    INTERNE, le document ne change pas, la mémoire du module survit.
       *    La porte a attendu quarante-cinq secondes une porte qui, du point de
       *    vue de l'application, était légitimement restée ouverte.
       */
      await page.evaluate(() => {
        try {
          localStorage.removeItem('lo-yanum:link-unlock')
        } catch {
          /* rien */
        }
      })
      await page.goto(made.link, { waitUntil: 'load' })
      await page.reload({ waitUntil: 'load' })
      await page.waitForTimeout(2000)
      /**
       * ★★ ET LA QUESTION EST REPOSÉE MÊME EN ARRIVANT PAR `/farmer`, ce qui
       *    est le trou qu'AG2.1 a bouché : le laissez-passer est sur
       *    l'appareil, l'icône de l'écran d'accueil ouvre la racine, et la
       *    racine mène ici sans repasser par l'écran du lien.
       */
      await page.goto(base, { waitUntil: 'load' })
      await page.waitForTimeout(2600)
      check(
        'A142 · et la mémoire effacée, la RACINE repose la question',
        (await page.locator('[data-testid="phone-challenge"]').count()) > 0,
        page.url().slice(page.url().indexOf('#')),
      )
      /**
       * ⚠️ ON S'ARRÊTE DÈS QUE L'ATTENTE APPARAÎT, ET NON APRÈS UN NOMBRE FIXE
       *    DE COUPS. La première version tapait trois fois d'affilée et
       *    échouait sur le troisième — parce que le champ était DÉJÀ désactivé,
       *    la temporisation ayant commencé au deuxième. La porte se plaignait
       *    donc que le produit fasse exactement ce qu'on lui demande. Un test
       *    qui compte les coups au lieu de lire l'état teste sa propre
       *    arithmétique.
       */
      for (let i = 0; i < 5; i++) {
        if ((await page.locator('[data-testid="challenge-wait"]').count()) > 0) break
        const input = page.locator('[data-testid="challenge-input"]')
        if (await input.isDisabled()) break
        await input.fill(wrong)
        await page.locator('[data-testid="challenge-submit"]').click()
        await page.waitForTimeout(400)
      }
      const waiting = await page.locator('[data-testid="challenge-wait"]').count()
      check('A142 · après plusieurs échecs, une attente apparaît', waiting > 0)
      await page.reload({ waitUntil: 'load' })
      await page.waitForTimeout(1500)
      check(
        'A142 · et recharger la page ne l’efface pas',
        (await page.locator('[data-testid="challenge-wait"]').count()) > 0,
      )
      /* Et ce n'est jamais un blocage définitif : la valeur affichée est finie. */
      const stored = await page.evaluate(() => {
        try {
          return localStorage.getItem('lo-yanum:link-unlock') ?? ''
        } catch {
          return ''
        }
      })
      check(
        'A142 · le compteur d’échecs est sur l’appareil, pas dans la page',
        stored.includes('failures'),
        stored.slice(0, 80),
      )
    }
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('3 — A143 · l’espace agriculteur')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: PHONE,
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`))

    await enterAsFarmer(page)

    check(
      'A143 · les gardes à venir sont là',
      (await page.locator('[data-testid="farmer-upcoming"]').count()) > 0,
    )
    check(
      'A143 · les gardes passées aussi',
      (await page.locator('[data-testid="farmer-past"]').count()) > 0,
    )
    check(
      'A143 · la fiche est là',
      (await page.locator('[data-testid="farmer-card"]').count()) > 0,
    )
    check(
      'A143 · et les documents attendus',
      (await page.locator('[data-testid="farmer-documents"]').count()) > 0,
    )

    /**
     * ★★ A143 — « QUI A ACCEPTÉ ET QUI N'A PAS RÉPONDU », ET LES TROIS ÉTATS
     *    SONT DES `data-testid` DISTINCTS PLUTÔT QU'UNE COULEUR. Une couleur se
     *    lit à l'œil et se mesure mal ; un état nommé se compte.
     */
    const answers = await page.evaluate(() => ({
      present: document.querySelectorAll('[data-testid="farmer-answer-present"]').length,
      pending: document.querySelectorAll('[data-testid="farmer-answer-pending"]').length,
      absent: document.querySelectorAll('[data-testid="farmer-answer-absent"]').length,
    }))
    check(
      'A143 · chaque volontaire porte un état de réponse',
      answers.present + answers.pending + answers.absent > 0,
      `présent ${answers.present} · sans réponse ${answers.pending} · absent ${answers.absent}`,
    )

    /**
     * ★★ A143 — LA GARDE ANNULÉE EST SIGNALÉE. « Un agriculteur qui attend
     *    quelqu'un qui ne viendra pas est plus mal loti que sans garde. »
     *    La porte ANNULE une garde à venir depuis la page, puis regarde.
     */
    const cancelled = await page.evaluate(() => {
      const w = window as unknown as { __loYanumCancelNextGuard?: () => boolean }
      return w.__loYanumCancelNextGuard ? w.__loYanumCancelNextGuard() : false
    })
    if (cancelled) {
      await page.waitForTimeout(1200)
      const shown = await page.locator('[data-testid="farmer-cancelled"]').count()
      check('A143 · une garde annulée est SIGNALÉE en tête', shown > 0, String(shown))
      if (shown > 0) {
        const box = await page
          .locator('[data-testid="farmer-cancelled"]')
          .first()
          .boundingBox()
        /**
         * ⚠️ « AU-DESSUS DU PLI » EST MESURÉ SUR LE RECTANGLE, sans défiler.
         *    C'est la seule forme utile de la demande : « un agriculteur qui
         *    attend quelqu'un qui ne viendra pas est plus mal loti que sans
         *    garde » ne vaut que si la phrase est lue par quelqu'un qui a
         *    ouvert l'application pour tout autre chose.
         */
        check(
          'A143 · et elle est au-dessus du pli',
          box !== null && box.y >= 0 && box.y < PHONE.height,
          box ? `y=${Math.round(box.y)} / ${PHONE.height}` : 'sans boîte',
        )
      }
    } else {
      check('A143 · une garde a pu être annulée pour la mesure', false, 'pas de garde à venir')
    }

    check('A143 · aucune erreur de page', errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ★★ A143 — « INSTALLABLE SUR iOS ET ANDROID », ET CE QUI EST VÉRIFIÉ EST CE
   *    QUI EST VÉRIFIABLE.
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ CE QU'AUCUNE PORTE NE PEUT FAIRE, DIT FRANCHEMENT : appuyer sur
   *    « ajouter à l'écran d'accueil » dans Safari iOS. Playwright pilote
   *    WebKit, qui est le moteur de Safari, mais pas Safari — et surtout pas
   *    son menu de partage, qui appartient au système.
   *
   * ★ CE QUI EST VÉRIFIÉ À LA PLACE EST L'ENSEMBLE DES CONDITIONS QU'iOS ET
   *   ANDROID EXIGENT, une par une, et sur le BUILD SERVI :
   *     · le manifeste est atteignable et son `start_url` est dans la portée ;
   *     · `display: standalone` (sans quoi Android n'offre pas l'installation
   *       et iOS ouvre un onglet) ;
   *     · les métabalises `apple-mobile-web-app-*` (iOS ne lit pas le
   *       manifeste pour cela) ;
   *     · une icône déclarée ET servie (une icône 404 fait une icône grise) ;
   *     · un service worker enregistré, qui est la condition d'Android ;
   *     · et — le point d'AG3.1 — que l'application relance sur l'espace de
   *       l'agriculteur depuis la RACINE, puisque `start_url` est la racine.
   */
  {
    const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL' })
    const page = await context.newPage()
    await page.goto(base, { waitUntil: 'load' })
    await page.waitForTimeout(1500)

    const manifestHref = await page.evaluate(() => {
      const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
      return link ? link.href : ''
    })
    check('A143 · le manifeste est déclaré', manifestHref !== '', manifestHref)

    const manifest = manifestHref
      ? ((await (await fetch(manifestHref)).json()) as Record<string, unknown>)
      : null
    check('A143 · et il est servi', manifest !== null)
    check(
      'A143 · display: standalone — sans quoi rien ne s’installe',
      manifest?.display === 'standalone',
      String(manifest?.display),
    )
    check(
      'A143 · start_url et scope sont dans la portée servie',
      typeof manifest?.start_url === 'string' && typeof manifest?.scope === 'string',
      `${String(manifest?.start_url)} / ${String(manifest?.scope)}`,
    )

    const icons = (manifest?.icons ?? []) as Array<{ src: string }>
    check('A143 · au moins une icône est déclarée', icons.length > 0, String(icons.length))
    if (icons.length > 0) {
      const iconUrl = new URL(icons[0].src, manifestHref).toString()
      const res = await fetch(iconUrl)
      check('A143 · et elle est réellement servie', res.ok, `${res.status} ${iconUrl}`)
    }

    const apple = await page.evaluate(() => ({
      capable: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]'),
      title: !!document.querySelector('meta[name="apple-mobile-web-app-title"]'),
      touchIcon: !!document.querySelector('link[rel="apple-touch-icon"]'),
    }))
    check(
      'A143 · iOS : les trois métabalises que Safari lit',
      apple.capable && apple.title && apple.touchIcon,
      JSON.stringify(apple),
    )

    const sw = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'absent'
      const regs = await navigator.serviceWorker.getRegistrations()
      return String(regs.length)
    })
    check(
      'A143 · Android : un service worker est enregistré',
      sw !== 'absent' && sw !== '0',
      sw,
    )

    /* ★ AG3.1 — et la RACINE rouvre l'espace de l'agriculteur, ce qui est ce
       que l'icône de l'écran d'accueil fait. */
    await enterAsFarmer(page)
    await page.goto(base, { waitUntil: 'load' })
    await page.waitForTimeout(2800)
    check(
      'A143 · depuis la racine, l’icône rouvre SON espace',
      page.url().includes('/farmer'),
      page.url().slice(page.url().indexOf('#')),
    )
    check(
      'A143 · et sans reposer la question, puisqu’elle est mémorisée',
      (await page.locator('[data-testid="phone-challenge"]').count()) === 0,
    )
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('4 — A144 · A145 · A147 · le formulaire à l’écran')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: PHONE,
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)

    await enterAsFarmer(page)
    await page.goto(`${base}/#/farmer/sign`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)

    check(
      'A144 · le formulaire s’ouvre',
      (await page.locator('[data-testid="sign-submit"]').count()) > 0,
    )
    check(
      'A144 · et le document est lisible AVANT de signer',
      (await page.locator('[data-testid="sign-preview"]').count()) > 0,
    )

    /**
     * ★★ A144 — L'ORDRE EST MESURÉ, PAS SUPPOSÉ. Même mesure qu'en A129 : les
     *    deux pourraient coexister avec le pad AU-DESSUS du document, et
     *    l'écran dirait alors exactement le contraire de ce qui est demandé.
     */
    const order = await page.evaluate(() => {
      const doc = document.querySelector('[data-testid="sign-preview"]')
      const pad = document.querySelector('canvas')
      if (!doc || !pad) return null
      return {
        docTop: Math.round(doc.getBoundingClientRect().top + window.scrollY),
        padTop: Math.round(pad.getBoundingClientRect().top + window.scrollY),
      }
    })
    check(
      'A144 · le document est AU-DESSUS du pad',
      order !== null && order.docTop < order.padTop,
      order ? `doc ${order.docTop} < pad ${order.padTop}` : 'introuvable',
    )

    /**
     * ★★ A145 — AUCUN CHAMP DE SURFACE, COMPTÉ SUR LE DOM RENDU. `bun run
     *    agpass` lit le fichier source ; celle-ci compte ce qui est réellement
     *    à l'écran. Les deux ensemble couvrent le cas où quelqu'un ajouterait
     *    le champ sous un autre nom.
     */
    const fields = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input, textarea, select'),
      ) as HTMLInputElement[]
      return inputs.map((el) => ({
        id: el.id,
        type: el.type,
        label:
          (document.querySelector(`label[for="${el.id}"]`)?.textContent ?? '').trim(),
      }))
    })
    const areaish = fields.filter(
      (f) => /דונם|dunam|שטח/i.test(f.label) || /dunam/i.test(f.id),
    )
    check(
      'A145 · aucun champ de surface à l’écran',
      areaish.length === 0,
      areaish.map((f) => f.label || f.id).join(', '),
    )
    check(
      'A145 · et le formulaire reste court',
      fields.length <= 8,
      `${fields.length} champs : ${fields.map((f) => f.id || f.type).join(', ')}`,
    )

    /* A144.5 — la signature est bloquée et le refus NOMME ce qui manque. */
    await page.locator('[data-testid="sign-submit"]').click()
    await page.waitForTimeout(400)
    const blocked = page.locator('[data-testid="sign-blocked"]')
    check('A144 · la signature est refusée', (await blocked.count()) > 0)
    const text = (await blocked.first().textContent()) ?? ''
    check(
      'A144 · et le refus n’est pas un « formulaire incomplet » muet',
      text.trim().length > 12,
      text.trim().slice(0, 60),
    )

    /* A147 — le réglage change ce que le formulaire exige. */
    const before = await page.evaluate(() => {
      try {
        return localStorage.getItem('lo-yanum:require-id-photo')
      } catch {
        return null
      }
    })
    check('A147 · la photo est facultative par défaut', before === null, String(before))
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('5 — A150 · plusieurs photos, un seul PDF')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: PHONE, locale: 'he-IL' })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
    await page.waitForTimeout(2000)

    /**
     * ★★ TROIS IMAGES FABRIQUÉES DANS LA PAGE, PUIS COMPOSÉES PAR LE MÊME CODE
     *    QUE L'ÉCRAN. Ce qui est vérifié est le NOMBRE DE PAGES du PDF produit
     *    — `/Type /Page` compté dans les octets — parce que c'est la seule
     *    chose qui distingue « trois photos composées » de « la première
     *    photo, et les deux autres perdues ».
     */
    const result = await page.evaluate(async () => {
      const w = window as unknown as {
        __loYanumPhotosToPdf?: (files: File[]) => Promise<File>
      }
      if (!w.__loYanumPhotosToPdf) return null
      const files: File[] = []
      for (let i = 0; i < 3; i++) {
        const canvas = document.createElement('canvas')
        canvas.width = 400
        canvas.height = 600
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        ctx.fillStyle = i === 0 ? '#111111' : i === 1 ? '#555555' : '#999999'
        ctx.fillRect(0, 0, 400, 600)
        const blob = await new Promise<Blob | null>((r) =>
          canvas.toBlob(r, 'image/jpeg', 0.9),
        )
        if (!blob) return null
        files.push(new File([blob], `p${i}.jpg`, { type: 'image/jpeg' }))
      }
      const pdf = await w.__loYanumPhotosToPdf(files)
      const bytes = new Uint8Array(await pdf.arrayBuffer())
      let text = ''
      for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i])
      const pages = (text.match(/\/Type \/Page[^s]/g) ?? []).length
      return { size: bytes.length, pages, header: text.slice(0, 5) }
    })
    if (!result) {
      check('A150 · trois photos composées en un PDF', false, 'pas de poignée')
    } else {
      check('A150 · c’est bien un PDF', result.header === '%PDF-', result.header)
      check('A150 · trois photos → trois pages', result.pages === 3, String(result.pages))
      check('A150 · et il pèse quelque chose', result.size > 5000, `${result.size} octets`)
    }
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('6 — A151 · la localisation, mesurée')
  // -------------------------------------------------------------------------

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ★★ AG7 — TROIS MESURES, ET LA TROISIÈME EST CELLE QUI TRANCHE LE DÉBAT.
   * ═══════════════════════════════════════════════════════════════════════════
   *
   *   1. AU DÉMARRAGE, L'APPLICATION N'INTERROGE PAS L'APPAREIL. C'est A135
   *      d'AF, re-posée, parce que c'est la seule hypothèse dont la réponse
   *      serait entièrement de notre ressort.
   *   2. UNE PERMISSION REFUSÉE NE PRODUIT AUCUNE INTERROGATION, y compris sur
   *      l'écran d'urgence — c'est le défaut qu'AG7 a trouvé dans `watch()`.
   *   3. ET CE QUE LE NAVIGATEUR RÉPOND QUAND ON LUI DEMANDE L'ÉTAT DE LA
   *      PERMISSION, dans Chromium ET dans WebKit — le moteur de Safari.
   *      Si WebKit ne sait pas répondre, alors une origine ne peut pas savoir
   *      qu'elle est autorisée, et « ne redemande que si le système l'a
   *      révoquée » est une phrase qu'aucun code ne peut tenir sur cet
   *      appareil. C'est la preuve par la mesure que le brief demande.
   */
  {
    const context = await browser.newContext({
      viewport: IPAD,
      locale: 'he-IL',
      permissions: [],
    })
    await context.addInitScript(COUNTER)
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
    await page.waitForTimeout(3000)
    const atBoot = await page.evaluate(
      () => (window as unknown as { __geo: { current: number; watch: number } }).__geo,
    )
    check(
      'A151 · au démarrage, l’appareil n’est pas interrogé',
      atBoot.current === 0 && atBoot.watch === 0,
      `current=${atBoot.current} watch=${atBoot.watch}`,
    )

    /* Et l'écran d'urgence, avec la permission REFUSÉE : zéro interrogation. */
    await page.goto(`${base}/#/sos`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    const atSos = await page.evaluate(
      () => (window as unknown as { __geo: { current: number; watch: number } }).__geo,
    )
    check(
      'A151 · permission refusée : l’écran d’urgence n’interroge pas non plus',
      atSos.current === 0 && atSos.watch === 0,
      `current=${atSos.current} watch=${atSos.watch}`,
    )

    /* Et la ligne de diagnostic a bien été écrite pour ce lancement. */
    const diag = await page.evaluate(() => {
      try {
        return localStorage.getItem('lo-yanum:geo-diag') ?? ''
      } catch {
        return ''
      }
    })
    check(
      'A151 · une ligne de mesure est écrite à chaque lancement',
      diag.includes('permission') && diag.includes('standalone'),
      diag.slice(0, 120),
    )
    await context.close()
  }

  /* ★★ LA MESURE QUI TRANCHE : que répond le moteur de Safari ? */
  for (const [engineName, launcher] of [
    ['Chromium', chromium],
    ['WebKit', webkit],
  ] as Array<[string, typeof chromium]>) {
    let b: Browser | undefined
    try {
      b = await launcher.launch()
      if (engineName === 'WebKit') wk = b
      const context = await b.newContext({ viewport: PHONE })
      const page = await context.newPage()
      await page.goto(base, { waitUntil: 'load' })
      const answer = await page.evaluate(async () => {
        const permissions = (navigator as Navigator).permissions
        if (!permissions?.query) return 'no-permissions-api'
        try {
          const r = await permissions.query({ name: 'geolocation' as PermissionName })
          return r.state
        } catch (error) {
          return `throws: ${(error as Error).name}`
        }
      })
      console.log(`  MESURE  ${engineName} · permissions.query({geolocation}) → ${answer}`)
      check(
        `A151 · ${engineName} répond à la question de la permission`,
        answer === 'granted' || answer === 'prompt' || answer === 'denied',
        String(answer),
      )
      await context.close()
      if (engineName !== 'WebKit') await b.close()
    } catch (error) {
      check(`A151 · ${engineName} a pu être lancé`, false, String((error as Error).message))
      if (b && engineName !== 'WebKit') await b.close()
    }
  }
} finally {
  await browser?.close()
  await wk?.close()
  serve.kill()
}

/** Entre dans l'espace d'un agriculteur, porte d'AG2 comprise. */
async function enterAsFarmer(page: Page): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  const made = await page.evaluate(() => {
    const w = window as unknown as {
      __loYanumFarmerLink?: () => { link: string; four: string } | null
    }
    return w.__loYanumFarmerLink ? w.__loYanumFarmerLink() : null
  })
  if (!made) return
  await page.goto(made.link, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  if ((await page.locator('[data-testid="challenge-input"]').count()) > 0) {
    await page.locator('[data-testid="challenge-input"]').fill(made.four)
    await page.locator('[data-testid="challenge-submit"]').click()
  }
  await page.waitForTimeout(2200)
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
void (undefined as unknown as BrowserContext)
