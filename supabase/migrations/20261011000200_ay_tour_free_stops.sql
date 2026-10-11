-- ═══════════════════════════════════════════════════════════════════════════
-- ★★ AY12.2 (2026-10-11) — UN SEUL PLANIFICATEUR : FICHES ET POINTS LIBRES.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deux planificateurs coexistaient : la tournée (des FICHES de fermes,
-- `tour_stops`) et l'itinéraire libre (des points collés, gardés dans les
-- réglages). Une tournée porte désormais aussi ses points libres — un lien
-- Waze/Google, des coordonnées, un nom, un téléphone — dans l'ordre que le
-- planificateur calcule avec les fermes.
--
-- Additive : le code d'avant AY écrit `id, day_key, depart_at, name` et
-- continue de fonctionner (`free_stops` prend '[]').
-- ⛔ Rien pour `anon` (règle d'AP) ; la table existe déjà avec ses droits.

alter table public.tours add column if not exists free_stops jsonb not null default '[]'::jsonb;
