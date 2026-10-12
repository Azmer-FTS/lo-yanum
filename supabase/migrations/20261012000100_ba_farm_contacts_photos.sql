-- ═══════════════════════════════════════════════════════════════════════════
-- ★★ BA (2026-10-12) — LE PREMIER CONTACT D'UNE FERME, ET LES PHOTOS DES
--    CONTACTS RELIÉES PAR LE TÉLÉPHONE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. `entities.contact_established` — le portail de l'association servait de
--    bloc-notes avant l'application : y figurer ne prouve PAS que le contact a
--    eu lieu. Règle du PO, calculée MÉCANIQUEMENT à l'import d'un export du
--    portail : contact établi si la fiche porte des coordonnées OU une note
--    interne, sinon non établi. Modifiable à la main sur la fiche. Une fiche
--    créée dans l'application (ou convertie depuis un contact à traiter) naît
--    « établi » : c'est le PO qui l'a créée après l'avoir eu au téléphone.
--
-- 2. `contact_photos` — une photo par NUMÉRO (E.164, `+972…`), jamais par nom.
--    La même table sert aux contacts des fermes, aux contacts à traiter et aux
--    contacts des institutions : l'application retrouve la photo d'une
--    personne par son téléphone normalisé, où qu'elle apparaisse.
--
-- 3. Le bucket `contact-photos`, PRIVÉ. Les fichiers sont nommés par le
--    numéro (`972XXXXXXXXX.jpg`) ; seul le coordinateur les lit (URL signée).
--
-- 4. `entity_contacts.note` — les contacts d'une ferme forment une liste
--    ORDONNÉE (`position` : 0 = rang 1, l'agriculteur, reflété dans
--    `farmer_name` / `farmer_phone` par l'application). Chacun peut porter une
--    note courte (« s'occupe du bétail quand le rang 1 n'est pas là »), comme
--    les contacts d'une institution depuis AZ5.
--
-- Additive. ⛔ Rien pour `anon` (règle d'AP) : la table naît avec ses droits.

alter table public.entities add column if not exists contact_established boolean not null default true;
alter table public.entity_contacts add column if not exists note text not null default '';

create table if not exists public.contact_photos (
  phone_e164  text primary key check (phone_e164 ~ '^\+[0-9]{8,15}$'),
  object_key  text not null,
  -- « face » = un visage ; « logo » = le logo d'une exploitation, accepté par
  -- le PO en attendant une photo.
  kind        text not null default 'face' check (kind in ('face', 'logo')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.contact_photos enable row level security;
alter table public.contact_photos force row level security;

drop policy if exists contact_photos_coordinator_all on public.contact_photos;
create policy contact_photos_coordinator_all on public.contact_photos
  for all to authenticated
  using (private.is_coordinator()) with check (private.is_coordinator());

grant select, insert, update, delete on public.contact_photos to authenticated;
grant select, insert, update, delete on public.contact_photos to service_role;
revoke all on public.contact_photos from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contact-photos', 'contact-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists contact_photos_coordinator_rw on storage.objects;
create policy contact_photos_coordinator_rw on storage.objects
  for all to authenticated
  using (bucket_id = 'contact-photos' and private.is_coordinator())
  with check (bucket_id = 'contact-photos' and private.is_coordinator());
