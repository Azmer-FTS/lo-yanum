import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  ringAreaDunams,
  ringCenter,
  simplifyRing,
  simplifyToleranceM,
  readCoordinator,
  regionById,
  regionIsEdited,
  regions,
} from '@core/index'
import type { LatLng, RegionId } from '@core/index'

import { ChevronForward, Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { ScrollRow } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { ringOf, resetRegionRing, saveRegionRing } from '../../settings/regionEdits'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ Y2 (2026-09-06) — "עריכת אזורים". THE COORDINATOR REDRAWS THE COUNTRY.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Les frontières des 13 régions générées ne correspondent pas aux cartes de
 *  référence. Le PO doit pouvoir les redessiner lui-même."
 *
 * Which closes the honest limitation `core/regions.ts` has carried since X12:
 * those rings are approximations somebody wrote by hand from a photograph of a
 * teaching map, and the person holding the map is the only one who can correct
 * them. This screen hands him the pencil.
 *
 * ★ TWO WAYS TO EDIT, AND THEY ARE THE SAME TWO THE FARM POLYGONS HAVE — same
 *   engine, same tolerance, same feel:
 *
 *     · every vertex is a grip he can drag, and a small grip on the middle of
 *       each edge inserts a vertex there. A long-press on a vertex removes it.
 *     · or he traces the whole outline in one stroke with the Pencil, and
 *       `simplifyRing` turns four hundred sampled points into a polygon —
 *       with the tolerance derived from the zoom the stroke was drawn at,
 *       because a pixel is worth a different number of metres at every zoom.
 *
 * ★ THE OTHER TWELVE STAY ON SCREEN, DIMMED. A boundary is a boundary WITH
 *   something: redrawing the Negev's northern edge without seeing where the
 *   Shfela currently ends is drawing half of a seam.
 *
 * ⚠️ AND NOTHING IS SAVED UNTIL HE SAYS SO. Every gesture writes to a local
 *    draft with its own undo stack; "שמור" is what reaches `regionEdits.ts`,
 *    and it is also what re-files every farm, moshav, volunteer and driver —
 *    see `saveRegionRing`. Leaving without saving changes nothing at all,
 *    which is why the discard button is spelled out rather than implied by
 *    the back arrow.
 */

/** How many steps back the pencil can go. Twenty gestures is a real session. */
const HISTORY = 40

export function RegionsEditScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const coordinator = useCoreValue(() => readCoordinator())
  const all = useCoreValue(() => regions())

  const [selected, setSelected] = useState<RegionId | null>(null)
  const [draft, setDraft] = useState<LatLng[]>([])
  const [past, setPast] = useState<LatLng[][]>([])
  const [future, setFuture] = useState<LatLng[][]>([])
  const [pencil, setPencil] = useState(false)
  const [live, setLive] = useState<LatLng[] | null>(null)
  /** The ring as it was when this region was opened — "האם השתנה". */
  const opened = useRef<string>('')

  const region = selected ? regionById(selected) : null

  /**
   * ⚠️ COORDINATOR ONLY, AND IT IS A REDIRECT RATHER THAN A HIDDEN BUTTON.
   *    A farmer who reaches this URL — from a bookmark, from a shared link —
   *    must land somewhere real, not on an editor for boundaries that decide
   *    which of his neighbours are counted with him.
   */
  if (!coordinator) return null

  const open = (id: RegionId): void => {
    const ring = ringOf(id)
    setSelected(id)
    setDraft(ring)
    setPast([])
    setFuture([])
    setPencil(false)
    setLive(null)
    opened.current = JSON.stringify(ring)
  }

  const push = (next: LatLng[]): void => {
    setPast((p) => [...p, draft].slice(-HISTORY))
    setFuture([])
    setDraft(next)
  }

  const undo = (): void => {
    setPast((p) => {
      if (p.length === 0) return p
      setFuture((f) => [draft, ...f].slice(0, HISTORY))
      setDraft(p[p.length - 1])
      return p.slice(0, -1)
    })
  }

  const redo = (): void => {
    setFuture((f) => {
      if (f.length === 0) return f
      setPast((p) => [...p, draft].slice(-HISTORY))
      setDraft(f[0])
      return f.slice(1)
    })
  }

  const dirty = selected !== null && JSON.stringify(draft) !== opened.current
  /**
   * The live figure while a stroke is in flight, the draft's the rest of the
   * time. "Surface vivante en dounams pendant le tracé."
   */
  const dunams = Math.round(ringAreaDunams(live && live.length > 2 ? live : draft))

  /**
   * The washes. The one being edited keeps its own colour at full strength;
   * every other one is dimmed to a quarter, which is enough to read a seam
   * against and not enough to argue with the line under the finger.
   */
  const polygons = useMemo(
    () =>
      all.map((r) => ({
        id: `region-${r.id}`,
        ring:
          r.id === selected
            ? draft
            : r.ring.map(([lng, lat]) => ({ lat, lng })),
        color:
          r.id === selected
            ? `rgb(${r.rgb})`
            : `rgb(${r.rgb} / 0.28)`,
        emphasis: r.id === selected,
      })),
    [all, selected, draft],
  )

  /**
   * ★ EVERY VERTEX IS A GRIP, AND SO IS EVERY EDGE'S MIDDLE. The same G15
   *   pattern the farm zones use: a big grip moves a corner, a small one
   *   between two corners becomes a corner when you touch it. Nothing else has
   *   to be learned to go from a thirteen-point sketch to a real outline.
   */
  const markers = useMemo(() => {
    if (!selected || pencil) return []
    const out = draft.map((point, i) => ({
      id: `v-${i}`,
      position: point,
      color: `rgb(${region?.rgb ?? '0 0 0'})`,
      title: t('regionEdit.vertex', { n: i + 1 }),
      kind: 'vertex' as const,
      draggable: true,
      onDragEnd: (position: LatLng) => {
        push(draft.map((p, j) => (j === i ? position : p)))
      },
      onSelect: () => {
        // A corner with three left is the last triangle; removing it would
        // leave a region that cannot contain anything.
        if (draft.length <= 3) return
        push(draft.filter((_, j) => j !== i))
      },
    }))
    const mids = draft.map((point, i) => {
      const next = draft[(i + 1) % draft.length]
      const mid = { lat: (point.lat + next.lat) / 2, lng: (point.lng + next.lng) / 2 }
      return {
        id: `m-${i}`,
        position: mid,
        color: `rgb(${region?.rgb ?? '0 0 0'} / 0.55)`,
        title: t('regionEdit.addVertex'),
        kind: 'vertex' as const,
        onSelect: () => {
          const next2 = [...draft]
          next2.splice(i + 1, 0, mid)
          push(next2)
        },
      }
    })
    return [...out, ...mids]
  }, [draft, selected, pencil, region, t, push])

  const save = (): void => {
    if (!selected || draft.length < 3) return
    saveRegionRing(selected, draft)
    opened.current = JSON.stringify(draft)
  }

  const restore = (): void => {
    if (!selected) return
    resetRegionRing(selected)
    open(selected)
  }

  const centre = useMemo(
    () => (draft.length > 2 ? ringCenter(draft) : undefined),
    [draft],
  )

  return (
    /**
     * ★ Z5.4 (2026-09-07) — AND THE SCREEN CARRIES ITS OWN MARGIN NOW.
     *
     * The shell's `<main>` is bare on a solo route (see `layouts.tsx`), so the
     * padding the blocks below bleed OUT of — `-mx-4 px-4` on the pinned top,
     * `-mx-4` on the map — has to come from here or the negative margins push
     * the header off the side of the device. `--content-pad` goes with it,
     * because that is what a swipable row reads to reach the edge.
     */
    <div
      className="flex h-[calc(100dvh-var(--shell-top)-var(--shell-foot))] min-h-0 flex-col
                 px-4 pt-5 [--content-pad:1rem] lg:px-5 lg:[--content-pad:1.25rem]"
    >
      {/* The chooser. One pill per region, its own colour, and a mark on the
          ones he has already redrawn — so "which of these is still X12's
          guess" is answerable at a glance. */}
      <div className="sticky-top -mx-4 px-4 lg:-mx-5 lg:px-5" style={{ top: 'var(--shell-top, 0px)' }}>
        <div data-title-row="" className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <button
            type="button"
            onClick={() => navigate('/coordinator/settings')}
            aria-label={t('common.back')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill
                       text-content-secondary hover:bg-surface-high"
          >
            <ChevronForward />
          </button>
          <h1 data-page-title="" className="min-w-[6rem] flex-1 truncate text-title text-content-primary">
            {t('regionEdit.title')}
          </h1>
        </div>

        {/* ★ Z4.4 — a swipable row like every other one: the same edge fade on
            the side that has more, and the same chevron. It was a bare
            `.scroll-row` div, so it had neither. */}
        <ScrollRow
          className="min-w-0"
          testId="region-chooser"
          style={{ marginTop: 'calc(var(--list-rhythm) - var(--row-shadow-room))' }}
        >
          {all.map((r) => (
            <button
              key={r.id}
              type="button"
              data-testid={`region-pick-${r.id}`}
              onClick={() => open(r.id)}
              aria-pressed={selected === r.id}
              className={`filter-pill ${selected === r.id ? 'filter-pill-active' : ''}`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-pill"
                style={{ background: `rgb(${r.rgb})` }}
              />
              {r.name}
              {regionIsEdited(r.id) && <Icon name="check" size={11} />}
            </button>
          ))}
        </ScrollRow>
      </div>

      <div className="relative -mx-4 mt-3 min-h-0 flex-1 lg:-mx-5">
        <MapView
          ariaLabel={t('regionEdit.mapLabel')}
          polygons={polygons}
          markers={markers}
          center={centre}
          fit={false}
          zoom={selected ? 8 : 7}
          freehand={
            selected && pencil
              ? {
                  active: true,
                  color: `rgb(${region?.rgb ?? '0 0 0'})`,
                  onTrace: (points: LatLng[]) => setLive(points),
                  onEnd: (points: LatLng[], zoom: number) => {
                    setLive(null)
                    if (points.length < 3) return
                    /**
                     * ★ THE SAME ENGINE AS A FARM POLYGON, and the tolerance
                     *   comes from the zoom the stroke was DRAWN at — a screen
                     *   pixel is 150 m at z9 and 5 m at z14, so a fixed metre
                     *   figure would either shave a whole valley off or keep
                     *   every tremor of the hand.
                     */
                    const tolerance = simplifyToleranceM(zoom, points[0].lat)
                    push(simplifyRing(points, tolerance))
                    setPencil(false)
                  },
                }
              : undefined
          }
        />

        {selected === null ? (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-card bg-surface-overlay p-4 shadow-lift">
            <p className="text-caption text-content-secondary">{t('regionEdit.pickHint')}</p>
          </div>
        ) : (
          <div
            data-testid="region-edit-bar"
            className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 rounded-card
                       bg-surface-overlay p-3 shadow-lift"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-caption font-semibold text-content-primary">
                {region?.name}
              </p>
              <p className="muted numeric" data-testid="region-dunams">
                {t('regionEdit.area', { dunams: dunams.toLocaleString('en-US') })}
                {' · '}
                {t('regionEdit.vertices', { count: draft.length })}
              </p>
            </div>

            <button
              type="button"
              data-testid="region-pencil"
              onClick={() => setPencil((v) => !v)}
              aria-pressed={pencil}
              className={`filter-pill ${pencil ? 'filter-pill-active' : ''}`}
            >
              <Icon name="edit" size={13} />
              {t('regionEdit.redraw')}
            </button>
            <button
              type="button"
              data-testid="region-undo"
              onClick={undo}
              disabled={past.length === 0}
              className="filter-pill disabled:opacity-40"
            >
              <Icon name="undo" size={13} />
              {t('common.undo')}
            </button>
            <button
              type="button"
              data-testid="region-redo"
              onClick={redo}
              disabled={future.length === 0}
              className="filter-pill disabled:opacity-40"
            >
              <Icon name="redo" size={13} />
              {t('common.redo')}
            </button>
            <button
              type="button"
              data-testid="region-restore"
              onClick={restore}
              className="filter-pill"
            >
              <Icon name="history" size={13} />
              {t('regionEdit.restore')}
            </button>
            <button
              type="button"
              data-testid="region-discard"
              onClick={() => selected && open(selected)}
              disabled={!dirty}
              className="btn-secondary py-1.5 text-micro disabled:opacity-40"
            >
              {t('regionEdit.discard')}
            </button>
            <button
              type="button"
              data-testid="region-save"
              onClick={save}
              disabled={!dirty || draft.length < 3}
              className="btn-primary py-1.5 text-micro disabled:opacity-40"
            >
              {t('regionEdit.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
