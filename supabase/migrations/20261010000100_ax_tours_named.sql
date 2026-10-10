-- ═══════════════════════════════════════════════════════════════════════════
-- ★★ AX8 (2026-10-10) — UNE TOURNÉE ENREGISTRÉE SE RETROUVE TOUJOURS.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Constat du PO : « je crée un itinéraire, je l'enregistre, j'en crée un
-- second, je l'enregistre, puis je décoche les points et mes itinéraires
-- n'existent plus ». Mesuré : `tours.day_key` était UNIQUE — une tournée PAR
-- JOUR. La seconde du même jour REMPLAÇAIT la première (`saveTour` cherchait
-- la tournée du jour et l'écrasait), et l'écran n'en montrait aucune liste :
-- décocher effaçait le seul repère (« המסלול שמור ביומן »).
--
-- Désormais une tournée a un NOM, et plusieurs peuvent porter le même jour.
-- Additive : le code déployé avant AX écrit `id, day_key, depart_at` et
-- continue de fonctionner (`name` prend '').
--
-- ⛔ Rien pour `anon` (règle d'AP) ; la table existe déjà avec ses droits.

alter table public.tours drop constraint if exists tours_day_key_key;
alter table public.tours add column if not exists name text not null default '';
create index if not exists tours_day_key_idx on public.tours (day_key);
