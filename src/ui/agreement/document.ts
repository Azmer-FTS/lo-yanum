import { SUPABASE_CONFIGURED } from '../../data/config'
import {
  AGREEMENTS_BUCKET,
  listObjects,
  removeObjects,
  signedUrl,
  uploadObject,
} from '../../data/storage'
import type { StoredObject } from '../../data/storage'

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
 *   `agreements` ROW and will be drawn onto this document when that unit
 *   lands. A per-entity copy today would be twenty copies of the same PDF
 *   waiting to be out of date.
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

export type DocumentSource = 'template' | 'placeholder'

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
    return { url: placeholderUrl(), source: 'placeholder' }
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
 * The bytes, as a `File` named the way the entity's row names it — so the
 * share sheet, the download and the viewer all hold the SAME object and a
 * signed URL never has to leave the app in a link.
 */
export async function fetchAgreementFile(fileName: string): Promise<File> {
  const doc = await agreementDocument()
  const response = await fetch(doc.url)
  if (!response.ok) throw new Error(`agreement: ${response.status}`)
  const blob = await response.blob()
  return new File([blob], fileName, { type: 'application/pdf' })
}
