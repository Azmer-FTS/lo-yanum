import type { Agreement } from '@core/types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * W8 / P3.3 (2026-09-02) — THE SIGNATURE IS ON THE CONTRACT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The pad has existed since P3.3 and the ink was stored on the `agreements`
 * row — and stopped there. `agreement/document.ts` said so in as many words:
 * "the signature … will be drawn onto this document when that unit lands".
 * Until it did, a coordinator could watch a farmer sign on his iPad, then
 * share a contract with a blank signature block on it. This is that unit.
 *
 * ★ THE STAMP IS AN IMAGE, AND THAT IS THE WHOLE REASON THIS IS SHORT.
 *   `report/pdf.ts` sets out at length why no PDF library can print this
 *   app's Hebrew without a font pipeline and a bidi pass: the base-14 fonts
 *   have no Hebrew, and embedding a subset of a self-hosted WOFF2 is a
 *   project of its own. So the browser draws the block — the name, the date,
 *   the ink, the caption — onto a CANVAS, where Hebrew is already shaped,
 *   already bidi-ordered and already in the app's own faces, and the PDF
 *   carries the result as one PNG. Not a single glyph is embedded.
 *
 * ★ `pdf-lib`, AND ONLY BEHIND A DYNAMIC IMPORT. It is used for exactly two
 *   things — parse an existing PDF, put an XObject on its last page — which
 *   is the one job `report/pdf.ts`'s hand-rolled writer cannot do, because
 *   that writer creates documents and this has to modify one it was handed
 *   (the association's own contract, uploaded from הגדרות, whose bytes this
 *   app has never seen). `await import()` keeps its ~350 kB out of the main
 *   bundle: it is fetched the first time somebody opens a SIGNED contract
 *   and never on any other path.
 *
 * ⚠️ IT STAMPS THE LAST PAGE, BOTTOM, INLINE-END. A contract's signature
 *    block is at the foot of its final page in every template the
 *    association is likely to upload, and putting it anywhere else would be
 *    guessing. If a real template arrives with the block elsewhere, this is
 *    one rectangle to move — the note is here so that it is looked for.
 *
 * ⚠️ AND IT NEVER FAILS THE DOCUMENT. An encrypted or malformed PDF makes
 *    `PDFDocument.load` throw; the original bytes are then returned
 *    UNCHANGED, so the worst case is the contract exactly as it was before
 *    this unit — never a broken download in front of a farmer.
 */

/** Physical width of the stamp on the page, in PDF points (1/72 in). */
const STAMP_W = 232
const STAMP_H = 96
/**
 * Distance from the page's inline-start edge and from its foot. Measured
 * against the shipped placeholder: 48 pt clears the page footer under it and
 * leaves the «תאריך: ____» rule above it untouched.
 */
const MARGIN_X = 42
const MARGIN_Y = 48

/** 4× so the ink is sharp on paper as well as on a Retina screen. */
const SCALE = 4

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * The signature block, drawn by the browser: caption, the ink itself, the
 * signer's name and the date, on a hairline-boxed white ground so it reads as
 * a stamp on whatever the contract's own page looks like underneath.
 */
async function drawStamp(
  agreement: Agreement,
  farmName: string,
  t: Translate,
  locale: string,
): Promise<Blob | null> {
  const ink = agreement.signature
  if (!ink) return null

  const canvas = document.createElement('canvas')
  canvas.width = STAMP_W * SCALE
  canvas.height = STAMP_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(SCALE, SCALE)
  // The page underneath may be any colour; the block states its own ground.
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, STAMP_W, STAMP_H)
  ctx.strokeStyle = '#9CA3AF'
  ctx.lineWidth = 0.8
  ctx.strokeRect(0.4, 0.4, STAMP_W - 0.8, STAMP_H - 0.8)

  // ★ RTL, because this is a Hebrew document and the browser is what knows
  //   how to lay one out — see the header note.
  ctx.direction = 'rtl'
  ctx.textAlign = 'right'
  const right = STAMP_W - 10

  ctx.fillStyle = '#6B7280'
  ctx.font = '600 8px Rubik, system-ui, sans-serif'
  ctx.fillText(t('signature.title'), right, 15)

  // The ink. Drawn INSIDE a fixed box and letterboxed, so a wide scrawl and a
  // tall one both land on the line rather than one of them overflowing it.
  const image = await loadImage(ink)
  if (image) {
    const boxW = STAMP_W - 20
    const boxH = 44
    const k = Math.min(boxW / image.width, boxH / image.height)
    const w = image.width * k
    const h = image.height * k
    ctx.drawImage(image, right - w, 18 + (boxH - h) / 2, w, h)
  }

  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(10, 66)
  ctx.lineTo(right, 66)
  ctx.stroke()

  ctx.fillStyle = '#111827'
  ctx.font = '700 9px Rubik, system-ui, sans-serif'
  ctx.fillText(agreement.signedBy || farmName, right, 78)

  ctx.fillStyle = '#6B7280'
  ctx.font = '400 7.5px Rubik, system-ui, sans-serif'
  const when = new Date(agreement.signedAt)
  const date = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
  ctx.fillText(`${farmName}${date ? ` · ${date}` : ''}`, right, 90)

  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png'),
  )
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * The contract with the signature on it — or the contract exactly as it came
 * in, when there is no signature, no canvas, or a PDF that cannot be parsed.
 */
export async function stampAgreement(
  bytes: ArrayBuffer,
  agreement: Agreement,
  farmName: string,
  t: Translate,
  locale = 'he-IL',
): Promise<BlobPart> {
  if (!agreement.signature) return bytes
  try {
    const stamp = await drawStamp(agreement, farmName, t, locale)
    if (!stamp) return bytes

    const { PDFDocument } = await import('pdf-lib')
    const pdf = await PDFDocument.load(bytes)
    const pages = pdf.getPages()
    if (pages.length === 0) return bytes
    const page = pages[pages.length - 1]

    const png = await pdf.embedPng(await stamp.arrayBuffer())
    const { width } = page.getSize()
    page.drawImage(png, {
      // ⚠️ PHYSICAL RIGHT, BECAUSE THAT IS WHERE THE *ENTITY OWNER* SIGNS.
      //    The signature this app captures is the FARMER's — the pad sits
      //    under "נחתם על ידי" in the entity's own form — and on the Hebrew
      //    contract his block is «חתימת בעל היישות», at the inline START,
      //    i.e. the physical right. The left block is the association's
      //    coordinator, which this never signs. The first run of this unit
      //    stamped the left one, and that was the wrong party.
      x: Math.max(MARGIN_X, width - STAMP_W - MARGIN_X),
      y: MARGIN_Y,
      width: STAMP_W,
      height: STAMP_H,
    })
    // `save()` returns a `Uint8Array` over a possibly shared buffer, which is
    // not a `BlobPart` in this TS lib: copy it into a plain one.
    const out = await pdf.save()
    const copy = new Uint8Array(out.length)
    copy.set(out)
    return copy.buffer
  } catch {
    // See the header: the original document is always better than none.
    return bytes
  }
}
