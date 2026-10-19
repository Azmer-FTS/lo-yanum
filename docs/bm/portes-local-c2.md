# BM (chantier 2) — portes en local

Arbre : `main` (`88fc64c`, le chantier 1 commité) + le chantier 2 (la barre).
Batterie entière en série (`private/bm/battery2.sh`), chaque porte passée par
`private/bm/calmrun.sh` : elle ne démarre qu'après trois relevés de charge sous
14, la charge maximale est notée, une porte passée au-dessus de 40 est rejouée.
Journaux complets hors dépôt (`private/bm/logs/bat2/`, rejeux `bat2r/`).

## Nouvelle porte

- `bmui` (rendu, A636–A641) — **80/80** : deux lignes au-dessus de la carte à
  1 440, 1 032, 678 et 507 px, sans région ouverte comme avec (la même hauteur) ;
  tout ce qui se voit au-dessus de la carte est sur l'une des deux lignes ; un
  seul fond ; l'outil actif n'est plus écrit, la surface une seule fois ; cinq
  mentions à la fois (mer, aimant, forme d'origine, voisines poussées, vide)
  sur la ligne 2, repliées à 507 ; le vide se comble ; rien n'est retiré
  (« ⋯ » à l'étroit) ; le sélecteur de région en écran partagé.

## Portes adaptées

- `blui` A573 : le nom de l'outil actif n'est plus écrit dans la barre (le PO :
  l'icône pleine suffit) ; il reste dans l'infobulle et aria-label.
- `blui` A577 : la confirmation de « שחזור המקור » s'ouvre accrochée SOUS la
  barre (comme le menu « ⋯ » d'où elle vient), la barre garde deux lignes — elle
  était une ligne de plus DANS la barre.
- `blui`, `bltopo` (`pickRegion`) : à l'étroit, déplier le sélecteur de région
  avant d'y choisir.

## Batterie — toutes exit 0

Pures : typecheck, bmpass 52, blpass 61, bjguard 20, bjpass 55, bkpass 46,
bkedit 51, bipass 73, bhpass 24, bgpass 53, bfpass 51, bepass 92, bdpass,
bcpass 75, bbpass 51, bapass 38, az5pass, aypass 25, axpass 40, awpass 60,
avpass 15, aupass 48, aspass, appass, aopass, aodata 82, anpass, ampass,
alpass, akpass, adpass, accept, tokens, contrast, persist, mapping, deletion,
armigrations 58, sync.

Rendu : bmui 80, blui 210 (souris 105, doigt 105), bltopo 72, bkecriture 30,
bkeditui 152, bkui 31, bjui 56, biui 45, bhui 35, bgui 90, bfui 52, beui 57,
bdui 76, bbui 82, bcmobile 246, aymobile 48, assettings, atsync 17, aitheme,
azui 125, axui 116, avui 51, auui 60, ayscreens 57, ayui 105, az5ui 21, baui 45,
awui 57, arfiche, amui, aqui, settings, offline.

CI : ground · backdrop · redraw · overlap · freehand · zones · agreement ·
demo · touch.

## Ce qui a été rouge pendant la batterie, et ce qui a été fait

- `tokens` A57 : le cadre que j'avais posé autour du panneau des recouvrements
  portait un contour (`border`), interdit sur une carte d'écran → retiré (l'ombre
  suffit). Rejouée : verte.
- `blui` A577 (souris) : l'ancienne exigence « la confirmation est dans la
  barre » → réécrite (ci-dessus). Rejouée : verte.
- `aymobile` A358 (téléphone, 402 px) : la ligne 2 débordait de l'écran de
  63 px — les neuf boutons de base demandent 396 px, un téléphone en a 368. Sur
  un TÉLÉPHONE seulement, la ligne 2 passe à la ligne (trois lignes) ; l'iPad
  reste à deux. Rejouée : verte.
- Rejouées automatiquement pour charge (vertes les deux fois) : aqui (69),
  touch (74).
- Les portes de la barre ont été rejouées sur le code FINAL (les deux
  corrections ci-dessus sont arrivées pendant la batterie) : typecheck,
  tokens, bmui 80, blui 105 + 105, aymobile 48, bkeditui 152.
