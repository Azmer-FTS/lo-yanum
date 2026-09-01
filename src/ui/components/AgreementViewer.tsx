import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Agreement } from '@core/types'

import { fetchAgreementFile } from '../agreement/document'
import { Icon } from './Icon'
import { Modal } from './primitives'

/**
 * ORDRE DE NUIT 2026-09-02 (N2) — THE AGREEMENT PDF, WITH A WAY OUT.
 *
 * ★★ WHAT THE PRODUCT OWNER FOUND: opening the contract TRAPPED him. The
 *    "view" action was `<a href=… target="_blank">`; inside the installed app
 *    on iPadOS there is no tab bar, so a PDF opened that way fills the window
 *    with no back button, no close, nothing — he had to kill the app. The
 *    download link had the same shape and the same trap waiting.
 *
 * ★ SO NOTHING HERE NAVIGATES. The bytes are fetched ONCE into a `File` and
 *   offered four ways, all of which return to the screen they left:
 *     · VIEW — this modal, with the page inline and a close button that is
 *       always on screen (an `<object>` on iPad shows the first page; the
 *       "open in a new tab" button is for the rest, and a new tab from an
 *       installed app opens a Safari sheet that has its own "Done");
 *     · SHARE — the Web Share API with the FILE, which on an iPad is one tap
 *       to Mail or WhatsApp (the same path the report uses);
 *     · DOWNLOAD — an object URL with `download`, same-origin, so the browser
 *       treats it as a save rather than a navigation;
 *     · OPEN IN A NEW TAB — explicit, named, and never the only way.
 *
 * ★ THE FILE IS THE ENTITY'S. Its name is the row's `fileName`, so what
 *   arrives in a mailbox is "הסכם — חוות רתם.pdf" and not "agreement.pdf";
 *   the bytes are the association's template when one has been uploaded from
 *   הגדרות, and the marked placeholder until then (`agreement/document.ts`).
 */
export function AgreementActions({
  agreement,
  farmName,
}: {
  agreement: Agreement
  farmName: string
}) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState<'view' | 'share' | 'download' | null>(null)
  const [error, setError] = useState(false)

  // The object URL lives exactly as long as the modal.
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])

  const load = async (): Promise<File | null> => {
    try {
      return await fetchAgreementFile(agreement.fileName)
    } catch {
      setError(true)
      return null
    }
  }

  const view = async () => {
    setBusy('view')
    const got = await load()
    setBusy(null)
    if (!got) return
    setFile(got)
    setUrl(URL.createObjectURL(got))
  }

  const share = async () => {
    setBusy('share')
    const got = file ?? (await load())
    setBusy(null)
    if (!got) return
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [got] })) {
      await navigator
        .share({ files: [got], title: `${farmName} — ${got.name}` })
        .catch(() => undefined)
      return
    }
    // No share sheet on this platform: a mail draft with the name; the file
    // itself is one "download" away, and the hint under the buttons says so.
    window.location.href = `mailto:?subject=${encodeURIComponent(
      `${farmName} — ${got.name}`,
    )}&body=${encodeURIComponent(t('agreement.mailBody', { farm: farmName }))}`
  }

  const download = async () => {
    setBusy('download')
    const got = file ?? (await load())
    setBusy(null)
    if (!got) return
    const href = url ?? URL.createObjectURL(got)
    const a = document.createElement('a')
    a.href = href
    a.download = got.name
    a.rel = 'noopener'
    a.click()
    if (!url) setTimeout(() => URL.revokeObjectURL(href), 60_000)
  }

  const close = () => {
    setFile(null)
    setUrl(null)
  }

  const iconBtn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-field text-content-muted ' +
    'transition-colors duration-fast hover:bg-surface-high hover:text-content-primary disabled:opacity-50'

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={() => void view()}
        disabled={busy !== null}
        data-testid="agreement-view"
        title={t('farms.agreementView')}
        aria-label={t('farms.agreementView')}
        className={iconBtn}
      >
        <Icon name="eye" size={17} />
      </button>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy !== null}
        data-testid="agreement-download"
        title={t('farms.agreementDownload')}
        aria-label={t('farms.agreementDownload')}
        className={iconBtn}
      >
        <Icon name="download" size={17} />
      </button>
      <button
        type="button"
        onClick={() => void share()}
        disabled={busy !== null}
        data-testid="agreement-share"
        title={t('farms.agreementShare')}
        aria-label={t('farms.agreementShare')}
        className={iconBtn}
      >
        <Icon name="send" size={17} />
      </button>
      {error && (
        <span role="alert" className="text-micro text-status-danger-ink">
          {t('agreement.loadFailed')}
        </span>
      )}

      {file && url && (
        <Modal title={agreement.fileName} onClose={close} wide>
          <object
            data={url}
            type="application/pdf"
            data-testid="agreement-document"
            className="h-[60dvh] w-full rounded-card bg-surface-high"
            aria-label={agreement.fileName}
          >
            <p className="muted p-4">{t('agreement.noInlineViewer')}</p>
          </object>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-primary"
              data-testid="agreement-modal-share"
              onClick={() => void share()}
            >
              <Icon name="external" size={16} />
              {t('farms.agreementShare')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              data-testid="agreement-modal-download"
              onClick={() => void download()}
            >
              <Icon name="download" size={16} />
              {t('farms.agreementDownload')}
            </button>
            <a
              className="btn-secondary"
              data-testid="agreement-modal-tab"
              href={url}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon name="expand" size={16} />
              {t('agreement.openTab')}
            </a>
            <button
              type="button"
              className="btn-secondary"
              data-testid="agreement-modal-close"
              onClick={close}
            >
              <Icon name="close" size={16} />
              {t('common.close')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
