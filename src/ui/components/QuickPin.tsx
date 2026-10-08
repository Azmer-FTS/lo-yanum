import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import {
  createFarm,
  createInstitution,
  createLandmark,
  createLeads,
  deleteLandmark,
  isPinNameValid,
  nearestLocalities,
  updateLandmark,
} from '@core/index'
import type { LatLng, Landmark } from '@core/index'

import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AV2 (2026-10-08) — POSER UNE ÉPINGLE : LE NOM D'ABORD, LA NATURE ENSUITE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vécu en rendez-vous : le PO voulait montrer un lieu absent de l'app et n'a
 * rien pu faire — il fallait un formulaire, puis une adresse. Ici l'ordre est
 * celui du terrain : le DOIGT désigne le lieu, la fenêtre demande UN nom, puis
 * ce que c'est. La fiche naît avec ce nom et ce point ; le reste attend.
 *
 * ⛔ PAS D'ÉPINGLE SANS NOM (A324) : « המשך » reste éteint, Entrée ne fait
 *    rien, et `createLandmark` refuse aussi un nom vide (la base également).
 *
 * ★ QUATRE NATURES, PAS TROIS. Aux trois du PO (ferme, institution, repère)
 *   s'ajoute la PISTE : en rendez-vous, « il y a un éleveur là-bas qui aurait
 *   besoin de vous » n'est pas encore une ferme — c'est un contact à appeler.
 *   Une piste va dans la salle d'attente, ne compte nulle part (AS6.8), et se
 *   convertit en ferme le jour où il dit oui. Créer une FERME pour ça
 *   gonflerait le pipeline d'une ligne que personne n'a démarchée.
 *   Pas de « rendez-vous » : il exige une date et une heure, donc un
 *   formulaire — le contraire de ce geste.
 *
 * ★ LA LOCALITÉ N'EST PAS DEVINÉE DANS LA FICHE. Elle est AFFICHÉE (« ליד
 *   נתיבות · 2 ק״מ ») pour situer, mais une ferme naît avec יישוב vide : une
 *   localité supposée à 2 km serait une donnée fausse que personne n'a dite.
 */

export type PinKind = 'farm' | 'institution' | 'lead' | 'landmark'
const KINDS: ReadonlyArray<{ kind: PinKind; icon: IconName; tone: string }> = [
  { kind: 'farm', icon: 'farm', tone: 'bg-status-success/15 text-status-success-ink' },
  { kind: 'institution', icon: 'users', tone: 'bg-status-violet/15 text-status-violet-ink' },
  { kind: 'lead', icon: 'userPlus', tone: 'bg-status-warn/15 text-status-warn-ink' },
  { kind: 'landmark', icon: 'pin', tone: 'bg-status-info/15 text-status-info-ink' },
]

export interface PinCreated {
  kind: PinKind
  id: string
  name: string
}

export function createPinned(kind: PinKind, name: string, position: LatLng): PinCreated | null {
  const clean = name.trim()
  if (!isPinNameValid(clean)) return null
  if (kind === 'farm') {
    const f = createFarm({
      photo: null,
      name: clean,
      locality: '',
      region: '',
      type: 'unknown',
      status: 'to_contact',
      position,
      positionMissing: false,
      farmDunams: 0,
      grazingDunams: 0,
      contacts: [],
      commitments: [],
      agreements: [],
      notes: '',
    })
    return { kind, id: f.id, name: clean }
  }
  if (kind === 'institution') {
    const i = createInstitution({ name: clean, locality: '', kind: 'other', audience: 'unknown', position, positionSource: 'סומן ביד על המפה' })
    return { kind, id: i.id, name: clean }
  }
  if (kind === 'lead') {
    const [l] = createLeads([{ name: clean, contactName: '', phone: '', place: '', position, regionId: null, notes: '', source: 'manual', raw: '' }])
    return { kind, id: l.id, name: clean }
  }
  const lm = createLandmark({ name: clean, position })
  return lm ? { kind, id: lm.id, name: clean } : null
}

export const pinHref = (c: PinCreated): string | null =>
  c.kind === 'farm' ? `#/coordinator/farms/${c.id}` : c.kind === 'lead' ? '#/coordinator/leads' : c.kind === 'institution' ? '#/coordinator/coverage' : null

export function QuickPinSheet({
  position,
  landmark,
  onClose,
  onCreated,
}: {
  position: LatLng
  /** Un repère existant touché : renommer ou supprimer. */
  landmark?: Landmark | null
  onClose: () => void
  onCreated: (c: PinCreated) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(landmark?.name ?? '')
  const [step, setStep] = useState<'name' | 'kind'>('name')
  const input = useRef<HTMLInputElement | null>(null)
  const near = nearestLocalities(position, 1)[0]
  const valid = isPinNameValid(name)

  useEffect(() => {
    /**
     * ★★ LE CLAVIER S'OUVRE SANS UN TOUCHER DE PLUS — ET C'EST LE DOIGT QUI
     *    LÈVE QUI L'OUVRE. La fenêtre naît PENDANT l'appui long, doigt posé ;
     *    quand il se lève, le `touchend` rend le focus à la carte (mesuré par
     *    `avui` au vrai doigt : focus vide). Et iPadOS n'ouvre le clavier que
     *    dans un geste de l'utilisateur. Le focus est donc repris DANS le
     *    `pointerup`/`touchend` qui termine l'appui, en plus du premier essai.
     */
    const focus = () => input.current?.focus()
    const id = window.setTimeout(focus, 60)
    const lift = () => {
      focus()
      window.setTimeout(focus, 0)
    }
    window.addEventListener('pointerup', lift, { capture: true, once: true })
    window.addEventListener('touchend', lift, { capture: true, once: true })
    const stop = window.setTimeout(() => {
      window.removeEventListener('pointerup', lift, true)
      window.removeEventListener('touchend', lift, true)
    }, 3000)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => {
      window.clearTimeout(id)
      window.clearTimeout(stop)
      window.removeEventListener('pointerup', lift, true)
      window.removeEventListener('touchend', lift, true)
      window.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const next = () => {
    if (!valid) return
    if (landmark) {
      updateLandmark(landmark.id, { name: name.trim() })
      onClose()
      return
    }
    setStep('kind')
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center" data-testid="quick-pin" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="quick-pin-title" className="w-full max-w-md rounded-card bg-surface-overlay p-5 shadow-lift">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-accent-ink"><Icon name="pin" size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="quick-pin-title" className="text-heading text-content-primary">
              {landmark ? t('quickPin.landmarkTitle') : step === 'name' ? t('quickPin.nameTitle') : t('quickPin.kindTitle', { name: name.trim() })}
            </h2>
            <p className="muted mt-0.5 text-caption ltr-nums" data-testid="quick-pin-where">
              {near ? t('map.nearLocality', { name: near.locality.name, km: near.km.toFixed(near.km < 10 ? 1 : 0) }) : `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="shrink-0 rounded-field p-2 text-content-muted hover:bg-surface-high" data-testid="quick-pin-cancel">
            <Icon name="close" size={18} />
          </button>
        </div>

        {step === 'name' ? (
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault()
              next()
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-caption font-semibold text-content-secondary">{t('quickPin.name')}</span>
              <input
                ref={input}
                className="input min-h-12 text-body"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('quickPin.namePlaceholder')}
                enterKeyHint="next"
                autoComplete="off"
                data-testid="quick-pin-name"
                aria-required="true"
              />
            </label>
            {!valid && <p className="mt-1.5 text-micro text-content-muted">{t('quickPin.nameRequired')}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" className="btn-primary min-h-12 flex-1" disabled={!valid} data-testid="quick-pin-next">
                {landmark ? t('quickPin.save') : t('quickPin.next')}
              </button>
              {landmark && (
                <button
                  type="button"
                  className="btn-danger min-h-12"
                  data-testid="quick-pin-delete"
                  onClick={() => {
                    deleteLandmark(landmark.id)
                    onClose()
                  }}
                >
                  <Icon name="trash" size={16} />
                  {t('quickPin.delete')}
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="mt-4">
            <div className="grid grid-cols-2 gap-2" data-testid="quick-pin-kinds">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  data-testid={`quick-pin-kind-${k.kind}`}
                  onClick={() => {
                    const created = createPinned(k.kind, name, position)
                    if (created) onCreated(created)
                  }}
                  className="flex min-h-[6rem] flex-col items-start justify-between rounded-card bg-surface-raised p-3 text-start shadow-card transition-colors hover:bg-surface-high"
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-field ${k.tone}`}>
                    <Icon name={k.icon} size={20} />
                  </span>
                  <span>
                    <span className="block text-caption font-bold text-content-primary">{t(`quickPin.kind.${k.kind}`)}</span>
                    <span className="block text-micro text-content-muted">{t(`quickPin.kindHint.${k.kind}`)}</span>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" className="btn-ghost mt-3" onClick={() => setStep('name')} data-testid="quick-pin-back">
              {t('quickPin.back')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
