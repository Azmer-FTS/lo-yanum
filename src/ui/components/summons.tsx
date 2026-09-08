import { useTranslation } from 'react-i18next'

import {
  EMERGENCY_SERVICES,
  buildGuardLink,
  buildSummons,
  getVisibleFarms,
  guardTokenFor,
  readCoordinator,
  smsHref,
} from '@core/index'
import type { AnchorPoint, Farm, Mission } from '@core/index'

import { useCoreValue } from '../hooks/useCore'
import { useLocale } from '../hooks/useLocale'
import { summonsTemplate } from '../settings/summons'
import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE4 (2026-09-08) — LE BOUTON QUI ENVOIE LA CONVOCATION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ UN LIEN `sms:`, ET RIEN D'AUTRE. Aucune application tierce n'a le droit
 *   d'envoyer un SMS au nom de quelqu'un (c'est la règle nommée en P3.3bis, et
 *   elle n'a pas changé) : ce que l'app peut faire est OUVRIR le composeur avec
 *   le bon numéro et le bon texte, et c'est le coordinateur qui appuie. La
 *   valeur est dans le texte, pas dans l'envoi.
 *
 * ★ L'ORIGINE EST LUE ICI ET PASSÉE À @core. `buildGuardLink` ne connaît pas
 *   `location` — c'est ce qui permet à `bun run aepass` de vérifier la forme du
 *   lien sans navigateur.
 *
 * ⚠️ ET LE LIEN EST CALCULÉ À CHAQUE RENDU PLUTÔT QUE STOCKÉ. Il porte la date
 *    d'expiration de CETTE garde (AE1.2) ; un lien mémorisé sur une garde dont
 *    l'horaire a été déplacé serait un lien qui expire au mauvais moment, et le
 *    mauvais moment est toujours celui où quelqu'un en a besoin.
 */

/** L'origine de l'app, `#` exclu : `https://…/lo-yanum` ou `http://localhost:5173`. */
export function appOrigin(): string {
  if (typeof window === 'undefined') return ''
  const { origin, pathname } = window.location
  return `${origin}${pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '')}`
}

export function SummonsButton({
  mission,
  farm,
  anchor,
  role,
  personId,
  phone,
  compact = false,
}: {
  mission: Mission
  farm: Farm
  anchor: AnchorPoint | null
  role: 'volunteer' | 'driver'
  personId: string
  phone: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const roster = useCoreValue(getVisibleFarms)

  const serviceLabels: Record<string, string> = {
    standby: t('emergency.standby'),
    councilHotline: t('emergency.councilHotline'),
  }
  for (const s of EMERGENCY_SERVICES) serviceLabels[s.id] = t(`emergency.${s.id}`)

  const body = buildSummons(
    {
      mission,
      farm,
      roster,
      anchor,
      coordinatorPhone: readCoordinator().phone,
      guardLink: buildGuardLink(appOrigin(), guardTokenFor(mission, role, personId)),
      locale,
      kit: t('settings.summons.kit'),
      serviceLabels,
    },
    summonsTemplate(t('settings.summons.defaultTemplate')),
  )

  return (
    <a
      href={smsHref(phone, body)}
      data-testid={`summons-${personId}`}
      className={`inline-flex items-center gap-1.5 rounded-field border border-edge-strong text-content-secondary
                  transition-colors duration-fast hover:bg-surface-high hover:text-content-primary ${
                    compact ? 'h-10 px-3 text-micro' : 'min-h-11 px-4 text-caption'
                  }`}
    >
      <Icon name="message" size={16} />
      {t('missions.summons')}
    </a>
  )
}
