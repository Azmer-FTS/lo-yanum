import { FakeDb } from './fake-supabase'
import { seed } from './ayharness'
import { MAPPINGS } from '../src/data/rows'
import type { GeneralMeeting } from '../src/core/types'
import type { Tour } from '../src/core/tours'
import type { MemoLine } from '../src/core/memo'
import type { Task, TaskList } from '../src/core/tasks'

/**
 * ★★ BE — LE BANC DES PORTES AU RENDU : une base FACTICE aux noms INVENTÉS.
 * Aucune donnée réelle (le fichier du PO reste dans `private/be/`).
 */

const day = (offset: number, h: number, m = 0): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
const dayKey = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const stamp = new Date(Date.now() - 86_400_000).toISOString()

export const BE_LISTS: TaskList[] = [
  { id: 'tl-be-1', name: 'מוסדות', rank: 0, createdAt: stamp, updatedAt: stamp },
  { id: 'tl-be-2', name: 'חוות', rank: 1, createdAt: stamp, updatedAt: stamp },
  { id: 'tl-be-3', name: 'ארגון', rank: 2, createdAt: stamp, updatedAt: stamp },
]

const task = (id: string, listId: string, rank: number, title: string, over: Partial<Task> = {}): Task => ({
  id, listId, rank, title, note: '', link: null, dueOn: null, dueTime: null, doneAt: null, archivedAt: null, createdAt: stamp, updatedAt: stamp, ...over,
})

export const BE_MEETING: GeneralMeeting = {
  id: 'meet-be-1',
  title: 'מפגש הדגמה במכינה',
  at: day(1, 14, 30),
  endAt: day(1, 16, 0),
  location: 'מושב הדגמה',
  person: '',
  note: 'הרצאה ואחריה שיחה על הביטחון.',
}

export const BE_TASKS: Task[] = [
  task('task-be-1', 'tl-be-1', 0, 'להתקשר למכינת הדגמה — לקבוע רכז', { note: 'שם ומספר של הרכז.', dueOn: dayKey(0), dueTime: '11:00' }),
  task('task-be-2', 'tl-be-1', 1, 'לשלוח לישיבת הדגמה רשימת חוות', { note: 'שלוש חוות באזור.' }),
  task('task-be-3', 'tl-be-1', 2, 'להכין את ההרצאה למפגש', { link: { kind: 'meeting', id: 'meet-be-1' } }),
  task('task-be-4', 'tl-be-1', 3, 'לברר מי עוד מצטרף למפגש', { link: { kind: 'meeting', id: 'meet-be-1' } }),
  task('task-be-5', 'tl-be-1', 4, 'לתאם ביקור עם רפת ההדגמה'),
  task('task-be-6', 'tl-be-2', 0, 'להשלים ענף גידול בחוות החסרות'),
  task('task-be-7', 'tl-be-3', 0, 'להזמין חולצות'),
]

export const BE_MEMO: MemoLine[] = [
  ['institutions', 'questions', 'מי יהיה איש הקשר שלכם להתנדבות?', 'Qui sera votre contact pour le bénévolat ?'],
  ['institutions', 'questions', 'כמה לילות בחודש אפשר לתת?', 'Combien de nuits par mois ?'],
  ['institutions', 'say', 'ההדרכה נעשית לפני היציאה לשטח.', 'La formation a lieu avant le terrain.'],
  ['farmers', 'questions', 'איפה נוח לחנות ליד השער?', 'Où se garer près du portail ?'],
  ['farmers', 'say', 'המתנדבים מגיעים בזוגות.', 'Les bénévoles viennent à deux.'],
  ['volunteers', 'say', 'שומרים על קשר עם הרכז כל הלילה.', 'On reste joignable toute la nuit.'],
  ['volunteers', 'questions', 'מה מביאים? — מים ופנס.', 'On apporte quoi ? — de l’eau et une lampe.'],
].map(([bank, section, he, fr], n) => ({ id: `memo-be-${n + 1}`, bank, section, he, fr, rank: n, createdAt: stamp, updatedAt: stamp }) as MemoLine)

export function beTour(farmIds: string[]): Tour {
  return { id: 'tour-be-1', dayKey: dayKey(0), name: 'סבב הדגמה', departAt: day(0, 8, 0), farmIds }
}

/** La base du banc : celle des portes AY, plus les tâches, l'aide-mémoire, un rendez-vous, un itinéraire. */
export function beDb(opts: { tour?: boolean } = {}): FakeDb {
  const d = new FakeDb()
  seed(d)
  for (const l of BE_LISTS) d.rows('task_lists').push({ ...MAPPINGS.taskLists.toRows(l)[0].rows[0] })
  for (const t of BE_TASKS) d.rows('tasks').push({ ...MAPPINGS.tasks.toRows(t)[0].rows[0] })
  for (const m of BE_MEMO) d.rows('memo_lines').push({ ...MAPPINGS.memoLines.toRows(m)[0].rows[0] })
  d.rows('general_meetings').push({ ...MAPPINGS.generalMeetings.toRows(BE_MEETING)[0].rows[0] })
  if (opts.tour !== false) {
    const farmIds = d.rows('entities').slice(0, 3).map((r) => String(r.id))
    const tour = beTour(farmIds)
    for (const t of MAPPINGS.tours.toRows(tour)) for (const r of t.rows) d.rows(t.table).push({ ...r })
  }
  return d
}
