-- ═══════════════════════════════════════════════════════════════════════════
-- AV1 (2026-10-08) — LES ONZE INSTITUTIONS DE LA TOURNÉE, ET CE QU'IL FAUT
-- POUR LES CONFIRMER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Colonnes neuves de `institutions` :
--   engagement_confirmed  — faux = « חתום » posé à la demande du PO, À CONFIRMER
--                           (il valide chacune après coup, en un geste) ;
--   met_on                — date de la rencontre ;
--   students              — effectif quand il est public (vide sinon) ;
--   position_source       — d'où vient la coordonnée, et la confiance ;
--   aliases               — les autres noms (« · »), pour qu'un import ne
--                           duplique pas (« ישיבת אפיקי דעת » = Sderot).
-- Les onze lignes : `on conflict do nothing` — rien d'existant n'est écrasé.
-- Provenance de chaque point : `position_source` et ETAT.md § AV1.

alter table public.institutions
  add column if not exists engagement_confirmed boolean not null default true,
  add column if not exists met_on date,
  add column if not exists students integer check (students is null or students >= 0),
  add column if not exists position_source text not null default '',
  add column if not exists aliases text not null default '';

insert into public.institutions
  (id, name, locality, kind, audience, network, lat, lng, position_uncertain, engagement,
   engagement_confirmed, contact_name, contact_phone, notes, extra, source, met_on, students,
   position_source, aliases)
values
  ('inst-1s4q9zh', 'ישיבת ההסדר שדרות', 'שדרות', 'hesder', 'boys', '', 31.52453, 34.59071, false, 'signed', false, 'הרב דוד פנדל', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', 500, 'OSM « ישיבת הסדר אפיקי דעת », רח׳ ההסתדרות + he.wikipedia (31.52428, 34.59142) — 70 מ׳ ביניהם. ודאות גבוהה', 'ישיבת אפיקי דעת · ישיבת שדרות'),
  ('inst-v8rhiu', 'ישיבת הסדר קרית גת', 'קריית גת', 'hesder', 'boys', '', 31.60576, 34.76184, false, 'signed', false, 'הרב שמעון פרץ', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', null, 'he.wikipedia « ישיבת ההסדר קריית גת ». מקור אחד — ודאות בינונית-גבוהה', 'ישיבת ההסדר קריית גת'),
  ('inst-1tztnmz', 'ישיבת דרך חיים', 'קריית גת', 'hesder', 'boys', '', 31.60831, 34.77654, false, 'signed', false, 'הרב משה ישר', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', null, 'he.wikipedia « ישיבת ההסדר דרך חיים ». מקור אחד — ודאות בינונית-גבוהה. ⚠️ המקורות מציינים את הרב אמיר ממן כראש הישיבה', 'ישיבת ההסדר דרך חיים'),
  ('inst-l8yyn8', 'ישיבת נוה דקלים', 'אשדוד', 'hesder', 'boys', '', 31.77892, 34.65042, false, 'signed', false, 'הרב גבריאלי', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', null, 'he.wikipedia « ישיבת נוה דקלים » (אשדוד). מקור אחד — ודאות בינונית-גבוהה. לא לבלבל עם אולפנת נווה דקלים (31.7395, 34.6375)', 'ישיבת נווה דקלים · ישיבת ימית'),
  ('inst-1b9rz4e', 'ישיבת אור עציון', 'מרכז שפירא', 'hesder', 'boys', '', 31.69871, 34.70866, false, 'signed', false, 'הרב שמעון לפיד', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', null, 'he.wikipedia « ישיבת אור עציון », בתוך מרכז שפירא (מרכז היישוב 31.69618, 34.70658). ודאות גבוהה', ''),
  ('inst-pn8lxl', 'ישיבת כרם ביבנה', 'כרם ביבנה', 'hesder', 'boys', '', 31.81843, 34.72221, false, 'signed', false, '', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', null, 'OSM « ישיבת כרם ביבנה » + he.wikipedia — זהים. ודאות גבוהה', ''),
  ('inst-limvku', 'ישיבת כפר מיימון', 'כפר מימון', 'other', 'boys', '', 31.43081, 34.53638, true, 'signed', false, 'ראש הישיבה', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', null, 'מרכז המושב (OSM/he.wikipedia). הישיבה התיכונית « בית יהודה » נמצאת במושב, הבניין לא אותר — עד 1 ק״מ', 'ישיבת בית יהודה'),
  ('inst-176u708', 'מכינת כאייל', 'אופקים', 'mechina', 'boys', '', 31.31258, 34.62085, true, 'signed', false, '', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', null, 'mechinot.org.il: « בית המדרש בלב העיר אופקים ». נקודה = מרכז העיר (OSM). הבניין לא אותר — עד 2 ק״מ', 'מכינה ישיבתית כאייל'),
  ('inst-u4yt4w', 'שומריה לצעירים', 'שומריה', 'other', 'unknown', '', 31.43223, 34.88374, true, 'signed', false, 'יונתן רום', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', null, 'לא נמצא ברשת. נקודה = מרכז קיבוץ שומריה (he.wikipedia). היישוב ודאי, המוסד לא אומת', ''),
  ('inst-bj6ody', 'מכינת עצמונה', 'נווה', 'mechina', 'boys', '', 31.16198, 34.32989, false, 'signed', false, 'הרב רעי פרץ', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', 300, 'he.wikipedia « מכינה קדם-צבאית עצם » + OSM « מכינת עצם » (450 מ׳ ביניהם). במושב נווה (מ״א אשכול) מאז 2010-2011 — לא בשומריה (60 ק״מ). ודאות גבוהה', 'מכינת עצם · מכינת עצ״ם'),
  ('inst-1jkb2k7', 'ישיבה תיכונית נווה', 'נווה', 'other', 'boys', '', 31.16217, 34.32981, false, 'signed', false, '', '', 'נפגשו בסיור 08.10.2026 · סומנו חתום לפי בקשת הרכז — לאשר', '', 'manual', date '2026-10-08', 190, 'he.wikipedia « ישיבה תיכונית נווה » — מושב נווה, מ״א אשכול (ynave.co.il). ודאות גבוהה', 'ישיבה תיכונית תורנית נווה')
on conflict (id) do nothing;
