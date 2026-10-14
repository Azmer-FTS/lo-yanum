import { hasDate } from '@core/index'
import type { DocFarmRow } from '@core/index'

import { PAGE, canvasesToPdfFile, newPageCanvas } from '../report/pdf'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BG (2026-10-14) — LE DOCUMENT D'UNE INSTITUTION, DESSINÉ SELON LA CHARTE
 *    DES DOCUMENTS DU PO.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LA CHARTE, NON NÉGOCIABLE, ET OÙ ELLE EST TENUE ICI :
 *   · page 1 : un grand bandeau photo pleine largeur JUSQU'AU BORD SUPÉRIEUR
 *     (`BAND_H`, posé en y = 0), le logo BLANC dedans, plus grand que celui de
 *     l'en-tête (`BAND_LOGO_H` > `HEAD_LOGO_H`), et PAS d'en-tête répétée ;
 *   · en-tête et pied de page sur CHAQUE page à partir de la page 2 ;
 *   · numérotation « page / total » sur TOUTES les pages (la page 1 n'a que
 *     elle, en bas) ;
 *   · marges garanties : rien n'est posé au-dessus de `TOP_2` ni sous
 *     `BOTTOM` — un bloc qui ne tient pas ouvre une page, un tableau répète
 *     son en-tête ;
 *   · AUCUNE date, nulle part : ni dans le texte (chaque chaîne dessinée passe
 *     par `hasDate`, et le document REFUSE de se faire s'il en trouve une), ni
 *     dans le fichier (le PDF n'a pas de `CreationDate`, `report/pdf.ts`) ;
 *   · le pied : le site, le mail et le téléphone.
 *
 * ★ LE VOILE VERT EST APLATI DANS LA PHOTO (`public/doc/institution-band.jpg`,
 *   composé par `scripts/bgband.py`, JPEG sans alpha) : les lecteurs PDF de
 *   WhatsApp ne rendent pas les dégradés transparents. Et chaque page entière
 *   part en JPEG (`canvasesToPdfFile`) : le fichier produit n'a AUCUNE zone
 *   transparente — ni masque, ni groupe de transparence, ni opacité.
 *
 * ★ LA PAGE EST BLANCHE MÊME QUAND L'APP EST NOIRE : des littéraux, pas des
 *   jetons (même raison que le contrat, `agreement/artzenu.ts`).
 */

const S = PAGE.scale
const PW = PAGE.width / S
const PH = PAGE.height / S
/** Marge latérale. */
const M = 42
const W = PW - 2 * M
/** Le bandeau de la page 1, depuis le BORD SUPÉRIEUR (y = 0). */
const BAND_H = 230
/** Le contenu de la page 1 commence sous le bandeau. */
const TOP_1 = BAND_H + 30
/** Le contenu des pages suivantes commence sous l'en-tête. */
const TOP_2 = 88
/** Le contenu s'arrête ici : le pied et sa marge sont en dessous. */
const BOTTOM = PH - 72
/** Le logo du bandeau (blanc) est PLUS GRAND que celui de l'en-tête. */
export const BAND_LOGO_H = 62
export const HEAD_LOGO_H = 24

const INK = '#1F2A24'
const MUTED = '#5F6B64'
const FOREST = '#0B3D2C'
const PALE = '#E9F2EA'
const ZEBRA = '#F6FAF6'
const RULE = '#C7D2CB'
const WHITE = '#FFFFFF'
const HEBREW = /[\u0590-\u05FF]/

const BODY = (size: number, weight = 400): string => `${weight} ${size * S}px Rubik, "Frank Ruhl Libre", system-ui, sans-serif`
const DISPLAY = (size: number, weight = 700): string => `${weight} ${size * S}px "Frank Ruhl Libre", Rubik, serif`

export interface InstitutionDocInput {
  /** Le nom de l'institution : titre du bandeau, et de l'en-tête des pages suivantes. */
  name: string
  /** « מכינה · שדרות » — sous le titre. */
  subtitle: string
  /** Une ligne au-dessus du titre, dans le bandeau. */
  kicker: string
  facts: { title: string; rows: Array<[string, string]> }
  contacts: { title: string; empty: string; rows: Array<{ role: string; name: string; phones: string; email: string }> }
  fill: { title: string; intro: string; fields: string[] }
  farms: {
    columns: { name: string; locality: string; km: string; min: string }
    linkedTitle: string
    linkedEmpty: string
    linked: DocFarmRow[]
    proposedTitle: string
    proposedEmpty: string
    proposed: DocFarmRow[]
    /** « הזמנים כוללים … » : la marge et la nuit, dites une fois. */
    note: string
  }
  /** Les deux encadrés de fin. */
  boxes: [{ title: string; lines: string[] }, { title: string; lines: string[] }]
  footer: { site: string; email: string; phone: string }
  /** Le titre porté par le fichier (métadonnée), sans date. */
  title: string
  author: string
}

/** Ce que les portes relisent : la forme de chaque page, et tout le texte posé. */
export interface DocLayout {
  pages: number
  /** Le bandeau de la page 1 : son haut (0 = le bord) et sa hauteur, en points. */
  band: { top: number; height: number; logoHeight: number }
  headerLogoHeight: number
  /** Les pages (1-based) qui portent l'en-tête, le pied complet, la pagination. */
  headerPages: number[]
  footerPages: number[]
  pageLabels: string[]
  /** Le plus haut et le plus bas qu'un contenu ait touché, page par page. */
  contentTop: number[]
  contentBottom: number[]
  /** Chaque chaîne dessinée, dans l'ordre. */
  drawn: string[]
}

export class DocHasDateError extends Error {}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}
const asset = (path: string): string => new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).toString()

interface Sheet {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

export async function drawInstitutionDoc(input: InstitutionDocInput): Promise<{ canvases: HTMLCanvasElement[]; layout: DocLayout }> {
  await document.fonts.ready.catch(() => undefined)
  const [band, mark] = await Promise.all([loadImage(asset('doc/institution-band.jpg')), loadImage(asset('artzenu-mark.png'))])

  const drawn: string[] = []
  const sheets: Sheet[] = []
  const contentTop: number[] = []
  const contentBottom: number[] = []
  let y = 0

  const text = (ctx: CanvasRenderingContext2D, s: string, x: number, yy: number): void => {
    if (s === '') return
    drawn.push(s)
    ctx.fillText(s, x * S, yy * S)
  }
  const touch = (top: number, bottom: number): void => {
    const i = sheets.length - 1
    contentTop[i] = Math.min(contentTop[i] ?? Infinity, top)
    contentBottom[i] = Math.max(contentBottom[i] ?? 0, bottom)
  }
  /** Le logo d'ארצנו (blanc sur transparent) : blanc tel quel, ou teint en vert. */
  const logo = (ctx: CanvasRenderingContext2D, height: number, right: number, top: number, tint: string | null): number => {
    if (!mark || mark.width === 0) return 0
    const w = (mark.width / mark.height) * height
    if (tint === null) ctx.drawImage(mark, (right - w) * S, top * S, w * S, height * S)
    else {
      const stencil = document.createElement('canvas')
      stencil.width = Math.max(1, Math.round(w * S))
      stencil.height = Math.max(1, Math.round(height * S))
      const sctx = stencil.getContext('2d')
      if (sctx) {
        sctx.drawImage(mark, 0, 0, stencil.width, stencil.height)
        sctx.globalCompositeOperation = 'source-in'
        sctx.fillStyle = tint
        sctx.fillRect(0, 0, stencil.width, stencil.height)
        ctx.drawImage(stencil, (right - w) * S, top * S, w * S, height * S)
      }
    }
    return w
  }

  const newSheet = (): Sheet => {
    const canvas = newPageCanvas()
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('institution doc: no 2d context')
    ctx.fillStyle = WHITE
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.textBaseline = 'alphabetic'
    ctx.direction = 'rtl'
    const sheet = { canvas, ctx }
    sheets.push(sheet)
    if (sheets.length === 1) {
      // --- Page 1 : le bandeau, du bord supérieur, et rien d'autre en tête ---
      if (band) ctx.drawImage(band, 0, 0, PW * S, BAND_H * S)
      else {
        ctx.fillStyle = FOREST
        ctx.fillRect(0, 0, PW * S, BAND_H * S)
      }
      logo(ctx, BAND_LOGO_H, PW - M, 30, null)
      ctx.textAlign = 'right'
      ctx.fillStyle = WHITE
      ctx.font = BODY(11, 500)
      text(ctx, input.kicker, PW - M, 140)
      ctx.font = DISPLAY(input.name.length > 34 ? 21 : 26)
      text(ctx, fit(ctx, input.name, W), PW - M, 174)
      ctx.font = BODY(12, 400)
      text(ctx, input.subtitle, PW - M, 200)
      y = TOP_1
    } else {
      // --- Pages suivantes : l'en-tête ---
      logo(ctx, HEAD_LOGO_H, PW - M, 26, FOREST)
      ctx.textAlign = 'left'
      ctx.direction = 'rtl'
      ctx.fillStyle = MUTED
      ctx.font = BODY(9.5, 500)
      text(ctx, fit(ctx, input.name, W * 0.6), M, 44)
      rule(ctx, M, PW - M, 62)
      y = TOP_2
    }
    return sheet
  }
  const sheet = (): Sheet => sheets[sheets.length - 1]
  /** Il faut `h` points : sinon, une page neuve. Rend vrai si une page a été ouverte. */
  const room = (h: number): boolean => {
    if (y + h <= BOTTOM) return false
    newSheet()
    return true
  }

  newSheet()

  // --- 1. Les données de l'institution -------------------------------------------
  heading(input.facts.title)
  {
    const colW = (W - 24) / 2
    const rows = input.facts.rows.filter(([, v]) => v.trim() !== '')
    for (let i = 0; i < rows.length; i += 2) {
      room(30)
      const ctx = sheet().ctx
      for (let k = 0; k < 2 && i + k < rows.length; k++) {
        const [label, value] = rows[i + k]
        const right = PW - M - k * (colW + 24)
        ctx.textAlign = 'right'
        ctx.fillStyle = MUTED
        ctx.font = BODY(8.5, 600)
        text(ctx, label, right, y)
        ctx.fillStyle = INK
        ctx.font = BODY(11, 500)
        text(ctx, fit(ctx, value, colW), right, y + 15)
      }
      touch(y - 10, y + 18)
      y += 32
    }
  }
  y += 14

  // --- 2. Les contacts ----------------------------------------------------------
  heading(input.contacts.title)
  if (input.contacts.rows.length === 0) line(input.contacts.empty, MUTED)
  for (const c of input.contacts.rows) {
    room(22)
    const ctx = sheet().ctx
    ctx.textAlign = 'right'
    ctx.fillStyle = MUTED
    ctx.font = BODY(9, 600)
    text(ctx, fit(ctx, c.role, 96), PW - M, y)
    ctx.fillStyle = INK
    ctx.font = BODY(10.5, 600)
    text(ctx, fit(ctx, c.name, 150), PW - M - 104, y)
    ctx.font = BODY(10, 400)
    ctx.textAlign = 'left'
    ctx.direction = 'ltr'
    const tail = [c.phones, c.email].filter(Boolean).join('   ')
    text(ctx, fit(ctx, tail, W - 270), M, y)
    ctx.direction = 'rtl'
    touch(y - 10, y + 4)
    y += 20
  }
  y += 10

  // --- 3. La case à remplir ------------------------------------------------------
  {
    const lineH = 30
    const h = 40 + 16 + input.fill.fields.length * lineH + 8
    room(h)
    const ctx = sheet().ctx
    const top = y - 14
    box(ctx, M, top, W, h, PALE, FOREST)
    ctx.textAlign = 'right'
    ctx.fillStyle = FOREST
    ctx.font = DISPLAY(14)
    text(ctx, input.fill.title, PW - M - 14, top + 26)
    ctx.fillStyle = MUTED
    ctx.font = BODY(9.5, 400)
    text(ctx, fit(ctx, input.fill.intro, W - 28), PW - M - 14, top + 44)
    let fy = top + 44 + 26
    for (const f of input.fill.fields) {
      ctx.fillStyle = INK
      ctx.font = BODY(10, 600)
      ctx.textAlign = 'right'
      text(ctx, f, PW - M - 14, fy)
      const labelW = ctx.measureText(f).width / S
      rule(ctx, M + 14, PW - M - 14 - labelW - 10, fy + 3, '#9FB3A6')
      fy += lineH
    }
    touch(top, top + h)
    y = top + h + 28
  }

  // --- 4. Les fermes liées, puis les fermes proposées ---------------------------
  table(input.farms.linkedTitle, input.farms.linked, input.farms.linkedEmpty)
  table(input.farms.proposedTitle, input.farms.proposed, input.farms.proposedEmpty)
  if (input.farms.note) {
    room(18)
    const ctx = sheet().ctx
    ctx.textAlign = 'right'
    ctx.fillStyle = MUTED
    ctx.font = BODY(8.5, 400)
    text(ctx, fit(ctx, input.farms.note, W), PW - M, y)
    touch(y - 9, y + 3)
    y += 22
  }

  // --- 5. Les deux encadrés de fin, côte à côte, jamais coupés ----------------
  {
    const gap = 16
    const colW = (W - gap) / 2
    const ctx0 = sheet().ctx
    const wrapped = input.boxes.map((b) => {
      ctx0.font = BODY(10, 400)
      return b.lines.flatMap((l) => wrap(ctx0, l, (colW - 28) * S))
    })
    const h = 46 + Math.max(...wrapped.map((w) => w.length)) * 16 + 12
    y += 6
    room(h + 4)
    const ctx = sheet().ctx
    const top = y - 10
    input.boxes.forEach((b, k) => {
      const right = PW - M - k * (colW + gap)
      box(ctx, right - colW, top, colW, h, k === 0 ? PALE : WHITE, FOREST)
      ctx.textAlign = 'right'
      ctx.direction = 'rtl'
      ctx.fillStyle = FOREST
      ctx.font = DISPLAY(13.5)
      text(ctx, b.title, right - 14, top + 26)
      ctx.fillStyle = INK
      ctx.font = BODY(10, 400)
      let ly = top + 48
      for (const l of wrapped[k]) {
        /* Une ligne sans hébreu (le site, le mail, le téléphone) se pose de
           gauche à droite : sinon le bidi d'une ligne RTL la mélange. */
        ctx.direction = HEBREW.test(l) ? 'rtl' : 'ltr'
        text(ctx, l, right - 14, ly)
        ly += 16
      }
      ctx.direction = 'rtl'
    })
    touch(top, top + h)
    y = top + h + 10
  }

  // --- Le pied et la pagination, maintenant que le total est connu -------------
  const total = sheets.length
  const pageLabels: string[] = []
  const footerPages: number[] = []
  const headerPages: number[] = []
  const contact = [input.footer.site, input.footer.email, input.footer.phone].filter((s) => s.trim() !== '').join('   ·   ')
  sheets.forEach((s, i) => {
    const ctx = s.ctx
    const label = `${i + 1} / ${total}`
    pageLabels.push(label)
    ctx.direction = 'ltr'
    ctx.fillStyle = MUTED
    if (i === 0) {
      ctx.textAlign = 'center'
      ctx.font = BODY(8.5, 500)
      text(ctx, label, PW / 2, PH - 30)
      return
    }
    headerPages.push(i + 1)
    footerPages.push(i + 1)
    rule(ctx, M, PW - M, PH - 50)
    ctx.textAlign = 'center'
    ctx.font = BODY(8.5, 400)
    text(ctx, contact, PW / 2, PH - 30)
    ctx.textAlign = 'left'
    ctx.font = BODY(8.5, 600)
    text(ctx, label, M, PH - 30)
  })

  /* ⛔ AUCUNE DATE : un document qui en porte une n'est pas produit. */
  const dated = drawn.filter(hasDate)
  if (dated.length > 0) throw new DocHasDateError(`date dans le document : ${dated[0]}`)

  return {
    canvases: sheets.map((s) => s.canvas),
    layout: {
      pages: total,
      band: { top: 0, height: BAND_H, logoHeight: BAND_LOGO_H },
      headerLogoHeight: HEAD_LOGO_H,
      headerPages,
      footerPages,
      pageLabels,
      contentTop: contentTop.map((v) => (Number.isFinite(v) ? v : 0)),
      contentBottom,
      drawn,
    },
  }

  // --- Les briques ------------------------------------------------------------------

  function heading(title: string): void {
    room(46)
    const ctx = sheet().ctx
    ctx.textAlign = 'right'
    ctx.direction = 'rtl'
    ctx.fillStyle = FOREST
    ctx.font = DISPLAY(15)
    text(ctx, title, PW - M, y)
    rule(ctx, M, PW - M, y + 7)
    touch(y - 14, y + 8)
    y += 28
  }

  function line(s: string, color: string): void {
    room(20)
    const ctx = sheet().ctx
    ctx.textAlign = 'right'
    ctx.fillStyle = color
    ctx.font = BODY(10, 400)
    text(ctx, fit(ctx, s, W), PW - M, y)
    touch(y - 10, y + 4)
    y += 20
  }

  function table(title: string, rows: DocFarmRow[], empty: string): void {
    heading(title)
    if (rows.length === 0) {
      line(empty, MUTED)
      y += 10
      return
    }
    const cols = input.farms.columns
    // De droite à gauche : nom, localité, km, minutes.
    const widths = [W * 0.42, W * 0.3, W * 0.14, W * 0.14]
    const rowH = 20
    const header = (): void => {
      const ctx = sheet().ctx
      ctx.fillStyle = PALE
      ctx.fillRect(M * S, (y - 14) * S, W * S, rowH * S)
      ctx.fillStyle = FOREST
      ctx.font = BODY(9, 700)
      ctx.textAlign = 'right'
      ctx.direction = 'rtl'
      let right = PW - M - 8
      ;[cols.name, cols.locality, cols.km, cols.min].forEach((c, k) => {
        text(ctx, c, right, y)
        right -= widths[k]
      })
      touch(y - 14, y + 6)
      y += rowH
    }
    room(rowH * 2)
    header()
    rows.forEach((r, n) => {
      if (room(rowH)) header()
      const ctx = sheet().ctx
      if (n % 2 === 1) {
        ctx.fillStyle = ZEBRA
        ctx.fillRect(M * S, (y - 14) * S, W * S, rowH * S)
      }
      ctx.fillStyle = INK
      ctx.textAlign = 'right'
      ctx.direction = 'rtl'
      let right = PW - M - 8
      const cells = [r.name, r.locality, r.km === null ? '—' : r.km.toFixed(r.km < 10 ? 1 : 0), r.minutes === null ? '—' : String(r.minutes)]
      cells.forEach((c, k) => {
        ctx.font = BODY(10, k === 0 ? 600 : 400)
        text(ctx, fit(ctx, c, widths[k] - 12), right, y)
        right -= widths[k]
      })
      touch(y - 14, y + 6)
      y += rowH
    })
    y += 18
  }
}

function rule(ctx: CanvasRenderingContext2D, x0: number, x1: number, yy: number, color = RULE): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1 * S
  ctx.beginPath()
  ctx.moveTo(x0 * S, yy * S)
  ctx.lineTo(x1 * S, yy * S)
  ctx.stroke()
  ctx.restore()
}

/** Un encadré : fond OPAQUE, filet vert, coins arrondis. */
function box(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, h: number, fill: string, stroke: string): void {
  ctx.save()
  const r = 10 * S
  ctx.beginPath()
  ctx.roundRect(x * S, top * S, w * S, h * S, r)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.2 * S
  ctx.stroke()
  ctx.restore()
}

/** Une chaîne qui tient dans `maxW` points, sinon raccourcie d'un « … ». */
function fit(ctx: CanvasRenderingContext2D, s: string, maxW: number): string {
  if (ctx.measureText(s).width <= maxW * S) return s
  let out = s
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW * S) out = out.slice(0, -1)
  return `${out.trimEnd()}…`
}

function wrap(ctx: CanvasRenderingContext2D, s: string, maxWidth: number): string[] {
  const words = s.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let cur = words[0]
  for (let i = 1; i < words.length; i++) {
    const next = `${cur} ${words[i]}`
    if (ctx.measureText(next).width <= maxWidth) cur = next
    else {
      lines.push(cur)
      cur = words[i]
    }
  }
  lines.push(cur)
  return lines
}

/** Le document, en PDF : chaque page en JPEG opaque, aucune date dans le fichier. */
export async function institutionDocPdf(input: InstitutionDocInput, fileName: string): Promise<{ file: File; layout: DocLayout; canvases: HTMLCanvasElement[] }> {
  const { canvases, layout } = await drawInstitutionDoc(input)
  const file = await canvasesToPdfFile(canvases, fileName, { title: input.title, author: input.author })
  return { file, layout, canvases }
}
