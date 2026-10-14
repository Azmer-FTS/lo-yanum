# BG — portes rejouées en local (2026-10-14)

Build local, base FACTICE (stockage compris). `bgui` rebaptise les fermes du
banc (aucun nom réel en capture). Journaux complets : `private/bg/logs/`
(jamais `docs/`). `PW_TIMEOUT=20000`.

## Nouvelles
- `bgpass` (A461–A471, pur) : **53/53**
- `bgui` (A472–A481, au rendu) : **90/90** — captures `docs/screenshots/bg/local/`

## Pures existantes — toutes vertes (code de sortie 0)
typecheck · bfpass 51 · bepass 92 · bdpass · bcpass · bbpass · bapass · az5pass ·
aypass 25 · axpass 40 · awpass 60 · avpass 15 · aupass 48 · aspass · appass ·
aopass · aodata · anpass · ampass · alpass · akpass · accept · tokens · contrast ·
persist · mapping 443 · deletion · armigrations 54

Adaptées là où BG change la forme voulue (et seulement là) : `aupass` A321
(`FarmLinking.tsx` nomme l'institution en place : un écran, aucun compteur),
`aypass` A363 (le raccourci du bas est retiré, décision du PO ; l'accès est en
haut de la fiche), `mapping` (34 tables), `persist` (lier / délier).

## Au rendu existantes — toutes vertes
bfui 52 · beui 57 · bdui 76 · bcmobile 246 · aymobile 48 · bbui 82 (le menu « ⋯ ») ·
azui 125 · axui 116 · avui 51 · auui 60 · ayscreens 57 · ayui 105 · az5ui 21 ·
baui 45 · awui 57 · amui 77 · arfiche · aqui · assettings · aitheme 18

- Adaptées : `bcmobile` A424 et `bfui` A460 examinent la bulle CARTE PLEINE
  (en mode partagé le panneau montre l'institution et la bulle se tait — c'est
  `bgui` A474 qui le vérifie) ; `avui` A322 et `ayscreens` A364 lisent la fiche
  du PANNEAU au lieu de la bulle.
- `bcmobile` : rouge au premier passage (2) — la porte touchait le coin bas du
  canevas, désormais sous la feuille du téléphone (carte pleine). Elle vise un
  point où le canevas est réellement sous le doigt : 246/246.
- `bfui` : rouge au premier passage (1) — A458, délai de 20 s sur un clic de
  l'écran des institutions (que BG ne touche pas), pendant le lot en série.
  Rejouée seule : 52/52.

## Portes du déploiement, en local avant le push
overlap 167 · freehand 30 · redraw 18 · zones 38 · agreement 18 · demo 17
(build réel + base factice servi en 5197).

## Base (production)
Migration `20261014000100` appliquée par le MCP (version `20261014124915`),
jalon, `repair` ; `armigrations` 54/54. Relu : 0 ligne, RLS activée et forcée,
aucun droit `anon`, deux index + clé primaire, deux clés étrangères, bucket
`institution-docs` public, deux politiques. Anonyme : la table répond 42501,
la liste du bucket est vide, un dépôt est refusé (RLS).

## Rouges antérieurs, non rejoués (inchangés)
`anui` A236, `atui` ; `pills`, `rhythm`, `akui`, `uipass`, `sheets`, `layout`.
