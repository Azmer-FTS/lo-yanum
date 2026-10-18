import type maplibregl from 'maplibre-gl'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { readCoordinator, regionIsEdited, regions, ringAreaDunams, ringCenter } from '@core/index'
import type { LatLng, PathModel, RegionId } from '@core/index'

import { ChevronForward, Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { ScrollRow } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { PathEditor } from '../../editor/PathEditor'
import type { EditorShape, StartRequest } from '../../editor/PathEditor'
import { pathOf, ringOf, resetRegionRing, saveRegionPath } from '../../settings/regionEdits'

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
 * ★★★ BK (2026-10-18) — ET C'EST L'ÉDITEUR DE TRACÉS QUI EST ICI, LE MÊME QUE
 *   SUR LA CARTE D'UNE FERME (`ui/editor/PathEditor.tsx`). Avant BK, cet écran
 *   avait sa propre grammaire, CONTRAIRE à celle de la ferme : un simple clic
 *   sur un point le supprimait, et les poignées de milieu d'arête, identiques
 *   aux points, en ajoutaient (`docs/bk/diagnostic.md` § 2). Désormais : un
 *   toucher SÉLECTIONNE, « מחיקת הנקודה » ou Suppr supprime, la plume, la main
 *   levée, les points arrondis et leurs poignées, annuler / refaire sans fin.
 *   Les treize régions se recouvrent (7,5 % de leur surface, mesuré) : un
 *   toucher là où plusieurs s'empilent demande laquelle on veut.
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

export function RegionsEditScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const coordinator = useCoreValue(() => readCoordinator())
  const all = useCoreValue(() => regions())

  const [selected, setSelected] = useState<RegionId | null>(null)
  /** Ce que le PO a tracé et pas encore enregistré, pour la région ouverte. */
  const [draft, setDraft] = useState<{ model: PathModel; ring: LatLng[] } | null>(null)
  /** Le tracé tel qu'il était à l'ouverture — « האם השתנה ». */
  const opened = useRef<string>('')
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [, setBusy] = useState(false)
  /** « בטל שינויים » repart du tracé enregistré : l'éditeur est remonté. */
  const [epoch, setEpoch] = useState(0)
  const [startReq, setStartReq] = useState<StartRequest | null>(null)
  const [replaceAsk, setReplaceAsk] = useState(false)
  /** ★★ BL — la confirmation de « שחזור המקור », et la région en cours de « שרטוט מחדש ». */
  const [restoreAsk, setRestoreAsk] = useState(false)
  const [replacing, setReplacing] = useState<string | null>(null)
  const nonce = useRef(0)

  /**
   * ⚠️ COORDINATOR ONLY, AND IT IS A REDIRECT RATHER THAN A HIDDEN BUTTON.
   *    A farmer who reaches this URL — from a bookmark, from a shared link —
   *    must land somewhere real, not on an editor for boundaries that decide
   *    which of his neighbours are counted with him.
   */
  const shapes: EditorShape[] = useMemo(
    () =>
      all.map((r) => {
        const own = r.id === selected && draft
        return {
          id: r.id,
          label: r.name,
          color: `rgb(${r.rgb})`,
          ring: own ? draft.ring : ringOf(r.id),
          path: own ? draft.model : pathOf(r.id),
        }
      }),
    [all, selected, draft],
  )

  if (!coordinator) return null

  const open = (id: string | null): void => {
    setSelected(id as RegionId | null)
    setDraft(null)
    setReplaceAsk(false)
    setRestoreAsk(false)
    opened.current = id ? JSON.stringify(pathOf(id as RegionId)) : ''
  }

  const dirty = selected !== null && draft !== null && JSON.stringify(draft.model) !== opened.current

  const save = (): void => {
    if (!selected || !draft || draft.ring.length < 3) return
    saveRegionPath(selected, draft.ring, draft.model)
    opened.current = JSON.stringify(draft.model)
    setDraft(null)
  }

  const discard = (): void => {
    setDraft(null)
    setEpoch((n) => n + 1)
  }

  /**
   * ★★ BL — « שחזור המקור » N'EST PLUS DANS LA BARRE. C'est une action
   *   destructrice (elle efface le tracé du PO pour cette région) : elle vit
   *   dans « ⋯ », derrière une confirmation qui NOMME ce qui sera effacé et
   *   combien de formes sont concernées. Annuler, dans la barre, couvre le
   *   besoin courant.
   */
  const restore = (): void => {
    if (!selected) return
    resetRegionRing(selected)
    setRestoreAsk(false)
    open(selected)
    setEpoch((n) => n + 1)
  }

  const selectedRegion = all.find((r) => r.id === selected) ?? null
  const selectedEdited = selected ? regionIsEdited(selected) : false

  /**
   * The washes. The one being edited is drawn by the editor, on top; every
   * other one is dimmed to a quarter, which is enough to read a seam against
   * and not enough to argue with the line under the finger.
   *
   * ★★ BL — pendant un « שרטוט מחדש », la région remplacée n'a plus d'aplat :
   *   l'éditeur la montre en POINTILLÉS, nommés dans la barre (« la forme
   *   d'origine »), et le PO peut la masquer.
   */
  const polygons = all
    .filter((r) => r.id !== replacing)
    .map((r) => ({
      id: `region-${r.id}`,
      /* La région ouverte : son tracé EN COURS (pas encore enregistré), sous le contour de l'éditeur. */
      ring: r.id === selected && draft ? draft.ring : ringOf(r.id),
      color: r.id === selected ? `rgb(${r.rgb})` : `rgb(${r.rgb} / 0.28)`,
      emphasis: r.id === selected,
    }))

  const centre = selected ? ringCenter(ringOf(selected)) : undefined

  const confirmBox = (testId: string, text: string, yes: { testId: string; label: string; onClick: () => void; danger?: boolean }, no: () => void) => (
    <div role="alertdialog" data-testid={testId} className="flex flex-wrap items-center gap-2 rounded-card bg-surface-high px-3 py-2 ring-1 ring-status-warn">
      <span className="basis-full text-caption font-semibold text-content-primary">{text}</span>
      <button type="button" data-testid={yes.testId} className={`min-h-11 py-1.5 text-micro ${yes.danger ? 'btn-secondary text-status-danger-ink' : 'btn-primary'}`} onClick={yes.onClick}>
        {yes.label}
      </button>
      <button type="button" className="btn-secondary min-h-11 py-1.5 text-micro" onClick={no}>
        {t('common.cancel')}
      </button>
    </div>
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
          guess" is answerable at a glance. ★★ BL — et SA SURFACE : elle
          était répétée en bas, dans le panneau ; elle n'est plus qu'ici. */}
      <div className="sticky-top -mx-4 px-4 lg:-mx-5 lg:px-5" style={{ top: 'var(--shell-top, 0px)' }}>
        <div data-title-row="" className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <button
            type="button"
            /* ★★ AX2.4 — on revient d'où l'on vient (les fermes ou les réglages). */
            onClick={() => (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate('/coordinator/settings'))}
            aria-label={t('common.back')}
            data-testid="regions-back"
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
            the side that has more, and the same chevron. */}
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
              className={`filter-pill h-auto min-h-11 flex-wrap gap-x-1.5 gap-y-0 py-1 ${selected === r.id ? 'filter-pill-active' : ''}`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-pill"
                style={{ background: `rgb(${r.rgb})` }}
              />
              <span className="whitespace-nowrap">{r.name}</span>
              <bdi className="numeric whitespace-nowrap text-micro text-content-muted" data-testid={`region-area-${r.id}`}>
                {t('editor.area', { n: Math.round(ringAreaDunams(r.id === selected && draft ? draft.ring : ringOf(r.id))).toLocaleString('he-IL') })}
              </bdi>
              {regionIsEdited(r.id) && <Icon name="check" size={11} />}
            </button>
          ))}
        </ScrollRow>

        {/* ★★ BL — LA BARRE D'OUTILS, ICI, EN HAUT, ET TOUJOURS À SA PLACE.
            Sans région ouverte elle reste là, outils éteints, et dit quoi faire :
            rien ne saute quand on en ouvre une. Plus rien ne flotte sur la carte. */}
        <div className="mt-2" data-testid="region-toolbar">
          <PathEditor
            key={epoch}
            map={map}
            entityLabel={t('regionEdit.entity')}
            shapes={shapes}
            showShapeList={false}
            idleHint={t('regionEdit.pickHint')}
            kinds={[{ kind: 'region', label: selectedRegion?.name ?? t('regionEdit.entity'), color: selectedRegion ? `rgb(${selectedRegion.rgb})` : '#2563eb' }]}
            activeId={selected}
            onActiveChange={(id) => {
              /* « סיום » ou une autre région : le tracé en cours est ENREGISTRÉ, jamais perdu en silence. */
              if (id === selected) return
              if (dirty) save()
              open(id)
            }}
            start={startReq}
            onBusyChange={setBusy}
            onSessionChange={(s) => setReplacing(s?.replaceId ?? null)}
            onChange={(_id, model, ring) => setDraft({ model, ring })}
            onCreate={(_kind, model, ring, replaceId) => {
              if (!replaceId) return null
              setSelected(replaceId as RegionId)
              setDraft({ model, ring })
              return replaceId
            }}
            onReplace={() => setReplaceAsk(true)}
            menuItems={
              <button
                type="button"
                role="menuitem"
                data-testid="region-restore"
                disabled={!selectedEdited}
                onClick={() => setRestoreAsk(true)}
                className="btn-secondary min-h-11 justify-start py-1.5 text-micro text-status-danger-ink disabled:opacity-40"
              >
                <Icon name="history" size={13} />
                {selectedEdited ? t('regionEdit.restore') : t('regionEdit.restoreNothing')}
              </button>
            }
            extraActions={
              <>
                <button type="button" data-testid="region-discard" onClick={discard} disabled={!dirty} className="btn-secondary min-h-11 py-1.5 text-micro disabled:opacity-40">
                  {t('regionEdit.discard')}
                </button>
                <button type="button" data-testid="region-save" onClick={save} disabled={!dirty} className="btn-primary min-h-11 py-1.5 text-micro disabled:opacity-40">
                  {t('regionEdit.save')}
                </button>
              </>
            }
            notes={
              <>
                {replaceAsk &&
                  selectedRegion &&
                  confirmBox(
                    'region-replace-confirm',
                    t('regionEdit.replaceConfirm', { name: selectedRegion.name }),
                    {
                      testId: 'region-replace-yes',
                      label: t('regionEdit.replaceYes'),
                      onClick: () => {
                        setReplaceAsk(false)
                        nonce.current += 1
                        setStartReq({ nonce: nonce.current, kind: 'region', tool: 'pen', replaceId: selectedRegion.id })
                      },
                    },
                    () => setReplaceAsk(false),
                  )}
                {restoreAsk &&
                  selectedRegion &&
                  confirmBox(
                    'region-restore-confirm',
                    t('regionEdit.restoreConfirm', {
                      name: selectedRegion.name,
                      points: ringOf(selectedRegion.id).length,
                      area: Math.round(ringAreaDunams(ringOf(selectedRegion.id))).toLocaleString('he-IL'),
                    }),
                    { testId: 'region-restore-yes', label: t('regionEdit.restoreYes'), onClick: restore, danger: true },
                    () => setRestoreAsk(false),
                  )}
              </>
            }
          />
        </div>
      </div>

      <div className="relative -mx-4 min-h-0 flex-1 lg:-mx-5">
        <MapView
          ariaLabel={t('regionEdit.mapLabel')}
          polygons={polygons}
          markers={[]}
          center={centre}
          fit={false}
          zoom={selected ? 8 : 7}
          onMapInstance={setMap}
          quickPin={false}
          regionsLayer={false}
        />
      </div>
    </div>
  )
}
