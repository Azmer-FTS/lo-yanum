import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import {
  createAnchorPoint,
  getAnchorPoint,
  getFarm,
  updateAnchorPoint,
} from '@core/index'
import type { AnchorDraft } from '@core/index'

import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { readToken } from '../../components/badges'
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
  // few hundred metres, so this is a better starting point than an empty field.
  const [lat, setLat] = useState(
    String(existing?.position.lat ?? farm?.position.lat ?? ''),
  )
  const [lng, setLng] = useState(
    String(existing?.position.lng ?? farm?.position.lng ?? ''),
  )
  const [instructions, setInstructions] = useState(
    (existing?.instructions ?? []).join('\n'),
  )
  const [accessDescription, setAccessDescription] = useState(
    existing?.accessDescription ?? '',
  )
  const [touched, setTouched] = useState(false)

  if (!farm) return <Navigate to="/coordinator/farms" replace />

  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))

  const errors = {
    name: !name.trim() ? t('form.required') : undefined,
    lat:
      !Number.isFinite(num(lat)) || num(lat) < -90 || num(lat) > 90
        ? t('form.invalidNumber')
        : undefined,
    lng:
      !Number.isFinite(num(lng)) || num(lng) < -180 || num(lng) > 180
        ? t('form.invalidNumber')
        : undefined,
    // Without this, a kosher-phone volunteer gets an SMS he cannot act on.
    accessDescription: !accessDescription.trim() ? t('form.required') : undefined,
  }
  const valid = Object.values(errors).every((e) => e === undefined)
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined)

  const position = {
    lat: Number.isFinite(num(lat)) ? num(lat) : farm.position.lat,
    lng: Number.isFinite(num(lng)) ? num(lng) : farm.position.lng,
  }

  const submit = () => {
    setTouched(true)
    if (!valid) return

    const draft: AnchorDraft = {
      farmId: farm.id,
      name: name.trim(),
      position: { lat: num(lat), lng: num(lng) },
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

        <FormSection
          title={t('form.sectionLocation')}
          action={
            <button
              type="button"
              disabled
              title={t('form.pickOnMapHint')}
              className="btn-ghost py-1.5 opacity-50"
            >
              <Icon name="pin" size={15} />
              {t('form.pickOnMap')}
            </button>
          }
        >
          <TextField
            label={t('form.lat')}
            value={lat}
            onChange={setLat}
            error={show('lat')}
            type="number"
            ltr
            required
          />
          <TextField
            label={t('form.lng')}
            value={lng}
            onChange={setLng}
            error={show('lng')}
            type="number"
            ltr
            required
            hint={t('form.pickOnMapHint')}
          />
          <div className="md:col-span-2">
            <MapView
              ariaLabel={t('a11y.map')}
              className="h-56 w-full"
              interactive={false}
              center={position}
              zoom={13}
              markers={[
                {
                  id: 'anchor-preview',
                  position,
                  color: readToken('--accent'),
                  title: name || t('anchor.title'),
                  emphasis: true,
                },
              ]}
            />
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
