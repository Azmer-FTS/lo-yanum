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
    /** ★★★ BJ — instant SERVEUR de la valeur du compte (0 : le compte n'a rien). */
    stamp: number
    /** La réactivation de BI, si elle a eu lieu ici. */
    migration: { at: number; restored: string[] } | null
  }
  viewAs: string | null
  settingsSyncAt: number
  /** ★★★ BJ — chaque réglage : portée, appareil, compte, dernière synchronisation. */
  settings: SettingsDiagnostic
}

/** ★★★ BJ — une ligne du bloc des réglages. */
export interface SettingDiagRow {
  key: string
  scope: 'account' | 'device'
  /** Pour « appareil » : la raison admise (draft · offline · auth · diagnostic · machine · screen). */
  reason: string | null
  /** Valeur brute sur l'appareil (`null` = absente → défaut). */
  device: string | null
  /** Valeur du compte au dernier contact ; `undefined` = inconnue. Une longue valeur arrive en empreinte `#h:…:<longueur>`. */
  account: string | null | undefined
  accountAt: string | null
  pending: boolean
  differs: boolean
  /** Dernière synchronisation réussie couvrant la clé (ms, 0 = jamais). */
  syncedAt: number
}

export interface SettingsDiagnostic {
  /** Le build parle à un compte (faux pour le jumeau). */
  connected: boolean
  rows: SettingDiagRow[]
  migration: { at: number; promoted: number; legacy: number; accountWon: number; defaulted: number; lostRace: number } | null
  /** Accès refusés (clé non déclarée, valeur illisible) depuis l'ouverture de la page. */
  refused: string[]
  /** ★★ BK — les comptes rendus : file hors ligne, ancienne clé encore là, et ce qu'a fait sa vidange. */
  activity?: { pending: number; legacy: number; drained: { at: string; sent: number; kept: number; erased: boolean } | null }
  /** ★★ BK — les plis par ferme d'avant BK (`farm-form-…`) encore rangés ici : abandonnés, jamais lus. */
  abandonedFolds?: number
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
  lines.push(...settingsLines(s, t, when))
  lines.push(L('at', when(s.at)))
  return lines
}

// ---------------------------------------------------------------------------
// ★★★ BJ — LE BLOC DES RÉGLAGES
// ---------------------------------------------------------------------------

/** Une valeur, lisible en une ligne (une longue valeur est résumée, jamais recopiée). */
export function shortValue(v: string | null | undefined, t: Translate): string {
  if (v === undefined) return t('diagnostic.settings.unknown')
  if (v === null) return t('diagnostic.settings.absent')
  const fp = /^#h:[0-9a-f]+:(\d+)$/.exec(v)
  if (fp) return t('diagnostic.settings.bytes', { n: Number(fp[1]) })
  const flat = v.replace(/\s+/g, ' ')
  return flat.length > 60 ? `${flat.slice(0, 57)}… (${t('diagnostic.settings.bytes', { n: v.length })})` : flat
}

/** ★ Les deux valeurs diffèrent : la phrase, en clair. */
export function differsText(r: SettingDiagRow, t: Translate): string {
  if (r.pending) return t('diagnostic.settings.differsPending')
  return t('diagnostic.settings.differs', { device: shortValue(r.device, t), account: shortValue(r.account, t) })
}

/** Une ligne de réglage, telle que le texte copié la porte. */
export function settingRowText(r: SettingDiagRow, t: Translate, when: (ms: number | string) => string): string {
  const scope = r.scope === 'account' ? t('diagnostic.settings.scope.account') : `${t('diagnostic.settings.scope.device')} · ${t(`diagnostic.settings.reason.${r.reason ?? 'diagnostic'}`)}`
  const parts = [`${r.key} [${scope}]`, `${t('diagnostic.settings.columns.device')}: ${shortValue(r.device, t)}`]
  if (r.scope === 'account') {
    parts.push(`${t('diagnostic.settings.columns.account')}: ${shortValue(r.account, t)}`)
    parts.push(r.pending ? t('diagnostic.settings.pendingSince') : r.syncedAt > 0 ? t('diagnostic.settings.synced', { at: when(r.syncedAt) }) : t('diagnostic.settings.neverSynced'))
    if (r.differs) parts.push(differsText(r, t))
  }
  return parts.join(' · ')
}

/** Les lignes de synthèse du bloc (le détail réglage par réglage suit dans le texte copié). */
export function settingsLines(s: DiagnosticSnapshot, t: Translate, when: (ms: number | string) => string): DiagnosticLine[] {
  const L = (key: string, value: string): DiagnosticLine => ({ key, label: t(`diagnostic.rows.${key}`), value })
  const st = s.settings
  if (!st) return []
  const account = st.rows.filter((r) => r.scope === 'account')
  const differ = account.filter((r) => r.differs)
  const out: DiagnosticLine[] = [
    L(
      'settingsSummary',
      st.connected
        ? t('diagnostic.settings.summary', { account: account.length, device: st.rows.length - account.length, differ: differ.length, pending: account.filter((r) => r.pending).length })
        : t('diagnostic.settings.noAccount'),
    ),
    L('settingsDiffer', differ.length === 0 ? t('diagnostic.settings.noneDiffer') : differ.map((r) => `${r.key} — ${differsText(r, t)}`).join(' ; ')),
    L(
      'settingsMigration',
      !st.connected
        ? t('diagnostic.settings.noAccount')
        : st.migration
          ? t('diagnostic.settings.migration', { at: when(st.migration.at), promoted: st.migration.promoted, legacy: st.migration.legacy, won: st.migration.accountWon, defaulted: st.migration.defaulted })
          : t('diagnostic.settings.notMigratedYet'),
    ),
  ]
  if (st.activity) {
    const a = st.activity
    out.push(
      L(
        'activityReports',
        [
          t('diagnostic.settings.activityPending', { count: a.pending }),
          a.legacy > 0 ? t('diagnostic.settings.activityLegacy', { count: a.legacy }) : t('diagnostic.settings.activityNoLegacy'),
          ...(a.drained ? [t(a.drained.erased ? 'diagnostic.settings.activityErased' : 'diagnostic.settings.activityKept', { at: when(a.drained.at), sent: a.drained.sent, kept: a.drained.kept })] : []),
        ].join(' · '),
      ),
    )
  }
  if (st.abandonedFolds !== undefined) out.push(L('foldsAbandoned', st.abandonedFolds === 0 ? t('diagnostic.settings.foldsNone') : t('diagnostic.settings.foldsAbandoned', { count: st.abandonedFolds })))
  if (st.refused.length > 0) out.push(L('refused', t('diagnostic.settings.refused', { count: st.refused.length, list: st.refused.join(', ') })))
  return out
}

/** Le texte copié : un titre, puis une ligne par entrée, puis ★ BJ le bloc des réglages. */
export function diagnosticText(s: DiagnosticSnapshot, t: Translate, when: (ms: number | string) => string): string {
  return [
    t('diagnostic.title'),
    ...diagnosticLines(s, t, when).map((l) => `${l.label}: ${l.value}`),
    '',
    t('diagnostic.settings.title'),
    ...(s.settings?.rows ?? []).map((r) => settingRowText(r, t, when)),
  ].join('\n')
}
