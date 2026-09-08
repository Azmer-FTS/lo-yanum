import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ASSOCIATION_COLUMNS,
  HOME_BASE,
  PROSPECTION_COLUMNS,
  SIGNATURE_COLUMNS,
  analyseAssociation,
  analyseProspection,
  analyseSignatures,
  applyAssociation,
  applyProspection,
  applySignatures,
  associationExportMatrix,
  associationCounts,
  associationInputs,
  associationSignatures,
  guessAssociationMapping,
  getVisibleFarms,
  guessProspectionField,
  guessSignatureField,
  normaliseValue,
  prospectionExportMatrix,
  requiredSignatureFields,
  signatureExportMatrix,
  signatureImageOf,
  signedFarms,
} from '@core/index'
import type {
  AssociationField,
  ProspectionField,
  ProspectionPlan,
  SignatureField,
  SignaturePlan,
} from '@core/index'

import { Icon } from '../../components/Icon'
import { SelectField } from '../../components/fields'
import { ImportTabs } from '../../components/importTabs'
import type { SheetKind } from '../../components/importTabs'
import { Callout, EmptyState, PageHeader, Section } from '../../components/primitives'
import { downloadMatrix } from '../../report/download'
import { useCoreValue } from '../../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AA4 · AA5 (2026-09-07) — LES DEUX FICHIERS QUI VIENNENT DE L'EXTÉRIEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The roster wizard (`ImportWizardScreen`, G10) imports lists this programme
 * owns. These two imports are different in kind and that is why they are a
 * different screen rather than two more tabs inside it:
 *
 *   · the prospection workbook is RE-IMPORTED, weekly, and its whole contract
 *     is « update, never duplicate » — so its preview has to say what will
 *     CHANGE, not what will be added;
 *   · the consents file arrives from somebody else's form builder, so its
 *     column names are not ours and its mapping has to be remembered.
 *
 * A single component with two pipelines inside it would have had two of
 * everything and one name. What the two screens do share — the tab row, the
 * drop zone, the shape of the report — is shared as components.
 *
 * ★ EVERYTHING IS DECIDED IN @core. This file parses a workbook into a string
 *   matrix, renders a plan, and hands the plan back to the store. No rule about
 *   identity, blank cells, weighting or signature shapes lives here, which is
 *   what lets `bun run prospection` and `bun run signatures` prove them all
 *   with no browser at all.
 */

type Step = 'upload' | 'mapping' | 'preview' | 'done'

/** AA5.6 — the remembered mapping, per kind, per header. */
const MAPPING_KEY = (kind: SheetKind) => `lo-yanum:sheet-mapping:${kind}`

/**
 * ★★ AA5.6 — « MÉMORISER CE MAPPING POUR LES IMPORTS SUIVANTS. »
 *
 * ⚠️ KEYED ON THE NORMALISED HEADER, NOT ON THE COLUMN INDEX. The association's
 *    export will one day gain a column, or lose one, and a mapping remembered
 *    by position would then apply every answer to the wrong column — silently,
 *    on a file of signatures. Keyed by the header text it survives a column
 *    being inserted anywhere.
 */
function readRemembered(kind: SheetKind): Record<string, string> {
  try {
    const raw = localStorage.getItem(MAPPING_KEY(kind))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function remember(kind: SheetKind, headers: string[], mapping: string[]): void {
  try {
    const map: Record<string, string> = {}
    headers.forEach((header, i) => {
      const key = normaliseValue(header)
      if (key !== '' && mapping[i] && mapping[i] !== 'ignore') map[key] = mapping[i]
    })
    localStorage.setItem(MAPPING_KEY(kind), JSON.stringify(map))
  } catch {
    /* A browser with no storage still imports; it just does not remember. */
  }
}

function forget(kind: SheetKind): void {
  try {
    localStorage.removeItem(MAPPING_KEY(kind))
  } catch {
    /* nothing to do */
  }
}

function StepBar({ current }: { current: Step }) {
  const { t } = useTranslation()
  const steps: Step[] = ['upload', 'mapping', 'preview', 'done']
  const index = steps.indexOf(current)
  return (
    <ol className="mb-5 flex items-center gap-2">
      {steps.map((step, i) => {
        const done = i < index
        const active = i === index
        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-micro font-semibold transition-colors duration-base ${
                active
                  ? 'bg-accent text-content-on-accent'
                  : done
                    ? 'bg-status-success/20 text-status-success-ink'
                    : 'bg-surface-high text-content-muted'
              }`}
            >
              {done ? <Icon name="check" size={13} /> : i + 1}
            </span>
            <span
              className={`truncate text-caption ${
                active ? 'font-medium text-content-primary' : 'hidden text-content-muted sm:inline'
              }`}
            >
              {t(`import.step${step[0].toUpperCase()}${step.slice(1)}`)}
            </span>
            {i < steps.length - 1 && (
              <span
                className={`hidden h-px flex-1 sm:block ${
                  done ? 'bg-status-success/40' : 'bg-edge-subtle'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Three big numbers, the way the roster wizard states its own decision. */
function CountBand({
  counts,
}: {
  counts: Array<{ value: number; label: string; tone: string; testId?: string }>
}) {
  return (
    <div className="metric-band mb-3 rounded-card bg-surface-high p-4">
      {counts.map((c) => (
        <div key={c.label} className="min-w-0" data-testid={c.testId}>
          <p className={`numeric text-metric ${c.tone}`}>{c.value}</p>
          <p className="muted mt-0.5 leading-tight">{c.label}</p>
        </div>
      ))}
    </div>
  )
}

export function SheetImportScreen({ kind }: { kind: SheetKind }) {
  const { t } = useTranslation()
  const farms = useCoreValue(getVisibleFarms)

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [matrix, setMatrix] = useState<string[][]>([])
  const [mapping, setMapping] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [report, setReport] = useState<{
    created: number
    updated: number
    rejected: number
    unknown: number
    withoutSignature: number
  } | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)

  /**
   * ⚠️ THE ASSOCIATION'S LIST HAS TWO COLUMNS CALLED מיקום (AB6, trap 2), so
   *    its picker labels them by header AND by what they hold: two identical
   *    options in one `<select>` is a choice nobody can make.
   */
  const columns =
    kind === 'prospection'
      ? PROSPECTION_COLUMNS.map((c) => ({ field: c.field as string, header: c.header }))
      : kind === 'signatures'
        ? SIGNATURE_COLUMNS.map((c) => ({ field: c.field as string, header: c.header }))
        : ASSOCIATION_COLUMNS.map((c) => ({
            field: c.source as string,
            header: `${c.header} — ${c.ours}`,
          }))

  const fieldOptions = ['ignore', ...columns.map((c) => c.field)]
  const labelOf = (field: string): string =>
    field === 'ignore' ? t('import.ignore') : (columns.find((c) => c.field === field)?.header ?? field)

  const reset = () => {
    setStep('upload')
    setFileName('')
    setHeaders([])
    setMatrix([])
    setMapping([])
    setError(null)
    setReport(null)
  }

  const readFile = async (file: File) => {
    setError(null)
    try {
      // SheetJS is ~450 kB and only ever needed once a file is dropped.
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const book = XLSX.read(buffer, { type: 'array' })
      /**
       * ⚠️ THE SHEET IS « רשימה » WHEN THERE IS ONE, and the first otherwise.
       *    The association's workbook opens on its מקרא (legend) tab, so
       *    taking `SheetNames[0]` — which is what the roster wizard does, and
       *    is right for a file we generated — would read the instructions page
       *    and report « 0 rows ».
       */
      const name =
        book.SheetNames.find((n) => normaliseValue(n) === normaliseValue('רשימה')) ??
        book.SheetNames[0]
      const sheet = name ? book.Sheets[name] : undefined
      if (!sheet) {
        setError(t('import.emptyFile'))
        return
      }
      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        blankrows: false,
        defval: '',
        raw: false,
      })
      if (grid.length < 2) {
        setError(t('import.emptyFile'))
        return
      }
      const head = (grid[0] as unknown[]).map((c) => String(c ?? ''))
      const body = grid
        .slice(1)
        .map((r) => (r as unknown[]).map((c) => String(c ?? '')))
        .filter((r) => r.some((c) => c.trim() !== ''))

      /* AA5.6 — the remembered mapping wins over the guess, per header. */
      const saved = readRemembered(kind)
      const guessed =
        kind === 'association'
          ? (guessAssociationMapping(head) as string[])
          : head.map((h) =>
              kind === 'prospection' ? guessProspectionField(h) : guessSignatureField(h),
            )
      const merged = head.map((h, i) => saved[normaliseValue(h)] ?? guessed[i])

      setFileName(file.name)
      setHeaders(head)
      setMatrix(body)
      setMapping(merged)
      setStep('mapping')
    } catch {
      setError(t('import.parseError'))
    }
  }

  const analysis = useMemo(() => {
    if (step !== 'preview') return null
    if (kind === 'prospection') {
      return analyseProspection(headers, matrix, farms, mapping as ProspectionField[])
    }
    if (kind === 'association') {
      return analyseAssociation(headers, matrix, farms, mapping as AssociationField[])
    }
    return analyseSignatures(headers, matrix, farms, mapping as SignatureField[])
  }, [step, kind, headers, matrix, farms, mapping])

  const canMap =
    kind === 'prospection'
      ? mapping.includes('name')
      : kind === 'association'
        ? mapping.includes('placeName')
        : requiredSignatureFields().every((f) => mapping.includes(f))

  const run = () => {
    if (!analysis) return
    remember(kind, headers, mapping)
    if (kind === 'prospection') {
      const plan = analysis.plan as ProspectionPlan
      const applied = applyProspection(plan, HOME_BASE)
      setReport({
        created: applied.created,
        updated: applied.updated,
        rejected: plan.rejected.length,
        unknown: plan.unknown.length,
        withoutSignature: 0,
      })
    } else if (kind === 'association') {
      const plan = analysis.plan as ProspectionPlan
      const rows = (analysis as { rows: Parameters<typeof associationSignatures>[0] }).rows
      const applied = applyAssociation(
        plan,
        associationSignatures(rows),
        fileName,
        HOME_BASE,
      )
      setReport({
        created: applied.created,
        updated: applied.updated,
        rejected: plan.rejected.length,
        unknown: 0,
        withoutSignature: 0,
      })
    } else {
      const plan = analysis.plan as SignaturePlan
      const applied = applySignatures(plan, fileName, HOME_BASE)
      setReport({
        created: applied.created,
        updated: applied.attached,
        rejected: plan.rejected.length,
        unknown: 0,
        withoutSignature: applied.withoutSignature,
      })
    }
    setStep('done')
  }

  const exportSheet = () => {
    setError(null)
    try {
      if (kind === 'prospection') {
        downloadMatrix(
          /* AC4.6 — the regulars column, counted from this app's own guards. */
          prospectionExportMatrix(farms, (farm) => associationCounts(farm.id).regulars),
          PROSPECTION_COLUMNS.map((c) => c.width ?? 16),
          'רשימה',
          'lo-yanum-prospection.xlsx',
        )
      } else if (kind === 'association') {
        /* The screen with the scope, the preview and the export report is
           `/coordinator/export` (AB6.6); this button is the same matrix, for
           the coordinator who is already standing on the import. */
        downloadMatrix(
          associationExportMatrix(associationInputs(farms)).matrix,
          ASSOCIATION_COLUMNS.map((c) => c.width ?? 16),
          'נתונים',
          'lo-yanum-association.xlsx',
        )
      } else {
        downloadMatrix(
          signatureExportMatrix(farms, signatureImageOf),
          SIGNATURE_COLUMNS.map((c) => c.width ?? 16),
          'הסכמות',
          'lo-yanum-signatures.xlsx',
        )
      }
    } catch {
      setError(t('import.templateError'))
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t(`import.${kind}Title`)}
        subtitle={t(`import.${kind}Hint`)}
        back={{ to: '/coordinator/farms', label: t('farms.title') }}
      />

      <ImportTabs current={kind} onLeave={reset} />
      <StepBar current={step} />

      {error && (
        <div className="mb-4">
          <Callout tone="danger" title={error} />
        </div>
      )}

      {step === 'upload' && (
        <Section>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files[0]
              if (file) void readFile(file)
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            data-testid="sheet-dropzone"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed
                        px-6 py-16 text-center transition-all duration-base ease-out ${
                          dragging
                            ? 'border-accent bg-accent/10'
                            : 'border-edge-strong hover:border-accent/60 hover:bg-surface-high/50'
                        }`}
          >
            <span className="text-accent-ink">
              <Icon name="upload" size={34} />
            </span>
            <p className="text-heading text-content-primary">{t('import.dropzone')}</p>
            <p className="muted">{t('import.dropzoneHint')}</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            data-testid="sheet-file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
              e.target.value = ''
            }}
          />

          {/* AA4.10 · AA5.5 — the symmetric export, on the screen that reads
              the same columns back in. */}
          <button
            type="button"
            onClick={exportSheet}
            data-testid="sheet-export"
            className="btn-secondary mt-4 w-full sm:w-auto"
          >
            <Icon name="download" size={15} />
            {t(
              kind === 'prospection'
                ? 'import.exportProspection'
                : kind === 'association'
                  ? 'export.title'
                  : 'import.exportSignatures',
            )}
          </button>
          <p className="muted mt-2">
            {t('import.exportHint')}
            {kind === 'signatures' && ` · ${signedFarms(farms).length}`}
          </p>
        </Section>
      )}

      {step === 'mapping' && (
        <Section title={t('import.stepMapping')}>
          <p className="muted mb-1">
            {t('import.rowsRead', { rows: matrix.length, file: fileName })}
          </p>
          <p className="muted mb-4">{t('import.mappingHint')}</p>

          <div className="auto-cols gap-3 [--col-min:13rem]" data-testid="mapping-grid">
            {headers.map((header, i) => (
              <div
                key={`${header}-${i}`}
                className="rounded-field border border-edge-subtle bg-surface-high p-3"
              >
                <p className="mb-1 text-micro text-content-muted">{t('import.detectedColumn')}</p>
                <p className="mb-2 truncate text-caption font-medium text-content-primary">
                  {header || `#${i + 1}`}
                </p>
                <SelectField<string>
                  label={t('import.targetField')}
                  value={mapping[i] ?? 'ignore'}
                  onChange={(v) => setMapping((prev) => prev.map((m, j) => (j === i ? v : m)))}
                  options={fieldOptions.map((f) => ({ value: f, label: labelOf(f) }))}
                />
                {matrix[0]?.[i] && (
                  <p className="mt-1.5 truncate text-micro text-content-muted">
                    {matrix[0][i].slice(0, 60)}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!canMap && (
            <div className="mt-4">
              <Callout
                tone="warn"
                title={t('import.mapRequired', {
                  columns: (kind === 'signatures'
                    ? requiredSignatureFields().map((f) => labelOf(f))
                    : ['שם המקום']
                  ).join(' · '),
                })}
              />
            </div>
          )}

          <p className="muted mt-4">{t('import.mappingRemembered')}</p>

          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep('upload')}>
              {t('common.previous')}
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost"
                data-testid="mapping-forget"
                onClick={() => {
                  forget(kind)
                  setMapping(
                    kind === 'association'
                      ? (guessAssociationMapping(headers) as string[])
                      : headers.map((h) =>
                          kind === 'prospection'
                            ? guessProspectionField(h)
                            : guessSignatureField(h),
                        ),
                  )
                }}
              >
                {t('import.mappingReset')}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!canMap}
                data-testid="mapping-next"
                onClick={() => setStep('preview')}
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        </Section>
      )}

      {step === 'preview' && analysis && kind !== 'signatures' && (
        <ProspectionPreview
          plan={analysis.plan as ProspectionPlan}
          onBack={() => setStep('mapping')}
          onRun={run}
        />
      )}

      {step === 'preview' && analysis && kind === 'signatures' && (
        <SignaturesPreview
          plan={analysis.plan as SignaturePlan}
          onBack={() => setStep('mapping')}
          onRun={run}
        />
      )}

      {step === 'done' && report && (
        <Section title={t('import.reportTitle')}>
          <EmptyState
            icon="check"
            title={t('import.successTitle')}
            hint={[
              kind === 'prospection'
                ? t('import.reportCreated', { count: report.created })
                : t('import.reportCreated', { count: report.created }),
              kind === 'prospection'
                ? t('import.reportUpdated', { count: report.updated })
                : t('import.reportAttached', { count: report.updated }),
              t('import.reportRejected', { count: report.rejected }),
              report.unknown > 0 ? t('import.reportUnknown', { count: report.unknown }) : '',
              report.withoutSignature > 0
                ? t('import.reportNoSignature', { count: report.withoutSignature })
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
            action={
              <button type="button" className="btn-secondary" onClick={reset}>
                {t('import.importAnother')}
              </button>
            }
          />
        </Section>
      )}
    </div>
  )
}

/**
 * ★★ AA4.9 — « LE PO VOIT CE QUI SERA CRÉÉ ET MODIFIÉ », AND AA4.8 — « RIEN NE
 *    PASSE SILENCIEUSEMENT ».
 *
 * Three numbers and then the rows themselves, with the file's own line number
 * on every one — a rejection whose reason is stated but whose line is not is a
 * rejection the coordinator cannot act on in a 198-row sheet.
 *
 * ★ AN UPDATE THAT CHANGES NOTHING SAYS SO. On a weekly re-import most rows
 *   are identical, and a preview that listed 198 « updates » would drown the
 *   four that matter. « ללא שינוי » is the honest label for the rest.
 */
function ProspectionPreview({
  plan,
  onBack,
  onRun,
}: {
  plan: ProspectionPlan
  onBack: () => void
  onRun: () => void
}) {
  const { t } = useTranslation()
  const changing = plan.updated.filter((u) => u.changes.length > 0)

  return (
    <Section title={t('import.stepPreview')}>
      <CountBand
        counts={[
          {
            value: plan.created.length,
            label: t('import.willCreate'),
            tone: 'text-status-success-ink',
            testId: 'count-create',
          },
          {
            value: plan.updated.length,
            label: t('import.willUpdate'),
            tone: 'text-status-info-ink',
            testId: 'count-update',
          },
          {
            value: plan.rejected.length,
            label: t('import.willSkip'),
            tone: 'text-status-danger-ink',
            testId: 'count-reject',
          },
        ]}
      />

      {plan.unknown.length > 0 && (
        <div className="mb-3">
          <Callout tone="warn" title={t('import.unknownValues')}>
            <p className="mt-1 leading-snug">{t('import.unknownValuesHint')}</p>
            <ul className="mt-2 flex flex-col gap-0.5">
              {plan.unknown.slice(0, 12).map((u, i) => (
                <li key={`${u.rowNumber}-${u.header}-${i}`} className="text-micro">
                  <span className="numeric">{u.rowNumber}</span> · {u.header} · {u.value}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      )}

      <div className="table-scroll">
        <table className="w-full min-w-[40rem] border-collapse text-caption">
          <thead>
            <tr className="bg-surface-high/60 text-micro uppercase tracking-wide text-content-muted">
              <th className="p-2 text-start font-semibold">{t('import.rowNumber')}</th>
              <th className="p-2 text-start font-semibold">{t('import.fieldFarmName')}</th>
              <th className="p-2 text-start font-semibold">{t('import.colAction')}</th>
              <th className="p-2 text-start font-semibold">{t('import.colChanges')}</th>
            </tr>
          </thead>
          <tbody>
            {plan.rejected.map((row) => (
              <tr key={`r-${row.rowNumber}`} className="border-t border-edge-subtle/60 bg-status-danger/10">
                <td className="numeric p-2 text-content-muted">{row.rowNumber}</td>
                <td className="p-2 text-content-primary">{row.name || '—'}</td>
                <td className="p-2">
                  <span className="chip bg-status-danger/20 text-status-danger-ink">
                    {t('import.actionReject')}
                  </span>
                </td>
                <td className="p-2 text-content-secondary">
                  {row.problems
                    .map((p) =>
                      p === 'errMissingName'
                        ? t('import.errMissingName')
                        : p === 'errBadCoordinates'
                          ? t('import.errMissingCoords')
                          : t('import.errDuplicateRow'),
                    )
                    .join(' · ')}
                </td>
              </tr>
            ))}
            {plan.created.slice(0, 40).map((entry) => (
              <tr key={`c-${entry.row.rowNumber}`} className="border-t border-edge-subtle/60">
                <td className="numeric p-2 text-content-muted">{entry.row.rowNumber}</td>
                <td className="p-2 text-content-primary">{entry.row.name}</td>
                <td className="p-2">
                  <span className="chip bg-status-success/15 text-status-success-ink">
                    {t('import.actionCreate')}
                  </span>
                </td>
                <td className="p-2 text-content-secondary">
                  {entry.row.warnings.includes('warnNoPosition') ? t('import.warnNoPosition') : ''}
                </td>
              </tr>
            ))}
            {changing.slice(0, 40).map((entry) => (
              <tr key={`u-${entry.row.rowNumber}`} className="border-t border-edge-subtle/60">
                <td className="numeric p-2 text-content-muted">{entry.row.rowNumber}</td>
                <td className="p-2 text-content-primary">{entry.row.name}</td>
                <td className="p-2">
                  <span className="chip bg-status-info/15 text-status-info-ink">
                    {t('import.actionUpdate')}
                  </span>
                </td>
                <td className="p-2 text-content-secondary">{entry.changes.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {changing.length === 0 && plan.updated.length > 0 && (
        <p className="muted mt-2">
          {t('import.noChange')} · {plan.updated.length}
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <button type="button" className="btn-secondary" onClick={onBack}>
          {t('common.previous')}
        </button>
        <button
          type="button"
          className="btn-primary"
          data-testid="sheet-confirm"
          disabled={plan.created.length === 0 && plan.updated.length === 0}
          onClick={onRun}
        >
          {t('import.confirmImport', { count: plan.created.length + plan.updated.length })}
        </button>
      </div>
    </Section>
  )
}

/** AA5 — the same preview, for a file whose rows are signatures. */
function SignaturesPreview({
  plan,
  onBack,
  onRun,
}: {
  plan: SignaturePlan
  onBack: () => void
  onRun: () => void
}) {
  const { t } = useTranslation()
  const SHAPE: Record<string, string> = {
    dataUri: t('import.shapeDataUri'),
    url: t('import.shapeUrl'),
    points: t('import.shapePoints'),
    unknown: t('import.shapeUnknown'),
    empty: t('import.shapeEmpty'),
  }

  return (
    <Section title={t('import.stepPreview')}>
      <CountBand
        counts={[
          {
            value: plan.attached.length,
            label: t('import.willAttach'),
            tone: 'text-status-info-ink',
            testId: 'count-attach',
          },
          {
            value: plan.created.length,
            label: t('import.willCreate'),
            tone: 'text-status-success-ink',
            testId: 'count-create',
          },
          {
            value: plan.rejected.length,
            label: t('import.willSkip'),
            tone: 'text-status-danger-ink',
            testId: 'count-reject',
          },
        ]}
      />

      {plan.unreadable.length > 0 && (
        <div className="mb-3">
          <Callout tone="warn" title={t('import.reportNoSignature', { count: plan.unreadable.length })}>
            <ul className="mt-2 flex flex-col gap-0.5">
              {plan.unreadable.slice(0, 12).map((row) => (
                <li key={row.rowNumber} className="text-micro">
                  <span className="numeric">{row.rowNumber}</span> · {row.name} ·{' '}
                  {SHAPE[row.signatureShape]}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      )}

      <div className="table-scroll">
        <table className="w-full min-w-[40rem] border-collapse text-caption">
          <thead>
            <tr className="bg-surface-high/60 text-micro uppercase tracking-wide text-content-muted">
              <th className="p-2 text-start font-semibold">{t('import.rowNumber')}</th>
              <th className="p-2 text-start font-semibold">{t('import.fieldFarmName')}</th>
              <th className="p-2 text-start font-semibold">{t('import.colAction')}</th>
              <th className="p-2 text-start font-semibold">{t('import.signatureShape')}</th>
            </tr>
          </thead>
          <tbody>
            {[...plan.attached, ...plan.created].slice(0, 60).map((entry) => (
              <tr key={`${entry.row.rowNumber}`} className="border-t border-edge-subtle/60">
                <td className="numeric p-2 text-content-muted">{entry.row.rowNumber}</td>
                <td className="p-2 text-content-primary">{entry.row.name}</td>
                <td className="p-2">
                  <span
                    className={`chip ${
                      entry.farmId
                        ? 'bg-status-info/15 text-status-info-ink'
                        : 'bg-status-success/15 text-status-success-ink'
                    }`}
                  >
                    {entry.farmId ? t('import.actionAttach') : t('import.actionCreate')}
                  </span>
                </td>
                <td className="p-2 text-content-secondary">
                  <span className="flex items-center gap-2">
                    {entry.row.signature && (
                      <img
                        src={entry.row.signature}
                        alt=""
                        className="h-6 w-16 object-contain"
                      />
                    )}
                    {SHAPE[entry.row.signatureShape]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <button type="button" className="btn-secondary" onClick={onBack}>
          {t('common.previous')}
        </button>
        <button
          type="button"
          className="btn-primary"
          data-testid="sheet-confirm"
          disabled={plan.attached.length + plan.created.length === 0}
          onClick={onRun}
        >
          {t('import.confirmImport', {
            count: plan.attached.length + plan.created.length,
          })}
        </button>
      </div>
    </Section>
  )
}
