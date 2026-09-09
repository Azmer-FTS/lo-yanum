import type { Farm } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH5 (2026-09-09) — LE DOCUMENT QUE SIGNE L'AGRICULTEUR EST UN GABARIT,
 *    ET LE GABARIT EST LA SOURCE UNIQUE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Aujourd'hui le texte du document vit dans le code. L'association changera
 *     son contenu — elle ajoutera une clause qu'elle jugera essentielle — et le
 *     PO doit pouvoir le faire seul, sans dépendre de personne. »
 *
 * ★★ CE QUI CHANGE PAR RAPPORT À AF1, ET C'EST LA DÉCISION STRUCTURANTE.
 *    AF1 dessinait un formulaire : un titre en dur, QUATRE CASES en dur avec
 *    leurs libellés traduits, puis un paragraphe de gabarit à un seul jeton.
 *    Trois sources pour un document. Ici il n'y en a qu'UNE : le texte. Les
 *    cases sont devenues des LIGNES du gabarit, les libellés sont dedans, et
 *    l'association peut donc en ajouter une, en retirer une, ou réécrire la
 *    clause — sans que personne touche au code.
 *
 * ★ CE QUI RESTE STRUCTUREL, ET POURQUOI : le logo (une image), le cadre de
 *   l'encre, le trait de signature et son pied de page. Ce ne sont pas du
 *   texte, ce sont les endroits où l'on POSE quelque chose ; les mettre dans
 *   un gabarit de texte reviendrait à demander au PO d'écrire de la mise en
 *   page dans une zone de saisie.
 *
 * ⛔ AUCUNE SURFACE PARMI LES VARIABLES (AH5.2), ET C'EST EXPLICITE. « Les
 *    surfaces n'ont rien à faire dans ce document, il n'en a pas besoin pour
 *    faire signer. » La liste ci-dessous est FERMÉE : elle est ce qui est
 *    accepté à l'enregistrement, donc ajouter מעובד ou מרעה au document
 *    demanderait d'ajouter une ligne ici — c'est-à-dire un débat, pas une
 *    faute de frappe.
 *
 * PURE : ni DOM, ni React. Le rendu du canevas est dans `ui/agreement`.
 */

/**
 * ★★ LES SEPT, ET LES SEPT SEULEMENT.
 *
 * ⚠️ ELLES SONT EN HÉBREU PARCE QUE C'EST LE PO QUI LES TAPE. Un gabarit à
 *    `{{farmerName}}` obligerait quelqu'un qui écrit de droite à gauche à
 *    basculer de clavier au milieu d'une phrase, sept fois, et une variable
 *    mal tapée est un trou dans un contrat. Le trait de soulignement remplace
 *    l'espace pour la même raison qu'ailleurs : un jeton doit être un seul
 *    mot pour que « où finit-il » n'ait pas deux réponses.
 */
export const AGREEMENT_VARS = [
  'שם_החקלאי',
  'תז_חפ',
  'נייד',
  'שם_החווה',
  'יישוב',
  'שנה',
  'תאריך_חתימה',
] as const

export type AgreementVar = (typeof AGREEMENT_VARS)[number]

export type AgreementValues = Record<AgreementVar, string>

/** `{{ quelquechose }}`, espaces tolérés autour du nom. */
const TOKEN = /\{\{\s*([^{}\s]+)\s*\}\}/g

const isKnown = (name: string): name is AgreementVar =>
  (AGREEMENT_VARS as readonly string[]).includes(name)

/**
 * ★★ AH5.7 — UNE VARIABLE MAL ORTHOGRAPHIÉE EST REFUSÉE, ET ELLE EST NOMMÉE.
 *
 * « Le PO ne doit pas découvrir l'erreur sur un document déjà signé. » Un
 * jeton inconnu ne produit pas d'erreur au rendu — il reste visible tel quel,
 * comme dans `renderSummons` — donc rien n'attirerait l'attention avant qu'un
 * agriculteur ait sous les yeux « {{שם_החקלא}} » à la place de son nom, sur un
 * papier que l'association archive.
 *
 * Rendues DANS L'ORDRE DU TEXTE et sans doublon : le PO cherche la première.
 */
export function unknownAgreementVars(template: string): string[] {
  const found: string[] = []
  for (const m of template.matchAll(TOKEN)) {
    const name = m[1]
    if (!isKnown(name) && !found.includes(name)) found.push(name)
  }
  return found
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH5.3 — UNE VARIABLE NON RENSEIGNÉE NE LAISSE NI CHAMP VIDE NI LIGNE
 *    VIDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ET « LIGNE VIDE » DEMANDE UNE DÉFINITION, SINON LA RÈGLE NE SE PROGRAMME
 *    PAS. Une ligne « ת״ז / ח״פ: {{תז_חפ}} » dont la variable est vide devient
 *    « ת״ז / ח״פ: » — techniquement non vide, et pourtant exactement ce que le
 *    PO ne veut pas voir sur le papier. La règle retenue, et elle est la seule
 *    qui se tienne :
 *
 *      · une ligne SANS variable est conservée telle quelle, toujours. C'est
 *        de la prose que l'association a écrite ;
 *      · une ligne AVEC variables dont AUCUNE n'est renseignée disparaît
 *        entièrement, libellé compris ;
 *      · une ligne dont une partie des variables est renseignée garde son
 *        libellé, perd les jetons vides, et voit ses séparateurs orphelins
 *        (deux points, tirets, points médians, virgules en fin de ligne)
 *        retirés — sinon « נייד: · » resterait.
 *
 * ★ ET LES LIGNES VIDES CONSÉCUTIVES SE REFERMENT. Retirer trois lignes d'un
 *   bloc d'identité laisserait un trou de trois interlignes au milieu du
 *   document ; le PO verrait un défaut de mise en page là où il n'y a qu'une
 *   information manquante.
 */
export function renderAgreementTemplate(
  template: string,
  values: Partial<AgreementValues>,
): string {
  const kept: string[] = []
  for (const line of template.split('\n')) {
    const tokens = [...line.matchAll(TOKEN)]
    if (tokens.length === 0) {
      kept.push(line)
      continue
    }
    let anyFilled = false
    let anyKnown = false
    const replaced = line.replace(TOKEN, (whole, name: string) => {
      if (!isKnown(name)) return whole
      anyKnown = true
      const v = (values[name] ?? '').trim()
      if (v !== '') anyFilled = true
      return v
    })
    /* Aucune variable connue : le jeton est une faute de frappe, il reste
       visible (même règle que `renderSummons`) et la ligne est conservée. */
    if (!anyKnown) {
      kept.push(replaced)
      continue
    }
    if (!anyFilled) continue
    kept.push(tidy(replaced))
  }
  return collapseBlanks(kept).join('\n')
}

/** Espaces multiples refermés, séparateurs orphelins retirés aux deux bouts. */
function tidy(line: string): string {
  let out = line.replace(/[ \t]{2,}/g, ' ').trim()
  out = out.replace(/[\s]*[:·,–—-]+\s*$/u, '')
  out = out.replace(/^[:·,–—-]+\s*/u, '')
  return out
}

function collapseBlanks(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (line.trim() === '' && (out.length === 0 || out[out.length - 1].trim() === '')) continue
    out.push(line)
  }
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
  return out
}

// ---------------------------------------------------------------------------
// Les valeurs, prises sur la fiche
// ---------------------------------------------------------------------------

/**
 * ★ LES MÊMES REPLIS QU'EN AF1 (`agreementFieldValues`), ET C'EST VOULU : le
 *   contact PRINCIPAL supplée l'agriculteur, jamais un secondaire — c'est le
 *   מזכיר de l'אגודה qui vous oriente, pas celui qui signe.
 *
 * ⚠️ `יישוב` ET `שם_החווה` SONT DEUX VARIABLES DISTINCTES, là où AF1 les
 *    collait dans une seule case « מקום התנדבות ». C'est le PO qui les a
 *    séparées dans sa liste, et il a raison : l'association trie par יישוב.
 */
export function agreementValues(
  farm: Farm,
  ctx: { year: string; signedAtText: string },
): AgreementValues {
  const primary = farm.contacts?.find((c) => c.isPrimary) ?? farm.contacts?.[0] ?? null
  return {
    'שם_החקלאי': (farm.farmerName ?? '').trim() || (primary?.name ?? '').trim(),
    'תז_חפ': (farm.farmerId ?? '').trim(),
    'נייד': (farm.farmerPhone ?? '').trim() || (primary?.phone ?? '').trim(),
    'שם_החווה': (farm.farmName ?? '').trim() || (farm.name ?? '').trim(),
    'יישוב': (farm.locality ?? '').trim(),
    'שנה': ctx.year,
    'תאריך_חתימה': ctx.signedAtText,
  }
}

/**
 * ★ DES VALEURS D'EXEMPLE POUR L'APERÇU DES RÉGLAGES (AH5.6), et elles sont
 *   MANIFESTEMENT fictives — c'est la même règle qu'AH3 sur le jeu d'essai :
 *   un aperçu rempli de valeurs plausibles finit par être pris pour un vrai
 *   document, imprimé, et signé.
 */
export const AGREEMENT_SAMPLE: AgreementValues = {
  'שם_החקלאי': 'ישראל ישראלי (דוגמה)',
  'תז_חפ': '000000000',
  'נייד': '050-0000000',
  'שם_החווה': 'החווה של ישראל (דוגמה)',
  'יישוב': 'יישוב לדוגמה',
  'שנה': '2026',
  'תאריך_חתימה': '01/01/2026',
}

// ---------------------------------------------------------------------------
// La structure minimale que le rendu comprend
// ---------------------------------------------------------------------------

export type AgreementBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'blank' }

/**
 * ★★ « ## » EST LE SEUL BALISAGE, ET IL Y EN A UN PARCE QU'IL EN FALLAIT UN.
 *
 * Un document sans aucun titre serait un mur de texte ; un document avec un
 * titre en dur ne serait plus « la source unique ». Deux dièses est ce que le
 * PO écrit déjà dans ses notes, cela ne s'apprend pas, et cela ne peut pas
 * apparaître par accident au milieu d'une phrase en hébreu.
 *
 * ★ LE PREMIER TITRE EST LE TITRE DU DOCUMENT. Les suivants sont des
 *   intertitres. Aucune règle de plus : trois niveaux sur un formulaire d'une
 *   page seraient une hiérarchie que personne ne lit.
 */
export function parseAgreementBlocks(rendered: string): AgreementBlock[] {
  const blocks: AgreementBlock[] = []
  let sawTitle = false
  for (const raw of rendered.split('\n')) {
    const line = raw.trimEnd()
    if (line.trim() === '') {
      blocks.push({ kind: 'blank' })
      continue
    }
    const m = /^##\s+(.*)$/.exec(line.trim())
    if (m) {
      if (!sawTitle) {
        sawTitle = true
        blocks.push({ kind: 'title', text: m[1].trim() })
      } else {
        blocks.push({ kind: 'heading', text: m[1].trim() })
      }
      continue
    }
    blocks.push({ kind: 'paragraph', text: line })
  }
  return blocks
}
