import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatCoords, isUnresolvableLocationLink, parsePositionList } from '@core/index'
import type { LatLng } from '@core/index'

import { Field } from './fields'
import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF3.1 (2026-09-09) — « COLLER UN LIEN DE LOCALISATION ».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Le PO reçoit des localisations par WhatsApp de fermes qui ne sont pas
 * encore dans la base. » Le chemin actuel est : ouvrir le lien, lire les
 * chiffres, revenir dans l'app, faire glisser une épingle jusqu'à peu près au
 * même endroit. Ce champ est ce chemin en un geste.
 *
 * ★★ LA LECTURE EST CELLE D'AB6, RÉUTILISÉE TELLE QUELLE. `parsePositionInput`
 *    existe depuis l'importateur de prospection et connaît déjà les quatre
 *    formes du brief — Waze (`ll=`, et son `%2C` encodé), Google Maps (`@`,
 *    `query=`, `place/…/@`), les cartes d’Apple (`?ll=`) et le couple brut. La
 *    réécrire ici aurait produit un second analyseur à maintenir, et surtout
 *    une seconde occasion de se tromper de sens.
 *
 * ⚠️ ET L'ORDRE LONGITUDE/LATITUDE EST VÉRIFIÉ PAR LA BOÎTE D'ISRAËL, PAS
 *    SUPPOSÉ. C'est le piège n°1 d'AB6 : le format de l'association écrit
 *    « longitude, latitude », l'inverse de tout le reste, et un couple à
 *    l'envers PARSE parfaitement — il place simplement la ferme en Syrie. Ici
 *    la latitude est ~32 et la longitude ~35, donc une seule des deux lectures
 *    tombe dans la boîte, et c'est celle-là qui est retenue. Un point hors
 *    boîte est REFUSÉ plutôt que posé.
 *
 * ⚠️ UN LIEN RACCOURCI EST DIT, PAS DEVINÉ. `maps.app.goo.gl` et `waze.com/ul/h…`
 *    ne portent aucune coordonnée : la position est derrière une redirection
 *    HTTP que le domaine cible n'autorise pas en CORS. Le champ le dit et
 *    explique quoi faire — l'ouvrir une fois, recopier l'adresse complète —
 *    au lieu de rendre « non reconnu », qui enverrait le PO chercher une faute
 *    de frappe qui n'existe pas.
 */
export function PositionLinkField({
  onResolve,
  className = '',
  label,
  multiple = false,
  applyLabel,
}: {
  onResolve: (position: LatLng) => void
  className?: string
  label?: string
  /**
   * ★ AI5.3 — un bloc collé devient autant de points. Faux pour les champs qui
   *   posent UNE épingle (fiche ferme, rendez-vous) : là, un second lien serait
   *   une ambiguïté et non une liste.
   */
  multiple?: boolean
  /** Le libellé du bouton de validation ; « הצבה על המפה » par défaut. */
  applyLabel?: string
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'done' | 'bad' | 'shortened'>('idle')
  const [placed, setPlaced] = useState<LatLng | null>(null)
  const [added, setAdded] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * ★★ AI5 (2026-09-14) — LE CHAMP SE VIDE, ET LE CURSEUR RESTE DEDANS.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * « Pour ajouter un deuxième point, le PO doit tout sélectionner à la main,
   *   effacer, puis coller par-dessus. C'est le geste qu'il répète le plus. »
   *
   * ★ CE QUI A ÉTÉ LU PART, CE QUI NE L'A PAS ÉTÉ RESTE (AI5.5). Le champ ne
   *   se vide que de ce qu'il a su lire : un bloc de quatre liens dont un
   *   raccourci ajoute trois points et garde le quatrième, avec le motif.
   *   On n'efface jamais une saisie qu'on n'a pas su lire.
   *
   * ⚠️ UN `<textarea>` ET NON UN `<input>`, ET CE N'EST PAS DU STYLE. Un champ
   *    d'une ligne SUPPRIME les retours à la ligne au collage (règle de
   *    nettoyage de la valeur en HTML) : « lien1⏎lien2 » devenait « lien1lien2 »,
   *    un seul lien illisible. Entrée valide, Maj+Entrée va à la ligne.
   *
   * ★ LE FOCUS REVIENT AU CHAMP après la validation au BOUTON aussi — presser
   *   le bouton le lui avait pris, et le PO recolle aussitôt.
   */
  const apply = () => {
    const read = parsePositionList(text)
    const positions = multiple ? read.positions : read.positions.slice(0, 1)
    for (const position of positions) onResolve(position)
    setAdded(positions.length)
    setPlaced(positions[positions.length - 1] ?? null)

    const rest = read.unread.join('\n')
    if (read.unread.length === 0) {
      setText('')
      setState('done')
    } else {
      setText(rest)
      setState(read.unread.every((u) => isUnresolvableLocationLink(u)) ? 'shortened' : 'bad')
    }
    inputRef.current?.focus()
  }

  const rows = Math.min(4, Math.max(1, text.split('\n').length))

  return (
    <Field
      label={label ?? t('pin.linkLabel')}
      hint={t(multiple ? 'pin.linkHintMany' : 'pin.linkHint')}
      className={className}
    >
      <div className="flex flex-wrap items-start gap-2">
        <textarea
          ref={inputRef}
          rows={rows}
          inputMode="url"
          dir="ltr"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          data-testid="position-link"
          className="input ltr-nums min-w-[min(100%,14rem)] flex-1 resize-none text-start"
          placeholder={t('pin.linkPlaceholder')}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setState('idle')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (text.trim() !== '') apply()
            }
          }}
        />
        <button
          type="button"
          className="btn-secondary shrink-0 py-1.5"
          data-testid="position-link-apply"
          disabled={text.trim() === ''}
          /* Le bouton ne prend pas le focus au toucher : le curseur reste
             dans le champ pour le lien suivant. */
          onMouseDown={(e) => e.preventDefault()}
          onClick={apply}
        >
          <Icon name={multiple ? 'plus' : 'pin'} size={15} />
          {applyLabel ?? t('pin.linkApply')}
        </button>
      </div>

      {/* ★ AI5.4 — une confirmation brève, non bloquante, annoncée aux lecteurs
          d'écran : le point qui apparaît dans la liste et sur la carte est la
          vraie confirmation, cette ligne dit seulement combien. */}
      <div aria-live="polite">
        {added > 0 && placed && state !== 'idle' && (
          <p
            data-testid="position-link-done"
            data-added={added}
            className="mt-1.5 flex flex-wrap items-center gap-2 text-micro text-status-success-ink"
          >
            <Icon name="check" size={13} />
            {multiple ? t('pin.linkDoneMany', { count: added }) : t('pin.linkDone')}
            {!multiple && (
              <span className="ltr-nums" dir="ltr">
                {formatCoords(placed)}
              </span>
            )}
          </p>
        )}
      </div>
      {state === 'bad' && (
        <p role="alert" data-testid="position-link-bad" className="mt-1.5 text-micro text-status-danger-ink">
          {t(added > 0 ? 'pin.linkBadRest' : 'pin.linkBad')}
        </p>
      )}
      {state === 'shortened' && (
        <p
          role="alert"
          data-testid="position-link-shortened"
          className="mt-1.5 text-micro text-status-warn-ink"
        >
          {t('pin.linkShortened')}
        </p>
      )}
    </Field>
  )
}
