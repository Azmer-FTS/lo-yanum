import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { _raw } from '@core/store'

import { useChallenge } from '../../challenge'
import { PhoneChallenge } from '../../components/PhoneChallenge'
import { useFarmerPass } from '../../farmerPass'
import { useCoreValue } from '../../hooks/useCore'
import { useViewAs } from '../../settings/viewAs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG2.1 (2026-09-09) — LA PORTE EST SUR LA COQUILLE, PAS SUR L'ÉCRAN DU
 *    LIEN, ET C'EST UN DÉFAUT QUE `bun run agui` A TROUVÉ EN M'ATTENDANT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CE QUI ÉTAIT FAUX, ET POURQUOI ÇA SE VOYAIT MAL. La première version ne
 *    posait la question que dans `FarmerLinkScreen` — l'écran de `#/f/<jeton>`.
 *    C'est le chemin qu'on emprunte une fois : ensuite le laissez-passer est
 *    sur l'appareil (`ui/farmerPass.ts`), l'icône de l'écran d'accueil ouvre la
 *    RACINE, et la racine mène à `/farmer` **sans repasser par cet écran**.
 *    Donc dès que la mémoire des quatre chiffres expirait — ou qu'on
 *    l'effaçait — l'application continuait de s'ouvrir sur la fiche, les
 *    numéros et les gardes de l'agriculteur, sans rien demander à personne.
 *    C'est-à-dire précisément le cas contre lequel AG2 existe, arrivé par la
 *    porte de derrière.
 *
 *    La porte l'a trouvé de la façon la plus bête : elle a effacé la mémoire,
 *    rechargé, et attendu quarante-cinq secondes un champ qui n'est jamais
 *    venu. Aucune relecture ne l'aurait vu, parce que le code de l'écran du
 *    lien était juste — c'est le CHEMIN qui manquait.
 *
 * ★★ LA RÈGLE QUI EN SORT : une porte se pose sur ce qu'elle GARDE, pas sur le
 *    couloir par lequel on est entré la première fois.
 *
 * ⚠️ ET ELLE NE S'APPLIQUE PAS AU COORDINATEUR EN MODE « VOIR COMME ». Il est
 *    déjà authentifié, il voit déjà tout, et lui demander les quatre chiffres
 *    d'un agriculteur pour regarder un écran qu'il pourrait lire sur la fiche
 *    serait une porte qui ne protège rien contre quelqu'un qui est déjà
 *    dedans. `useViewAs()` est la distinction, et c'est la même que celle qui
 *    rend le mode acceptable : la direction va toujours vers MOINS de droits.
 */
export function FarmerGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const pass = useFarmerPass()
  const simulating = useViewAs()

  /**
   * ⚠️ LE NUMÉRO EST RELU SUR LA FICHE À CHAQUE RENDU, JAMAIS COPIÉ DANS LE
   *    LAISSEZ-PASSER. Si le coordinateur corrige un portable faux — le cas
   *    exact qui envoie un agriculteur téléphoner — la porte accepte le nouveau
   *    numéro dès la synchronisation suivante. Un numéro figé dans le
   *    laissez-passer aurait gardé la mauvaise réponse pour toujours.
   */
  const target = useCoreValue(() => {
    if (!pass) return null
    const d = _raw()
    const farm = d.farms.find((f) => f.id === pass.farmId) ?? null
    if (!farm) return null
    const contact = farm.contacts.find((c) => c.id === pass.contactId) ?? null
    return {
      contactId: pass.contactId,
      phone: (contact?.phone ?? '').trim() || (farm.farmerPhone ?? '').trim(),
    }
  })

  const challenge = useChallenge(target?.contactId ?? '', target?.phone ?? '')

  if (simulating === null && target !== null && challenge.state !== 'open') {
    return (
      <PhoneChallenge
        personId={target.contactId}
        phone={target.phone}
        status={challenge}
        title={t('challenge.farmerTitle')}
        subtitle={t('challenge.farmerSubtitle')}
      />
    )
  }

  return <>{children}</>
}
