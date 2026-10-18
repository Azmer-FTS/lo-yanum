-- ===========================================================================
-- ★★★ BK (2026-10-18) — LE TRACÉ ÉDITABLE D'UNE FORME, À CÔTÉ DE SA FORME RÉELLE.
-- ===========================================================================
--
--   « Je n'arrive tout simplement pas à modifier un tracé. »         — le PO
--
-- Une carte stocke des coordonnées, pas des courbes. L'éditeur de BK manipule
-- des NŒUDS (coins, ou arrondis avec leurs poignées) ; la forme réelle — celle
-- que la carte dessine et que toutes les surfaces mesurent — reste l'anneau de
-- `zone_vertices`, calculé à partir de ces nœuds. Si seul l'anneau densifié
-- était gardé, le PO perdrait ses poignées en rouvrant la forme.
--
-- ★ ADDITIVE, NULLABLE, SANS VALEUR PAR DÉFAUT. Les trois formes existantes
--   (au 2026-10-18 : 2 fermes, 71 sommets) ne sont PAS touchées : `path` reste
--   `null`, et l'éditeur les reprend comme une suite de coins — exactement
--   leurs sommets. Aucune ligne n'est réécrite par cette migration.
--
-- ★ LE MODÈLE NE FAIT JAMAIS FOI SUR L'ANNEAU. Un build d'avant BK qui
--   retouche une forme réécrit `zone_vertices` sans connaître `path` ; l'éditeur
--   ne reprend le modèle que s'il redonne EXACTEMENT l'anneau enregistré
--   (`core/path.ts`, `modelForRing`), sinon l'anneau gagne.
--
-- ⚠️ DROITS : `authenticated` a `select, insert, update, delete` sur la TABLE
--    (20260830000100_schema.sql) — une colonne nouvelle en hérite ; rien pour
--    `anon` (20260925000300). Les politiques RLS de `zones` ne changent pas.
-- ===========================================================================

alter table public.zones add column if not exists path jsonb;

comment on column public.zones.path is
  'BK — tracé éditable (core/path.ts : {v:1, closed, nodes:[{lat,lng,kind,hIn?,hOut?}]}). La forme réelle est zone_vertices ; null = reprise en coins.';
