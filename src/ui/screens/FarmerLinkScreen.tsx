import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { decodeFarmerToken, setSession } from '@core/index'
import { _raw } from '@core/store'

import { useChallenge } from '../challenge'
import { PhoneChallenge } from '../components/PhoneChallenge'
import { writeFarmerPass } from '../farmerPass'
import { useCoreValue } from '../hooks/useCore'
import { LinkExpiredScreen } from './GuardLinkScreen'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG3.1 (2026-09-09) — LA PORTE D'ENTRÉE D'UN AGRICULTEUR : UNE URL, ET
 *    ELLE NE PÉRIME PAS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le pendant de `GuardLinkScreen`, avec trois différences et elles sont toutes
 * dans le brief :
 *
 *   · LE JETON NE PORTE PAS DE DATE (voir `FarmerToken` dans core/invite.ts).
 *     Il n'y a donc pas d'écran « expiré » sur ce chemin — seulement un écran
 *     « ce lien ne dit rien », qui est le cas d'une URL abîmée en route par un
 *     client SMS qui a coupé la ligne.
 *   · LA PORTE D'AG2 EST TRAVERSÉE AVANT QUE QUOI QUE CE SOIT SOIT ÉCRIT. Même
 *     règle et même raison qu'en AE1 : rien n'atterrit sur l'appareil de
 *     quelqu'un qui n'a pas répondu.
 *   · ET LE JETON EST GARDÉ SUR L'APPAREIL, parce que le manifeste d'une PWA
 *     ne peut pas être personnel — voir la note en tête de `ui/farmerPass.ts`,
 *     qui est ce qui fait qu'une icône posée sur l'écran d'accueil rouvre SON
 *     espace et non la racine.
 *
 * ⚠️ ET LA MÊME MOITIÉ RESTE À FAIRE EN LOT 1 QU'EN AE1, DITE ICI PLUTÔT QUE
 *    DÉCOUVERTE. Dans le jumeau, le magasin est semé de fixtures et la fiche
 *    est trouvée. Dans une installation réelle branchée sur Postgres, un
 *    visiteur ANONYME n'a rien hydraté : les politiques RLS répondent à un
 *    `authenticated` et il ne l'est pas. La lecture par jeton demande une
 *    fonction de bord qui vérifie la signature côté serveur et rende la fiche ;
 *    c'est le seul morceau qui ne peut pas vivre dans le navigateur, et rien
 *    d'autre ici ne changera quand elle existera — ce bloc gagnera un `await`.
 */
export function FarmerLinkScreen() {
  const { t } = useTranslation()
  const { token: raw } = useParams<{ token: string }>()
  const [state, setState] = useState<'opening' | 'ok' | 'malformed'>('opening')

  /**
   * ⚠️ LE NUMÉRO INTERROGÉ EST CELUI DU CONTACT DE LA FICHE, ET LA CASCADE EST
   *    ÉCRITE PLUTÔT QUE DEVINÉE : le portable du contact d'abord (c'est à lui
   *    que le lien a été envoyé), puis `farmerPhone` de la fiche. Les deux
   *    existent et ne sont pas toujours le même — AA2 les a séparés exprès.
   */
  const target = useCoreValue(() => {
    const read = decodeFarmerToken(raw ?? '')
    if (read.status !== 'valid') return null
    const d = _raw()
    const farm = d.farms.find((f) => f.id === read.token.farmId) ?? null
    if (!farm) return null
    const contact = farm.contacts.find((c) => c.id === read.token.contactId) ?? null
    return {
      contactId: read.token.contactId,
      phone: (contact?.phone ?? '').trim() || (farm.farmerPhone ?? '').trim(),
    }
  })

  const challenge = useChallenge(target?.contactId ?? '', target?.phone ?? '')
  const locked = target !== null && challenge.state !== 'open'

  useEffect(() => {
    if (locked) return
    const read = decodeFarmerToken(raw ?? '')
    if (read.status !== 'valid') {
      setState('malformed')
      return
    }
    writeFarmerPass(read.token)
    setSession({ role: 'farmer', entityId: read.token.contactId })
    setState('ok')
  }, [raw, locked])

  if (locked && target) {
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

  if (state === 'opening') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="skeleton h-40 w-full max-w-sm rounded-card" />
      </div>
    )
  }
  if (state === 'malformed') return <LinkExpiredScreen />

  /* ⚠️ REMPLACEMENT COMPLET DU HASH ET NON `<Navigate>`, même raison qu'en
     AE1 : le rôle vient d'être posé, et le routeur doit remonter la garde de
     rôle avec la NOUVELLE session plutôt que de reconcilier un écran monté
     sous l'ancienne. */
  return <Redirect to="/farmer" />
}

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.hash = `#${to}`
  }, [to])
  return null
}
