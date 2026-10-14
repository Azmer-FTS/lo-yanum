import { criterionValue, measuredRoad } from './reachOrder'
import type { ReachCriterion, ReachRow } from './reachOrder'
import { linkMinutes } from './coverage'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BG (2026-10-14) — LE DOCUMENT DE L'INSTITUTION : SON ADRESSE, SES
 *    VERSIONS, SES FERMES. LA PARTIE PURE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ UNE ADRESSE STABLE PAR INSTITUTION, construite sur son identifiant :
 *   `<id>/document.pdf`. Le fichier y est ÉCRASÉ à chaque génération : un lien
 *   envoyé il y a un mois affiche toujours la dernière version, sans renvoi.
 *
 * ★ LES VERSIONS PRÉCÉDENTES À CÔTÉ, horodatées dans leur NOM (`<id>/versions/
 *   AAAAMMJJ-HHMMSS.pdf`, en UTC) — « qu'est-ce que je leur avais envoyé la
 *   première fois ». ⛔ L'horodatage n'est QUE dans le nom du fichier : le
 *   document lui-même ne porte AUCUNE date (charte du PO).
 *
 * PUR (`bgpass`).
 */

export const INSTITUTION_DOCS_BUCKET = 'institution-docs'

/** L'adresse stable : la dernière version, toujours. */
export const institutionDocPath = (institutionId: string): string => `${institutionId}/document.pdf`

export const institutionDocVersionsFolder = (institutionId: string): string => `${institutionId}/versions`

/** `AAAAMMJJ-HHMMSS`, en UTC : trié comme du texte = trié dans le temps. */
export function versionStamp(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}-${p(at.getUTCHours())}${p(at.getUTCMinutes())}${p(at.getUTCSeconds())}`
}

export function institutionDocVersionPath(institutionId: string, at: Date): string {
  return `${institutionDocVersionsFolder(institutionId)}/${versionStamp(at)}.pdf`
}

/** L'instant d'une version, relu de son nom ; `null` pour un nom étranger. */
export function parseVersionName(name: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.pdf$/.exec(name)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Les versions, la plus récente d'abord ; les noms étrangers sont ignorés. */
export function sortVersions(names: readonly string[]): Array<{ name: string; at: Date }> {
  return names
    .map((name) => ({ name, at: parseVersionName(name) }))
    .filter((v): v is { name: string; at: Date } => v.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
}

/** L'adresse publique d'un objet du bucket (sans client : elle se calcule). */
export function publicDocUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${INSTITUTION_DOCS_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
}

// --- Les fermes du document ---------------------------------------------------

export interface DocFarmRow {
  id: string
  name: string
  locality: string
  /** Route, en km (une décimale sous 10). `null` = pas mesurée. */
  km: number | null
  /** Durée avec marge et nuit. `null` = pas mesurée. */
  minutes: number | null
}

/**
 * Les deux tableaux du document : les fermes LIÉES à l'institution (quelle que
 * soit leur distance — le lien est un choix du PO), puis les fermes PROPOSÉES :
 * dans le seuil, pas encore liées. Les deux triés selon le critère du PO.
 */
export function institutionDocFarms<F extends { id: string; name: string; locality: string }>(
  rows: ReadonlyArray<ReachRow<F>>,
  linkedIds: ReadonlySet<string>,
  c: ReachCriterion,
  inside: (r: ReachRow<F>) => boolean,
): { linked: DocFarmRow[]; proposed: DocFarmRow[] } {
  const order = (a: ReachRow<F>, b: ReachRow<F>) => {
    const va = criterionValue(a.road, c)
    const vb = criterionValue(b.road, c)
    if (va !== null && vb !== null && va !== vb) return va - vb
    if (va === null && vb !== null) return 1
    if (va !== null && vb === null) return -1
    return a.air - b.air || a.farm.name.localeCompare(b.farm.name, 'he')
  }
  const row = (r: ReachRow<F>): DocFarmRow => {
    const m = measuredRoad(r.road)
    return { id: r.farm.id, name: r.farm.name, locality: r.farm.locality, km: m ? m.km : null, minutes: m ? linkMinutes(m.seconds, c.factor) : null }
  }
  const linked = rows.filter((r) => linkedIds.has(r.farm.id)).sort(order).map(row)
  const proposed = rows.filter((r) => !linkedIds.has(r.farm.id) && inside(r)).sort(order).map(row)
  return { linked, proposed }
}

// --- La charte : AUCUNE date --------------------------------------------------

/**
 * Une date, sous les formes qu'un texte hébreu ou français peut porter :
 * 14.10.2026, 14/10/26, 2026-10-14, 14.10. ⚠️ Un rayon (« 35 ק״מ »), une durée
 * (« 28 דק׳ ») ou un numéro de téléphone n'en sont pas.
 */
const DATE_RE = /(^|[^\d])(\d{1,2}[./]\d{1,2}([./]\d{2,4})?|\d{4}-\d{2}-\d{2})(?![\d])/

export function hasDate(text: string): boolean {
  /* Les numéros de téléphone (05x-xxx…) ne contiennent ni « . » ni « / » entre
     deux groupes de deux chiffres : ils ne répondent pas. Les décimales d'un
     kilométrage (« 7.4 ») ont un seul chiffre après le point : ignorées. */
  const m = DATE_RE.exec(text)
  if (!m) return false
  const token = m[2]
  if (/^\d{1,3}\.\d$/.test(token)) return false
  return true
}
