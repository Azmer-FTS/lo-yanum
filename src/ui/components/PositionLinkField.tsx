import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatCoords, isUnresolvableLocationLink, parsePositionInput } from '@core/index'
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
}: {
  onResolve: (position: LatLng) => void
  className?: string
  label?: string
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'done' | 'bad' | 'shortened'>('idle')
  const [placed, setPlaced] = useState<LatLng | null>(null)

  const apply = () => {
    const position = parsePositionInput(text)
    if (position) {
      setPlaced(position)
      setState('done')
      onResolve(position)
      return
    }
    setPlaced(null)
    setState(isUnresolvableLocationLink(text) ? 'shortened' : 'bad')
  }

  return (
    <Field
      label={label ?? t('pin.linkLabel')}
      hint={t('pin.linkHint')}
      className={className}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="url"
          dir="ltr"
          data-testid="position-link"
          className="input ltr-nums min-w-0 flex-1 text-start"
          placeholder={t('pin.linkPlaceholder')}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setState('idle')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              apply()
            }
          }}
        />
        <button
          type="button"
          className="btn-secondary shrink-0 py-1.5"
          data-testid="position-link-apply"
          disabled={text.trim() === ''}
          onClick={apply}
        >
          <Icon name="pin" size={15} />
          {t('pin.linkApply')}
        </button>
      </div>

      {state === 'done' && placed && (
        <p
          data-testid="position-link-done"
          className="mt-1.5 flex flex-wrap items-center gap-2 text-micro text-status-success-ink"
        >
          <Icon name="check" size={13} />
          {t('pin.linkDone')}
          <span className="ltr-nums" dir="ltr">
            {formatCoords(placed)}
          </span>
        </p>
      )}
      {state === 'bad' && (
        <p role="alert" className="mt-1.5 text-micro text-status-danger-ink">
          {t('pin.linkBad')}
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
