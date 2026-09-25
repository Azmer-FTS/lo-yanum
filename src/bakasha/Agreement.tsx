import { useEffect, useState } from 'react'

import {
  parseAgreementBlocks,
  renderAgreementTemplate,
  richRuns,
} from '@core/agreementTemplate'
import type { AidRequestDraft } from '@core/request'

import { loadAgreementTemplate } from './api'
import shipped from './agreementShipped'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AP3.5 (2026-09-25) — LE MÊME TEXTE QUE DANS L'APPLICATION, UNE SEULE
 *    SOURCE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le même texte que “הסכם התנדבות- ארצנו”, lu du gabarit modifiable des
 *     réglages — une seule source, comme en AH5. »
 *
 * ★★ ET « UNE SEULE SOURCE » A DEUX MOITIÉS, PARCE QUE LE GABARIT EN A DEUX.
 *
 *    · LE TEXTE LIVRÉ vit dans `src/locales/he.json`, sous
 *      `settings.agreementDoc.defaultTemplate` — le même fichier que lit
 *      l'application. `agreementShipped.ts` l'en extrait à la compilation ;
 *      il n'est pas recopié à la main, et une porte vérifie qu'il n'a pas
 *      dérivé (A255bis).
 *    · LA SURCHARGE DU PO vit dans `user_settings` en base. La page la demande
 *      par `public_agreement_template()`, qui n'extrait QUE cette clé-là.
 *
 * ⚠️ LE RENDU EST CELUI DE L'APPLICATION, PAS UN SECOND.
 *    `renderAgreementTemplate`, `parseAgreementBlocks` et `richRuns` sont les
 *    fonctions d'AH5 et d'AK3, importées telles quelles. Ce fichier ne sait
 *    donc rien de ce qu'est un `{{jeton}}` ni de ce que font deux astérisques :
 *    le jour où l'association ajoute une clause avec du gras, elle apparaît
 *    ici sans que personne ait touché à cette page.
 *
 * ⚠️ SI LA BASE NE RÉPOND PAS, C'EST LE TEXTE LIVRÉ QUI S'AFFICHE, ET C'EST
 *    LA BONNE RÉPONSE. Un écran d'accord vide ferait abandonner ; et tant que
 *    le PO n'a rien modifié, le texte livré EST le gabarit en vigueur.
 */
export function Agreement({ draft }: { draft: AidRequestDraft }) {
  const [template, setTemplate] = useState<string>(shipped)

  useEffect(() => {
    let alive = true
    void loadAgreementTemplate()
      .then((remote) => {
        if (alive && remote !== null) setTemplate(remote)
      })
      .catch(() => {
        /* Le texte livré reste affiché. Voir l'en-tête. */
      })
    return () => {
      alive = false
    }
  }, [])

  const today = new Date()
  const rendered = renderAgreementTemplate(template, {
    'שם_החקלאי': draft.fullName.trim(),
    'תז_חפ': draft.idNumber.trim(),
    'נייד': draft.phone.trim(),
    'שם_החווה': draft.farmName.trim(),
    'יישוב': draft.locality.trim(),
    'שנה': String(today.getFullYear()),
    'תאריך_חתימה': today.toLocaleDateString('he-IL'),
  })

  return (
    <div className="az-agreement" data-testid="agreement" tabIndex={0}>
      {parseAgreementBlocks(rendered).map((block, i) => {
        if (block.kind === 'blank') return <div key={i} style={{ height: 10 }} />
        if (block.kind === 'title')
          return (
            <h2 key={i} style={{ fontSize: 20, fontWeight: 600, margin: '0 0 10px' }}>
              {block.text}
            </h2>
          )
        if (block.kind === 'heading')
          return (
            <h3 key={i} style={{ fontSize: 18, fontWeight: 600, margin: '14px 0 6px' }}>
              {block.text}
            </h3>
          )
        return (
          <p key={i} style={{ margin: '0 0 4px' }}>
            {richRuns(block.text).map((run, j) =>
              run.bold ? <strong key={j}>{run.text}</strong> : <span key={j}>{run.text}</span>,
            )}
          </p>
        )
      })}
    </div>
  )
}
