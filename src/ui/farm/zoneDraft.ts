import type { FarmZoneKind, LatLng } from '@core/index'
import { readSetting, writeSetting } from '../../storage/local'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BI (2026-10-15) — LE TRACÉ NON TERMINÉ EST GARDÉ SUR L'APPAREIL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO trace sur une tablette, dehors, parfois de nuit. Un appel qui entre ou
 * un écran qui se verrouille ne doit pas effacer trente sommets. Jusqu'ici un
 * tracé non fermé vivait seulement dans l'état de l'écran (BH, 2.1 b).
 *
 * ★ LA RÈGLE : chaque sommet posé est écrit ici (`lo-yanum:zone-draft:<ferme>`).
 *   Il reste LOCAL jusqu'à « סגור פוליגון » — une forme non fermée n'est pas
 *   une donnée du programme — mais il NE DISPARAÎT JAMAIS TOUT SEUL : ni Échap,
 *   ni « ביטול », ni un autre écran, ni une page tuée ne l'effacent. Trois
 *   gestes seulement : fermer le polygone (la forme est alors écrite comme
 *   toute forme), retirer soi-même son dernier sommet, ou « מחיקת הטיוטה »
 *   (confirmé) dans la bande.
 * ★ PLUSIEURS BROUILLONS PAR FERME, et c'est ce qui permet de ne rien bloquer :
 *   un trait raté, Échap, on recommence (`freehand` A87) — le premier reste
 *   gardé, le second en devient un autre. Chacun porte son `id`.
 * ★ À la réouverture de la ferme, une bande nomme la forme du plus récent
 *   (« גבול החווה · חוות X ») et propose de le reprendre ou de le jeter.
 */
export interface ZoneDraft {
  id: string
  zone: FarmZoneKind
  draft: LatLng[]
  traced?: true
  /** Instant du dernier sommet posé (ms). */
  at: number
}

const PREFIX = 'lo-yanum:zone-draft:'
export const zoneDraftKey = (farmId: string): string => `${PREFIX}${farmId}`

let seq = 0
export function newDraftId(): string {
  seq += 1
  return `draft-${Date.now().toString(36)}-${seq}`
}

function parseOne(v: Partial<ZoneDraft> | null | undefined, fallbackId: string): ZoneDraft | null {
  if (!v || typeof v !== 'object') return null
  if (v.zone !== 'farm_boundary' && v.zone !== 'grazing_area') return null
  if (!Array.isArray(v.draft)) return null
  const draft = v.draft.filter(
    (p): p is LatLng => !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  )
  if (draft.length === 0) return null
  return {
    id: typeof v.id === 'string' && v.id ? v.id : fallbackId,
    zone: v.zone,
    draft,
    ...(v.traced ? { traced: true as const } : {}),
    at: typeof v.at === 'number' ? v.at : 0,
  }
}

/** PURE — `bipass` la rejoue : une valeur abîmée n'est pas un brouillon. Le plus récent d'abord. */
export function parseZoneDrafts(raw: string | null): ZoneDraft[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    const list = Array.isArray(v) ? v : [v]
    return list
      .map((d, i) => parseOne(d as Partial<ZoneDraft>, `draft-${i}`))
      .filter((d): d is ZoneDraft => d !== null)
      .sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

export function readZoneDrafts(farmId: string): ZoneDraft[] {
  try {
    return parseZoneDrafts(readSetting(zoneDraftKey(farmId)))
  } catch {
    return []
  }
}

function store(farmId: string, list: ZoneDraft[]): void {
  try {
    if (list.length === 0) writeSetting(zoneDraftKey(farmId), null)
    else writeSetting(zoneDraftKey(farmId), JSON.stringify(list))
  } catch {
    /* Navigation privée : le tracé vit au moins dans l'écran. */
  }
}

/** Écrit (ou met à jour) le brouillon `d.id`. Les autres brouillons de la ferme restent. */
export function writeZoneDraft(farmId: string, d: Omit<ZoneDraft, 'at'>): void {
  /* Un tracé vide n'écrit rien — et n'efface rien. */
  if (d.draft.length === 0) return
  const others = readZoneDrafts(farmId).filter((x) => x.id !== d.id)
  store(farmId, [{ ...d, at: Date.now() }, ...others])
}

/** Efface UN brouillon, celui qu'un geste nommé a fermé ou jeté. */
export function clearZoneDraft(farmId: string, id: string | null): void {
  if (!id) return
  store(
    farmId,
    readZoneDrafts(farmId).filter((x) => x.id !== id),
  )
}
