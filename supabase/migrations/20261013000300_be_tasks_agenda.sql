-- ═══════════════════════════════════════════════════════════════════════════
-- BE (2026-10-13) — L'AGENDA, LES TÂCHES, ET LA FIN DU COPIER-COLLER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ADDITIVE : trois tables neuves, deux colonnes neuves. Rien n'est supprimé,
-- rien n'est réécrit. Appliquée AVANT le déploiement (le build qui les lit les
-- trouve donc déjà là).
--
-- ⚠️ Règle d'AO0 : chaque table naît AVEC ses `grant` et sa RLS, dans cette
--    même migration ; RIEN pour `anon` (la surface anonyme reste de trois
--    fonctions nommées — `bun run appass`).
--
-- ★ LES LIENS SONT SOUPLES (aucune clé étrangère vers une fiche) : une ferme
--   ou une institution supprimée ne doit emporter ni le rendez-vous ni la
--   tâche du PO. Seul `tasks.list_id` est une vraie clé : une tâche appartient
--   toujours à une liste.
--
-- ★ AUCUN REFLET N'EST STOCKÉ. Le reflet d'un itinéraire ou d'une garde dans
--   l'agenda est calculé à la lecture depuis sa source (règle 0 du brief :
--   « rien n'est recopié, jamais »). Il n'y a donc pas de table pour eux.

-- --- 1. Le rendez-vous relié à une institution ou à une ferme ---------------
-- (la piste a déjà `lead_id`, posée en AS6.6.) Un seul des trois à la fois :
-- l'interface le garantit.

alter table public.general_meetings add column if not exists institution_id text;
alter table public.general_meetings add column if not exists entity_id text;

-- --- 2. Les listes de tâches ------------------------------------------------

create table if not exists public.task_lists (
  id          text primary key,
  name        text not null check (length(btrim(name)) > 0),
  rank        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.task_lists enable row level security;
alter table public.task_lists force row level security;

drop policy if exists task_lists_coordinator_all on public.task_lists;
create policy task_lists_coordinator_all on public.task_lists
  for all to authenticated
  using (private.is_coordinator()) with check (private.is_coordinator());

grant select, insert, update, delete on public.task_lists to authenticated;
grant select, insert, update, delete on public.task_lists to service_role;
revoke all on public.task_lists from anon;

-- --- 3. Les tâches ------------------------------------------------------------
-- `rank` : l'ordre du PO dans sa liste (jamais un tri automatique).
-- `done_at` : cochée ; `archived_at` : mise de côté sans être faite. Les deux
-- vides = à faire. `due_on` + `due_time` facultatifs : l'échéance.

create table if not exists public.tasks (
  id           text primary key,
  list_id      text not null references public.task_lists (id) on delete cascade,
  title        text not null default '',
  note         text not null default '',
  rank         integer not null default 0,
  link_kind    text check (link_kind in ('institution', 'farm', 'lead', 'meeting')),
  link_id      text,
  due_on       date,
  due_time     text check (due_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  done_at      timestamptz,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((link_kind is null) = (link_id is null))
);

create index if not exists tasks_list_idx on public.tasks (list_id);
create index if not exists tasks_link_idx on public.tasks (link_kind, link_id);
create index if not exists tasks_due_idx on public.tasks (due_on);

alter table public.tasks enable row level security;
alter table public.tasks force row level security;

drop policy if exists tasks_coordinator_all on public.tasks;
create policy tasks_coordinator_all on public.tasks
  for all to authenticated
  using (private.is_coordinator()) with check (private.is_coordinator());

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.tasks to service_role;
revoke all on public.tasks from anon;

-- --- 4. L'aide-mémoire : trois banques, deux sections chacune --------------
-- Ce sont des RÉFÉRENCES : rien ne s'y archive. Une ligne porte l'hébreu (lu à
-- voix haute) et le français ; l'un des deux au moins.

create table if not exists public.memo_lines (
  id          text primary key,
  bank        text not null check (bank in ('institutions', 'farmers', 'volunteers')),
  section     text not null check (section in ('questions', 'say')),
  he          text not null default '',
  fr          text not null default '',
  rank        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (length(btrim(he)) > 0 or length(btrim(fr)) > 0)
);

alter table public.memo_lines enable row level security;
alter table public.memo_lines force row level security;

drop policy if exists memo_lines_coordinator_all on public.memo_lines;
create policy memo_lines_coordinator_all on public.memo_lines
  for all to authenticated
  using (private.is_coordinator()) with check (private.is_coordinator());

grant select, insert, update, delete on public.memo_lines to authenticated;
grant select, insert, update, delete on public.memo_lines to service_role;
revoke all on public.memo_lines from anon;
