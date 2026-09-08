import { iso, now } from './clock'
import { formatCoords, wazeUrl } from './geo'
import { normalizeLocality } from './gazetteer'
import type { Farm, LatLng, Role } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE2 (2026-09-08) — L'ÉCRAN D'URGENCE, EN @core ET DONC VÉRIFIABLE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « L'utilisateur type de cet écran est un garçon de dix-huit ans, seul, à
 *     trois heures du matin, dans un champ sans éclairage, avec une barre de
 *     réseau. »
 *
 * ★ TOUT CE QUI DÉCIDE EST ICI, ET RIEN DE CE QUI DÉCIDE N'EST DANS L'ÉCRAN.
 *   Quels numéros, dans quel ordre, ce que l'alerte dit, à qui elle part et
 *   par quelles voies : ce sont des fonctions pures, donc `bun run aepass` en
 *   répond sans navigateur. L'écran ne fait que trois choses qu'une fonction
 *   pure ne peut pas faire — ouvrir un `tel:`, ouvrir un `sms:`, et lancer une
 *   requête — et c'est exactement la liste que la cascade nomme.
 */

// ---------------------------------------------------------------------------
// AE2b.1 — les numéros nationaux
// ---------------------------------------------------------------------------

export type EmergencyServiceId =
  | 'police'
  | 'mda'
  | 'fire'
  | 'idf'
  | 'magav'
  | 'electric'

export interface EmergencyService {
  id: EmergencyServiceId
  /** Le numéro composé, tel quel. */
  phone: string
  /**
   * `true` pour les trois qui sont TOUJOURS là. Les trois autres dépendent du
   * contexte (AE2b.1 : « et selon le contexte ») et sont donnés au second
   * rang — un écran qui pose six boutons identiques n'en a plus aucun de
   * lisible dans le noir.
   */
  always: boolean
}

/**
 * ⚠️ LES NUMÉROS SONT DES DONNÉES, PAS DE LA TRADUCTION. 100 est 100 dans les
 *    trois langues du fichier de locales ; ce qui se traduit est le NOM du
 *    service, et il vit dans `he.json` sous `emergency.*` comme le reste de la
 *    copie. Mettre « 100 » dans un fichier de traduction, c'est autoriser une
 *    relecture à le corriger.
 *
 * ⚠️ צה"ל ET מג"ב N'ONT PAS DE NUMÉRO À TROIS CHIFFRES. Le centre de situation
 *    de l'armée pour le front intérieur est le 104, et מג"ב passe par le 100 —
 *    la police est son central. On les nomme donc en pointant le numéro réel
 *    plutôt qu'en inventant une ligne directe qui n'existe pas : un bouton qui
 *    compose un numéro faux la nuit est pire que pas de bouton.
 */
export const EMERGENCY_SERVICES: readonly EmergencyService[] = [
  { id: 'police', phone: '100', always: true },
  { id: 'mda', phone: '101', always: true },
  { id: 'fire', phone: '102', always: true },
  { id: 'idf', phone: '104', always: false },
  { id: 'magav', phone: '100', always: false },
  { id: 'electric', phone: '103', always: false },
] as const

// ---------------------------------------------------------------------------
// AE2b.2 — les numéros qui dépendent du LIEU
// ---------------------------------------------------------------------------

export interface LocalNumbers {
  /** מוקד de la מועצה אזורית — la permanence, pas la standardiste. */
  councilHotline: string
  /** כיתת כוננות du יישוב. */
  standby: string
  /**
   * D'où chacun vient : `own` la fiche elle-même, `locality` une autre fiche
   * du même יישוב, `council` une autre fiche de la même מועצה, `none`.
   *
   * ★ AFFICHÉ, PAS SEULEMENT CALCULÉ. Un numéro emprunté à la ferme voisine
   *   est un numéro juste ET une information que le coordinateur doit voir,
   *   parce que c'est lui qui décide de le confirmer.
   */
  councilFrom: 'own' | 'council' | 'none'
  standbyFrom: 'own' | 'locality' | 'none'
}

const phone = (s: string | undefined | null): string => (s ?? '').trim()

/**
 * ★★ AE2b.2 — « CHAMPS À AJOUTER SUR LA FICHE FERME **ET SUR LA LOCALITÉ** »,
 *    ET LA SECONDE MOITIÉ EST CETTE FONCTION.
 *
 * Une כיתת כוננות appartient au יישוב, pas à l'exploitation : dans בארי il y a
 * quatre exploitations (AC1) et UNE équipe d'intervention. Deux façons de
 * l'écrire :
 *
 *   · une table des localités en base — une migration, une table, un écran
 *     d'édition, et une seconde source de vérité pour un numéro de téléphone ;
 *   · le champ sur la fiche, et la RÉSOLUTION qui regarde les voisines.
 *
 * La seconde est retenue, et pas par économie. Le coordinateur remplit ce
 * qu'il a sous les yeux — la fiche qu'il est en train d'ouvrir — et il ne va
 * pas chercher un écran « localités » pour y saisir un numéro qu'un
 * agriculteur vient de lui donner au téléphone. Rempli une fois n'importe où
 * dans בארי, il vaut pour les quatre, et l'écran dit d'où il vient.
 *
 * ⚠️ ET LE מוקד SUIT LA מועצה, PAS LE יישוב. Ce sont deux échelles : dix
 *    יישובים partagent un מוקד, et deux fermes du même מוקד peuvent avoir deux
 *    כיתות כוננות. Les apparier sur la même clé donnerait à un volontaire de
 *    נירים le numéro de l'équipe de בארי, à quinze kilomètres.
 */
export function localEmergencyNumbers(farm: Farm, roster: readonly Farm[]): LocalNumbers {
  let councilHotline = phone(farm.councilHotline)
  let councilFrom: LocalNumbers['councilFrom'] = councilHotline ? 'own' : 'none'
  let standby = phone(farm.standbyPhone)
  let standbyFrom: LocalNumbers['standbyFrom'] = standby ? 'own' : 'none'

  const council = normalizeLocality(farm.council ?? '')
  const locality = normalizeLocality(farm.locality ?? '')

  if (!councilHotline && council !== '') {
    for (const other of roster) {
      if (other.id === farm.id) continue
      if (normalizeLocality(other.council ?? '') !== council) continue
      const p = phone(other.councilHotline)
      if (p) {
        councilHotline = p
        councilFrom = 'council'
        break
      }
    }
  }
  if (!standby && locality !== '') {
    for (const other of roster) {
      if (other.id === farm.id) continue
      if (normalizeLocality(other.locality ?? '') !== locality) continue
      const p = phone(other.standbyPhone)
      if (p) {
        standby = p
        standbyFrom = 'locality'
        break
      }
    }
  }
  return { councilHotline, standby, councilFrom, standbyFrom }
}

// ---------------------------------------------------------------------------
// La liste que l'écran affiche
// ---------------------------------------------------------------------------

export type EmergencyEntryKind =
  | 'service'
  | 'councilHotline'
  | 'standby'
  | 'coordinator'
  | 'farmer'

export interface EmergencyEntry {
  key: string
  kind: EmergencyEntryKind
  /** Clé i18n du libellé ; jamais une phrase (règle des sondes). */
  labelKey: string
  /** Le nom de la personne quand il y en a une, sinon ''. */
  name: string
  phone: string
  /** 1 = premier bloc (les gens du coin), 2 = national, 3 = contextuel. */
  tier: 1 | 2 | 3
  /** Renseigné d'où — pour la mention « selon la ferme voisine ». */
  from?: LocalNumbers['councilFrom'] | LocalNumbers['standbyFrom']
}

export interface EmergencyContext {
  farm: Farm | null
  roster: readonly Farm[]
  coordinator: { name: string; phone: string }
  farmer: { name: string; phone: string } | null
}

/**
 * ★ L'ORDRE EST UNE DÉCISION ET IL EST L'INVERSE DE L'ÉVIDENT.
 *
 *   L'évident est de mettre 100 en tête. Le brief dit le contraire, et il dit
 *   pourquoi : « Ce sont eux qui arrivent les premiers. » La כיתת כוננות du
 *   יישוב est à quatre minutes et la patrouille à vingt ; l'agriculteur ouvre
 *   le portail que la police ne sait pas trouver. Les gens du coin d'abord,
 *   les services nationaux ensuite, le contextuel en dernier.
 */
export function emergencyEntries(ctx: EmergencyContext): EmergencyEntry[] {
  const out: EmergencyEntry[] = []
  const local = ctx.farm ? localEmergencyNumbers(ctx.farm, ctx.roster) : null

  if (local?.standby) {
    out.push({
      key: 'standby',
      kind: 'standby',
      labelKey: 'emergency.standby',
      name: ctx.farm?.locality ?? '',
      phone: local.standby,
      tier: 1,
      from: local.standbyFrom,
    })
  }
  if (local?.councilHotline) {
    out.push({
      key: 'councilHotline',
      kind: 'councilHotline',
      labelKey: 'emergency.councilHotline',
      name: ctx.farm?.council ?? '',
      phone: local.councilHotline,
      tier: 1,
      from: local.councilFrom,
    })
  }
  /* AE2b.3 — « toujours présents », donc jamais conditionnés à une ferme. */
  if (ctx.farmer && phone(ctx.farmer.phone)) {
    out.push({
      key: 'farmer',
      kind: 'farmer',
      labelKey: 'anchor.labelFarmer',
      name: ctx.farmer.name,
      phone: ctx.farmer.phone,
      tier: 1,
    })
  }
  out.push({
    key: 'coordinator',
    kind: 'coordinator',
    labelKey: 'anchor.labelCoordinator',
    name: ctx.coordinator.name,
    phone: ctx.coordinator.phone,
    tier: 1,
  })

  for (const s of EMERGENCY_SERVICES) {
    out.push({
      key: s.id,
      kind: 'service',
      labelKey: `emergency.${s.id}`,
      name: '',
      phone: s.phone,
      tier: s.always ? 2 : 3,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// AE2a — le bouton de détresse
// ---------------------------------------------------------------------------

/**
 * ★ AE2a.4 — LA DURÉE DE L'APPUI MAINTENU, ET POURQUOI CE CHIFFRE.
 *
 *   « Une confirmation courte contre le déclenchement accidentel — un appui
 *     maintenu ou un glissement — mais JAMAIS un dialogue à lire. En panique,
 *     on ne lit pas. Viser moins de deux secondes entre l'intention et le
 *     départ de l'alerte. »
 *
 *   800 ms est au-dessus de l'appui accidentel (un téléphone dans une poche
 *   produit des contacts de 50 à 200 ms) et très en dessous du seuil où l'on
 *   croit que le bouton ne marche pas. Il laisse **1 200 ms** au reste — la
 *   position, le SMS, la requête — dans le budget de deux secondes que le
 *   brief fixe, et `bun run aeui` mesure ce budget entier plutôt que celui-ci.
 */
export const DISTRESS_HOLD_MS = 800

/** Le budget total du brief, nommé pour que la porte le cite au lieu de 2000. */
export const DISTRESS_BUDGET_MS = 2000

export interface DistressAlert {
  /** Qui. */
  who: string
  role: Role
  phone: string
  /** Où — la position du moment, ou celle de la ferme quand le GPS se tait. */
  position: LatLng | null
  /** `true` quand `position` vient de la fiche et non du GPS. */
  positionIsFallback: boolean
  /** Sur quelle ferme. */
  farmId: string | null
  farmName: string
  /** À quelle heure. */
  at: string
}

export function buildDistressAlert(input: {
  who: string
  role: Role
  phone: string
  position: LatLng | null
  fallbackPosition: LatLng | null
  farmId: string | null
  farmName: string
  at?: Date
}): DistressAlert {
  const fix = input.position ?? input.fallbackPosition
  return {
    who: input.who,
    role: input.role,
    phone: input.phone,
    position: fix,
    positionIsFallback: input.position === null && fix !== null,
    farmId: input.farmId,
    farmName: input.farmName,
    at: iso(input.at ?? now()),
  }
}

export interface DistressLabels {
  title: string
  who: string
  farm: string
  at: string
  coordinates: string
  navigation: string
  approximate: string
}

/**
 * Le corps du SMS de détresse.
 *
 * ★★ AE2a.3 — C'EST LE FILET DE SÉCURITÉ DU SYSTÈME ENTIER, et c'est pour ça
 *    qu'il porte les COORDONNÉES EN CLAIR **avant** le lien de navigation. Un
 *    lien ne s'ouvre pas sur le téléphone cachère du coordinateur, ne s'ouvre
 *    pas dans une capture d'écran transmise à un tiers, et ne se lit pas à
 *    voix haute au téléphone à un pilote de patrouille. Deux nombres, si.
 */
export function distressMessage(alert: DistressAlert, labels: DistressLabels): string {
  const lines: string[] = [labels.title, '']
  lines.push(`${labels.who}: ${alert.who} ${alert.phone}`)
  if (alert.farmName) lines.push(`${labels.farm}: ${alert.farmName}`)
  lines.push(`${labels.at}: ${alert.at}`)
  if (alert.position) {
    lines.push(
      `${labels.coordinates}: ${formatCoords(alert.position)}${
        alert.positionIsFallback ? ` (${labels.approximate})` : ''
      }`,
    )
    lines.push(`${labels.navigation}: ${wazeUrl(alert.position)}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// AE2a.3 — LA CASCADE
// ---------------------------------------------------------------------------

/**
 * ★★ LA CASCADE EST UN PLAN, PAS UNE SUITE D'APPELS, ET C'EST CE QUI LA REND
 *    VÉRIFIABLE.
 *
 *    « Du plus fiable au moins fiable, sans jamais dépendre d'une seule voie :
 *      appel téléphonique direct, SMS avec les coordonnées en clair et un lien
 *      de navigation, requête réseau vers le serveur. »
 *
 * ★ ET L'ORDRE D'EXÉCUTION N'EST PAS L'ORDRE DE FIABILITÉ, POUR UNE RAISON
 *   MATÉRIELLE QU'IL FAUT ÉCRIRE.
 *
 *   Un navigateur ne peut pas, dans un seul geste, composer un numéro ET
 *   ouvrir un SMS : la première navigation `tel:` prend la main et la seconde
 *   est perdue. Donc l'écran exécute, dans cet ordre : la REQUÊTE d'abord
 *   (elle ne bloque rien et ne demande pas la main), le SMS ensuite (il
 *   compose et rend la main), et l'APPEL reste sous le pouce, en boutons de
 *   64 px, sur l'écran de confirmation. Les trois voies partent ; celle qui
 *   demande la main de l'utilisateur est celle qu'il tient déjà.
 *
 * ⚠️ ET LES DEUX VOIES TÉLÉPHONIQUES NE TOUCHENT JAMAIS LE RÉSEAU DE DONNÉES
 *    (AE2a.6). `sms:` et `tel:` sont des URI de l'appareil. C'est A122 : on
 *    coupe le réseau, `transmit` échoue, et le plan sort intact.
 */
export interface DistressPlan {
  alert: DistressAlert
  /** Étape 2 : le SMS, une seule composition, tous les destinataires dedans. */
  smsHref: string
  /** Les numéros du SMS, dans l'ordre (coordinateur, agriculteur). */
  smsRecipients: string[]
  /** Étape 1 : les appels proposés, dans l'ordre du brief. */
  callTargets: EmergencyEntry[]
  /** Étape 3 : le corps de la requête réseau. */
  body: string
}

/**
 * `smsHref` sans passer par `geo.smsHref` : plusieurs destinataires.
 *
 * ⚠️ LA VIRGULE EST LA SEULE SÉPARATION QUI PASSE PARTOUT. iOS accepte
 *    `sms:a,b`, Android aussi ; le point-virgule ne marche que sur l'un des
 *    deux, et un séparateur non reconnu fait un SMS à un numéro qui est la
 *    concaténation des deux — c'est-à-dire une alerte envoyée à personne.
 */
function multiSmsHref(numbers: string[], body: string): string {
  const to = numbers.map((n) => n.replace(/[^\d+*#]/g, '')).filter(Boolean).join(',')
  return `sms:${to}${to ? '' : ''}?&body=${encodeURIComponent(body)}`
}

/**
 * ★ AE2a.2 — LE COORDINATEUR ET L'AGRICULTEUR SONT PRÉVENUS **EN PARALLÈLE**,
 *   et le mot compte : ce sont deux numéros dans UN SMS, pas deux SMS que
 *   l'utilisateur envoie l'un après l'autre. « La police arrive plus vite
 *   quand quelqu'un du coin ouvre le portail » — l'agriculteur n'est pas une
 *   copie de courtoisie, il est la moitié opérationnelle de l'alerte.
 */
export function planDistress(
  alert: DistressAlert,
  ctx: EmergencyContext,
  labels: DistressLabels,
): DistressPlan {
  const body = distressMessage(alert, labels)
  const entries = emergencyEntries(ctx)
  const recipients: string[] = []
  const coordinator = entries.find((e) => e.kind === 'coordinator')
  const farmer = entries.find((e) => e.kind === 'farmer')
  if (coordinator?.phone) recipients.push(coordinator.phone)
  if (farmer?.phone) recipients.push(farmer.phone)

  return {
    alert,
    smsHref: multiSmsHref(recipients, body),
    smsRecipients: recipients,
    /* L'appel proposé en premier : les gens du coin, puis 100. L'écran les
       dessine dans cet ordre et rien ne les retrie. */
    callTargets: entries.filter((e) => e.tier <= 2),
    body,
  }
}
