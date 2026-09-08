import { now } from './clock'
import type { Mission } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE3 (2026-09-08) — L'ABSENCE DE NOUVELLES EST UNE ALERTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le défaut de toute application de panique : dans le pire des cas,
 *     personne ne presse rien. »
 *
 * ★ C'EST LA SEULE PARTIE DE CETTE PASSE QUI N'A PAS DE BOUTON. Tout le reste
 *   d'AE2 attend un geste ; ceci attend qu'un geste N'AIT PAS eu lieu, et
 *   déduit d'une case restée nulle à une heure donnée qu'il faut téléphoner.
 *
 * ★ TROIS SILENCES ET PAS UN. Ils ne se déduisent pas l'un de l'autre :
 *
 *     · une garde jamais PRISE — personne n'est arrivé, et il est 22:40 ;
 *     · une garde qui a CESSÉ de donner signe — arrivée confirmée à 21:00, et
 *       plus rien à 01:30 ;
 *     · une garde jamais CLÔTURÉE — le matin est passé et l'écran dit encore
 *       « en cours ».
 *
 *   Le deuxième est le seul qui puisse trouver un problème PENDANT la nuit, et
 *   c'est celui qui coûte le plus cher à mal régler : voir l'intervalle.
 *
 * ★ ET TOUT EST PUR ET PARAMÉTRÉ. Les seuils sont des ARGUMENTS, jamais une
 *   lecture d'un état caché — même règle qu'AD2 pour le seuil d'écart, et pour
 *   la même raison : « les réglages suivent immédiatement » devient une
 *   vérité par construction plutôt qu'un abonnement qu'un écran peut oublier.
 */

// ---------------------------------------------------------------------------
// Les trois délais, en constantes nommées et réglables (AE3.2, AE3.3)
// ---------------------------------------------------------------------------

/**
 * ★ TRENTE MINUTES APRÈS L'HEURE DE DÉBUT.
 *
 *   En dessous, on alerte le coordinateur pour un embouteillage sur la 25 : le
 *   trajet depuis une yeshiva de Beer-Sheva prend quarante minutes et un quart
 *   d'heure de retard est la nuit ordinaire. Au-delà d'une heure, le
 *   coordinateur apprend à minuit qu'une ferme n'a personne depuis 23:00, et
 *   il n'a plus le temps de trouver quelqu'un.
 */
export const ARRIVAL_GRACE_MINUTES_INITIAL = 30

/**
 * ★★ DEUX HEURES, ET LE BRIEF ÉCRIT LUI-MÊME POURQUOI C'EST GÉNÉREUX :
 *    « un volontaire réveillé toutes les vingt minutes désinstalle l'app ».
 *
 *    C'est la seule constante de ce fichier dont la mauvaise valeur détruit la
 *    fonctionnalité au lieu de la dégrader. Un point de contrôle trop fréquent
 *    n'est pas « un peu agaçant » : il produit un utilisateur qui coupe les
 *    notifications, et alors les TROIS silences deviennent muets d'un coup.
 *    Deux heures fait trois ou quatre gestes sur une nuit de 21:00 à 06:00.
 */
export const CHECKPOINT_INTERVAL_MINUTES_INITIAL = 120

/**
 * ★ LA RELANCE, ET ELLE EST OBLIGATOIRE (AE3.3 : « avec relance avant de
 *   déclencher quoi que ce soit »).
 *
 *   Dix minutes avant l'échéance, l'écran du volontaire le demande. Sans elle,
 *   le premier signe qu'un point de contrôle existait serait le coup de fil du
 *   coordinateur — ce qui est une alerte fabriquée par l'app elle-même.
 */
export const CHECKPOINT_REMINDER_MINUTES = 10

/**
 * ★ UNE HEURE APRÈS L'HEURE DE FIN. Le ramassage du matin glisse : le
 *   conducteur passe par deux fermes, la relève discute au portail. Une heure
 *   distingue « ils traînent » de « personne n'a fermé cette nuit ».
 */
export const GUARD_CLOSE_GRACE_MINUTES_INITIAL = 60

export interface VigilThresholds {
  arrivalGraceMinutes: number
  checkpointIntervalMinutes: number
  closeGraceMinutes: number
}

export const VIGIL_DEFAULTS: VigilThresholds = {
  arrivalGraceMinutes: ARRIVAL_GRACE_MINUTES_INITIAL,
  checkpointIntervalMinutes: CHECKPOINT_INTERVAL_MINUTES_INITIAL,
  closeGraceMinutes: GUARD_CLOSE_GRACE_MINUTES_INITIAL,
}

const MIN = 60_000

// ---------------------------------------------------------------------------
// AE3.5 — « une garde non confirmée n'est pas une garde reçue »
// ---------------------------------------------------------------------------

/**
 * ★★ LE FAIT QUI COMPTE EST L'ARRIVÉE, PAS LA PROGRAMMATION.
 *
 *   « Ces signaux nourrissent les compteurs de gardes effectuées d'AC4 : une
 *     garde non confirmée n'est pas une garde reçue. »
 *
 *   AC4 comptait toute garde passée non annulée. C'était la bonne définition
 *   tant que rien dans le système ne pouvait dire si quelqu'un était venu ;
 *   depuis AE3.1, une case le dit. Une nuit où personne n'a confirmé l'arrivée
 *   est une nuit dont on ne sait pas si elle a eu lieu, et la porter au crédit
 *   d'une ferme dans le rapport de l'association est exactement le genre de
 *   chiffre que ce programme ne peut pas se permettre.
 *
 * ⚠️ ET C'EST LA MÊME FONCTION QUI SERT AU COMPTEUR ET À L'ALERTE, sinon les
 *    deux dérivent : le tableau de bord dirait « garde non confirmée » pendant
 *    que la fiche la compterait comme reçue.
 */
export function guardWasHeld(mission: Mission): boolean {
  if (mission.status === 'cancelled') return false
  return mission.arrivalConfirmedAt !== null
}

// ---------------------------------------------------------------------------
// Le point de contrôle
// ---------------------------------------------------------------------------

export interface CheckpointState {
  /** L'instant du dernier signe de vie : l'arrivée, ou le dernier point. */
  lastAt: number | null
  /** Quand le prochain est attendu. */
  dueAt: number | null
  /** Vrai dans les dix dernières minutes : l'écran DEMANDE (AE3.3). */
  reminding: boolean
  /** Vrai passé l'échéance : le coordinateur est prévenu. */
  overdue: boolean
  /** Minutes depuis le dernier signe de vie. */
  silentMinutes: number
}

/**
 * ⚠️ LA GARDE EST « EN COURS » ENTRE L'ARRIVÉE CONFIRMÉE ET LA FIN CONFIRMÉE,
 *    ET C'EST TOUT. Une garde qui n'a pas commencé n'est pas silencieuse (elle
 *    relève du premier signal) et une garde terminée non plus. Sans cette
 *    borne, une garde clôturée à 06:00 produirait un point de contrôle en
 *    retard à 08:00, tous les jours, pour toujours.
 */
export function checkpointState(
  mission: Mission,
  thresholds: VigilThresholds = VIGIL_DEFAULTS,
  at: number = now().getTime(),
): CheckpointState {
  const idle: CheckpointState = {
    lastAt: null,
    dueAt: null,
    reminding: false,
    overdue: false,
    silentMinutes: 0,
  }
  if (mission.status === 'cancelled') return idle
  if (mission.arrivalConfirmedAt === null) return idle
  if (mission.endConfirmedAt !== null) return idle

  const arrival = new Date(mission.arrivalConfirmedAt).getTime()
  if (!Number.isFinite(arrival)) return idle
  let lastAt = arrival
  for (const stamp of mission.checkpoints ?? []) {
    const t = new Date(stamp).getTime()
    if (Number.isFinite(t) && t > lastAt) lastAt = t
  }
  const dueAt = lastAt + thresholds.checkpointIntervalMinutes * MIN
  return {
    lastAt,
    dueAt,
    reminding: at >= dueAt - CHECKPOINT_REMINDER_MINUTES * MIN && at < dueAt,
    overdue: at >= dueAt,
    silentMinutes: Math.max(0, Math.floor((at - lastAt) / MIN)),
  }
}

// ---------------------------------------------------------------------------
// Les trois silences
// ---------------------------------------------------------------------------

export type SilenceKind = 'arrival_missing' | 'checkpoint_missing' | 'end_missing'

export interface SilenceSignal {
  kind: SilenceKind
  missionId: string
  farmId: string
  /** L'heure de référence : le début attendu, le dernier signe, la fin attendue. */
  at: string
  /** Depuis combien de minutes on ne sait rien. */
  lateMinutes: number
}

/**
 * ⚠️ UNE GARDE NE PRODUIT QU'UN SEUL SIGNAL, ET L'ORDRE DES TESTS EST CE QUI
 *    LE GARANTIT. Une garde jamais prise dont l'heure de fin est passée est
 *    silencieuse deux fois, littéralement ; en dire deux choses au
 *    coordinateur, c'est lui faire téléphoner deux fois pour une seule ferme,
 *    et c'est aussi la façon dont une liste d'alertes devient trop longue pour
 *    être lue. Le premier silence dans l'ordre du temps gagne.
 */
export function silenceSignals(
  missions: readonly Mission[],
  thresholds: VigilThresholds = VIGIL_DEFAULTS,
  at: number = now().getTime(),
): SilenceSignal[] {
  const out: SilenceSignal[] = []
  for (const mission of missions) {
    if (mission.status === 'cancelled') continue
    const start = new Date(mission.startAt).getTime()
    const end = new Date(mission.endAt).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue

    if (mission.arrivalConfirmedAt === null) {
      const deadline = start + thresholds.arrivalGraceMinutes * MIN
      if (at >= deadline) {
        out.push({
          kind: 'arrival_missing',
          missionId: mission.id,
          farmId: mission.farmId,
          at: mission.startAt,
          lateMinutes: Math.floor((at - start) / MIN),
        })
      }
      continue
    }

    if (mission.endConfirmedAt === null) {
      const closeDeadline = end + thresholds.closeGraceMinutes * MIN
      if (at >= closeDeadline) {
        out.push({
          kind: 'end_missing',
          missionId: mission.id,
          farmId: mission.farmId,
          at: mission.endAt,
          lateMinutes: Math.floor((at - end) / MIN),
        })
        continue
      }
      const cp = checkpointState(mission, thresholds, at)
      if (cp.overdue) {
        out.push({
          kind: 'checkpoint_missing',
          missionId: mission.id,
          farmId: mission.farmId,
          at: new Date(cp.lastAt ?? start).toISOString(),
          lateMinutes: cp.silentMinutes,
        })
      }
    }
  }
  return out
}
