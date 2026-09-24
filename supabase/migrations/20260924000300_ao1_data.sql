-- ===========================================================================
-- AO1 (2026-09-24) — LA REPRISE DES 25 EXPLOITATIONS.
-- ===========================================================================
--
-- Contenu de `docs/ao/ao1-prod.sql`, moins son `begin/commit` (l'appelant
-- enveloppe déjà chaque migration), plus un bloc de contrôle final.
--
-- ⚠️ ELLE DOIT PASSER APRÈS `20260924000100`, ET PAS DANS LA MÊME
--    TRANSACTION : Postgres refuse d'utiliser une valeur d'enum ajoutée dans
--    la transaction qui l'a ajoutée, et celle-ci pose `not_relevant_now` et
--    `on_hold`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ★★ CE QU'UNE MISE À JOUR ÉCRASE, ET CE QU'ELLE SE CONTENTE DE COMBLER.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ VU EN LISANT LA BASE AVANT D'ÉCRIRE. Trois fiches (`farm-ak1-11`
--    הר-שמש, `-12` זעק, `-13` מרגי) portaient un `updated_at` du jour : le PO
--    avait DÉPLACÉ LEURS ÉPINGLES à la main — de 45 à 210 m — et choisi
--    `legal_entity = 'herder'` sur מרגי, que le portail ne connaît pas. Une
--    reprise « le portail fait autorité » aurait remis les trois épingles à
--    la coordonnée du tableur et effacé son choix, sans que rien ne le dise.
--
--   · nom, statut, nature, surfaces          → le portail fait autorité
--   · legal_entity, farmer_name/phone/id_no  → le portail COMBLE un vide
--   · lat / lng / position_missing           → l'épingle du PO gagne TOUJOURS
--   · notes                                  → seulement les 7 lignes
--                                              dont le portail porte un
--                                              commentaire
--
-- Tout le reste de la fiche — photo, visite, תיק אתר, שטחים שמירה, contacts,
-- שם החווה — n'est pas même nommé ici, donc pas touché.
-- ===========================================================================

-- AO1 — la reprise des 25 exploitations du portail, pour `lo-yanum-prod`.
--
-- ⚠️ À JOUER APRÈS `20260924000100_status_not_relevant_now_on_hold.sql` :
--    Postgres refuse d'utiliser une valeur d'enum ajoutée dans la même
--    transaction que son ajout. Les statuts `not_relevant_now` et
--    `on_hold` sont utilisés ici.
--
-- 15 MISES À JOUR : les identifiants d'AK1 sont conservés, et
--   SEULES les colonnes que le portail connaît sont écrites. Tout ce que
--   le PO a posé dans l'app depuis AK1 (photo, visite, תיק אתר, שטחים
--   שמירה, contacts) reste intact.
-- 10 CRÉATIONS : `farm-ao1-01` … `farm-ao1-10`.
-- Aucun doublon, aucune fusion : voir `bun run aodata`.


-- MISE À JOUR farm-ak1-01 — גד״ש דביר
update public.entities set
  name = 'גד״ש דביר',
  status = 'to_contact',
  type = 'unknown',
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = coalesce(nullif('gadash', ''), legal_entity),
  farmer_name = coalesce(nullif('לירן', ''), farmer_name),
  farmer_phone = coalesce(nullif('052-6067361', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.7683 else lat end,
  lng = case when position_missing then 35.2137 else lng end,
  position_missing = case when position_missing then true else false end
where id = 'farm-ak1-01';

-- MISE À JOUR farm-ak1-02 — גד״ש להב
update public.entities set
  name = 'גד״ש להב',
  status = 'not_relevant_now',
  type = 'unknown',
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = coalesce(nullif('gadash', ''), legal_entity),
  farmer_name = coalesce(nullif('אמיר פרץ', ''), farmer_name),
  farmer_phone = coalesce(nullif('054-6614679', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.7683 else lat end,
  lng = case when position_missing then 35.2137 else lng end,
  position_missing = case when position_missing then true else false end,
  notes = 'יש להם שומר קבוע'
where id = 'farm-ak1-02';

-- MISE À JOUR farm-ak1-03 — גד״ש רוחמה
update public.entities set
  name = 'גד״ש רוחמה',
  status = 'to_contact',
  type = 'unknown',
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = coalesce(nullif('gadash', ''), legal_entity),
  farmer_name = coalesce(nullif('רו (מנכ״ל)', ''), farmer_name),
  farmer_phone = coalesce(nullif('054-7995091', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.7683 else lat end,
  lng = case when position_missing then 35.2137 else lng end,
  position_missing = case when position_missing then true else false end
where id = 'farm-ak1-03';

-- MISE À JOUR farm-ak1-04 — גד״ש שומריה
update public.entities set
  name = 'גד״ש שומריה',
  status = 'to_contact',
  type = 'unknown',
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = coalesce(nullif('gadash', ''), legal_entity),
  farmer_name = coalesce(nullif('אלחנן', ''), farmer_name),
  farmer_phone = coalesce(nullif('054-6673596', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.7683 else lat end,
  lng = case when position_missing then 35.2137 else lng end,
  position_missing = case when position_missing then true else false end
where id = 'farm-ak1-04';

-- MISE À JOUR farm-ak1-06 — חוות אורחאן
update public.entities set
  name = 'חוות אורחאן',
  status = 'to_contact',
  type = 'unknown',
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = coalesce(nullif(null, ''), legal_entity),
  farmer_name = coalesce(nullif('צביקה שלמה', ''), farmer_name),
  farmer_phone = coalesce(nullif('050-6270230', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.7683 else lat end,
  lng = case when position_missing then 35.2137 else lng end,
  position_missing = case when position_missing then true else false end
where id = 'farm-ak1-06';

-- MISE À JOUR farm-ak1-07 — משק ישי ספז
update public.entities set
  name = 'משק ישי ספז',
  status = 'to_contact',
  type = 'unknown',
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = coalesce(nullif(null, ''), legal_entity),
  farmer_name = coalesce(nullif('ישי ספז', ''), farmer_name),
  farmer_phone = coalesce(nullif('052-6067344', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.2056556 else lat end,
  lng = case when position_missing then 34.3175954 else lng end,
  position_missing = case when position_missing then false else false end
where id = 'farm-ak1-07';

-- MISE À JOUR farm-ak1-08 — קיבוץ להב — חווה טיפולית
update public.entities set
  name = 'קיבוץ להב — חווה טיפולית',
  status = 'to_contact',
  type = 'unknown',
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = coalesce(nullif(null, ''), legal_entity),
  farmer_name = coalesce(nullif('ניר', ''), farmer_name),
  farmer_phone = coalesce(nullif('052-6841023', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.7683 else lat end,
  lng = case when position_missing then 35.2137 else lng end,
  position_missing = case when position_missing then true else false end
where id = 'farm-ak1-08';

-- CRÉATION farm-ao1-01 — 01 - תומר שדה משה חקלאות
insert into public.entities (id, name, locality, region, type, entity_kind, status, lat, lng, farm_dunams, grazing_dunams, farm_dunams_manual, grazing_dunams_manual, notes, last_visit_at, next_visit_at, photo, locality_code, council, council_phone, locality_kind, priority, position_missing, locality_relation, legal_entity, land_agreement, land_agreement_until, farmer_name, farmer_phone, farmer_email, farmer_id_no, liaison_name, liaison_phone, farm_name, umbrella_org, guarded_dunams, guarded_dunams_manual, area_gap_declared, area_gap_measured, council_hotline, standby_phone, site_access, gate_code, parking, terrain_notes, signature, signature_missing, signature_origin, provided_documents, id_photo, archived_at, archive_reason)
values ('farm-ao1-01', '01 - תומר שדה משה חקלאות', '', '', 'agriculture', 'farm', 'signed', 31.6114124, 34.794011, 280, 0, true, false, '', null, null, null, null, null, null, null, null, false, null, null, null, null, 'משק שבתאי', '054-7871854', null, '557457074', null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null)
on conflict (id) do nothing;

-- CRÉATION farm-ao1-02 — 02 - שדה משה חקלאות
insert into public.entities (id, name, locality, region, type, entity_kind, status, lat, lng, farm_dunams, grazing_dunams, farm_dunams_manual, grazing_dunams_manual, notes, last_visit_at, next_visit_at, photo, locality_code, council, council_phone, locality_kind, priority, position_missing, locality_relation, legal_entity, land_agreement, land_agreement_until, farmer_name, farmer_phone, farmer_email, farmer_id_no, liaison_name, liaison_phone, farm_name, umbrella_org, guarded_dunams, guarded_dunams_manual, area_gap_declared, area_gap_measured, council_hotline, standby_phone, site_access, gate_code, parking, terrain_notes, signature, signature_missing, signature_origin, provided_documents, id_photo, archived_at, archive_reason)
values ('farm-ao1-02', '02 - שדה משה חקלאות', '', '', 'unknown', 'farm', 'verbal_ok', 31.6139839, 34.813112, 0, 0, false, false, 'שכן של תומר, ימולא על ידו', null, null, null, null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null)
on conflict (id) do nothing;

-- CRÉATION farm-ao1-03 — 02 - מושב פתיש עדר בקר
insert into public.entities (id, name, locality, region, type, entity_kind, status, lat, lng, farm_dunams, grazing_dunams, farm_dunams_manual, grazing_dunams_manual, notes, last_visit_at, next_visit_at, photo, locality_code, council, council_phone, locality_kind, priority, position_missing, locality_relation, legal_entity, land_agreement, land_agreement_until, farmer_name, farmer_phone, farmer_email, farmer_id_no, liaison_name, liaison_phone, farm_name, umbrella_org, guarded_dunams, guarded_dunams_manual, area_gap_declared, area_gap_measured, council_hotline, standby_phone, site_access, gate_code, parking, terrain_notes, signature, signature_missing, signature_origin, provided_documents, id_photo, archived_at, archive_reason)
values ('farm-ao1-03', '02 - מושב פתיש עדר בקר', '', '', 'unknown', 'farm', 'signed', 31.3303833, 34.5605774, 0, 0, false, false, '', null, null, null, null, null, null, null, null, false, null, null, null, null, 'ודקלה עופר', '054-2371311', null, '23505696', null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null)
on conflict (id) do nothing;

-- CRÉATION farm-ao1-04 — 03 - שדה משה חקלאות
insert into public.entities (id, name, locality, region, type, entity_kind, status, lat, lng, farm_dunams, grazing_dunams, farm_dunams_manual, grazing_dunams_manual, notes, last_visit_at, next_visit_at, photo, locality_code, council, council_phone, locality_kind, priority, position_missing, locality_relation, legal_entity, land_agreement, land_agreement_until, farmer_name, farmer_phone, farmer_email, farmer_id_no, liaison_name, liaison_phone, farm_name, umbrella_org, guarded_dunams, guarded_dunams_manual, area_gap_declared, area_gap_measured, council_hotline, standby_phone, site_access, gate_code, parking, terrain_notes, signature, signature_missing, signature_origin, provided_documents, id_photo, archived_at, archive_reason)
values ('farm-ao1-04', '03 - שדה משה חקלאות', '', '', 'unknown', 'farm', 'verbal_ok', 31.6139839, 34.813112, 0, 0, false, false, 'שכן של תומר, ימולא על ידו', null, null, null, null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null)
on conflict (id) do nothing;

-- CRÉATION farm-ao1-05 — 03 - אבן חן חקלאות
insert into public.entities (id, name, locality, region, type, entity_kind, status, lat, lng, farm_dunams, grazing_dunams, farm_dunams_manual, grazing_dunams_manual, notes, last_visit_at, next_visit_at, photo, locality_code, council, council_phone, locality_kind, priority, position_missing, locality_relation, legal_entity, land_agreement, land_agreement_until, farmer_name, farmer_phone, farmer_email, farmer_id_no, liaison_name, liaison_phone, farm_name, umbrella_org, guarded_dunams, guarded_dunams_manual, area_gap_declared, area_gap_measured, council_hotline, standby_phone, site_access, gate_code, parking, terrain_notes, signature, signature_missing, signature_origin, provided_documents, id_photo, archived_at, archive_reason)
values ('farm-ao1-05', '03 - אבן חן חקלאות', '', '', 'agriculture', 'farm', 'signed', 31.689069, 34.656149, 650, 0, true, false, '', null, null, null, null, null, null, null, null, false, null, null, null, null, 'עדי אבן חן', '054-5611316', null, '24015877', null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null)
on conflict (id) do nothing;

-- CRÉATION farm-ao1-06 — 04 - שדה משה חקלאות
insert into public.entities (id, name, locality, region, type, entity_kind, status, lat, lng, farm_dunams, grazing_dunams, farm_dunams_manual, grazing_dunams_manual, notes, last_visit_at, next_visit_at, photo, locality_code, council, council_phone, locality_kind, priority, position_missing, locality_relation, legal_entity, land_agreement, land_agreement_until, farmer_name, farmer_phone, farmer_email, farmer_id_no, liaison_name, liaison_phone, farm_name, umbrella_org, guarded_dunams, guarded_dunams_manual, area_gap_declared, area_gap_measured, council_hotline, standby_phone, site_access, gate_code, parking, terrain_notes, signature, signature_missing, signature_origin, provided_documents, id_photo, archived_at, archive_reason)
values ('farm-ao1-06', '04 - שדה משה חקלאות', '', '', 'unknown', 'farm', 'verbal_ok', 31.6139839, 34.813112, 0, 0, false, false, 'שכן של תומר, ימולא על ידו', null, null, null, null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null)
on conflict (id) do nothing;

-- CRÉATION farm-ao1-07 — 04 - חקלאי שפיר
insert into public.entities (id, name, locality, region, type, entity_kind, status, lat, lng, farm_dunams, grazing_dunams, farm_dunams_manual, grazing_dunams_manual, notes, last_visit_at, next_visit_at, photo, locality_code, council, council_phone, locality_kind, priority, position_missing, locality_relation, legal_entity, land_agreement, land_agreement_until, farmer_name, farmer_phone, farmer_email, farmer_id_no, liaison_name, liaison_phone, farm_name, umbrella_org, guarded_dunams, guarded_dunams_manual, area_gap_declared, area_gap_measured, council_hotline, standby_phone, site_access, gate_code, parking, terrain_notes, signature, signature_missing, signature_origin, provided_documents, id_photo, archived_at, archive_reason)
values ('farm-ao1-07', '04 - חקלאי שפיר', '', '', 'agriculture', 'farm', 'verbal_ok', 31.676913, 34.664364, 3000, 0, true, false, '', null, null, null, null, null, null, null, null, false, null, null, null, null, 'שי ברנס', '052-8665461', null, null, null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null)
on conflict (id) do nothing;

-- CRÉATION farm-ao1-08 — 05 - שדה משה חקלאות
insert into public.entities (id, name, locality, region, type, entity_kind, status, lat, lng, farm_dunams, grazing_dunams, farm_dunams_manual, grazing_dunams_manual, notes, last_visit_at, next_visit_at, photo, locality_code, council, council_phone, locality_kind, priority, position_missing, locality_relation, legal_entity, land_agreement, land_agreement_until, farmer_name, farmer_phone, farmer_email, farmer_id_no, liaison_name, liaison_phone, farm_name, umbrella_org, guarded_dunams, guarded_dunams_manual, area_gap_declared, area_gap_measured, council_hotline, standby_phone, site_access, gate_code, parking, terrain_notes, signature, signature_missing, signature_origin, provided_documents, id_photo, archived_at, archive_reason)
values ('farm-ao1-08', '05 - שדה משה חקלאות', '', '', 'unknown', 'farm', 'verbal_ok', 31.6139839, 34.813112, 0, 0, false, false, 'שכן של תומר, ימולא על ידו', null, null, null, null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null)
on conflict (id) do nothing;

-- MISE À JOUR farm-ak1-05 — 05 - גד״ש תדהר — החווה של אופק  (renommée depuis « גד״ש תדהר — החווה של אופק »)
update public.entities set
  name = '05 - גד״ש תדהר — החווה של אופק',
  status = 'verbal_ok',
  type = 'unknown',
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = coalesce(nullif('gadash', ''), legal_entity),
  farmer_name = coalesce(nullif('אופק', ''), farmer_name),
  farmer_phone = coalesce(nullif('052-5321261', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.379197 else lat end,
  lng = case when position_missing then 34.626769 else lng end,
  position_missing = case when position_missing then false else false end
where id = 'farm-ak1-05';

-- CRÉATION farm-ao1-09 — 06 - חוות נעמ״א
insert into public.entities (id, name, locality, region, type, entity_kind, status, lat, lng, farm_dunams, grazing_dunams, farm_dunams_manual, grazing_dunams_manual, notes, last_visit_at, next_visit_at, photo, locality_code, council, council_phone, locality_kind, priority, position_missing, locality_relation, legal_entity, land_agreement, land_agreement_until, farmer_name, farmer_phone, farmer_email, farmer_id_no, liaison_name, liaison_phone, farm_name, umbrella_org, guarded_dunams, guarded_dunams_manual, area_gap_declared, area_gap_measured, council_hotline, standby_phone, site_access, gate_code, parking, terrain_notes, signature, signature_missing, signature_origin, provided_documents, id_photo, archived_at, archive_reason)
values ('farm-ao1-09', '06 - חוות נעמ״א', '', '', 'agriculture', 'farm', 'signed', 31.333333, 34.595009, 600, 0, true, false, '', null, null, null, null, null, null, null, null, false, null, null, null, null, 'עשירי ברוך', '054-4306587', null, '7010797', null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null)
on conflict (id) do nothing;

-- CRÉATION farm-ao1-10 — 07 - מושב איתן
insert into public.entities (id, name, locality, region, type, entity_kind, status, lat, lng, farm_dunams, grazing_dunams, farm_dunams_manual, grazing_dunams_manual, notes, last_visit_at, next_visit_at, photo, locality_code, council, council_phone, locality_kind, priority, position_missing, locality_relation, legal_entity, land_agreement, land_agreement_until, farmer_name, farmer_phone, farmer_email, farmer_id_no, liaison_name, liaison_phone, farm_name, umbrella_org, guarded_dunams, guarded_dunams_manual, area_gap_declared, area_gap_measured, council_hotline, standby_phone, site_access, gate_code, parking, terrain_notes, signature, signature_missing, signature_origin, provided_documents, id_photo, archived_at, archive_reason)
values ('farm-ao1-10', '07 - מושב איתן', '', '', 'agriculture', 'farm', 'verbal_ok', 31.5713246, 34.7486881, 3000, 0, true, false, 'חיבורים עם חקלאים', null, null, null, null, null, null, null, null, false, null, null, null, null, 'דביר', '050-9344585', null, null, null, null, null, null, null, false, null, null, null, null, null, null, null, null, null, false, null, null, null, null, null)
on conflict (id) do nothing;

-- MISE À JOUR farm-ak1-09 — בקר מושב אמציה
update public.entities set
  name = 'בקר מושב אמציה',
  status = 'signed',
  type = 'livestock',
  farm_dunams = 0,
  grazing_dunams = 26000,
  farm_dunams_manual = false,
  grazing_dunams_manual = true,
  legal_entity = coalesce(nullif(null, ''), legal_entity),
  farmer_name = coalesce(nullif('שימי רוזן', ''), farmer_name),
  farmer_phone = coalesce(nullif('050-8851686', ''), farmer_phone),
  farmer_id_no = coalesce(nullif('570014266', ''), farmer_id_no),
  lat = case when position_missing then 31.5406799 else lat end,
  lng = case when position_missing then 34.9001389 else lng end,
  position_missing = case when position_missing then false else false end
where id = 'farm-ak1-09';

-- MISE À JOUR farm-ak1-10 — דני בראל לכיש
update public.entities set
  name = 'דני בראל לכיש',
  status = 'verbal_ok',
  type = 'livestock',
  farm_dunams = 0,
  grazing_dunams = 21000,
  farm_dunams_manual = false,
  grazing_dunams_manual = true,
  legal_entity = coalesce(nullif(null, ''), legal_entity),
  farmer_name = coalesce(nullif('דני בראל', ''), farmer_name),
  farmer_phone = coalesce(nullif('050-9688262', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.571997 else lat end,
  lng = case when position_missing then 34.8312961 else lng end,
  position_missing = case when position_missing then false else false end
where id = 'farm-ak1-10';

-- MISE À JOUR farm-ak1-11 — חוות הר-שמש
update public.entities set
  name = 'חוות הר-שמש',
  status = 'signed',
  type = 'mixed',
  farm_dunams = 200,
  grazing_dunams = 1000,
  farm_dunams_manual = true,
  grazing_dunams_manual = true,
  legal_entity = coalesce(nullif('moshav_shitufi', ''), legal_entity),
  farmer_name = coalesce(nullif('הר שמש מושב שיתופי', ''), farmer_name),
  farmer_phone = coalesce(nullif('055-6849979', ''), farmer_phone),
  farmer_id_no = coalesce(nullif('570055368', ''), farmer_id_no),
  lat = case when position_missing then 31.3926639 else lat end,
  lng = case when position_missing then 34.8401384 else lng end,
  position_missing = case when position_missing then false else false end
where id = 'farm-ak1-11';

-- MISE À JOUR farm-ak1-12 — חוות זעק
update public.entities set
  name = 'חוות זעק',
  status = 'verbal_ok',
  type = 'mixed',
  farm_dunams = 100,
  grazing_dunams = 1000,
  farm_dunams_manual = true,
  grazing_dunams_manual = true,
  legal_entity = coalesce(nullif(null, ''), legal_entity),
  farmer_name = coalesce(nullif('דוד דהן', ''), farmer_name),
  farmer_phone = coalesce(nullif('052-3231260', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.4131105 else lat end,
  lng = case when position_missing then 34.8640847 else lng end,
  position_missing = case when position_missing then false else false end
where id = 'farm-ak1-12';

-- MISE À JOUR farm-ak1-13 — חוות מרגי
update public.entities set
  name = 'חוות מרגי',
  status = 'signed',
  type = 'livestock',
  farm_dunams = 0,
  grazing_dunams = 5000,
  farm_dunams_manual = false,
  grazing_dunams_manual = true,
  legal_entity = coalesce(nullif(null, ''), legal_entity),
  farmer_name = coalesce(nullif('יונתן מרגי', ''), farmer_name),
  farmer_phone = coalesce(nullif('050-8912840', ''), farmer_phone),
  farmer_id_no = coalesce(nullif('021985189', ''), farmer_id_no),
  lat = case when position_missing then 31.670483 else lat end,
  lng = case when position_missing then 35.034498 else lng end,
  position_missing = case when position_missing then false else false end
where id = 'farm-ak1-13';

-- MISE À JOUR farm-ak1-14 — חוות ניסים
update public.entities set
  name = 'חוות ניסים',
  status = 'on_hold',
  type = 'unknown',
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = coalesce(nullif(null, ''), legal_entity),
  farmer_name = coalesce(nullif('ניסים פרץ', ''), farmer_name),
  farmer_phone = coalesce(nullif('050-5404866', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.4908558 else lat end,
  lng = case when position_missing then 34.6739116 else lng end,
  position_missing = case when position_missing then false else false end,
  notes = 'קיבל 6 בני שירות לכל השנה'
where id = 'farm-ak1-14';

-- MISE À JOUR farm-ak1-15 — משק שלם
update public.entities set
  name = 'משק שלם',
  status = 'verbal_ok',
  type = 'agriculture',
  farm_dunams = 1000,
  grazing_dunams = 0,
  farm_dunams_manual = true,
  grazing_dunams_manual = false,
  legal_entity = coalesce(nullif(null, ''), legal_entity),
  farmer_name = coalesce(nullif('רותם', ''), farmer_name),
  farmer_phone = coalesce(nullif('055-0505055', ''), farmer_phone),
  farmer_id_no = coalesce(nullif(null, ''), farmer_id_no),
  lat = case when position_missing then 31.4729415 else lat end,
  lng = case when position_missing then 34.6425293 else lng end,
  position_missing = case when position_missing then false else false end
where id = 'farm-ak1-15';


-- ---------------------------------------------------------------------------
-- LE CONTRÔLE, RENDU PAR LE SERVEUR LUI-MÊME.
-- ---------------------------------------------------------------------------
--
-- `farm-ak1-*` ne peut pas avoir été CRÉÉ ici (ce sont des `update`), et
-- `farm-ao1-*` ne peut pas avoir été MIS À JOUR (ils n'existaient pas) : les
-- deux comptes disent donc exactement « mises à jour » et « créations ».
do $$
declare
  n_ak1 int; n_ao1 int; n_total int; n_hold int; n_away int;
  n_pin int;
begin
  select count(*) filter (where id like 'farm-ak1-%'),
         count(*) filter (where id like 'farm-ao1-%'),
         count(*),
         count(*) filter (where status = 'on_hold'),
         count(*) filter (where status = 'not_relevant_now')
    into n_ak1, n_ao1, n_total, n_hold, n_away
    from public.entities;

  /* Les trois épingles que le PO a posées le 24/09 : intactes ? */
  select count(*) into n_pin from public.entities
   where id in ('farm-ak1-11','farm-ak1-12','farm-ak1-13')
     and (lat, lng) in ((31.3928483502347, 34.8429416589365),
                        (31.4127807449566, 34.86694138306),
                        (31.6692346391939, 35.0331576786348));

  raise notice 'AO1 — MISES A JOUR (farm-ak1-*) : %', n_ak1;
  raise notice 'AO1 — CREATIONS   (farm-ao1-*) : %', n_ao1;
  raise notice 'AO1 — entities au total        : %', n_total;
  raise notice 'AO2 — on_hold : % · not_relevant_now : %', n_hold, n_away;
  raise notice 'AO1 — epingles du PO preservees : % / 3', n_pin;

  if n_ak1 <> 15 or n_ao1 <> 10 then
    raise exception 'AO1 — attendu 15 mises a jour et 10 creations, obtenu % et %', n_ak1, n_ao1;
  end if;
  if n_hold <> 1 or n_away <> 1 then
    raise exception 'AO2 — attendu 1 on_hold et 1 not_relevant_now, obtenu % et %', n_hold, n_away;
  end if;
  if n_pin <> 3 then
    raise exception 'AO1 — une epingle posee par le PO a ete ecrasee (% / 3)', n_pin;
  end if;
end $$;
