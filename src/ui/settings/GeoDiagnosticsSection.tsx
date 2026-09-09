import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton, Section } from '../components/primitives'
import {
  clearGeoDiag,
  geoDiagRows,
  geoDiagText,
  subscribeGeoDiag,
} from '../geoDiagnostics'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG7 (2026-09-09) — LA MESURE, LISIBLE PAR CELUI QUI SE PLAINT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★ CET ÉCRAN EXISTE PARCE QUE LA QUESTION D'AG7 NE PEUT PAS ÊTRE TRANCHÉE
 *    AUTREMENT. Trois passes ont répondu au PO par une explication — « iOS
 *    n'accorde une permission durable qu'à une app installée » — et il répond,
 *    à juste titre, que son app EST installée. Aucun des deux camps ne peut
 *    avoir raison par argument : il faut la mesure, elle ne peut être prise que
 *    sur SON appareil, et elle doit donc être quelque part où il peut la
 *    regarder.
 *
 * ★ TROIS COLONNES, ET CHACUNE ÉLIMINE UNE HYPOTHÈSE — le détail de ce que
 *   chacune veut dire est dans `geoDiagnostics.ts`. Ce qui est ici est la
 *   lecture : une ligne par lancement, la plus récente en haut, et deux
 *   boutons — copier, effacer.
 *
 * ⚠️ ET LE BOUTON « COPIER » N'ENVOIE RIEN NULLE PART. Il met le texte dans le
 *    presse-papiers de son iPad ; c'est lui qui décide de me l'envoyer. Un
 *    diagnostic qui se téléverserait tout seul serait un autre genre de
 *    programme, et il n'aurait pas été demandé.
 */
export function GeoDiagnosticsSection() {
  const { t } = useTranslation()
  const rows = useSyncExternalStore(subscribeGeoDiag, geoDiagRows, geoDiagRows)

  return (
    <Section
      title={t('geoDiag.title')}
      collapseKey="settings-geo-diag"
      defaultOpen={false}
      summary={rows.length > 0 ? String(rows.length) : undefined}
    >
      <p className="muted">{t('geoDiag.hint')}</p>

      {rows.length === 0 ? (
        <p className="muted mt-2" data-testid="geo-diag-empty">
          {t('geoDiag.none')}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5" data-testid="geo-diag-rows">
          {[...rows].reverse().map((row) => (
            <li
              key={row.at}
              data-testid="geo-diag-row"
              data-standalone={row.standalone ? '1' : '0'}
              data-permission={row.permission}
              data-prompts={String(row.prompts)}
              className="flex flex-wrap items-center gap-2 rounded-field bg-surface-high px-3 py-2"
            >
              <span className="ltr-nums muted shrink-0" dir="ltr">
                {new Date(row.at).toLocaleString()}
              </span>
              <span
                className={`chip ${
                  row.standalone
                    ? 'bg-status-success/15 text-status-success-ink'
                    : 'bg-status-warn/15 text-status-warn-ink'
                }`}
              >
                {t(row.standalone ? 'geoDiag.standalone' : 'geoDiag.browser')}
              </span>
              <span className="chip bg-content-muted/15 text-content-muted" dir="ltr">
                {t('geoDiag.permission')}: {row.permission}
              </span>
              <span className="chip bg-content-muted/15 text-content-muted" dir="ltr">
                {t('geoDiag.prompts')}: {row.prompts}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={geoDiagText()} label={t('geoDiag.copy')} />
        <button
          type="button"
          data-testid="geo-diag-clear"
          className="btn-secondary"
          onClick={clearGeoDiag}
        >
          {t('geoDiag.clear')}
        </button>
      </div>
    </Section>
  )
}
