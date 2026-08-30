-- ===========================================================================
-- P2.2 — THE SCHEMA. Additive, and a direct transcription of src/core/types.ts.
-- ===========================================================================
--
-- Three rules this file follows, and they are worth stating because every
-- later migration has to keep them:
--
--   1. ADDITIVE ONLY. No migration ever drops or renames a column that has
--      shipped. The app runs offline and an iPad can be three versions behind
--      the database for a week; a removed column is a client that cannot read
--      its own cache back.
--
--   2. THE ENUMS ARE POSTGRES ENUMS, NOT TEXT + CHECK. The domain unions in
--      types.ts are closed sets that the UI switches over exhaustively, and a
--      typo in an INSERT should fail at the database, not surface as a farm
--      whose status renders blank. Adding a value later is `ALTER TYPE ... ADD
--      VALUE`, which is additive.
--
--   3. IDS ARE `text`, NOT `uuid`. The store already mints ids like
--      `farm-01`, `vol-001`, `zone-lk3j2-7`, the mock fixtures depend on the
--      readable ones, and the offline outbox (P2.5) has to mint ids on a
--      device with no server round trip. A `text` primary key costs nothing
--      here and keeps the demo and the real implementation the same shape.
--      Rows created by the app carry a client-generated id; nothing in this
--      schema requires the server to invent one.
--
-- Positions are stored as two `double precision` columns rather than PostGIS
-- geography. The app's own geo maths (haversine, spherical-excess dunams,
-- bearings) lives in @core/geo and is exercised by `bun run accept`; putting
-- PostGIS underneath would mean two implementations of the same arithmetic
-- that can disagree, for a query pattern ("everything in the Negev") that
-- returns the whole table anyway.

-- --------------------------------------------------------------------------
-- Enums
-- --------------------------------------------------------------------------

create type farm_status as enum (
  'to_contact', 'contacted', 'visited', 'verbal_ok', 'signed', 'active', 'declined'
);
create type farm_type as enum ('agriculture', 'livestock', 'mixed');
create type entity_kind as enum ('farm', 'moshav', 'other');
create type commitment_kind as enum ('shelter', 'water', 'food', 'other');
create type farm_zone_kind as enum ('farm_boundary', 'grazing_area');
create type threat_intensity as enum ('low', 'medium', 'high');
create type phone_type as enum ('smartphone', 'kosher');
create type volunteer_status as enum ('active', 'inactive');
create type mission_status as enum (
  'recruiting', 'planned', 'in_progress', 'completed',
  'return_not_confirmed', 'cancelled'
);
create type cancel_reason as enum (
  'no_volunteers', 'no_driver', 'farmer_request', 'weather',
  'security_forces', 'other'
);
create type cancel_recipient_kind as enum ('volunteer', 'driver', 'farmer');
create type presence_mark as enum ('present', 'absent');
-- Three independent channels, deliberately not merged — see presence_marks.
create type presence_source as enum ('driver', 'group', 'self');
create type mission_leg as enum ('outbound', 'inbound');
create type incident_severity as enum ('observation', 'suspicious', 'urgent');
create type incident_source as enum ('volunteer', 'farmer', 'coordinator');

-- --------------------------------------------------------------------------
-- Entities (חוות ומושבים)
-- --------------------------------------------------------------------------

create table entities (
  id                     text primary key,
  name                   text not null,
  locality               text not null default '',
  region                 text not null default '',
  type                   farm_type not null default 'mixed',
  -- G16 — absent reads as 'farm' in the client (entityKindOf); stored with a
  -- default here so the column is never null and no reader needs the fallback.
  entity_kind            entity_kind not null default 'farm',
  status                 farm_status not null default 'to_contact',
  lat                    double precision not null,
  lng                    double precision not null,
  farm_dunams            integer not null default 0,
  grazing_dunams         integer not null default 0,
  -- G15 — true when the coordinator TYPED the number. The zone-sum writer
  -- must not overwrite a farmer's own claim.
  farm_dunams_manual     boolean not null default false,
  grazing_dunams_manual  boolean not null default false,
  notes                  text not null default '',
  -- Derived cache of farm_visits (decision 35), maintained by one writer.
  last_visit_at          timestamptz,
  next_visit_at          timestamptz,
  -- Storage object key in the private `photos` bucket, never a data URI.
  photo                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index entities_status_idx on entities (status);
create index entities_locality_idx on entities (locality);

create table entity_contacts (
  id          text primary key,
  entity_id   text not null references entities (id) on delete cascade,
  name        text not null,
  phone       text not null default '',
  role        text not null default '',
  photo       text,
  -- The contact who may sign in as FARMER for this entity. Enforced as at most
  -- one per entity by the partial unique index below: two "primary" contacts
  -- would make "who is the farmer" unanswerable.
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index entity_contacts_entity_idx on entity_contacts (entity_id);
create unique index entity_contacts_one_primary
  on entity_contacts (entity_id) where is_primary;

create table entity_commitments (
  id          text primary key,
  entity_id   text not null references entities (id) on delete cascade,
  kind        commitment_kind not null,
  detail      text not null default '',
  fulfilled   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index entity_commitments_entity_idx on entity_commitments (entity_id);

create table agreements (
  id          text primary key,
  entity_id   text not null references entities (id) on delete cascade,
  signed_at   timestamptz not null,
  signed_by   text not null,
  -- Object key in the private `agreements` bucket (P3.3 writes the real PDF).
  file_name   text not null default '',
  created_at  timestamptz not null default now()
);

create index agreements_entity_idx on agreements (entity_id);

-- --------------------------------------------------------------------------
-- Ground and guard posts
-- --------------------------------------------------------------------------

-- G1/G15 — a drawn ring. Stored as an ordered array of points in a child
-- table rather than as JSON: a vertex drag is then one UPDATE of one row, and
-- the offline outbox can carry it as a field-level change (P2.5's
-- last-write-wins is per changed field, and a whole-ring blob would make every
-- concurrent edit a conflict).
create table zones (
  id          text primary key,
  entity_id   text not null references entities (id) on delete cascade,
  kind        farm_zone_kind not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index zones_entity_idx on zones (entity_id);

create table zone_vertices (
  zone_id   text not null references zones (id) on delete cascade,
  position  integer not null,
  lat       double precision not null,
  lng       double precision not null,
  primary key (zone_id, position)
);

create table guard_posts (
  id                  text primary key,
  entity_id           text not null references entities (id) on delete cascade,
  name                text not null,
  lat                 double precision not null,
  lng                 double precision not null,
  -- Dress code, equipment, briefing. Ordered, so an array column is right.
  instructions        text[] not null default '{}',
  -- The plain-language route, written to be readable on a kosher phone with
  -- no map. It is the ONLY thing such a volunteer ever sees, which is why the
  -- wizard warns when it is empty rather than letting it stay silently blank.
  access_description  text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index guard_posts_entity_idx on guard_posts (entity_id);

-- --------------------------------------------------------------------------
-- G18 — the threat layer. THE SENSITIVE ONE.
-- --------------------------------------------------------------------------
--
-- `entity_id` is NULLABLE on purpose: a threat does not respect a fence line
-- and the ones that matter most sit between holdings. The RLS on these two
-- tables is the strictest in the schema — see the policies migration.

create table threat_zones (
  id          text primary key,
  entity_id   text references entities (id) on delete cascade,
  intensity   threat_intensity not null default 'medium',
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create table threat_zone_vertices (
  threat_zone_id  text not null references threat_zones (id) on delete cascade,
  position        integer not null,
  lat             double precision not null,
  lng             double precision not null,
  primary key (threat_zone_id, position)
);

create table threat_vectors (
  id          text primary key,
  entity_id   text references entities (id) on delete cascade,
  origin_lat  double precision not null,
  origin_lng  double precision not null,
  target_lat  double precision not null,
  target_lng  double precision not null,
  intensity   threat_intensity not null default 'medium',
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- People
-- --------------------------------------------------------------------------

create table volunteers (
  id                 text primary key,
  name               text not null,
  age                integer not null default 20,
  phone              text not null,
  phone_type         phone_type not null default 'smartphone',
  yeshiva            text not null default '',
  locality           text not null default '',
  guards_count       integer not null default 0,
  status             volunteer_status not null default 'active',
  -- Required by the app when status is 'inactive'; not enforced here because
  -- an import may legitimately land a row mid-edit and a hard constraint would
  -- reject the whole batch.
  inactive_reason    text,
  notes              text not null default '',
  last_activity_at   timestamptz,
  photo              text,
  has_license        boolean not null default false,
  has_car            boolean not null default false,
  -- G5.2 — the dual hat: true maintains a linked drivers row.
  can_drive          boolean not null default false,
  -- G3.4 — soft scoring signals. Defaults are "whenever needed", which is the
  -- common case and must stay the cheap one.
  avail_nights       boolean not null default true,
  avail_days         boolean not null default true,
  avail_weekends     boolean not null default true,
  avail_excluded     date[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- The import de-duplicates on the digits of the phone; the database enforces
-- the same identity so two devices syncing the same person offline cannot
-- create him twice.
create unique index volunteers_phone_digits
  on volunteers ((regexp_replace(phone, '\D', '', 'g')))
  where phone <> '';
create index volunteers_status_idx on volunteers (status);
create index volunteers_locality_idx on volunteers (locality);

create table drivers (
  id                 text primary key,
  name               text not null,
  phone              text not null,
  vehicle            text not null default '',
  seats              integer not null default 4,
  locality           text not null default '',
  photo              text,
  availability_note  text not null default '',
  notes              text not null default '',
  -- G5.2 — set for a volunteer who also drives; null for a career driver.
  volunteer_id       text references volunteers (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index drivers_phone_digits
  on drivers ((regexp_replace(phone, '\D', '', 'g')))
  where phone <> '';
-- One driver row per volunteer, or the dual hat becomes two people again.
create unique index drivers_one_per_volunteer
  on drivers (volunteer_id) where volunteer_id is not null;

-- --------------------------------------------------------------------------
-- Missions (שמירות)
-- --------------------------------------------------------------------------

create table missions (
  id                     text primary key,
  entity_id              text not null references entities (id) on delete cascade,
  -- THE RENDEZVOUS. Exactly one, always — it is a logistics commitment the
  -- driver and every generated message depend on (decision 52).
  guard_post_id          text not null references guard_posts (id) on delete restrict,
  start_at               timestamptz not null,
  end_at                 timestamptz not null,
  status                 mission_status not null default 'recruiting',
  required_volunteers    integer not null default 2,
  -- G8 — the car stops where the car can go, which is not the guard post.
  pickup_lat             double precision,
  pickup_lng             double precision,
  dropoff_lat            double precision,
  dropoff_lng            double precision,
  return_pickup_lat      double precision,
  return_pickup_lng      double precision,
  return_dropoff_lat     double precision,
  return_dropoff_lng     double precision,
  -- D6.2 — the four instants the night actually passes through. Each is
  -- stamped by exactly one transition in the app and by nothing else.
  arrival_confirmed_at   timestamptz,
  end_confirmed_at       timestamptz,
  dropped_off_at         timestamptz,
  picked_up_at           timestamptz,
  completed_at           timestamptz,
  -- G9bis — a cancellation is a chapter of the history, not a tombstone.
  cancelled_at           timestamptz,
  cancel_reason          cancel_reason,
  cancel_note            text not null default '',
  reactivated_at         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index missions_entity_idx on missions (entity_id);
create index missions_start_idx on missions (start_at);
create index missions_status_idx on missions (status);

-- Decision 56 + §12 — the ADDITIONAL positions are a JOIN TABLE, not an array
-- column, and this is the migration that settles it: each one may carry its
-- own optional time window, which an array cannot hold. Empty times mean "the
-- whole night", which stays the default because most guards have no schedule
-- and a form demanding two times per position would make the common case
-- worse to serve the rare one.
create table mission_guard_posts (
  mission_id     text not null references missions (id) on delete cascade,
  guard_post_id  text not null references guard_posts (id) on delete restrict,
  position       integer not null,
  starts_at      timestamptz,
  ends_at        timestamptz,
  primary key (mission_id, guard_post_id)
);

create index mission_guard_posts_mission_idx on mission_guard_posts (mission_id);

create table mission_drivers (
  mission_id  text not null references missions (id) on delete cascade,
  driver_id   text not null references drivers (id) on delete restrict,
  -- G5.3 — confirmation is PER DRIVER and covers exactly HIS passengers.
  -- With two cars on the road "the driver confirmed" is not a fact, it is two.
  confirmed   boolean not null default false,
  position    integer not null default 0,
  primary key (mission_id, driver_id)
);

create table mission_driver_passengers (
  mission_id    text not null references missions (id) on delete cascade,
  driver_id     text not null references drivers (id) on delete restrict,
  volunteer_id  text not null references volunteers (id) on delete cascade,
  -- Boarding order.
  position      integer not null,
  primary key (mission_id, driver_id, volunteer_id),
  foreign key (mission_id, driver_id)
    references mission_drivers (mission_id, driver_id) on delete cascade
);

create table mission_assignments (
  mission_id      text not null references missions (id) on delete cascade,
  volunteer_id    text not null references volunteers (id) on delete cascade,
  -- Exactly one assignment per mission carries the group's smartphone. A
  -- kosher-phone holder physically cannot self-confirm, which is why somebody
  -- has to hold the group phone and confirm nominatively for the others.
  is_group_phone  boolean not null default false,
  primary key (mission_id, volunteer_id)
);

create unique index mission_assignments_one_group_phone
  on mission_assignments (mission_id) where is_group_phone;

-- R6 — NOMINATIVE presence. One row per person, per leg, per CHANNEL.
--
-- Three channels deliberately not merged: `driver` and `group` are the two
-- authoritative ones and are compared against each other, and a disagreement
-- is a MISMATCH that raises an alert rather than silently picking a winner.
-- `self` exists only for smartphone holders.
--
-- Modelled as rows rather than three columns because that is what makes a
-- mark an append: the offline outbox replays "the group holder marked Shmuel
-- present on the inbound leg at 04:58" without having to read-modify-write a
-- row two other people are also touching.
create table presence_marks (
  mission_id    text not null references missions (id) on delete cascade,
  volunteer_id  text not null references volunteers (id) on delete cascade,
  leg           mission_leg not null,
  source        presence_source not null,
  mark          presence_mark not null,
  marked_at     timestamptz not null default now(),
  primary key (mission_id, volunteer_id, leg, source),
  foreign key (mission_id, volunteer_id)
    references mission_assignments (mission_id, volunteer_id) on delete cascade
);

-- G9bis — who was booked at the moment of cancellation, and whether they have
-- actually been told. The message TEXT is not stored: it is rebuilt from the
-- locale files, so the wording stays in one place and stays translatable.
create table cancel_notices (
  mission_id      text not null references missions (id) on delete cascade,
  recipient_kind  cancel_recipient_kind not null,
  recipient_id    text not null,
  sent_at         timestamptz,
  primary key (mission_id, recipient_kind, recipient_id)
);

-- --------------------------------------------------------------------------
-- Visits, meetings, tours, incidents
-- --------------------------------------------------------------------------

create table farm_visits (
  id          text primary key,
  entity_id   text not null references entities (id) on delete cascade,
  at          timestamptz not null,
  note        text not null default '',
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index farm_visits_entity_idx on farm_visits (entity_id);
create index farm_visits_at_idx on farm_visits (at);

create table general_meetings (
  id          text primary key,
  title       text not null,
  at          timestamptz not null,
  end_at      timestamptz not null,
  -- Free text: these happen anywhere, and a foreign key to an entity would be
  -- exactly the wrong shape for "a call with a donor".
  location    text not null default '',
  person      text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index general_meetings_at_idx on general_meetings (at);

-- G9 — a tour IS a calendar day: one per day, keyed by the local day.
create table tours (
  id          text primary key,
  day_key     date not null unique,
  depart_at   timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table tour_stops (
  tour_id    text not null references tours (id) on delete cascade,
  entity_id  text not null references entities (id) on delete cascade,
  position   integer not null,
  primary key (tour_id, entity_id)
);

create table incidents (
  id             text primary key,
  entity_id      text not null references entities (id) on delete cascade,
  mission_id     text references missions (id) on delete set null,
  source         incident_source not null,
  -- Volunteer id / contact id / null for the coordinator.
  reporter_id    text,
  reporter_name  text not null default '',
  severity       incident_severity not null default 'observation',
  description    text not null default '',
  lat            double precision,
  lng            double precision,
  reported_at    timestamptz not null default now(),
  resolved       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index incidents_entity_idx on incidents (entity_id);
create index incidents_reported_idx on incidents (reported_at);
create index incidents_severity_idx on incidents (severity);

create table incident_entries (
  id           text primary key,
  incident_id  text not null references incidents (id) on delete cascade,
  at           timestamptz not null default now(),
  author       text not null default '',
  text         text not null default '',
  created_at   timestamptz not null default now()
);

create index incident_entries_incident_idx on incident_entries (incident_id);

-- --------------------------------------------------------------------------
-- Who is signed in, and as what
-- --------------------------------------------------------------------------
--
-- Phase 1 has exactly ONE account and it is the coordinator's. The table
-- exists now anyway, and every policy in the next migration reads its role
-- through `app_role()`, so the day a farmer gets a login the change is a row
-- here and a widened policy — not a re-architecture. A user with no row is
-- nobody: `app_role()` returns null and every policy denies.
create table app_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('coordinator', 'farmer', 'volunteer', 'driver')),
  -- The record this login speaks for: a contact id for a farmer, a volunteer
  -- id for a volunteer, a driver id for a driver. Null for the coordinator,
  -- who speaks for the programme.
  entity_ref  text,
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- updated_at, maintained by the database
-- --------------------------------------------------------------------------
--
-- P2.5's sync strategy is last-write-wins per changed field, and it needs a
-- server timestamp it can trust. A client clock cannot be that: an iPad that
-- has been offline in the desert for a day can be minutes out, and the whole
-- point of the rule is to resolve two devices disagreeing.

create or replace function touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'entities', 'zones', 'guard_posts', 'threat_zones', 'threat_vectors',
    'volunteers', 'drivers', 'missions', 'farm_visits', 'general_meetings',
    'tours', 'incidents'
  ]
  loop
    execute format(
      'create trigger %I_touch before update on %I
         for each row execute function touch_updated_at()',
      t, t
    );
  end loop;
end;
$$;
