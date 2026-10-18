# BK — L'éditeur de tracés (chantier 2)

Diagnostic d'avant : `docs/bk/diagnostic.md`. Code : `src/core/path.ts` (le
modèle, pur), `src/ui/editor/PathEditor.tsx` (l'éditeur), `src/ui/editor/roadSnap.ts`
(l'accroche). Utilisé par la carte d'une ferme (`AnchorMap` : limite, pâturages ;
la fiche de ferme ET l'assistant de mission) et par l'écran des régions.

## Les deux représentations

| | Où | Qui s'en sert |
|---|---|---|
| **Le tracé** (nœuds coin / arrondi, poignées) | `zones.path` (jsonb, migration `20261018000100`) ; `lo-yanum:region-paths` (compte) ; brouillons : `lo-yanum:zone-draft:<ferme>` (`path`) | l'éditeur |
| **La forme réelle** (anneau densifié) | `zone_vertices` ; `lo-yanum:region-rings` | la carte, TOUTES les surfaces (`ringAreaDunams`), le rattachement aux régions |

Un segment entre deux coins n'est pas densifié. Le tracé n'est repris que s'il
redonne exactement l'anneau enregistré (à 10⁻⁹ degré) ; sinon — forme d'avant BK,
anneau réécrit par un build d'avant BK — l'anneau gagne, repris en coins
(`modelForRing`). Les deux calculs de surface restent égaux sur la forme
densifiée (`bkedit` A541, `bkeditui` A555, `bipass` A501, `biui` A510).

## Les gestes — et la porte qui prouve chacun

`bkeditui` rejoue chaque geste DEUX fois : « souris » (1 440 × 900, souris et
clavier) et « doigt » (iPad 1 032 × 1 376, touchers réels CDP), et vérifie
l'écran ET la base. `bkedit` éprouve le modèle sans navigateur.

| Geste | Souris / clavier | Doigt | Modèle (pur) |
|---|---|---|---|
| Ouvrir une forme d'un toucher | A550 | A550 | — |
| ★ Choisir entre deux formes superposées (le choix nomme les deux, la plus petite d'abord) ; passer de l'une à l'autre par le panneau | A551, A564 (régions) | A551, A564 | — |
| ★ Sélectionner un point (un toucher NE le supprime PAS) | A552, A564 | A552, A564, `bhui` A493 | — |
| ★ Supprimer le point sélectionné : bouton « מחיקת הנקודה » | A552, A564 | A552, A564, `bhui` A493 | A543 |
| ★ … touche Suppr / ⌫ | A552 | (pas de clavier) | — |
| Jamais sous trois points (refusé, et dit) | `bhui` A493 | `bhui` A493 | A543 |
| ★ Ajouter un point sur un segment : toucher le « + » | A553 | A553 | A543 (courbe inchangée) |
| … ou le tirer, le point naît là où on le lâche | A553 | A553, `bhui` A492 | — |
| ★ Déplacer un point (la carte ne glisse pas) | A554 | A554, `bhui` A491 | A543 |
| Déplacer la forme entière (✥) | A557 | A557 | A543 |
| ★ Arrondir un point : toucher deux fois, ou « פינה מעוגלת » | A555 | A555 | A543 |
| ★ Tirer une poignée (l'autre reste alignée, garde sa longueur) | A555 | A555 | A543 |
| Remettre en coin (« פינה חדה ») | A555 | A555 | A543 |
| ★ Rouvrir la forme plus tard : le point arrondi ET ses poignées sont là | A555 (rechargement) | A555 | A542 |
| ★ Annuler / refaire, sans limite pratique (500) | A556 (⌘Z, ⇧⌘Z) | A556 (boutons), `bhui` A495 (dix de suite) | A545 |
| ★ Supprimer une forme entière, avec confirmation qui la nomme | A558 | A558, `bhui` A494 | — |
| « שרטוט מחדש » : la nouvelle remplace l'ancienne (confirmé avant) | A562 | A562 | — |
| ★ La plume : un toucher = un point ; un toucher tiré = un point arrondi ; le premier point ferme | A559 | A559, `bhui` A497 | A544 |
| ★ Passer de la plume à la main levée EN COURS de tracé | A560 | A560 | A544 |
| ★ La main levée : un trait → une forme de points éditables | `freehand` (CI) | `freehand` (stylet), `zones` (CI) | A544 |
| La main levée sur une forme existante remplace la portion longée | A561 | A561 | A544 |
| Fermer : premier point (A559), « סגירת הצורה » (`zones`, `biui`) — la touche Entrée existe aussi, NON prouvée par une porte | A559, `zones` | A559, `biui` A509 | A544 |
| Un tracé non fermé reste en brouillon (écran fermé brutalement) et se reprend | `biui` A509 | `biui` A509 | `bipass` A502 |
| Brouillons abandonnés : nommés, nettoyés sur confirmation, jamais une forme | A566 | — | `bipass` A502 |
| Une forme ancienne s'ouvre en coins ; l'ouvrir sans geste n'écrit rien | A563 | A563 | A540, A542 |
| Accroche aux routes (option) : lâché à 9 px d'une route, le point est dessus | A567 | — (même code) | — |
| Deux doigts en mode plume : un pincement, jamais un point | — | A568 | — |
| Le panneau : entité, forme, points, surface ; rien de technique ; RTL | A550 | A550 | — |
| ★ Une forme tracée PENDANT les relectures du démarrage ne quitte jamais la carte (correctif de `data/store.ts`) | A569 (rouge sur l'ancien code, vert après) | — | — |
| Le diagnostic n'est plus sur les cartes (reste dans הגדרות) | A565, `biui` A508 | — | `bipass` A503 |

## L'accroche aux routes

Possible, et faite, SANS rien télécharger de plus : les tuiles vectorielles que
la carte charge déjà (`protomaps`, l'archive PMTiles d'Israël) portent la couche
`roads` (celle que décode le calcul d'itinéraire), présente aussi en fond
satellite. Option « הצמדה לכבישים » (menu « פעולות »), désactivée par défaut :
un point posé ou lâché à moins de 16 px d'une route s'y accroche. Limites : la
géométrie est celle du zoom 14 (au-delà, à quelques mètres près) ; hors des tuiles
chargées à l'écran, rien à accrocher.

## Ce que l'éditeur ne couvre pas (dit)

- Les ZONES DE MENACE (`threat_zones`) se tracent encore avec l'ancien outil :
  elles n'étaient pas dans le périmètre (régions, limites, pâturages).
- L'outil « sélection » ne déplace pas la forme en la tirant par son intérieur
  (au doigt, sur un grand pâturage, c'était déplacer la carte qui était voulu) :
  la poignée ✥ le fait.
- Fermer une forme NEUVE l'écrit : l'historique repart de là (annuler ne
  « dé-ferme » pas une forme déjà écrite ; « מחיקת הצורה » la retire).
