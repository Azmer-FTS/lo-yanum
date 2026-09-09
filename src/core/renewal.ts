import { landRightIssue } from './fields'
import type { Farm } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG5 (2026-09-09) — LE RENOUVELLEMENT ANNUEL, ET C'EST LA DATE DE CHAQUE
 *    FICHE QUI COMMANDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Les documents de l'État sont renouvelés tous les ans ou tous les trois
 *     ans selon la ferme. C'est la date de תוקף ההסכם de chaque fiche qui
 *     commande, pas un calendrier global. »
 *
 * ★★ ET C'EST POUR ÇA QU'IL N'Y A NI « ANNÉE DE CAMPAGNE » NI TÂCHE
 *    PLANIFIÉE. La tentation évidente est un rappel au 1er janvier pour tout
 *    le monde ; elle est fausse deux fois. Une ferme dont l'accord court
 *    jusqu'en mars 2028 recevrait deux rappels inutiles avant d'en avoir
 *    besoin — et apprendrait à les ignorer, ce qui coûte le troisième, qui
 *    comptait. Et une ferme dont l'accord expire en juillet ne recevrait rien
 *    au moment où il faudrait. La file se déduit donc de `landAgreementUntil`,
 *    champ par champ, à chaque affichage : il n'y a aucun état à maintenir,
 *    donc aucun état à resynchroniser le jour où le coordinateur corrige une
 *    date à la main.
 *
 * ★ SOIXANTE JOURS, EN CONSTANTE NOMMÉE ET RÉGLABLE (AG5.1). Deux mois est ce
 *   qu'il faut pour qu'un agriculteur trouve ses papiers, les photographie, et
 *   qu'un coordinateur relance une fois s'il ne l'a pas fait — sans que
 *   l'avertissement soit posé si tôt qu'il devienne du décor.
 */

export const RENEWAL_WINDOW_DAYS_DEFAULT = 60

/** Le jour d'une date ISO, en `YYYY-MM-DD`, pour comparer des chaînes. */
export function dayKeyOf(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Le jour situé `days` jours après `date`. */
export function dayKeyPlus(date: Date, days: number): string {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + days)
  return dayKeyOf(next)
}

export type RenewalState =
  /** Aucune date sur la fiche : rien à renouveler et rien à dire. */
  | 'unknown'
  /** L'échéance est loin. */
  | 'later'
  /** Dans la fenêtre : c'est maintenant qu'on écrit à l'agriculteur. */
  | 'due'
  /**
   * ⚠️ DÉJÀ PASSÉE, ET CETTE FICHE N'EST PAS DANS LA FILE « לחידוש ».
   *    Voir `renewalAndLandRightAreDisjoint` plus bas : c'est AA2bis qui parle
   *    à partir d'ici, et deux avertissements sur la même ligne pour le même
   *    fait est la définition d'un écran qu'on cesse de lire.
   */
  | 'expired'

export interface RenewalStatus {
  state: RenewalState
  /** Jours restants avant l'échéance ; négatif une fois dépassée. `null` si inconnue. */
  daysLeft: number | null
  /** La date elle-même, `YYYY-MM-DD`, ou `null`. */
  until: string | null
}

/**
 * Où en est une fiche de son renouvellement.
 *
 * ⚠️ `todayKey` EST DONNÉ ET JAMAIS LU ICI. Même raison que partout ailleurs
 *    dans @core : une fonction qui lit l'horloge est une fonction qu'une porte
 *    ne peut pas interroger sur le 30 décembre.
 */
export function renewalStatus(
  farm: Pick<Farm, 'landAgreementUntil'>,
  todayKey: string,
  windowDays: number = RENEWAL_WINDOW_DAYS_DEFAULT,
): RenewalStatus {
  const until = (farm.landAgreementUntil ?? '').trim()
  if (until === '') return { state: 'unknown', daysLeft: null, until: null }

  const daysLeft = daysBetween(todayKey, until)
  if (daysLeft === null) return { state: 'unknown', daysLeft: null, until: null }
  if (daysLeft < 0) return { state: 'expired', daysLeft, until }
  if (daysLeft <= windowDays) return { state: 'due', daysLeft, until }
  return { state: 'later', daysLeft, until }
}

/** Jours entiers de `fromKey` à `toKey`, ou `null` si l'une n'est pas une date. */
export function daysBetween(fromKey: string, toKey: string): number | null {
  const a = Date.parse(`${fromKey}T00:00:00Z`)
  const b = Date.parse(`${toKey}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/**
 * ★★ AG5.2 — LA FILE « לחידוש ».
 *
 * Les fiches dont l'accord expire dans la fenêtre, la plus proche échéance
 * d'abord — parce que la seule chose qu'on fait de cette liste est de
 * téléphoner du haut vers le bas.
 */
export function farmsToRenew(
  farms: Farm[],
  todayKey: string,
  windowDays: number = RENEWAL_WINDOW_DAYS_DEFAULT,
): Farm[] {
  return farms
    .filter((f) => renewalStatus(f, todayKey, windowDays).state === 'due')
    .sort((a, b) =>
      (a.landAgreementUntil ?? '').localeCompare(b.landAgreementUntil ?? ''),
    )
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG5.4 — LES DEUX MÉCANISMES SE COMPLÈTENT, ET CE N'EST PAS UNE OPINION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Une ferme dont le document est expiré porte déjà l'avertissement
 *     d'AA2bis. Vérifie que les deux mécanismes se complètent au lieu de se
 *     doubler. »
 *
 * ★ ILS SONT DISJOINTS PAR CONSTRUCTION, ET LA FRONTIÈRE EST LE JOUR MÊME.
 *   `landRightIssue` rend `'expired'` quand `until < today` — STRICTEMENT
 *   avant. `renewalStatus` rend `'due'` quand `0 <= daysLeft <= window` —
 *   donc à partir d'aujourd'hui INCLUS. Aucune fiche ne peut être dans les
 *   deux : ou l'échéance est passée et AA2bis parle, ou elle est devant et la
 *   file « לחידוש » parle. Il n'y a pas d'intervalle où les deux disent la
 *   même chose avec des mots différents.
 *
 * ★ ET LEURS PHRASES NE SE RECOUVRENT PAS NON PLUS. AA2bis dit « le droit du
 *   signataire sur cette terre n'est pas établi » — une question de FOND, qui
 *   arrête l'organisation d'une garde. « לחידוש » dit « il faut refaire signer
 *   avant telle date » — une question de CALENDRIER, qui n'arrête rien du tout
 *   et se règle en envoyant un SMS. Les confondre ferait croire qu'une ferme
 *   parfaitement en règle en janvier ne peut plus être gardée en novembre.
 *
 * Cette fonction est ce que la porte A148 interroge : elle rend `false` si une
 * seule fiche parvenait à être dans les deux états à la fois.
 */
export function renewalAndLandRightAreDisjoint(
  farms: Farm[],
  todayKey: string,
  windowDays: number = RENEWAL_WINDOW_DAYS_DEFAULT,
): boolean {
  return farms.every((farm) => {
    const renewal = renewalStatus(farm, todayKey, windowDays).state
    const right = landRightIssue(farm, todayKey)
    return !(renewal === 'due' && right === 'expired')
  })
}

// ---------------------------------------------------------------------------
// ★★ AG3.1 · AG5.1 — LE MESSAGE QUI PORTE LE LIEN
// ---------------------------------------------------------------------------

export interface FarmerLinkMessageLabels {
  greeting: string
  intro: string
  renewal: string
  ask: string
  signature: string
}

/**
 * Le SMS qui porte le lien de l'espace agriculteur.
 *
 * ★★ UN SEUL MESSAGE POUR LES DEUX USAGES, ET C'EST UNE DÉCISION. La première
 *    invitation et le rappel de renouvellement diffèrent d'UNE phrase — celle
 *    qui donne la date — et c'est le même lien, le même espace, le même geste
 *    au bout. Deux gabarits auraient divergé dans l'année, et c'est celui
 *    qu'on envoie le moins souvent qui aurait vieilli : celui du
 *    renouvellement, envoyé une fois par ferme et par an.
 *
 * ⚠️ ET LE LIEN EST EN DERNIER, SUR SA PROPRE LIGNE. Un client SMS qui coupe
 *    un message long coupe la fin ; une URL au milieu d'un paragraphe est une
 *    URL qu'un téléphone cachère affiche en deux morceaux dont aucun ne
 *    s'ouvre. C'est la même contrainte qui a rendu le jeton court en AE1.
 */
export function buildFarmerLinkMessage(input: {
  farmerName: string
  farmName: string
  /** Présente pour un renouvellement, absente pour une première invitation. */
  until: string | null
  link: string
  coordinatorName: string
  coordinatorPhone: string
  labels: FarmerLinkMessageLabels
}): string {
  const { labels } = input
  const lines = [
    `${labels.greeting} ${input.farmerName.trim() || input.farmName.trim()},`,
    labels.intro,
  ]
  if (input.until !== null) lines.push(labels.renewal.replace('{{date}}', input.until))
  lines.push('', labels.ask, '', input.link, '')
  lines.push(`${labels.signature} ${input.coordinatorName} ${input.coordinatorPhone}`)
  return lines.join('\n')
}
