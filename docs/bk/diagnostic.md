# BK — Diagnostic de l'éditeur de tracés, AVANT toute correction (2026-10-18)

> « J'ai voulu éditer la carte des régions. Très compliqué à éditer. Il y a
> plusieurs superpositions, plusieurs formes l'une par-dessus l'autre sur le
> même secteur, et je ne sais pas comment en supprimer une. Je ne peux pas.
> Quand je clique sur un point, il ne l'enlève pas. Quand j'essaie de modifier
> quelque chose, un panneau s'ouvre, c'est écrit n'importe comment, je ne
> comprends rien. »                                                   — le PO

Sources : la base réelle `lo-yanum-prod` (MCP, lecture seule), les journaux du
serveur (`edge_logs`, séance du 2026-10-17), le déployé `cd78ed1` (copie de
démonstration, mêmes écrans, données fictives) à 1 032 × 1 376 au doigt et à
1 440 × 900 à la souris, et le banc de BI (`farm-ak1-11`, la configuration
réelle reproduite sans coordonnées réelles) sur le build de ce code. Aucune
coordonnée réelle n'est recopiée ici.

## 0. Deux « cartes des régions » — un même mot

Dans l'application, deux éditeurs s'appellent « אזור » :

- **l'écran « עריכת אזורים »** (הגדרות › אזורים) : les 13 régions du pays
  (`RegionsEditScreen.tsx`) ;
- **la carte d'une ferme** : ses formes s'appellent « אזור » à l'écran
  (« מחיקת האזור », « פינת אזור », « הזזת האזור כולו ») — limite de la ferme et
  zones de pâturage (`AnchorMap.tsx`).

Ce sont DEUX moteurs différents, avec deux grammaires de geste contraires
(voir § 2). Le constat du PO vaut pour les deux ; le diagnostic les traite
tous les deux, et la correction n'en garde qu'un.

**Ce que dit le journal de sa séance** (2026-10-17, 20 h 11 → 21 h 38 UTC, une
seule session, **Chrome sur l'ordinateur, à la souris** — pas l'iPad ce
soir-là) : à 21 h 06, **12 écritures successives** de la zone de pâturage de
`farm-ak1-11` (le build écrit chaque geste, BI) ; aucune écriture de région.

## 1. Les superpositions — les chiffres réels

### Formes des fermes (`zones`, `zone_vertices`)

| Ferme | Forme | Sommets | Surface | Créée | Modifiée |
|---|---|---|---|---|---|
| `farm-ak1-11` | limite (`farm_boundary`) | 31 | 90,4 dounams | 2026-10-14 | jamais |
| `farm-ak1-11` | pâturage (`grazing_area`) | 23 | 5 042,1 dounams | 2026-10-14 | **2026-10-17 21 h 06** |
| `farm-ak1-13` | limite | 17 | 7,7 dounams | 2026-09-24 | jamais |

- **3 formes en base, 2 fermes.** Aucun doublon, aucune forme
  auto-intersectante (0 croisement d'arêtes sur les trois).
- **La superposition réelle : `farm-ak1-11`.** Les **31 sommets** de la limite
  sont **tous à l'intérieur** de la zone de pâturage : la limite (90 dounams)
  est entièrement contenue dans le pâturage (5 042 dounams), qui la couvre de
  sa surface teintée.
- **D'où elles viennent** : deux formes VOULUES (une limite et un pâturage,
  dessinés à six minutes d'intervalle le 14), pas un doublon ni un tracé
  relancé.
- **Brouillons de BI** : ils vivent sur l'appareil (`lo-yanum:zone-draft:<ferme>`,
  par décision de BI) et ne sont pas dans la base ; ils ne sont pas mesurables
  d'ici. Le nouvel éditeur les liste par ferme et propose de les nettoyer
  (§ 4 du rapport), sans jamais en jeter un de lui-même.

### Régions (`lo-yanum:region-rings`, réglage du compte)

- **0 région redessinée enregistrée**, ni dans `user_setting_values` ni dans
  l'ancien bloc `user_settings`. Le PO n'a jamais réussi à enregistrer une
  région.
- Les 13 régions sont celles écrites à la main en X12 : des quadrilatères de
  5 à 7 sommets. **Elles se recouvrent** : sur une grille de 500 × 500 points
  couvrant Israël, 106 526 points sont dans une région et **7 999 (7,5 %) dans
  deux à la fois** (≈ 2 360 km²) — surtout יהודה + נגב (1 986 points),
  ים המלח + יהודה (1 789), עמק יזרעאל + בקעת הירדן (1 076), בקעת הירדן +
  שומרון (1 051). À l'écran, les douze autres sont dessinées en transparence
  par-dessus et par-dessous celle qu'on édite : « plusieurs formes l'une
  par-dessus l'autre sur le même secteur ».

### Peut-on choisir, peut-on supprimer ?

- **Sur la carte d'une ferme, la forme du dessus prend tout.** Un appui choisit
  la PREMIÈRE forme sous le doigt (`features[0]`, `MapCanvas.tsx`) ; le pâturage
  étant dessiné après la limite, il est au-dessus. **Mesuré sur le banc de BI**
  (`farm-ak1-11`, petite limite dans un grand pâturage) : **8 appuis à
  l'intérieur de la limite → 7 fois le pâturage, 0 fois la limite** (le 8ᵉ
  tombe sur le repère de la ferme), à la souris (1 440) comme au doigt (1 032).
  La limite ne peut être choisie que par la liste « ערוך » de l'onglet « שטח »,
  sous la carte — rien sur la carte ne dit qu'elle existe.
- **Rien n'indique que deux formes se recouvrent**, ni laquelle est choisie
  quand elles portent le même nom (deux « שטח מרעה » sur la démonstration
  `farm-04` : le panneau dit seulement « שטח מרעה · 1,566 דונם »).
- **Supprimer une forme** : le bouton « מחיקת האזור » existe, mais seulement
  sur la forme CHOISIE — donc jamais sur la limite recouverte.
- **Supprimer une région** : impossible par construction (treize régions
  fixes) ; on ne peut que les « restaurer ».

## 2. « Quand je clique sur un point, il ne l'enlève pas »

Deux moteurs, deux règles contraires, et aucune ne se voit :

| | Carte d'une ferme (`AnchorMap`) | Écran des régions |
|---|---|---|
| Ce qui est censé retirer un sommet | un **appui long de 600 ms** sur le sommet | un **simple clic** sur le sommet |
| Clic / toucher sur un sommet | **rien** (mesuré : 5 → 5 sommets, souris et doigt) | **retire** le sommet (mesuré : 5 → 4 au doigt, 7 → 6 à la souris), sans confirmation |
| Touche « Suppr » / « ⌫ » | **rien** (mesuré : 5 → 5) | rien |
| Clic sur le milieu d'une arête | insère un sommet | insère un sommet |
| Le sommet et le milieu se distinguent-ils ? | oui (plein / creux) | **non** : mêmes disques blancs de même taille (capture `r1`) |

- **Sur la carte d'une ferme** (où le PO travaillait ce soir-là, à la souris) :
  le clic est ignoré **par construction** — le sommet n'a pas de `onSelect`,
  seulement `onLongPress` (`AnchorMap.tsx`, BH). La seule indication est une
  phrase en petits caractères sous les boutons (« לחיצה ארוכה על נקודה מוחקת
  אותה »), et un appui long à la souris n'est pas un geste d'ordinateur. Rien
  ne permet de *sélectionner* un sommet : pas de sommet « courant », donc pas
  de touche de suppression possible.
- **Sur l'écran des régions** : le clic retire bien un sommet — mais les
  poignées du milieu des arêtes sont identiques aux sommets ; une fois sur
  deux, « cliquer sur un point » en AJOUTE un. Et ce qui se retire au clic se
  retire aussi quand on voulait seulement saisir le point.

Défaut de conception, pas de texte : il n'existe aucune notion de **sommet
sélectionné**, donc ni suppression au clavier, ni bouton « supprimer ce
point », ni poignée de courbe à régler sur lui.

## 3. Le panneau « écrit n'importe comment »

Trois panneaux s'ouvrent pendant une édition ; je les ai tous capturés.

1. **★ Le plus probable : « אבחון המכשיר » — un panneau de DIAGNOSTIC.**
   Ouvert par le lien « אבחון » au pied de la légende de TOUTE carte (BI) et
   dans הגדרות. Il affiche : l'identifiant de build et son heure, « Service
   worker », « version.json », l'adresse, la chaîne d'agent du navigateur
   (« Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit… »), des
   compteurs de « פינות », des mentions « (BI) » et « (BJ) », puis un tableau
   de 70 clés techniques (`lo-yanum:activity-reports`…) écrites de gauche à
   droite dans un tableau de droite à gauche, **coupées en plein mot** sur
   trois lignes (« lo-yanum:act / ivity-report / s »), et des cellules
   tronquées (« לא ידוע (ט / רם נקרא) »). C'est du texte de développement : un
   défaut de **contenu** (jargon, valeurs brutes), de **direction** (LTR dans
   du RTL) et de **mise en page** (coupures). **Le journal du serveur le
   confirme probablement** : à **20 h 45 UTC**, pendant la séance, une
   lecture COMPLÈTE des réglages du compte, sans curseur — la seule lecture de
   ce type que fait l'application une fois l'appareil migré, et c'est
   l'ouverture de ce panneau qui la déclenche (`refreshAccountView`).
   Probable, pas certain : le journal ne dit pas quel écran était ouvert.
2. **Le bandeau d'édition d'une forme** (`zone-selected`) — hébreu correct,
   dans le bon sens, mais il ne dit ni de quelle ferme ni de laquelle des
   formes il s'agit (deux « שטח מרעה » identiques), ni combien de points ; la
   consigne est une phrase technique en petits caractères (« גררו נקודה
   חלולה כדי להוסיף · לחיצה ארוכה על נקודה מוחקת אותה »). Défaut de contenu,
   pas de direction.
3. **La barre de l'écran des régions** — lisible ; les boutons « שרטוט חופשי »,
   « שחזר ברירת מחדל », « בטל שינויים », « שמור גבול » côte à côte, sans dire ce
   que « ברירת מחדל » restaurera.

Décision prise pour la correction : le panneau de diagnostic n'apparaît plus
sur AUCUNE carte (le lien « אבחון » quitte la légende) ; il reste dans
הגדרות, sous un titre qui dit à quoi il sert (« לתמיכה טכנית »), parce que BI
et BJ en ont besoin pour qu'il puisse nous envoyer un relevé. Le panneau
d'édition est refait (§ « le panneau » du rapport).

## 4. Ce qui en découle pour la réécriture

- Une forme parmi plusieurs doit se CHOISIR sans ambiguïté : une liste des
  formes de l'entité sur la carte, un appui qui fait défiler les formes
  empilées sous le doigt, la forme choisie dessinée au-dessus des autres.
- Un sommet doit se SÉLECTIONNER (clic ou toucher), puis se supprimer par une
  touche ET par un bouton visible ; jamais par un simple toucher.
- Sommets et milieux d'arêtes doivent se distinguer au premier coup d'œil.
- Un seul moteur pour les régions et pour les fermes.
- Le panneau dit : l'entité, la forme, le nombre de points, la surface, les
  actions. Rien d'autre.

Captures (hors dépôt, dans le dossier de travail de la session) : `r1-judea`
(régions : poignées identiques), `f1-selected` (bandeau d'une forme),
`f4-diagnostic` (le panneau de diagnostic sur une fiche de ferme).
