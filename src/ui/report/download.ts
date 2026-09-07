/* @core/xlsx is the workbook WRITER and is deliberately not re-exported from
   the core index — it is the import/export surface's own tool. */
import { STYLE_BODY, STYLE_HEADER, buildWorkbook, matrixToCsv } from '@core/xlsx'

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

/** Turn a matrix into an .xlsx and hand it to the browser. */
export function downloadMatrix(
  matrix: readonly (readonly string[])[],
  widths: number[],
  sheet: string,
  file: string,
): void {
  const rows = matrix.map((row, i) =>
    row.map((value) => ({ value, style: i === 0 ? STYLE_HEADER : STYLE_BODY })),
  )
  const bytes = buildWorkbook([{ name: sheet, widths, rows, freezeHeader: true }])
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
