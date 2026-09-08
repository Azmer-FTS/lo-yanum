import type { Agreement, Farm } from '@core/types'

import { SUPABASE_CONFIGURED } from '../../data/config'
import { agreementPdf } from './artzenu'
import { agreementPageInput } from './input'
import type { Translate } from './input'
import {
  AGREEMENTS_BUCKET,
  listObjects,
  removeObjects,
  signedUrl,
  uploadObject,
} from '../../data/storage'
import type { StoredObject } from '../../data/storage'
import { stampAgreement } from './sign'

/**
 * ORDRE DE NUIT 2026-09-02 (N2) — WHICH PDF IS "THE AGREEMENT".
 *
 * Until the association uploads its own contract there is a PLACEHOLDER — one
 * Hebrew page, clearly marked as such, checked into `public/` so it exists in
 * demo mode, offline, and on the frozen /poc alike. The day the real contract
 * is uploaded from הגדרות it lands in the private `agreements` bucket under
 * ONE fixed key, and every entity's "view / download / share" resolves to it
 * instead. Nothing on an entity changes: the row keeps its file name, its
 * signer and its date; only the bytes behind the three buttons do.
 *
 * ★ ONE KEY, NOT ONE PER ENTITY. The programme has one contract text; what
 *   differs per farm is the signature (P3.3), which is stored on the
 *   `agreements` ROW and — W8, 2026-09-02 — IS NOW DRAWN ONTO THIS DOCUMENT
 *   on the way out (`sign.ts`). A per-entity copy in the bucket would still
 *   be twenty copies of the same PDF waiting to be out of date: the text is
 *   one file, the signature is applied per entity at the moment the bytes
 *   are handed to the viewer, the download or the share sheet.
 *
 * ★ THE KEY'S FIRST SEGMENT IS `template`, which no entity id ever is. The
 *   storage read policy for farmers asks for an agreement row whose entity is
 *   that segment, so a farmer's login resolves NOTHING here — correct, since
 *   the contract he signs reaches him on paper or through the coordinator's
 *   share sheet, never as a bucket read. The coordinator reads it through the
 *   `for all` write policy.
 */
export const TEMPLATE_FOLDER = 'template'
export const TEMPLATE_KEY = `${TEMPLATE_FOLDER}/agreement.pdf`

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF1.3 (2026-09-09) — « generated » REMPLACE « placeholder », ET C'EST LA
 *    FIN D'UNE ATTENTE DE SEPT JOURS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La note ci-dessus dit « tant que l'association n'a pas téléversé SON contrat,
 * il y a un ESPACE RÉSERVÉ ». Elle ne l'a pas téléversé, et le PO a fourni à la
 * place la capture de son formulaire — ce qui est mieux : le document est
 * désormais PRODUIT, avec les valeurs de la fiche dedans, plutôt que téléversé
 * vide et rempli à la main.
 *
 * L'ordre de résolution, et chaque cran a sa raison :
 *
 *   1. `template`  — le PDF téléversé depuis הגדרות, s'il y en a un. Le jour
 *                    où l'association envoie sa propre version signée par son
 *                    juriste, elle gagne : c'est son papier, pas le nôtre. La
 *                    signature y est tamponnée comme avant (`sign.ts`).
 *   2. `generated` — « הסכם התנדבות- ארצנו » dessiné par `artzenu.ts` avec les
 *                    quatre cases de la fiche, le logo, le texte du gabarit et
 *                    l'encre. C'est ce qui sort aujourd'hui.
 *
 * ⚠️ `placeholder` N'EST PLUS UN CAS. `public/mock-agreement.pdf` reste dans
 *    l'arbre parce que `AgreementTemplateSection` s'en sert comme exemple à
 *    montrer, mais aucune fiche ne le produit plus.
 */
export type DocumentSource = 'template' | 'placeholder' | 'generated'

export interface AgreementDocument {
  url: string
  source: DocumentSource
}

/** The placeholder, resolved against the app's base so the PWA finds it. */
export function placeholderUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}mock-agreement.pdf`, window.location.href).toString()
}

let resolved: Promise<AgreementDocument> | null = null

/**
 * Where the agreement PDF is right now. Memoised: the answer changes only
 * when הגדרות uploads or removes the template, and both call `forget()`.
 */
export function agreementDocument(): Promise<AgreementDocument> {
  resolved ??= (async (): Promise<AgreementDocument> => {
    if (SUPABASE_CONFIGURED) {
      const url = await signedUrl(AGREEMENTS_BUCKET, TEMPLATE_KEY).catch(() => null)
      if (url) return { url, source: 'template' }
    }
    /* Plus de bytes à aller chercher : `fetchAgreementFile` dessine. L'URL
       reste celle de l'exemple pour que הגדרות ait quelque chose à montrer. */
    return { url: placeholderUrl(), source: 'generated' }
  })()
  return resolved
}

export function forgetAgreementDocument(): void {
  resolved = null
}

/** The uploaded template, if there is one — for הגדרות to describe. */
export async function templateInfo(): Promise<StoredObject | null> {
  if (!SUPABASE_CONFIGURED) return null
  const objects = await listObjects(AGREEMENTS_BUCKET, TEMPLATE_FOLDER)
  return objects.find((o) => `${TEMPLATE_FOLDER}/${o.name}` === TEMPLATE_KEY) ?? null
}

export async function uploadTemplate(file: File): Promise<void> {
  await uploadObject(AGREEMENTS_BUCKET, TEMPLATE_KEY, file, 'application/pdf')
  forgetAgreementDocument()
}

export async function removeTemplate(): Promise<void> {
  await removeObjects(AGREEMENTS_BUCKET, [TEMPLATE_KEY])
  forgetAgreementDocument()
}

/**
 * Le document d'une fiche, prêt à être lu, téléchargé ou partagé.
 *
 * ★ UN SEUL POINT DE SORTIE POUR LES TROIS BOUTONS, comme avant : l'aperçu, le
 *   téléchargement et la feuille de partage tiennent le MÊME objet, donc ce
 *   qu'un agriculteur reçoit par WhatsApp est octet pour octet ce que le
 *   coordinateur vient de regarder.
 */
export async function fetchAgreementFile(
  fileName: string,
  context: {
    farm: Farm
    agreement: Agreement
    t: Translate
    locale: string
  },
): Promise<File> {
  const doc = await agreementDocument()

  /* 2 — rien n'a été téléversé : on PRODUIT le formulaire de l'association. */
  if (doc.source !== 'template') {
    return await agreementPdf(
      agreementPageInput(context.farm, context.agreement, context.t, context.locale),
      fileName,
    )
  }

  /* 1 — le PDF de l'association, tamponné de l'encre comme depuis W8. */
  const response = await fetch(doc.url)
  if (!response.ok) throw new Error(`agreement: ${response.status}`)
  if (!context.agreement.signature) {
    const blob = await response.blob()
    return new File([blob], fileName, { type: 'application/pdf' })
  }
  const stamped = await stampAgreement(
    await response.arrayBuffer(),
    context.agreement,
    context.farm.farmName || context.farm.name,
    context.t,
    context.locale,
  )
  return new File([stamped], fileName, { type: 'application/pdf' })
}
