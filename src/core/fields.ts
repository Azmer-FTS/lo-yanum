import type { FarmType } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AA2 · AA3 (2026-09-07) — THE FIELD LISTS AND THE WEIGHTING, IN ONE FILE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The product owner's instruction is the whole design brief for this file:
 *
 *   « Ces listes sont définies dans UN SEUL fichier de configuration, réutilisé
 *     par le formulaire, l'import et l'export. Le PO ajoutera des valeurs. »
 *
 * ★ SO AN OPTION IS A ROW, AND ADDING ONE IS ADDING A ROW. The form's picker,
 *   the importer's dictionary and the exporter's label all read the same
 *   array; there is no second place where a value has to be repeated, and no
 *   `switch` anywhere that would have to grow a case. G10 learned this on the
 *   import templates — a column declared in three places is a column that will
 *   be forgotten in one of them — and this is the same lesson applied to the
 *   VALUES rather than to the columns.
 *
 * ★ AND THE MEANING TRAVELS WITH THE VALUE, NOT BESIDE IT. `establishesRight`
 *   is a property of the agreement kind (AA2bis), so the day the product owner
 *   adds « הסכם הרשאה עונתי » he answers the question that matters — does this
 *   paper prove the signatory holds the land — in the same line where he names
 *   it. A separate list of "the weak ones" kept somewhere else is a list that
 *   goes stale the first time somebody adds a row here and not there.
 *
 * ⚠️ WHAT IS STORED IS THE `id`, NOT THE LABEL. The Hebrew is what the
 *    coordinator reads and what the association's workbook contains; the id is
 *    what survives a re-wording. Both directions are in `readOption` /
 *    `optionLabel` below, and nothing else should map between them.
 *
 * PURE: no React, no DOM, no i18next — like everything under /src/core.
 */

export interface FieldOption {
  /** Stored on the record. Stable; never re-spelt. */
  id: string
  /** What the coordinator reads, and what the workbook carries. */
  label: string
  /**
   * Other spellings seen in the wild. Matched case- and space-insensitively as
   * a whole string after normalisation — NOT as a substring, because
   * « לא ידוע » is a value in three different lists here and a substring match
   * would let one of them answer for another.
   */
  aliases?: readonly string[]
}

/**
 * Normalise a cell or a header before comparing it.
 *
 * ⚠️ THE HEBREW PUNCTUATION IS THE POINT. `למ״ס` is written with a GERSHAYIM
 *    (U+05F4) in the association's workbook and with a plain double quote by
 *    everybody who types it on a laptop; `גד״ש` and `שח״ם` are the same story.
 *    A dash may be an ASCII hyphen, an en dash, an em dash or a Hebrew MAQAF
 *    (U+05BE). None of that is a different value, and a comparison that thinks
 *    it is will tell the coordinator his own file is wrong.
 */
export function normaliseValue(raw: string): string {
  return raw
    .replace(/[״“”″"]/g, '"')
    .replace(/[׳‘’′']/g, "'")
    .replace(/[־‐‑‒–—―]/g, '-')
    .replace(/[ ‎‏‪-‮]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The option whose label or alias this cell names, or `null`. */
export function readOption(
  raw: string,
  options: readonly FieldOption[],
): FieldOption | null {
  const v = normaliseValue(raw)
  if (v === '') return null
  return (
    options.find(
      (o) =>
        normaliseValue(o.id) === v ||
        normaliseValue(o.label) === v ||
        (o.aliases ?? []).some((a) => normaliseValue(a) === v),
    ) ?? null
  )
}

/** The Hebrew for a stored id — for the sheet, the form and the detail page. */
export function optionLabel(id: string | null | undefined, options: readonly FieldOption[]): string {
  if (!id) return ''
  return options.find((o) => o.id === id)?.label ?? id
}

// ---------------------------------------------------------------------------
// AA2 — סוג הישות המשפטית
// ---------------------------------------------------------------------------

/**
 * WHO the counterpart is, legally. It decides who may sign at all: a קיבוץ
 * signs through its אגודה, a גד״ש through its partners, a רועה for himself.
 */
export const LEGAL_ENTITY_OPTIONS: readonly FieldOption[] = [
  { id: 'private_farmer', label: 'חקלאי פרטי', aliases: ['פרטי', 'private'] },
  { id: 'cooperative', label: 'אגודה שיתופית', aliases: ['אגודה', 'cooperative'] },
  { id: 'gadash', label: 'גד״ש', aliases: ['גדש', 'גד"ש'] },
  { id: 'shaham', label: 'שח״ם', aliases: ['שחם', 'שח"ם'] },
  { id: 'kibbutz', label: 'קיבוץ', aliases: ['kibbutz'] },
  { id: 'moshav', label: 'מושב', aliases: ['moshav'] },
  { id: 'herder', label: 'רועה/בעל עדר', aliases: ['רועה', 'בעל עדר', 'רועה / בעל עדר'] },
  { id: 'unknown_entity', label: 'לא ידוע', aliases: ['unknown'] },
]

// ---------------------------------------------------------------------------
// AA2 · AA2bis — סוג הסכם קרקע, and what each one proves
// ---------------------------------------------------------------------------

export interface LandAgreementOption extends FieldOption {
  /**
   * ★★ AA2bis — DOES THIS PAPER SHOW THE SIGNATORY HOLDS THE LAND?
   *
   * « Raison métier : ne pas organiser de gardes sur un terrain qui
   *   n'appartient pas au signataire. »
   *
   * A declaration by the farmers is not a document of rights; "no document"
   * and "not known" say so themselves. Everything else is an instrument the
   * State issued to somebody, so it answers the question. The flag WARNS and
   * never blocks — a farm whose paperwork is thin is exactly a farm the
   * programme wants on its list, with the gap visible.
   */
  establishesRight: boolean
  /** One line of what it actually is — from the workbook's own מקרא sheet. */
  note?: string
}

export const LAND_AGREEMENT_OPTIONS: readonly LandAgreementOption[] = [
  {
    id: 'perpetual_lease',
    label: 'חוזה חכירה לדורות',
    establishesRight: true,
    note: 'הזכות החזקה ביותר. ארבע תקופות מתחדשות של 49 שנה. רמ״י.',
  },
  {
    id: 'mishbetzet_lease',
    label: 'חוזה שכירות משבצת (תלת-צדדי)',
    aliases: ['חוזה שכירות משבצת', 'משבצת', 'חוזה שכירות משבצת (תלת צדדי)'],
    establishesRight: true,
    note: 'רמ״י + הסוכנות היהודית + האגודה. מתחדש כל שלוש שנים.',
  },
  {
    id: 'grazing_permit',
    label: 'הסכם הרשאה לרעייה',
    aliases: ['הרשאה לרעייה', 'הרשאה לרעיה'],
    establishesRight: true,
    note: 'בר-רשות בלבד. זכות חלשה, לתקופה קצובה, לא עבירה ולא ניתנת להורשה.',
  },
  {
    id: 'temporary_permit',
    label: 'הסכם הרשאה זמני',
    aliases: ['הרשאה זמנית', 'הרשאה זמני'],
    establishesRight: true,
  },
  {
    id: 'farmer_declaration',
    label: 'הצהרת חקלאים בלבד',
    aliases: ['הצהרת חקלאים'],
    establishesRight: false,
    note: 'אינו מסמך זכויות. לא מספיק כדי לאמת חזקה על הקרקע.',
  },
  { id: 'no_document', label: 'אין מסמך', establishesRight: false },
  { id: 'unknown_agreement', label: 'לא ידוע', establishesRight: false },
]

// ---------------------------------------------------------------------------
// AA3 — דונם משוקלל
// ---------------------------------------------------------------------------

/**
 * ★★ AA3.1 — THE TWO COEFFICIENTS AND THE TARGET, NAMED, WITH THEIR ORIGIN.
 *
 *   « דונם משוקלל = שטח מעובד × 1 + שטח מרעה × 0,02. Les deux coefficients et
 *     l'objectif sont des CONSTANTES NOMMÉES dans un seul fichier de
 *     configuration, commentées avec leur origine. »
 *
 * ★ WHERE 0.02 COMES FROM, because a bare 0.02 in a reduce is a number nobody
 *   can ever check. It is the State's own subsidy ratio for grazing land:
 *   ONE TO FIFTY — fifty dunams of open grazing are funded as one dunam of
 *   cultivated ground, on the reasoning that a herd's range is not a crop.
 *   1 / 50 = 0.02. The association's workbook states the same ratio on its
 *   מקרא sheet, in the same words.
 *
 * ⚠️ THE APP RECOMPUTES THIS, ALWAYS, and never imports the column (AA4.7).
 *    A weighted figure that arrived from a spreadsheet is a figure whose
 *    coefficients nobody in this codebase chose.
 */
export const WEIGHTED_DUNAM = {
  /** שטח מעובד — counted as itself. */
  cultivated: 1,
  /** שטח מרעה — the 1:50 grazing ratio. */
  grazing: 0.02,
} as const

/**
 * The month's target, in weighted dunams. From the workbook's מקרא sheet
 * (« יעד דונם משוקלל לסוף החודש »), which is where the association sets it.
 *
 * ⚠️ ★★ AB5a.4 (2026-09-08) — THIS IS NOW THE **INITIAL** VALUE, AND IT STAYS
 *    A NAMED CONSTANT FOR THAT REASON.
 *
 *      « L'objectif reste une constante nommée comme valeur INITIALE ; les
 *        réglages la surchargent. »
 *
 *    `ui/settings/target.ts` holds the coordinator's own campaign — figure,
 *    deadline, label, what happens when it is passed, and the campaigns
 *    already achieved — and the dashboard reads THAT. A device that has never
 *    opened הגדרות → יעד reads this line, and « חזרה לערך ההתחלתי » comes back
 *    to it. Editing this number therefore changes what a NEW device starts
 *    with, not what the product owner is currently working towards.
 */
export const WEIGHTED_DUNAM_TARGET = 100_000

export interface HasAreas {
  /** שטח מעובד (דונם). */
  farmDunams: number
  /** שטח מרעה (דונם). */
  grazingDunams: number
}

/** AA3.1 — the one computation. Rounded, because a dunam is not divisible. */
export function weightedDunams(farm: HasAreas): number {
  const raw =
    farm.farmDunams * WEIGHTED_DUNAM.cultivated +
    farm.grazingDunams * WEIGHTED_DUNAM.grazing
  return Math.round(raw)
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AC3 (2026-09-08) — « שטחים שמירה » : LE PO A TRANCHÉ, C'EST DÉCLARATIF.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « שטחים שמירה n'est pas une recopie erronée. C'est une déclaration —
 *     "nous surveillons la totalité de cette surface". Leur système la
 *     remplit, et c'est volontaire. »
 *
 * ★ SO THE DEFAULT IS THE WHOLE HOLDING — מעובד + מרעה — AND IT IS A DEFAULT
 *   AND NOT A STORED COPY. A record that has never been touched answers with
 *   the sum of its two areas and follows them when a polygon is drawn; the day
 *   the coordinator types a different figure, `guardedDunamsManual` is set and
 *   the default never speaks again for that farm (AC3.2).
 *
 * ⚠️ AND A TYPED ZERO DOES NOT FREEZE ANYTHING — the trap AA4 fell into on a
 *    sheet of 198 zeroes. The flag is set by the importer only above zero and
 *    by the form only on a real entry; `guardedDunams` at 0 with no flag is a
 *    record nobody has answered for, and it keeps answering with the default.
 *
 * ⚠️ IT IS NOT THE WEIGHTING, AND THE TWO NEVER MEET (AC3.4). `weightedDunams`
 *    above is the SUBSIDY rule — מעובד × 1 + מרעה × 0,02 — and it reads
 *    neither this function nor this field. The guarded area is what the
 *    programme SAYS it watches; the weighted figure is what the State counts.
 */
export interface HasGuardedArea extends HasAreas {
  guardedDunams?: number
  guardedDunamsManual?: boolean
}

export function guardedDunamsOf(farm: HasGuardedArea): number {
  if (farm.guardedDunamsManual && Number.isFinite(farm.guardedDunams)) {
    return Math.round(farm.guardedDunams as number)
  }
  return Math.round(farm.farmDunams + farm.grazingDunams)
}

/** Is this farm's guarded area the default, or a figure somebody typed? */
export function guardedIsManual(farm: HasGuardedArea): boolean {
  return farm.guardedDunamsManual === true
}

/** The same sum over a list, for the dashboard card and the list totals. */
export function totalWeightedDunams(farms: readonly HasAreas[]): number {
  return farms.reduce((sum, f) => sum + weightedDunams(f), 0)
}

/**
 * Where a total stands against the target, as a whole percentage.
 *
 * ⚠️ AB5a — THE DASHBOARD NO LONGER CALLS THIS; it calls `progressAgainst` in
 *    `ui/settings/target.ts`, which takes the coordinator's own campaign
 *    rather than the constant. This is kept because it is the PURE form of the
 *    same arithmetic against the initial value, it is what `bun run
 *    prospection` pins (« 118 % is a sentence the association wants to be able
 *    to say »), and a server-side report in Lot 1 will want it with no React
 *    anywhere near it.
 */
export function targetProgress(total: number, target = WEIGHTED_DUNAM_TARGET): number {
  if (target <= 0) return 0
  return Math.round((total / target) * 100)
}

// ---------------------------------------------------------------------------
// AA2 — the migration of the single area figure
// ---------------------------------------------------------------------------

/**
 * ★ AA2 — « Migration sans perte de la surface unique actuelle : vers מעובד si
 *   le type est חקלאות, vers מרעה si בעלי חיים, zéro/zéro si inconnu. »
 *
 * Records written before the two areas were separate carry one number and no
 * statement of what kind of ground it is. The farm's own TYPE is the only
 * honest place to ask: an arable holding's dunams are cultivated, a herd's are
 * range. A mixed holding is the case where the number genuinely does not say
 * — and inventing a split for it would put a figure into a funding total that
 * nobody measured, so it goes to zero and zero and the coordinator is asked.
 */
export function splitLegacyDunams(
  dunams: number,
  type: FarmType | undefined,
): { farmDunams: number; grazingDunams: number } {
  if (!Number.isFinite(dunams) || dunams <= 0) return { farmDunams: 0, grazingDunams: 0 }
  if (type === 'agriculture') return { farmDunams: dunams, grazingDunams: 0 }
  if (type === 'livestock') return { farmDunams: 0, grazingDunams: dunams }
  return { farmDunams: 0, grazingDunams: 0 }
}

// ---------------------------------------------------------------------------
// AA2bis — is the signatory's right over this land established?
// ---------------------------------------------------------------------------

/**
 * ★★ AA2bis (2026-09-07) — « NE PAS ORGANISER DE GARDES SUR UN TERRAIN QUI
 *    N'APPARTIENT PAS AU SIGNATAIRE. »
 *
 * That sentence is the whole of this function, and it is an operational rule
 * rather than a clerical one: a guard rota placed on ground the signatory does
 * not hold is volunteers standing, at night, somewhere nobody agreed they
 * could be. So the app SAYS SO, visibly, and does not act on it — « avertit,
 * ne bloque » is the product owner's own second sentence, and it matters as
 * much as the first: a farm whose paperwork is thin is exactly the farm the
 * programme wants on its list, with the gap findable.
 *
 * Four answers rather than a boolean, because they call for different work:
 *
 *   · `none`        the paper establishes a right and it has not lapsed;
 *   · `unset`       nobody has recorded what paper there is — a question to
 *                   ask, not a fault found. It is separated from `no_document`
 *                   because « we have not asked » and « there is none » are
 *                   different facts and the second one is the serious one;
 *   · `no_document` the kind recorded does not prove a right (see
 *                   `establishesRight` on each option);
 *   · `expired`     it did, and the date has passed.
 *
 * ⚠️ THE DATE IS COMPARED AS A DAY, NOT AS AN INSTANT. `landAgreementUntil` is
 *    a `YYYY-MM-DD` with no time and no zone; turning it into a Date and
 *    comparing to `now()` would make a contract expire at midnight UTC, which
 *    in Israel is two or three in the morning of the following day. Comparing
 *    the two day-strings is exact and has no zone in it at all.
 */
export type LandRightIssue = 'none' | 'unset' | 'no_document' | 'expired'

export function landRightIssue(
  farm: { landAgreement?: string; landAgreementUntil?: string | null },
  todayKey: string,
): LandRightIssue {
  const kind = (farm.landAgreement ?? '').trim()
  if (kind === '') return 'unset'
  const option = LAND_AGREEMENT_OPTIONS.find((o) => o.id === kind)
  if (!option || !option.establishesRight) return 'no_document'
  const until = (farm.landAgreementUntil ?? '').trim()
  if (until !== '' && until < todayKey) return 'expired'
  return 'none'
}

// ---------------------------------------------------------------------------
// AA4 — the two enum columns the association's own workbook carries
// ---------------------------------------------------------------------------

/**
 * ★★ AA4 (2026-09-07) — סטטוס AND סוג פעילות AS EXACT VALUES, NOT SUBSTRINGS.
 *
 * `templates.ts` reads these two columns with a longest-substring-first table,
 * which is the right tool for somebody's own spreadsheet where the cell might
 * say « כבר דיברנו איתם » — and the WRONG one for the association's workbook,
 * where the values come from a validated drop-down and are exact. The trap is
 * live and it is not hypothetical:
 *
 *   ⚠️ « לא נוצר קשר » (NOT contacted) CONTAINS « נוצר קשר » (contacted).
 *
 * A substring reader turns "we have not called them" into "we have called
 * them" on every unworked row of a 198-row sheet, and the coordinator's whole
 * call list silently disappears. `readOption` compares WHOLE normalised
 * strings, so the two cannot be confused whichever order they are declared in.
 *
 * These lists are also what the EXPORT writes, which is what makes the round
 * trip (AA4.10, A78) exact rather than approximately right.
 */
export const FARM_STATUS_OPTIONS: readonly FieldOption[] = [
  { id: 'to_contact', label: 'ליצירת קשר', aliases: ['לא נוצר קשר', 'to_contact'] },
  { id: 'contacted', label: 'נוצר קשר', aliases: ['contacted'] },
  { id: 'visited', label: 'בוקרה', aliases: ['ביקור', 'visited'] },
  { id: 'verbal_ok', label: 'הסכמה בעל פה', aliases: ['הסכמה בעל־פה', 'verbal_ok', 'verbal'] },
  { id: 'signed', label: 'הסכמה נחתמה', aliases: ['נחתם', 'חתמה', 'signed'] },
  { id: 'active', label: 'פעילה', aliases: ['פעיל', 'active'] },
  { id: 'declined', label: 'לא רלוונטי', aliases: ['סירבה', 'סירב', 'declined'] },
]

/**
 * סוג פעילות — the workbook says מעובד / מרעה / מעורב, the app says
 * חקלאות / בעלי חיים / מעורבת. Same three things; both spellings are here so
 * that a file from either side reads, and the EXPORT writes the workbook's.
 */
export const FARM_TYPE_OPTIONS: readonly FieldOption[] = [
  { id: 'agriculture', label: 'מעובד', aliases: ['חקלאות', 'חקלאי', 'agriculture'] },
  { id: 'livestock', label: 'מרעה', aliases: ['בעלי חיים', 'רעייה', 'livestock'] },
  { id: 'mixed', label: 'מעורב', aliases: ['מעורבת', 'משולב', 'mixed'] },
]
