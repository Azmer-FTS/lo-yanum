import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import {
  EMERGENCY_SERVICES,
  buildGuardPass,
  decodeGuardToken,
  emergencyEntries,
  localEmergencyNumbers,
  readCoordinator,
  setSession,
  telHref,
} from '@core/index'
import type { GuardToken } from '@core/index'
import { _raw } from '@core/store'

import { useCoreValue } from '../hooks/useCore'

import { Icon } from '../components/Icon'
import { PhoneChallenge } from '../components/PhoneChallenge'
import { useChallenge } from '../challenge'
import { writeGuardPass, readGuardPass } from '../guardPass'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE1 (2026-09-08) — LA PORTE D'ENTRÉE D'UN VOLONTAIRE : UNE URL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le lien ouvre l'app directement sur sa garde. »
 *
 * ★ ET IL EST MONTÉ **AVANT** LA PORTE D'AUTHENTIFICATION, ce qui est la
 *   décision structurelle d'AE1 et non un détail de routage. `App` rend
 *   `LoginScreen` dès que la session Supabase est absente ; un volontaire n'a
 *   pas de compte et n'en aura jamais, donc s'il traverse cette porte il ne
 *   voit qu'un formulaire de mot de passe qu'il ne peut pas remplir. La route
 *   `#/g/:token` est donc reconnue en amont — voir `App.tsx`.
 *
 * ★ TROIS ISSUES, ET LA TROISIÈME EST CELLE QUI COMPTE.
 *
 *     · jeton valide → la session devient la sienne, l'appareil garde le
 *       laissez-passer minimal (AE1.3), et on atterrit sur SA garde ;
 *     · jeton illisible → l'écran d'expiration, qui dit la même chose ;
 *     · jeton PÉRIMÉ → l'écran d'expiration, et il porte les numéros. C'est
 *       AE1.5 : « un lien expiré affiche un écran clair — pas une erreur
 *       technique — avec le numéro du coordinateur et les numéros d'urgence,
 *       qui restent atteignables ».
 *
 * ⚠️ ET L'ÉCRAN D'EXPIRATION N'EST PAS UNE IMPASSE. Le pire moment pour
 *    apprendre qu'un lien a expiré est celui où on en a besoin ; un écran qui
 *    dirait « lien expiré » et rien d'autre serait la version la plus littérale
 *    du défaut que cette passe supprime.
 */
export function GuardLinkScreen() {
  const { t } = useTranslation()
  const { token: raw } = useParams<{ token: string }>()
  const [state, setState] = useState<
    { kind: 'opening' } | { kind: 'ok' } | { kind: 'expired'; token: GuardToken | null }
  >({ kind: 'opening' })

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ★★ AG2.1 (2026-09-09) — ET LA PORTE DES QUATRE CHIFFRES PASSE DEVANT TOUT.
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * ⚠️ ELLE EST LUE AVANT L'EFFET, ET C'EST LE POINT ENTIER. Le laissez-passer
   *    est écrit sur l'appareil et la session est posée DANS l'effet ci-dessous ;
   *    poser la question après coup laisserait sur le téléphone de celui qui a
   *    reçu le lien par erreur le nom de la ferme, ses numéros et le code de son
   *    portail — c'est-à-dire exactement ce que la mesure existe pour empêcher.
   *    Rien n'est écrit tant que la réponse n'est pas juste.
   *
   * ★ ET LE NUMÉRO INTERROGÉ EST CELUI DE LA PERSONNE DU JETON, lu sur le
   *   magasin, jamais celui de la ferme : c'est SON lien, c'est SON téléphone.
   */
  const person = useCoreValue(() => {
    const read = decodeGuardToken(raw ?? '')
    if (read.status !== 'valid' || !read.token) return null
    const d = _raw()
    const t = read.token
    return (
      (t.role === 'driver'
        ? d.drivers.find((x) => x.id === t.personId)
        : d.volunteers.find((v) => v.id === t.personId)) ?? null
    )
  })
  const challenge = useChallenge(person?.id ?? '', person?.phone ?? '')
  const locked = person !== null && challenge.state !== 'open'

  useEffect(() => {
    if (locked) return
    const read = decodeGuardToken(raw ?? '')
    if (read.status !== 'valid' || !read.token) {
      setState({ kind: 'expired', token: read.token })
      return
    }
    const token = read.token

    /**
     * ★ LA GARDE EST RÉSOLUE CONTRE LE MAGASIN, ET S'IL NE LA CONNAÎT PAS, LE
     *   LAISSEZ-PASSER DÉJÀ SUR L'APPAREIL FAIT FOI.
     *
     * ⚠️ C'EST LA MOITIÉ QUI RESTE À FAIRE EN LOT 1, ET IL FAUT L'ÉCRIRE ICI
     *    PLUTÔT QUE DE LA DÉCOUVRIR. Dans le jumeau de démonstration, le
     *    magasin est semé de fixtures et la garde est trouvée. Dans une
     *    installation réelle branchée sur Postgres, un visiteur ANONYME n'a
     *    rien hydraté — les politiques RLS répondent à un `authenticated`, et
     *    il ne l'est pas. La lecture par jeton demande une fonction edge qui
     *    vérifie la signature côté serveur et renvoie exactement le
     *    `GuardPass` ; elle est le seul morceau d'AE1 qui ne peut pas vivre
     *    dans le navigateur, et rien d'autre ici ne changera quand elle
     *    existera : ce bloc gagnera un `await`, le reste de l'écran l'ignore.
     *
     *    Entre-temps, l'appareil qui a DÉJÀ ouvert ce lien une fois rouvre sa
     *    garde hors ligne, ce qui est le cas de trois heures du matin.
     */
    /**
     * ⚠️★★ ET TOUT SE LIT SUR `_raw()`, JAMAIS À TRAVERS `access.ts` — C'EST UN
     *    DÉFAUT QUE `bun run aeui` A TROUVÉ ET QU'AUCUNE RELECTURE N'AURAIT VU.
     *
     *    Les accesseurs filtrent par la session COURANTE. Au premier lien la
     *    session est encore celle du coordinateur (démo) et `getFarm` répond ;
     *    au SECOND, la session est déjà un volontaire — celui du lien
     *    précédent — et `getFarm` d'une ferme qui n'est pas la sienne rend
     *    `null`, parfaitement correctement. Résultat : le second lien ne
     *    remplaçait pas le laissez-passer, et le volontaire ouvrait la garde
     *    de la semaine dernière en croyant ouvrir celle de ce soir.
     *
     *    L'autorité ici est le JETON et non la session : c'est lui qui va POSER
     *    la session deux lignes plus bas. Lire à travers le filtre de
     *    l'identité qu'on est en train de remplacer est une inversion, et A119
     *    est la porte qui la nomme.
     */
    const d = _raw()
    const mission = d.missions.find((m) => m.id === token.missionId) ?? null
    if (mission) {
      const farm = d.farms.find((f) => f.id === mission.farmId) ?? null
      const person =
        token.role === 'driver'
          ? d.drivers.find((x) => x.id === token.personId)
          : d.volunteers.find((v) => v.id === token.personId)
      if (farm && person) {
        const coordinator = readCoordinator()
        const primary = farm.contacts.find((c) => c.isPrimary) ?? null
        const local = localEmergencyNumbers(farm, d.farms)
        const numbers: Array<{ labelKey: string; name: string; phone: string }> = []
        if (local.standby) {
          numbers.push({
            labelKey: 'emergency.standby',
            name: farm.locality,
            phone: local.standby,
          })
        }
        if (local.councilHotline) {
          numbers.push({
            labelKey: 'emergency.councilHotline',
            name: farm.council ?? '',
            phone: local.councilHotline,
          })
        }
        if (primary) {
          numbers.push({
            labelKey: 'anchor.labelFarmer',
            name: primary.name,
            phone: primary.phone,
          })
        }
        numbers.push({
          labelKey: 'anchor.labelCoordinator',
          name: coordinator.name,
          phone: coordinator.phone,
        })
        for (const s of EMERGENCY_SERVICES) {
          if (!s.always) continue
          numbers.push({ labelKey: `emergency.${s.id}`, name: '', phone: s.phone })
        }

        writeGuardPass(
          buildGuardPass({
            token,
            mission,
            farm,
            anchor: d.anchorPoints.find((a) => a.id === mission.anchorPointId) ?? null,
            outline: d.farmZones.filter((z) => z.farmId === farm.id).map((z) => z.ring),
            person,
            numbers,
          }),
        )
      }
    }

    /* La session devient la sienne. Le rôle est dans le jeton, jamais choisi
       par l'écran : c'est le seul endroit où le lien décide de quelque chose. */
    setSession({ role: token.role, entityId: token.personId })
    setState({ kind: 'ok' })
  }, [raw, locked])

  if (locked && person) {
    return (
      <PhoneChallenge
        personId={person.id}
        phone={person.phone}
        status={challenge}
        title={t('challenge.guardTitle')}
        subtitle={t('challenge.guardSubtitle')}
      />
    )
  }

  if (state.kind === 'opening') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="skeleton h-40 w-full max-w-sm rounded-card" />
      </div>
    )
  }
  if (state.kind === 'expired') return <LinkExpiredScreen />

  /* ⚠️ `<Navigate>` NE CONVIENDRAIT PAS : le rôle vient d'être posé et le
     routeur doit remonter la garde de rôle avec la NOUVELLE session. Un
     remplacement d'URL complet est ce qui garantit qu'aucun écran ne reste
     monté avec l'identité précédente. */
  return <Redirect to={state.kind === 'ok' ? homeOfPass() : '/'} />
}

function homeOfPass(): string {
  const pass = readGuardPass()
  return pass?.token.role === 'driver' ? '/driver' : '/volunteer'
}

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.hash = `#${to}`
  }, [to])
  return null
}

/**
 * ★★ AE1.5 — L'ÉCRAN D'UN LIEN QUI NE VAUT PLUS, ET IL DONNE DES NUMÉROS.
 *
 * ⚠️ PAS DE MESSAGE TECHNIQUE, ET C'EST LITTÉRALEMENT DEMANDÉ. « Jeton
 *    invalide », « 401 », « expired token » : ce sont des phrases qui disent à
 *    quelqu'un dans un champ que le problème est de son côté. Ce qui est dit
 *    ici est ce qui est vrai — cette garde est passée — et ce qu'il faut faire
 *    ensuite : appeler le coordinateur, dont le numéro est sous le pouce.
 */
export function LinkExpiredScreen() {
  const { t } = useTranslation()
  const coordinator = readCoordinator()
  const entries = emergencyEntries({
    farm: null,
    roster: [],
    coordinator: { name: coordinator.name, phone: coordinator.phone },
    farmer: null,
  }).filter((e) => e.tier <= 2)

  return (
    <div
      data-testid="link-expired"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 p-6"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-pill bg-status-warn/15 text-status-warn-ink">
          <Icon name="clock" size={30} />
        </span>
        <h1 className="text-title">{t('emergency.expiredTitle')}</h1>
        <p className="text-caption leading-relaxed text-content-secondary">
          {t('emergency.expiredBody')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {entries.map((e) => (
          <a
            key={e.key}
            href={telHref(e.phone)}
            data-emergency-target=""
            data-testid={`expired-call-${e.key}`}
            className={`flex min-h-16 items-center justify-between gap-3 rounded-card px-4 py-3 ${
              e.tier === 1
                ? 'bg-accent text-content-on-accent'
                : 'border border-edge-strong text-content-primary'
            }`}
          >
            <span className="truncate text-caption font-semibold">
              {t(e.labelKey)}
              {e.name ? ` · ${e.name}` : ''}
            </span>
            <span className="ltr-nums shrink-0 text-heading" dir="ltr">
              {e.phone}
            </span>
          </a>
        ))}
      </div>

      <Link to="/" className="text-center text-caption text-content-muted hover:underline">
        {t('common.back')}
      </Link>
    </div>
  )
}
