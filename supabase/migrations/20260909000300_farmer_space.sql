-- ===========================================================================
-- AG4 · AG6 — CE QUE L'AGRICULTEUR RENVOIE DEPUIS SON TÉLÉPHONE.
-- ===========================================================================
--
-- Deux colonnes, toutes deux ADDITIVES et toutes deux NULLABLES : aucune
-- colonne supprimée, aucune politique modifiée, aucune contrainte neuve. Un
-- client plus ancien lit et écrit `entities` exactement comme avant.
--
-- ★ AG6 — `entities.provided_documents`
--
--   « L'agriculteur téléverse un PDF, ou PHOTOGRAPHIE ses papiers et l'app en
--     compose un PDF — plusieurs pages possibles. Le coordinateur voit ce qui
--     est fourni et ce qui manque. »
--
--   ⚠️ CE QUI EST **ATTENDU** N'EST PAS EN BASE, ET C'EST LA DÉCISION QUI TIENT
--      TOUT LE BLOC. La liste attendue se DÉDUIT du סוג פעילות de la fiche
--      (`core/documents.ts`) : pâturage seul → un, cultures seules → un, les
--      deux → deux. Une table `expected_documents` aurait été une seconde
--      vérité à tenir d'accord avec `entities.type`, et le jour où les deux
--      auraient divergé c'est l'agriculteur qui aurait téléversé le mauvais
--      papier. Cette colonne ne porte donc QUE ce qui est ARRIVÉ.
--
--   ⚠️ `jsonb` ET NON UNE TABLE FILLE, CE QUI EST INHABITUEL DANS CE SCHÉMA —
--      `entity_contacts`, `entity_commitments` et `agreements` sont toutes des
--      tables filles. La raison est le NOMBRE : il y a au plus DEUX documents
--      par exploitation, jamais trois, parce que la liste attendue en compte
--      au plus deux et qu'un document remplace celui du même genre (voir
--      `attachProvidedDocument`). Une table fille pour un tableau borné à deux
--      éléments coûterait une jointure de plus dans les 25 selects de
--      l'hydratation pour rien. `signature_origin` est déjà rangé ainsi, et la
--      note de rows.ts explique le même arbitrage.
--
--   ⚠️ ET LE PDF EST DEDANS, EN URL DE DONNÉES. C'est le même choix que la
--      photo (`entities.photo`) et que la signature (`agreements.signature`) :
--      ce programme n'a pas de chemin d'écriture vers le stockage d'objets
--      depuis un appareil qui n'est pas authentifié, et un agriculteur ne
--      l'est pas. Le coût est dit : un scan de trois pages fait 300 à 600 ko
--      de base64 dans une ligne. Le jour où une fonction de bord accepte un
--      téléversement signé par jeton, cette colonne devient une clé d'objet et
--      RIEN d'autre dans l'application ne change — `ProvidedDocument.file` est
--      déjà une chaîne opaque partout où elle est lue.
--
-- ★ AG4 — `entities.id_photo`
--
--   « photo de la carte d'identité (FACULTATIVE par défaut, rendue obligatoire
--     par un réglage que le PO active s'il le décide plus tard) »
--
--   ⚠️ ELLE N'EST PAS UN `provided_document`, ET LA DISTINCTION N'EST PAS
--      ADMINISTRATIVE : les documents fournis sont une liste ATTENDUE dont
--      l'absence met la fiche dans une file, celle-ci est une annexe de la
--      SIGNATURE qui ne manque jamais. Les confondre ferait apparaître « il
--      manque un document » sur toutes les fermes d'un programme qui n'a
--      jamais demandé de carte.
--
--   ⛔ ET RIEN NE LA LIT AUTOMATIQUEMENT. Pas d'OCR, pas de MRZ — décision
--      explicite du PO (AG4.3). Le numéro est dans `farmer_id_no`, tapé par
--      quelqu'un. Une colonne d'image à côté d'une colonne de numéro invite à
--      « déduire » l'une de l'autre ; cette ligne est là pour que la prochaine
--      personne qui y pense trouve la réponse avant d'écrire le code.

-- ⚠️ UNE COLONNE PAR INSTRUCTION, ET SANS PRÉFIXE DE SCHÉMA. Ce n'est pas une
--    préférence de style : `bun run mapping` lit CES fichiers pour vérifier que
--    chaque colonne écrite par le mappeur existe, et son analyseur lit
--    `alter table <table> add column …` une colonne à la fois. La forme
--    condensée `alter table public.entities add column a, add column b;` est du
--    SQL parfaitement valide que cette porte ne voit pas — et une colonne
--    qu'elle ne voit pas est une colonne qu'elle DÉCLARE MANQUANTE. La première
--    version de ce fichier l'a écrite ainsi et la porte a échoué, ce qui est
--    exactement le travail qu'on lui demande.
alter table entities add column if not exists provided_documents jsonb;
alter table entities add column if not exists id_photo text;

comment on column entities.provided_documents is
  'AG6 - les documents effectivement fournis, au plus deux. Ce qui est ATTENDU se deduit de type (core/documents.ts) et n est jamais stocke.';

comment on column entities.id_photo is
  'AG4 - photo de la carte d identite du signataire, facultative. Aucune lecture automatique (pas d OCR) : le numero est dans farmer_id_no.';
