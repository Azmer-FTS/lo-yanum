-- ═══════════════════════════════════════════════════════════════════════════
-- AV2 (2026-10-08) — LES POINTS DE REPÈRE (נקודות ציון)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un nom et un point, posés d'un appui long sur une carte. Aucune clé
-- étrangère ; ne compte dans AUCUN compteur (objectif, dounams, couverture).
-- ⚠️ Règle d'AO0 : la table naît AVEC ses `grant` ; rien pour `anon`.
-- ⛔ Un nom vide est refusé PAR LA BASE aussi (A324) : `check`.

create table if not exists public.landmarks (
  id          text primary key,
  name        text not null check (length(btrim(name)) > 0),
  lat         double precision not null,
  lng         double precision not null,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.landmarks enable row level security;
alter table public.landmarks force row level security;

drop policy if exists landmarks_coordinator_all on public.landmarks;
create policy landmarks_coordinator_all on public.landmarks
  for all to authenticated
  using (private.is_coordinator()) with check (private.is_coordinator());

grant select, insert, update, delete on public.landmarks to authenticated;
grant select, insert, update, delete on public.landmarks to service_role;
revoke all on public.landmarks from anon;
