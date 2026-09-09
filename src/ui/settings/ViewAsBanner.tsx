import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Icon } from '../components/Icon'
import { stopViewAs, useViewAs } from './viewAs'

/**
 * ★★ Y13 (2026-09-04) — "BANDEAU DISCRET RAPPELANT LE RÔLE SIMULÉ."
 * ★★ AG1.4 (2026-09-09) — ET IL EST PERMANENT, NON MASQUABLE, ET IL DIT AUSSI
 *    QUE RIEN N'EST POSSIBLE.
 *
 * « Bandeau permanent et non masquable indiquant qui l'on regarde, et un
 *   bouton de retour immédiat au rôle de coordinateur. »
 *
 * ★ « NON MASQUABLE » EST UNE PROPRIÉTÉ DE STRUCTURE, PAS UNE ABSENCE DE
 *   BOUTON. Il n'y a pas de croix parce qu'il n'y a nulle part où ranger un
 *   état « masqué » : ce composant n'a aucun état, il lit `useViewAs()` et
 *   rend ou ne rend pas. Un bandeau qui se ferme serait un bandeau dont il
 *   faudrait mémoriser la fermeture, et le PO se retrouverait un soir devant
 *   l'écran d'un agriculteur sans rien qui le lui dise.
 *
 * ★ ET IL PORTE « לקריאה בלבד », PARCE QUE LE SILENCE SERAIT PIRE QUE LE GRIS.
 *   Un bouton désactivé sans raison affichée est un bouton cassé ; le bandeau
 *   est l'endroit où la raison tient une fois pour tout l'écran, plutôt que
 *   dix-sept fois à côté de dix-sept boutons.
 *
 * Rendered by the FIELD shell, so it is on every screen the simulated role
 * has, and nowhere else — a coordinator looking at his own dashboard is not
 * simulating anything and must not be told he is.
 *
 * ★ THE WAY BACK IS ON THE BANNER, and that is the whole reason the banner is
 *   in the shell rather than a card on one screen. A simulated farmer has no
 *   הגדרות to return from: three tabs, none of them settings. If the exit
 *   lived only in the section that opened the door, stepping into a farmer's
 *   screen would be a one-way trip ending in clearing site data.
 *
 * ⚠️ AND IT LIVES INSIDE THE STICKY HEADER, WHICH THE FIRST VERSION DID NOT.
 *   It was a sibling below the header on the reasoning that a second pinned
 *   strip costs a phone a second slice of its screen — true, and beside the
 *   point: the first capture showed it scrolled out of sight on a farmer's
 *   screen, i.e. the way back gone. Twenty-eight pixels, only while a
 *   simulation is running, is the right price for the exit always being one
 *   tap away.
 */
export function ViewAsBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const active = useViewAs()
  if (!active) return null

  return (
    <div
      data-testid="view-as-banner"
      className="border-b border-accent/30 bg-accent/10"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-1.5">
        <Icon name="users" size={13} className="shrink-0 text-accent-ink" />
        <span className="min-w-0 flex-1 truncate text-micro text-accent-ink">
          {t('viewAs.banner', {
            role: t(`roles.${active.role}`),
            name: active.name,
          })}
        </span>
        {/* ★ AG1.2 — l'état, pas une décoration : c'est ce qui explique chaque
            bouton gris de l'écran, et il tient dans une pastille. */}
        <span
          data-testid="view-as-readonly"
          className="chip shrink-0 bg-accent/20 text-accent-ink"
        >
          <Icon name="eye" size={11} />
          {t('viewAs.readOnly')}
        </span>
        <button
          type="button"
          onClick={() => {
            stopViewAs()
            navigate('/coordinator')
          }}
          data-testid="view-as-banner-stop"
          className="shrink-0 rounded-field px-2 py-1 text-micro font-semibold text-accent-ink
                     transition-colors duration-fast hover:bg-accent/15"
        >
          {t('viewAs.back')}
        </button>
      </div>
    </div>
  )
}
