import { permissionStatus } from './geolocate'
import type { PermissionStatus } from './geolocate'
import { isStandalone } from './standalone'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG7 (2026-09-09) — MESURER AU LIEU D'EXPLIQUER.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « La permission de localisation est redemandée à chaque session alors que
 *     l'app EST installée sur l'écran d'accueil du PO. L'explication donnée en
 *     AF (“il faut l'installer”) ne tient donc pas. Mesure le comportement
 *     réel, trouve la cause […]. Si la limite est réellement imposée par iOS,
 *     prouve-le avec la mesure plutôt que de l'affirmer. »
 *
 * ★★ CE FICHIER EST LA MESURE, ET IL EXISTE PARCE QU'AUCUNE PORTE NE PEUT LA
 *    FAIRE À NOTRE PLACE. Playwright émule un viewport, un thème, une langue
 *    et une position ; il ne peut pas dire à une page qu'elle a été lancée
 *    depuis l'écran d'accueil d'un iPad (c'est écrit noir sur blanc dans
 *    `standalone.ts`, et c'est la raison pour laquelle `data-standalone` est un
 *    ATTRIBUT et pas une media query). La seule mesure possible sur l'appareil
 *    du PO doit donc être prise PAR l'application, sur son appareil, et lue
 *    ensuite.
 *
 * ★★ TROIS FAITS PAR LANCEMENT, ET CHACUN ÉLIMINE UNE HYPOTHÈSE :
 *
 *    1. `standalone` — l'app tourne-t-elle VRAIMENT comme application
 *       installée ? Si la réponse est « non » alors que le PO lance depuis son
 *       icône, la cause est trouvée et elle n'est pas dans notre code : son
 *       icône est un signet Safari et non une PWA, et Safari n'accorde à un
 *       SITE qu'une permission de session.
 *    2. `permission` — ce que le SYSTÈME répond avant qu'on demande quoi que
 *       ce soit. `granted` au lancement veut dire que la permission a survécu
 *       et que le symptôme est ailleurs ; `prompt` veut dire qu'elle n'a pas
 *       survécu ; `unknown` veut dire que le navigateur ne sait pas répondre à
 *       la question — et c'est un résultat en soi, pas une erreur de mesure
 *       (voir la note sur `permissionStatus` : Safari n'a pas toujours accepté
 *       « geolocation » comme nom de permission, et une origine qui ne peut pas
 *       LIRE son état ne peut pas non plus le mettre en cache).
 *    3. `prompts` — combien de fois l'application a réellement interrogé
 *       l'appareil pendant la session précédente. C'est ce qui distingue « le
 *       système redemande » de « c'est nous qui redemandons », et c'est la
 *       seule des trois dont la réponse serait de notre ressort.
 *
 * ⚠️ RIEN N'EST ENVOYÉ NULLE PART. Ces lignes vivent dans le `localStorage` de
 *    SON appareil, comme ses réglages, et l'écran de diagnostic a un bouton
 *    pour les copier et un pour les effacer. Un programme qui mesure le
 *    comportement de son utilisateur et l'expédie ailleurs serait un autre
 *    genre de programme.
 */

const KEY = 'lo-yanum:geo-diag'
/** Vingt lancements suffisent à voir un motif et tiennent dans une capture. */
const MAX_ROWS = 20

export interface GeoDiagRow {
  /** Instant du lancement, en millisecondes. */
  at: number
  standalone: boolean
  permission: PermissionStatus
  /** Interrogations réelles de l'appareil pendant CETTE session. */
  prompts: number
}

/**
 * ⚠️★★ LE TABLEAU EST MIS EN CACHE, ET C'EST UN DÉFAUT MESURÉ PLUTÔT QU'UNE
 *    OPTIMISATION. La première version relisait `localStorage` à chaque appel
 *    et rendait donc un TABLEAU NEUF à chaque fois. `useSyncExternalStore`
 *    compare les instantanés par IDENTITÉ : un instantané qui n'est jamais
 *    égal à lui-même fait re-rendre le composant en boucle, et React finit par
 *    lever « The result of getSnapshot should be cached ». `bun run abpass`
 *    l'a trouvé en soixante secondes d'attente sur un champ de l'écran de
 *    réglages qui n'arrivait jamais — parce que l'écran ENTIER plantait, pas
 *    seulement ce bloc-ci.
 *
 *    C'est la même règle que `publish` dans `data/auth.ts` écrit en toutes
 *    lettres : « l'égalité de référence est le contrat de l'instantané ».
 */
let cache: GeoDiagRow[] | undefined

function read(): GeoDiagRow[] {
  if (cache !== undefined) return cache
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    cache = Array.isArray(parsed) ? (parsed as GeoDiagRow[]) : []
  } catch {
    cache = []
  }
  return cache
}

function write(rows: GeoDiagRow[]): void {
  cache = rows.slice(-MAX_ROWS)
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Un appareil qui refuse le stockage ne peut pas être diagnostiqué ainsi.
  }
  for (const l of listeners) l()
}

const listeners = new Set<() => void>()

export function subscribeGeoDiag(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function geoDiagRows(): GeoDiagRow[] {
  return read()
}

export function clearGeoDiag(): void {
  cache = []
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Idem.
  }
  for (const l of listeners) l()
}

/** L'index de la ligne de CETTE session, pour l'incrémenter au fil de l'eau. */
let rowIndex = -1

/**
 * Une ligne est ouverte au démarrage de l'application.
 *
 * ⚠️ APPELÉE UNE SEULE FOIS, DEPUIS `main.tsx`, ET AVANT TOUT ÉCRAN. Si elle
 *    était appelée depuis un composant, un simple changement de route
 *    produirait une ligne de plus et le décompte des « lancements » ne voudrait
 *    plus rien dire — ce qui est exactement le genre d'erreur qui rendrait
 *    cette mesure aussi peu fiable que l'explication qu'elle remplace.
 */
export async function openGeoDiagSession(): Promise<void> {
  if (rowIndex >= 0) return
  const rows = read()
  const row: GeoDiagRow = {
    at: Date.now(),
    standalone: isStandalone(),
    permission: await permissionStatus(),
    prompts: 0,
  }
  rows.push(row)
  rowIndex = Math.min(rows.length, MAX_ROWS) - 1
  write(rows)
}

/**
 * Une interrogation réelle de l'appareil vient d'avoir lieu.
 *
 * ★ APPELÉE PAR `geolocate.ts` ET PAR PERSONNE D'AUTRE, ce qui est ce qui rend
 *   le chiffre vrai : depuis AF2.3 il n'existe qu'une porte vers
 *   `navigator.geolocation`, donc compter à la porte compte tout.
 */
export function noteGeoPrompt(): void {
  if (rowIndex < 0) return
  const rows = read()
  const row = rows[rowIndex]
  if (!row) return
  row.prompts += 1
  write(rows)
}

/** Les mesures, en texte, pour le bouton « copier ». */
export function geoDiagText(): string {
  return geoDiagRows()
    .map(
      (r) =>
        `${new Date(r.at).toISOString()}  standalone=${r.standalone ? 'yes' : 'no'}  permission=${r.permission}  prompts=${r.prompts}`,
    )
    .join('\n')
}
