import {
  getCountableFarms,
  getVisibleFarmVisits,
  getVisibleFarms,
} from './access'
import { localDayKey, now, startOfWeek } from './clock'
import { awaitingDocuments, documentChecklist } from './documents'
import { WEIGHTED_DUNAM_TARGET, effectiveAreas, weightedDunams } from './fields'
import { countsTowardProgramme } from './types'
import type { Farm, FarmStatus } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AO3 (2026-09-24) — LE RAPPORT D'ACTIVITÉ. LE CŒUR DE LA PASSE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « On lui demande régulièrement ce qu'il a fait, et il ne peut pas retaper
 *     sa journée à la main chaque soir. »
 *
 * ★★ CE N'EST PAS LE « דוח » D'AVANT, ET LES DEUX DOIVENT COEXISTER.
 *    `core/report.ts` répond « où en est le programme » : une page d'ÉTAT
 *    qu'un directeur transmet à un bailleur. Celui-ci répond « qu'est-ce que
 *    j'ai fait depuis la dernière fois » : une page d'ÉVOLUTION que le PO
 *    colle dans WhatsApp le soir. Les fondre aurait donné une page qui
 *    répond mal aux deux questions.
 *
 * ★★ AO3.3 EST LA DEMANDE, ET ELLE COMMANDE TOUTE LA FORME DU FICHIER :
 *
 *      « ce qui a bougé depuis la dernière fois. C'est ce que son
 *        interlocuteur attend — pas un état, une évolution. »
 *
 *    Un état se recalcule à tout moment depuis la base. Une ÉVOLUTION a
 *    besoin d'un point de comparaison, et ce point est LE RAPPORT PRÉCÉDENT —
 *    pas « la base il y a trente jours », qui n'existe nulle part. D'où
 *    `ActivityReportRecord`, qui garde l'instantané PAR EXPLOITATION : les
 *    totaux disent qu'il y a une signée de plus, ils ne disent pas LAQUELLE.
 *
 * ⚠️ DEUX FAMILLES DE CHIFFRES, ET LE RAPPORT DIT LAQUELLE EST LAQUELLE.
 *
 *    · CE QUI PORTE UN HORODATAGE RÉEL — visites (`FarmVisit.at`), signatures
 *      (`Agreement.signedAt`), documents reçus (`ProvidedDocument.at`) — est
 *      compté SUR LA PÉRIODE CHOISIE, exactement.
 *    · CE QUI N'EN PORTE PAS — une fiche créée, un statut qui change, un
 *      contact obtenu — est compté PAR DIFFÉRENCE avec le rapport précédent.
 *      Une exploitation n'a pas de date de création dans ce modèle, et en
 *      inventer une aurait été pire que de nommer la limite.
 *
 *    Sans rapport précédent, ces lignes-là sont VIDES et le rapport l'écrit
 *    (« זהו הדוח הראשון »). Un premier rapport qui prétendrait que les 25
 *    exploitations ont été créées cette semaine serait un mensonge poli.
 *
 * ⚠️ @core NE LIT NI LE NAVIGATEUR NI LE RÉSEAU. L'objectif et le rapport
 *    précédent sont PASSÉS par l'appelant, comme `buildProgrammeReport` le
 *    fait depuis AF5.3.
 */

// ---------------------------------------------------------------------------
// 1 — La période
// ---------------------------------------------------------------------------

export type ActivityPeriodId = 'today' | 'week' | 'month' | 'custom'

export interface ActivityPeriod {
  id: ActivityPeriodId
  /** ISO `YYYY-MM-DD`, borne INCLUSE. */
  from: string
  /** ISO `YYYY-MM-DD`, borne INCLUSE. */
  to: string
}

/**
 * ★ « CETTE SEMAINE » COMMENCE LE DIMANCHE. C'est la semaine israélienne, et
 *   le PO compte ses jours comme son pays les compte : un rapport « cette
 *   semaine » livré un dimanche soir doit porter ce dimanche-là, pas les six
 *   jours d'avant.
 */
export function periodFor(id: Exclude<ActivityPeriodId, 'custom'>, at: Date = now()): ActivityPeriod {
  const to = localDayKey(at)
  if (id === 'today') return { id, from: to, to }
  /* `startOfWeek` (core/clock.ts) est DÉJÀ la semaine du calendrier de l'app —
     celle que l'agenda dessine. Une seconde arithmétique ici aurait fini par
     décaler le rapport d'un jour par rapport à l'écran qui l'a inspiré. */
  if (id === 'week') return { id, from: localDayKey(startOfWeek(at)), to }
  return { id, from: localDayKey(new Date(at.getFullYear(), at.getMonth(), 1)), to }
}

/** Une période libre, bornes rangées dans l'ordre quoi qu'il arrive. */
export function customPeriod(from: string, to: string): ActivityPeriod {
  return from <= to ? { id: 'custom', from, to } : { id: 'custom', from: to, to: from }
}

/** L'horodatage ISO tombe-t-il dans la période (bornes incluses, par jour) ? */
export function withinPeriod(iso: string | null | undefined, period: ActivityPeriod): boolean {
  if (!iso) return false
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return false
  const key = localDayKey(t)
  return key >= period.from && key <= period.to
}

// ---------------------------------------------------------------------------
// 2 — L'instantané gardé
// ---------------------------------------------------------------------------

/**
 * Ce qu'un rapport garde d'une exploitation. Volontairement PETIT : ce qui
 * sert à dire « ça a bougé », et rien de plus. Y mettre la fiche entière
 * ferait d'un journal une seconde base de données.
 */
export interface ActivityFarmSnapshot {
  id: string
  name: string
  status: FarmStatus
  cultivated: number
  grazing: number
  weighted: number
  /** Personnes joignables : l'agriculteur s'il a un numéro, plus les contacts. */
  contacts: number
  documents: number
  awaiting: boolean
  /** Le commentaire du PO, MOT POUR MOT (AO3.2). */
  note: string
}

export interface ActivityTotals {
  /** Les exploitations qui COMPTENT (hors « לא רלוונטי כרגע » et « בהמתנה »). */
  farms: number
  /** Celles qui sont dans les listes sans peser (AO2.3). */
  offCount: number
  cultivatedDunams: number
  grazingDunams: number
  weightedDunams: number
  targetWeighted: number
  targetPercent: number
  signed: number
  signedWithDocuments: number
  signedAwaitingDocuments: number
  contacts: number
}

/** Un rapport CONSERVÉ (AO3.6) — la ligne de `public.activity_reports`. */
export interface ActivityReportRecord {
  id: string
  period: ActivityPeriod
  generatedAt: string
  previousId: string | null
  totals: ActivityTotals
  farms: ActivityFarmSnapshot[]
  /** Le texte hébreu EXACTEMENT tel qu'il est parti. */
  body: string
}

// ---------------------------------------------------------------------------
// 3 — Le rapport
// ---------------------------------------------------------------------------

export interface ActivityDelta {
  farms: number
  cultivatedDunams: number
  grazingDunams: number
  weightedDunams: number
  /** En POINTS de pourcentage, pas en pourcentage d'un pourcentage. */
  targetPercentPoints: number
  signed: number
  signedWithDocuments: number
  contacts: number
}

export interface ActivityReport {
  generatedAt: string
  period: ActivityPeriod
  totals: ActivityTotals
  farms: ActivityFarmSnapshot[]

  /* --- ce qui porte un horodatage réel : compté SUR LA PÉRIODE --- */
  visited: Array<{ farm: string; at: string; note: string }>
  signedInPeriod: Array<{ farm: string; at: string; by: string }>
  documentsReceived: Array<{ farm: string; document: string; at: string }>

  /* --- l'état, à la date du rapport --- */
  documentsAwaited: Array<{ farm: string; missing: string[] }>
  comments: Array<{ farm: string; status: FarmStatus; text: string }>
  offCount: Array<{ farm: string; status: FarmStatus; note: string }>

  /* --- ce qui se compte PAR DIFFÉRENCE avec le rapport précédent --- */
  previous: { id: string; generatedAt: string; period: ActivityPeriod } | null
  created: string[]
  statusChanges: Array<{ farm: string; from: FarmStatus; to: FarmStatus }>
  newContacts: Array<{ farm: string; added: number }>
  delta: ActivityDelta | null
}

export interface ActivityReportOptions {
  /** L'objectif en dounams pondérés (הגדרות, AB5a). @core ne lit pas le navigateur. */
  targetWeighted?: number
  /** Le rapport qui sert de repère. `null` = c'est le premier. */
  previous?: ActivityReportRecord | null
}

/** Personnes joignables sur une fiche. Une seule définition, ici. */
function reachablePeople(farm: Farm): number {
  const farmer = farm.farmerPhone && farm.farmerPhone !== '' ? 1 : 0
  return farmer + farm.contacts.filter((c) => c.phone !== '').length
}

export function snapshotFarm(farm: Farm): ActivityFarmSnapshot {
  return {
    id: farm.id,
    name: farm.name,
    status: farm.status,
    cultivated: farm.farmDunams,
    grazing: farm.grazingDunams,
    weighted: weightedDunams(farm),
    contacts: reachablePeople(farm),
    documents: (farm.providedDocuments ?? []).length,
    awaiting: awaitingDocuments(farm),
    note: farm.notes,
  }
}

const SIGNED: readonly FarmStatus[] = ['signed', 'active']

export function totalsOf(farms: Farm[], targetWeighted: number): ActivityTotals {
  const counted = farms.filter((f) => countsTowardProgramme(f.status))
  let cultivated = 0
  let grazing = 0
  let weighted = 0
  let contacts = 0
  for (const f of counted) {
    const areas = effectiveAreas(f)
    cultivated += areas.cultivated
    grazing += areas.grazing
    weighted += weightedDunams(f)
    contacts += reachablePeople(f)
  }
  const signed = counted.filter((f) => SIGNED.includes(f.status))
  return {
    farms: counted.length,
    offCount: farms.length - counted.length,
    cultivatedDunams: cultivated,
    grazingDunams: grazing,
    weightedDunams: weighted,
    targetWeighted,
    targetPercent: targetWeighted > 0 ? Math.round((weighted / targetWeighted) * 100) : 0,
    signed: signed.length,
    /* ★ AK5 / AO2.5 — « une signature sans documents, c'est la moitié du
       chemin. » Les deux nombres font la somme des signées, toujours. */
    signedWithDocuments: signed.filter((f) => !awaitingDocuments(f)).length,
    signedAwaitingDocuments: signed.filter((f) => awaitingDocuments(f)).length,
    contacts,
  }
}

export function buildActivityReport(
  period: ActivityPeriod,
  options: ActivityReportOptions = {},
): ActivityReport {
  const at = now()
  const target = options.targetWeighted ?? WEIGHTED_DUNAM_TARGET
  const previous = options.previous ?? null

  /* AH3.5 — le jeu d'essai ne pèse pas ; AK7 — les archivées non plus. */
  const farms = getCountableFarms()
  const byId = new Map(farms.map((f) => [f.id, f]))
  const snapshots = farms.map(snapshotFarm)
  const totals = totalsOf(farms, target)

  /* --- la période, sur des horodatages réels ----------------------------- */
  const visitIds = new Set(getVisibleFarms().map((f) => f.id))
  const visited = getVisibleFarmVisits()
    .filter((v) => v.done && withinPeriod(v.at, period) && visitIds.has(v.farmId))
    .map((v) => ({ farm: byId.get(v.farmId)?.name ?? '', at: v.at, note: v.note }))
    .filter((v) => v.farm !== '')

  const signedInPeriod: ActivityReport['signedInPeriod'] = []
  const documentsReceived: ActivityReport['documentsReceived'] = []
  for (const farm of farms) {
    for (const a of farm.agreements) {
      if (withinPeriod(a.signedAt, period)) {
        signedInPeriod.push({ farm: farm.name, at: a.signedAt, by: a.signedBy })
      }
    }
    for (const d of farm.providedDocuments ?? []) {
      if (withinPeriod(d.providedAt, period)) {
        documentsReceived.push({ farm: farm.name, document: d.id, at: d.providedAt })
      }
    }
  }
  const order = (a: { at: string }, b: { at: string }) =>
    new Date(a.at).getTime() - new Date(b.at).getTime()
  visited.sort(order)
  signedInPeriod.sort(order)
  documentsReceived.sort(order)

  /* --- l'état ------------------------------------------------------------ */
  const documentsAwaited = farms
    .filter((f) => countsTowardProgramme(f.status) && awaitingDocuments(f))
    .map((f) => ({
      farm: f.name,
      missing: documentChecklist(f)
        .filter((line) => !line.provided)
        .map((line) => line.id),
    }))

  /* ★ AO3.2 — LES COMMENTAIRES DU PO, REPRIS TELS QUELS. Pas résumés, pas
     tronqués, pas reformulés : c'est lui qui les a écrits, et c'est souvent
     la seule phrase du rapport que son interlocuteur va lire deux fois. */
  const comments = farms
    .filter((f) => f.notes.trim() !== '')
    .map((f) => ({ farm: f.name, status: f.status, text: f.notes }))

  /* ★ AO3.7 — hors compteurs, mais DANS le rapport, avec leur raison. */
  const offCount = farms
    .filter((f) => !countsTowardProgramme(f.status))
    .map((f) => ({ farm: f.name, status: f.status, note: f.notes }))

  /* --- la comparaison ---------------------------------------------------- */
  let created: string[] = []
  let statusChanges: ActivityReport['statusChanges'] = []
  let newContacts: ActivityReport['newContacts'] = []
  let delta: ActivityDelta | null = null

  if (previous) {
    const before = new Map(previous.farms.map((f) => [f.id, f]))
    created = snapshots.filter((f) => !before.has(f.id)).map((f) => f.name)
    statusChanges = snapshots
      .filter((f) => before.has(f.id) && before.get(f.id)!.status !== f.status)
      .map((f) => ({ farm: f.name, from: before.get(f.id)!.status, to: f.status }))
    newContacts = snapshots
      .filter((f) => before.has(f.id) && f.contacts > before.get(f.id)!.contacts)
      .map((f) => ({ farm: f.name, added: f.contacts - before.get(f.id)!.contacts }))
    const p = previous.totals
    delta = {
      farms: totals.farms - p.farms,
      cultivatedDunams: totals.cultivatedDunams - p.cultivatedDunams,
      grazingDunams: totals.grazingDunams - p.grazingDunams,
      weightedDunams: totals.weightedDunams - p.weightedDunams,
      targetPercentPoints: totals.targetPercent - p.targetPercent,
      signed: totals.signed - p.signed,
      signedWithDocuments: totals.signedWithDocuments - p.signedWithDocuments,
      contacts: totals.contacts - p.contacts,
    }
  }

  return {
    generatedAt: at.toISOString(),
    period,
    totals,
    farms: snapshots,
    visited,
    signedInPeriod,
    documentsReceived,
    documentsAwaited,
    comments,
    offCount,
    previous: previous
      ? { id: previous.id, generatedAt: previous.generatedAt, period: previous.period }
      : null,
    created,
    statusChanges,
    newContacts,
    delta,
  }
}

/** L'identifiant d'un rapport : sa période et l'instant où il a été bâti. */
export function activityReportId(report: ActivityReport): string {
  return `ao3-${report.period.from}_${report.period.to}-${report.generatedAt.replace(/[:.]/g, '')}`
}

/** Le rapport, prêt à être gardé. `body` est le texte qui part vraiment. */
export function toRecord(report: ActivityReport, body: string): ActivityReportRecord {
  return {
    id: activityReportId(report),
    period: report.period,
    generatedAt: report.generatedAt,
    previousId: report.previous?.id ?? null,
    totals: report.totals,
    farms: report.farms,
    body,
  }
}
