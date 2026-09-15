-- ===========================================================================
-- AK7 (2026-09-16) — L'ARCHIVAGE, ET CE QU'IL N'EST PAS.
-- ===========================================================================
--
--   « Le PO entrera des exploitations qui se désisteront ensuite. Archivage en
--     un geste, avec motif court facultatif. Une fiche archivée disparaît des
--     listes, de la carte, des compteurs, de l'objectif et du compte rendu —
--     mais rien n'est perdu. »
--
-- ★ DEUX COLONNES SUR `entities`, ET RIEN D'AUTRE. Pas de table « archives »,
--   pas de copie de la ligne ailleurs : archiver ne DÉPLACE rien, sinon
--   désarchiver serait une restauration — c'est-à-dire l'endroit exact où l'on
--   perd les zones, les postes et les gardes rattachés par clé étrangère.
--
-- ⚠️ CE N'EST PAS UNE SUPPRESSION, ET LE SCHÉMA LE DIT AUSSI : aucune règle
--    `on delete`, aucun déclencheur, aucune purge différée. La ligne reste
--    exactement ce qu'elle était, avec ses enfants.
--
-- ⚠️ ET CE N'EST PAS « סירבה », QUI EST UN STATUT. Un refus reste dans le rôle
--    et dans les compteurs de statut ; une archive en sort. Les deux peuvent
--    coexister sur une même fiche, dans cet ordre.
--
-- Additif : `archived_at` nul = fiche active, ce que sont toutes les lignes
-- existantes.
alter table entities add column if not exists archived_at timestamptz;
alter table entities add column if not exists archive_reason text;

-- Les listes lisent « les non archivées » à chaque écran.
create index if not exists entities_archived_at_idx on entities (archived_at);
