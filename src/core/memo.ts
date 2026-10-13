/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BE (2026-10-13) — L'AIDE-MÉMOIRE : CE QU'ON DEMANDE, CE QU'ON DIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO téléphone avec cet écran sous les yeux. Trois banques — institutions,
 * agriculteurs, volontaires — chacune en deux sections : les QUESTIONS à poser
 * et les POINTS À DIRE. Chaque ligne porte l'hébreu (ce qu'il lit à voix haute
 * pendant que l'autre attend) et le français (pour lui, en petit).
 *
 * ★ C'EST SON CARNET, PAS UN TEXTE FIGÉ : il ajoute, modifie, supprime. Les
 *   banques ne s'archivent pas : ce sont des références.
 *
 * PUR : aucun React, aucun DOM.
 */

export type MemoBank = 'institutions' | 'farmers' | 'volunteers'
export type MemoSection = 'questions' | 'say'

export interface MemoLine {
  id: string
  bank: MemoBank
  section: MemoSection
  /** L'hébreu, lu à voix haute. */
  he: string
  /** Le français, pour le PO. */
  fr: string
  /** L'ordre dans sa section (plus petit = plus haut). */
  rank: number
  createdAt: string
  updatedAt: string
}

/**
 * Les banques et l'ordre de leurs sections, tels que le PO les a données : les
 * volontaires commencent par ce qu'on leur DIT, puis leurs questions et les
 * réponses.
 */
export const MEMO_BANKS: ReadonlyArray<{ bank: MemoBank; sections: readonly MemoSection[] }> = [
  { bank: 'institutions', sections: ['questions', 'say'] },
  { bank: 'farmers', sections: ['questions', 'say'] },
  { bank: 'volunteers', sections: ['say', 'questions'] },
]

export const MEMO_BANK_KEYS: readonly MemoBank[] = MEMO_BANKS.map((b) => b.bank)

/**
 * Un texte ramené à ce qu'on cherche : minuscules, sans niqqud ni ta'amim,
 * sans geresh ni gershayim, la ponctuation en espaces. « גד״ש » et « גדש »
 * se trouvent l'un l'autre.
 */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[׳״'"`’‘“”]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Tous les mots de la recherche, dans l'hébreu OU le français de la ligne. */
export function memoMatches(line: Pick<MemoLine, 'he' | 'fr'>, query: string): boolean {
  const words = normalizeForSearch(query).split(' ').filter(Boolean)
  if (words.length === 0) return true
  const hay = `${normalizeForSearch(line.he)} ${normalizeForSearch(line.fr)}`
  return words.every((w) => hay.includes(w))
}

export interface MemoView {
  bank: MemoBank
  sections: Array<{ section: MemoSection; lines: MemoLine[] }>
  /** Le nombre de lignes retenues dans la banque. */
  count: number
}

/**
 * Les trois banques, filtrées À LA FOIS par la même recherche. Une section
 * sans ligne retenue reste (vide) quand la recherche est vide — pour qu'on
 * puisse y ajouter — et disparaît quand on cherche.
 */
export function memoView(lines: readonly MemoLine[], query = ''): MemoView[] {
  const searching = normalizeForSearch(query) !== ''
  return MEMO_BANKS.map(({ bank, sections }) => {
    const out = sections.map((section) => ({
      section,
      lines: lines
        .filter((l) => l.bank === bank && l.section === section && memoMatches(l, query))
        .sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    }))
    const kept = searching ? out.filter((s) => s.lines.length > 0) : out
    return { bank, sections: kept, count: kept.reduce((n, s) => n + s.lines.length, 0) }
  })
}

/** Le rang d'une ligne ajoutée EN FIN de sa section. */
export function nextMemoRank(lines: readonly MemoLine[], bank: MemoBank, section: MemoSection): number {
  const ranks = lines.filter((l) => l.bank === bank && l.section === section).map((l) => l.rank)
  return ranks.length === 0 ? 0 : Math.max(...ranks) + 1
}

/** Une ligne acceptable : l'hébreu OU le français porte quelque chose. */
export const isMemoLineValid = (l: Pick<MemoLine, 'he' | 'fr'>): boolean => l.he.trim() !== '' || l.fr.trim() !== ''
