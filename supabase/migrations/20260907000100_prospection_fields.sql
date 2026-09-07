-- ===========================================================================
-- AA2 · AA5 — THE PROSPECTION FIELDS ON `entities`. ADDITIVE, ALL NULLABLE.
-- ===========================================================================
--
-- The association's own workbook carries them and the field work needs them:
-- the State's locality code, the regional council, what kind of legal entity
-- the counterpart is, what paper it holds over the land and until when, the
-- farmer who SIGNS and the liaison who POINTS you at him — two different
-- people, which is why they are four columns and not two.
--
-- ★ EVERY ONE OF THEM IS NULLABLE, AND NOT ONE HAS A DEFAULT. A record is
--   created the moment somebody has heard of a place, long before anybody has
--   read its lease. `not null default ''` would make "we have not asked" and
--   "there is nothing" the same value, and AA2bis turns on telling those two
--   apart: `landRightIssue` answers `unset` for the first and `no_document`
--   for the second, and warns differently.
--
-- ★ `locality_code` IS UNIQUE WHEN PRESENT, AND THAT IS THE IMPORT'S IDENTITY.
--   AA4.2 — « un réimport MET À JOUR, il ne crée jamais de doublon » — keys on
--   this code when the sheet carries one. A partial unique index is the right
--   shape: two rows may both have no code (most of them will, at first), and
--   no two may claim 1177.
--
-- ★ `signature_origin` IS JSON RATHER THAN THREE COLUMNS because it is one
--   fact with a shape — signed in the app, or imported from this file on that
--   day — and the three parts are never queried apart. `text` and not `jsonb`:
--   nothing on the server reads inside it, and `rows.ts` parses it defensively
--   (a malformed cell reads as "provenance unknown", never as a failed sync).
--
-- ADDITIVE: no existing column, policy or enum is altered. An older client
-- reads and writes entities exactly as before.
-- ===========================================================================

-- ⚠️ ONE STATEMENT PER COLUMN, and that is not a style preference: the
--    schema reader in `bun run mapping` parses `alter table … add column`
--    one column at a time, so a comma-separated list registers only the
--    first — and the gate then reports eleven columns as missing from a
--    migration that declares them. Kept in the form every other migration
--    in this repository already uses.
alter table entities add column if not exists locality_code integer;
alter table entities add column if not exists council text;
alter table entities add column if not exists council_phone text;
alter table entities add column if not exists locality_kind text;
alter table entities add column if not exists priority integer;
alter table entities add column if not exists position_missing boolean not null default false;
alter table entities add column if not exists legal_entity text;
alter table entities add column if not exists land_agreement text;
alter table entities add column if not exists land_agreement_until text;
alter table entities add column if not exists farmer_name text;
alter table entities add column if not exists farmer_phone text;
alter table entities add column if not exists liaison_name text;
alter table entities add column if not exists liaison_phone text;
alter table entities add column if not exists signature text;
alter table entities add column if not exists signature_missing boolean not null default false;
alter table entities add column if not exists signature_origin text;

-- AA4.2 — the identity key of the prospection import, enforced where it can be.
create unique index if not exists entities_locality_code_key
  on entities (locality_code)
  where locality_code is not null;
