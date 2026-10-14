-- ═══════════════════════════════════════════════════════════════════════════
-- BG (2026-10-14) — LE PARRAINAGE FERME ↔ INSTITUTION, ET LE DOCUMENT DE
-- L'INSTITUTION À UNE ADRESSE STABLE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ADDITIVE : une table neuve, un bucket neuf. Rien n'est supprimé ni réécrit.
-- Appliquée AVANT le déploiement (le build qui la lit la trouve déjà là).
--
-- ⚠️ Règle d'AO0 : la table naît AVEC ses `grant` et sa RLS, dans cette même
--    migration ; RIEN pour `anon` (la surface anonyme des TABLES reste nulle —
--    `bun run appass`).
--
-- ★ PLUSIEURS INSTITUTIONS PAR FERME, DÉLIBÉRÉMENT. On bascule une ferme d'une
--   institution à l'autre en milieu de saison, et une grosse ferme peut être
--   couverte par deux institutions sur des nuits différentes. ⛔ AUCUNE
--   contrainte d'unicité : ni sur `farm_id`, ni sur la paire (deux appareils
--   qui lient la même paire hors ligne ne doivent pas bloquer la file
--   d'écriture). La règle de travail — une ferme, une institution — est tenue
--   par l'application (`core/farmLinks.ts`, la boîte « להחליף · להוסיף · ביטול »).

create table if not exists public.farm_institution_links (
  id              text primary key,
  farm_id         text not null references public.entities (id) on delete cascade,
  institution_id  text not null references public.institutions (id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- Qui a créé le lien : posé par la base (déclencheur ci-dessous), jamais
  -- par le client, qui ne le connaît pas.
  created_by      uuid default auth.uid()
);

create index if not exists farm_institution_links_farm_idx on public.farm_institution_links (farm_id);
create index if not exists farm_institution_links_institution_idx on public.farm_institution_links (institution_id);

-- `created_by` : à l'insertion, l'utilisateur authentifié s'il n'est pas donné ;
-- ensuite, jamais réécrit (le client renvoie la ligne entière à chaque écriture).
create or replace function private.farm_institution_links_stamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists farm_institution_links_stamp on public.farm_institution_links;
create trigger farm_institution_links_stamp
  before insert or update on public.farm_institution_links
  for each row execute function private.farm_institution_links_stamp();

alter table public.farm_institution_links enable row level security;
alter table public.farm_institution_links force row level security;

drop policy if exists farm_institution_links_coordinator_all on public.farm_institution_links;
create policy farm_institution_links_coordinator_all on public.farm_institution_links
  for all to authenticated
  using (private.is_coordinator()) with check (private.is_coordinator());

grant select, insert, update, delete on public.farm_institution_links to authenticated;
grant select, insert, update, delete on public.farm_institution_links to service_role;
revoke all on public.farm_institution_links from anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- LE DOCUMENT DE L'INSTITUTION — `institution-docs`, LE DEUXIÈME BUCKET PUBLIC.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ★ POURQUOI PUBLIC. Le PO envoie un LIEN par WhatsApp (qui ne joint pas un PDF
--   depuis un lien) et ce lien doit afficher la DERNIÈRE version des mois plus
--   tard, sans renvoi. Une URL signée expire ; seule une URL publique stable
--   tient cette promesse.
--
-- ★ CE QUE CELA OUVRE, DIT : quiconque a le lien lit le document. Il porte ce
--   que le PO envoie lui-même à l'institution : ses propres données, ses
--   contacts, les fermes proposées (nom, localité, distance). L'adresse est
--   `<id de l'institution>/document.pdf` — l'id n'est pas listé publiquement :
--   un public bucket se lit par chemin, et il n'y a AUCUNE politique SELECT
--   pour `anon` sur `storage.objects` (donc pas de listing anonyme).
--
-- ★ LES VERSIONS : `<id>/versions/<AAAAMMJJ-HHMMSS>.pdf`, écrites à chaque
--   génération à côté de la dernière, listées dans la fiche (coordinateur).
--
-- ★ ÉCRITURE ET LECTURE DE LA LISTE : coordinateur seulement.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('institution-docs', 'institution-docs', true, 20971520, array['application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists institution_docs_coordinator_all on storage.objects;
create policy institution_docs_coordinator_all on storage.objects
  for all to authenticated
  using (bucket_id = 'institution-docs' and private.is_coordinator())
  with check (bucket_id = 'institution-docs' and private.is_coordinator());
