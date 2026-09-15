/* @core/xlsx is the workbook WRITER and is deliberately not re-exported from
   the core index — it is the import/export surface's own tool. */
import { STYLE_BODY, STYLE_HEADER, STYLE_SIGNATURE, buildWorkbook, matrixToCsv } from '@core/xlsx'
import type { SheetImage } from '@core/xlsx'

/**
 * ★★ AB6.1 (2026-09-08) — THE TWO WAYS A MATRIX LEAVES THIS APP.
 *
 * « Export CSV et xlsx à ces colonnes exactes. » Both come from the SAME
 * matrix, which is what makes "the two files agree" a property of one array
 * rather than of two writers that happen to be in step today.
 */
function save(blob: Blob, file: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * ★★ AK8 (2026-09-16) — LA SIGNATURE SORT EN PNG, DANS SA PROPRE CELLULE.
 *
 * Une cellule dont la valeur EST une image en `data:` est écrite deux fois au
 * même endroit et pas une de plus : la chaîne, que le ré-import relit (AA5), et
 * le PNG lui-même, ancré à cette cellule (`SheetImage`). Le format `;;;` de
 * `STYLE_SIGNATURE` fait que la chaîne ne s'affiche pas sous l'image, et la
 * ligne est haute assez pour qu'une signature se lise.
 */
const IS_PNG = /^data:image\/png;base64,/i
/** ⚠️ La limite d'une cellule Excel est 32 767 caractères. `compactSignatures`
 *    (ui/report/signatureCells.ts) ramène chaque signature sous ce plafond
 *    AVANT d'arriver ici ; au-delà, l'image est écrite et la chaîne omise —
 *    mieux vaut une signature qu'on voit qu'un classeur qu'Excel tronque. */
const CELL_LIMIT = 32_000

export function downloadMatrix(
  matrix: readonly (readonly string[])[],
  widths: number[],
  sheet: string,
  file: string,
): void {
  const images: SheetImage[] = []
  const rowHeights: Record<number, number> = {}
  const rows = matrix.map((row, i) =>
    row.map((value, c) => {
      if (i > 0 && IS_PNG.test(value)) {
        images.push({ row: i, col: c, dataUri: value })
        rowHeights[i] = 58
        return { value: value.length > CELL_LIMIT ? '' : value, style: STYLE_SIGNATURE }
      }
      return { value, style: i === 0 ? STYLE_HEADER : STYLE_BODY }
    }),
  )
  const bytes = buildWorkbook([
    { name: sheet, widths, rows, freezeHeader: true, images, rowHeights },
  ])
  save(
    new Blob([bytes.slice().buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    file,
  )
}

/**
 * The same matrix as CSV.
 *
 * ⚠️ `text/csv;charset=utf-8` AND the BOM `matrixToCsv` writes. Neither alone
 *    is enough on a Hebrew Windows machine: the type is what the browser
 *    labels the download, the BOM is what Excel actually reads.
 */
export function downloadCsv(
  matrix: readonly (readonly string[])[],
  file: string,
): void {
  save(new Blob([matrixToCsv(matrix)], { type: 'text/csv;charset=utf-8' }), file)
}
