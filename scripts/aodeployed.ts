import { chromium } from 'playwright'
import type { BrowserContext, Page } from 'playwright'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AO6 — LA VÉRIFICATION SUR LE DÉPLOYÉ, APRÈS LA MISE EN BASE. A250 · A251 · A252
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aodeployed                                    # l'app DÉPLOYÉE
 *   BASE_URL=http://localhost:5357 bun run aodeployed
 *
 * ★★ CE QU'ELLE AJOUTE À `aoui`. `aoui` prouve que les deux statuts se
 *    choisissent et que le rapport sort, mais sur le JEU DE DÉMONSTRATION.
 *    Celle-ci sert les VINGT-CINQ lignes d'AO1 au bundle déployé et mesure ce
 *    que le PO verra : le compte des lignes, les statuts, les surfaces, le
 *    pondéré, et les deux teintes neuves LUES DANS LE BUNDLE SERVI.
 *
 * ⚠️ ★★ ET ELLE VISE L'APP RÉELLE, PAS LE JUMEAU `/demo` — C'EST LA MOITIÉ DE
 *    LA PORTE. Le jumeau est construit SANS paire Supabase
 *    (`SUPABASE_CONFIGURED === false`, voir `src/data/config.ts`) : il tourne
 *    sur son jeu de démonstration et **ne parle jamais à `*.supabase.co`**,
 *    donc `installFakeSupabase`, qui intercepte ces requêtes, n'y sert à
 *    RIEN. Pointée sur `/demo`, cette porte mesurait les 14 fiches inventées
 *    en croyant mesurer les 25 (vu : « 25 noms manquants », et un pondéré
 *    d'objectif de 2 728 qui n'était celui d'aucune des deux bases). L'app
 *    réelle, elle, EST configurée : la session fabriquée y ouvre la porte et
 *    la base factice répond à sa place. C'est le chemin d'`aocaptures`.
 *
 * ⚠️ ET ELLE COMPTE LE PLAFOND DE LISTE. `useProgressive` n'affiche que VINGT
 *    lignes au premier rendu : une capture de la liste montre 20 fiches sur 25
 *    et « הצגת עוד 5 ». Une porte qui compterait les tuiles sans dérouler
 *    conclurait qu'il manque cinq exploitations. Le plafond est vérifié POUR
 *    lui-même, puis déroulé.
 */

const APP = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum').replace(/\/$/, '')

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

const { farms, pairing } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0])
const NAMES = farms.map((f) => f.name)
console.log(`  app réelle : ${APP}`)
console.log(`  ${ROWS.length} exploitations servies (${pairing.updates.length} mises à jour, ${pairing.creations.length} créations)`)

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
})

/** Un contexte neuf dont la base factice ne porte QUE les vingt-cinq. */
async function withThe25(dark = false): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const db = new FakeDb()
  db.seed()
  db.rows('entities').length = 0
  for (const r of ROWS) db.rows('entities').push({ ...r })
  const ctx = await browser.newContext({
    viewport: { width: 1376, height: 1032 },
    hasTouch: true,
    locale: 'he-IL',
    colorScheme: dark ? 'dark' : 'light',
  })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  await ctx.addInitScript(() => localStorage.setItem('lo-yanum:theme:coordinator', 'system'))
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, errors }
}

async function go(page: Page, hash: string, settle = 4500): Promise<void> {
  await page.goto(`${APP}/?ao6=${Date.now()}#${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

async function guard(run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    check('section interrompue', false, (e as Error).message.split('\n')[0])
  }
}

/** Le rapport de contraste WCAG entre deux couleurs rgb() lues dans la page. */
function ratio(a: [number, number, number], b: [number, number, number]): number {
  const lum = (c: [number, number, number]) => {
    const f = c.map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]
  }
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

try {
  // =========================================================================
  section('A250 — les vingt-cinq sur le déployé : le compte, les statuts, les surfaces')
  // =========================================================================
  await guard(async () => {
    const { ctx, page, errors } = await withThe25()
    await go(page, '/coordinator/farms', 6000)

    const tiles = page.locator('[data-testid="farm-tile"]')
    const first = await tiles.count()
    check('★ le plafond de liste est de VINGT au premier rendu', first === 20, `${first} tuiles`)

    const more = page.getByRole('button', { name: /הצגת עוד/ })
    const moreText = (await more.count()) > 0 ? ((await more.first().textContent()) ?? '') : ''
    check('… et il annonce les CINQ qui restent', moreText.includes('5'), moreText.trim())
    if ((await more.count()) > 0) {
      await more.first().click()
      await page.waitForTimeout(1200)
    }
    const all = await tiles.count()
    check('★ déroulée, la liste porte les VINGT-CINQ', all === 25, `${all} tuiles`)

    const shown = (await page.locator('[data-testid="farm-tile"]').allTextContents()).join(' | ')
    const missing = NAMES.filter((n) => !shown.includes(n))
    check('★ les vingt-cinq noms sont là, aucun manquant', missing.length === 0, missing.join(' , '))

    /* Les statuts : la tuile de compteur par statut porte le nombre. */
    const kpi = async (status: string) =>
      ((await page.locator(`[data-testid="kpi-${status}"]`).textContent()) ?? '').replace(/\s+/g, ' ')
    const verbal = await kpi('verbal_ok')
    const signed = await kpi('signed')
    const toContact = await kpi('to_contact')
    const away = await kpi('not_relevant_now')
    const hold = await kpi('on_hold')
    check('« הסכמה בעל פה » : 10', /\b10\b/.test(verbal), verbal)
    check('« נחתם » : 7', /\b7\b/.test(signed), signed)
    check('« ליצירת קשר » : 6', /\b6\b/.test(toContact), toContact)
    check('★ « לא רלוונטי כרגע » a sa propre tuile : 1', /\b1\b/.test(away), away)
    check('★ « בהמתנה » aussi : 1', /\b1\b/.test(hold), hold)

    /* Les surfaces : la tuile du pondéré porte le total du programme. */
    const weighted = ((await page.locator('[data-testid="kpi-weighted"]').textContent()) ?? '').replace(/\s+/g, ' ')
    check('★ le pondéré de la liste est 9 910', /9[,.  ]?910/.test(weighted), weighted)

    /* Et une fiche porte bien SA surface, pas seulement le total. */
    const lahav = farms.find((f) => f.name === 'גד״ש להב')
    const margi = farms.find((f) => f.name === 'חוות מרגי')
    await go(page, `/coordinator/farms/${margi?.id}`, 4000)
    const body = (await page.locator('body').textContent()) ?? ''
    check('★ חוות מרגי montre ses 5 000 dounams de מרעה', /5[,.  ]?000/.test(body), body.slice(0, 0))
    check('… et son statut « נחתם »', body.includes('נחתם'))

    await go(page, `/coordinator/farms/${lahav?.id}`, 4000)
    const lahavBody = (await page.locator('body').textContent()) ?? ''
    check('★ גד״ש להב porte « לא רלוונטי כרגע » sur sa fiche', lahavBody.includes('לא רלוונטי כרגע'))

    check('aucune erreur de page', errors.length === 0, errors.join(' | '))
    await ctx.close()
  })

  // =========================================================================
  section('A251 — les deux statuts SORTENT des compteurs, et le rapport le dit')
  // =========================================================================
  await guard(async () => {
    const { ctx, page, errors } = await withThe25()
    await go(page, '/coordinator', 6000)

    /* Le tableau de bord : le pondéré de l'objectif ne compte QUE les signées. */
    const target = page.locator('[data-testid="weighted-target"]')
    const dataWeighted = await target.getAttribute('data-weighted')
    check(
      '★ le pondéré de l\'OBJECTIF au tableau de bord est celui des signées (2 370)',
      dataWeighted === '2370',
      String(dataWeighted),
    )

    /* Le rapport d'activité : le pondéré du PROGRAMME, et les hors-compteurs. */
    await page.locator('[data-testid="activity-open"]').click()
    await page.waitForTimeout(1600)
    check('★ le rapport d\'activité s\'ouvre', await page.locator('[data-testid="activity-modal"]').isVisible())
    /* ⚠️ `activity-text` est un <pre>, pas un champ : `inputValue()` y jette. */
    const text = (await page.locator('[data-testid="activity-text"]').textContent()) ?? ''
    check('★ le rapport porte 9 910 dounams pondérés', /9[,.  ]?910/.test(text), (text.match(/.*משוקלל.*/) ?? [''])[0])
    check('★ il compte VINGT-TROIS entités, pas vingt-cinq', /\b23\b/.test(text), (text.match(/.*יישויות.*/) ?? [''])[0])
    check(
      '★ … et il NOMME les deux hors-compteurs avec leur raison',
      text.includes('מחוץ למניין') && text.includes('לא רלוונטי כרגע') && text.includes('בהמתנה'),
      (text.match(/.*מחוץ למניין.*/) ?? [''])[0],
    )

    /* Les deux sorties. */
    const share = page.locator('[data-testid="activity-share"]')
    check('la sortie WhatsApp est active', await share.isEnabled())
    const wait = page.waitForEvent('download', { timeout: 30_000 })
    await page.locator('[data-testid="activity-download"]').click()
    const download = await wait
    const path = await download.path()
    check('★ la sortie PDF produit un fichier', path !== null, download.suggestedFilename())
    if (path) {
      const bytes = await Bun.file(path).arrayBuffer()
      const head = new TextDecoder().decode(bytes.slice(0, 5))
      check('★ … et c\'est un vrai PDF, non vide', head === '%PDF-' && bytes.byteLength > 20_000,
        `${head} · ${bytes.byteLength} octets`)
    }

    check('aucune erreur de page', errors.length === 0, errors.join(' | '))
    await ctx.close()
  })

  // =========================================================================
  section('A252 — les deux teintes corrigées, MESURÉES dans le bundle servi')
  // =========================================================================
  for (const dark of [false, true]) {
    const mode = dark ? 'sombre' : 'clair'
    await guard(async () => {
      const { ctx, page } = await withThe25(dark)
      await go(page, '/coordinator/farms', 5000)
      const read = await page.evaluate(() => {
        const root = document.documentElement
        const probe = document.createElement('div')
        document.body.appendChild(probe)
        /* ⚠️ Les jetons sont des TRIPLETS de canaux (« 168 119 65 »), pas des
           couleurs CSS : `color: 168 119 65` est invalide et laisse la couleur
           héritée, ce qui rendait TOUS les rapports à 1,00. On enveloppe. */
        const rgb = (value: string): [number, number, number] => {
          const v = value.trim()
          const css = /^[\d.\s]+$/.test(v) ? `rgb(${v})` : v
          probe.style.color = 'rgb(0 0 0)'
          probe.style.color = css
          const m = getComputedStyle(probe).color.match(/[\d.]+/g) ?? ['0', '0', '0']
          return [Number(m[0]), Number(m[1]), Number(m[2])]
        }
        const token = (name: string) => getComputedStyle(root).getPropertyValue(name).trim()
        const mix = (fg: string, bg: string, alpha: number): [number, number, number] => {
          const a = rgb(fg)
          const b = rgb(bg)
          return [0, 1, 2].map((i) => Math.round(a[i] * alpha + b[i] * (1 - alpha))) as [number, number, number]
        }
        const out: Record<string, { raw: string; ink: [number, number, number]; tint: [number, number, number]; vivid: [number, number, number]; base: [number, number, number]; onAccent: [number, number, number] }> = {}
        for (const hue of ['farm-not-relevant-now', 'farm-on-hold']) {
          const vivid = token(`--${hue}`)
          out[hue] = {
            raw: vivid,
            ink: rgb(token(`--${hue}-ink`)),
            tint: mix(vivid, token('--surface-raised'), 0.15),
            vivid: rgb(vivid),
            base: rgb(token('--surface-base')),
            onAccent: rgb(token('--text-on-accent')),
          }
        }
        probe.remove()
        return out
      })
      for (const [hue, v] of Object.entries(read)) {
        const chip = ratio(v.ink, v.tint)
        const dot = ratio(v.vivid, v.base)
        const solid = ratio(v.onAccent, v.vivid)
        check(`${mode} · ${hue} — encre sur lavis 15 % ≥ 4,5`, chip >= 4.5, `${chip.toFixed(2)} (${v.raw})`)
        check(`${mode} · ${hue} — pastille sur le fond ≥ 3,0`, dot >= 3, dot.toFixed(2))
        check(`${mode} · ${hue} — texte sur l'aplat ≥ 4,5`, solid >= 4.5, solid.toFixed(2))
      }
      await ctx.close()
    })
  }
} finally {
  await browser.close()
}

console.log('')
console.log(`  ${passed}/${passed + failed} — ${failed === 0 ? 'vert' : `${failed} ROUGE(S)`}`)
process.exit(failed === 0 ? 0 : 1)
