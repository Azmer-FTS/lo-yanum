-- ===========================================================================
-- P3.3 — THE SIGNATURE ON AN AGREEMENT. ONE NULLABLE COLUMN, ADDITIVE.
-- ===========================================================================
--
-- ★ NULLABLE, AND THAT IS THE WHOLE OF THE MIGRATION'S JUDGEMENT. Every
--   agreement already in the table was signed on PAPER — that is what a signed
--   agreement has meant in this programme until today. A `not null default ''`
--   would have turned each of them into "signed, and here is a zero-length
--   image", which is a lie the farm detail would then render as a blank
--   signature box. Absent means "not signed in the app", never "not signed".
--
-- ★ AND IT HOLDS A DATA URI TODAY, an object key tomorrow, exactly like
--   `entities.photo` and `entity_contacts.photo` (see `core/photo.ts`). The
--   `agreements` Storage bucket from P2.4 is already private and already
--   coordinator-only; the day the real PDF is generated this column stops
--   being an image and starts being a key, and nothing else moves.
--
-- ADDITIVE: no existing column, policy or enum is altered. An older client
-- reads and writes agreements exactly as before.
-- ===========================================================================

alter table agreements
  add column if not exists signature text;
