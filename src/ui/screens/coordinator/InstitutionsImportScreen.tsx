import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { applyInstitutionPlan, getInstitutions, parsePortalCsv, planInstitutionImport } from '@core/index'
import type { InstitutionAction, InstitutionPlan } from '@core/index'

import { Icon } from '../../components/Icon'
import { PageHeader, Section } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AU3 — « ייבוא מוסדות » : LE CLASSEUR DES INSTITUTIONS, À REFAIRE À VOLONTÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Même geste que l'import du portail (AS1) : choisir le fichier, VOIR ce qui
 * va changer, écrire. Réimporter le même classeur ne crée rien (identité =
 * nom + localité) et n'efface jamais ce que le PO a saisi dans l'app (statut
 * d'engagement, contact, téléphone). Les points incertains sont montrés AVANT
 * l'écriture, avec la raison : la liste du PO ou la colonne du classeur.
 *
 * Un .xlsx est lu par SheetJS (chargé à la demande), un .csv en TEXTE.
 */
export function InstitutionsImportScreen() {
  const { t } = useTranslation()
  const existing = useCoreValue(() => getInstitutions())
  const [file, setFile] = useState<{ name: string; matrix: string[][] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null)

  const plan: InstitutionPlan | null = useMemo(
    () => (file ? planInstitutionImport({ matrix: file.matrix, existing, nowIso: new Date().toISOString() }) : null),
    // Le plan se fige au choix du fichier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [file],
  )

  const read = async (f: File) => {
    setError(null)
    setDone(null)
    try {
      if (/\.csv$/i.test(f.name)) {
        setFile({ name: f.name, matrix: parsePortalCsv(await f.text()) })
        return
      }
      const XLSX = await import('xlsx')
      const book = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      // La feuille qui porte le plus de lignes : un classeur s'ouvre parfois sur un מקרא.
      let best: string[][] = []
      for (const name of book.SheetNames) {
        const grid = XLSX.utils
          .sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, blankrows: false, defval: '', raw: false })
          .map((r) => r.map((c) => String(c ?? '')))
        if (grid.length > best.length) best = grid
      }
      if (best.length < 2) {
        setError(t('import.emptyFile'))
        return
      }
      setFile({ name: f.name, matrix: best })
    } catch {
      setError(t('institutions.import.unreadable'))
    }
  }

  const count = (k: InstitutionAction['kind']) => plan?.actions.filter((a) => a.kind === k).length ?? 0

  return (
    <div className="mx-auto w-full max-w-4xl" data-testid="institutions-import">
      <PageHeader title={t('institutions.import.title')} info={t('institutions.import.subtitle')} back={{ to: '/coordinator/coverage', label: t('coverage.title') }} />

      <Section title={t('institutions.import.step1')} collapseKey="institutions-import-file" info={t('institutions.import.howTo')}>
        <p className="mb-3 text-caption text-content-secondary">{t('institutions.import.columns')}</p>
        <label className="btn-primary inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2">
          <Icon name="upload" size={16} />
          {file ? file.name : t('institutions.import.choose')}
          <input
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            className="sr-only"
            data-testid="institutions-file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void read(f)
            }}
          />
        </label>
        {error && <p className="mt-2 text-caption font-semibold text-status-danger-ink">{error}</p>}
      </Section>

      {plan && !done && (
        <Section title={t('institutions.import.step2')} collapseKey="institutions-import-plan" className="mt-4">
          {plan.missingName ? (
            <p className="font-semibold text-status-danger-ink" data-testid="institutions-missing-name">{t('institutions.import.missingName')}</p>
          ) : (
            <>
              <ul className="mb-3 flex flex-wrap gap-2 text-caption" data-testid="institutions-summary">
                {(['create', 'update', 'same', 'duplicate'] as const).map((k) =>
                  count(k) > 0 ? (
                    <li key={k} className="filter-pill" data-kind={k} data-count={count(k)}>
                      {t(`institutions.import.kind.${k}`)} <span className="filter-count">{count(k)}</span>
                    </li>
                  ) : null,
                )}
              </ul>
              {plan.uncertain.length > 0 && (
                <div className="mb-3 rounded-field bg-status-warn/15 px-3 py-2" data-testid="institutions-uncertain" data-count={plan.uncertain.length}>
                  <p className="text-caption font-bold text-status-warn-ink">{t('institutions.import.uncertainTitle', { count: plan.uncertain.length })}</p>
                  <ul className="mt-1 text-caption text-content-primary">
                    {plan.uncertain.map((r) => (
                      <li key={r.line}>
                        {r.name}
                        {r.locality ? ` · ${r.locality}` : ''}{' '}
                        <span className="muted">({t(`institutions.import.uncertainBy.${r.uncertainBy ?? 'column'}`)})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {plan.withoutPosition.length > 0 && (
                <p className="mb-3 text-caption text-content-secondary" data-testid="institutions-unplaced">
                  {t('institutions.import.unplaced', { count: plan.withoutPosition.length })}
                </p>
              )}
              {plan.unknownHeaders.length > 0 && (
                <p className="mb-3 text-caption text-content-muted">{t('institutions.import.kept', { headers: plan.unknownHeaders.join(' · ') })}</p>
              )}
              <ul className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto" data-testid="institutions-actions">
                {plan.actions.map((a) => (
                  <li key={`${a.kind}-${a.row.line}`} className="rounded-field bg-surface-high px-3 py-2 text-caption" data-kind={a.kind}>
                    <span className="font-semibold text-content-primary">{a.row.name}</span>
                    <span className="muted">
                      {' · '}
                      {[a.row.locality, t(`institutions.kind.${a.row.kind}`), t(`institutions.audience.${a.row.audience}`)].filter(Boolean).join(' · ')}
                      {' · '}
                      {t(`institutions.import.kind.${a.kind}`)}
                    </span>
                    {a.kind === 'update' && <span className="muted"> — {a.changed.map((c) => t(`institutions.field.${c}`)).join(', ')}</span>}
                    {!a.row.position && <span className="ms-2 chip bg-surface-raised text-content-muted">{t('institutions.noPoint')}</span>}
                    {a.row.positionUncertain && <span className="ms-2 chip bg-status-warn/15 text-status-warn-ink">{t('institutions.uncertainShort')}</span>}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn-primary mt-4"
                disabled={count('create') + count('update') === 0}
                onClick={() => setDone(applyInstitutionPlan(plan))}
                data-testid="institutions-apply"
              >
                {t('institutions.import.apply', { count: count('create') + count('update') })}
              </button>
            </>
          )}
        </Section>
      )}

      {done && (
        <Section title={t('institutions.import.doneTitle')} className="mt-4">
          <p data-testid="institutions-done" data-created={done.created} data-updated={done.updated}>
            {t('institutions.import.done', { created: done.created, updated: done.updated })}
          </p>
          <Link to="/coordinator/coverage" className="btn-primary mt-3">
            {t('institutions.import.toMap')}
          </Link>
        </Section>
      )}
    </div>
  )
}
