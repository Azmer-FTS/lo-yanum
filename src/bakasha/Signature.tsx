import { useEffect, useRef, useState } from 'react'

import { T } from './text'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AP3.5 — LA SIGNATURE AU DOIGT, SUR LA PAGE PUBLIQUE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ UNE SECONDE ÉCRITURE ET NON `ui/components/SignaturePad`, ET LA RAISON
 *    EST LA MÊME QUE POUR TOUTE LA PAGE : ce composant-là tire `react-i18next`
 *    et les classes Tailwind de l'application. Les importer ferait entrer le
 *    dictionnaire et la feuille de style entiers dans un bundle qui doit
 *    s'ouvrir sur un téléphone au bord d'un champ. Ce qui est repris, c'est
 *    ce qui compte : le trait au format PNG, la même gestion des événements de
 *    pointeur, et le fait qu'un trait posé se DIT (le cadre change).
 *
 * ⚠️ `touch-action: none` EST DANS LA FEUILLE ET NON ICI, mais c'est lui qui
 *    fait la différence entre « je signe » et « je fais défiler la page ».
 *
 * ⚠️ ET LE CANEVAS EST DESSINÉ À LA DENSITÉ DE L'ÉCRAN. Un canevas laissé à sa
 *    taille CSS sur un téléphone à 3× rend une signature en escalier, qui a
 *    l'air d'un faux sur le PDF que l'association archive.
 */
export function Signature({
  value,
  onChange,
}: {
  value: string | null
  onChange: (png: string | null) => void
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [empty, setEmpty] = useState(value === null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    /* ⚠️ ENCRE NOIRE EN DUR, jamais un jeton de thème : la signature part dans
       un PDF blanc que l'association imprime. Une encre claire prise sur le
       thème sombre donnerait une page vide (même règle qu'en AG6.2). */
    ctx.strokeStyle = '#111111'
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const p = point(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    /* Un simple appui doit laisser un point : sans ce trait de longueur nulle,
       un tiret de séparation dans un nom ne s'inscrit pas. */
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    dirty.current = true
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const p = point(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    if (!dirty.current || !ref.current) return
    setEmpty(false)
    onChange(ref.current.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    dirty.current = false
    setEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={ref}
        className={`az-sign${empty ? '' : ' az-sign-signed'}`}
        data-testid="signature"
        data-signed={empty ? 'no' : 'yes'}
        aria-label={T.signHere}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <span style={{ alignSelf: 'center', color: 'var(--az-ink-faint)', fontSize: 15 }}>
          {empty ? T.signMissing : T.signHere}
        </span>
        <button
          type="button"
          className="az-btn az-btn-quiet"
          style={{ width: 'auto', marginInlineStart: 'auto', paddingInline: 22 }}
          onClick={clear}
          data-testid="signature-clear"
        >
          {T.signClear}
        </button>
      </div>
    </div>
  )
}
