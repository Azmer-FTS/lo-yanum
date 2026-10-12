import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { NEGEV_CENTER, findLocality, formatCoords } from '@core/index'
import type { AddressPoint, LatLng } from '@core/index'

import { proposePointForAddress } from '../geocode'
import { Icon } from './Icon'
import { MapSplit } from './MapSplit'
import type { MapModeState } from './mapMode'
import { PinMap } from './PinMap'
import { PageHeader } from './primitives'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BD 7 (2026-10-12) — LA FORME D'UN FORMULAIRE DE LIEU, UNE FOIS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une ferme, un moshav, un point de garde, une institution, un contact à
 * traiter sont des LIEUX : leur formulaire est une PAGE à carte, la même pour
 * tous (ETAT.md § BD 7, la grammaire des formulaires) :
 *   · ≥ 80 rem : la carte à GAUCHE (règle P0bis.1), le formulaire à droite, à
 *     parts égales ; en dessous, la carte EMPILÉE au-dessus du formulaire
 *     (42 dvh) — sur un téléphone, la même feuille que pour une ferme ;
 *   · la carte est un `PinMap` : toucher (fiche sans point), appui long
 *     (toujours), glisser l'épingle ; l'adresse PROPOSE un point
 *     (`AddressPointField`) que le PO valide ou corrige ;
 *   · le formulaire : l'en-tête de page, des `FormSection`, et `FormActions`
 *     au bas de la fenêtre.
 * `FarmFormScreen` et `AnchorFormScreen` lisent les MÊMES réglages de partage
 * (`PLACE_FORM_SPLIT`) : aucun formulaire de lieu n'a une forme à lui.
 */
export const PLACE_FORM_SPLIT = {
  breakpoint: 'xl',
  contentPercent: 50,
  splitHeight: 'h-[42dvh] min-h-[18rem]',
} as const

export interface PlaceFormMap {
  value: LatLng | null
  onChange: (position: LatLng) => void
  /** Où regarde la carte tant qu'il n'y a pas de point : la localité, sinon le Néguev. */
  locality?: string
  proposal: AddressPoint | null
  onProposal: (next: AddressPoint | null) => void
}

export function PlaceFormPage({
  screenKey,
  family = 'lieu',
  title,
  subtitle,
  back,
  map,
  children,
  actions,
  testId,
}: {
  screenKey: string
  family?: 'lieu'
  title: string
  subtitle?: string
  back: { to: string; label: string }
  map: PlaceFormMap
  children: (state: MapModeState) => ReactNode
  /** La barre du bas (`FormActions`) : toujours la même, toujours là. */
  actions: ReactNode
  testId?: string
}) {
  const { t } = useTranslation()
  const fallback = (map.locality ? findLocality(map.locality)?.position : null) ?? NEGEV_CENTER
  return (
    <MapSplit
      screenKey={screenKey}
      ariaLabel={t('place.positionTitle')}
      breakpoint={PLACE_FORM_SPLIT.breakpoint}
      contentPercent={PLACE_FORM_SPLIT.contentPercent}
      splitHeight={PLACE_FORM_SPLIT.splitHeight}
      map={() => <PinMap flush value={map.value} onChange={map.onChange} fallbackCenter={fallback} proposal={map.proposal} onProposal={map.onProposal} testId={`${screenKey}-map`} />}
    >
      {(state) => (
        <div data-form-family={family} data-testid={testId} data-form-screen={screenKey}>
          <PageHeader title={title} subtitle={subtitle} back={back} />
          <div className="flex flex-col gap-4">{children(state)}</div>
          {actions}
        </div>
      )}
    </MapSplit>
  )
}

/**
 * ★★ BD 1 — « UNE FICHE SANS POSITION LE DIT, ET LE DIRE EST UN BOUTON ».
 * Le bouton mène au geste qui la pose : il montre la carte (au téléphone, la
 * sort de sa cachette), la carte est déjà armée (une fiche sans point l'est
 * d'elle-même) et le curseur va dans le champ d'adresse.
 */
/** Montrer la carte (armée d'elle-même sans point) et mettre le curseur dans l'adresse. */
export function goToPlacing(state?: MapModeState, addressId?: string): void {
  if (state && state.mode === 'hidden') state.setMode('split')
  window.scrollTo({ top: 0, behavior: 'smooth' })
  const map = document.querySelector<HTMLElement>('[data-map-shell] [data-pin-map]')
  map?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  if (addressId) window.setTimeout(() => document.getElementById(addressId)?.focus({ preventScroll: true }), 60)
}

/** ★★ BD 1 — arrivé par « להצבה על המפה » (`?place=1`) : le geste, d'emblée. */
export function PlaceOnArrival({ state, addressId, active }: { state: MapModeState; addressId: string; active: boolean }) {
  const done = useRef(false)
  useEffect(() => {
    if (!active || done.current) return
    done.current = true
    goToPlacing(state, addressId)
  }, [active, state, addressId])
  return null
}

export function NoPositionButton({ state, addressId, testId = 'place-no-position' }: { state?: MapModeState; addressId?: string; testId?: string }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className="btn-secondary min-h-11 border-status-warn text-status-warn-ink"
      data-testid={testId}
      onClick={() => goToPlacing(state, addressId)}
    >
      <Icon name="pin" size={16} />
      <span>
        {t('place.noPosition')} · <span className="font-semibold">{t('place.placeIt')}</span>
      </span>
    </button>
  )
}

/**
 * ★★ BD 1 — L'ADRESSE, ET LE POINT QU'ELLE PROPOSE. Saisir puis quitter le
 * champ (ou « חיפוש במפה ») cherche un point (`proposePointForAddress` : lien
 * ou coordonnées collés, l'adresse en ligne, sinon la localité) ; la carte le
 * montre en épingle creuse, et le PO le valide ou le corrige. Rien n'est posé
 * sans lui. L'adresse elle-même est enregistrée (`onAddress`).
 */
export function AddressPointField({
  id,
  value,
  onAddress,
  locality = '',
  onProposal,
  position,
  onClear,
}: {
  id: string
  value: string
  onAddress: (address: string) => void
  locality?: string
  onProposal: (p: AddressPoint | null) => void
  /** Le point actuel : lu, avec le geste qui le retire. */
  position: LatLng | null
  onClear?: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(value)
  const [state, setState] = useState<'idle' | 'finding' | 'none'>('idle')
  const asked = useRef('')
  useEffect(() => {
    setText(value)
  }, [value])
  const find = async (raw = text) => {
    const address = raw.trim()
    if (!address) return
    asked.current = address
    setState('finding')
    const hit = await proposePointForAddress(address, locality)
    if (asked.current !== address) return
    setState(hit ? 'idle' : 'none')
    onProposal(hit)
  }
  const commit = () => {
    const address = text.trim()
    if (address !== value.trim()) {
      onAddress(address)
      void find(address)
    }
  }
  return (
    <div className="col-span-full flex flex-col gap-2" data-testid="place-address" data-state={state}>
      <label className="block" htmlFor={id}>
        <span className="label">{t('place.address')}</span>
      </label>
      <div className="flex flex-wrap items-stretch gap-2">
        <input
          id={id}
          className="input min-w-[12rem] flex-1"
          dir="auto"
          value={text}
          placeholder={t('place.addressHint')}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
              void find()
            }
          }}
          data-testid="place-address-input"
        />
        <button type="button" className="btn-secondary min-h-11" onClick={() => void find()} disabled={!text.trim() || state === 'finding'} data-testid="place-address-find">
          <Icon name="search" size={16} />
          {state === 'finding' ? t('place.finding') : t('place.findOnMap')}
        </button>
      </div>
      {state === 'none' && (
        <p className="text-micro text-status-warn-ink" role="status" data-testid="place-address-none">
          {t('place.notFound')}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-2 text-caption text-content-secondary" data-testid="place-position" data-has-position={position ? 'true' : 'false'}>
        <Icon name="pin" size={14} />
        {position ? (
          <>
            <span className="ltr-nums" dir="ltr" data-testid="place-position-value">
              {formatCoords(position)}
            </span>
            {onClear && (
              <button type="button" className="btn-ghost min-h-11" onClick={onClear} data-testid="place-position-clear">
                <Icon name="close" size={14} />
                {t('place.clear')}
              </button>
            )}
          </>
        ) : (
          <span className="font-semibold text-status-warn-ink">{t('place.noPosition')}</span>
        )}
      </p>
    </div>
  )
}
