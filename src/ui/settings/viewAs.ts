import { useSyncExternalStore } from 'react'

import { presetToSession, setReadOnly, setSession } from '@core/index'
import type { Role, SessionPreset } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ Y13 (2026-09-04) — "מצב תצוגה": THE COORDINATOR LOOKS THROUGH SOMEBODY
 *    ELSE'S SCREEN, AND COMES STRAIGHT BACK.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The product owner's request:
 *
 *   "Dans הגדרות, section 'מצב תצוגה' (visible uniquement pour le
 *    coordinateur) : basculer l'affichage en rôle fermier / volontaire /
 *    conducteur, avec sélection de l'entité ou de la personne à simuler, et
 *    retour immédiat au rôle coordinateur. Permet au PO de tester et de donner
 *    des retours sur les trois autres interfaces. Bandeau discret rappelant le
 *    rôle simulé."
 *
 * ⚠️ THIS IS NOT A PRIVILEGE ESCALATION, AND THE DIRECTION IS WHY. It only
 *    ever moves from the coordinator — who already sees every farm, every
 *    volunteer and every driver — to a role that sees LESS. There is nothing a
 *    simulated farmer can reach that the coordinator could not reach already,
 *    which is what makes a one-tap switch acceptable at all. The reverse would
 *    be a different feature and would need a different door.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG1 (2026-09-09) — ET IL MARCHE MAINTENANT SUR L'APPLICATION RÉELLE,
 *    AVEC LES VRAIES DONNÉES. CINQUIÈME DEMANDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le PO reste connecté comme coordinateur et veut voir les écrans des
 *     autres rôles AVEC LES VRAIES DONNÉES. Le passage par le jumeau de
 *     démonstration ne répond pas au besoin : il ne veut pas travailler sur
 *     une autre plateforme. »
 *
 * ⚠️ CE QUI ÉTAIT ÉCRIT ICI JUSQU'À AF, ET POURQUOI C'ÉTAIT À LA FOIS VRAI ET
 *    À CÔTÉ. Le texte disait : « avec Supabase le rôle est une revendication
 *    du jeton, et échanger la session côté client serait un mensonge que
 *    l'interface se raconte pendant que chaque lecture passe par la vraie
 *    identité. » La première moitié est exacte. La seconde est le contraire de
 *    la conclusion qu'elle appelle.
 *
 *    Les lectures NE partent PAS une par une. `data/store.ts` hydrate le
 *    magasin UNE fois, sous l'identité du coordinateur, en 25 selects, et
 *    tous les écrans lisent ensuite CETTE MÉMOIRE à travers `access.ts`
 *    (voir la note « THE CONSTRAINT THAT DECIDES THE WHOLE SHAPE » dans
 *    core/backend.ts : les 52 accesseurs rendent une valeur, jamais une
 *    promesse). Donc changer `session` ne fait pas partir une requête sous une
 *    autre identité — **il ne fait partir aucune requête du tout**. Ce que
 *    l'écran montre est un SOUS-ENSEMBLE de ce que le coordinateur a déjà
 *    obtenu du serveur, filtré par le même code qui le filtrerait pour un vrai
 *    agriculteur.
 *
 * ★★ CE QUI FAIT QUE CE N'EST PAS UNE FAILLE, EN TROIS PHRASES QU'A140 VÉRIFIE
 *    UNE PAR UNE PLUTÔT QUE DE LES SUPPOSER :
 *
 *    1. LA DIRECTION. On ne va JAMAIS que du coordinateur — qui voit déjà
 *       toutes les fermes, tous les volontaires et tous les conducteurs — vers
 *       un rôle qui voit MOINS. Il n'y a rien qu'un agriculteur simulé
 *       atteigne que le coordinateur n'atteignait pas déjà. L'inverse serait
 *       une autre fonctionnalité et demanderait une autre porte.
 *    2. LE SERVEUR N'EN SAIT RIEN ET N'A RIEN À EN SAVOIR. Le jeton d'auth
 *       n'est pas touché, aucune requête ne part pendant l'épisode, et A140
 *       compare l'octet près `localStorage['lo-yanum:auth']` avant et après.
 *    3. LECTURE SEULE, ET GARANTIE PAR LE MAGASIN. `setReadOnly` verrouille
 *       `commit` (voir core/store.ts) : une mutation qui passerait quand même
 *       est RESTAURÉE puis REFUSÉE, donc il n'existe aucun chemin par lequel
 *       un écran de terrain écrirait sous la session du coordinateur.
 *
 * ⛔ ET CE QUE ÇA NE FAIT PAS, DIT FRANCHEMENT : cela ne prouve pas que les
 *    politiques RLS d'un vrai agriculteur sont correctes. Ce mode montre ce
 *    que L'INTERFACE d'un agriculteur affiche, pas ce que le SERVEUR lui
 *    servirait. Les deux coïncident aujourd'hui parce que `access.ts` est le
 *    seul filtre entre la mémoire et l'écran ; le jour où un agriculteur aura
 *    un compte, vérifier ses politiques restera un travail distinct et c'est
 *    `bun run live` qui le fait.
 *
 * ★ WHAT IS REMEMBERED IS ONLY WHAT THE BANNER NEEDS TO SAY, plus the fact
 *   that a simulation is running. The SESSION itself stays where it always
 *   was — `@core/store` — so every accessor keeps filtering exactly as it does
 *   for a real farmer, which is the entire point of looking.
 */

const KEY = 'lo-yanum:view-as'

export interface ViewAs {
  role: Role
  /** The person being simulated, for the banner. */
  name: string
  /** Their farm / yeshiva / locality, so two people of a name are told apart. */
  detail: string
}

function read(): ViewAs | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ViewAs>
    if (!parsed.role || parsed.role === 'coordinator') return null
    return {
      role: parsed.role,
      name: String(parsed.name ?? ''),
      detail: String(parsed.detail ?? ''),
    }
  } catch {
    // Private browsing, or a value from an older shape. Not simulating.
    return null
  }
}

let current: ViewAs | null = read()
const listeners = new Set<() => void>()

function publish(next: ViewAs | null): void {
  current = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // The banner still works for this session; nothing worth failing over.
  }
  for (const l of listeners) l()
}

/**
 * Step into a role. The session, the LOCK and the banner change together, or
 * none of them do.
 *
 * ⚠️ L'ORDRE EST LE CONTRAT. Le verrou est posé APRÈS `setSession` — poser le
 *    verrou d'abord ne casserait rien (`setSession` ne passe pas par `commit`,
 *    voir sa note) mais l'ordre écrit ici est celui qu'on peut lire à voix
 *    haute : je deviens lui, puis je ne peux plus rien faire.
 */
export function viewAs(preset: SessionPreset): void {
  if (preset.role === 'coordinator') {
    stopViewAs()
    return
  }
  setSession(presetToSession(preset))
  setReadOnly(true)
  publish({ role: preset.role, name: preset.name, detail: preset.detail })
}

/**
 * ★ THE WAY BACK, and it is one call from anywhere — see the shell's banner.
 *
 * ⚠️ LE VERROU SE LÈVE AVANT LA SESSION, ET C'EST L'ORDRE INVERSE DE L'ALLER
 *    POUR LA MÊME RAISON : à aucun instant il ne doit exister un état « je
 *    suis le coordinateur et je suis verrouillé », qui serait un écran de
 *    travail où rien ne répond.
 */
export function stopViewAs(): void {
  setReadOnly(false)
  setSession({ role: 'coordinator', entityId: null })
  publish(null)
}

/**
 * ★ AG1.2 — « TOUTE ACTION EST DÉSACTIVÉE VISIBLEMENT ».
 *
 * Le pendant d'interface du verrou du magasin. Les deux répondent à la même
 * question et ne font pas le même travail : celui-ci grise le bouton, l'autre
 * garantit que le grisé n'était pas la seule chose qui tenait. Voir la note
 * sur `setReadOnly` dans core/store.ts.
 */
export function useReadOnly(): boolean {
  return useViewAs() !== null
}

/**
 * Les propriétés à étaler sur un contrôle qui écrit, quand le mode tourne.
 *
 * ★ UNE SEULE FONCTION PLUTÔT QUE `disabled={ro}` À DIX-SEPT ENDROITS, parce
 *   que le `title` compte autant que le `disabled` : un bouton gris sans
 *   explication est un bouton cassé, et le PO passe précisément son temps à
 *   chercher ce qui est cassé.
 */
export function readOnlyProps(
  readOnly: boolean,
  reason: string,
): { disabled?: true; title?: string; 'data-readonly'?: '' } {
  return readOnly ? { disabled: true, title: reason, 'data-readonly': '' } : {}
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): ViewAs | null => current

export function useViewAs(): ViewAs | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
