-- ===========================================================================
-- AH11.2 (2026-09-10) — LES RÉGLAGES DU COORDINATEUR REMONTENT CÔTÉ SERVEUR.
-- ===========================================================================
--
--   « Les réglages, régions et gabarits du PO vivent dans le navigateur. Un
--     changement d'appareil ou un nettoyage de Safari les perd. Remonte-les
--     côté serveur, rattachés à son compte, avec le local en cache pour le
--     hors-ligne. S'il y a une raison de ne pas le faire, dis-la. »
--
-- ★★ UNE LIGNE PAR COMPTE, ET UN SEUL `jsonb`. Pas une table par famille de
--    réglage, pas une ligne par clé. Trois raisons, et la troisième suffirait :
--
--    1. CE SONT DES RÉGLAGES, PAS DES DONNÉES. Rien ne les JOINT à quoi que ce
--       soit, rien ne les filtre, rien ne les agrège. Une colonne par réglage
--       aurait demandé une migration à chaque fois que le PO gagne un bouton —
--       c'est-à-dire à chaque passe.
--
--    2. ILS S'ÉCRIVENT ET SE LISENT ENSEMBLE. L'application les charge une
--       fois au démarrage et les repousse en bloc ; une ligne par clé
--       multiplierait par vingt le nombre d'allers-retours pour la même
--       information.
--
--    3. LEUR FORME EST DÉJÀ DU TEXTE. Chacun vit aujourd'hui dans
--       `localStorage` sous une clé `lo-yanum:…` et vaut une chaîne. La table
--       porte donc EXACTEMENT ce que le navigateur porte, ce qui rend la
--       synchronisation triviale et surtout RÉVERSIBLE : couper le serveur
--       laisse l'application dans l'état d'avant, sans perte.
--
-- ⚠️ CE QUI N'Y MONTE PAS, ET C'EST DÉLIBÉRÉ. Les préférences d'APPAREIL —
--    quels blocs sont repliés, quel mode de carte sur quel écran, le
--    laissez-passer de l'agriculteur, la mémoire de la temporisation d'AG2 —
--    restent locales. Les remonter ferait voyager d'un iPad à un iPhone une
--    disposition qui n'a de sens que sur l'écran où elle a été choisie, et
--    ferait suivre un laissez-passer d'appareil à un autre, ce qui est
--    exactement ce qu'AG2 empêche.
--
-- ⚠️ RLS : SA PROPRE LIGNE, ET RIEN D'AUTRE. Pas de politique « for all » de
--    coordinateur ici, contrairement au reste du schéma : les réglages d'un
--    compte ne regardent aucun autre compte, pas même celui d'un rekaz.
--
-- ADDITIVE : aucune table touchée, aucune politique existante modifiée.
-- ===========================================================================

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- `{ "lo-yanum:target": "…", "lo-yanum:agreement-doc-template": "…" }`
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "own settings read" on public.user_settings;
create policy "own settings read" on public.user_settings
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own settings write" on public.user_settings;
create policy "own settings write" on public.user_settings
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own settings update" on public.user_settings;
create policy "own settings update" on public.user_settings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own settings delete" on public.user_settings;
create policy "own settings delete" on public.user_settings
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.user_settings to authenticated;
