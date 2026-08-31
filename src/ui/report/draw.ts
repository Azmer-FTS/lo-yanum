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
) {
  ctx.textAlign = 'right'
  ctx.fillStyle = colour
  ctx.font = FONT(big ? 38 : 27, 700)
  ctx.fillText(value, x, y)
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
    )
  }

  y += 68 * S
  line(ctx, y, c.line)

  // --- band 2: the entities ------------------------------------------------
  y += 82 * S
  const cols4 = [0, 1, 2, 3].map(
    (i) => right - (i * (PAGE.width - 2 * M)) / 4,
  )
  figure(ctx, cols4[0], y, he(report.entitiesTotal), t('report.entities'), c.ink)
  figure(ctx, cols4[1], y, he(report.farms), t('entityKind.farm'), c.ink)
  figure(ctx, cols4[2], y, he(report.moshavim), t('entityKind.moshav'), c.ink)
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
  )

  y += 96 * S
  figure(ctx, cols4[0], y, he(report.driversTotal), t('report.drivers'), c.ink,
    t('report.seats', { count: report.driverSeats }))
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
  )
  figure(ctx, cols4[2], y, he(report.guardsUpcoming), t('report.guardsUpcoming'), c.accent)
  figure(ctx, cols4[3], y, he(report.visitsUpcoming), t('report.visitsUpcoming'), c.ink)

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
