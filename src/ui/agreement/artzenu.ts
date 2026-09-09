import type { AgreementBlock } from '@core/index'

import { PAGE, canvasesToPdfFile, newPageCanvas } from '../report/pdf'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF1 (2026-09-09) — LE DOCUMENT DE SIGNATURE, DESSINÉ.
 * ★★ AH5 (2026-09-09) — ET SON TEXTE VIENT DÉSORMAIS DU GABARIT, PAS D'ICI.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce fichier ne connaît plus une seule phrase du contrat. Il reçoit des BLOCS
 * — titre, intertitre, paragraphe, ligne vide — déjà rendus par
 * `core/agreementTemplate.ts`, et il les pose sur du papier. C'est la
 * séparation habituelle du dépôt (le domaine décide du contenu, le rendu
 * décide de la place), et ici elle paie une troisième fois : le PO peut
 * ajouter une clause sans que ce fichier change d'une ligne.
 *
 * ★★ MÊME TECHNIQUE QUE `report/pdf.ts`, ET POUR LA MÊME RAISON. Aucune
 *    bibliothèque PDF ne compose l'hébreu de cette application sans une chaîne
 *    de polices et une passe bidi : les quatorze polices de base n'ont pas une
 *    lettre d'hébreu. Le NAVIGATEUR, lui, sait déjà façonner, ordonner et
 *    rendre l'hébreu dans les fontes de l'app. La page est donc DESSINÉE sur
 *    un canevas A4 et le PDF la porte comme une image par page.
 *
 *    ⚠️ LE COÛT, DIT : le texte n'est pas sélectionnable et le fichier pèse
 *      ~200 à 400 ko par page. Pour un formulaire qu'un agriculteur signe et
 *      qu'un coordinateur transmet, c'est le bon échange.
 *
 * ★★ ET IL Y A PLUSIEURS PAGES DEPUIS AH5, PARCE QU'UN GABARIT MODIFIABLE PEUT
 *    DÉBORDER. « L'association ajoutera une clause qu'elle jugera
 *    essentielle » : une page unique aurait coupé cette clause au ras du
 *    papier, en silence, sur le document qui fait foi. Le texte qui ne tient
 *    plus ouvre une page ; le bloc de signature suit le texte et n'est jamais
 *    coupé.
 *
 * ★★ LA PAGE EST BLANCHE MÊME QUAND L'APP EST NOIRE, ET C'EST DÉLIBÉRÉ. Les
 *    couleurs ci-dessous sont des LITTÉRAUX et non des jetons : un contrat qui
 *    sortirait en blanc sur noir parce que le coordinateur a le thème sombre
 *    est un contrat qu'on ne peut pas imprimer.
 */

const S = PAGE.scale
/** Marge de page, en points PDF. La même que le rapport. */
const M = 46
/** Largeur utile. */
const W = PAGE.width / S - 2 * M
/** Le pied de page occupe les 44 derniers points ; le texte s'arrête avant. */
const BOTTOM = PAGE.height / S - 58

const INK = '#111827'
const MUTED = '#6B7280'
const BRAND = '#0B3D2C'
const RULE = '#C7D2CB'

const BODY = (size: number, weight = 400): string =>
  `${weight} ${size * S}px Rubik, "Frank Ruhl Libre", system-ui, sans-serif`
const DISPLAY = (size: number, weight = 700): string =>
  `${weight} ${size * S}px "Frank Ruhl Libre", Rubik, serif`

export type LogoAlign = 'start' | 'center' | 'end'

export interface AgreementLogoInput {
  /**
   * `null` = le logo de l'association (la valeur INITIALE, AH5.5) ;
   * `''`   = aucun logo, choisi exprès ;
   * sinon  = l'image du PO, en URL de données.
   */
  src: string | null
  align: LogoAlign
  /** Largeur sur la page, en points PDF. */
  width: number
}

export interface AgreementPageInput {
  /** Le document, déjà rendu et découpé (core/agreementTemplate.ts). */
  blocks: AgreementBlock[]
  logo: AgreementLogoInput
  /** « חתימה », et les deux libellés sous le trait. */
  signatureHeading: string
  signerLabel: string
  dateLabel: string
  /** L'encre, en data URI. `null` = le document AVANT la signature (AF1.2). */
  signature: string | null
  /** Le nom porté sous le trait, et la date déjà formatée. */
  signedBy: string
  signedAtText: string
  /** Le pied de page — d'où vient ce document. */
  footer: string
  /** Le titre porté par le PDF lui-même (métadonnée), pas dessiné. */
  title: string
}

/** Le logo de l'association, chargé une fois par session et gardé. */
let markPromise: Promise<HTMLImageElement | null> | null = null

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function loadMark(): Promise<HTMLImageElement | null> {
  markPromise ??= loadImage(
    /* Résolu contre la base de l'app : la PWA installée n'a pas la même base
       que l'onglet. */
    new URL(`${import.meta.env.BASE_URL}artzenu-mark.png`, window.location.href).toString(),
  )
  return markPromise
}

/**
 * Le retour à la ligne, à la main, parce que le canevas n'en a pas.
 *
 * ⚠️ ON COUPE SUR LES ESPACES ET ON MESURE LA LIGNE ENTIÈRE, jamais la somme
 *    des mots : en hébreu la mise en forme bidi d'une ligne n'est pas la
 *    concaténation des mesures de ses morceaux dès qu'un chiffre ou une
 *    parenthèse s'y trouve — et ces paragraphes en contiennent.
 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((w) => w !== '')
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = words[0]
  for (let i = 1; i < words.length; i++) {
    const candidate = `${line} ${words[i]}`
    if (ctx.measureText(candidate).width <= maxWidth) line = candidate
    else {
      lines.push(line)
      line = words[i]
    }
  }
  lines.push(line)
  return lines
}

function rule(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number): void {
  ctx.save()
  ctx.strokeStyle = RULE
  ctx.lineWidth = 1 * S
  ctx.beginPath()
  ctx.moveTo(x0 * S, y * S)
  ctx.lineTo(x1 * S, y * S)
  ctx.stroke()
  ctx.restore()
}

/** Une case du bas de page : le libellé au-dessus, la valeur sur le trait. */
function box(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  label: string,
  value: string,
): void {
  ctx.textAlign = 'right'
  ctx.direction = 'rtl'
  ctx.fillStyle = MUTED
  ctx.font = BODY(8.5, 600)
  ctx.fillText(label, x1 * S, y * S)
  ctx.fillStyle = INK
  ctx.font = BODY(12, 500)
  if (value) ctx.fillText(value, x1 * S, (y + 18) * S)
  rule(ctx, x0, x1, y + 23)
}

interface Sheet {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

function newSheet(): Sheet {
  const canvas = newPageCanvas()
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('agreement: no 2d context')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textBaseline = 'alphabetic'
  ctx.direction = 'rtl'
  return { canvas, ctx }
}

/**
 * ★ LE LOGO EST UN MASQUE QUAND C'EST CELUI DE L'ASSOCIATION, ET UNE IMAGE
 *   QUAND C'EST CELUI DU PO.
 *
 * Le fichier d'ארצנו est blanc sur transparent (fait pour son bandeau vert) :
 * posé tel quel sur du papier blanc il est invisible, d'où `source-in`. Une
 * image téléversée, elle, est déjà ce que son propriétaire veut voir — la
 * recolorer serait décider à sa place, et un logo bicolore y perdrait sa
 * seconde couleur.
 */
async function drawLogo(
  ctx: CanvasRenderingContext2D,
  logo: AgreementLogoInput,
  y: number,
): Promise<number> {
  if (logo.src === '') return y + 6
  const own = logo.src !== null
  const img = own ? await loadImage(logo.src as string) : await loadMark()
  if (!img || img.width === 0) return y + 6

  const w = logo.width
  const h = (img.height / img.width) * w
  /* Le document est en hébreu : « start » est la DROITE de la page. */
  const x =
    logo.align === 'center'
      ? (PAGE.width / S - w) / 2
      : logo.align === 'start'
        ? PAGE.width / S - M - w
        : M

  if (own) {
    ctx.drawImage(img, x * S, y * S, w * S, h * S)
  } else {
    const stencil = document.createElement('canvas')
    stencil.width = Math.max(1, Math.round(w * S))
    stencil.height = Math.max(1, Math.round(h * S))
    const sctx = stencil.getContext('2d')
    if (sctx) {
      sctx.drawImage(img, 0, 0, stencil.width, stencil.height)
      sctx.globalCompositeOperation = 'source-in'
      sctx.fillStyle = BRAND
      sctx.fillRect(0, 0, stencil.width, stencil.height)
      ctx.drawImage(stencil, x * S, y * S, w * S, h * S)
    }
  }
  return y + h + 22
}

/**
 * Le document, dessiné. Rendu par `AgreementSignModal` à l'écran ET porté dans
 * le PDF : **ce sont les mêmes canevas**, ce qui est la seule façon honnête de
 * tenir AF1.2 (« le document se lit AVANT de signer »). Un aperçu qui ne serait
 * pas le document est un aperçu qui peut mentir.
 */
export async function drawAgreementPages(
  input: AgreementPageInput,
): Promise<HTMLCanvasElement[]> {
  /* Les fontes sont auto-hébergées : sans cette attente la première page sort
     en police de repli, une fois, et jamais les suivantes. */
  await document.fonts.ready.catch(() => undefined)

  const right = PAGE.width / S - M
  const left = M
  const sheets: Sheet[] = [newSheet()]
  let sheet = sheets[0]
  let y = 54

  const nextSheet = (): void => {
    sheet = newSheet()
    sheets.push(sheet)
    y = 62
  }
  const room = (needed: number): void => {
    if (y + needed > BOTTOM) nextSheet()
  }

  y = await drawLogo(sheet.ctx, input.logo, y)

  for (const block of input.blocks) {
    const ctx = sheet.ctx
    if (block.kind === 'blank') {
      y += 10
      continue
    }
    if (block.kind === 'title') {
      room(52)
      const ctx2 = sheet.ctx
      ctx2.direction = 'rtl'
      ctx2.textAlign = 'center'
      ctx2.fillStyle = BRAND
      ctx2.font = DISPLAY(23)
      for (const line of wrap(ctx2, block.text, W * S)) {
        ctx2.fillText(line, (PAGE.width / S / 2) * S, y * S)
        y += 28
      }
      y -= 14
      rule(ctx2, left, right, y)
      y += 30
      continue
    }
    if (block.kind === 'heading') {
      room(40)
      const ctx2 = sheet.ctx
      ctx2.textAlign = 'right'
      ctx2.fillStyle = BRAND
      ctx2.font = DISPLAY(14)
      for (const line of wrap(ctx2, block.text, W * S)) {
        ctx2.fillText(line, right * S, y * S)
        y += 20
      }
      y += 4
      continue
    }
    ctx.textAlign = 'right'
    ctx.fillStyle = INK
    ctx.font = BODY(11)
    for (const line of wrap(ctx, block.text, W * S)) {
      room(24)
      const c = sheet.ctx
      c.textAlign = 'right'
      c.fillStyle = INK
      c.font = BODY(11)
      c.fillText(line, right * S, y * S)
      y += 19
    }
  }

  // --- Le bloc de signature, jamais coupé --------------------------------
  const SIG_HEIGHT = 18 + 104 + 18 + 46
  if (y + 40 + SIG_HEIGHT > BOTTOM) nextSheet()
  else y = Math.max(y + 40, sheets.length === 1 ? 470 : y + 40)

  {
    const ctx = sheet.ctx
    ctx.fillStyle = BRAND
    ctx.font = DISPLAY(14)
    ctx.textAlign = 'right'
    ctx.direction = 'rtl'
    ctx.fillText(input.signatureHeading, right * S, y * S)
    y += 18

    const inkBoxTop = y
    const inkBoxH = 104
    ctx.save()
    ctx.strokeStyle = RULE
    ctx.lineWidth = 1 * S
    ctx.strokeRect(left * S, inkBoxTop * S, W * S, inkBoxH * S)
    ctx.restore()

    if (input.signature) {
      const ink = await loadImage(input.signature)
      if (ink) {
        const padding = 8
        const boxW = W - padding * 2
        const boxH = inkBoxH - padding * 2
        const k = Math.min(boxW / ink.width, boxH / ink.height)
        const w = ink.width * k
        const h = ink.height * k
        /* Posée du côté DÉBUT de ligne — à droite sur une page hébraïque —
           parce que c'est là que se signe un formulaire en hébreu. */
        ctx.drawImage(
          ink,
          (right - padding - w) * S,
          (inkBoxTop + padding + (boxH - h) / 2) * S,
          w * S,
          h * S,
        )
      }
    }

    y = inkBoxTop + inkBoxH + 18
    const gap = 22
    const colW = (W - gap) / 2
    box(ctx, right - colW, right, y, input.signerLabel, input.signedBy)
    box(
      ctx,
      left,
      left + colW,
      y,
      input.dateLabel,
      input.signature ? input.signedAtText : '',
    )
  }

  // --- Le pied, sur CHAQUE page ------------------------------------------
  sheets.forEach((s, i) => {
    const ctx = s.ctx
    ctx.textAlign = 'center'
    ctx.direction = 'rtl'
    ctx.fillStyle = MUTED
    ctx.font = BODY(8)
    const text =
      sheets.length > 1
        ? `${input.footer}   ·   ${i + 1} / ${sheets.length}`
        : input.footer
    ctx.fillText(text, (PAGE.width / S / 2) * S, (PAGE.height / S - 30) * S)
  })

  return sheets.map((s) => s.canvas)
}

/** La première page seule — ce que l'aperçu affiche quand il n'en montre qu'une. */
export async function drawAgreementPage(
  input: AgreementPageInput,
): Promise<HTMLCanvasElement> {
  const pages = await drawAgreementPages(input)
  return pages[0]
}

/** Le document, en PDF, avec son nom de fichier. */
export async function agreementPdf(
  input: AgreementPageInput,
  fileName: string,
): Promise<File> {
  const pages = await drawAgreementPages(input)
  return await canvasesToPdfFile(pages, fileName, {
    title: input.title,
    author: input.footer,
  })
}
