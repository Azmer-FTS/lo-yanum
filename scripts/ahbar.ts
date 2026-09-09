import { chromium } from 'playwright'

/**
 * ★★ A159 — LA BARRE D'ACTIONS EST-ELLE ANCRÉE AU BAS DE LA FENÊTRE ?
 *
 *   OUT=dist-ahbefore SKIP_BUILD=1 PORT=5271 bun run scripts/ahbar.ts
 *
 * ⚠️ LA QUESTION EST POSÉE À TROIS POSITIONS DE DÉFILEMENT, ET C'EST TOUT
 *    L'INTÉRÊT. Une barre `sticky` est juste au milieu du défilement et fausse
 *    aux deux bouts : en haut d'un formulaire court elle flotte au milieu de
 *    l'écran, en bas de n'importe quel formulaire elle remonte du rembourrage
 *    que la coquille ajoute derrière elle. Une porte qui ne mesurerait qu'une
 *    position déclarerait le défaut corrigé.
 *
 * ★ ET ELLE MESURE AUSSI CE QUE LA BARRE RECOUVRE (AH2.2) : le dernier champ
 *   du formulaire doit finir AU-DESSUS d'elle quand on est allé jusqu'en bas.
 */
const OUT = process.env.OUT ?? 'dist-ahpass'
const PORT = Number(process.env.PORT ?? 5271)
const VIEWPORTS = [
  { name: 'iPhone 402', width: 402, height: 874 },
  { name: 'iPad portrait', width: 1032, height: 1376 },
  { name: 'iPad paysage', width: 1376, height: 1032 },
]
/* Les trois modes de `MapSplit`. Ils vivent dans localStorage. */
const MODES = ['split', 'hidden', 'full'] as const

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
if (process.env.SKIP_BUILD !== '1') {
  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], { env, stdout: 'ignore', stderr: 'pipe' })
  if ((await build.exited) !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error('vite build failed')
  }
}
const serve = Bun.spawn(
  ['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'],
  { env, stdout: 'ignore', stderr: 'ignore' },
)
const base = `http://localhost:${PORT}`
{
  const deadline = Date.now() + 40_000
  for (;;) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break } catch { /* pas encore */ }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

console.log('')
console.log(`  A159 — la barre d'actions, trois défilements × trois largeurs × trois modes (${OUT})`)
console.log('  ============================================================================')

const browser = await chromium.launch()
try {
  for (const v of VIEWPORTS) {
    for (const mode of MODES) {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } })
      const page = await ctx.newPage()
      await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
      /* ⚠️ LA VALEUR EST UNE CHAÎNE NUE, PAS DU JSON (`mapMode.tsx`). Écrite
         entre guillemets, elle est refusée en silence et l'écran retombe sur
         `split` — la sonde mesurait alors trois fois le même mode. */
      await page.evaluate((m) => {
        localStorage.setItem('lo-yanum:map-mode:farm-form', m)
        localStorage.removeItem('lo-yanum:layout-sync')
      }, mode)
      await page.goto(`${base}/#/coordinator/farms/new`, { waitUntil: 'load' })
      await page.waitForTimeout(2400)

      /** Quel élément défile réellement, et de combien. */
      const scroller = await page.evaluateHandle(() => {
        let best: Element = document.scrollingElement as Element
        let most = (document.scrollingElement as HTMLElement).scrollHeight - window.innerHeight
        for (const el of Array.from(document.querySelectorAll('main, main *'))) {
          const e = el as HTMLElement
          const room = e.scrollHeight - e.clientHeight
          if (room > most && e.clientHeight > 200) { most = room; best = e }
        }
        return best
      })

      const at = async (fraction: number) => {
        await scroller.evaluate((el, f) => {
          const e = el as HTMLElement
          const room = e.scrollHeight - (e === document.scrollingElement ? window.innerHeight : e.clientHeight)
          const y = Math.round(room * f)
          if (e === document.scrollingElement) window.scrollTo(0, y)
          else e.scrollTop = y
        }, fraction)
        await page.waitForTimeout(450)
        return page.evaluate(() => {
          const bar = document.querySelector('[data-testid="form-actions"]') as HTMLElement | null
          if (!bar) return null
          const r = bar.getBoundingClientRect()
          /**
           * ⚠️ `getPropertyValue('--shell-bottom')` REND LA CHAÎNE ÉCRITE,
           *    « max(var(--shell-foot), var(--safe-bottom)) », PAS DES PIXELS —
           *    une propriété personnalisée n'est pas résolue tant que rien ne
           *    l'emploie. La première version de cette sonde en tirait un
           *    `NaN` devenu 0 et accusait la barre d'être à 49 px du bas alors
           *    qu'elle était exactement au-dessus de la barre de démonstration.
           *    On la fait RÉSOUDRE par le navigateur, sur un témoin.
           */
          const probe = document.createElement('div')
          probe.style.cssText =
            'position:fixed;left:0;width:0;height:0;bottom:var(--shell-bottom);pointer-events:none'
          document.body.appendChild(probe)
          const shellBottom = window.innerHeight - probe.getBoundingClientRect().bottom
          probe.remove()
          /* Le dernier champ de saisie du formulaire : le recouvre-t-elle ? */
          const inputs = Array.from(document.querySelectorAll('.form-grid input, .form-grid textarea, .form-grid select'))
          let worst = 0
          for (const el of inputs) {
            const b = (el as HTMLElement).getBoundingClientRect()
            if (b.height === 0) continue
            const overlap = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top)
            if (overlap > worst && b.left < r.right && b.right > r.left) worst = overlap
          }
          return {
            gap: Math.round(window.innerHeight - r.bottom),
            shellBottom: Math.round(shellBottom),
            left: Math.round(r.left),
            right: Math.round(r.right),
            covered: Math.round(worst),
            visible: r.height > 0 && r.top < window.innerHeight && r.bottom > 0,
          }
        })
      }

      const tops = await at(0)
      const mid = await at(0.5)
      const end = await at(1)
      const label = `${v.name} · ${mode}`
      if (!tops || !mid || !end) {
        check(`${label} — la barre existe`, false)
        await ctx.close()
        continue
      }
      /**
       * ⚠️ EN MODE `full` LA COLONNE DU FORMULAIRE EST `display:none` (MapSplit)
       *    ET C'EST VOULU : la carte EST l'écran, on y revient par la pilule de
       *    mode. Y exiger une barre ancrée serait exiger une barre pour un
       *    formulaire qui n'est pas là. Ce qui est vérifié à la place, et qui
       *    est la vraie propriété, c'est qu'elle n'y flotte PAS.
       */
      if (mode === 'full') {
        check(
          `${label} — pas de barre flottante quand le formulaire n'est pas à l'écran`,
          !tops.visible && !mid.visible && !end.visible,
        )
        await ctx.close()
        continue
      }
      const anchored = [tops, mid, end].every(
        (m) => m.visible && Math.abs(m.gap - m.shellBottom) <= 2,
      )
      check(
        `${label} — ancrée au bas de la fenêtre aux trois défilements`,
        anchored,
        `écarts ${tops.gap}/${mid.gap}/${end.gap} px pour --shell-bottom ${tops.shellBottom}`,
      )
      check(
        `${label} — ne recouvre aucun champ en bas de course`,
        end.covered === 0,
        `${end.covered} px`,
      )
      /**
       * ★★ ET SES PROPRES BOUTONS SONT ATTEIGNABLES AU DOIGT. `bun run zones`
       *    a trouvé שמור couvert par la pilule de mode dès que la barre s'est
       *    vraiment posée au bas de la fenêtre : visible, activé, et
       *    inatteignable — cinquante-cinq tentatives de clic. Une barre ancrée
       *    qu'on ne peut pas presser est pire qu'une barre flottante.
       */
      const reachable = await page.evaluate(() => {
        const bar = document.querySelector('[data-testid="form-actions"]') as HTMLElement | null
        if (!bar) return { total: 0, hit: 0 }
        const buttons = Array.from(bar.querySelectorAll('button'))
        let hit = 0
        for (const b of buttons) {
          const r = b.getBoundingClientRect()
          const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          if (el && (el === b || b.contains(el))) hit += 1
        }
        return { total: buttons.length, hit }
      })
      check(
        `${label} — ses boutons répondent au doigt, rien ne les couvre`,
        reachable.total > 0 && reachable.hit === reachable.total,
        `${reachable.hit}/${reachable.total}`,
      )
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  serve.kill()
}
console.log('')
console.log(`  ${passed} PASS · ${failed} FAIL`)
console.log('')
if (failed > 0) process.exit(1)
