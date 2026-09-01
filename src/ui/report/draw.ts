import type { ProgrammeReport } from '@core/index'

import { PAGE, newPageCanvas } from './pdf'

/**
 * PO POINT 7a — THE ONE-PAGER, DRAWN.
 *
 * ★ THE BRIEF IS THE SPEC AND IT IS A SEVERE ONE: *"readable by a director in
 *   thirty seconds"*. That rules out a table. A director reading a page in
 *   thirty seconds reads NUMBERS — six or seven of them, large, each with one
 *   word under it — and everything else is context he will only look at if a
 *   number surprises him. So the page is three bands: the headline figures at
 *   the top in the biggest type on the sheet, the people and the nights in the
 *   middle, the detail (statuses, incidents by severity) at the foot in a size
 *   he can skip.
 *
 * ★ IT IS DRAWN, NOT LAID OUT. Canvas has no line breaking, no flexbox and no
 *   RTL beyond `direction`, which sounds like a handicap and is the reason the
 *   Hebrew comes out right: the browser shapes and bidi-orders every
 *   `fillText`, and every position on the page is a number in this file rather
 *   than a cascade somebody can accidentally change from a stylesheet.
 *
 * ★ AND EVERY MEASUREMENT IS IN PAGE UNITS × SCALE, so the same code produces
 *   a sharper file by changing one constant in `pdf.ts` and nothing here.
 */

const S = PAGE.scale
const M = 46 * S // page margin

/** The app's own palette, read off the live document so it cannot drift. */
function palette() {
  const cs = getComputedStyle(document.documentElement)
  const rgb = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim()
    return v ? `rgb(${v})` : fallback
  }
  return {
    ink: rgb('--content-primary', 'rgb(17 24 39)'),
    muted: rgb('--content-muted', 'rgb(107 114 128)'),
    accent: rgb('--accent-ink', 'rgb(30 122 79)'),
    line: rgb('--edge-subtle', 'rgb(229 231 235)'),
    good: rgb('--status-success-ink', 'rgb(21 128 61)'),
    warn: rgb('--status-warn-ink', 'rgb(180 83 9)'),
    danger: rgb('--status-danger-ink', 'rgb(185 28 28)'),
  }
}

const FONT = (size: number, weight = 400) =>
  `${weight} ${size * S}px Rubik, "Frank Ruhl Libre", system-ui, sans-serif`

const BRAND = (size: number, weight = 700) =>
  `${weight} ${size * S}px "Frank Ruhl Libre", Rubik, serif`

function line(ctx: CanvasRenderingContext2D, y: number, colour: string) {
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = 1 * S
  ctx.beginPath()
  ctx.moveTo(M, y)
  ctx.lineTo(PAGE.width - M, y)
  ctx.stroke()
  ctx.restore()
}

/**
 * N5 (2026-09-02) — THE ICONS, AS PATHS. The same 24-unit Lucide-style
 * strokes the screens use (`Icon.tsx`), here as SVG path data drawn through
 * `Path2D`, so a figure on the sheet carries the glyph a director already
 * saw next to it on the dashboard. Stroke only, never fill, one weight.
 */
const GLYPHS = {
  landPlot: ['m12 8 6-3-6-3v10', 'm8 11.99-5.5 3.14a1 1 0 0 0 0 1.74l8.5 4.86a2 2 0 0 0 2 0l8.5-4.86a1 1 0 0 0 0-1.74L16 12', 'm6.49 12.85 11.02 6.3', 'M17.51 12.85 6.5 19.15'],
  wheat: ['M2 22 16 8', 'M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z', 'M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z', 'M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z', 'M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z', 'M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z', 'M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z', 'M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z'],
  pawPrint: ['M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z', 'M11 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M18 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M20 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  farm: ['M3 10.5 12 4l9 6.5', 'M5 10v10h14V10', 'M9.5 20v-5h5v5'],
  home: ['m4 10.5 8-6.5 8 6.5', 'M6 9.8V20h12V9.8'],
  users: ['M3.5 20a5.5 5.5 0 0 1 11 0', 'M9 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M16 5.6a3.2 3.2 0 0 1 0 6.3M17.5 14.6a5.5 5.5 0 0 1 3 5.4'],
  car: ['M4 16v-3.2l1.8-4.3A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.8 1.5L20 12.8V16', 'M4 16h16v2.5h-3V16M7 18.5V16H4z', 'M5.5 12.5h13'],
  shield: ['M12 3c-2.6 1.6-5 2.3-7 2.4v7.2c0 4.4 2.9 6.8 7 8.4 4.1-1.6 7-4 7-8.4V5.4c-2-.1-4.4-.8-7-2.4z'],
  alert: ['M12 4.5 2.8 20h18.4z', 'M12 10v4.5M12 17.3v.2'],
  pin: ['M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
} as const

type Glyph = keyof typeof GLYPHS

/** A glyph in a soft rounded tile, its top-left at (x, y), `size` page units. */
function glyph(ctx: CanvasRenderingContext2D, name: Glyph, x: number, y: number, size: number, colour: string) {
  const px = size * S
  ctx.save()
  ctx.fillStyle = colour
  ctx.globalAlpha = 0.1
  const r = 6 * S
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + px, y, x + px, y + px, r)
  ctx.arcTo(x + px, y + px, x, y + px, r)
  ctx.arcTo(x, y + px, x, y, r)
  ctx.arcTo(x, y, x + px, y, r)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.translate(x + px * 0.2, y + px * 0.2)
  const k = (px * 0.6) / 24
  ctx.scale(k, k)
  ctx.strokeStyle = colour
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of GLYPHS[name]) ctx.stroke(new Path2D(d))
  ctx.restore()
}

/** One big figure with its label under it, right-aligned inside a column. */
function figure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  label: string,
  colour: string,
  sub?: string,
  /** The three headline figures are the ones a director reads in five seconds. */
  big = false,
  icon?: Glyph,
) {
  ctx.textAlign = 'right'
  ctx.fillStyle = colour
  ctx.font = FONT(big ? 38 : 27, 700)
  ctx.fillText(value, x, y)
  if (icon) {
    // The glyph sits to the LEFT of the figure (this is an RTL sheet), vertically on its cap height.
    const size = big ? 24 : 18
    const w = ctx.measureText(value).width
    glyph(ctx, icon, x - w - (size + 8) * S, y - size * S * 0.95, size, colour)
  }
  ctx.fillStyle = '#111827'
  ctx.font = FONT(big ? 12.5 : 11, 600)
  ctx.fillText(label, x, y + (big ? 21 : 17) * S)
  if (sub) {
    ctx.fillStyle = '#6B7280'
    ctx.font = FONT(9)
    ctx.fillText(sub, x, y + (big ? 35 : 30) * S)
  }
}

const he = (n: number) => n.toLocaleString('he-IL')

/**
 * The whole sheet. Returns the canvases the PDF writer turns into pages —
 * one today, and the signature is already plural because the product owner
 * asked for "one to two pages".
 */
export function drawReport(
  report: ProgrammeReport,
  t: (key: string, options?: Record<string, unknown>) => string,
): HTMLCanvasElement[] {
  const canvas = newPageCanvas()
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  const c = palette()

  ctx.direction = 'rtl'
  ctx.textBaseline = 'alphabetic'

  // Paper. Always white: this is a document, not a screen, and it is printed
  // and forwarded. The dark theme has no business on it.
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const right = PAGE.width - M
  let y = M + 26 * S

  // --- identity ------------------------------------------------------------
  ctx.textAlign = 'right'
  ctx.fillStyle = c.ink
  ctx.font = BRAND(30)
  ctx.fillText(t('app.name'), right, y)

  ctx.font = BRAND(12.5, 400)
  ctx.fillStyle = c.muted
  // The verse, discreet — the product owner's own word for it. In the DISPLAY
  // face, because it is scripture and not a caption.
  ctx.fillText(t('app.verse'), right, y + 21 * S)

  ctx.textAlign = 'left'
  ctx.font = FONT(9.5)
  ctx.fillStyle = c.muted
  ctx.fillText(
    new Date(report.generatedAt).toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    M,
    y,
  )
  ctx.fillText(t('report.title'), M, y + 17 * S)

  y += 48 * S
  line(ctx, y, c.line)

  // --- band 1: the ground --------------------------------------------------
  y += 96 * S
  const cols3 = [right, right - (PAGE.width - 2 * M) / 3, M + (PAGE.width - 2 * M) / 3]

  figure(
    ctx,
    cols3[0],
    y,
    he(report.guardedDunams),
    t('dashboard.guardedDunams'),
    c.good,
    undefined,
    true,
    'landPlot',
  )
  figure(
    ctx,
    cols3[1],
    y,
    he(report.potentialDunams),
    t('dashboard.potentialDunams'),
    c.accent,
    undefined,
    true,
    'wheat',
  )
  // ★ POINT 6's RULE SURVIVES ONTO THE PAGE: no head count means the tile is
  //   NOT drawn, rather than drawn as a zero. A funder reads this sheet.
  if (report.guardedHeads !== null) {
    figure(
      ctx,
      cols3[2],
      y,
      he(report.guardedHeads),
      t('livestock.totalGuarded'),
      c.ink,
      undefined,
      true,
      'pawPrint',
    )
  }

  y += 68 * S
  line(ctx, y, c.line)

  // --- band 2: the entities ------------------------------------------------
  y += 82 * S
  const cols4 = [0, 1, 2, 3].map(
    (i) => right - (i * (PAGE.width - 2 * M)) / 4,
  )
  figure(ctx, cols4[0], y, he(report.entitiesTotal), t('report.entities'), c.ink, undefined, false, 'pin')
  figure(ctx, cols4[1], y, he(report.farms), t('entityKind.farm'), c.ink, undefined, false, 'farm')
  figure(ctx, cols4[2], y, he(report.moshavim), t('entityKind.moshav'), c.ink, undefined, false, 'home')
  figure(
    ctx,
    cols4[3],
    y,
    he(report.volunteersActive),
    t('report.activeVolunteers'),
    c.ink,
    t('report.smartphoneSplit', {
      smartphone: he(report.volunteersSmartphone),
      kosher: he(report.volunteersKosher),
    }),
    false,
    'users',
  )

  y += 96 * S
  figure(ctx, cols4[0], y, he(report.driversTotal), t('report.drivers'), c.ink,
    t('report.seats', { count: report.driverSeats }), false, 'car')
  figure(
    ctx,
    cols4[1],
    y,
    he(report.guardsCompletedTotal),
    t('report.guardsDone'),
    c.good,
    t('report.inWindow', {
      count: report.guardsCompletedWindow,
      days: report.windowDays,
    }),
    false,
    'shield',
  )
  figure(ctx, cols4[2], y, he(report.guardsUpcoming), t('report.guardsUpcoming'), c.accent, undefined, false, 'shield')
  figure(ctx, cols4[3], y, he(report.visitsUpcoming), t('report.visitsUpcoming'), c.ink, undefined, false, 'pin')

  y += 72 * S
  line(ctx, y, c.line)

  // --- band 3: the detail, small ------------------------------------------
  y += 52 * S
  ctx.textAlign = 'right'
  ctx.fillStyle = c.ink
  ctx.font = FONT(11, 700)
  ctx.fillText(t('report.byStatus'), right, y)

  y += 28 * S
  ctx.font = FONT(11)
  ctx.fillStyle = c.muted
  const statuses = report.byStatus
    .filter((s) => s.count > 0)
    .map((s) => `${t(`farmStatus.${s.status}`)} ${he(s.count)}`)
    .join('   ·   ')
  ctx.fillText(statuses || t('common.none'), right, y)

  y += 54 * S
  ctx.fillStyle = c.ink
  ctx.font = FONT(11, 700)
  ctx.fillText(t('report.incidents', { days: report.windowDays }), right, y)

  y += 28 * S
  ctx.font = FONT(11)
  const sev: Array<[keyof ProgrammeReport['incidentsWindow'], string]> = [
    ['urgent', c.danger],
    ['suspicious', c.warn],
    ['observation', c.muted],
  ]
  let x = right
  for (const [key, colour] of sev) {
    const text = `${t(`severity.${key}`)} ${he(report.incidentsWindow[key])}`
    ctx.fillStyle = colour
    ctx.fillText(text, x, y)
    x -= ctx.measureText(text).width + 22 * S
  }

  // --- foot ----------------------------------------------------------------
  const footY = PAGE.height - M
  line(ctx, footY - 18 * S, c.line)
  ctx.textAlign = 'right'
  ctx.font = FONT(8)
  ctx.fillStyle = c.muted
  ctx.fillText(t('app.verseRef'), right, footY)
  ctx.textAlign = 'left'
  ctx.fillText(
    t('report.generatedAt', {
      at: new Date(report.generatedAt).toLocaleString('he-IL'),
    }),
    M,
    footY,
  )

  return [canvas]
}
