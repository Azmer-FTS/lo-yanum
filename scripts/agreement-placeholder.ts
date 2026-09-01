import { chromium } from 'playwright'

import { jpegPagesToPdf } from '../src/ui/report/pdf'

/**
 * ORDRE DE NUIT 2026-09-02 (N2) — THE PLACEHOLDER AGREEMENT, GENERATED.
 *
 *   BASE_URL=http://localhost:5197 bun run scripts/agreement-placeholder.ts
 *
 * One A4 page, Hebrew, the לא ינום header, a body that says in its first line
 * and in a stamp across the page that it is a SAMPLE and not the association's
 * contract. Rendered the way the employer's report is (ETAT §19.1): the
 * browser draws the text on a canvas — it already shapes Hebrew and has the
 * app's own faces — and the PDF carries the page as one image, so no font is
 * embedded and no PDF library is needed. Written to `public/mock-agreement.pdf`,
 * which every entity's "view / download / share" resolves to until the real
 * contract is uploaded from הגדרות → תבנית הסכם.
 *
 * `BASE_URL` is any served build of the app: the page is used only for its
 * `@font-face` rules, so the door is enough.
 */

const BASE = (process.env.BASE_URL ?? 'http://localhost:5197').replace(/\/$/, '')
const OUT = 'public/mock-agreement.pdf'

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.waitForTimeout(800)

  const jpeg: string = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('700 48px "Frank Ruhl Libre"'),
      document.fonts.load('400 22px "Rubik"'),
      document.fonts.load('500 22px "Rubik"'),
    ])
    const W = 1191
    const H = 1684
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    ctx.direction = 'rtl'
    ctx.textAlign = 'right'
    const margin = 110
    const right = W - margin

    // Header band
    ctx.fillStyle = '#1e7a4f'
    ctx.fillRect(0, 0, W, 14)
    ctx.fillStyle = '#17212a'
    ctx.font = '700 60px "Frank Ruhl Libre", serif'
    ctx.fillText('לא ינום', right, 150)
    ctx.font = '400 24px "Rubik", sans-serif'
    ctx.fillStyle = '#5b6b7a'
    ctx.fillText('הִנֵּה לֹא יָנוּם וְלֹא יִישָׁן שׁוֹמֵר יִשְׂרָאֵל — תהלים קכ"א, ד', right, 195)
    ctx.fillText('תוכנית שמירה התנדבותית על חוות ויישובים', right, 232)

    ctx.strokeStyle = '#d9dee3'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(margin, 270)
    ctx.lineTo(right, 270)
    ctx.stroke()

    // Title
    ctx.fillStyle = '#17212a'
    ctx.font = '700 40px "Frank Ruhl Libre", serif'
    ctx.fillText('הסכם שיתוף פעולה — שמירה על יישות חקלאית', right, 340)

    // The sample notice, first thing after the title
    ctx.fillStyle = '#b4232c'
    ctx.font = '500 26px "Rubik", sans-serif'
    ctx.fillText('מסמך לדוגמה בלבד — אינו ההסכם של העמותה', right, 395)
    ctx.fillStyle = '#5b6b7a'
    ctx.font = '400 22px "Rubik", sans-serif'
    ctx.fillText('ההסכם האמיתי מועלה מהגדרות → תבנית הסכם, ומחליף מסמך זה בכל כרטיסי היישויות.', right, 432)

    // Body
    const body = [
      'בין: עמותת "לא ינום" (להלן: "העמותה")',
      'לבין: בעל/ת היישות החקלאית ____________________ (להלן: "בעל היישות")',
      '',
      '1. מטרת ההסכם — הסדרת שמירה התנדבותית לילית על שטחי היישות, בתיאום מלא עם בעל היישות.',
      '2. המתנדבים — העמותה תשבץ מתנדבים בהתאם לזמינותם; בעל היישות יקבל הודעה מראש על כל שמירה.',
      '3. נקודות שמירה — בעל היישות יגדיר עם רכז העמותה את עמדות השמירה ונקודות האיסוף.',
      '4. התחייבויות בעל היישות — גישה לשטח, מים, ומידע על סיכונים ידועים.',
      '5. אחריות — המתנדבים אינם כוח ביטחון; כל אירוע חריג ידווח לגורמים המוסמכים.',
      '6. תוקף — ההסכם בתוקף ממועד חתימתו ועד להודעה בכתב של אחד הצדדים.',
      '',
      '(נוסח מלא ומחייב יופיע בהסכם העמותה, לאחר העלאתו.)',
    ]
    ctx.fillStyle = '#17212a'
    ctx.font = '400 24px "Rubik", sans-serif'
    let y = 510
    for (const line of body) {
      if (line) ctx.fillText(line, right, y)
      y += line ? 46 : 24
    }

    // Signature blocks
    y = 1290
    ctx.strokeStyle = '#8a97a5'
    ctx.lineWidth = 2
    for (const [label, x] of [
      ['חתימת בעל היישות', right],
      ['חתימת רכז העמותה', W / 2 - 20],
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(x - 400, y)
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.fillStyle = '#5b6b7a'
      ctx.font = '400 22px "Rubik", sans-serif'
      ctx.fillText(label, x, y + 40)
      ctx.fillText('תאריך: ____________', x, y + 80)
    }

    // The diagonal stamp
    ctx.save()
    ctx.translate(W / 2, H / 2 + 60)
    ctx.rotate(-Math.PI / 7)
    ctx.globalAlpha = 0.13
    ctx.fillStyle = '#b4232c'
    ctx.textAlign = 'center'
    ctx.font = '700 150px "Frank Ruhl Libre", serif'
    ctx.fillText('דוגמה', 0, 0)
    ctx.restore()

    // Footer
    ctx.fillStyle = '#8a97a5'
    ctx.font = '400 20px "Rubik", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('לא ינום · מסמך דוגמה שנוצר אוטומטית · עמוד 1 מתוך 1', W / 2, H - 70)

    return canvas.toDataURL('image/jpeg', 0.9)
  })

  const bytes = Buffer.from(jpeg.split(',')[1], 'base64')
  const pdf = jpegPagesToPdf([{ jpeg: new Uint8Array(bytes), width: 1191, height: 1684 }], {
    title: 'הסכם לדוגמה — לא ינום',
    author: 'לא ינום',
  })
  await Bun.write(OUT, pdf)
  console.log(`  wrote ${OUT}: ${pdf.size} bytes, 1 page`)
} finally {
  await browser.close()
}
