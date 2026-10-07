import type { Lead } from '../types'

/**
 * ★★ AS6 — pistes de DÉMONSTRATION. Noms et numéros fictifs (plage 050-000…),
 * aucune vraie personne : le jumeau /demo est public.
 */
const base = {
  email: '',
  notes: '',
  raw: '',
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  convertedFarmId: null,
  convertedAt: null,
} as const

export const LEADS: Lead[] = [
  { ...base, id: 'lead-demo-01', name: 'משק כהן', contactName: 'אבי כהן', phone: '050-0000101', place: 'נתיבות', position: { lat: 31.4214, lng: 34.5882 }, regionId: null, status: 'not_called', source: 'paste', rank: 0 },
  { ...base, id: 'lead-demo-02', name: 'רפת השקמה', contactName: 'דנה לוי', phone: '050-0000102', place: 'שדרות', position: null, regionId: null, status: 'not_called', source: 'paste', rank: 1 },
  { ...base, id: 'lead-demo-03', name: 'דיר הגבעה', contactName: 'יוסי מזרחי', phone: '050-0000103', place: '', position: null, regionId: 'negev', status: 'no_answer', source: 'paste', rank: 0 },
  { ...base, id: 'lead-demo-04', name: 'חוות האלה', contactName: 'רונית', phone: '050-0000104', place: 'אופקים', position: { lat: 31.3133, lng: 34.6214 }, regionId: null, status: 'call_back', source: 'manual', rank: 0, notes: 'לחזור אחרי החג' },
  { ...base, id: 'lead-demo-05', name: 'גד״ש הדגמה', contactName: 'משה', phone: '050-0000105', place: '', position: null, regionId: null, status: 'not_now', source: 'portal', rank: 0, notes: 'יש להם שומר קבוע' },
]
