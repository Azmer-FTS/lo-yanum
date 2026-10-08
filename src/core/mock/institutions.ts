import { findLocality } from '../gazetteer'
import type { Institution } from '../institutions'

/**
 * ★★ AU3 — institutions de DÉMONSTRATION. Noms INVENTÉS, posés sur de vraies
 * localités du Néguev (le point est celui de la localité, à la CBS près) :
 * le jumeau /demo est public et ne doit nommer aucune vraie institution
 * comme partenaire. Les 64 vraies sont dans la base, jamais ici.
 */
const at = (place: string, dLat = 0, dLng = 0) => {
  const p = findLocality(place)?.position
  return p ? { lat: p.lat + dLat, lng: p.lng + dLng } : null
}
const base = {
  network: '',
  positionUncertain: false,
  contactName: '',
  contactPhone: '',
  notes: '',
  extra: '',
  source: 'import' as const,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
}

export const INSTITUTIONS: Institution[] = [
  { ...base, id: 'inst-demo-01', name: 'מכינת אופק הדרום', locality: 'שדרות', kind: 'mechina', audience: 'mixed', network: 'רשת המכינות (הדגמה)', position: at('שדרות', 0.004, -0.006), engagement: 'signed', contactName: 'נועה', contactPhone: '050-0000201' },
  { ...base, id: 'inst-demo-02', name: 'ישיבת ההסדר גבעות הנגב', locality: 'נתיבות', kind: 'hesder', audience: 'boys', position: at('נתיבות', -0.006, 0.004), engagement: 'signed' },
  { ...base, id: 'inst-demo-03', name: 'מדרשת שבילי הבשור', locality: 'אופקים', kind: 'midrasha', audience: 'girls', position: at('אופקים', 0.005, 0.005), engagement: 'interested' },
  { ...base, id: 'inst-demo-04', name: 'מכינת נחל צין', locality: 'ירוחם', kind: 'mechina', audience: 'boys', position: at('ירוחם'), engagement: 'contacted' },
  { ...base, id: 'inst-demo-05', name: 'מכינת מעלה הרוח', locality: 'מצפה רמון', kind: 'mechina', audience: 'mixed', position: at('מצפה רמון'), engagement: 'not_contacted' },
  { ...base, id: 'inst-demo-06', name: 'ישיבת ההסדר שער הנגב', locality: 'באר שבע', kind: 'hesder', audience: 'boys', position: at('באר שבע', 0.01, 0.01), engagement: 'signed' },
  { ...base, id: 'inst-demo-07', name: 'מדרשת אור המדבר', locality: 'ערד', kind: 'midrasha', audience: 'girls', position: at('ערד'), engagement: 'not_contacted' },
  { ...base, id: 'inst-demo-08', name: 'מכינת עין הבשור', locality: 'אשכול', kind: 'mechina', audience: 'mixed', position: at('מגן', 0.01, 0.02), positionUncertain: true, engagement: 'not_contacted', notes: 'מיקום משוער — לאמת' },
  { ...base, id: 'inst-demo-09', name: 'מכינת שדות לכיש', locality: 'קריית גת', kind: 'mechina', audience: 'boys', position: at('קריית גת'), engagement: 'interested' },
  { ...base, id: 'inst-demo-10', name: 'מדרשת חולות', locality: 'ניצנה', kind: 'midrasha', audience: 'girls', position: at('ניצנה'), engagement: 'not_relevant' },
  { ...base, id: 'inst-demo-11', name: 'מכינת הגבעה הדרומית', locality: 'דימונה', kind: 'mechina', audience: 'mixed', position: null, engagement: 'not_contacted' },
]
