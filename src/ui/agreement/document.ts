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
 * ★★ AF1.3 (2026-09-09) — « generated » REMPLACE « placeholder ».
 * ★★ AH4 (2026-09-09) — ET L'EXEMPLE EST SUPPRIMÉ, PAS SEULEMENT CONTOURNÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AF1.3 avait laissé `public/mock-agreement.pdf` dans l'arbre « parce que
 * `AgreementTemplateSection` s'en sert comme exemple à montrer ». Le PO a
 * regardé cet exemple et a tranché : « c'est une IMAGE générée autrefois pour
 * montrer un rendu, elle ne porte aucun texte exploitable et n'a AUCUN rapport
 * avec le document que signent les agriculteurs ».
 *
 * ★★ ET C'ÉTAIT PIRE QU'INUTILE : le bouton « צפייה במסמך הנוכחי » des réglages
 *    ouvrait CE fichier, donc l'écran qui prétend dire quel document sera
 *    montré à l'agriculteur en montrait un autre. Un aperçu qui n'est pas le
 *    document est la seule chose plus coûteuse qu'une absence d'aperçu.
 *
 * L'ordre de résolution, et chaque cran a sa raison :
 *
 *   1. `template`  — le PDF téléversé depuis הגדרות, s'il y en a un. Le jour
 *                    où l'association envoie sa propre version signée par son
 *                    juriste, elle gagne : c'est son papier, pas le nôtre. La
 *                    signature y est tamponnée comme avant (`sign.ts`).
 *   2. `generated` — le document du gabarit d'AH5, dessiné par `artzenu.ts`
 *                    avec les valeurs de la fiche, le logo réglé et l'encre.
 *                    C'est ce qui sort aujourd'hui, et l'aperçu des réglages
 *                    est LE MÊME dessin.
 */
export type DocumentSource = 'template' | 'generated'

export interface AgreementDocument {
  /** `null` quand le document est DESSINÉ : il n'y a pas de fichier derrière. */
  url: string | null
  source: DocumentSource
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
    /* ★ AH4 — PLUS D'URL DU TOUT DANS CE CAS. Il n'y a pas de fichier derrière
       un document dessiné à la demande, et rendre l'URL d'un autre fichier
       « pour que les réglages aient quelque chose à montrer » est précisément
       ce que le PO a trouvé et fait retirer. Ce qui montre le document, c'est
       le document. */
    return { url: null, source: 'generated' }
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
  if (doc.url === null) throw new Error('agreement: template without a url')
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
