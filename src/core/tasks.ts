/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BE (2026-10-13) — LES TÂCHES DU PO, RANGÉES PAR LISTE, DANS SON ORDRE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Il veut y lire ses questions, cocher ce qui est fait. » Le PO passe ses
 * journées au téléphone ; une tâche est une ligne qu'il dicte, qu'il range,
 * qu'il coche.
 *
 * ★ L'ORDRE EST LE SIEN (`rank`), JAMAIS UN TRI. Une liste se lit dans l'ordre
 *   où il l'a posée ; une tâche neuve se pose EN TÊTE (il vient de la dicter
 *   pendant un appel, c'est elle qu'il veut voir), et il la descend s'il veut.
 *
 * ★ RIEN NE DISPARAÎT SANS RETOUR EN ARRIÈRE. Cocher pose `doneAt` : la tâche
 *   reste visible un instant (`LINGER_MS`, barrée), puis rejoint les ARCHIVES,
 *   d'où elle se rouvre. Archiver sans cocher pose `archivedAt` (« plus à
 *   l'ordre du jour »). Supprimer passe par `undoable` (le toast « ביטול »).
 *
 * ★ UN SEUL LIEN, vers une institution, une ferme, un contact à traiter ou un
 *   rendez-vous. C'est ce qui évite au PO de retaper un nom : de la fiche on
 *   voit la tâche, de la tâche on ouvre la fiche.
 *
 * ★ L'ÉCHÉANCE EST UN JOUR, L'HEURE EST FACULTATIVE. Une tâche datée se lit EN
 *   HAUT DU JOUR dans l'agenda, discrètement — ce n'est pas un rendez-vous et
 *   elle n'occupe aucun créneau (règle 0 : tout ce qui est daté y apparaît).
 *
 * PUR : aucun React, aucun DOM, comme tout /src/core.
 */

export type TaskLinkKind = 'institution' | 'farm' | 'lead' | 'meeting'

export const TASK_LINK_KINDS: readonly TaskLinkKind[] = ['institution', 'farm', 'lead', 'meeting']

export interface TaskLink {
  kind: TaskLinkKind
  id: string
}

export interface TaskList {
  id: string
  /** ⛔ Jamais vide. */
  name: string
  /** L'ordre des listes (plus petit = plus haut). */
  rank: number
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  listId: string
  title: string
  /** Texte libre, sur plusieurs lignes (dicté). */
  note: string
  /** L'ordre du PO dans sa liste (plus petit = plus haut). */
  rank: number
  link: TaskLink | null
  /** Jour d'échéance `YYYY-MM-DD`, ou `null`. */
  dueOn: string | null
  /** Heure facultative `HH:MM` ; sans jour, elle n'a pas de sens. */
  dueTime: string | null
  /** Cochée à cet instant ; `null` = à faire. */
  doneAt: string | null
  /** Archivée sans être faite ; `null` sinon. */
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Le temps qu'une tâche cochée reste visible, barrée, avant les archives. */
export const LINGER_MS = 3_000

export const isTaskOpen = (t: Pick<Task, 'doneAt' | 'archivedAt'>): boolean => t.doneAt === null && t.archivedAt === null

/** Dans les archives : faite, ou mise de côté. */
export const isTaskArchived = (t: Pick<Task, 'doneAt' | 'archivedAt'>): boolean => !isTaskOpen(t)

const byRank = (a: Task, b: Task): number => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

/** Les tâches à faire d'une liste, dans l'ordre du PO. */
export function openTasks(tasks: readonly Task[], listId: string): Task[] {
  return tasks.filter((t) => t.listId === listId && isTaskOpen(t)).sort(byRank)
}

/**
 * Ce que la liste MONTRE : les tâches à faire, plus celles cochées il y a moins
 * de `LINGER_MS`, À LEUR PLACE (barrées). C'est « une tâche cochée reste
 * visible un instant ». Une tâche ARCHIVÉE (geste explicite) part tout de suite.
 */
export function visibleTasks(tasks: readonly Task[], listId: string, nowMs: number, lingerMs = LINGER_MS): Task[] {
  return tasks
    .filter(
      (t) =>
        t.listId === listId &&
        t.archivedAt === null &&
        (t.doneAt === null || nowMs - Date.parse(t.doneAt) < lingerMs),
    )
    .sort(byRank)
}

/** Les archives d'une liste, la plus récente d'abord. */
export function archivedTasks(tasks: readonly Task[], listId: string): Task[] {
  const when = (t: Task): string => [t.doneAt ?? '', t.archivedAt ?? ''].sort().pop() ?? ''
  return tasks
    .filter((t) => t.listId === listId && isTaskArchived(t))
    .sort((a, b) => when(b).localeCompare(when(a)) || a.id.localeCompare(b.id))
}

/** Le rang d'une tâche posée EN TÊTE de sa liste. */
export function topRank(tasks: readonly Task[], listId: string): number {
  const ranks = tasks.filter((t) => t.listId === listId && isTaskOpen(t)).map((t) => t.rank)
  return ranks.length === 0 ? 0 : Math.min(...ranks) - 1
}

/** Le rang d'une tâche posée EN FIN de sa liste. */
export function bottomRank(tasks: readonly Task[], listId: string): number {
  const ranks = tasks.filter((t) => t.listId === listId).map((t) => t.rank)
  return ranks.length === 0 ? 0 : Math.max(...ranks) + 1
}

/**
 * ★ LE GLISSER-DÉPOSER, EN ARITHMÉTIQUE. La tâche `id` va à la position
 * `toIndex` parmi les tâches À FAIRE de `listId` (sa liste actuelle ou une
 * autre) ; rend les nouveaux rangs, 0…n-1, de TOUTES les tâches à faire de la
 * liste d'arrivée. Les archives ne bougent pas. `null` si rien ne change.
 */
export function reorderedRanks(
  tasks: readonly Task[],
  id: string,
  toIndex: number,
  listId?: string,
): Map<string, number> | null {
  const moving = tasks.find((t) => t.id === id)
  if (!moving) return null
  const target = listId ?? moving.listId
  const others = openTasks(tasks, target).filter((t) => t.id !== id)
  const at = Math.max(0, Math.min(others.length, toIndex))
  const order = [...others.slice(0, at), moving, ...others.slice(at)]
  const before = openTasks(tasks, target).map((t) => t.id).join('|')
  const ranks = new Map(order.map((t, n) => [t.id, n]))
  const unchanged =
    target === moving.listId && before === order.map((t) => t.id).join('|') && order.every((t, n) => t.rank === n)
  return unchanged ? null : ranks
}

/** Les listes, dans l'ordre du PO. */
export function sortedLists(lists: readonly TaskList[]): TaskList[] {
  return [...lists].sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export const isListNameValid = (name: string): boolean => name.trim().length > 0

/**
 * ★ UNE TÂCHE DATÉE DANS L'AGENDA : EN HAUT DU JOUR, PAS DANS LA GRILLE.
 * Les tâches à faire dont le jour d'échéance est dans `[fromKey, toKey)`, par
 * jour, celles à heure d'abord (dans l'ordre de l'heure), puis les autres dans
 * l'ordre du PO. Une tâche cochée ou archivée quitte l'agenda.
 */
export function dueTasksByDay(tasks: readonly Task[], fromKey: string, toKey: string): Map<string, Task[]> {
  const out = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!isTaskOpen(t) || t.dueOn === null) continue
    if (t.dueOn < fromKey || t.dueOn >= toKey) continue
    const list = out.get(t.dueOn)
    if (list) list.push(t)
    else out.set(t.dueOn, [t])
  }
  for (const list of out.values()) {
    list.sort((a, b) => {
      if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime) || byRank(a, b)
      if (a.dueTime) return -1
      if (b.dueTime) return 1
      return byRank(a, b)
    })
  }
  return out
}

/** Les tâches qui pointent vers une fiche (institution, ferme, piste, rendez-vous). */
export function tasksLinkedTo(tasks: readonly Task[], kind: TaskLinkKind, id: string): Task[] {
  return tasks.filter((t) => t.link?.kind === kind && t.link.id === id).sort(byRank)
}

/** `HH:MM`, ou `null` si la saisie n'en est pas une. */
export function normalizeDueTime(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** `YYYY-MM-DD`, ou `null`. */
export function normalizeDueOn(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
