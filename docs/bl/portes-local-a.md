# BL (3.2, option A) — portes en local (2026-10-19)

Arbre : `main` (`72a2870`) + l'application de l'option A. Batterie entière en
série, en attendant qu'aucun worktree ne tienne de port (`private/bl/battery6.sh`,
journaux `private/bl/logs/bat6/`, rejeux `bat7/`).

## Nouvelles portes

- `blpass` A601 — chaque pays retiré à moins de 6 % de la mesure indépendante
  de la grille ; Judée-Samarie et Golan intacts ; pays + mer + au-delà =
  surface tracée ; le tracé n'est pas réécrit. **61/61.**
- `bltopo` A602 — l'écran des régions (pastille, barre, aplat, la barre dit
  « … דונם בירדן ») et la couche « אזורים » des autres cartes (la Golan s'arrête
  au cessez-le-feu). **72/72.**

## Batterie

Toutes les pures : exit 0. Au rendu, toutes exit 0 sauf, au premier passage :

- `blui` A570 : la mention « au-delà de la frontière » faisait grandir la barre
  à l'ouverture du Néguev (la carte sautait de 22 px) → la ligne est désormais
  TOUJOURS réservée. Puis A577 : le point 0 du Néguev passait sous le bas de
  l'écran (1 440 × 900) → la porte tire le point ouest. **blui 192/192**.
- `bltopo` A597 (doigt), `bcmobile` A426 (« Unable to capture screenshot »),
  `azui` A373, `avui` A327 (délais dépassés) : pendant une charge machine de
  45 à 106 (une autre session encodait des vidéos). Rejouées seules, la charge
  retombée : bltopo 72, bcmobile 246, azui 125, avui 51 — vertes.

CI : ground · backdrop · redraw · overlap · freehand · zones · agreement ·
demo · touch — exit 0.
