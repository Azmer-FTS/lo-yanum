# BE — portes rejouées en local (2026-10-13)

Build local (base factice, noms inventés). Journaux complets : `private/be/logs/` (jamais `docs/`).

## Nouvelles
- `bepass` (A437–A444, pur) : **92/92**
- `beui` (A445–A449, au rendu) : **57/57**

## Pures existantes — toutes vertes
typecheck · bdpass · bcpass · bbpass · bapass · az5pass · aypass · axpass · awpass · avpass · aupass (48, A321 adaptée) · aspass · appass · aopass · aodata (82) · anpass · ampass · alpass · akpass · accept (177) · tokens · contrast · persist (160, + 12 mutations BE) · mapping (39, 33 tables) · deletion (61) · armigrations (53)

## Au rendu existantes
Premier passage (série, machine en échange : 7,3 Go) — vertes : bdui 76 · bcmobile 246 · aymobile 48 · az5ui 21 · axui 116 · baui 45 · bbui 82 · awui 57 · amui 77 · arfiche 144 · assettings 20 · aitheme 18.
Rouges au premier passage, rejouées seules (`PW_TIMEOUT=20000`) — vertes : ayscreens 57 · ayui 105 · azui 125 · aqui 107 (délais de chargement : courses) ; avui 51 et auui 60 (ADAPTÉES, voir ci-dessous).

## Portes adaptées (là où BE change la forme voulue, et là seulement)
- `aupass` A321 : le sélecteur de lien (`ui/agenda/links.tsx`) lit les institutions — un écran, aucun compteur.
- `avui` A327 : sur l'agenda, la carte des rendez-vous se montre par « מפה » ; au téléphone, dans le volet de l'agenda.
- `auui` A316 : sur l'écran יומן, le volet de l'agenda tient la place de la carte ; même invariant (il descend jusqu'en bas, la page ne défile pas).
- `mapping` : 30 → 33 tables ; `persist` : les 12 mutations de BE pilotées.

## Portes du déploiement, en local avant le push
zones 38 · agreement 18 · demo 17 (build réel servi en 5197) · overlap 167 · freehand 30 · redraw 18.
