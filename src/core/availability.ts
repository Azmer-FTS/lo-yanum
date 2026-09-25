/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AP3.6 (2026-09-25) — QUAND LE PO EST DISPONIBLE, EN CONSTANTES NOMMÉES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Règles de disponibilité, en CONSTANTES NOMMÉES :
 *     – indisponible le vendredi et le samedi ;
 *     – indisponible les jours de fête juive ;
 *     – disponible tout le reste, hors créneaux déjà pris dans son agenda. »
 *
 * ★★ TROIS RÈGLES, TROIS ORIGINES DIFFÉRENTES, ET C'EST CE QUI DÉCIDE DE LA
 *    RÉPARTITION ENTRE CE FICHIER ET LA BASE.
 *
 *    · Le vendredi et le samedi sont un CALENDRIER : `CLOSED_WEEKDAYS`.
 *    · Les fêtes sont un CALENDRIER AUSSI, mais l'hébraïque — lu par `Intl`,
 *      pas par une table de dates grégoriennes qui périmerait chaque automne.
 *    · « Déjà pris » est un FAIT, et un fait vit en base. La page publique le
 *      demande par `public_busy_intervals`, qui ne rend QUE des paires de
 *      dates : pas un titre, pas un nom de ferme, pas un identifiant. Une page
 *      anonyme n'a pas à savoir CHEZ QUI le PO est mardi à dix heures.
 *
 * ⚠️ TOUT EST À L'HEURE DE JÉRUSALEM, JAMAIS À CELLE DU NAVIGATEUR. Un
 *    agriculteur qui ouvre la page depuis un téléphone resté à l'heure d'un
 *    autre pays — ou un simulateur en UTC, ce qui est le cas de la moitié des
 *    portes de ce projet — verrait sinon « vendredi » tomber un jeudi soir et
 *    se verrait proposer un créneau de Chabbat. `Intl` sait convertir ; ce
 *    module ne fait que le lui demander systématiquement.
 *
 * PUR : `Date` et `Intl` sont de l'ECMAScript, pas du DOM.
 */

import { MIN_EVENT_MINUTES } from './agenda'

/** Le fuseau du programme. Il n'y en a pas d'autre. */
export const PROGRAMME_TIME_ZONE = 'Asia/Jerusalem'

/**
 * Vendredi (5) et samedi (6), au sens de `Date#getDay`.
 *
 * ⚠️ VENDREDI ENTIER ET NON « À PARTIR DE MIDI ». Le brief dit « indisponible
 *    le vendredi », et un coordinateur qui prépare Chabbat ne reçoit pas un
 *    agriculteur à neuf heures du matin. Raccourcir la règle serait l'inventer.
 */
export const CLOSED_WEEKDAYS: readonly number[] = [5, 6]

/**
 * ★★ LES JOURS DE FÊTE, EN DATES HÉBRAÏQUES ET NON GRÉGORIENNES.
 *
 * ⚠️ UNE TABLE DE DATES GRÉGORIENNES SERAIT FAUSSE L'ANNÉE PROCHAINE, et
 *    personne ne s'en apercevrait avant qu'un agriculteur ait pris rendez-vous
 *    à Kippour. Le couple (mois hébraïque, jour du mois) est STABLE : il ne
 *    change jamais, et `Intl` fait la conversion, y compris les années
 *    embolismiques où Adar devient Adar I et Adar II.
 *
 * ⚠️ USAGE D'ISRAËL : UN SEUL JOUR DE fête. Pas de second jour de diaspora —
 *    le programme est en Israël et le PO y vit.
 *
 * ★ CE QUI EST DEDANS : les jours où le travail est interdit. Rosh Hashana
 *   (1–2 Tishri), Kippour (10 Tishri), le premier jour de Souccot (15 Tishri),
 *   Chemini Atseret (22 Tishri), le premier et le septième jour de Pessah
 *   (15 et 21 Nissan), Chavouot (6 Sivan).
 *
 * ★ CE QUI N'EST PAS DEDANS, ET C'EST UNE DÉCISION À REVOIR AVEC LE PO : les
 *   jours intermédiaires (חול המועד), Pourim, Yom HaAtsmaout, le 9 Av. Ce sont
 *   des jours ouvrables pour la plupart des exploitations ; les fermer d'office
 *   retirerait dix créneaux par an à un agriculteur qui, lui, travaille. Le PO
 *   peut toujours déplacer ou refuser un rendez-vous depuis son agenda — ce
 *   que cette liste ne peut pas faire, c'est se réparer toute seule.
 */
export interface HebrewDay {
  /** Le mois tel que `Intl` l'écrit en anglais : `Tishri`, `Nisan`, `Sivan`… */
  month: string
  day: number
  /** Ce qu'on affiche si jamais on explique pourquoi le jour est fermé. */
  label: string
}

export const JEWISH_HOLIDAYS: readonly HebrewDay[] = [
  { month: 'Tishri', day: 1, label: 'ראש השנה' },
  { month: 'Tishri', day: 2, label: 'ראש השנה' },
  { month: 'Tishri', day: 10, label: 'יום כיפור' },
  { month: 'Tishri', day: 15, label: 'סוכות' },
  { month: 'Tishri', day: 22, label: 'שמיני עצרת' },
  { month: 'Nisan', day: 15, label: 'פסח' },
  { month: 'Nisan', day: 21, label: 'שביעי של פסח' },
  { month: 'Sivan', day: 6, label: 'שבועות' },
]

/** Un rendez-vous dure une heure et commence à l'heure pile. */
export const APPOINTMENT_SLOT_MINUTES = 60

/** La journée de rendez-vous, en heure de Jérusalem. 09:00 → 17:00. */
export const APPOINTMENT_DAY_START_HOUR = 9
export const APPOINTMENT_DAY_END_HOUR = 17

/**
 * Le premier créneau proposable est à 24 h. Un agriculteur qui demande de
 * l'aide ce matin ne doit pas pouvoir poser un rendez-vous cet après-midi dans
 * l'agenda de quelqu'un qui n'a pas encore lu sa demande.
 */
export const APPOINTMENT_LEAD_HOURS = 24

/** Jusqu'où on propose. Au-delà, l'agenda du PO n'a plus de sens. */
export const APPOINTMENT_HORIZON_DAYS = 30

/**
 * Ce qu'occupe une entrée d'agenda sans fin propre (une visite est un POINT
 * dans `getAgendaEvents`). La même valeur que le calendrier emploie pour
 * dessiner un bloc — importée, pas recopiée.
 */
export const BUSY_MIN_MINUTES = MIN_EVENT_MINUTES

const MINUTE_MS = 60_000

// ---------------------------------------------------------------------------
// L'heure de Jérusalem
// ---------------------------------------------------------------------------

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PROGRAMME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const hebrewFormatter = new Intl.DateTimeFormat('en-u-ca-hebrew', {
  timeZone: PROGRAMME_TIME_ZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

function readParts(
  formatter: Intl.DateTimeFormat,
  at: Date,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of formatter.formatToParts(at)) {
    if (p.type !== 'literal') out[p.type] = p.value
  }
  return out
}

/**
 * De combien de minutes Jérusalem est en avance sur UTC à cet instant.
 * Positif en hiver (+120) comme en été (+180) ; calculé et jamais supposé,
 * parce que la date de bascule change chaque année.
 */
export function jerusalemOffsetMinutes(at: Date): number {
  const p = readParts(partsFormatter, at)
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    /* `en-GB` rend minuit « 24 » et non « 00 » sur certains moteurs. */
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  )
  return Math.round((asUtc - at.getTime()) / MINUTE_MS)
}

/** `2026-09-28`, la date du jour À JÉRUSALEM quel que soit le fuseau du lecteur. */
export function jerusalemDayKey(at: Date): string {
  const p = readParts(partsFormatter, at)
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * L'instant exact d'une heure de mur à Jérusalem.
 *
 * ⚠️ DEUX PASSES, ET LA SECONDE N'EST PAS UNE PRÉCAUTION DE STYLE. Le décalage
 *    dépend de l'instant qu'on cherche à construire, donc la première estimation
 *    peut tomber du mauvais côté d'une bascule d'heure d'été. On recalcule le
 *    décalage AU POINT TROUVÉ et on corrige : après quoi la valeur est stable,
 *    parce que les bascules ont lieu la nuit et jamais dans la plage 09–17.
 */
export function jerusalemInstant(dayKey: string, hour: number, minute = 0): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  const naive = Date.UTC(y, m - 1, d, hour, minute, 0)
  const first = new Date(naive - jerusalemOffsetMinutes(new Date(naive)) * MINUTE_MS)
  return new Date(naive - jerusalemOffsetMinutes(first) * MINUTE_MS)
}

/** Le jour de la semaine À JÉRUSALEM : 0 dimanche … 6 samedi. */
export function jerusalemWeekday(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
}

// ---------------------------------------------------------------------------
// Les trois règles
// ---------------------------------------------------------------------------

/** Le jour hébraïque correspondant, tel que `Intl` le nomme. */
export function hebrewDayOf(dayKey: string): { month: string; day: number } {
  /* Midi : la date hébraïque commence au coucher du soleil, donc un instant
     pris à minuit désignerait le jour PRÉCÉDENT ou le suivant selon le moteur.
     À midi, il n'y a pas d'ambiguïté — et les rendez-vous sont diurnes. */
  const p = readParts(hebrewFormatter, jerusalemInstant(dayKey, 12))
  return { month: p.month, day: Number(p.day) }
}

/** Le nom de la fête si ce jour en est une, sinon `null`. */
export function holidayOn(dayKey: string): string | null {
  const heb = hebrewDayOf(dayKey)
  const hit = JEWISH_HOLIDAYS.find(
    (h) => h.day === heb.day && sameHebrewMonth(h.month, heb.month),
  )
  return hit ? hit.label : null
}

/**
 * ⚠️ `Adar` CONTRE `Adar I` / `Adar II`, ET AUCUNE FÊTE DE LA LISTE N'EST EN
 *    ADAR — mais la comparaison est écrite pour l'être : le jour où quelqu'un
 *    ajoutera Pourim, une égalité de chaînes nue le ferait tomber une année sur
 *    trois seulement. `Nisan` et `Tishri`, eux, sont exacts.
 */
function sameHebrewMonth(wanted: string, actual: string): boolean {
  if (wanted === actual) return true
  return wanted === 'Adar' && (actual === 'Adar I' || actual === 'Adar II')
}

/** Pourquoi ce jour est fermé, ou `null` s'il est ouvert. */
export function closedReason(dayKey: string): 'weekend' | 'holiday' | null {
  if (CLOSED_WEEKDAYS.includes(jerusalemWeekday(dayKey))) return 'weekend'
  if (holidayOn(dayKey) !== null) return 'holiday'
  return null
}

export function isAvailableDay(dayKey: string): boolean {
  return closedReason(dayKey) === null
}

// ---------------------------------------------------------------------------
// Les créneaux
// ---------------------------------------------------------------------------

/** Ce que la base rend : des paires de dates, et rien d'autre. */
export interface BusyInterval {
  /** ISO. */
  startAt: string
  /** ISO. Égal à `startAt` pour une entrée ponctuelle. */
  endAt: string
}

export interface Slot {
  /** ISO du début. */
  startAt: string
  /** ISO de la fin. */
  endAt: string
  /** `2026-09-28`, pour grouper par jour. */
  dayKey: string
  /** `10:00`, à l'heure de Jérusalem. */
  label: string
}

/** Le `2026-09-28` du jour `offset` après celui de `at`, à Jérusalem. */
export function dayKeyAfter(at: Date, offset: number): string {
  const [y, m, d] = jerusalemDayKey(at).split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + offset, 12))
  const p = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
  return p
}

/**
 * ★★ LES CRÉNEAUX LIBRES, ET UN CRÉNEAU N'EST LIBRE QUE S'IL NE CHEVAUCHE RIEN.
 *
 * ⚠️ « NE CHEVAUCHE RIEN » ET NON « NE COMMENCE PAS PENDANT » : une garde de
 *    21:00 à 05:00 ne commence dans aucun créneau de la journée et les occupe
 *    pourtant tous. Le test est donc `début < finOccupée && finCréneau > début`,
 *    le seul qui soit vrai des deux côtés.
 *
 * ⚠️ UNE ENTRÉE PONCTUELLE (une visite) OCCUPE `BUSY_MIN_MINUTES`, la même
 *    valeur que le calendrier emploie pour la dessiner. Sans cela un rendez-vous
 *    se poserait exactement sur une visite déjà prévue, et l'agenda du PO
 *    montrerait deux blocs superposés à la même minute.
 */
export function freeSlots(
  busy: readonly BusyInterval[],
  from: Date,
  options: { days?: number; leadHours?: number } = {},
): Slot[] {
  const days = options.days ?? APPOINTMENT_HORIZON_DAYS
  const leadHours = options.leadHours ?? APPOINTMENT_LEAD_HOURS
  const notBefore = from.getTime() + leadHours * 60 * MINUTE_MS

  const blocks = busy.map((b) => {
    const start = new Date(b.startAt).getTime()
    const rawEnd = new Date(b.endAt).getTime()
    const end = Math.max(rawEnd, start + BUSY_MIN_MINUTES * MINUTE_MS)
    return { start, end }
  })

  const out: Slot[] = []
  for (let offset = 0; offset <= days; offset += 1) {
    const dayKey = dayKeyAfter(from, offset)
    if (!isAvailableDay(dayKey)) continue
    for (
      let hour = APPOINTMENT_DAY_START_HOUR;
      hour + APPOINTMENT_SLOT_MINUTES / 60 <= APPOINTMENT_DAY_END_HOUR;
      hour += APPOINTMENT_SLOT_MINUTES / 60
    ) {
      const start = jerusalemInstant(dayKey, hour)
      const end = new Date(start.getTime() + APPOINTMENT_SLOT_MINUTES * MINUTE_MS)
      if (start.getTime() < notBefore) continue
      const taken = blocks.some(
        (b) => start.getTime() < b.end && end.getTime() > b.start,
      )
      if (taken) continue
      out.push({
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        dayKey,
        label: `${String(hour).padStart(2, '0')}:00`,
      })
    }
  }
  return out
}

/** Les jours qui portent au moins un créneau, dans l'ordre. */
export function slotsByDay(slots: readonly Slot[]): { dayKey: string; slots: Slot[] }[] {
  const byDay = new Map<string, Slot[]>()
  for (const s of slots) {
    const list = byDay.get(s.dayKey)
    if (list) list.push(s)
    else byDay.set(s.dayKey, [s])
  }
  return [...byDay.entries()].map(([dayKey, list]) => ({ dayKey, slots: list }))
}
