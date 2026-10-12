/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BC (2026-10-12) — CE QU'IL FAUT RELIRE AVANT DE COMPOSER UN NUMÉRO.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BB a posé « נדרש תיאום מוקדם » sur une institution : tous ses boutons
 * d'appel passent en avertissement et demandent de relire le texte. BC y
 * ajoute LE CONTACT dont la NOTE restreint l'usage de son téléphone (une ligne
 * publique de בית ההוראה réservée à la halakha) : dans la LISTE, le PO voyait
 * un numéro ordinaire et le composait par réflexe — l'avertissement n'existait
 * que sur la fiche.
 *
 * UN SEUL MÉCANISME : cette fonction dit ce qui restreint un appel ; l'écran
 * (`institutionUi.tsx` : `guardCall`, `confirmCall`, `callTone`) le traduit et
 * le fait relire. Elle sert aux contacts d'institution comme à ceux d'une
 * ferme (`inst = null`).
 *
 * PUR : ni DOM, ni React (`bcpass` A415).
 */

export interface CallContact {
  name?: string
  note?: string
  restrictsCalls?: boolean
}

export type CallRestriction =
  | { kind: 'coordination'; note: string }
  | { kind: 'contact'; name: string; note: string }

export const restrictsCalls = (c: CallContact | null | undefined): boolean => c?.restrictsCalls === true

/** L'institution d'abord (par qui passer), puis le contact (sa note). */
export function callRestrictions(
  inst: { coordinationRequired?: boolean; coordinationNote?: string } | null,
  contact?: CallContact | null,
): CallRestriction[] {
  const out: CallRestriction[] = []
  if (inst?.coordinationRequired === true) out.push({ kind: 'coordination', note: (inst.coordinationNote ?? '').trim() })
  if (contact && restrictsCalls(contact)) out.push({ kind: 'contact', name: (contact.name ?? '').trim(), note: (contact.note ?? '').trim() })
  return out
}

export const isCallRestricted = (
  inst: { coordinationRequired?: boolean; coordinationNote?: string } | null,
  contact?: CallContact | null,
): boolean => callRestrictions(inst, contact).length > 0
