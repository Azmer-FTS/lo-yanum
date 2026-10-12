-- ★★ BD 2 (2026-10-12) — LE SECRÉTARIAT DEVIENT UNE ENTRÉE DE LA LISTE DES
-- NUMÉROS, ET LE CHAMP DÉDIÉ DISPARAÎT.
--
-- « Un besoin que seules quelques fiches ont ne mérite pas un champ à lui. »
-- BB avait posé `office_phone` / `office_address` à côté du mécanisme qui le
-- disait déjà (les contacts, chacun ses numéros étiquetés). Appliquée APRÈS le
-- déploiement du code de BD (qui ne lit plus ces colonnes que pour les replier,
-- et ne les écrit plus), dans un seul bloc :
--   1. `office_address` → `address` quand l'adresse du lieu est vide ;
--   2. `office_phone` → une entrée de `contacts` SANS NOM, rôle « contact »,
--      son numéro étiqueté `secretariat` — sauf si une entrée porte déjà ce
--      numéro (mêmes chiffres) : c'est exactement `foldLegacyOffice` (core) ;
--   3. les deux colonnes sont supprimées.
-- Le bloc vérifie lui-même qu'aucun numéro n'est perdu avant de supprimer.
do $$
declare
  lost int;
begin
  update public.institutions
     set address = office_address
   where coalesce(address, '') = '' and coalesce(office_address, '') <> '';

  update public.institutions i
     set contacts = coalesce(i.contacts, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'id', 'ic-' || i.id || '-office',
           'role', 'contact',
           'name', '',
           'phone', btrim(i.office_phone),
           'phones', jsonb_build_array(jsonb_build_object('number', btrim(i.office_phone), 'label', 'secretariat')),
           'note', ''))
   where coalesce(btrim(i.office_phone), '') <> ''
     and not exists (
           select 1
             from jsonb_array_elements(coalesce(i.contacts, '[]'::jsonb)) c
             left join lateral jsonb_array_elements(coalesce(c->'phones', '[]'::jsonb)) p on true
            where regexp_replace(coalesce(p->>'number', c->>'phone', ''), '\D', '', 'g') = regexp_replace(i.office_phone, '\D', '', 'g'));

  select count(*) into lost
    from public.institutions i
   where coalesce(btrim(i.office_phone), '') <> ''
     and not exists (
           select 1
             from jsonb_array_elements(coalesce(i.contacts, '[]'::jsonb)) c
             left join lateral jsonb_array_elements(coalesce(c->'phones', '[]'::jsonb)) p on true
            where regexp_replace(coalesce(p->>'number', c->>'phone', ''), '\D', '', 'g') = regexp_replace(i.office_phone, '\D', '', 'g'));
  if lost > 0 then
    raise exception 'BD 2 : % numéro(s) de secrétariat non repris — rien n''est supprimé', lost;
  end if;
  select count(*) into lost
    from public.institutions
   where coalesce(office_address, '') <> '' and address <> office_address and coalesce(address, '') = '';
  if lost > 0 then
    raise exception 'BD 2 : % adresse(s) non reprise(s) — rien n''est supprimé', lost;
  end if;

  alter table public.institutions drop column office_phone;
  alter table public.institutions drop column office_address;
end $$;
