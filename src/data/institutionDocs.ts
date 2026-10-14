import {
  INSTITUTION_DOCS_BUCKET,
  institutionDocPath,
  institutionDocVersionPath,
  institutionDocVersionsFolder,
  publicDocUrl,
  sortVersions,
} from '@core/institutionDoc'

import { SUPABASE_CONFIGURED, SUPABASE_URL } from './config'
import { listObjects, uploadObject } from './storage'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BG (2026-10-14) — OÙ VIT LE DOCUMENT D'UNE INSTITUTION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le bucket PUBLIC `institution-docs` (migration `20261014000100`) :
 *
 *   <id>/document.pdf                   la DERNIÈRE version, écrasée à chaque
 *                                       génération — l'adresse qu'on envoie ;
 *   <id>/versions/AAAAMMJJ-HHMMSS.pdf   chaque génération, gardée à côté.
 *
 * La version horodatée est écrite D'ABORD : si la seconde écriture échoue, on
 * a une version de plus et un lien qui montre encore la précédente — jamais un
 * lien neuf sans sa trace.
 *
 * ★ LE JUMEAU DE DÉMONSTRATION N'A PAS DE SUPABASE : les fichiers y vivent dans
 *   la mémoire de la page (des `blob:`), le temps de la session. L'écran le dit
 *   (`hosted === 'memory'`) : un lien `blob:` ne s'envoie à personne.
 */

export type DocHosting = 'public' | 'memory'

export interface DocVersion {
  name: string
  at: Date
  url: string
}

export interface PublishedDoc {
  /** L'adresse stable (la dernière version). */
  url: string
  version: DocVersion
}

export const DOC_HOSTING: DocHosting = SUPABASE_CONFIGURED ? 'public' : 'memory'

/** L'adresse stable d'une institution, même avant toute génération. */
export function stableDocUrl(institutionId: string): string | null {
  if (DOC_HOSTING === 'public') return publicDocUrl(SUPABASE_URL, institutionDocPath(institutionId))
  return memory.get(institutionDocPath(institutionId))?.url ?? null
}

// --- La mémoire du jumeau --------------------------------------------------------

const memory = new Map<string, { url: string; blob: Blob }>()

function putMemory(path: string, blob: Blob): string {
  const prev = memory.get(path)
  if (prev) URL.revokeObjectURL(prev.url)
  const url = URL.createObjectURL(blob)
  memory.set(path, { url, blob })
  return url
}

// --- Publier, lister ----------------------------------------------------------------

export async function publishInstitutionDoc(institutionId: string, file: Blob, at: Date = new Date()): Promise<PublishedDoc> {
  const versionPath = institutionDocVersionPath(institutionId, at)
  const latestPath = institutionDocPath(institutionId)
  const name = versionPath.split('/').pop() as string
  if (DOC_HOSTING === 'memory') {
    const versionUrl = putMemory(versionPath, file)
    const url = putMemory(latestPath, file)
    return { url, version: { name, at, url: versionUrl } }
  }
  await uploadObject(INSTITUTION_DOCS_BUCKET, versionPath, file, 'application/pdf')
  await uploadObject(INSTITUTION_DOCS_BUCKET, latestPath, file, 'application/pdf')
  return {
    url: publicDocUrl(SUPABASE_URL, latestPath),
    version: { name, at, url: publicDocUrl(SUPABASE_URL, versionPath) },
  }
}

/** Les versions d'une institution, la plus récente d'abord. */
export async function listInstitutionDocVersions(institutionId: string): Promise<DocVersion[]> {
  const folder = institutionDocVersionsFolder(institutionId)
  if (DOC_HOSTING === 'memory') {
    const names = [...memory.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1))
    return sortVersions(names).map((v) => ({ ...v, url: memory.get(`${folder}/${v.name}`)?.url ?? '' }))
  }
  const objects = await listObjects(INSTITUTION_DOCS_BUCKET, folder)
  return sortVersions(objects.map((o) => o.name)).map((v) => ({ ...v, url: publicDocUrl(SUPABASE_URL, `${folder}/${v.name}`) }))
}
