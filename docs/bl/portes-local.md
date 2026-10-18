# BL — la batterie entière, en local, sur l'arbre FINAL (2026-10-18/19)

Arbre : `main` rebasé sur `0fb247c` (le travail parallèle de la session BK —
écriture transactionnelle, `settings`/`touch` réécrites — arrivé sur `main`
pendant la passe) + les trois chantiers de BL. Gates en SÉRIE, codes de sortie
relevés (`private/bl/battery4.sh`, `battery5.sh` ; journaux hors dépôt :
`private/bl/logs/bat4/`, `bat5/`).

⚠️ **Une première batterie (`bat`, puis `bat3`) n'est PAS retenue** : une autre
session Claude faisait tourner la même batterie, sur les MÊMES ports, au même
moment, depuis son worktree. Une porte dont le port était tenu par l'autre
pouvait viser le serveur de l'autre (le build d'un autre code). La batterie
retenue attend, avant chaque porte, qu'aucun processus d'un worktree ne tourne.

## Pures (toutes exit 0)

typecheck · bjguard 20 · bjpass 55 · bkpass 46 · bkedit 51 · **blpass 48** ·
bipass 73 · bhpass 24 · bgpass 53 · bfpass 51 · bepass 92 · bdpass · bcpass 75 ·
bbpass 51 · bapass 38 · az5pass · aypass 25 · axpass 40 · awpass 60 · avpass 15 ·
aupass 48 · aspass · appass · aopass · aodata 82 · anpass · ampass · alpass ·
akpass · adpass · accept · tokens · contrast · persist · mapping · deletion ·
armigrations 58 · sync.

## Au rendu (toutes exit 0 sur l'arbre final)

**blui 192** · **bltopo 65** · bkecriture 30 · bkeditui 152 · bkui 31 · bjui 56 ·
biui 45 · bhui 35 · bgui 90 · bfui 52 · beui 57 · bdui 76 · bbui 82 ·
bcmobile 246 · aymobile 48 · assettings · atsync 17 · aitheme · azui 125 ·
axui 116 · avui 51 · auui 60 · ayscreens 57 · ayui 105 · az5ui 21 · baui 45 ·
awui 57 · arfiche · amui · aqui · settings · offline.

De la CI : ground · backdrop · redraw · overlap · freehand · zones · agreement ·
demo (build réel, `vite preview` 5197) · touch (build de démonstration, 5179).

Rejouées après les deux derniers changements de code (« la forme ouverte reste
en vue », puis l'ancre du toucher) : blui 192, bltopo 65, bkecriture 30,
bkeditui 152, bhui 35, biui 45 (`bat5`).

## Attrapé par la batterie, et corrigé

- `bipass` A501 (sonde de source : `commit` passe par `persist` dans ses 700
  premiers caractères) : `commit` avait grossi avec le poussage → le poussage
  sort dans `withPush`, `commit` redevient court. Même comportement.
- `tokens` A57 : le panneau des recouvrements dessinait un contour de carte
  (`border`) → retiré.
- `settings` A53 (réécrite) : « שרטוט מחדש » sur l'écran des régions perdait
  la forme neuve — corrigé aussi par la session BK (`aecdda3`) ; ici,
  `RegionsEditScreen` ne prend plus le lâcher / la réouverture d'un
  remplacement pour un changement de région.
- `zones` (CI) : les points d'une forme ouverte depuis la LISTE étaient sous la
  barre → la forme ouverte reste en vue (une descente minimale, jamais un
  recadrage). Puis `bhui` A489 : une forme ouverte d'un TOUCHER ne doit pas
  bouger → l'ancre du toucher reste sous le doigt (sauf si elle tombait dans la
  bande prise par la barre).
- `freehand` (CI) et `bhui` A489 : « la carte n'a pas bougé » se juge À L'ÉCRAN
  (la barre au-dessus de la carte décale la caméra pour que rien ne bouge).
- `bkecriture` (nouvelle porte de la session BK) : la poignée ✥ → l'outil de
  déplacement, pris une fois (le second geste doit finir en moins de 2 s).
- `blui` A574 (surfaces sur terre) et A577 (le point tiré pour « redessiner »
  poussait la Judée et s'arrêtait : il part désormais vers le large).

## Rouges antérieurs, inchangés (hors batterie de BJ/BK)

`adui` A115, `anui` A236, `atui`, `pills`, `rhythm`, `akui`, `uipass`,
`sheets`, `layout` — non rejouées.
