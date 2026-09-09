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

const KEY = 'lo-yanum:last-fix'

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

function remember(position: GeolocationPosition): Fix {
  const fix: Fix = {
    position: { lat: position.coords.latitude, lng: position.coords.longitude },
    accuracy: position.coords.accuracy ?? 0,
    at: position.timestamp || Date.now(),
  }
  cached = fix
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
  const id = navigator.geolocation.watchPosition(
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
  return () => navigator.geolocation.clearWatch(id)
}
