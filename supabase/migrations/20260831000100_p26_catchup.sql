-- ===========================================================================
-- P2.6 — THE SCHEMA CATCHES UP WITH types.ts, AND SAYS WHAT IT MISSED.
-- ===========================================================================
--
-- P2.2 called itself "a direct transcription of src/core/types.ts", and it was
-- one on 2026-08-30. Two things happened after it and before P2.6:
--
--   · P0bis.5a put an OPTIONAL `email` on Volunteer, Driver and FarmContact —
--     the one channel this programme can ever send automatically (P3.3bis).
--   · P0bis.5b replaced G9bis's `CancelNotice[]` with `OutreachNotice[]`,
--     which carries an `event` ('created' | 'updated' | 'cancelled') because
--     the sending centre tracks three events, not one.
--
-- Neither reached the database, and neither would have been noticed by any
-- gate that existed: the app was still running on the mock store, so nothing
-- ever tried to write a volunteer's address to Postgres. P2.6's round-trip
-- gate is what found them, which is the argument for having written it.
--
-- The third change here is P2.6's own. ORDER IS DATA IN THIS MODEL, and five
-- child tables were storing sets where the app holds ordered lists:
--
--   · `entity_commitments` is the load-bearing one — `setCommitmentFulfilled`
--     addresses a commitment BY ITS INDEX, so a farm whose commitments come
--     back in a different order is a farm where ticking "shelter" ticks
--     "water" instead. That is not a display bug, it is a wrong record.
--   · `mission_assignments` holds the shortlist order the coordinator chose;
--     `entity_contacts` and `agreements` hold the order the form was filled
--     in; `incident_entries` is an append-only log whose ids sort
--     lexicographically and therefore NOT chronologically (`ent-<t>-11` sorts
--     before `ent-<t>-2`).
--
-- Every one of these is additive: a new nullable-or-defaulted column, on
-- tables that have never held a row.

-- --------------------------------------------------------------------------
-- P0bis.5a — the optional address, on all three kinds of person
-- --------------------------------------------------------------------------
--
-- `not null default ''` rather than nullable, deliberately: '' means "no
-- address", which is a fact the roster shows, and null would invite a second
-- reading ("unknown") that the app has no way to produce or display.

alter table volunteers      add column if not exists email text not null default '';
alter table drivers         add column if not exists email text not null default '';
alter table entity_contacts add column if not exists email text not null default '';

-- --------------------------------------------------------------------------
-- P0bis.5b — the sent tick covers three events, not just the cancellation
-- --------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'outreach_event') then
    create type outreach_event as enum ('created', 'updated', 'cancelled');
  end if;
end;
$$;

alter table cancel_notices
  add column if not exists event outreach_event not null default 'cancelled';

-- The primary key has to widen with it: one recipient can be ticked for the
-- creation AND for the cancellation of the same guard, and those are two
-- separate facts the sending centre shows on two separate lists. Rewriting a
-- primary key is not something this project does lightly — the additive rule
-- in the schema migration is there for a reason — and it is safe here for one
-- checkable reason only: the table has never held a row. The `count` guard
-- below turns that from an assumption into a precondition.
do $$
begin
  if (select count(*) from cancel_notices) > 0 then
    raise exception
      'cancel_notices is not empty; widening its primary key would need a data migration';
  end if;
  alter table cancel_notices drop constraint if exists cancel_notices_pkey;
  alter table cancel_notices
    add primary key (mission_id, event, recipient_kind, recipient_id);
end;
$$;

comment on table cancel_notices is
  'P0bis.5b — the "this person has been told" ticks, for all three outreach '
  'events. Named for the cancellation it was built for; it now covers '
  'created/updated/cancelled. Only ticks are stored: the recipient LIST is '
  'derived from the mission every time by outreachRecipients(), so a driver '
  'added after the fact is on the list instead of silently missing from it.';

-- --------------------------------------------------------------------------
-- P2.6 — order is data
-- --------------------------------------------------------------------------

alter table entity_contacts     add column if not exists position integer not null default 0;
alter table entity_commitments  add column if not exists position integer not null default 0;
alter table agreements          add column if not exists position integer not null default 0;
alter table mission_assignments add column if not exists position integer not null default 0;
alter table incident_entries    add column if not exists position integer not null default 0;

comment on column entity_commitments.position is
  'P2.6 — LOAD-BEARING. setCommitmentFulfilled(farmId, index, fulfilled) '
  'addresses a commitment by its index in the array; read these back in this '
  'order or ticking one commitment ticks a different one.';
