-- ═══════════════════════════════════════════════════════════════════════════
-- ★★ BC (2026-10-12) — LA LOCALITÉ DE REPÈRE, LA NATURE DE L'EXPLOITATION,
--    ET LE TÉLÉPHONE QU'ON NE COMPOSE PAS PAR RÉFLEXE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ADDITIVE : aucune colonne retirée, aucune donnée réécrite ; une version
-- d'avant BC n'écrit aucune de ces colonnes et continue de fonctionner (un
-- upsert ne touche que les colonnes qu'il nomme). Rien pour `anon` : les
-- privilèges par défaut du schéma sont révoqués depuis AP, et ces tables ont
-- déjà leurs droits et leur RLS.
--
-- · entities.nearest_locality / nearest_locality_manual : « cette ferme est à
--   côté de … », calculée depuis le point par la liste des localités de
--   l'application (`LocalityField`), rangée ici une fois ; une valeur saisie
--   par le PO (`manual`) n'est jamais écrasée par un recalcul.
-- · entities.branches / leads.branches : la nature de l'exploitation, plusieurs
--   valeurs par fiche, chacune avec son drapeau « à confirmer » :
--     [{ "kind": "cattle", "toConfirm": true }, …]
--   Une piste qui devient ferme emporte les siennes.
-- · entity_contacts.restricts_calls : la NOTE de ce contact restreint l'usage
--   de son téléphone ; tout bouton d'appel le montre et demande confirmation
--   (même mécanisme que « נדרש תיאום מוקדם », BB). Pour un contact
--   d'institution, le drapeau vit dans le jsonb `institutions.contacts`
--   (`restrictsCalls`), sans changement de schéma.

alter table public.entities
  add column if not exists nearest_locality text,
  add column if not exists nearest_locality_manual boolean not null default false,
  add column if not exists branches jsonb not null default '[]'::jsonb;

alter table public.leads
  add column if not exists branches jsonb not null default '[]'::jsonb;

alter table public.entity_contacts
  add column if not exists restricts_calls boolean not null default false;
