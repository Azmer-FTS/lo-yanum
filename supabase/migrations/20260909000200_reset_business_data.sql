-- ===========================================================================
-- AF8 — REMISE À ZÉRO DE `lo-yanum-prod`, ET ELLE EST RÉVERSIBLE.
-- ===========================================================================
--
-- « Le PO veut retrouver une application neuve, comme s'il l'ouvrait pour la
-- première fois. Tout ce qui existe aujourd'hui est du test. »
--
-- ★★ « RÉVERSIBLE » N'EST PAS UNE FIGURE DE STYLE ICI. Chaque table métier est
--    COPIÉE dans le schéma `archive` avant d'être vidée, avec l'horodatage de
--    l'opération dans le nom de la copie. Rien n'est perdu ; ce qui change est
--    ce que l'application voit. Le retour en arrière est un `insert … select`
--    par table, dans l'ordre inverse des dépendances, et il est écrit à la fin
--    de ce fichier plutôt que promis ailleurs.
--
-- ★★ CE QUI N'EST **PAS** TOUCHÉ, ET POURQUOI LA LISTE EST COURTE.
--
--    · `app_users` — le compte du PO et son rôle. C'est la seule table de ce
--      schéma qui ne soit pas une donnée de terrain.
--    · `auth.users` — l'identité elle-même. Aucune ligne de ce fichier ne la
--      regarde.
--    · ⚠️ SES RÉGLAGES, SES RÉGIONS ET SES GABARITS NE SONT PAS EN BASE, et
--      c'est pour cela qu'ils survivent sans qu'on ait à les épargner :
--      l'objectif (AB5a), le seuil d'oubli (AC4.5), les délais de veille (AE3),
--      le point de départ, l'adresse des rapports, les tracés de régions
--      retouchés (`settings/regionEdits.ts`) et les deux gabarits — SMS (AE4)
--      et הצהרה (AF1.4) — vivent dans le `localStorage` de SON appareil. Une
--      remise à zéro de la base ne peut pas les atteindre, et la seule chose
--      qui les effacerait serait de vider les données du site dans son
--      navigateur. C'est écrit ici parce que c'est ici qu'on viendra le
--      vérifier.
--
--    · Le JUMEAU de démonstration n'a pas de base du tout : ses fermes, ses
--      volontaires et ses gardes sont des fixtures compilées dans le paquet
--      (`src/core/mock/`). Il garde donc ses données par construction, ce que
--      le point 3 du brief demande, et aucune ligne de SQL n'y est pour quelque
--      chose.
--
-- ⚠️ L'ORDRE SUIT LES CLÉS ÉTRANGÈRES, ENFANTS D'ABORD. Les `on delete cascade`
--    feraient le travail, mais compter dessus veut dire ne pas savoir combien
--    de lignes ont disparu par table — et le brief demande précisément ce
--    chiffre.
-- ===========================================================================

create schema if not exists archive;

do $$
declare
  t text;
  stamp text := to_char(now(), 'YYYYMMDD_HH24MI');
  /**
   * ⚠️ L'ORDRE EST CELUI DES CLÉS ÉTRANGÈRES ET LA PREMIÈRE VERSION L'AVAIT
   *    FAUX — DE DEUX FAÇONS QUE SEULE LA BASE RÉELLE POUVAIT DIRE.
   *
   *    `missions.guard_post_id` référence `guard_posts` : vider les points
   *    d'ancrage avant les gardes a été REFUSÉ par la base (23503), et c'est
   *    exactement ce qu'on attend d'elle. Même chose pour `incidents.mission_id`,
   *    qui oblige à vider les incidents AVANT les gardes.
   *
   *    ★ ET LE REFUS N'A RIEN CASSÉ : le bloc entier est une transaction, donc
   *      la première tentative a été annulée en totalité — ni archive, ni
   *      suppression. Vérifié : zéro table dans `archive` après l'échec.
   */
  tables text[] := array[
    -- 1. les enfants purs
    'zone_vertices', 'threat_zone_vertices', 'incident_entries',
    'mission_driver_passengers', 'presence_marks', 'mission_assignments',
    'mission_drivers', 'mission_guard_posts', 'mission_checkpoints',
    'cancel_notices', 'tour_stops', 'entity_contacts', 'entity_commitments',
    'entity_livestock', 'agreements',
    -- 2. les incidents AVANT les gardes (incidents.mission_id)
    'incidents',
    -- 3. les gardes AVANT les points d'ancrage (missions.guard_post_id)
    'missions', 'guard_posts',
    -- 4. le reste des enfants d'`entities`
    'threat_vectors', 'threat_zones', 'zones', 'farm_visits',
    -- 5. ce qui ne dépend de rien
    'general_meetings', 'tours', 'volunteers', 'drivers',
    -- 6. et le parent de presque tout
    'entities'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create table if not exists archive.%I as table public.%I',
      t || '_' || stamp, t
    );
  end loop;

  foreach t in array tables loop
    execute format('delete from public.%I', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- LE RETOUR EN ARRIÈRE
-- ---------------------------------------------------------------------------
--
-- Remplacer <STAMP> par le suffixe des tables d'archive — visible avec
--   select table_name from information_schema.tables where table_schema = 'archive';
-- et rejouer dans l'ordre INVERSE, parents d'abord :
--
--   insert into public.entities         select * from archive.entities_<STAMP>;
--   insert into public.volunteers       select * from archive.volunteers_<STAMP>;
--   insert into public.drivers          select * from archive.drivers_<STAMP>;
--   insert into public.tours            select * from archive.tours_<STAMP>;
--   insert into public.general_meetings select * from archive.general_meetings_<STAMP>;
--   insert into public.farm_visits      select * from archive.farm_visits_<STAMP>;
--   insert into public.missions         select * from archive.missions_<STAMP>;
--   insert into public.incidents        select * from archive.incidents_<STAMP>;
--   insert into public.threat_vectors   select * from archive.threat_vectors_<STAMP>;
--   insert into public.threat_zones     select * from archive.threat_zones_<STAMP>;
--   insert into public.zones            select * from archive.zones_<STAMP>;
--   … puis les enfants, dans l'ordre du tableau ci-dessus lu à l'envers.
--
-- ⚠️ ET LES TABLES D'ARCHIVE N'ONT PAS DE RLS, CE QUI EST SANS CONSÉQUENCE ET
--    MÉRITE D'ÊTRE DIT. Le schéma `archive` n'est pas exposé par PostgREST —
--    il n'est pas dans le `search_path` de l'API — donc aucune requête du
--    client ne peut l'atteindre. Il est accessible au propriétaire de la base,
--    ce qui est exactement le niveau de privilège d'une restauration.
