import { useEffect, useRef, useState } from 'react'

import {
  getMyActiveMissionView,
  getMyFarm,
  getSession,
  getTonightMissionViews,
  getVisibleFarms,
  readCoordinator,
} from '@core/index'
import type { EmergencyContext, Farm, LatLng, Mission } from '@core/index'

import { useCoreValue } from './useCore'
import { useGuardPass } from '../guardPass'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE2 — QUELLE FERME, POUR CHACUN DES QUATRE RÔLES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'écran d'urgence est le même pour tout le monde ; ce qui change est de
 * QUEL endroit il parle, et c'est une question par rôle :
 *
 *   · le volontaire  → la ferme de sa garde en cours ;
 *   · le conducteur  → la ferme de sa course ;
 *   · l'agriculteur  → la sienne, il n'y en a qu'une ;
 *   · le coordinateur → celle de cette nuit, s'il n'y en a qu'une.
 *
 * ⚠️ ET LE COORDINATEUR PEUT N'EN AVOIR AUCUNE, CE QUI EST UN ÉTAT NORMAL ET
 *    NON UNE ERREUR. Trois gardes ce soir : aucune des trois n'est « la »
 *    ferme, et en choisir une donnerait le numéro de la כיתת כוננות de נירים à
 *    quelqu'un qui appelle pour בארי. L'écran affiche alors les numéros
 *    nationaux et le sien, et le dit.
 *
 * ⚠️ ET LE LAISSEZ-PASSER D'AE1 PASSE AVANT LE MAGASIN. Un volontaire venu par
 *    un lien n'a pas de rôle chargé, pas de rôle du tout, et pas forcément de
 *    réseau : ce qu'il a est ce qui est écrit sur son téléphone. C'est la même
 *    priorité que dans `GuardLinkScreen`, et c'est ce qui fait que l'écran
 *    d'urgence marche à 03:00 sans données.
 */
export function useEmergencyContext(): EmergencyContext & {
  mission: Mission | null
  /** Vrai quand la ferme vient du laissez-passer et non du magasin. */
  fromPass: boolean
} {
  const pass = useGuardPass()
  const session = useCoreValue(getSession)
  const roster = useCoreValue(getVisibleFarms)
  const myFarm = useCoreValue(getMyFarm)
  const myMission = useCoreValue(getMyActiveMissionView)
  const tonight = useCoreValue(getTonightMissionViews)
  const coordinator = readCoordinator()

  let farm: Farm | null = null
  let mission: Mission | null = null

  if (session.role === 'farmer') {
    farm = myFarm
  } else if (myMission) {
    farm = myMission.farm
    mission = myMission.mission
  } else if (session.role === 'coordinator' && tonight.length === 1) {
    farm = tonight[0].farm
    mission = tonight[0].mission
  }

  /* Le laissez-passer n'a pas une `Farm` complète — il porte ce qu'AE1.3
     autorise. Quand le magasin ne connaît pas la ferme, on en fabrique une
     minimale à partir de lui, parce que l'écran n'a besoin que des champs
     qu'AE2 lit et qu'un `null` ici priverait le volontaire de ses numéros. */
  const fromPass = farm === null && pass !== null
  if (fromPass && pass) {
    farm = {
      id: pass.farm.id,
      name: pass.farm.name,
      locality: pass.farm.locality,
      position: pass.farm.position,
      siteAccess: pass.farm.siteAccess,
      gateCode: pass.farm.gateCode,
      parking: pass.farm.parking,
      terrainNotes: pass.farm.terrain,
    } as Farm
  }

  const primary = farm?.contacts?.find((c) => c.isPrimary) ?? null
  const farmer =
    primary !== null
      ? { name: primary.name, phone: primary.phone }
      : farm?.farmerName || farm?.farmerPhone
        ? { name: farm.farmerName ?? '', phone: farm.farmerPhone ?? '' }
        : fromPass && pass
          ? (() => {
              const n = pass.numbers.find((x) => x.labelKey === 'anchor.labelFarmer')
              return n ? { name: n.name, phone: n.phone } : null
            })()
          : null

  return {
    farm,
    roster,
    coordinator: { name: coordinator.name, phone: coordinator.phone },
    farmer,
    mission,
    fromPass,
  }
}

/**
 * ★★ AE2a — LE POINT GPS EST DEMANDÉ À L'OUVERTURE DE L'ÉCRAN, PAS À L'APPUI.
 *
 *    C'est la décision qui fait tenir le budget de deux secondes. Un premier
 *    fix GPS coûte de trois à trente secondes dans un champ ; demandé au
 *    moment de l'appui, il tiendrait l'alerte en otage exactement quand elle
 *    presse. Demandé à l'ouverture, il arrive PENDANT que le pouce cherche le
 *    bouton, et l'appui lit une valeur déjà là.
 *
 * ⚠️ ET IL N'Y A AUCUNE ATTENTE AU MOMENT DU DÉCLENCHEMENT. Pas de fix : on
 *    part avec la position de la ferme, marquée comme approximative dans le
 *    SMS (`positionIsFallback`). Une alerte qui dit « à peu près à la ferme
 *    Retem » part ; une alerte qui attend un satellite ne part pas.
 *
 * ⚠️ `watchPosition` ET NON `getCurrentPosition`, parce que la précision
 *    s'améliore en trente secondes et que le volontaire marche.
 */
export function useLastFix(): { current: LatLng | null } {
  const ref = useRef<LatLng | null>(null)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    let id: number | null = null
    try {
      id = navigator.geolocation.watchPosition(
        (p) => {
          ref.current = { lat: p.coords.latitude, lng: p.coords.longitude }
        },
        () => {
          /* Refusé, indisponible, ou hors délai. Le repli est la ferme, et il
             est déjà en place — il n'y a rien à faire ici, surtout pas
             réessayer en boucle sur un téléphone dont la batterie est le
             consommable le plus critique de la nuit. */
        },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
      )
    } catch {
      // Contexte non sécurisé, ou API absente.
    }
    return () => {
      if (id !== null) navigator.geolocation.clearWatch(id)
    }
  }, [])
  return ref
}

/**
 * ★ AE2a.5 — « RETOUR VISUEL ET SONORE NET ».
 *
 * Un bip court et deux vibrations. Pas un fichier son — il faudrait le
 * charger, donc du réseau, donc précisément la voie dont cet écran ne dépend
 * pas. Un oscillateur de trois cents millisecondes est dans le navigateur.
 *
 * ⚠️ ET ÇA NE JETTE JAMAIS. iOS refuse l'audio hors geste utilisateur, et
 *    certains navigateurs n'ont pas `vibrate`. L'alerte ne dépend d'aucun des
 *    deux : ce sont des accusés de réception, pas des voies de transmission.
 */
export function acknowledge(): void {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctx) {
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 880
      gain.gain.value = 0.15
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.3)
      osc.onended = () => void ctx.close().catch(() => undefined)
    }
  } catch {
    // Pas de son. L'écran dit la même chose en toutes lettres.
  }
  try {
    navigator.vibrate?.([120, 80, 120])
  } catch {
    // Idem.
  }
}

/** Petit utilitaire d'écran : « il y a N minutes », sans dépendance. */
export function useNowTick(everyMs = 30_000): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return t
}
