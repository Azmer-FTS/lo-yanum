-- ★★ BB (2026-10-12) — institutions : secrétariat, coordination préalable,
-- fiches liées, deux natures de plus. ADDITIVE : aucune colonne retirée,
-- aucune donnée réécrite ; rien pour `anon` (les privilèges par défaut du
-- schéma sont révoqués depuis AP).
--
-- · office_phone / office_address : le téléphone et l'adresse de
--   l'ÉTABLISSEMENT (מזכירות). Pas une personne, pas de rang.
-- · coordination_required / coordination_note : « נדרש תיאום מוקדם » et PAR QUI.
-- · related_ids : les fiches liées (même ensemble, secrétariat partagé).
-- · kind : + 'yeshiva' (ישיבה גבוהה), 'yeshiva_hs' (ישיבה תיכונית).
-- · contacts (jsonb) : chaque contact peut porter `phones` [{number, label}] ;
--   aucun changement de schéma (le tableau reste un tableau).

alter table public.institutions
  add column if not exists office_phone text not null default '',
  add column if not exists office_address text not null default '',
  add column if not exists coordination_required boolean not null default false,
  add column if not exists coordination_note text not null default '',
  add column if not exists related_ids text[] not null default '{}';

alter table public.institutions drop constraint if exists institutions_kind_check;
alter table public.institutions add constraint institutions_kind_check
  check (kind = any (array['mechina', 'hesder', 'yeshiva', 'yeshiva_hs', 'midrasha', 'school', 'other']));
