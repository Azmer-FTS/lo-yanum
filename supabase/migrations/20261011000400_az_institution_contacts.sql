-- ═══════════════════════════════════════════════════════════════════════════
-- ★★ AZ5 (2026-10-11) — LES CONTACTS D'UNE INSTITUTION, RANGÉS PAR RÔLE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Une institution porte PLUSIEURS contacts, rangés par une hiérarchie FIXE :
--   1. head        — ראש ישיבה / מנהל. UN SEUL. Il REPRÉSENTE l'institution.
--   2. ram         — ר״מ. Zéro, un ou plusieurs.
--   3. coordinator — רכז désigné pour les volontaires. Zéro ou un.
--   4. assistant / contact — עוזר, איש קשר. Zéro ou plusieurs.
-- Chaque contact : { "id", "role", "name", "phone", "note" }.
--
-- `contact_name` / `contact_phone` RESTENT : ils sont le MIROIR du rang 1,
-- tenu par l'application (`settleInstitution`). Vides quand le rang 1 manque
-- (« חסר ראש ישיבה ») — jamais un autre contact à sa place.
--
-- « קטינים » : une INFORMATION (tranche d'âge), rien d'autre — aucune règle,
-- aucun blocage n'en dépend.
--
-- `kind` gagne « school » (תיכון) : le libellé du rang 1 y devient מנהל.
--
-- Additive : le code d'avant AZ5 n'écrit ni ne lit ces colonnes.
-- ⛔ Rien pour `anon` (règle d'AP) ; la table existe avec ses droits.

alter table public.institutions add column if not exists contacts jsonb not null default '[]'::jsonb;
alter table public.institutions add column if not exists minors_age_min smallint;
alter table public.institutions add column if not exists minors_age_max smallint;

alter table public.institutions drop constraint if exists institutions_contacts_array;
alter table public.institutions add constraint institutions_contacts_array check (jsonb_typeof(contacts) = 'array');

alter table public.institutions drop constraint if exists institutions_minors_age_check;
alter table public.institutions add constraint institutions_minors_age_check
  check ((minors_age_min is null) = (minors_age_max is null) and (minors_age_min is null or minors_age_min <= minors_age_max));

alter table public.institutions drop constraint if exists institutions_kind_check;
alter table public.institutions add constraint institutions_kind_check
  check (kind = any (array['mechina', 'hesder', 'midrasha', 'school', 'other']));
