import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import {
  NEGEV_CENTER,
  createAnchorPoint,
  formatCoords,
  getAnchorPoint,
  getFarm,
  updateAnchorPoint,
} from '@core/index'
import type { AnchorDraft, LatLng } from '@core/index'

import { Icon } from '../../components/Icon'
import { MapSplit } from '../../components/MapSplit'
import { PLACE_FORM_SPLIT } from '../../components/formPage'
import { MapView } from '../../components/MapView'
import { farmMarkerColor, postColor } from '../../components/badges'
import { farmPin } from '../../components/placeMarkers'
import {
  FormActions,
  FormSection,
  TextArea,
  TextField,
} from '../../components/fields'
import {
  FormWaiting,
  PageHeader,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useHydrated } from '../../hooks/useDataState'

/**
 * R5.2 — anchor point create/edit, reached from the farm detail screen.
 * ★★ BD 8a — les champs naissent du point AU MONTAGE : tant que la ferme (et,
 * en édition, le point) ne sont pas arrivés, aucun formulaire saisissable ;
 * arrivés, il monte une fois, rempli (`key`).
 */
export function AnchorFormScreen() {
  const { farmId = '', anchorId } = useParams()
  const farm = useCoreValue(() => getFarm(farmId))
  const existing = useCoreValue(() => (anchorId ? getAnchorPoint(anchorId) : null))
  const hydrated = useHydrated()
  if (!farm || (anchorId && !existing)) return hydrated ? <Navigate to={farm ? `/coordinator/farms/${farmId}` : '/coordinator/farms'} replace /> : <FormWaiting />
  return <AnchorForm key={`${farmId}:${anchorId ?? 'new'}`} />
}

function AnchorForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { farmId = '', anchorId } = useParams()

  const farm = useCoreValue(() => getFarm(farmId))
  const existing = useCoreValue(() => (anchorId ? getAnchorPoint(anchorId) : null))
  const isEdit = Boolean(anchorId)

  const [name, setName] = useState(existing?.name ?? '')
  // Default a new anchor to the farm's own coordinates — it is always within a
  // few hundred metres, so this is a better starting point than an empty map.
  const [position, setPosition] = useState<LatLng>(
    existing?.position ??
      // ⛔ AN2 — pas le point de repli d'une ferme sans position.
      (farm && !farm.positionMissing ? farm.position : null) ?? { lat: NEGEV_CENTER.lat, lng: NEGEV_CENTER.lng },
  )
  const [instructions, setInstructions] = useState(
    (existing?.instructions ?? []).join('\n'),
  )
  const [accessDescription, setAccessDescription] = useState(
    existing?.accessDescription ?? '',
  )
  const [touched, setTouched] = useState(false)

  // N1 (2026-09-02) — a missing record before the snapshot has arrived is
  // "not loaded yet", never "gone" — ★★ BD 8a : gardé par `AnchorFormScreen`.
  if (!farm) return null

  const errors = {
    name: !name.trim() ? t('form.required') : undefined,
    // Without this, a kosher-phone volunteer gets an SMS he cannot act on.
    accessDescription: !accessDescription.trim() ? t('form.required') : undefined,
  }
  const valid = Object.values(errors).every((e) => e === undefined)
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined)

  const submit = () => {
    setTouched(true)
    if (!valid) return

    const draft: AnchorDraft = {
      farmId: farm.id,
      name: name.trim(),
      position,
      instructions: instructions
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      accessDescription: accessDescription.trim(),
    }

    if (isEdit && anchorId) updateAnchorPoint(anchorId, draft)
    else createAnchorPoint(draft)
    navigate(`/coordinator/farms/${farm.id}`)
  }

  /* F6/P0bis.1 — THE MAP IS THE COORDINATE FIELD, AND IT IS ON THE LEFT.
     This screen used to carry a 14 rem preview and a DISABLED "pick on map"
     button, which is the worst of both: a map too small to read next to two
     decimal-degree fields nobody can fill from memory. The map is the primary
     input — click to place, drag to adjust — so under the frozen gabarit it
     takes the left panel and the form reads beside it, which also means the
     pin stays visible while the access description is being written about it. */
  const mapBody = (
    <>
      <MapView
        ariaLabel={t('a11y.map')}
        className="h-full w-full rounded-none"
        center={farm.positionMissing ? position : farm.position}
        zoom={14}
        onMapClick={setPosition}
        markers={[
          // ⛔ AN2 — pas de repère de ferme au point de repli.
          ...(farm.positionMissing ? [] : [{
            id: 'farm',
            position: farm.position,
            color: farmMarkerColor(farm),
            title: farm.name,
            subtitle: farm.locality,
            ...farmPin(farm),
          }]),
          {
            id: 'anchor-preview',
            position,
            color: postColor(),
            title: name || t('anchor.title'),
            kind: 'anchor',
            emphasis: true,
            draggable: true,
            onDragEnd: setPosition,
          },
        ]}
      />
      {/* G2.2 — the coordinates are a read-out, not an input. */}
      <p className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-center gap-1.5 rounded-card bg-surface-overlay/95 px-3 py-2 text-micro text-content-secondary shadow-card backdrop-blur">
        <Icon name="pin" size={14} />
        {t('anchor.mapHintDrag')}
        <span className="ltr-nums ms-auto" dir="ltr">
          {formatCoords(position)}
        </span>
      </p>
    </>
  )

  return (
    <MapSplit
      screenKey="anchor-form"
      ariaLabel={t('form.sectionLocation')}
      breakpoint={PLACE_FORM_SPLIT.breakpoint}
      contentPercent={PLACE_FORM_SPLIT.contentPercent}
      splitHeight={PLACE_FORM_SPLIT.splitHeight}
      map={() => mapBody}
    >
      {() => (
        /* ★★ BD 7 — la page entière (en-tête compris) est le formulaire de lieu. */
        <div data-form-family="lieu" data-form-screen="anchor-form">
      <PageHeader
        title={t(isEdit ? 'anchor.edit' : 'anchor.new')}
        subtitle={farm.name}
        back={{ to: `/coordinator/farms/${farm.id}`, label: farm.name }}
      />

      <div className="flex flex-col gap-4">
        <FormSection title={t('anchor.title')}>
          <TextField
            label={t('form.anchorName')}
            value={name}
            onChange={setName}
            error={show('name')}
            required
            className="col-span-full"
          />
        </FormSection>

        <FormSection title={t('anchor.instructions')}>
          <TextArea
            label={t('form.instructions')}
            value={instructions}
            onChange={setInstructions}
            rows={6}
            hint={t('form.instructionsHint')}
            className="col-span-full"
          />
        </FormSection>

        <FormSection title={t('anchor.access')}>
          <TextArea
            label={t('form.accessDescription')}
            value={accessDescription}
            onChange={setAccessDescription}
            error={show('accessDescription')}
            rows={5}
            hint={t('form.accessHint')}
            required
            className="col-span-full"
          />
        </FormSection>

        <FormActions
          onCancel={() => navigate(`/coordinator/farms/${farm.id}`)}
          cancelLabel={t('common.cancel')}
          submitLabel={t('common.save')}
          onSubmit={submit}
        />
      </div>
        </div>
      )}
    </MapSplit>
  )
}
