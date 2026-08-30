-- ===========================================================================
-- P2.2 (follow-up) — THE POLICY HELPERS LEAVE THE EXPOSED API.
-- THIS IS THE FILE THAT MATCHES WHAT IS DEPLOYED.
-- ===========================================================================
--
-- Supabase's own linter flagged all five helpers as `SECURITY DEFINER`
-- functions reachable at `/rest/v1/rpc/...` by `anon` AND by `authenticated`.
-- Nothing leaked — each only ever returns the CALLER's own identity, and an
-- anonymous caller gets null — but they are policy plumbing, they were never
-- meant to be endpoints, and "nothing leaks today" is a worse guarantee than
-- "it is not reachable".
--
-- PostgREST exposes `public` (and `graphql_public`); a `private` schema is
-- invisible to it. Policies still evaluate the functions because the calling
-- role is granted USAGE on the schema and EXECUTE on the functions
-- explicitly. That closes BOTH lint classes rather than silencing one — the
-- alternative, revoking EXECUTE from `anon` only, would have left the
-- authenticated warning standing and the endpoints half-open.
--
-- Every policy is dropped and rebuilt against the private helpers. The
-- database was an hour old and empty when this ran, which is the cheapest
-- moment it will ever be, and the reason it was worth doing properly rather
-- than living with a warning.
--
-- VERIFIED AFTER APPLYING — this is criterion B1's actual evidence, and it
-- was run WITH A REAL ROW IN THE TABLE, because an empty table returning []
-- proves nothing at all:
--   · a row inserted server-side, then read anonymously        → []
--   · an anonymous INSERT   → 401 "new row violates row-level security policy"
--   · an anonymous DELETE   → 204 AND THE ROW STILL THERE, because RLS
--                             filtered it out of the delete's own scope
--                             rather than removing it
--   · /rest/v1/rpc/app_role, /is_coordinator, /my_mission_ids → 404
--   · get_advisors(security)                                  → no lints
-- ===========================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.app_role() returns text
language sql stable security definer set search_path = public
as $$
  select role from app_users where user_id = auth.uid();
$$;

create or replace function private.app_ref() returns text
language sql stable security definer set search_path = public
as $$
  select entity_ref from app_users where user_id = auth.uid();
$$;

create or replace function private.is_coordinator() returns boolean
language sql stable security definer set search_path = public, private
as $$
  select coalesce(private.app_role() = 'coordinator', false);
$$;

create or replace function private.my_entity_id() returns text
language sql stable security definer set search_path = public, private
as $$
  select c.entity_id from entity_contacts c
  where private.app_role() = 'farmer' and c.id = private.app_ref();
$$;

create or replace function private.my_mission_ids() returns setof text
language sql stable security definer set search_path = public, private
as $$
  select a.mission_id from mission_assignments a
    where private.app_role() = 'volunteer' and a.volunteer_id = private.app_ref()
  union
  select d.mission_id from mission_drivers d
    where private.app_role() = 'driver' and d.driver_id = private.app_ref()
  union
  select m.id from missions m
    where private.app_role() = 'farmer' and m.entity_id = private.my_entity_id();
$$;

grant execute on all functions in schema private to authenticated;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Clear the first pass, then rebuild everything below against `private.`.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname
           from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

drop function if exists public.app_role();
drop function if exists public.app_ref();
drop function if exists public.is_coordinator();
drop function if exists public.my_entity_id();
drop function if exists public.my_mission_ids();

-- --------------------------------------------------------------------------
-- Enable RLS everywhere, first, so no table is ever briefly open
-- --------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'app_users', 'entities', 'entity_contacts', 'entity_commitments',
    'agreements', 'zones', 'zone_vertices', 'guard_posts',
    'threat_zones', 'threat_zone_vertices', 'threat_vectors',
    'volunteers', 'drivers', 'missions', 'mission_guard_posts',
    'mission_drivers', 'mission_driver_passengers', 'mission_assignments',
    'presence_marks', 'cancel_notices', 'farm_visits', 'general_meetings',
    'tours', 'tour_stops', 'incidents', 'incident_entries'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- app_users — a login may read its OWN row and nothing else
-- --------------------------------------------------------------------------
--
-- Not even the coordinator writes here from the client: roles are assigned in
-- the Supabase dashboard or by a migration. A client that could grant itself
-- 'coordinator' would make every other policy decorative.

create policy app_users_self_read on app_users
  for select to authenticated using (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- The coordinator: full access to everything
-- --------------------------------------------------------------------------
--
-- One loop rather than 26 hand-written pairs. The rule genuinely is the same
-- for every table — "the coordinator sees everything and may change
-- everything" is the first line of access.ts — and 26 copies of it would be 26
-- chances to mistype one.

do $$
declare t text;
begin
  foreach t in array array[
    'entities', 'entity_contacts', 'entity_commitments', 'agreements',
    'zones', 'zone_vertices', 'guard_posts',
    'threat_zones', 'threat_zone_vertices', 'threat_vectors',
    'volunteers', 'drivers', 'missions', 'mission_guard_posts',
    'mission_drivers', 'mission_driver_passengers', 'mission_assignments',
    'presence_marks', 'cancel_notices', 'farm_visits', 'general_meetings',
    'tours', 'tour_stops', 'incidents', 'incident_entries'
  ]
  loop
    execute format(
      'create policy %I on %I for all to authenticated
         using (private.is_coordinator()) with check (private.is_coordinator())',
      t || '_coordinator_all', t
    );
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- The farmer: his own entity, and nothing about anybody else's people
-- --------------------------------------------------------------------------

create policy entities_farmer_read on entities
  for select to authenticated
  using (id = private.my_entity_id());

create policy entity_contacts_farmer_read on entity_contacts
  for select to authenticated
  using (entity_id = private.my_entity_id());

create policy entity_commitments_farmer_read on entity_commitments
  for select to authenticated
  using (entity_id = private.my_entity_id());

create policy agreements_farmer_read on agreements
  for select to authenticated
  using (entity_id = private.my_entity_id());

create policy zones_farmer_read on zones
  for select to authenticated
  using (entity_id = private.my_entity_id());

create policy zone_vertices_farmer_read on zone_vertices
  for select to authenticated
  using (exists (
    select 1 from zones z where z.id = zone_id and z.entity_id = private.my_entity_id()
  ));

create policy guard_posts_farmer_read on guard_posts
  for select to authenticated
  using (entity_id = private.my_entity_id());

create policy farm_visits_farmer_read on farm_visits
  for select to authenticated
  using (entity_id = private.my_entity_id());

-- A farmer reports incidents about his own farm — the one thing he WRITES.
create policy incidents_farmer_read on incidents
  for select to authenticated
  using (entity_id = private.my_entity_id());

create policy incidents_farmer_insert on incidents
  for insert to authenticated
  with check (
    entity_id = private.my_entity_id() and source = 'farmer' and reporter_id = private.app_ref()
  );

create policy incident_entries_farmer_read on incident_entries
  for select to authenticated
  using (exists (
    select 1 from incidents i
    where i.id = incident_id and i.entity_id = private.my_entity_id()
  ));

create policy incident_entries_farmer_insert on incident_entries
  for insert to authenticated
  with check (exists (
    select 1 from incidents i
    where i.id = incident_id and i.entity_id = private.my_entity_id()
  ));

-- --------------------------------------------------------------------------
-- G18 — THE THREAT LAYER HAS NO NON-COORDINATOR POLICY. AT ALL.
-- --------------------------------------------------------------------------
--
-- This is the one place in the file where the ABSENCE of a policy is the
-- point, so it is written down rather than left to be noticed.
--
-- `threat_zones`, `threat_zone_vertices` and `threat_vectors` carry only the
-- coordinator policy created in the loop above. A farmer is therefore refused
-- the layer FOR HIS OWN FARM — which is deliberate, matches
-- `getVisibleThreatZones` exactly, and is tested as A59 in `bun run accept`.
-- A farm boundary is a fact about the ground; "we assess this wadi as a
-- high-intensity approach" is an assessment about people, and it is the
-- programme's to hold. A farmer who wants to know what is around him is told
-- by a human, on the phone.
--
-- If a future migration adds a read policy here, it is changing a decision,
-- not filling a gap.

-- --------------------------------------------------------------------------
-- The volunteer and the driver: their own guards, and only those
-- --------------------------------------------------------------------------
--
-- Both roles reach the roster ONLY through a mission they are on. A volunteer
-- may not list volunteers, and a driver may not list drivers — `getVolunteers`
-- returns [] for both in access.ts, and these policies are why.

create policy missions_field_read on missions
  for select to authenticated
  using (id in (select private.my_mission_ids()));

create policy mission_assignments_field_read on mission_assignments
  for select to authenticated
  using (mission_id in (select private.my_mission_ids()));

create policy mission_guard_posts_field_read on mission_guard_posts
  for select to authenticated
  using (mission_id in (select private.my_mission_ids()));

create policy mission_drivers_field_read on mission_drivers
  for select to authenticated
  using (mission_id in (select private.my_mission_ids()));

create policy mission_driver_passengers_field_read on mission_driver_passengers
  for select to authenticated
  using (mission_id in (select private.my_mission_ids()));

create policy cancel_notices_field_read on cancel_notices
  for select to authenticated
  using (mission_id in (select private.my_mission_ids()));

-- The entity a guard is AT, and the post the group stands on: a volunteer has
-- to be able to read where he is going, and the driver has to be able to
-- navigate there.
create policy entities_field_read on entities
  for select to authenticated
  using (id in (select entity_id from missions where id in (select private.my_mission_ids())));

create policy guard_posts_field_read on guard_posts
  for select to authenticated
  using (
    id in (select guard_post_id from missions where id in (select private.my_mission_ids()))
    or id in (
      select guard_post_id from mission_guard_posts
      where mission_id in (select private.my_mission_ids())
    )
  );

-- The people on the SAME guard. Nominative confirmation is the whole point of
-- the programme: the group-phone holder marks his group by name, so he has to
-- be able to read those names — and only those.
create policy volunteers_same_mission_read on volunteers
  for select to authenticated
  using (
    id = private.app_ref()
    or id in (
      select volunteer_id from mission_assignments
      where mission_id in (select private.my_mission_ids())
    )
  );

create policy drivers_same_mission_read on drivers
  for select to authenticated
  using (
    id = private.app_ref()
    or id in (
      select driver_id from mission_drivers
      where mission_id in (select private.my_mission_ids())
    )
  );

-- The farm's contacts, for the one call a volunteer may legitimately need to
-- make at 02:00: the farmer whose gate he is standing at.
create policy entity_contacts_field_read on entity_contacts
  for select to authenticated
  using (
    entity_id in (select entity_id from missions where id in (select private.my_mission_ids()))
  );

-- --------------------------------------------------------------------------
-- Presence marks — the one write the field roles make
-- --------------------------------------------------------------------------
--
-- A mark is an APPEND, and the writer is pinned to the CHANNEL he actually
-- speaks for. That is the whole integrity model of R6: driver and group are
-- two independent assertions, compared against each other, and a disagreement
-- raises a mismatch instead of silently picking a winner. A client that could
-- write the other channel's mark could make a mismatch disappear.

create policy presence_marks_field_read on presence_marks
  for select to authenticated
  using (mission_id in (select private.my_mission_ids()));

create policy presence_marks_driver_write on presence_marks
  for insert to authenticated
  with check (
    private.app_role() = 'driver'
    and source = 'driver'
    and mission_id in (
      select mission_id from mission_drivers where driver_id = private.app_ref()
    )
  );

create policy presence_marks_group_write on presence_marks
  for insert to authenticated
  with check (
    private.app_role() = 'volunteer'
    and source in ('group', 'self')
    -- 'group' only from the one volunteer carrying the group's phone; 'self'
    -- only about himself, and only if he has a smartphone to do it with.
    and (
      (source = 'group' and exists (
        select 1 from mission_assignments a
        where a.mission_id = presence_marks.mission_id
          and a.volunteer_id = private.app_ref()
          and a.is_group_phone
      ))
      or (source = 'self' and volunteer_id = private.app_ref())
    )
  );

-- Corrections: the same writer may amend his own mark, never anyone else's.
create policy presence_marks_driver_update on presence_marks
  for update to authenticated
  using (
    private.app_role() = 'driver' and source = 'driver'
    and mission_id in (select mission_id from mission_drivers where driver_id = private.app_ref())
  )
  with check (source = 'driver');

create policy presence_marks_group_update on presence_marks
  for update to authenticated
  using (
    private.app_role() = 'volunteer'
    and (
      (source = 'group' and exists (
        select 1 from mission_assignments a
        where a.mission_id = presence_marks.mission_id
          and a.volunteer_id = private.app_ref()
          and a.is_group_phone
      ))
      or (source = 'self' and volunteer_id = private.app_ref())
    )
  )
  with check (source in ('group', 'self'));

-- --------------------------------------------------------------------------
-- Incidents from the field
-- --------------------------------------------------------------------------

create policy incidents_field_read on incidents
  for select to authenticated
  using (mission_id in (select private.my_mission_ids()));

create policy incidents_volunteer_insert on incidents
  for insert to authenticated
  with check (
    private.app_role() = 'volunteer'
    and source = 'volunteer'
    and reporter_id = private.app_ref()
    and mission_id in (select private.my_mission_ids())
  );

-- --------------------------------------------------------------------------
-- What NOBODY but the coordinator reads, and why
-- --------------------------------------------------------------------------
--
-- `general_meetings`, `tours`, `tour_stops`, `entity_commitments` for other
-- entities, `agreements`, `farm_visits` for other entities, and the whole
-- threat layer carry only the coordinator policy. Each is a fact about the
-- PROGRAMME rather than about the night a volunteer is working, and none of
-- them has a reader in the field. This is the same list access.ts refuses, and
-- it should stay the same list: a new table with no explicit non-coordinator
-- policy is closed by default, which is the correct direction to fail in.

