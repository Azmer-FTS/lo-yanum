/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG2 (2026-09-09) — LES QUATRE DERNIERS CHIFFRES, ET CE QU'ILS PROTÈGENT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Les liens de garde et d'espace agriculteur sont des clés : quiconque les
 *     reçoit entre. Décision du PO : on ajoute une vérification légère
 *     maintenant, le code par SMS viendra plus tard. »
 *
 * ⚠️★★ CE QUE ÇA PROTÈGE, ET CE QUE ÇA NE PROTÈGE PAS. Écrit ici, en tête, et
 *    avec la même franchise qu'AE1 pour le jeton — parce qu'une mesure de
 *    sécurité dont on ne dit pas la portée finit par être créditée d'une
 *    portée qu'elle n'a pas.
 *
 *    ✅ CE QUE ÇA PROTÈGE, ET C'EST LE CAS RÉEL :
 *       · un lien RETRANSMIS. Le volontaire fait suivre le SMS à son frère,
 *         quelqu'un colle l'URL dans un groupe WhatsApp de la yeshiva, le
 *         téléphone est prêté. Le destinataire suivant n'a pas la fiche de
 *         l'agriculteur sous les yeux et ne connaît pas son portable ;
 *       · un lien retrouvé dans un historique de navigation, ou dans une
 *         capture d'écran qui circule ;
 *       · une URL devinée — mais celle-là était déjà couverte par l'empreinte
 *         du jeton (AE1), et l'est deux fois maintenant.
 *
 *    ⛔ CE QUE ÇA NE PROTÈGE PAS, ET IL FAUT LE DIRE EN TOUTES LETTRES :
 *       · QUELQU'UN QUI CONNAÎT LA PERSONNE. Le voisin, le fils, le
 *         conducteur : le portable d'un agriculteur est sur son camion. Ce
 *         n'est pas un secret, c'est un DISCRIMINANT ;
 *       · UNE ATTAQUE PAR ÉNUMÉRATION MENÉE DEPUIS PLUSIEURS APPAREILS. La
 *         temporisation ci-dessous vit sur l'appareil (il n'y a pas de serveur
 *         qui compte), donc dix appareils font dix compteurs. Dix mille
 *         combinaisons restent dix mille essais par appareil, ce qui rend la
 *         chose lente et non impossible ;
 *       · RIEN DU TOUT contre quelqu'un qui a déjà le téléphone déverrouillé
 *         de la personne — mais celui-là a aussi le SMS, et le code par SMS
 *         qui viendra ne changera pas cela non plus.
 *
 *    ★ POURQUOI C'EST QUAND MÊME LE BON COMPROMIS AUJOURD'HUI : la chose
 *      protégée est l'horaire d'une garde et une fiche d'exploitation, le
 *      porteur est un agriculteur de soixante ans seul devant son téléphone un
 *      dimanche soir, et le coût d'un vrai mot de passe serait qu'il n'ouvre
 *      jamais l'application. C'est exactement le raisonnement d'AE1 sur le
 *      jeton, appliqué un cran plus haut.
 *
 * ★ CE FICHIER EST PUR. Les quatre chiffres, la comparaison, la temporisation
 *   — des fonctions de nombres et de chaînes, donc vérifiables sans navigateur
 *   par `bun run agpass`. Ce qui touche l'appareil (la mémoire de la saisie,
 *   le compteur d'échecs) est dans `ui/challenge.ts`, qui n'a que du stockage.
 */

// ---------------------------------------------------------------------------
// Les quatre chiffres
// ---------------------------------------------------------------------------

/** Combien de chiffres sont demandés. Nommé parce que le brief le nomme. */
export const CHALLENGE_DIGITS = 4

/**
 * Les chiffres d'un numéro, sans rien d'autre.
 *
 * ⚠️ TOUT CE QUI N'EST PAS UN CHIFFRE SAUTE, Y COMPRIS L'INDICATIF. Les fiches
 *    portent « 052-0000049 », « 052 000 0049 », « +972-52-0000049 » et
 *    « 972520000049 » — quatre écritures d'un seul numéro, entrées par quatre
 *    personnes différentes sur cinq ans. Les quatre derniers chiffres sont les
 *    mêmes dans les quatre cas, ce qui est précisément pourquoi ce sont les
 *    DERNIERS qui sont demandés et pas les premiers.
 *
 * ⚠️ ET LES CHIFFRES ARABO-HINDOUS NE SONT PAS TRAITÉS, VOLONTAIREMENT. Un
 *    clavier hébreu produit des chiffres ASCII ; ajouter une normalisation
 *    Unicode ici serait du code qu'aucune saisie de ce programme n'atteint.
 */
export function digitsOf(phone: string): string {
  return (phone ?? '').replace(/[^0-9]/g, '')
}

/**
 * Les quatre derniers chiffres d'un numéro, ou `null` quand la fiche n'en
 * porte pas assez.
 *
 * ★ `null` EST UN RÉSULTAT ET NON UNE ERREUR, et l'appelant DOIT le traiter :
 *   une fiche sans portable — il y en a, c'est un champ facultatif depuis AA2
 *   — ne peut pas poser la question. `challengeState` répond alors `'open'` :
 *   on n'invente pas un code, et on ne ferme pas la porte au nez de
 *   l'agriculteur parce que le coordinateur n'a pas encore saisi son numéro.
 */
export function lastFourOf(phone: string): string | null {
  const d = digitsOf(phone)
  return d.length >= CHALLENGE_DIGITS ? d.slice(-CHALLENGE_DIGITS) : null
}

/** La saisie répond-elle au numéro de la fiche ? */
export function challengeMatches(input: string, phone: string): boolean {
  const expected = lastFourOf(phone)
  if (expected === null) return false
  return digitsOf(input) === expected
}

// ---------------------------------------------------------------------------
// AG2.3 — la temporisation croissante, et pourquoi elle ne devient jamais un mur
// ---------------------------------------------------------------------------

/**
 *   « Après plusieurs échecs, temporisation croissante. Pas de blocage
 *     définitif — un agriculteur bloqué un dimanche soir n'a personne à
 *     appeler. »
 *
 * ★ DEUX ESSAIS FRANCS, PUIS L'ATTENTE DOUBLE, PUIS ELLE PLAFONNE.
 *
 *   Deux essais francs, parce que le premier échec est presque toujours le
 *   même : l'agriculteur tape les quatre premiers chiffres au lieu des quatre
 *   derniers, ou les chiffres de sa ligne fixe. Faire attendre quelqu'un pour
 *   ça, c'est lui apprendre que l'application est hostile à la troisième
 *   seconde.
 *
 *   Le plafond, parce qu'une progression sans plafond EST un blocage
 *   définitif : à la douzième tentative on demanderait deux heures d'attente,
 *   ce qui, un dimanche soir, s'appelle « fermé ».
 */
export const CHALLENGE_FREE_ATTEMPTS = 2
export const CHALLENGE_BASE_DELAY_MS = 15_000
export const CHALLENGE_MAX_DELAY_MS = 300_000

/**
 * L'attente due après `failures` échecs consécutifs, en millisecondes.
 *
 *   0, 0, 15 s, 30 s, 60 s, 120 s, 240 s, 300 s, 300 s, … et jamais l'infini.
 */
export function challengeDelayMs(failures: number): number {
  const over = Math.floor(failures) - CHALLENGE_FREE_ATTEMPTS
  if (over < 0) return 0
  const delay = CHALLENGE_BASE_DELAY_MS * 2 ** over
  return Math.min(delay, CHALLENGE_MAX_DELAY_MS)
}

/**
 * Combien de millisecondes il reste à attendre, maintenant.
 *
 * ⚠️ `lastFailureAt` EST UN INSTANT ET NON UN MINUTEUR EN COURS, ce qui est ce
 *    qui fait que l'attente survit à un rechargement de page : recharger pour
 *    échapper à la temporisation est le premier réflexe de n'importe qui, et
 *    un `setTimeout` en mémoire y céderait.
 */
export function challengeWaitMs(
  failures: number,
  lastFailureAt: number,
  at: number,
): number {
  const due = challengeDelayMs(failures)
  if (due === 0) return 0
  return Math.max(0, lastFailureAt + due - at)
}

// ---------------------------------------------------------------------------
// L'état, tel qu'un écran a besoin de le lire
// ---------------------------------------------------------------------------

export type ChallengeState =
  /** Pas de question à poser : déjà déverrouillé, ou pas de numéro sur la fiche. */
  | 'open'
  /** La question est posée et la saisie est acceptée. */
  | 'ask'
  /** La question est posée et il faut attendre — voir `challengeWaitMs`. */
  | 'wait'

export interface ChallengeInput {
  /** Le numéro porté par la fiche de la personne. Peut être vide. */
  phone: string
  /** L'instant du déverrouillage mémorisé sur cet appareil, ou `null`. */
  unlockedAt: number | null
  failures: number
  lastFailureAt: number
  /** Maintenant, en millisecondes. Donné, jamais lu ici : ce fichier est pur. */
  at: number
  /** Durée de validité d'un déverrouillage mémorisé. Voir `ui/challenge.ts`. */
  memoryMs: number
}

export interface ChallengeStatus {
  state: ChallengeState
  /** Millisecondes restantes quand `state === 'wait'`, sinon 0. */
  waitMs: number
  /**
   * ★ VRAI QUAND LA FICHE N'A PAS DE NUMÉRO, et l'écran d'appel le dit au
   *   coordinateur plutôt que de le taire. Une porte qui s'ouvre toujours pour
   *   une raison qu'on ignore est pire qu'une porte ouverte.
   */
  noNumber: boolean
}

export function challengeStatus(input: ChallengeInput): ChallengeStatus {
  const expected = lastFourOf(input.phone)
  if (expected === null) return { state: 'open', waitMs: 0, noNumber: true }

  /* AG2.2 — la saisie mémorisée. `unlockedAt` a une date de péremption : un
     appareil prêté six mois plus tard repose la question. */
  if (input.unlockedAt !== null && input.at - input.unlockedAt < input.memoryMs) {
    return { state: 'open', waitMs: 0, noNumber: false }
  }

  const waitMs = challengeWaitMs(input.failures, input.lastFailureAt, input.at)
  return { state: waitMs > 0 ? 'wait' : 'ask', waitMs, noNumber: false }
}
