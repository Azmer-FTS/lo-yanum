import { formatPhoneTyping, phoneValue } from './phone'
import { idDigits } from './remoteSign'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AM4 (2026-09-16) — LE CLAVIER EST UNE PROPRIÉTÉ DU CHAMP, PAS DE L'ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ DÉPLACÉ DE `ui/components/fields.tsx` VERS LE CŒUR EN AP3.4, SANS UN
 *    CARACTÈRE DE CHANGEMENT, ET POUR UNE RAISON QUI EST LE SUJET MÊME DE CE
 *    FICHIER. La page publique (`src/bakasha`) a besoin des mêmes claviers —
 *    pavé numérique pour la ת״ז et le נייד, clavier courriel pour le
 *    courriel — et elle ne peut pas importer `fields.tsx`, qui tire
 *    `react-i18next`, le barillet entier de `@core/index`, `useShellMetrics`
 *    et `Icon` : le bundle d'un téléphone au bord d'un champ paierait le
 *    dictionnaire de l'application pour obtenir un `inputmode`.
 *
 *    ⛔ ET LA COPIE ÉTAIT L'AUTRE OPTION, REFUSÉE. Deux tables de claviers,
 *       c'est la garantie qu'un jour l'une dira `inputmode="numeric"` et
 *       l'autre `type="number"` — c'est-à-dire un zéro initial de ת״ז mangé
 *       sur la page publique et gardé dans l'application. A254 mesure ce que
 *       le NAVIGATEUR décide ; encore faut-il qu'il n'y ait qu'une chose à
 *       mesurer.
 *
 * `fields.tsx` réexporte tout ce qui est ici, donc aucun appelant existant ne
 * change.
 *
 * PUR : pas de React, pas de DOM — `kindInputProps` rend un objet d'attributs.
 *
 * AK3 a donné le pavé numérique à la ת״ז et au נייד du formulaire de
 * l'association ; la ת״ז de l'édition de ferme ouvrait encore le clavier
 * complet, et dix téléphones recevaient des chiffres nus. Réparer écran par
 * écran, c'est réparer jusqu'au prochain écran.
 *
 * ★ `kind` DIT CE QU'EST LA VALEUR ; le champ en déduit TOUT le reste — type,
 *   `inputmode`, `pattern`, `autocomplete`, sens d'écriture, mise en forme à la
 *   frappe et nettoyage. Il le pose aussi en `data-kind`, et c'est ce que la
 *   porte A218 lit sur chaque champ de chaque écran : un champ sans `kind`, ou
 *   dont le DOM contredit son `kind`, est un échec.
 *
 *   phone    pavé numérique, (050) 123-4567 à la frappe, 050-1234567 enregistré
 *   id       pavé numérique, chiffres seuls, neuf au plus (ת״ז / ח״פ)
 *   integer  pavé numérique, chiffres seuls (places, âge, têtes, minutes)
 *   decimal  pavé numérique avec le point (surfaces en dounams)
 *   code     pavé numérique, chiffres seuls, zéro initial gardé (סמל יישוב)
 *   email    clavier courriel
 *   date     sélecteur natif
 *   name     clavier texte, remplissage « nom »
 *   text     clavier texte
 *
 * ⚠️ JAMAIS `type="number"` : il mange le zéro initial et laisse passer « e ».
 *    Tout ce qui est numérique est `type="text"` + `inputmode`.
 */
export type FieldKind =
  | 'text'
  | 'name'
  | 'phone'
  | 'id'
  | 'integer'
  | 'decimal'
  | 'code'
  | 'email'
  | 'date'

interface KindDom {
  type: 'text' | 'email' | 'date'
  inputMode?: 'numeric' | 'decimal' | 'email' | 'text'
  pattern?: string
  autoComplete?: string
  ltr: boolean
  /** Ce que la frappe devient avant d'atteindre l'état. */
  clean?: (raw: string) => string
  /** Ce que le champ affiche de l'état. */
  show?: (value: string) => string
}

const onlyDigits = (raw: string) => raw.replace(/\D/g, '')
const decimalDigits = (raw: string) => {
  const s = raw.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  return dot === -1 ? s : `${s.slice(0, dot + 1)}${s.slice(dot + 1).replace(/\./g, '')}`
}

export const KIND_DOM: Record<FieldKind, KindDom> = {
  text: { type: 'text', ltr: false },
  name: { type: 'text', autoComplete: 'name', ltr: false },
  phone: {
    type: 'text',
    inputMode: 'numeric',
    pattern: '[0-9]*',
    autoComplete: 'tel',
    ltr: true,
    clean: (raw) => phoneValue(formatPhoneTyping(raw)),
    show: formatPhoneTyping,
  },
  id: { type: 'text', inputMode: 'numeric', pattern: '[0-9]*', autoComplete: 'off', ltr: true, clean: idDigits },
  integer: { type: 'text', inputMode: 'numeric', pattern: '[0-9]*', ltr: true, clean: onlyDigits },
  decimal: { type: 'text', inputMode: 'decimal', ltr: true, clean: decimalDigits },
  code: { type: 'text', inputMode: 'numeric', pattern: '[0-9]*', autoComplete: 'off', ltr: true, clean: onlyDigits },
  email: { type: 'email', inputMode: 'email', autoComplete: 'email', ltr: true },
  date: { type: 'date', ltr: true },
}

/**
 * AM4 — les attributs d'un `kind` pour un `<input>` écrit à la main (écrans qui
 * ne passent pas par `TextField`) : même clavier, même mise en forme.
 */
export function kindInputProps(kind: FieldKind, value: string, onChange: (v: string) => void) {
  const dom = KIND_DOM[kind]
  return {
    type: dom.type,
    inputMode: dom.inputMode,
    pattern: dom.pattern,
    autoComplete: dom.autoComplete,
    dir: dom.ltr ? ('ltr' as const) : undefined,
    'data-kind': kind,
    value: dom.show ? dom.show(value) : value,
    onChange: (e: { target: { value: string } }) =>
      onChange(dom.clean ? dom.clean(e.target.value) : e.target.value),
  }
}

