# Passe AY — rapport (2026-10-11)

Adresses :
- App réelle : https://azmer-fts.github.io/lo-yanum/
- Jumeau de démonstration : https://azmer-fts.github.io/lo-yanum/demo/
- Page publique de demande d'aide : https://azmer-fts.github.io/lo-yanum/bakasha/

## AY1 — les trois bugs bloquants (traités en premier, déployés seuls d'abord : `cfab595`)

| Bug | Cause trouvée | Correction | Preuve |
|---|---|---|---|
| Pavé : le chiffre s'ajoute | le toucher posait le curseur en fin de valeur | toucher un champ chiffré sélectionne la valeur (pavé ET clavier) | A355 |
| Pavé/clavier : impossible d'effacer | champs liés à un NOMBRE qui refusaient le vide ; `type="number"` sans sélection | brouillon (`useNumberDraft`), plus aucun `type="number"` | A355, 30 champs, 12 écrans |
| Le pavé ne part plus | sur iPad, toucher une zone inerte ne retire pas le focus ; un champ retiré de la page ne prévient pas | fermeture sur סיום, toucher ailleurs, changement d'écran, disparition du champ | A355 |
| Le maillage a disparu | dans la base réelle, la borne du PO valait **3 minutes** (conséquence du pavé) | la carte le dit et propose « חזרה ל־35 דק׳ » | A356 : 62 liens revenus |
| Le thème ne suit pas sur le téléphone | **aucune clé de thème dans la base** : AI6 le gardait par appareil | le choix du coordinateur voyage ; « selon l'appareil » suit chaque appareil | A357 |

Rouge d'avant (build `b4b3562`) : 48 PASS, 33 FAIL — `docs/ay/ay1-rouge-avant.log`.

## AY2 — le téléphone, écran par écran (402 px)

Avant : 12 écrans sur 48 défilaient de côté ; après : 48/48, sur le jumeau déployé.

| Écran | Trouvé | Corrigé |
|---|---|---|
| tableau de bord | rangée de chiffres 832/402, carrousel d'alertes 952/402, nom de poste qui sortait de 41 px | grille sur deux colonnes, alertes en pile, nom tronqué |
| contacts | tableau débordant de 198 px (« une moitié hors écran ») | lignes à deux étages + aperçu plein écran |
| fiche ferme | chiffres 1318/402, fil d'étapes 640/346 | grille, fil qui passe à la ligne |
| fiche garde | chiffres 832/402 | grille |
| 5 écrans d'import | onglets 589/370 | un seul écran d'import (cartes) |
| export | aperçu 1959/370 | une fiche par ligne |
| réglages | sommaire 535/402 | menu déroulant « קפיצה אל » |
| régions | sélecteur 1103/402 | grille |
| fermes, institutions, volontaires | tableaux (colonnes coupées) | lignes à deux étages, un seul ⋯ |
| les 36 autres | sans défilement de côté | revus (liste complète : `docs/ay/ay2-mobile-deploye.json`) |

## AY3 → AY12

Voir `ETAT.md` § AY. En une ligne chacun :
- AY3 une forme de tableau (fermes, institutions, contacts, volontaires), gestes au bout, aperçu latéral pleine hauteur avec carte épinglée ;
- AY4 volontaires et conducteurs réunis, « נהגים » toujours visible, SES volontaires et conducteurs depuis la fiche d'une institution, « יוצא עם » ;
- AY5 confirmer avant, « ביטול » 8 s après, partout ;
- AY6 filtres en double retirés de la couverture, raccourci à la place ;
- AY7 fiche d'institution en quatre gros chiffres, nom au toucher ;
- AY8 épingles fines à tête ronde, liseré blanc, relief ; contraste mesuré (avant 13/20 sous 3:1, après 20/20) ;
- AY9 plus d'encadré gris (survol collé au doigt) ;
- AY10 photo .vcf, « X déjà présents sur Y », trois choix, rien d'écrasé ;
- AY11 jeu d'essai volontaires et conducteurs ;
- AY12 un écran d'import, un planificateur (points libres, durée par la route), réglages dans leurs écrans, garde depuis la ferme, formulaire relié aux institutions, une règle de région.
