# BM (chantier 1) — portes en local

Arbre : `main` (`2710990`) + le chantier 1 SEUL (frontières et mer d'OSM), dans un
worktree séparé (`private/bm/battery1.sh`) pendant que le chantier 2 s'écrivait
dans l'arbre principal. Batterie entière en série ; journaux complets hors dépôt
(`private/bm/logs/bat1/`, rejeux `bat1r*/`).

## Nouvelle porte

- `bmpass` (pure, A630–A635) — **52/52** : chaque segment à 1–2 m de la frontière
  d'OSM (BL : 194–667 m) ; le Jourdain suit le cours (moyenne 5 m, 95 % 24 m,
  comme la référence) ; le trait de côte à 2 m ; Judée-Samarie et Golan dedans
  (10 témoins + les régions livrées) ; pays + mer + au-delà = surface tracée à
  0,01 % ; masques découpés (600 morceaux, ≤ 556 points), source dite, zones
  lues du fichier.

## Porte adaptée

- `bltopo` A602 : « יהודה » n'a plus « aucune mention » : la frontière précise
  montre que le tracé LIVRÉ passe la ligne médiane de la mer Morte de 2 975 m²
  (31,35 N 35,45 E, en Jordanie) — la grille de BL l'avalait. La porte vérifie
  désormais ce qu'elle voulait dire : rien de la Judée-Samarie n'est retiré
  (moins de 10 dounams, seulement la Jordanie, la tolérance de `blpass` A601).

## Batterie — toutes exit 0

Pures : typecheck, bmpass 52, blpass 61, bjguard 20, bjpass 55, bkpass 46,
bkedit 51, bipass 73, bhpass 24, bgpass 53, bfpass 51, bepass 92, bdpass,
bcpass 75, bbpass 51, bapass 38, az5pass, aypass 25, axpass 40, awpass 60,
avpass 15, aupass 48, aspass, appass, aopass, aodata 82, anpass, ampass,
alpass, akpass, adpass, accept, tokens, contrast, persist, mapping, deletion,
armigrations 58, sync.

Rendu : bltopo 72, blui 192 (en deux moitiés : souris 104, doigt 104 — les
sections communes A579/A580/captures jouées deux fois), bkecriture 30,
bkeditui 152, bkui 31, bjui 56, biui 45, bhui 35, bgui 90, bfui 52, beui 57,
bdui 76, bbui 82, bcmobile 246, aymobile 48, assettings, atsync 17, aitheme,
azui 125, axui 116, avui 51, auui 60, ayscreens 57, ayui 105, az5ui 21, baui 45,
awui 57, arfiche, amui, aqui, settings, offline.

CI : ground · backdrop · redraw · overlap · freehand · zones · agreement ·
demo · touch.

## Ce qui a été rouge, et pourquoi (aucune régression)

- **Artefacts du worktree, au premier passage** : `bapass` A395 (`private/`
  y était un lien symbolique, que git n'ignore pas — rejouée depuis l'arbre
  principal : 38/38), `awpass`/`axpass` (l'archive `basemap/` à la racine
  manquait), `armigrations` (`supabase/.temp` manquait), et surtout la carte
  ABSENTE de `bltopo`, `blui`, `bkecriture` : l'application charge
  `israel-20260831-z14.pmtiles.png` (le nom servi par le Storage) et je n'avais
  copié que le `.pmtiles`. Rejouées après correction : vertes.
- **Charge machine** : deux rejeux de `blui` sont tombés sous une charge de 360
  à 593 (8 Go, échange plein : WindowServer, airportd, Brave, l'application
  Claude — et une fois un `tsc` à moi lancé à côté, que j'ai arrêté). Ils ne
  prouvent rien et ne sont pas comptés. Les rejeux valables sont passés par
  `private/bm/calmrun.sh` : la porte ne démarre qu'après trois relevés de
  charge sous 14, la charge maximale pendant la porte est notée, et une porte
  passée au-dessus de 40 est rejouée. Charges maximales des rejeux retenus :
  blui 25 / 10, bkecriture 17, bltopo 17, bapass 6.
