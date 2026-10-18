-- ═══════════════════════════════════════════════════════════════════════════
-- BK (2026-10-18) — UN AGRÉGAT S'ÉCRIT EN UNE SEULE TRANSACTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Depuis A76, `src/data/write.ts` réécrivait un agrégat à sous-lignes en trois
-- requêtes : effacer ses sous-lignes, upsert du parent, insérer les
-- sous-lignes. Une panne entre les deux laissait le parent en base SANS ses
-- sous-lignes — une forme sans sommet, une ferme sans contacts ni accords —
-- et un autre appareil le relisait ainsi (mesuré :
-- docs/bk/ecriture-non-transactionnelle.md). Décision du PO : une transaction
-- côté base.
--
-- `write_aggregate` fait les trois pas dans UN appel, donc une transaction :
-- tout passe, ou rien. Même sémantique que l'ancien chemin PostgREST :
--   · les sous-lignes des parents écrits sont effacées, dans l'ordre INVERSE
--     de la liste (une sous-ligne peut en référencer une autre de la même
--     liste : `presence_marks` → `mission_assignments`) ;
--   · les parents : insert … on conflict (id) do update, sur les SEULES
--     colonnes envoyées (une colonne absente garde sa valeur, ou prend son
--     défaut à la création) ;
--   · les sous-lignes : insert, dans l'ordre de la liste ; une colonne absente
--     d'une ligne mais présente dans une autre vaut null (comme postgrest-js).
--
-- ★ SÉCURITÉ.
--   · SECURITY INVOKER : la RLS de l'utilisateur s'applique telle quelle,
--     requête par requête, exactement comme par PostgREST.
--   · search_path vide ; tout est qualifié.
--   · LISTE BLANCHE EN DUR des parents et de leurs sous-lignes, recopiée de
--     `MAPPINGS` (src/data/rows.ts) — toute autre table est refusée ; une
--     sous-ligne qui n'appartient pas aux parents écrits est refusée ; une
--     colonne qui n'existe pas est refusée (PostgREST la refusait aussi).
--   · identifiants dynamiques par format(%I) seulement ; les lignes passent
--     par jsonb_populate_recordset, jamais par du texte SQL.
--   · execute à `authenticated` seulement.
--
-- La suppression d'un agrégat entier (`delete … in ('id', …)` avec cascade)
-- est déjà une requête unique : elle ne passe pas par ici.

create or replace function public.write_aggregate(p_table text, p_rows jsonb, p_children jsonb default '{}'::jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_kids jsonb;
  v_ids text[];
  v_cols text[];
  v_list text;
  v_set text;
  v_rows jsonb;
  v_unknown text;
  i integer;
begin
  -- La liste blanche : parent → sous-lignes, dans l'ordre de `MAPPINGS`.
  v_kids := case p_table
    when 'entities' then '[{"t":"entity_contacts","fk":"entity_id"},{"t":"entity_commitments","fk":"entity_id"},{"t":"entity_livestock","fk":"entity_id"},{"t":"agreements","fk":"entity_id"}]'::jsonb
    when 'zones' then '[{"t":"zone_vertices","fk":"zone_id"}]'::jsonb
    when 'threat_zones' then '[{"t":"threat_zone_vertices","fk":"threat_zone_id"}]'::jsonb
    when 'missions' then '[{"t":"mission_guard_posts","fk":"mission_id"},{"t":"mission_assignments","fk":"mission_id"},{"t":"presence_marks","fk":"mission_id"},{"t":"mission_drivers","fk":"mission_id"},{"t":"mission_driver_passengers","fk":"mission_id"},{"t":"mission_checkpoints","fk":"mission_id"},{"t":"cancel_notices","fk":"mission_id"}]'::jsonb
    when 'incidents' then '[{"t":"incident_entries","fk":"incident_id"}]'::jsonb
    when 'tours' then '[{"t":"tour_stops","fk":"tour_id"}]'::jsonb
    else null
  end;
  if v_kids is null then
    raise exception 'write_aggregate: table refusée (%)', p_table using errcode = '22023';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' or pg_catalog.jsonb_array_length(p_rows) = 0 then
    raise exception 'write_aggregate: aucune ligne parente' using errcode = '22023';
  end if;
  p_children := coalesce(p_children, '{}'::jsonb);
  if pg_catalog.jsonb_typeof(p_children) <> 'object' then
    raise exception 'write_aggregate: sous-lignes mal formées' using errcode = '22023';
  end if;
  select k into v_unknown
    from pg_catalog.jsonb_object_keys(p_children) k
   where not exists (select 1 from pg_catalog.jsonb_array_elements(v_kids) c where c ->> 't' = k)
   limit 1;
  if v_unknown is not null then
    raise exception 'write_aggregate: sous-table refusée (%) pour %', v_unknown, p_table using errcode = '22023';
  end if;

  select pg_catalog.array_agg(r ->> 'id') into v_ids from pg_catalog.jsonb_array_elements(p_rows) r;
  if pg_catalog.array_position(v_ids, null) is not null then
    raise exception 'write_aggregate: une ligne parente sans id' using errcode = '22023';
  end if;

  -- 1. Effacer les sous-lignes, dans l'ordre inverse.
  for i in reverse pg_catalog.jsonb_array_length(v_kids) - 1 .. 0 loop
    execute pg_catalog.format('delete from public.%I where %I = any ($1)', v_kids -> i ->> 't', v_kids -> i ->> 'fk') using v_ids;
  end loop;

  -- 2. Les parents : les colonnes envoyées, et elles seules.
  select pg_catalog.array_agg(distinct k order by k) into v_cols
    from pg_catalog.jsonb_array_elements(p_rows) r, pg_catalog.jsonb_object_keys(r) k;
  select k into v_unknown from pg_catalog.unnest(v_cols) k
   where not exists (
     select 1 from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', p_table))
        and a.attname = k and a.attnum > 0 and not a.attisdropped)
   limit 1;
  if v_unknown is not null then
    raise exception 'write_aggregate: colonne inconnue %.%', p_table, v_unknown using errcode = '42703';
  end if;
  select pg_catalog.string_agg(pg_catalog.format('%I', k), ', ' order by k),
         pg_catalog.string_agg(pg_catalog.format('%I = excluded.%I', k, k), ', ' order by k) filter (where k <> 'id')
    into v_list, v_set
    from pg_catalog.unnest(v_cols) k;
  execute pg_catalog.format(
    'insert into public.%I (%s) select %s from pg_catalog.jsonb_populate_recordset(null::public.%I, $1) on conflict (id) do %s',
    p_table, v_list, v_list, p_table,
    case when v_set is null then 'nothing' else 'update set ' || v_set end
  ) using p_rows;

  -- 3. Les sous-lignes, dans l'ordre de la liste.
  for i in 0 .. pg_catalog.jsonb_array_length(v_kids) - 1 loop
    v_rows := p_children -> (v_kids -> i ->> 't');
    continue when v_rows is null or pg_catalog.jsonb_typeof(v_rows) <> 'array' or pg_catalog.jsonb_array_length(v_rows) = 0;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(v_rows) r
       where not ((r ->> (v_kids -> i ->> 'fk')) = any (v_ids))
          or (r ->> (v_kids -> i ->> 'fk')) is null
    ) then
      raise exception 'write_aggregate: une ligne de % n''appartient à aucun parent écrit', v_kids -> i ->> 't' using errcode = '22023';
    end if;
    select pg_catalog.array_agg(distinct k order by k) into v_cols
      from pg_catalog.jsonb_array_elements(v_rows) r, pg_catalog.jsonb_object_keys(r) k;
    select k into v_unknown from pg_catalog.unnest(v_cols) k
     where not exists (
       select 1 from pg_catalog.pg_attribute a
        where a.attrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', v_kids -> i ->> 't'))
          and a.attname = k and a.attnum > 0 and not a.attisdropped)
     limit 1;
    if v_unknown is not null then
      raise exception 'write_aggregate: colonne inconnue %.%', v_kids -> i ->> 't', v_unknown using errcode = '42703';
    end if;
    select pg_catalog.string_agg(pg_catalog.format('%I', k), ', ' order by k) into v_list from pg_catalog.unnest(v_cols) k;
    execute pg_catalog.format(
      'insert into public.%I (%s) select %s from pg_catalog.jsonb_populate_recordset(null::public.%I, $1)',
      v_kids -> i ->> 't', v_list, v_list, v_kids -> i ->> 't'
    ) using v_rows;
  end loop;
end
$$;

revoke all on function public.write_aggregate(text, jsonb, jsonb) from public;
revoke all on function public.write_aggregate(text, jsonb, jsonb) from anon;
grant execute on function public.write_aggregate(text, jsonb, jsonb) to authenticated;
