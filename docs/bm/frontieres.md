# BM (chantier 1) — Des frontières justes, pas approchées

> « Il n'a pas vraiment pris la moitié du Jourdain, il n'a pas pris les vraies
> frontières de la map, il y a des endroits où il s'est un peu planté. » — le PO

Rien ne change dans le principe : **c'est toujours un masque** (le tracé du PO
n'est jamais réécrit, rien n'est écrit en base), **la Judée-Samarie et le Golan
restent dedans**, les couleurs des régions ne bougent pas, et le fichier des pays
(`src/core/abroad.json`) reste modifiable comme avant : retirer une zone du
fichier, c'est ne plus la retirer des régions.

Ce qui change, c'est la **précision** : de **80 à 115 m en moyenne, 194 à 667 m
au pire endroit** (BL), on passe à **0 m en moyenne et 2 m au pire endroit** (BM),
par rapport à la frontière d'OpenStreetMap à pleine résolution. Même gain sur le
trait de côte (de 20–43 m au 95ᵉ centile, et jusqu'à 176 m, à 2 m).

## a) Le tour du périmètre : où BL tombait mal

**Référence** : les polygones des pays voisins d'OpenStreetMap, à la résolution
de leurs nœuds (voir b). Pour chaque segment, on mesure la distance de chaque
point de la vraie frontière (un tous les 10 m) à la ligne de l'application, et
on garde le pire endroit, le 95ᵉ centile et la moyenne. Script :
`scripts/bmmeasure.ts` → `docs/bm/ecarts.json`.

| Segment | Longueur | BL : pire endroit | BL : 95 % / moyenne | Où (pire endroit de BL) | BM : pire endroit |
|---|---:|---:|---:|---|---:|
| Égypte (Rafah → Taba) | 205 km | **194 m** | 138 / 75 m | 30,394 N 34,574 E | **2 m** |
| Jordanie — Arava | 180 km | **221 m** | 144 / 80 m | 30,673 N 35,263 E | **1 m** |
| Jordanie — mer Morte | 97 km | **221 m** | 140 / 79 m | 31,761 N 35,558 E (nord du lac) | **1 m** |
| ★ Jordanie — **le Jourdain** | 180 km | **667 m** | 301 / 114 m | 32,177 N 35,554 E (un méandre coupé en corde) | **2 m** |
| Jordanie — Yarmouk | 35 km | **271 m** | 166 / 87 m | 32,723 N 35,718 E | **2 m** |
| Syrie (cessez-le-feu) | 80 km | **212 m** | 148 / 78 m | 32,748 N 35,759 E (le Yarmouk) | **1 m** |
| Liban | 107 km | **316 m** | 154 / 84 m | 33,242 N 35,624 E | **2 m** |
| Bande de Gaza | 59 km | **215 m** | 157 / 87 m | 31,595 N 34,491 E (au nord, près de la mer) | **2 m** |

**Le trait de côte** (la mer, `sea.json`, contre `natural=coastline` d'OSM) :

| Tronçon | Longueur | BL : pire endroit | BL : 95 % / moyenne | Où | BM : pire endroit |
|---|---:|---:|---:|---|---:|
| Liban (au-delà de Rosh HaNikra) | 67 km | 48 m | 20 / 7 m | 33,275 N 35,196 E | 2 m |
| Nord (Rosh HaNikra → Césarée) | 150 km | 61 m | 20 / 7 m | 32,824 N 35,039 E (Haïfa, le Kishon) | 2 m |
| Centre (Césarée → Ashkelon) | 146 km | **176 m** | 43 / 12 m | 32,166 N 34,793 E (marina de Herzliya) | 2 m |
| Gaza | 48 km | **168 m** | 39 / 15 m | 31,596 N 34,490 E (Zikim) | 2 m |
| Eilat | 90 km | **137 m** | 21 / 8 m | 29,540 N 34,979 E (le port) | 2 m |

Deux défauts de BL s'ajoutaient à l'écart lui-même :

- **Une bande de ~150 m laissée « dans le pays » le long de CHAQUE frontière** :
  les cellules de la grille posées sur la ligne restaient à l'intérieur. Sur vos
  13 régions, 62,7 km² comptés en trop (voir le tableau plus bas).
- **Des bandes au milieu de l'étranger** : entre deux voisins (Égypte–Gaza,
  Syrie–Jordanie le long du Yarmouk, Syrie–Liban), la ligne entre eux devenait
  un mur de 150 m resté « dans le pays ». Elle se voit sur l'image de la ligne
  syrienne (le long du Yarmouk : un trait bleu qui file vers l'est). Disparues.

## b) La source : laquelle, d'où, quelle précision

Trois candidats, mesurés contre la même référence :

| Source | Ce que c'est | Écart au pire endroit | Retenue ? |
|---|---|---:|---|
| Les tuiles de la carte, zoom 12, simplifiées à 15 m (`borders.json`, la source de BL) | des LIGNES | 11 à 16 m | non |
| Les mêmes tuiles au zoom 14 (le plus fin de l'archive), sans simplification | des LIGNES | 1 à 4 m | non |
| ★ **OpenStreetMap, polygones des pays voisins** (API Overpass, une fois) | des **SURFACES** | référence (2 m après simplification) | **oui** |

**La source n'était pas le vrai problème.** La ligne des tuiles au zoom 12
n'était qu'à 16 m de la vraie frontière ; c'est la **méthode** de BL qui coûtait
150 à 667 m : tirer des surfaces de lignes par une grille de 150 m, puis
simplifier à 100 m. Le zoom 14 améliorerait la ligne (1 à 4 m), mais ce seraient
toujours des lignes, et il faudrait toujours une méthode pour en faire des
surfaces.

**Retenue : les polygones des pays voisins d'OpenStreetMap**, à la résolution de
leurs nœuds — la même base que la carte (OSM), plus récente (19 octobre 2026
contre 31 août pour l'archive), et **déjà des surfaces** : plus de grille, plus
d'approximation.

- Égypte (relation 1473947), Jordanie (184818), Syrie (184840), Liban (184843),
  bande de Gaza (1473938) ; trait de côte (`natural=coastline`) ; cours du
  Jourdain (pour la mesure seulement).
- Récupérés une fois (`scripts/bmfetch.ts`) et rangés dans le dépôt :
  `geodata/osm-borders.json` (790 Ko). Licence ODbL, © contributeurs OSM, comme
  la carte.
- **Judée-Samarie et Golan** : dans OpenStreetMap, le Golan est DANS la relation
  d'Israël (la revendication syrienne est une relation `claim` séparée, 13574167,
  que nous ne lisons pas), et la Judée-Samarie n'est dans aucun pays voisin. Les
  cinq polygones donnent donc **exactement** l'option A, **sans correction**.
  Les générateurs s'arrêtent si un point du pays (Jéricho, Naplouse, Katzrin,
  Majdal Shams, le Hermon israélien…) tombe dans une zone, et `bmpass` A633 le
  vérifie à chaque passage.
- La ligne syrienne d'OSM est la même que celle de BL (la ligne de cessez-le-feu
  des tuiles) : comparées zone à zone, rien ne bascule d'un côté à l'autre, seule
  la précision change (12 km² de bandes de grille, aucune surface déplacée).

**Ce que l'application embarque** (`scripts/bmsea.ts`, `scripts/bmabroad.ts`) :

    zone = polygone OSM du voisin − la mer, dans le cadre, Douglas–Peucker à 2 m
    mer  = cadre − la terre fermée par le trait de côte d'OSM, Douglas–Peucker à 2 m

Les îlots (33 rochers, tous sous 0,04 km² : Andromède à Jaffa, Achziv…) restent
de la mer, comme en BL : gardés comme terre, ils perçaient la voisine d'une
région qui avançait en mer (`blpass` A592 l'a attrapé).

**Les masques sont découpés en cases de 0,1°** (`scripts/bmtiles.ts`) : à pleine
résolution, soustraits d'un bloc, ils rendaient le calcul d'une région 4 fois
plus lent (430 ms pour les 13 régions au lieu de 101 ms), à chaque geste du
poussage. Découpés, chaque région ne soustrait que les morceaux proches :
**75 ms pour les 13 régions — plus rapide qu'en BL.** Fichiers : `abroad.json`
230 Ko et `sea.json` 150 Ko (BL : 54 et 32 Ko).

Attrapé en route : sommer, morceau par morceau, la part d'une région dans un
masque découpé dérivait de 0,1 % (4 km² sur la Arava) — chaque couture plie une
longue arête de la région. La part se mesure désormais par différence, comme la
surface sur terre (`core/topology.ts`) : pays + mer + au-delà = surface tracée à
0,01 % près (`bmpass` A634).

## c) Le Jourdain

La ligne suit désormais le **cours** de la rivière, méandre par méandre, au lieu
de la couper en corde. Mesuré contre le cours du Jourdain cartographié dans OSM
(`waterway=river`, du Kinneret à la mer Morte, 207 km de rivière) :

| Ligne | Moyenne | 95 % | Pire endroit |
|---|---:|---:|---:|
| BL (grille) | 115 m | 302 m | 667 m |
| ★ BM (polygones OSM) | **5 m** | **24 m** | 97 m |
| La frontière d'OSM elle-même | 5 m | 24 m | 97 m |

Le résidu (97 m au pire) **n'est pas le nôtre** : c'est l'écart, DANS OSM, entre
la frontière et le lit de la rivière, au pire à 32,54 N 35,57 E (vallée de Beit
Shean). OSM ne dit pas pourquoi (un méandre que la rivière a recoupé depuis, ou
une frontière tracée sur un ancien lit) ; je ne peux pas trancher sans la carte
du traité de 1994. Notre ligne est la frontière d'OSM à 2 m près.

## d) Ce que je n'ai pas pu prouver — la limite, franchement

- **La « vérité » est OpenStreetMap.** Je n'ai aucune source officielle
  numérique (les cartes du traité de 1994, les relevés de la ligne bleue) pour
  mesurer OSM lui-même. Ce qui est prouvé : notre ligne est à 2 m de la
  frontière d'OSM partout. Ce qui ne l'est pas : la précision d'OSM par rapport
  au terrain — elle dépend des contributeurs ; sur le Jourdain, elle suit le lit
  à 5 m en moyenne.
- **La mer** est celle d'OSM au 19 octobre 2026 ; un port agrandi après cette
  date ne s'y trouve pas tant qu'on ne relance pas `bmfetch` + `bmsea` + `bmabroad`.
- Les images montrent les **13 régions LIVRÉES** de la base factice (le dépôt est
  public) ; le tableau ci-dessous, lui, est calculé sur **vos** 13 régions.

## Le tableau : vos 13 régions, avant et après

Surface sur le pays (ce que dit la pastille), en km². ✎ = une région que vous
avez redessinée (enregistrée en base) ; les autres sont les tracés livrés.

| Région | Avant (BL) | Après (BM) | Écart | En mer (avant → après) | Au-delà (avant → après) |
|---|---:|---:|---:|---|---|
| אילת | 235,1 | 232,5 | −2,6 | 61,8 → 61,8 | Égypte 9,4 · Jordanie 151,0 → Égypte 10,0 · Jordanie 152,7 |
| הערבה | 3 236,9 | 3 223,0 | −14,0 | — | Jordanie 720,6 → 734,5 |
| ים המלח | 1 079,7 | 1 072,2 | −7,5 | — | Jordanie 840,1 → 847,6 |
| בקעת הירדן | 1 445,3 | 1 428,4 | −17,0 | — | Jordanie 825,5 → 842,5 |
| רמת הגולן ✎ | 1 082,0 | 1 075,9 | −6,1 | — | Syrie 460,2 → 466,1 |
| הגליל ✎ | 2 365,0 | 2 361,6 | −3,4 | 13,4 → 13,4 | Liban 10,4 → 13,8 |
| עמק יזרעאל ✎ | 1 366,6 | 1 365,6 | −1,0 | — | Jordanie 3,9 → 4,9 |
| חוף הכרמל ✎ | 437,8 | 437,6 | −0,2 | 8,2 → 8,4 | — |
| השרון | 535,8 | 535,8 | 0,0 | 90,8 → 90,8 | — |
| מישור החוף | 2 364,1 | 2 362,4 | −1,7 | 380,4 → 380,3 | Gaza 72,5 → 74,2 |
| שומרון ✎ | 2 271,3 | 2 271,3 | 0,0 | — | — |
| יהודה | 3 068,9 | 3 068,9 | 0,0 | — | — |
| הנגב | 7 469,0 | 7 459,7 | −9,3 | — | Égypte 1 115,9 · Gaza 37,0 → Égypte 1 122,8 · Gaza 39,3 |
| **Total** | **26 957,6** | **26 894,9** | **−62,7** | | |

Toutes les régions frontalières perdent un peu (de 0,2 à 17 km²) : c'est la
bande de ~150 m que BL laissait dans le pays le long de chaque frontière, plus
les méandres rendus à la Jordanie. Aucune ne gagne. La Judée et la Samarie ne
bougent pas.

## Les images (le PO juge à l'œil)

Chaque image : à gauche BL, à droite BM, même cadrage, couche « אזורים » d'une
carte de l'application sur fond satellite. Le pointillé rouge est la frontière
d'OSM (le pointillé jaune, le trait de côte) ; la couleur s'arrête là où
l'application coupe.

- `docs/bm/img/jourdain-avant-apres.jpg` — le Jourdain du Yarmouk à la mer Morte, 7 vues
- `docs/bm/img/gaza-avant-apres.jpg` — la bande entière, puis Erez/Zikim, Nahal Oz, Kerem Shalom
- `docs/bm/img/syrie-avant-apres.jpg` — la ligne entière, puis Hermon, Quneitra, le sud, Hamat Gader
- `docs/bm/img/cote-avant-apres.jpg` — Haïfa, Herzliya, Ashdod, Zikim, Eilat

Script : `SKIP_BUILD=1 bun run scripts/bmimg.ts` (deux builds, `dist-bm-before`
et `dist-bm-after`, qui ne diffèrent que par `sea.json` et `abroad.json`).

## Rejouer

    bun run scripts/bmfetch.ts      # télécharge (si absent) et assemble → geodata/osm-borders.json
    bun run scripts/bmsea.ts        # → src/core/sea.json
    bun run scripts/bmabroad.ts     # → src/core/abroad.json
    bun run scripts/bmmeasure.ts    # → docs/bm/ecarts.json
    bun run bmpass                  # la porte (A630–A635)

`scripts/blabroad.ts` et `scripts/blsea.ts` (BL) restent pour mémoire : ils
réécriraient les anciens masques.
