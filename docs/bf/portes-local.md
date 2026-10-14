# BF — portes rejouées en local (2026-10-14)

Build local, base FACTICE (noms et numéros inventés ; `bfui` rebaptise les fiches
du banc de base). Journaux complets : `private/bf/logs/` (jamais `docs/`).
`PW_TIMEOUT=20000`.

## La preuve du coupable (tâche 1)
`bfui` A457, même porte, même base, deux builds :

| Écran | Build d'AVANT BF (`b89b8b5`) | Build BF |
|---|---|---|
| institutions (une institution ouverte, zoom + glissé du PO, 25 s, deux relectures) | z12,465 → **z8,093** (centre déplacé) | identique (1e-7) |
| carte de couverture (une institution choisie, idem) | z12,465 → **z9,142** (centre déplacé) | identique (1e-7) |

## Nouvelles
- `bfpass` (A450–A452, pur) : **51/51**
- `bfui` (A453–A460, au rendu) : **52/52**

## Pures existantes — toutes vertes (code de sortie 0)
typecheck · bepass 92 · bdpass 66 · bcpass · bbpass · bapass · az5pass 18 · aypass 25 · axpass 40 · awpass 60 · avpass 15 · aupass 48 · aspass 84 · appass 107 · aopass 113 · aodata · anpass 27 · ampass 50 · alpass 40 · akpass 56 · accept 177 · tokens · contrast · persist 160 · mapping 39 · deletion 61

## Au rendu existantes — toutes vertes
beui 57 · bdui 76 · bcmobile 246 · aymobile 48 · bbui 82 (A408 : le menu « ⋯ ») · azui 125 · axui 116 · avui 51 · auui 60 · ayscreens 57 · ayui 105 · az5ui 21 · baui 45 · awui 57 · amui 77 · arfiche 144 · aqui 107 · assettings 20 · aitheme 18

- `bcmobile` était ROUGE au premier passage (14) : A419 « 8 px entre deux cibles
  voisines » — la loupe neuve à 4 px du bouton d'urgence dans l'en-tête du
  téléphone. Corrigé (`gap-2`), rejouée : 246/246. Une vraie régression BF,
  attrapée par une porte existante.

## Portes du déploiement, en local avant le push
overlap 167 · freehand 30 · redraw 18 · zones 38 · agreement 18 · demo 17
(build réel servi en 5197). `ground` / `backdrop` : rejouées par le déploiement.

## Rouges antérieurs, non rejoués (inchangés)
`anui` A236, `atui` ; `pills`, `rhythm`, `akui`, `uipass`, `sheets`, `layout`.
