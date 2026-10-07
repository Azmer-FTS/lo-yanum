-- ═══════════════════════════════════════════════════════════════════════════
-- AT (2026-10-07) — le courriel des pistes, et trois valeurs dictées par le PO.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. AT3 — `leads.email` : le collage WhatsApp (carte vCard, « מייל: … ») porte
--    souvent un courriel ; il va au champ courriel, et suit la piste quand elle
--    devient ferme (`farmer_email`). Table existante : ses `grant` sont ceux de
--    `20261007000100_leads_and_land_documents.sql` (rien pour `anon`).
alter table public.leads add column if not exists email text not null default '';

-- 2. AT2.5 — cinq statuts au lieu de sept : « שלחתי הודעה » se fond dans
--    « ממתין לתשובה » (`no_answer`), « לא מעוניין » dans « לא רלוונטי »
--    (`not_now`). La contrainte GARDE les deux anciennes valeurs : un appareil
--    pas encore mis à jour doit pouvoir écrire ; l'app les replie à la lecture.
update public.leads set status = 'no_answer' where status = 'message_sent';
update public.leads set status = 'not_now' where status = 'not_interested';

-- 3. AT8.1 — LE PORTAIL FAIT AUTORITÉ sur les ת״ז/ח״פ : חוות מרגי porte
--    `21985189`, sans le zéro ajouté en AO.
update public.entities set farmer_id_no = '21985189'
 where id = 'farm-ak1-13' and farmer_id_no = '021985189';

-- 4. AT8.2 — גד״ש רוחמה : le contact est « רן » (noun final), pas « רו (מנכ״ל) ».
update public.leads set contact_name = 'רן'
 where id = 'lead-as-ak1-03' and contact_name = 'רו (מנכ״ל)';
