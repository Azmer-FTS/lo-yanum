import { formatDate, formatTime } from './clock'
import { EMERGENCY_SERVICES, localEmergencyNumbers } from './emergency'
import { formatCoords, wazeUrl } from './geo'
import type { AnchorPoint, Farm, LatLng, Mission } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE4 (2026-09-08) — LE SMS DE CONVOCATION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Pour ceux qui n'installent pas l'app, et comme filet pour tous les
 *     autres. »
 *
 * ★ CETTE SECONDE MOITIÉ EST LA RAISON POUR LAQUELLE IL EXISTE MÊME QUAND
 *   L'APP MARCHE. Un SMS reste lisible quand la batterie est à 4 %, quand le
 *   téléphone n'a pas de données, quand le volontaire a effacé l'app, et
 *   quand il le montre à son père qui le dépose. C'est le même raisonnement
 *   qu'en AE2a.3 : la voie la plus bête est la plus fiable.
 *
 * ★ IL PORTE LE LIEN DE GARDE D'AE1, ET C'EST LEUR SEUL POINT DE CONTACT.
 *   Le jeton est court exprès pour tenir ici (voir `invite.ts`).
 *
 * ★★ LE GABARIT EST MODIFIABLE (AE4), DONC LA COMPLÉTUDE NE PEUT PAS ÊTRE UNE
 *    RELECTURE — C'EST `missingSummonsTokens`.
 *
 *    Un gabarit libre est un gabarit dont on peut effacer le numéro du
 *    coordinateur sans s'en apercevoir, et le SMS partirait quand même, tous
 *    les jours, à tout le monde. Les jetons OBLIGATOIRES sont donc déclarés,
 *    l'écran de réglages refuse d'enregistrer un gabarit qui en a perdu un, et
 *    A128 pose la question sur le gabarit par défaut ET sur un gabarit mutilé.
 */

/** Le nom d'un emplacement, tel qu'il s'écrit dans le gabarit : `{{place}}`. */
export type SummonsToken =
  | 'place'
  | 'navigation'
  | 'date'
  | 'from'
  | 'to'
  | 'farmerName'
  | 'farmerPhone'
  | 'coordinatorPhone'
  | 'emergency'
  | 'kit'
  | 'link'

/**
 * ⚠️ TOUS OBLIGATOIRES, ET LA LISTE EST EXACTEMENT CELLE DU BRIEF : « le lieu
 *    exact avec un lien de navigation, les horaires, le nom et le numéro de
 *    l'agriculteur, le numéro du coordinateur, les numéros d'urgence, et les
 *    consignes pratiques ». Plus le lien de garde d'AE1, qui est ce qui fait
 *    de ce SMS la porte d'entrée et pas seulement un pense-bête.
 */
export const SUMMONS_TOKENS: readonly SummonsToken[] = [
  'place',
  'navigation',
  'date',
  'from',
  'to',
  'farmerName',
  'farmerPhone',
  'coordinatorPhone',
  'emergency',
  'kit',
  'link',
] as const

export type SummonsValues = Record<SummonsToken, string>

const PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g

/** Les jetons obligatoires qu'un gabarit a perdus. Vide = complet. */
export function missingSummonsTokens(template: string): SummonsToken[] {
  const present = new Set<string>()
  for (const m of template.matchAll(PATTERN)) present.add(m[1])
  return SUMMONS_TOKENS.filter((tok) => !present.has(tok))
}

/**
 * Le rendu. Un jeton inconnu est laissé TEL QUEL plutôt qu'effacé : un
 * coordinateur qui a tapé `{{adresse}}` doit voir son erreur dans l'aperçu,
 * pas un trou.
 */
export function renderSummons(template: string, values: SummonsValues): string {
  return template.replace(PATTERN, (whole, name: string) =>
    (SUMMONS_TOKENS as readonly string[]).includes(name)
      ? values[name as SummonsToken]
      : whole,
  )
}

export interface SummonsInput {
  mission: Mission
  farm: Farm
  roster: readonly Farm[]
  anchor: AnchorPoint | null
  coordinatorPhone: string
  /** Le lien de garde d'AE1, déjà construit — @core ne connaît pas l'origine. */
  guardLink: string
  locale: string
  /** Les consignes pratiques, traduites par l'appelant. */
  kit: string
  /** Les libellés des services, traduits par l'appelant : `{police: 'משטרה'}`. */
  serviceLabels: Partial<Record<string, string>>
}

/**
 * ★ LE POINT DE RENDEZ-VOUS L'EMPORTE SUR LA FERME, comme en G8 : envoyer un
 *   volontaire qui conduit sa propre voiture sur la piste 4×4 derrière la
 *   ferme est précisément l'erreur que `pickupPoint` existe pour empêcher.
 */
function rendezvous(input: SummonsInput): LatLng {
  return input.mission.pickupPoint ?? input.anchor?.position ?? input.farm.position
}

export function summonsValues(input: SummonsInput): SummonsValues {
  const { mission, farm, anchor, locale } = input
  const point = rendezvous(input)
  const local = localEmergencyNumbers(farm, input.roster)

  /* AE4 — « les numéros d'urgence ». Les trois nationaux toujours, et devant
     eux ceux du coin quand ils sont renseignés : même ordre qu'en AE2b, et
     pour la même raison (« ce sont eux qui arrivent les premiers »). */
  const numbers: string[] = []
  if (local.standby) numbers.push(`${input.serviceLabels.standby ?? 'standby'} ${local.standby}`)
  if (local.councilHotline) {
    numbers.push(`${input.serviceLabels.councilHotline ?? 'moked'} ${local.councilHotline}`)
  }
  for (const s of EMERGENCY_SERVICES) {
    if (!s.always) continue
    numbers.push(`${input.serviceLabels[s.id] ?? s.id} ${s.phone}`)
  }

  const place = [
    farm.name,
    farm.locality,
    anchor?.name ?? '',
    /* ★ « le lieu EXACT » — les coordonnées en clair, pas seulement un nom.
       Un nom d'עמדה ne se tape pas dans un Waze et ne se lit pas à un père qui
       dépose son fils. */
    formatCoords(point),
  ]
    .filter((s) => s !== '')
    .join(' · ')

  const farmerName = farm.farmerName ?? farm.contacts.find((c) => c.isPrimary)?.name ?? ''
  const farmerPhone = farm.farmerPhone ?? farm.contacts.find((c) => c.isPrimary)?.phone ?? ''

  return {
    place,
    navigation: wazeUrl(point),
    date: formatDate(mission.startAt, locale),
    from: formatTime(mission.startAt, locale),
    to: formatTime(mission.endAt, locale),
    farmerName,
    farmerPhone,
    coordinatorPhone: input.coordinatorPhone,
    emergency: numbers.join(' · '),
    kit: input.kit,
    link: input.guardLink,
  }
}

export function buildSummons(input: SummonsInput, template: string): string {
  return renderSummons(template, summonsValues(input))
}
