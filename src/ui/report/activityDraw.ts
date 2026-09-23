import type { ActivityReport, FarmStatus } from '@core/index'

import { PAGE, newPageCanvas } from './pdf'
import { heDay } from './activityText'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AO3.5 (2026-09-24) — LE MÊME RAPPORT, EN PDF, « POUR UN ENVOI PLUS
 *    FORMEL ».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ CE N'EST PAS `draw.ts`, ET LES DEUX NE DOIVENT PAS FUSIONNER. `draw.ts`
 *   dessine la page d'ÉTAT du programme (PO POINT 7) : de gros chiffres qu'un
 *   directeur lit en trente secondes. Celle-ci dessine une page d'ACTIVITÉ :
 *   des sections, des listes, et des noms d'exploitations — ce qui demande un
 *   saut de page automatique, que la page d'état n'a jamais eu.
 *
 * ★ LE PAPIER EST BLANC, TOUJOURS, comme dans `draw.ts` : c'est un document
 *   imprimé et transféré, le thème sombre n'y a rien à faire.
 *
 * ⚠️ ZÉRO ARITHMÉTIQUE, comme partout dans `ui/report/` : ce fichier place ce
 *    que `core/activity.ts` a calculé. `bun run aopass` le relit.
 */

const S = PAGE.scale
const M = 46 * S
const RIGHT = PAGE.width - M
const BOTTOM = PAGE.height - 44 * S

const FONT = (size: number, weight = 400) =>
  `${weight} ${size * S}px Rubik, "Frank Ruhl Libre", system-ui, sans-serif`
const BRAND = (size: number, weight = 700) =>
  `${weight} ${size * S}px "Frank Ruhl Libre", Rubik, serif`

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
    warn: rgb('--status-warn-ink', 'rgb(180 83 9)'),
  }
}

const HE_STATUS: Record<FarmStatus, string> = {
  to_contact: 'טרם נוצר קשר',
  contacted: 'נוצר קשר',
  visited: 'בוקרה',
  verbal_ok: 'מוכן לחתימה',
  signed: 'נחתם',
  active: 'פעילה',
  declined: 'סירבה',
  not_relevant_now: 'לא רלוונטי כרגע',
  on_hold: 'בהמתנה',
}

const HE_DOCUMENT: Record<string, string> = {
  crops: 'אישור זכות בקרקע — גידולים',
  grazing: 'אישור זכות בקרקע — מרעה',
}

const n = (v: number): string => v.toLocaleString('he-IL')
/**
 * ⚠️ MARQUE LTR AUTOUR DU SIGNE, comme dans `activityText.ts`. `row()` dessine
 *    déjà ses valeurs en LTR, mais une puce (`bullet`) est une phrase hébraïque
 *    dans laquelle « +1 » redeviendrait « 1+ ».
 */
const LRM = '\u200E'
const sign = (v: number): string => `${LRM}${v > 0 ? `+${n(v)}` : n(v)}${LRM}`

/**
 * Le carnet de pages : il ouvre une page, écrit des lignes, et en ouvre une
 * autre quand celle-ci est pleine. Toute la mise en page passe par lui, ce
 * qui rend le saut de page impossible à oublier dans une section neuve.
 */
class Sheet {
  readonly canvases: HTMLCanvasElement[] = []
  private ctx!: CanvasRenderingContext2D
  private y = 0
  readonly c = palette()

  constructor(private readonly title: string, private readonly subtitle: string) {
    this.newPage()
  }

  private newPage(): void {
    const canvas = newPageCanvas()
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.canvases.push(canvas)
    this.ctx = ctx
    ctx.direction = 'rtl'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    this.y = M + 26 * S
    ctx.textAlign = 'right'
    ctx.fillStyle = this.c.ink
    ctx.font = BRAND(26)
    ctx.fillText('לא ינום', RIGHT, this.y)
    ctx.font = FONT(11)
    ctx.fillStyle = this.c.muted
    ctx.fillText(this.title, RIGHT, this.y + 19 * S)
    ctx.textAlign = 'left'
    ctx.font = FONT(9.5)
    ctx.fillText(this.subtitle, M, this.y)
    ctx.textAlign = 'right'
    this.y += 40 * S
    this.rule()
    this.y += 20 * S
  }

  private room(height: number): void {
    if (this.y + height > BOTTOM) this.newPage()
  }

  rule(): void {
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = this.c.line
    ctx.lineWidth = 1 * S
    ctx.beginPath()
    ctx.moveTo(M, this.y)
    ctx.lineTo(RIGHT, this.y)
    ctx.stroke()
    ctx.restore()
  }

  /** Un titre de section. Il ne reste JAMAIS seul en bas d'une page. */
  heading(text: string): void {
    this.room(58 * S)
    this.y += 6 * S
    this.ctx.font = BRAND(14)
    this.ctx.fillStyle = this.c.accent
    this.ctx.textAlign = 'right'
    this.ctx.fillText(text, RIGHT, this.y)
    this.y += 8 * S
    this.rule()
    this.y += 18 * S
  }

  /**
   * Un fait : l'intitulé à droite, la valeur à gauche.
   *
   * ⚠️ LA VALEUR EST DESSINÉE EN LTR, ET C'EST UNE CORRECTION DE BIDI VUE SUR
   *    LE PDF, PAS UNE PRÉCAUTION. Dans un contexte RTL, le navigateur réordonne
   *    « 5 970 / 100 000 (6 %) » en « (6 %) 100 000 / 5 970 » et « +10 » en
   *    « 10+ » : la barre oblique, la parenthèse et le signe sont des caractères
   *    NEUTRES, et un caractère neutre prend la direction du paragraphe. Les
   *    chiffres arabes, eux, sont toujours LTR — d'où un composé illisible.
   *    Le libellé reste RTL : c'est de l'hébreu.
   */
  row(label: string, value: string): void {
    this.room(20 * S)
    this.ctx.font = FONT(10.5)
    this.ctx.fillStyle = this.c.ink
    this.ctx.direction = 'rtl'
    this.ctx.textAlign = 'right'
    this.ctx.fillText(label, RIGHT, this.y)
    this.ctx.fillStyle = this.c.muted
    this.ctx.direction = 'ltr'
    this.ctx.textAlign = 'left'
    this.ctx.fillText(value, M, this.y)
    this.ctx.direction = 'rtl'
    this.ctx.textAlign = 'right'
    this.y += 17 * S
  }

  /**
   * Une ligne de liste, coupée au bord de la page.
   *
   * ⚠️ LA COUPE EST SUR LA LARGEUR MESURÉE (`measureText`) ET NON SUR UN
   *    NOMBRE DE CARACTÈRES : un nom hébreu et un nom latin n'ont pas la même
   *    largeur par lettre, et compter les lettres fait déborder l'un ou
   *    tronquer l'autre trop tôt.
   */
  bullet(text: string, muted = false): void {
    this.room(18 * S)
    const ctx = this.ctx
    ctx.font = FONT(10)
    ctx.fillStyle = muted ? this.c.muted : this.c.ink
    ctx.textAlign = 'right'
    const max = RIGHT - M - 14 * S
    let body = text
    if (ctx.measureText(body).width > max) {
      while (body.length > 1 && ctx.measureText(`${body}…`).width > max) {
        body = body.slice(0, -1)
      }
      body = `${body}…`
    }
    ctx.fillText(`•  ${body}`, RIGHT, this.y)
    this.y += 15.5 * S
  }

  paragraph(text: string): void {
    this.room(22 * S)
    const ctx = this.ctx
    ctx.font = FONT(10)
    ctx.fillStyle = this.c.muted
    ctx.textAlign = 'right'
    const max = RIGHT - M
    const words = text.split(' ')
    let current = ''
    for (const w of words) {
      const next = current === '' ? w : `${current} ${w}`
      if (ctx.measureText(next).width > max && current !== '') {
        ctx.fillText(current, RIGHT, this.y)
        this.y += 15 * S
        this.room(18 * S)
        current = w
      } else current = next
    }
    if (current !== '') {
      ctx.fillText(current, RIGHT, this.y)
      this.y += 15 * S
    }
  }

  gap(units = 10): void {
    this.y += units * S
  }

  /** Le pied de chaque page : « 2 / 3 ». Posé à la toute fin. */
  stampPages(): void {
    this.canvases.forEach((canvas, i) => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      /* ⚠️ LTR : en RTL, « 1 / 2 » se dessinait « 2 / 1 » (la barre oblique est
         un caractère neutre). Vu sur le PDF, pas déduit. */
      ctx.direction = 'ltr'
      ctx.font = FONT(9)
      ctx.fillStyle = this.c.muted
      ctx.textAlign = 'center'
      ctx.fillText(`${i + 1} / ${this.canvases.length}`, PAGE.width / 2, PAGE.height - 24 * S)
    })
  }
}

function periodLabel(report: ActivityReport): string {
  const { from, to } = report.period
  return from === to ? heDay(from) : `${heDay(from)} – ${heDay(to)}`
}

export function drawActivityReport(report: ActivityReport): HTMLCanvasElement[] {
  const t = report.totals
  const sheet = new Sheet(`דוח פעילות · ${periodLabel(report)}`, heDay(report.period.to))

  sheet.heading('המספרים')
  sheet.row('יישויות במניין', n(t.farms))
  sheet.row('דונם מעובד', n(t.cultivatedDunams))
  sheet.row('דונם מרעה', n(t.grazingDunams))
  sheet.row('דונם משוקלל', `${n(t.weightedDunams)} / ${n(t.targetWeighted)}  (${n(t.targetPercent)}%)`)
  sheet.row('נחתמו', n(t.signed))
  sheet.row('מתוכן עם מסמכי זכות בקרקע', n(t.signedWithDocuments))
  sheet.row('מתוכן ממתינות למסמכים', n(t.signedAwaitingDocuments))
  sheet.row('אנשי קשר זמינים', n(t.contacts))
  sheet.gap()
  /* AO3.4 — les phrases qui expliquent les chiffres, jamais un paragraphe. */
  sheet.paragraph(
    `הדונם המשוקלל סופר שטח מעובד במלואו ושטח מרעה ב־2%, ולכן אינו סכום שני השטחים. חתימה ללא מסמכי זכות בקרקע היא חצי הדרך — הפירוט למטה.`,
  )

  /* ★★ AO3.3 — l'évolution, avant le détail. */
  sheet.heading('מה זז מאז הדוח הקודם')
  if (report.delta && report.previous) {
    const d = report.delta
    sheet.row(`ביחס לדוח מ־${heDay(report.previous.period.to)}`, '')
    sheet.row('יישויות', sign(d.farms))
    sheet.row('דונם מעובד', sign(d.cultivatedDunams))
    sheet.row('דונם מרעה', sign(d.grazingDunams))
    sheet.row('דונם משוקלל', `${sign(d.weightedDunams)}  (${sign(d.targetPercentPoints)} נק׳ אחוז)`)
    sheet.row('נחתמו', sign(d.signed))
    sheet.row('אנשי קשר', sign(d.contacts))
    sheet.gap(6)
    for (const name of report.created) sheet.bullet(`נוספה: ${name}`)
    for (const c of report.statusChanges) {
      sheet.bullet(`${c.farm}: ${HE_STATUS[c.from]} ← ${HE_STATUS[c.to]}`)
    }
    for (const c of report.newContacts) sheet.bullet(`${c.farm}: ${sign(c.added)} אנשי קשר`)
  } else {
    sheet.paragraph('זהו הדוח הראשון — אין עדיין דוח קודם להשוואה.')
  }

  sheet.heading('בתקופה')
  sheet.row('ביקורים', n(report.visited.length))
  for (const v of report.visited) sheet.bullet(`${v.farm}${v.note ? ` — ${v.note}` : ''}`, true)
  sheet.row('חתימות', n(report.signedInPeriod.length))
  for (const s of report.signedInPeriod) sheet.bullet(`${s.farm} (${s.by})`, true)
  sheet.row('מסמכים שהתקבלו', n(report.documentsReceived.length))
  for (const d of report.documentsReceived) {
    sheet.bullet(`${d.farm}: ${HE_DOCUMENT[d.document] ?? d.document}`, true)
  }

  if (report.documentsAwaited.length > 0) {
    sheet.heading('מסמכים שעדיין מחכים')
    for (const d of report.documentsAwaited) {
      sheet.bullet(`${d.farm}: ${d.missing.map((m) => HE_DOCUMENT[m] ?? m).join(' · ')}`)
    }
  }

  /* ★ AO3.2 — mot pour mot. */
  if (report.comments.length > 0) {
    sheet.heading('הערות מהשטח')
    for (const c of report.comments) sheet.bullet(`${c.farm}: ${c.text}`)
  }

  /* ★ AO3.7 — dans le rapport, avec leur raison, hors des compteurs. */
  if (report.offCount.length > 0) {
    sheet.heading('מחוץ למניין (נשארות ברשימות)')
    for (const o of report.offCount) {
      sheet.bullet(`${o.farm} — ${HE_STATUS[o.status]}${o.note ? `: ${o.note}` : ''}`)
    }
  }

  sheet.stampPages()
  return sheet.canvases
}
