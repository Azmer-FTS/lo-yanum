import { useTranslation } from 'react-i18next'

import { isTestId } from '@core/index'

/**
 * ★★ AH3.2 (2026-09-09) — « TOUT PORTE UNE MARQUE VISIBLE נתוני בדיקה SUR LA
 *    FICHE ET DANS LES LISTES. AUCUNE AMBIGUÏTÉ POSSIBLE AVEC DE VRAIES
 *    DONNÉES. »
 *
 * ★ UNE SEULE PASTILLE, ET ELLE LIT L'IDENTIFIANT. Pas un champ `isTest` sur
 *   six types — un champ pareil serait une seconde vérité que la suppression
 *   (qui, elle, regarde le préfixe) pourrait contredire. L'id EST la marque
 *   depuis N3 ; cette pastille ne fait que la rendre visible.
 *
 * ⚠️ ET ELLE PREND LE TON D'AVERTISSEMENT, PAS UN TON NEUTRE. « Ceci n'est pas
 *    réel » est une information qu'on doit voir du coin de l'œil sur une liste
 *    qu'on parcourt ; une pastille grise se lit comme une étiquette de plus.
 */
export function TestDataBadge({ id, className = '' }: { id: string; className?: string }) {
  const { t } = useTranslation()
  if (!isTestId(id)) return null
  return (
    <span
      data-testid="test-data-badge"
      className={`chip shrink-0 bg-status-warn/20 text-status-warn-ink ${className}`}
    >
      {t('testData.badge')}
    </span>
  )
}
