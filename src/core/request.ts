/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AP (2026-09-25) — CE QU'UN AGRICULTEUR ENVOIE QUAND IL DEMANDE DE L'AIDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La forme de la demande, ce qui bloque, ce qui ne bloque pas, et les bornes
 * des fichiers. PUR : aucun DOM, aucun réseau. La page publique l'emploie pour
 * décider quoi griser ; la base REFAIT la même vérification de son côté, parce
 * qu'une validation de navigateur n'est pas une protection (AP4.4).
 *
 * ⚠️ CE QUI BLOQUE EST LA LISTE LA PLUS COURTE POSSIBLE, ET C'EST LA DÉCISION
 *    D'AM1 REPRISE TELLE QUELLE : « seuls bloquent un nom, et un numéro ou un
 *    courriel TAPÉ mais impossible ». Ici s'ajoute le נייד — le brief le dit
 *    obligatoire, et sans lui il n'y a personne à rappeler, donc pas de demande.
 *    Tout le reste passe. Un écran de trop est un abandon ; un champ obligatoire
 *    de trop est un écran de trop.
 */

import type { ExpectedDocumentId } from './documents'
import type { FarmType } from './types'

/** Ce que l'agriculteur cherche — étape 1. */
export type AidNeed = 'guarding' | 'farm_work' | 'both'

export const AID_NEEDS: readonly AidNeed[] = ['guarding', 'farm_work', 'both'] as const

/** Ce qu'il a sur sa terre — étape 2. Décide des documents de l'étape 4. */
export type LandKind = 'crops' | 'grazing' | 'both'

export const LAND_KINDS: readonly LandKind[] = ['crops', 'grazing', 'both'] as const

/**
 * ★★ LE CHOIX DE L'ÉTAPE 2 EST LE `farm_type` DE LA FICHE, ET C'EST CE QUI
 *    BRANCHE LA DEMANDE SUR AG6 SANS RIEN RÉÉCRIRE.
 *
 * `expectedDocuments(farmTypeOf(landKind))` rend donc exactement la liste que
 * l'application attend déjà d'une fiche : un papier pour les cultures, un pour
 * le pâturage, les deux pour les deux. Une seconde table de correspondance
 * aurait pu diverger ; celle-ci ne le peut pas, elle n'en est pas une.
 */
export function farmTypeOf(kind: LandKind): FarmType {
  switch (kind) {
    case 'crops':
      return 'agriculture'
    case 'grazing':
      return 'livestock'
    case 'both':
      return 'mixed'
  }
}

/** Un document déposé — même forme que `ProvidedDocument` côté application. */
export interface RequestDocument {
  id: ExpectedDocumentId
  /** Le nom du fichier déposé, ou celui que la page a composé. */
  fileName: string
  /** `data:application/pdf;base64,…` */
  file: string
  /** Nombre de pages quand il a été composé depuis des photos (AG6.2). */
  pages?: number
}

export interface AidRequestDraft {
  need: AidNeed | null
  landKind: LandKind | null
  farmName: string
  fullName: string
  /** ת״ז ou ח״פ. TEXTE : un zéro de tête est une donnée, pas un artefact. */
  idNumber: string
  phone: string
  /** FACULTATIF, et c'est écrit dans le brief. */
  email: string
  locality: string
  documents: RequestDocument[]
  /** PNG en URL de données, ou `null` tant qu'il n'a pas signé. */
  signature: string | null
  /** ISO du créneau choisi, ou `null` s'il préfère ne pas choisir maintenant. */
  appointmentAt: string | null
  appointmentEndAt: string | null
}

export function emptyAidRequest(): AidRequestDraft {
  return {
    need: null,
    landKind: null,
    farmName: '',
    fullName: '',
    idNumber: '',
    phone: '',
    email: '',
    locality: '',
    documents: [],
    signature: null,
    appointmentAt: null,
    appointmentEndAt: null,
  }
}

// ---------------------------------------------------------------------------
// Les bornes des fichiers (AP4.4)
// ---------------------------------------------------------------------------

/**
 * ★★ LE DOCUMENT VOYAGE EN `data:application/pdf;base64,…`, COMME DANS L'APP.
 *
 * ⚠️ ET NON DANS UN SEAU DE STOCKAGE, CE QUI ÉTAIT LE PREMIER DESSIN. La
 *    raison est `ProvidedDocument.file` (core/types.ts) : l'application STOCKE
 *    DÉJÀ ses documents sous cette forme, et AG6.2 l'a choisie exprès pour
 *    qu'un PDF traverse le cache IndexedDB, la file d'envoi hors ligne et la
 *    sérialisation JSON du magasin sans qu'aucun des trois n'ait à connaître
 *    un système de fichiers. Un seau aurait créé un SECOND endroit où vit un
 *    document — et une fiche dont le papier est ailleurs est une fiche que le
 *    PO ne peut pas lire dans un champ sans réseau.
 *
 * ⚠️ LE PLAFOND EST DONC APPLIQUÉ EN SQL, PAS ICI. Une borne de navigateur
 *    n'est pas une protection : `submit_aid_request` refait la mesure
 *    (`octet_length`) et refuse. Ces constantes servent à REFUSER TÔT et à le
 *    DIRE — pas à protéger la base. `bun run appass` compare les deux nombres.
 */
export const MAX_PICKED_BYTES = 12 * 1024 * 1024

/**
 * Le PDF composé, une fois en base64. Trois pages photographiées par un
 * téléphone récent et encodées à 0,92 pèsent de 0,6 à 2 Mo ; 8 Mio laisse de
 * la marge sans qu'une demande puisse à elle seule gonfler la table.
 *
 * ⚠️ CE NOMBRE EST ÉCRIT DEUX FOIS — ici et dans
 *    `supabase/migrations/20260925000200_aid_requests.sql`. Ils DOIVENT être
 *    égaux, et une porte le vérifie plutôt qu'un commentaire.
 */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024

/** Deux documents au plus : il n'existe que `crops` et `grazing` (AG6). */
export const MAX_DOCUMENTS = 2

/**
 * Ce qu'on accepte de l'appareil. Les PDF partent tels quels ; les images sont
 * composées en PDF avant de partir, donc **ce qui arrive en base est toujours
 * un PDF** — et c'est le préfixe que le SQL exige.
 */
export const ALLOWED_PICK_TYPES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

export const PDF_DATA_URL_PREFIX = 'data:application/pdf;base64,'

export type PickRefusal = 'too_big' | 'wrong_type'

/** Pourquoi ce fichier est refusé, ou `null` s'il est accepté. */
export function refusePick(file: { type: string; size: number }): PickRefusal | null {
  /* ⚠️ LA TAILLE D'ABORD. Un fichier de 200 Mo au mauvais type doit s'entendre
     dire « trop gros » : c'est le reproche qu'il pourra corriger. */
  if (file.size > MAX_PICKED_BYTES) return 'too_big'
  /* ⚠️ UN TYPE VIDE N'EST PAS UN TYPE INTERDIT. Android rend parfois `''` pour
     une photo prise à l'instant ; la refuser fermerait la porte au cas
     principal. */
  if (file.type === '') return null
  if (!ALLOWED_PICK_TYPES.includes(file.type.toLowerCase())) return 'wrong_type'
  return null
}

/** Ce que la base refusera : mesuré sur la chaîne qui part vraiment. */
export function refuseDocument(dataUrl: string): PickRefusal | null {
  if (!dataUrl.startsWith(PDF_DATA_URL_PREFIX)) return 'wrong_type'
  if (base64Bytes(dataUrl.slice(PDF_DATA_URL_PREFIX.length)) > MAX_DOCUMENT_BYTES)
    return 'too_big'
  return null
}

/** Combien d'octets pèse ce base64, sans le décoder. */
export function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

// ---------------------------------------------------------------------------
// Ce qui bloque
// ---------------------------------------------------------------------------

export type RequestField = 'need' | 'landKind' | 'farmName' | 'fullName' | 'phone' | 'email'

/** Un numéro israélien plausible : 9 ou 10 chiffres commençant par 0. */
export function phoneIsPossible(raw: string): boolean {
  const d = raw.replace(/\D/g, '').replace(/^972/, '0')
  return /^0[2-9]\d{7,8}$/.test(d)
}

/**
 * ⚠️ VOLONTAIREMENT LARGE. Le rôle de ce test est d'attraper « michel@ » et
 *    « michel.gmail.com », pas de départager les RFC. Un courriel FACULTATIF
 *    refusé à tort coûte la demande entière.
 */
export function emailIsPossible(raw: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(raw.trim())
}

/**
 * ★★ LE ת״ז EST DU TEXTE, ET IL N'EST JAMAIS REFUSÉ.
 *
 * ⚠️ C'EST LA DÉCISION D'AO1 REPRISE : « aucune validation, aucun refus ; zéro
 *    initial tenu ». Un agriculteur qui tape huit chiffres a peut-être un
 *    vieux numéro, un ח״פ, ou s'est trompé — le PO le verra. Refuser à l'écran
 *    ferait perdre la demande pour une raison que la page ne sait pas juger.
 */
export function idNumberValue(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 9)
}

export interface RequestProblem {
  field: RequestField
  reason: 'missing' | 'impossible'
}

/**
 * Ce qui empêche d'envoyer, dans l'ordre des étapes — la page envoie le lecteur
 * sur la PREMIÈRE, ce qui n'a de sens que si la liste est ordonnée.
 */
export function aidRequestProblems(draft: AidRequestDraft): RequestProblem[] {
  const out: RequestProblem[] = []
  if (draft.need === null) out.push({ field: 'need', reason: 'missing' })
  if (draft.landKind === null) out.push({ field: 'landKind', reason: 'missing' })
  if (draft.farmName.trim() === '') out.push({ field: 'farmName', reason: 'missing' })
  if (draft.fullName.trim() === '') out.push({ field: 'fullName', reason: 'missing' })
  if (draft.phone.trim() === '') out.push({ field: 'phone', reason: 'missing' })
  else if (!phoneIsPossible(draft.phone)) out.push({ field: 'phone', reason: 'impossible' })
  /* ⚠️ LE COURRIEL N'EST REPROCHÉ QUE S'IL A ÉTÉ TAPÉ. Vide, il est valide. */
  if (draft.email.trim() !== '' && !emailIsPossible(draft.email))
    out.push({ field: 'email', reason: 'impossible' })
  return out
}

export function canSubmit(draft: AidRequestDraft): boolean {
  return aidRequestProblems(draft).length === 0
}

// ---------------------------------------------------------------------------
// Les étapes
// ---------------------------------------------------------------------------

/**
 * ★★ SEPT ÉTAPES, UNE QUESTION PAR ÉCRAN, ET LA LISTE EST ICI PARCE QUE LA
 *    BARRE DE PROGRESSION ET LA NAVIGATION DOIVENT EN CONNAÎTRE LA MÊME.
 */
export const REQUEST_STEPS = [
  'need',
  'land',
  'who',
  'documents',
  'agreement',
  'appointment',
  'done',
] as const

export type RequestStep = (typeof REQUEST_STEPS)[number]

/** Les étapes qu'on a le droit de sauter, et pourquoi elles le sont. */
export const SKIPPABLE_STEPS: readonly RequestStep[] = [
  /* AP3.4 — « quelqu'un qui n'a pas ses papiers sous la main ne doit pas
     abandonner ». Une demande sans document vaut mieux que pas de demande. */
  'documents',
  /* AP3.6 — « s'il préfère ne pas choisir maintenant, il peut passer ». */
  'appointment',
]

/**
 * Où en est la barre : l'étape `done` n'en fait pas partie, c'est l'arrivée.
 * Rendue en pourcentage pour que la page n'ait aucune arithmétique à écrire.
 *
 * ⚠️ L'ÉTAPE COURANTE EST COMPTÉE COMME FAITE (`index + 1`), ET C'EST UNE
 *    CORRECTION D'APRÈS CAPTURE. Avec `index`, la première étape affichait
 *    0 % — une barre vide, que le lecteur lit comme « la page n'a pas
 *    chargé », pas comme « tu commences ». Et le compteur à côté dit déjà
 *    « שלב 1 מתוך 6 » : les deux doivent raconter la même chose.
 */
export function stepProgress(step: RequestStep): number {
  const total = REQUEST_STEPS.length - 1
  const index = Math.min(REQUEST_STEPS.indexOf(step) + 1, total)
  return Math.round((index / total) * 100)
}
