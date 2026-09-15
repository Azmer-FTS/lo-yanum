/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AK8 (2026-09-16) — UNE SIGNATURE QUI TIENT DANS UNE CELLULE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LE PLAFOND EST CELUI D'EXCEL, ET IL EST SILENCIEUX : 32 767 caractères par
 *    cellule. Au-delà, le tableur TRONQUE en ouvrant le fichier — la chaîne
 *    `data:` cesse d'être une image, l'aller-retour rend une signature illisible,
 *    et rien ne l'annonce. Le pad signe à la densité de l'écran (un iPad
 *    rétine : ~1 400 px de large), ce qui dépasse largement.
 *
 * ★ DONC LA SIGNATURE EST REDESSINÉE PLUS PETITE AVANT DE SORTIR, jamais
 *   rognée : même tracé, même proportions, sur au plus 480 × 160 px, puis en
 *   descendant par paliers tant que la chaîne dépasse. Ce qui part au ministère
 *   est ce que l'agriculteur a tracé, en plus léger.
 *
 * ⛔ ET RIEN N'EST TOUCHÉ SUR LA FICHE. Cette compaction n'existe que le temps
 *    d'un fichier : la signature d'origine, celle qui fait foi dans le PDF,
 *    reste telle quelle dans la base.
 */

/** La limite d'Excel, moins une marge pour les guillemets d'un CSV. */
export const SIGNATURE_CELL_LIMIT = 30_000
const MAX_W = 480
const MAX_H = 160

const IS_PNG = /^data:image\/png;base64,/i

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * Une signature, redessinée pour tenir sous `limit` caractères.
 * Rend la chaîne d'origine si elle tient déjà, ou si l'image est illisible —
 * une signature qu'on ne peut pas redessiner sort telle quelle plutôt que pas
 * du tout.
 */
export async function compactSignature(
  dataUri: string,
  limit = SIGNATURE_CELL_LIMIT,
): Promise<string> {
  if (!IS_PNG.test(dataUri) || dataUri.length <= limit) return dataUri
  const img = await loadImage(dataUri)
  if (!img || img.width === 0 || img.height === 0) return dataUri

  let scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1)
  for (let attempt = 0; attempt < 6; attempt++) {
    const w = Math.max(80, Math.round(img.width * scale))
    const h = Math.max(28, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUri
    /* ⚠️ FOND BLANC ET NON TRANSPARENT : posée dans un tableur, une encre noire
       sur transparent est invisible dès que la cellule est sombre. */
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    const out = canvas.toDataURL('image/png')
    if (out.length <= limit) return out
    scale *= 0.7
  }
  return dataUri
}

/**
 * La matrice d'export, ses cellules de signature compactées. Tout le reste est
 * rendu tel quel, et la matrice d'origine n'est pas modifiée.
 */
export async function compactSignatures(
  matrix: readonly (readonly string[])[],
  limit = SIGNATURE_CELL_LIMIT,
): Promise<string[][]> {
  const out: string[][] = []
  for (const row of matrix) {
    const next: string[] = []
    for (const cell of row) {
      next.push(IS_PNG.test(cell) ? await compactSignature(cell, limit) : cell)
    }
    out.push(next)
  }
  return out
}
