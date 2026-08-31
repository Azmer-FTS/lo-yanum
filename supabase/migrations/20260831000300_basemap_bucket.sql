-- ===========================================================================
-- PMTILES (decision 71) — THE FIRST PUBLIC BUCKET IN THIS PROJECT.
-- ===========================================================================
--
-- ★ "WHY IS THIS ONE PUBLIC" IS THE QUESTION A REVIEWER WILL ASK, so it is
--   answered here, next to the two PRIVATE buckets of P2.4 rather than in a
--   file nobody opens.
--
--   `photos` and `agreements` are private because they hold a named person's
--   face and a farmer's signed contract. **This bucket holds one file: a
--   vector basemap of southern Israel, cut from OpenStreetMap's own public
--   planet.** It contains nothing about anybody in the programme — no farm of
--   ours is marked on it, no volunteer, no anchor point. Everything this
--   project actually protects stays in Postgres behind the RLS that P2.2
--   transcribed from `access.ts`; what is here is a picture of the ground,
--   and the ground is already public.
--
--   Making it private instead would buy nothing and cost the feature: PMTiles
--   is read by the browser with HTTP RANGE REQUESTS, thousands of them across
--   a session, and a signed URL expires. The alternative is minting a fresh
--   signed URL on a timer for a file whose contents are on openstreetmap.org
--   anyway.
--
-- ★ THE SIZE CEILING IS A COLUMN, NOT SOMETHING SOMEBODY HAS TO REMEMBER.
--   The product owner authorised the upload on 2026-08-31 with an explicit
--   bound: under 200 MB. `file_size_limit` IS that bound, so a future
--   replacement that blows past it is refused by the database rather than by
--   whether the person doing it recalled the conversation. The file that
--   prompted the number is 42 MB (z0–z14 over the gazetteer's bbox), which
--   also keeps it under Supabase's 50 MB standard-upload cap — no resumable
--   TUS upload needed.
--
--   Free tier: 1 GB stored, 5 GB egress per month. At 42 MB that is roughly
--   119 full offline map downloads a month across every device. Worth knowing
--   before "רענן מפות לא מקוונות" becomes a button people press casually.
--
-- ★ READS ARE THE `public` FLAG, NOT A POLICY. A public bucket is served from
--   `/storage/v1/object/public/<bucket>/<key>` and that path does not consult
--   `storage.objects` at all. Writing a permissive SELECT policy here would
--   therefore be theatre — it would look like the thing granting access while
--   the flag above did the granting. There is deliberately no SELECT policy.
--
-- ★ WRITES ARE COORDINATOR-ONLY, like both private buckets, and for a
--   narrower reason: in phase 1 the coordinator IS the operator, and this is
--   the grant that lets the basemap be replaced without anyone going near a
--   service-role key — which this project never fetches and never ships.
--   **If the basemap settles and stops being replaced, dropping the write
--   policy below is the right hardening**: the file would then only ever
--   change from Supabase's own dashboard, by a human who is already there.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('basemap', 'basemap', true, 209715200,
   -- A .pmtiles archive has no registered IANA type. `application/octet-stream`
   -- is what an upload client sends by default; the vendor string is accepted
   -- too so a more precise client is not rejected for being precise.
   array['application/octet-stream', 'application/vnd.pmtiles'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Re-runnable, same as P2.4.
drop policy if exists basemap_coordinator_write on storage.objects;

create policy basemap_coordinator_write on storage.objects
  for all to authenticated
  using (bucket_id = 'basemap' and private.is_coordinator())
  with check (bucket_id = 'basemap' and private.is_coordinator());
