import { createContext } from 'react'

import { readSetting, writeSetting } from '../../storage/local'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BK (2026-10-18) — LA ZONE REGARDÉE SUIT LE COMPTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Je quitte mon bureau en regardant une zone et je retrouve la même zone
 *     sur mon téléphone. »                                         — le PO
 *
 * ⚠️ LE PO A NOMMÉ `map-last` POUR CE SCÉNARIO, ET `map-last` NE LE PORTAIT
 *    PAS : c'est l'identifiant du dernier ÉCRAN de carte (`mapMode.tsx`), rien
 *    sur la position. Aucune position n'était mémorisée nulle part : chaque
 *    ouverture cadrait ses données. Ce module la garde, sur le COMPTE.
 *
 * ★ UNE SEULE ZONE, ET SON ÉCRAN. Elle revient quand on rouvre le MÊME écran
 *   de carte général (la liste des fermes, la couverture, l'agenda…). Une fiche
 *   (une ferme, une mission, un incident, un formulaire) cadre TOUJOURS son
 *   objet : y retrouver la zone d'une autre fiche serait un défaut.
 *
 * ★ ÉCRITE APRÈS UN GESTE DU PO SEULEMENT — jamais par un cadrage automatique
 *   (`userControlledRef` de MapCanvas, BF) — et une seconde après la fin du
 *   mouvement : un glissement est UNE écriture, pas cinquante.
 */
const KEY = 'lo-yanum:map-view'

/** Les écrans de carte GÉNÉRAUX : ceux où la zone regardée a un sens d'une visite à l'autre. */
export const VIEW_SCREENS: ReadonlySet<string> = new Set([
  'farms',
  'dashboard',
  'coverage',
  'leads',
  'institutions',
  'volunteers',
  'agenda',
  'incidents',
  'missions',
  'route',
])

/** L'écran de carte général qui entoure une carte, ou `null` (une fiche, un formulaire, une carte isolée). */
export const MapViewScope = createContext<string | null>(null)

export interface StoredMapView {
  screen: string
  lng: number
  lat: number
  zoom: number
}

export function readMapView(screen: string): StoredMapView | null {
  try {
    const raw = readSetting(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as StoredMapView
    return v.screen === screen ? v : null
  } catch {
    return null
  }
}

export function writeMapView(view: StoredMapView): void {
  const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d
  try {
    writeSetting(KEY, JSON.stringify({ screen: view.screen, lng: round(view.lng, 6), lat: round(view.lat, 6), zoom: round(view.zoom, 2) }))
  } catch {
    /* Une commodité : la carte marche sans. */
  }
}
