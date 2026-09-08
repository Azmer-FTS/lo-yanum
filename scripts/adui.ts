import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A111 · A112 · A114 · A115 — LES QUESTIONS QUI NE SE POSENT QU'À UN ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run adui
 *
 *   A111  la note d'écart est RENDUE sur le détail d'une fiche, avec les deux
 *         valeurs, l'écart en dounams et en pourcentage.
 *   A112  les deux boutons font ce qu'ils disent, dans un vrai navigateur.
 *   A114  le seuil changé dans הגדרות change immédiatement ce que חוות compte.
 *   A115  la file « לתיחום » : compte juste, filtre juste, et le geste ouvre
 *         la carte de la ferme DÉJÀ armée en mode tracé.
 *
 * ⚠️ CHAQUE SONDE EST UNE VRAIE FONCTION passée à `page.evaluate`, jamais un
 *    littéral gabarit. Trois passes y ont perdu un après-midi chacune : un
 *    antislash devenu une lettre, un accent grave dans un commentaire qui a
 *    terminé la chaîne.
 *
 * ⚠️ ET AUCUNE SONDE NE CHERCHE UNE PHRASE RENDUE. Les libellés sont dans
 *    `he.json` et une porte qui les recopie casse à la première reformulation ;
 *    ce qui est interrogé est un `data-testid`, un compte et une boîte.
 */

const PORT = Number(process.env.ADUI_PORT ?? 5219)
const OUT_DIR = 'dist-adpass'
const DESKTOP = { width: 1376, height: 1032 }

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
console.log('  A111 · A112 · A114 · A115 — AD2 · AD3 IN A REAL BROWSER')
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
async function open(page: Page, hash: string): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
}

let browser: Browser | undefined

try {
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'he-IL' })
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)

  // -------------------------------------------------------------------------
  section('A115 — la file « לתיחום » : compte, filtre, geste')
  // -------------------------------------------------------------------------

  await open(page, '#/coordinator/farms')

  const queue = await page.evaluate(() => {
    const chip = document.querySelector('[data-testid="farms-no-outline"]') as HTMLElement | null
    return {
      present: chip !== null,
      count: Number((chip?.querySelector('.numeric')?.textContent ?? '0').replace(/\D/g, '')),
      tiles: document.querySelectorAll('[data-testid="farm-tile"]').length,
    }
  })
  check(
    'A115 · the queue chip is drawn, and it carries a count',
    queue.present && queue.count > 0,
    `${queue.count} to outline of ${queue.tiles} rows`,
  )

  /**
   * ★★ ET LA VIGNETTE EST ENTIÈRE À L'ÉCRAN, AU REPOS. La bande DÉFILE : AC a
   *    payé cette leçon une fois avec « נשכחו », posée neuvième et coupée en
   *    deux à 1376 px alors que le DOM la trouvait parfaitement. La question
   *    honnête est une question sur deux RECTANGLES — celui de la vignette
   *    contre celui de son propre défileur. A116 la repose sur le DÉPLOYÉ et
   *    sur une capture, ce qui est la seule preuve que le PO accepte.
   */
  const box = await page.evaluate(() => {
    const chip = document.querySelector('[data-testid="farms-no-outline"]') as HTMLElement | null
    if (!chip) return null
    let scroller: HTMLElement | null = chip.parentElement
    while (scroller) {
      const s = getComputedStyle(scroller)
      if (s.overflowX === 'auto' || s.overflowX === 'scroll') break
      scroller = scroller.parentElement
    }
    const b = chip.getBoundingClientRect()
    const frame = (scroller ?? document.documentElement).getBoundingClientRect()
    return {
      left: Math.round(b.left - frame.left),
      right: Math.round(frame.right - b.right),
      width: Math.round(b.width),
      frameWidth: Math.round(frame.width),
    }
  })
  check(
    'A115 · and it is WHOLLY on screen at rest at 1376 px — the band scrolls',
    box !== null && box.left >= -1 && box.right >= -1 && box.width > 40,
    box
      ? `${box.width}px chip, ${box.left}px from the start, ${box.right}px from the end of a ${box.frameWidth}px band`
      : 'chip not found',
  )

  /**
   * ⚠️ ET RIEN NE SE POSE DESSUS. C'est l'autre accident d'AC — le « + »
   *    flottant s'est posé sur une pastille mise dans la barre de filtres, et
   *    un contrôle que le bouton couvre est un contrôle inatteignable pour
   *    toujours. La question se pose au point : qui répond à un clic au centre
   *    de la vignette.
   */
  const onTop = await page.evaluate(() => {
    const chip = document.querySelector('[data-testid="farms-no-outline"]') as HTMLElement | null
    if (!chip) return 'no chip'
    const b = chip.getBoundingClientRect()
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return hit === null ? 'nothing' : chip.contains(hit) ? 'the chip itself' : 'SOMETHING ELSE'
  })
  check(
    'A115 · nothing is laid on top of it — the A86 defect, re-asked',
    onTop === 'the chip itself',
    onTop,
  )

  await page.locator('[data-testid="farms-no-outline"]').click()
  await page.waitForTimeout(1200)
  const filtered = await page.evaluate(() => ({
    tiles: document.querySelectorAll('[data-testid="farm-tile"]').length,
    gestures: document.querySelectorAll('[data-testid="farm-draw-outline"]').length,
  }))
  check(
    'A115 · switching it on narrows the roster to exactly its count',
    filtered.tiles === queue.count && filtered.tiles > 0,
    `${filtered.tiles} rows for a count of ${queue.count}`,
  )
  check(
    'A115 · and every row it leaves offers the gesture, one each',
    filtered.gestures === filtered.tiles,
    `${filtered.gestures} gestures on ${filtered.tiles} rows`,
  )

  /* ★ LE GESTE : la carte de CETTE ferme, déjà armée en mode tracé. */
  await page.locator('[data-testid="farm-draw-outline"]').first().click()
  await page.waitForTimeout(2500)
  const landed = await page.evaluate(() => ({
    hash: location.hash,
    /* La barre de contexte de dessin n'existe QUE tant qu'un mode est armé —
       « Nothing armed → no bar at all » (AnchorMap). Sa présence est donc la
       question exacte : la carte est-elle déjà en train d'attendre un tracé. */
    armed: document.querySelector('[data-testid="draw-context-bar"]') !== null,
  }))
  check(
    'A115 · the gesture lands on that farm’s own file, asking for an outline',
    /#\/coordinator\/farms\/[^?]+\?draw=farm_boundary/.test(landed.hash),
    landed.hash,
  )
  check(
    'A115 · and the map is ALREADY in drawing mode — no tool to go and find',
    landed.armed,
    landed.armed ? 'armed' : 'the map came up idle',
  )

  // -------------------------------------------------------------------------
  section('A111 · A112 — la note d’écart et ses deux gestes')
  // -------------------------------------------------------------------------

  /**
   * ★ LA FICHE EST CHOISIE PAR LA MARQUE, PAS PAR SON NOM. Le jeu de
   *   démonstration peut changer ; « la première fiche que la liste signale »
   *   est une description qui survit à ses fixtures.
   */
  await open(page, '#/coordinator/farms')
  const marked = await page.evaluate(() => {
    const mark = document.querySelector('[data-testid="farm-area-gap-mark"]')
    const tile = mark?.closest('[data-testid="farm-tile"]') as HTMLElement | null
    const open = tile?.querySelector('[data-testid="farm-tile-open"]') as HTMLElement | null
    if (open) open.click()
    return {
      marks: document.querySelectorAll('[data-testid="farm-area-gap-mark"]').length,
      opened: open !== null,
    }
  })
  check(
    'A111 · the roster carries the discreet mark on the records that diverge',
    marked.marks > 0,
    `${marked.marks} marked row(s)`,
  )
  await page.waitForTimeout(2500)

  const note = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="farm-area-gap"]') as HTMLElement | null
    if (!el) return null
    /* Les nombres de la note, dans l'ordre où ils sont écrits. */
    const numbers = (el.innerText.match(/\d[\d.,  ]*/g) ?? []).map((raw) =>
      Number(raw.replace(/[^\d]/g, '')),
    )
    return {
      direction: el.dataset.direction ?? '',
      numbers,
      align: el.querySelector('[data-testid="farm-area-gap-align"]') !== null,
      keep: el.querySelector('[data-testid="farm-area-gap-keep"]') !== null,
    }
  })
  check('A111 · and opening it shows the note', note !== null)
  check(
    'A111 · the note states FOUR figures: declared, measured, the gap, the percentage',
    note !== null && note.numbers.length >= 4,
    note ? note.numbers.join(' · ') : '—',
  )
  check(
    'A111 · the two figures are the two surfaces, and the third is their difference',
    note !== null &&
      Math.abs(note.numbers[0] - note.numbers[1]) === note.numbers[2],
    note ? `|${note.numbers[0]} − ${note.numbers[1]}| = ${note.numbers[2]}` : '—',
  )
  check(
    'A112 · and it offers both gestures, not one',
    note !== null && note.align && note.keep,
  )

  /* « garder le chiffre déclaré » — la note se tait, les deux surfaces restent. */
  /* `data-figure` est le chiffre de la carte, à l'exclusion de son libellé et
     de sa ligne de note — laquelle porte désormais l'AUTRE surface, donc lire
     `innerText` reviendrait à comparer les deux à la fois. */
  const bandFigures = () =>
    page.evaluate(() => {
      const of = (id: string) => {
        const card = document.querySelector(`[data-testid="${id}"]`)
        const fig = card?.querySelector('[data-figure]') as HTMLElement | null
        return Number((fig?.innerText ?? '').replace(/[^\d]/g, ''))
      }
      return { cultivated: of('band-farm-dunams'), grazing: of('band-grazing-dunams') }
    })
  const before = await bandFigures()
  await page.locator('[data-testid="farm-area-gap-keep"]').click()
  await page.waitForTimeout(1200)
  const keptState = await page.evaluate(() => ({
    note: document.querySelector('[data-testid="farm-area-gap"]') !== null,
    said: document.querySelector('[data-testid="farm-area-gap-done"]') !== null,
  }))
  const keptFigures = await bandFigures()
  const kept = { ...keptState, ...keptFigures }
  check('A112 · « garder le chiffre » silences the note', !kept.note)
  check(
    'A112 · and says so — a button that removes its own block must leave a word',
    kept.said,
  )
  check(
    'A112 · while both surfaces stay exactly where they were',
    kept.cultivated === before.cultivated && kept.grazing === before.grazing,
    `${before.cultivated}+${before.grazing} → ${kept.cultivated}+${kept.grazing}`,
  )

  /* « aligner sur le tracé » — sur une AUTRE fiche, encore signalée. */
  await open(page, '#/coordinator/farms')
  await page.evaluate(() => {
    const mark = document.querySelector('[data-testid="farm-area-gap-mark"]')
    const tile = mark?.closest('[data-testid="farm-tile"]') as HTMLElement | null
    const btn = tile?.querySelector('[data-testid="farm-tile-open"]') as HTMLElement | null
    btn?.click()
  })
  await page.waitForTimeout(2500)
  const measuredLine = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="farm-area-gap"]') as HTMLElement | null
    const numbers = (el?.innerText.match(/\d[\d.,  ]*/g) ?? []).map((raw) =>
      Number(raw.replace(/[^\d]/g, '')),
    )
    return numbers[1] ?? -1
  })
  await page.locator('[data-testid="farm-area-gap-align"]').click()
  await page.waitForTimeout(1200)
  const alignedNote = await page.evaluate(
    () => document.querySelector('[data-testid="farm-area-gap"]') !== null,
  )
  const alignedFigures = await bandFigures()
  const aligned = {
    note: alignedNote,
    total: alignedFigures.cultivated + alignedFigures.grazing,
  }
  check('A112 · « aligner sur le tracé » silences the note too', !aligned.note)
  check(
    'A112 · and the declared surface is now the measured one, to the dunam',
    aligned.total === measuredLine,
    `${aligned.total} vs ${measuredLine}`,
  )

  // -------------------------------------------------------------------------
  section('A114 — le seuil des réglages, et les notes qui le suivent')
  // -------------------------------------------------------------------------

  /**
   * ★ MESURÉ SUR LE COMPTE DE LA VIGNETTE, qui est la seule lecture du seuil
   *   qu'on puisse observer sans lire un état interne : à 1 % il compte plus de
   *   fiches qu'à 90 %, et à 90 % il n'en compte plus aucune.
   */
  const gapCount = async (): Promise<number> => {
    await open(page, '#/coordinator/farms')
    return page.evaluate(() => {
      const chip = document.querySelector('[data-testid="farms-area-gap"]') as HTMLElement | null
      if (!chip) return 0
      return Number((chip.querySelector('.numeric')?.textContent ?? '0').replace(/\D/g, ''))
    })
  }
  const setThreshold = async (percent: string) => {
    await open(page, '#/coordinator/settings')
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="area-gap-percent"]')
      el?.scrollIntoView({ block: 'center' })
    })
    await page.locator('[data-testid="area-gap-percent"]').fill(percent)
    await page.locator('[data-testid="area-gap-save"]').click()
    await page.waitForTimeout(600)
  }

  const atTen = await gapCount()
  await setThreshold('1')
  const atOne = await gapCount()
  await setThreshold('90')
  const atNinety = await gapCount()
  check(
    'A114 · lowering the threshold makes MORE records speak',
    atOne >= atTen && atOne > 0,
    `${atTen} at 10 % → ${atOne} at 1 %`,
  )
  check(
    'A114 · and raising it past every divergence silences all of them',
    atNinety === 0,
    `${atNinety} at 90 %`,
  )
  await setThreshold('10')
  const back = await gapCount()
  check(
    'A114 · coming back to 10 % restores exactly what it said before',
    back === atTen,
    `${back} vs ${atTen}`,
  )

  await context.close()
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
