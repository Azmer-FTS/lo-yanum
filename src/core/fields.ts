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

/** The same sum over a list, for the dashboard card and the list totals. */
export function totalWeightedDunams(farms: readonly HasAreas[]): number {
  return farms.reduce((sum, f) => sum + weightedDunams(f), 0)
}

/** Where a total stands against the target, as a whole percentage. */
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
