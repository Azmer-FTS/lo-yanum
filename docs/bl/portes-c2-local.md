# BL — chantier 2 (l'accroche aux routes visible) — portes en local (2026-10-18)

Build de l'arbre du chantier 2 SEUL (commit du chantier 1 + les fichiers du
chantier 2, extraits dans `/tmp/blc2` et construits là), en série, codes de
sortie relevés. Journaux : `private/bl/logs/c2b-*` (hors dépôt). Récit :
`docs/bl/accroche.md`.

- `blui` (A570–A584, souris ET doigt) **192/192**.
- `bkeditui`, `bhui`, `biui` : voir le bas de ce fichier (rejouées sur ce build).

## Réécrites (la règle a changé — pas un contournement)

- `bhui` A489 « entrer en édition ne recadre pas » : la barre d'édition paraît
  AU-DESSUS de la carte, qui rétrécit d'autant ; la caméra est décalée pour que
  RIEN ne bouge à l'écran. La porte jugeait le centre NUMÉRIQUE de la caméra ;
  elle juge désormais ce que voit le PO : le point touché reste sous le doigt
  (< 1,5 px), même zoom.
- `bhui` A497 : le point touché pour rouvrir la forme (30 % vers son premier
  sommet) tombait sur l'épingle de la ferme depuis que la barre a déplacé le
  tracé à l'écran ; la porte cherche un point de la forme où le doigt tombe sur
  la carte.
- ⚠️ Ces deux portes étaient ROUGES sur le build du commit du chantier 1
  (rejouées après coup : A489, A497) — le « bhui 35 » du message de ce commit
  venait d'un passage qu'on ne sait plus rattacher à ce build. Dit ici.

## Corrigé dans le code

- Les boutons du point sélectionné, toujours présents depuis le chantier 1
  (éteints sans point), portaient le préfixe `editor-node-` des POINTS de la
  carte : `bkeditui` A563 et `bhui` A490 comptaient 15 « points » au lieu de 12.
  Sans point sélectionné, ce sont désormais `editor-point-*-off` (comme en BK,
  les boutons `editor-node-kind` / `editor-node-delete` n'existent qu'avec un
  point sélectionné).

## Rejouées sur ce build (codes de sortie)

`blui` 192/192 · `bhui` 35/35 · `biui` 45/45 · `bkeditui` 151/152 : A554
(souris) « le point 3 a bougé, lui seul (0 sommet changé) » rouge UNE fois,
pendant que d'autres portes tournaient en parallèle (charge machine ~10) ;
rejouée seule deux fois : verte (3/3, 3/3). Lue comme une course de charge,
pas comme une régression — elle est rejouée dans la batterie finale.
`typecheck` (arbre du chantier 2) vert.
