/**
 * PO POINT 7 (2026-08-31) — A REAL PDF, IN HEBREW, WITH NO PDF LIBRARY.
 *
 * ★★ THE BRIEF SAID "THE SAME PDF LIB AS THE AGREEMENTS" AND THERE IS NO SUCH
 *    LIB. `public/mock-agreement.pdf` is a static file checked into the
 *    repository; nothing in this project has ever GENERATED a PDF. So this
 *    unit had to choose one, and the choice is the interesting part.
 *
 * ★ EVERY JS PDF LIBRARY FAILS THE SAME WAY ON THIS APP: HEBREW. `jspdf` and
 *   `pdf-lib` both draw text with an embedded font, and the PDF base-14 fonts
 *   have no Hebrew at all — so either would need a Hebrew TTF embedded and
 *   subset (this project self-hosts WOFF2, which neither accepts), plus a bidi
 *   pass by hand for every line that mixes a Hebrew label with a Latin digit.
 *   That is a font pipeline and a bidi implementation to print eleven numbers.
 *
 * ★★ SO THE TEXT IS DRAWN BY THE BROWSER, ON A CANVAS, AND THE PDF CARRIES THE
 *    RESULT AS ONE IMAGE. The browser already shapes Hebrew, already does bidi,
 *    already has the app's own self-hosted faces loaded, and already knows
 *    `direction: rtl`. A PDF whose page content is a single JPEG XObject needs
 *    **no font embedding whatsoever**, which is why the whole writer below is
 *    a hundred lines and has no dependency.
 *
 *    ⚠️ THE COST, STATED: the text is not selectable and the file is ~200–400 kB
 *      rather than ~20. For a one-page sheet of large figures that a director
 *      reads on a phone and forwards, that is the right trade. If a future
 *      requirement needs selectable text (a searchable archive, a contract),
 *      this is the decision to revisit — and it will need the font pipeline.
 *
 * ★ AND IT IS A REAL `File`, which is what makes point 7b possible: the Web
 *   Share API carries files, and on an iPad that is one tap to Mail or
 *   WhatsApp. A print-to-PDF flow would have looked similar and produced
 *   nothing a script or a share sheet could hold.
 */

const A4 = { width: 595.28, height: 841.89 } as const
/** 2× A4 at 72 dpi ≈ 144 dpi — sharp on a Retina screen and on paper. */
const SCALE = 2

/**
 * A PDF text string, and ★ HEBREW FORCES THE SECOND FORM.
 *
 * A literal `(…)` string in a PDF is PDFDocEncoding — Latin-1 with a few
 * substitutions — and has no Hebrew at all. Writing the UTF-8 bytes into one
 * is what put `xfixŁxŠ x°xŁxIx€xŽx°` in the reader's title bar on the first
 * run. The portable answer is a HEX string of UTF-16BE with a byte-order mark,
 * which every reader since PDF 1.0 understands; ASCII still takes the readable
 * literal form so the file stays greppable.
 */
function pdfString(value: string): string {
  const ascii = /^[\x20-\x7E]*$/.test(value)
  if (ascii) {
    return `(${value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`
  }
  let hex = 'FEFF'
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code > 0xffff) {
      // Surrogate pair, spelled out rather than assumed.
      const v = code - 0x10000
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0').toUpperCase()
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0').toUpperCase()
    } else {
      hex += code.toString(16).padStart(4, '0').toUpperCase()
    }
  }
  return `<${hex}>`
}

/**
 * Wrap already-encoded JPEG pages into a minimal PDF 1.4 file.
 *
 * ★ THE CROSS-REFERENCE TABLE IS THE ONLY FIDDLY PART, and it is fiddly in an
 *   exact way: every entry is a 20-byte record, `%010d %05d n \n`, and the
 *   offsets are counted in BYTES of the file built so far. Building the body
 *   as an array of byte-strings and measuring as we go is what keeps that
 *   honest — computing the offsets afterwards from a joined string would be
 *   wrong the moment a JPEG contains a byte sequence that is not one character.
 */
export function jpegPagesToPdf(
  pages: Array<{ jpeg: Uint8Array; width: number; height: number }>,
  meta: { title: string; author: string },
): Blob {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  let length = 0
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data
    chunks.push(bytes)
    length += bytes.length
    return bytes
  }

  const offsets: number[] = []
  const startObject = () => {
    offsets.push(length)
  }

  push('%PDF-1.4\n')
  // A comment with high bytes, which is what tells a reader the file is binary.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  // 1 = catalogue, 2 = pages, then per page: page object, content, image.
  const pageObjectIds = pages.map((_, i) => 3 + i * 3)
  const contentIds = pages.map((_, i) => 4 + i * 3)
  const imageIds = pages.map((_, i) => 5 + i * 3)
  const infoId = 3 + pages.length * 3

  startObject()
  push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`)

  startObject()
  push(
    `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>\nendobj\n`,
  )

  pages.forEach((page, i) => {
    const content = `q\n${A4.width} 0 0 ${A4.height} 0 0 cm\n/Im0 Do\nQ\n`

    startObject()
    push(
      `${pageObjectIds[i]} 0 obj\n<< /Type /Page /Parent 2 0 R ` +
        `/MediaBox [0 0 ${A4.width} ${A4.height}] ` +
        `/Resources << /XObject << /Im0 ${imageIds[i]} 0 R >> >> ` +
        `/Contents ${contentIds[i]} 0 R >>\nendobj\n`,
    )

    startObject()
    push(
      `${contentIds[i]} 0 obj\n<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`,
    )

    startObject()
    push(
      `${imageIds[i]} 0 obj\n<< /Type /XObject /Subtype /Image ` +
        `/Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${page.jpeg.length} >>\nstream\n`,
    )
    push(page.jpeg)
    push('\nendstream\nendobj\n')
  })

  startObject()
  push(
    `${infoId} 0 obj\n<< /Title ${pdfString(meta.title)} /Producer ${pdfString(
      meta.author,
    )} >>\nendobj\n`,
  )

  const xrefOffset = length
  const count = offsets.length + 1
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  push(xref)
  push(
    `trailer\n<< /Size ${count} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  )

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

/** One A4 canvas at `SCALE`, ready to be drawn on. */
export function newPageCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(A4.width * SCALE)
  canvas.height = Math.round(A4.height * SCALE)
  return canvas
}

export const PAGE = {
  width: A4.width * SCALE,
  height: A4.height * SCALE,
  scale: SCALE,
} as const

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  )
  if (!blob) throw new Error('canvas could not be encoded')
  return new Uint8Array(await blob.arrayBuffer())
}

export async function canvasesToPdfFile(
  canvases: HTMLCanvasElement[],
  fileName: string,
  meta: { title: string; author: string },
): Promise<File> {
  const pages = await Promise.all(
    canvases.map(async (c) => ({
      jpeg: await canvasToJpeg(c),
      width: c.width,
      height: c.height,
    })),
  )
  const blob = jpegPagesToPdf(pages, meta)
  return new File([blob], fileName, { type: 'application/pdf' })
}
