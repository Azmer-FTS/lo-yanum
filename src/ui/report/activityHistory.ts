import { useSyncExternalStore } from 'react'

import type { ActivityPeriod, ActivityReportRecord } from '@core/index'

import {
  loadRemoteActivityReports,
  loadRemoteActivityReportsByIds,
  saveRemoteActivityReport,
} from '../../data/activityReports'
import { readSetting, writeSetting } from '../../storage/local'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AO3.6 (2026-09-24) — LES RAPPORTS CONSERVÉS, ET LE CHOIX DU REPÈRE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Les rapports envoyés sont conservés, pour que la comparaison du point 3
 *     fonctionne et qu'il puisse retrouver ce qu'il a annoncé. »
 *
 * ★★ « ENVOYÉS », ET C'EST LE MOT QUI DÉCIDE QUAND ON ÉCRIT. Un rapport
 *    s'enregistre quand le PO le SORT — partage, téléchargement, copie du
 *    texte — et jamais quand il l'ouvre pour regarder. Enregistrer à
 *    l'ouverture aurait rempli le journal de brouillons, et surtout aurait
 *    fait du rapport d'hier soir « le rapport précédent » de celui qu'il
 *    ouvre ce matin pour vérifier un chiffre : la comparaison de demain
 *    aurait porté sur douze heures au lieu d'un mois.
 *
 * ★★ BK (2026-10-18) — LA TABLE EST LA SOURCE, ET LA CLÉ LOCALE EST RETIRÉE.
 *    Avant BK, `lo-yanum:activity-reports` portait l'historique et la table en
 *    était la copie. Le PO a tranché : l'historique se LIT dans
 *    `activity_reports`. Ce qui reste sur l'appareil a une seule raison, le
 *    hors-ligne (`lo-yanum:activity-offline`) :
 *      · `pending` — les rapports SORTIS que la table n'a pas encore reçus
 *        (le PO travaille dans des champs sans réseau ; un rapport sorti hors
 *        ligne n'est jamais perdu parce que Supabase n'a pas répondu) ;
 *      · `copy` — la dernière lecture de la table, pour comparer sans réseau.
 *    ⚠️ L'ANCIENNE CLÉ N'EST EFFACÉE QU'APRÈS LA PREUVE : chacun de ses
 *       rapports est relu DANS LA TABLE et trouvé identique (`sameReport`).
 *       Un seul qui manque ou qui diffère, et la clé reste — mieux vaut une
 *       clé qui reste qu'un historique perdu (`planDrain`).
 *
 * ★ LE REPÈRE DE COMPARAISON EST LE DERNIER RAPPORT DONT LA PÉRIODE SE TERMINE
 *   AVANT LE DÉBUT DE CELLE-CI — et à défaut, le plus récent tout court. La
 *   première règle est celle qui donne un sens à « ce qui a bougé » ; la
 *   seconde évite qu'un PO qui demande « aujourd'hui » après avoir sorti un
 *   rapport « ce mois-ci » se retrouve sans aucune comparaison.
 */

const LEGACY_KEY = 'lo-yanum:activity-reports'
const OFFLINE_KEY = 'lo-yanum:activity-offline'

/**
 * ⚠️ PLAFOND : chaque rapport porte son texte ET un instantané par
 *    exploitation ; vingt-quatre couvre deux ans de rapports mensuels, et c'est
 *    aussi ce que la lecture de la table demande.
 */
const KEEP = 24

const isRecord = (r: unknown): r is ActivityReportRecord =>
  typeof r === 'object' &&
  r !== null &&
  typeof (r as ActivityReportRecord).id === 'string' &&
  Array.isArray((r as ActivityReportRecord).farms)

function readList(raw: unknown): ActivityReportRecord[] {
  return Array.isArray(raw) ? raw.filter(isRecord) : []
}

/** L'ancienne clé d'avant BK (lue pour la vider dans la table, jamais écrite). */
function readLegacy(): ActivityReportRecord[] {
  try {
    const raw = readSetting(LEGACY_KEY)
    return raw ? readList(JSON.parse(raw) as unknown) : []
  } catch {
    return []
  }
}

export interface OfflineReports {
  pending: ActivityReportRecord[]
  copy: ActivityReportRecord[]
  /** La trace de la vidange de l'ancienne clé, pour le diagnostic. */
  drained?: { at: string; sent: number; kept: number; erased: boolean }
}

function readOffline(): OfflineReports {
  try {
    const raw = readSetting(OFFLINE_KEY)
    const v = raw ? (JSON.parse(raw) as Partial<OfflineReports>) : {}
    return { pending: readList(v.pending), copy: readList(v.copy), drained: v.drained }
  } catch {
    return { pending: [], copy: [] }
  }
}

function writeOffline(next: OfflineReports): void {
  try {
    writeSetting(OFFLINE_KEY, JSON.stringify(next))
  } catch {
    /* L'écran marche encore pour cette session. */
  }
}

/** Le plus récent d'abord, dédoublonné par identifiant. */
function order(rows: ActivityReportRecord[]): ActivityReportRecord[] {
  const seen = new Map<string, ActivityReportRecord>()
  for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r)
  return [...seen.values()]
    .sort(
      (a, b) =>
        b.period.to.localeCompare(a.period.to) ||
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    )
    .slice(0, KEEP)
}

/** JSON aux clés triées : `jsonb` ne garde pas l'ordre des clés. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

/**
 * ★★ BK — LE RAPPORT RELU DANS LA TABLE EST-IL CELUI QUE LA CLÉ PORTAIT ?
 *    Tout est comparé : période (bornes ET nature), instant (à la
 *    milliseconde, quel que soit le format), repère, totaux, instantané par
 *    exploitation, texte au caractère près.
 */
export function sameReport(a: ActivityReportRecord, b: ActivityReportRecord): boolean {
  return (
    a.id === b.id &&
    a.period.id === b.period.id &&
    a.period.from === b.period.from &&
    a.period.to === b.period.to &&
    new Date(a.generatedAt).getTime() === new Date(b.generatedAt).getTime() &&
    (a.previousId ?? null) === (b.previousId ?? null) &&
    canonical(a.totals) === canonical(b.totals) &&
    canonical(a.farms) === canonical(b.farms) &&
    a.body === b.body
  )
}

export interface DrainPlan {
  /** À envoyer : ce que la table n'a pas encore (file, puis ancienne clé). */
  send: ActivityReportRecord[]
}
export interface DrainVerdict {
  /** ★ L'ancienne clé peut-elle être effacée ? Seulement si la table porte TOUT, à l'identique. */
  eraseLegacy: boolean
  /** Les rapports de l'ancienne clé que la table ne porte pas (ou pas à l'identique). */
  missing: string[]
  /** La file hors ligne qui reste : ce que la table n'a toujours pas. */
  pending: ActivityReportRecord[]
}

/** ★ Pur : qu'envoyer, avant toute preuve. */
export function planDrain(legacy: readonly ActivityReportRecord[], pending: readonly ActivityReportRecord[], remoteIds: ReadonlySet<string>): DrainPlan {
  const seen = new Set<string>()
  const send: ActivityReportRecord[] = []
  for (const r of [...pending, ...legacy]) {
    if (remoteIds.has(r.id) || seen.has(r.id)) continue
    seen.add(r.id)
    send.push(r)
  }
  return { send }
}

/** ★ Pur : après relecture DANS LA TABLE, qu'effacer. `readBack === null` (pas de réponse) → rien. */
export function judgeDrain(
  legacy: readonly ActivityReportRecord[],
  pending: readonly ActivityReportRecord[],
  readBack: readonly ActivityReportRecord[] | null,
): DrainVerdict {
  if (readBack === null) return { eraseLegacy: false, missing: legacy.map((r) => r.id), pending: [...pending] }
  const byId = new Map(readBack.map((r) => [r.id, r]))
  const missing = legacy.filter((r) => !byId.has(r.id) || !sameReport(r, byId.get(r.id)!)).map((r) => r.id)
  return {
    eraseLegacy: legacy.length > 0 && missing.length === 0,
    missing,
    pending: pending.filter((r) => !byId.has(r.id)),
  }
}

let offline = readOffline()
/* ⚠️ Tant que l'ancienne clé n'est pas vidée, ses rapports restent MONTRÉS. */
let current: ActivityReportRecord[] = order([...offline.pending, ...offline.copy, ...readLegacy()])
const listeners = new Set<() => void>()

function publish(next: ActivityReportRecord[]): void {
  current = order(next)
  for (const l of listeners) l()
}

/** Pour le diagnostic : ce que l'appareil garde, et ce qu'a fait la vidange. */
export function activityOfflineState(): { pending: number; copy: number; legacy: number; drained: NonNullable<OfflineReports['drained']> | null } {
  return { pending: offline.pending.length, copy: offline.copy.length, legacy: readLegacy().length, drained: offline.drained ?? null }
}

export function activityReports(): ActivityReportRecord[] {
  return current
}

export function useActivityReports(): ActivityReportRecord[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    activityReports,
    activityReports,
  )
}

/**
 * ★ LE REPÈRE. Voir la note en tête pour les deux règles, dans cet ordre.
 *   Un rapport de la MÊME période est écarté : se comparer à soi-même ne
 *   mesure rien.
 */
export function previousReportFor(
  period: ActivityPeriod,
  rows: ActivityReportRecord[] = current,
): ActivityReportRecord | null {
  const before = rows.filter((r) => r.period.to < period.from)
  if (before.length > 0) return before[0]
  const other = rows.filter((r) => !(r.period.from === period.from && r.period.to === period.to))
  return other[0] ?? null
}

/** Le rapport est SORTI : d'abord dans la file hors ligne, puis dans la table. */
export async function keepActivityReport(record: ActivityReportRecord): Promise<void> {
  offline = { ...offline, pending: order([record, ...offline.pending]) }
  writeOffline(offline)
  publish([record, ...current])
  /* ⚠️ L'ÉCHEC N'EST PAS UNE ERREUR ICI : le rapport est dans la file, et
     `syncActivityReports` repassera. Ce qui serait une faute, c'est de le
     perdre parce que le réseau a manqué. */
  const ok = await saveRemoteActivityReport(record).catch(() => false)
  if (ok) {
    offline = { ...offline, pending: offline.pending.filter((r) => r.id !== record.id), copy: order([record, ...offline.copy]) }
    writeOffline(offline)
  }
}

/**
 * Relit la TABLE (la source), y envoie ce qu'elle n'a pas (la file hors ligne,
 * puis l'ancienne clé d'avant BK), relit ce qui a été envoyé, et n'efface
 * l'ancienne clé que si la relecture la retrouve ENTIÈRE et IDENTIQUE.
 * Appelé à l'ouverture de la fenêtre : un iPad neuf retrouve ce que l'iPhone a envoyé.
 */
export async function syncActivityReports(): Promise<void> {
  const remote = await loadRemoteActivityReports(KEEP).catch(() => null)
  if (remote === null) return
  const legacy = readLegacy()
  const plan = planDrain(legacy, offline.pending, new Set(remote.map((r) => r.id)))
  let sent = 0
  for (const r of plan.send) if (await saveRemoteActivityReport(r).catch(() => false)) sent++
  const ids = [...new Set([...legacy, ...offline.pending].map((r) => r.id))]
  const readBack = await loadRemoteActivityReportsByIds(ids).catch(() => null)
  const verdict = judgeDrain(legacy, offline.pending, readBack)
  const fresh = (await loadRemoteActivityReports(KEEP).catch(() => null)) ?? remote
  if (verdict.eraseLegacy) {
    try {
      writeSetting(LEGACY_KEY, null)
    } catch {
      /* Elle restera ; la prochaine ouverture recommencera, sans rien perdre. */
    }
  }
  offline = {
    pending: verdict.pending,
    copy: order(fresh),
    drained: legacy.length > 0 ? { at: new Date().toISOString(), sent, kept: verdict.missing.length, erased: verdict.eraseLegacy } : offline.drained,
  }
  writeOffline(offline)
  publish([...verdict.pending, ...fresh, ...(verdict.eraseLegacy ? [] : legacy)])
}
