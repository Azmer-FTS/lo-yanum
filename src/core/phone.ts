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
