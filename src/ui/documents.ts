import { PAGE, canvasesToPdfFile, newPageCanvas } from './report/pdf'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG6.2 (2026-09-09) — « IL PHOTOGRAPHIE SES PAPIERS ET L'APP EN COMPOSE UN
 *    PDF — PLUSIEURS PAGES POSSIBLES. »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★ AUCUNE BIBLIOTHÈQUE NEUVE, ET C'EST LA MÊME RAISON QU'EN AF1 ET QU'AU
 *    POINT 7. `report/pdf.ts` sait déjà écrire un PDF dont chaque page est une
 *    image JPEG, sans police embarquée et sans dépendance — il a été écrit
 *    pour le compte rendu et il fait exactement ce travail-ci. Ce fichier ne
 *    fait donc que RECADRER : chaque photo est posée sur une page A4, centrée,
 *    à l'échelle qui la fait tenir entière.
 *
 * ⚠️ « QUI LA FAIT TENIR ENTIÈRE » EST LE POINT, ET C'EST LE DÉFAUT QUE LA
 *    PREMIÈRE VERSION AURAIT EU. Remplir la page — `cover` — est plus joli et
 *    coupe les bords ; sur la photo d'un document, les bords sont l'en-tête,
 *    le numéro de dossier et le tampon. Un papier officiel amputé de son
 *    en-tête est un papier que l'État refuse. C'est donc `contain`, avec de la
 *    marge blanche si l'appareil a pris en portrait ce qui est en paysage.
 *
 * ★ ET LA PAGE EST BLANCHE, LITTÉRALEMENT, comme le document d'AF1 : un fond
 *   pris sur les jetons du thème produirait un scan noir chez un coordinateur
 *   en thème sombre, c'est-à-dire un scan illisible et impossible à imprimer.
 */

/** Marge autour de l'image, en pixels de canevas (donc à l'échelle de `PAGE`). */
const MARGIN = 24 * PAGE.scale

async function drawOnA4(source: ImageBitmap): Promise<HTMLCanvasElement> {
  const canvas = newPageCanvas()
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const boxW = canvas.width - MARGIN * 2
  const boxH = canvas.height - MARGIN * 2
  const k = Math.min(boxW / source.width, boxH / source.height)
  const w = source.width * k
  const h = source.height * k
  ctx.drawImage(source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
  return canvas
}

/**
 * Un PDF d'une page par photo, dans l'ordre donné.
 *
 * ⚠️ L'ORDRE EST CELUI DE LA LISTE ET NON CELUI DU SÉLECTEUR DE FICHIERS. Un
 *    contrat de trois pages photographiées dans le désordre est un contrat
 *    illisible ; l'écran laisse donc réordonner avant de composer, et cette
 *    fonction se contente d'obéir.
 */
export async function photosToPdf(
  files: File[],
  fileName: string,
  meta: { title: string; author: string },
): Promise<File> {
  if (files.length === 0) throw new Error('no pages')
  const canvases: HTMLCanvasElement[] = []
  for (const file of files) {
    const bitmap = await createImageBitmap(file)
    canvases.push(await drawOnA4(bitmap))
    bitmap.close()
  }
  return await canvasesToPdfFile(canvases, fileName, meta)
}

/**
 * Un fichier, en URL de données.
 *
 * ★ POURQUOI UNE URL DE DONNÉES ET NON UN `Blob` : voir `ProvidedDocument`
 *   dans core/types.ts. Elle traverse le cache d'IndexedDB, l'outbox hors
 *   ligne et la sérialisation JSON du magasin sans qu'aucun des trois n'ait à
 *   connaître un système de fichiers.
 */
export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('file could not be read'))
    reader.readAsDataURL(file)
  })
}

/** Un PDF déposé tel quel, sans recomposition. */
export async function pdfToDataUrl(file: File): Promise<string> {
  return await fileToDataUrl(file)
}
