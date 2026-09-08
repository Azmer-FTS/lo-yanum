import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ASSOCIATION_COLUMNS,
  PROSPECTION_COLUMNS,
  associationExportMatrix,
  associationCounts,
  associationInputs,
  farmRegion,
  getVisibleFarms,
  prospectionExportMatrix,
  regions,
  signedFarms,
} from '@core/index'
import type { AssociationReport, Farm, RegionId } from '@core/index'

import { Icon } from '../../components/Icon'
import { Callout, PageHeader, Section } from '../../components/primitives'
import { downloadCsv, downloadMatrix } from '../../report/download'
import { useCoreValue } from '../../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AB6.6 (2026-09-08) — L'ÉCRAN D'EXPORT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le PO choisit le format (prospection ou association), le périmètre
 *     (toutes les fermes, une région, les signées seulement), et voit un
 *     aperçu des premières lignes avant de télécharger. »
 *
 * ★ THE PREVIEW IS THE REAL MATRIX, not a sample built for the screen. What is
 *   drawn in the table is `matrix.slice(1, 6)` of the very array the two
 *   download buttons write — so "it looked right on screen and came out wrong"
 *   cannot happen, because there is one array.
 *
 * ★ AND THE REPORT IS PART OF THE EXPORT, NOT A DEBUG PANEL. Three of the
 *   product owner's rules produce a statement rather than a value — a column
 *   this app does not hold, a definition this app had to choose, a coordinate
 *   pair that would have gone out in the wrong order — and every one of them
 *   is a thing he has to be able to tell the association. They are printed
 *   under the preview, in Hebrew, before anything is downloaded.
 */

type Format = 'prospection' | 'association'
type Scope = 'all' | 'region' | 'signed'

export function ExportScreen() {
  const { t } = useTranslation()
  const farms = useCoreValue(getVisibleFarms)

  const [format, setFormat] = useState<Format>('association')
  const [scope, setScope] = useState<Scope>('all')
  const [region, setRegion] = useState<RegionId | ''>('')

  const inScope: Farm[] = useMemo(() => {
    if (scope === 'signed') return signedFarms(farms)
    if (scope === 'region' && region !== '') {
      return farms.filter((f) => farmRegion(f) === region)
    }
    return [...farms]
  }, [farms, scope, region])

  /**
   * ⚠️ THE ASSOCIATION MATRIX AND ITS REPORT COME OUT OF ONE CALL. The blanks
   *    are a property of the rows that were actually written — « this column
   *    is empty on every row of THIS export » — not of the format, so they
   *    cannot be computed from the column list alone.
   */
  const built = useMemo(() => {
    if (format === 'prospection') {
      return {
        /* AC4.6 — « כמות מתנדבים קבועים » is a column of the 32 and it is
           counted from the guards; `core/prospection.ts` is pure and takes
           the counter rather than reaching for the store. */
        matrix: prospectionExportMatrix(inScope, (farm) => associationCounts(farm.id).regulars),
        widths: PROSPECTION_COLUMNS.map((c) => c.width ?? 16),
        sheet: 'רשימה',
        file: 'lo-yanum-prospection',
        report: null as AssociationReport | null,
      }
    }
    const { matrix, report } = associationExportMatrix(associationInputs(inScope))
    return {
      matrix,
      widths: ASSOCIATION_COLUMNS.map((c) => c.width ?? 16),
      sheet: 'נתונים',
      file: 'lo-yanum-association',
      report,
    }
  }, [format, inScope])

  const header = built.matrix[0] ?? []
  const preview = built.matrix.slice(1, 6)

  const pill = (on: boolean, label: string, onClick: () => void, testId: string) => (
    <button
      key={testId}
      type="button"
      onClick={onClick}
      aria-pressed={on}
      data-testid={testId}
      className={`filter-pill px-3 ${on ? 'filter-pill-active' : ''}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t('export.title')}
        subtitle={t('export.subtitle')}
        back={{ to: '/coordinator/farms', label: t('farms.title') }}
      />

      <Section title={t('export.format')} flush>
        <div className="pill-row" data-testid="export-format">
          {pill(format === 'association', t('export.formatAssociation'), () => setFormat('association'), 'export-format-association')}
          {pill(format === 'prospection', t('export.formatProspection'), () => setFormat('prospection'), 'export-format-prospection')}
        </div>

        <p className="label mt-4">{t('export.scope')}</p>
        <div className="pill-row" data-testid="export-scope">
          {pill(scope === 'all', t('export.scopeAll'), () => setScope('all'), 'export-scope-all')}
          {pill(scope === 'region', t('export.scopeRegion'), () => setScope('region'), 'export-scope-region')}
          {pill(scope === 'signed', t('export.scopeSigned'), () => setScope('signed'), 'export-scope-signed')}
        </div>
        {scope === 'region' && (
          <select
            className="input mt-2 w-full max-w-xs"
            data-testid="export-region"
            value={region}
            onChange={(e) => setRegion(e.target.value as RegionId | '')}
          >
            <option value="">{t('farms.regionAll')}</option>
            {regions().map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary"
            data-testid="export-xlsx"
            disabled={preview.length === 0}
            onClick={() =>
              downloadMatrix(built.matrix, built.widths, built.sheet, `${built.file}.xlsx`)
            }
          >
            <Icon name="download" size={16} />
            {t('export.downloadXlsx')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-testid="export-csv"
            disabled={preview.length === 0}
            onClick={() => downloadCsv(built.matrix, `${built.file}.csv`)}
          >
            <Icon name="download" size={16} />
            {t('export.downloadCsv')}
          </button>
          <span className="numeric muted ms-auto" data-testid="export-rows">
            {t('export.rows', { count: built.matrix.length - 1 })}
          </span>
        </div>
      </Section>

      <Section
        title={t('export.preview', { count: preview.length })}
        className="mt-6"
        padded={false}
      >
        {preview.length === 0 ? (
          <p className="muted p-4">{t('export.previewEmpty')}</p>
        ) : (
          /* The table is wider than any panel; it scrolls inside its own box
             rather than making the page scroll sideways. */
          <div className="overflow-x-auto" data-testid="export-preview">
            <table className="w-max min-w-full text-start text-micro">
              <thead>
                <tr className="border-b border-edge-subtle">
                  {header.map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      data-export-header={h}
                      className="whitespace-nowrap px-2.5 py-2 text-start font-semibold text-content-secondary"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b border-edge-subtle/60">
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        /* ⚠️ `dir="ltr"` ON THE CELLS THAT CARRY NUMBERS, AND IT
                           IS NOT CosMETIC. In an RTL paragraph « (052) 000-0001 »
                           is laid out as « (052) 0001-000 » — the groups are
                           reversed on screen while the FILE is correct, which
                           is the worst of both: a preview that says the export
                           is wrong when it is right. The rule follows the
                           column's own format, so a Hebrew name stays RTL. */
                        dir={
                          format === 'association' &&
                          ASSOCIATION_COLUMNS[j] &&
                          ASSOCIATION_COLUMNS[j].format !== 'text'
                            ? 'ltr'
                            : undefined
                        }
                        className="max-w-56 truncate px-2.5 py-1.5 text-content-primary"
                        title={cell}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {built.report && (
        /* ⚠️ THE TEST ID IS ON A WRAPPER AND NOT ON `Section`. TypeScript lets
           a `data-*` attribute through on any component, and `Section` does
           not forward it — so a gate addressing it would time out looking for
           an element that was never rendered. */
        <div data-testid="export-report">
        <Section title={t('export.reportTitle')} className="mt-6">
          {built.report.badCoordinates.length === 0 ? (
            <p className="text-caption text-status-success-ink" data-testid="export-coords-ok">
              <Icon name="check" size={14} /> {t('export.coordsOk')}
            </p>
          ) : (
            <Callout tone="danger" title={t('export.badCoords')}>
              <ul data-testid="export-bad-coords">
                {built.report.badCoordinates.map((row) => (
                  <li key={row.name} className="ltr-nums">
                    {row.name} — {row.text}
                  </li>
                ))}
              </ul>
            </Callout>
          )}

          {built.report.blanks.length > 0 && (
            <div className="mt-3">
              <p className="label">{t('export.blankTitle')}</p>
              <ul className="flex flex-col gap-1" data-testid="export-blanks">
                {built.report.blanks.map((b) => (
                  <li key={b.header} className="text-caption text-content-secondary">
                    {t(
                      b.reason === 'notStored'
                        ? 'export.blankNotStored'
                        : 'export.blankNoData',
                      { header: b.header, ours: b.ours },
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <p className="label">{t('export.definitions')}</p>
            <ul className="flex flex-col gap-1 text-caption text-content-secondary">
              {/* AC4.7 — les définitions d'AB restent affichées, confirmées
                  par le PO ; celle de שטחים שמירה est renversée par AC3. */}
              <li>{t('export.defVolunteering')}</li>
              <li>{t('export.defRegulars')}</li>
              <li>{t('export.defGuards')}</li>
              <li>{t('export.defGuarded')}</li>
            </ul>
          </div>

          {/* AB6.3 — the correspondence table, printed. It is the same array
              the export reads; a coordinator asked « which of my fields fills
              their column » can answer it here rather than from the source. */}
          <div className="mt-4">
            <p className="label">{t('export.mapping')}</p>
            <ul className="flex flex-col gap-0.5" data-testid="export-mapping">
              {ASSOCIATION_COLUMNS.map((c, i) => (
                <li
                  key={`${c.header}-${i}`}
                  className="text-micro text-content-secondary"
                >
                  {t('export.mappingRow', { header: c.header, ours: c.ours })}
                </li>
              ))}
            </ul>
          </div>
        </Section>
        </div>
      )}
    </div>
  )
}
