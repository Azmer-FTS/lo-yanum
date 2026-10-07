-- ═══════════════════════════════════════════════════════════════════════════
-- AS (2026-10-07) — LES PISTES, LES CONTRATS DE TERRE, LE LIEN RENDEZ-VOUS ↔ PISTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. `leads` — la salle d'attente des contacts (AS6). Une piste N'EST PAS une
--    exploitation : table à part, que ni `entities` ni aucun compteur ne lit.
--    ⚠️ Règle d'AO0 : la table naît AVEC ses `grant`, dans CE fichier ; rien
--    pour `anon` (AP4.4 : la surface anonyme reste de trois fonctions).
-- 2. `entities.land_documents` — les contrats הסכם רעיה/חכירה en fichiers
--    (AS1.5). jsonb comme `provided_documents` ; mais le PDF lui-même va dans
--    le seau privé `agreements` (`land/<entity_id>/<id>.pdf`), jamais dans la
--    ligne : quatre contrats de 2 Mo hydratés à chaque ouverture, non.
-- 3. `general_meetings.lead_id` — un rendez-vous posé depuis une piste (AS6.6).
--    Une VISITE exige une ferme (`farm_visits.entity_id not null`) ; une
--    piste n'en est pas une, donc son rendez-vous est une rencontre.

create table if not exists public.leads (
  id                 text primary key,
  name               text not null default '',
  contact_name       text not null default '',
  phone              text not null default '',
  place              text not null default '',
  lat                double precision,
  lng                double precision,
  region_id          text,
  status             text not null default 'not_called'
    check (status in ('not_called','no_answer','message_sent','call_back',
                      'meeting_set','not_now','not_interested')),
  notes              text not null default '',
  source             text not null default 'manual'
    check (source in ('paste','portal','farm','manual')),
  raw                text not null default '',
  rank               integer not null default 0,
  converted_farm_id  text references public.entities(id) on delete set null,
  converted_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads (status);

alter table public.leads enable row level security;
alter table public.leads force row level security;

drop policy if exists leads_coordinator_all on public.leads;
create policy leads_coordinator_all on public.leads
  for all to authenticated
  using (private.is_coordinator()) with check (private.is_coordinator());

grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.leads to service_role;
revoke all on public.leads from anon;

alter table public.entities
  add column if not exists land_documents jsonb;

alter table public.general_meetings
  add column if not exists lead_id text references public.leads(id) on delete set null;
