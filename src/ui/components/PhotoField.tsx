import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PHOTO_MAX_EDGE, PHOTO_QUALITY } from '@core/index'

import { Avatar } from './Avatar'
import { Icon } from './Icon'

/**
 * C5.2 — photo field with TWO paths, because coordinators acquire pictures two
 * different ways in the field:
 *
 *   (a) take it now — `capture` opens the phone camera directly;
 *   (b) import a file — the picture already arrived over WhatsApp.
 *
 * The image is cropped to a square and downscaled to PHOTO_MAX_EDGE before it
 * ever reaches the store. A modern phone photo is 3–8 MB; dropping a handful of
 * those into an in-memory store (and, in Lot 1, over a desert data connection)
 * would be untenable, so resizing is not an optimisation — it is the feature.
 *
 * Canvas and FileReader are Web APIs, which is exactly why this lives in
 * /src/ui; the sizing constants and the fallback maths stay pure in core/photo.
 */

/** Centre-crop to a square, downscale, re-encode. Returns a data URI. */
async function toSquareDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)

  const edge = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - edge) / 2
  const sy = (bitmap.height - edge) / 2
  const size = Math.min(edge, PHOTO_MAX_EDGE)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size)
  bitmap.close()

  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
}

export function PhotoField({
  label,
  value,
  onChange,
  name,
  shape = 'circle',
  hint,
}: {
  label: string
  value: string | null
  onChange: (photo: string | null) => void
  /** Used for the initials fallback while there is no photo. */
  name: string
  shape?: 'circle' | 'square'
  hint?: string
}) {
  const { t } = useTranslation()
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handle = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onChange(await toSquareDataUrl(file))
    } catch {
      setError(t('photo.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar photo={value} name={name || '?'} size="xl" shape={shape} />
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-field bg-surface-sunken/70">
              <Icon name="clock" size={20} className="animate-pulse" />
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="btn-secondary py-2"
            >
              <Icon name="camera2" size={15} />
              {t('photo.take')}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-secondary py-2"
            >
              <Icon name="image" size={15} />
              {t('photo.import')}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="btn-ghost py-2 text-status-danger-ink hover:bg-status-danger/10"
              >
                <Icon name="trash" size={15} />
                {t('photo.remove')}
              </button>
            )}
          </div>
          <p className="text-micro text-content-muted">
            {error ?? hint ?? t('photo.hint')}
          </p>
        </div>
      </div>

      {/* `capture` asks the phone for the camera directly; on desktop the same
          input degrades to a normal file picker, which is why both exist. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
