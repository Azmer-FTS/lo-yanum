-- ===========================================================================
-- PO POINT 6 (2026-08-31) — HOW MANY HEAD, AND OF WHAT. ADDITIVE ONLY.
-- ===========================================================================
--
-- The programme is funded partly on the livestock it protects, and until now
-- the app could say how much GROUND was under guard and nothing at all about
-- the animals standing on it.
--
-- ★ A CHILD TABLE, NOT A COLUMN ON `entities`, AND NOT JSON. "500 head"
--   answers nothing: 500 sheep and 500 cattle are different sums of money,
--   different night risks and different pens. So it is a LIST, and a list in
--   this schema is a child table with a `position` — the same shape
--   `entity_commitments` has, for the same reason: the domain object has no id
--   of its own, the row needs one, and the order is what the form edits.
--
-- ★ THE ID IS MINTED FROM THE PARENT AND THE POSITION (`farm-01:l0`), exactly
--   as `entity_commitments` does. Stable across writes — the same line keeps
--   the same row — and reproducible from nothing stored, which is what lets
--   the offline outbox carry an edit without having invented an id offline.
--
-- ★ `kind` IS AN ENUM AND `label` IS FREE TEXT, and only `other` uses the
--   label. A closed list is what keeps the totals ADDABLE across entities —
--   the funding number is a sum — while the free label keeps a coordinator
--   from having to lie about an ostrich farm.
--
-- ★ AND NOTHING IS BACKFILLED. An entity with no rows here is an entity nobody
--   has been asked about, which is NOT the same as one with zero animals, and
--   `totalHeads()` returns null rather than 0 for it precisely so the
--   dashboard and the report can stay silent instead of stating a fact nobody
--   established. A `default 0` row per entity would have destroyed that
--   distinction on the way in.
--
-- ADDITIVE: no existing table, column, policy or enum is altered. An older
-- client that has never heard of livestock reads and writes exactly as before.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'livestock_kind') then
    create type livestock_kind as enum (
      'cattle', 'sheep', 'goats', 'camels', 'horses', 'poultry', 'other'
    );
  end if;
end $$;

create table if not exists entity_livestock (
  id          text primary key,
  entity_id   text not null references entities (id) on delete cascade,
  kind        livestock_kind not null,
  -- Free text, and only meaningful for `kind = 'other'`.
  label       text not null default '',
  heads       integer not null default 0 check (heads >= 0),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists entity_livestock_entity_idx
  on entity_livestock (entity_id);

-- ---------------------------------------------------------------------------
-- RLS — TRANSCRIBED FROM `access.ts` LIKE EVERY OTHER TABLE (P2.2).
--
-- ★ IT IS THE SAME RULE AS `entity_commitments`, and it has to be said out
--   loud rather than inherited: a head count is a fact about a farmer's
--   assets. The coordinator has it; a volunteer and a driver do not; the
--   FARMER sees his own, which is what `private.my_entity_id()` answers.
-- ---------------------------------------------------------------------------

alter table entity_livestock enable row level security;
alter table entity_livestock force row level security;

drop policy if exists entity_livestock_coordinator_all on entity_livestock;
create policy entity_livestock_coordinator_all on entity_livestock
  for all to authenticated
  using (private.is_coordinator())
  with check (private.is_coordinator());

drop policy if exists entity_livestock_farmer_read on entity_livestock;
create policy entity_livestock_farmer_read on entity_livestock
  for select to authenticated
  using (entity_id = private.my_entity_id());
