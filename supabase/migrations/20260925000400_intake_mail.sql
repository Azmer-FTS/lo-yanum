-- ═══════════════════════════════════════════════════════════════════════════
-- ★★ AQ3 (2026-09-25) — LES COURRIELS D'UNE DEMANDE PUBLIQUE, ET LEUR ÉTAT.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décision du PO : il accepte un service d'envoi. Ce fichier pose la partie
-- BASE de l'envoi ; la fonction Edge `intake-mail` (supabase/functions/) fait
-- le reste.
--
-- ★ UN COURRIEL PERDU NE FAIT JAMAIS PERDRE UNE DEMANDE (AQ3.4). L'envoi part
--   d'un déclencheur `after insert` : la ligne est écrite AVANT, et le
--   déclencheur ne peut pas la défaire — `pg_net` ne fait que mettre la
--   requête HTTP en file (asynchrone, hors transaction), et tout échec de sa
--   part est rattrapé par un `exception when others`. Au pire, l'état reste
--   `pending`, et l'application dit au bout de dix minutes que rien n'est parti.
--
-- ★ AUCUNE TABLE NEUVE (règle d'AO0 sans objet) ; `aid_requests` garde ses
--   droits d'AP : rien pour `anon`. La fonction Edge écrit avec la clé de service.

alter table public.aid_requests
  add column if not exists mail_po       text,
  add column if not exists mail_farmer   text,
  add column if not exists mail_error    text,
  add column if not exists mail_attempts int not null default 0,
  add column if not exists mail_at       timestamptz,
  -- Les identifiants des documents fournis, SANS les fichiers : la fonction
  -- Edge les nomme dans le courriel sans lire 8 Mo de PDF en base64.
  add column if not exists document_ids  jsonb;

alter table public.aid_requests drop constraint if exists aid_requests_mail_po_check;
alter table public.aid_requests add constraint aid_requests_mail_po_check
  check (mail_po is null or mail_po in ('pending', 'sending', 'sent', 'failed', 'not_configured', 'skipped'));
alter table public.aid_requests drop constraint if exists aid_requests_mail_farmer_check;
alter table public.aid_requests add constraint aid_requests_mail_farmer_check
  check (mail_farmer is null or mail_farmer in ('pending', 'sending', 'sent', 'failed', 'not_configured', 'skipped'));

-- Les demandes d'AVANT cette migration n'ont rien envoyé, et c'est la vérité :
-- aucun expéditeur n'existait. « שליחה חוזרת » dans l'app les rattrape une fois
-- la clé posée.
update public.aid_requests
   set mail_po = 'not_configured',
       mail_farmer = case when email = '' then 'skipped' else 'not_configured' end,
       mail_error = 'demande antérieure au service d''envoi (AP)',
       document_ids = coalesce(
         (select jsonb_agg(d ->> 'id') from jsonb_array_elements(documents) d), '[]'::jsonb)
 where mail_po is null;

-- ── Avant l'écriture : l'état de départ et les identifiants de documents ──
create or replace function public.aid_requests_mail_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.mail_po := coalesce(new.mail_po, 'pending');
  new.mail_farmer := coalesce(new.mail_farmer,
                              case when coalesce(new.email, '') = '' then 'skipped' else 'pending' end);
  new.document_ids := coalesce(
    (select jsonb_agg(d ->> 'id') from jsonb_array_elements(coalesce(new.documents, '[]'::jsonb)) d),
    '[]'::jsonb);
  return new;
end;
$$;

drop trigger if exists aid_requests_mail_defaults on public.aid_requests;
create trigger aid_requests_mail_defaults
  before insert on public.aid_requests
  for each row execute function public.aid_requests_mail_defaults();

-- ── Après l'écriture : l'appel, en file, qui ne peut rien casser ──────────
create extension if not exists pg_net with schema extensions;

create or replace function public.aid_requests_mail_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    -- ⚠️ L'adresse du projet est écrite en dur : Postgres ne connaît pas la
    --    référence de son propre projet. Rejouée sur une autre base, la
    --    migration appellerait lo-yanum-prod, qui ne trouverait pas la ligne
    --    et ne ferait RIEN (`not_found`) — la fonction ne lit que sa base.
    perform net.http_post(
      url     := 'https://lvrptqmkjikkkhcxocbe.supabase.co/functions/v1/intake-mail',
      body    := jsonb_build_object('id', new.id),
      headers := '{"content-type": "application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
  exception when others then
    -- La demande est écrite ; l'envoi attendra « שליחה חוזרת ».
    raise warning 'intake-mail: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.aid_requests_mail_dispatch() from public;
revoke all on function public.aid_requests_mail_defaults() from public;

drop trigger if exists aid_requests_mail_dispatch on public.aid_requests;
create trigger aid_requests_mail_dispatch
  after insert on public.aid_requests
  for each row execute function public.aid_requests_mail_dispatch();
