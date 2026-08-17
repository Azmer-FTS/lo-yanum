import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  IMPORT_FIELDS,
  analyseImport,
  getVolunteers,
  guessField,
  importVolunteers,
  sampleCsv,
  toVolunteerDrafts,
} from '@core/index'
import type { ImportField, ParsedRow } from '@core/index'

import { Icon } from '../../components/Icon'
import { SelectField } from '../../components/fields'
import { LoadMore } from '../../components/primitives'
import { useProgressive } from '../../hooks/useProgressive'
import {
  Callout,
  EmptyState,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

type Step = 'upload' | 'mapping' | 'preview' | 'done'

const STEPS: Step[] = ['upload', 'mapping', 'preview', 'done']

function StepBar({ current }: { current: Step }) {
  const { t } = useTranslation()
  const index = STEPS.indexOf(current)

  return (
    <ol className="mb-5 flex items-center gap-2">
      {STEPS.map((step, i) => {
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
            {/* Four Hebrew labels do not fit at 390 px — below `sm` only the
                current step is named, the rest are numbered circles. */}
            <span
              className={`truncate text-caption ${
                active
                  ? 'font-medium text-content-primary'
                  : 'hidden text-content-muted sm:inline'
              }`}
            >
              {t(`import.step${step[0].toUpperCase()}${step.slice(1)}`)}
            </span>
            {i < STEPS.length - 1 && (
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

/**
 * R5.4 — CSV / XLSX import wizard.
 *
 * The file is parsed entirely client-side with SheetJS; nothing leaves the
 * browser. All validation lives in @core/import so the same rules can run
 * server-side in Lot 1 unchanged.
 */
export function ImportWizardScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const volunteers = useCoreValue(getVolunteers)

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [matrix, setMatrix] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ImportField[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(
    null,
  )

  const inputRef = useRef<HTMLInputElement | null>(null)

  const yeshivot = useMemo(
    () => [...new Set(volunteers.map((v) => v.yeshiva))].sort(),
    [volunteers],
  )

  const readFile = async (file: File) => {
    setError(null)
    try {
      // SheetJS is ~450 kB and only ever needed once a file is actually
      // dropped, so it is fetched on demand rather than shipped to every
      // volunteer's phone in the main bundle.
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const book = XLSX.read(buffer, { type: 'array' })
      const sheet = book.Sheets[book.SheetNames[0]]
      if (!sheet) {
        setError(t('import.emptyFile'))
        return
      }

      // `header: 1` gives a raw matrix; `defval: ''` keeps blank cells aligned
      // so a missing value never shifts the whole row one column left.
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

      setFileName(file.name)
      setHeaders(head)
      setMatrix(body)
      setMapping(head.map(guessField))
      setStep('mapping')
    } catch {
      setError(t('import.parseError'))
    }
  }

  const analysis = useMemo(
    () =>
      step === 'preview' || step === 'done'
        ? analyseImport(matrix, mapping, volunteers)
        : null,
    [step, matrix, mapping, volunteers],
  )

  // Hooks cannot be conditional, so this runs with an empty list until the
  // preview step produces one — which is also why `useProgressive` resets on
  // length rather than on identity.
  const preview = useProgressive(analysis?.rows ?? [])

  const canMap =
    mapping.includes('name') && mapping.includes('phone')

  const downloadTemplate = () => {
    const csv = sampleCsv([
      t('import.fieldName'),
      t('import.fieldPhone'),
      t('import.fieldYeshiva'),
      t('import.fieldLocality'),
      t('import.fieldAge'),
      t('import.fieldPhoneType'),
    ])
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'lo-yanum-volunteers-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const runImport = () => {
    if (!analysis) return
    const drafts = toVolunteerDrafts(analysis.importable, {
      yeshiva: yeshivot[0] ?? '',
      locality: '',
    })
    const imported = importVolunteers(drafts)
    setResult({ imported, skipped: analysis.rejected.length })
    setStep('done')
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('import.title')}
        subtitle={t('import.subtitle')}
        back={{ to: '/coordinator/volunteers', label: t('volunteers.title') }}
      />

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
            <p className="text-heading text-content-primary">
              {t('import.dropzone')}
            </p>
            <p className="muted">{t('import.dropzoneHint')}</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
              e.target.value = ''
            }}
          />

          <button
            type="button"
            onClick={downloadTemplate}
            className="btn-secondary mt-4 w-full sm:w-auto"
          >
            <Icon name="download" size={15} />
            {t('import.downloadTemplate')}
          </button>
        </Section>
      )}

      {step === 'mapping' && (
        <Section title={t('import.stepMapping')}>
          <p className="muted mb-1">
            {t('import.fileLoaded', { rows: matrix.length, file: fileName })}
          </p>
          <p className="muted mb-4">{t('import.mappingHint')}</p>

          <div className="grid gap-3 md:grid-cols-2">
            {headers.map((header, i) => (
              <div
                key={`${header}-${i}`}
                className="rounded-field border border-edge-subtle bg-surface-high p-3"
              >
                <p className="mb-1 text-micro text-content-muted">
                  {t('import.detectedColumn')}
                </p>
                <p className="mb-2 truncate text-caption font-medium text-content-primary">
                  {header || `#${i + 1}`}
                </p>
                <SelectField<ImportField>
                  label={t('import.targetField')}
                  value={mapping[i] ?? 'ignore'}
                  onChange={(v) =>
                    setMapping((prev) => prev.map((m, j) => (j === i ? v : m)))
                  }
                  options={IMPORT_FIELDS.map((f) => ({
                    value: f,
                    label:
                      f === 'ignore'
                        ? t('import.ignore')
                        : t(`import.field${f[0].toUpperCase()}${f.slice(1)}`),
                  }))}
                />
                {/* Sample value, so a mis-mapped column is obvious here rather
                    than three steps later in the preview table. */}
                {matrix[0]?.[i] && (
                  <p className="mt-1.5 truncate text-micro text-content-muted">
                    {matrix[0][i]}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!canMap && (
            <div className="mt-4">
              <Callout tone="warn" title={t('import.mapAtLeast')} />
            </div>
          )}

          <div className="mt-5 flex justify-between gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep('upload')}
            >
              {t('common.previous')}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canMap}
              onClick={() => setStep('preview')}
            >
              {t('common.next')}
            </button>
          </div>
        </Section>
      )}

      {step === 'preview' && analysis && (
        <Section title={t('import.stepPreview')}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="chip bg-status-success/15 text-status-success-ink">
              {t('import.willImport')}
              <span className="numeric">{analysis.importable.length}</span>
            </span>
            <span className="chip bg-status-danger/15 text-status-danger-ink">
              {t('import.willSkip')}
              <span className="numeric">{analysis.rejected.length}</span>
            </span>
            <span className="muted">{t('import.previewHint')}</span>
          </div>

          {/* F5.5 / A30 — an import is routinely 300 rows and this table used
              to render every one of them straight down the page, which put the
              wizard's own action bar thousands of pixels below the fold. It now
              lives in a box with a pinned header, and the rows arrive 20 at a
              time. */}
          <div className="table-scroll">
            <table className="w-full min-w-[44rem] border-collapse text-caption">
              <thead>
                <tr className="bg-surface-high/60 text-micro uppercase tracking-wide text-content-muted">
                  <th className="p-2 text-start font-semibold">
                    {t('import.rowNumber')}
                  </th>
                  <th className="p-2 text-start font-semibold">
                    {t('import.fieldName')}
                  </th>
                  <th className="p-2 text-start font-semibold">
                    {t('import.fieldPhone')}
                  </th>
                  <th className="p-2 text-start font-semibold">
                    {t('import.fieldYeshiva')}
                  </th>
                  <th className="p-2 text-start font-semibold">
                    {t('import.fieldLocality')}
                  </th>
                  <th className="p-2 text-start font-semibold">
                    {t('import.problems')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.visible.map((row) => (
                  <PreviewRow key={row.rowNumber} row={row} />
                ))}
              </tbody>
            </table>
          </div>
          <LoadMore
            shown={preview.shown}
            total={preview.total}
            onMore={preview.more}
          />

          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep('mapping')}
            >
              {t('common.previous')}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={analysis.importable.length === 0}
              onClick={runImport}
            >
              {t('import.confirmImport', { count: analysis.importable.length })}
            </button>
          </div>
        </Section>
      )}

      {step === 'done' && result && (
        <Section>
          <EmptyState
            icon="check"
            title={t('import.successTitle')}
            hint={t('import.successBody', {
              imported: result.imported,
              skipped: result.skipped,
            })}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setStep('upload')
                    setResult(null)
                    setMatrix([])
                    setHeaders([])
                    setFileName('')
                  }}
                >
                  {t('import.importAnother')}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate('/coordinator/volunteers')}
                >
                  {t('import.backToList')}
                </button>
              </div>
            }
          />
        </Section>
      )}
    </div>
  )
}

function PreviewRow({ row }: { row: ParsedRow }) {
  const { t } = useTranslation()
  const bad = row.problems.length > 0

  return (
    <tr
      className={`border-t border-edge-subtle/60 ${
        bad ? 'bg-status-danger/10' : ''
      }`}
    >
      <td className="numeric p-2 text-content-muted">{row.rowNumber}</td>
      <td className="p-2 text-content-primary">{row.name || '—'}</td>
      <td className="ltr-nums p-2 text-content-secondary">{row.phone || '—'}</td>
      <td className="p-2 text-content-secondary">{row.yeshiva || '—'}</td>
      <td className="p-2 text-content-secondary">{row.locality || '—'}</td>
      <td className="p-2">
        {bad ? (
          <span className="flex flex-wrap gap-1">
            {row.problems.map((p) => (
              <span key={p} className="chip bg-status-danger/20 text-status-danger-ink">
                <Icon name="alert" size={11} />
                {t(`import.${p}`)}
              </span>
            ))}
          </span>
        ) : (
          <span className="chip bg-status-success/15 text-status-success-ink">
            <Icon name="check" size={11} />
            {t('import.noProblems')}
          </span>
        )}
      </td>
    </tr>
  )
}
