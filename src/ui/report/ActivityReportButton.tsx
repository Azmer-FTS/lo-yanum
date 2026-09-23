import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  buildActivityReport,
  customPeriod,
  periodFor,
  toRecord,
} from '@core/index'
import type { ActivityPeriod, ActivityPeriodId, ActivityReport } from '@core/index'

import { Icon } from '../components/Icon'
import { CopyButton, Modal, ScrollRow } from '../components/primitives'
import { useTarget } from '../settings/target'
import { activityReportText, activityReportTitle, heDay } from './activityText'
import { drawActivityReport } from './activityDraw'
import { canvasesToPdfFile } from './pdf'
import {
  keepActivityReport,
  previousReportFor,
  syncActivityReports,
  useActivityReports,
} from './activityHistory'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AO3 (2026-09-24) — « דוח פעילות » : UNE FENÊTRE, UNE PÉRIODE, DEUX
 *    SORTIES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « On lui demande régulièrement ce qu'il a fait, et il ne peut pas retaper
 *     sa journée à la main chaque soir. »
 *
 * ★ LE TEXTE EST MONTRÉ, PAS SEULEMENT PRODUIT. C'est LA voie que le PO
 *   utilise vraiment (AO3.5) : il doit pouvoir le LIRE avant de le coller, et
 *   corriger sa journée s'il y voit une bêtise. Le PDF est en dessous, pour
 *   « un envoi plus formel ».
 *
 * ★ LE RAPPORT SE RECALCULE À CHAQUE CHANGEMENT DE PÉRIODE, ET LE PDF AVEC.
 *   Un bouton qui produirait un PDF de la période précédente est exactement
 *   la sorte de mensonge que cette application passe son temps à éviter.
 *
 * ⚠️ « ENVOYÉ » EST CE QUI DÉCLENCHE L'ENREGISTREMENT, et jamais l'ouverture
 *    — voir la note en tête de `activityHistory.ts` : sans cette règle, le
 *    rapport ouvert ce matin pour vérifier un chiffre deviendrait « le
 *    rapport précédent » de celui de ce soir, et la comparaison du mois
 *    prochain porterait sur douze heures.
 */
export function ActivityReportButton({ className = 'btn-secondary' }: { className?: string }) {
  const { t } = useTranslation()
  const target = useTarget()
  const history = useActivityReports()

  const [open, setOpen] = useState(false)
  const [periodId, setPeriodId] = useState<ActivityPeriodId>('week')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* Un iPad neuf doit retrouver ce que l'iPhone a envoyé (AO3.6). */
  useEffect(() => {
    if (open) void syncActivityReports()
  }, [open])

  const period: ActivityPeriod = useMemo(() => {
    if (periodId !== 'custom') return periodFor(periodId)
    const fallback = periodFor('month')
    return customPeriod(from || fallback.from, to || fallback.to)
  }, [periodId, from, to])

  const report: ActivityReport = useMemo(
    () =>
      buildActivityReport(period, {
        targetWeighted: target.current.dunams,
        previous: previousReportFor(period, history),
      }),
    /* `history` en dépendance : sortir un rapport change le repère du suivant. */
    [period, target.current.dunams, history],
  )

  const text = useMemo(() => activityReportText(report), [report])

  /**
   * ★ LE PDF EST BÂTI À LA DEMANDE, ET UNE SEULE FOIS PAR PÉRIODE. Le dessiner
   *   à chaque frappe dans un champ de date ferait tourner huit canvas A4 par
   *   caractère ; le rebâtir à chaque bouton ferait trois fichiers différents
   *   pour un même rapport (le défaut que PO POINT 7 avait déjà nommé).
   */
  const buildPdf = async (): Promise<File | null> => {
    if (file) return file
    setBusy(true)
    try {
      const made = await canvasesToPdfFile(
        drawActivityReport(report),
        `${activityReportTitle(report)}.pdf`,
        { title: activityReportTitle(report), author: t('app.name') },
      )
      setFile(made)
      setUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return URL.createObjectURL(made)
      })
      return made
    } finally {
      setBusy(false)
    }
  }

  /* Changer de période invalide le fichier : il porterait l'ancienne. */
  useEffect(() => {
    setFile(null)
    setUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return null
    })
  }, [period.from, period.to])

  const keep = () => void keepActivityReport(toRecord(report, text))

  const close = () => {
    if (url) URL.revokeObjectURL(url)
    setUrl(null)
    setFile(null)
    setOpen(false)
  }

  const download = async () => {
    const made = await buildPdf()
    if (!made) return
    const href = url ?? URL.createObjectURL(made)
    const a = document.createElement('a')
    a.href = href
    a.download = made.name
    a.click()
    keep()
  }

  const share = async () => {
    const made = await buildPdf()
    if (!made) return
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [made] })) {
      await navigator
        .share({ files: [made], title: activityReportTitle(report), text })
        .catch(() => undefined)
    }
    keep()
  }

  return (
    <>
      <button
        type="button"
        className={className}
        data-testid="activity-open"
        onClick={() => setOpen(true)}
      >
        <Icon name="history" size={15} />
        {t('activity.action')}
      </button>

      {open && (
        <Modal title={t('activity.title')} onClose={close} testId="activity-modal" wide>
          <div className="mb-3">
            <span className="label">{t('activity.periodLabel')}</span>
            <ScrollRow className="mt-1" role="group" aria-label={t('activity.periodLabel')}>
              {(['today', 'week', 'month', 'custom'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={periodId === id}
                  data-testid={`activity-period-${id}`}
                  onClick={() => setPeriodId(id)}
                  className={`filter-pill min-h-11 ${periodId === id ? 'filter-pill-active' : ''}`}
                >
                  {t(`activity.${id}`)}
                </button>
              ))}
            </ScrollRow>
            {periodId === 'custom' && (
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="flex-1">
                  <span className="label">{t('activity.from')}</span>
                  <input
                    type="date"
                    className="input ltr-nums text-start"
                    data-testid="activity-from"
                    value={from || period.from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="flex-1">
                  <span className="label">{t('activity.to')}</span>
                  <input
                    type="date"
                    className="input ltr-nums text-start"
                    data-testid="activity-to"
                    value={to || period.to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </div>
            )}
            <p className="muted mt-1.5" data-testid="activity-compare">
              {report.previous
                ? t('activity.comparedTo', { day: heDay(report.previous.period.to) })
                : t('activity.noPrevious')}
            </p>
          </div>

          {/* ★ LE TEXTE, LISIBLE. C'est la sortie que le PO utilise vraiment. */}
          <span className="label">{t('activity.textLabel')}</span>
          {/* ⚠️ `<pre>` POUR LES SAUTS DE LIGNE, MAIS PAS LA CHASSE FIXE. Le
              message part en hébreu : une police à chasse fixe déforme les
              lettres et fait mentir l'aperçu sur ce que le destinataire
              verra. `font-sans` remet la police de l'app ; `whitespace-pre-wrap`
              garde les retours à la ligne, qui sont la mise en forme. */}
          <pre
            dir="rtl"
            data-testid="activity-text"
            className="mt-1 max-h-[38dvh] overflow-auto whitespace-pre-wrap rounded-card bg-surface-high p-3 font-sans text-[0.9rem] leading-6 text-content-primary"
          >
            {text}
          </pre>

          {url && (
            <object
              data={url}
              type="application/pdf"
              className="mt-3 h-[26dvh] w-full rounded-card bg-surface-high"
              aria-label={t('activity.title')}
            >
              <p className="muted p-4">{file?.name}</p>
            </object>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-primary"
              data-testid="activity-share"
              disabled={busy}
              onClick={() => void share()}
            >
              <Icon name="send" size={16} />
              {busy ? t('activity.building') : t('activity.share')}
            </button>
            <CopyButton value={text} label={t('activity.copy')} />
            <button
              type="button"
              className="btn-secondary"
              data-testid="activity-download"
              disabled={busy}
              onClick={() => void download()}
            >
              <Icon name="download" size={16} />
              {t('activity.download')}
            </button>
          </div>
          <p className="muted mt-2 text-end">{t('activity.savedHint')}</p>

          {/* AO3.6 — « retrouver ce qu'il a annoncé ». */}
          <div className="mt-4">
            <span className="label">{t('activity.history')}</span>
            {history.length === 0 ? (
              <p className="muted mt-1">{t('activity.noHistory')}</p>
            ) : (
              <ul className="mt-1 space-y-1" data-testid="activity-history">
                {history.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="ltr-nums">
                      {r.period.from === r.period.to
                        ? heDay(r.period.to)
                        : `${heDay(r.period.from)} – ${heDay(r.period.to)}`}
                    </span>
                    <CopyButton value={r.body} label={t('activity.copy')} className="btn-ghost" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
