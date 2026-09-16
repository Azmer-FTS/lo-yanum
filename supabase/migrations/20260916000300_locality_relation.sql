-- ===========================================================================
-- AM1.4 (2026-09-16) — LA FERME EST « DANS » LE יישוב, OU « RATTACHÉE » À LUI.
-- ===========================================================================
--
--   « Le PO doit pouvoir indiquer un RATTACHEMENT à une localité sans que la
--     ferme y soit située — c'est son cas fréquent. Ne l'oblige pas à mentir
--     sur l'un pour renseigner l'autre. »
--
-- ★ UNE COLONNE, PAS UN SECOND NOM. `locality` reste le seul nom de יישוב de la
--   fiche (l'export, l'import, la recherche le lisent) ; celle-ci dit lequel
--   des deux faits il porte. Deux noms auraient été deux vérités à tenir.
--
-- Additif : nul = non précisé, ce que sont toutes les lignes existantes.
alter table entities add column if not exists locality_relation text;
alter table entities drop constraint if exists entities_locality_relation_check;
alter table entities add constraint entities_locality_relation_check
  check (locality_relation is null or locality_relation in ('in', 'attached'));
