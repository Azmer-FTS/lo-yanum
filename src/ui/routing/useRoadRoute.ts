import { useEffect, useMemo, useRef, useState } from 'react'

import type { LatLng } from '@core/index'
import type { RoadLeg } from '@core/roadGraph'

import type { MapRouteLine } from '../components/MapCanvas'
import { planRoadRoute } from './roadNetwork'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AN3 (2026-09-16) — LE TRACÉ SUR ROUTE, UN SEUL BRANCHEMENT POUR TOUT
 *    TRAJET AFFICHÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AI2 avait branché le tracé sur route dans l'itinéraire libre, et SEULEMENT
 * là : le planificateur de tournée dessinait `routePolyline`, un trait droit de
 * ferme en ferme (mesuré : `legacy:1` en permanence, trois fermes cochées). Le
 * calcul vit ici maintenant, et les deux écrans qui dessinent un trajet
 * l'appellent. (L'agenda et « ma journée » ne dessinent pas de trajet : des
 * repères numérotés seulement.)
 *
 * ★ « LES TRAJETS APPARAISSENT ET DISPARAISSENT » — MESURÉ AVANT CORRECTIF
 *   (`scripts/anflicker.ts`, source `route` échantillonnée toutes les 100 ms) :
 *   aucune phase vide, même en changeant de mode d'affichage ; mais à CHAQUE
 *   étape ajoutée, tout le tracé routier était remplacé par un trait droit
 *   jusqu'au retour du calcul (0,1–0,5 s sur le Mac, 1,2–1,9 s mesuré sur iPad
 *   en AI) — les routes disparaissaient, un trait droit apparaissait, puis
 *   l'inverse. Désormais les étapes DÉJÀ tracées restent dessinées pendant le
 *   calcul ; seule une étape nouvelle est estimée en pointillé, le temps que la
 *   route revienne.
 */

export interface RoadRouteState {
  /** Une étape par couple de points consécutifs ; `null` = pas (encore) de chemin. */
  legs: Array<RoadLeg | null>
  /** Le calcul en cours ne répond pas encore à la suite de points affichée. */
  pending: boolean
  unavailable: boolean
  ms: number
  tiles: number
  routeLines: MapRouteLine[]
}

const legKey = (a: LatLng, b: LatLng) =>
  `${a.lat.toFixed(6)},${a.lng.toFixed(6)}>${b.lat.toFixed(6)},${b.lng.toFixed(6)}`

export function useRoadRoute(points: LatLng[]): RoadRouteState {
  const key = points.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|')
  const [result, setResult] = useState<{
    key: string
    legs: Array<RoadLeg | null>
    unavailable: boolean
    ms: number
    tiles: number
  } | null>(null)
  /** Les étapes déjà tracées, par couple de points : ce qui reste à l'écran pendant un recalcul. */
  const known = useRef(new Map<string, RoadLeg>())

  useEffect(() => {
    if (points.length < 2) return
    let live = true
    planRoadRoute(points)
      .then((r) => {
        ;(window as unknown as { __loYanumLastRoad?: unknown }).__loYanumLastRoad = {
          timings: r.timings,
          breakdown: r.breakdown,
          stats: r.stats,
        }
        r.legs.forEach((leg, i) => {
          if (leg) known.current.set(legKey(points[i], points[i + 1]), leg)
        })
        if (!live) return
        setResult({
          key,
          legs: r.legs,
          unavailable: r.unavailable,
          ms: Math.round(r.timings.totalMs),
          tiles: r.timings.tilesRead,
        })
      })
      .catch(() => {
        if (!live) return
        setResult({ key, legs: points.slice(1).map(() => null), unavailable: true, ms: 0, tiles: 0 })
      })
    return () => {
      live = false
    }
    // `key` résume `points` ; le tableau change d'identité à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return useMemo(() => {
    const current = result && result.key === key ? result : null
    const legs: Array<RoadLeg | null> = []
    const routeLines: MapRouteLine[] = []
    for (let i = 1; i < points.length; i++) {
      const leg = current ? current.legs[i - 1] : (known.current.get(legKey(points[i - 1], points[i])) ?? null)
      legs.push(leg)
      if (leg) {
        routeLines.push({ coords: leg.coords, style: 'road' })
        for (const gap of leg.gaps) routeLines.push({ coords: [gap[0], gap[1]], style: 'gap' })
      } else {
        routeLines.push({ coords: [points[i - 1], points[i]], style: 'estimate' })
      }
    }
    return {
      legs,
      pending: points.length >= 2 && !current,
      unavailable: current?.unavailable ?? false,
      ms: current?.ms ?? 0,
      tiles: current?.tiles ?? 0,
      routeLines,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, key])
}
