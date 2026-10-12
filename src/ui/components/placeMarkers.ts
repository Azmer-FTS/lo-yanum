import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { branchLayerKeys, getInstitutions, getVisibleFarms, getVisibleLeads, isInstitutionEngaged, pinGlyphFor } from '@core/index'
import type { Farm, FarmBranch, Institution, InstitutionEngagement, Lead, LeadStatus } from '@core/index'

import { entityMarkerKind, readStatusColor, readToken } from './badges'
import type { MapMarker } from './MapCanvas'
import { useCoreValue } from '../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BD 3 · 4 (2026-10-12) — LES TROIS FAMILLES DE LIEUX, DESSINÉES PAREIL
 *    SUR TOUTES LES CARTES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Avant BD, l'écran des institutions et celui des contacts dessinaient leurs
 * points avec la silhouette de FERME (le genre par défaut) : une ישיבה portait
 * une grange. La règle tient en une phrase — LA COULEUR DIT LE STATUT, L'ICÔNE
 * DIT CE QU'IL Y A SUR PLACE — et elle est écrite ici, une fois :
 *   · ferme : la couleur de son statut, l'icône de sa nature (`pinGlyphFor`),
 *     repliée par nature (`branchLayerKeys`) ;
 *   · institution : la couleur de son engagement, l'école (le carré à toque,
 *     qui « marche déjà bien »), repliée signée / les autres ;
 *   · contact à traiter : la couleur de son statut, un combiné en contour.
 * Chaque écran garde SA famille comme sujet et reçoit les deux autres en
 * contexte (`useContextMarkers`), gouvernées par les couches de la légende.
 */
export const ENGAGEMENT_TOKEN: Record<InstitutionEngagement, string> = {
  not_contacted: '--status-info',
  contacted: '--status-warn',
  interested: '--accent',
  signed: '--status-violet',
  not_relevant: '--text-muted',
}

export const LEAD_STATUS_TOKEN: Record<LeadStatus, string> = {
  not_called: '--status-info',
  no_answer: '--status-warn',
  message_sent: '--status-warn',
  call_back: '--accent',
  meeting_set: '--status-success',
  not_now: '--text-muted',
  not_interested: '--text-muted',
}

/** L'icône et les replis d'une ferme (ou d'un moshav). */
export function farmPin(farm: { entityKind?: Farm['entityKind']; branches?: readonly FarmBranch[] }): Pick<MapMarker, 'kind' | 'glyph' | 'layerTags'> {
  return { kind: entityMarkerKind(farm), glyph: pinGlyphFor(farm), layerTags: branchLayerKeys(farm) }
}

export function institutionPin(i: Pick<Institution, 'engagement' | 'positionUncertain'>): Pick<MapMarker, 'kind' | 'color' | 'layerTags' | 'uncertain' | 'glyph'> {
  return { kind: 'institution', glyph: 'institution', color: readToken(ENGAGEMENT_TOKEN[i.engagement]), layerTags: [isInstitutionEngaged(i) ? 'inst:signed' : 'inst:other'], uncertain: i.positionUncertain }
}

export function leadPin(l: Pick<Lead, 'status'>): Pick<MapMarker, 'kind' | 'color' | 'glyph' | 'hollow'> {
  return { kind: 'lead', glyph: 'lead', color: readToken(LEAD_STATUS_TOKEN[l.status]), hollow: true }
}

export type PlaceFamily = 'farms' | 'institutions' | 'leads'
/** Le contexte d'un écran dont les fermes sont le sujet. */
export const NOT_FARMS: readonly PlaceFamily[] = ['institutions', 'leads']

/**
 * Les marqueurs des familles QUI NE SONT PAS le sujet de l'écran, pour
 * composer la carte (les couches de la légende décident ensuite).
 */
export function useContextMarkers(families: readonly PlaceFamily[]): MapMarker[] {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const want = families.join(',')
  const farms = useCoreValue(() => (families.includes('farms') ? getVisibleFarms() : EMPTY_FARMS))
  const institutions = useCoreValue(() => (families.includes('institutions') ? getInstitutions() : EMPTY_INST))
  const leads = useCoreValue(() => (families.includes('leads') ? getVisibleLeads() : EMPTY_LEADS))
  return useMemo(() => {
    const out: MapMarker[] = []
    for (const f of farms) {
      if (f.positionMissing) continue
      out.push({ id: `ctx-farm-${f.id}`, position: f.position, color: readStatusColor(f.status), title: f.name, subtitle: t(`farmStatus.${f.status}`), ...farmPin(f), onSelect: () => navigate(`/coordinator/farms/${f.id}`) })
    }
    for (const i of institutions) {
      if (!i.position || i.engagement === 'not_relevant') continue
      out.push({ id: `ctx-inst-${i.id}`, position: i.position, title: i.name, subtitle: t(`institutions.engagement.${i.engagement}`), ...institutionPin(i), onSelect: () => navigate(`/coordinator/institutions?open=${i.id}`) })
    }
    for (const l of leads) {
      if (!l.position) continue
      out.push({ id: `ctx-lead-${l.id}`, position: l.position, title: l.name, subtitle: t(`leads.status.${l.status}`), ...leadPin(l), onSelect: () => navigate(`/coordinator/leads/${l.id}`) })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, farms, institutions, leads, t, navigate])
}

const EMPTY_FARMS: Farm[] = []
const EMPTY_INST: Institution[] = []
const EMPTY_LEADS: Lead[] = []
