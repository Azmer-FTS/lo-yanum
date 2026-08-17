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
import { MapView } from '../../components/MapView'
import { readStatusColor, readToken } from '../../components/badges'
import {
  FormActions,
  FormSection,
  TextArea,
  TextField,
} from '../../components/fields'
import { PageHeader } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

/** R5.2 — anchor point create/edit, reached from the farm detail screen. */
export function AnchorFormScreen() {
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
      farm?.position ?? { lat: NEGEV_CENTER.lat, lng: NEGEV_CENTER.lng },
  )
  const [instructions, setInstructions] = useState(
    (existing?.instructions ?? []).join('\n'),
  )
  const [accessDescription, setAccessDescription] = useState(
    existing?.accessDescription ?? '',
  )
  const [touched, setTouched] = useState(false)

  if (!farm) return <Navigate to="/coordinator/farms" replace />

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

  return (
    <div className="mx-auto max-w-5xl">
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
            className="md:col-span-2"
          />
        </FormSection>

        {/* F6 — THE MAP IS THE COORDINATE FIELD NOW.
            This screen used to carry a 14 rem preview and a DISABLED "pick on
            map" button, which is the worst of both: a map too small to read and
            a control that admits it does nothing, next to two decimal-degree
            fields nobody can fill from memory. The map is now the primary input
            — click to place, drag to adjust — and the numbers below it are the
            read-out, still typeable for the case where a farmer dictates
            coordinates over the phone. */}
        <FormSection title={t('form.sectionLocation')}>
          <div className="md:col-span-2">
            <MapView
              ariaLabel={t('a11y.map')}
              className="h-[46dvh] min-h-[20rem] w-full lg:h-[30rem]"
              center={farm.position}
              zoom={14}
              onMapClick={setPosition}
              markers={[
                {
                  id: 'farm',
                  position: farm.position,
                  color: readStatusColor(farm.status),
                  title: farm.name,
                  subtitle: farm.locality,
                  kind: 'farm',
                },
                {
                  id: 'anchor-preview',
                  position,
                  color: readToken('--accent'),
                  title: name || t('anchor.title'),
                  kind: 'anchor',
                  emphasis: true,
                  draggable: true,
                  onDragEnd: setPosition,
                },
              ]}
            />
            {/* G2.2 — the coordinates are a read-out, not an input. */}
            <p className="muted mt-2 flex items-center gap-1.5">
              <Icon name="pin" size={14} />
              {t('anchor.mapHintDrag')}
              <span className="ltr-nums ms-auto" dir="ltr">
                {formatCoords(position)}
              </span>
            </p>
          </div>
        </FormSection>

        <FormSection title={t('anchor.instructions')}>
          <TextArea
            label={t('form.instructions')}
            value={instructions}
            onChange={setInstructions}
            rows={6}
            hint={t('form.instructionsHint')}
            className="md:col-span-2"
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
            className="md:col-span-2"
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
  )
}
