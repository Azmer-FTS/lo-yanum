import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import {
  HOME_BASE,
  IMPORT_KINDS,
  IMPORT_TEMPLATES,
  analyseImport,
  fieldsFor,
  getDrivers,
  getVisibleFarms,
  getVolunteers,
  guessField,
  importDrivers,
  importFarms,
  importVolunteers,
  templateWorkbook,
  toDriverDrafts,
  toFarmDrafts,
  toVolunteerDrafts,
} from '@core/index'
import type { ImportField, ImportKind, ParsedRow } from '@core/index'

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
 * R5.4 → G10 — CSV / XLSX import wizard, for THREE rosters.
 *
 * The file is parsed entirely client-side with SheetJS; nothing leaves the
 * browser. All validation lives in @core/import and all COLUMNS in
 * @core/templates, so the same rules can run server-side in Lot 1 unchanged —
 * which P3.1 then does, by changing only where the drafts are written.
 *
 * The kind comes from the route (`/coordinator/import/:kind`), so the farms
 * list and the drivers roster can each send the coordinator straight to their
 * own template instead of to a picker he has to read.
 */
export function ImportWizardScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { kind: kindParam } = useParams<{ kind: string }>()
  const volunteers = useCoreValue(getVolunteers)
  const drivers = useCoreValue(getDrivers)
  const farms = useCoreValue(getVisibleFarms)

  const kind = ((IMPORT_KINDS as readonly string[]).includes(kindParam ?? '')
    ? kindParam
    : 'volunteers') as ImportKind

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

  const template = IMPORT_TEMPLATES[kind]

  /** Where the wizard sends the coordinator back, per roster. */
  const BACK: Record<ImportKind, { to: string; labelKey: string }> = {
    volunteers: { to: '/coordinator/volunteers', labelKey: 'volunteers.title' },
    farms: { to: '/coordinator/farms', labelKey: 'farms.title' },
    drivers: { to: '/coordinator/drivers', labelKey: 'driver.volunteerDrivers' },
  }
  const back = BACK[kind]

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
      setMapping(head.map((h) => guessField(h, kind)))
      setStep('mapping')
    } catch {
      setError(t('import.parseError'))
    }
  }

  const analysis = useMemo(
    () =>
      step === 'preview' || step === 'done'
        ? analyseImport(matrix, mapping, { volunteers, drivers, farms }, kind)
        : null,
    [step, matrix, mapping, volunteers, drivers, farms, kind],
  )

  // Hooks cannot be conditional, so this runs with an empty list until the
  // preview step produces one — which is also why `useProgressive` resets on
  // length rather than on identity.
  const preview = useProgressive(analysis?.rows ?? [])

  // G10 — the required set comes from the template, not from a hard-coded
  // pair: a farm has no phone of its own and would never pass the old check.
  const canMap = template.columns
    .filter((c) => c.required)
    .every((c) => mapping.includes(c.field))

  /**
   * G10 — THE TEMPLATE IS AN .xlsx, GENERATED FROM `templates.ts`.
   *
   * A CSV was the Lot 0 answer and it is the wrong file to hand a coordinator:
   * double-clicking one on a Hebrew Windows machine still produces mojibake
   * often enough to have cost an afternoon, the column widths are whatever
   * Excel guesses, and there is nowhere to put the three example rows without
   * them looking like data.
   *
   * P0bis.4 — AND IT IS BUILT HERE, NOT BY SheetJS. G10 asked for RTL with
   * `sheet['!views'] = [{ RTL: true }]`; unzipping the result shows the
   * community build writes `<sheetView workbookViewId="0"/>` and no cell
   * styles at all, so the file opened left-to-right with left-aligned Hebrew.
   * `@core/xlsx` writes the workbook directly — `rightToLeft="1"` on the
   * sheet AND the workbook view, `readingOrder="2"` on every cell, a frozen
   * header row and a formatted instructions sheet. It is pure, so
   * `bun run accept` checks the XML without a browser and `bun run rtl`
   * re-opens the real download.
   *
   * SheetJS stays for READING the file the coordinator uploads back, fetched
   * on demand: ~450 kB has no business in the bundle a volunteer's phone
   * loads.
   */
  const downloadTemplate = () => {
    setError(null)
    try {
      const bytes = templateWorkbook(kind, (key) => t(key))
      // `.slice()` hands Blob a plain ArrayBuffer: a Uint8Array's buffer is
      // typed `ArrayBufferLike`, which includes SharedArrayBuffer and is not
      // a BlobPart.
      const blob = new Blob([bytes.slice().buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${template.fileBase}-template.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Revoked on the next tick: revoking synchronously races the download in
      // WebKit, which reads the blob after the click handler returns.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch {
      setError(t('import.templateError'))
    }
  }

  const runImport = () => {
    if (!analysis) return
    const defaults = {
      yeshiva: yeshivot[0] ?? '',
      locality: '',
      // A farm whose position could not be read is parked on the programme's
      // own base rather than at 0°,0° in the Gulf of Guinea — it sits with the
      // others until somebody drags it, and its "מיקום חסר" badge says so.
      fallbackPosition: HOME_BASE,
    }
    const rows = analysis.importable
    const imported =
      kind === 'farms'
        ? importFarms(toFarmDrafts(rows, defaults))
        : kind === 'drivers'
          ? importDrivers(toDriverDrafts(rows, defaults))
          : importVolunteers(toVolunteerDrafts(rows, defaults))
    setResult({ imported, skipped: analysis.rejected.length })
    setStep('done')
  }

  // An unknown `:kind` is a mistyped URL, not a screen. Redirect rather than
  // render a wizard whose template nobody chose.
  if (kindParam !== undefined && kindParam !== kind) {
    return <Navigate to={`/coordinator/import/${kind}`} replace />
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('import.title')}
        subtitle={t(template.titleKey)}
        back={{ to: back.to, label: t(back.labelKey) }}
      />

      {/* G10 — the three templates are one tap apart. A coordinator who lands
          here from the volunteers list and realises he meant the farms sheet
          should not have to go back out through two screens. Switching resets
          the wizard: a mapping guessed for one template is meaningless
          against another's columns. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {IMPORT_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              if (k === kind) return
              setStep('upload')
              setResult(null)
              setMatrix([])
              setHeaders([])
              setMapping([])
              setFileName('')
              setError(null)
              navigate(`/coordinator/import/${k}`)
            }}
            aria-pressed={k === kind}
            className={`filter-pill min-h-11 px-3 ${k === kind ? 'filter-pill-active' : ''}`}
          >
            <Icon
              name={k === 'farms' ? 'farm' : k === 'drivers' ? 'steering' : 'users'}
              size={14}
            />
            {t(IMPORT_TEMPLATES[k].titleKey)}
          </button>
        ))}
      </div>

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
            onClick={() => void downloadTemplate()}
            className="btn-secondary mt-4 w-full sm:w-auto"
          >
            <Icon name="download" size={15} />
            {t('import.downloadTemplate')}
          </button>
          <p className="muted mt-2">
            {t('import.templateColumns', {
              columns: template.columns
                .map((c) => t(c.labelKey))
                .join(' · '),
            })}
          </p>
        </Section>
      )}

      {step === 'mapping' && (
        <Section title={t('import.stepMapping')}>
          <p className="muted mb-1">
            {t('import.fileLoaded', { rows: matrix.length, file: fileName })}
          </p>
          <p className="muted mb-4">{t('import.mappingHint')}</p>

          <div className="auto-cols gap-3 [--col-min:13rem]">
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
                  // G10 — only the fields THIS template has. Offering a
                  // farm's "סוג יישות" while mapping a driver sheet is an
                  // invitation to a mapping that silently imports nothing.
                  options={fieldsFor(kind).map((f) => ({
                    value: f,
                    label:
                      f === 'ignore'
                        ? t('import.ignore')
                        : t(
                            template.columns.find((c) => c.field === f)
                              ?.labelKey ?? 'import.ignore',
                          ),
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
              <Callout
                tone="warn"
                title={t('import.mapRequired', {
                  columns: template.columns
                    .filter((c) => c.required)
                    .map((c) => t(c.labelKey))
                    .join(' · '),
                })}
              />
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
          {/* P0bis.3a — THE THREE COUNTS ARE THE DECISION, so they are read
              as numbers rather than as three chips in a row of prose. "412
              will import, 6 will be skipped, 11 need a pin" is the whole
              question this screen asks, and it was set at chip size.
              G10 — the warned rows are counted APART from the rejects because
              the coordinator does something different about them: he imports,
              then drops the pins. */}
          <div className="metric-band mb-3 rounded-card bg-surface-high p-4">
            <div className="min-w-0">
              <p className="numeric text-metric text-status-success-ink">
                {analysis.importable.length}
              </p>
              <p className="muted mt-0.5 leading-tight">
                {t('import.willImport')}
              </p>
            </div>
            <div className="min-w-0">
              <p className="numeric text-metric text-status-danger-ink">
                {analysis.rejected.length}
              </p>
              <p className="muted mt-0.5 leading-tight">
                {t('import.willSkip')}
              </p>
            </div>
            {analysis.warned.length > 0 && (
              <div className="min-w-0">
                <p className="numeric text-metric text-status-warn-ink">
                  {analysis.warned.length}
                </p>
                <p className="muted mt-0.5 leading-tight">
                  {t('import.willWarn')}
                </p>
              </div>
            )}
          </div>
          <p className="muted mb-3">{t('import.previewHint')}</p>

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
                  {/* G10 — the third column is what the roster is ABOUT: a
                      volunteer's phone, a farm's position, a driver's car. */}
                  <th className="p-2 text-start font-semibold">
                    {t(
                      kind === 'farms'
                        ? 'import.fieldPositionLink'
                        : kind === 'drivers'
                          ? 'import.fieldVehicle'
                          : 'import.fieldPhone',
                    )}
                  </th>
                  <th className="p-2 text-start font-semibold">
                    {t(kind === 'volunteers' ? 'import.fieldYeshiva' : 'import.fieldPhone')}
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
                  <PreviewRow key={row.rowNumber} row={row} kind={kind} />
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

function PreviewRow({ row, kind }: { row: ParsedRow; kind: ImportKind }) {
  const { t } = useTranslation()
  const bad = row.problems.length > 0

  /**
   * G10 — WHERE THE POSITION CAME FROM, SAID OUT LOUD.
   *
   * Three different facts wear three different chips, because they call for
   * three different actions: a link that parsed is done; a position inferred
   * from the locality gazetteer is APPROXIMATE and the farm sits at the middle
   * of a town rather than at its gate; and "מיקום חסר" is a pin to drop later.
   * Collapsing them into "ok / not ok" would hide the middle one, which is the
   * one that looks right on the map and is 3 km out.
   */
  const positionChip = () => {
    if (kind !== 'farms') return null
    if (row.positionSource === 'link') {
      return (
        <span className="chip bg-status-success/15 text-status-success-ink">
          <Icon name="pin" size={11} />
          {t('import.posFromLink')}
        </span>
      )
    }
    if (row.positionSource === 'locality') {
      return (
        <span className="chip bg-status-info/15 text-status-info-ink">
          <Icon name="pin" size={11} />
          {t('import.posFromLocality')}
        </span>
      )
    }
    return (
      <span className="chip bg-status-warn/15 text-status-warn-ink">
        <Icon name="alert" size={11} />
        {t('import.warnNoPosition')}
      </span>
    )
  }

  const third = kind === 'drivers' ? row.vehicle : row.phone
  const fourth = kind === 'volunteers' ? row.yeshiva : row.phone || row.contactPhone

  return (
    <tr
      className={`border-t border-edge-subtle/60 ${
        bad ? 'bg-status-danger/10' : ''
      }`}
    >
      <td className="numeric p-2 text-content-muted">{row.rowNumber}</td>
      <td className="p-2 text-content-primary">{row.name || '—'}</td>
      <td className="p-2 text-content-secondary">
        {kind === 'farms' ? (
          positionChip()
        ) : (
          <span className={kind === 'drivers' ? '' : 'ltr-nums'}>{third || '—'}</span>
        )}
      </td>
      <td className="ltr-nums p-2 text-content-secondary">{fourth || '—'}</td>
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
        ) : row.warnings.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {row.warnings.map((w) => (
              <span key={w} className="chip bg-status-warn/15 text-status-warn-ink">
                <Icon name="alert" size={11} />
                {t(`import.${w}`)}
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
