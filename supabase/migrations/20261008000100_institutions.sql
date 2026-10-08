-- ═══════════════════════════════════════════════════════════════════════════
-- AU3 (2026-10-08) — LES INSTITUTIONS : מכינות, ישיבות הסדר, מדרשות
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Elles fournissent les volontaires ; la carte de couverture (AU4) trace qui
-- atteint quelles fermes. Une institution N'EST PAS une exploitation : table à
-- part, que ni `entities` ni aucun compteur (dounams, objectif) ne lit.
--
-- ⚠️ Règle d'AO0 : la table naît AVEC ses `grant`, dans CE fichier ; rien pour
--    `anon` (AP4.4 : la surface anonyme reste de trois fonctions).
-- ⚠️ AU3.4 : `position_uncertain` marque un point à vérifier (quatre dans le
--    classeur du PO). Il n'est jamais remis à faux par un réimport.

create table if not exists public.institutions (
  id                  text primary key,
  name                text not null default '',
  locality            text not null default '',
  kind                text not null default 'other'
    check (kind in ('mechina','hesder','midrasha','other')),
  audience            text not null default 'unknown'
    check (audience in ('boys','girls','mixed','unknown')),
  network             text not null default '',
  lat                 double precision,
  lng                 double precision,
  position_uncertain  boolean not null default false,
  engagement          text not null default 'not_contacted'
    check (engagement in ('not_contacted','contacted','interested','signed','not_relevant')),
  contact_name        text not null default '',
  contact_phone       text not null default '',
  notes               text not null default '',
  extra               text not null default '',
  source              text not null default 'manual'
    check (source in ('import','manual')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists institutions_engagement_idx on public.institutions (engagement);

alter table public.institutions enable row level security;
alter table public.institutions force row level security;

drop policy if exists institutions_coordinator_all on public.institutions;
create policy institutions_coordinator_all on public.institutions
  for all to authenticated
  using (private.is_coordinator()) with check (private.is_coordinator());

grant select, insert, update, delete on public.institutions to authenticated;
grant select, insert, update, delete on public.institutions to service_role;
revoke all on public.institutions from anon;
