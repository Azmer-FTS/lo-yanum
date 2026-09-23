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

begin;

-- MISE À JOUR farm-ak1-01 — גד״ש דביר
update public.entities set
  name = 'גד״ש דביר',
  status = 'to_contact',
  type = 'unknown',
  lat = 31.7683,
  lng = 35.2137,
  position_missing = true,
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = 'gadash',
  farmer_name = 'לירן',
  farmer_phone = '052-6067361',
  farmer_id_no = null
where id = 'farm-ak1-01';

-- MISE À JOUR farm-ak1-02 — גד״ש להב
update public.entities set
  name = 'גד״ש להב',
  status = 'not_relevant_now',
  type = 'unknown',
  lat = 31.7683,
  lng = 35.2137,
  position_missing = true,
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = 'gadash',
  farmer_name = 'אמיר פרץ',
  farmer_phone = '054-6614679',
  farmer_id_no = null,
  notes = 'יש להם שומר קבוע'
where id = 'farm-ak1-02';

-- MISE À JOUR farm-ak1-03 — גד״ש רוחמה
update public.entities set
  name = 'גד״ש רוחמה',
  status = 'to_contact',
  type = 'unknown',
  lat = 31.7683,
  lng = 35.2137,
  position_missing = true,
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = 'gadash',
  farmer_name = 'רו (מנכ״ל)',
  farmer_phone = '054-7995091',
  farmer_id_no = null
where id = 'farm-ak1-03';

-- MISE À JOUR farm-ak1-04 — גד״ש שומריה
update public.entities set
  name = 'גד״ש שומריה',
  status = 'to_contact',
  type = 'unknown',
  lat = 31.7683,
  lng = 35.2137,
  position_missing = true,
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = 'gadash',
  farmer_name = 'אלחנן',
  farmer_phone = '054-6673596',
  farmer_id_no = null
where id = 'farm-ak1-04';

-- MISE À JOUR farm-ak1-06 — חוות אורחאן
update public.entities set
  name = 'חוות אורחאן',
  status = 'to_contact',
  type = 'unknown',
  lat = 31.7683,
  lng = 35.2137,
  position_missing = true,
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = null,
  farmer_name = 'צביקה שלמה',
  farmer_phone = '050-6270230',
  farmer_id_no = null
where id = 'farm-ak1-06';

-- MISE À JOUR farm-ak1-07 — משק ישי ספז
update public.entities set
  name = 'משק ישי ספז',
  status = 'to_contact',
  type = 'unknown',
  lat = 31.2056556,
  lng = 34.3175954,
  position_missing = false,
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = null,
  farmer_name = 'ישי ספז',
  farmer_phone = '052-6067344',
  farmer_id_no = null
where id = 'farm-ak1-07';

-- MISE À JOUR farm-ak1-08 — קיבוץ להב — חווה טיפולית
update public.entities set
  name = 'קיבוץ להב — חווה טיפולית',
  status = 'to_contact',
  type = 'unknown',
  lat = 31.7683,
  lng = 35.2137,
  position_missing = true,
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = null,
  farmer_name = 'ניר',
  farmer_phone = '052-6841023',
  farmer_id_no = null
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
  lat = 31.379197,
  lng = 34.626769,
  position_missing = false,
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = 'gadash',
  farmer_name = 'אופק',
  farmer_phone = '052-5321261',
  farmer_id_no = null
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
  lat = 31.5406799,
  lng = 34.9001389,
  position_missing = false,
  farm_dunams = 0,
  grazing_dunams = 26000,
  farm_dunams_manual = false,
  grazing_dunams_manual = true,
  legal_entity = null,
  farmer_name = 'שימי רוזן',
  farmer_phone = '050-8851686',
  farmer_id_no = '570014266'
where id = 'farm-ak1-09';

-- MISE À JOUR farm-ak1-10 — דני בראל לכיש
update public.entities set
  name = 'דני בראל לכיש',
  status = 'verbal_ok',
  type = 'livestock',
  lat = 31.571997,
  lng = 34.8312961,
  position_missing = false,
  farm_dunams = 0,
  grazing_dunams = 21000,
  farm_dunams_manual = false,
  grazing_dunams_manual = true,
  legal_entity = null,
  farmer_name = 'דני בראל',
  farmer_phone = '050-9688262',
  farmer_id_no = null
where id = 'farm-ak1-10';

-- MISE À JOUR farm-ak1-11 — חוות הר-שמש
update public.entities set
  name = 'חוות הר-שמש',
  status = 'signed',
  type = 'mixed',
  lat = 31.3926639,
  lng = 34.8401384,
  position_missing = false,
  farm_dunams = 200,
  grazing_dunams = 1000,
  farm_dunams_manual = true,
  grazing_dunams_manual = true,
  legal_entity = 'moshav_shitufi',
  farmer_name = 'הר שמש מושב שיתופי',
  farmer_phone = '055-6849979',
  farmer_id_no = '570055368'
where id = 'farm-ak1-11';

-- MISE À JOUR farm-ak1-12 — חוות זעק
update public.entities set
  name = 'חוות זעק',
  status = 'verbal_ok',
  type = 'mixed',
  lat = 31.4131105,
  lng = 34.8640847,
  position_missing = false,
  farm_dunams = 100,
  grazing_dunams = 1000,
  farm_dunams_manual = true,
  grazing_dunams_manual = true,
  legal_entity = null,
  farmer_name = 'דוד דהן',
  farmer_phone = '052-3231260',
  farmer_id_no = null
where id = 'farm-ak1-12';

-- MISE À JOUR farm-ak1-13 — חוות מרגי
update public.entities set
  name = 'חוות מרגי',
  status = 'signed',
  type = 'livestock',
  lat = 31.670483,
  lng = 35.034498,
  position_missing = false,
  farm_dunams = 0,
  grazing_dunams = 5000,
  farm_dunams_manual = false,
  grazing_dunams_manual = true,
  legal_entity = null,
  farmer_name = 'יונתן מרגי',
  farmer_phone = '050-8912840',
  farmer_id_no = '021985189'
where id = 'farm-ak1-13';

-- MISE À JOUR farm-ak1-14 — חוות ניסים
update public.entities set
  name = 'חוות ניסים',
  status = 'on_hold',
  type = 'unknown',
  lat = 31.4908558,
  lng = 34.6739116,
  position_missing = false,
  farm_dunams = 0,
  grazing_dunams = 0,
  farm_dunams_manual = false,
  grazing_dunams_manual = false,
  legal_entity = null,
  farmer_name = 'ניסים פרץ',
  farmer_phone = '050-5404866',
  farmer_id_no = null,
  notes = 'קיבל 6 בני שירות לכל השנה'
where id = 'farm-ak1-14';

-- MISE À JOUR farm-ak1-15 — משק שלם
update public.entities set
  name = 'משק שלם',
  status = 'verbal_ok',
  type = 'agriculture',
  lat = 31.4729415,
  lng = 34.6425293,
  position_missing = false,
  farm_dunams = 1000,
  grazing_dunams = 0,
  farm_dunams_manual = true,
  grazing_dunams_manual = false,
  legal_entity = null,
  farmer_name = 'רותם',
  farmer_phone = '055-0505055',
  farmer_id_no = null
where id = 'farm-ak1-15';

-- Le contrôle : vingt-cinq lignes, dix au nouvel identifiant.
select count(*) as total, count(*) filter (where id like 'farm-ao1-%') as creees
  from public.entities
  where id like 'farm-ak1-%' or id like 'farm-ao1-%';

commit;
