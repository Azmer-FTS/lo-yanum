-- ===========================================================================
-- ★★ AO3.6 (2026-09-24) — LES RAPPORTS ENVOYÉS SONT CONSERVÉS.
-- ===========================================================================
--
--   « Les rapports envoyés sont conservés, pour que la comparaison
--     fonctionne et qu'il puisse retrouver ce qu'il a annoncé. »
--
-- ★★ LA COMPARAISON EST LA RAISON D'ÊTRE DE LA TABLE, PAS UN ARCHIVAGE POLI.
--    Ce que l'interlocuteur du PO attend n'est pas un état, c'est une
--    ÉVOLUTION — « ce qui a bougé depuis la dernière fois ». Un état se
--    recalcule à tout moment depuis `entities` ; ce qui ne se recalcule pas,
--    c'est CE QUE LE PO A ANNONCÉ le mois dernier. Si la ligne n'est pas
--    gardée, le delta du mois prochain est une soustraction avec un seul
--    terme.
--
-- ★ `payload` PORTE AUSSI L'INSTANTANÉ PAR EXPLOITATION (`farms`), et pas
--   seulement les totaux. Sans lui, « quelles fiches ont changé de statut »
--   serait indécidable : les totaux disent qu'il y a une signée de plus, ils
--   ne disent pas laquelle. Voir `ActivityReportRecord` (src/core/activity.ts).
--
-- ★ `body` GARDE LE TEXTE EXACTEMENT TEL QU'IL A ÉTÉ ENVOYÉ. Le rapport se
--   recalcule ; le message collé dans WhatsApp le 3 du mois, non. Le PO doit
--   pouvoir « retrouver ce qu'il a annoncé », au mot près, même si la base a
--   bougé depuis.
--
-- ⚠️ UNE LIGNE PAR RAPPORT, RATTACHÉE AU COMPTE — même forme et mêmes raisons
--    que `user_settings` (20260910000100), sauf qu'ici il y a PLUSIEURS lignes
--    par compte : c'est un journal, pas un réglage.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️⚠️ AO0 — LES AUTORISATIONS D'API SONT DANS CETTE MIGRATION, ET C'EST
--      DÉSORMAIS LA RÈGLE DU PROJET (PROJECT_STATE.md).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Supabase l'a annoncé : à partir du 30 octobre 2026, une table créée dans
-- `public` n'est PLUS automatiquement exposée à l'API. Celle-ci est créée
-- après la date : sans les `grant` ci-dessous, elle existerait en base et
-- l'application recevrait un 401 sur chaque lecture — sans qu'aucune erreur
-- SQL ne soit levée nulle part.
--
-- ⛔ RIEN POUR `anon`, ET C'EST LE BESOIN RÉEL. Lo Yanum n'a aucune surface
--    anonyme : aucune des 32 politiques de `20260830000200_rls.sql` ne vise
--    `anon`, et `bun run auth` PROUVE qu'une lecture anonyme est refusée. Un
--    rapport d'activité est le journal de travail du coordinateur ; le modèle
--    général de Supabase (`grant select … to anon`) serait ici une porte
--    ouverte sur rien de bon.
-- ===========================================================================

create table if not exists public.activity_reports (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- La période couverte, telle que le PO l'a choisie. `date` et non
  -- `timestamptz` : « cette semaine » est une affaire de jours, pas d'heures,
  -- et un fuseau ferait glisser une borne d'un jour selon l'appareil.
  period_from date not null,
  period_to   date not null,
  generated_at timestamptz not null default now(),
  -- ISO `YYYY-MM-DD` du rapport qui sert de repère, ou null pour le premier.
  previous_id text,
  -- Les chiffres et l'instantané par exploitation. Voir `ActivityReportRecord`.
  payload     jsonb not null default '{}'::jsonb,
  -- Le texte hébreu EXACTEMENT tel qu'il est parti dans WhatsApp.
  body        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists activity_reports_user_idx
  on public.activity_reports (user_id, period_to desc);

alter table public.activity_reports enable row level security;
alter table public.activity_reports force row level security;

-- Ses propres rapports, et rien d'autre — comme `user_settings`, et pour la
-- même raison : le journal de travail d'un compte ne regarde aucun autre
-- compte, pas même celui d'un רכז.
drop policy if exists "own reports read" on public.activity_reports;
create policy "own reports read" on public.activity_reports
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own reports write" on public.activity_reports;
create policy "own reports write" on public.activity_reports
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own reports update" on public.activity_reports;
create policy "own reports update" on public.activity_reports
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own reports delete" on public.activity_reports;
create policy "own reports delete" on public.activity_reports
  for delete to authenticated
  using (user_id = auth.uid());

-- AO0 — les autorisations d'API, dans la migration qui crée la table.
grant select, insert, update, delete on public.activity_reports to authenticated;
grant select, insert, update, delete on public.activity_reports to service_role;
