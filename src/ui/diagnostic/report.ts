/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BI (2026-10-15) — LE RELEVÉ D'UN APPAREIL, PUR (`bipass` le rejoue).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Sur l'iPad la forme est là, sur l'ordinateur elle n'apparaît pas. » Le même
 * code, les mêmes 77 sommets reçus — donc un ÉTAT diffère. Ce relevé met côte à
 * côte ce qui peut différer d'un appareil à l'autre, dans l'ordre du chemin
 * « servi → exécuté → relu → en mémoire → donné à la carte → dessiné », et en
 * tire UNE phrase (`diagnosticVerdict`) que le PO peut lire sans console.
 *
 * Ce module ne lit rien lui-même : `DeviceDiagnostic.tsx` remplit l'instantané,
 * ici on le juge et on l'écrit. Le texte copié est celui qu'on m'envoie.
 */

export interface BuildInfo {
  id: string
  builtAt: string
}

export interface DiagnosticShape {
  id: string
  kind: 'farm_boundary' | 'grazing_area'
  vertices: number
}

export interface DiagnosticSnapshot {
  /** L'instant du relevé (ms). */
  at: number
  /** Le bundle qui TOURNE (`__BUILD_ID__`). */
  running: BuildInfo
  /** Le bundle SERVI (`version.json`), ou la raison de son absence. */
  served: BuildInfo | { error: string } | null
  worker: { supported: boolean; controlled: boolean }
  standalone: boolean
  address: string
  userAgent: string
  screen: string
  theme: 'light' | 'dark'
  ground: string
  /** null : build sans base (jumeau, démonstration). */
  data: { status: string; loadedAt: number | null; pending: number; stale: boolean; message: string | null } | null
  memory: { zones: number; vertices: number }
  /** La ferme dont la fiche est ouverte, ou null. */
  farm: { id: string; name: string; shapes: DiagnosticShape[] } | null
  /** Ce que la carte montée a reçu dans sa source `zones` ; null : aucune carte. */
  drawn: Array<{ id: string; vertices: number }> | null
  layers: {
    /** Les couches de formes éteintes (`boundaries`, `grazing`). */
    zonesOff: string[]
    /** Toutes les couches éteintes, pour le texte. */
    off: string[]
    /** Instant du choix sur CET appareil (0 : jamais choisi depuis BI). */
    stamp: number
    /** La réactivation de BI, si elle a eu lieu ici. */
    migration: { at: number; restored: string[] } | null
  }
  viewAs: string | null
  settingsSyncAt: number
}

export type VerdictCode =
  | 'stale-bundle'
  | 'no-data-read'
  | 'farm-no-shapes'
  | 'hidden-by-layers'
  | 'map-missing-shapes'
  | 'no-map'
  | 'ok'
  | 'no-farm'

export interface Verdict {
  code: VerdictCode
  /** Les nombres que la phrase cite. */
  shapes?: number
  drawn?: number
}

function servedId(s: DiagnosticSnapshot): string | null {
  return s.served && 'id' in s.served ? s.served.id : null
}

/** ★ Les formes de la ferme ouverte que la carte a réellement reçues. */
export function drawnForFarm(s: DiagnosticSnapshot): number {
  if (!s.farm || !s.drawn) return 0
  const ids = new Set(s.farm.shapes.map((z) => z.id))
  return s.drawn.filter((d) => ids.has(d.id)).length
}

/**
 * ★ LA PHRASE, DANS L'ORDRE DU CHEMIN : la première étape qui casse est celle
 * qu'on nomme. Un bundle plus vieux que le servi d'abord (rien d'autre ne
 * compte s'il tourne un autre code), puis la relecture, puis la mémoire, puis
 * les couches, puis la carte.
 */
export function diagnosticVerdict(s: DiagnosticSnapshot): Verdict {
  const served = servedId(s)
  if (served !== null && served !== s.running.id) return { code: 'stale-bundle' }
  if (s.data && s.data.loadedAt === null) return { code: 'no-data-read' }
  if (!s.farm) return { code: 'no-farm' }
  const shapes = s.farm.shapes.length
  if (shapes === 0) return { code: 'farm-no-shapes', shapes }
  const hidden = s.farm.shapes.filter(
    (z) => (z.kind === 'farm_boundary' && s.layers.zonesOff.includes('boundaries')) || (z.kind === 'grazing_area' && s.layers.zonesOff.includes('grazing')),
  ).length
  if (s.drawn === null) return hidden > 0 ? { code: 'hidden-by-layers', shapes, drawn: shapes - hidden } : { code: 'no-map', shapes }
  const drawn = drawnForFarm(s)
  if (hidden > 0) return { code: 'hidden-by-layers', shapes, drawn }
  if (drawn < shapes) return { code: 'map-missing-shapes', shapes, drawn }
  return { code: 'ok', shapes, drawn }
}

export type Translate = (key: string, opts?: Record<string, unknown>) => string

export interface DiagnosticLine {
  key: string
  label: string
  value: string
}

/** Les lignes du panneau, dans l'ordre du chemin ; le texte copié est leur suite. */
export function diagnosticLines(s: DiagnosticSnapshot, t: Translate, when: (ms: number | string) => string): DiagnosticLine[] {
  const L = (key: string, value: string): DiagnosticLine => ({ key, label: t(`diagnostic.rows.${key}`), value })
  const served = s.served === null ? t('diagnostic.pending') : 'id' in s.served ? `${s.served.id} · ${when(s.served.builtAt)}` : t('diagnostic.servedError', { reason: s.served.error })
  const v = diagnosticVerdict(s)
  const lines: DiagnosticLine[] = [
    L('verdict', t(`diagnostic.verdict.${v.code}`, { shapes: v.shapes ?? 0, drawn: v.drawn ?? 0 })),
    L('running', `${s.running.id} · ${when(s.running.builtAt)}`),
    L('served', served),
    L('worker', t(!s.worker.supported ? 'diagnostic.workerNone' : s.worker.controlled ? 'diagnostic.workerOn' : 'diagnostic.workerOff')),
    L('mode', t(s.standalone ? 'diagnostic.standalone' : 'diagnostic.browser')),
    L('address', s.address),
    L('device', `${s.userAgent} · ${s.screen}`),
    L(
      'lastRead',
      s.data === null
        ? t('diagnostic.noBase')
        : s.data.loadedAt === null
          ? t('diagnostic.never', { status: s.data.status })
          : `${when(s.data.loadedAt)}${s.data.stale ? ` · ${t('diagnostic.stale')}` : ''}`,
    ),
    L('pending', String(s.data?.pending ?? 0)),
    L('memory', t('diagnostic.shapesVertices', { shapes: s.memory.zones, vertices: s.memory.vertices })),
  ]
  if (s.farm) {
    const per = s.farm.shapes.map((z) => `${t(`diagnostic.kind.${z.kind}`)} ${z.vertices}`).join(' · ')
    lines.push(L('farm', `${s.farm.name} (${s.farm.id}) — ${t('diagnostic.shapesCount', { count: s.farm.shapes.length })}${per ? ` : ${per}` : ''}`))
    lines.push(
      L(
        'drawn',
        s.drawn === null
          ? t('diagnostic.noMap')
          : t('diagnostic.drawnOf', { drawn: drawnForFarm(s), shapes: s.farm.shapes.length, total: s.drawn.length }),
      ),
    )
  } else {
    lines.push(L('farm', t('diagnostic.noFarm')))
    lines.push(L('drawn', s.drawn === null ? t('diagnostic.noMap') : t('diagnostic.drawnTotal', { total: s.drawn.length })))
  }
  lines.push(
    L(
      'zoneLayers',
      s.layers.zonesOff.length === 0
        ? t('diagnostic.zoneLayersOn')
        : t('diagnostic.zoneLayersOff', { list: s.layers.zonesOff.map((k) => t(`map.layers.${k}`)).join(', ') }),
    ),
  )
  lines.push(L('layersOff', s.layers.off.length === 0 ? t('diagnostic.none') : s.layers.off.map((k) => t(`map.layers.${k}`, { defaultValue: k })).join(', ')))
  lines.push(L('layersSource', s.layers.stamp > 0 ? t('diagnostic.layersSynced', { at: when(s.layers.stamp) }) : t('diagnostic.layersLocal')))
  lines.push(
    L(
      'migration',
      s.layers.migration
        ? t('diagnostic.migrated', { at: when(s.layers.migration.at), list: s.layers.migration.restored.map((k) => t(`map.layers.${k}`)).join(', ') })
        : t('diagnostic.notMigrated'),
    ),
  )
  lines.push(L('ground', t(`diagnostic.ground.${s.ground}`, { defaultValue: s.ground })))
  lines.push(L('theme', t(`diagnostic.theme.${s.theme}`)))
  lines.push(L('viewAs', s.viewAs ?? t('diagnostic.none')))
  lines.push(L('settingsSync', s.settingsSyncAt > 0 ? when(s.settingsSyncAt) : t('diagnostic.neverShort')))
  lines.push(L('at', when(s.at)))
  return lines
}

/** Le texte copié : un titre, puis une ligne par entrée. */
export function diagnosticText(s: DiagnosticSnapshot, t: Translate, when: (ms: number | string) => string): string {
  return [t('diagnostic.title'), ...diagnosticLines(s, t, when).map((l) => `${l.label}: ${l.value}`)].join('\n')
}
