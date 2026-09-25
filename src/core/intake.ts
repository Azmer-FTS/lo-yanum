import type { Farm } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AQ (2026-09-25) — LES DEMANDES ENTRANTES : CE QUI EST ARRIVÉ, ET QUI ATTEND.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce que le PO a vécu (AQ0) : une vraie demande déposée depuis la page
 * publique, le rendez-vous bien dans l'agenda — et rien d'autre. Pas de
 * notification, une fiche rangée dix-septième par ordre alphabétique, rien
 * qui la distingue des vingt-cinq autres. « La demande arrive, et il ne le
 * sait pas. »
 *
 * ★ UNE DEMANDE EST « ENTRANTE » TANT QUE SA FICHE PORTE `incoming_request`,
 *   ET RIEN D'AUTRE NE LA FAIT CESSER DE L'ÊTRE. L'ouvrir ne la traite pas ;
 *   la voir dans un bandeau ne la traite pas. Seul un geste du PO — le bouton
 *   « טופלה » de la fiche, ou un autre statut choisi dans l'édition — la fait
 *   sortir (AQ1.4, A264).
 *
 * ★ « VUE » EST UNE AUTRE QUESTION QUE « TRAITÉE ». Le bandeau de nouveauté
 *   (AQ2) ne se répète pas pour une demande que le PO a déjà vue — renvoyée ou
 *   ouverte depuis le bandeau — mais la demande reste en tête de la liste et
 *   sur le tableau de bord tant qu'elle n'est pas traitée. Deux ensembles,
 *   deux fonctions : `incomingFarms` et `unseenIncoming`.
 *
 * Pur : ni DOM, ni React, ni stockage. Le « déjà vu » est passé en argument.
 */

/** Ce que l'agriculteur a demandé (colonne `aid_requests.need`). */
export type IntakeNeed = 'guarding' | 'farm_work' | 'both'

/**
 * ★ AQ3 — CE QU'EST DEVENU UN COURRIEL. Écrit par la fonction Edge
 *   `intake-mail`, jamais par l'application :
 *   · `pending`        — la demande est enregistrée, l'envoi n'a pas encore eu lieu ;
 *   · `sent`           — l'expéditeur a accepté le message ;
 *   · `failed`         — l'expéditeur l'a refusé, ou n'a pas répondu ;
 *   · `not_configured` — aucune clé d'expéditeur sur le serveur : rien n'est parti ;
 *   · `skipped`        — rien à envoyer (l'agriculteur n'a pas donné d'adresse).
 */
export type IntakeMailState = 'pending' | 'sent' | 'failed' | 'not_configured' | 'skipped'

export interface IntakeRequest {
  id: string
  /** La fiche créée par `submit_aid_request` ; `null` si elle a été supprimée. */
  entityId: string | null
  createdAt: string
  need: IntakeNeed
  reference: string
  fullName: string
  phone: string
  email: string
  /** Le rendez-vous demandé, ou `null` s'il n'en a pas pris. */
  appointmentAt: string | null
  mailPo: IntakeMailState | null
  mailFarmer: IntakeMailState | null
  mailError: string | null
}

export function isIncoming(farm: Pick<Farm, 'status'>): boolean {
  return farm.status === 'incoming_request'
}

/**
 * ★ AQ1.2 — LES DEMANDES ENTRANTES EN TÊTE, QUEL QUE SOIT LE TRI CHOISI.
 *
 * Une partition STABLE : les demandes gardent entre elles l'ordre que le tri
 * leur a donné, les autres fiches aussi. Le tri du PO n'est pas remplacé, il
 * est précédé. La plus récente d'abord quand la date est connue.
 */
export function incomingFirst<T extends Pick<Farm, 'id' | 'status'>>(
  farms: readonly T[],
  requests: readonly IntakeRequest[] = [],
): T[] {
  const incoming = farms.filter(isIncoming)
  if (incoming.length === 0) return [...farms]
  const at = new Map<string, number>()
  for (const r of requests) {
    if (r.entityId && !at.has(r.entityId)) at.set(r.entityId, Date.parse(r.createdAt) || 0)
  }
  const ranked = incoming
    .map((farm, index) => ({ farm, index, when: at.get(farm.id) ?? 0 }))
    .sort((a, b) => b.when - a.when || a.index - b.index)
    .map((x) => x.farm)
  return [...ranked, ...farms.filter((f) => !isIncoming(f))]
}

/** Les fiches entrantes, dans l'ordre d'affichage (la plus récente d'abord). */
export function incomingFarms<T extends Pick<Farm, 'id' | 'status'>>(
  farms: readonly T[],
  requests: readonly IntakeRequest[] = [],
): T[] {
  return incomingFirst(farms, requests).filter(isIncoming)
}

/**
 * ★ AQ2.3 — CE QUE LE BANDEAU DE NOUVEAUTÉ A À DIRE : les demandes entrantes
 *   que le PO n'a pas encore vues. Une demande traitée n'y figure plus, une
 *   demande vue non plus — même si elle reste entrante.
 */
export function unseenIncoming<T extends Pick<Farm, 'id' | 'status'>>(
  farms: readonly T[],
  seen: ReadonlySet<string>,
  requests: readonly IntakeRequest[] = [],
): T[] {
  return incomingFarms(farms, requests).filter((f) => !seen.has(f.id))
}

/** La demande qui a créé cette fiche, s'il y en a une (la plus récente). */
export function requestForFarm(
  farmId: string,
  requests: readonly IntakeRequest[],
): IntakeRequest | null {
  let best: IntakeRequest | null = null
  for (const r of requests) {
    if (r.entityId !== farmId) continue
    if (!best || Date.parse(r.createdAt) > Date.parse(best.createdAt)) best = r
  }
  return best
}

/**
 * ★ AQ3.4 — UN COURRIEL PERDU NE FAIT JAMAIS PERDRE UNE DEMANDE, MAIS IL SE
 *   DIT. Vrai quand un des deux messages n'est pas parti alors qu'il aurait dû.
 *   `pending` n'en est pas un : l'envoi suit l'enregistrement de quelques
 *   secondes, et crier à l'échec pendant ce temps serait faux — sauf si
 *   l'attente dure (dix minutes), auquel cas le déclencheur n'a rien fait.
 */
export function mailProblem(request: IntakeRequest, nowMs = Date.now()): boolean {
  const bad = (s: IntakeMailState | null) => s === 'failed' || s === 'not_configured'
  if (bad(request.mailPo) || bad(request.mailFarmer)) return true
  const stale = nowMs - (Date.parse(request.createdAt) || nowMs) > 10 * 60 * 1000
  return stale && (request.mailPo === 'pending' || request.mailPo === null)
}

/**
 * Les deux statuts qu'une demande peut prendre quand le PO la marque traitée :
 * il a rappelé (`contacted`, le cas courant), ou il la range dans la file à
 * appeler (`to_contact`). Tout autre statut se choisit dans l'édition.
 */
export const INTAKE_HANDLED_STATUSES = ['contacted', 'to_contact'] as const
export type IntakeHandledStatus = (typeof INTAKE_HANDLED_STATUSES)[number]
