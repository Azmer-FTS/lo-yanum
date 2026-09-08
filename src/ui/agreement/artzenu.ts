import type { AgreementFieldValues } from '@core/index'

import { PAGE, canvasesToPdfFile, newPageCanvas } from '../report/pdf'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF1 (2026-09-09) — « הסכם התנדבות- ארצנו », DESSINÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce que le PO a trouvé : « aujourd'hui la signature ouvre un cadre vide et
 * produit un PDF générique, sans le contenu de l'association, sans son logo,
 * et sans reprendre le nom du signataire ni celui de la ferme ». Le document
 * qui sortait était `public/mock-agreement.pdf` — une page marquée « exemple »
 * dans l'attente d'un PDF que l'association n'a jamais envoyé. Elle ne l'a
 * toujours pas envoyé ; ce fichier ne l'attend plus.
 *
 * ★★ MÊME TECHNIQUE QUE `report/pdf.ts`, ET POUR LA MÊME RAISON. Aucune
 *    bibliothèque PDF ne compose l'hébreu de cette application sans une chaîne
 *    de polices et une passe bidi : les quatorze polices de base n'ont pas une
 *    lettre d'hébreu. Le NAVIGATEUR, lui, sait déjà façonner, ordonner et
 *    rendre l'hébreu dans les fontes de l'app. La page est donc DESSINÉE sur
 *    un canevas A4 et le PDF la porte comme une seule image. Zéro glyphe
 *    embarqué, zéro dépendance neuve.
 *
 *    ⚠️ LE COÛT, DIT : le texte n'est pas sélectionnable et le fichier pèse
 *      ~200 à 400 ko. Pour un formulaire d'une page qu'un agriculteur signe et
 *      qu'un coordinateur transmet, c'est le bon échange — et c'est le même
 *      qu'a fait le rapport de la direction (point 7).
 *
 * ★★ LA PAGE EST BLANCHE MÊME QUAND L'APP EST NOIRE, ET C'EST DÉLIBÉRÉ. Les
 *    couleurs ci-dessous sont des LITTÉRAUX et non des jetons : un contrat qui
 *    sortirait en blanc sur noir parce que le coordinateur a le thème sombre
 *    est un contrat qu'on ne peut pas imprimer, et il coûte une cartouche à
 *    l'association le jour où quelqu'un l'imprime quand même. `report/draw.ts`
 *    lit les jetons parce que c'est un tableau de bord ; ceci est un
 *    formulaire.
 *
 * ★ LE LOGO EST UN MASQUE, PAS UNE IMAGE. Le fichier de l'association est
 *   blanc sur transparent (fait pour son bandeau vert) : posé tel quel sur du
 *   papier blanc il est invisible. `source-in` lui donne l'encre de la page.
 *   Voir `scripts/logo.ts`.
 */

const S = PAGE.scale
/** Marge de page, en points PDF. La même que le rapport. */
const M = 46
/** Largeur utile. */
const W = PAGE.width / S - 2 * M

/**
 * ⚠️ DES LITTÉRAUX, PAS DES JETONS — voir l'en-tête. `#0B3D2C` est le vert des
 *    titres de la charte de l'association (docs/brand-artzenu.md §2), qui est
 *    aussi l'encre de son logo.
 */
const INK = '#111827'
const MUTED = '#6B7280'
const BRAND = '#0B3D2C'
const RULE = '#C7D2CB'

const BODY = (size: number, weight = 400): string =>
  `${weight} ${size * S}px Rubik, "Frank Ruhl Libre", system-ui, sans-serif`
const DISPLAY = (size: number, weight = 700): string =>
  `${weight} ${size * S}px "Frank Ruhl Libre", Rubik, serif`

export interface AgreementPageInput {
  /** Les quatre cases de l'en-tête, déjà prises sur la fiche (@core). */
  fields: AgreementFieldValues
  /** Le titre du document, traduit. */
  title: string
  /** Les libellés des quatre cases, dans l'ordre de `AGREEMENT_FIELDS`. */
  labels: { place: string; farmerName: string; farmerId: string; phone: string }
  /** « הצהרה ואישור » et son texte, l'année déjà insérée (@core). */
  declarationHeading: string
  declarationText: string
  /** « חתימה », et les deux libellés sous le trait. */
  signatureHeading: string
  signerLabel: string
  dateLabel: string
  /** L'encre, en data URI. `null` = le document AVANT la signature (AF1.2). */
  signature: string | null
  /** Le nom porté sous le trait, et la date. */
  signedBy: string
  signedAt: string
  locale: string
  /** Le pied de page — d'où vient ce document. */
  footer: string
}

/** Le logo, chargé une fois par session et gardé. */
let markPromise: Promise<HTMLImageElement | null> | null = null

function loadMark(): Promise<HTMLImageElement | null> {
  markPromise ??= new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    /* Résolu contre la base de l'app, comme le fait `placeholderUrl()` : la
       PWA installée n'a pas la même base que l'onglet. */
    img.src = new URL(
      `${import.meta.env.BASE_URL}artzenu-mark.png`,
      window.location.href,
    ).toString()
  })
  return markPromise
}

function loadInk(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * Le retour à la ligne, à la main, parce que le canevas n'en a pas.
 *
 * ⚠️ ON COUPE SUR LES ESPACES ET ON MESURE LA LIGNE ENTIÈRE, jamais la somme
 *    des mots : en hébreu la mise en forme bidi d'une ligne n'est pas la
 *    concaténation des mesures de ses morceaux dès qu'un chiffre ou une
 *    parenthèse s'y trouve — et ce paragraphe en contient.
 */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w !== '')
    if (words.length === 0) {
      lines.push('')
      continue
    }
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
  }
  return lines
}

/** Un trait plein largeur d'un bloc, à `y` (unités de page). */
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

/**
 * ★ UNE CASE DU FORMULAIRE : le libellé au-dessus, la valeur sur le trait.
 *
 * Une valeur ABSENTE laisse le trait vide plutôt que d'écrire « — » : c'est un
 * formulaire, et une ligne vide sur un formulaire veut dire « à remplir à la
 * main », ce qui est exactement ce que le PO fera devant l'agriculteur si le
 * ת״ז n'est pas encore dans la fiche.
 */
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

/**
 * La page, dessinée. Rendue par `AgreementSignModal` à l'écran ET portée dans
 * le PDF : **c'est le même canevas**, ce qui est la seule façon honnête de
 * tenir AF1.2 (« le document se lit AVANT de signer »). Un aperçu qui ne
 * serait pas le document est un aperçu qui peut mentir.
 */
export async function drawAgreementPage(
  input: AgreementPageInput,
): Promise<HTMLCanvasElement> {
  /* Les fontes sont auto-hébergées : sans cette attente la première page sort
     en police de repli, une fois, et jamais les suivantes — le pire genre de
     défaut. `report/draw.ts` a le même besoin depuis N5. */
  await document.fonts.ready.catch(() => undefined)

  const canvas = newPageCanvas()
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('agreement: no 2d context')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textBaseline = 'alphabetic'

  const right = PAGE.width / S - M
  const left = M

  // --- L'en-tête : le logo, puis le titre --------------------------------
  const mark = await loadMark()
  let y = 54
  if (mark) {
    const w = 150
    const h = (mark.height / mark.width) * w
    const x = (PAGE.width / S - w) / 2
    /* Le masque : la forme vient de l'alpha, la couleur de la page. */
    const stencil = document.createElement('canvas')
    stencil.width = Math.round(w * S)
    stencil.height = Math.round(h * S)
    const sctx = stencil.getContext('2d')
    if (sctx) {
      sctx.drawImage(mark, 0, 0, stencil.width, stencil.height)
      sctx.globalCompositeOperation = 'source-in'
      sctx.fillStyle = BRAND
      sctx.fillRect(0, 0, stencil.width, stencil.height)
      ctx.drawImage(stencil, x * S, y * S, w * S, h * S)
    }
    y += h + 22
  } else {
    y += 10
  }

  ctx.direction = 'rtl'
  ctx.textAlign = 'center'
  ctx.fillStyle = BRAND
  ctx.font = DISPLAY(23)
  ctx.fillText(input.title, (PAGE.width / S / 2) * S, y * S)
  y += 14
  rule(ctx, left, right, y)
  y += 34

  // --- Les quatre cases, deux par ligne ----------------------------------
  const gap = 22
  const colW = (W - gap) / 2
  const rightColX1 = right
  const rightColX0 = right - colW
  const leftColX1 = left + colW
  const leftColX0 = left

  box(ctx, rightColX0, rightColX1, y, input.labels.place, input.fields.place)
  box(ctx, leftColX0, leftColX1, y, input.labels.farmerName, input.fields.farmerName)
  y += 50
  box(ctx, rightColX0, rightColX1, y, input.labels.farmerId, input.fields.farmerId)
  box(ctx, leftColX0, leftColX1, y, input.labels.phone, input.fields.phone)
  y += 62

  // --- הצהרה ואישור -------------------------------------------------------
  ctx.textAlign = 'right'
  ctx.fillStyle = BRAND
  ctx.font = DISPLAY(14)
  ctx.fillText(input.declarationHeading, right * S, y * S)
  y += 22

  ctx.fillStyle = INK
  ctx.font = BODY(11)
  const lines = wrap(ctx, input.declarationText, W * S)
  for (const l of lines) {
    ctx.fillText(l, right * S, y * S)
    y += 19
  }

  // --- חתימה --------------------------------------------------------------
  /* Le bloc de signature descend avec le texte mais jamais au-dessus de 560 :
     sur un formulaire, la signature est en bas de page, et un paragraphe court
     ne doit pas la faire remonter au milieu. */
  y = Math.max(y + 40, 516)
  ctx.fillStyle = BRAND
  ctx.font = DISPLAY(14)
  ctx.textAlign = 'right'
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
    const ink = await loadInk(input.signature)
    if (ink) {
      const padding = 8
      const boxW = W - padding * 2
      const boxH = inkBoxH - padding * 2
      const k = Math.min(boxW / ink.width, boxH / ink.height)
      const w = ink.width * k
      const h = ink.height * k
      /* Posée du côté DÉBUT de ligne — c'est-à-dire à droite sur une page
         hébraïque — parce que c'est là que se signe un formulaire en hébreu.
         `sign.ts` a fait l'erreur inverse une fois et a tamponné le bloc du
         coordinateur de l'association à la place de celui de l'agriculteur. */
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
  const when = new Date(input.signedAt)
  const date = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleDateString(input.locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
  box(ctx, rightColX0, rightColX1, y, input.signerLabel, input.signedBy)
  box(ctx, leftColX0, leftColX1, y, input.dateLabel, input.signature ? date : '')

  // --- Le pied ------------------------------------------------------------
  ctx.textAlign = 'center'
  ctx.fillStyle = MUTED
  ctx.font = BODY(8)
  ctx.fillText(input.footer, (PAGE.width / S / 2) * S, (PAGE.height / S - 30) * S)

  return canvas
}

/** Le document, en PDF, avec son nom de fichier. */
export async function agreementPdf(
  input: AgreementPageInput,
  fileName: string,
): Promise<File> {
  const canvas = await drawAgreementPage(input)
  return await canvasesToPdfFile(canvas ? [canvas] : [], fileName, {
    title: input.title,
    author: input.footer,
  })
}
