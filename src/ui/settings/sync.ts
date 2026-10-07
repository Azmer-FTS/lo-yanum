import { SUPABASE_CONFIGURED } from '../../data/config'
import type { RemoteSettings, SettingsBlob } from '../../data/settings'
import { announceSettingsApplied, announceSettingsConflict } from './applied'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH11.2 (2026-09-10) — CE QUI VOYAGE D'UN APPAREIL À L'AUTRE, ET CE QUI
 *    NE VOYAGE PAS.
 * ★★ AS4 (2026-10-07) — ET POURQUOI ÇA NE VOYAGEAIT PAS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Il modifie ses données sur son iPhone, ouvre son iPad, rien n'a changé. »
 *
 * ★★ LA LISTE EST FERMÉE ET ÉCRITE À LA MAIN, ET C'EST LA DÉCISION D'AH11.2.
 *    « Tout ce qui commence par `lo-yanum:` » aurait emporté le laissez-passer
 *    de l'agriculteur, la mémoire de temporisation d'AG2 et le pli de chaque
 *    bloc — des faits d'APPAREIL. Ils restent locaux (voir `LOCAL_ONLY`).
 *
 * ⚠️ AS4 — CE QUI ÉTAIT FAUX, MESURÉ (docs/as/as4-reglages.md) :
 *   1. le serveur n'était LU qu'au démarrage À FROID — une PWA installée
 *      reprise ne redémarre presque jamais (AJ0.1) : l'iPad ne relisait rien ;
 *   2. rien n'était lu APRÈS la connexion (au démarrage, pas de session) ;
 *   3. un effacement (`removeItem` : retour au gabarit livré, origine effacée,
 *      photo de ת״ז redevenue facultative) ne MONTAIT jamais ;
 *   4. l'envoi poussait le BLOC ENTIER : un iPad aux valeurs d'hier écrasait
 *      au premier geste les réglages du jour posés sur l'iPhone ;
 *   5. quatre modules gardent leur valeur en cache dès leur import : une
 *      lecture tardive n'atteignait pas l'écran.
 *
 * ★★ LE REMÈDE : UN INSTANT PAR CLÉ, ET « LA DERNIÈRE ÉCRITURE GAGNE », CLÉ
 *    PAR CLÉ. Chaque `setItem`/`removeItem` d'une clé suivie note l'instant
 *    (`lo-yanum:settings-stamps`, local). Le bloc distant porte `__stamps`.
 *    Une synchronisation LIT, FUSIONNE (`mergeSettings`, pure), APPLIQUE,
 *    puis ÉCRIT sous condition (`updated_at` inchangé). Elle part : au
 *    démarrage, à la connexion, au retour en avant-plan (comme la
 *    vérification de version d'AJ), au retour du réseau, et 1,2 s après un
 *    changement local.
 *
 * ★★ AUCUNE PERTE SILENCIEUSE. Une valeur locale modifiée depuis la dernière
 *    synchronisation et battue par une écriture PLUS RÉCENTE d'un autre
 *    appareil est un CONFLIT : la plus récente gagne, et le PO est averti
 *    (bandeau `SettingsSyncNotice`) de ce qui a été remplacé.
 */
export const SYNCED_SETTING_KEYS: readonly string[] = [
  /* Le programme : cible, seuils, couvertures, rappels. */
  'lo-yanum:target',
  'lo-yanum:coverage',
  'lo-yanum:vigil',
  /* ⚠️ AI7 — `lo-yanum:reminders` RETIRÉ : aucun module ne lit ni n'écrit cette
     clé. Les rappels d'AF4 sont une AUTORISATION du navigateur, qui ne voyage
     pas ; une entrée ici synchronisait du vide. */
  'lo-yanum:renewal-window',
  'lo-yanum:area-gap',
  'lo-yanum:require-id-photo',
  /* Les gabarits (AE4 · AH5). */
  'lo-yanum:summons-template',
  'lo-yanum:agreement-doc-template',
  'lo-yanum:agreement-doc-logo',
  /* Les régions redessinées (Y2). */
  'lo-yanum:region-rings',
  /* L'identité du coordinateur, qui signe chaque message. */
  'lo-yanum:coordinator',
  /* Le point de départ des tournées, et les tournées libres (AH9). */
  'lo-yanum:origin',
  'lo-yanum:free-routes',
  /* AI3.2 — la marge des durées de roulage. */
  'lo-yanum:route-margin',
]

/**
 * ★ AS4 — CE QUI RESTE SUR L'APPAREIL, VOLONTAIREMENT, ET POURQUOI. Écrit ici
 * pour que la question « et celle-ci ? » ait une réponse à côté de la liste.
 */
export const LOCAL_ONLY_KEYS: ReadonlyArray<{ key: string; why: string }> = [
  { key: 'lo-yanum:farmer-pass', why: 'laissez-passer de l’agriculteur : un fait de CET appareil (AL11.2)' },
  { key: 'lo-yanum:guard-pass', why: 'laissez-passer du gardien : idem' },
  { key: 'lo-yanum:link-unlock', why: 'mémoire de temporisation (AG2) : la copier annulerait la protection' },
  { key: 'lo-yanum:theme:<rôle>', why: 'thème : choisi pour CET écran (AI6)' },
  { key: 'lo-yanum:view-as', why: '« voir comme » : un état d’écran, pas un réglage' },
  { key: 'lo-yanum:report-recipient', why: 'destinataire du compte rendu : délibérément local (voir recipient.ts)' },
  { key: 'lo-yanum:activity-reports', why: 'historique local des rapports ; la base en garde la trace (activity_reports)' },
  { key: 'lo-yanum:intake:seen', why: 'demandes « vues » : ne commande que la répétition d’un bandeau sur CET appareil (AQ)' },
  { key: 'lo-yanum:sheet-mapping:<type>', why: 'correspondance de colonnes du dernier fichier importé ICI' },
  { key: 'lo-yanum:farm-tab:<fiche>', why: 'onglet ouvert d’une fiche (AS5) : disposition d’écran' },
  { key: 'map-mode, map-ratio, map-last, map-layers, map-base, layout-sync, block:*, numpad', why: 'disposition d’écran et de carte' },
  { key: 'last-fix, geo-granted, geo-diag, map-attempt', why: 'localisation et diagnostics de CET appareil' },
  { key: 'update-pending, update-verdict', why: 'mise à jour du build de CET appareil (AJ)' },
  { key: 'last-session, last-email, lo-yanum:auth', why: 'la session elle-même' },
  { key: 'lo-yanum:settings-stamps, lo-yanum:settings-synced-at', why: 'la mémoire de synchronisation de CET appareil (AS4)' },
]

export const STAMPS_FIELD = '__stamps'
const STAMPS_KEY = 'lo-yanum:settings-stamps'
const SYNCED_AT_KEY = 'lo-yanum:settings-synced-at'

export type Stamps = Record<string, number>

export interface SettingsSide {
  values: Record<string, string | null>
  stamps: Stamps
}

export interface MergeResult {
  /** Ce que l'appareil doit porter après fusion. */
  local: SettingsSide
  /** Le bloc à écrire en base (valeurs à plat + `__stamps`). */
  remote: SettingsBlob
  /** Clés que l'autre appareil a changées et qu'on applique ici. */
  applied: string[]
  /** Clés modifiées ICI depuis la dernière synchro et battues par plus récent. */
  conflicts: string[]
  /** Faut-il écrire en base ? */
  push: boolean
}

export function readRemoteSide(blob: SettingsBlob): SettingsSide {
  let stamps: Stamps = {}
  try {
    const raw = blob[STAMPS_FIELD]
    if (typeof raw === 'string') stamps = JSON.parse(raw) as Stamps
  } catch {
    stamps = {}
  }
  const values: Record<string, string | null> = {}
  for (const key of SYNCED_SETTING_KEYS) values[key] = typeof blob[key] === 'string' ? blob[key] : null
  return { values, stamps }
}

/**
 * ★★ LA FUSION, PURE (la porte `aspass` la rejoue sans navigateur).
 *
 *  - instant distant > instant local → le distant gagne ; si la valeur locale
 *    avait changé depuis `lastSyncAt`, c'est un CONFLIT (dit, pas tu) ;
 *  - instant local > instant distant → le local gagne et MONTE ;
 *  - aucun instant des deux côtés (réglages d'avant AS4) → la règle d'AH11.2,
 *    « le compte gagne », sauf si le compte n'a rien : alors le local monte.
 */
export function mergeSettings(local: SettingsSide, remote: SettingsSide, lastSyncAt: number): MergeResult {
  const next: SettingsSide = { values: { ...local.values }, stamps: { ...local.stamps } }
  const applied: string[] = []
  const conflicts: string[] = []
  let push = false
  for (const key of SYNCED_SETTING_KEYS) {
    const lv = local.values[key] ?? null
    const rv = remote.values[key] ?? null
    const ls = local.stamps[key] ?? 0
    const rs = remote.stamps[key] ?? 0
    if (rs > ls) {
      if (lv !== rv) {
        next.values[key] = rv
        applied.push(key)
        if (ls > lastSyncAt) conflicts.push(key)
      }
      next.stamps[key] = rs
    } else if (ls > rs) {
      if (lv !== rv || rs === 0) push = true
    } else if (lv !== rv) {
      if (rv !== null) {
        next.values[key] = rv
        applied.push(key)
      } else push = true
    }
  }
  const remoteOut: SettingsBlob = {}
  const stampsOut: Stamps = {}
  for (const key of SYNCED_SETTING_KEYS) {
    const v = next.values[key]
    if (typeof v === 'string') remoteOut[key] = v
    const s = Math.max(next.stamps[key] ?? 0, remote.stamps[key] ?? 0)
    if (s > 0) stampsOut[key] = s
  }
  remoteOut[STAMPS_FIELD] = JSON.stringify(stampsOut)
  return { local: next, remote: remoteOut, applied, conflicts, push }
}

// ---------------------------------------------------------------------------
// L'appareil
// ---------------------------------------------------------------------------

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Ce que l'appareil porte aujourd'hui, pour les clés qui voyagent. */
export function snapshotSettings(): SettingsBlob {
  const out: SettingsBlob = {}
  for (const key of SYNCED_SETTING_KEYS) {
    try {
      const v = localStorage.getItem(key)
      if (v !== null) out[key] = v
    } catch {
      /* Navigation privée : rien à envoyer. */
    }
  }
  return out
}

function localSide(): SettingsSide {
  const values: Record<string, string | null> = {}
  for (const key of SYNCED_SETTING_KEYS) {
    try {
      values[key] = localStorage.getItem(key)
    } catch {
      values[key] = null
    }
  }
  return { values, stamps: readJson<Stamps>(STAMPS_KEY, {}) }
}

/** Dernière synchronisation réussie de CET appareil (ms), 0 = jamais. */
export function lastSettingsSyncAt(): number {
  return readJson<number>(SYNCED_AT_KEY, 0)
}

let applying = false
let rawSet: ((k: string, v: string) => void) | null = null
let rawRemove: ((k: string) => void) | null = null

function writeRaw(key: string, value: string | null): void {
  applying = true
  try {
    if (value === null) (rawRemove ?? localStorage.removeItem.bind(localStorage))(key)
    else (rawSet ?? localStorage.setItem.bind(localStorage))(key, value)
  } catch {
    /* Navigation privée. */
  } finally {
    applying = false
  }
}

/**
 * Compatibilité d'AH11.2 (démarrage sans fusion) : applique un bloc tel quel.
 * Gardée pour les portes qui l'appellent ; le démarrage passe par `syncSettings`.
 */
export function applySettings(blob: SettingsBlob): number {
  let applied = 0
  for (const key of SYNCED_SETTING_KEYS) {
    const v = blob[key]
    if (typeof v !== 'string') continue
    try {
      if (localStorage.getItem(key) !== v) applied += 1
      writeRaw(key, v)
    } catch {
      /* Idem. */
    }
  }
  return applied
}

// ---------------------------------------------------------------------------
// Le cycle : lire, fusionner, appliquer, écrire
// ---------------------------------------------------------------------------

export interface SyncDeps {
  load: () => Promise<RemoteSettings | null>
  save: (blob: SettingsBlob, expectedUpdatedAt: string | null) => Promise<'ok' | 'conflict' | 'error'>
}

let deps: SyncDeps | null = null
let inFlight: Promise<void> | null = null
let again = false
let timer: number | null = null
let lastForeground = 0

export type SyncOutcome = { applied: string[]; conflicts: string[]; pushed: boolean; ok: boolean }
let lastOutcome: SyncOutcome | null = null
export function lastSettingsSyncOutcome(): SyncOutcome | null {
  return lastOutcome
}

async function cycle(): Promise<void> {
  if (!deps) return
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await deps.load().catch(() => null)
    if (!row) {
      lastOutcome = { applied: [], conflicts: [], pushed: false, ok: false }
      return
    }
    const merged = mergeSettings(localSide(), readRemoteSide(row.blob), lastSettingsSyncAt())
    for (const key of merged.applied) writeRaw(key, merged.local.values[key] ?? null)
    writeRaw(STAMPS_KEY, JSON.stringify(merged.local.stamps))
    if (merged.applied.length > 0) announceSettingsApplied(merged.applied)
    if (merged.conflicts.length > 0) announceSettingsConflict(merged.conflicts)
    if (merged.push) {
      const res = await deps.save(merged.remote, row.updatedAt).catch(() => 'error' as const)
      if (res === 'conflict') continue
      if (res === 'error') {
        lastOutcome = { applied: merged.applied, conflicts: merged.conflicts, pushed: false, ok: false }
        return
      }
    }
    writeRaw(SYNCED_AT_KEY, JSON.stringify(Date.now()))
    lastOutcome = { applied: merged.applied, conflicts: merged.conflicts, pushed: merged.push, ok: true }
    return
  }
}

/** Une synchronisation, maintenant ; deux demandes rapprochées n'en font qu'une de plus. */
export function syncSettings(): Promise<void> {
  if (inFlight) {
    again = true
    return inFlight
  }
  inFlight = cycle().finally(() => {
    inFlight = null
    if (again) {
      again = false
      void syncSettings()
    }
  })
  return inFlight
}

/**
 * ★★ L'ÉCRITURE EST DÉCLENCHÉE PAR `localStorage` LUI-MÊME (AH11.2), ET AS4
 *    Y AJOUTE `removeItem` : un retour au défaut est un changement comme un
 *    autre, et c'était le trou n°3.
 *
 * ⚠️ L'enveloppe est transparente : elle appelle l'original, ne jette jamais,
 *    et ne fait rien hors d'un build réel connecté. Une valeur écrite PAR la
 *    synchronisation (`applying`) ne reçoit pas d'instant neuf.
 */
export function startSettingsSync(d: SyncDeps): void {
  if (!SUPABASE_CONFIGURED || deps) return
  deps = d
  const storage = window.localStorage
  rawSet = storage.setItem.bind(storage)
  rawRemove = storage.removeItem.bind(storage)
  const watched = new Set(SYNCED_SETTING_KEYS)
  const touched = (key: string): void => {
    if (applying || !watched.has(key)) return
    const stamps = readJson<Stamps>(STAMPS_KEY, {})
    stamps[key] = Date.now()
    rawSet!(STAMPS_KEY, JSON.stringify(stamps))
    if (timer !== null) window.clearTimeout(timer)
    /* 1,2 s : le PO tape dans une zone de texte de gabarit. */
    timer = window.setTimeout(() => {
      timer = null
      void syncSettings()
    }, 1200)
  }
  storage.setItem = (key: string, value: string): void => {
    rawSet!(key, value)
    touched(key)
  }
  storage.removeItem = (key: string): void => {
    rawRemove!(key)
    touched(key)
  }
  /* Au retour en avant-plan — la même liste d'événements que la vérification
     de version d'AJ0 et la relecture des données d'AQ2 ; 10 s au plus souvent. */
  const resume = (): void => {
    if (document.visibilityState === 'hidden') return
    const t = Date.now()
    if (t - lastForeground < 10_000) return
    lastForeground = t
    void syncSettings()
  }
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('pageshow', resume)
  window.addEventListener('focus', resume)
  window.addEventListener('online', () => void syncSettings())
}
