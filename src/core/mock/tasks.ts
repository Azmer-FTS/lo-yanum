import { atTime, localDayKey, now, addDays } from '../clock'
import type { MemoLine } from '../memo'
import type { Task, TaskList } from '../tasks'

/**
 * ★★ BE — LES TÂCHES ET L'AIDE-MÉMOIRE DU JUMEAU DE DÉMONSTRATION.
 *
 * ⛔ TOUT EST INVENTÉ. Les vraies listes, les vraies tâches et les vraies
 *    banques du PO sont en base, et leur fichier reste dans `private/be/` :
 *    aucune ne doit se retrouver ici (règle des données réelles).
 */

const stamp = atTime(-1, 9, 0)
const day = (offset: number): string => localDayKey(addDays(now(), offset))

export const TASK_LISTS: TaskList[] = [
  { id: 'tl-demo-inst', name: 'מוסדות', rank: 0, createdAt: stamp, updatedAt: stamp },
  { id: 'tl-demo-farms', name: 'חוות', rank: 1, createdAt: stamp, updatedAt: stamp },
  { id: 'tl-demo-org', name: 'ארגון', rank: 2, createdAt: stamp, updatedAt: stamp },
]

const task = (over: Partial<Task> & Pick<Task, 'id' | 'listId' | 'title' | 'rank'>): Task => ({
  note: '',
  link: null,
  dueOn: null,
  dueTime: null,
  doneAt: null,
  archivedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
})

export const TASKS: Task[] = [
  task({ id: 'task-demo-01', listId: 'tl-demo-inst', rank: 0, title: 'להתקשר למכינת אופק הדרום — לקבוע רכז', note: 'שם ומספר טלפון של הרכז.', link: { kind: 'institution', id: 'inst-demo-01' } }),
  task({ id: 'task-demo-02', listId: 'tl-demo-inst', rank: 1, title: 'לשלוח לישיבת גבעות הנגב את רשימת החוות', link: { kind: 'institution', id: 'inst-demo-02' }, dueOn: day(1) }),
  task({ id: 'task-demo-03', listId: 'tl-demo-inst', rank: 2, title: 'לברר מתי ההכשרה במדרשת שבילי הבשור', link: { kind: 'institution', id: 'inst-demo-03' } }),
  task({ id: 'task-demo-04', listId: 'tl-demo-farms', rank: 0, title: 'לחזור למשק כהן', note: 'ביקש שנתקשר אחרי הצהריים.', link: { kind: 'lead', id: 'lead-demo-01' }, dueOn: day(0), dueTime: '15:00' }),
  task({ id: 'task-demo-05', listId: 'tl-demo-farms', rank: 1, title: 'לבקש נקודת ציון מדויקת מדיר הגבעה', link: { kind: 'lead', id: 'lead-demo-03' } }),
  task({ id: 'task-demo-06', listId: 'tl-demo-org', rank: 0, title: 'להזמין חולצות למתנדבים החדשים' }),
  task({ id: 'task-demo-07', listId: 'tl-demo-org', rank: 1, title: 'לעדכן את טופס ההכשרה', doneAt: atTime(-1, 12, 0) }),
]

const line = (id: string, bank: MemoLine['bank'], section: MemoLine['section'], rank: number, he: string, fr: string): MemoLine => ({
  id, bank, section, rank, he, fr, createdAt: stamp, updatedAt: stamp,
})

export const MEMO_LINES: MemoLine[] = [
  line('memo-demo-01', 'institutions', 'questions', 0, 'מי איש הקשר שלנו אצלכם לעניין ההתנדבות?', 'Qui est notre interlocuteur pour le bénévolat ?'),
  line('memo-demo-02', 'institutions', 'questions', 1, 'כמה בחורים אפשר לשלוח בכל לילה?', 'Combien de jeunes par nuit ?'),
  line('memo-demo-03', 'institutions', 'say', 0, 'כל מתנדב עובר הדרכה לפני שהוא יוצא לשטח.', 'Chaque bénévole est formé avant le terrain.'),
  line('memo-demo-04', 'farmers', 'questions', 0, 'איפה הכי נוח שהמתנדבים יחנו?', 'Où les bénévoles peuvent-ils se garer ?'),
  line('memo-demo-05', 'farmers', 'questions', 1, 'יש כלב בשטח שצריך לדעת עליו?', 'Y a-t-il un chien à connaître ?'),
  line('memo-demo-06', 'farmers', 'say', 0, 'המתנדבים מגיעים בזוגות ומדווחים לנו כל לילה.', 'Ils viennent à deux et nous font un rapport chaque nuit.'),
  line('memo-demo-07', 'volunteers', 'say', 0, 'שומרים על קשר עם הרכז לאורך כל המשמרת.', 'On reste joignable par le coordinateur toute la garde.'),
  line('memo-demo-08', 'volunteers', 'questions', 0, 'מה מביאים איתנו? — מים, פנס וטלפון טעון.', 'On apporte quoi ? — de l’eau, une lampe, un téléphone chargé.'),
]
