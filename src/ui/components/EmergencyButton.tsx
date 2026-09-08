import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE2 (2026-09-08) — « ATTEIGNABLE EN UN GESTE DEPUIS N'IMPORTE OÙ ».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★ DEUX FORMES, ET LA RAISON EST LE DÉFAUT D'AA1 QU'ON NE REFERA PAS.
 *
 *    A86 : le « + » flottant s'est posé sur une pastille, et « un contrôle que
 *    le bouton couvre est inatteignable pour toujours ». Le contrôle couvert
 *    serait ici un numéro d'urgence. Il y a deux façons de garantir qu'il n'y
 *    a pas de recouvrement — mesurer, ou faire qu'il n'y ait pas deux objets
 *    flottants. La seconde est la seule qui reste vraie quand quelqu'un ajoute
 *    un troisième bouton dans six mois.
 *
 *      · DANS LES COQUILLES DE TERRAIN (volontaire, conducteur, agriculteur)
 *        il n'y a PAS de « + » — `ActionFab` est un objet du coordinateur.
 *        Le bouton d'urgence y est donc flottant, à 64 px, au-dessus de la
 *        barre d'onglets, sous le pouce. C'est là qu'est l'utilisateur du
 *        brief.
 *
 *      · DANS LA COQUILLE DU COORDINATEUR, où le « + » vit, il n'est PAS
 *        flottant : il est dans la barre d'en-tête sur téléphone et dans le
 *        rail sur grand écran. Un geste dans les deux cas, et zéro pixel
 *        partagé avec le « + » par construction plutôt que par mesure.
 *
 *    A124 mesure quand même les deux rectangles, parce qu'une porte vérifie la
 *    règle et non l'intention.
 *
 * ⚠️ ET IL NE SE DESSINE PAS SUR SA PROPRE ROUTE. Un bouton « urgence » posé
 *    sur l'écran d'urgence est un bouton qui couvre le bloc des numéros — le
 *    défaut d'AA1, exactement, appliqué à l'écran qui peut le moins se le
 *    permettre.
 */

export const EMERGENCY_ROUTE = '/sos'

/** La forme flottante — coquilles de terrain et laissez-passer. */
export function EmergencyFab() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (pathname === EMERGENCY_ROUTE) return null

  return (
    <button
      type="button"
      data-testid="emergency-fab"
      data-emergency-launcher=""
      onClick={() => navigate(EMERGENCY_ROUTE)}
      aria-label={t('emergency.title')}
      /**
       * ⚠️ `end-…` — LA FIN DE LA LIGNE, QUI DANS CETTE APP HÉBRAÏQUE EST LA
       *    GAUCHE PHYSIQUE, ET LE COIN A ÉTÉ CHOISI PAR CE QUI OCCUPE L'AUTRE.
       *
       *    Le coin du DÉBUT (droite physique) n'est pas libre dans une coquille
       *    de terrain : le disque « voir en tant que » du bandeau de
       *    démonstration y est posé (`DevToolbar`, `start-[var(--map-rail)]`).
       *    Deux disques dans le même coin, c'est le défaut A86 exactement — un
       *    contrôle couvert par un autre — et celui qui perdrait ici serait
       *    l'urgence.
       *
       *    Le « + » du coordinateur occupe CE coin-ci, mais il n'existe pas
       *    dans cette coquille : `ActionFab` n'est monté que par
       *    `CoordinatorLayout`, où l'urgence n'est justement pas flottante.
       *    Les deux ne sont donc jamais dessinés ensemble, et A124 le mesure.
       *
       * ⚠️ ET LE DÉCALAGE VERTICAL REPREND LES TROIS TERMES DU DISQUE :
       *    `--shell-foot` (la barre d'onglets), `--pinned-foot` (la barre
       *    d'actions qu'un formulaire épingle) et `--shell-bottom`. Un bouton
       *    qui n'en compterait que le premier se poserait sur la barre
       *    d'actions d'un écran de rapport, ce que `bun run layout` a déjà
       *    trouvé une fois pour le disque.
       */
      className="fixed bottom-[calc(var(--shell-foot)+var(--pinned-foot,0px)+var(--shell-bottom)+1.25rem)]
                 end-[var(--map-rail)] z-40 flex h-16 w-16 items-center justify-center
                 rounded-pill bg-critical text-content-on-accent shadow-lift
                 transition-transform duration-fast active:scale-95"
    >
      <Icon name="alert" size={28} />
    </button>
  )
}

/** La forme en ligne — barre d'en-tête et rail du coordinateur. */
export function EmergencyLink({ expanded = true }: { expanded?: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (pathname === EMERGENCY_ROUTE) return null

  return (
    <button
      type="button"
      data-testid="emergency-link"
      data-emergency-launcher=""
      onClick={() => navigate(EMERGENCY_ROUTE)}
      title={expanded ? undefined : t('emergency.title')}
      aria-label={t('emergency.title')}
      className={`flex min-h-11 items-center gap-2 rounded-field bg-critical/10 px-3 py-2 text-caption font-semibold
                  text-critical transition-colors duration-fast hover:bg-critical/20 ${
                    expanded ? '' : 'justify-center px-0'
                  }`}
    >
      <Icon name="alert" size={19} />
      {expanded && <span className="truncate">{t('emergency.title')}</span>}
    </button>
  )
}
