-- ═══════════════════════════════════════════════════════════════════════════
-- AW2 (2026-10-09) — AJOUTER DES CONTACTS : LE VOLONTAIRE ET SON INSTITUTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. `volunteers.institution_id` : un lot de volontaires se rattache EN UNE
--    FOIS à l'institution choisie (A335). Le texte libre `yeshiva` reste (les
--    anciennes fiches, l'export de l'association) et porte le nom affiché ;
--    l'identifiant est le lien. Une institution supprimée détache ses
--    volontaires sans les supprimer (`on delete set null`).
-- 2. `leads.source` accepte 'vcf' : une piste née d'une fiche de contact dit
--    d'où elle vient, comme celles du collage ('paste').
--
-- ⚠️ Règle d'AO0 : aucune table neuve, donc aucun `grant` neuf ; la colonne
--    hérite des droits de sa table (rien pour `anon`, vérifié par `appass`).

alter table public.volunteers
  add column if not exists institution_id text
    references public.institutions(id) on delete set null;

create index if not exists volunteers_institution_id_idx
  on public.volunteers (institution_id);

alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads
  add constraint leads_source_check
    check (source in ('paste', 'portal', 'farm', 'manual', 'vcf'));
