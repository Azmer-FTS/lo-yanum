import { now } from './clock'
import type { AnchorPoint, Driver, Farm, LatLng, Mission, Role, Volunteer } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE1 (2026-09-08) — UN VOLONTAIRE N'A PAS DE COMPTE, IL A UN LIEN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Aucun volontaire ne crée de compte. Aucun mot de passe. Quand une garde
 *     est programmée, le volontaire reçoit un LIEN qui lui est propre, portant
 *     un jeton. Le lien ouvre l'app directement sur sa garde. »
 *
 * ★ CE QUE LE JETON PORTE, ET CE QU'IL NE PORTE PAS.
 *
 *   Il porte QUATRE choses : le rôle, la personne, la garde, et l'instant où
 *   il cesse de valoir. Il ne porte NI la fiche de la ferme, NI les numéros,
 *   NI le contour — et c'est une décision, pas un oubli. Une garde complète
 *   dans l'URL fait un lien de mille cinq cents caractères, et ce lien voyage
 *   dans un SMS (AE4) vers un téléphone cachère qui l'affichera coupé. Un lien
 *   qu'on ne peut pas envoyer n'est pas un lien.
 *
 *   Ce que l'appareil garde est décidé ailleurs et volontairement au plus
 *   court : voir `ui/guardPass.ts` — LA garde en cours, la fiche du site, les
 *   numéros, et rien d'autre. C'est AE1.3, et c'est ce qui fait que
 *   désinstaller l'app ne perd rien de critique.
 *
 * ⚠️ LE JETON EST UNE CAPACITÉ, PAS UNE AUTHENTIFICATION, ET IL FAUT LE DIRE
 *    ICI PLUTÔT QUE DE LAISSER QUELQU'UN LE DÉDUIRE.
 *
 *    L'empreinte ci-dessous rend le jeton INFALSIFIABLE À LA MAIN : on ne peut
 *    pas repousser sa propre expiration en éditant l'URL, parce que la date
 *    est dans ce que l'empreinte couvre. Elle ne le rend pas infalsifiable
 *    pour quelqu'un qui lit le bundle — le sel y est, forcément, puisque le
 *    navigateur doit vérifier hors ligne. C'est le bon compromis pour CE
 *    programme : la chose protégée est l'horaire d'une garde et le numéro d'un
 *    agriculteur, le porteur est un garçon de dix-huit ans sans compte, et le
 *    coût d'un mot de passe serait qu'il n'ouvre jamais l'app. En lot 1, la
 *    signature part côté serveur (une fonction edge, une clé qui ne descend
 *    pas) et RIEN d'autre ici ne change : `decodeGuardToken` gagne un second
 *    vérificateur, les écrans n'en savent rien.
 *
 * ⚠️ ET LE MÊME MODÈLE VAUT POUR LES CONDUCTEURS (AE1.6). Le rôle est dans le
 *    jeton ; l'agriculteur, lui, garde son accès existant et n'a pas de lien.
 */

// ---------------------------------------------------------------------------
// La durée, en constante nommée (AE1.2)
// ---------------------------------------------------------------------------

/**
 * ★ VINGT-QUATRE HEURES APRÈS LA FIN DE LA GARDE, et le brief le nomme.
 *
 *   Pourquoi une marge du tout : la garde finit à 06:00, le volontaire rentre
 *   dormir, et c'est à 14:00 qu'il cherche le numéro de l'agriculteur pour
 *   dire qu'il a vu une clôture coupée. Un jeton qui expire à l'heure de fin
 *   ferme l'app exactement quand le rapport se fait.
 *
 *   Pourquoi pas plus : une garde suivante donne un lien neuf (AE1.2), donc
 *   une marge longue n'ajoute rien qu'une fenêtre ouverte sur un téléphone
 *   perdu.
 */
export const GUARD_LINK_GRACE_HOURS = 24

export const GUARD_LINK_GRACE_MS = GUARD_LINK_GRACE_HOURS * 3_600_000

/** Le sel de l'empreinte. Voir l'avertissement en tête : tamper-evidence. */
const TOKEN_SALT = 'lo-yanum/ae1'

// ---------------------------------------------------------------------------
// Le jeton
// ---------------------------------------------------------------------------

/**
 * Ce qu'un lien de garde dit. Les clés sont courtes parce qu'elles sont dans
 * une URL qui part par SMS ; elles sont relues une seule fois, ici.
 */
export interface GuardToken {
  /** 'volunteer' | 'driver' — jamais 'coordinator' ni 'farmer' (AE1.6). */
  role: Extract<Role, 'volunteer' | 'driver'>
  /** Id du volontaire ou du conducteur. */
  personId: string
  missionId: string
  /** Instant (ms epoch) où le lien cesse de valoir. */
  expiresAt: number
}

export type GuardTokenStatus = 'valid' | 'expired' | 'malformed'

export interface GuardTokenRead {
  status: GuardTokenStatus
  /** Présent dès que le jeton est LISIBLE — donc aussi quand il a expiré. */
  token: GuardToken | null
}

// --- base64url, écrit à la main -------------------------------------------
//
// ⚠️ PAS `btoa`. Il est global dans les deux environnements et il travaille sur
//    des « chaînes binaires » : `btoa('חווה')` jette. Le passage par
//    TextEncoder est le seul qui survive à un nom de ferme en hébreu, et il
//    n'introduit aucune dépendance DOM (c'est du WHATWG Encoding, présent dans
//    bun comme dans le navigateur).

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : -1
    const c = i + 2 < bytes.length ? bytes[i + 2] : -1
    out += B64[a >> 2]
    out += B64[((a & 3) << 4) | (b < 0 ? 0 : b >> 4)]
    if (b < 0) break
    out += B64[((b & 15) << 2) | (c < 0 ? 0 : c >> 6)]
    if (c < 0) break
    out += B64[c & 63]
  }
  return out
}

function fromBase64Url(s: string): Uint8Array | null {
  const bytes: number[] = []
  let acc = 0
  let bits = 0
  for (const ch of s) {
    const v = B64.indexOf(ch)
    if (v < 0) return null
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((acc >> bits) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

/**
 * Empreinte 32 bits (FNV-1a) du corps du jeton salé.
 *
 * ⚠️ CE N'EST PAS UN HACHAGE CRYPTOGRAPHIQUE et rien ici ne prétend le
 *    contraire — voir l'avertissement en tête du fichier. Sa seule tâche est
 *    qu'une date d'expiration modifiée à la main dans la barre d'adresse ne
 *    passe pas.
 */
function fingerprint(body: string): string {
  let h = 0x811c9dc5
  const s = `${TOKEN_SALT}|${body}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/** Le jeton, tel qu'il apparaît dans l'URL. */
export function encodeGuardToken(token: GuardToken): string {
  const compact = JSON.stringify([
    1,
    token.role === 'driver' ? 'd' : 'v',
    token.personId,
    token.missionId,
    token.expiresAt,
  ])
  const body = toBase64Url(new TextEncoder().encode(compact))
  return `${body}.${fingerprint(body)}`
}

/**
 * Relit un jeton. Trois réponses et pas deux : « illisible » et « périmé » ne
 * sont pas la même chose pour l'écran qui les affiche (AE1.5) — le second sait
 * de quelle garde il parlait.
 */
export function decodeGuardToken(
  raw: string,
  at: number = now().getTime(),
): GuardTokenRead {
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return { status: 'malformed', token: null }
  const body = raw.slice(0, dot)
  if (raw.slice(dot + 1) !== fingerprint(body)) {
    return { status: 'malformed', token: null }
  }
  const bytes = fromBase64Url(body)
  if (!bytes) return { status: 'malformed', token: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return { status: 'malformed', token: null }
  }
  if (!Array.isArray(parsed) || parsed.length !== 5 || parsed[0] !== 1) {
    return { status: 'malformed', token: null }
  }
  const [, role, personId, missionId, expiresAt] = parsed as [
    number,
    string,
    string,
    string,
    number,
  ]
  if (role !== 'v' && role !== 'd') return { status: 'malformed', token: null }
  if (typeof personId !== 'string' || personId === '') {
    return { status: 'malformed', token: null }
  }
  if (typeof missionId !== 'string' || missionId === '') {
    return { status: 'malformed', token: null }
  }
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    return { status: 'malformed', token: null }
  }
  const token: GuardToken = {
    role: role === 'd' ? 'driver' : 'volunteer',
    personId,
    missionId,
    expiresAt,
  }
  return { status: at > expiresAt ? 'expired' : 'valid', token }
}

/** L'expiration d'une garde : sa fin, plus la marge nommée. */
export function guardLinkExpiry(mission: Mission): number {
  return new Date(mission.endAt).getTime() + GUARD_LINK_GRACE_MS
}

/**
 * Le lien complet, tel qu'il part dans le SMS de convocation.
 *
 * ⚠️ `origin` EST DONNÉ, jamais lu ici : @core ne connaît pas `location`, et
 *    c'est aussi ce qui permet à `bun run aepass` de vérifier la forme du lien
 *    sans navigateur.
 */
export function buildGuardLink(
  origin: string,
  token: GuardToken,
): string {
  return `${origin.replace(/\/+$/, '')}/#/g/${encodeGuardToken(token)}`
}

export function guardTokenFor(
  mission: Mission,
  role: GuardToken['role'],
  personId: string,
): GuardToken {
  return { role, personId, missionId: mission.id, expiresAt: guardLinkExpiry(mission) }
}

// ---------------------------------------------------------------------------
// AE1.3 — CE QUE L'APPAREIL DU VOLONTAIRE GARDE, ET RIEN DE PLUS
// ---------------------------------------------------------------------------

/**
 *   « Sur l'appareil du volontaire, ne conserver que le nécessaire : la garde
 *     en cours, la fiche de la ferme, les numéros. Rien d'historique. »
 *
 * ★ C'EST UN TYPE, PAS UNE CONVENTION. Un objet dont la forme dit ce qui a le
 *   droit d'être écrit sur ce téléphone est une règle qu'un écran ne peut pas
 *   contourner par inadvertance ; un commentaire au-dessus d'un `setItem` est
 *   une règle qu'on oublie à la troisième passe.
 *
 * ★ ET IL EST SINGULIER. Un `GuardPass`, pas une liste : le lien suivant
 *   REMPLACE celui-ci (voir `ui/guardPass.ts`). « Rien d'historique » n'est
 *   alors pas une purge à écrire et à se rappeler de lancer, c'est la forme de
 *   la case.
 */
export interface GuardPass {
  /** Le jeton d'où il vient — pour savoir quand cesser de l'afficher. */
  token: GuardToken
  mission: {
    id: string
    startAt: string
    endAt: string
    status: Mission['status']
  }
  farm: {
    id: string
    name: string
    locality: string
    position: LatLng
    /** AE2c — תיק אתר, les champs libres de la fiche. */
    siteAccess: string
    gateCode: string
    parking: string
    terrain: string
    /** Le contour, pour que la carte du volontaire montre où s'arrête la ferme. */
    outline: LatLng[][]
  }
  anchor: {
    name: string
    position: LatLng
    accessDescription: string
    instructions: string[]
  } | null
  /** AE2b — les numéros, résolus au moment où le lien a été ouvert. */
  numbers: Array<{ labelKey: string; name: string; phone: string }>
  person: { id: string; name: string; phone: string }
}

/**
 * Construit le laissez-passer minimal. Tout ce qui n'est pas dans le type
 * ci-dessus est laissé derrière, y compris la liste des autres gardes de cette
 * personne, les autres fermes, et le rôle entier.
 */
export function buildGuardPass(input: {
  token: GuardToken
  mission: Mission
  farm: Farm
  anchor: AnchorPoint | null
  outline: LatLng[][]
  person: Volunteer | Driver
  numbers: GuardPass['numbers']
}): GuardPass {
  const { token, mission, farm, anchor, person } = input
  return {
    token,
    mission: {
      id: mission.id,
      startAt: mission.startAt,
      endAt: mission.endAt,
      status: mission.status,
    },
    farm: {
      id: farm.id,
      name: farm.name,
      locality: farm.locality,
      position: farm.position,
      siteAccess: farm.siteAccess ?? '',
      gateCode: farm.gateCode ?? '',
      parking: farm.parking ?? '',
      terrain: farm.terrainNotes ?? '',
      outline: input.outline,
    },
    anchor: anchor
      ? {
          name: anchor.name,
          position: anchor.position,
          accessDescription: anchor.accessDescription,
          instructions: anchor.instructions,
        }
      : null,
    numbers: input.numbers,
    person: { id: person.id, name: person.name, phone: person.phone },
  }
}

// ---------------------------------------------------------------------------
// ★★ AG3.1 (2026-09-09) — LE LIEN DE L'AGRICULTEUR, ET IL EST PERMANENT
// ---------------------------------------------------------------------------

/**
 *   « Lien PERMANENT par agriculteur, installable sur l'écran d'accueil. […]
 *     Ce n'est PAS un guichet administratif ouvert trois fois par an. C'est
 *     SON application, ouverte à chaque garde. »
 *
 * ★★ PERMANENT, ET C'EST LE CONTRAIRE DU JETON DE GARDE — LA RAISON EST DANS
 *    LA PHRASE DU BRIEF. Le lien de garde d'AE1 expire vingt-quatre heures
 *    après la nuit qu'il ouvre, parce qu'il OUVRE UNE NUIT : la suivante donne
 *    un lien neuf, et une fenêtre qui traîne sur un téléphone perdu ne sert
 *    plus qu'à quelqu'un d'autre. Celui-ci ouvre UNE RELATION. Un agriculteur
 *    qui doit redemander son lien à chaque garde est un agriculteur qui
 *    téléphone au coordinateur au lieu d'ouvrir l'application, ce qui est
 *    exactement la charge que ce programme existe pour retirer — et c'est
 *    aussi ce qui rend l'installation sur l'écran d'accueil possible : on
 *    n'installe pas une icône qui périme dans vingt-quatre heures.
 *
 * ⚠️ LA CONTREPARTIE EST DITE, ET C'EST AG2 QUI LA PAIE. Un lien qui ne périme
 *    pas est un lien qui vaut pour toujours si on le retransmet. C'est
 *    précisément pour ce lien-ci que le contrôle par les quatre derniers
 *    chiffres a été demandé, et `core/challenge.ts` écrit en tête ce qu'il
 *    couvre et ce qu'il ne couvre pas.
 *
 * ★ ET IL PORTE LA FERME EN PLUS DU CONTACT, ce qui est une redondance
 *   ASSUMÉE : `getMyFarm` sait retrouver la ferme depuis le contact seul. Le
 *   `farmId` sert à l'écran d'ACCUEIL — celui qui doit dire « la fiche que ce
 *   lien ouvre n'existe plus » plutôt que de rendre un écran vide — et à
 *   l'appareil qui garde le laissez-passer hors ligne.
 */
export interface FarmerToken {
  role: 'farmer'
  /** Id du `FarmContact` — c'est ce que `session.entityId` vaut pour ce rôle. */
  contactId: string
  farmId: string
}

export type FarmerTokenRead =
  | { status: 'valid'; token: FarmerToken }
  | { status: 'malformed'; token: null }

/**
 * Le jeton d'agriculteur, tel qu'il apparaît dans l'URL.
 *
 * ⚠️ MÊME EMPREINTE, MÊME SEL, MÊME PORTÉE QU'EN AE1 : infalsifiable à la
 *    main, pas davantage. Ce qui change ici est qu'il n'y a AUCUNE date à
 *    protéger — donc l'empreinte ne garde plus qu'une chose, l'identité de la
 *    fiche, et c'est le contrôle d'AG2 qui garde la porte.
 */
export function encodeFarmerToken(token: FarmerToken): string {
  const compact = JSON.stringify([1, 'f', token.contactId, token.farmId])
  const body = toBase64Url(new TextEncoder().encode(compact))
  return `${body}.${fingerprint(body)}`
}

export function decodeFarmerToken(raw: string): FarmerTokenRead {
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return { status: 'malformed', token: null }
  const body = raw.slice(0, dot)
  if (raw.slice(dot + 1) !== fingerprint(body)) {
    return { status: 'malformed', token: null }
  }
  const bytes = fromBase64Url(body)
  if (!bytes) return { status: 'malformed', token: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return { status: 'malformed', token: null }
  }
  if (!Array.isArray(parsed) || parsed.length !== 4 || parsed[0] !== 1) {
    return { status: 'malformed', token: null }
  }
  const [, kind, contactId, farmId] = parsed as [number, string, string, string]
  /* ⚠️ LE DISCRIMINANT EST VÉRIFIÉ, ET IL N'EST PAS DÉCORATIF. Les deux
     familles de jetons partagent le même alphabet et la même empreinte ; sans
     ce 'f' un jeton de garde tronqué pourrait se relire comme un jeton
     d'agriculteur et ouvrir la fiche d'une exploitation. */
  if (kind !== 'f') return { status: 'malformed', token: null }
  if (typeof contactId !== 'string' || contactId === '') {
    return { status: 'malformed', token: null }
  }
  if (typeof farmId !== 'string' || farmId === '') {
    return { status: 'malformed', token: null }
  }
  return { status: 'valid', token: { role: 'farmer', contactId, farmId } }
}

/** Le lien complet, tel qu'il part dans le SMS. `origin` est donné (cf. AE1). */
export function buildFarmerLink(origin: string, token: FarmerToken): string {
  return `${origin.replace(/\/+$/, '')}/#/f/${encodeFarmerToken(token)}`
}

export function farmerTokenFor(farm: Farm, contactId: string): FarmerToken {
  return { role: 'farmer', contactId, farmId: farm.id }
}
