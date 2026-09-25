-- ===========================================================================
-- ★★ AP4 (2026-09-25) — LA PREMIÈRE SURFACE ANONYME DE LO YANUM.
-- ===========================================================================
--
--   « Une page publique où un agriculteur DEMANDE lui-même de l'aide. […]
--     Ouvrable par n'importe qui, sans compte, sans lien de garde. »
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️⚠️ CETTE MIGRATION CONTREDIT LA RÈGLE « RIEN POUR `anon` », ET C'EST
--      DÉLIBÉRÉ. VOICI CE QUI LA REMPLACE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La règle d'AO0 disait : « rien pour `anon`, et c'est la règle de ce projet —
-- Lo Yanum n'a aucune surface anonyme ». AP lui en donne une. La règle ne
-- s'annule pas, elle se PRÉCISE :
--
--   ⛔ AUCUN DROIT DE TABLE POUR `anon`. Ni `select`, ni `insert`, ni rien,
--      sur aucune table — y compris `aid_requests`, la table que la page
--      publique remplit. `bun run auth` reste vrai mot pour mot.
--
--   ✅ TROIS FONCTIONS, ET TROIS SEULEMENT. `anon` reçoit `execute` sur
--      `submit_aid_request`, `public_busy_intervals` et
--      `public_agreement_template`, qui sont `security definer`. La surface
--      anonyme n'est donc pas « une table ouverte avec des politiques » mais
--      « trois verbes, dont le corps est écrit ici ».
--
--   ★ POURQUOI C'EST PLUS ÉTROIT QU'UNE POLITIQUE D'INSERTION. Un `grant
--     insert … to anon` + `with check` laisse quand même choisir TOUTES les
--     colonnes, y compris celles qu'on ajoutera dans six mois — une colonne
--     neuve naît ouverte. Ici le corps de la fonction nomme les colonnes une
--     par une : une colonne neuve naît fermée. C'est la différence entre une
--     liste de refus et une liste d'acceptation.
--
--   ★ ET AUCUNE DES TROIS NE REND QUOI QUE CE SOIT DE NOMINATIF.
--     `public_busy_intervals` rend des PAIRES DE DATES : pas un titre, pas un
--     nom de ferme, pas un identifiant. Une page publique n'a pas à savoir
--     chez qui le PO est mardi à dix heures — elle a besoin de savoir que
--     mardi dix heures est pris.
--
-- ⚠️ TOUTES SONT `set search_path = ''` ET NOMMENT LEURS SCHÉMAS. Une fonction
--    `security definer` sans `search_path` figé est le défaut classique : un
--    appelant qui pose un schéma devant `public` fait exécuter SON code avec
--    les droits du propriétaire.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- AO0 — LES AUTORISATIONS D'API SONT DANS CETTE MIGRATION (RÈGLE PERMANENTE)
-- ═══════════════════════════════════════════════════════════════════════════
-- `aid_requests` est créée après le 30 octobre 2026 : sans les `grant`
-- ci-dessous elle serait invisible du REST et l'application recevrait un 401
-- sans qu'aucune erreur SQL ne soit levée nulle part.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. La demande, telle qu'elle est arrivée
-- ---------------------------------------------------------------------------
--
-- ⚠️ ELLE EST CONSERVÉE MÊME UNE FOIS LA FICHE CRÉÉE, et ce n'est pas un
--    doublon. La fiche VIT : le PO la corrige, la complète, change son statut.
--    Cette table garde ce que l'agriculteur a ÉCRIT, au caractère près, le
--    jour où il l'a écrit — c'est la même raison qu'`activity_reports.body`
--    (AO3.7). Le jour où une demande tourne mal, la question « qu'avait-il
--    demandé ? » a une réponse.

create table if not exists public.aid_requests (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  -- Ce qu'il cherche, et ce qu'il a sur sa terre. Voir `core/request.ts`.
  need         text not null check (need in ('guarding', 'farm_work', 'both')),
  land_kind    text not null check (land_kind in ('crops', 'grazing', 'both')),
  farm_name    text not null,
  full_name    text not null,
  -- ⚠️ TEXTE. Un ת״ז commence parfois par un zéro ; `integer` le mangerait.
  id_number    text not null default '',
  phone        text not null,
  email        text not null default '',
  locality     text not null default '',
  -- Les PDF, dans la forme de `ProvidedDocument` (core/types.ts).
  documents    jsonb not null default '[]'::jsonb,
  -- La signature au doigt, en PNG data-URL, et l'instant où elle a été posée.
  signature    text,
  signed_at    timestamptz,
  -- Le créneau DEMANDÉ. Le PO confirme ou déplace depuis son agenda.
  appointment_at     timestamptz,
  appointment_end_at timestamptz,
  -- La fiche qui en est née, pour que le PO puisse revenir de l'une à l'autre.
  entity_id    text references public.entities (id) on delete set null,
  -- Ce qui a été renvoyé à l'agriculteur — sa référence.
  reference    text not null,
  -- L'empreinte brute de l'appel, pour un éventuel tri a posteriori.
  source       text not null default 'bakasha'
);

create index if not exists aid_requests_created_idx
  on public.aid_requests (created_at desc);
create index if not exists aid_requests_phone_idx
  on public.aid_requests (phone, created_at desc);

alter table public.aid_requests enable row level security;
alter table public.aid_requests force row level security;

-- Le coordinateur lit et gère ; personne d'autre. AUCUNE politique ne vise
-- `anon` : la page publique n'écrit pas ici, elle APPELLE une fonction.
drop policy if exists "aid requests read" on public.aid_requests;
create policy "aid requests read" on public.aid_requests
  for select to authenticated using (true);

drop policy if exists "aid requests write" on public.aid_requests;
create policy "aid requests write" on public.aid_requests
  for insert to authenticated with check (true);

drop policy if exists "aid requests update" on public.aid_requests;
create policy "aid requests update" on public.aid_requests
  for update to authenticated using (true) with check (true);

drop policy if exists "aid requests delete" on public.aid_requests;
create policy "aid requests delete" on public.aid_requests
  for delete to authenticated using (true);

-- AO0 — les autorisations d'API, dans la migration qui crée la table.
-- ⛔ ET RIEN POUR `anon`, MÊME ICI. Voir l'en-tête.
grant select, insert, update, delete on public.aid_requests to authenticated;
grant select, insert, update, delete on public.aid_requests to service_role;

-- ---------------------------------------------------------------------------
-- 2. Le rendez-vous posé « en attente de confirmation »
-- ---------------------------------------------------------------------------
--
-- ⚠️ UNE COLONNE SUR `farm_visits` ET NON UNE TABLE NEUVE, parce qu'un
--    rendez-vous chez un agriculteur EST une visite : il apparaît déjà dans
--    l'agenda du PO (`getAgendaEvents`), il porte déjà la ferme, et le PO sait
--    déjà le déplacer. Une table parallèle aurait produit un second calendrier.
--
-- ⚠️ ET ELLE EST `default false`, donc les visites existantes ne changent pas.
alter table public.farm_visits
  add column if not exists pending_confirmation boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Les créneaux occupés, sans dire par qui
-- ---------------------------------------------------------------------------
--
-- ⚠️ `setof record` DE DEUX DATES. Tout le reste — le titre, la ferme,
--    l'identifiant, la note — reste de l'autre côté. Et la fenêtre est BORNÉE
--    en SQL : un appelant anonyme ne peut pas demander dix ans d'agenda pour
--    en déduire les habitudes de quelqu'un.
--
-- ★ TROIS SOURCES, LES MÊMES QUE `getAgendaEvents` : les gardes, les
--   rendez-vous généraux, les visites. Une source oubliée ici proposerait un
--   créneau déjà pris, ce qui est exactement ce que A258 refuse.

create or replace function public.public_busy_intervals(
  from_at timestamptz,
  to_at   timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  with window_bounds as (
    select
      greatest(from_at, now() - interval '1 day')              as lo,
      least(to_at, now() + interval '120 days')                as hi
  )
  select m.start_at, m.end_at
    from public.missions m, window_bounds w
   where m.start_at < w.hi and m.end_at > w.lo
     and m.status <> 'cancelled'
  union all
  select g.at, g.end_at
    from public.general_meetings g, window_bounds w
   where g.at < w.hi and g.end_at > w.lo
  union all
  -- ⚠️ UNE VISITE EST UN POINT : elle n'a pas de fin propre. On rend
  --    `at, at` et c'est le CLIENT qui lui donne sa durée, avec la même
  --    constante que le calendrier emploie pour la dessiner
  --    (`BUSY_MIN_MINUTES` ← `MIN_EVENT_MINUTES`, core/agenda.ts). Inventer
  --    ici une durée en SQL en ferait une seconde définition.
  select v.at, v.at
    from public.farm_visits v, window_bounds w
   where v.at < w.hi and v.at > w.lo - interval '1 day'
     and v.done = false
$$;

revoke all on function public.public_busy_intervals(timestamptz, timestamptz) from public;
grant execute on function public.public_busy_intervals(timestamptz, timestamptz) to anon;
grant execute on function public.public_busy_intervals(timestamptz, timestamptz) to authenticated;
grant execute on function public.public_busy_intervals(timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Le texte de l'accord — UNE SEULE SOURCE (AH5, repris par AP3.5)
-- ---------------------------------------------------------------------------
--
--   « Le même texte que “הסכם התנדבות- ארצנו”, lu du gabarit modifiable des
--     réglages — une seule source, comme en AH5. »
--
-- ⚠️ LE GABARIT VIT DANS `user_settings.data` SOUS SA CLÉ DE `localStorage`
--    (`ui/settings/sync.ts`). La page publique ne peut pas lire `user_settings`
--    — et ne doit pas : cette table porte aussi le point de départ des
--    tournées, les régions redessinées et l'identité du coordinateur. Cette
--    fonction n'en extrait QUE la clé du gabarit, et rien d'autre.
--
-- ⚠️ ELLE PEUT RENDRE `null`, ET C'EST UNE RÉPONSE. Tant que le PO n'a pas
--    modifié le gabarit, il n'y a pas de surcharge en base : la page emploie
--    alors le texte LIVRÉ, qui est le même que celui de l'application puisque
--    les deux builds sortent du même dépôt.

create or replace function public.public_agreement_template()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select s.data ->> 'lo-yanum:agreement-doc-template'
    from public.user_settings s
   where s.data ? 'lo-yanum:agreement-doc-template'
   order by s.updated_at desc
   limit 1
$$;

revoke all on function public.public_agreement_template() from public;
grant execute on function public.public_agreement_template() to anon;
grant execute on function public.public_agreement_template() to authenticated;
grant execute on function public.public_agreement_template() to service_role;

-- ---------------------------------------------------------------------------
-- 5. Déposer une demande
-- ---------------------------------------------------------------------------
--
-- ⚠️ TOUT EST REVÉRIFIÉ ICI. `core/request.ts` fait les mêmes contrôles côté
--    navigateur pour GRISER un bouton et DIRE pourquoi ; ceux-ci sont ce qui
--    PROTÈGE. Un appel fabriqué avec `curl` ne passe par aucun des premiers.
--
-- ⚠️ ET LES DEUX PLAFONDS SONT ÉCRITS DES DEUX CÔTÉS. 8 Mio par document,
--    deux documents : les mêmes nombres que `MAX_DOCUMENT_BYTES` et
--    `MAX_DOCUMENTS` dans `core/request.ts`. `bun run appass` compare les
--    chaînes plutôt que de faire confiance à ce commentaire.

create or replace function public.submit_aid_request(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- ⚠️ CES QUATRE NOMBRES SONT LA MOITIÉ SERVEUR D'UN COUPLE. L'autre moitié
  --    est dans `src/core/request.ts` ; une porte compare.
  max_document_bytes constant bigint := 8388608;   -- MAX_DOCUMENT_BYTES
  max_documents      constant int    := 2;         -- MAX_DOCUMENTS
  max_signature_bytes constant bigint := 2097152;  -- une signature au doigt
  -- Le garde-fou de débit : trois demandes par numéro et par jour.
  max_per_phone_day  constant int    := 3;
  -- Le repli de position : la fiche naît SANS épingle (AN décision 1).
  negev_lat constant double precision := 31.27;    -- NEGEV_CENTER
  negev_lng constant double precision := 34.79;

  v_need       text := nullif(trim(payload ->> 'need'), '');
  v_land       text := nullif(trim(payload ->> 'landKind'), '');
  v_farm_name  text := nullif(trim(payload ->> 'farmName'), '');
  v_full_name  text := nullif(trim(payload ->> 'fullName'), '');
  v_id_number  text := coalesce(trim(payload ->> 'idNumber'), '');
  v_phone      text := nullif(trim(payload ->> 'phone'), '');
  v_email      text := coalesce(trim(payload ->> 'email'), '');
  v_locality   text := coalesce(trim(payload ->> 'locality'), '');
  v_signature  text := nullif(payload ->> 'signature', '');
  v_appt       timestamptz := nullif(payload ->> 'appointmentAt', '')::timestamptz;
  v_appt_end   timestamptz := nullif(payload ->> 'appointmentEndAt', '')::timestamptz;
  v_documents  jsonb := coalesce(payload -> 'documents', '[]'::jsonb);

  v_doc        jsonb;
  v_farm_type  text;
  v_entity_id  text;
  v_reference  text;
  v_request_id uuid;
  v_recent     int;
  v_overlap    int;
  v_notes      text;
begin
  -- --- ce qui bloque ------------------------------------------------------
  if v_need is null or v_need not in ('guarding', 'farm_work', 'both') then
    raise exception 'need' using errcode = 'check_violation';
  end if;
  if v_land is null or v_land not in ('crops', 'grazing', 'both') then
    raise exception 'landKind' using errcode = 'check_violation';
  end if;
  if v_farm_name is null or length(v_farm_name) > 200 then
    raise exception 'farmName' using errcode = 'check_violation';
  end if;
  if v_full_name is null or length(v_full_name) > 200 then
    raise exception 'fullName' using errcode = 'check_violation';
  end if;
  -- Le même test que `phoneIsPossible` : 9 ou 10 chiffres commençant par 0.
  if v_phone is null
     or regexp_replace(regexp_replace(v_phone, '\D', '', 'g'), '^972', '0')
        !~ '^0[2-9]\d{7,8}$' then
    raise exception 'phone' using errcode = 'check_violation';
  end if;
  -- ⚠️ LE COURRIEL N'EST REPROCHÉ QUE S'IL A ÉTÉ TAPÉ. Vide, il est valide —
  --    le brief le dit facultatif et A253 le mesure.
  if v_email <> '' and v_email !~ '^[^\s@]+@[^\s@.]+\.[^\s@]+$' then
    raise exception 'email' using errcode = 'check_violation';
  end if;
  if length(v_id_number) > 20 or length(v_locality) > 200 then
    raise exception 'fields' using errcode = 'check_violation';
  end if;

  -- --- les fichiers (AP4.4) ----------------------------------------------
  if jsonb_typeof(v_documents) <> 'array'
     or jsonb_array_length(v_documents) > max_documents then
    raise exception 'documents' using errcode = 'check_violation';
  end if;
  for v_doc in select * from jsonb_array_elements(v_documents) loop
    if (v_doc ->> 'id') not in ('crops', 'grazing') then
      raise exception 'documentId' using errcode = 'check_violation';
    end if;
    -- LE TYPE : rien d'autre qu'un PDF n'entre.
    if coalesce(v_doc ->> 'file', '') !~ '^data:application/pdf;base64,' then
      raise exception 'documentType' using errcode = 'check_violation';
    end if;
    -- LA TAILLE, mesurée sur la chaîne reçue et non sur ce qu'elle annonce.
    if octet_length(v_doc ->> 'file') > max_document_bytes then
      raise exception 'documentSize' using errcode = 'check_violation';
    end if;
  end loop;
  if v_signature is not null then
    if v_signature !~ '^data:image/png;base64,'
       or octet_length(v_signature) > max_signature_bytes then
      raise exception 'signature' using errcode = 'check_violation';
    end if;
  end if;

  -- --- le rendez-vous -----------------------------------------------------
  if v_appt is not null then
    -- Dans la fenêtre, et jamais un vendredi ni un samedi. Les jours de fête
    -- sont écartés côté client (`core/availability.ts`) : le calendrier
    -- hébraïque n'existe pas dans Postgres, et un créneau de fête qui
    -- passerait ici deviendrait une PROPOSITION que le PO décline — pas une
    -- écriture illégitime.
    if v_appt < now() or v_appt > now() + interval '120 days'
       or extract(dow from v_appt at time zone 'Asia/Jerusalem') in (5, 6) then
      raise exception 'appointment' using errcode = 'check_violation';
    end if;
    if v_appt_end is null or v_appt_end <= v_appt
       or v_appt_end > v_appt + interval '4 hours' then
      raise exception 'appointmentEnd' using errcode = 'check_violation';
    end if;
    -- Et il doit être encore libre AU MOMENT DE L'ÉCRITURE : entre l'instant
    -- où la page a listé les créneaux et celui-ci, le PO a pu poser autre
    -- chose. Sans ce contrôle, deux personnes prendraient le même créneau.
    select count(*) into v_overlap
      from public.public_busy_intervals(v_appt - interval '1 day', v_appt_end + interval '1 day') b
     where b.starts_at < v_appt_end
       and greatest(b.ends_at, b.starts_at + interval '45 minutes') > v_appt;
    if v_overlap > 0 then
      raise exception 'appointmentTaken' using errcode = 'check_violation';
    end if;
  end if;

  -- --- le débit -----------------------------------------------------------
  select count(*) into v_recent
    from public.aid_requests r
   where r.phone = v_phone
     and r.created_at > now() - interval '1 day';
  if v_recent >= max_per_phone_day then
    raise exception 'tooMany' using errcode = 'check_violation';
  end if;

  -- --- la fiche -----------------------------------------------------------
  v_farm_type := case v_land
                   when 'crops'   then 'agriculture'
                   when 'grazing' then 'livestock'
                   else 'mixed'
                 end;
  v_entity_id := 'farm-req-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v_reference := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  v_notes := 'בקשה שהתקבלה מהעמוד הציבורי · '
             || case v_need
                  when 'guarding'  then 'שמירה'
                  when 'farm_work' then 'עזרה בעבודה חקלאית'
                  else 'שמירה ועזרה בעבודה חקלאית'
                end
             || ' · אסמכתא ' || v_reference;

  insert into public.entities (
    id, name, locality, region, type, entity_kind, status,
    lat, lng, position_missing,
    farm_name, farmer_name, farmer_phone, farmer_email, farmer_id_no,
    notes, provided_documents, signature, signature_origin, signature_missing
  ) values (
    v_entity_id, v_farm_name, v_locality, '', v_farm_type::public.farm_type, 'farm',
    'incoming_request'::public.farm_status,
    -- ⚠️ SANS ÉPINGLE, ET C'EST LA DÉCISION AN N°1 : « une fiche sans position
    --    n'a pas de point ». Le repli en base n'est jamais affiché ; le PO
    --    posera l'épingle quand il saura où c'est. Déduire la position du
    --    יישוב donnerait au champ de l'agriculteur le centre de son village,
    --    c'est-à-dire un point que personne n'a choisi.
    negev_lat, negev_lng, true,
    v_farm_name, v_full_name, v_phone, nullif(v_email, ''), nullif(v_id_number, ''),
    v_notes,
    -- ⚠️ `providedAt` EST AJOUTÉ ICI ET NON ENVOYÉ PAR LA PAGE. C'est l'heure
    --    du SERVEUR : la date de dépôt d'un document n'a pas à dépendre de
    --    l'horloge d'un téléphone, qui peut être fausse de trois jours.
    case when jsonb_array_length(v_documents) > 0
         then (select jsonb_agg(d || jsonb_build_object('providedAt', now()))
                 from jsonb_array_elements(v_documents) d)
         else null end,
    v_signature,
    case when v_signature is null then null
         else jsonb_build_object('kind', 'app', 'signedAt', now())::text end,
    -- ⚠️ `signature_missing` RESTE FAUX. Il veut dire « une ligne SIGNÉE est
    --    arrivée et sa case de signature était illisible » (AA5.3) — pas
    --    « personne n'a signé ». Une demande sans signature n'a rien qui
    --    manque : elle n'est pas signée, c'est tout.
    false
  );

  insert into public.aid_requests (
    need, land_kind, farm_name, full_name, id_number, phone, email, locality,
    documents, signature, signed_at, appointment_at, appointment_end_at,
    entity_id, reference
  ) values (
    v_need, v_land, v_farm_name, v_full_name, v_id_number, v_phone, v_email, v_locality,
    v_documents, v_signature,
    case when v_signature is null then null else now() end,
    v_appt, v_appt_end, v_entity_id, v_reference
  )
  returning id into v_request_id;

  -- --- le rendez-vous dans l'agenda du PO ---------------------------------
  if v_appt is not null then
    insert into public.farm_visits (id, entity_id, at, note, done, pending_confirmation)
    values (
      'visit-req-' || substr(replace(v_request_id::text, '-', ''), 1, 10),
      v_entity_id, v_appt,
      'מועד שביקש החקלאי דרך העמוד הציבורי — ממתין לאישור',
      false, true
    );
  end if;

  -- ⚠️ CE QUI REVIENT NE PORTE QUE LA RÉFÉRENCE. Pas l'identifiant de la
  --    fiche, pas celui de la demande : un appelant anonyme n'a aucune raison
  --    de repartir avec une clé qui désigne une ligne.
  return jsonb_build_object('ok', true, 'reference', v_reference);
end;
$$;

revoke all on function public.submit_aid_request(jsonb) from public;
grant execute on function public.submit_aid_request(jsonb) to anon;
grant execute on function public.submit_aid_request(jsonb) to authenticated;
grant execute on function public.submit_aid_request(jsonb) to service_role;
