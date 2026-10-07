import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  HOME_BASE,
  applyPortalPlan,
  deletionPlan,
  getAllLeads,
  getVisibleFarms,
  parsePortalCsv,
  planPortalImport,
  portalPlanSummary,
} from '@core/index'
import type { PortalAction, PortalPlan } from '@core/index'
import { Icon } from '../../components/Icon'
import { PageHeader, Section } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AS1 — « ייבוא מהפורטל » : L'EXPORT CSV DU PORTAIL, À REFAIRE À CHAQUE FOIS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO saisit chez l'association, exporte son CSV, l'apporte ici. L'écran
 * MONTRE ce qui va changer (champ par champ) avant d'écrire, et dit ce qu'il
 * ne tranche pas : numéros hors neuf chiffres, épingles gardées, signature
 * sans statut « נחתם » (le fichier n'a pas de colonne de statut — une case à
 * cocher par ligne), texte trouvé dans « מיקום ».
 *
 * ⚠️ Le fichier est lu en TEXTE (`File.text()` → `parsePortalCsv`), JAMAIS par
 *    le lecteur de tableur : c'est lui qui transformait `0526067361` en
 *    526067361.0 (piège n°1 du brief).
 */
export function PortalImportScreen() {
  const { t } = useTranslation()
  const farms = useCoreValue(() => getVisibleFarms())
  const leads = useCoreValue(() => getAllLeads())
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [done, setDone] = useState<ReturnType<typeof applyPortalPlan> | null>(null)

  const plan: PortalPlan | null = useMemo(() => {
    if (!file) return null
    return planPortalImport({
      matrix: parsePortalCsv(file.text),
      farms,
      leads,
      fileName: file.name,
      nowIso: new Date().toISOString(),
      historyOf: (id) => {
        const f = farms.find((x) => x.id === id)
        const out: string[] = []
        if (f?.signature) out.push(t('portal.history.signature'))
        if ((f?.agreements.length ?? 0) > 0) out.push(t('portal.history.agreements'))
        if (!deletionPlan('entity', id).allowed) out.push(t('portal.history.linked'))
        return out
      },
    })
    // Le plan se fige au choix du fichier : il ne se recalcule pas sous les yeux.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const summary = plan ? portalPlanSummary(plan) : null
  const askSigned = plan?.warnings.filter((w) => w.code === 'signature-without-signed-status') ?? []
  const label = (a: PortalAction): string => a.row.name

  return (
    <div className="mx-auto w-full max-w-4xl" data-testid="portal-import">
      <PageHeader title={t('portal.title')} subtitle={t('portal.subtitle')} back={{ to: '/coordinator/farms', label: t('farms.title') }} />

      <Section title={t('portal.step1')} collapseKey="portal-file">
        <p className="muted mb-3">{t('portal.howTo')}</p>
        <label className="btn-primary inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2">
          <Icon name="upload" size={16} />
          {file ? file.name : t('portal.choose')}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            data-testid="portal-file"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setDone(null)
              setFile({ name: f.name, text: await f.text() })
            }}
          />
        </label>
      </Section>

      {plan && summary && !done && (
        <>
          <Section title={t('portal.step2')} collapseKey="portal-plan" className="mt-4">
            <ul className="mb-3 flex flex-wrap gap-2 text-caption" data-testid="portal-summary">
              {(Object.keys(summary) as Array<keyof typeof summary>).map((k) =>
                summary[k] > 0 ? (
                  <li key={k} className="filter-pill" data-kind={k}>
                    {t(`portal.kind.${k}`)} <span className="filter-count">{summary[k]}</span>
                  </li>
                ) : null,
              )}
            </ul>
            <ul className="flex flex-col gap-2" data-testid="portal-actions">
              {plan.actions.map((a) => (
                <li key={`${a.kind}-${a.row.line}`} className="rounded-field border border-edge-subtle bg-surface-raised px-3 py-2 text-caption" data-kind={a.kind}>
                  <p className="font-semibold text-content-primary">
                    {label(a)} <span className="muted">· {t(`portal.kind.${a.kind}`)}</span>
                    {a.kind === 'update' && a.pairedBy === 'phone' ? <span className="muted"> · {t('portal.byPhone')}</span> : null}
                  </p>
                  {'changes' in a && a.changes.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5 text-content-secondary">
                      {a.changes.map((c) => (
                        <li key={c.field}>
                          {t(`portal.field.${c.field}`)}: {c.from ? <s className="opacity-70">{c.from}</s> : null} {c.from ? '→ ' : ''}
                          <span dir="auto">{c.to}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {'changes' in a && a.changes.length === 0 && <p className="muted mt-0.5">{t('portal.noChange')}</p>}
                  {a.kind === 'skip-duplicate' && <p className="muted mt-0.5">{t('portal.sameAs', { name: a.sameAs.name })}</p>}
                  {a.kind === 'farm-to-lead' && <p className="muted mt-0.5">{t('portal.toLead')}</p>}
                </li>
              ))}
            </ul>
          </Section>

          {plan.warnings.length > 0 && (
            <Section title={t('portal.warnings')} collapseKey="portal-warnings" className="mt-4">
              <ul className="flex flex-col gap-1.5 text-caption" data-testid="portal-warnings">
                {plan.warnings.map((w, i) => (
                  <li key={i} data-code={w.code} className="flex flex-wrap items-center gap-2">
                    <Icon name="alert" size={14} className="text-status-warn-ink" />
                    <span className="font-semibold">{w.name || t('portal.file')}</span>
                    <span className="text-content-secondary">{t(`portal.warn.${w.code}`)}</span>
                    <span className="muted" dir="auto">{w.detail}</span>
                  </li>
                ))}
              </ul>
              {askSigned.length > 0 && <p className="muted mt-2">{t('portal.signedKept')}</p>}
            </Section>
          )}

          <Section title={t('portal.docs')} collapseKey="portal-docs" className="mt-4">
            <p className="text-caption" data-testid="portal-signatures">
              {t('portal.signatures', { count: plan.signatures.length })}: {plan.signatures.map((s) => s.name).join(' · ') || '—'}
            </p>
            <p className="mt-1 text-caption" data-testid="portal-contracts">
              {t('portal.contracts', { count: plan.contracts.length })}: {plan.contracts.map((s) => s.name).join(' · ') || '—'}
            </p>
          </Section>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary min-h-[2.75rem]"
              data-testid="portal-apply"
              onClick={() => setDone(applyPortalPlan(plan, HOME_BASE))}
            >
              <Icon name="check" size={16} />
              {t('portal.apply')}
            </button>
            <button type="button" className="btn-secondary min-h-[2.75rem]" onClick={() => setFile(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </>
      )}

      {done && (
        <div className="card card-pad mt-4" role="status" data-testid="portal-done">
          <p className="font-semibold text-status-success-ink">
            {t('portal.done', { updated: done.updated, created: done.created, leads: done.leads + done.converted })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/coordinator/farms" className="btn-secondary min-h-[2.75rem]">
              {t('farms.title')}
            </Link>
            <Link to="/coordinator/leads" className="btn-secondary min-h-[2.75rem]">
              {t('leads.title')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
