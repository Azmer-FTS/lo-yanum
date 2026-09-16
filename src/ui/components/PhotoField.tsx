import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PHOTO_MAX_EDGE, PHOTO_QUALITY } from '@core/index'

import { Avatar } from './Avatar'
import { Icon } from './Icon'

/**
 * Centre-crops to a square and downscales before the photo ever reaches state.
 * A modern phone photo is 3–5 MB; this lands it near 30 KB, which is what lets
 * photos live on the record at all.
 */
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AN9 (2026-09-16) — UN SEUL BOUTON PHOTO, ET IL OUVRE LES TROIS SOURCES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Il y avait « צילום עכשיו » (un `<input capture>`) et « העלאת קובץ » (un
 * `<input>` sans `capture`) — et sur iPad le second rouvrait le MÊME choix :
 * un `<input type="file" accept="image/*">` SANS `capture` fait afficher par
 * iOS son propre menu : prendre une photo, photothèque, choisir un fichier.
 * Un seul champ suffit donc, et c'est lui qui est gardé. (Vu sur le simulateur
 * iPad, `docs/an/an9-*`.)
 *
 * `usePhotoPicker` donne ce champ à qui veut le déclencher depuis autre chose
 * qu'un bouton — l'AVATAR d'une personne, qu'on touche pour changer sa photo.
 */
export function usePhotoPicker(onChange: (photo: string | null) => void): {
  open: () => void
  busy: boolean
  error: string | null
  input: ReactNode
} {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement | null>(null)
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
  return {
    open: () => ref.current?.click(),
    busy,
    error,
    input: (
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="photo-input"
        onChange={(e) => {
          void handle(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    ),
  }
}

export function PhotoField({
  label,
  value,
  onChange,
  name,
  shape = 'circle',
  hint,
  testId = 'photo-field',
}: {
  label: string
  value: string | null
  onChange: (photo: string | null) => void
  name: string
  shape?: 'circle' | 'square'
  hint?: string
  testId?: string
}) {
  const { t } = useTranslation()
  const picker = usePhotoPicker(onChange)

  return (
    <div data-testid={testId}>
      <span className="label">{label}</span>
      {/* ★ AN9.2 — le bouton À CÔTÉ de la vignette, sur sa ligne. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={picker.open}
          aria-label={t('photo.choose')}
          className="relative shrink-0 rounded-field"
          data-testid={`${testId}-thumb`}
        >
          <Avatar photo={value} name={name || '?'} size="lg" shape={shape} />
          {picker.busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-field bg-surface-sunken/70">
              <Icon name="clock" size={20} className="animate-pulse" />
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={picker.open}
          className="btn-secondary"
          data-testid={`${testId}-choose`}
        >
          <Icon name="camera2" size={15} />
          {value ? t('photo.change') : t('photo.choose')}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t('photo.remove')}
            title={t('photo.remove')}
            className="btn-ghost text-status-danger-ink hover:bg-status-danger/10"
          >
            <Icon name="trash" size={15} />
          </button>
        )}
        {(picker.error || hint) && (
          <p className="w-full text-micro text-content-muted">{picker.error ?? hint}</p>
        )}
      </div>
      {picker.input}
    </div>
  )
}
