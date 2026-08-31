import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { buildProgrammeReport } from '@core/index'

import { Icon } from '../components/Icon'
import { Modal } from '../components/primitives'
import { drawReport } from './draw'
import { canvasesToPdfFile } from './pdf'

/**
 * PO POINT 7 — "דוח", AND THREE WAYS OUT OF IT.
 *
 * ★ THE PDF IS BUILT ONCE AND THEN OFFERED THREE WAYS, which is the whole
 *   design: the coordinator taps once, sees the file exists, and then chooses
 *   how it leaves. Building it per button would mean three renders and three
 *   chances for the numbers to differ between what he shared and what he
 *   downloaded.
 *
 * ★ WEB SHARE FIRST, AND ONLY WHERE IT REALLY WORKS. `navigator.canShare({
 *   files })` is asked rather than assumed — Safari on an iPad answers yes and
 *   hands the sheet to Mail and WhatsApp, which is the product owner's "one
 *   gesture"; a desktop Chrome without it answers no and the button is not
 *   drawn at all rather than throwing when pressed.
 *
 * ★ AND `mailto:` CANNOT CARRY AN ATTACHMENT. No mail client accepts one from
 *   a URL, and pretending otherwise is how a coordinator sends an empty
 *   message believing the report is on it. So "שלח במייל" DOWNLOADS the file
 *   first and says so, then opens a pre-filled draft with the figures in the
 *   body — so the mail is useful even if he never attaches anything.
 */
export function ReportButton({
  recipient,
  className = 'btn-secondary',
}: {
  /** From הגדרות — `כתובת דוחות`. Empty means the field was never filled. */
  recipient: string
  className?: string
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  const build = async () => {
    setBusy(true)
    try {
      const report = buildProgrammeReport()
      const canvases = drawReport(report, t as (k: string, o?: Record<string, unknown>) => string)
      const stamp = new Date(report.generatedAt).toISOString().slice(0, 10)
      const made = await canvasesToPdfFile(
        canvases,
        `${t('report.fileName')}-${stamp}.pdf`,
        { title: t('report.title'), author: t('app.name') },
      )
      setFile(made)
      setUrl(URL.createObjectURL(made))
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (url) URL.revokeObjectURL(url)
    setUrl(null)
    setFile(null)
  }

  const canShare =
    file !== null &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })

  const download = () => {
    if (!url || !file) return
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
  }

  const body = () => {
    const r = buildProgrammeReport()
    return [
      `${t('dashboard.guardedDunams')}: ${r.guardedDunams.toLocaleString('he-IL')}`,
      r.guardedHeads === null
        ? null
        : `${t('livestock.totalGuarded')}: ${r.guardedHeads.toLocaleString('he-IL')}`,
      `${t('report.entities')}: ${r.entitiesTotal.toLocaleString('he-IL')}`,
      `${t('report.activeVolunteers')}: ${r.volunteersActive.toLocaleString('he-IL')}`,
      `${t('report.guardsDone')}: ${r.guardsCompletedTotal.toLocaleString('he-IL')}`,
    ]
      .filter((l): l is string => l !== null)
      .join('\n')
  }

  return (
    <>
      <button
        type="button"
        className={className}
        data-testid="report-open"
        disabled={busy}
        onClick={() => void build()}
      >
        <Icon name="document" size={15} />
        {busy ? t('report.building') : t('report.action')}
      </button>

      {file && url && (
        <Modal title={t('report.title')} onClose={close}>
          {/* The page itself, so he can see what he is about to send. An
              <object> renders a PDF inline where the platform can and shows
              its fallback where it cannot — an iPad shows the first page. */}
          <object
            data={url}
            type="application/pdf"
            className="h-[46dvh] w-full rounded-card bg-surface-high"
            aria-label={t('report.title')}
          >
            <p className="muted p-4">{file.name}</p>
          </object>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {canShare && (
              <button
                type="button"
                className="btn-primary"
                data-testid="report-share"
                onClick={() =>
                  void navigator
                    .share({ files: [file], title: t('report.title') })
                    .catch(() => undefined)
                }
              >
                <Icon name="external" size={16} />
                {t('report.share')}
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              data-testid="report-download"
              onClick={download}
            >
              <Icon name="download" size={16} />
              {t('report.download')}
            </button>
            <a
              className="btn-secondary"
              data-testid="report-mail"
              href={`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(
                t('report.mailSubject'),
              )}&body=${encodeURIComponent(body())}`}
              onClick={download}
            >
              <Icon name="mail" size={16} />
              {t('report.mail')}
            </a>
          </div>
          <p className="muted mt-2 text-end">
            {recipient ? t('report.attachHint') : t('report.noRecipient')}
          </p>
        </Modal>
      )}
    </>
  )
}
