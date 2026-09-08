-- ===========================================================================
-- AF1 · AF3 · AF4 — LA CASE QUI MANQUAIT SUR L'HÔTE DU DOCUMENT, LE LIEU QUI
--                   N'EST PAS ENCORE UNE FERME, ET L'HEURE QU'ON VEUT QU'ON
--                   NOUS RAPPELLE.
-- ===========================================================================
--
-- Trois ajouts, tous ADDITIFS : aucune colonne supprimée, aucune politique
-- modifiée, aucune contrainte neuve. Un client plus ancien lit et écrit
-- `entities`, `general_meetings` et `farm_visits` exactement comme avant.
--
-- ★ AF1 — `entities.farmer_id_no`
--
--   « הסכם התנדבות- ארצנו » porte quatre cases en tête : מקום התנדבות, שם
--   החקלאי, תז/חפ, נייד. Trois étaient déjà sur la fiche depuis AA2 ; la
--   quatrième n'existait nulle part, et c'est pour cela que le PDF sortait
--   avec un trou que le PO remplissait à la main devant l'agriculteur.
--
--   ⚠️ `text` ET NON UN NOMBRE, ET LE NOM DE COLONNE N'EST PAS `farmer_id`.
--      Deux raisons distinctes :
--        · un particulier écrit un ת״ז de neuf chiffres avec son zéro de tête,
--          une société agricole un ח״פ, un קיבוץ le numéro de son אגודה — un
--          `bigint` perdrait le zéro et refuserait les deux autres ;
--        · `farmer_id` se lirait comme une clé étrangère vers une table de
--          personnes qui n'existe pas, dans un schéma où `entity_id`,
--          `volunteer_id` et `driver_id` en sont toutes. `_no` dit « numéro ».
--
-- ★ AF3 — `general_meetings.lat` / `.lng`
--
--   « Le PO reçoit des localisations par WhatsApp de fermes qui ne sont pas
--   encore dans la base. » Une réunion générale n'a pas de ferme — c'est déjà
--   sa forme depuis G6 — mais son `location` est du TEXTE, résolu à la lecture
--   par le gazetteer. Un point collé depuis Waze n'est pas dans le gazetteer :
--   c'est une parcelle au bout d'un chemin. Les deux colonnes portent ce point
--   TEL QUEL.
--
--   ⚠️ NULLABLE, ET `null` EST UNE VRAIE RÉPONSE. C'est AB3.4 : une entrée dont
--      personne ne connaît le lieu reste dans la LISTE, marquée מיקום חסר, et
--      n'est pas dessinée. Un repli sur le centroïde d'une localité mettrait
--      une épingle numérotée à un endroit où le coordinateur n'a jamais accepté
--      de se rendre — et une épingle se lit comme un fait.
--
-- ★ AF4.2 — `remind_minutes` sur les deux tables de rendez-vous
--
--   Combien de minutes AVANT le rendez-vous le coordinateur veut être prévenu.
--   `null` = aucune alerte, ce qui est différent de `0` (« au moment même »).
--
--   ⚠️ ET CETTE COLONNE NE DÉCLENCHE RIEN CÔTÉ SERVEUR, C'EST DIT ICI PARCE
--      QUE C'EST LÀ QU'ON VIENDRA LE CHERCHER. Il n'y a pas de tâche
--      planifiée, pas de clé Web Push, pas de fonction de bord dans ce
--      programme. Ce que l'app fait de cette valeur est décrit dans
--      `src/ui/reminders.ts` : une notification quand elle est ouverte, et un
--      fichier .ics qui pose l'alarme dans l'agenda DE L'APPAREIL — la seule
--      voie qui réveille un iPad dont l'app est fermée. Le jour où un envoi
--      serveur existe (P3.3bis), il lira cette colonne et rien d'autre ne
--      changera.
-- ===========================================================================

-- ⚠️ UNE INSTRUCTION PAR COLONNE — le lecteur de schéma de `bun run mapping`
--    analyse `alter table … add column` une colonne à la fois.
alter table entities add column if not exists farmer_id_no text;

alter table general_meetings add column if not exists lat double precision;
alter table general_meetings add column if not exists lng double precision;
alter table general_meetings add column if not exists remind_minutes integer;

alter table farm_visits add column if not exists remind_minutes integer;
