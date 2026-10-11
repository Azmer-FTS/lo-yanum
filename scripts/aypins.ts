import type { Page } from 'playwright'

import { REMOTE, check, finish, go, open, section, serveBuild, shots } from './ayharness'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AY8 — A365 : LE CONTRASTE RÉEL DES ÉPINGLES, SUR LE RENDU.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aypins                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run aypins    # le DÉPLOYÉ
 *   DIST=<dossier> SKIP_BUILD=1 bun run aypins                      # un autre build (le rouge)
 *
 * Carte de couverture, 1 440 px, les cinq familles d'AU4 affichées, sur les
 * QUATRE fonds : vectoriel clair, vectoriel sombre, satellite clair,
 * satellite sombre. Pour chaque épingle : la couleur de la carte DERRIÈRE elle
 * (marqueurs masqués), la couleur de son BORD et de sa TÊTE (marqueurs
 * visibles), lues au pixel sur la capture. On rapporte, par famille :
 *   - bord : le meilleur des deux traits (le liseré blanc ou le fil sombre)
 *     contre le fond — ce qui DÉTACHE l'épingle (WCAG 1.4.11 : ≥ 3:1) ;
 *   - tête : la couleur de famille contre le fond — ce qui la fait RESSORTIR.
 */

const OUT = process.env.DIST ?? 'dist-ayui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5415), process.env.SKIP_BUILD !== '1'))
const SHOTS = shots('ay8')
const FAMILIES = ['farm-full', 'farm-hollow', 'institution-full', 'institution-hollow', 'lead'] as const
type Fam = (typeof FAMILIES)[number]

const VISIBLE = JSON.stringify({ radiusKm: 35, minutes: 35, unit: 'km', nightPct: 0, visible: { signed: true, pipeline: true, leads: true, engaged: true, prospect: true } })

interface Geo {
  fam: Fam
  cx: number
  cy: number
  /** rayon extérieur dessiné (px CSS) */
  rOut: number
  /** rayon de la tête colorée (px CSS) */
  rFill: number
  /** où lire le fil sombre, et le liseré clair (px CSS) */
  rDark: number
  rLight: number
  /** un carré (institution) : on lit le long de ses côtés */
  square?: boolean
}

async function geometry(page: Page): Promise<Geo[]> {
  return page.evaluate(() => {
    const out: Array<{ fam: string; cx: number; cy: number; rOut: number; rFill: number; rDark: number; rLight: number; square?: boolean }> = []
    for (const btn of document.querySelectorAll<HTMLElement>('.maplibregl-marker[data-marker-kind], .maplibregl-marker [data-marker-kind]')) {
      const el = (btn.matches('[data-marker-kind]') ? btn : btn.querySelector('[data-marker-kind]')) as HTMLElement | null
      if (!el) continue
      const kind = el.dataset.markerKind
      const svg = el.querySelector('svg[data-pin-svg]') as SVGSVGElement | null
      if (kind === 'farm' && svg) {
        const r = svg.getBoundingClientRect()
        const vb = (svg.getAttribute('viewBox') ?? '0 0 24 32').split(/\s+/).map(Number)
        const k = r.width / vb[2]
        const head = svg.querySelector('[data-pin-outline]')
        const fill = head?.getAttribute('fill') ?? ''
        const hollow = (head?.getAttribute('stroke') ?? 'none') !== 'none' && fill !== '' && !/^#?0*$/.test(fill) && head?.getAttribute('stroke') !== '#141b26'
        const ay8 = svg.getAttribute('data-pin-style') === 'ay8'
        // AY8 : tête 7,2 · liseré blanc 7,2→9,0 · fil sombre 9,0→10,0. Avant : goutte, trait 1,6 à r 9.
        out.push(ay8
          ? { fam: hollow ? 'farm-hollow' : 'farm-full', cx: r.x + (12 - vb[0]) * k, cy: r.y + (8.9 - vb[1]) * k, rOut: 10 * k, rFill: 7.2 * k, rDark: 9.5 * k, rLight: 8.1 * k }
          : { fam: hollow ? 'farm-hollow' : 'farm-full', cx: r.x + (12 - vb[0]) * k, cy: r.y + (8.9 - vb[1]) * k, rOut: 9.8 * k, rFill: 8.6 * k, rDark: 9.3 * k, rLight: 8.4 * k })
      } else if (kind === 'institution' || kind === 'lead') {
        const vis = (el.querySelector('span') ?? el) as HTMLElement
        const r = vis.getBoundingClientRect()
        const bg = getComputedStyle(vis).backgroundColor
        const border = getComputedStyle(vis).borderTopColor
        const hollow = kind === 'institution' && bg === getComputedStyle(document.body).backgroundColor
        // Le carré : bord de 2,5 px puis (AY8) un fil sombre de 1,2 px dehors, en ombre portée.
        const shadow = getComputedStyle(vis).boxShadow
        const shadowRing = /0px 0px 0px 1\.2px/.test(shadow)
        const half = r.width / 2
        if (kind === 'lead' && /0px 0px 0px 2\.6px/.test(shadow)) {
          out.push({ fam: 'lead', cx: r.x + half, cy: r.y + half, rOut: half + 2.6, rFill: half - 3, rDark: half + 2.05, rLight: half + 0.75 })
          continue
        }
        out.push({ fam: kind === 'lead' ? 'lead' : hollow ? 'institution-hollow' : 'institution-full', cx: r.x + half, cy: r.y + half, rOut: half + (shadowRing ? 1.2 : 0), rFill: half - 3, rDark: shadowRing ? half + 0.6 : half - 1.2, rLight: half - 1.2, square: kind === 'institution' })
        void border
      }
    }
    const inside = out.filter((g) => g.cx > 40 && g.cy > 40 && g.cx < window.innerWidth - 40 && g.cy < window.innerHeight - 40)
    // Une épingle recouverte par une autre ne se mesure pas (on lirait sa voisine).
    return inside.filter((g) => !inside.some((h) => h !== g && Math.hypot(h.cx - g.cx, h.cy - g.cy) < g.rOut + h.rOut + 4))
  }) as Promise<Geo[]>
}

async function measure(page: Page, geo: Geo[], pinShot: Buffer, bgShot: Buffer) {
  return page.evaluate(
    async ({ pin, bg, geo }) => {
      const load = async (b64: string) => {
        const im = new Image()
        im.src = `data:image/png;base64,${b64}`
        await im.decode()
        const c = document.createElement('canvas')
        c.width = im.width
        c.height = im.height
        const x = c.getContext('2d')!
        x.drawImage(im, 0, 0)
        return { x, w: im.width, scale: im.width / window.innerWidth }
      }
      const P = await load(pin)
      const B = await load(bg)
      const px = (img: { x: CanvasRenderingContext2D; scale: number }, cx: number, cy: number) => {
        const d = img.x.getImageData(Math.round(cx * img.scale), Math.round(cy * img.scale), 1, 1).data
        return [d[0], d[1], d[2]]
      }
      const lum = ([r, g, b]: number[]) => {
        const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const ratio = (a: number[], b: number[]) => {
        const la = lum(a)
        const lb = lum(b)
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
      }
      // ΔE (CIE76, Lab) : la différence de COULEUR perçue, teinte comprise — une épingle
      // orange sur du sable a la même luminance mais pas la même teinte.
      const lab = ([r, g, b]: number[]) => {
        const f = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        const [R, G, B] = [f(r), f(g), f(b)]
        const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
        const Y = R * 0.2126 + G * 0.7152 + B * 0.0722
        const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
        const h = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
        return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]
      }
      const dE = (a: number[], b: number[]) => {
        const [x, y] = [lab(a), lab(b)]
        return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
      }
      const avg = (cs: number[][]) => [0, 1, 2].map((i) => cs.reduce((n, c) => n + c[i], 0) / cs.length)
      return geo.map((g) => {
        // Le fond : la carte sous la tête (marqueurs masqués), sur un anneau juste dehors.
        const ring: number[][] = []
        for (let a = 0; a < 16; a++) {
          const t = (a / 16) * Math.PI * 2
          const k = g.square ? 1 / Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t))) : 1
          ring.push(px(B, g.cx + Math.cos(t) * (g.rOut + 2) * k, g.cy + Math.sin(t) * (g.rOut + 2) * k))
        }
        const back = avg(ring)
        // Le bord : à 1 px à l'intérieur du dessin (le fil sombre) et à 2,5 px (le liseré clair) — on garde le meilleur.
        const edge1: number[][] = []
        const edge2: number[][] = []
        for (let a = 0; a < 12; a++) {
          const t = (a / 12) * Math.PI * 2 + 0.2
          if (Math.sin(t) > 0.6) continue // pas la tige
          // Un carré : les angles du cercle tombent sur ses côtés (on lit à la même distance du centre).
          const k = g.square ? 1 / Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t))) : 1
          edge1.push(px(P, g.cx + Math.cos(t) * g.rDark * k, g.cy + Math.sin(t) * g.rDark * k))
          edge2.push(px(P, g.cx + Math.cos(t) * g.rLight * k, g.cy + Math.sin(t) * g.rLight * k))
        }
        // Par angle, le meilleur des deux traits ; puis la médiane des angles (l'anticrénelage
        // d'un trait d'un pixel ne doit pas décider seul).
        const perAngle = edge1.map((c, i) => Math.max(ratio(c, back), ratio(edge2[i], back))).sort((a, b) => a - b)
        const e1 = perAngle[Math.floor((perAngle.length - 1) / 2)]
        const e2 = e1
        // La tête : à mi-rayon, hors de l'icône (en haut à droite).
        const head = px(P, g.cx + g.rFill * 0.62, g.cy - g.rFill * 0.42)
        return { fam: g.fam, edge: Math.max(e1, e2), head: ratio(head, back), headDE: dE(head, back), back: back.map(Math.round), headRgb: head, e1rgb: edge1[0], e2rgb: edge2[0] }
      })
    },
    { pin: pinShot.toString('base64'), bg: bgShot.toString('base64'), geo },
  )
}

section('A365 — épingles : contraste mesuré sur les deux fonds, dans les deux thèmes')
const rows: string[] = []
for (const base of ['vector', 'satellite'] as const) {
  for (const dark of [false, true]) {
    const tag = `${base === 'vector' ? 'vectoriel' : 'satellite'} ${dark ? 'sombre' : 'clair'}`
    const o = await open(1440, { dark, init: { 'lo-yanum:map-base': base, 'lo-yanum:coverage-map': VISIBLE, 'lo-yanum:theme:coordinator': dark ? 'dark' : 'light' } })
    await go(o.page, APP, '/coordinator/coverage', 9000)
    await o.page.waitForTimeout(base === 'satellite' ? 6000 : 2000)
    // La carte doit être IMMOBILE : la géométrie relue après la capture doit être la même.
    let geo = await geometry(o.page)
    let pinShot = await o.page.screenshot()
    for (let i = 0; i < 6; i++) {
      const again = await geometry(o.page)
      const moved = again.length !== geo.length || again.some((g, k) => Math.abs(g.cx - geo[k].cx) > 0.5 || Math.abs(g.cy - geo[k].cy) > 0.5)
      if (!moved) break
      await o.page.waitForTimeout(1500)
      geo = await geometry(o.page)
      pinShot = await o.page.screenshot()
    }
    if (process.env.DEBUG) console.log(JSON.stringify(geo.slice(0, 3)))
    await o.page.screenshot({ path: `${SHOTS}/a365-${base}-${dark ? 'sombre' : 'clair'}.png` })
    await o.page.addStyleTag({ content: '.maplibregl-marker{visibility:hidden!important} .maplibregl-canvas ~ *{visibility:hidden!important}' })
    await o.page.waitForTimeout(400)
    const bgShot = await o.page.screenshot()
    const m = await measure(o.page, geo, pinShot, bgShot)
    if (process.env.DEBUG) console.log(JSON.stringify(m.slice(0, 3)))
    for (const fam of FAMILIES) {
      const of = m.filter((x) => x.fam === fam)
      if (of.length === 0) {
        rows.push(`${tag.padEnd(18)} ${fam.padEnd(19)} — aucune à l'écran`)
        continue
      }
      const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]
      const edge = med(of.map((x) => x.edge))
      const head = med(of.map((x) => x.head))
      const headDE = med(of.map((x) => x.headDE))
      rows.push(`${tag.padEnd(18)} ${fam.padEnd(19)} ${String(of.length).padStart(2)} épingle(s) isolée(s) · bord (médiane) ${edge.toFixed(2)}:1 · tête ${head.toFixed(2)}:1, ΔE ${headDE.toFixed(0)}`)
      check(`A365 ${tag} · ${fam} : le bord se détache du fond (≥ 3:1)`, edge >= 3, `${edge.toFixed(2)}:1 (${of.length})`)
      // La couleur de famille RESSORT du fond : ΔE ≥ 40 (une différence nettement visible, teinte comprise).
      check(`A365 ${tag} · ${fam} : la couleur ressort du fond (ΔE ≥ 40)`, fam.endsWith('hollow') || fam === 'lead' || headDE >= 40, `ΔE ${headDE.toFixed(0)}`)
    }
    check(`A365 ${tag} : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
}
console.log(`\n  ${rows.join('\n  ')}`)
await finish()
