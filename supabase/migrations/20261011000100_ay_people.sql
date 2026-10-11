-- ═══════════════════════════════════════════════════════════════════════════
-- ★★ AY4 · AY10 (2026-10-11) — LES GENS : QUI ROULE AVEC QUI, ET LEUR VISAGE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- AY4 — « Chaque institution a SES PROPRES conducteurs : c'est ce qui rend
-- les gardes possibles. » Un conducteur est un volontaire qui conduit
-- (`volunteers.can_drive` + la ligne `drivers` liée, G5.2). Depuis la fiche
-- d'une institution, le PO met en correspondance ses volontaires et ses
-- conducteurs : `ride_with` = le volontaire-conducteur avec qui ce volontaire
-- part d'habitude. Une suggestion pour composer une garde, jamais une règle.
--
-- AY10 — « Je reconnais mes contacts à leur photo. » Les fiches .vcf de
-- WhatsApp portent souvent une PHOTO ; les volontaires et les conducteurs
-- avaient déjà leur colonne, pas les contacts (`leads`).
--
-- Additive : le code d'avant AY n'écrit ni ne lit ces colonnes.
-- ⛔ Rien pour `anon` (règle d'AP) ; les tables existent avec leurs droits.

alter table public.leads add column if not exists photo text;

alter table public.volunteers
  add column if not exists ride_with text references public.volunteers(id) on delete set null;
create index if not exists volunteers_ride_with_idx on public.volunteers (ride_with);
