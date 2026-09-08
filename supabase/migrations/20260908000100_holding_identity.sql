-- ===========================================================================
-- AC1 · AC2 · AC3 — UNE LIGNE PAR EXPLOITATION, PAS PAR LOCALITÉ.
-- ===========================================================================
--
-- The product owner's new workbook says it on its own מקרא sheet: « שורה אחת
-- לכל חווה, לא לכל יישוב ». A locality carries several independent holdings —
-- four farmers in בארי, each with his own dunams and his own contract — and
-- the identity `entities` enforced until today, סמל יישוב alone, made those
-- four the same record.
--
-- ★★ SO THE UNIQUE INDEX ON `locality_code` HAS TO GO, AND IT IS REPLACED
--    RATHER THAN DROPPED. The identity is שם החווה + שם החקלאי + סמל יישוב
--    (`core/prospection.ts`, `identityKey`), and that triple is what the new
--    index enforces.
--
-- ⚠️ `coalesce(...,'')` ON BOTH NAMES, AND IT IS THE WHOLE POINT. In Postgres
--    two NULLs are not equal, so a unique index over the bare triple would let
--    an unlimited number of rows share one locality code as long as both names
--    were null — which is precisely the LOCALITY SEED case, the one shape this
--    file must keep to exactly one row per locality.
--
-- ADDITIVE apart from that one index: no column is dropped, no policy altered.
-- An older client reads and writes entities exactly as before.
-- ===========================================================================

-- ⚠️ ONE STATEMENT PER COLUMN — the schema reader in `bun run mapping` parses
--    `alter table … add column` one column at a time.
alter table entities add column if not exists farm_name text;
alter table entities add column if not exists farmer_email text;
alter table entities add column if not exists umbrella_org text;
alter table entities add column if not exists guarded_dunams integer;
alter table entities add column if not exists guarded_dunams_manual boolean not null default false;

-- AA4.2's index, retired: it is the defect AC1 is about.
drop index if exists entities_locality_code_key;

-- AC1.1 — the identity, as the database can state it.
create unique index if not exists entities_holding_key
  on entities (locality_code, coalesce(farm_name, ''), coalesce(farmer_name, ''))
  where locality_code is not null;
