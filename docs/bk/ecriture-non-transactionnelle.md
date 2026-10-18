# L'écriture non transactionnelle d'une forme — mesure (BK, 2026-10-18)

> Une MESURE, pas un correctif. Rien de l'application, de `write.ts` ni de la
> base réelle n'a été touché ; aucune migration. Base FACTICE seulement.
> Le correctif est au choix du PO.

## D'où vient la question

Au rejeu de `bkeditui` sur le déployé `77d6658`, A557 au doigt est tombée
« section interrompue » (`dbRing(db, B)[0]` indéfini), puis 1 fois rouge sur 3
rejouée seule : le sondage de la porte lisait la base factice PENDANT
l'écriture d'un déplacement (✥). La fenêtre qu'il a vue est dans l'app :
`src/data/write.ts` (`writeCollection`, inchangé depuis A76, 2026-08-31)
réécrit un agrégat en TROIS requêtes, sans transaction :

1. `delete` de TOUS ses enfants (`zone_vertices` d'une forme) ;
2. `upsert` du parent (`zones`) ;
3. `insert` des enfants.

Entre 1 et 3, la forme est en base **sans un seul sommet**.

## Le banc

`scripts/bkecriture.ts` (build local `dist-bkedit`, `vite preview` 5508,
base factice de `scripts/fake-supabase.ts`). Une ferme d'essai porte une
limite à 12 sommets et un pâturage. La panne : une route Playwright posée
APRÈS la base factice (donc prioritaire) rend **500** aux `n` prochains
`POST zone_vertices` et laisse tout le reste passer par la base factice ;
chaque essai est compté. On relève à chaque étape : la base, la boîte d'envoi
et le cache (IndexedDB `lo-yanum`, magasins `outbox` et `aggregates`, clé
`farmZones/<id>`), l'anneau que la carte dessine (source `zones`). Résultat :
16 constats sur 16, journal ci-dessous ; captures `docs/screenshots/bk/ecriture/`.

## Les réponses

### 1. La boîte d'envoi garde-t-elle l'écriture ? La rejoue-t-elle ?

**Elle la garde. Elle ne la rejoue PAS d'elle-même** : il n'y a pas de minuterie
(choix écrit dans `store.ts` : « a timer would spend a farm track's worth of
battery »).

- Un geste (✥), l'insert rend 500 : base = forme présente, **0 sommet** ;
  boîte d'envoi = `[farmZones/zone-bk-boundary]` ; écran et cache : 12 sommets
  à la nouvelle position ; הגדרות dit « 1 שינויים ממתינים לסנכרון ».
- **30 s sans rien faire : 0 nouvel essai** ; la base reste vide.
- Un SECOND geste pendant l'attente **ne part pas** (l'ordre de la file) : il
  remplace l'entrée de la boîte (une entrée par forme), 0 nouvel essai.
- Déclencheurs mesurés : le **rechargement** (démarrage à froid : vider la
  boîte AVANT de relire), l'événement **`online`** (retour du réseau). D'après
  le code, aussi `refreshData` (tirer pour rafraîchir) et l'ouverture
  d'IndexedDB au démarrage — les deux passent par le même `load`.
- Essais au total sur le parcours Q1/Q2 : **3** — 500 (le geste) → 500 (le
  rechargement) → OK (`online`) ; la base porte alors **12 sommets à la
  DERNIÈRE position** (celle du second geste).
- **Onglet fermé puis rouvert** (même profil) : la boîte survit (IndexedDB) ; à
  la réouverture l'écriture part au premier essai : 12 sommets en base.

### 2. Sur le MÊME appareil, une relecture pendant l'attente

Rechargement dont le rejeu ÉCHOUE encore : la relecture lit la forme sans
sommet. **Elle n'écrase pas l'anneau local** : 12 sommets à l'écran, à la
dernière position exacte (Δlat 0) ; cache 12 sommets ; la boîte d'envoi garde
l'écriture. C'est voulu : `load` pose la boîte d'envoi PAR-DESSUS la réponse
du serveur (« outbox first »). La base, elle, reste vide.

### 3. Un SECOND profil qui relit pendant la fenêtre

- **Pas de plantage** (0 erreur de page).
- **La forme DISPARAÎT de sa carte** (source `zones` : absente) ; seul le
  pâturage reste (capture `q3-profil-b-pendant.png`).
- Sa liste des formes la montre encore : **« גבול החווה · 0 דונם »**.
- **Son propre cache est écrasé** : il avait 12 sommets avant la fenêtre, il en
  a **0** après sa relecture. Hors ligne ensuite, il garderait la forme vide.
- Une fois l'écriture rejouée par l'appareil A, B relit et **retrouve la forme
  ENTIÈRE**, à la position de A (capture `q3-profil-b-apres.png`).

### 4. Si l'appareil A ne revient jamais

A fait un geste en échec, puis son profil est détruit (boîte d'envoi perdue
avec lui). **La forme reste en base sans sommet**, et rien dans l'app ne la
répare : B relit et la voit absente de la carte, « 0 דונם » dans la liste ;
son cache n'a plus d'anneau pour elle. Elle reste ainsi tant que personne ne la redessine. (Aucun
autre appareil ne détient l'anneau : leurs caches suivent la base.)

Cas réels qui y mènent : l'iPad du PO perd le réseau entre la 1re et la 3e
requête puis l'app est supprimée, le stockage du site effacé, ou le compte
déconnecté (`clearLocalData` vide la boîte) avant un rejeu.

### Les zones de menace, et le reste

Même code, non mesuré ici : `threat_zones` a un enfant
(`threat_zone_vertices`) et passe par le même `writeCollection` — même
fenêtre, mêmes réponses. **Le schéma est le même pour TOUT agrégat qui a des
enfants** (`src/data/rows.ts`) : une ferme (`entity_contacts`,
`entity_commitments`, `entity_livestock`, `agreements`, …), une mission
(postes, affectations, présences, chauffeurs…), un événement
(`incident_entries`), une tournée (`tour_stops`). Une modification de la fiche
d'une ferme interrompue au mauvais moment laisserait la ferme sans ses
contacts ni ses accords en base, avec la même boîte d'envoi pour la réparer.

## Ce qui n'a pas été mesuré

- Ce que fait B s'il touche « ערוך » sur une forme à 0 sommet.
- Un 500 sur l'`upsert` du parent (le `delete` est déjà passé : même fenêtre).
- La base réelle (Postgres/RLS) : le banc est la base factice.

## Journal de la mesure

```
Q1 / Q2 — l'appareil qui écrit
  ouverture — base : 12 · écran : 12 · boîte : [] · cache : 12 · essais : 0
  UN geste (✥), l'insert rend 500 — base : 0 · écran : 12 · boîte : [farmZones/zone-bk-boundary] · cache : 12 · essais : 1 (1 en échec)
  30 s plus tard, sans rien faire — base : 0 · écran : 12 · boîte : [farmZones/…] · essais : 1
  un SECOND geste pendant l'attente — base : 0 · écran : 12 · boîte : [farmZones/…] · essais : 1
  הגדרות dit : « 1 שינויים ממתינים לסנכרון »
  rechargement, le rejeu échoue encore — base : 0 · écran : 12 (Δlat 0) · boîte : [farmZones/…] · cache : 12 · essais : 2 (2 en échec)
  événement « online » — base : 12 · écran : 12 · boîte : [] · essais : 3 (2 en échec) : 500 → 500 → OK
Q1 — l'onglet fermé, puis rouvert
  geste, insert en 500 — base : 0 · boîte : [farmZones/…] · essais : 1
  onglet rouvert (même profil) — base : 12 · boîte : [] · essais : 2 (1 en échec)
Q3 / Q4 — un second profil
  B avant — base : 12 · écran : 12 · cache : 12
  B relit PENDANT la fenêtre — base : 0 · écran : forme ABSENTE · cache : 0 ; liste : « גבול החווה 0 דונם »
  A a rejoué ; B relit — base : 12 · écran : 12 · cache : 12
  A : un geste en échec, puis A disparaît — base : 0
  B relit, A ne revient pas — écran : forme ABSENTE · cache : — · base : forme présente, 0 sommet
16 PASS, 0 FAIL
```
