import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'

/**
 * P3.3 — SIGNING WITH A FINGER, AND WITH THE PENCIL (PO point 9).
 *
 * ★ THE STYLUS IS NOT A SECOND-CLASS INPUT HERE, IT IS THE NATURAL ONE. A
 *   signature is the one interaction in this app where a Pencil is not a
 *   preference — a name written with a fingertip on glass is a scrawl, and a
 *   farmer is being asked to sign an agreement. So this is Pointer Events from
 *   the first line: `pen`, `touch` and `mouse` all draw, and nothing branches
 *   on which.
 *
 * ★ AND PRESSURE IS USED WHERE THE DEVICE OFFERS IT. `PointerEvent.pressure`
 *   is 0.5 for a mouse and for most touches, and a real value under an Apple
 *   Pencil — so the stroke thins and thickens the way handwriting does, and
 *   falls back to a constant width everywhere else. It is four lines and it is
 *   the difference between a signature and a trace.
 *
 * ★ `touch-action: none` ON THE CANVAS ONLY. Without it the first millimetre
 *   of a stroke scrolls the page instead of drawing. ⚠️ It is scoped to this
 *   element and must never spread to a text field: `touch-action: none` on an
 *   input is what breaks iOS SCRIBBLE, which is how the product owner writes
 *   with the same Pencil (§16.4).
 *
 * ★ `getCoalescedEvents()` WHERE IT EXISTS. A Pencil samples far faster than
 *   the display refreshes, and the browser batches those samples into one
 *   `pointermove`. Drawing only the last one turns a curve into a polygon at
 *   speed; asking for the coalesced list draws every sample the hardware took.
 */
export function SignaturePad({
  value,
  onChange,
  height = 200,
}: {
  /** A PNG data URI, or null for a blank pad. */
  value: string | null
  onChange: (signature: string | null) => void
  height?: number
}) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(value !== null)

  /**
   * The canvas is sized to its BOX times the device ratio, once it has a box.
   * A canvas sized in CSS only is a canvas drawn at 1× and stretched, which on
   * a Retina iPad is exactly the blur a signature must not have.
   */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0) return
      const dpr = window.devicePixelRatio || 1
      const previous = hasInk ? canvas.toDataURL('image/png') : null
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111827'
      if (previous) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
        img.src = previous
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
    // `hasInk` deliberately excluded: re-running on every first stroke would
    // clear and redraw the canvas mid-signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load an existing signature into the pad.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !value) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const img = new Image()
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
    img.src = value
  }, [value])

  const pointAt = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const strokeTo = (
    ctx: CanvasRenderingContext2D,
    to: { x: number; y: number },
    pressure: number,
  ) => {
    // 0.5 is what a mouse and most touches report; a Pencil reports its own.
    ctx.lineWidth = 1.2 + pressure * 2.6
    ctx.beginPath()
    ctx.moveTo(last.current?.x ?? to.x, last.current?.y ?? to.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    last.current = to
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pointAt(e)
    const ctx = canvas.getContext('2d')
    if (ctx) strokeTo(ctx, last.current, e.pressure || 0.5)
    setHasInk(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    const native = e.nativeEvent
    const samples =
      typeof native.getCoalescedEvents === 'function'
        ? native.getCoalescedEvents()
        : [native]
    for (const sample of samples.length > 0 ? samples : [native]) {
      strokeTo(ctx, pointAt(sample), sample.pressure || 0.5)
    }
  }

  const finish = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        data-testid="signature-pad"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={finish}
        style={{ height, touchAction: 'none' }}
        className="w-full cursor-crosshair rounded-card bg-white shadow-card"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="muted">{t('signature.hint')}</p>
        <button
          type="button"
          className="btn-ghost py-1.5"
          data-testid="signature-clear"
          disabled={!hasInk}
          onClick={clear}
        >
          <Icon name="trash" size={15} />
          {t('signature.clear')}
        </button>
      </div>
    </div>
  )
}
