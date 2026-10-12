/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AM4.2 (2026-09-16) — LES TÉLÉPHONES SE METTENT EN FORME À LA FRAPPE,
 *    PARTOUT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AK3 l'a fait pour le נייד du formulaire de l'association
 * (`formatMobileTyping`) ; les dix autres champs de téléphone de l'application
 * recevaient des chiffres nus. Ce module est la règle unique.
 *
 * ★ DEUX FONCTIONS, DEUX QUESTIONS :
 *   · `formatPhoneTyping` — ce que le champ AFFICHE pendant la frappe. Le doigt
 *     ne tape que des chiffres ; la ponctuation se pose d'elle-même.
 *       נייד / 07X   (050) 123-4567
 *       קווי         (08) 656-4111
 *       1-800        1-800-123-456
 *       קוד קצר      *6050 ou 106, tel quel
 *   · `phoneValue` — ce qui est ENREGISTRÉ : la forme que l'app stocke depuis
 *     AA4 (`0XX-XXXXXXX`, `0X-XXXXXXX`) dès que le numéro est complet, et la
 *     frappe telle quelle tant qu'il ne l'est pas. L'export de l'association
 *     (`associationPhone`) et la comparaison des personnes (`samePerson`)
 *     lisent des chiffres ; rien en aval ne dépend de la ponctuation affichée.
 *
 * ⚠️ JAMAIS `Number()` : un numéro commence par un zéro.
 *
 * PUR.
 */

const digitsOf = (raw: string): string => raw.replace(/\D/g, '')

/** +972 5X… → 05X… : un numéro recopié d'un contact WhatsApp. */
function national(d: string): string {
  return d.startsWith('972') && d.length > 3 ? `0${d.slice(3)}` : d
}

export function formatPhoneTyping(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('*')) return `*${digitsOf(trimmed).slice(0, 6)}`
  const d = national(digitsOf(trimmed))
  if (d === '') return ''
  if (d.startsWith('1')) {
    // 1-800 / 1-700 : quatre chiffres, puis trois et trois.
    const x = d.slice(0, 10)
    if (x.length <= 1) return x
    if (x.length <= 4) return `${x[0]}-${x.slice(1)}`
    if (x.length <= 7) return `${x[0]}-${x.slice(1, 4)}-${x.slice(4)}`
    return `${x[0]}-${x.slice(1, 4)}-${x.slice(4, 7)}-${x.slice(7)}`
  }
  if (!d.startsWith('0')) return d.slice(0, 6)
  const mobile = d.length >= 2 && (d[1] === '5' || d[1] === '7')
  if (mobile) {
    const x = d.slice(0, 10)
    if (x.length <= 3) return `(${x}`
    if (x.length <= 6) return `(${x.slice(0, 3)}) ${x.slice(3)}`
    return `(${x.slice(0, 3)}) ${x.slice(3, 6)}-${x.slice(6)}`
  }
  const x = d.slice(0, 9)
  if (x.length <= 2) return `(${x}`
  if (x.length <= 5) return `(${x.slice(0, 2)}) ${x.slice(2)}`
  return `(${x.slice(0, 2)}) ${x.slice(2, 5)}-${x.slice(5)}`
}

export function phoneValue(raw: string): string {
  const d = national(digitsOf(raw))
  if (d.length === 10 && /^0[57]/.test(d)) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length === 9 && /^0[2-489]/.test(d)) return `${d.slice(0, 2)}-${d.slice(2)}`
  return raw.trim()
}

// ---------------------------------------------------------------------------
// ★★ BA (2026-10-12) — UN NUMÉRO, UNE FORME : E.164.
// ---------------------------------------------------------------------------

/**
 * La règle du PO, sans exception : un contact, une photo et une fiche se
 * retrouvent par le TÉLÉPHONE, jamais par le nom (l'hébreu en RTL rend la
 * comparaison des noms peu fiable, et le PO s'y est déjà fait piéger).
 *
 * `phoneE164` ramène toute écriture d'un numéro israélien à `+972XXXXXXXXX` :
 *   0500000123 · 050-000-0123 · (050) 000-0123 · +972 50-000-0123 ·
 *   972500000123 · 00972500000123  →  +972500000123   (numéro fictif).
 * Un numéro qui n'a pas la longueur d'un numéro israélien (8 chiffres après
 * l'indicatif pour un fixe, 9 pour un portable) rend `null` : ni un code
 * court (*6050), ni un fragment, ni un numéro étranger ne s'apparie au hasard.
 *
 * PUR.
 */
export function phoneE164(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('972')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  if (d.length === 9 && /^[57]/.test(d)) return `+972${d}`
  if (d.length === 8 && /^[2-489]/.test(d)) return `+972${d}`
  return null
}

/** Deux écritures désignent-elles le même numéro ? (faux si l'une est illisible) */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = phoneE164(a)
  return x !== null && x === phoneE164(b)
}

/**
 * ★ L'APPAIRAGE, À UN SEUL ENDROIT. Rend, pour chaque élément de `items`, le
 * candidat qui porte le même numéro — et SEULEMENT s'il est unique : deux
 * candidats au même numéro sont un doublon à signaler (`ambiguous`), pas un
 * choix à faire au hasard. Le nom n'intervient jamais.
 */
export function pairByPhone<A, B>(
  items: readonly A[],
  candidates: readonly B[],
  phoneOfItem: (a: A) => string | null | undefined,
  phonesOfCandidate: (b: B) => ReadonlyArray<string | null | undefined>,
): { pairs: Array<{ item: A; match: B | null; phone: string | null }>; ambiguous: Array<{ item: A; matches: B[]; phone: string }> } {
  const byPhone = new Map<string, B[]>()
  for (const c of candidates) {
    const seen = new Set<string>()
    for (const p of phonesOfCandidate(c)) {
      const k = phoneE164(p)
      if (!k || seen.has(k)) continue
      seen.add(k)
      byPhone.set(k, [...(byPhone.get(k) ?? []), c])
    }
  }
  const pairs: Array<{ item: A; match: B | null; phone: string | null }> = []
  const ambiguous: Array<{ item: A; matches: B[]; phone: string }> = []
  for (const item of items) {
    const k = phoneE164(phoneOfItem(item))
    const found = k ? byPhone.get(k) ?? [] : []
    if (k && found.length > 1) ambiguous.push({ item, matches: found, phone: k })
    pairs.push({ item, match: found.length === 1 ? found[0] : null, phone: k })
  }
  return { pairs, ambiguous }
}

/** Les numéros portés par plusieurs enregistrements : les doublons à signaler. */
export function duplicatePhones<T>(records: readonly T[], phonesOf: (r: T) => ReadonlyArray<string | null | undefined>): Array<{ phone: string; records: T[] }> {
  const byPhone = new Map<string, T[]>()
  for (const r of records) {
    const seen = new Set<string>()
    for (const p of phonesOf(r)) {
      const k = phoneE164(p)
      if (!k || seen.has(k)) continue
      seen.add(k)
      byPhone.set(k, [...(byPhone.get(k) ?? []), r])
    }
  }
  return [...byPhone].filter(([, rs]) => rs.length > 1).map(([phone, rs]) => ({ phone, records: rs }))
}
