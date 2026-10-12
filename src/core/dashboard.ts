import { normalizeLeadStatus } from './leads'
import { isSecretariatEntry, needsPriorCoordination } from './institutions'
import type { Institution } from './institutions'

import { isContactEstablished } from './people'
import { isTestId } from './testData'
import type { Farm, Lead } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BD 6 (2026-10-12) — LE TABLEAU DE BORD SUIT L'ÉTAPE DU PROJET.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Il mesurait une opération qui n'a pas commencé : zéro garde, zéro
 * volontaire, zéro ferme active — exact et inutile ce mois-ci. LE PRINCIPE :
 * UN BLOC QUI N'A RIEN À DIRE NE S'AFFICHE PAS ; il réapparaît le jour où il a
 * du sens. Rien de nouveau n'est saisi pour ce tableau : tout se calcule depuis
 * la base.
 *
 * ★ CHAQUE COMPTE EST CELUI DE SA LISTE FILTRÉE. Une ligne de « מה לעשות » et
 *   une marche de l'entonnoir portent un compte et mènent à une liste ; le
 *   compte est calculé par le MÊME prédicat que le filtre de cette liste
 *   (exportés ici, lus par les écrans de liste). `bdpass` le vérifie.
 */

/** Une institution sans רכז (désigné pour les volontaires) ; « לא רלוונטי » n'en a pas besoin. */
export const isInstitutionWithoutCoordinator = (i: Pick<Institution, 'engagement' | 'contacts'>): boolean =>
  i.engagement !== 'not_relevant' && !(i.contacts ?? []).some((c) => c.role === 'coordinator' && !isSecretariatEntry(c))

/** « נדרש תיאום מוקדם » et pas encore traitée : on ne l'a pas encore approchée. */
export const isCoordinationPending = (i: Pick<Institution, 'coordinationRequired' | 'engagement'>): boolean =>
  needsPriorCoordination(i) && i.engagement === 'not_contacted'

/** Un accord prêt à signer et non signé : la ferme a dit oui de vive voix (הסכמה בעל פה). */
export const isReadyToSign = (f: Pick<Farm, 'status'>): boolean => f.status === 'verbal_ok'

/**
 * Un contact à traiter OUVERT : ce que la liste des contacts montre par défaut
 * (« הכל » : pas devenu ferme, pas « לא עכשיו »).
 */
export const isLeadListedOpen = (l: Pick<Lead, 'status' | 'convertedFarmId'>): boolean => !l.convertedFarmId && normalizeLeadStatus(l.status) !== 'not_now'

/** Un contact à traiter ouvert depuis plus de deux semaines. */
export const STALE_LEAD_DAYS = 14
export const isLeadStale = (l: Lead, nowMs: number): boolean =>
  isLeadListedOpen(l) && nowMs - Date.parse(l.createdAt) > STALE_LEAD_DAYS * 86_400_000

export type WorkKey = 'institutionsNoCoordinator' | 'farmsNotContacted' | 'agreementsToSign' | 'coordinationPending' | 'staleLeads'

export interface WorkItem {
  key: WorkKey
  count: number
  /** La liste filtrée qui contient exactement ces fiches. */
  to: string
}

/** Où chaque ligne mène : l'adresse de la liste et le filtre qu'elle lit. */
export const WORK_ROUTES: Record<WorkKey, string> = {
  institutionsNoCoordinator: '/coordinator/institutions?filter=noCoordinator',
  farmsNotContacted: '/coordinator/farms?filter=notContacted',
  agreementsToSign: '/coordinator/farms?status=verbal_ok',
  coordinationPending: '/coordinator/institutions?filter=coordinationPending',
  staleLeads: '/coordinator/leads?filter=stale',
}

export interface DashboardSource {
  farms: readonly Farm[]
  institutions: readonly Institution[]
  leads: readonly Lead[]
  nowMs: number
}

/** Ce qui compte : ni le jeu d'essai, ni les contacts déjà devenus fermes. */
const counted = <T extends { id: string }>(xs: readonly T[]): T[] => xs.filter((x) => !isTestId(x.id))

/**
 * « מה לעשות » : la liste de travail, dans l'ordre du brief. ⛔ Une catégorie
 * vide disparaît (elle n'est pas rendue à zéro).
 */
export function workList(src: DashboardSource): WorkItem[] {
  const farms = counted(src.farms)
  const institutions = counted(src.institutions)
  const leads = counted(src.leads)
  const all: WorkItem[] = [
    { key: 'institutionsNoCoordinator', count: institutions.filter(isInstitutionWithoutCoordinator).length, to: WORK_ROUTES.institutionsNoCoordinator },
    { key: 'farmsNotContacted', count: farms.filter((f) => !isContactEstablished(f)).length, to: WORK_ROUTES.farmsNotContacted },
    { key: 'agreementsToSign', count: farms.filter(isReadyToSign).length, to: WORK_ROUTES.agreementsToSign },
    { key: 'coordinationPending', count: institutions.filter(isCoordinationPending).length, to: WORK_ROUTES.coordinationPending },
    { key: 'staleLeads', count: leads.filter((l) => isLeadStale(l, src.nowMs)).length, to: WORK_ROUTES.staleLeads },
  ]
  return all.filter((w) => w.count > 0)
}

export type FunnelKey = 'leads' | 'farms' | 'readyToSign' | 'signed' | 'active'

export interface FunnelStep {
  key: FunnelKey
  count: number
  to: string
}

/**
 * L'ENTONNOIR, en une ligne : contacts à traiter → fermes → prêtes à signer →
 * signées → actives. La photo de l'avancement ; il remplace les chiffres isolés
 * qui affichaient zéro. Chaque marche a le compte de sa liste filtrée.
 */
export function funnel(src: DashboardSource): FunnelStep[] {
  const farms = counted(src.farms)
  return [
    { key: 'leads', count: counted(src.leads).filter(isLeadListedOpen).length, to: '/coordinator/leads' },
    { key: 'farms', count: farms.length, to: '/coordinator/farms' },
    { key: 'readyToSign', count: farms.filter(isReadyToSign).length, to: '/coordinator/farms?status=verbal_ok' },
    { key: 'signed', count: farms.filter((f) => f.status === 'signed').length, to: '/coordinator/farms?status=signed' },
    { key: 'active', count: farms.filter((f) => f.status === 'active').length, to: '/coordinator/farms?status=active' },
  ]
}

/**
 * Quels blocs le tableau de bord rend AUJOURD'HUI. Toujours : l'entonnoir, le
 * dounam (l'engagement de l'association), la courbe des dounams signés,
 * « היום שלי ». Selon l'étape : les demandes (s'il en arrive), la liste de
 * travail (si elle a une ligne), la courbe des gardes (dès la première garde),
 * les alertes, les gardes de ce soir.
 */
export interface DashboardBlocks {
  requests: boolean
  work: boolean
  funnel: true
  dunam: true
  dunamCurve: true
  guardCurve: boolean
  myDay: true
  alerts: boolean
  tonight: boolean
  guardedFigures: boolean
}

export function dashboardBlocks(input: { requests: number; work: readonly WorkItem[]; guards: number; alerts: number; tonight: number; guardedDunams: number }): DashboardBlocks {
  return {
    requests: input.requests > 0,
    work: input.work.length > 0,
    funnel: true,
    dunam: true,
    dunamCurve: true,
    guardCurve: input.guards > 0,
    myDay: true,
    alerts: input.alerts > 0,
    tonight: input.tonight > 0,
    guardedFigures: input.guardedDunams > 0,
  }
}
