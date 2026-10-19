# BL — 3.2 : couper les régions à une frontière terrestre

> ★★ **DÉCISION DU PO (2026-10-19) : « Applique l'option A : le sud, plus la
> Jordanie le long du Jourdain, la Syrie, le Liban et Gaza ; la Judée-Samarie
> et le Golan restent dedans. » — APPLIQUÉE** (voir « L'application », en bas).
>
> Ce qui suit, jusqu'à « L'application », est la proposition telle qu'elle a
> été présentée AVANT la décision.

## Le jeu de données : celui que la carte charge déjà

- **Source** : l'archive de la carte (`basemap/israel-20260831-z14.pmtiles`),
  c'est-à-dire **OpenStreetMap** découpé par **Protomaps** ; couche
  `boundaries`, `kind = country`. Déjà extraite en AW1.6 pour le calcul
  d'itinéraire : `src/core/borders.json` (`scripts/awborders.ts`, zoom 12,
  simplifiée à 15 m). Aucun autre jeu n'est téléchargé.
- **Comment il traite les zones disputées** — il ne tranche pas, il ÉTIQUETTE
  (`disputed = true`) :

| Ligne | Étiquette dans les données |
|---|---|
| Égypte (Rafah → Taba) | non disputée |
| Jordanie : Arava, sud de la mer Morte, Jourdain au nord du Kinneret / Yarmouk | non disputée |
| Liban (ligne bleue) | non disputée |
| Pourtour de la bande de Gaza | non disputée |
| ★ Ligne verte autour de la Judée-Samarie (Jérusalem comprise) | **disputée** |
| ★ Jourdain et moitié nord de la mer Morte, entre la Judée-Samarie et la Jordanie | **disputée** |
| ★ Golan : ligne de 1923 / d'armistice à l'ouest (Jourdain, Kinneret), ligne de cessez-le-feu de 1974 à l'est, ligne Golan-Liban | **disputées** |

Choisir lesquelles de ces lignes coupent une région, c'est prendre position.
D'où deux options, mesurées sur les **13 régions du PO** (ses 5 régions
redessinées enregistrées en base + les 8 livrées).

## Méthode de mesure

Grille de 0,004° (~400 m) ; les lignes et la mer sont des murs ; chaque zone
au-delà est une composante nommée par un point témoin (Sinaï, Jordanie, Gaza,
Liban, Syrie, Judée-Samarie, Golan). Estimation à la maille près.
Script : `scripts/blborders.ts` (lecture seule).

## ★ Le sud — sans difficulté, et séparé du reste

Limites concernées : la mer (3.1, déjà coupée d'office), **l'Égypte**, **la
Jordanie** et **la mer Morte** — des frontières fixées par traité (1979, 1994),
**non disputées** dans les données.

| Région | Retiré | Où |
|---|---|---|
| אילת | 156 km² (41 %) | Jordanie (Aqaba) 147, Égypte 9 |
| הערבה | 693 km² (18 %) | Jordanie |
| ים המלח | 827 km² (44 %) | Jordanie (la moitié est du lac et sa rive) |
| הנגב | 1 099 km² (13 %) | Égypte (Sinaï) |
| **Total sud** | **2 775 km²** | |

Proposition : **appliquer le sud** dès que le PO le confirme.

## Le reste — c'est au PO de dire

**Option A (proposée)** — couper aux lignes EXTÉRIEURES seulement : Jordanie
(y compris le Jourdain le long de la Judée-Samarie : au-delà, c'est la
Jordanie quelle que soit la lecture), Liban, Syrie (ligne de cessez-le-feu du
Golan), pourtour de Gaza ; la Judée-Samarie et le Golan restent DANS les
régions (l'association a des régions qui portent leur nom). ⚠️ C'est une
position : les lignes de contrôle de fait comme limite extérieure.

| Région | Retiré (en plus du sud) | Où |
|---|---|---|
| בקעת הירדן | 800 km² (37 %) | Jordanie, à l'est du Jourdain |
| רמת הגולן (redessinée) | 448 km² (30 %) | Syrie, à l'est de la ligne de cessez-le-feu |
| מישור החוף | 71 km² | bande de Gaza |
| הנגב | 34 km² | bande de Gaza |
| הגליל (redessinée) | 6 km² | Liban |
| עמק יזרעאל (redessinée) | 2 km² | Jordanie |
| **Total A (sud compris)** | **4 136 km²** | |

**Option B (non proposée)** — couper aussi à la Ligne verte et aux lignes du
Golan : 11 808 km² retirés ; שומרון perd 97,5 %, רמת הגולן 94 %, יהודה 76 %,
בקעת הירדן 79 %, ים המלח 73 %. Les régions de l'association en Judée-Samarie
et au Golan disparaîtraient presque : elle est montrée pour que le choix soit
fait en connaissance de cause.

Images : `docs/bl/img/frontieres-A.png`, `frontieres-B.png` (les 13 régions
LIVRÉES) ; sur les régions du PO, hors dépôt : `private/bl/frontieres-*-reel.png`.

## Ce qu'il faudra pour appliquer (après la réponse)

La grille sert à MESURER. Pour couper, il faudra construire les polygones à
partir des lignes de `borders.json` (même source) et les retirer comme la mer
(`core/topology.ts`, un masque comme `landOf` : le tracé du PO n'est pas
réécrit). Rien de cela n'est fait tant que le PO n'a pas choisi.

## ★★ L'application (après la décision du PO, 2026-10-19)

- **Des lignes aux surfaces** : `scripts/blabroad.ts` reprend la grille, plus
  fine (0,0015°, ~150 m), avec les mêmes murs (toutes les lignes + la mer) et
  les mêmes points témoins ; il S'ARRÊTE si une zone au-delà rejoint Tel-Aviv
  (ligne trouée) ou si la Judée-Samarie ou le Golan tombent dans une zone
  retirée. Les composantes Égypte, Jordanie, Syrie, Liban, Gaza deviennent des
  polygones (Douglas–Peucker à 100 m) : `src/core/abroad.json` (54 Ko).
  Précision : ~150 m le long des lignes.
- **Un masque, comme la mer** (`core/topology.ts`, `landOf`) : retiré des
  surfaces, des aplats (écran des régions ET couche « אזורים » de toutes les
  cartes), des recouvrements et du poussage. **Le tracé du PO n'est pas
  réécrit** : revenir sur la décision, c'est retirer une zone du fichier.
- **La barre le dit** sur l'écran des régions : « מעבר לגבול — לא נספר ולא
  נצבע: 825,523 דונם בירדן » (par pays).
- Ce que retire l'application (mesure exacte sur les polygones, vos 13
  régions) : אילת 160 km² (Jordanie 151, Égypte 9) · הערבה 721 · ים המלח 840 ·
  בקעת הירדן 826 · רמת הגולן 460 (Syrie) · הגליל 10 (Liban) · עמק יזרעאל 4 ·
  מישור החוף 72 (Gaza) · הנגב 1 153 (Égypte 1 116, Gaza 37) — **4 246 km²**
  (la grille de mesure de la proposition disait 4 136 ; `blpass` A601 tient
  l'écart sous 6 % par région).
- Portes : `blpass` A601, `bltopo` A602.
