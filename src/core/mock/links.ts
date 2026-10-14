import type { FarmInstitutionLink } from '../farmLinks'

/**
 * ★★ BG — le parrainage du jumeau de démonstration : deux fermes de la
 * ישיבת ההסדר גבעות הנגב, une de la מכינת אופק הדרום, et UNE ferme liée aux
 * deux (l'exception que le PO doit repérer, 5.4). Noms inventés, comme tout
 * le jumeau.
 */
const link = (id: string, farmId: string, institutionId: string): FarmInstitutionLink => ({
  id,
  farmId,
  institutionId,
  createdAt: '2026-10-01T08:00:00.000Z',
  createdBy: null,
})

export const FARM_INSTITUTION_LINKS: FarmInstitutionLink[] = [
  link('fil-demo-01', 'farm-01', 'inst-demo-02'),
  link('fil-demo-02', 'farm-02', 'inst-demo-02'),
  link('fil-demo-03', 'farm-03', 'inst-demo-01'),
  link('fil-demo-04', 'farm-03', 'inst-demo-02'),
]
