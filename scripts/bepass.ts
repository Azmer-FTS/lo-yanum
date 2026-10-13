import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { addDays, localDayKey } from '../src/core/clock'
import { MEMO_BANKS, memoMatches, memoView, normalizeForSearch } from '../src/core/memo'
import type { MemoLine } from '../src/core/memo'
import {
  agendaCanEdit,
  agendaCanMove,
  agendaCanResize,
  meetingLink,
  meetingLinkPatch,
  minuteAtOffset,
  movedSpan,
  resizedEnd,
  snapMinute,
  tourReflection,
} from '../src/core/reflections'
import { LINGER_MS, archivedTasks, dueTasksByDay, openTasks, reorderedRanks, tasksLinkedTo, visibleTasks } from '../src/core/tasks'
import type { Task } from '../src/core/tasks'
import { COLLECTIONS } from '../src/core/backend'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BE — PORTE PURE.   bun run bepass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tout ce qui est nommé ici est INVENTÉ. Les vraies tâches, le vrai
 * aide-mémoire et les vrais rendez-vous du PO sont en base ; leur fichier reste
 * dans `private/be/` — A444 vérifie qu'aucune de leurs phrases n'est entrée dans
 * le dépôt.
 *
 *   A437  RÈGLE 0 — chaque source datée produit son entrée d'agenda (garde et
 *         itinéraire : un REFLET ; réunion et visite : un rendez-vous du PO ;
 *         tâche datée : en haut du jour) ; changer l'heure à la source déplace
 *         le reflet ; supprimer la source le fait disparaître ; rien n'est
 *         recopié (aucune écriture ailleurs que dans la source) ; un reflet ne
 *         se déplace, ne s'allonge ni ne se modifie depuis l'agenda
 *   A438  LES TÂCHES — création (en tête), cochage, l'instant visible puis les
 *         archives, décochage à sa place, archivage, retour en arrière d'une
 *         suppression, ordre manuel conservé (et à l'aller-retour en base),
 *         changement de liste, lien vers une fiche, échéance
 *   A439  L'AIDE-MÉMOIRE — trois banques, leurs sections, une recherche sur les
 *         trois à la fois (hébreu ou français, sans niqqud ni gershayim),
 *         ajouter / modifier / supprimer, une ligne devient une tâche
 *   A440  LE LIEN D'UN RENDEZ-VOUS — un seul à la fois, lu dans l'agenda, gardé
 *         à l'aller-retour en base
 *   A441  LE GESTE — le quart d'heure, déplacer garde la durée, le bord
 *         inférieur allonge sans descendre sous un quart d'heure
 *   A442  LA BASE — la migration : trois tables nées avec leurs droits et leur
 *         RLS, rien pour `anon`, les deux colonnes de lien, aucune table de reflet
 *   A443  LE CHAMP DE DICTÉE — un `<textarea>` ordinaire, multi-lignes, qui ne se
 *         ferme pas tout seul, et aucune reconnaissance vocale maison
 *   A444  AUCUNE DONNÉE RÉELLE — aucune phrase du fichier du PO dans le dépôt
 */

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log(`\n  ${title}\n  ${'-'.repeat(title.length)}`)
}
const src = (p: string) => readFileSync(p, 'utf8')

const store = await import('../src/core/store')
const access = await import('../src/core/access')
const raw = store._raw()

const today = new Date()
today.setHours(0, 0, 0, 0)
const week = (): ReturnType<typeof access.getCalendarEvents> => access.getCalendarEvents(addDays(today, -1), addDays(today, 14))

// ---------------------------------------------------------------------------
section('A437 — règle 0 : tout ce qui est daté est dans l’agenda, sans copie')
// ---------------------------------------------------------------------------
{
  // Une garde : un reflet.
  const mission = raw.missions.find((m) => Date.parse(m.startAt) >= addDays(today, -1).getTime() && Date.parse(m.startAt) < addDays(today, 14).getTime())
  check('A437 le banc a une garde dans la période', !!mission)
  if (mission) {
    const ev = week().find((e) => e.id === mission.id)
    check('A437 une GARDE produit son entrée, et c’est un REFLET', ev?.kind === 'mission' && ev.reflection === true, JSON.stringify(ev && { kind: ev.kind, reflection: ev.reflection }))
    check('A437 … qui s’ouvre sur l’écran de la garde', ev?.href === `/coordinator/missions/${mission.id}`, ev?.href)
    const before = mission.startAt
    const shifted = new Date(Date.parse(before) + 90 * 60_000).toISOString()
    mission.startAt = shifted
    const moved = week().find((e) => e.id === mission.id)
    check('A437 la garde change d’heure à la source → le reflet suit', moved?.at === shifted, `${before} → ${moved?.at}`)
    mission.startAt = before
  }

  // Un itinéraire : un reflet, de son départ à son retour, avec ses étapes.
  const farms = raw.farms.filter((f) => !f.positionMissing).slice(0, 3)
  const dayKey = localDayKey(addDays(today, 2))
  const depart = new Date(addDays(today, 2))
  depart.setHours(8, 0, 0, 0)
  const tour = store.saveTour({ name: 'סבב בדיקה', dayKey, departAt: depart.toISOString(), farmIds: farms.map((f) => f.id) })
  const refl = week().find((e) => e.id === `tour:${tour.id}`)
  check('A437 un ITINÉRAIRE enregistré produit son entrée, et c’est un REFLET', refl?.kind === 'tour' && refl.reflection === true, JSON.stringify(refl && { kind: refl.kind, reflection: refl.reflection }))
  check('A437 … qui occupe son créneau : du départ (08:00) à un retour plus tard', refl?.at === depart.toISOString() && Date.parse(refl.endAt) > Date.parse(refl.at) + 60 * 60_000, `${refl?.at} → ${refl?.endAt}`)
  check('A437 … porte son nom', refl?.title === 'סבב בדיקה')
  check('A437 … montre ses étapes dans l’ordre, avec leur heure', refl?.steps?.length === 3 && refl.steps.every((s) => typeof s.at === 'string') && refl.steps[0].label === (farms[0].farmName || farms[0].name), JSON.stringify(refl?.steps?.map((s) => s.label)))
  check('A437 … et s’ouvre sur le planificateur, CETTE tournée', refl?.href === `/coordinator/route?tour=${encodeURIComponent(tour.id)}`, refl?.href)

  // Rien n'est recopié : enregistrer un itinéraire n'écrit QUE l'itinéraire.
  const later = new Date(depart)
  later.setHours(10, 30, 0, 0)
  const u = store.undoable(() => store.saveTour({ id: tour.id, name: 'סבב בדיקה', dayKey, departAt: later.toISOString(), farmIds: farms.map((f) => f.id) }))
  check('A437 rien n’est recopié : déplacer l’itinéraire n’écrit qu’UNE ligne, la sienne', u.changed === 1, `${u.changed} écriture(s)`)
  const after = week().find((e) => e.id === `tour:${tour.id}`)
  check('A437 l’itinéraire change d’heure (08:00 → 10:30) → le reflet suit (départ ET retour)', after?.at === later.toISOString() && Date.parse(after.endAt) > Date.parse(refl!.endAt), `${after?.at} → ${after?.endAt}`)
  check('A437 aucune collection ne stocke de reflet (règle 0 : une seule donnée)', !COLLECTIONS.some((c) => /reflect|calendar|agenda/i.test(c)), COLLECTIONS.join(','))
  store.deleteTourById(tour.id)
  check('A437 l’itinéraire supprimé → le reflet disparaît', !week().some((e) => e.id === `tour:${tour.id}`))
  check('A437 un itinéraire n’est PAS un mur du planificateur (absent de `getAgendaEvents`)', !access.getAgendaEvents(addDays(today, -1), addDays(today, 14)).some((e) => e.kind === 'tour'))

  // Une garde supprimée : son reflet disparaît.
  const doomed = store.createMission({ farmId: raw.farms[0].id, anchorPointId: raw.anchorPoints.find((a) => a.farmId === raw.farms[0].id)!.id, startAt: depart.toISOString(), endAt: new Date(depart.getTime() + 8 * 3_600_000).toISOString(), volunteerIds: [] })
  check('A437 une garde créée apparaît (reflet)', week().some((e) => e.id === doomed.id && e.reflection === true))
  /* Une garde ne se supprime pas, elle s'annule (point 8 du PO) : le reflet le
     dit, barré, sans que rien ne soit écrit dans l'agenda. */
  store.cancelMission(doomed.id, 'other', '')
  check('A437 la garde annulée à la source → son reflet le dit (« annulée »)', week().find((e) => e.id === doomed.id)?.missionStatus === 'cancelled')
  /* Et une garde qui disparaît de la base (supprimée ailleurs, purge du jeu
     d'essai) emporte son reflet : il n'existe que par elle. */
  raw.missions = raw.missions.filter((m) => m.id !== doomed.id)
  check('A437 la garde supprimée → le reflet disparaît', !week().some((e) => e.id === doomed.id))

  // Les rendez-vous du PO, et ce qu'on ne peut pas faire à un reflet.
  const meeting = store.createGeneralMeeting({ title: 'פגישת בדיקה', at: depart.toISOString(), endAt: new Date(depart.getTime() + 3_600_000).toISOString(), location: '', person: '', note: '' })
  const mev = week().find((e) => e.id === meeting.id)
  check('A437 une RÉUNION produit un rendez-vous du PO (pas un reflet)', mev?.kind === 'meeting' && !mev.reflection)
  const visit = raw.farmVisits.find((v) => Date.parse(v.at) >= addDays(today, -1).getTime() && Date.parse(v.at) < addDays(today, 14).getTime())
  const vev = visit ? week().find((e) => e.id === visit.id) : undefined
  check('A437 une VISITE de ferme produit un rendez-vous du PO, relié à sa ferme', vev?.kind === 'visit' && !vev.reflection && vev.link?.kind === 'farm' && vev.link.id === visit?.farmId)
  check('A437 un rendez-vous se déplace, se modifie ; une réunion s’allonge', !!mev && agendaCanMove(mev) && agendaCanEdit(mev) && agendaCanResize(mev))
  const reflections = week().filter((e) => e.reflection)
  check('A437 un REFLET ne se déplace, ne s’allonge ni ne se modifie depuis l’agenda', reflections.length > 0 && reflections.every((e) => !agendaCanMove(e) && !agendaCanResize(e) && !agendaCanEdit(e)), `${reflections.length} reflets`)
  const screen = src('src/ui/screens/coordinator/AgendaScreen.tsx')
  const grid = src('src/ui/components/agendaGrid.tsx')
  const panel = src('src/ui/agenda/EventPanel.tsx')
  check('A437 … l’écran prend ces règles dans le cœur (aucune copie de la règle)', /const canMove = agendaCanMove/.test(screen) && /const canResize = agendaCanResize/.test(screen) && /agendaCanEdit\(event\)/.test(panel))
  check('A437 … la grille n’arme aucun geste sur un reflet', /const movable = !reflection/.test(grid) && /const resizable = !reflection/.test(grid))
  check('A437 … le panneau d’un reflet mène à sa source en un geste', /event-open-source/.test(panel) && /navigate\(event\.href\)/.test(panel))
  store.deleteGeneralMeeting(meeting.id)

  // Une tâche datée : en haut du jour.
  const list = store.createTaskList('רשימת בדיקה')!
  const t = store.createTask({ listId: list.id, title: 'משימה עם תאריך', dueOn: localDayKey(addDays(today, 3)), dueTime: '9:05' })!
  const due = access.getDueTasks(addDays(today, -1), addDays(today, 14))
  check('A437 une TÂCHE datée apparaît en haut de son jour', (due.get(localDayKey(addDays(today, 3))) ?? []).some((x) => x.id === t.id))
  check('A437 … l’heure facultative est normalisée (9:05 → 09:05)', t.dueTime === '09:05', String(t.dueTime))
  check('A437 … une tâche datée n’est PAS un rendez-vous (aucun bloc dans la grille)', !week().some((e) => e.id === t.id))
  store.setTaskDone(t.id, true)
  check('A437 … cochée, elle quitte l’agenda', !(access.getDueTasks(addDays(today, -1), addDays(today, 14)).get(localDayKey(addDays(today, 3))) ?? []).some((x) => x.id === t.id))
  store.deleteTaskList(list.id)
  check('A437 l’écran יומן lit les reflets (`getCalendarEvents`) et les tâches datées', /getCalendarEvents\(from, to\)/.test(screen) && /getDueTasks\(from, to\)/.test(screen))
}

// ---------------------------------------------------------------------------
section('A438 — les tâches')
// ---------------------------------------------------------------------------
{
  const list = store.createTaskList('מוסדות בדיקה')!
  const other = store.createTaskList('חוות בדיקה')!
  check('A438 une liste se crée, un nom vide est refusé', !!list && store.createTaskList('   ') === null)
  const a = store.createTask({ listId: list.id, title: 'אחת' })!
  const b = store.createTask({ listId: list.id, title: 'שתיים' })!
  const c = store.createTask({ listId: list.id, title: 'שלוש' })!
  check('A438 une tâche neuve se pose EN TÊTE de sa liste', openTasks(raw.tasks, list.id).map((x) => x.title).join(',') === 'שלוש,שתיים,אחת')
  check('A438 … une tâche dans une liste inconnue est refusée', store.createTask({ listId: 'nope', title: 'x' }) === null)

  // Cocher : visible un instant, puis les archives.
  store.setTaskDone(b.id, true)
  const done = raw.tasks.find((x) => x.id === b.id)!
  const tick = Date.parse(done.doneAt!)
  check('A438 cochée, elle quitte les tâches à faire', !openTasks(raw.tasks, list.id).some((x) => x.id === b.id))
  check('A438 … mais reste VISIBLE, à sa place, un instant', visibleTasks(raw.tasks, list.id, tick + 500).map((x) => x.id).join(',') === [c.id, b.id, a.id].join(','))
  check(`A438 … puis (${LINGER_MS / 1000} s) rejoint les archives`, !visibleTasks(raw.tasks, list.id, tick + LINGER_MS + 1).some((x) => x.id === b.id) && archivedTasks(raw.tasks, list.id).some((x) => x.id === b.id))
  store.setTaskDone(b.id, false)
  check('A438 décochée (rouverte des archives), elle revient À SA PLACE', openTasks(raw.tasks, list.id).map((x) => x.id).join(',') === [c.id, b.id, a.id].join(','))

  // Archiver sans faire, et revenir.
  store.setTaskArchived(a.id, true)
  check('A438 archivée sans être faite : dans les archives, plus dans la liste', archivedTasks(raw.tasks, list.id).some((x) => x.id === a.id) && !visibleTasks(raw.tasks, list.id, Date.now()).some((x) => x.id === a.id))
  store.setTaskArchived(a.id, false)
  check('A438 … et en ressort', openTasks(raw.tasks, list.id).some((x) => x.id === a.id))

  // Supprimer : le retour en arrière.
  const del = store.undoable(() => store.deleteTask(c.id))
  check('A438 supprimer la retire', !raw.tasks.some((x) => x.id === c.id))
  del.undo()
  check('A438 … « ביטול » la rend, intacte, à sa place', openTasks(raw.tasks, list.id)[0]?.id === c.id)

  // L'ordre manuel.
  store.moveTask(a.id, 0)
  const order = openTasks(raw.tasks, list.id).map((x) => x.title).join(',')
  check('A438 l’ordre est CELUI DU PO (glissée en tête, elle y reste)', order === 'אחת,שלוש,שתיים', order)
  const rows = raw.tasks.filter((x) => x.listId === list.id).map((x) => MAPPINGS.tasks.fromRows(MAPPINGS.tasks.toRows(x)[0].rows[0], {}))
  check('A438 … et il est GARDÉ (l’aller-retour en base rend le même ordre)', openTasks(rows, list.id).map((x) => x.title).join(',') === order)
  check('A438 … glisser sans bouger n’écrit rien', reorderedRanks(raw.tasks, a.id, 0) === null)

  // Changer de liste.
  store.updateTask(c.id, { listId: other.id })
  check('A438 une tâche change de liste (et se pose en tête de l’autre)', raw.tasks.find((x) => x.id === c.id)?.listId === other.id && openTasks(raw.tasks, other.id)[0]?.id === c.id)
  store.moveTask(b.id, 1, other.id)
  check('A438 … ou s’y glisse à une place donnée', openTasks(raw.tasks, other.id).map((x) => x.id).join(',') === [c.id, b.id].join(','))

  // Le lien vers une fiche.
  const inst = raw.institutions[0]
  store.updateTask(a.id, { link: { kind: 'institution', id: inst.id }, note: 'שורה ראשונה\nשורה שנייה' })
  const linked = tasksLinkedTo(raw.tasks, 'institution', inst.id)
  check('A438 une tâche se relie à une fiche, et la fiche la voit', linked.some((x) => x.id === a.id))
  const back = MAPPINGS.tasks.fromRows(MAPPINGS.tasks.toRows(raw.tasks.find((x) => x.id === a.id)!)[0].rows[0], {})
  check('A438 … le lien et la note sur plusieurs lignes survivent à la base', back.link?.kind === 'institution' && back.link.id === inst.id && back.note === 'שורה ראשונה\nשורה שנייה')

  // Supprimer une liste : ses tâches partent, « ביטול » les rend.
  const n = raw.tasks.filter((x) => x.listId === other.id).length
  const dl = store.undoable(() => store.deleteTaskList(other.id))
  check('A438 supprimer une liste emporte ses tâches', !raw.taskLists.some((l) => l.id === other.id) && !raw.tasks.some((x) => x.listId === other.id))
  dl.undo()
  check('A438 … et « ביטול » rend la liste ET ses tâches', raw.taskLists.some((l) => l.id === other.id) && raw.tasks.filter((x) => x.listId === other.id).length === n)
  store.renameTaskList(list.id, 'שם חדש')
  check('A438 une liste se renomme', raw.taskLists.find((l) => l.id === list.id)?.name === 'שם חדש')
  store.deleteTaskList(list.id)
  store.deleteTaskList(other.id)

  // Les échéances, par jour.
  const mk = (id: string, dueOn: string | null, dueTime: string | null, rank: number): Task => ({ id, listId: 'l', title: id, note: '', rank, link: null, dueOn, dueTime, doneAt: null, archivedAt: null, createdAt: '', updatedAt: '' })
  const byDay = dueTasksByDay([mk('x', '2026-10-15', null, 0), mk('y', '2026-10-15', '14:00', 5), mk('z', '2026-10-15', '09:00', 9), mk('w', '2026-10-20', null, 0)], '2026-10-14', '2026-10-16')
  check('A438 en haut du jour : celles à heure d’abord (dans l’ordre de l’heure), puis les autres', (byDay.get('2026-10-15') ?? []).map((x) => x.id).join(',') === 'z,y,x' && !byDay.has('2026-10-20'))
}

// ---------------------------------------------------------------------------
section('A439 — l’aide-mémoire')
// ---------------------------------------------------------------------------
{
  check('A439 trois banques : מוסדות, חקלאים, מתנדבים', MEMO_BANKS.map((b) => b.bank).join(',') === 'institutions,farmers,volunteers')
  check('A439 … chacune a les questions ET les points à dire', MEMO_BANKS.every((b) => b.sections.includes('questions') && b.sections.includes('say')))
  const he = JSON.parse(src('src/locales/he.json')) as { memo: { bank: Record<string, string>; section: Record<string, Record<string, string>> } }
  check('A439 … leurs titres en hébreu', he.memo.bank.institutions === 'מוסדות וישיבות' && he.memo.bank.farmers === 'חקלאים' && he.memo.bank.volunteers === 'מתנדבים')
  const L = (id: string, bank: MemoLine['bank'], section: MemoLine['section'], hebrew: string, fr: string): MemoLine => ({ id, bank, section, he: hebrew, fr, rank: 0, createdAt: '', updatedAt: '' })
  const lines = [
    L('1', 'institutions', 'questions', 'כמה בחורים בכל לילה?', 'Combien par nuit ?'),
    L('2', 'farmers', 'questions', 'יש גד״ש בשטח?', 'Des grandes cultures ?'),
    L('3', 'volunteers', 'say', 'מגיעים בזוגות.', 'On vient à deux, la nuit.'),
  ]
  const all = memoView(lines, '')
  check('A439 sans recherche : les trois banques, chaque section présente', all.length === 3 && all.every((b) => b.sections.length === 2))
  const night = memoView(lines, 'nuit')
  check('A439 UNE recherche filtre les TROIS banques à la fois (« nuit » : deux banques)', night.filter((b) => b.count > 0).map((b) => b.bank).join(',') === 'institutions,volunteers', JSON.stringify(night.map((b) => [b.bank, b.count])))
  check('A439 … en hébreu aussi, sans gershayim (« גדש » trouve « גד״ש »)', memoMatches(lines[1], 'גדש') && normalizeForSearch('גד״ש') === 'גדש')
  check('A439 … sans niqqud (« בַּחוּרִים » trouve « בחורים »)', memoMatches(lines[0], 'בַּחוּרִים'))
  const created = store.createMemoLine({ bank: 'farmers', section: 'say', he: 'שורה שלי', fr: 'ma ligne' })
  check('A439 le PO ajoute sa ligne', !!created && raw.memoLines.some((l) => l.id === created.id))
  check('A439 … une ligne vide est refusée', store.createMemoLine({ bank: 'farmers', section: 'say', he: ' ', fr: '' }) === null)
  store.updateMemoLine(created!.id, { he: 'שורה מתוקנת' })
  check('A439 … la modifie', raw.memoLines.find((l) => l.id === created!.id)?.he === 'שורה מתוקנת')
  const list = store.createTaskList('מהעזר')!
  const fromMemo = store.createTask({ listId: list.id, title: raw.memoLines.find((l) => l.id === created!.id)!.he, note: 'ma ligne' })
  check('A439 une ligne devient une tâche (son hébreu pour titre)', fromMemo?.title === 'שורה מתוקנת')
  store.deleteTaskList(list.id)
  const del = store.undoable(() => store.deleteMemoLine(created!.id))
  check('A439 … la supprime, et « ביטול » la rend', !raw.memoLines.some((l) => l.id === created!.id) && (del.undo(), raw.memoLines.some((l) => l.id === created!.id)))
  store.deleteMemoLine(created!.id)
  const pane = src('src/ui/tasks/MemoPane.tsx')
  check('A439 l’hébreu en GRAND (22 px), le français en petit', /text-\[1\.375rem\]/.test(pane) && /data-testid="memo-fr"/.test(pane))
  check('A439 aucune archive dans l’aide-mémoire (des références)', !/archiv/i.test(src('src/core/memo.ts').replace(/s'archivent pas|ne s'archivent|archivent/g, '')))
}

// ---------------------------------------------------------------------------
section('A440 — le lien d’un rendez-vous vers une fiche')
// ---------------------------------------------------------------------------
{
  const patch = meetingLinkPatch({ kind: 'institution', id: 'inst-x' })
  check('A440 un seul lien à la fois (poser une institution efface ferme et piste)', patch.institutionId === 'inst-x' && patch.farmId === null && patch.leadId === null)
  check('A440 … et il se relit', meetingLink(patch)?.kind === 'institution' && meetingLink({ farmId: 'f' })?.kind === 'farm' && meetingLink({ leadId: 'l' })?.kind === 'lead' && meetingLink({}) === null)
  const m = store.createGeneralMeeting({ title: 'קשור', at: new Date(today.getTime() + 86_400_000).toISOString(), endAt: new Date(today.getTime() + 90_000_000).toISOString(), location: '', person: '', note: '', ...meetingLinkPatch({ kind: 'institution', id: raw.institutions[0].id }) })
  const ev = week().find((e) => e.id === m.id)
  check('A440 l’agenda lit le lien du rendez-vous', ev?.link?.kind === 'institution' && ev.link.id === raw.institutions[0].id)
  const row = MAPPINGS.generalMeetings.toRows(m)[0].rows[0]
  const back = MAPPINGS.generalMeetings.fromRows(row, {})
  check('A440 … colonnes `institution_id` / `entity_id`, gardées à l’aller-retour', row.institution_id === raw.institutions[0].id && row.entity_id === null && back.institutionId === raw.institutions[0].id)
  store.deleteGeneralMeeting(m.id)
}

// ---------------------------------------------------------------------------
section('A441 — le geste : le quart d’heure, la durée, le bord inférieur')
// ---------------------------------------------------------------------------
{
  check('A441 magnétisme au quart d’heure (07:52 → 07:45, 07:53 → 08:00)', snapMinute(7 * 60 + 52) === 7 * 60 + 45 && snapMinute(7 * 60 + 53) === 8 * 60)
  check('A441 … jamais hors du jour', snapMinute(-30) === 0 && snapMinute(24 * 60 + 40) === 24 * 60 - 15)
  check('A441 toucher un créneau : le quart d’heure SOUS le doigt (56 px l’heure, 30 px → 00:30)', minuteAtOffset(30, 56) === 30 && minuteAtOffset(56 * 10 + 13, 56) === 600)
  const day = new Date(2026, 9, 15)
  const span = movedSpan('2026-10-14T13:00:00.000Z', '2026-10-14T15:30:00.000Z', day, 9 * 60 + 15)
  check('A441 déplacer garde la DURÉE (2 h 30)', Date.parse(span.endAt) - Date.parse(span.at) === 150 * 60_000 && new Date(span.at).getHours() === 9 && new Date(span.at).getMinutes() === 15)
  const at = new Date(2026, 9, 15, 14, 30).toISOString()
  check('A441 le bord inférieur allonge au quart d’heure (fin à 16:15)', new Date(resizedEnd(at, 16 * 60 + 10)).getHours() === 16 && new Date(resizedEnd(at, 16 * 60 + 10)).getMinutes() === 15)
  check('A441 … jamais moins d’un quart d’heure', Date.parse(resizedEnd(at, 14 * 60)) - Date.parse(at) === 15 * 60_000)
  const grid = src('src/ui/components/agendaGrid.tsx')
  check('A441 au doigt, le défilement est refusé tant qu’un bloc est armé (touchmove non passif)', /addEventListener\('touchmove', block, \{ passive: false \}\)/.test(grid))
  check('A441 … l’appui long d’iOS ne sélectionne pas le texte du bloc', /select-none/.test(grid) && /-webkit-touch-callout:none/.test(grid))
  check('A441 … un clic qui SUIT un glissement n’ouvre pas le bloc', /suppressClick/.test(grid))
}

// ---------------------------------------------------------------------------
section('A442 — la base')
// ---------------------------------------------------------------------------
{
  const sql = src('supabase/migrations/20261013000300_be_tasks_agenda.sql')
  for (const table of ['task_lists', 'tasks', 'memo_lines']) {
    check(`A442 ${table} : créée, RLS activée et forcée, politique du coordinateur`, new RegExp(`create table if not exists public\\.${table}`).test(sql) && new RegExp(`alter table public\\.${table} enable row level security`).test(sql) && new RegExp(`alter table public\\.${table} force row level security`).test(sql) && new RegExp(`create policy ${table}_coordinator_all`).test(sql))
    check(`A442 ${table} : ses droits dans la MÊME migration, rien pour anon`, new RegExp(`grant select, insert, update, delete on public\\.${table} to authenticated`).test(sql) && new RegExp(`revoke all on public\\.${table} from anon`).test(sql) && !new RegExp(`grant[^;]*on public\\.${table} to anon`).test(sql))
  }
  check('A442 les deux colonnes de lien d’un rendez-vous', /general_meetings add column if not exists institution_id/.test(sql) && /general_meetings add column if not exists entity_id/.test(sql))
  check('A442 aucune table de reflet (règle 0 : rien n’est recopié)', !/create table[^;]*(reflect|calendar_entr|agenda_entr)/i.test(sql))
  check('A442 les liens sont SOUPLES (seul `list_id` est une clé étrangère)', (sql.match(/references /g) ?? []).length === 1 && /list_id\s+text not null references public\.task_lists/.test(sql))
}

// ---------------------------------------------------------------------------
section('A443 — le champ de dictée')
// ---------------------------------------------------------------------------
{
  const fields = src('src/ui/components/fields.tsx')
  const block = fields.slice(fields.indexOf('export function DictationField'), fields.indexOf('export function InlineActions'))
  check('A443 un `<textarea>` ordinaire (multi-lignes), sens automatique', /<textarea/.test(block) && /dir="auto"/.test(block) && /data-dictation=""/.test(block))
  check('A443 il ne se ferme jamais tout seul (aucun onBlur, aucune touche Entrée interceptée)', !/onBlur|onKeyDown|Enter/.test(block))
  const ui = ['src/ui/tasks/TasksPane.tsx', 'src/ui/tasks/MemoPane.tsx', 'src/ui/tasks/TaskQuickAdd.tsx', 'src/ui/agenda/EventPanel.tsx', 'src/ui/agenda/links.tsx'].map(src).join('\n')
  check('A443 les écrans de BE n’ont AUCUN `<input type="text">` : tout texte est dicté dans le champ de dictée', !/<input(?![^>]*type="(date|time|checkbox)")/.test(ui))
  check('A443 aucune reconnaissance vocale maison (SpeechRecognition absent du code)', !/SpeechRecognition|webkitSpeech/.test(ui + fields))
}

// ---------------------------------------------------------------------------
section('A444 — aucune donnée réelle dans le dépôt')
// ---------------------------------------------------------------------------
{
  const SEED = 'private/be/seed-be.json'
  if (!existsSync(SEED)) {
    check('A444 (le fichier du PO est absent de cette machine : vérification sautée)', true)
  } else {
    const seed = JSON.parse(src(SEED)) as {
      events: Array<Record<string, unknown>>
      tasks: Array<{ title_he: string; note?: string }>
      banks: Array<{ sections: Array<{ items: Array<{ he: string; fr: string }> }> }>
    }
    const needles = new Set<string>()
    for (const t of seed.tasks) {
      needles.add(t.title_he)
      if (t.note && t.note.length >= 16) needles.add(t.note)
    }
    for (const e of seed.events) for (const k of ['title_he', 'notes_he', 'place_he', 'contact_he']) if (typeof e[k] === 'string') needles.add(e[k] as string)
    for (const b of seed.banks) for (const s of b.sections) for (const i of s.items) {
      if (i.he.length >= 14) needles.add(i.he)
      if (i.fr.length >= 18) needles.add(i.fr)
    }
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.') || name === 'private' || name.startsWith('dist')) continue
        const p = join(dir, name)
        const st = statSync(p)
        if (st.isDirectory()) walk(p)
        else if (/\.(ts|tsx|json|sql|md|css|html|txt|log)$/.test(name) && st.size < 4_000_000) files.push(p)
      }
    }
    for (const d of ['src', 'scripts', 'supabase', 'docs', 'public']) if (existsSync(d)) walk(d)
    for (const f of ['ETAT.md', 'PROJECT_STATE.md', 'index.html']) if (existsSync(f)) files.push(f)
    const hits: string[] = []
    for (const f of files) {
      const text = src(f)
      for (const n of needles) if (text.includes(n)) hits.push(`${f}: « ${n.slice(0, 24)}… »`)
    }
    check(`A444 aucune des ${needles.size} phrases du fichier du PO dans ${files.length} fichiers du dépôt`, hits.length === 0, hits.slice(0, 5).join(' | '))
  }
}

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
