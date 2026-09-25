import type { ActivityReport, ActivityFarmSnapshot } from '@core/index'
import type { FarmStatus } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AO3.5 (2026-09-24) — LE TEXTE À COLLER DANS WHATSAPP.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « un TEXTE prêt à coller dans WhatsApp, en hébreu, correctement mis en
 *     forme pour ce support — c'est la voie qu'il utilise réellement. »
 *
 * ★★ L'HÉBREU EST ÉCRIT EN DUR ICI, ET C'EST UN CHOIX, PAS UN OUBLI DE i18n.
 *    Ce message ne s'adresse pas à l'utilisateur de l'app : il s'adresse à
 *    SON INTERLOCUTEUR, en Israël. Passer par `t()` voudrait dire qu'un PO
 *    qui a mis son iPad en français enverrait un rapport en français à
 *    l'association. La langue de la SORTIE est une propriété du destinataire,
 *    pas de l'appareil.
 *
 * ★★ « MIS EN FORME POUR CE SUPPORT » A UN SENS PRÉCIS, ET CE N'EST PAS
 *    « joli ». WhatsApp ne connaît QUE `*gras*`, `_italique_`, `~barré~` et
 *    les blocs de code ; il n'a ni tableau, ni tabulation, ni liste
 *    numérotée. Une colonne alignée avec des espaces se disloque dès que le
 *    destinataire change la taille du texte — et en RTL elle se disloque tout
 *    de suite. D'où : un fait par ligne, une puce, deux-points, la valeur.
 *
 * ⚠️ ZÉRO ARITHMÉTIQUE ICI. Comme `ui/report/draw.ts` depuis PO POINT 7c :
 *    ce fichier place des nombres que `core/activity.ts` a calculés, il n'en
 *    fabrique aucun. `bun run aopass` relit ce fichier et échoue sur un `+`,
 *    un `-` ou un `*` entre deux champs du rapport — parce qu'un message qui
 *    additionne ses propres lignes est un message qui peut contredire l'écran
 *    d'où il sort.
 *
 * ⚠️ ET LE TEXTE EST CONSERVÉ TEL QUEL (AO3.6). Ce que le PO a envoyé le 3 du
 *    mois ne se recalcule pas : `ActivityReportRecord.body` porte cette
 *    chaîne, au caractère près.
 */

const HE_STATUS: Record<FarmStatus, string> = {
  incoming_request: 'בקשה נכנסת',
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

/** `1234` → `1,234`. Un seul endroit, pour que tout le message compte pareil. */
const n = (v: number): string => v.toLocaleString('he-IL')

/**
 * Un écart SIGNÉ : « +10 », « ‎-2 », « 0 ». Le signe EST l'information.
 *
 * ⚠️ ENCADRÉ PAR DEUX MARQUES LTR (U+200E), ET CE N'EST PAS DE LA COQUETTERIE.
 *    Le « + » et le « - » sont des caractères NEUTRES au sens de l'algorithme
 *    bidi : dans une ligne hébraïque, ils prennent la direction du paragraphe
 *    et « +10 » s'affiche « 10+ » — sur WhatsApp comme ailleurs. La marque
 *    force un îlot LTR autour du nombre. Elle est invisible, elle ne compte
 *    pas comme un caractère affiché, et U+200E est reconnu par tout ce qui
 *    sait afficher de l'hébreu depuis vingt ans.
 */
const LRM = '\u200E'
const signed = (v: number): string => `${LRM}${v > 0 ? `+${n(v)}` : n(v)}${LRM}`

/** `2026-09-24` → `24.09.2026`. La forme que les Israéliens écrivent. */
export function heDay(key: string): string {
  const [y, m, d] = key.split('-')
  return `${d}.${m}.${y}`
}

function heDateTime(iso: string): string {
  const t = new Date(iso)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${pad(t.getDate())}.${pad(t.getMonth() + 1)}.${t.getFullYear()} ${pad(t.getHours())}:${pad(t.getMinutes())}`
}

function periodLine(report: ActivityReport): string {
  const { from, to } = report.period
  return from === to ? heDay(from) : `${heDay(from)} – ${heDay(to)}`
}

/**
 * ★★ AO3.4 — « PAS BESOIN D'EN FAIRE DES SALADES, MAIS IL FAUT QUE LES
 *    CHIFFRES SOIENT BIEN EXPOSÉS. »
 *
 * Les phrases sont là pour dire ce qu'un nombre NE DIT PAS tout seul : que
 * « 7 נחתם » n'est pas « 7 dossiers complets » (AK5), et que le pondéré n'est
 * pas la somme des dounams. Trois phrases au maximum, jamais un paragraphe.
 */
function sentences(report: ActivityReport): string[] {
  const out: string[] = []
  const t = report.totals
  if (t.signed > 0) {
    out.push(
      t.signedAwaitingDocuments > 0
        ? `מתוך ${n(t.signed)} שנחתמו, ${n(t.signedWithDocuments)} עם מסמכי זכות בקרקע ו־${n(t.signedAwaitingDocuments)} עדיין ממתינות להם — חתימה בלי מסמכים היא חצי הדרך.`
        : `כל ${n(t.signed)} החתומות כבר עם מסמכי זכות בקרקע.`,
    )
  }
  out.push(
    `הדונם המשוקלל סופר מעובד במלואו ומרעה ב־2% — לכן ${n(t.weightedDunams)} ולא סכום השטחים.`,
  )
  if (t.offCount > 0) {
    out.push(
      `${n(t.offCount)} יישויות נמצאות ברשימות אך מחוץ למניין ולמדד היעד, עם הסיבה לצידן.`,
    )
  }
  if (report.delta === null) {
    out.push('זהו הדוח הראשון — אין עדיין דוח קודם להשוואה.')
  }
  return out
}

export function activityReportText(report: ActivityReport): string {
  const t = report.totals
  const lines: string[] = []
  const push = (...l: string[]) => lines.push(...l)

  push(`*דוח פעילות — לא ינום*`, `📅 ${periodLine(report)}`, `_הופק: ${heDateTime(report.generatedAt)}_`, '')

  push('*המספרים*')
  push(`• יישויות במניין: ${n(t.farms)}`)
  push(`• דונם מעובד: ${n(t.cultivatedDunams)}`)
  push(`• דונם מרעה: ${n(t.grazingDunams)}`)
  push(`• דונם משוקלל: ${n(t.weightedDunams)} מתוך ${n(t.targetWeighted)} — ${n(t.targetPercent)}% מהיעד`)
  push(`• נחתמו: ${n(t.signed)} · עם מסמכים: ${n(t.signedWithDocuments)} · ממתינות למסמכים: ${n(t.signedAwaitingDocuments)}`)
  push(`• אנשי קשר זמינים: ${n(t.contacts)}`)
  push('')

  /* ★★ AO3.3 — LA SECTION QUE SON INTERLOCUTEUR ATTEND, ET ELLE VIENT AVANT
     le détail de la période : « pas un état, une évolution ». */
  if (report.delta && report.previous) {
    const d = report.delta
    push(`*מה זז מאז הדוח הקודם (${heDay(report.previous.period.to)})*`)
    push(`• יישויות: ${signed(d.farms)}`)
    push(`• דונם מעובד: ${signed(d.cultivatedDunams)} · מרעה: ${signed(d.grazingDunams)}`)
    /**
     * ⚠️ PAS DE PARENTHÈSES AUTOUR D'UN MÉLANGE CHIFFRES/HÉBREU. Vu sur les
     *    captures : « +7 750 (+8 נק׳ אחוז) » s'affichait
     *    « +7,750 (+8) נק׳ אחוז) » — une parenthèse est MIROITÉE par
     *    l'algorithme bidi et change de côté selon ce qu'elle entoure. Une
     *    puce médiane (·) n'a pas de miroir.
     */
    push(`• משוקלל: ${signed(d.weightedDunams)} · ${signed(d.targetPercentPoints)} נק׳ אחוז`)
    push(`• נחתמו: ${signed(d.signed)} · עם מסמכים: ${signed(d.signedWithDocuments)}`)
    push(`• אנשי קשר: ${signed(d.contacts)}`)
    if (report.created.length > 0) push(`• נוספו: ${report.created.join(', ')}`)
    for (const c of report.statusChanges) {
      push(`• ${c.farm}: ${HE_STATUS[c.from]} ← ${HE_STATUS[c.to]}`)
    }
    if (report.newContacts.length > 0) {
      push(`• אנשי קשר חדשים: ${report.newContacts.map((c) => `${c.farm} (${signed(c.added)})`).join(', ')}`)
    }
    push('')
  } else {
    push('*מה זז מאז הדוח הקודם*', '• זהו הדוח הראשון — אין בסיס להשוואה.', '')
  }

  push('*בתקופה*')
  push(`• ביקורים: ${n(report.visited.length)}`)
  for (const v of report.visited) push(`   – ${v.farm}${v.note ? ` — ${v.note}` : ''}`)
  push(`• חתימות: ${n(report.signedInPeriod.length)}`)
  for (const s of report.signedInPeriod) push(`   – ${s.farm} (${s.by})`)
  push(`• מסמכים שהתקבלו: ${n(report.documentsReceived.length)}`)
  for (const d of report.documentsReceived) {
    push(`   – ${d.farm}: ${HE_DOCUMENT[d.document] ?? d.document}`)
  }
  push('')

  if (report.documentsAwaited.length > 0) {
    push(`*מסמכים שעדיין מחכים* (${n(report.documentsAwaited.length)})`)
    for (const d of report.documentsAwaited) {
      push(`• ${d.farm}: ${d.missing.map((m) => HE_DOCUMENT[m] ?? m).join(' · ')}`)
    }
    push('')
  }

  /* ★ AO3.2 — les commentaires du PO, MOT POUR MOT. */
  if (report.comments.length > 0) {
    push('*הערות מהשטח*')
    for (const c of report.comments) push(`• ${c.farm}: ${c.text}`)
    push('')
  }

  /* ★ AO3.7 — dans le rapport, avec leur raison, hors des compteurs. */
  if (report.offCount.length > 0) {
    push('*מחוץ למניין (נשארות ברשימות)*')
    for (const o of report.offCount) {
      push(`• ${o.farm} — ${HE_STATUS[o.status]}${o.note ? `: ${o.note}` : ''}`)
    }
    push('')
  }

  for (const s of sentences(report)) push(s)

  /* Une ligne vide finale ferait un blanc dans la bulle WhatsApp. */
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/** Le nom du fichier PDF, et l'objet du message. */
export function activityReportTitle(report: ActivityReport): string {
  return `דוח פעילות ${periodLine(report)}`
}

/** Les exploitations du rapport, triées comme le PDF les imprime. */
export function orderedFarms(report: ActivityReport): ActivityFarmSnapshot[] {
  return [...report.farms].sort((a, b) => b.weighted - a.weighted || a.name.localeCompare(b.name, 'he'))
}
