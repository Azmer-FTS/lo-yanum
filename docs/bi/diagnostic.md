# BI — pourquoi l'ordinateur ne dessinait pas les formes (2026-10-15)

## La réponse

**Ce qui diffère entre l'iPad et l'ordinateur : un réglage stocké sur
l'appareil, `lo-yanum:map-layers` — les cases « גבולות יישויות » et « שטחי
מרעה » de la légende de la carte.** Il vit dans le `localStorage` de chaque
appareil, il ne voyageait pas avec le compte, et `MapCanvas` retire de la carte
toute forme dont la case est décochée, **sans rien dire** : la légende est
repliée par défaut (« מקרא 9/11 »), et la pastille d'AU1 (« N חוות מוסתרות
במקרא ») ne comptait que les fermes, pas les formes.

Les formes étaient donc **en mémoire** sur l'ordinateur (les 77 sommets reçus
toutes les 3 minutes, comme l'iPad), **mais jamais données à la carte**.

## Ce qui l'établit — reproduit, pas supposé

Banc : le **bundle déployé** (`9575112`, celui que l'ordinateur exécute), le
service worker installé et aux commandes après un rechargement complet, Chrome
de bureau à la souris en 1 440 × 900, la base (factice) portant la ferme du
banc avec deux formes de **31 et 29 sommets**, comme farm-ak1-11.

| état de l'appareil (un seul change à la fois) | anneaux dessinés |
|---|---|
| neuf, défauts | 2 (31, 29) |
| thème sombre (le choix du compte) | 2 |
| thème absent + compte sombre | 2 |
| fond satellite | 2 |
| carte en plein écran | 2 |
| 1 920 px | 2 |
| **`map-layers` : contours et pâturages décochés** | **0 — et rien à l'écran** |

(`scripts/biexplore.ts`, puis `biui` A504 rejoué sur le déployé AVANT tout
correctif : `private/bi/logs/biui-A504-deploye-9575112-AVANT.log` — chargement
initial `source {} · rendu []`, après rechargement complet sous service worker
`source {} · rendu []`, écran des fermes `source {} · rendu []`.)

**Ce que je ne peux pas prouver d'ici** : que l'ordinateur du PO porte bien ces
deux cases décochées — je n'ai pas accès à son `localStorage`. C'est le seul
état, parmi tous ceux qui diffèrent d'un appareil à l'autre, qui reproduit le
symptôme exact ; et ce même ordinateur avait déjà eu le même symptôme pour les
épingles en AU1 (« ישויות » décoché : « aucune épingle sur l'ordinateur, elles
sont là sur le téléphone »). Depuis BI, l'appareil le **dit lui-même** : au
premier démarrage de la nouvelle version, s'il avait ces cases décochées, il les
rallume et l'inscrit (`lo-yanum:map-layers-bi`) ; le panneau de diagnostic
l'imprime à la ligne « הדלקה מחדש (BI) ».

## Les cinq états, un par un

**a) La version réellement exécutée.** Les journaux du serveur montrent
l'ordinateur lire `farm_institution_links` depuis le 14.10 à 17:40 UTC : il
exécute au moins le code de BG. Les navigations sont servies réseau d'abord
par `sw.js` (le HTML n'est jamais pris dans le cache), donc un rechargement
complet prend le bundle servi. Surtout : **le bundle déployé le plus récent
reproduit le bug** avec le réglage ci-dessous, et dessine les deux formes sans
lui. Un vieux bundle n'est pas la cause. Le panneau imprime désormais les deux
versions côte à côte.

**b) Les réglages stockés par appareil — LA CAUSE.** Passés en revue :
`map-layers` (les couches), `map-base` (fond), `theme:coordinator`,
`map-mode:<écran>`, `map-ratio`, `farm-tab:<fiche>`, `block:map-legend`,
`view-as`. Seul `map-layers` décide de ce qui est dessiné. Il avait le motif du
thème de BC : local (`LOCAL_ONLY_KEYS`), sans instant, et un commentaire de
BD 4 qui affirmait le contraire (« synchronisé avec le compte »).

**c) Le rôle, l'écran, le composant.** Même compte, même rôle
(coordinateur). La fiche de ferme dessine ses formes par le MÊME composant sur
les deux appareils (`AnchorMap` → `MapView` → `MapCanvas`), à 1 440 en `split`
comme à 1 032 ; l'écran des fermes par `MapCanvas` aussi. Aucun chemin
d'affichage propre à l'ordinateur.

**d) L'ordre des couches.** `zones-fill` / `zones-line` sont ajoutées après
les lavis des régions et au-dessus du fond, en vecteur comme en satellite, en
clair comme en sombre : le moteur les REND (`queryRenderedFeatures`) dans tous
ces cas. Pas une forme cachée sous une autre.

**e) Le filtre.** Entre la mémoire et le pixel, il n'y a qu'un filtre : celui
des couches (`MapCanvas`, `polygons`). Aucun filtre de zoom, de sélection ni
de mode sur les formes ; l'écran des fermes ne dessine que les fermes non
archivées (farm-ak1-11 ne l'est pas). C'est donc le b).

## Ce qui change (la règle : par défaut, on montre)

1. **Lecture du réglage** (`mapLayers.ts`, `parseMapLayers`) : absent,
   illisible, d'une forme inconnue, non booléen → le défaut, et le défaut des
   formes est « montrées ».
2. **Une valeur d'avant BI** (sans `__v`) : ses couches de FORMES sont
   rallumées une fois, au démarrage, avant la synchronisation (`main.tsx`) ;
   les autres couches restent ce que l'appareil avait choisi ; la trace est
   gardée pour le diagnostic.
3. **Le réglage voyage** avec le compte (`SYNCED_SETTING_KEYS`), « choisi
   seulement » comme le thème : une valeur sans instant n'éteint jamais l'autre
   appareil ; un choix fait depuis BI voyage.
4. **Une forme cachée par une couche se voit** : la pastille « N צורות מוסתרות
   במקרא · הצגה » sur la carte, et le geste qui les rend.
5. **Le panneau de diagnostic** (הגדרות › אבחון המכשיר, ou « אבחון » au pied de
   la légende de toute carte) : version exécutée et servie, service worker,
   dernière relecture réussie, formes et sommets en mémoire, formes de la fiche
   ouverte, ce que la carte a reçu, couches éteintes, réactivation de BI, fond,
   thème, « voir comme » — et une phrase qui nomme la première étape qui casse.
   « העתקה » copie le tout.

## Ce que le PO peut relever, en une manipulation

Sur l'ordinateur, une fois la nouvelle version chargée : ouvrir la fiche de la
ferme, toucher « מקרא » en bas de la carte, puis « אבחון », puis « העתקה », et
coller le texte dans un message. (C'est exactement le parcours de `biui` A508.)
La ligne « הדלקה מחדש (BI) » dit si cet ordinateur avait les formes éteintes ;
la ligne « מסקנה » dit, sinon, où le chemin casse.
