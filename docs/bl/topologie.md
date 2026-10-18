# BL — chantier 3 : les régions se tiennent entre elles (2026-10-18)

Code : `src/core/topology.ts` (pur), `src/core/sea.json` (`scripts/blsea.ts`),
`src/ui/editor/PathEditor.tsx` (le poussage), `src/ui/screens/coordinator/RegionsEditScreen.tsx`
et `RegionOverlaps.tsx` (les recouvrements). Opérations booléennes :
`polygon-clipping` 0.15.7 (balayage de Martinez, robuste aux bords confondus).

## 3.5 — D'abord : la base réelle (MCP, `lo-yanum-prod`, lecture seule)

Contrairement au diagnostic de BK (« 0 région enregistrée »), le PO a enregistré
depuis : **5 régions redessinées** dans `lo-yanum:region-rings` (et leurs 5
tracés dans `lo-yanum:region-paths`), écrites le 2026-10-18 à 06:51 UTC —
חוף הכרמל (6 sommets), הגליל (25), רמת הגולן (5), עמק יזרעאל (5), שומרון (6).
Les 8 autres sont celles livrées (X12). Formes de fermes : 4 (`farm-ak1-11` :
deux limites dont une tracée, un pâturage tracé ; `farm-ak1-13` : une limite).
**Cette passe n'a RIEN écrit dans la base** : la résolution (3.3) et le
poussage (3.4) sont des actions que le PO déclenche, et ses données ne sont
jamais réécrites au chargement. Compte après la passe : voir `docs/bl/portes-deploye-*.md`.

## 3.1 — La mer, coupée d'office (un masque, pas une réécriture)

La mer est celle des tuiles de la carte : les polygones `water / kind = ocean`
(Méditerranée, golfe d'Eilat), union au zoom 10 (~10 m), simplifiée à 25 m.
⚠️ Pas la couche `earth` : dans cet extrait elle couvre tout le cadre (mesuré).
Les lacs (Kinneret, mer Morte) ne sont pas la mer : ils restent dans les régions.

Elle est retirée de la MESURE et de l'AFFICHAGE (surfaces des pastilles et de
la barre, aplats de l'écran d'édition, recouvrements, poussage), sans réécrire
le tracé du PO — comme un masque d'écrêtage d'Illustrator. La barre le dit :
« N דונם מהציור נמצאים בים: הם לא נספרים ולא נצבעים — קו החוף חותך אותם ».

Sur les 13 régions du PO : אילת 62 km² en mer (golfe), מישור החוף 380, השרון 91,
הגליל 13, חוף הכרמל 8 ; les 8 autres : 0.

## 3.3 — Plus aucun recouvrement : la règle

> **Le terrain que deux régions se partagent reste à celle que vous avez
> dessinée vous-même ; si les deux l'ont été, ou aucune, à la plus petite.**

Pourquoi : un tracé du PO n'est jamais rogné au profit d'une approximation
d'X12 ; et entre égales, la plus petite est la plus précise (la mer Morte dans
la Judée, la vallée du Jourdain) et la plus grande cède la plus petite part
d'elle-même. La règle est écrite dans le panneau, avec sa raison.

- **Jamais automatique** : bouton « חפיפות (N) » (compte permanent) → panneau ;
  rien n'est écrit avant « החלה ושמירה ».
- **Chaque conflit montré** : les deux régions, la surface en litige (sur
  terre), à qui elle va, ce que perd l'autre ; sur la carte, le terrain hachuré
  et, pour le conflit choisi, le nouveau bord du perdant en pointillés.
- **Refus possible** par conflit (« אכריע בעצמי ») ; un partage qui couperait
  le perdant en deux, le percerait ou le réduirait sous le dixième est
  « ידני בלבד » ; « ביטול הפתרון » remet tout comme avant.

Les 13 régions du PO, sur terre (km²) :

| Région | Avant | Après |
|---|---|---|
| אילת | 395 | 395 |
| הערבה | 3 958 | 3 958 |
| ים המלח | 1 920 | 1 920 |
| בקעת הירדן | 2 271 | 1 868 |
| רמת הגולן ✎ | 1 542 | 1 542 |
| הגליל ✎ | 2 375 | 2 283 |
| עמק יזרעאל ✎ | 1 370 | 1 370 |
| חוף הכרמל ✎ | 438 | 438 |
| השרון | 536 | 536 |
| מישור החוף | 2 436 | 2 417 |
| שומרון ✎ | 2 271 | 2 150 |
| יהודה | 3 069 | 2 422 |
| הנגב | 8 622 | 7 896 |

✎ = redessinée par le PO. **Avant : 10 recouvrements, 2 022 km² (6,5 %) ;
après : 0.** Les 10 partages, le plus grand d'abord : יהודה↔הנגב 593 km² → à
יהודה ; ים המלח↔יהודה 535 → à ים המלח ; בקעת הירדן↔עמק יזרעאל 329 → à עמק
יזרעאל (dessinée) ; מישור החוף↔הנגב 133 → à מישור החוף ; עמק יזרעאל↔שומרון 121 →
à עמק יזרעאל (deux dessinées, la plus petite) ; רמת הגולן↔הגליל 93 → à רמת הגולן
(deux dessinées) ; בקעת הירדן↔שומרון 86 → à שומרון (dessinée) ; מישור החוף↔יהודה
70 → à מישור החוף ; בקעת הירדן↔יהודה 42 → à בקעת הירדן ; מישור החוף↔שומרון 20 → à
שומרון (dessinée). Tous possibles (aucun perdant coupé en deux).
Image : `docs/bl/img/regions-avant-apres.png` (régions livrées) ; sur celles
du PO, hors dépôt : `private/bl/regions-avant-apres-reel.png`.

## 3.4 — Le poussage en direct

La région éditée gagne : ce qu'elle a GAGNÉ depuis l'ouverture (sur terre) est
retiré, pendant le geste, de chaque voisine qu'il touche ; le PO voit les deux
bords bouger (la voisine recoupée est redessinée en direct). Un recouvrement
d'AVANT n'est pas touché en silence (c'est le travail de 3.3).

- **Un geste, une annulation** : la forme et le recoupage des voisines sont dans
  la même entrée d'historique.
- **Cas limite 1 — le recul** : la voisine ne repousse pas ; le vide est
  HACHURÉ sur la carte, mesuré et nommé dans la barre (« רווח של N דונם מול
  «…» ») ; « מילוי הרווח » étend la voisine jusqu'à la nouvelle limite (un geste,
  annulable).
- **Cas limite 2 — couper la voisine en deux, la percer, ou la réduire sous le
  dixième de sa surface d'ouverture** : le poussage S'ARRÊTE à la dernière
  position acceptable, le point aussi, et la barre dit pourquoi (« הדחיפה
  נעצרה כאן: «מישור החוף» הייתה נחתכת לשני חלקים »).
- **Rien n'est enregistré** avant « שמור גבול » (ou « סיום », qui enregistre
  comme avant) ; la région ET ses voisines poussées partent en UNE écriture ;
  « בטל שינויים » rend tout.
- Les formes d'une ferme (une limite DANS un pâturage, voulu) ne se poussent
  jamais : le poussage n'existe que sur l'écran des régions.

## Les portes

`blpass` (pure, A585–A592) et `bltopo` (rendu, A593–A600, souris ET doigt) :
voir `docs/bl/portes-local.md`.
