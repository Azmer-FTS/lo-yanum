import type { LatLng } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF2.3 (2026-09-09) — « LA LOCALISATION NE DOIT ÊTRE AUTORISÉE QU'UNE
 *    FOIS. »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO : « Le PO doit la réaccorder à chaque session : la permission et la
 * dernière position connue sont conservées, et l'app ne redemande que si le
 * système l'a révoquée. »
 *
 * Il y avait CINQ appels indépendants à `navigator.geolocation` dans l'app —
 * la pile d'outils de la carte, le point de départ des réglages, le formulaire
 * d'incident, l'écran d'urgence, et le suivi de la carte — chacun avec ses
 * propres options, chacun capable de déclencher sa propre invite, aucun ne
 * sachant ce que les quatre autres avaient déjà obtenu. Ce fichier est la
 * porte unique.
 *
 * ★★ CE QU'ON PEUT VRAIMENT FAIRE, ET CE QU'ON NE PEUT PAS. À dire clairement,
 *    parce que la moitié du symptôme n'est pas à nous :
 *
 *    · CE QUI EST À NOUS et qui est corrigé ici — demander UNE fois par
 *      session au lieu de cinq ; ne jamais demander quand l'état de permission
 *      est déjà `denied` (une invite qui ne peut que échouer est une invite
 *      qui apprend à l'utilisateur à refuser) ; et servir la DERNIÈRE POSITION
 *      CONNUE immédiatement, de mémoire puis de `localStorage`, pour que
 *      l'écran ait une réponse avant même que le GPS en ait une.
 *
 *    · CE QUI N'EST PAS À NOUS : c'est le SYSTÈME qui décide si une origine
 *      garde son autorisation entre deux sessions. Safari sur iOS n'accorde à
 *      un site web qu'une permission de session ; une PWA INSTALLÉE la garde.
 *      Aucune ligne de JavaScript ne peut changer cela, et prétendre le
 *      contraire produirait un réglage qui ne déclenche rien. La conséquence
 *      pratique pour le PO est dans le rapport : installer l'app sur l'écran
 *      d'accueil est ce qui rend la permission durable.
 *
 * ★ ET LA DERNIÈRE POSITION SURVIT À TOUT, y compris à un refus. Un
 *   coordinateur qui a refusé ce matin garde le point d'hier soir plutôt qu'un
 *   écran vide : c'est une donnée qu'il nous a donnée, pas une donnée qu'on
 *   redemande.
 */

import { noteGeoPrompt } from './geoDiagnostics'

const KEY = 'lo-yanum:last-fix'
/**
 * ★★ AG7 — LA PERMISSION OBSERVÉE, MISE EN CACHE PAR NOUS.
 *
 * ⚠️ CE CACHE N'EXISTE QUE PARCE QUE `navigator.permissions` PEUT NE PAS
 *    RÉPONDRE, ET C'EST LE PREMIER RÉSULTAT DE LA MESURE D'AG7. `permissionStatus`
 *    rend `'unknown'` quand le navigateur ne connaît pas le nom de permission
 *    « geolocation » — ce qui a longtemps été le cas de Safari — et une origine
 *    qui ne peut pas LIRE son état ne peut rien en déduire non plus. Ce que
 *    l'application SAIT quand même, c'est qu'un relevé a réussi : un appareil
 *    ne rend pas de coordonnées à une origine qui n'a pas l'autorisation. Un
 *    succès EST donc une observation de `granted`, et c'est la seule que ce
 *    programme puisse produire sans rien demander.
 *
 * ⛔ ET ÇA N'EMPÊCHE PAS UNE INVITE, IL FAUT LE DIRE : c'est le SYSTÈME qui
 *    décide d'en poser une, pas nous. Ce que ce cache empêche est la SECONDE
 *    invite de la même session, et il permet aux écrans de servir le dernier
 *    point connu sans repasser par l'appareil. Voir le rapport d'AG7 pour ce
 *    que la mesure a dit de la première.
 */
const GRANTED_KEY = 'lo-yanum:geo-granted'

export interface Fix {
  position: LatLng
  /** Rayon d'incertitude en mètres, tel que l'appareil le rapporte. */
  accuracy: number
  /** Instant du relevé, en millisecondes. */
  at: number
}

export type PermissionStatus = 'granted' | 'prompt' | 'denied' | 'unknown'

let cached: Fix | null | undefined

function load(): Fix | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<Fix> & { position?: Partial<LatLng> }
    const lat = Number(p.position?.lat)
    const lng = Number(p.position?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return {
      position: { lat, lng },
      accuracy: Number(p.accuracy) || 0,
      at: Number(p.at) || 0,
    }
  } catch {
    return null
  }
}

/** Le dernier point connu, ou `null` si l'appareil n'en a jamais donné. */
export function lastFix(): Fix | null {
  if (cached === undefined) cached = load()
  return cached
}

/** Ce que l'appareil nous a répondu la dernière fois qu'il a répondu. */
function rememberGranted(): void {
  try {
    localStorage.setItem(GRANTED_KEY, String(Date.now()))
  } catch {
    // Navigation privée : l'observation vit pour cette session.
  }
}

/** A-t-on déjà obtenu un relevé de cet appareil ? */
export function everGranted(): boolean {
  try {
    return localStorage.getItem(GRANTED_KEY) !== null
  } catch {
    return false
  }
}

function remember(position: GeolocationPosition): Fix {
  const fix: Fix = {
    position: { lat: position.coords.latitude, lng: position.coords.longitude },
    accuracy: position.coords.accuracy ?? 0,
    at: position.timestamp || Date.now(),
  }
  cached = fix
  rememberGranted()
  try {
    localStorage.setItem(KEY, JSON.stringify(fix))
  } catch {
    // Navigation privée : le point vit pour cette session, ce qui suffit.
  }
  return fix
}

/**
 * L'état de l'autorisation SANS la demander.
 *
 * ⚠️ `navigator.permissions` N'EXISTE PAS PARTOUT, et son absence n'est pas un
 *    refus. Safari l'a depuis la 16 ; avant, la seule façon de savoir est de
 *    demander. `'unknown'` dit « il faudra essayer » et les appelants le
 *    traitent comme `'prompt'` — ce qui est le comportement d'avant ce
 *    fichier, donc rien ne régresse sur un appareil ancien.
 */
export async function permissionStatus(): Promise<PermissionStatus> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'denied'
  const permissions = (navigator as Navigator).permissions
  if (!permissions?.query) return 'unknown'
  try {
    const result = await permissions.query({ name: 'geolocation' as PermissionName })
    return result.state as PermissionStatus
  } catch {
    return 'unknown'
  }
}

/**
 * Une demande en vol, partagée. Deux écrans qui s'ouvrent ensemble — la carte
 * et le panneau d'urgence — posaient deux invites l'une sur l'autre.
 */
let inFlight: Promise<Fix | null> | null = null

export interface LocateOptions {
  /**
   * Âge maximal, en millisecondes, d'un point déjà connu qui dispenserait
   * d'interroger l'appareil. Par défaut deux minutes : un coordinateur qui
   * ouvre trois écrans à la suite dans un champ n'a pas bougé entre-temps.
   */
  maxAgeMs?: number
  /** Précision fine. Coûte de la batterie et du temps ; défaut `true`. */
  highAccuracy?: boolean
  timeoutMs?: number
}

/**
 * Un point, ou `null`.
 *
 * ★ NE DEMANDE JAMAIS QUAND C'EST DÉJÀ REFUSÉ. Le contrat compte : `null` veut
 *   dire « pas de point », pas « refus » — l'appelant qui a besoin de la
 *   nuance appelle `permissionStatus()`, comme le fait la pile d'outils de la
 *   carte pour distinguer ses deux messages.
 */
export async function locate(options: LocateOptions = {}): Promise<Fix | null> {
  const maxAge = options.maxAgeMs ?? 120_000
  const known = lastFix()
  if (known && Date.now() - known.at <= maxAge) return known

  const status = await permissionStatus()
  if (status === 'denied') return known

  if (inFlight) return await inFlight
  inFlight = new Promise<Fix | null>((resolve) => {
    /* ★ AG7 — CHAQUE INTERROGATION RÉELLE EST COMPTÉE, ICI ET NULLE PART
       AILLEURS. Depuis AF2.3 il n'existe qu'une porte vers l'API de
       localisation, donc compter à la porte compte tout. */
    noteGeoPrompt()
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(remember(position)),
      () => resolve(known),
      {
        enableHighAccuracy: options.highAccuracy ?? true,
        timeout: options.timeoutMs ?? 12_000,
        /* ★ `maximumAge` EST DONNÉ AU NAVIGATEUR AUSSI, et pas seulement tenu
           ici : le cache de l'appareil est meilleur que le nôtre — il connaît
           les relevés faits par les autres onglets et par le système. */
        maximumAge: maxAge,
      },
    )
  }).finally(() => {
    inFlight = null
  }) as Promise<Fix | null>
  return await inFlight
}

/**
 * Le suivi continu, pour les deux écrans qui en ont besoin (le point « vous
 * êtes ici » de la carte, et l'écran d'urgence pendant qu'il est ouvert).
 * Chaque relevé est mémorisé, donc un écran qui suit ALIMENTE la dernière
 * position connue de tous les autres.
 */
export function watch(
  onFix: (fix: Fix) => void,
  options: { highAccuracy?: boolean; maxAgeMs?: number } = {},
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return () => undefined
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ★★ AG7 — LE DÉFAUT QUE LA MESURE A TROUVÉ, ET IL ÉTAIT DANS CE FICHIER.
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * AF2.3 a réuni cinq appels en une porte et a mis la garde « ne demande
   * jamais quand c'est déjà refusé » dans `locate()`. `watch()` ne l'a pas
   * reçue — et `watchPosition` pose une invite exactement comme
   * `getCurrentPosition`. Conséquence mesurable : ouvrir l'écran d'urgence
   * (`useLastFix`) ou allumer le point « vous êtes ici » de la carte pose une
   * invite que la porte croyait avoir supprimée, y compris juste après un
   * refus. C'est UNE des deux moitiés du symptôme du PO, et c'est celle qui
   * est à nous.
   *
   * ⚠️ ET LE SUIVI EST COMPTÉ COMME UNE INTERROGATION, parce que c'en est une.
   *    Un compteur qui ne compterait que `getCurrentPosition` aurait affiché
   *    « 1 invite » sur une session qui en a posé deux, et le diagnostic aurait
   *    innocenté le code qui est en cause.
   */
  /**
   * ⚠️ ET LA GARDE EST DIFFÉRÉE PLUTÔT QUE SAUTÉE, CE QUI EST LE SEUL MOYEN DE
   *    L'AVOIR ICI. `permissionStatus()` est asynchrone et cette fonction rend
   *    un désabonnement SYNCHRONE — c'est ce que veut un `useEffect`. Le suivi
   *    part donc au tour de boucle suivant, quand la réponse est connue, et ne
   *    part pas du tout quand elle est `denied`. Un appelant qui se démonte
   *    entre-temps annule avant que rien n'ait été ouvert : `cancelled` est
   *    exactement là pour ça.
   *
   * ★ ET `'unknown'` LAISSE PASSER, comme dans `locate()`. Un navigateur qui
   *   ne sait pas répondre n'a pas dit non ; refuser sur son silence enlèverait
   *   la position à l'écran d'urgence sur tout appareil un peu ancien, ce qui
   *   est le pire échange que ce fichier puisse faire.
   */
  let cancelled = false
  let id: number | null = null

  void permissionStatus().then((status) => {
    if (cancelled || status === 'denied') return
    noteGeoPrompt()
    id = navigator.geolocation.watchPosition(
      (position) => onFix(remember(position)),
      () => {
        /* Un relevé perdu pendant le suivi ne vaut pas un changement d'état :
           le point cesse simplement d'avancer jusqu'au suivant. */
      },
      {
        enableHighAccuracy: options.highAccuracy ?? true,
        maximumAge: options.maxAgeMs ?? 10_000,
      },
    )
  })

  return () => {
    cancelled = true
    if (id !== null) navigator.geolocation.clearWatch(id)
  }
}
