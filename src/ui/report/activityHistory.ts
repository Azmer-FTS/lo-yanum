import { useSyncExternalStore } from 'react'

import type { ActivityPeriod, ActivityReportRecord } from '@core/index'

import {
  loadRemoteActivityReports,
  saveRemoteActivityReport,
} from '../../data/activityReports'

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
 * ★★ LE LOCAL EST LA VÉRITÉ DE TRAVAIL, LE SERVEUR EST LA COPIE DURABLE.
 *    L'ordre est celui d'AH11.2 et il vient du terrain : le PO travaille dans
 *    des champs sans réseau. Un rapport écrit hors ligne est gardé localement
 *    et repoussé au prochain enregistrement réussi ; il n'est jamais perdu
 *    parce que Supabase n'a pas répondu.
 *
 * ★ LE REPÈRE DE COMPARAISON EST LE DERNIER RAPPORT DONT LA PÉRIODE SE TERMINE
 *   AVANT LE DÉBUT DE CELLE-CI — et à défaut, le plus récent tout court. La
 *   première règle est celle qui donne un sens à « ce qui a bougé » ; la
 *   seconde évite qu'un PO qui demande « aujourd'hui » après avoir sorti un
 *   rapport « ce mois-ci » se retrouve sans aucune comparaison.
 */

const KEY = 'lo-yanum:activity-reports'

/**
 * ⚠️ PLAFOND, PARCE QUE `localStorage` A UN PLAFOND. Chaque rapport porte son
 *    texte ET un instantané par exploitation ; à vingt-cinq fiches c'est
 *    quelques kilo-octets, mais un journal sans limite finit par faire échouer
 *    l'écriture — et l'écriture qui échoue serait celle du rapport du jour.
 *    Vingt-quatre couvre deux ans de rapports mensuels.
 */
const KEEP = 24

function read(): ActivityReportRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is ActivityReportRecord =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as ActivityReportRecord).id === 'string' &&
        Array.isArray((r as ActivityReportRecord).farms),
    )
  } catch {
    /* Navigation privée, ou une forme plus ancienne. */
    return []
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

let current: ActivityReportRecord[] = order(read())
const listeners = new Set<() => void>()

function publish(next: ActivityReportRecord[]): void {
  current = order(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* L'écran marche encore pour cette session ; rien qui mérite d'échouer. */
  }
  for (const l of listeners) l()
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

/** Le rapport est SORTI : on le garde, localement d'abord. */
export async function keepActivityReport(record: ActivityReportRecord): Promise<void> {
  publish([record, ...current])
  /* ⚠️ L'ÉCHEC N'EST PAS UNE ERREUR ICI : la copie locale est déjà écrite, et
     `pushPendingReports` repassera. Ce qui serait une faute, c'est de perdre
     le rapport parce que le réseau a manqué. */
  await saveRemoteActivityReport(record).catch(() => false)
}

/**
 * Relit le serveur et fond les deux journaux. Appelé à l'ouverture de la
 * fenêtre : un iPad neuf doit retrouver ce que l'iPhone a envoyé.
 */
export async function syncActivityReports(): Promise<void> {
  const remote = await loadRemoteActivityReports(KEEP).catch(() => null)
  if (remote === null) return
  const known = new Set(remote.map((r) => r.id))
  /* Ce que le local a et que le serveur n'a pas : écrit hors ligne. */
  for (const local of current) {
    if (!known.has(local.id)) await saveRemoteActivityReport(local).catch(() => false)
  }
  publish([...remote, ...current])
}
