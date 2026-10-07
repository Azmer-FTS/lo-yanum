-- ═══════════════════════════════════════════════════════════════════════════
-- AS1.5 (2026-10-07) — UN CONTRAT EN FILE APPELLE `portal-document`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Même mécanique qu'AQ3 (`aid_requests_mail_dispatch`) : APRÈS l'écriture,
-- un appel en file par `pg_net`, rattrapé par `exception when others` — un
-- contrat qui ne se recopie pas ne bloque jamais l'écriture de la fiche ; il
-- reste `pending` et l'app le dit.
--
-- ⚠️ Le déclencheur ne part QUE si une entrée est `pending` : l'écriture de la
--    fonction elle-même (qui passe tout en `stored`/`failed`) ne le relance pas.
-- ⚠️ Adresse du projet écrite en dur, comme en AQ3 : rejouée ailleurs, la
--    migration appellerait lo-yanum-prod, qui ne trouverait pas la fiche et
--    ne ferait RIEN.

create extension if not exists pg_net with schema extensions;

create or replace function public.entities_land_documents_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform net.http_post(
      url     := 'https://lvrptqmkjikkkhcxocbe.supabase.co/functions/v1/portal-document',
      body    := jsonb_build_object('entity_id', new.id),
      headers := '{"content-type": "application/json"}'::jsonb,
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'portal-document: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.entities_land_documents_dispatch() from public;

drop trigger if exists entities_land_documents_dispatch on public.entities;
create trigger entities_land_documents_dispatch
  after insert or update of land_documents on public.entities
  for each row
  when (new.land_documents is not null
        and jsonb_path_exists(new.land_documents, '$[*] ? (@.status == "pending")'))
  execute function public.entities_land_documents_dispatch();
