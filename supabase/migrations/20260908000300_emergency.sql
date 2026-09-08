-- ===========================================================================
-- AE2 · AE3 — LES NUMÉROS QUI ARRIVENT LES PREMIERS, LA FICHE DU SITE,
--             ET LES SIGNES DE VIE DE LA NUIT.
-- ===========================================================================
--
-- Passe de SÉCURITÉ. Tout ce qui suit existe pour un cas et un seul : un
-- volontaire de dix-huit ans, seul, dans un champ sans éclairage, à trois
-- heures du matin. Ce que la base doit retenir de ce cas se range en deux
-- moitiés.
--
-- ★ MOITIÉ 1 — SIX COLONNES SUR `entities`, TOUTES DU TEXTE LIBRE.
--
--   Deux numéros et quatre champs de תיק אתר. Ils sont sur l'exploitation
--   parce que c'est là que le coordinateur les saisit — la fiche qu'il a sous
--   les yeux quand l'agriculteur les lui dicte au téléphone.
--
--   ⚠️ `council_hotline` N'EST PAS `council_phone`, ET LES CONFONDRE COÛTE UNE
--      INTERVENTION. `council_phone` existe depuis AA4 et c'est la
--      STANDARDISTE de la מועצה — le classeur de l'association le dit en
--      toutes lettres, et à neuf heures du soir elle ne répond pas. Le מוקד
--      est la permanence de nuit, et c'est elle qui réveille la כיתת כוננות.
--
--   ⚠️ ET IL N'Y A PAS DE TABLE DES LOCALITÉS, C'EST UNE DÉCISION.
--      Une כיתת כוננות appartient au יישוב et non à l'exploitation : dans בארי
--      il y a quatre exploitations (AC1) et une seule équipe. La résolution
--      est faite en lecture par `localEmergencyNumbers` (src/core/emergency.ts)
--      — la fiche d'abord, puis les autres fiches du même יישוב — ce qui donne
--      « un champ sur la localité » sans donner au programme une seconde
--      source de vérité pour un numéro de téléphone, ni un écran d'édition que
--      personne n'ouvrirait au moment où le numéro est dicté.
--
-- ★ MOITIÉ 2 — UNE TABLE ENFANT `mission_checkpoints`.
--
--   Un horodatage par « tout va bien » posé pendant la garde. Une LIGNE par
--   signe et non une colonne « dernier signe » : la colonne répondrait à
--   « depuis quand est-il silencieux » et à rien d'autre, alors que la
--   question du matin est « combien de fois a-t-il donné signe » et celle du
--   mois « est-ce que ce dispositif sert ». Les deux sont des questions sur
--   des lignes.
--
-- ADDITIF : aucune colonne supprimée, aucune politique existante modifiée. Un
-- client plus ancien lit et écrit `entities` et `missions` exactement comme
-- avant.
-- ===========================================================================

-- ⚠️ UNE INSTRUCTION PAR COLONNE — le lecteur de schéma de `bun run mapping`
--    analyse `alter table … add column` une colonne à la fois.
alter table entities add column if not exists council_hotline text;
alter table entities add column if not exists standby_phone text;
alter table entities add column if not exists site_access text;
alter table entities add column if not exists gate_code text;
alter table entities add column if not exists parking text;
alter table entities add column if not exists terrain_notes text;

-- ---------------------------------------------------------------------------
-- AE3.3 — les signes de vie
-- ---------------------------------------------------------------------------
--
-- ⚠️ LA CLÉ PRIMAIRE EST (mission_id, position) ET NON (mission_id, at).
--    Deux appuis dans la même seconde sont possibles — un volontaire qui doute
--    appuie deux fois, c'est le comportement que le brief décrit en AE2a.5 —
--    et une clé sur l'instant les refuserait, c'est-à-dire perdrait un signe
--    de vie pour cause de doublon. `position` est aussi ce qui porte l'ordre,
--    comme pour les quatre autres enfants de `missions`.
create table if not exists mission_checkpoints (
  mission_id  text not null references missions (id) on delete cascade,
  at          timestamptz not null,
  position    integer not null,
  primary key (mission_id, position)
);

create index if not exists mission_checkpoints_mission_idx
  on mission_checkpoints (mission_id);

alter table mission_checkpoints enable row level security;
alter table mission_checkpoints force row level security;

-- Le coordinateur voit et écrit tout, comme sur les 26 autres tables.
drop policy if exists mission_checkpoints_coordinator_all on mission_checkpoints;
create policy mission_checkpoints_coordinator_all on mission_checkpoints
  for all to authenticated
  using (is_coordinator()) with check (is_coordinator());

-- Le terrain lit les siennes, exactement comme `mission_assignments`.
drop policy if exists mission_checkpoints_field_read on mission_checkpoints;
create policy mission_checkpoints_field_read on mission_checkpoints
  for select to authenticated
  using (mission_id in (select my_mission_ids()));

-- ★★ ET LE PORTEUR DU TÉLÉPHONE DE GROUPE PEUT EN AJOUTER.
--
--    C'est la seule écriture neuve de cette migration, et elle est étroite
--    exprès : INSERT seulement, sur SA garde, et seulement s'il est le porteur
--    du téléphone de groupe — la même personne qui confirme déjà l'arrivée et
--    la fin. Pas d'UPDATE et pas de DELETE : « il a signalé à 01:20 » est un
--    fait de la nuit, et une nuit dont on peut effacer les signes de vie est
--    une nuit dont le silence n'est plus une preuve de rien.
drop policy if exists mission_checkpoints_group_insert on mission_checkpoints;
create policy mission_checkpoints_group_insert on mission_checkpoints
  for insert to authenticated
  with check (
    app_role() = 'volunteer'
    and exists (
      select 1 from mission_assignments a
      where a.mission_id = mission_checkpoints.mission_id
        and a.volunteer_id = app_ref()
        and a.is_group_phone
    )
  );
