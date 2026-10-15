import { LEGACY_BLOB_KEYS, SETTINGS, isAccountKey, isValidSetting, settingDef } from './registry'
import type { SettingScope, DeviceReason } from './registry'
import { applyAccountValue, onSettingWritten, peekSetting, readSettingJson, storedKeys, writeDeviceRecord } from './local'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ BJ (2026-10-15) — LES RÉGLAGES DE COMPTE : LIRE, ÉCRIRE, DÉPARTAGER.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Remplace le bloc d'AH11.2/AS4 (`ui/settings/sync.ts` d'avant BJ). Ce qui
 * change, et pourquoi :
 *
 *   1. CE QUI VOYAGE N'EST PLUS UNE LISTE ÉCRITE À LA MAIN : c'est tout ce que
 *      le registre déclare `account` — y compris les familles (`map-mode:*`,
 *      `block:*`, `farm-tab:*`…). Une clé nouvelle naît sur le compte.
 *   2. L'INSTANT QUI DÉPARTAGE EST CELUI DU SERVEUR. Avant BJ, chaque appareil
 *      posait `Date.now()` dans `__stamps` : un iPad à l'heure fausse gagnait.
 *      Ici, la base pose `updated_at` (déclencheur `user_setting_values_stamp`).
 *   3. TOUTE MODIFICATION PART SUR-LE-CHAMP (`onSettingWritten` → file →
 *      envoi dans les 300 ms), pas au rechargement.
 *   4. HORS LIGNE, LA MODIFICATION ATTEND DANS UNE FILE (`lo-yanum:settings-queue`)
 *      et part au retour du réseau AVEC L'INSTANT DU GESTE, corrigé à
 *      l'horloge du serveur (`offsetMs`, mesuré sur les écritures réussies).
 *      Le serveur borne cet instant à `now()` et garde la valeur en place si
 *      elle est plus récente : une file n'écrase jamais une valeur plus
 *      récente venue d'ailleurs. Et une relecture qui trouve, pour une clé en
 *      file, une valeur choisie APRÈS le geste la retire de la file.
 *   5. LA MIGRATION, UNE FOIS PAR APPAREIL ET PAR COMPTE (`planMigration`,
 *      pure) : le compte a une valeur → elle gagne, la locale est remplacée ;
 *      le compte n'en a pas → l'ancien bloc `user_settings` d'abord, sinon la
 *      valeur locale, est promue ; une valeur illisible → le défaut. Tracée
 *      (`lo-yanum:settings-migration`) et montrée par le diagnostic.
 *
 * ⚠️ AVANT LE PREMIER RENDU : `main.tsx` attend `syncAccountSettings('boot')`
 *    (2,5 s au plus) ; les valeurs arrivent dans le stockage AVANT que les
 *    modules ne les lisent. Arrivées plus tard (retour en avant-plan,
 *    battement), elles sont annoncées (`announce`) et chaque module à cache
 *    relit (`ui/settings/appliedHooks.ts`).
 */

// ---------------------------------------------------------------------------
// Les formes
// ---------------------------------------------------------------------------

export interface RemoteRow {
  key: string
  value: string | null
  updated_at: string
  written_at: string
  device?: string | null
}
export interface PushRow {
  key: string
  value: string | null
  client_at: string | null
  device: string | null
}
export interface QueueEntry {
  value: string | null
  /** Instant du geste, à l'horloge de l'APPAREIL (corrigé au moment d'envoyer). */
  at: number
  /** Un premier envoi a échoué : l'instant du geste part avec la valeur. */
  offline: boolean
}
export type Queue = Record<string, QueueEntry>

export interface Meta {
  userId: string | null
  /** Instant serveur (`updated_at`) de la valeur que le compte porte, par clé. */
  stamps: Record<string, string>
  /** La valeur que le compte portait au dernier contact (longue → empreinte). */
  remote: Record<string, string | null>
  /** Le plus récent `written_at` relu. */
  cursor: string | null
  /** Horloge du serveur − horloge de l'appareil (ms) ; `null` = jamais mesuré. */
  offsetMs: number | null
  /** Dernier cycle réussi (horloge de l'appareil, pour l'affichage). */
  lastOkAt: number
}

export interface MigrationRecord {
  at: number
  userId: string
  /** Le compte avait une valeur : elle a remplacé celle de l'appareil. */
  accountWon: string[]
  /** Le compte n'avait rien ; l'ancien bloc `user_settings` en avait une : promue. */
  legacy: string[]
  /** Ni l'un ni l'autre : la valeur de CET appareil a été promue. */
  promoted: string[]
  /** Illisible : retour au défaut (qui montre). */
  defaulted: string[]
  /** Promue, mais un autre appareil l'avait posée entre-temps : la sienne a gagné. */
  lostRace: string[]
}

export type SyncTrigger = 'boot' | 'sign-in' | 'resume' | 'online' | 'change' | 'heartbeat' | 'manual' | 'migration'
export interface SyncReport {
  at: number
  trigger: SyncTrigger
  ok: boolean
  /** `no-session` · `timeout` · `network` · `server: …` */
  error: string | null
  down: string[]
  up: string[]
  conflicts: string[]
  /** Le curseur (dernière arrivée relue) après ce cycle. */
  remoteUpdatedAt: string | null
}

const QUEUE_KEY = 'lo-yanum:settings-queue'
const META_KEY = 'lo-yanum:settings-meta'
const MIGRATION_KEY = 'lo-yanum:settings-migration'
const REPORT_KEY = 'lo-yanum:settings-sync-report'
const LEGACY_DEVICE_KEYS = ['lo-yanum:settings-stamps', 'lo-yanum:settings-synced-at']

// ---------------------------------------------------------------------------
// LE PUR (`bun run bjpass` le rejoue sans navigateur)
// ---------------------------------------------------------------------------

/** Empreinte FNV-1a 32 bits (pour garder la trace d'une longue valeur sans la recopier). */
export function fingerprint(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
const LONG = 4000
/** Ce que la mémoire garde d'une valeur du compte. */
export const remember = (value: string | null): string | null => (value !== null && value.length > LONG ? `#h:${fingerprint(value)}:${value.length}` : value)
/** La valeur de l'appareil et celle (mémorisée) du compte sont-elles la même ? */
export function sameAsRemembered(local: string | null, remembered: string | null): boolean {
  if (remembered !== null && remembered.startsWith('#h:')) return local !== null && remember(local) === remembered
  return local === remembered
}

const later = (a: string | null, b: string | null): string | null => (a === null ? b : b === null ? a : a >= b ? a : b)

export interface PullPlan {
  apply: Array<{ key: string; value: string | null }>
  /** Clés EN FILE ici, battues par une valeur choisie plus tard ailleurs. */
  conflicts: string[]
  dropQueue: string[]
  stamps: Record<string, string>
  remote: Record<string, string | null>
  cursor: string | null
}

/**
 * ★ UNE RELECTURE. Pour chaque ligne arrivée :
 *  - la clé n'est pas en file ici → la valeur du compte s'applique ;
 *  - la clé est en file → l'instant du geste (corrigé à l'horloge du serveur)
 *    est comparé à `updated_at` : plus récent ailleurs → la file cède (et le
 *    PO en est averti) ; sinon la file garde son tour, et le serveur tranchera
 *    de même à l'envoi.
 */
export function planPull(rows: readonly RemoteRow[], local: (key: string) => string | null, queue: Queue, offsetMs: number | null, cursor: string | null): PullPlan {
  const plan: PullPlan = { apply: [], conflicts: [], dropQueue: [], stamps: {}, remote: {}, cursor }
  for (const r of rows) {
    plan.cursor = later(plan.cursor, r.written_at)
    if (!isAccountKey(r.key)) continue
    plan.stamps[r.key] = r.updated_at
    plan.remote[r.key] = remember(r.value)
    const q = queue[r.key]
    if (q) {
      const editAt = q.at + (offsetMs ?? 0)
      if (Date.parse(r.updated_at) > editAt) {
        plan.dropQueue.push(r.key)
        if (q.value !== r.value) {
          plan.apply.push({ key: r.key, value: r.value })
          plan.conflicts.push(r.key)
        }
      }
      continue
    }
    if (local(r.key) !== r.value) plan.apply.push({ key: r.key, value: r.value })
  }
  return plan
}

export interface MigrationPlan {
  apply: Array<{ key: string; value: string | null }>
  insert: Array<{ key: string; value: string }>
  accountWon: string[]
  legacy: string[]
  promoted: string[]
  defaulted: string[]
}

/**
 * ★★ LA MIGRATION D'UN APPAREIL (la règle du PO, mot pour mot) :
 *   · le compte a une valeur → elle gagne, la valeur locale est remplacée ;
 *   · le compte n'en a pas et l'appareil en a une → elle est promue ;
 *   · illisible, absente, inconnue → le défaut (qui montre).
 * « Le compte » d'avant BJ, c'est aussi l'ancien bloc `user_settings` : une
 * clé qui y vivait est la valeur du compte, et passe AVANT celle de l'appareil.
 */
export function planMigration(input: { rows: readonly RemoteRow[]; legacy: Record<string, string> | null; local: Record<string, string | null> }): MigrationPlan {
  const plan: MigrationPlan = { apply: [], insert: [], accountWon: [], legacy: [], promoted: [], defaulted: [] }
  const rows = new Map(input.rows.map((r) => [r.key, r]))
  const keys = new Set<string>([...Object.keys(input.local), ...rows.keys()])
  if (input.legacy) for (const k of LEGACY_BLOB_KEYS) if (typeof input.legacy[k] === 'string') keys.add(k)
  for (const key of [...keys].sort()) {
    if (!isAccountKey(key)) continue
    const local = input.local[key] ?? null
    const row = rows.get(key)
    if (row) {
      if (local !== row.value) {
        plan.apply.push({ key, value: row.value })
        /* « Remplacée » seulement s'il y avait une valeur ici ; sinon, reçue. */
        if (local !== null) plan.accountWon.push(key)
      }
      continue
    }
    const old = input.legacy?.[key]
    if (typeof old === 'string' && isValidSetting(key, old)) {
      plan.insert.push({ key, value: old })
      if (local !== old) plan.apply.push({ key, value: old })
      plan.legacy.push(key)
      continue
    }
    if (local === null) continue
    if (isValidSetting(key, local)) {
      plan.insert.push({ key, value: local })
      plan.promoted.push(key)
    } else {
      plan.apply.push({ key, value: null })
      plan.defaulted.push(key)
    }
  }
  return plan
}

/** ★ L'instant d'un geste hors ligne, à l'horloge du SERVEUR. */
export function serverTimeOf(entry: QueueEntry, offsetMs: number | null): string | null {
  return entry.offline ? new Date(entry.at + (offsetMs ?? 0)).toISOString() : null
}

// ---------------------------------------------------------------------------
// L'appareil
// ---------------------------------------------------------------------------

const EMPTY_META: Meta = { userId: null, stamps: {}, remote: {}, cursor: null, offsetMs: null, lastOkAt: 0 }

function readMeta(): Meta {
  const m = readSettingJson<Partial<Meta>>(META_KEY)
  return { ...EMPTY_META, ...(m ?? {}), stamps: { ...(m?.stamps ?? {}) }, remote: { ...(m?.remote ?? {}) } }
}
function writeMeta(m: Meta): void {
  writeDeviceRecord(META_KEY, m)
}
function readQueue(): Queue {
  return readSettingJson<Queue>(QUEUE_KEY) ?? {}
}
function writeQueue(q: Queue): void {
  writeDeviceRecord(QUEUE_KEY, Object.keys(q).length === 0 ? null : q)
}
export function migrationRecord(): MigrationRecord | null {
  return readSettingJson<MigrationRecord>(MIGRATION_KEY)
}
export function pendingSettings(): Queue {
  return readQueue()
}

/** Les réglages de compte que CET appareil porte (clés exactes + familles présentes). */
export function localAccountValues(): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const key of storedKeys()) if (isAccountKey(key)) out[key] = peekSetting(key)
  return out
}

/** « iPad · Safari » — qui a écrit la ligne (pour le diagnostic, jamais pour départager). */
export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'inconnu'
  const ua = navigator.userAgent
  const touch = (navigator.maxTouchPoints ?? 0) > 1
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && touch) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'appareil'
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'navigateur'
  return `${os} · ${br}`
}

// ---------------------------------------------------------------------------
// Les annonces (ce qui arrive d'ailleurs, ce qui a été remplacé)
// ---------------------------------------------------------------------------

const APPLIED = 'lo-yanum:settings-applied'
const CONFLICT = 'lo-yanum:settings-conflict'
function announce(name: string, keys: string[]): void {
  if (keys.length === 0 || typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(name, { detail: keys }))
  } catch {
    /* hors navigateur */
  }
}

// ---------------------------------------------------------------------------
// LE CYCLE
// ---------------------------------------------------------------------------

export interface AccountDeps {
  userId: () => Promise<string | null>
  pull: (since: string | null) => Promise<RemoteRow[]>
  head: () => Promise<string | null>
  push: (rows: PushRow[]) => Promise<RemoteRow[]>
  insertMissing: (rows: PushRow[]) => Promise<RemoteRow[]>
  /** L'ancien bloc `user_settings` (lu une fois, à la migration). */
  legacy: () => Promise<Record<string, string> | null>
}

let deps: AccountDeps | null = null
let inFlight: Promise<SyncReport | null> | null = null
let again: SyncTrigger | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let lastForeground = 0
let report: SyncReport | null = readSettingJson<SyncReport>(REPORT_KEY)
const reportListeners = new Set<() => void>()

export function lastSettingsSyncReport(): SyncReport | null {
  return report
}
export function subscribeSettingsSync(listener: () => void): () => void {
  reportListeners.add(listener)
  return () => reportListeners.delete(listener)
}
export function isSettingsSyncing(): boolean {
  return inFlight !== null
}
/** Dernier cycle réussi de CET appareil (ms), 0 = jamais. */
export function lastSettingsSyncAt(): number {
  return readMeta().lastOkAt
}
/** L'instant SERVEUR de la valeur du compte (ms), 0 = inconnu. */
export function settingStamp(key: string): number {
  const s = readMeta().stamps[key]
  return s ? Date.parse(s) || 0 : 0
}
/** Ce que le compte portait au dernier contact (`null` aussi pour « rien »). */
export function lastRemoteSetting(key: string): string | null {
  return readMeta().remote[key] ?? null
}
export function accountSyncStarted(): boolean {
  return deps !== null
}

function publish(next: SyncReport): void {
  report = next
  writeDeviceRecord(REPORT_KEY, next)
  for (const l of reportListeners) l()
}
function reasonOf(err: unknown): string {
  const e = err as { reason?: string; message?: string } | null
  if (e?.reason === 'server' || e?.reason === 'network') return e.message ?? e.reason
  return e?.reason ?? e?.message ?? 'network'
}

function applyAll(list: Array<{ key: string; value: string | null }>): string[] {
  const changed: string[] = []
  for (const { key, value } of list) {
    if (peekSetting(key) === value) continue
    applyAccountValue(key, value)
    changed.push(key)
  }
  return changed
}

async function migrate(userId: string, meta: Meta): Promise<{ down: string[]; up: string[] }> {
  const d = deps!
  const rows = await d.pull(null)
  const legacy = await d.legacy().catch(() => null)
  const plan = planMigration({ rows, legacy, local: localAccountValues() })
  const inserted = await d.insertMissing(plan.insert.map((i) => ({ key: i.key, value: i.value, client_at: null, device: deviceLabel() })))
  const insertedKeys = new Set(inserted.map((r) => r.key))
  const lostRace = plan.insert.map((i) => i.key).filter((k) => !insertedKeys.has(k))
  let down = applyAll(plan.apply)
  let after: RemoteRow[] = [...rows, ...inserted]
  if (lostRace.length > 0) {
    /* Un autre appareil a posé ces clés entre notre lecture et notre écriture :
       c'est la sienne qui est sur le compte, donc la sienne qui gagne. */
    after = await d.pull(null)
    const won = after.filter((r) => lostRace.includes(r.key)).map((r) => ({ key: r.key, value: r.value }))
    down = [...down, ...applyAll(won)]
  }
  for (const r of after) {
    meta.cursor = later(meta.cursor, r.written_at)
    if (!isAccountKey(r.key)) continue
    meta.stamps[r.key] = r.updated_at
    meta.remote[r.key] = remember(r.value)
  }
  for (const k of LEGACY_DEVICE_KEYS) writeDeviceRecord(k, null)
  const record: MigrationRecord = {
    at: Date.now(),
    userId,
    accountWon: plan.accountWon,
    legacy: plan.legacy,
    promoted: plan.promoted.filter((k) => insertedKeys.has(k)),
    defaulted: plan.defaulted,
    lostRace,
  }
  writeDeviceRecord(MIGRATION_KEY, record)
  return { down, up: [...insertedKeys] }
}

async function cycle(trigger: SyncTrigger): Promise<SyncReport | null> {
  const d = deps
  if (!d) return null
  const down: string[] = []
  const up: string[] = []
  const conflicts: string[] = []
  const done = (r: { ok: boolean; error: string | null; cursor: string | null }): SyncReport => {
    const full: SyncReport = { at: Date.now(), trigger, ok: r.ok, error: r.error, down, up, conflicts, remoteUpdatedAt: r.cursor }
    publish(full)
    announce(APPLIED, down)
    announce(CONFLICT, conflicts)
    return full
  }
  let meta = readMeta()
  let userId: string | null
  try {
    userId = await d.userId()
  } catch (err) {
    return done({ ok: false, error: reasonOf(err), cursor: meta.cursor })
  }
  if (!userId) return done({ ok: false, error: 'no-session', cursor: meta.cursor })
  if (meta.userId !== userId) {
    /* Un autre compte sur cet appareil : la mémoire et la file de l'autre ne
       valent rien ici (une file ne voyage jamais d'un compte à l'autre). */
    meta = { ...EMPTY_META, offsetMs: meta.offsetMs, userId }
    writeQueue({})
  }
  try {
    const mig = migrationRecord()
    if (!mig || mig.userId !== userId) {
      const r = await migrate(userId, meta)
      down.push(...r.down)
      up.push(...r.up)
    }
    /* 1 — RELIRE ce qui est arrivé depuis le curseur. */
    const rows = await d.pull(meta.cursor)
    const queue = readQueue()
    const plan = planPull(rows, peekSetting, queue, meta.offsetMs, meta.cursor)
    for (const k of applyAll(plan.apply)) if (!down.includes(k)) down.push(k)
    for (const k of plan.conflicts) if (!conflicts.includes(k)) conflicts.push(k)
    if (plan.dropQueue.length > 0) {
      const q = readQueue()
      for (const k of plan.dropQueue) if (q[k] && q[k].at === queue[k]?.at) delete q[k]
      writeQueue(q)
    }
    Object.assign(meta.stamps, plan.stamps)
    Object.assign(meta.remote, plan.remote)
    meta.cursor = plan.cursor
    meta.userId = userId
    writeMeta(meta)

    /* 2 — ENVOYER la file. */
    const pending = readQueue()
    const keys = Object.keys(pending).filter(isAccountKey)
    if (keys.length > 0) {
      const sent: PushRow[] = keys.map((k) => ({ key: k, value: pending[k].value, client_at: serverTimeOf(pending[k], meta.offsetMs), device: deviceLabel() }))
      const t0 = Date.now()
      let returned: RemoteRow[]
      try {
        returned = await d.push(sent)
      } catch (err) {
        const q = readQueue()
        for (const k of keys) if (q[k] && q[k].at === pending[k].at) q[k] = { ...q[k], offline: true }
        writeQueue(q)
        return done({ ok: false, error: reasonOf(err), cursor: meta.cursor })
      }
      const t1 = Date.now()
      const q = readQueue()
      for (const r of returned) {
        const s = sent.find((x) => x.key === r.key)
        const entry = pending[r.key]
        if (!s || !entry) continue
        meta.stamps[r.key] = r.updated_at
        meta.remote[r.key] = remember(r.value)
        const unchanged = q[r.key]?.at === entry.at
        if (r.value === s.value) {
          if (!up.includes(r.key)) up.push(r.key)
          /* L'écart d'horloge, mesuré sur une écriture « maintenant » réussie. */
          if (s.client_at === null && r.updated_at === r.written_at) meta.offsetMs = Math.round(Date.parse(r.written_at) - (t0 + t1) / 2)
        } else if (unchanged) {
          /* ★ Le serveur a gardé une valeur choisie PLUS TARD ailleurs. */
          if (applyAll([{ key: r.key, value: r.value }]).length > 0 && !down.includes(r.key)) down.push(r.key)
          if (!conflicts.includes(r.key)) conflicts.push(r.key)
        }
        if (unchanged) delete q[r.key]
      }
      writeQueue(q)
    }
    meta.lastOkAt = Date.now()
    writeMeta(meta)
    return done({ ok: true, error: null, cursor: meta.cursor })
  } catch (err) {
    writeMeta(meta)
    return done({ ok: false, error: reasonOf(err), cursor: meta.cursor })
  }
}

/** Un cycle, maintenant ; deux demandes rapprochées n'en font qu'une de plus. */
export function syncAccountSettings(trigger: SyncTrigger = 'manual'): Promise<SyncReport | null> {
  if (!deps) return Promise.resolve(null)
  if (inFlight) {
    again = trigger
    return inFlight
  }
  inFlight = cycle(trigger).finally(() => {
    inFlight = null
    for (const l of reportListeners) l()
    if (again) {
      const t = again
      again = null
      void syncAccountSettings(t)
    }
  })
  for (const l of reportListeners) l()
  return inFlight
}

/** ★ Le battement : toutes les 30 s, page visible, « quelque chose est-il arrivé ? ». */
export const HEARTBEAT_MS = 30_000
async function heartbeat(): Promise<void> {
  if (!deps || inFlight || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
  if (Object.keys(readQueue()).length > 0) {
    await syncAccountSettings('heartbeat')
    return
  }
  try {
    const head = await deps.head()
    const cursor = readMeta().cursor
    if (head !== null && (cursor === null || head > cursor)) await syncAccountSettings('heartbeat')
  } catch {
    /* Le battement suivant réessaiera. */
  }
}

/**
 * ★ LE DÉMARRAGE. Un réglage de compte écrit sur cet appareil part en file et
 * un cycle suit 300 ms plus tard (une frappe dans un gabarit n'en fait qu'un).
 * Sans compte connu (jamais synchronisé ici), rien n'est mis en file : on ne
 * sait pas à quel compte il appartiendrait — la migration le promouvra.
 */
export function startAccountSync(d: AccountDeps): void {
  if (deps) return
  deps = d
  onSettingWritten((key, value, origin) => {
    if (origin !== 'local' || !isAccountKey(key)) return
    if (readMeta().userId === null) return
    const q = readQueue()
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    q[key] = { value, at: Date.now(), offline: offline || (q[key]?.offline ?? false) }
    writeQueue(q)
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void syncAccountSettings('change')
    }, 300)
  })
  if (typeof window === 'undefined') return
  const resume = (): void => {
    if (document.visibilityState === 'hidden') return
    const t = Date.now()
    if (t - lastForeground < 10_000) return
    lastForeground = t
    void syncAccountSettings('resume')
  }
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('pageshow', resume)
  window.addEventListener('focus', resume)
  window.addEventListener('online', () => void syncAccountSettings('online'))
  window.setInterval(() => void heartbeat(), HEARTBEAT_MS)
}

// ---------------------------------------------------------------------------
// ★ LE DIAGNOSTIC — chaque réglage : portée, appareil, compte, synchronisation
// ---------------------------------------------------------------------------

export interface SettingView {
  key: string
  scope: SettingScope
  reason: DeviceReason | null
  /** Valeur brute sur cet appareil (`null` = absente → défaut). */
  device: string | null
  /** Valeur du compte au dernier contact ; `undefined` = inconnue (jamais lue, ou appareil). */
  account: string | null | undefined
  /** Instant serveur du choix sur le compte. */
  accountAt: string | null
  /** En file : pas encore reçu par le serveur. */
  pending: boolean
  /** ★ Les deux valeurs diffèrent (dit en clair par le panneau). */
  differs: boolean
  /** Dernière synchronisation réussie qui couvrait cette clé (ms, 0 = jamais). */
  syncedAt: number
}

export function settingsView(): SettingView[] {
  const meta = readMeta()
  const queue = readQueue()
  const keys = new Set<string>()
  for (const def of SETTINGS) if (!def.family && def.area === 'local') keys.add(def.key)
  for (const k of storedKeys()) if (settingDef(k)?.area === 'local') keys.add(k)
  for (const k of Object.keys(meta.remote)) keys.add(k)
  const out: SettingView[] = []
  for (const key of [...keys].sort()) {
    const def = settingDef(key)
    if (!def) continue
    const device = peekSetting(key)
    if (def.scope === 'device') {
      out.push({ key, scope: 'device', reason: def.reason ?? null, device, account: undefined, accountAt: null, pending: false, differs: false, syncedAt: 0 })
      continue
    }
    const known = Object.prototype.hasOwnProperty.call(meta.remote, key)
    const account = known ? meta.remote[key] : meta.lastOkAt > 0 ? null : undefined
    const pending = Boolean(queue[key])
    const differs = account !== undefined && !sameAsRemembered(device, account)
    out.push({ key, scope: 'account', reason: null, device, account, accountAt: meta.stamps[key] ?? null, pending, differs, syncedAt: pending ? 0 : meta.lastOkAt })
  }
  return out
}

/** ★ Relire le compte entier pour le diagnostic (sans rien appliquer). */
export async function refreshAccountView(): Promise<boolean> {
  if (!deps) return false
  try {
    const rows = await deps.pull(null)
    const meta = readMeta()
    meta.remote = {}
    for (const r of rows) {
      if (!isAccountKey(r.key)) continue
      meta.stamps[r.key] = r.updated_at
      meta.remote[r.key] = remember(r.value)
    }
    writeMeta(meta)
    for (const l of reportListeners) l()
    return true
  } catch {
    return false
  }
}
