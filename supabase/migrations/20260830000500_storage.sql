-- ===========================================================================
-- P2.4 — THE TWO PRIVATE BUCKETS, AND ONE RULE FOR READING THEM.
-- ===========================================================================
--
-- `photos` holds portraits of people and one picture per farm; `agreements`
-- holds the signed PDF per entity. Both are PRIVATE: there is no public URL,
-- and every read goes through a signed URL minted for a caller the database
-- has already decided may have it.
--
-- ★ THE KEY IS THE ACCESS DECISION, so it has a shape and the shape is fixed:
--
--     photos      <kind>/<id>/<filename>
--                 kind ∈ entities | contacts | volunteers | drivers
--                 e.g.  volunteers/vol-041/portrait.jpg
--     agreements  <entity_id>/<agreement_id>.pdf
--                 e.g.  ent-07/agr-07-2.pdf
--
--   The trailing filename is what makes replacing a photo cheap: a new name
--   under the same id folder busts every cached signed URL without touching
--   the row that points at the folder. `storage.foldername(name)` returns the
--   path segments, so [1] is the kind and [2] is the id — which is the whole
--   reason the id is a FOLDER and not a stem.
--
-- ★ AND THE READ RULE IS: YOU MAY SEE THE PHOTO OF ANYTHING YOU MAY SEE.
--
--   One policy, not three. It does not restate who may read a volunteer — it
--   ASKS, with `exists (select 1 from volunteers where id = …)`. Postgres
--   applies row-level security to tables referenced inside a policy
--   expression, so that `exists` is answered by the very policies P2.2
--   transcribed from `access.ts`. The coordinator sees every row and therefore
--   every photo; a farmer sees his own entity, his own contacts and the people
--   on his farm's guards; a volunteer sees the group he is standing with.
--   Nobody has to remember to update this file when an access rule changes,
--   which is exactly the kind of remembering that fails.
--
--   The consequence worth stating out loud, because ETAT open question 4 asks
--   it: a farmer CAN see the faces of the volunteers coming to his farm, from
--   the moment the guard is planned. That is not a new decision — it is what
--   `FarmerTonightScreen` already renders and what P2.2's
--   `volunteers_same_mission_read` already grants for their NAMES. If the
--   answer to question 4 turns out to be "only once they are on site", the
--   change is one added clause here, next to the rule it qualifies.
--
-- ★ WRITES ARE COORDINATOR-ONLY, IN BOTH BUCKETS. P3 adds camera capture and
--   agreement signing; both are coordinator flows. A field role that could
--   upload could also overwrite somebody else's portrait, and there is no
--   screen in the programme that wants that.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- 5 MB against a client that compresses to a 512 px longest edge
  -- (PHOTO_MAX_EDGE, ~100 kB): the limit is a backstop for an upload path that
  -- has gone wrong, not the expected size.
  ('photos', 'photos', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('agreements', 'agreements', false, 20971520,
   array['application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Re-runnable: drop this migration's own policies before recreating them.
drop policy if exists photos_read_what_you_can_see on storage.objects;
drop policy if exists photos_coordinator_write     on storage.objects;
drop policy if exists agreements_read_your_own     on storage.objects;
drop policy if exists agreements_coordinator_write on storage.objects;

-- --------------------------------------------------------------------------
-- photos — read
-- --------------------------------------------------------------------------

create policy photos_read_what_you_can_see on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and case (storage.foldername(name))[1]
      when 'entities' then
        exists (select 1 from entities e where e.id = (storage.foldername(name))[2])
      when 'contacts' then
        exists (select 1 from entity_contacts c where c.id = (storage.foldername(name))[2])
      when 'volunteers' then
        exists (select 1 from volunteers v where v.id = (storage.foldername(name))[2])
      when 'drivers' then
        exists (select 1 from drivers d where d.id = (storage.foldername(name))[2])
      -- A key that does not follow the convention is unreadable by anybody.
      -- Closed by default is the correct direction to fail in, and it means a
      -- malformed upload is inert rather than quietly world-readable.
      else false
    end
  );

-- --------------------------------------------------------------------------
-- photos — write
-- --------------------------------------------------------------------------
--
-- `for all` rather than three policies: insert, update and delete of a
-- portrait are the same act — the coordinator maintaining the roster — and
-- splitting them would be three chances to mistype one.

create policy photos_coordinator_write on storage.objects
  for all to authenticated
  using (bucket_id = 'photos' and private.is_coordinator())
  with check (bucket_id = 'photos' and private.is_coordinator());

-- --------------------------------------------------------------------------
-- agreements
-- --------------------------------------------------------------------------
--
-- Same trick, one level simpler: the first segment IS the entity id, and
-- `agreements`' own RLS already says a farmer reads only his own. A volunteer
-- or a driver has no policy on `agreements` at all and therefore no key here
-- resolves for him — the programme's contract with a farmer is none of his
-- business, and P2.2 already said so by omission.

create policy agreements_read_your_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agreements'
    and exists (
      select 1 from agreements a
      where a.entity_id = (storage.foldername(name))[1]
    )
  );

create policy agreements_coordinator_write on storage.objects
  for all to authenticated
  using (bucket_id = 'agreements' and private.is_coordinator())
  with check (bucket_id = 'agreements' and private.is_coordinator());
