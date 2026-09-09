import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CHALLENGE_DIGITS, challengeMatches, readCoordinator, telHref } from '@core/index'
import type { ChallengeStatus } from '@core/index'

import { recordFailure, rememberUnlock } from '../challenge'
import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG2 (2026-09-09) — LA PORTE DES QUATRE CHIFFRES, TELLE QU'ON LA VOIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★ CE N'EST PAS UN ÉCRAN DE CONNEXION, ET CHAQUE CHOIX ICI VIENT DE LÀ.
 *    La personne devant l'écran est un agriculteur de soixante ans, seul, un
 *    dimanche soir, sur le téléphone que sa fille lui a configuré. Il n'a
 *    jamais créé de compte de sa vie et il ne doit pas avoir l'impression d'en
 *    créer un maintenant.
 *
 *    · UN SEUL CHAMP, `inputmode="numeric"`, quatre chiffres. Pas quatre
 *      cases séparées : elles sont jolies et elles cassent le collage, le
 *      correcteur, et la touche « effacer » d'un clavier hébreu.
 *    · LA QUESTION EST POSÉE EN CLAIR — « les quatre derniers chiffres de
 *      votre portable » — parce que c'est la seule formulation qui n'a pas
 *      besoin d'être devinée. Un « קוד » sans explication enverrait chercher
 *      un SMS qui n'arrivera pas.
 *    · LE NUMÉRO DU COORDINATEUR EST SUR L'ÉCRAN DÈS LE PREMIER AFFICHAGE, pas
 *      seulement après trois échecs (AG2.4). Le pire moment pour découvrir
 *      qu'on ne peut pas entrer est celui où on en a besoin — c'est la leçon
 *      d'AE1.5, appliquée à la porte au lieu du lien expiré.
 *
 * ⚠️ ET IL N'Y A PAS DE BOUTON « PLUS TARD ». Une porte qu'on peut contourner
 *    n'est pas une porte ; ce qu'il y a à la place est le téléphone du
 *    coordinateur, qui est le vrai recours quand la fiche porte un numéro
 *    périmé.
 */
export function PhoneChallenge({
  personId,
  phone,
  status,
  title,
  subtitle,
}: {
  personId: string
  /** Le numéro porté par la fiche. C'est lui qui fait foi, jamais la saisie. */
  phone: string
  status: ChallengeStatus
  title: string
  subtitle: string
}) {
  const { t } = useTranslation()
  const coordinator = readCoordinator()
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)
  /* AG2.3 — le compte à rebours se rafraîchit tout seul, sinon l'écran dirait
     « attendez 2:30 » pendant deux minutes trente. */
  const [, tick] = useState(0)
  const input = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (status.state !== 'wait') return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [status.state])

  const waiting = status.state === 'wait'
  const seconds = Math.ceil(status.waitMs / 1000)

  const submit = (): void => {
    if (waiting) return
    if (challengeMatches(value, phone)) {
      rememberUnlock(personId)
      return
    }
    recordFailure(personId)
    setWrong(true)
    setValue('')
    input.current?.focus()
  }

  return (
    <div
      data-testid="phone-challenge"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 p-6"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-pill bg-accent/15 text-accent-ink">
          <Icon name="shield" size={30} />
        </span>
        <h1 className="text-title">{title}</h1>
        <p className="text-caption leading-relaxed text-content-secondary">{subtitle}</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="label" htmlFor="challenge-digits">
          {t('challenge.label', { n: CHALLENGE_DIGITS })}
        </label>
        <input
          id="challenge-digits"
          ref={input}
          data-testid="challenge-input"
          /* ⚠️ `type="text"` ET `inputMode="numeric"`, JAMAIS `type="number"` :
             celui-ci met des flèches, accepte « e » et « - », et perd les
             zéros de tête — or un numéro israélien en est plein. */
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={CHALLENGE_DIGITS}
          disabled={waiting}
          value={value}
          onChange={(e) => {
            setWrong(false)
            setValue(e.target.value.replace(/[^0-9]/g, '').slice(0, CHALLENGE_DIGITS))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          className="input ltr-nums text-center text-title tracking-[0.5em]"
          dir="ltr"
        />

        {wrong && !waiting && (
          <p
            role="alert"
            data-testid="challenge-wrong"
            className="chip bg-status-danger/15 text-status-danger-ink"
          >
            {t('challenge.wrong')}
          </p>
        )}

        {waiting && (
          /* AG2.3 — l'attente est dite en secondes et elle DESCEND. « Réessayez
             plus tard » est la phrase qui fait fermer l'application. */
          <p
            role="alert"
            data-testid="challenge-wait"
            className="chip bg-status-warn/15 text-status-warn-ink"
          >
            {t('challenge.wait', { seconds })}
          </p>
        )}

        <button
          type="button"
          data-testid="challenge-submit"
          onClick={submit}
          disabled={waiting || value.length < CHALLENGE_DIGITS}
          className="btn-primary btn-big mt-1"
        >
          <Icon name="check" size={19} />
          {t('challenge.enter')}
        </button>
      </div>

      {/* ★ AG2.4 — L'ÉCHEC A UN RECOURS, ET IL EST SUR L'ÉCRAN DÈS LE DÉBUT. */}
      <div className="rounded-card border border-edge-subtle p-4">
        <p className="text-caption text-content-secondary">{t('challenge.stuck')}</p>
        <a
          href={telHref(coordinator.phone)}
          data-testid="challenge-coordinator"
          className="mt-2 flex min-h-14 items-center justify-between gap-3 rounded-field bg-accent px-4 text-content-on-accent"
        >
          <span className="truncate text-caption font-semibold">{coordinator.name}</span>
          <span className="ltr-nums shrink-0 text-heading" dir="ltr">
            {coordinator.phone}
          </span>
        </a>
      </div>
    </div>
  )
}
