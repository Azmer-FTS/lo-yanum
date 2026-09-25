-- ===========================================================================
-- ★★ AP4.4 (2026-09-25) — `anon` AVAIT TOUS LES DROITS SUR LES TRENTE TABLES.
-- ===========================================================================
--
-- ⚠️⚠️ TROUVÉ EN OUVRANT LA PREMIÈRE SURFACE ANONYME DU PROJET, ET C'EST
--      EXACTEMENT LE PIÈGE D'AO5.3 — SAUF QU'IL PORTAIT SUR UNE TABLE ET
--      QU'IL PORTE EN FAIT SUR TOUTES.
--
-- Mesuré sur `lo-yanum-prod` le 2026-09-25 :
--
--   select table_name from information_schema.role_table_grants
--    where grantee = 'anon' and table_schema = 'public';
--   → TRENTE tables, chacune avec
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE.
--
-- Personne ne les a accordés. Ils viennent des PRIVILÈGES PAR DÉFAUT du
-- schéma `public` de Supabase : toute table créée là naît avec ce paquet pour
-- `anon` et `authenticated`. AO5.3 l'avait vu sur `activity_reports` et
-- révoqué — sur cette table-là seulement, parce que c'était celle que la passe
-- venait de créer. Les vingt-neuf autres n'ont jamais été regardées.
--
-- ★★ CE N'ÉTAIT PAS UNE PORTE OUVERTE, ET C'EST POURQUOI PERSONNE NE L'A VU.
--    RLS est active ET forcée sur les trente, et aucune des 32 politiques ne
--    vise `anon` : une lecture anonyme rendait `[]` et une écriture anonyme
--    était refusée. `bun run auth` le vérifie depuis P2.2 et il a toujours été
--    vert. Le droit était là, la politique tenait la porte.
--
-- ★★ CE QUI CHANGE AUJOURD'HUI, C'EST QU'UNE CLÉ `anon` VA ÊTRE PUBLIÉE.
--    Jusqu'ici Lo Yanum n'avait aucune surface anonyme : la clé publiable
--    n'était dans les mains de personne d'autre que le PO. AP met une page à
--    une adresse que l'association enverra à ses agriculteurs — la clé sera
--    dans le code source d'une page publique, ce qui est normal et prévu (elle
--    n'autorise rien par elle-même). Mais à partir de là, « une politique RLS
--    mal écrite un jour » ne vaut plus « un accident interne » : elle vaut
--    « n'importe qui, depuis n'importe où ». La règle d'AO5.3 devient donc la
--    règle générale :
--
--      ⛔ LE REFUS EST PAR DROIT, ET LA POLITIQUE N'EST QUE LA SECONDE
--         SERRURE. Pas l'inverse.
--
-- ⚠️ CE QUE ÇA NE CASSE PAS. L'application tourne en `authenticated` (le PO
--    ouvre une session) et ses `grant` ne bougent pas. Les laissez-passer du
--    volontaire et de l'agriculteur passent par un jeton PUIS une session —
--    donc `authenticated` aussi. La page publique d'AP n'a jamais eu de droit
--    de table : elle appelle trois fonctions `security definer`. Aucun chemin
--    d'écriture connu ne passe par `anon`.
--
-- ⚠️ ET LA DERNIÈRE LIGNE EST CELLE QUI COMPTE VRAIMENT. Révoquer sur les
--    trente tables d'aujourd'hui ne dit rien de la trente-et-unième :
--    `alter default privileges` fait que la PROCHAINE table créée par
--    `postgres` naîtra sans rien pour `anon`. Sans elle, ce fichier serait à
--    rejouer après chaque migration — c'est-à-dire oublié.
--
-- ⚠️ `usage` SUR LE SCHÉMA EST CONSERVÉ. Le sans-lui, PostgREST ne peut plus
--    résoudre `public.submit_aid_request` et la page publique tombe. C'est le
--    droit d'ATTEINDRE le schéma, pas celui d'en lire une table.
-- ===========================================================================

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- Les tables à venir. Sans ceci, la prochaine migration rouvre tout.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- Et ce dont la page publique a besoin, qui n'est pas une table.
grant usage on schema public to anon;
grant execute on function public.submit_aid_request(jsonb) to anon;
grant execute on function public.public_busy_intervals(timestamptz, timestamptz) to anon;
grant execute on function public.public_agreement_template() to anon;
