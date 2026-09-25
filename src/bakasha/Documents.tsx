import { useRef, useState } from 'react'

import { expectedDocuments } from '@core/documents'
import type { ExpectedDocumentId } from '@core/documents'
import {
  MAX_PICKED_BYTES,
  farmTypeOf,
  refuseDocument,
  refusePick,
} from '@core/request'
import type { LandKind, RequestDocument } from '@core/request'

import { T } from './text'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AP3.4 (2026-09-25) — LES DOCUMENTS, ET L'ÉTAPE EST FACULTATIVE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « ÉTAPE FACULTATIVE. Quelqu'un qui n'a pas ses papiers sous la main ne
 *     doit pas abandonner : il peut passer et les envoyer plus tard. Une
 *     demande sans document vaut mieux que pas de demande. »
 *
 * ★ LA LISTE SE DÉDUIT DE L'ÉTAPE 2, PAR `expectedDocuments` — LA FONCTION DE
 *   L'APPLICATION, PAS UNE COPIE. AG6 l'a écrite pour la fiche ; le choix de
 *   l'agriculteur est traduit en `FarmType` par `farmTypeOf`, et le reste
 *   suit. Une seconde table de correspondance aurait pu diverger, et le jour
 *   où elle diverge c'est l'agriculteur qui téléverse le mauvais papier.
 *
 * ★ ET LA COMPOSITION EST CELLE DE L'APPLICATION AUSSI (`photosToPdf`,
 *   AG6.2) : plusieurs photos deviennent un PDF d'une page par photo, chacune
 *   posée ENTIÈRE sur une A4 blanche. « Entière » est le point : sur la photo
 *   d'un document, les bords sont l'en-tête, le numéro de dossier et le
 *   tampon.
 *
 * ⚠️ L'IMPORT DE `ui/documents` EST PARESSEUX. Il tire le générateur de PDF ;
 *    un agriculteur qui passe l'étape ne doit pas l'avoir téléchargé.
 */
export function DocumentsStep({
  landKind,
  documents,
  onChange,
}: {
  landKind: LandKind
  documents: RequestDocument[]
  onChange: (next: RequestDocument[]) => void
}) {
  const wanted = expectedDocuments(farmTypeOf(landKind))
  return (
    <div data-testid="documents-step" data-expected={wanted.length}>
      {wanted.map((id) => (
        <DocumentCard
          key={id}
          id={id}
          provided={documents.find((d) => d.id === id) ?? null}
          onSet={(doc) =>
            onChange([...documents.filter((d) => d.id !== id), ...(doc ? [doc] : [])])
          }
        />
      ))}
    </div>
  )
}

function DocumentCard({
  id,
  provided,
  onSet,
}: {
  id: ExpectedDocumentId
  provided: RequestDocument | null
  onSet: (doc: RequestDocument | null) => void
}) {
  const photos = useRef<HTMLInputElement | null>(null)
  const pdf = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function take(files: FileList | null, kind: 'photos' | 'pdf') {
    setProblem(null)
    const list = files ? [...files] : []
    if (list.length === 0) return
    /* ⚠️ LE REFUS EST PRONONCÉ SUR LE PIRE FICHIER DE LA SÉLECTION, pas sur le
       premier : trois photos dont la deuxième est un film doivent dire
       « trop gros », pas composer deux pages et perdre la troisième. */
    for (const f of list) {
      const why = refusePick(f)
      if (why) {
        setProblem(why === 'too_big' ? T.err.tooBig : T.err.wrongType)
        return
      }
    }
    setBusy(true)
    try {
      let file: string
      let fileName: string
      let pages: number | undefined
      if (kind === 'pdf') {
        const { fileToDataUrl } = await import('../ui/documents')
        file = await fileToDataUrl(list[0])
        fileName = list[0].name
      } else {
        const { photosToPdf, fileToDataUrl } = await import('../ui/documents')
        const composed = await photosToPdf(list, `${id}.pdf`, {
          title: id,
          author: 'ארצנו',
        })
        file = await fileToDataUrl(composed)
        fileName = composed.name
        pages = list.length
      }
      const why = refuseDocument(file)
      if (why) {
        setProblem(why === 'too_big' ? T.err.tooBig : T.err.wrongType)
        return
      }
      onSet({ id, fileName, file, ...(pages === undefined ? {} : { pages }) })
    } catch {
      setProblem(T.err.generic)
    } finally {
      setBusy(false)
      /* Le champ est vidé pour que RE-choisir le même fichier déclenche bien
         un `change` — sinon un second essai après un refus ne fait rien. */
      if (photos.current) photos.current.value = ''
      if (pdf.current) pdf.current.value = ''
    }
  }

  return (
    <section className="az-doc" data-testid={`doc-${id}`} data-provided={provided ? 'yes' : 'no'}>
      <p className="az-doc-name">{T.doc[id]}</p>
      <p className={`az-doc-state${provided ? ' az-doc-done' : ''}`}>
        {busy ? T.docBuilding : provided ? T.docReady(provided.fileName) : T.docMissing}
      </p>
      {problem !== null && <p className="az-error">{problem}</p>}
      <div className="az-doc-actions">
        {provided === null ? (
          <>
            {/* ⚠️ `capture` N'EST PAS POSÉ, ET C'EST LA LEÇON D'AN9. Avec lui,
                iOS ouvre la caméra SANS proposer la photothèque — or un
                agriculteur a souvent déjà photographié son papier la semaine
                dernière. `accept="image/*"` sur un téléphone propose les deux. */}
            <input
              ref={photos}
              type="file"
              accept="image/*"
              multiple
              className="az-sr"
              data-testid={`doc-${id}-photos`}
              onChange={(e) => void take(e.target.files, 'photos')}
            />
            <input
              ref={pdf}
              type="file"
              accept="application/pdf"
              className="az-sr"
              data-testid={`doc-${id}-pdf`}
              onChange={(e) => void take(e.target.files, 'pdf')}
            />
            <button
              type="button"
              className="az-btn az-btn-quiet"
              disabled={busy}
              onClick={() => photos.current?.click()}
            >
              {T.docPhoto}
            </button>
            <button
              type="button"
              className="az-btn az-btn-quiet"
              disabled={busy}
              onClick={() => pdf.current?.click()}
            >
              {T.docFile}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="az-btn az-btn-quiet"
            data-testid={`doc-${id}-remove`}
            onClick={() => onSet(null)}
          >
            {T.docRemove}
          </button>
        )}
      </div>
      <p className="az-sr">{`עד ${Math.round(MAX_PICKED_BYTES / 1024 / 1024)} מגה לקובץ`}</p>
    </section>
  )
}
